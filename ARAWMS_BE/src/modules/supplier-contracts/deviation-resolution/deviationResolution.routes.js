import express from 'express';
import * as deviationResolutionController from './deviationResolution.controller.js';
import {
  validateDeviationIdParam,
  validateResolveDeviation,
} from './deviationResolution.validation.js';

const router = express.Router();

// UC 06: Execute Contract Deviation Resolution
router.get('/deviations', deviationResolutionController.getDeviations);
router.post(
  '/deviations/:id/resolve',
  validateDeviationIdParam,
  validateResolveDeviation,
  deviationResolutionController.resolveDeviation
);

export default router;

