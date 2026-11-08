import express from 'express';
// Nguyễn Ngọc Huy-HE171157, 2-11-2026: UC-12/13/19, phản hồi 1–7; GBR-01 - Báo cáo và kế hoạch có xác thực.
import operationsReportRoutes from '../modules/managerial-financial-analytics/operations-report/operationsReport.routes.js';
import ghnRoutes from './ghn.routes.js';
import contractWorkspaceRoutes from '../modules/supplier-contracts/contract-workspace/contractWorkspace.routes.js';
import inboundPlanningRoutes from '../modules/supplier-contracts/inbound-planning/inboundPlanning.routes.js';
import deviationResolutionRoutes from '../modules/supplier-contracts/deviation-resolution/deviationResolution.routes.js';
import accountsPayableRoutes from '../modules/financial-intelligence/accounts-payable/accountsPayable.routes.js';
import codReconciliationRoutes from '../modules/financial-intelligence/cod-reconciliation/codReconciliation.routes.js';
import debtManagementRoutes from '../modules/financial-intelligence/debt-management/debtManagement.routes.js';
import authRoutes from '../modules/system-administration/authentication/auth.routes.js';
import accountRoutes from '../modules/system-administration/account-governance/accountGovernance.routes.js';
import employeeRoutes from '../modules/user-management/employee-management/employeeManagement.routes.js';
import permissionRoutes from '../modules/user-management/employee-permissions/employeePermissions.routes.js';
import dashboardRoutes from '../modules/managerial-financial-analytics/executive-dashboard/executiveDashboard.routes.js';
import activityRoutes from '../modules/user-management/system-activity/systemActivity.routes.js';
import financialRoutes from '../modules/managerial-financial-analytics/financial-reports/financialReports.routes.js';
import managerReportRoutes from '../modules/managerial-financial-analytics/manager-reports/managerReports.routes.js';
import materialValuationRoutes from '../modules/raw-material-inventory/inventory-valuation/inventoryValuation.routes.js';
import assetValuationRoutes from '../modules/finished-goods-warehousing/asset-valuation/assetValuation.routes.js';
import productionReportRoutes from '../modules/production-operations/bom-plan-report/bomPlanReport.routes.js';
import sampleRoutes from '../modules/bom/product-samples/productSamples.routes.js';
import roleAssignmentRoutes from '../modules/user-management/role-assignment/roleAssignment.routes.js';
import settingsRoutes from '../modules/system-administration/system-settings/systemSettings.routes.js';
import stockAdjustmentRoutes from '../modules/inventory-auditing/stock-adjustment/stockAdjustment.routes.js';

import productCatalogRoutes from '../modules/master-data/product-catalog/productCatalog.routes.js';
const router = express.Router();
router.use('/owner/contracts', contractWorkspaceRoutes);
router.use('/owner/products', productCatalogRoutes);
router.use('/owner/operations-report', operationsReportRoutes);
router.use('/auth', authRoutes);
router.use('/accounts', accountRoutes);
// Nguyễn Ngọc Huy-HE171157, 30-10-2026: UC Owner - Route theo đúng Major Feature/Sub Feature.
router.use('/owner/employees', employeeRoutes);
router.use('/owner/employee-permissions', permissionRoutes);
router.use('/owner/dashboard', dashboardRoutes);
router.use('/owner/activity', activityRoutes);
router.use('/owner/financial-reports', financialRoutes);
router.use('/owner/manager-reports', managerReportRoutes);
router.use('/owner/material-valuation', materialValuationRoutes);
router.use('/owner/asset-valuation', assetValuationRoutes);
router.use('/owner/production-reports', productionReportRoutes);
router.use('/owner/product-samples', sampleRoutes);
router.use('/owner/employee-roles', roleAssignmentRoutes);
router.use('/owner/system-settings', settingsRoutes);
router.use('/owner/stock-adjustments', stockAdjustmentRoutes);

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
