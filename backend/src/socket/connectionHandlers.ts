import { Server, Socket } from 'socket.io';
import { PrismaClient } from '@prisma/client';

const onlineUsers = new Map<number, string>();

export function setupConnectionHandlers(io: Server, socket: Socket, prisma: PrismaClient) {
  const userId = socket.data.userId;
  onlineUsers.set(userId, socket.id);

  // CRITICAL: Join user-specific room so targeted events (calls, notifications) are received
  socket.join(`user_${userId}`);

  prisma.user.update({ where: { id: userId }, data: { status: 'online' } }).catch(() => {});
  io.emit('user_status', { userId, status: 'online' });

  socket.on('group_settings_updated', async ({ conversationId }) => {
    const members = await prisma.conversationMember.findMany({ where: { conversationId } });
    for (const m of members) io.to(`user_${m.userId}`).emit('group_updated', { conversationId });
  });

  socket.on('disconnect', async () => {
    onlineUsers.delete(userId);
    try {
      await prisma.user.update({ where: { id: userId }, data: { status: 'offline', lastSeen: new Date() } });
      io.emit('user_status', { userId, status: 'offline' });
    } catch {}
  });
}

export { onlineUsers };
