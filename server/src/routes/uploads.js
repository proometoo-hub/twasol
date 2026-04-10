import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';
import { createSignedMediaUrl, encryptAndStoreMedia } from '../utils/media.js';

const router = express.Router();
router.use(requireAuth);

router.post('/', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file is required' });
  const media = encryptAndStoreMedia({ file: req.file, ownerUserId: req.user.id, kind: 'upload' });
  res.status(201).json({
    file: {
      id: media.mediaId,
      originalName: media.originalName,
      size: media.size,
      type: media.mimeType,
      url: createSignedMediaUrl({ mediaId: media.mediaId, viewerUserId: req.user.id }),
    },
  });
});

export default router;
