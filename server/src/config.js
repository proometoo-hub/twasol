import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAllowedOrigins } from './utils/origins.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const configuredOrigins = buildAllowedOrigins(
  process.env.CORS_ORIGINS || '',
  process.env.ALLOWED_ORIGINS || '',
  process.env.BASE_URL || '',
  process.env.PUBLIC_APP_URL || '',
);

export const config = {
  env: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  rootDir,
  port: Number(process.env.PORT || 4000),
  bindHost: process.env.BIND_HOST || '0.0.0.0',
  jwtSecret: process.env.JWT_SECRET || 'tawasol-dev-secret-change-me',
  corsOrigins: configuredOrigins,
  trustProxy:
    String(
      process.env.TRUST_PROXY ||
      process.env.TRUST_PROXY_HOPS ||
      (process.env.NODE_ENV === 'production' ? '1' : '0'),
    ) === '1',
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 80),
  appName: 'Tawasol',
  baseUrl: process.env.BASE_URL || process.env.PUBLIC_APP_URL || '',
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
