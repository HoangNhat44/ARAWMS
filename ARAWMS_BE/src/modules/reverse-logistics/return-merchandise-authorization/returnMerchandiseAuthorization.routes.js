/**
 * ============================================================================
 * @title        : Return Merchandise Authorization (RMA) Routes
 * @author       : Nguyễn Quang Huy
 * @createdDate  : 2026-10-27
 * @lastModified : 2026-11-29
 * @description  : Định tuyến API cho quy trình đổi/trả hàng (UC-82) và yêu cầu hoàn tiền
 *                 gửi Kế toán lập phiếu chi ([BR: GBR-14], [BR: GBR-15], [BR: GBR-16], [BR: GBR-17], [BR: GBR-26]).
 * @module       : Reverse Logistics / Return Merchandise Authorization
 * @layer        : Route
 * ============================================================================
 */
import express from 'express';
import {
  createReturnRequest,
  getRmaList,
  getRmaById,
  submitRefundRequest,
  getRefundRequests,
  approveRefundRequest,
  rejectRefundRequest,
} from './returnMerchandiseAuthorization.controller.js';
import { authenticate } from '../../../common/middlewares/authenticate.js';
import { authorizeRole } from '../../../common/middlewares/authorizeRole.js';
import { validateCreateRma } from './returnMerchandiseAuthorization.validation.js';

const router = express.Router();

router.use(authenticate);

// Danh sách RMA
router.get('/', authorizeRole('SELLER', 'OWNER', 'WAREHOUSE_MANAGER', 'WAREHOUSE_STAFF', 'ACCOUNTANT'), getRmaList);

// [BR: GBR-17] Kế toán xem các yêu cầu hoàn tiền (đặt TRƯỚC route /:id)
router.get('/refund-requests', authorizeRole('ACCOUNTANT', 'OWNER'), getRefundRequests);

// Chi tiết RMA
router.get('/:id', authorizeRole('SELLER', 'OWNER', 'WAREHOUSE_MANAGER', 'WAREHOUSE_STAFF', 'ACCOUNTANT'), getRmaById);

// UC-82: Tiếp nhận và tạo yêu cầu đổi/trả hàng (RMA - [BR: GBR-14], [BR: GBR-15], [BR: GBR-16], [BR: GBR-26])
router.post('/', authorizeRole('SELLER', 'OWNER'), validateCreateRma, createReturnRequest);

// [BR: GBR-17] Seller gửi yêu cầu hoàn tiền -> Kế toán duyệt & tạo phiếu chi (CashFlowVoucher) gắn chứng từ gốc
router.post('/:id/refund-request', authorizeRole('SELLER', 'OWNER'), submitRefundRequest);
router.post('/:id/refund-approve', authorizeRole('ACCOUNTANT', 'OWNER'), approveRefundRequest);
router.post('/:id/refund-reject', authorizeRole('ACCOUNTANT', 'OWNER'), rejectRefundRequest);

export default router;
