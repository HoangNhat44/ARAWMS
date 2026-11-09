import express from 'express';
import { authenticate } from '../common/middlewares/authenticate.js';
import { authorizeRole } from '../common/middlewares/authorizeRole.js';
// Nguyễn Ngọc Huy-HE171157, 2-11-2026: UC-12/13/19, phản hồi 1–7; GBR-01 - Báo cáo và kế hoạch có xác thực.
import operationsReportRoutes from '../modules/managerial-financial-analytics/operations-report/operationsReport.routes.js';
import ghnRoutes from '../modules/ghn/ghn.routes.js';
import contractWorkspaceRoutes from '../modules/supplier-contracts/contract-workspace/contractWorkspace.routes.js';
import inboundPlanningRoutes from '../modules/supplier-contracts/inbound-planning/inboundPlanning.routes.js';
import deviationResolutionRoutes from '../modules/supplier-contracts/deviation-resolution/deviationResolution.routes.js';
import accountsPayableRoutes from '../modules/financial-intelligence/accounts-payable/accountsPayable.routes.js';
import codReconciliationRoutes from '../modules/financial-intelligence/cod-reconciliation/codReconciliation.routes.js';
import debtManagementRoutes from '../modules/financial-intelligence/debt-management/debtManagement.routes.js';
import productValuationRoutes from '../modules/financial-intelligence/product-inventory-valuation/productValuation.routes.js';
import rawMaterialValuationRoutes from '../modules/financial-intelligence/raw-material-valuation/rawMaterialValuation.routes.js';
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

// 1. Major Feature: Conversational Commerce
import chatRoutingRoutes from '../modules/conversational-commerce/chat-routing/chatRouting.routes.js';
import crmProfileRoutes from '../modules/conversational-commerce/crm-profile/crmProfile.routes.js';
import chatInterfaceRoutes from '../modules/conversational-commerce/chat-interface/chatInterface.routes.js';
import inventoryWidgetRoutes from '../modules/conversational-commerce/inventory-widget/inventoryWidget.routes.js';

// 2. Major Feature: Order Fulfillment
import orderManagementRoutes from '../modules/order-fulfillment/order-management/orderManagement.routes.js';
import marketplaceOrderImportRoutes from '../modules/order-fulfillment/marketplace-order-import/marketplaceOrderImport.routes.js';

// 3. Major Feature: Reverse Logistics
import returnMerchandiseAuthorizationRoutes from '../modules/reverse-logistics/return-merchandise-authorization/returnMerchandiseAuthorization.routes.js';
import customerExchangeProcessingRoutes from '../modules/reverse-logistics/customer-exchange-processing/customerExchangeProcessing.routes.js';
import notificationRoutes from '../modules/notifications/notification.routes.js';

const router = express.Router();
router.use('/owner/contracts', authenticate, authorizeRole('OWNER'), contractWorkspaceRoutes);
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
router.use('/supplier-contracts', authenticate, authorizeRole('ACCOUNTANT', 'OWNER'));
router.use('/supplier-contracts', contractWorkspaceRoutes);
router.use('/supplier-contracts', inboundPlanningRoutes);
router.use('/supplier-contracts', deviationResolutionRoutes);

// Accounts Payable / Payment Voucher routes (Accountant UC 08 / UC 15)
router.use('/payment-vouchers', authenticate, authorizeRole('ACCOUNTANT', 'OWNER'), accountsPayableRoutes);

// COD Reconciliation routes (Accountant UC 16–17)
router.use('/financial/cod-reconciliation', authenticate, authorizeRole('ACCOUNTANT', 'OWNER'), codReconciliationRoutes);

// Debt Management routes (Supplier Debt AP & Carrier Debt AR)
router.use('/financial/debts', authenticate, authorizeRole('ACCOUNTANT', 'OWNER'), debtManagementRoutes);

// Product Inventory Valuation routes (Accountant UC 10 - View Total Inventory Valuation)
router.use('/financial/inventory-valuation', productValuationRoutes);

// Raw Material Inventory Valuation routes (Accountant UC 11 - View Total Raw Material Inventory Value)
router.use('/financial/raw-material-valuation', rawMaterialValuationRoutes);

// ====================================================================
// MAJOR FEATURE 1: CONVERSATIONAL COMMERCE
// ====================================================================
// Sub Feature: Chat Routing (UC-69)
router.use('/conversations/routing', chatRoutingRoutes);

// Sub Feature: CRM Profile (UC-70, UC-71, UC-75, UC-76)
router.use('/conversations/crm-profile', crmProfileRoutes);
router.use('/conversations/customers', crmProfileRoutes); // Alias linh hoạt

// Sub Feature: Inventory Widget (UC-77)
router.use('/conversations/inventory-widget', inventoryWidgetRoutes);
router.use('/conversations/inventory', inventoryWidgetRoutes); // Alias linh hoạt

// Sub Feature: Chat Interface (UC-72, UC-73, UC-74)
router.use('/conversations/chat-interface', chatInterfaceRoutes);
router.use('/conversations', chatInterfaceRoutes); // Base chat routes

// ====================================================================
// MAJOR FEATURE 2: ORDER FULFILLMENT
// ====================================================================
// Sub Feature: Order Management (UC-78, UC-79, UC-80, UC-81)
router.use('/orders/marketplace', marketplaceOrderImportRoutes);
router.use('/orders', orderManagementRoutes);

// ====================================================================
// MAJOR FEATURE 3: REVERSE LOGISTICS
// ====================================================================
// Sub Feature: Return Merchandise Authorization (UC-82)
router.use('/returns/rma', returnMerchandiseAuthorizationRoutes);
router.use('/returns/return-merchandise-authorization', returnMerchandiseAuthorizationRoutes);

// Sub Feature: Customer Exchange Processing (UC-83)
router.use('/returns/customer-exchange', customerExchangeProcessingRoutes);
router.use('/returns/rma', customerExchangeProcessingRoutes); // Alias tiện lợi cho /api/returns/rma/:id/create-exchange-order

// Notifications Realtime & History
router.use('/notifications', notificationRoutes);

export default router;
