import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { canUserAccessMedia, decryptMediaBuffer, verifyMediaToken } from '../utils/media.js';
import { config } from '../config.js';

const router = express.Router();
const uploadsRoot = path.resolve(config.rootDir, 'uploads');

const applyRange = (req, res, buffer, mimeType, downloadName = null) => {
  const total = buffer.length;
  const range = req.headers.range;
  if (downloadName) res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(downloadName)}"`);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', mimeType || 'application/octet-stream');
  if (range && /^bytes=\d*-\d*$/.test(range)) {
    const [rawStart, rawEnd] = range.replace('bytes=', '').split('-');
    const start = rawStart ? Number(rawStart) : 0;
    const end = rawEnd ? Number(rawEnd) : total - 1;
    const safeStart = Math.max(0, Math.min(start, total - 1));
    const safeEnd = Math.max(safeStart, Math.min(end, total - 1));
    res.status(206);
    res.setHeader('Content-Range', `bytes ${safeStart}-${safeEnd}/${total}`);
    res.setHeader('Content-Length', safeEnd - safeStart + 1);
    return res.end(buffer.subarray(safeStart, safeEnd + 1));
  }
  res.setHeader('Content-Length', total);
  return res.end(buffer);
};

router.get('/legacy/:filename', async (req, res) => {
  const payload = verifyMediaToken(req.query.token);
  const filename = decodeURIComponent(req.params.filename);
  if (!payload || payload.legacy !== filename) return res.status(403).json({ error: 'Invalid media token' });
  if (!await canUserAccessMedia({ userId: payload.userId, legacy: filename })) return res.status(403).json({ error: 'Forbidden' });
  const filePath = path.join(uploadsRoot, filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Media not found' });
  const buffer = fs.readFileSync(filePath);
  const ext = path.extname(filename).toLowerCase();
  const type = ['.png','.jpg','.jpeg','.webp','.gif'].includes(ext)
    ? `image/${ext.replace('.','').replace('jpg','jpeg')}`
    : (['.mp4','.webm','.ogg','.mov'].includes(ext) ? `video/${ext.replace('.','').replace('mov','quicktime')}` : (['.mp3','.wav','.m4a','.ogg'].includes(ext) ? 'audio/mpeg' : 'application/octet-stream'));
  return applyRange(req, res, buffer, type, filename);
});

router.get('/:mediaId', async (req, res) => {
  const payload = verifyMediaToken(req.query.token);
  if (!payload || payload.mediaId !== req.params.mediaId) return res.status(403).json({ error: 'Invalid media token' });
  if (!await canUserAccessMedia({ userId: payload.userId, mediaId: req.params.mediaId })) return res.status(403).json({ error: 'Forbidden' });
  const decrypted = await decryptMediaBuffer(req.params.mediaId);
  if (!decrypted) return res.status(404).json({ error: 'Media not found' });
  return applyRange(req, res, decrypted.buffer, decrypted.record.mime_type, decrypted.record.original_name);
});

export default router;
