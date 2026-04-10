import { Server } from 'socket.io';
import db from '../db/index.js';
import { verifyToken } from '../utils/auth.js';
import { nowIso } from '../utils/helpers.js';
import { isOriginAllowed } from '../config.js';

let io;
const activeSockets = new Map();

const memberConversationIds = (userId) => db.prepare(`
  SELECT conversation_id FROM conversation_members WHERE user_id = ?
`).all(userId).map((row) => row.conversation_id);

const emitPresence = (userId, isOnline) => io?.emit('presence:update', { userId, isOnline, lastSeen: nowIso() });
export const getIo = () => io;
export const emitConversationUpdate = (conversationId, event, payload) => io?.to(conversationId).emit(event, payload);
export const emitUserEvent = (userId, event, payload) => io?.to(`user:${userId}`).emit(event, payload);
export const emitStatusUpdate = (payload = {}) => io?.emit('status:update', { ...payload, emittedAt: nowIso() });
export const joinUsersToConversationRoom = (conversationId, userIds = []) => {
  if (!io || !conversationId) return;
  for (const userId of [...new Set(userIds)].filter(Boolean)) {
    io.in(`user:${userId}`).socketsJoin(conversationId);
  }
};

const updateCallStatus = (callId, status, endedBy = null) => {
  const stamp = nowIso();
  db.prepare(`
    UPDATE calls
    SET status = ?,
        answered_at = CASE WHEN ? = 'connected' AND answered_at IS NULL THEN ? ELSE answered_at END,
        ended_by = COALESCE(?, ended_by),
        ended_at = CASE WHEN ? IN ('ended', 'rejected', 'busy', 'missed') THEN ? ELSE ended_at END,
        updated_at = ?
    WHERE id = ?
  `).run(status, status, stamp, endedBy, status, stamp, stamp, callId);
};

export const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin(origin, cb) {
        if (isOriginAllowed(origin)) return cb(null, true);
        return cb(new Error('Not allowed by CORS'));
      },
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Unauthorized'));
      const payload = verifyToken(token);
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.userId);
      if (!user) return next(new Error('Unauthorized'));
      socket.user = user;
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.user.id;
    const existing = activeSockets.get(userId) || new Set();
    existing.add(socket.id);
    activeSockets.set(userId, existing);

    socket.join(`user:${userId}`);
    for (const conversationId of memberConversationIds(userId)) socket.join(conversationId);

    db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').run(nowIso(), userId);
    emitPresence(userId, true);
    socket.emit('presence:snapshot', { onlineUserIds: Array.from(activeSockets.keys()) });

    socket.on('presence:ping', () => {
      db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').run(nowIso(), userId);
      emitPresence(userId, true);
    });

    socket.on('conversation:join', ({ conversationId }) => socket.join(conversationId));
    socket.on('typing:start', ({ conversationId }) => socket.to(conversationId).emit('typing:update', { conversationId, userId, displayName: socket.user.display_name, isTyping: true }));
    socket.on('typing:stop', ({ conversationId }) => socket.to(conversationId).emit('typing:update', { conversationId, userId, displayName: socket.user.display_name, isTyping: false }));

    socket.on('call:start', ({ callId, conversationId, kind }) => {
      updateCallStatus(callId, 'ringing');
      socket.to(conversationId).emit('call:incoming', {
        callId,
        conversationId,
        kind,
        from: { id: socket.user.id, displayName: socket.user.display_name, avatarUrl: socket.user.avatar_url },
      });
    });
    socket.on('call:offer', ({ callId, conversationId, offer, toUserId, kind }) => {
      io.to(`user:${toUserId}`).emit('call:offer', {
        callId,
        conversationId,
        offer,
        kind,
        fromUserId: userId,
        from: { id: socket.user.id, displayName: socket.user.display_name, avatarUrl: socket.user.avatar_url },
      });
    });
    socket.on('call:answer', ({ callId, answer, toUserId }) => {
      updateCallStatus(callId, 'connected');
      io.to(`user:${toUserId}`).emit('call:answer', { callId, answer, fromUserId: userId });
    });

    socket.on('call:status', ({ callId, conversationId, status, toUserId }) => {
      if (!callId || !status) return;
      updateCallStatus(callId, status, ['ended', 'rejected', 'busy', 'missed'].includes(status) ? userId : null);
      if (toUserId) io.to(`user:${toUserId}`).emit('call:status', { callId, conversationId, status, fromUserId: userId });
      else socket.to(conversationId).emit('call:status', { callId, conversationId, status, fromUserId: userId });
    });
    socket.on('call:reject', ({ callId, toUserId }) => {
      updateCallStatus(callId, 'rejected', userId);
      io.to(`user:${toUserId}`).emit('call:reject', { callId, fromUserId: userId });
    });
    socket.on('call:busy', ({ callId, toUserId }) => {
      updateCallStatus(callId, 'busy', userId);
      io.to(`user:${toUserId}`).emit('call:busy', { callId, fromUserId: userId });
    });
    socket.on('call:ice', ({ callId, candidate, toUserId }) => {
      io.to(`user:${toUserId}`).emit('call:ice', { callId, candidate, fromUserId: userId });
    });
    socket.on('call:end', ({ callId, conversationId }) => {
      updateCallStatus(callId, 'ended', userId);
      socket.to(conversationId).emit('call:end', { callId, byUserId: userId });
    });

    socket.on('disconnect', () => {
      const ids = activeSockets.get(userId);
      if (!ids) return;
      ids.delete(socket.id);
      if (!ids.size) {
        activeSockets.delete(userId);
        db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').run(nowIso(), userId);
        emitPresence(userId, false);
      }
    });
  });

  return io;
};
