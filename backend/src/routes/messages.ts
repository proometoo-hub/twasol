import { Router } from 'express';
import prisma from '../prisma';
import { authenticateToken } from '../middleware/auth';
import { requireConversationMember, requireMessageAccess } from '../utils/authz';
import { checkSendPermission } from '../socket/permissionCheck';

const router = Router();

const msgInclude = {
  sender: { select: { id: true, name: true, avatar: true } },
  replyTo: { select: { id: true, text: true, senderId: true, type: true, fileName: true, sender: { select: { id: true, name: true } } } },
  reactions: { select: { id: true, emoji: true, userId: true, user: { select: { id: true, name: true } } } },
  readReceipts: { select: { userId: true, readAt: true } }
};

router.get('/:conversationId', authenticateToken, async (req: any, res) => {
  try {
    const cid = parseInt(req.params.conversationId);
    if (isNaN(cid)) return res.status(400).json({ error: 'Invalid' });
    const m = await prisma.conversationMember.findFirst({ where: { conversationId: cid, userId: req.userId, isBanned: false } });
    if (!m) return res.status(403).json({ error: 'Access denied' });
    const cursor = req.query.before ? parseInt(req.query.before as string) : undefined;
    const msgs = await prisma.message.findMany({
      where: { conversationId: cid, ...(cursor && { id: { lt: cursor } }) },
      orderBy: { createdAt: 'desc' }, take: 50, include: msgInclude
    });
    res.json(msgs.reverse());
  } catch (err) { console.error(err); res.status(500).json({ error: 'Error' }); }
});

router.get('/:conversationId/pinned', authenticateToken, async (req: any, res) => {
  try {
    const conversationId = parseInt(req.params.conversationId);
    if (!(await requireConversationMember(req.userId, conversationId))) return res.status(403).json({ error: 'Access denied' });
    const msgs = await prisma.message.findMany({
      where: { conversationId, isPinned: true, isDeleted: false },
      include: msgInclude, orderBy: { createdAt: 'desc' }
    });
    res.json(msgs);
  } catch { res.status(500).json({ error: 'Error' }); }
});

router.get('/:conversationId/search', authenticateToken, async (req: any, res) => {
  try {
    const conversationId = parseInt(req.params.conversationId);
    if (!(await requireConversationMember(req.userId, conversationId))) return res.status(403).json({ error: 'Access denied' });
    const q = (req.query.q as string || '').trim();
    if (!q) return res.json([]);
    const msgs = await prisma.message.findMany({
      where: {
        conversationId,
        isDeleted: false,
        OR: [
          { text: { contains: q } },
          { fileName: { contains: q } }
        ]
      },
      include: { sender: { select: { id: true, name: true, avatar: true } } },
      orderBy: { createdAt: 'desc' }, take: 30
    });
    res.json(msgs);
  } catch { res.status(500).json({ error: 'Error' }); }
});


router.post('/:conversationId', authenticateToken, async (req: any, res) => {
  try {
    const conversationId = parseInt(req.params.conversationId);
    if (Number.isNaN(conversationId)) return res.status(400).json({ error: 'Invalid conversation' });
    const { text, type, fileUrl, fileName, fileSize, replyToId, forwardedFrom, locationLat, locationLng, locationName, contactUserId, animation, encryptedKey } = req.body || {};
    if ((!String(text || '').trim() && !fileUrl && !locationLat && !contactUserId) || !conversationId) return res.status(400).json({ error: 'Missing content' });
    const perm = await checkSendPermission(prisma as any, req.userId, conversationId, type || 'text');
    if (!perm.allowed) return res.status(403).json({ error: perm.reason || 'Access denied' });
    const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
    const expiresAt = conv?.disappearAfter ? new Date(Date.now() + conv.disappearAfter * 1000) : null;
    const message = await prisma.message.create({
      data: {
        text: String(text || '').trim() || null,
        senderId: req.userId,
        conversationId,
        type: type || (locationLat ? 'location' : contactUserId ? 'contact' : 'text'),
        fileUrl,
        fileName,
        fileSize,
        replyToId: replyToId || null,
        forwardedFrom: forwardedFrom || null,
        linkPreview: text ? (String(text).match(/https?:\/\/[^\s]+/) || [])[0] || null : null,
        locationLat,
        locationLng,
        locationName,
        contactUserId,
        animation,
        encryptedKey,
        expiresAt,
      },
      include: msgInclude,
    });
    await prisma.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
    res.json(message);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error' });
  }
});

router.get('/unread/counts', authenticateToken, async (req: any, res) => {
  try {
    const memberships = await prisma.conversationMember.findMany({ where: { userId: req.userId, isBanned: false }, select: { conversationId: true } });
    const counts: Record<number, number> = {};
    for (const m of memberships) {
      const c = await prisma.message.count({ where: { conversationId: m.conversationId, senderId: { not: req.userId }, isRead: false } });
      if (c > 0) counts[m.conversationId] = c;
    }
    res.json(counts);
  } catch { res.status(500).json({ error: 'Error' }); }
});

// Get read receipts for a message (group detail)
router.get('/receipts/:messageId', authenticateToken, async (req: any, res) => {
  try {
    const message = await requireMessageAccess(req.userId, parseInt(req.params.messageId));
    if (!message) return res.status(403).json({ error: 'Access denied' });
    const receipts = await prisma.readReceipt.findMany({
      where: { messageId: parseInt(req.params.messageId) },
      select: { userId: true, readAt: true }
    });
    res.json(receipts);
  } catch { res.status(500).json({ error: 'Error' }); }
});

router.delete('/:messageId', authenticateToken, async (req: any, res) => {
  try {
    const msg = await prisma.message.findUnique({ where: { id: parseInt(req.params.messageId) } });
    if (!msg) return res.status(404).json({ error: 'Not found' });

    const isOwner = msg.senderId === req.userId;
    let isAdmin = false;
    if (!isOwner) {
      const membership = await prisma.conversationMember.findFirst({
        where: { conversationId: msg.conversationId, userId: req.userId, role: 'admin', isBanned: false }
      });
      isAdmin = !!membership;
    }

    if (!isOwner && !isAdmin) return res.status(403).json({ error: 'Access denied' });

    await prisma.message.update({
      where: { id: msg.id },
      data: {
        isDeleted: true,
        text: isAdmin && !isOwner ? 'تم حذف هذه الرسالة بواسطة الإدارة' : null,
        fileUrl: null,
        fileName: null,
        fileSize: null
      }
    });

    res.json({ success: true, deletedByAdmin: isAdmin && !isOwner });
  } catch { res.status(500).json({ error: 'Error' }); }
});

router.post('/:messageId/react', authenticateToken, async (req: any, res) => {
  try {
    const mid = parseInt(req.params.messageId);
    const { emoji } = req.body;
    const message = await requireMessageAccess(req.userId, mid);
    if (!message) return res.status(403).json({ error: 'Access denied' });
    if (!emoji) return res.status(400).json({ error: 'Required' });
    const existing = await prisma.reaction.findFirst({ where: { messageId: mid, userId: req.userId, emoji } });
    if (existing) { await prisma.reaction.delete({ where: { id: existing.id } }); return res.json({ removed: true }); }
    const r = await prisma.reaction.create({ data: { emoji, userId: req.userId, messageId: mid }, include: { user: { select: { id: true, name: true } } } });
    res.json(r);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Error' }); }
});

export default router;
