import db from '../db/index.js';
import { createId, nowIso } from '../utils/helpers.js';
import { createSignedMediaUrl } from '../utils/media.js';

export const sanitizeUser = (user) => ({
  id: user.id,
  phone: user.phone,
  email: user.email,
  username: user.username,
  displayName: user.display_name,
  bio: user.bio,
  avatarUrl: user.avatar_url,
  locale: user.locale,
  theme: user.theme,
  isAdmin: Boolean(user.is_admin),
  lastSeen: user.last_seen,
  privacyLastSeen: user.privacy_last_seen,
  privacyStatusViews: user.privacy_status_views,
  privacyReadReceipts: Boolean(user.privacy_read_receipts),
  createdAt: user.created_at,
});

export const canAccessConversation = async (userId, conversationId) => Boolean(await db.prepare(`
  SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?
`).get(conversationId, userId));

export const getMemberRole = async (conversationId, userId) => (
  await db.prepare(`SELECT role FROM conversation_members WHERE conversation_id = ? AND user_id = ?`).get(conversationId, userId)
)?.role || null;

export const canManageConversation = async (conversationId, userId) => ['owner', 'admin'].includes(await getMemberRole(conversationId, userId));

const buildConversationTitle = async (base, currentUserId) => {
  if (base.type !== 'direct') return base.title || 'Untitled';
  const other = await db.prepare(`
    SELECT u.display_name AS "displayName"
    FROM conversation_members cm
    JOIN users u ON u.id = cm.user_id
    WHERE cm.conversation_id = ? AND cm.user_id != ?
    LIMIT 1
  `).get(base.id, currentUserId);
  return other?.displayName || base.title || 'Direct chat';
};

const listMembers = async (conversationId) => db.prepare(`
  SELECT u.id, u.display_name AS "displayName", u.username, u.avatar_url AS "avatarUrl", u.last_seen AS "lastSeen",
         cm.role, cm.joined_at AS "joinedAt"
  FROM conversation_members cm
  JOIN users u ON u.id = cm.user_id
  WHERE cm.conversation_id = ?
  ORDER BY CASE cm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, u.display_name ASC
`).all(conversationId);

const unreadCountFor = async (conversationId, userId) => {
  const row = await db.prepare(`
    SELECT COUNT(*)::int AS count
    FROM messages m
    LEFT JOIN message_reads mr ON mr.message_id = m.id AND mr.user_id = ?
    WHERE m.conversation_id = ?
      AND m.sender_id != ?
      AND m.deleted_at IS NULL
      AND mr.read_at IS NULL
  `).get(userId, conversationId, userId);
  return row?.count || 0;
};

export const getConversationSummary = async (conversationId, currentUserId) => {
  const base = await db.prepare(`
    SELECT c.*, cm.role AS my_role, cm.archived, cm.pinned, cm.muted_until, cm.last_read_at,
           latest.id AS last_message_id,
           latest.text AS last_message_text,
           latest.type AS last_message_type,
           latest.media_name AS last_message_media_name,
           latest.created_at AS last_message_at,
           latest.deleted_at AS last_message_deleted_at
    FROM conversations c
    JOIN conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = ?
    LEFT JOIN messages latest ON latest.id = (
      SELECT id FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1
    )
    WHERE c.id = ?
  `).get(currentUserId, conversationId);
  if (!base) return null;
  const [members, title, unreadCount] = await Promise.all([
    listMembers(conversationId),
    buildConversationTitle(base, currentUserId),
    unreadCountFor(conversationId, currentUserId),
  ]);
  return {
    id: base.id,
    type: base.type,
    title,
    rawTitle: base.title,
    description: base.description,
    avatarUrl: base.avatar_url,
    createdBy: base.created_by,
    createdAt: base.created_at,
    inviteCode: base.invite_code,
    settings: JSON.parse(base.settings_json || '{}'),
    myRole: base.my_role,
    archived: Boolean(base.archived),
    pinned: Boolean(base.pinned),
    mutedUntil: base.muted_until,
    members,
    unreadCount,
    lastMessageAt: base.last_message_at,
    lastMessageText: base.last_message_deleted_at ? 'Message deleted' : (base.last_message_text || base.last_message_media_name || base.last_message_type || ''),
  };
};

