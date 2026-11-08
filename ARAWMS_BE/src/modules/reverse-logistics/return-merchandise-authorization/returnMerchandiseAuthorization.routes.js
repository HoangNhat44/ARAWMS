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

// [GBR-14] Kế toán xem các yêu cầu hoàn tiền (đặt TRƯỚC route /:id)
router.get('/refund-requests', authorizeRole('ACCOUNTANT', 'OWNER'), getRefundRequests);

// Chi tiết RMA
router.get('/:id', authorizeRole('SELLER', 'OWNER', 'WAREHOUSE_MANAGER', 'WAREHOUSE_STAFF', 'ACCOUNTANT'), getRmaById);

// UC-82: Tiếp nhận và tạo yêu cầu đổi/trả hàng (RMA - GBR-11, GBR-12, GBR-13, GBR-23)
router.post('/', authorizeRole('SELLER', 'OWNER'), validateCreateRma, createReturnRequest);

// [GBR-14] Seller gửi yêu cầu hoàn tiền -> Kế toán duyệt & tạo phiếu chi (CashFlowVoucher)
router.post('/:id/refund-request', authorizeRole('SELLER', 'OWNER'), submitRefundRequest);
router.post('/:id/refund-approve', authorizeRole('ACCOUNTANT', 'OWNER'), approveRefundRequest);
router.post('/:id/refund-reject', authorizeRole('ACCOUNTANT', 'OWNER'), rejectRefundRequest);

export default router;
