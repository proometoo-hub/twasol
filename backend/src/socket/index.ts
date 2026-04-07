import { Server, Socket } from 'socket.io';
import { PrismaClient } from '@prisma/client';
import { setupMessageHandlers } from './messageHandlers';
import { setupReactionHandlers } from './reactionHandlers';
import { setupTypingHandlers } from './typingHandlers';
import { setupCallHandlers } from './callHandlers';
import { setupConnectionHandlers } from './connectionHandlers';

export function setupChatHandlers(io: Server, socket: Socket, prisma: PrismaClient) {
  setupConnectionHandlers(io, socket, prisma);
  setupMessageHandlers(io, socket, prisma);
  setupReactionHandlers(io, socket, prisma);
  setupTypingHandlers(io, socket, prisma);
  setupCallHandlers(io, socket, prisma);
}
