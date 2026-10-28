/*
 * File: index.js
 * Author: Duy Anh
 * Date: 2026-10-26
 * Description: Mounts the backend API modules under their public paths. Keeps route registration in one place for the Express application.
 */
import express from 'express';

// Import all module routes
import orderQrRoutes from '../modules/order-fulfillment/order-qr-management/orderQrManagement.routes.js';
import packingRoutes from '../modules/order-fulfillment/packing-verification/packingVerification.routes.js';
import productRoutes from '../modules/warehouse-management/products/product.routes.js';
import materialInboundRoutes from '../modules/raw-material-warehousing/inbound-execution/inboundExecution.routes.js';
import layoutRoutes from '../modules/warehouse-management/location-layout/layout.routes.js';
import putawayRoutes from '../modules/warehouse-management/location-layout/putaway.routes.js';

const router = express.Router();

// Health check
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Mount module routes
router.use('/order-qr', orderQrRoutes);
router.use('/packing', packingRoutes);
router.use('/products', productRoutes);
router.use('/raw-material-inbound', materialInboundRoutes);
router.use('/warehouse-layout', layoutRoutes);
router.use('/warehouse-putaway', putawayRoutes);

// Mount other module routes (from main branch)
// TODO: Add other module routes as needed

export default router;
