import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import pkg from 'pg';
import { fileURLToPath } from 'node:url';

const { Client } = pkg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sqlitePath = process.env.SQLITE_PATH || path.resolve(__dirname, '../../data/tawasol.db');
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}
if (!fs.existsSync(sqlitePath)) {
  console.error(`SQLite file not found: ${sqlitePath}`);
  process.exit(1);
}

const sqlite = new Database(sqlitePath, { readonly: true });
const pg = new Client({ connectionString: databaseUrl, ssl: false });

const createSchemaSql = `
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
  title TEXT,
  description TEXT,
  invite_code TEXT,
  invite_enabled INTEGER NOT NULL DEFAULT 0,
  allow_member_messages INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  archived INTEGER NOT NULL DEFAULT 0,
  pinned INTEGER NOT NULL DEFAULT 0,
  muted_until TEXT,
  last_read_at TEXT,
  joined_at TEXT NOT NULL,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'text',
  text TEXT NOT NULL DEFAULT '',
  media_url TEXT,
  media_name TEXT,
  media_size INTEGER,
  media_mime TEXT,
  media_id TEXT,
  reply_to_id TEXT,
  forwarded_from_id TEXT,
  meta TEXT,
  edited_at TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS message_reads (
  message_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  read_at TEXT NOT NULL,
  PRIMARY KEY (message_id, user_id)
);

CREATE TABLE IF NOT EXISTS message_reactions (
  message_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  emoji TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (message_id, user_id, emoji)
);

CREATE TABLE IF NOT EXISTS blocks (
  blocker_id TEXT NOT NULL,
  blocked_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (blocker_id, blocked_id)
);

CREATE TABLE IF NOT EXISTS statuses (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'text',
  text TEXT,
  media_url TEXT,
  media_mime TEXT,
  media_id TEXT,
  background TEXT,
  style_json TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS status_views (
  status_id TEXT NOT NULL,
  viewer_id TEXT NOT NULL,
  viewed_at TEXT NOT NULL,
  PRIMARY KEY (status_id, viewer_id)
);

CREATE TABLE IF NOT EXISTS status_mutes (
  user_id TEXT NOT NULL,
  muted_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, muted_user_id)
);

CREATE TABLE IF NOT EXISTS media_files (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  conversation_id TEXT,
  status_id TEXT,
  kind TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  original_name TEXT,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  iv_hex TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS calls (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  initiator_id TEXT NOT NULL,
  target_user_id TEXT,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  duration_sec INTEGER
);
`;

const placeholders = (row) => Object.keys(row).map((_, i) => `$${i + 1}`).join(', ');
const insertRow = async (table, row) => {
  const keys = Object.keys(row);
  const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders(row)}) ON CONFLICT DO NOTHING`;
  await pg.query(sql, Object.values(row));
};

const copyTable = async (table) => {
  const rows = sqlite.prepare(`SELECT * FROM ${table}`).all();
  for (const row of rows) await insertRow(table, row);
  console.log(`Migrated ${rows.length} rows from ${table}`);
};

const main = async () => {
  await pg.connect();
  await pg.query(createSchemaSql);

  const tables = [
    'users',
    'conversations',
    'conversation_members',
    'messages',
    'message_reads',
    'message_reactions',
    'blocks',
    'statuses',
    'status_views',
    'status_mutes',
    'media_files',
    'calls',
  ];

  for (const table of tables) {
    await copyTable(table);
  }

  await pg.end();
  sqlite.close();
  console.log('SQLite -> PostgreSQL migration completed');
};

main().catch(async (error) => {
  console.error(error);
  try { await pg.end(); } catch {}
  try { sqlite.close(); } catch {}
  process.exit(1);
});
