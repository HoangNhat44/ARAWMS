import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import apiRoutes from './routes/api.js';
import { notFoundHandler, globalErrorHandler } from './middlewares/errorHandler.js';

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
