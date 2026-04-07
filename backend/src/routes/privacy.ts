import { Router } from 'express';
import prisma from '../prisma';
import { authenticateToken } from '../middleware/auth';
import { hashLockedPin, normalizeLockedPin, verifyLockedPin } from '../utils/pin';

const router = Router();

async function selectPrivacy(userId: number) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { hideLastSeen: true, dndUntil: true, chatBg: true, themeName: true, lockedPin: true }
  });
  return user ? {
    hideLastSeen: user.hideLastSeen,
    dndUntil: user.dndUntil,
    chatBg: user.chatBg,
    themeName: user.themeName,
    hasLockedPin: !!user.lockedPin,
  } : null;
}

router.get('/', authenticateToken, async (req: any, res) => {
  try {
    res.json(await selectPrivacy(req.userId));
  } catch { res.status(500).json({ error: 'Error' }); }
});

router.put('/', authenticateToken, async (req: any, res) => {
  try {
    const { hideLastSeen, dndUntil, chatBg, themeName } = req.body;
    const data: any = {
      ...(hideLastSeen !== undefined && { hideLastSeen }),
      ...(dndUntil !== undefined && { dndUntil: dndUntil ? new Date(dndUntil) : null }),
      ...(chatBg !== undefined && { chatBg }),
      ...(themeName !== undefined && { themeName }),
    };
    if (Object.prototype.hasOwnProperty.call(req.body, 'lockedPin')) {
      const normalizedPin = normalizeLockedPin(req.body.lockedPin);
      data.lockedPin = normalizedPin ? await hashLockedPin(normalizedPin) : null;
    }
    await prisma.user.update({ where: { id: req.userId }, data });
    res.json(await selectPrivacy(req.userId));
  } catch (error: any) {
    const message = error?.message || 'Error';
    const status = /PIN/i.test(message) ? 400 : 500;
    res.status(status).json({ error: message });
  }
});

router.post('/verify-pin', authenticateToken, async (req: any, res) => {
  try {
    const pin = normalizeLockedPin(req.body?.lockedPin);
    if (!pin) return res.status(400).json({ error: 'PIN required' });
    const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { lockedPin: true } });
    const valid = await verifyLockedPin(pin, user?.lockedPin);
    res.json({ valid });
  } catch (error: any) {
    res.status(400).json({ error: error?.message || 'Error' });
  }
});

export default router;
