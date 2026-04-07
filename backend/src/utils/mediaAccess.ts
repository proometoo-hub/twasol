import path from 'path';
import { PrismaClient } from '@prisma/client';

export function normalizeStoredUploadPath(input: string | null | undefined) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  const withoutQuery = raw.split('?')[0];
  const decoded = decodeURIComponent(withoutQuery);
  const filename = path.basename(decoded);
  if (!filename || filename === '.' || filename === '..') return null;
  return `/uploads/${filename}`;
}

export function getUploadFilename(input: string | null | undefined) {
  const normalized = normalizeStoredUploadPath(input);
  return normalized ? path.basename(normalized) : null;
}

async function canAccessStoryOwner(prisma: PrismaClient, userId: number, ownerUserId: number) {
  if (ownerUserId === userId) return true;
  const sharedConversation = await prisma.conversation.findFirst({
    where: {
      members: { some: { userId, isBanned: false } },
      AND: [{ members: { some: { userId: ownerUserId, isBanned: false } } }],
    },
    select: { id: true },
  });
  return !!sharedConversation;
}

export async function canUserAccessUpload(prisma: PrismaClient, userId: number, rawPath: string | null | undefined) {
  const normalized = normalizeStoredUploadPath(rawPath);
  if (!normalized) return false;

  const [messageRef, scheduledRef, avatarRef, storyRef, highlightRef] = await Promise.all([
    prisma.message.findFirst({
      where: {
        fileUrl: normalized,
        isDeleted: false,
        conversation: { members: { some: { userId, isBanned: false } } },
      },
      select: { id: true },
    }),
    prisma.scheduledMessage.findFirst({
      where: {
        fileUrl: normalized,
        conversation: { members: { some: { userId, isBanned: false } } },
      },
      select: { id: true },
    }),
    prisma.user.findFirst({ where: { avatar: normalized }, select: { id: true } }),
    prisma.story.findFirst({ where: { mediaUrl: normalized, expiresAt: { gt: new Date() } }, select: { userId: true } }),
    prisma.storyHighlight.findFirst({ where: { cover: normalized }, select: { userId: true } }),
  ]);

  if (messageRef || scheduledRef || avatarRef) return true;
  if (storyRef) return canAccessStoryOwner(prisma, userId, storyRef.userId);
  if (highlightRef) return canAccessStoryOwner(prisma, userId, highlightRef.userId);
  return false;
}
