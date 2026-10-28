import 'dotenv/config';
import http from 'http';
import app from './src/app.js';
import connectDB from './src/config/db.js';
import { initSocket } from './src/config/socket.js';

const PORT = process.env.PORT || 5000;

// Start accepting requests only after MongoDB connects successfully.
const startServer = async () => {
  await connectDB();

  const httpServer = http.createServer(app);
  initSocket(httpServer);

  httpServer.listen(PORT, () => {
    console.log(`=================================`);
    console.log(`🚀 Server đang chạy tại: http://localhost:${PORT}`);
    console.log(`⚙️  Môi trường: ${process.env.NODE_ENV || 'development'}`);
    console.log(`=================================`);
  });
};

startServer();