export const listUserConversations = async (userId, { includeArchived = true } = {}) => {
  const rows = await db.prepare(`
    SELECT conversation_id
    FROM conversation_members
    WHERE user_id = ?
    ${includeArchived ? '' : 'AND archived = 0'}
  `).all(userId);
  const summaries = await Promise.all(rows.map((row) => getConversationSummary(row.conversation_id, userId)));
  return summaries.filter(Boolean).sort((a, b) => {
    const pinDelta = Number(b.pinned) - Number(a.pinned);
    if (pinDelta) return pinDelta;
    return String(b.lastMessageAt || b.createdAt).localeCompare(String(a.lastMessageAt || a.createdAt));
  });
};

export const listMessages = async (conversationId, currentUserId, { before = null, limit = 40 } = {}) => {
  const rows = (before
    ? await db.prepare(`
      SELECT m.*, u.display_name AS sender_name, u.avatar_url AS sender_avatar,
             reply.id AS reply_id, reply.text AS reply_text, reply.type AS reply_type,
             reply.media_name AS reply_media_name, ru.display_name AS reply_sender_name,
             CASE WHEN sm.user_id IS NULL THEN 0 ELSE 1 END AS is_starred
      FROM messages m
      JOIN users u ON u.id = m.sender_id
      LEFT JOIN messages reply ON reply.id = m.reply_to_id
      LEFT JOIN users ru ON ru.id = reply.sender_id
      LEFT JOIN starred_messages sm ON sm.message_id = m.id AND sm.user_id = ?
      WHERE m.conversation_id = ? AND m.created_at < ?
      ORDER BY m.created_at DESC LIMIT ?
    `).all(currentUserId, conversationId, before, limit)
    : await db.prepare(`
      SELECT m.*, u.display_name AS sender_name, u.avatar_url AS sender_avatar,
             reply.id AS reply_id, reply.text AS reply_text, reply.type AS reply_type,
             reply.media_name AS reply_media_name, ru.display_name AS reply_sender_name,
             CASE WHEN sm.user_id IS NULL THEN 0 ELSE 1 END AS is_starred
      FROM messages m
      JOIN users u ON u.id = m.sender_id
      LEFT JOIN messages reply ON reply.id = m.reply_to_id
      LEFT JOIN users ru ON ru.id = reply.sender_id
      LEFT JOIN starred_messages sm ON sm.message_id = m.id AND sm.user_id = ?
      WHERE m.conversation_id = ?
      ORDER BY m.created_at DESC LIMIT ?
    `).all(currentUserId, conversationId, limit)).reverse();

  const enriched = await Promise.all(rows.map(async (row) => {
    const [reactions, reads] = await Promise.all([
      db.prepare(`
        SELECT r.id, r.emoji, r.user_id AS "userId", u.display_name AS "displayName"
        FROM reactions r JOIN users u ON u.id = r.user_id
        WHERE r.message_id = ? ORDER BY r.created_at ASC
      `).all(row.id),
      db.prepare(`
        SELECT mr.user_id AS "userId", mr.read_at AS "readAt", u.display_name AS "displayName"
        FROM message_reads mr JOIN users u ON u.id = mr.user_id
        WHERE mr.message_id = ? ORDER BY mr.read_at DESC
      `).all(row.id),
    ]);

    return {
      id: row.id,
      conversationId: row.conversation_id,
      senderId: row.sender_id,
      senderName: row.sender_name,
      senderAvatar: row.sender_avatar,
      type: row.type,
      text: row.deleted_at ? 'This message was deleted' : row.text,
      mediaUrl: row.deleted_at ? null : (row.media_id ? createSignedMediaUrl({ mediaId: row.media_id, viewerUserId: currentUserId }) : (row.media_url?.startsWith('/uploads/') ? createSignedMediaUrl({ legacy: row.media_url.replace('/uploads/', ''), viewerUserId: currentUserId }) : row.media_url)),
      mediaName: row.deleted_at ? null : row.media_name,
      mediaSize: row.media_size,
      mediaMime: row.media_mime || null,
      replyToId: row.reply_to_id,
      forwardedFromId: row.forwarded_from_id,
      editedAt: row.edited_at,
      deletedAt: row.deleted_at,
      createdAt: row.created_at,
      starred: Boolean(row.is_starred),
      reactions,
      reads,
      meta: (() => {
        try {
          return row.meta_json ? JSON.parse(row.meta_json) : {};
        } catch {
          return {};
        }
      })(),
      readByOthers: row.sender_id === currentUserId ? reads.some((entry) => entry.userId !== currentUserId) : false,
      replyTo: row.reply_id ? { id: row.reply_id, text: row.reply_text, type: row.reply_type, mediaName: row.reply_media_name, senderName: row.reply_sender_name } : null,
    };
  }));

  return enriched;
};

