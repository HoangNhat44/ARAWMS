import express from 'express';
import { authenticate } from '../../../common/middlewares/authenticate.js';
import {
  prepare,
  getPackingSession,
  heartbeat,
  release,
  scan,
  uploadPackingVideo,
  syncPackingVideo,
  getPackingVideo,
  registerProductUnit,
} from './packingVerification.controller.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

router.post('/prepare', prepare);
router.get('/sessions/:id', getPackingSession);
router.post('/sessions/:id/heartbeat', heartbeat);
router.post('/sessions/:id/release', release);
router.post('/sessions/:id/scan', scan);
router.post('/sessions/:id/video', uploadPackingVideo);
router.post('/sessions/:id/video/:recordingId/sync', syncPackingVideo);
router.get('/sessions/:id/video', getPackingVideo);
router.post('/product-units/register', registerProductUnit);

export default router;
