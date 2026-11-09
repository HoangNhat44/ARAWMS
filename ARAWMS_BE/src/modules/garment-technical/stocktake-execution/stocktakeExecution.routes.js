/*
 * File: stocktakeExecution.routes.js
 * Author: Duy Anh & Antigravity
 * Date: 2026-11-06
 * Description: Express routes for Garment Technician inventory stocktake execution.
 */
import express from 'express';
import { authenticate } from '../../../common/middlewares/authenticate.js';
import { authorizeRole } from '../../../common/middlewares/authorizeRole.js';
import {
  listSessions,
  getSession,
  verifyShelf,
  scanItem,
  updateQty,
  completeSession,
} from './stocktakeExecution.controller.js';

const router = express.Router();

router.use(authenticate, authorizeRole('GARMENT_TECHNICIAN'));

router.get('/sessions', listSessions);
router.get('/sessions/:id', getSession);
router.post('/sessions/:id/verify-shelf', verifyShelf);
router.post('/sessions/:id/scan-item', scanItem);
router.patch('/records/:id', updateQty);
router.post('/sessions/:id/complete', completeSession);

export default router;

