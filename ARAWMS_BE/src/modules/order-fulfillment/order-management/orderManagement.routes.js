import express from 'express';
import {
  createDirectOrder,
  confirmOrderReserve,
  updateOrderStatus,
  cancelOrder,
  getOrderList,
  getOrderById,
} from './orderManagement.controller.js';
import { authenticate } from '../../../common/middlewares/authenticate.js';
import { authorizeRole } from '../../../common/middlewares/authorizeRole.js';
import { validateCreateOrder } from './orderManagement.validation.js';

const router = express.Router();

// Yêu cầu xác thực JWT cho tất cả thao tác đơn hàng
router.use(authenticate);

// Danh sách & chi tiết đơn hàng
router.get('/', authorizeRole('SELLER', 'OWNER', 'WAREHOUSE_MANAGER', 'WAREHOUSE_STAFF', 'ACCOUNTANT'), getOrderList);
router.get('/:id', authorizeRole('SELLER', 'OWNER', 'WAREHOUSE_MANAGER', 'WAREHOUSE_STAFF', 'ACCOUNTANT'), getOrderById);

// UC-78: Tạo đơn hàng trực tiếp
router.post('/', authorizeRole('SELLER', 'OWNER'), validateCreateOrder, createDirectOrder);

// UC-79: Xác nhận đơn hàng & Kích hoạt giữ chỗ tồn kho
router.post('/:id/confirm', authorizeRole('SELLER', 'OWNER'), confirmOrderReserve);

// UC-80: Cập nhật thông tin nhận hàng / trạng thái
router.patch('/:id/status', authorizeRole('SELLER', 'OWNER', 'WAREHOUSE_MANAGER', 'WAREHOUSE_STAFF'), updateOrderStatus);

// UC-81: Hủy đơn hàng & Giải phóng tồn kho giữ chỗ
router.post('/:id/cancel', authorizeRole('SELLER', 'OWNER'), cancelOrder);

export default router;
