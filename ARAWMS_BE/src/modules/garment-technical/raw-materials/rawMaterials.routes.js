/**
 * ============================================================================
 * @title        : Raw Materials Routes
 * @author       : AraWMS Team
 * @createdDate  : 2026-11-09
 * @lastModified : 2026-11-09
 * @description  : Định tuyến các API quản lý nguyên phụ liệu cho Phân hệ Kỹ thuật may (Garment Technician),
 *                 đồng thời cho phép Quản lý kho và Chủ doanh nghiệp (Owner) truy cập.
 * @module       : Garment Technical / Raw Materials
 * @layer        : Route
 * ============================================================================
 */

import express from 'express';
import { authenticate } from '../../../common/middlewares/authenticate.js';
import { authorizeRole } from '../../../common/middlewares/authorizeRole.js';
import {
  listMaterials,
  getMaterial,
  createMaterial,
  updateMaterial,
  deleteMaterial,
  toggleStatus,
  getMeta,
} from './rawMaterials.controller.js';

const router = express.Router();

// Tất cả các endpoints đều yêu cầu đăng nhập và có quyền GARMENT_TECHNICIAN, WAREHOUSE_MANAGER, hoặc OWNER
router.use(authenticate, authorizeRole('GARMENT_TECHNICIAN', 'WAREHOUSE_MANAGER', 'OWNER'));

router.get('/meta', getMeta);
router.get('/', listMaterials);
router.get('/:id', getMaterial);
router.post('/', createMaterial);
router.put('/:id', updateMaterial);
router.delete('/:id', deleteMaterial);
router.patch('/:id/toggle-status', toggleStatus);

export default router;

