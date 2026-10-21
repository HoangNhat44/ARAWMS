import 'dotenv/config';
import app from './src/app.js';
import connectDB from './src/config/db.js';

const PORT = process.env.PORT || 5000;

// Khởi chạy server và kết nối DB
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
