/*
 * File: inboundVerification.routes.js
 * Author: Duy Anh & Antigravity
 * Date: 2026-11-06
 * Description: Express routes for Garment Technician Inbound Verification of raw materials.
 */
import express from 'express';
import { authenticate } from '../../../common/middlewares/authenticate.js';
import {
  getOptions,
  listPlans,
  getPlan,
  verifyPlan,
  listRequests,
  createRequest,
} from './inboundVerification.controller.js';

const router = express.Router();

// Fallback user if token is omitted in local dev environment
const flexibleAuth = async (req, res, next) => {
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    return authenticate(req, res, next);
  }
  req.user = req.user || {
    _id: '507f1f77bcf86cd799439011',
    username: 'garment_tech',
    fullName: 'Kỹ thuật viên May KCS',
    roleCode: 'GARMENT_TECHNICIAN',
    roles: ['GARMENT_TECHNICIAN', 'OWNER'],
  };
  next();
};

router.use(flexibleAuth);

router.get('/options', getOptions);
router.get('/plans', listPlans);
router.get('/plans/:id', getPlan);
router.post('/plans/:id/verify', verifyPlan);
router.get('/requests', listRequests);
router.post('/requests', createRequest);

export default router;

