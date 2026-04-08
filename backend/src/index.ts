import express, { type NextFunction, type Request, type Response } from 'express';
import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import prisma from './prisma';
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import roomRoutes from './routes/rooms';
import roomAdminRoutes from './routes/roomAdmin';
import messageRoutes from './routes/messages';
import uploadRoutes from './routes/upload';
import mediaRoutes from './routes/media';
import storyRoutes from './routes/stories';
import blockRoutes from './routes/blocks';
import inviteRoutes from './routes/invites';
import pollRoutes from './routes/polls';
import scheduledRoutes from './routes/scheduled';
import reportRoutes from './routes/reports';
import quickReplyRoutes from './routes/quickReplies';
import auditRoutes from './routes/audit';
import exportRoutes from './routes/export';
import privacyRoutes from './routes/privacy';
import stickerRoutes from './routes/stickers';
import commerceRoutes from './routes/commerce';
import automationRoutes from './routes/automation';
import productivityRoutes from './routes/productivity';
import aiRoutes from './routes/ai';
import pushRoutes from './routes/push';
import { authenticateSocket } from './middleware/auth';
import { setupChatHandlers } from './socket';
import { uploadsDir } from './middleware/upload';
import { getAllowedOrigins, isHttpsEnabled, isOriginAllowed } from './utils/config';

dotenv.config();
const app = express();
const APP_VERSION = '6.48.3';
const allowedOrigins = getAllowedOrigins();
const useHttps = isHttpsEnabled();
const allowPublicUploads = /^(1|true|yes)$/i.test(process.env.ALLOW_PUBLIC_UPLOADS || '');
const sslKeyFile = process.env.SSL_KEY_FILE?.trim();
const sslCertFile = process.env.SSL_CERT_FILE?.trim();
const frontendBuildDir = path.resolve(process.cwd(), '..', 'frontend', 'build');
const frontendIndexFile = path.join(frontendBuildDir, 'index.html');
const serveFrontendBuild = /^(1|true|yes)$/i.test(process.env.SERVE_FRONTEND_BUILD || '') || (useHttps && fs.existsSync(frontendIndexFile));

const trustProxyHopsRaw = String(process.env.TRUST_PROXY_HOPS || process.env.TRUST_PROXY || '').trim();
const trustProxyHops = trustProxyHopsRaw === '' || /^(1|true|yes)$/i.test(trustProxyHopsRaw) ? 1 : Number(trustProxyHopsRaw);
if (Number.isFinite(trustProxyHops) && trustProxyHops > 0) app.set('trust proxy', trustProxyHops);

function resolveOptionalFile(filePath?: string | null) {
  if (!filePath) return '';
  return path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
}

const createHttpServer = () => http.createServer(app);
const createHttpsServer = () => {
  const keyPath = resolveOptionalFile(sslKeyFile);
  const certPath = resolveOptionalFile(sslCertFile);
  if (!keyPath || !certPath || !fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
    throw new Error('HTTPS is enabled but SSL_KEY_FILE / SSL_CERT_FILE are missing or invalid.');
  }
  return https.createServer({ key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) }, app);
};

const server = useHttps ? createHttpsServer() : createHttpServer();
const io = new Server(server, {
  cors: {
    origin(origin, callback) {
      if (isOriginAllowed(origin, allowedOrigins)) return callback(null, true);
      return callback(new Error(`Socket CORS blocked for origin: ${origin || 'unknown'}`));
    },
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  maxHttpBufferSize: 50e6,
});

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin(origin, callback) {
    if (isOriginAllowed(origin, allowedOrigins)) return callback(null, true);
    return callback(new Error(`CORS blocked for origin: ${origin || 'unknown'}`));
  },
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));

const globalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 500 });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30 });
const uploadLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 120 });
const aiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 60 });
app.use(globalLimiter);
if (allowPublicUploads) {
  app.use('/uploads', express.static(uploadsDir, {
    index: false,
    setHeaders(res) {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'private, max-age=300');
    },
  }));
}

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/upload', uploadLimiter);
app.use('/api/ai', aiLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/rooms', roomAdminRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/stories', storyRoutes);
app.use('/api/blocks', blockRoutes);
app.use('/api/invites', inviteRoutes);
app.use('/api/polls', pollRoutes);
app.use('/api/scheduled', scheduledRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/quick-replies', quickReplyRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/privacy', privacyRoutes);
app.use('/api/stickers', stickerRoutes);
app.use('/api/commerce', commerceRoutes);
app.use('/api/automation', automationRoutes);
app.use('/api', productivityRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/push', pushRoutes);

if (serveFrontendBuild && fs.existsSync(frontendIndexFile)) {
  app.use(express.static(frontendBuildDir, {
    index: false,
    maxAge: '1h',
    setHeaders(res, filePath) {
      if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-store');
    },
  }));

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/socket.io/') || req.path.startsWith('/uploads/')) return next();
    return res.sendFile(frontendIndexFile);
  });
}

