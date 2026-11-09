/*
 * File: inboundVerification.routes.js
 * Author: Duy Anh & Antigravity
 * Date: 2026-11-06
 * Description: Express routes for Garment Technician Inbound Verification of raw materials.
 */
import express from 'express';
import { authenticate } from '../../../common/middlewares/authenticate.js';
import { authorizeRole } from '../../../common/middlewares/authorizeRole.js';
import {
  getOptions,
  listPlans,
  getPlan,
  verifyPlan,
  listRequests,
  createRequest,
} from './inboundVerification.controller.js';

const router = express.Router();

router.use(authenticate, authorizeRole('GARMENT_TECHNICIAN'));

router.get('/options', getOptions);
router.get('/plans', listPlans);
router.get('/plans/:id', getPlan);
router.post('/plans/:id/verify', verifyPlan);
router.get('/requests', listRequests);
router.post('/requests', createRequest);

export default router;

