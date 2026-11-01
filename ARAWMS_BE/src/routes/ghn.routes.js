import express from 'express';
import authenticate from '../common/middlewares/authenticate.js';
import authorizeRole from '../common/middlewares/authorizeRole.js';
import { authorizePermission, CARRIER_VIEW, CARRIER_CREATE } from '../common/middlewares/authorizePermission.js';
import {
  createGhnOrder,
  getGhnOrderDetail,
  getGhnShops,
  testGhnFlow,
} from '../controllers/ghn.controller.js';

const router = express.Router();
// Nguyễn Ngọc Huy-HE171157, 30-10-2026: UC-09, GBR-01 - Áp dụng quyền ngoại lệ vào API nhân viên đã có.
router.use(authenticate);

// 1-Click Test endpoint
router.post('/test', authorizeRole('OWNER'), testGhnFlow);

// Create order
router.post('/orders', authorizePermission(CARRIER_CREATE), createGhnOrder);

// Get order detail
router.get('/orders/:orderCode', authorizePermission(CARRIER_VIEW), getGhnOrderDetail);
router.post('/orders/detail', authorizePermission(CARRIER_VIEW), getGhnOrderDetail);

// Get shops
router.get('/shops', authorizePermission(CARRIER_VIEW), getGhnShops);

export default router;
