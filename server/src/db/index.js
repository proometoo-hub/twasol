import pkg from 'pg';
import bcrypt from 'bcryptjs';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createId, nowIso } from '../utils/helpers.js';

const { Pool, types } = pkg;

types.setTypeParser(20, (value) => Number(value));
types.setTypeParser(21, (value) => Number(value));
types.setTypeParser(23, (value) => Number(value));
types.setTypeParser(700, (value) => Number(value));
types.setTypeParser(701, (value) => Number(value));
types.setTypeParser(1700, (value) => Number(value));

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required. This version runs on PostgreSQL.');
}

const useSsl = ['1', 'true', 'yes'].includes(String(process.env.DATABASE_SSL || '').toLowerCase());
const pool = new Pool({
  connectionString: databaseUrl,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
  max: Number(process.env.DB_POOL_MAX || 10),
});

const txStorage = new AsyncLocalStorage();
const currentExecutor = () => txStorage.getStore()?.client || pool;

const conflictKeyMap = {
  message_reads: ['message_id', 'user_id'],
  status_views: ['status_id', 'viewer_id'],
};

const withPlaceholders = (sql) => {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
};

const normalizeInsertConflict = (sql) => {
  const replaceMatch = sql.match(/^\s*INSERT\s+OR\s+REPLACE\s+INTO\s+([a-z_][a-z0-9_]*)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
  if (replaceMatch) {
    const [, table, rawColumns, rawValues] = replaceMatch;
    const columns = rawColumns.split(',').map((item) => item.trim()).filter(Boolean);
    const conflictKeys = conflictKeyMap[table];
    if (!conflictKeys) throw new Error(`Unsupported INSERT OR REPLACE target on PostgreSQL: ${table}`);
    const updateCols = columns.filter((col) => !conflictKeys.includes(col));
    const updateSql = updateCols.length
      ? updateCols.map((col) => `${col} = EXCLUDED.${col}`).join(', ')
      : `${conflictKeys[0]} = EXCLUDED.${conflictKeys[0]}`;
    return `INSERT INTO ${table} (${rawColumns}) VALUES (${rawValues}) ON CONFLICT (${conflictKeys.join(', ')}) DO UPDATE SET ${updateSql}`;
  }

  const ignoreMatch = sql.match(/^\s*INSERT\s+OR\s+IGNORE\s+INTO\s+/i);
  if (ignoreMatch) {
    return sql.replace(/INSERT\s+OR\s+IGNORE\s+INTO/i, 'INSERT INTO') + ' ON CONFLICT DO NOTHING';
  }

  return sql;
};

const normalizeSql = (sql) => withPlaceholders(normalizeInsertConflict(String(sql).trim()));

const runQuery = async (sql, params = []) => {
  const executor = currentExecutor();
  return executor.query(normalizeSql(sql), params);
};

class Statement {
  constructor(sql) {
    this.sql = sql;
  }

  async get(...params) {
    const result = await runQuery(this.sql, params);
    return result.rows[0] ?? undefined;
  }

  async all(...params) {
    const result = await runQuery(this.sql, params);
    return result.rows;
  }

  async run(...params) {
    const result = await runQuery(this.sql, params);
    return {
      changes: result.rowCount,
      rowCount: result.rowCount,
      rows: result.rows,
      row: result.rows[0] ?? null,
    };
  }
}

const db = {
  prepare(sql) {
    return new Statement(sql);
  },
  async exec(sql) {
    const executor = currentExecutor();
    return executor.query(String(sql));
  },
  transaction(fn) {
    return async (...args) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await txStorage.run({ client }, async () => fn(...args));
        await client.query('COMMIT');
        return result;
      } catch (error) {
        try {
          await client.query('ROLLBACK');
        } catch {}
        throw error;
      } finally {
        client.release();
      }
    };
  },
  pool,
};

