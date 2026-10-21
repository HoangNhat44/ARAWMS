import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import apiRoutes from './routes/index.js';
import { errorHandler } from './common/middlewares/errorHandler.js';

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

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    error: { code: 'NOT_FOUND' }
  });
});

// Global Error Handler
app.use(errorHandler);

export default app;
