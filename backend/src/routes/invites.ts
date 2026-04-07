import { getPublicBaseUrl } from '../utils/config';
import { Router } from 'express';
import crypto from 'crypto';
import prisma from '../prisma';
import { authenticateToken } from '../middleware/auth';

const router = Router();

function generateCode(): string {
  return crypto.randomBytes(6).toString('base64url');
}

// Create invite link (admin only)
router.post('/:conversationId', authenticateToken, async (req: any, res) => {
  try {
    const convId = parseInt(req.params.conversationId);
    const membership = await prisma.conversationMember.findFirst({
      where: { conversationId: convId, userId: req.userId, role: 'admin' }
    });
    if (!membership) return res.status(403).json({ error: 'Admin only' });

    const { maxUses, expiresInHours } = req.body;
    const expiresAt = expiresInHours ? new Date(Date.now() + expiresInHours * 60 * 60 * 1000) : null;

    const link = await prisma.inviteLink.create({
      data: {
        code: generateCode(),
        conversationId: convId,
        createdById: req.userId,
        maxUses: maxUses || null,
        expiresAt
      }
    });
    res.json({ ...link, url: `${getPublicBaseUrl(req)}/join/${link.code}` });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Error' }); }
});

// Get invite links for a conversation
router.get('/conv/:conversationId', authenticateToken, async (req: any, res) => {
  try {
    const convId = parseInt(req.params.conversationId);
    const membership = await prisma.conversationMember.findFirst({
      where: { conversationId: convId, userId: req.userId }
    });
    if (!membership) return res.status(403).json({ error: 'Not a member' });

    const links = await prisma.inviteLink.findMany({
      where: { conversationId: convId, isActive: true },
      orderBy: { createdAt: 'desc' }
    });
    res.json(links.map(l => ({
      ...l,
      url: `${getPublicBaseUrl(req)}/join/${l.code}`,
      remainingUses: l.maxUses ? Math.max(0, l.maxUses - l.uses) : null,
      isExpired: !!(l.expiresAt && l.expiresAt < new Date())
    })));
  } catch (err) { res.status(500).json({ error: 'Error' }); }
});


// Revoke all invite links for a conversation (admin)
router.delete('/conv/:conversationId/revoke-all', authenticateToken, async (req: any, res) => {
  try {
    const convId = parseInt(req.params.conversationId);
    const membership = await prisma.conversationMember.findFirst({
      where: { conversationId: convId, userId: req.userId, role: 'admin' }
    });
    if (!membership) return res.status(403).json({ error: 'Admin only' });

    const result = await prisma.inviteLink.updateMany({
      where: { conversationId: convId, isActive: true },
      data: { isActive: false }
    });
    res.json({ success: true, revoked: result.count });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Error' }); }
});

// Join via invite code
router.post('/join/:code', authenticateToken, async (req: any, res) => {
  try {
    const { code } = req.params;
    const link = await prisma.inviteLink.findUnique({ where: { code } });
    if (!link || !link.isActive) return res.status(404).json({ error: 'Invalid or expired link' });
    if (link.expiresAt && link.expiresAt < new Date()) return res.status(400).json({ error: 'Link expired' });
    if (link.maxUses && link.uses >= link.maxUses) return res.status(400).json({ error: 'Link usage limit reached' });

    // Check if already a member
    const existing = await prisma.conversationMember.findFirst({
      where: { conversationId: link.conversationId, userId: req.userId }
    });
    if (existing) {
      const conv = await prisma.conversation.findUnique({
        where: { id: link.conversationId },
        include: { members: { include: { user: { select: { id: true, name: true, avatar: true } } } } }
      });
      return res.json({ alreadyMember: true, conversation: conv });
    }

    const convMeta = await prisma.conversation.findUnique({ where: { id: link.conversationId }, select: { id: true, requireApproval: true, name: true, isGroup: true, isChannel: true } });
    if (!convMeta) return res.status(404).json({ error: 'Conversation not found' });

    if (convMeta.requireApproval) {
      const existingReq = await prisma.joinRequest.findFirst({
        where: { conversationId: link.conversationId, userId: req.userId, status: 'pending' }
      });
      if (existingReq) return res.status(400).json({ error: 'Join request already pending' });

      await prisma.joinRequest.upsert({
        where: { conversationId_userId: { conversationId: link.conversationId, userId: req.userId } },
        update: { status: 'pending', handledAt: null, handledById: null },
        create: { conversationId: link.conversationId, userId: req.userId, status: 'pending' }
      });

      await prisma.inviteLink.update({ where: { id: link.id }, data: { uses: link.uses + 1 } });
      return res.json({ pendingApproval: true, message: 'Join request sent', conversationId: link.conversationId });
    }

    await prisma.conversationMember.create({
      data: { conversationId: link.conversationId, userId: req.userId }
    });

    await prisma.inviteLink.update({ where: { id: link.id }, data: { uses: link.uses + 1 } });

    const conv = await prisma.conversation.findUnique({
      where: { id: link.conversationId },
      include: { members: { include: { user: { select: { id: true, name: true, avatar: true } } } } }
    });
    res.json(conv);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Error' }); }
});

// Get invite info (public - for preview before joining)
router.get('/info/:code', async (req, res) => {
  try {
    const link = await prisma.inviteLink.findUnique({
      where: { code: req.params.code },
      include: {
        conversation: { select: { id: true, name: true, image: true, description: true, isGroup: true, isChannel: true, requireApproval: true, _count: { select: { members: true } } } }
      }
    });
    if (!link || !link.isActive) return res.status(404).json({ error: 'Invalid link' });
    if (link.expiresAt && link.expiresAt < new Date()) return res.status(400).json({ error: 'Expired' });
    res.json({
      conversation: link.conversation,
      memberCount: link.conversation._count.members,
      requireApproval: !!link.conversation.requireApproval,
      expiresAt: link.expiresAt,
      maxUses: link.maxUses,
      uses: link.uses,
      remainingUses: link.maxUses ? Math.max(0, link.maxUses - link.uses) : null
    });
  } catch (err) { res.status(500).json({ error: 'Error' }); }
});

// Deactivate invite link (admin)
router.delete('/:linkId', authenticateToken, async (req: any, res) => {
  try {
    const link = await prisma.inviteLink.findUnique({ where: { id: parseInt(req.params.linkId) } });
    if (!link) return res.status(404).json({ error: 'Not found' });
    const membership = await prisma.conversationMember.findFirst({
      where: { conversationId: link.conversationId, userId: req.userId, role: 'admin' }
    });
    if (!membership) return res.status(403).json({ error: 'Admin only' });
    await prisma.inviteLink.update({ where: { id: link.id }, data: { isActive: false } });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Error' }); }
});

export default router;
