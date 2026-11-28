/**
 * ============================================================================
 * @title        : Order Management Routes
 * @author       : Nguyễn Quang Huy
 * @createdDate  : 2026-10-27
 * @lastModified : 2026-11-29
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
  updateOrderRecipient,
  confirmOrderReserve,
  cancelOrder,
  createPosDirectOrder,
  sendOrderConfirmationReceipt,
  sendCancelConfirmationInquiry,
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
  validateUpdateOrderRecipient,
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
 * @desc    Chỉnh sửa sản phẩm và chi tiết đơn hàng khi đang ở trạng thái PENDING (chưa giữ chỗ theo GBR-10)
 * @access  SELLER, OWNER
 * @see     BR: GBR-10
 */
router.put('/:id/items', authorizeRole('SELLER', 'OWNER'), validateUpdateOrderItems, updateOrderItems);

/**
 * @route   PATCH /api/orders/:id/recipient
 * @desc    Cập nhật thông tin người nhận (Tên, SĐT, Địa chỉ thật) trước khi bàn giao GHN
 * @access  SELLER, OWNER
 */
router.patch('/:id/recipient', authorizeRole('SELLER', 'OWNER'), validateUpdateOrderRecipient, updateOrderRecipient);

// UC-79 & [BR: GBR-10]: Xác nhận đơn hàng & Kích hoạt giữ chỗ tồn kho (+reservedQty)
router.post('/:id/confirm', authorizeRole('SELLER', 'OWNER'), confirmOrderReserve);

// Gửi phiếu xác nhận đơn hàng vào chat Messenger
router.post('/:id/send-confirmation', authorizeRole('SELLER', 'OWNER'), sendOrderConfirmationReceipt);

// Gửi tin nhắn hỏi xác nhận khách hàng trước khi hủy đơn (chỉ áp dụng Facebook)
router.post('/:id/send-cancel-inquiry', authorizeRole('SELLER', 'OWNER'), sendCancelConfirmationInquiry);

// Sandbox Simulator: Giả lập khách hàng nhắn "OK chốt đơn" (kích hoạt GBR-10)
router.post('/:id/simulate-confirm', authorizeRole('SELLER', 'OWNER'), simulateCustomerConfirm);

// [BR: GBR-13]: Đồng bộ mã vận đơn & trạng thái Realtime trực tiếp từ GHN API
router.post('/:id/sync-ghn', authorizeRole('SELLER', 'OWNER', 'WAREHOUSE_MANAGER', 'WAREHOUSE_STAFF'), syncOrderWithGhn);

// [BR: GBR-13]: Chuyển trạng thái vận đơn theo GHN (Sandbox / Webhook) và tự động bắn tin cho khách
router.post('/:id/ghn-status', authorizeRole('SELLER', 'OWNER', 'WAREHOUSE_MANAGER', 'WAREHOUSE_STAFF'), switchOrderGhnStatus);

// UC-81 & [BR: GBR-11]: Hủy đơn hàng & Tự động giải phóng tồn kho giữ chỗ (-reservedQty)
router.post('/:id/cancel', authorizeRole('SELLER', 'OWNER'), validateCancelOrder, cancelOrder);

export default router;
