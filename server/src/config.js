import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const toList = (value = '') => value.split(',').map((item) => item.trim()).filter(Boolean);

const wildcardToRegExp = (pattern) => {
  const escaped = pattern
    .replace(/[|\\{}()[\]^$+?.]/g, '\\$&')
    .replace(/\*/g, '.*');

  return new RegExp(`^${escaped}$`, 'i');
};

const corsOriginEntries = [
  ...toList(process.env.CORS_ORIGINS || ''),
  ...toList(process.env.ALLOWED_ORIGINS || ''),
  ...toList(process.env.BASE_URL || ''),
];

const uniqueCorsOrigins = [...new Set(corsOriginEntries)];
const wildcardCorsRegexes = uniqueCorsOrigins
  .filter((entry) => entry.includes('*'))
  .map(wildcardToRegExp);
const exactCorsOrigins = new Set(uniqueCorsOrigins.filter((entry) => !entry.includes('*')));

export const isOriginAllowed = (origin) => {
  if (!origin) return true;
  if (!uniqueCorsOrigins.length) return true;
  if (exactCorsOrigins.has(origin)) return true;
  if (wildcardCorsRegexes.some((regex) => regex.test(origin))) return true;
  if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin)) return true;
  return false;
};

export const config = {
  env: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  rootDir,
  port: Number(process.env.PORT || 4000),
  jwtSecret: process.env.JWT_SECRET || 'tawasol-dev-secret-change-me',
  corsOrigins: uniqueCorsOrigins,
  trustProxy: String(process.env.TRUST_PROXY || (process.env.NODE_ENV === 'production' ? '1' : '0')) === '1',
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 80),
  appName: 'Tawasol',
  baseUrl: process.env.BASE_URL || '',
  defaultStunServers: [
    'stun:stun.l.google.com:19302',
    'stun:stun1.l.google.com:19302',
  ],
  mediaSecret: process.env.MEDIA_SECRET || process.env.JWT_SECRET || 'tawasol-dev-secret-change-me',
  mediaLinkTtlSec: Number(process.env.MEDIA_LINK_TTL_SEC || 86400),
};

if (config.isProd && config.jwtSecret === 'tawasol-dev-secret-change-me') {
  throw new Error('JWT_SECRET must be set in production.');
}
