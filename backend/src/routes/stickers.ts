import { Router } from 'express';
import prisma from '../prisma';
import { authenticateToken } from '../middleware/auth';
import { isAdminUser } from '../utils/admin';

const router = Router();

router.get('/packs', authenticateToken, async (_req: any, res) => {
  try {
    const packs = await prisma.stickerPack.findMany({ include: { stickers: true } });
    res.json(packs);
  } catch { res.status(500).json({ error: 'Error' }); }
});

router.get('/packs/:packId', authenticateToken, async (req: any, res) => {
  try {
    const pack = await prisma.stickerPack.findUnique({ where: { id: parseInt(req.params.packId) }, include: { stickers: true } });
    if (!pack) return res.status(404).json({ error: 'Not found' });
    res.json(pack);
  } catch { res.status(500).json({ error: 'Error' }); }
});

router.post('/seed', authenticateToken, async (req: any, res) => {
  try {
    if (!(await isAdminUser(req.userId))) return res.status(403).json({ error: 'Admin only' });
    const existing = await prisma.stickerPack.count();
    if (existing > 0) return res.json({ message: 'Already seeded' });
    const emojis = ['😀','😂','🤣','😍','🥰','😎','🤩','😢','😡','🤯','👍','👎','❤️','🔥','💯','🎉','🙏','💪','👋','🤝'];
    await prisma.stickerPack.create({
      data: {
        name: 'الأساسية',
        stickers: { create: emojis.map((e) => ({ url: '', emoji: e })) }
      }
    });
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Error' }); }
});

export default router;
