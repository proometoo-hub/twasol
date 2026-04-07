import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { uploadFile, detectFileType, validateUploadedFile } from '../middleware/upload';

const router = Router();

router.post('/', authenticateToken, uploadFile.single('file'), async (req: any, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file' });
    await validateUploadedFile(req.file, 'file');
    res.json({
      fileUrl: `/uploads/${req.file.filename}`,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      type: detectFileType(req.file.originalname, req.file.mimetype)
    });
  } catch (err: any) {
    console.error('Upload error:', err);
    res.status(400).json({ error: err?.message || 'Upload failed' });
  }
});

export default router;
