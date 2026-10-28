/*
 * File: packingVerification.routes.js
 * Author: Duy Anh
 * Date: 2026-10-21
 * Description: Defines packing session, barcode, and video endpoints.
 */
import express from 'express';
import {
  openPackingSessionRequest,
  getPackingSession,
  renewPackingSessionLeaseRequest,
  releasePackingSessionRequest,
  discardPackingAttemptRequest,
  scanPackingProductBarcodeRequest,
  removeScannedBarcodeRequest,
  uploadPackingVideo,
  syncPackingVideo,
  getPackingVideo,
  registerProductUnit,
} from './packingVerification.controller.js';

const router = express.Router();

// Direct URL testing uses one operator identity for order and unit scans.
router.use((req, res, next) => {
  req.user = {
    _id: '507f1f77bcf86cd799439011',
    username: 'test',
    fullName: 'Test User',
    roles: ['OWNER', 'ADMIN', 'WAREHOUSE_STAFF'],
    warehouseIds: []
  };
  next();
});

router.post('/product-units/register', registerProductUnit);
router.post('/prepare', openPackingSessionRequest);
router.get('/sessions/:id', getPackingSession);
router.post('/sessions/:id/heartbeat', renewPackingSessionLeaseRequest);
router.post('/sessions/:id/release', releasePackingSessionRequest);
router.post('/sessions/:id/cancel', discardPackingAttemptRequest);
router.post('/sessions/:id/scan', scanPackingProductBarcodeRequest);
router.post('/sessions/:id/scans/remove', removeScannedBarcodeRequest);
router.post('/sessions/:id/video', uploadPackingVideo);
router.post('/sessions/:id/video/:recordingId/sync', syncPackingVideo);
router.get('/sessions/:id/video', getPackingVideo);

export default router;
