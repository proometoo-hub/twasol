import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { registerPushToken, unregisterPushToken } from '../utils/pushStore';

const router = Router();

router.post('/token', authenticateToken, async (req: any, res) => {
  try {
    const expoPushToken = String(req.body?.expoPushToken || '').trim();
    if (!expoPushToken) return res.status(400).json({ error: 'expoPushToken is required' });
    await registerPushToken(req.userId, {
      token: expoPushToken,
      platform: req.body?.platform || 'android',
      deviceName: req.body?.deviceName || '',
      appVersion: req.body?.appVersion || '',
      updatedAt: new Date().toISOString(),
    });
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to register push token' });
  }
});

router.delete('/token', authenticateToken, async (req: any, res) => {
  try {
    const expoPushToken = String(req.body?.expoPushToken || '').trim();
    await unregisterPushToken(req.userId, expoPushToken || undefined);
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to unregister push token' });
  }
});

export default router;
