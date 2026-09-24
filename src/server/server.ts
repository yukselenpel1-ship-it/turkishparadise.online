import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import fs from 'fs';
import express from 'express';
import app from './app';
import { verifyUserToken } from './auth/authMiddleware';

const PORT = Number(process.env.PORT || 3001);

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:3001',
  'https://turkishparadise.xyz',
  'https://www.turkishparadise.xyz',
  'https://api.turkishparadise.xyz',
  'https://turkishparadise.online',
  'https://www.turkishparadise.online',
  'https://api.turkishparadise.online',
  'https://turkishparadise.digital',
  'https://www.turkishparadise.digital',
  'https://api.turkishparadise.digital'
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

// Static SPA fallback serving in local production mode if dist directory exists
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
  console.log(`🚀 Turkish Paradise Server listening on 0.0.0.0:${PORT} (${process.env.NODE_ENV || 'development'})`);
});
