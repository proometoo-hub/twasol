import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'node:url';
import { createId, nowIso } from '../utils/helpers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '../../');
const dataDir = path.join(process.env.STORAGE_ROOT ? path.resolve(process.env.STORAGE_ROOT) : root, 'data');
const dbFile = path.join(dataDir, 'tawasol.db');
const legacyJsonFile = path.join(dataDir, 'tawasol.json');
fs.mkdirSync(dataDir, { recursive: true });

const tableExists = (db, table) => db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
const getColumns = (db, table) => db.prepare(`PRAGMA table_info(${table})`).all().map((item) => item.name);
const hasColumn = (db, table, column) => getColumns(db, table).includes(column);
const addColumnIfMissing = (db, table, columnSql, columnName) => {
  if (!tableExists(db, table)) return;
  if (!hasColumn(db, table, columnName)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${columnSql}`);
};
const countRows = (db, table) => db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count;

const createSchema = (db) => {
  db.exec(`
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
      type TEXT NOT NULL CHECK (type IN ('direct', 'group', 'channel')),
      title TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      avatar_url TEXT,
      created_by TEXT,
      invite_code TEXT UNIQUE,
      settings_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS conversation_members (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
      joined_at TEXT NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0,
      pinned INTEGER NOT NULL DEFAULT 0,
      muted_until TEXT,
      last_read_at TEXT,
      UNIQUE (conversation_id, user_id),
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
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
      reply_to_id TEXT,
      forwarded_from_id TEXT,
      edited_at TEXT,
      deleted_at TEXT,
      meta_json TEXT NOT NULL DEFAULT '{}',
      media_id TEXT,
      media_mime TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
      FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (reply_to_id) REFERENCES messages(id) ON DELETE SET NULL,
      FOREIGN KEY (media_id) REFERENCES media_files(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS reactions (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      emoji TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (message_id, user_id, emoji),
      FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS message_reads (
      message_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      read_at TEXT NOT NULL,
      PRIMARY KEY (message_id, user_id),
      FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS starred_messages (
      user_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (user_id, message_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS media_files (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'generic',
      storage_name TEXT NOT NULL UNIQUE,
      original_name TEXT,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      iv_b64 TEXT NOT NULL,
      tag_b64 TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
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
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (media_id) REFERENCES media_files(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS status_views (
      status_id TEXT NOT NULL,
      viewer_id TEXT NOT NULL,
      viewed_at TEXT NOT NULL,
      PRIMARY KEY (status_id, viewer_id),
      FOREIGN KEY (status_id) REFERENCES statuses(id) ON DELETE CASCADE,
      FOREIGN KEY (viewer_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS status_mutes (
      user_id TEXT NOT NULL,
      muted_user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (user_id, muted_user_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (muted_user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS blocks (
      blocker_id TEXT NOT NULL,
      blocked_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (blocker_id, blocked_id),
      FOREIGN KEY (blocker_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (blocked_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS calls (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      creator_id TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'video' CHECK (kind IN ('audio', 'video')),
      status TEXT NOT NULL DEFAULT 'ringing',
      answered_at TEXT,
      ended_by TEXT,
      ended_at TEXT,
      updated_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
      FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
};

const migrateSchema = (db) => {
  addColumnIfMissing(db, 'users', 'phone TEXT', 'phone');
  addColumnIfMissing(db, 'users', 'email TEXT', 'email');
  addColumnIfMissing(db, 'users', 'display_name TEXT', 'display_name');
  addColumnIfMissing(db, 'users', 'password_hash TEXT', 'password_hash');
  addColumnIfMissing(db, 'users', "bio TEXT NOT NULL DEFAULT ''", 'bio');
  addColumnIfMissing(db, 'users', 'avatar_url TEXT', 'avatar_url');
  addColumnIfMissing(db, 'users', "locale TEXT NOT NULL DEFAULT 'ar'", 'locale');
  addColumnIfMissing(db, 'users', "theme TEXT NOT NULL DEFAULT 'dark'", 'theme');
  addColumnIfMissing(db, 'users', 'last_seen TEXT', 'last_seen');
  addColumnIfMissing(db, 'users', 'is_admin INTEGER NOT NULL DEFAULT 0', 'is_admin');
  addColumnIfMissing(db, 'users', "privacy_last_seen TEXT NOT NULL DEFAULT 'contacts'", 'privacy_last_seen');
  addColumnIfMissing(db, 'users', "privacy_status_views TEXT NOT NULL DEFAULT 'contacts'", 'privacy_status_views');
  addColumnIfMissing(db, 'users', 'privacy_read_receipts INTEGER NOT NULL DEFAULT 1', 'privacy_read_receipts');
  addColumnIfMissing(db, 'users', 'created_at TEXT', 'created_at');

  addColumnIfMissing(db, 'conversations', "description TEXT NOT NULL DEFAULT ''", 'description');
  addColumnIfMissing(db, 'conversations', 'avatar_url TEXT', 'avatar_url');
  addColumnIfMissing(db, 'conversations', 'created_by TEXT', 'created_by');
  addColumnIfMissing(db, 'conversations', 'invite_code TEXT', 'invite_code');
  addColumnIfMissing(db, 'conversations', "settings_json TEXT NOT NULL DEFAULT '{}'", 'settings_json');
  addColumnIfMissing(db, 'conversations', 'created_at TEXT', 'created_at');

  addColumnIfMissing(db, 'conversation_members', 'archived INTEGER NOT NULL DEFAULT 0', 'archived');
  addColumnIfMissing(db, 'conversation_members', 'pinned INTEGER NOT NULL DEFAULT 0', 'pinned');
  addColumnIfMissing(db, 'conversation_members', 'muted_until TEXT', 'muted_until');
  addColumnIfMissing(db, 'conversation_members', 'last_read_at TEXT', 'last_read_at');

  addColumnIfMissing(db, 'messages', "type TEXT NOT NULL DEFAULT 'text'", 'type');
  addColumnIfMissing(db, 'messages', "text TEXT NOT NULL DEFAULT ''", 'text');
  addColumnIfMissing(db, 'messages', 'media_url TEXT', 'media_url');
  addColumnIfMissing(db, 'messages', 'media_name TEXT', 'media_name');
  addColumnIfMissing(db, 'messages', 'media_size INTEGER', 'media_size');
  addColumnIfMissing(db, 'messages', 'reply_to_id TEXT', 'reply_to_id');
  addColumnIfMissing(db, 'messages', 'forwarded_from_id TEXT', 'forwarded_from_id');
  addColumnIfMissing(db, 'messages', 'edited_at TEXT', 'edited_at');
  addColumnIfMissing(db, 'messages', 'deleted_at TEXT', 'deleted_at');
  addColumnIfMissing(db, 'messages', "meta_json TEXT NOT NULL DEFAULT '{}'", 'meta_json');
  addColumnIfMissing(db, 'messages', 'media_id TEXT', 'media_id');
  addColumnIfMissing(db, 'messages', 'media_mime TEXT', 'media_mime');
  addColumnIfMissing(db, 'messages', 'created_at TEXT', 'created_at');

  addColumnIfMissing(db, 'statuses', 'media_id TEXT', 'media_id');
  addColumnIfMissing(db, 'statuses', 'media_mime TEXT', 'media_mime');
  addColumnIfMissing(db, 'statuses', "style_json TEXT NOT NULL DEFAULT '{}'", 'style_json');

  if (tableExists(db, 'statuses')) {
    db.prepare("UPDATE statuses SET style_json = COALESCE(NULLIF(style_json, ''), '{}')").run();
  }

  addColumnIfMissing(db, 'calls', 'answered_at TEXT', 'answered_at');
  addColumnIfMissing(db, 'calls', 'updated_at TEXT', 'updated_at');


  if (tableExists(db, 'users')) {
    const cols = getColumns(db, 'users');
    const sets = [];
    if (cols.includes('name')) sets.push(`display_name = COALESCE(NULLIF(display_name, ''), NULLIF(name, ''), username, 'مستخدم')`);
    else sets.push(`display_name = COALESCE(NULLIF(display_name, ''), username, 'مستخدم')`);
    if (cols.includes('password')) sets.push(`password_hash = COALESCE(NULLIF(password_hash, ''), password, '')`);
    else sets.push(`password_hash = COALESCE(NULLIF(password_hash, ''), '')`);
    if (cols.includes('avatar')) sets.push(`avatar_url = COALESCE(NULLIF(avatar_url, ''), avatar)`);
    if (cols.includes('createdAt')) sets.push(`created_at = COALESCE(NULLIF(created_at, ''), createdAt, '${nowIso()}')`);
    else sets.push(`created_at = COALESCE(NULLIF(created_at, ''), '${nowIso()}')`);
    sets.push(`bio = COALESCE(bio, '')`);
    sets.push(`locale = COALESCE(NULLIF(locale, ''), 'ar')`);
    sets.push(`theme = COALESCE(NULLIF(theme, ''), 'dark')`);
    sets.push(`last_seen = COALESCE(NULLIF(last_seen, ''), created_at, '${nowIso()}')`);
    sets.push(`privacy_last_seen = COALESCE(NULLIF(privacy_last_seen, ''), 'contacts')`);
    sets.push(`privacy_status_views = COALESCE(NULLIF(privacy_status_views, ''), 'contacts')`);
    sets.push(`privacy_read_receipts = COALESCE(privacy_read_receipts, 1)`);
    db.exec(`UPDATE users SET ${sets.join(', ')}`);
  }

  if (tableExists(db, 'conversations')) {
    const cols = getColumns(db, 'conversations');
    const sets = [];
    if (cols.includes('name')) sets.push(`title = COALESCE(NULLIF(title, ''), NULLIF(name, ''), '')`);
    if (cols.includes('avatar')) sets.push(`avatar_url = COALESCE(NULLIF(avatar_url, ''), avatar)`);
    if (cols.includes('createdAt')) sets.push(`created_at = COALESCE(NULLIF(created_at, ''), createdAt, '${nowIso()}')`);
    else sets.push(`created_at = COALESCE(NULLIF(created_at, ''), '${nowIso()}')`);
    sets.push(`type = COALESCE(NULLIF(type, ''), 'direct')`);
    sets.push(`description = COALESCE(description, '')`);
    sets.push(`settings_json = COALESCE(NULLIF(settings_json, ''), '{}')`);
    db.exec(`UPDATE conversations SET ${sets.join(', ')}`);
  }

  if (tableExists(db, 'messages')) {
    const cols = getColumns(db, 'messages');
    const sets = [];
    if (cols.includes('content')) sets.push(`text = COALESCE(NULLIF(text, ''), content, '')`);
    if (cols.includes('fileUrl')) sets.push(`media_url = COALESCE(NULLIF(media_url, ''), fileUrl)`);
    if (cols.includes('replyToId')) sets.push(`reply_to_id = COALESCE(reply_to_id, replyToId)`);
    if (cols.includes('createdAt')) sets.push(`created_at = COALESCE(NULLIF(created_at, ''), createdAt, '${nowIso()}')`);
    else sets.push(`created_at = COALESCE(NULLIF(created_at, ''), '${nowIso()}')`);
    sets.push(`type = COALESCE(NULLIF(type, ''), CASE WHEN media_url IS NOT NULL THEN 'file' ELSE 'text' END)`);
    sets.push(`meta_json = COALESCE(NULLIF(meta_json, ''), '{}')`);
    db.exec(`UPDATE messages SET ${sets.join(', ')}`);
  }
};

const createIndexes = (db) => {
  db.exec(`
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

const importLegacyJsonIfNeeded = (db) => {
  if (!fs.existsSync(legacyJsonFile) || countRows(db, 'users') > 0) return;
  let legacy;
  try {
    legacy = JSON.parse(fs.readFileSync(legacyJsonFile, 'utf8'));
  } catch {
    return;
  }

  const insertUser = db.prepare(`
    INSERT OR IGNORE INTO users (
      id, phone, email, username, display_name, password_hash, bio, avatar_url, locale, theme,
      last_seen, is_admin, privacy_last_seen, privacy_status_views, privacy_read_receipts, created_at
    ) VALUES (
      @id, @phone, @email, @username, @display_name, @password_hash, @bio, @avatar_url, @locale, @theme,
      @last_seen, @is_admin, @privacy_last_seen, @privacy_status_views, @privacy_read_receipts, @created_at
    )
  `);

  for (const user of legacy.users || []) {
    insertUser.run({
      id: user.id || createId('usr'),
      phone: user.phone || null,
      email: user.email || null,
      username: user.username || `user_${Math.random().toString(36).slice(2, 8)}`,
      display_name: user.displayName || user.name || user.username || 'User',
      password_hash: user.passwordHash || user.password || '',
      bio: user.bio || '',
      avatar_url: user.avatarUrl || user.avatar || null,
      locale: user.locale || 'ar',
      theme: user.theme || 'dark',
      last_seen: user.lastSeen || nowIso(),
      is_admin: user.isAdmin ? 1 : 0,
      privacy_last_seen: user.privacyLastSeen || 'contacts',
      privacy_status_views: user.privacyStatusViews || 'contacts',
      privacy_read_receipts: user.privacyReadReceipts === false ? 0 : 1,
      created_at: user.createdAt || nowIso(),
    });
  }
};

const seedDemoDataIfEmpty = async (db) => {
  if (countRows(db, 'users') > 0) return;
  const adminId = process.env.ADMIN_ID || createId('usr');
  const adminHash = await bcrypt.hash(process.env.ADMIN_PASSWORD || '548519', 10);
  db.prepare(`
    INSERT INTO users (
      id, phone, email, username, display_name, password_hash, bio, avatar_url, locale, theme,
      last_seen, is_admin, privacy_last_seen, privacy_status_views, privacy_read_receipts, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'contacts', 'contacts', 1, ?)
  `).run(adminId, '+970000000001', 'admin@twasol.local', process.env.ADMIN_USERNAME || 'Admin', process.env.ADMIN_DISPLAY_NAME || 'Admin', adminHash, 'جاهز للتجربة والتطوير.', null, 'ar', 'dark', nowIso(), nowIso());
};

const createDb = () => {
  const db = new Database(dbFile);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');
  createSchema(db);
  migrateSchema(db);
  createIndexes(db);
  importLegacyJsonIfNeeded(db);
  return db;
};

const db = createDb();
await seedDemoDataIfEmpty(db);

export default db;
