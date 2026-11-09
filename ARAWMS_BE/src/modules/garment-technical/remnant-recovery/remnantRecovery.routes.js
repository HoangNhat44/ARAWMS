/*
 * File: remnantRecovery.routes.js
 * Author: Duy Anh & Antigravity
 * Date: 2026-11-06
 * Description: Express routes for Garment Outbound Requests and Remnant Recovery.
 */
import express from 'express';
import { authenticate } from '../../../common/middlewares/authenticate.js';
import { authorizeRole } from '../../../common/middlewares/authorizeRole.js';
import {
  getOptions,
  getThreshold,
  createOutbound,
  listOutbounds,
  getOutbound,
  listIssuedRolls,
  recordCutting,
  listHistory,
  lookupReturnSource, listReturnRequests, confirmReturnRequest,
  reportReturnDiscrepancy, cancelReturnRequest, reportUnknownReturnSource,
} from './remnantRecovery.controller.js';

const router = express.Router();

router.use(authenticate);
const technician = authorizeRole('GARMENT_TECHNICIAN');
const manager = authorizeRole('OWNER', 'WAREHOUSE_MANAGER');

router.get('/options', technician, getOptions);
router.get('/threshold', technician, getThreshold);
router.get('/outbound-requests', authorizeRole('GARMENT_TECHNICIAN', 'OWNER', 'WAREHOUSE_MANAGER', 'WAREHOUSE_STAFF'), listOutbounds);
router.post('/outbound-requests', technician, createOutbound);
router.get('/outbound-requests/:id', technician, getOutbound);
router.post('/outbound-requests/:id/source-discrepancies', technician, reportUnknownReturnSource);
router.get('/issued-rolls', technician, listIssuedRolls);
router.get('/return-sources', technician, lookupReturnSource);
router.get('/return-requests', manager, listReturnRequests);
router.post('/return-requests/:id/confirm', manager, confirmReturnRequest);
router.post('/return-requests/:id/discrepancy', manager, reportReturnDiscrepancy);
router.post('/return-requests/:id/close', authorizeRole('GARMENT_TECHNICIAN', 'WAREHOUSE_MANAGER', 'OWNER'), cancelReturnRequest);
router.post('/record-cutting', technician, recordCutting);
router.get('/history', technician, listHistory);

export default router;

