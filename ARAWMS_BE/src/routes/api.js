import express from 'express';
import authRoutes from './authRoutes.js';
import orderQrRoutes from './orderQrRoutes.js';

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
router.use('/', orderQrRoutes);

export default router;
