import { Router } from 'express';
import prisma from '../prisma';
import { authenticateToken } from '../middleware/auth';
import { uploadFile, detectFileType } from '../middleware/upload';

const router = Router();

router.post('/create', authenticateToken, async (req: any, res) => {
  try {
    const { text, color, mediaUrl, type } = req.body;
    if (!text && !mediaUrl) return res.status(400).json({ error: 'Content required' });
    const story = await prisma.story.create({
      data: { userId: req.userId, text, color: color || '#005c4b', mediaUrl, type: type || 'text', expiresAt: new Date(Date.now() + 86400000) },
      include: { user: { select: { id: true, name: true, avatar: true } } }
    });
    res.json(story);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Error' }); }
});

router.post('/upload', authenticateToken, uploadFile.single('file'), async (req: any, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file' });
    res.json({ fileUrl: `/uploads/${req.file.filename}`, type: detectFileType(req.file.originalname) });
  } catch { res.status(500).json({ error: 'Upload failed' }); }
});

// React to a story
router.post('/:storyId/react', authenticateToken, async (req: any, res) => {
  try {
    const storyId = parseInt(req.params.storyId);
    const { emoji } = req.body;
    const existing = await prisma.storyReaction.findFirst({ where: { storyId, userId: req.userId } });
    if (existing) {
      await prisma.storyReaction.update({ where: { id: existing.id }, data: { emoji } });
    } else {
      await prisma.storyReaction.create({ data: { storyId, userId: req.userId, emoji } });
    }
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Error' }); }
});

router.get('/friends', authenticateToken, async (req: any, res) => {
  try {
    const myId = req.userId;
    const myConvs = await prisma.conversationMember.findMany({ where: { userId: myId }, select: { conversationId: true } });
    const friends = await prisma.conversationMember.findMany({
      where: { conversationId: { in: myConvs.map(c => c.conversationId) }, NOT: { userId: myId } }, select: { userId: true }
    });
    const allIds = [...new Set([...friends.map(f => f.userId), myId])];
    const stories = await prisma.story.findMany({
      where: { userId: { in: allIds }, expiresAt: { gt: new Date() } },
      include: { user: { select: { id: true, name: true, avatar: true } }, reactions: { include: { user: { select: { id: true, name: true } } } } },
      orderBy: { createdAt: 'desc' }
    });
    const grouped: Record<number, any> = {};
    for (const s of stories) {
      if (!grouped[s.userId]) grouped[s.userId] = { user: s.user, stories: [], isMine: s.userId === myId };
      grouped[s.userId].stories.push(s);
    }
    res.json(Object.values(grouped).sort((a: any, b: any) => (a.isMine ? -1 : b.isMine ? 1 : 0)));
  } catch { res.status(500).json({ error: 'Error' }); }
});

router.delete('/:id', authenticateToken, async (req: any, res) => {
  try {
    const story = await prisma.story.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!story || story.userId !== req.userId) return res.status(403).json({ error: 'Access denied' });
    await prisma.story.delete({ where: { id: story.id } });
    res.json({ success: true });
  } catch { res.status(500).json({ error: 'Error' }); }
});

export default router;
