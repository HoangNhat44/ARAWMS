import express from 'express';
import ghnRoutes from './ghn.routes.js';
import contractWorkspaceRoutes from '../modules/supplier-contracts/contract-workspace/contractWorkspace.routes.js';
import inboundPlanningRoutes from '../modules/supplier-contracts/inbound-planning/inboundPlanning.routes.js';

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

// Supplier & Contract Procurement routes (Accountant UC 01-05)
router.use('/supplier-contracts', contractWorkspaceRoutes);
router.use('/supplier-contracts', inboundPlanningRoutes);

export default router;
