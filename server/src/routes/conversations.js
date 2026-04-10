import express from 'express';
import db from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';
import { clamp, createId, nowIso } from '../utils/helpers.js';
import { validateConversationTitle, validateMessagePayload } from '../utils/validate.js';
import {
  canAccessConversation,
  canManageConversation,
  createDirectConversation,
  createMessage,
  createSharedConversation,
  deleteMessage,
  getConversationSummary,
  joinConversationViaInvite,
  listMessages,
  listUserConversations,
  markConversationReadSafe,
  toggleStarMessage,
  updateMessage,
} from '../services/conversations.js';
import { emitConversationUpdate, emitUserEvent, joinUsersToConversationRoom } from '../services/socket.js';
import { createSignedMediaUrl, encryptAndStoreMedia } from '../utils/media.js';

const router = express.Router();
router.use(requireAuth);

const blockedBetween = (a, b) => db.prepare(`
  SELECT 1 FROM blocks
  WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)
`).get(a, b, b, a);

const normalizeMuteUntil = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

const pushConversationUpdateToMembers = (conversationId) => {
  const memberIds = db.prepare('SELECT user_id FROM conversation_members WHERE conversation_id = ?').all(conversationId);
  for (const row of memberIds) emitUserEvent(row.user_id, 'conversation:update', getConversationSummary(conversationId, row.user_id));
};

router.get('/', (req, res) => res.json({ conversations: listUserConversations(req.user.id) }));

router.post('/direct', (req, res) => {
  const userId = req.body.userId;
  if (!userId || userId === req.user.id) return res.status(400).json({ error: 'A different userId is required' });
  if (blockedBetween(req.user.id, userId)) return res.status(403).json({ error: 'Direct chat unavailable because one side blocked the other.' });
  const conversationId = createDirectConversation(req.user.id, userId);
  const summary = getConversationSummary(conversationId, req.user.id);
  joinUsersToConversationRoom(conversationId, summary.members.map((member) => member.id));
  summary.members.forEach((member) => emitUserEvent(member.id, 'conversation:new', getConversationSummary(conversationId, member.id)));
  res.status(201).json({ conversation: summary });
});

router.post('/', (req, res) => {
  const type = req.body.type;
  if (!['group', 'channel'].includes(type)) return res.status(400).json({ error: 'type must be group or channel' });
  const validTitle = validateConversationTitle(req.body.title);
  if (validTitle.error) return res.status(400).json({ error: validTitle.error });
  const conversationId = createSharedConversation({
    creatorId: req.user.id,
    type,
    title: validTitle.value,
    description: String(req.body.description || '').trim(),
    memberIds: Array.isArray(req.body.memberIds) ? req.body.memberIds : [],
  });
  const summary = getConversationSummary(conversationId, req.user.id);
  joinUsersToConversationRoom(conversationId, summary.members.map((member) => member.id));
  summary.members.forEach((member) => emitUserEvent(member.id, 'conversation:new', getConversationSummary(conversationId, member.id)));
  res.status(201).json({ conversation: summary });
});

router.post('/join/:inviteCode', (req, res) => {
  const conversationId = joinConversationViaInvite({ inviteCode: req.params.inviteCode, userId: req.user.id });
  if (!conversationId) return res.status(404).json({ error: 'Invite not found' });
  const summary = getConversationSummary(conversationId, req.user.id);
  joinUsersToConversationRoom(conversationId, summary.members.map((member) => member.id));
  pushConversationUpdateToMembers(conversationId);
  res.json({ conversation: summary });
});

router.get('/:conversationId', (req, res) => {
  if (!canAccessConversation(req.user.id, req.params.conversationId)) return res.status(403).json({ error: 'Forbidden' });
  res.json({ conversation: getConversationSummary(req.params.conversationId, req.user.id) });
});

