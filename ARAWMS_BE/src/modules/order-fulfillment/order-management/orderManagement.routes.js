/**
 * ============================================================================
 * @title        : Order Management Routes
 * @author       : Nguyễn Quang Huy
 * @createdDate  : 2026-10-27
 * @lastModified : 2026-11-14
 * @description  : Định tuyến các endpoints cho Quản lý Đơn hàng của Seller,
 *                 tích hợp xác thực JWT, phân quyền SELLER/OWNER và validation.
 * @module       : Order Fulfillment / Order Management
 * @layer        : Route
 * ============================================================================
 */

import express from 'express';
import {
  createDirectOrder,
  updateOrderItems,
  confirmOrderReserve,
  cancelOrder,
  createPosDirectOrder,
  sendOrderConfirmationReceipt,
  simulateCustomerConfirm,
  syncOrderWithGhn,
  switchOrderGhnStatus,
  getOrderList,
  getOrderById,
} from './orderManagement.controller.js';
import { authenticate } from '../../../common/middlewares/authenticate.js';
import { authorizeRole } from '../../../common/middlewares/authorizeRole.js';
import {
  validateCreateOrder,
  validateUpdateOrderItems,
  validateCancelOrder,
} from './orderManagement.validation.js';

const router = express.Router();

// Yêu cầu xác thực JWT cho tất cả thao tác đơn hàng
router.use(authenticate);

// Danh sách & chi tiết đơn hàng
router.get('/', authorizeRole('SELLER', 'OWNER', 'WAREHOUSE_MANAGER', 'WAREHOUSE_STAFF', 'ACCOUNTANT'), getOrderList);
router.get('/:id', authorizeRole('SELLER', 'OWNER', 'WAREHOUSE_MANAGER', 'WAREHOUSE_STAFF', 'ACCOUNTANT'), getOrderById);

/**
 * @route   POST /api/orders
 * @desc    UC-78: Tạo đơn hàng trực tiếp
 * @access  SELLER, OWNER
 * @see     BR: GBR-10
 */
router.post('/', authorizeRole('SELLER', 'OWNER'), validateCreateOrder, createDirectOrder);

/**
 * @route   POST /api/orders/pos-direct
 * @desc    Tạo đơn bán lẻ trực tiếp tại quầy AraStore POS (Khách lấy ngay)
 * @access  SELLER, OWNER
 */
router.post('/pos-direct', authorizeRole('SELLER', 'OWNER'), validateCreateOrder, createPosDirectOrder);

/**
 * @route   PUT /api/orders/:id/items
 * @desc    Chỉnh sửa sản phẩm và chi tiết đơn hàng khi đang ở trạng thái PENDING
 * @access  SELLER, OWNER
 * @see     BR: GBR-08
 */
router.put('/:id/items', authorizeRole('SELLER', 'OWNER'), validateUpdateOrderItems, updateOrderItems);

// UC-79: Xác nhận đơn hàng & Kích hoạt giữ chỗ tồn kho
router.post('/:id/confirm', authorizeRole('SELLER', 'OWNER'), confirmOrderReserve);

// Gửi phiếu xác nhận đơn hàng vào chat Messenger
router.post('/:id/send-confirmation', authorizeRole('SELLER', 'OWNER'), sendOrderConfirmationReceipt);

// Sandbox Simulator: Giả lập khách hàng nhắn "OK chốt đơn"
router.post('/:id/simulate-confirm', authorizeRole('SELLER', 'OWNER'), simulateCustomerConfirm);

// Đồng bộ mã vận đơn & trạng thái Realtime trực tiếp từ GHN API (GBR-10)
router.post('/:id/sync-ghn', authorizeRole('SELLER', 'OWNER', 'WAREHOUSE_MANAGER', 'WAREHOUSE_STAFF'), syncOrderWithGhn);

// Chuyển trạng thái vận đơn theo GHN (Sandbox / Webhook) và tự động bắn tin cho khách
router.post('/:id/ghn-status', authorizeRole('SELLER', 'OWNER', 'WAREHOUSE_MANAGER', 'WAREHOUSE_STAFF'), switchOrderGhnStatus);

// UC-81: Hủy đơn hàng & Giải phóng tồn kho giữ chỗ
router.post('/:id/cancel', authorizeRole('SELLER', 'OWNER'), validateCancelOrder, cancelOrder);

export default router;
