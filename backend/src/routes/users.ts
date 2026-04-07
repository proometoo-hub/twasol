import { Router } from 'express';
import prisma from '../prisma';
import { authenticateToken } from '../middleware/auth';
import { uploadAvatar, validateUploadedFile } from '../middleware/upload';
import { getAdminBootstrapInfo, isAdminUser } from '../utils/admin';

const router = Router();
const userSelect = { id: true, publicId: true, name: true, email: true, avatar: true, bio: true, phone: true, status: true, lastSeen: true, hideLastSeen: true, dndUntil: true, chatBg: true, themeName: true };

router.get('/search', authenticateToken, async (req: any, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json([]);
    const searchingEmail = q.includes('@');
    const users = await prisma.user.findMany({
      where: {
        id: { not: req.userId },
        OR: [
          { name: { contains: q } },
          ...(searchingEmail ? [{ email: { contains: q } }] : []),
          { publicId: { contains: q } },
        ],
      },
      select: { id: true, publicId: true, name: true, email: true, avatar: true, bio: true, status: true, lastSeen: true, hideLastSeen: true },
      take: 25,
    });
    res.json(users.map((u) => ({ ...u, email: searchingEmail ? u.email : undefined, lastSeen: u.hideLastSeen === 'nobody' ? u.lastSeen : null, hideLastSeen: undefined })));
  } catch (err) {
    console.error('user search failed', err);
    res.status(500).json({ error: 'Error' });
  }
});

router.get('/me', authenticateToken, async (req: any, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId }, select: userSelect });
    if (!user) return res.status(404).json({ error: 'Not found' });
    res.json(user);
  } catch {
    res.status(500).json({ error: 'Error' });
  }
});

router.get('/admin/bootstrap-info', authenticateToken, async (req: any, res) => {
  try {
    if (!(await isAdminUser(req.userId))) return res.status(403).json({ error: 'Admin only' });
    res.json(await getAdminBootstrapInfo());
  } catch {
    res.status(500).json({ error: 'Error' });
  }
});

router.put('/profile', authenticateToken, async (req: any, res) => {
  try {
    const { name, bio, avatar, phone } = req.body;
    const updated = await prisma.user.update({ where: { id: req.userId }, data: { ...(name && { name: name.trim() }), ...(bio !== undefined && { bio }), ...(avatar && { avatar }), ...(phone !== undefined && { phone }) }, select: userSelect });
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Error' });
  }
});

router.post('/avatar', authenticateToken, uploadAvatar.single('avatar'), async (req: any, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file' });
    await validateUploadedFile(req.file, 'avatar');
    const updated = await prisma.user.update({ where: { id: req.userId }, data: { avatar: `/uploads/${req.file.filename}` }, select: userSelect });
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Error' });
  }
});

router.get('/admin/stats', authenticateToken, async (req: any, res) => {
  try {
    if (!(await isAdminUser(req.userId))) return res.status(403).json({ error: 'Admin only' });

    const totalUsers = await prisma.user.count();
    const onlineUsers = await prisma.user.count({ where: { status: 'online' } });
    const totalMessages = await prisma.message.count();
    const todayMessages = await prisma.message.count({ where: { createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } } });
    const totalGroups = await prisma.conversation.count({ where: { isGroup: true } });
    const totalChannels = await prisma.conversation.count({ where: { isChannel: true } });
    const totalReports = await prisma.report.count({ where: { status: 'pending' } });
    const activeStories = await prisma.story.count({ where: { expiresAt: { gt: new Date() } } });
    const topGroups = await prisma.conversation.findMany({ where: { isGroup: true }, select: { id: true, name: true, _count: { select: { members: true, messages: true } } }, orderBy: { messages: { _count: 'desc' } }, take: 5 });
    res.json({ totalUsers, onlineUsers, totalMessages, todayMessages, totalGroups, totalChannels, totalReports, activeStories, topGroups });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error' });
  }
});

export default router;
