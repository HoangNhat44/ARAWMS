import express from 'express';
import ghnRoutes from './ghn.routes.js';
import contractWorkspaceRoutes from '../modules/supplier-contracts/contract-workspace/contractWorkspace.routes.js';
import inboundPlanningRoutes from '../modules/supplier-contracts/inbound-planning/inboundPlanning.routes.js';
import deviationResolutionRoutes from '../modules/supplier-contracts/deviation-resolution/deviationResolution.routes.js';
import accountsPayableRoutes from '../modules/financial-intelligence/accounts-payable/accountsPayable.routes.js';
import codReconciliationRoutes from '../modules/financial-intelligence/cod-reconciliation/codReconciliation.routes.js';
import debtManagementRoutes from '../modules/financial-intelligence/debt-management/debtManagement.routes.js';

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
router.use('/ghn', ghnRoutes); // Hỗ trợ endpoint ngắn gọn /api/ghn/webhook
router.post('/test/flow-simulate', (req, res, next) => {
  req.url = '/simulate-flow';
  return ghnRoutes(req, res, next);
});

// Supplier & Contract Procurement routes (Accountant UC 01-06)
router.use('/supplier-contracts', contractWorkspaceRoutes);
router.use('/supplier-contracts', inboundPlanningRoutes);
router.use('/supplier-contracts', deviationResolutionRoutes);

// Accounts Payable / Payment Voucher routes (Accountant UC 08 / UC 15)
router.use('/payment-vouchers', accountsPayableRoutes);

// COD Reconciliation routes (Accountant UC 16–17)
router.use('/financial/cod-reconciliation', codReconciliationRoutes);

// Debt Management routes (Supplier Debt AP & Carrier Debt AR)
router.use('/financial/debts', debtManagementRoutes);

export default router;
