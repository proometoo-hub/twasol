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
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  created_by TEXT,
  invite_code TEXT UNIQUE,
  settings_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conversation_members (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
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
  owner_user_id TEXT NOT NULL,
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
  conversation_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'text',
  text TEXT NOT NULL DEFAULT '',
  media_url TEXT,
  media_name TEXT,
  media_size BIGINT,
  reply_to_id TEXT,
  forwarded_from_id TEXT,
  edited_at TEXT,
  deleted_at TEXT,
  meta_json TEXT NOT NULL DEFAULT '{}',
  media_id TEXT,
  media_mime TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reactions (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  emoji TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (message_id, user_id, emoji)
);

CREATE TABLE IF NOT EXISTS message_reads (
  message_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  read_at TEXT NOT NULL,
  PRIMARY KEY (message_id, user_id)
);

CREATE TABLE IF NOT EXISTS starred_messages (
  user_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, message_id)
);

CREATE TABLE IF NOT EXISTS statuses (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'text',
  text TEXT NOT NULL DEFAULT '',
  media_url TEXT,
  media_id TEXT,
  media_mime TEXT,
  style_json TEXT NOT NULL DEFAULT '{}',
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

CREATE TABLE IF NOT EXISTS blocks (
  blocker_id TEXT NOT NULL,
  blocked_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (blocker_id, blocked_id)
);

CREATE TABLE IF NOT EXISTS calls (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  creator_id TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'video',
  status TEXT NOT NULL DEFAULT 'ringing',
  answered_at TEXT,
  ended_by TEXT,
  ended_at TEXT,
  updated_at TEXT,
  created_at TEXT NOT NULL
);
`;

const tableColumns = (table) => sqlite.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name);

const insertRows = async (table, rows) => {
  if (!rows.length) return;
  const columns = Object.keys(rows[0]);
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
  const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;
  for (const row of rows) {
    await pg.query(sql, columns.map((col) => row[col]));
  }
  console.log(`Migrated ${rows.length} rows from ${table}`);
};

const copyTable = async (sqliteTable, pgTable = sqliteTable, mapRow = (row) => row) => {
  const rows = sqlite.prepare(`SELECT * FROM ${sqliteTable}`).all().map(mapRow);
  await insertRows(pgTable, rows);
};

const main = async () => {
  await pg.connect();
  await pg.query(createSchemaSql);

  await copyTable('users');
  await copyTable('conversations');
  await copyTable('conversation_members');
  await copyTable('media_files');
  await copyTable('messages', 'messages', (row) => ({ ...row, meta_json: row.meta_json || row.meta || '{}' }));
  await copyTable('reactions');
  await copyTable('message_reads');
  if (tableColumns('starred_messages').length) await copyTable('starred_messages');
  await copyTable('statuses', 'statuses', (row) => ({ ...row, style_json: row.style_json || '{}' }));
  await copyTable('status_views');
  await copyTable('status_mutes');
  await copyTable('blocks');
  await copyTable('calls');

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