router.put('/:conversationId', (req, res) => {
  const { conversationId } = req.params;
  if (!canAccessConversation(req.user.id, conversationId)) return res.status(403).json({ error: 'Forbidden' });
  if (!canManageConversation(conversationId, req.user.id)) return res.status(403).json({ error: 'Only admins can update this conversation' });
  db.prepare(`
    UPDATE conversations
    SET title = COALESCE(?, title),
        description = COALESCE(?, description),
        avatar_url = COALESCE(?, avatar_url),
        settings_json = COALESCE(?, settings_json)
    WHERE id = ?
  `).run(
    req.body.title === undefined ? null : String(req.body.title || '').trim(),
    req.body.description === undefined ? null : String(req.body.description || '').trim(),
    req.body.avatarUrl ?? null,
    req.body.settings === undefined ? null : JSON.stringify(req.body.settings),
    conversationId,
  );
  pushConversationUpdateToMembers(conversationId);
  res.json({ conversation: getConversationSummary(conversationId, req.user.id) });
});

router.post('/:conversationId/invite', (req, res) => {
  const { conversationId } = req.params;
  if (!canManageConversation(conversationId, req.user.id)) return res.status(403).json({ error: 'Only admins can create invites' });
  const code = createId('join').replace('join_', '').slice(0, 10);
  db.prepare('UPDATE conversations SET invite_code = ? WHERE id = ?').run(code, conversationId);
  res.json({ inviteCode: code });
});

router.post('/:conversationId/members', (req, res) => {
  const { conversationId } = req.params;
  if (!canManageConversation(conversationId, req.user.id)) return res.status(403).json({ error: 'Only admins can add members' });
  const memberIds = Array.isArray(req.body.memberIds) ? req.body.memberIds : [];
  const tx = db.transaction(() => {
    for (const memberId of memberIds) {
      db.prepare(`
        INSERT OR IGNORE INTO conversation_members (id, conversation_id, user_id, role, joined_at, archived, pinned, muted_until, last_read_at)
        VALUES (?, ?, ?, 'member', ?, 0, 0, NULL, NULL)
      `).run(createId('mem'), conversationId, memberId, nowIso());
    }
  });
  tx();
  pushConversationUpdateToMembers(conversationId);
  res.json({ conversation: getConversationSummary(conversationId, req.user.id) });
});

router.put('/:conversationId/members/:userId', (req, res) => {
  const { conversationId, userId } = req.params;
  if (!canManageConversation(conversationId, req.user.id)) return res.status(403).json({ error: 'Only admins can update roles' });
  const role = req.body.role;
  if (!['admin', 'member'].includes(role)) return res.status(400).json({ error: 'role must be admin or member' });
  db.prepare('UPDATE conversation_members SET role = ? WHERE conversation_id = ? AND user_id = ?').run(role, conversationId, userId);
  pushConversationUpdateToMembers(conversationId);
  res.json({ conversation: getConversationSummary(conversationId, req.user.id) });
});

router.delete('/:conversationId/members/:userId', (req, res) => {
  const { conversationId, userId } = req.params;
  if (!canManageConversation(conversationId, req.user.id) && req.user.id !== userId) return res.status(403).json({ error: 'Forbidden' });
  db.prepare('DELETE FROM conversation_members WHERE conversation_id = ? AND user_id = ?').run(conversationId, userId);
  pushConversationUpdateToMembers(conversationId);
  res.json({ success: true });
});

router.get('/:conversationId/messages', (req, res) => {
  const { conversationId } = req.params;
  if (!canAccessConversation(req.user.id, conversationId)) return res.status(403).json({ error: 'Forbidden' });
  const limit = clamp(req.query.limit || 40, 1, 80);
  const before = req.query.before ? String(req.query.before) : null;
  const messages = listMessages(conversationId, req.user.id, { before, limit });
  res.json({ messages, nextCursor: messages[0]?.createdAt || null, hasMore: messages.length === limit });
});

