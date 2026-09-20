import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { z } from 'zod';
import {
  getDatabaseStatus,
  syncUserInDB,
  getFriendsFromDB,
  sendFriendRequestInDB,
  acceptFriendRequestInDB,
  deleteFriendshipInDB
} from './db/prisma';
import {
  generateUserToken,
  requireAuth,
  verifyUserToken,
  AuthenticatedRequest
} from './auth/authMiddleware';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3001);
const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173';

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:3001',
  'https://turkishparadise.online',
  'https://www.turkishparadise.online',
  'https://api.turkishparadise.online'
];
if (process.env.CORS_ORIGIN) {
  allowedOrigins.push(process.env.CORS_ORIGIN);
}

const checkOrigin = (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
  if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
    callback(null, true);
  } else {
    callback(null, true);
  }
};

app.use(cors({ origin: checkOrigin, credentials: true }));
app.use(express.json());

// --------------------------------------------------------------------------
// 1. TOP-LEVEL DATABASE-INDEPENDENT HEALTH ENDPOINT
// Returns 200 OK unconditionally
// --------------------------------------------------------------------------
app.get('/api/health', (_req, res) => {
  return res.status(200).json({
    status: 'ok',
    database: getDatabaseStatus()
  });
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: checkOrigin,
    methods: ['GET', 'POST', 'DELETE'],
    credentials: true
  }
});

// Presence tracking in-memory map (socket disconnect NEVER alters DB friendships)
const onlineUsers = new Map<string, { userId: string; roomId?: string; socketId: string }>();

// Zod Schemas for Input Validation
const SyncUserSchema = z.object({
  googleSub: z.string().min(1),
  displayName: z.string().min(1),
  avatarUrl: z.string().optional().nullable(),
  email: z.string().email().optional().nullable()
});

const FriendRequestSchema = z.object({
  targetFriendCode: z.string().min(3)
});

const AcceptRequestSchema = z.object({
  requestId: z.string().min(1)
});

/**
 * POST /api/users/sync
 * Idempotent User Sync endpoint.
 * Returns verified DB User record, single permanent friendCode & signed Auth Token.
 */
app.post('/api/users/sync', async (req, res) => {
  try {
    const parseResult = SyncUserSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'INVALID_INPUT', details: parseResult.error.format() });
    }

    const { googleSub, displayName, avatarUrl, email } = parseResult.data;
    const user = await syncUserInDB({ googleSub, displayName, avatarUrl, email });
    const token = generateUserToken({
      id: user.id,
      googleSub: user.googleSub,
      email: user.email,
      displayName: user.displayName
    });

    return res.json({
      success: true,
      user,
      token
    });
  } catch (err: any) {
    console.error('[API] Sync user error:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message || 'Internal server error' });
  }
});

/**
 * GET /api/friends
 * Protected Endpoint: Fetches friends & requests for authenticated user from Prisma DB.
 * Unauthenticated requests return HTTP 401 Unauthorized JSON response.
 */
app.get('/api/friends', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const result = await getFriendsFromDB(userId);

    const onlineUserIds = new Set(Array.from(onlineUsers.values()).map(u => u.userId));
    const annotatedFriends = result.friends.map(f => ({
      ...f,
      isOnline: onlineUserIds.has(f.id)
    }));

    return res.json({
      success: true,
      friends: annotatedFriends,
      pendingIncoming: result.incomingRequests,
      pendingOutgoing: result.outgoingRequests
    });
  } catch (err: any) {
    console.error('[API] Get friends error:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

/**
 * POST /api/friends/request
 * Protected Endpoint: Send friend request by friendCode.
 */
app.post('/api/friends/request', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const parseResult = FriendRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'INVALID_INPUT', details: parseResult.error.format() });
    }

    const fromUserId = req.user!.id;
    const { targetFriendCode } = parseResult.data;

    const outcome = await sendFriendRequestInDB(fromUserId, targetFriendCode);
    if (!outcome.success) {
      return res.status(outcome.status || 400).json({ error: outcome.message });
    }

    io.emit('friend_request_received', {
      targetFriendCode: targetFriendCode.trim().toUpperCase(),
      fromUserId
    });

    return res.json(outcome);
  } catch (err: any) {
    console.error('[API] Send friend request error:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

/**
 * POST /api/friends/accept
 * Protected Endpoint: Accept a pending friend request.
 */
app.post('/api/friends/accept', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const parseResult = AcceptRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'INVALID_INPUT', details: parseResult.error.format() });
    }

    const userId = req.user!.id;
    const { requestId } = parseResult.data;

    const outcome = await acceptFriendRequestInDB(userId, requestId);
    if (!outcome.success) {
      return res.status(outcome.status || 400).json({ error: outcome.message });
    }

    io.emit('friend_request_accepted', { requestId, userId });
    return res.json(outcome);
  } catch (err: any) {
    console.error('[API] Accept friend request error:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

/**
 * DELETE /api/friends/:friendId
 * Protected Endpoint: Delete a friendship record (Only authorized user can delete).
 */
app.delete('/api/friends/:friendId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const friendId = req.params.friendId;
    const userId = req.user!.id;

    const outcome = await deleteFriendshipInDB(userId, friendId);
    if (!outcome.success) {
      return res.status(outcome.status || 400).json({ error: outcome.message });
    }

    io.emit('friend_removed', { userId, friendId });
    return res.json(outcome);
  } catch (err: any) {
    console.error('[API] Delete friend error:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// Socket.IO Authenticated Connections
io.use((socket, next) => {
  const token = socket.handshake.auth?.token || socket.handshake.query?.token;
  if (token) {
    const verified = verifyUserToken(token as string);
    if (verified) {
      socket.data.userId = verified.id;
      return next();
    }
  }
  const userId = socket.handshake.query?.userId as string;
  if (userId) {
    socket.data.userId = userId;
  }
  next();
});

io.on('connection', (socket) => {
  const userId = socket.data.userId;
  if (userId) {
    onlineUsers.set(socket.id, { userId, socketId: socket.id });
    io.emit('presence_update', { userId, isOnline: true });
  }

  socket.on('user_online', ({ userId: uId, roomId }) => {
    const activeId = socket.data.userId || uId;
    if (activeId) {
      onlineUsers.set(socket.id, { userId: activeId, roomId, socketId: socket.id });
      io.emit('presence_update', { userId: activeId, isOnline: true });
    }
  });

  socket.on('join_room', ({ roomId, playerName }) => {
    socket.join(roomId);
    const entry = onlineUsers.get(socket.id) || { userId: socket.data.userId || 'anon', roomId, socketId: socket.id };
    entry.roomId = roomId;
    onlineUsers.set(socket.id, entry);
    socket.to(roomId).emit('player_joined', { socketId: socket.id, playerName });
  });

  socket.on('disconnect', () => {
    const entry = onlineUsers.get(socket.id);
    if (entry) {
      onlineUsers.delete(socket.id);
      const stillOnline = Array.from(onlineUsers.values()).some(u => u.userId === entry.userId);
      if (!stillOnline) {
        io.emit('presence_update', { userId: entry.userId, isOnline: false });
      }
    }
  });
});

// Static SPA fallback serving in production if dist directory exists
if (process.env.NODE_ENV === 'production') {
  const distPath = path.resolve(process.cwd(), 'dist');
  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
        return next();
      }
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }
}

// Global Process Exception Logging
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught Exception:', err);
  process.exit(1);
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Turkish Paradise V2 Server listening on 0.0.0.0:${PORT} (${process.env.NODE_ENV || 'development'})`);
});
