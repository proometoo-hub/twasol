import { Router } from 'express';
import prisma from '../prisma';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Create scheduled message
router.post('/', authenticateToken, async (req: any, res) => {
  try {
    const { text, type, fileUrl, fileName, conversationId, scheduledAt } = req.body;
    if (!scheduledAt || !conversationId) return res.status(400).json({ error: 'Required fields' });
    if (new Date(scheduledAt) <= new Date()) return res.status(400).json({ error: 'Must be in future' });
    const msg = await prisma.scheduledMessage.create({
      data: { text, type: type || 'text', fileUrl, fileName, conversationId, senderId: req.userId, scheduledAt: new Date(scheduledAt) }
    });
    res.json(msg);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Error' }); }
});

// Get my scheduled messages
router.get('/', authenticateToken, async (req: any, res) => {
  try {
    const msgs = await prisma.scheduledMessage.findMany({
      where: { senderId: req.userId, isSent: false },
      include: { conversation: { select: { id: true, name: true } } },
      orderBy: { scheduledAt: 'asc' }
    });
    res.json(msgs);
  } catch { res.status(500).json({ error: 'Error' }); }
});

// Delete scheduled message
router.delete('/:id', authenticateToken, async (req: any, res) => {
  try {
    const msg = await prisma.scheduledMessage.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!msg || msg.senderId !== req.userId) return res.status(403).json({ error: 'Access denied' });
    await prisma.scheduledMessage.delete({ where: { id: msg.id } });
    res.json({ success: true });
  } catch { res.status(500).json({ error: 'Error' }); }
});

export default router;
