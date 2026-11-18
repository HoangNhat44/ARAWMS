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
  openSession,
  scanUnit,
  removeUnit,
  finishRecording,
  cancelSession,
  uploadVideo,
  syncVideo,
  getVideo,
  finalizeAndRequestInbound,
} from './returnInspection.controller.js';

const router = express.Router();

// Tất cả endpoints yêu cầu đăng nhập và có vai trò GARMENT_TECHNICIAN, WAREHOUSE_MANAGER, hoặc OWNER
router.use(authenticate, authorizeRole('GARMENT_TECHNICIAN', 'WAREHOUSE_MANAGER', 'OWNER'));

// 0. Gợi ý các đơn hàng gần đây để kiểm tra nhanh
router.get('/recent-orders', getRecentOrders);

// 1. Tra cứu/quét mã đơn hàng, mã vận đơn, mã RMA hoặc QR token
router.get('/lookup/:code', lookupOrder);
router.get('/lookup', lookupOrder);

// 2. Phiên quét QR đơn hàng hoàn + quay video liên tục + quét barcode từng sản phẩm
router.post('/sessions/open', openSession);
router.post('/sessions/:id/scan-unit', scanUnit);
router.post('/sessions/:id/remove-unit', removeUnit);
router.post('/sessions/:id/finish-recording', finishRecording);
router.post('/sessions/:id/cancel', cancelSession);
router.post('/sessions/:id/video', uploadVideo);
router.post('/sessions/:id/video/:recordingId/sync', syncVideo);
router.get('/sessions/:id/video', getVideo);

// 3. Phân loại từng sản phẩm (đạt / hàng lỗi) & đồng thời tạo phiếu nhập kho (PNHH + PNHL)
router.post('/finalize-and-request-inbound', finalizeAndRequestInbound);

// 4. Ghi nhận biên bản kiểm tra KCS hàng hoàn (luồng cũ tương thích ngược)
router.post('/submit', submitInspection);

// 5. Lấy danh sách kết quả kiểm tra (hỗ trợ lọc sessionStatus & result)
router.get('/', listInspections);

// 6. Tạo phiếu yêu cầu nhập kho hàng hoàn (FinishedGoodsTicket)
router.post('/inbound-ticket', requestInboundTicket);

export default router;

