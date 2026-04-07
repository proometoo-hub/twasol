import bcrypt from 'bcrypt';

export async function hashLockedPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, 10);
}

export async function verifyLockedPin(pin: string, hash?: string | null): Promise<boolean> {
  if (!pin || !hash) return false;
  return bcrypt.compare(pin, hash);
}

export function normalizeLockedPin(value: unknown): string | null {
  const pin = String(value ?? '').trim();
  if (!pin) return null;
  if (!/^\d{4,8}$/.test(pin)) {
    throw new Error('PIN must be 4-8 digits');
  }
  return pin;
}
