export function getRequiredJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret || secret.length < 32 || /change-this|secret-key-change|PLEASE_CHANGE_THIS/i.test(secret)) {
    throw new Error('JWT_SECRET must be set to a strong custom value in backend/.env');
  }
  return secret;
}

export function isHttpsEnabled() {
  return /^(1|true|yes)$/i.test(process.env.HTTPS_ENABLED || '');
}

export function getAllowedOrigins(): string[] {
  const fallback = 'http://localhost:3020,http://127.0.0.1:3020,http://11.0.0.103:3020,https://localhost:3020,https://127.0.0.1:3020,https://11.0.0.103:3020';
  return (process.env.ALLOWED_ORIGINS || fallback)
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);
}

export function getPublicBaseUrl(req?: any): string {
  const fromEnv = process.env.PUBLIC_APP_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  if (req) {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || (isHttpsEnabled() ? 'https' : 'http');
    const host = req.get?.('host');
    if (host) return `${protocol}://${host}`;
  }
  return `${isHttpsEnabled() ? 'https' : 'http'}://11.0.0.103:3020`;
}

export function getClientHost(req?: any): string {
  return (req.headers['x-forwarded-for']?.toString().split(',')[0] || req.socket?.remoteAddress || '').trim();
}

export function getDeviceName(req?: any): string {
  return req.headers['user-agent']?.toString().slice(0, 255) || 'Unknown device';
}
