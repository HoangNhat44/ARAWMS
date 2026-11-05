import { Server } from 'socket.io';

let io;

export function attachRealtime(httpServer) {
  // Socket.IO shares the HTTP server so browser API and live updates use one origin.
  io = new Server(httpServer, {
    cors: { origin: process.env.CLIENT_URL || '*', credentials: true },
    path: '/socket.io',
  });
  io.on('connection', (socket) => {
    socket.emit('realtime:ready', { connectedAt: new Date().toISOString() });
  });
  return io;
}

export function publishRealtime(event, payload) {
  if (!io) return false;
  io.emit(event, { ...payload, occurredAt: new Date().toISOString() });
  return true;
}
