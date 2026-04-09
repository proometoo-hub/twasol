import crypto from 'node:crypto';
import path from 'node:path';

export const nowIso = () => new Date().toISOString();
export const createId = (prefix = 'id') => `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
export const publicUploadPath = (filename) => `/uploads/${filename}`;
export const safeFileName = (originalName = 'file') => {
  const ext = path.extname(originalName).replace(/[^a-zA-Z0-9.]/g, '');
  const base = path.basename(originalName, ext).replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 60) || 'file';
  return `${Date.now()}_${base}${ext}`;
};
export const clamp = (value, min, max) => Math.min(Math.max(Number(value) || min, min), max);
export const normalizeString = (value, fallback = '') => typeof value === 'string' ? value.trim() : fallback;
export const normalizeNullable = (value) => {
  const text = normalizeString(value);
  return text || null;
};
