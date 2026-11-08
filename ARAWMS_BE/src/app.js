/*
 * File: app.js
 * Author: Duy Anh
 * Date: 2026-10-26
 * Description: Builds the Express application with request parsing, CORS, logging, API routes, and error handling. Exports the configured app for server startup.
 */
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import apiRoutes from './routes/index.js';
import { notFoundHandler, globalErrorHandler, errorHandler } from './common/middlewares/errorHandler.js';

const app = express();

// Middlewares - Hỗ trợ upload ảnh hợp đồng vật lý dung lượng lớn dạng Base64
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

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

// Prefix tất cả API bằng /api
app.use('/api', apiRoutes);

// Root route
app.get('/', (req, res) => {
  res.send('Welcome to ARAWMS Express.js API Gateway');
});

// 404 Handler & Global Error Handler
app.use(notFoundHandler);
app.use(globalErrorHandler || errorHandler);

export default app;
