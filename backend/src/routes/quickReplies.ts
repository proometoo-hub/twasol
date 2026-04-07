import { Router } from 'express';
import prisma from '../prisma';
import { authenticateToken } from '../middleware/auth';

const router = Router();

router.get('/', authenticateToken, async (req: any, res) => {
  try {
    const replies = await prisma.quickReply.findMany({ where: { userId: req.userId }, orderBy: { id: 'asc' } });
    res.json(replies);
  } catch { res.status(500).json({ error: 'Error' }); }
});

router.post('/', authenticateToken, async (req: any, res) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ error: 'Required' });
    const reply = await prisma.quickReply.create({ data: { text: text.trim(), userId: req.userId } });
    res.json(reply);
  } catch { res.status(500).json({ error: 'Error' }); }
});

router.delete('/:id', authenticateToken, async (req: any, res) => {
  try {
    const r = await prisma.quickReply.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!r || r.userId !== req.userId) return res.status(403).json({ error: 'Access denied' });
    await prisma.quickReply.delete({ where: { id: r.id } });
    res.json({ success: true });
  } catch { res.status(500).json({ error: 'Error' }); }
});

export default router;
