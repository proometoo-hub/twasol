import express from 'express';
import db from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { sanitizeUser } from '../services/conversations.js';
import { nowIso } from '../utils/helpers.js';

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const query = `%${String(req.query.q || '').trim()}%`;
  const rows = db.prepare(`
    SELECT * FROM users
    WHERE id != ?
      AND (display_name LIKE ? OR username LIKE ? OR COALESCE(email, '') LIKE ? OR COALESCE(phone, '') LIKE ?)
    ORDER BY display_name ASC
    LIMIT 30
  `).all(req.user.id, query, query, query, query).map(sanitizeUser);
  res.json({ users: rows });
});

router.get('/suggested', (req, res) => {
  const rows = db.prepare(`SELECT * FROM users WHERE id != ? ORDER BY last_seen DESC, created_at DESC LIMIT 12`).all(req.user.id).map(sanitizeUser);
  res.json({ users: rows });
});

router.post('/block/:userId', (req, res) => {
  if (req.params.userId === req.user.id) return res.status(400).json({ error: 'Cannot block yourself' });
  db.prepare(`INSERT OR IGNORE INTO blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)`)
    .run(req.user.id, req.params.userId, nowIso());
  res.json({ success: true });
});

router.delete('/block/:userId', (req, res) => {
  db.prepare('DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?').run(req.user.id, req.params.userId);
  res.json({ success: true });
});

router.get('/blocked', (req, res) => {
  const users = db.prepare(`
    SELECT u.*
    FROM blocks b JOIN users u ON u.id = b.blocked_id
    WHERE b.blocker_id = ?
    ORDER BY b.created_at DESC
  `).all(req.user.id).map(sanitizeUser);
  res.json({ users });
});

export default router;
