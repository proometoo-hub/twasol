import { Server, Socket } from 'socket.io';
import { PrismaClient } from '@prisma/client';
import { sendCallPushNotification } from '../utils/pushNotifications';
import { allowSocketAction } from './helpers';

type PendingJoiner = { userId: number; requestedAt: string };
type RoomState = { waitingRoom: boolean; muteAll: boolean; roles: Record<number, 'host' | 'presenter' | 'listener'>; pending: PendingJoiner[] };
const roomStates = new Map<number, RoomState>();

function getRoomState(conversationId: number, ownerId?: number) {
  let state = roomStates.get(conversationId);
  if (!state) {
    state = { waitingRoom: false, muteAll: false, roles: {}, pending: [] };
    if (ownerId) state.roles[ownerId] = 'host';
    roomStates.set(conversationId, state);
  }
  return state;
}

function cleanupRoomState(io: Server, conversationId: number, userId?: number) {
  const state = roomStates.get(conversationId);
  if (!state) return;
  if (userId) {
    delete state.roles[userId];
    state.pending = state.pending.filter((entry) => entry.userId !== userId);
  }
  const room = io.sockets.adapter.rooms.get(`group_call_${conversationId}`);
  if (!room || room.size === 0) roomStates.delete(conversationId);
}

async function isMember(prisma: PrismaClient, conversationId: number, userId: number) {
  return prisma.conversationMember.findFirst({ where: { conversationId, userId, isBanned: false } });
}

async function ensurePeer(prisma: PrismaClient, conversationId: number, senderUserId: number, targetUserId?: number | null) {
  if (!conversationId || !senderUserId || !targetUserId) return null;
  const [senderMembership, targetMembership] = await Promise.all([
    isMember(prisma, conversationId, senderUserId),
    isMember(prisma, conversationId, targetUserId),
  ]);
  if (!senderMembership || !targetMembership) return null;
  return { senderMembership, targetMembership };
}

async function shareDirectConversation(prisma: PrismaClient, senderUserId: number, targetUserId?: number | null) {
  if (!senderUserId || !targetUserId) return null;
  return prisma.conversation.findFirst({
    where: {
      isGroup: false,
      isChannel: false,
      members: { some: { userId: senderUserId, isBanned: false } },
      AND: [{ members: { some: { userId: Number(targetUserId), isBanned: false } } }],
    },
    select: { id: true },
  });
}

