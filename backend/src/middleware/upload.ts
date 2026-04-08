import multer from 'multer';
import path from 'path';
import fs from 'fs';
import fsPromises from 'fs/promises';

export const uploadsDir = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const allowedAvatarMime = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const allowedFileMime = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'video/mp4', 'video/webm', 'video/quicktime',
  'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/webm', 'audio/ogg', 'audio/wav', 'audio/aac',
  'application/pdf', 'application/zip', 'application/x-zip-compressed', 'text/plain',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const safeExt = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '').slice(0, 10);
    cb(null, `${unique}${safeExt}`);
  }
});

function fileFilterFactory(allowed: Set<string>) {
  return (_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    if (!allowed.has(file.mimetype)) return cb(new Error('Unsupported file type'));
    cb(null, true);
  };
}

export const uploadFile = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 }, fileFilter: fileFilterFactory(allowedFileMime) });
export const uploadAvatar = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: fileFilterFactory(allowedAvatarMime) });

export function detectFileType(originalname: string, mimetype?: string): string {
  const ext = path.extname(originalname).toLowerCase();
  const mt = (mimetype || '').toLowerCase();
  if (mt.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|bmp|ico|tiff)$/i.test(ext)) return 'image';
  if (mt.startsWith('video/') || /\.(mp4|mov|avi|webm|mkv|flv|wmv|m4v|3gp)$/i.test(ext)) return 'video';
  if (mt.startsWith('audio/') || /\.(ogg|webm|mp3|wav|m4a|aac|flac|wma)$/i.test(ext)) return 'voice';
  return 'file';
}

function startsWith(buf: Buffer, bytes: number[]) {
  return bytes.every((b, index) => buf[index] === b);
}

function isPlainText(buf: Buffer) {
  const slice = buf.subarray(0, 256);
  let printable = 0;
  for (const byte of slice) {
    if (byte === 9 || byte === 10 || byte === 13 || (byte >= 32 && byte <= 126)) printable += 1;
  }
  return slice.length > 0 && printable / slice.length > 0.9;
}

export async function validateUploadedFile(file?: Express.Multer.File, mode: 'avatar' | 'file' = 'file') {
  if (!file?.path) return;
  const fd = await fsPromises.open(file.path, 'r');
  try {
    const probe = Buffer.alloc(32);
    await fd.read(probe, 0, 32, 0);
    const mime = String(file.mimetype || '').toLowerCase();
    const ext = path.extname(file.originalname).toLowerCase();

    let ok = false;
    if (mode === 'avatar' || mime.startsWith('image/')) {
      ok = startsWith(probe, [0xff, 0xd8, 0xff]) || startsWith(probe, [0x89, 0x50, 0x4e, 0x47]) || startsWith(probe, [0x47, 0x49, 0x46, 0x38]) || probe.toString('ascii', 0, 4) === 'RIFF';
    } else if (mime === 'application/pdf') {
      ok = probe.toString('ascii', 0, 4) === '%PDF';
    } else if (mime.includes('zip') || /\.(docx|xlsx|zip)$/i.test(ext)) {
      ok = startsWith(probe, [0x50, 0x4b, 0x03, 0x04]);
    } else if (mime.startsWith('audio/')) {
      ok = probe.toString('ascii', 0, 4) === 'RIFF'
        || probe.toString('ascii', 0, 3) === 'ID3'
        || startsWith(probe, [0xff, 0xfb])
        || startsWith(probe, [0xff, 0xf1])
        || startsWith(probe, [0xff, 0xf9])
        || startsWith(probe, [0x4f, 0x67, 0x67, 0x53])
        || startsWith(probe, [0x1a, 0x45, 0xdf, 0xa3])
        || probe.toString('ascii', 4, 8) === 'ftyp';
    } else if (mime.startsWith('video/')) {
      ok = probe.toString('ascii', 4, 8) === 'ftyp' || startsWith(probe, [0x1a, 0x45, 0xdf, 0xa3]);
    } else if (mime === 'text/plain') {
      ok = isPlainText(probe);
    } else {
      ok = true;
    }

    if (!ok) throw new Error('Uploaded file content does not match declared type');
  } catch (error) {
    await fsPromises.unlink(file.path).catch(() => {});
    throw error;
  } finally {
    await fd.close();
  }
}
