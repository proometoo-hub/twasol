import { Router } from 'express';
import prisma from '../prisma';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Block a user
router.post('/:targetId', authenticateToken, async (req: any, res) => {
  try {
    const targetId = parseInt(req.params.targetId);
    if (targetId === req.userId) return res.status(400).json({ error: 'Cannot block yourself' });
    const target = await prisma.user.findUnique({ where: { id: targetId } });
    if (!target) return res.status(404).json({ error: 'User not found' });
    const existing = await prisma.block.findFirst({ where: { userId: req.userId, blockedId: targetId } });
    if (existing) return res.status(400).json({ error: 'Already blocked' });
    await prisma.block.create({ data: { userId: req.userId, blockedId: targetId } });
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Error' }); }
});

// Unblock a user
router.delete('/:targetId', authenticateToken, async (req: any, res) => {
  try {
    const targetId = parseInt(req.params.targetId);
    const block = await prisma.block.findFirst({ where: { userId: req.userId, blockedId: targetId } });
    if (!block) return res.status(404).json({ error: 'Not blocked' });
    await prisma.block.delete({ where: { id: block.id } });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Error' }); }
});

// Get my blocked users list
router.get('/', authenticateToken, async (req: any, res) => {
  try {
    const blocks = await prisma.block.findMany({
      where: { userId: req.userId },
      include: { blocked: { select: { id: true, name: true, avatar: true, bio: true } } },
      orderBy: { createdAt: 'desc' }
    });
    res.json(blocks.map(b => ({ ...b.blocked, blockedAt: b.createdAt })));
  } catch (err) { res.status(500).json({ error: 'Error' }); }
});

// Check if user is blocked
router.get('/check/:targetId', authenticateToken, async (req: any, res) => {
  try {
    const targetId = parseInt(req.params.targetId);
    const blocked = await prisma.block.findFirst({ where: { userId: req.userId, blockedId: targetId } });
    const blockedBy = await prisma.block.findFirst({ where: { userId: targetId, blockedId: req.userId } });
    res.json({ blocked: !!blocked, blockedBy: !!blockedBy });
  } catch (err) { res.status(500).json({ error: 'Error' }); }
});

export default router;
