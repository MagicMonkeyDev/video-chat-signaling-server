import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const CLIENT_URL = process.env.CLIENT_URL || '*';

const app = express();
app.use(cors());

const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: CLIENT_URL,
    methods: ['GET', 'POST'],
    credentials: true,
    transports: ['websocket']
  }
});

const waitingUsers = new Set();
const connectedPairs = new Map();
let totalUsers = 0;

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  totalUsers++;
  io.emit('users-update', { waiting: waitingUsers.size, total: totalUsers });

  socket.on('find-peer', () => {
    console.log('User searching for peer:', socket.id);
    console.log('Waiting users:', waitingUsers.size);

    if (waitingUsers.size > 0) {
      // Get the first waiting user
      const [waitingUser] = waitingUsers;
      waitingUsers.delete(waitingUser);
      io.emit('users-update', { waiting: waitingUsers.size, total: totalUsers });
      
      console.log('Match found:', socket.id, 'with', waitingUser);

      // Create a pair
      connectedPairs.set(socket.id, waitingUser);
      connectedPairs.set(waitingUser, socket.id);
      
      // Notify both users
      io.to(waitingUser).emit('match-found', { initiator: true });
      io.to(socket.id).emit('match-found', { initiator: false });
    } else {
      waitingUsers.add(socket.id);
      io.emit('users-update', { waiting: waitingUsers.size, total: totalUsers });
    }
  });

  socket.on('signal', ({ signal }) => {
    const pairedUser = connectedPairs.get(socket.id);
    if (pairedUser) {
      console.log('Forwarding signal from', socket.id, 'to', pairedUser);
      io.to(pairedUser).emit('signal', { signal });
    }
  });

  const cleanup = () => {
    // Remove from waiting list
    waitingUsers.delete(socket.id);
    totalUsers--;
    io.emit('users-update', { waiting: waitingUsers.size, total: totalUsers });
    
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