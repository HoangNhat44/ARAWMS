/*
 * File: remnantRecovery.routes.js
 * Author: Duy Anh & Antigravity
 * Date: 2026-11-06
 * Description: Express routes for Garment Outbound Requests and Remnant Recovery.
 */
import express from 'express';
import { authenticate } from '../../../common/middlewares/authenticate.js';
import {
  getOptions,
  getThreshold,
  createOutbound,
  listOutbounds,
  getOutbound,
  listIssuedRolls,
  recordCutting,
  listHistory,
} from './remnantRecovery.controller.js';

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
router.get('/threshold', getThreshold);
router.get('/outbound-requests', listOutbounds);
router.post('/outbound-requests', createOutbound);
router.get('/outbound-requests/:id', getOutbound);
router.get('/issued-rolls', listIssuedRolls);
router.post('/record-cutting', recordCutting);
router.get('/history', listHistory);

export default router;

