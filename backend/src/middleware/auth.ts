import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Socket } from 'socket.io';
import prisma from '../prisma';
import { getRequiredJwtSecret } from '../utils/config';
import { hashSessionToken } from '../utils/sessionToken';

export interface AuthRequest extends Request {
  userId?: number;
  sessionToken?: string;
  sessionId?: number;
}

async function resolveSession(token: string) {
  const hashed = hashSessionToken(token);
  return prisma.session.findFirst({
    where: {
      OR: [
        { token: hashed },
        { token },
      ],
    },
  });
}

function extractHttpToken(req: AuthRequest) {
  const authHeader = req.headers['authorization'];
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) return authHeader.slice(7).trim();
  const queryToken = req.query?.token;
  if (typeof queryToken === 'string' && queryToken.trim()) return queryToken.trim();
  if (Array.isArray(queryToken) && queryToken[0]) return String(queryToken[0]).trim();
  return '';
}

async function attachAuthenticatedSession(req: AuthRequest, token: string) {
  const decoded = jwt.verify(token, getRequiredJwtSecret()) as { userId: number };
  const session = await resolveSession(token);
  if (!session || session.userId !== decoded.userId) throw new Error('Session expired');
  await prisma.session.update({ where: { id: session.id }, data: { lastUsed: new Date() } });
  req.userId = decoded.userId;
  req.sessionToken = token;
  req.sessionId = session.id;
}

export const authenticateToken = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = extractHttpToken(req);
  if (!token) return res.status(401).json({ error: 'Access denied' });
  try {
    await attachAuthenticatedSession(req, token);
    next();
  } catch (err: any) {
    const message = err?.message === 'Session expired' ? 'Session expired' : 'Invalid token';
    res.status(message === 'Session expired' ? 401 : 403).json({ error: message });
  }
};

export const authenticateSocket = async (socket: Socket, next: (err?: Error) => void) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Authentication error'));
  try {
    const decoded = jwt.verify(token, getRequiredJwtSecret()) as { userId: number };
    const session = await resolveSession(token);
    if (!session || session.userId !== decoded.userId) return next(new Error('Session expired'));
    await prisma.session.update({ where: { id: session.id }, data: { lastUsed: new Date() } });
    socket.data.userId = decoded.userId;
    socket.data.sessionToken = token;
    socket.data.sessionId = session.id;
    next();
  } catch {
    next(new Error('Invalid token'));
  }
};
