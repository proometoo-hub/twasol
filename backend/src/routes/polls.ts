import { Router } from 'express';
import prisma from '../prisma';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Create poll
router.post('/:conversationId', authenticateToken, async (req: any, res) => {
  try {
    const convId = parseInt(req.params.conversationId);
    const { question, options, isAnonymous, multiChoice, endsInHours } = req.body;
    if (!question || !options || options.length < 2) return res.status(400).json({ error: 'Need question + 2 options min' });
    const poll = await prisma.poll.create({
      data: {
        question, conversationId: convId, createdById: req.userId,
        isAnonymous: !!isAnonymous, multiChoice: !!multiChoice,
        endsAt: endsInHours ? new Date(Date.now() + endsInHours * 3600000) : null,
        options: { create: options.map((text: string) => ({ text })) }
      },
      include: { options: { include: { votes: true } } }
    });
    res.json(poll);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Error' }); }
});

// Vote
router.post('/:pollId/vote', authenticateToken, async (req: any, res) => {
  try {
    const pollId = parseInt(req.params.pollId);
    const { optionId } = req.body;
    const poll = await prisma.poll.findUnique({ where: { id: pollId } });
    if (!poll) return res.status(404).json({ error: 'Not found' });
    if (poll.endsAt && poll.endsAt < new Date()) return res.status(400).json({ error: 'Poll ended' });
    if (!poll.multiChoice) {
      await prisma.pollVote.deleteMany({ where: { userId: req.userId, option: { pollId } } });
    }
    const existing = await prisma.pollVote.findFirst({ where: { userId: req.userId, optionId } });
    if (existing) {
      await prisma.pollVote.delete({ where: { id: existing.id } });
    } else {
      await prisma.pollVote.create({ data: { userId: req.userId, optionId } });
    }
    const updated = await prisma.poll.findUnique({
      where: { id: pollId },
      include: { options: { include: { votes: { include: { user: { select: { id: true, name: true } } } } } } }
    });
    res.json(updated);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Error' }); }
});

// Get poll
router.get('/:pollId', authenticateToken, async (req: any, res) => {
  try {
    const poll = await prisma.poll.findUnique({
      where: { id: parseInt(req.params.pollId) },
      include: { options: { include: { votes: { include: { user: { select: { id: true, name: true } } } } } } }
    });
    if (!poll) return res.status(404).json({ error: 'Not found' });
    res.json(poll);
  } catch { res.status(500).json({ error: 'Error' }); }
});

// Get polls for conversation
router.get('/conv/:conversationId', authenticateToken, async (req: any, res) => {
  try {
    const polls = await prisma.poll.findMany({
      where: { conversationId: parseInt(req.params.conversationId) },
      include: { options: { include: { votes: true } } },
      orderBy: { createdAt: 'desc' }
    });
    res.json(polls);
  } catch { res.status(500).json({ error: 'Error' }); }
});

export default router;