export const createDirectConversation = async (userId, otherUserId) => {
  const existing = await db.prepare(`
    SELECT c.id
    FROM conversations c
    JOIN conversation_members cm1 ON cm1.conversation_id = c.id AND cm1.user_id = ?
    JOIN conversation_members cm2 ON cm2.conversation_id = c.id AND cm2.user_id = ?
    WHERE c.type = 'direct'
    LIMIT 1
  `).get(userId, otherUserId);
  if (existing) return existing.id;

  const conversationId = createId('conv');
  const tx = db.transaction(async () => {
    await db.prepare(`
      INSERT INTO conversations (id, type, title, description, avatar_url, created_by, invite_code, settings_json, created_at)
      VALUES (?, 'direct', '', '', NULL, ?, NULL, '{}', ?)
    `).run(conversationId, userId, nowIso());
    for (const [index, memberId] of [userId, otherUserId].entries()) {
      await db.prepare(`
        INSERT INTO conversation_members (id, conversation_id, user_id, role, joined_at, archived, pinned, muted_until, last_read_at)
        VALUES (?, ?, ?, ?, ?, 0, 0, NULL, NULL)
      `).run(createId('mem'), conversationId, memberId, index === 0 ? 'owner' : 'member', nowIso());
    }
  });
  await tx();
  return conversationId;
};

export const createSharedConversation = async ({ creatorId, type, title, description = '', memberIds = [] }) => {
  const conversationId = createId('conv');
  const inviteCode = createId('join').replace('join_', '').slice(0, 10);
  const uniqueMembers = Array.from(new Set([creatorId, ...memberIds]));
  const settings = { onlyAdminsCanPost: false, disappearingHours: 0 };
  const tx = db.transaction(async () => {
    await db.prepare(`
      INSERT INTO conversations (id, type, title, description, avatar_url, created_by, invite_code, settings_json, created_at)
      VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?)
    `).run(conversationId, type, title, description, creatorId, inviteCode, JSON.stringify(settings), nowIso());
    for (const [index, memberId] of uniqueMembers.entries()) {
      await db.prepare(`
        INSERT INTO conversation_members (id, conversation_id, user_id, role, joined_at, archived, pinned, muted_until, last_read_at)
        VALUES (?, ?, ?, ?, ?, 0, 0, NULL, NULL)
      `).run(createId('mem'), conversationId, memberId, index === 0 ? 'owner' : 'member', nowIso());
    }
  });
  await tx();
  return conversationId;
};

