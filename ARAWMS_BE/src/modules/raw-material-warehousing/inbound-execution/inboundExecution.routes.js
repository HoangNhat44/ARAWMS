/*
 * File: inboundExecution.routes.js
 * Author: Duy Anh
 * Date: 2026-10-26
 * Description: Exposes technician inbound requests and raw-material receiving endpoints.
 */
import express from 'express';
import { authenticate } from '../../../common/middlewares/authenticate.js';
import { authorizeRole } from '../../../common/middlewares/authorizeRole.js';
import {
  options, createLocation, createMaterial, plans, planDetails, receipts, receiptDetails, deliveryMatches,
  createReceipt, updateReceipt, confirmReceipt, cancelReceipt, receiptByDraftKey, uploadReceiptAttachment,
  receiptLabels, syncReceiptBarcodes, rollTemplate, previewRolls, putaway,
  requestSupplierReturn, confirmSupplierReturn,
  createPlan, setupLegacyPlan, closeBatch, cancelBatch, reviseBatch, reviseBatchItems,
  technicianRequests, createTechnicianRequest,
  reportTechnicianRequestDiscrepancy,
  legacyReceiptDetails, updateLegacyReceipt, confirmLegacyReceipt,
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
router.post('/technician-requests', authorizeRole('GARMENT_TECHNICIAN'), createTechnicianRequest);
router.get('/technician-requests', authorizeRole('OWNER', 'WAREHOUSE_MANAGER', 'WAREHOUSE_STAFF'), technicianRequests);
router.use(authorizeRole('OWNER', 'WAREHOUSE_MANAGER'));

router.get('/options', options);
router.get('/roll-template', rollTemplate);
router.post('/roll-import/preview', express.raw({ type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', limit: '5mb' }), previewRolls);
router.post('/locations', createLocation);
router.post('/materials', createMaterial);
router.get('/legacy-receipts/:id', legacyReceiptDetails);
router.put('/legacy-receipts/:id', updateLegacyReceipt);
router.post('/legacy-receipts/:id/confirm', confirmLegacyReceipt);
router.post('/technician-requests/:id/discrepancies', reportTechnicianRequestDiscrepancy);
router.get('/plans', plans);
router.post('/plans', createPlan);
router.get('/plans/:id', planDetails);
router.post('/plans/:id/setup-legacy', setupLegacyPlan);
router.post('/plans/:id/batches/:batchId/close-short', closeBatch);
router.post('/plans/:id/batches/:batchId/cancel', cancelBatch);
router.put('/plans/:id/batches/:batchId/window', reviseBatch);
router.put('/plans/:id/batches/:batchId/items', reviseBatchItems);
router.get('/receipts', receipts);
router.get('/delivery-matches', deliveryMatches);
router.post('/receipts', createReceipt);
router.get('/receipts/by-draft-key/:key', receiptByDraftKey);
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