export function setupCallHandlers(io: Server, socket: Socket, prisma: PrismaClient) {
  const userId = socket.data.userId;

  socket.on('call_user', async ({ targetUserId, signal, callType }) => {
    if (!targetUserId || !allowSocketAction(socket, 'call_user', 6, 60_000)) return;
    const peer = await shareDirectConversation(prisma, userId, Number(targetUserId));
    if (!peer) return;
    io.to(`user_${targetUserId}`).emit('incoming_call', { callerId: userId, signal, callType, conversationId: peer.id });
  });

  socket.on('answer_call', async ({ targetUserId, signal }) => {
    if (!targetUserId) return;
    const peer = await shareDirectConversation(prisma, userId, Number(targetUserId));
    if (!peer) return;
    io.to(`user_${targetUserId}`).emit('call_answered', { signal, conversationId: peer.id });
  });

  socket.on('reject_call', async ({ targetUserId }) => {
    if (!targetUserId) return;
    const peer = await shareDirectConversation(prisma, userId, Number(targetUserId));
    if (!peer) return;
    io.to(`user_${targetUserId}`).emit('call_rejected', { conversationId: peer.id });
  });

  socket.on('end_call', async ({ targetUserId }) => {
    if (!targetUserId) return;
    const peer = await shareDirectConversation(prisma, userId, Number(targetUserId));
    if (!peer) return;
    io.to(`user_${targetUserId}`).emit('call_ended', { conversationId: peer.id });
  });

  socket.on('ice_candidate', async ({ targetUserId, candidate }) => {
    if (!targetUserId || !candidate) return;
    const peer = await shareDirectConversation(prisma, userId, Number(targetUserId));
    if (!peer) return;
    io.to(`user_${targetUserId}`).emit('ice_candidate', { candidate, conversationId: peer.id });
  });

  socket.on('native_call_invite', async ({ conversationId, mode, roomName, from, targetUserId }) => {
    try {
      if (!conversationId || !allowSocketAction(socket, 'native_call_invite', 6, 60_000)) return;
      const membership = await isMember(prisma, Number(conversationId), userId);
      if (!membership) return;
      const members = await prisma.conversationMember.findMany({ where: { conversationId: Number(conversationId), isBanned: false }, include: { user: { select: { id: true, name: true, avatar: true } } } });
      const targets = members.filter((m) => m.userId !== userId && (!targetUserId || m.userId === Number(targetUserId)));
      const payload = { conversationId: Number(conversationId), mode: mode || 'audio', roomName: roomName || null, from: from || { id: userId }, targetUserId: targetUserId || null, members: members.map((m) => m.user), isGroup: false };
      for (const m of targets) io.to(`user_${m.userId}`).emit('native_call_invite', payload);
      await sendCallPushNotification({
        userIds: targets.map((m) => m.userId),
        title: mode === 'video' ? 'مكالمة فيديو واردة' : 'مكالمة صوتية واردة',
        body: `${from?.name || 'مستخدم'} يتصل بك في ${roomName || 'تواصل'}`,
        data: { ...payload, kind: 'incoming_call', fromName: from?.name || '' },
      });
    } catch (err) {
      console.error('native_call_invite failed', err);
    }
  });

  socket.on('native_call_accept', async ({ conversationId, targetUserId, mode }) => {
    try {
      const peer = await ensurePeer(prisma, Number(conversationId), userId, Number(targetUserId));
      if (!peer) return;
      io.to(`user_${targetUserId}`).emit('native_call_accept', { conversationId: Number(conversationId), userId, mode: mode || 'audio' });
    } catch (err) {
      console.error('native_call_accept failed', err);
    }
  });

  socket.on('native_call_decline', async ({ conversationId, targetUserId, reason }) => {
    try {
      const peer = await ensurePeer(prisma, Number(conversationId), userId, Number(targetUserId));
      if (!peer) return;
      io.to(`user_${targetUserId}`).emit('native_call_decline', { conversationId: Number(conversationId), userId, reason: reason || 'declined' });
    } catch (err) {
      console.error('native_call_decline failed', err);
    }
  });

  socket.on('native_call_offer', async ({ conversationId, targetUserId, offer }) => {
    try {
      const peer = await ensurePeer(prisma, Number(conversationId), userId, Number(targetUserId));
      if (!peer || !offer) return;
      io.to(`user_${targetUserId}`).emit('native_call_offer', { conversationId: Number(conversationId), userId, offer });
    } catch (err) {
      console.error('native_call_offer failed', err);
    }
  });

  socket.on('native_call_answer', async ({ conversationId, targetUserId, answer }) => {
    try {
      const peer = await ensurePeer(prisma, Number(conversationId), userId, Number(targetUserId));
      if (!peer || !answer) return;
      io.to(`user_${targetUserId}`).emit('native_call_answer', { conversationId: Number(conversationId), userId, answer });
    } catch (err) {
      console.error('native_call_answer failed', err);
    }
  });

  socket.on('native_call_ice', async ({ conversationId, targetUserId, candidate }) => {
    try {
      const peer = await ensurePeer(prisma, Number(conversationId), userId, Number(targetUserId));
      if (!peer || !candidate) return;
      io.to(`user_${targetUserId}`).emit('native_call_ice', { conversationId: Number(conversationId), userId, candidate });
    } catch (err) {
      console.error('native_call_ice failed', err);
    }
  });

  socket.on('native_call_state', async ({ conversationId, targetUserId, state }) => {
    try {
      if (!targetUserId) return;
      const peer = await ensurePeer(prisma, Number(conversationId), userId, Number(targetUserId));
      if (!peer) return;
      io.to(`user_${targetUserId}`).emit('native_call_state', { conversationId: Number(conversationId), userId, state: state || {} });
    } catch (err) {
      console.error('native_call_state failed', err);
    }
  });

  socket.on('native_call_end', async ({ conversationId, targetUserId }) => {
    try {
      if (!conversationId) return;
      const membership = await isMember(prisma, Number(conversationId), userId);
      if (!membership) return;
      if (targetUserId) {
        const peer = await ensurePeer(prisma, Number(conversationId), userId, Number(targetUserId));
        if (!peer) return;
        io.to(`user_${targetUserId}`).emit('native_call_end', { conversationId: Number(conversationId), userId });
        return;
      }
      const members = await prisma.conversationMember.findMany({ where: { conversationId: Number(conversationId), isBanned: false } });
      for (const m of members) {
        if (m.userId === userId) continue;
        io.to(`user_${m.userId}`).emit('native_call_end', { conversationId: Number(conversationId), userId });
      }
    } catch (err) {
      console.error('native_call_end failed', err);
    }
  });

  socket.on('group_call_start', async ({ conversationId, callType, effectMode }) => {
    try {
      const membership = await isMember(prisma, Number(conversationId), userId);
      if (!membership) return;
      const numericConversationId = Number(conversationId);
      const roomState = getRoomState(numericConversationId, userId);
      roomState.roles[userId] = 'host';
      socket.join(`group_call_${numericConversationId}`);
      const members = await prisma.conversationMember.findMany({ where: { conversationId: numericConversationId, isBanned: false }, include: { user: { select: { id: true, name: true, avatar: true } } } });
      const conversation = await prisma.conversation.findUnique({ where: { id: numericConversationId }, select: { id: true, name: true, isGroup: true, isChannel: true } });
      const targets = members.filter((m) => m.userId !== userId);
      const payload = {
        conversationId: numericConversationId,
        callerId: userId,
        callType,
        effectMode: effectMode || 'none',
        members: members.map((x) => x.user),
        roomName: conversation?.name || 'مكالمة جماعية',
        from: members.find((x) => x.userId === userId)?.user || { id: userId, name: 'مستخدم', avatar: '' },
        roomSettings: { waitingRoom: roomState.waitingRoom, muteAll: roomState.muteAll, roles: roomState.roles },
        isGroup: true,
      };
      for (const m of targets) io.to(`user_${m.userId}`).emit('incoming_group_call', payload);
      await sendCallPushNotification({
        userIds: targets.map((m) => m.userId),
        title: callType === 'video' ? 'دعوة لمكالمة جماعية فيديو' : 'دعوة لمكالمة جماعية صوتية',
        body: `${payload.from?.name || 'مستخدم'} بدأ ${conversation?.isChannel ? 'بثًا' : 'مكالمة'} في ${payload.roomName}`,
        data: { ...payload, kind: 'incoming_group_call', fromName: payload.from?.name || '' },
      });
      io.to(`group_call_${numericConversationId}`).emit('group_call_participants_snapshot', { conversationId: numericConversationId, participants: [{ userId, joinedAt: new Date().toISOString() }] });
      io.to(`group_call_${numericConversationId}`).emit('group_call_state', { conversationId: numericConversationId, waitingRoom: roomState.waitingRoom, muteAll: roomState.muteAll, roles: roomState.roles, pending: roomState.pending });
    } catch (err) {
      console.error('group_call_start failed', err);
    }
  });

  socket.on('join_group_call', async ({ conversationId, callType, effectMode }) => {
    try {
      const numericConversationId = Number(conversationId);
      const membership = await isMember(prisma, numericConversationId, userId);
      if (!membership) return;
      const roomState = getRoomState(numericConversationId);
      const isAdmin = membership.role === 'admin';
      const myRole = roomState.roles[userId] || (isAdmin ? 'presenter' : 'listener');
      roomState.roles[userId] = myRole;
      const canBypassWaiting = isAdmin || myRole === 'host' || myRole === 'presenter';
      if (roomState.waitingRoom && !canBypassWaiting) {
        if (!roomState.pending.find((p) => p.userId === userId)) roomState.pending.push({ userId, requestedAt: new Date().toISOString() });
        socket.emit('group_call_waiting_room', { conversationId: numericConversationId, status: 'pending' });
        io.to(`group_call_${numericConversationId}`).emit('group_call_pending_joiners', { conversationId: numericConversationId, pending: roomState.pending });
        return;
      }
      socket.join(`group_call_${numericConversationId}`);
      socket.emit('group_call_state', { conversationId: numericConversationId, waitingRoom: roomState.waitingRoom, muteAll: roomState.muteAll, roles: roomState.roles, pending: roomState.pending });
      socket.to(`group_call_${numericConversationId}`).emit('group_call_participant_joined', {
        conversationId: numericConversationId,
        participant: { userId, joinedAt: new Date().toISOString(), effectMode: effectMode || 'none', role: myRole },
        callType,
      });
    } catch (err) {
      console.error('join_group_call failed', err);
    }
  });

  socket.on('group_call_leave', async ({ conversationId }) => {
    const numericConversationId = Number(conversationId);
    const membership = await isMember(prisma, numericConversationId, userId);
    if (!membership) return;
    socket.leave(`group_call_${numericConversationId}`);
    cleanupRoomState(io, numericConversationId, userId);
    socket.to(`group_call_${numericConversationId}`).emit('group_call_participant_left', { conversationId: numericConversationId, userId });
  });

  socket.on('group_call_offer', async ({ conversationId, targetUserId, signal, callType, effectMode }) => {
    const peer = await ensurePeer(prisma, Number(conversationId), userId, Number(targetUserId));
    if (!peer || !signal) return;
    io.to(`user_${targetUserId}`).emit('group_call_offer', { conversationId: Number(conversationId), callerId: userId, signal, callType, effectMode: effectMode || 'none' });
  });

  socket.on('group_call_answer', async ({ conversationId, targetUserId, signal }) => {
    const peer = await ensurePeer(prisma, Number(conversationId), userId, Number(targetUserId));
    if (!peer || !signal) return;
    io.to(`user_${targetUserId}`).emit('group_call_answer', { conversationId: Number(conversationId), userId, signal });
  });

  socket.on('group_call_ice', async ({ conversationId, targetUserId, candidate }) => {
    const peer = await ensurePeer(prisma, Number(conversationId), userId, Number(targetUserId));
    if (!peer || !candidate) return;
    io.to(`user_${targetUserId}`).emit('group_call_ice', { conversationId: Number(conversationId), userId, candidate });
  });

  socket.on('group_call_effect', async ({ conversationId, effectMode }) => {
    const numericConversationId = Number(conversationId);
    const membership = await isMember(prisma, numericConversationId, userId);
    if (!membership) return;
    socket.to(`group_call_${numericConversationId}`).emit('group_call_effect', { conversationId: numericConversationId, userId, effectMode: effectMode || 'none' });
  });

  socket.on('group_call_screen_share', async ({ conversationId, enabled }) => {
    try {
      const numericConversationId = Number(conversationId);
      const membership = await isMember(prisma, numericConversationId, userId);
      if (!membership) return;
      socket.to(`group_call_${numericConversationId}`).emit('group_call_screen_share', { conversationId: numericConversationId, userId, enabled: !!enabled });
    } catch (err) {
      console.error('group_call_screen_share failed', err);
    }
  });

  socket.on('group_call_raise_hand', async ({ conversationId, raised }) => {
    try {
      const numericConversationId = Number(conversationId);
      const membership = await isMember(prisma, numericConversationId, userId);
      if (!membership) return;
      io.to(`group_call_${numericConversationId}`).emit('group_call_raise_hand', { conversationId: numericConversationId, userId, raised: !!raised, at: new Date().toISOString() });
    } catch (err) {
      console.error('group_call_raise_hand failed', err);
    }
  });

  socket.on('group_call_reaction', async ({ conversationId, reaction }) => {
    try {
      const numericConversationId = Number(conversationId);
      const membership = await isMember(prisma, numericConversationId, userId);
      if (!membership) return;
      io.to(`group_call_${numericConversationId}`).emit('group_call_reaction', { conversationId: numericConversationId, userId, reaction: reaction || '👍', at: new Date().toISOString() });
    } catch (err) {
      console.error('group_call_reaction failed', err);
    }
  });

  socket.on('group_call_recording', async ({ conversationId, enabled }) => {
    try {
      const numericConversationId = Number(conversationId);
      const membership = await isMember(prisma, numericConversationId, userId);
      if (!membership || membership.role !== 'admin') return;
      io.to(`group_call_${numericConversationId}`).emit('group_call_recording', { conversationId: numericConversationId, userId, enabled: !!enabled, at: new Date().toISOString() });
    } catch (err) {
      console.error('group_call_recording failed', err);
    }
  });

  socket.on('group_call_admin_action', async ({ conversationId, targetUserId, action }) => {
    try {
      const numericConversationId = Number(conversationId);
      const peer = await ensurePeer(prisma, numericConversationId, userId, Number(targetUserId));
      const membership = await isMember(prisma, numericConversationId, userId);
      if (!peer || !membership || membership.role !== 'admin') return;
      io.to(`user_${targetUserId}`).emit('group_call_admin_action', { conversationId: numericConversationId, actorUserId: userId, targetUserId, action });
      socket.to(`group_call_${numericConversationId}`).emit('group_call_admin_action', { conversationId: numericConversationId, actorUserId: userId, targetUserId, action });
      if (action === 'remove') io.to(`user_${targetUserId}`).emit('group_call_force_leave', { conversationId: numericConversationId, actorUserId: userId });
    } catch (err) {
      console.error('group_call_admin_action failed', err);
    }
  });

  socket.on('group_call_toggle_waiting_room', async ({ conversationId, enabled }) => {
    try {
      const numericConversationId = Number(conversationId);
      const membership = await isMember(prisma, numericConversationId, userId);
      if (!membership || membership.role !== 'admin') return;
      const roomState = getRoomState(numericConversationId);
      roomState.waitingRoom = !!enabled;
      io.to(`group_call_${numericConversationId}`).emit('group_call_state', { conversationId: numericConversationId, waitingRoom: roomState.waitingRoom, muteAll: roomState.muteAll, roles: roomState.roles, pending: roomState.pending });
    } catch (err) {
      console.error('group_call_toggle_waiting_room failed', err);
    }
  });

  socket.on('group_call_admit_joiner', async ({ conversationId, targetUserId, admit }) => {
    try {
      const numericConversationId = Number(conversationId);
      const peer = await ensurePeer(prisma, numericConversationId, userId, Number(targetUserId));
      const membership = await isMember(prisma, numericConversationId, userId);
      if (!peer || !membership || membership.role !== 'admin') return;
      const roomState = getRoomState(numericConversationId);
      roomState.pending = roomState.pending.filter((p) => p.userId !== Number(targetUserId));
      io.to(`group_call_${numericConversationId}`).emit('group_call_pending_joiners', { conversationId: numericConversationId, pending: roomState.pending });
      io.to(`user_${targetUserId}`).emit('group_call_waiting_room', { conversationId: numericConversationId, status: admit ? 'admitted' : 'rejected' });
    } catch (err) {
      console.error('group_call_admit_joiner failed', err);
    }
  });

  socket.on('group_call_set_role', async ({ conversationId, targetUserId, role }) => {
    try {
      const numericConversationId = Number(conversationId);
      const peer = await ensurePeer(prisma, numericConversationId, userId, Number(targetUserId));
      const membership = await isMember(prisma, numericConversationId, userId);
      if (!peer || !membership || membership.role !== 'admin') return;
      const normalized = ['host', 'presenter', 'listener'].includes(role) ? role : 'listener';
      const roomState = getRoomState(numericConversationId);
      roomState.roles[Number(targetUserId)] = normalized as 'host' | 'presenter' | 'listener';
      io.to(`group_call_${numericConversationId}`).emit('group_call_state', { conversationId: numericConversationId, waitingRoom: roomState.waitingRoom, muteAll: roomState.muteAll, roles: roomState.roles, pending: roomState.pending });
      io.to(`user_${targetUserId}`).emit('group_call_role_updated', { conversationId: numericConversationId, role: normalized });
    } catch (err) {
      console.error('group_call_set_role failed', err);
    }
  });

  socket.on('group_call_mute_all', async ({ conversationId, enabled }) => {
    try {
      const numericConversationId = Number(conversationId);
      const membership = await isMember(prisma, numericConversationId, userId);
      if (!membership || membership.role !== 'admin') return;
      const roomState = getRoomState(numericConversationId);
      roomState.muteAll = !!enabled;
      io.to(`group_call_${numericConversationId}`).emit('group_call_mute_all', { conversationId: numericConversationId, enabled: roomState.muteAll, actorUserId: userId });
      io.to(`group_call_${numericConversationId}`).emit('group_call_state', { conversationId: numericConversationId, waitingRoom: roomState.waitingRoom, muteAll: roomState.muteAll, roles: roomState.roles, pending: roomState.pending });
    } catch (err) {
      console.error('group_call_mute_all failed', err);
    }
  });

  socket.on('group_call_chat_message', async ({ conversationId, text, clientId }) => {
    try {
      const numericConversationId = Number(conversationId);
      const membership = await isMember(prisma, numericConversationId, userId);
      if (!membership) return;
      const trimmed = String(text || '').trim();
      if (!trimmed) return;
      io.to(`group_call_${numericConversationId}`).emit('group_call_chat_message', {
        conversationId: numericConversationId,
        message: {
          id: `${numericConversationId}-${userId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          clientId: clientId || null,
          userId,
          text: trimmed.slice(0, 2000),
          createdAt: new Date().toISOString(),
        },
      });
    } catch (err) {
      console.error('group_call_chat_message failed', err);
    }
  });

  socket.on('disconnect', () => {
    for (const conversationId of roomStates.keys()) cleanupRoomState(io, conversationId, userId);
  });
}
