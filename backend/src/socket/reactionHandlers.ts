import { Server, Socket } from 'socket.io';
import { PrismaClient } from '@prisma/client';
import { allowSocketAction, getAuthorizedMessageContext } from './helpers';

export function setupReactionHandlers(io: Server, socket: Socket, prisma: PrismaClient) {
  const userId = socket.data.userId;

  socket.on('toggle_reaction', async ({ messageId, emoji }) => {
    try {
      if (!emoji || !messageId) return;
      if (!allowSocketAction(socket, 'toggle_reaction', 30, 10_000)) return;
      const ctx = await getAuthorizedMessageContext(prisma, userId, Number(messageId));
      if (!ctx || ctx.isDeleted) return;

      const existing = await prisma.reaction.findFirst({ where: { messageId: ctx.messageId, userId, emoji } });
      if (existing) await prisma.reaction.delete({ where: { id: existing.id } });
      else await prisma.reaction.create({ data: { emoji, userId, messageId: ctx.messageId } });

      const reactions = await prisma.reaction.findMany({
        where: { messageId: ctx.messageId },
        include: { user: { select: { id: true, name: true } } },
      });
      const members = await prisma.conversationMember.findMany({ where: { conversationId: ctx.conversationId, isBanned: false } });
      for (const m of members) io.to(`user_${m.userId}`).emit('reactions_updated', { messageId: ctx.messageId, conversationId: ctx.conversationId, reactions });
    } catch (err) {
      console.error('Reaction error:', err);
    }
  });
}
