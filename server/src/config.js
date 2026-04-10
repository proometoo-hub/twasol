import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const toList = (value = '') => value.split(',').map((item) => item.trim()).filter(Boolean);
const escapeRegex = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wildcardToRegExp = (pattern = '') => new RegExp(`^${escapeRegex(pattern).replace(/\\\*/g, '.*')}$`);

const rawCorsOrigins = toList(process.env.CORS_ORIGINS || process.env.BASE_URL || '');
const corsOriginPatterns = rawCorsOrigins.map((item) => ({
  value: item,
  regex: item.includes('*') ? wildcardToRegExp(item) : null,
}));

export const isAllowedOrigin = (origin) => {
  if (!origin) return true;

  return corsOriginPatterns.some(({ value, regex }) => {
    if (value === origin) return true;
    if (regex?.test(origin)) return true;
    return false;
  });
};

export const config = {
  env: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  rootDir,
  port: Number(process.env.PORT || 4000),
  jwtSecret: process.env.JWT_SECRET || 'tawasol-dev-secret-change-me',
  corsOrigins: rawCorsOrigins,
  trustProxy: String(process.env.TRUST_PROXY || (process.env.NODE_ENV === 'production' ? '1' : '0')) === '1',
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 80),
  appName: 'Twasol',
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
