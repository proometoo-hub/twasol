import express from 'express';
import db from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { sanitizeUser } from '../services/conversations.js';
import { nowIso } from '../utils/helpers.js';

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const query = `%${String(req.query.q || '').trim()}%`;
  const rows = await db.prepare(`
    SELECT * FROM users
    WHERE id != ?
      AND (display_name ILIKE ? OR username ILIKE ? OR COALESCE(email, '') ILIKE ? OR COALESCE(phone, '') ILIKE ?)
    ORDER BY display_name ASC
    LIMIT 30
  `).all(req.user.id, query, query, query, query);
  res.json({ users: rows.map(sanitizeUser) });
});

router.get('/suggested', async (req, res) => {
  const rows = await db.prepare(`SELECT * FROM users WHERE id != ? ORDER BY last_seen DESC NULLS LAST, created_at DESC LIMIT 12`).all(req.user.id);
  res.json({ users: rows.map(sanitizeUser) });
});

router.post('/block/:userId', async (req, res) => {
  if (req.params.userId === req.user.id) return res.status(400).json({ error: 'Cannot block yourself' });
  await db.prepare(`INSERT OR IGNORE INTO blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)`)
    .run(req.user.id, req.params.userId, nowIso());
  res.json({ success: true });
});

router.delete('/block/:userId', async (req, res) => {
  await db.prepare('DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?').run(req.user.id, req.params.userId);
  res.json({ success: true });
});

router.get('/blocked', async (req, res) => {
  const users = await db.prepare(`
    SELECT u.*
    FROM blocks b JOIN users u ON u.id = b.blocked_id
    WHERE b.blocker_id = ?
    ORDER BY b.created_at DESC
  `).all(req.user.id);
  res.json({ users: users.map(sanitizeUser) });
});

export default router;