router.post('/:conversationId/messages', upload.single('file'), (req, res) => {
  const { conversationId } = req.params;
  if (!canAccessConversation(req.user.id, conversationId)) return res.status(403).json({ error: 'Forbidden' });
  const conversation = getConversationSummary(conversationId, req.user.id);
  if (conversation.type === 'channel' && conversation.myRole === 'member' && conversation.settings?.onlyAdminsCanPost) {
    return res.status(403).json({ error: 'Only admins can post in this channel.' });
  }
  const valid = validateMessagePayload({ text: req.body.text, type: req.body.type, hasFile: Boolean(req.file) });
  if (valid.error) return res.status(400).json({ error: valid.error });
  const encryptedMedia = req.file ? encryptAndStoreMedia({ file: req.file, ownerUserId: req.user.id, kind: 'message' }) : null;
  const parsedMeta = (() => {
    try {
      return req.body.meta ? JSON.parse(req.body.meta) : {};
    } catch {
      return {};
    }
  })();
  const message = createMessage({
    conversationId,
    senderId: req.user.id,
    type: valid.type,
    text: valid.text,
    mediaUrl: encryptedMedia ? createSignedMediaUrl({ mediaId: encryptedMedia.mediaId, viewerUserId: req.user.id }) : null,
    mediaName: encryptedMedia ? encryptedMedia.originalName : null,
    mediaSize: encryptedMedia ? encryptedMedia.size : null,
    mediaId: encryptedMedia ? encryptedMedia.mediaId : null,
    mediaMime: encryptedMedia ? encryptedMedia.mimeType : null,
    replyToId: req.body.replyToId || null,
    forwardedFromId: req.body.forwardedFromId || null,
    meta: parsedMeta,
  });
  emitConversationUpdate(conversationId, 'message:new', message);
  pushConversationUpdateToMembers(conversationId);
  res.status(201).json({ message });
});

router.put('/:conversationId/messages/:messageId', (req, res) => {
  const { conversationId, messageId } = req.params;
  if (!canAccessConversation(req.user.id, conversationId)) return res.status(403).json({ error: 'Forbidden' });
  const text = String(req.body.text || '').trim();
  if (!text) return res.status(400).json({ error: 'text is required' });
  const message = updateMessage({ conversationId, messageId, senderId: req.user.id, text });
  if (!message) return res.status(403).json({ error: 'Message cannot be edited' });
  emitConversationUpdate(conversationId, 'message:update', message);
  pushConversationUpdateToMembers(conversationId);
  res.json({ message });
});

router.delete('/:conversationId/messages/:messageId', (req, res) => {
  const { conversationId, messageId } = req.params;
  if (!canAccessConversation(req.user.id, conversationId)) return res.status(403).json({ error: 'Forbidden' });
  const message = deleteMessage({ conversationId, messageId, actorId: req.user.id });
  if (!message) return res.status(403).json({ error: 'Message cannot be deleted' });
  emitConversationUpdate(conversationId, 'message:update', message);
  pushConversationUpdateToMembers(conversationId);
  res.json({ message });
});

router.post('/:conversationId/messages/:messageId/star', (req, res) => {
  const { conversationId, messageId } = req.params;
  if (!canAccessConversation(req.user.id, conversationId)) return res.status(403).json({ error: 'Forbidden' });
  const starred = toggleStarMessage({ messageId, userId: req.user.id });
  const message = listMessages(conversationId, req.user.id).find((item) => item.id === messageId) || null;
  res.json({ starred, message });
});

router.post('/:conversationId/messages/:messageId/forward', (req, res) => {
  const { conversationId, messageId } = req.params;
  const targetConversationId = req.body.targetConversationId;
  if (!canAccessConversation(req.user.id, conversationId) || !canAccessConversation(req.user.id, targetConversationId)) return res.status(403).json({ error: 'Forbidden' });
  const original = db.prepare('SELECT * FROM messages WHERE id = ? AND conversation_id = ?').get(messageId, conversationId);
  if (!original) return res.status(404).json({ error: 'Message not found' });
  const message = createMessage({
    conversationId: targetConversationId,
    senderId: req.user.id,
    type: original.type,
    text: original.text,
    mediaUrl: original.media_id ? createSignedMediaUrl({ mediaId: original.media_id, viewerUserId: req.user.id }) : original.media_url,
    mediaName: original.media_name,
    mediaSize: original.media_size,
    mediaId: original.media_id || null,
    mediaMime: original.media_mime || null,
    forwardedFromId: messageId,
    meta: (() => { try { return original.meta_json ? JSON.parse(original.meta_json) : {}; } catch { return {}; } })(),
  });
  emitConversationUpdate(targetConversationId, 'message:new', message);
  pushConversationUpdateToMembers(targetConversationId);
  res.status(201).json({ message });
});

