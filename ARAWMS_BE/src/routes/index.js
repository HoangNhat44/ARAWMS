import express from 'express';

// Import all module routes
import authRoutes from '../modules/system-administration/authentication/auth.routes.js';
import orderQrRoutes from '../modules/order-fulfillment/order-qr-management/orderQrManagement.routes.js';
import packingRoutes from '../modules/order-fulfillment/packing-verification/packingVerification.routes.js';

const router = express.Router();

// Health check
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Mount module routes
router.use('/auth', authRoutes);
router.use('/order-qr', orderQrRoutes);
router.use('/packing', packingRoutes);

// Mount other module routes (from main branch)
// TODO: Add other module routes as needed

export default router;
