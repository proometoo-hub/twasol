import fs from 'fs/promises';
import path from 'path';
import prisma from '../prisma';

type PushTokenMeta = {
  token: string;
  platform?: string;
  deviceName?: string;
  appVersion?: string;
  updatedAt?: string;
};

const storeDir = path.resolve(process.cwd(), 'data');
const legacyStoreFile = path.join(storeDir, 'pushTokens.json');
let initialized = false;

async function ensurePushTable() {
  if (initialized) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS push_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      platform TEXT,
      device_name TEXT,
      app_version TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_push_tokens_user_id ON push_tokens(user_id)`);
  initialized = true;
  await migrateLegacyJsonStore();
}

async function migrateLegacyJsonStore() {
  try {
    const raw = await fs.readFile(legacyStoreFile, 'utf-8');
    const parsed = JSON.parse(raw || '{}');
    const entries = Object.entries(parsed || {});
    for (const [userId, items] of entries) {
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        if (!item?.token) continue;
        await prisma.$executeRawUnsafe(
          `INSERT OR REPLACE INTO push_tokens (user_id, token, platform, device_name, app_version, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
          Number(userId),
          String(item.token),
          String(item.platform || ''),
          String(item.deviceName || ''),
          String(item.appVersion || ''),
          String(item.updatedAt || new Date().toISOString()),
        );
      }
    }
    await fs.rename(legacyStoreFile, `${legacyStoreFile}.migrated`).catch(() => {});
  } catch {}
}

export async function registerPushToken(userId: number, meta: PushTokenMeta) {
  if (!userId || !meta?.token) return;
  await ensurePushTable();
  await prisma.$executeRawUnsafe(
    `INSERT OR REPLACE INTO push_tokens (user_id, token, platform, device_name, app_version, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
    userId,
    String(meta.token),
    String(meta.platform || ''),
    String(meta.deviceName || ''),
    String(meta.appVersion || ''),
    String(meta.updatedAt || new Date().toISOString()),
  );
}

export async function unregisterPushToken(userId: number, token?: string) {
  if (!userId) return;
  await ensurePushTable();
  if (token) {
    await prisma.$executeRawUnsafe(`DELETE FROM push_tokens WHERE user_id = ? AND token = ?`, userId, String(token));
  } else {
    await prisma.$executeRawUnsafe(`DELETE FROM push_tokens WHERE user_id = ?`, userId);
  }
}

export async function prunePushToken(token: string) {
  if (!token) return;
  await ensurePushTable();
  await prisma.$executeRawUnsafe(`DELETE FROM push_tokens WHERE token = ?`, String(token));
}

export async function getPushTokensForUsers(userIds: number[]) {
  if (!userIds?.length) return [] as { userId: number; token: string }[];
  await ensurePushTable();
  const placeholders = userIds.map(() => '?').join(',');
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT user_id as userId, token FROM push_tokens WHERE user_id IN (${placeholders}) ORDER BY updated_at DESC`,
    ...userIds,
  );
  return (rows || []).map((row) => ({ userId: Number(row.userId), token: String(row.token) }));
}
