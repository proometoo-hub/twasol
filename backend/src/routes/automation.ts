import { Router } from 'express';
import prisma from '../prisma';
import { authenticateToken } from '../middleware/auth';
import { requireConversationAdmin } from '../utils/authz';
import { generateWebhookSecret } from '../utils/sessionToken';

const router = Router();

function sanitizeWebhook(wh: any) {
  const events = typeof wh.events === 'string' ? (() => { try { return JSON.parse(wh.events); } catch { return []; } })() : wh.events;
  return {
    id: wh.id,
    name: wh.name,
    url: wh.url,
    conversationId: wh.conversationId,
    createdAt: wh.createdAt,
    updatedAt: wh.updatedAt,
    events,
    hasSecret: !!wh.secret,
    secretPreview: wh.secret ? `••••${String(wh.secret).slice(-6)}` : null,
  };
}

router.post('/bots', authenticateToken, async (req: any, res) => { try { const { name, trigger, response } = req.body; if (!name || !trigger || !response) return res.status(400).json({ error: 'All fields required' }); const bot = await prisma.bot.create({ data: { name, trigger, response, ownerId: req.userId } }); res.json(bot); } catch { res.status(500).json({ error: 'Error' }); } });
router.get('/bots', authenticateToken, async (req: any, res) => { try { const bots = await prisma.bot.findMany({ where: { ownerId: req.userId }, orderBy: { createdAt: 'desc' } }); res.json(bots); } catch { res.status(500).json({ error: 'Error' }); } });
router.delete('/bots/:id', authenticateToken, async (req: any, res) => { try { const bot = await prisma.bot.findUnique({ where: { id: parseInt(req.params.id) } }); if (!bot || bot.ownerId !== req.userId) return res.status(403).json({ error: 'Access denied' }); await prisma.bot.delete({ where: { id: bot.id } }); res.json({ success: true }); } catch { res.status(500).json({ error: 'Error' }); } });
router.put('/bots/:id', authenticateToken, async (req: any, res) => { try { const { name, trigger, response, isActive } = req.body; const bot = await prisma.bot.findUnique({ where: { id: parseInt(req.params.id) } }); if (!bot || bot.ownerId !== req.userId) return res.status(403).json({ error: 'Access denied' }); const updated = await prisma.bot.update({ where: { id: bot.id }, data: { ...(name && { name }), ...(trigger && { trigger }), ...(response && { response }), ...(isActive !== undefined && { isActive }) } }); res.json(updated); } catch { res.status(500).json({ error: 'Error' }); } });

router.post('/webhooks/:convId', authenticateToken, async (req: any, res) => {
  try {
    const convId = parseInt(req.params.convId);
    if (!(await requireConversationAdmin(req.userId, convId))) return res.status(403).json({ error: 'Admin only' });
    const { name, url, events } = req.body;
    const wh = await prisma.webhook.create({ data: { name, url, events: JSON.stringify(events || []), conversationId: convId, secret: generateWebhookSecret(24) } });
    res.json(sanitizeWebhook(wh));
  } catch { res.status(500).json({ error: 'Error' }); }
});

router.get('/webhooks/:convId', authenticateToken, async (req: any, res) => {
  try {
    const convId = parseInt(req.params.convId);
    if (!(await requireConversationAdmin(req.userId, convId))) return res.status(403).json({ error: 'Admin only' });
    const whs = await prisma.webhook.findMany({ where: { conversationId: convId }, orderBy: { createdAt: 'desc' } });
    res.json(whs.map(sanitizeWebhook));
  } catch { res.status(500).json({ error: 'Error' }); }
});

router.delete('/webhooks/del/:id', authenticateToken, async (req: any, res) => { try { const wh = await prisma.webhook.findUnique({ where: { id: parseInt(req.params.id) } }); if (!wh) return res.status(404).json({ error: 'Not found' }); if (!(await requireConversationAdmin(req.userId, wh.conversationId))) return res.status(403).json({ error: 'Admin only' }); await prisma.webhook.delete({ where: { id: wh.id } }); res.json({ success: true }); } catch { res.status(500).json({ error: 'Error' }); } });
router.post('/broadcasts', authenticateToken, async (req: any, res) => { try { const { name, userIds } = req.body; const list = await prisma.broadcastList.create({ data: { name, userIds: JSON.stringify(userIds), ownerId: req.userId } }); res.json(list); } catch { res.status(500).json({ error: 'Error' }); } });
router.get('/broadcasts', authenticateToken, async (req: any, res) => { try { const lists = await prisma.broadcastList.findMany({ where: { ownerId: req.userId } }); res.json(lists.map(l => ({ ...l, userIds: JSON.parse(l.userIds) }))); } catch { res.status(500).json({ error: 'Error' }); } });
router.delete('/broadcasts/:id', authenticateToken, async (req: any, res) => { try { const list = await prisma.broadcastList.findUnique({ where: { id: parseInt(req.params.id) } }); if (!list || list.ownerId !== req.userId) return res.status(403).json({ error: 'Access denied' }); await prisma.broadcastList.delete({ where: { id: list.id } }); res.json({ success: true }); } catch { res.status(500).json({ error: 'Error' }); } });
export default router;
