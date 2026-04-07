import { PrismaClient } from '@prisma/client';
import { Socket } from 'socket.io';

export type MessageAccessContext = {
  messageId: number;
  conversationId: number;
  senderId: number;
  isPinned: boolean;
  isDeleted: boolean;
  type: string;
  fileUrl: string | null;
  fileName: string | null;
  fileSize: number | null;
  text: string | null;
  isAdmin: boolean;
};

export async function getConversationMembership(prisma: PrismaClient, userId: number, conversationId: number) {
  return prisma.conversationMember.findFirst({ where: { conversationId, userId, isBanned: false } });
}

export async function getAuthorizedMessageContext(prisma: PrismaClient, userId: number, messageId: number): Promise<MessageAccessContext | null> {
  if (!Number.isInteger(Number(messageId))) return null;
  const message = await prisma.message.findUnique({
    where: { id: Number(messageId) },
    select: {
      id: true,
      conversationId: true,
      senderId: true,
      isPinned: true,
      isDeleted: true,
      type: true,
      fileUrl: true,
      fileName: true,
      fileSize: true,
      text: true,
    },
  });
  if (!message) return null;
  const membership = await getConversationMembership(prisma, userId, message.conversationId);
  if (!membership) return null;
  return {
    messageId: message.id,
    conversationId: message.conversationId,
    senderId: message.senderId,
    isPinned: !!message.isPinned,
    isDeleted: !!message.isDeleted,
    type: message.type,
    fileUrl: message.fileUrl,
    fileName: message.fileName,
    fileSize: message.fileSize,
    text: message.text,
    isAdmin: membership.role === 'admin',
  };
}

export function allowSocketAction(socket: Socket, key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const store = (socket.data.__rateLimiter ||= {} as Record<string, { count: number; resetAt: number }>);
  const existing = store[key];
  if (!existing || existing.resetAt <= now) {
    store[key] = { count: 1, resetAt: now + windowMs };
    return true;
  }
  if (existing.count >= limit) return false;
  existing.count += 1;
  return true;
}
