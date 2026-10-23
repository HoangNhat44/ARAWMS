import express from 'express';
import { authenticate } from '../../../common/middlewares/authenticate.js';
import { sendError } from '../../../common/utils/responseHandler.js';
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

// All routes require authentication
router.use(authenticate);

router.post('/product-units/register', registerProductUnit);
router.use((req, res, next) => req.user.roles?.includes('WAREHOUSE_STAFF')
  ? next()
  : sendError(res, 'Chỉ nhân viên kho được đóng hàng', { code: 'FORBIDDEN' }, 403));

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
