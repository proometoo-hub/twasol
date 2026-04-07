import crypto from 'crypto';

export function hashSessionToken(token: string): string {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

export function generateWebhookSecret(length = 48): string {
  return crypto.randomBytes(length).toString('hex');
}
