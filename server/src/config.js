import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const toList = (value = '') => value.split(',').map((item) => item.trim()).filter(Boolean);
const escapeRegex = (value) => value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
const wildcardToRegex = (value) => new RegExp(`^${escapeRegex(value).replace(/\\\*/g, '.*')}$`);

const baseUrl = process.env.BASE_URL || process.env.PUBLIC_APP_URL || '';
const rawOrigins = [
  ...toList(process.env.CORS_ORIGINS || ''),
  ...toList(process.env.ALLOWED_ORIGINS || ''),
  ...toList(baseUrl),
];
const uniqueOrigins = [...new Set(rawOrigins.filter(Boolean))];
const corsMatchers = uniqueOrigins.map((origin) => (origin.includes('*') ? wildcardToRegex(origin) : origin));

export const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  if (!uniqueOrigins.length) return true;
  return corsMatchers.some((matcher) => (matcher instanceof RegExp ? matcher.test(origin) : matcher === origin));
};

export const config = {
  env: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  rootDir,
  storageRoot: process.env.STORAGE_ROOT ? path.resolve(process.env.STORAGE_ROOT) : rootDir,
  port: Number(process.env.PORT || 4000),
  bindHost: process.env.BIND_HOST || '0.0.0.0',
  jwtSecret: process.env.JWT_SECRET || 'twasol-dev-secret-change-me',
  corsOrigins: uniqueOrigins,
  trustProxy:
    String(process.env.TRUST_PROXY || (process.env.NODE_ENV === 'production' ? '1' : '0')) === '1' ||
    Number(process.env.TRUST_PROXY_HOPS || 0) > 0,
  trustProxyHops: Number(process.env.TRUST_PROXY_HOPS || 1),
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 80),
  appName: 'Twasol',
  baseUrl,
  publicAppUrl: process.env.PUBLIC_APP_URL || baseUrl,
  defaultStunServers: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'],
  mediaSecret: process.env.MEDIA_SECRET || process.env.JWT_SECRET || 'twasol-dev-secret-change-me',
  mediaLinkTtlSec: Number(process.env.MEDIA_LINK_TTL_SEC || 86400),
  allowPublicUploads: String(process.env.ALLOW_PUBLIC_UPLOADS || 'false') === 'true',
};

if (config.isProd && config.jwtSecret === 'twasol-dev-secret-change-me') {
  throw new Error('JWT_SECRET must be set in production.');
}
