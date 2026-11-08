/*
 * File: server.js
 * Author: Duy Anh & Nguyễn Quang Huy
 * Date: 2026-10-27
 * Description: Loads backend configuration, connects MongoDB, initializes WebSockets, and starts the API server.
 */
import dotenv from 'dotenv';
import { createServer } from 'node:http';
import app from './src/app.js';
import connectDB from './src/config/db.js';
import { initSocket } from './src/config/socket.js';

dotenv.config();

const PORT = process.env.PORT || 5000;

// Start accepting requests only after MongoDB connects successfully.
const startServer = async () => {
  await connectDB();

  const httpServer = createServer(app);
  initSocket(httpServer);

  httpServer.listen(PORT, () => {
    console.log(`=================================`);
    console.log(`🚀 Server đang chạy tại: http://localhost:${PORT}`);
    console.log(`⚙️  Môi trường: ${process.env.NODE_ENV || 'development'}`);
    console.log(`=================================`);
  });
};

startServer();
