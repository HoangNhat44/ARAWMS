import express from 'express';
import ghnRoutes from './ghn.routes.js';
import authRoutes from '../modules/system-administration/authentication/auth.routes.js';
import accountRoutes from '../modules/system-administration/account-governance/accountGovernance.routes.js';

const router = express.Router();
router.use('/auth', authRoutes);
router.use('/accounts', accountRoutes);

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
