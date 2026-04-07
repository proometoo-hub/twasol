import prisma from '../prisma';

export async function requireConversationMember(userId: number, conversationId: number) {
  const membership = await prisma.conversationMember.findFirst({ where: { userId, conversationId, isBanned: false } });
  return membership;
}

export async function requireConversationAdmin(userId: number, conversationId: number) {
  const membership = await prisma.conversationMember.findFirst({ where: { userId, conversationId, role: 'admin', isBanned: false } });
  return membership;
}

export async function requireMessageAccess(userId: number, messageId: number) {
  const message = await prisma.message.findUnique({ where: { id: messageId }, select: { id: true, conversationId: true } });
  if (!message) return null;
  const membership = await requireConversationMember(userId, message.conversationId);
  if (!membership) return null;
  return message;
}
