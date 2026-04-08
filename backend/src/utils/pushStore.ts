import prisma from '../prisma';

type PushTokenMeta = {
  token: string;
  platform?: string;
  deviceName?: string;
  appVersion?: string;
  updatedAt?: string;
};

let initialized = false;

async function ensurePushTable() {
  if (initialized) return;
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS push_tokens (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        token TEXT NOT NULL UNIQUE,
        platform TEXT DEFAULT '',
        device_name TEXT DEFAULT '',
        app_version TEXT DEFAULT '',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_push_tokens_user_id ON push_tokens(user_id)`);
    initialized = true;
  } catch (err) {
    console.error('ensurePushTable failed:', err);
  }
}

export async function registerPushToken(userId: number, meta: PushTokenMeta) {
  if (!userId || !meta?.token) return;
  await ensurePushTable();
  await prisma.$executeRawUnsafe(
    `INSERT INTO push_tokens (user_id, token, platform, device_name, app_version, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (token) DO UPDATE SET
       user_id = EXCLUDED.user_id,
       platform = EXCLUDED.platform,
       device_name = EXCLUDED.device_name,
       app_version = EXCLUDED.app_version,
       updated_at = EXCLUDED.updated_at`,
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
    await prisma.$executeRawUnsafe(`DELETE FROM push_tokens WHERE user_id = $1 AND token = $2`, userId, String(token));
  } else {
    await prisma.$executeRawUnsafe(`DELETE FROM push_tokens WHERE user_id = $1`, userId);
  }
}

export async function prunePushToken(token: string) {
  if (!token) return;
  await ensurePushTable();
  await prisma.$executeRawUnsafe(`DELETE FROM push_tokens WHERE token = $1`, String(token));
}

export async function getPushTokensForUsers(userIds: number[]) {
  if (!userIds?.length) return [] as { userId: number; token: string }[];
  await ensurePushTable();
  const placeholders = userIds.map((_, i) => `$${i + 1}`).join(',');
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT user_id as "userId", token FROM push_tokens WHERE user_id IN (${placeholders}) ORDER BY updated_at DESC`,
    ...userIds,
  );
  return (rows || []).map((row) => ({ userId: Number(row.userId), token: String(row.token) }));
}
