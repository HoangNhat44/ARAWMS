/**
 * ============================================================================
 * @title        : Return Inspection Routes
 * @author       : AraWMS Team
 * @createdDate  : 2026-11-11
 * @lastModified : 2026-11-11
 * @description  : Định tuyến API kiểm tra hàng hoàn/trả cho Nhân viên Kỹ thuật (Garment Technician),
 *                 đồng thời phân quyền cho Quản lý kho và Chủ doanh nghiệp.
 * @module       : Garment Technical / Return Inspection
 * @layer        : Route
 * ============================================================================
 */

import express from 'express';
import { authenticate } from '../../../common/middlewares/authenticate.js';
import { authorizeRole } from '../../../common/middlewares/authorizeRole.js';
import {
  lookupOrder,
  submitInspection,
  listInspections,
  requestInboundTicket,
  getRecentOrders,
} from './returnInspection.controller.js';

const router = express.Router();

// Tất cả endpoints yêu cầu đăng nhập và có vai trò GARMENT_TECHNICIAN, WAREHOUSE_MANAGER, hoặc OWNER
router.use(authenticate, authorizeRole('GARMENT_TECHNICIAN', 'WAREHOUSE_MANAGER', 'OWNER'));

// 0. Gợi ý các đơn hàng gần đây để kiểm tra nhanh
router.get('/recent-orders', getRecentOrders);

// 1. Tra cứu/quét mã đơn hàng, mã vận đơn, mã RMA hoặc QR token
router.get('/lookup/:code', lookupOrder);
router.get('/lookup', lookupOrder);

// 2. Ghi nhận biên bản kiểm tra KCS hàng hoàn (Đạt / Không đạt kèm video)
router.post('/submit', submitInspection);

// 3. Lấy danh sách kết quả kiểm tra (có bộ lọc Đạt / Không đạt)
router.get('/', listInspections);

// 4. Tạo phiếu yêu cầu nhập kho hàng hoàn (FinishedGoodsTicket)
router.post('/inbound-ticket', requestInboundTicket);

export default router;