export const createMessage = async ({ conversationId, senderId, type = 'text', text = '', mediaUrl = null, mediaName = null, mediaSize = null, mediaId = null, mediaMime = null, replyToId = null, forwardedFromId = null, meta = {} }) => {
  const messageId = createId('msg');
  const tx = db.transaction(async () => {
    await db.prepare(`
      INSERT INTO messages (id, conversation_id, sender_id, type, text, media_url, media_name, media_size, reply_to_id, forwarded_from_id, edited_at, deleted_at, meta_json, media_id, media_mime, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?)
    `).run(messageId, conversationId, senderId, type, text, mediaUrl, mediaName, mediaSize, replyToId, forwardedFromId, JSON.stringify(meta || {}), mediaId, mediaMime, nowIso());

    await db.prepare(`INSERT OR REPLACE INTO message_reads (message_id, user_id, read_at) VALUES (?, ?, ?)`).run(messageId, senderId, nowIso());
    await db.prepare(`UPDATE conversation_members SET archived = 0 WHERE conversation_id = ?`).run(conversationId);
  });
  await tx();
  return (await listMessages(conversationId, senderId, { limit: 1 })).at(-1);
};

export const updateMessage = async ({ conversationId, messageId, senderId, text }) => {
  const row = await db.prepare(`SELECT id, sender_id, deleted_at FROM messages WHERE id = ? AND conversation_id = ?`).get(messageId, conversationId);
  if (!row || row.deleted_at || row.sender_id !== senderId) return null;
  await db.prepare(`UPDATE messages SET text = ?, edited_at = ? WHERE id = ?`).run(text, nowIso(), messageId);
  return (await listMessages(conversationId, senderId)).find((message) => message.id === messageId) || null;
};

export const deleteMessage = async ({ conversationId, messageId, actorId }) => {
  const row = await db.prepare(`
    SELECT id, sender_id, deleted_at
    FROM messages
    WHERE id = ? AND conversation_id = ?
  `).get(messageId, conversationId);
  if (!row || row.deleted_at || row.sender_id !== actorId) return null;
  await db.prepare(`UPDATE messages SET text = '', media_url = NULL, media_name = NULL, media_size = NULL, deleted_at = ?, edited_at = NULL WHERE id = ?`).run(nowIso(), messageId);
  return (await listMessages(conversationId, actorId)).find((message) => message.id === messageId) || null;
};

export const toggleStarMessage = async ({ messageId, userId }) => {
  const exists = await db.prepare(`SELECT 1 FROM starred_messages WHERE user_id = ? AND message_id = ?`).get(userId, messageId);
  if (exists) {
    await db.prepare('DELETE FROM starred_messages WHERE user_id = ? AND message_id = ?').run(userId, messageId);
    return false;
  }
  await db.prepare(`INSERT INTO starred_messages (user_id, message_id, created_at) VALUES (?, ?, ?)`)
    .run(userId, messageId, nowIso());
  return true;
};

export const markConversationReadSafe = async (conversationId, userId, messageId = null) => {
  const rows = messageId
    ? await db.prepare(`
      SELECT id FROM messages WHERE conversation_id = ? AND created_at <= (SELECT created_at FROM messages WHERE id = ?)
    `).all(conversationId, messageId)
    : await db.prepare(`SELECT id FROM messages WHERE conversation_id = ?`).all(conversationId);

  const tx = db.transaction(async () => {
    for (const row of rows) {
      await db.prepare(`INSERT OR REPLACE INTO message_reads (message_id, user_id, read_at) VALUES (?, ?, ?)`).run(row.id, userId, nowIso());
    }
    await db.prepare(`UPDATE conversation_members SET last_read_at = ? WHERE conversation_id = ? AND user_id = ?`).run(nowIso(), conversationId, userId);
  });
  await tx();
};

export const joinConversationViaInvite = async ({ inviteCode, userId }) => {
  const conversation = await db.prepare(`SELECT id FROM conversations WHERE invite_code = ?`).get(inviteCode);
  if (!conversation) return null;
  const member = await db.prepare(`SELECT id FROM conversation_members WHERE conversation_id = ? AND user_id = ?`).get(conversation.id, userId);
  if (!member) {
    await db.prepare(`
      INSERT INTO conversation_members (id, conversation_id, user_id, role, joined_at, archived, pinned, muted_until, last_read_at)
      VALUES (?, ?, ?, 'member', ?, 0, 0, NULL, NULL)
    `).run(createId('mem'), conversation.id, userId, nowIso());
  }
  return conversation.id;
};
