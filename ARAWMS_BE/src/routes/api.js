import express from 'express';
import authRoutes from './authRoutes.js';

const router = express.Router();

// Health check endpoint
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'ARAWMS Express Backend API đang hoạt động bình thường!',
    timestamp: new Date().toISOString(),
  });
});

// Các nhóm Route
router.use('/auth', authRoutes);

export default router;
