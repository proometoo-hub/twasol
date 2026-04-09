import multer from 'multer';
import { config } from '../config.js';

const storage = multer.memoryStorage();
const allowedMime = [
  'image/',
  'video/',
  'audio/',
  'application/pdf',
  'text/plain',
  'application/zip',
  'application/x-zip-compressed',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];
const fileFilter = (_req, file, cb) => {
  const ok = allowedMime.some((allowed) => file.mimetype.startsWith(allowed));
  if (!ok) return cb(new Error('Unsupported file type'));
  cb(null, true);
};
export const upload = multer({ storage, fileFilter, limits: { fileSize: config.maxUploadMb * 1024 * 1024 } });
export default upload;
