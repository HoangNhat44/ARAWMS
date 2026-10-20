import express from 'express';
import { protect } from '../middlewares/authMiddleware.js';
import { getOrderQr, issueOrderQrBulk, listOrders, lookupOrder, replaceOrderQr, resolveOrderQr } from '../controllers/orderQrController.js';
import { confirmOrder, prepare, getPackingSession, heartbeat, release, scan, registerProductUnit } from '../controllers/packingController.js';
import { assignAccess } from '../controllers/warehouseAccessController.js';

const router = express.Router();

router.use(protect);
router.get('/orders/qr-list', listOrders);
router.get('/orders/lookup', lookupOrder);
router.post('/orders/packing-qr/bulk', issueOrderQrBulk);
router.post('/orders/:id/confirm', confirmOrder);
router.post('/orders/:id/packing-qr', getOrderQr);
router.post('/orders/:id/packing-qr/replace', replaceOrderQr);
router.post('/packing/resolve-qr', resolveOrderQr);
router.post('/packing/prepare', prepare);
router.get('/packing/sessions/:id', getPackingSession);
router.post('/packing/sessions/:id/heartbeat', heartbeat);
router.post('/packing/sessions/:id/release', release);
router.post('/packing/sessions/:id/scans', scan);
router.post('/inventory/product-units', registerProductUnit);
router.patch('/admin/users/:id/access', assignAccess);

export default router;
