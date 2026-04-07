import { PrismaClient } from '@prisma/client';

export interface PermResult {
  allowed: boolean;
  reason?: string;
}

export async function checkSendPermission(
  prisma: PrismaClient, userId: number, conversationId: number, msgType: string
): Promise<PermResult> {
  const membership = await prisma.conversationMember.findFirst({
    where: { conversationId, userId }
  });
  if (!membership || membership.isBanned) return { allowed: false, reason: 'Not a member' };
  if (membership.isMuted) return { allowed: false, reason: 'You are muted by admin' };
  if (msgType === 'voice' && !membership.canSendVoice) return { allowed: false, reason: 'Voice messages are disabled for you' };
  if (msgType !== 'text' && msgType !== 'voice' && !membership.canSendMedia) return { allowed: false, reason: 'Media sharing is disabled for you' };

  const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conv) return { allowed: false, reason: 'Conversation not found' };

  const isAdmin = membership.role === 'admin';

  // Channel or admin-only mode
  if ((conv.isChannel || conv.onlyAdmins) && !isAdmin) {
    return { allowed: false, reason: 'Only admins can send messages here' };
  }

  // No media restriction
  if (conv.noMedia && msgType !== 'text' && !isAdmin) {
    return { allowed: false, reason: 'Media is not allowed here' };
  }

  // No voice restriction
  if (conv.noVoice && msgType === 'voice' && !isAdmin) {
    return { allowed: false, reason: 'Voice messages are not allowed here' };
  }

  // Check block (only for private chats)
  if (!conv.isGroup && !conv.isChannel) {
    const members = await prisma.conversationMember.findMany({ where: { conversationId } });
    const otherUserId = members.find(m => m.userId !== userId)?.userId;
    if (otherUserId) {
      const blocked = await prisma.block.findFirst({
        where: { OR: [{ userId, blockedId: otherUserId }, { userId: otherUserId, blockedId: userId }] }
      });
      if (blocked) return { allowed: false, reason: 'Blocked' };
    }
  }

  return { allowed: true };
}

export async function checkIsAdmin(prisma: PrismaClient, userId: number, conversationId: number): Promise<boolean> {
  const m = await prisma.conversationMember.findFirst({
    where: { conversationId, userId, role: 'admin' }
  });
  return !!m;
}
