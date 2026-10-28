/*
 * File: server.js
 * Author: Duy Anh
 * Date: 2026-10-27
 * Description: Loads backend configuration, connects MongoDB, and starts the API server.
 */
import dotenv from 'dotenv';
import app from './src/app.js';
import connectDB from './src/config/db.js';

// Load the local environment before the database connection is created.
dotenv.config();

const PORT = process.env.PORT || 5000;

// Start accepting requests only after MongoDB connects successfully.
const startServer = async () => {
  await connectDB();

  app.listen(PORT, () => {
    console.log(`=================================`);
    console.log(`🚀 Server đang chạy tại: http://localhost:${PORT}`);
    console.log(`⚙️  Môi trường: ${process.env.NODE_ENV || 'development'}`);
    console.log(`=================================`);
  });
};

startServer();
