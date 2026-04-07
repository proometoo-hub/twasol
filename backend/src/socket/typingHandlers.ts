import { Server, Socket } from 'socket.io';
import { PrismaClient } from '@prisma/client';
import { allowSocketAction, getConversationMembership } from './helpers';

export function setupTypingHandlers(io: Server, socket: Socket, prisma: PrismaClient) {
  const userId = socket.data.userId;

  socket.on('typing', async ({ conversationId, isTyping }) => {
    if (!conversationId) return;
    if (!allowSocketAction(socket, 'typing', 40, 10_000)) return;
    const membership = await getConversationMembership(prisma, userId, Number(conversationId));
    if (!membership) return;
    socket.to(`conv_${conversationId}`).emit('user_typing', { userId, conversationId: Number(conversationId), isTyping: !!isTyping });
  });

  socket.on('join_conversation', async (conversationId) => {
    try {
      const membership = await getConversationMembership(prisma, userId, Number(conversationId));
      if (membership) socket.join(`conv_${conversationId}`);
    } catch (err) {
      console.error('join_conversation failed', err);
    }
  });
}
