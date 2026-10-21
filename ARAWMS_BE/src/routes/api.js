import express from 'express';
import ghnRoutes from './ghn.routes.js';

const router = express.Router();

// Health check endpoint
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'ARAWMS API Gateway is running smoothly',
    timestamp: new Date().toISOString(),
  });
});

// Carrier routes (Giao Hàng Nhanh)
router.use('/carriers/ghn', ghnRoutes);

export default router;
