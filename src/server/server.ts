import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Health check & status API
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', game: 'Pococoly', timestamp: new Date().toISOString() });
});

// Socket.io real-time game room state sync
io.on('connection', (socket) => {
  console.log(`[Pococoly Server] Client connected: ${socket.id}`);

  socket.on('join_room', ({ roomId, playerName }) => {
    socket.join(roomId);
    console.log(`[Pococoly Server] ${playerName} joined room ${roomId}`);
    socket.to(roomId).emit('player_joined', { socketId: socket.id, playerName });
  });

  socket.on('game_action', ({ roomId, action, payload }) => {
    // Broadcast action to room members
    io.to(roomId).emit('game_state_update', { action, payload });
  });

  socket.on('disconnect', () => {
    console.log(`[Pococoly Server] Client disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`🚀 Pococoly Server listening on http://localhost:${PORT}`);
});