const createSchema = async () => {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      phone TEXT UNIQUE,
      email TEXT UNIQUE,
      username TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      bio TEXT NOT NULL DEFAULT '',
      avatar_url TEXT,
      locale TEXT NOT NULL DEFAULT 'ar',
      theme TEXT NOT NULL DEFAULT 'dark',
      last_seen TEXT,
      is_admin INTEGER NOT NULL DEFAULT 0,
      privacy_last_seen TEXT NOT NULL DEFAULT 'contacts',
      privacy_status_views TEXT NOT NULL DEFAULT 'contacts',
      privacy_read_receipts INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      avatar_url TEXT,
      created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      invite_code TEXT UNIQUE,
      settings_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conversation_members (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'member',
      joined_at TEXT NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0,
      pinned INTEGER NOT NULL DEFAULT 0,
      muted_until TEXT,
      last_read_at TEXT,
      UNIQUE (conversation_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS media_files (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL DEFAULT 'generic',
      storage_name TEXT NOT NULL UNIQUE,
      original_name TEXT,
      mime_type TEXT NOT NULL,
      size_bytes BIGINT NOT NULL,
      iv_b64 TEXT NOT NULL,
      tag_b64 TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL DEFAULT 'text',
      text TEXT NOT NULL DEFAULT '',
      media_url TEXT,
      media_name TEXT,
      media_size BIGINT,
      reply_to_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
      forwarded_from_id TEXT,
      edited_at TEXT,
      deleted_at TEXT,
      meta_json TEXT NOT NULL DEFAULT '{}',
      media_id TEXT REFERENCES media_files(id) ON DELETE SET NULL,
      media_mime TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reactions (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      emoji TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (message_id, user_id, emoji)
    );

    CREATE TABLE IF NOT EXISTS message_reads (
      message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      read_at TEXT NOT NULL,
      PRIMARY KEY (message_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS starred_messages (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      PRIMARY KEY (user_id, message_id)
    );

    CREATE TABLE IF NOT EXISTS statuses (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL DEFAULT 'text',
      text TEXT NOT NULL DEFAULT '',
      media_url TEXT,
      media_id TEXT REFERENCES media_files(id) ON DELETE SET NULL,
      media_mime TEXT,
      style_json TEXT NOT NULL DEFAULT '{}',
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS status_views (
      status_id TEXT NOT NULL REFERENCES statuses(id) ON DELETE CASCADE,
      viewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      viewed_at TEXT NOT NULL,
      PRIMARY KEY (status_id, viewer_id)
    );

    CREATE TABLE IF NOT EXISTS status_mutes (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      muted_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      PRIMARY KEY (user_id, muted_user_id)
    );

    CREATE TABLE IF NOT EXISTS blocks (
      blocker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      PRIMARY KEY (blocker_id, blocked_id)
    );

    CREATE TABLE IF NOT EXISTS calls (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      creator_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL DEFAULT 'video',
      status TEXT NOT NULL DEFAULT 'ringing',
      answered_at TEXT,
      ended_by TEXT,
      ended_at TEXT,
      updated_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_users_search_display_name ON users(display_name);
    CREATE INDEX IF NOT EXISTS idx_users_search_username ON users(username);
    CREATE INDEX IF NOT EXISTS idx_conversation_members_user_id ON conversation_members(user_id);
    CREATE INDEX IF NOT EXISTS idx_messages_conversation_created_at ON messages(conversation_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_message_reads_user_id ON message_reads(user_id, read_at);
    CREATE INDEX IF NOT EXISTS idx_reactions_message_id ON reactions(message_id);
    CREATE INDEX IF NOT EXISTS idx_statuses_expires_at ON statuses(expires_at);
    CREATE INDEX IF NOT EXISTS idx_status_views_status_id ON status_views(status_id);
    CREATE INDEX IF NOT EXISTS idx_media_files_owner_kind ON media_files(owner_user_id, kind, created_at);
    CREATE INDEX IF NOT EXISTS idx_calls_conversation_id ON calls(conversation_id);
  `);
};

const seedAdminIfNeeded = async () => {
  const countRow = await db.prepare('SELECT COUNT(*)::int AS count FROM users').get();
  if (countRow?.count > 0) return;
  const adminId = process.env.ADMIN_ID || createId('usr');
  const adminHash = await bcrypt.hash(process.env.ADMIN_PASSWORD || '548519', 10);
  await db.prepare(`
    INSERT INTO users (
      id, phone, email, username, display_name, password_hash, bio, avatar_url, locale, theme,
      last_seen, is_admin, privacy_last_seen, privacy_status_views, privacy_read_receipts, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'contacts', 'contacts', 1, ?)
  `).run(
    adminId,
    '+970000000001',
    'admin@twasol.local',
    process.env.ADMIN_USERNAME || 'Admin',
    process.env.ADMIN_DISPLAY_NAME || 'Admin',
    adminHash,
    'جاهز للتجربة والتطوير.',
    null,
    'ar',
    'dark',
    nowIso(),
    nowIso(),
  );
};

await createSchema();
await seedAdminIfNeeded();

export default db;
export { pool };
