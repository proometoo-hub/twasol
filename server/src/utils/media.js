import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import db from '../db/index.js';
import { config } from '../config.js';
import { createId, nowIso } from './helpers.js';

const mediaRoot = path.resolve(config.rootDir, 'private_media');
fs.mkdirSync(mediaRoot, { recursive: true });
const key = crypto.createHash('sha256').update(String(config.mediaSecret || config.jwtSecret)).digest();

const sign = (payload) => crypto.createHmac('sha256', key).update(payload).digest('base64url');

export const createMediaToken = ({ mediaId = null, userId, legacy = null, ttlSec = config.mediaLinkTtlSec }) => {
  const payload = JSON.stringify({ mediaId, userId, legacy, exp: Math.floor(Date.now() / 1000) + ttlSec });
  return `${Buffer.from(payload).toString('base64url')}.${sign(payload)}`;
};

export const verifyMediaToken = (token) => {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [encoded, sig] = token.split('.', 2);
  let payload;
  try {
    payload = Buffer.from(encoded, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  if (sign(payload) !== sig) return null;
  try {
    const parsed = JSON.parse(payload);
    if (!parsed?.exp || parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return parsed;
  } catch {
    return null;
  }
};

export const encryptAndStoreMedia = async ({ file, ownerUserId, kind = 'generic' }) => {
  const mediaId = createId('media');
  const storageName = `${mediaId}.bin`;
  const storagePath = path.join(mediaRoot, storageName);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(file.buffer), cipher.final()]);
  const tag = cipher.getAuthTag();
  fs.writeFileSync(storagePath, encrypted);
  await db.prepare(`
    INSERT INTO media_files (id, owner_user_id, kind, storage_name, original_name, mime_type, size_bytes, iv_b64, tag_b64, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(mediaId, ownerUserId, kind, storageName, file.originalname || null, file.mimetype || 'application/octet-stream', file.size || encrypted.length, iv.toString('base64'), tag.toString('base64'), nowIso());
  return {
    mediaId,
    originalName: file.originalname || null,
    mimeType: file.mimetype || 'application/octet-stream',
    size: file.size || encrypted.length,
  };
};

export const getMediaRecord = async (mediaId) => db.prepare('SELECT * FROM media_files WHERE id = ?').get(mediaId);

export const decryptMediaBuffer = async (mediaId) => {
  const record = await getMediaRecord(mediaId);
  if (!record) return null;
  const encrypted = fs.readFileSync(path.join(mediaRoot, record.storage_name));
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(record.iv_b64, 'base64'));
  decipher.setAuthTag(Buffer.from(record.tag_b64, 'base64'));
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return { record, buffer: decrypted };
};

const hasConversationAccess = async (userId, conversationId) => Boolean(await db.prepare(
  'SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?'
).get(conversationId, userId));

export const canUserAccessMedia = async ({ userId, mediaId, legacy = null }) => {
  if (legacy) {
    const message = await db.prepare('SELECT conversation_id FROM messages WHERE media_url = ? LIMIT 1').get(`/uploads/${legacy}`);
    if (message) return hasConversationAccess(userId, message.conversation_id);
    const status = await db.prepare('SELECT user_id FROM statuses WHERE media_url = ? LIMIT 1').get(`/uploads/${legacy}`);
    if (status) return status.user_id === userId || Boolean(await db.prepare('SELECT 1 FROM users WHERE id = ?').get(userId));
    return false;
  }
  const message = await db.prepare('SELECT conversation_id FROM messages WHERE media_id = ? LIMIT 1').get(mediaId);
  if (message) return hasConversationAccess(userId, message.conversation_id);
  const status = await db.prepare('SELECT user_id FROM statuses WHERE media_id = ? LIMIT 1').get(mediaId);
  if (status) return status.user_id === userId || Boolean(await db.prepare('SELECT 1 FROM users WHERE id = ?').get(userId));
  const ownedUpload = await db.prepare('SELECT owner_user_id FROM media_files WHERE id = ?').get(mediaId);
  return ownedUpload?.owner_user_id === userId;
};

export const createSignedMediaUrl = ({ mediaId = null, viewerUserId, legacy = null }) => {
  const token = createMediaToken({ mediaId, userId: viewerUserId, legacy });
  if (legacy) return `/api/media/legacy/${encodeURIComponent(legacy)}?token=${encodeURIComponent(token)}`;
  return `/api/media/${mediaId}?token=${encodeURIComponent(token)}`;
};
