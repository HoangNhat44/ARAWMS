import { getIO, initSocket } from '../../config/socket.js';

let localIo = null;

export function attachRealtime(httpServer) {
  localIo = initSocket(httpServer);
  return localIo;
}

export function publishRealtime(event, payload) {
  const io = localIo || getIO();
  if (!io) return false;
  io.emit(event, { ...payload, occurredAt: new Date().toISOString() });
  return true;
}
