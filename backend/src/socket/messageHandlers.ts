import { Server, Socket } from 'socket.io';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { checkSendPermission } from './permissionCheck';
import { allowSocketAction, getAuthorizedMessageContext, getConversationMembership } from './helpers';

const msgInclude = {
  sender: { select: { id: true, name: true, avatar: true } },
  replyTo: { select: { id: true, text: true, senderId: true, type: true, fileName: true, sender: { select: { id: true, name: true } } } },
  reactions: { select: { id: true, emoji: true, userId: true, user: { select: { id: true, name: true } } } },
  readReceipts: { select: { userId: true, readAt: true } }
};

function extractMentions(text: string | null): number[] {
  if (!text) return [];
  const matches = text.match(/@(\d+)/g);
  return matches ? matches.map(m => parseInt(m.slice(1), 10)).filter(Boolean) : [];
}

export function setupMessageHandlers(io: Server, socket: Socket, prisma: PrismaClient) {
  const userId = socket.data.userId;

  socket.on('send_message', async (data) => {
    try {
      if (!allowSocketAction(socket, 'send_message', 25, 10_000)) return socket.emit('error', { message: 'Too many messages. Please slow down.' });
      const { conversationId, text, type, fileUrl, fileName, fileSize, replyToId, forwardedFrom, locationLat, locationLng, locationName, contactUserId, animation, encryptedKey } = data || {};
      if ((!text?.trim() && !fileUrl && !locationLat && !contactUserId) || !conversationId) return;
      const perm = await checkSendPermission(prisma, userId, Number(conversationId), type || 'text');
      if (!perm.allowed) return socket.emit('error', { message: perm.reason });
      const conv = await prisma.conversation.findUnique({ where: { id: Number(conversationId) } });
      const expiresAt = conv?.disappearAfter ? new Date(Date.now() + conv.disappearAfter * 1000) : null;
      const fingerprint = crypto.createHash('sha256').update(`${userId}-${Date.now()}-${text || ''}`).digest('hex').slice(0, 16);

      const message = await prisma.message.create({
        data: {
          text: text?.trim() || null,
          senderId: userId,
          conversationId: Number(conversationId),
          type: type || (locationLat ? 'location' : contactUserId ? 'contact' : 'text'),
          fileUrl,
          fileName,
          fileSize,
          replyToId: replyToId || null,
          forwardedFrom: forwardedFrom || null,
          linkPreview: text ? (text.match(/https?:\/\/[^\s]+/) || [])[0] || null : null,
          locationLat,
          locationLng,
          locationName,
          contactUserId,
          animation,
          encryptedKey,
          fingerprint,
          expiresAt,
        },
        include: msgInclude,
      });
      await prisma.conversation.update({ where: { id: Number(conversationId) }, data: { updatedAt: new Date() } });
      const members = await prisma.conversationMember.findMany({ where: { conversationId: Number(conversationId), isBanned: false } });
      for (const m of members) io.to(`user_${m.userId}`).emit('new_message', message);
      socket.emit('message_sent', { ...message, tempId: data?.tempId });

      for (const mid of extractMentions(text)) {
        if (mid !== userId) io.to(`user_${mid}`).emit('mentioned', { conversationId: Number(conversationId), messageId: message.id, by: userId });
      }

      if (text) {
        const bots = await prisma.bot.findMany({ where: { isActive: true } });
        for (const bot of bots) {
          if (!text.toLowerCase().includes(bot.trigger.toLowerCase())) continue;
          const botMsg = await prisma.message.create({
            data: { text: bot.response, senderId: bot.ownerId, conversationId: Number(conversationId), type: 'text', isSystem: true },
            include: msgInclude,
          });
          for (const m of members) io.to(`user_${m.userId}`).emit('new_message', botMsg);
          break;
        }
      }
    } catch (err) {
      console.error('Send error:', err);
      socket.emit('error', { message: 'Send failed' });
    }
  });

  socket.on('admin_announcement', async ({ conversationId, text, pin }) => {
    try {
      if (!conversationId || !text?.trim()) return;
      const membership = await prisma.conversationMember.findFirst({ where: { conversationId: Number(conversationId), userId, role: 'admin', isBanned: false } });
      if (!membership) return;
      const announcement = await prisma.message.create({
        data: {
          text: text.trim(),
          senderId: userId,
          conversationId: Number(conversationId),
          type: 'admin_announcement',
          isPinned: !!pin,
          linkPreview: text ? (text.match(/https?:\/\/[^\s]+/) || [])[0] || null : null,
        },
        include: msgInclude,
      });
      await prisma.conversation.update({ where: { id: Number(conversationId) }, data: { updatedAt: new Date() } });
      const members = await prisma.conversationMember.findMany({ where: { conversationId: Number(conversationId), isBanned: false } });
      for (const m of members) io.to(`user_${m.userId}`).emit('new_message', announcement);
      if (pin) {
        for (const m of members) io.to(`user_${m.userId}`).emit('message_pinned', { messageId: announcement.id, conversationId: Number(conversationId), isPinned: true });
      }
      socket.emit('announcement_sent', { id: announcement.id, pinned: !!pin });
    } catch (err) {
      console.error('Announcement error:', err);
    }
  });

  socket.on('edit_message', async ({ messageId, newText }) => {
    try {
      const ctx = await getAuthorizedMessageContext(prisma, userId, Number(messageId));
      if (!ctx || ctx.senderId !== userId || ctx.isDeleted || !String(newText || '').trim()) return;
      const updated = await prisma.message.update({
        where: { id: ctx.messageId },
        data: { text: String(newText).trim(), isEdited: true, editedAt: new Date() },
        include: msgInclude,
      });
      const members = await prisma.conversationMember.findMany({ where: { conversationId: ctx.conversationId, isBanned: false } });
      for (const m of members) io.to(`user_${m.userId}`).emit('message_edited', updated);
    } catch (err) {
      console.error('edit_message failed', err);
    }
  });

  socket.on('forward_message', async ({ messageId, messageIds, targetConversationIds }) => {
    try {
      const ids = Array.isArray(messageIds) && messageIds.length ? messageIds : [messageId];
      const authorizedContexts = [];
      for (const rawId of ids.filter(Boolean)) {
        const ctx = await getAuthorizedMessageContext(prisma, userId, Number(rawId));
        if (ctx && !ctx.isDeleted) authorizedContexts.push(ctx);
      }
      if (!authorizedContexts.length) return;
      let createdCount = 0;
      for (const rawConversationId of targetConversationIds || []) {
        const cid = Number(rawConversationId);
        if (!cid) continue;
        for (const orig of authorizedContexts) {
          const permission = await checkSendPermission(prisma, userId, cid, orig.type);
          if (!permission.allowed) continue;
          const fwd = await prisma.message.create({
            data: {
              text: orig.text,
              senderId: userId,
              conversationId: cid,
              type: orig.type,
              fileUrl: orig.fileUrl,
              fileName: orig.fileName,
              fileSize: orig.fileSize,
              forwardedFrom: orig.messageId,
            },
            include: msgInclude,
          });
          createdCount += 1;
          await prisma.conversation.update({ where: { id: cid }, data: { updatedAt: new Date() } });
          const members = await prisma.conversationMember.findMany({ where: { conversationId: cid, isBanned: false } });
          for (const m of members) io.to(`user_${m.userId}`).emit('new_message', fwd);
        }
      }
      socket.emit('forward_complete', { count: createdCount });
    } catch (err) {
      console.error('forward_message failed', err);
    }
  });

  socket.on('delete_message', async ({ messageId }) => {
    try {
      const ctx = await getAuthorizedMessageContext(prisma, userId, Number(messageId));
      if (!ctx) return;
      const deletedByAdmin = ctx.senderId !== userId && ctx.isAdmin;
      if (ctx.senderId !== userId && !ctx.isAdmin) return;
      await prisma.message.update({
        where: { id: ctx.messageId },
        data: {
          isDeleted: true,
          text: deletedByAdmin ? 'تم حذف هذه الرسالة بواسطة الإدارة' : null,
          fileUrl: null,
          fileName: null,
          fileSize: null,
        },
      });
      const members = await prisma.conversationMember.findMany({ where: { conversationId: ctx.conversationId, isBanned: false } });
      for (const m of members) io.to(`user_${m.userId}`).emit('message_deleted', { messageId: ctx.messageId, conversationId: ctx.conversationId, deletedByAdmin });
    } catch (err) {
      console.error('delete_message failed', err);
    }
  });

  socket.on('delete_messages', async ({ messageIds }) => {
    try {
      const deletedIds: number[] = [];
      let broadcastConversationId: number | null = null;
      for (const rawId of Array.isArray(messageIds) ? messageIds : []) {
        const ctx = await getAuthorizedMessageContext(prisma, userId, Number(rawId));
        if (!ctx) continue;
        if (ctx.senderId !== userId && !ctx.isAdmin) continue;
        await prisma.message.update({
          where: { id: ctx.messageId },
          data: {
            isDeleted: true,
            text: ctx.senderId !== userId && ctx.isAdmin ? 'تم حذف هذه الرسالة بواسطة الإدارة' : null,
            fileUrl: null,
            fileName: null,
            fileSize: null,
          },
        });
        deletedIds.push(ctx.messageId);
        broadcastConversationId = ctx.conversationId;
      }
      if (!deletedIds.length || !broadcastConversationId) return;
      const members = await prisma.conversationMember.findMany({ where: { conversationId: broadcastConversationId, isBanned: false } });
      for (const m of members) io.to(`user_${m.userId}`).emit('messages_bulk_deleted', { messageIds: deletedIds, conversationId: broadcastConversationId });
    } catch (err) {
      console.error('delete_messages failed', err);
    }
  });

  socket.on('toggle_pin', async ({ messageId }) => {
    try {
      const ctx = await getAuthorizedMessageContext(prisma, userId, Number(messageId));
      if (!ctx || !ctx.isAdmin) return;
      await prisma.message.update({ where: { id: ctx.messageId }, data: { isPinned: !ctx.isPinned } });
      const members = await prisma.conversationMember.findMany({ where: { conversationId: ctx.conversationId, isBanned: false } });
      for (const m of members) io.to(`user_${m.userId}`).emit('message_pinned', { messageId: ctx.messageId, conversationId: ctx.conversationId, isPinned: !ctx.isPinned });
    } catch (err) {
      console.error('toggle_pin failed', err);
    }
  });

  socket.on('toggle_star', async ({ messageId }) => {
    try {
      const ctx = await getAuthorizedMessageContext(prisma, userId, Number(messageId));
      if (!ctx) return;
      const existing = await prisma.starredMessage.findFirst({ where: { userId, messageId: ctx.messageId } });
      if (existing) await prisma.starredMessage.delete({ where: { id: existing.id } });
      else await prisma.starredMessage.create({ data: { userId, messageId: ctx.messageId } });
      socket.emit('star_toggled', { messageId: ctx.messageId, starred: !existing });
    } catch (err) {
      console.error('toggle_star failed', err);
    }
  });

  socket.on('mark_read', async ({ conversationId }) => {
    try {
      const membership = await getConversationMembership(prisma, userId, Number(conversationId));
      if (!membership) return;
      const unread = await prisma.message.findMany({ where: { conversationId: Number(conversationId), senderId: { not: userId }, isRead: false, isDeleted: false }, select: { id: true } });
      if (!unread.length) return;
      await prisma.message.updateMany({ where: { conversationId: Number(conversationId), senderId: { not: userId }, isRead: false }, data: { isRead: true } });
      for (const msg of unread) {
        try {
          await prisma.readReceipt.create({ data: { messageId: msg.id, userId } });
        } catch {
          // Ignore duplicate receipts.
        }
      }
      const members = await prisma.conversationMember.findMany({ where: { conversationId: Number(conversationId), isBanned: false } });
      for (const m of members) io.to(`user_${m.userId}`).emit('messages_read', { conversationId: Number(conversationId), readBy: userId });
    } catch (err) {
      console.error('mark_read failed', err);
    }
  });

  socket.on('slash_command', async ({ conversationId, command, args }) => {
    try {
      const membership = await getConversationMembership(prisma, userId, Number(conversationId));
      if (!membership) return;
      let resp = '';
      if (command === 'remind') {
        const mins = parseInt(args, 10) || 30;
        await prisma.reminder.create({ data: { userId, text: 'تذكير', remindAt: new Date(Date.now() + mins * 60000) } });
        resp = `تم ضبط تذكير بعد ${mins} دقيقة`;
      } else if (command === 'todo' && args) {
        await prisma.todo.create({ data: { text: args, conversationId: Number(conversationId), createdById: userId } });
        resp = `تمت اضافة: ${args}`;
      }
      if (resp) socket.emit('command_response', { conversationId: Number(conversationId), text: resp });
    } catch (err) {
      console.error('slash_command failed', err);
    }
  });
}
