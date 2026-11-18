/**
 * ============================================================================
 * @title        : Garment Lot Management Routes
 * @author       : AraWMS Team
 * @createdDate  : 2026-11-18
 * @lastModified : 2026-11-18
 * @description  : Định tuyến API Quản lý Lô cho Garment Technician (và cho phép Warehouse Manager / Owner tra cứu).
 * @module       : Garment Technical / Lot Management
 * @layer        : Route
 * ============================================================================
 */

import express from 'express';
import { authenticate } from '../../../common/middlewares/authenticate.js';
import { authorizeRole } from '../../../common/middlewares/authorizeRole.js';
import {
  getOptions,
  listLots,
  getLot,
  createLot,
  updateLot,
  deleteLot,
  sendInboundRequest,
} from './lotManagement.controller.js';

const router = express.Router();

router.use(authenticate);

// Tra cứu danh mục & lô hàng: Kỹ thuật may, Quản lý kho, Chủ cửa hàng đều xem được để tích hợp sinh QR lô
const canRead = authorizeRole('GARMENT_TECHNICIAN', 'WAREHOUSE_MANAGER', 'OWNER');
const techOnly = authorizeRole('GARMENT_TECHNICIAN');

router.get('/options', canRead, getOptions);
router.get('/', canRead, listLots);
router.get('/:id', canRead, getLot);

router.post('/', techOnly, createLot);
router.put('/:id', techOnly, updateLot);
router.delete('/:id', techOnly, deleteLot);
router.post('/send-inbound-request', techOnly, sendInboundRequest);

export default router;