app.get('/api/health', (_req, res) => res.json({
  status: 'ok',
  version: APP_VERSION,
  uptimeSec: Math.floor(process.uptime()),
  socketClients: io.engine.clientsCount,
  checkedAt: new Date().toISOString(),
  allowedOrigins: allowedOrigins.length,
  publicUploads: allowPublicUploads,
  serveFrontendBuild,
  protocol: useHttps ? 'https' : 'http',
}));

io.use(authenticateSocket);
io.on('connection', (socket) => {
  console.log('User connected:', socket.data.userId);
  socket.join(`user_${socket.data.userId}`);
  setupChatHandlers(io, socket, prisma);
});

setInterval(async () => {
  try {
    await prisma.story.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  } catch (err) {
    console.error('story cleanup failed', err);
  }
}, 3_600_000);

setInterval(async () => {
  try {
    const expired = await prisma.message.findMany({ where: { expiresAt: { lt: new Date() }, isDeleted: false }, select: { id: true, conversationId: true } });
    for (const msg of expired) {
      await prisma.message.update({ where: { id: msg.id }, data: { isDeleted: true, text: null, fileUrl: null, fileName: null, fileSize: null } });
      const members = await prisma.conversationMember.findMany({ where: { conversationId: msg.conversationId, isBanned: false } });
      for (const m of members) io.to(`user_${m.userId}`).emit('message_deleted', { messageId: msg.id, conversationId: msg.conversationId });
    }
  } catch (err) {
    console.error('message expiry cleanup failed', err);
  }
}, 30_000);

setInterval(async () => {
  try {
    const due = await prisma.scheduledMessage.findMany({ where: { isSent: false, scheduledAt: { lte: new Date() } } });
    for (const sm of due) {
      const message = await prisma.message.create({ data: { text: sm.text, senderId: sm.senderId, conversationId: sm.conversationId, type: sm.type, fileUrl: sm.fileUrl, fileName: sm.fileName }, include: { sender: { select: { id: true, name: true, avatar: true } } } });
      await prisma.scheduledMessage.update({ where: { id: sm.id }, data: { isSent: true } });
      const members = await prisma.conversationMember.findMany({ where: { conversationId: sm.conversationId, isBanned: false } });
      for (const m of members) io.to(`user_${m.userId}`).emit('new_message', message);
    }
  } catch (err) {
    console.error('scheduled message worker failed', err);
  }
}, 10_000);

setInterval(async () => {
  try {
    const due = await prisma.reminder.findMany({ where: { isSent: false, remindAt: { lte: new Date() } } });
    for (const reminder of due) {
      io.to(`user_${reminder.userId}`).emit('reminder', { id: reminder.id, text: reminder.text, messageId: reminder.messageId });
      await prisma.reminder.update({ where: { id: reminder.id }, data: { isSent: true } });
    }
  } catch (err) {
    console.error('reminder worker failed', err);
  }
}, 15_000);

setInterval(async () => {
  try {
    await prisma.user.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  } catch (err) {
    console.error('expired user cleanup failed', err);
  }
}, 3_600_000);

const PORT = Number(process.env.PORT) || 4000;
const BIND_HOST = process.env.BIND_HOST?.trim() || '0.0.0.0';
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const details = err instanceof Error ? err.message : typeof err === 'string' ? err : 'unknown';
  console.error('Unhandled API error:', details);
  const isProd = process.env.NODE_ENV === 'production';
  res.status(500).json({ error: 'Internal server error', ...(isProd ? {} : { details }) });
});

server.listen(PORT, BIND_HOST, () => console.log(`Twasol Pro v${APP_VERSION} on ${useHttps ? 'https' : 'http'}://${BIND_HOST}:${PORT}`));
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
