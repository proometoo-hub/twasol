import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import './db/index.js';
import { config, isAllowedOrigin } from './config.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import conversationRoutes from './routes/conversations.js';
import statusRoutes from './routes/statuses.js';
import uploadRoutes from './routes/uploads.js';
import mediaRoutes from './routes/media.js';
import { initSocket } from './services/socket.js';
import { basicSecurityHeaders } from './middleware/security.js';
import { rateLimit } from './middleware/rateLimit.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const server = http.createServer(app);

if (config.trustProxy) app.set('trust proxy', config.trustProxyHops || 1);

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});

initSocket(server);

const corsOptions = {
  origin(origin, cb) {
    if (isAllowedOrigin(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use(basicSecurityHeaders);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan(config.isProd ? 'combined' : 'dev'));
app.use(rateLimit({ windowMs: 60_000, max: 240, keyPrefix: 'global' }));
app.use('/api/auth', rateLimit({ windowMs: 60_000, max: 25, keyPrefix: 'auth' }));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'tawasol-server',
    time: new Date().toISOString(),
    recommendations: {
      transport: 'Socket.IO',
      upload: `${config.maxUploadMb}MB`,
      stunServers: config.defaultStunServers,
      deployment: 'railway-single-service',
    },
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/statuses', statusRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/media', mediaRoutes);

app.use((err, _req, res, _next) => {
  if (err?.message === 'Unsupported file type') return res.status(400).json({ error: err.message });
  if (err?.message === 'Not allowed by CORS') return res.status(403).json({ error: err.message });
  console.error(err);
  return res.status(500).json({ error: 'Internal server error' });
});

const clientDist = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^(?!\/api|\/socket\.io).*/, (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

server.listen(config.port, config.bindHost, () => {
  console.log(`Twasol Railway app running on http://${config.bindHost}:${config.port}`);
});
