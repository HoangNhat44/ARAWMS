/*
 * File: index.js
 * Description: Mounts all backend API modules under their public paths.
 *              Combines warehouse, order, garment routes with accountant, carrier, seller & contract routes.
 */
import express from 'express';

// Import all warehouse, order & garment routes
import orderQrRoutes from '../modules/order-fulfillment/order-qr-management/orderQrManagement.routes.js';
import packingRoutes from '../modules/order-fulfillment/packing-verification/packingVerification.routes.js';
import productRoutes from '../modules/warehouse-management/products/product.routes.js';
import materialInboundRoutes from '../modules/raw-material-warehousing/inbound-execution/inboundExecution.routes.js';
import materialOutboundRoutes from '../modules/raw-material-warehousing/outbound-execution/outboundExecution.routes.js';
import layoutRoutes from '../modules/warehouse-management/location-layout/layout.routes.js';
import putawayRoutes from '../modules/warehouse-management/location-layout/putaway.routes.js';
import authRoutes from '../modules/system-administration/authentication/auth.routes.js';
import stocktakeRoutes from '../modules/inventory-auditing/stocktake-session/stocktakeSession.routes.js';
import shippingRoutes from '../modules/shipping/shipping.routes.js';
import garmentInboundVerificationRoutes from '../modules/garment-technical/inbound-verification/inboundVerification.routes.js';
import garmentFinishedInspectionRoutes from '../modules/garment-technical/finished-inspection/finishedInspection.routes.js';
import garmentStocktakeExecutionRoutes from '../modules/garment-technical/stocktake-execution/stocktakeExecution.routes.js';
import garmentRemnantRecoveryRoutes from '../modules/garment-technical/remnant-recovery/remnantRecovery.routes.js';
import garmentRawMaterialsRoutes from '../modules/garment-technical/raw-materials/rawMaterials.routes.js';

// Import carrier, contract, accountant financial & seller routes
import apiRoutes from './api.js';

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
router.use('/raw-material-outbound', materialOutboundRoutes);
router.use('/warehouse-layout', layoutRoutes);
router.use('/warehouse-putaway', putawayRoutes);
router.use('/stocktake', stocktakeRoutes);
router.use('/shipping', shippingRoutes);
router.use('/auth', authRoutes);

// Garment Technical & KCS Routes
router.use('/garment-technical/inbound-verification', garmentInboundVerificationRoutes);
router.use('/garment-technical/finished-inspection', garmentFinishedInspectionRoutes);
router.use('/garment-technical/stocktake-execution', garmentStocktakeExecutionRoutes);
router.use('/garment-technical/remnant-recovery', garmentRemnantRecoveryRoutes);
router.use('/garment-technical/raw-materials', garmentRawMaterialsRoutes);
router.use('/raw-materials', garmentRawMaterialsRoutes);

// Carrier, Contract Procurement, Financial Intelligence & Seller routes (from api.js)
router.use('/', apiRoutes);

export default router;
