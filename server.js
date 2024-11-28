import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

const app = express();
app.use(cors());

const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: CLIENT_URL,
    methods: ["GET", "POST"]
  }
});

const waitingUsers = new Set();
const connectedPairs = new Map();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('find-peer', () => {
    if (waitingUsers.size > 0) {
      // Get the first waiting user
      const [waitingUser] = waitingUsers;
      waitingUsers.delete(waitingUser);
      
      // Create a pair
      connectedPairs.set(socket.id, waitingUser);
      connectedPairs.set(waitingUser, socket.id);
      
      // Notify both users
      io.to(waitingUser).emit('match-found', { initiator: true });
      io.to(socket.id).emit('match-found', { initiator: false });
    } else {
      waitingUsers.add(socket.id);
    }
  });

  socket.on('signal', ({ signal }) => {
    const pairedUser = connectedPairs.get(socket.id);
    if (pairedUser) {
      io.to(pairedUser).emit('signal', { signal });
    }
  });

  const cleanup = () => {
    // Remove from waiting list
    waitingUsers.delete(socket.id);
    
    // Handle disconnection of paired users
    const pairedUser = connectedPairs.get(socket.id);
    if (pairedUser) {
      connectedPairs.delete(pairedUser);
      connectedPairs.delete(socket.id);
      io.to(pairedUser).emit('peer-disconnected');
    }
  };

  socket.on('disconnect', cleanup);
  socket.on('leave-chat', cleanup);
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`Signaling server running on port ${PORT}`);
});