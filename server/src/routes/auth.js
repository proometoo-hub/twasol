import express from 'express';
import bcrypt from 'bcryptjs';
import db from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { signToken } from '../utils/auth.js';
import { sanitizeUser } from '../services/conversations.js';
import { createId, nowIso, normalizeString } from '../utils/helpers.js';
import { validatePasswordChange, validateRegisterPayload } from '../utils/validate.js';

const router = express.Router();

router.post('/register', async (req, res) => {
  const valid = validateRegisterPayload(req.body);
  if (valid.error) return res.status(400).json({ error: valid.error });

  const normalizedUsername = (valid.username || valid.displayName.toLowerCase().replace(/\s+/g, '_')).slice(0, 24);
  const existing = await db.prepare(`SELECT id FROM users WHERE phone = ? OR email = ? OR username = ?`).get(valid.phone || null, valid.email || null, normalizedUsername);
  if (existing) return res.status(409).json({ error: 'User already exists' });

  const passwordHash = await bcrypt.hash(valid.password, 10);
  const id = createId('usr');
  await db.prepare(`
    INSERT INTO users (
      id, phone, email, username, display_name, password_hash, bio, avatar_url, locale, theme,
      last_seen, is_admin, privacy_last_seen, privacy_status_views, privacy_read_receipts, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, '', NULL, 'ar', 'dark', ?, 0, 'contacts', 'contacts', 1, ?)
  `).run(id, valid.phone, valid.email, normalizedUsername, valid.displayName, passwordHash, nowIso(), nowIso());
  const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  res.status(201).json({ token: signToken({ userId: id }), user: sanitizeUser(user) });
});

router.post('/login', async (req, res) => {
  const identifier = normalizeString(req.body.identifier);
  const password = String(req.body.password || '');
  if (!identifier || !password) return res.status(400).json({ error: 'identifier and password are required' });

  const user = await db.prepare(`SELECT * FROM users WHERE phone = ? OR email = ? OR username = ? LIMIT 1`).get(identifier, identifier, identifier);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
  await db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').run(nowIso(), user.id);
  const fresh = await db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  res.json({ token: signToken({ userId: user.id }), user: sanitizeUser(fresh) });
});

router.get('/me', requireAuth, async (req, res) => res.json({ user: sanitizeUser(req.user) }));

router.put('/me', requireAuth, async (req, res) => {
  const payload = req.body || {};
  await db.prepare(`
    UPDATE users
    SET display_name = COALESCE(?, display_name),
        bio = COALESCE(?, bio),
        locale = COALESCE(?, locale),
        theme = COALESCE(?, theme),
        avatar_url = COALESCE(?, avatar_url),
        privacy_last_seen = COALESCE(?, privacy_last_seen),
        privacy_status_views = COALESCE(?, privacy_status_views),
        privacy_read_receipts = COALESCE(?, privacy_read_receipts)
    WHERE id = ?
  `).run(
    payload.displayName ?? null,
    payload.bio ?? null,
    payload.locale ?? null,
    payload.theme ?? null,
    payload.avatarUrl ?? null,
    payload.privacyLastSeen ?? null,
    payload.privacyStatusViews ?? null,
    payload.privacyReadReceipts === undefined ? null : Number(Boolean(payload.privacyReadReceipts)),
    req.user.id,
  );
  const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json({ user: sanitizeUser(user) });
});

router.post('/change-password', requireAuth, async (req, res) => {
  const valid = validatePasswordChange(req.body || {});
  if (valid.error) return res.status(400).json({ error: valid.error });
  const ok = await bcrypt.compare(valid.currentPassword, req.user.password_hash);
  if (!ok) return res.status(400).json({ error: 'Current password is incorrect' });
  const nextHash = await bcrypt.hash(valid.nextPassword, 10);
  await db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(nextHash, req.user.id);
  res.json({ success: true });
});

export default router;
