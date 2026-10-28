/*
 * File: inboundExecution.routes.js
 * Author: Duy Anh
 * Date: 2026-10-26
 * Description: Exposes plan-bound raw-material receiving endpoints. Requires a warehouse manager or owner before reading or changing receipt data.
 */
import express from 'express';
import { authenticate } from '../../../common/middlewares/authenticate.js';
import { sendError } from '../../../common/utils/responseHandler.js';
import {
  options, createLocation, createMaterial, plans, planDetails, receipts, receiptDetails, deliveryMatches,
  createReceipt, updateReceipt, confirmReceipt, cancelReceipt, uploadReceiptAttachment,
  receiptLabels, syncReceiptBarcodes, rollTemplate, previewRolls, putaway,
  requestSupplierReturn, confirmSupplierReturn,
} from './inboundExecution.controller.js';

const router = express.Router();
// Receipt lists and warehouse choices depend on the signed-in user and current stock.
router.use((req, res, next) => {
  res.set('Cache-Control', 'private, no-store');
  delete req.headers['if-none-match'];
  delete req.headers['if-modified-since'];
  next();
});
router.use(authenticate);
router.use((req, res, next) => req.user.roles?.some((role) => ['OWNER', 'WAREHOUSE_MANAGER'].includes(role))
  ? next() : sendError(res, 'Bạn không có quyền quản lý nhập kho nguyên phụ liệu', { code: 'FORBIDDEN' }, 403));

router.get('/options', options);
router.get('/roll-template', rollTemplate);
router.post('/roll-import/preview', express.raw({ type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', limit: '5mb' }), previewRolls);
router.post('/locations', createLocation);
router.post('/materials', createMaterial);
router.get('/plans', plans);
router.get('/plans/:id', planDetails);
router.get('/receipts', receipts);
router.get('/delivery-matches', deliveryMatches);
router.post('/receipts', createReceipt);
router.get('/receipts/:id', receiptDetails);
router.put('/receipts/:id', updateReceipt);
router.post('/receipts/:id/attachments', express.raw({ type: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'], limit: '6mb' }), uploadReceiptAttachment);
router.post('/receipts/:id/confirm', confirmReceipt);
router.post('/receipts/:id/cancel', cancelReceipt);
router.get('/receipts/:id/labels', receiptLabels);
router.post('/receipts/:id/barcodes/sync', syncReceiptBarcodes);
router.post('/receipts/:id/putaway', putaway);
router.post('/receipts/:id/supplier-returns', requestSupplierReturn);
router.post('/receipts/:id/supplier-returns/confirm', confirmSupplierReturn);

export default router;
