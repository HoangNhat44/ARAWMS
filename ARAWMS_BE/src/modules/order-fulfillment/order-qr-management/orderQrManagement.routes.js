import express from 'express';
import { authenticate } from '../../../common/middlewares/authenticate.js';
import {
  listOrders,
  issueOrderQrBulk,
  lookupOrder,
  getOrderQr,
  resolveOrderQr,
  replaceOrderQr,
  confirmOrder,
} from './orderQrManagement.controller.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

router.get('/orders', listOrders);
router.post('/orders/qr/bulk', issueOrderQrBulk);
router.get('/orders/lookup', lookupOrder);
router.get('/orders/:id/qr', getOrderQr);
router.post('/qr/resolve', resolveOrderQr);
router.post('/orders/:id/qr/replace', replaceOrderQr);
router.post('/orders/:id/confirm', confirmOrder);

export default router;
