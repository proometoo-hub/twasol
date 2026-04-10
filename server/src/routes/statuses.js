import express from 'express';
import db from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';
import { createId, nowIso } from '../utils/helpers.js';
import { emitStatusUpdate } from '../services/socket.js';
import { createSignedMediaUrl, encryptAndStoreMedia } from '../utils/media.js';

const router = express.Router();
router.use(requireAuth);

const allowedFonts = new Set(['Cairo, sans-serif', 'Tahoma, sans-serif', 'Arial, sans-serif', 'Georgia, serif', 'Trebuchet MS, sans-serif']);
const allowedAlign = new Set(['left', 'center', 'right']);
const gradientPattern = /^(linear-gradient|radial-gradient)\(/i;
const hexPattern = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const rgbPattern = /^rgba?\([^)]+\)$/i;

const sanitizeColorLike = (value, fallback) => {
  const normalized = String(value || '').trim();
  if (!normalized) return fallback;
  if (hexPattern.test(normalized) || rgbPattern.test(normalized) || gradientPattern.test(normalized)) return normalized;
  return fallback;
};

const parseStatusStyle = (value) => {
  if (!value) return {};
  try {
    const raw = typeof value === 'string' ? JSON.parse(value) : value;
    return {
      presetId: String(raw?.presetId || 'midnight').slice(0, 40),
      background: sanitizeColorLike(raw?.background, 'linear-gradient(135deg, #0f172a 0%, #1d4ed8 52%, #0ea5e9 100%)'),
      textColor: sanitizeColorLike(raw?.textColor, '#ffffff'),
      overlay: sanitizeColorLike(raw?.overlay, 'linear-gradient(180deg, rgba(0,0,0,0.18), rgba(0,0,0,0.45))'),
      fontFamily: allowedFonts.has(raw?.fontFamily) ? raw.fontFamily : 'Cairo, sans-serif',
      fontSize: Math.max(20, Math.min(52, Number(raw?.fontSize || 34))),
      fontWeight: Math.max(500, Math.min(800, Number(raw?.fontWeight || 700))),
      textAlign: allowedAlign.has(raw?.textAlign) ? raw.textAlign : 'center',
      textShadow: Boolean(raw?.textShadow),
    };
  } catch {
    return {};
  }
};

const parseJson = (value, fallback = {}) => {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const statusRowQuery = `
  SELECT s.*, u.display_name AS "displayName", u.avatar_url AS "avatarUrl",
    (SELECT COUNT(*)::int FROM status_views sv WHERE sv.status_id = s.id) AS views_count,
    EXISTS(SELECT 1 FROM status_views sv WHERE sv.status_id = s.id AND sv.viewer_id = ?) AS viewer_seen,
    EXISTS(SELECT 1 FROM status_mutes sm WHERE sm.user_id = ? AND sm.muted_user_id = s.user_id) AS is_muted
  FROM statuses s
  JOIN users u ON u.id = s.user_id
`;

const sanitizeStatus = (row, viewerId) => ({
  id: row.id,
  userId: row.user_id,
  displayName: row.displayName,
  avatarUrl: row.avatarUrl,
  type: row.type,
  text: row.text,
  mediaUrl: row.media_id
    ? createSignedMediaUrl({ mediaId: row.media_id, viewerUserId: viewerId })
    : (row.media_url?.startsWith('/uploads/') ? createSignedMediaUrl({ legacy: row.media_url.replace('/uploads/', ''), viewerUserId: viewerId }) : row.media_url),
  mediaMime: row.media_mime || null,
  createdAt: row.created_at,
  expiresAt: row.expires_at,
  viewsCount: row.views_count || 0,
  viewed: Boolean(row.viewer_seen),
  muted: Boolean(row.is_muted),
  isMine: row.user_id === viewerId,
  style: parseJson(row.style_json, {}),
});

const getStatusRowForViewer = (statusId, viewerId) => db.prepare(`${statusRowQuery} WHERE s.id = ?`).get(viewerId, viewerId, statusId);

router.get('/', async (req, res) => {
  const statuses = await db.prepare(`${statusRowQuery}
    WHERE s.expires_at > ?
      AND NOT EXISTS (SELECT 1 FROM status_mutes sm WHERE sm.user_id = ? AND sm.muted_user_id = s.user_id)
    ORDER BY s.created_at DESC
  `).all(req.user.id, req.user.id, nowIso(), req.user.id);
  res.json({ statuses: statuses.map((row) => sanitizeStatus(row, req.user.id)) });
});

router.post('/', upload.single('file'), async (req, res) => {
  const type = req.body.type || (req.file ? 'media' : 'text');
  const text = String(req.body.text || '').trim();
  if (!text && !req.file) return res.status(400).json({ error: 'Status content is required' });

  const style = type === 'text' ? parseStatusStyle(req.body.style) : {};
  const media = req.file ? await encryptAndStoreMedia({ file: req.file, ownerUserId: req.user.id, kind: 'status' }) : null;
  const id = createId('status');
  await db.prepare(`
    INSERT INTO statuses (id, user_id, type, text, media_url, media_id, media_mime, style_json, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    req.user.id,
    type,
    text,
    null,
    media?.mediaId || null,
    media?.mimeType || null,
    JSON.stringify(style),
    new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    nowIso(),
  );
  const row = await getStatusRowForViewer(id, req.user.id);
  const status = sanitizeStatus(row, req.user.id);
  emitStatusUpdate({ type: 'created', status, actorUserId: req.user.id });
  res.status(201).json({ status });
});

router.post('/:statusId/view', async (req, res) => {
  const ownerRow = await db.prepare('SELECT user_id FROM statuses WHERE id = ?').get(req.params.statusId);
  await db.prepare(`INSERT OR REPLACE INTO status_views (status_id, viewer_id, viewed_at) VALUES (?, ?, ?)`).run(req.params.statusId, req.user.id, nowIso());
  emitStatusUpdate({ type: 'viewed', statusId: req.params.statusId, actorUserId: req.user.id, ownerUserId: ownerRow?.user_id || null });
  res.json({ success: true });
});

router.post('/mute/:userId', async (req, res) => {
  await db.prepare(`INSERT OR IGNORE INTO status_mutes (user_id, muted_user_id, created_at) VALUES (?, ?, ?)`).run(req.user.id, req.params.userId, nowIso());
  emitStatusUpdate({ type: 'muted', actorUserId: req.user.id, targetUserId: req.params.userId });
  res.json({ success: true });
});

router.delete('/mute/:userId', async (req, res) => {
  await db.prepare('DELETE FROM status_mutes WHERE user_id = ? AND muted_user_id = ?').run(req.user.id, req.params.userId);
  emitStatusUpdate({ type: 'unmuted', actorUserId: req.user.id, targetUserId: req.params.userId });
  res.json({ success: true });
});

router.delete('/:statusId', async (req, res) => {
  await db.prepare('DELETE FROM statuses WHERE id = ? AND user_id = ?').run(req.params.statusId, req.user.id);
  emitStatusUpdate({ type: 'deleted', statusId: req.params.statusId, actorUserId: req.user.id });
  res.json({ success: true });
});

export default router;
