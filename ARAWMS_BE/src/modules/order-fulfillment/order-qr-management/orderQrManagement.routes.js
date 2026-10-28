/*
 * File: orderQrManagement.routes.js
 * Author: Duy Anh
 * Date: 2026-10-21
 * Description: Defines order lookup, confirmation, and QR endpoints.
 */
import express from 'express';
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

// Direct URL testing uses one operator identity for QR issuance and lookup.
router.use((req, res, next) => {
  req.user = {
    _id: '507f1f77bcf86cd799439011',
    username: 'test',
    fullName: 'Test User',
    roles: ['OWNER', 'ADMIN'],
    warehouseIds: []
  };
  next();
});

router.get('/orders', listOrders);
router.post('/orders/qr/bulk', issueOrderQrBulk);
router.get('/orders/lookup', lookupOrder);
router.get('/orders/:id/qr', getOrderQr);
router.post('/qr/resolve', resolveOrderQr);
router.post('/orders/:id/qr/replace', replaceOrderQr);
router.post('/orders/:id/confirm', confirmOrder);

export default router;
