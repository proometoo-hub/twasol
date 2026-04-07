import fs from 'fs';
import path from 'path';
import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { uploadsDir } from '../middleware/upload';
import prisma from '../prisma';
import { canUserAccessUpload, normalizeStoredUploadPath } from '../utils/mediaAccess';

const router = Router();

router.get('/:filename', authenticateToken, async (req: any, res) => {
  try {
    const filename = path.basename(String(req.params.filename || ''));
    const normalized = normalizeStoredUploadPath(filename);
    if (!normalized) return res.status(400).json({ error: 'Invalid file path' });
    const allowed = await canUserAccessUpload(prisma, req.userId, normalized);
    if (!allowed) return res.status(403).json({ error: 'Access denied' });
    const fullPath = path.join(uploadsDir, filename);
    if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'File not found' });
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.sendFile(fullPath);
  } catch (err) {
    console.error('media fetch failed', err);
    res.status(500).json({ error: 'Media fetch failed' });
  }
});

export default router;
