/**
 * ============================================================================
 * @title        : Garment Technician Dashboard Routes
 * @author       : AraWMS Team
 * @createdDate  : 2026-11-18
 * @lastModified : 2026-11-18
 * @description  : Định tuyến API Dashboard thống kê cho Kỹ thuật may (Garment Technician).
 * @module       : Garment Technical / Dashboard
 * @layer        : Route
 * ============================================================================
 */

import express from 'express';
import { authenticate } from '../../../common/middlewares/authenticate.js';
import { authorizeRole } from '../../../common/middlewares/authorizeRole.js';
import { getDashboard } from './garmentDashboard.controller.js';

const router = express.Router();

router.use(authenticate, authorizeRole('GARMENT_TECHNICIAN', 'OWNER', 'WAREHOUSE_MANAGER'));
router.get('/', getDashboard);

export default router;
