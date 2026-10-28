import express from 'express';
import path from 'path';
import cors from 'cors';
import morgan from 'morgan';
import apiRoutes from './routes/api.js';
import { notFoundHandler, globalErrorHandler } from './common/middlewares/errorHandler.js';
// Import toàn bộ models để đảm bảo tất cả Mongoose schemas đã đăng ký trước khi bất kỳ populate() nào được gọi
import './models/index.js';

const app = express();

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS configuration
app.use(
  cors({
    origin: process.env.CLIENT_URL || '*',
    credentials: true,
  })
);

// Logging HTTP request khi ở môi trường dev
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

// Phục vụ tĩnh tệp đính kèm chat do Seller tải lên (UC-74)
app.use('/uploads', express.static(path.resolve(process.cwd(), 'uploads'), { maxAge: '7d' }));

// Prefix tất cả API bằng /api
app.use('/api', apiRoutes);

// Root route
app.get('/', (req, res) => {
  res.send('Welcome to ARAWMS Express.js API Gateway');
});

// Xử lý 404 & Global Error
app.use(notFoundHandler);
app.use(globalErrorHandler);

export default app;