router.post('/:conversationId/reactions', (req, res) => {
  const { conversationId } = req.params;
  const { messageId, emoji } = req.body;
  if (!canAccessConversation(req.user.id, conversationId)) return res.status(403).json({ error: 'Forbidden' });
  if (!messageId || !emoji) return res.status(400).json({ error: 'messageId and emoji are required' });
  db.prepare(`INSERT OR IGNORE INTO reactions (id, message_id, user_id, emoji, created_at) VALUES (?, ?, ?, ?, ?)`)
    .run(createId('react'), messageId, req.user.id, emoji, nowIso());
  const message = listMessages(conversationId, req.user.id).find((item) => item.id === messageId) || null;
  emitConversationUpdate(conversationId, 'message:update', message);
  res.json({ message });
});

router.post('/:conversationId/read', (req, res) => {
  const { conversationId } = req.params;
  if (!canAccessConversation(req.user.id, conversationId)) return res.status(403).json({ error: 'Forbidden' });
  markConversationReadSafe(conversationId, req.user.id, req.body.messageId || null);
  pushConversationUpdateToMembers(conversationId);
  res.json({ success: true });
});

router.put('/:conversationId/preferences', (req, res) => {
  const { conversationId } = req.params;
  if (!canAccessConversation(req.user.id, conversationId)) return res.status(403).json({ error: 'Forbidden' });
  const current = db.prepare(`SELECT archived, pinned, muted_until FROM conversation_members WHERE conversation_id = ? AND user_id = ?`).get(conversationId, req.user.id);
  db.prepare(`
    UPDATE conversation_members
    SET archived = ?, pinned = ?, muted_until = ?
    WHERE conversation_id = ? AND user_id = ?
  `).run(
    req.body.archived === undefined ? current.archived : Number(Boolean(req.body.archived)),
    req.body.pinned === undefined ? current.pinned : Number(Boolean(req.body.pinned)),
    req.body.mutedUntil === undefined ? current.muted_until : normalizeMuteUntil(req.body.mutedUntil),
    conversationId,
    req.user.id,
  );
  res.json({ conversation: getConversationSummary(conversationId, req.user.id) });
});

router.post('/:conversationId/calls', (req, res) => {
  const { conversationId } = req.params;
  if (!canAccessConversation(req.user.id, conversationId)) return res.status(403).json({ error: 'Forbidden' });
  const callId = createId('call');
  const timestamp = nowIso();
  db.prepare(`INSERT INTO calls (id, conversation_id, creator_id, kind, status, updated_at, created_at) VALUES (?, ?, ?, ?, 'ringing', ?, ?)`)
    .run(callId, conversationId, req.user.id, req.body.kind === 'audio' ? 'audio' : 'video', timestamp, timestamp);
  res.status(201).json({ callId });
});

router.get('/:conversationId/calls', (req, res) => {
  const { conversationId } = req.params;
  if (!canAccessConversation(req.user.id, conversationId)) return res.status(403).json({ error: 'Forbidden' });
  const calls = db.prepare(`
    SELECT c.*, u.display_name AS creatorName
    FROM calls c
    JOIN users u ON u.id = c.creator_id
    WHERE c.conversation_id = ?
    ORDER BY c.created_at DESC
    LIMIT 20
  `).all(conversationId);
  res.json({ calls });
});

export default router;
