/*
 * File: warehouseReport.routes.js
 * Author: Duy Anh
 * Date: 2026-11-19
 * Description: /api/warehouse-reports — the warehouse manager writes statistics reports for the Owner.
 * The Owner reads sent reports under /api/manager-reports (Báo cáo quản lý).
 */
import express from 'express';
import { authenticate } from '../../../common/middlewares/authenticate.js';
import { authorizeRole } from '../../../common/middlewares/authorizeRole.js';
import { listReports, getReport, createReport, refreshReport, saveDraft, submitReport, deleteDraft } from './warehouseReport.controller.js';

const router = express.Router();
router.use(authenticate, authorizeRole('WAREHOUSE_MANAGER'));

router.get('/', listReports);
router.post('/', createReport);
router.get('/:id', getReport);
router.post('/:id/refresh', refreshReport);
router.patch('/:id', saveDraft);
router.post('/:id/submit', submitReport);
router.delete('/:id', deleteDraft);

export default router;
