import express from 'express';
import ghnRoutes from './ghn.routes.js';
import authRoutes from '../modules/system-administration/authentication/auth.routes.js';
import accountRoutes from '../modules/system-administration/account-governance/accountGovernance.routes.js';

// 1. Major Feature: Conversational Commerce
import chatRoutingRoutes from '../modules/conversational-commerce/chat-routing/chatRouting.routes.js';
import crmProfileRoutes from '../modules/conversational-commerce/crm-profile/crmProfile.routes.js';
import chatInterfaceRoutes from '../modules/conversational-commerce/chat-interface/chatInterface.routes.js';
import inventoryWidgetRoutes from '../modules/conversational-commerce/inventory-widget/inventoryWidget.routes.js';

// 2. Major Feature: Order Fulfillment
import orderManagementRoutes from '../modules/order-fulfillment/order-management/orderManagement.routes.js';
import packingRoutes from '../modules/order-fulfillment/packing-verification/packingVerification.routes.js';
import orderQrRoutes from '../modules/order-fulfillment/order-qr-management/orderQrManagement.routes.js';

// 3. Major Feature: Reverse Logistics
import returnMerchandiseAuthorizationRoutes from '../modules/reverse-logistics/return-merchandise-authorization/returnMerchandiseAuthorization.routes.js';
import customerExchangeProcessingRoutes from '../modules/reverse-logistics/customer-exchange-processing/customerExchangeProcessing.routes.js';

// 4. Major Feature: Warehouse Management (Manager & Staff)
import productRoutes from '../modules/warehouse-management/products/product.routes.js';
import layoutRoutes from '../modules/warehouse-management/location-layout/layout.routes.js';
import putawayRoutes from '../modules/warehouse-management/location-layout/putaway.routes.js';
import materialInboundRoutes from '../modules/raw-material-warehousing/inbound-execution/inboundExecution.routes.js';

const router = express.Router();

// System Administration
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
// MAJOR FEATURE 2: ORDER FULFILLMENT & QR
// ====================================================================
// Sub Feature: Order Management (UC-78, UC-79, UC-80, UC-81)
router.use('/orders', orderManagementRoutes);

// Sub Feature: Đóng gói đơn hàng (WAREHOUSE_STAFF)
router.use('/packing', packingRoutes);

// Sub Feature: QR đơn hàng (WAREHOUSE_STAFF & WAREHOUSE_MANAGER)
router.use('/order-qr', orderQrRoutes);

// ====================================================================
// MAJOR FEATURE 3: REVERSE LOGISTICS
// ====================================================================
// Sub Feature: Return Merchandise Authorization (UC-82)
router.use('/returns/rma', returnMerchandiseAuthorizationRoutes);
router.use('/returns/return-merchandise-authorization', returnMerchandiseAuthorizationRoutes);

// Sub Feature: Customer Exchange Processing (UC-83)
router.use('/returns/customer-exchange', customerExchangeProcessingRoutes);
router.use('/returns/rma', customerExchangeProcessingRoutes); // Alias tiện lợi cho /api/returns/rma/:id/create-exchange-order

// ====================================================================
// MAJOR FEATURE 4: WAREHOUSE MANAGEMENT
// ====================================================================
// WAREHOUSE_MANAGER: Quản lý sản phẩm thành phẩm, nhập kho hàng loạt, cấu hình sản phẩm (/api/products/*)
router.use('/products', productRoutes);

// WAREHOUSE_MANAGER: Cấu hình sơ đồ kho (/api/warehouse-layout/*)
router.use('/warehouse-layout', layoutRoutes);

// WAREHOUSE_MANAGER: Nhập kho nguyên liệu (/api/raw-material-inbound/*)
router.use('/raw-material-inbound', materialInboundRoutes);

// WAREHOUSE_STAFF (/tasks/*) & WAREHOUSE_MANAGER (/issues, /incidents): Xếp hàng và xử lý sự cố putaway (/api/warehouse-putaway/*)
router.use('/warehouse-putaway', putawayRoutes);

export default router;
