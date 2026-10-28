/**
 * ============================================================================
 * @title        : Order Management Controller
 * @author       : Nguyễn Quang Huy
 * @createdDate  : 2026-10-27
 * @lastModified : 2026-10-27
 * @description  : Tiếp nhận và xử lý HTTP Request cho phân hệ Quản lý Đơn hàng
 *                 của Seller (UC-78, UC-79, UC-80, UC-81). Điều phối gọi Service
 *                 và định dạng phản hồi chuẩn API Response.
 * @module       : Order Fulfillment / Order Management
 * @layer        : Controller
 * ============================================================================
 */

import orderManagementService from './orderManagement.service.js';
import { successResponse, errorResponse } from '../../../common/utils/apiResponse.js';

/**
 * UC-78: Tạo đơn hàng trực tiếp từ khung chat Seller
 * POST /api/orders
 * @businessRule GBR-10 Kích hoạt giữ chỗ tồn kho khi tạo/xác nhận đơn hàng
 */
export const createDirectOrder = async (req, res) => {
  try {
    const order = await orderManagementService.createDirectOrder(req.body, req.user, req);
    return successResponse(res, order, 'Tạo đơn hàng thành công', 201);
  } catch (error) {
    return errorResponse(res, error.message, 400);
  }
};

/**
 * UC-79: Xác nhận đơn hàng & Kích hoạt giữ chỗ tồn kho
 * POST /api/orders/:id/confirm
 */
export const confirmOrderReserve = async (req, res) => {
  try {
    const order = await orderManagementService.confirmOrderReserve(req.params.id, req.user, req);
    return successResponse(res, order, 'Xác nhận đơn hàng và giữ chỗ kho thành công');
  } catch (error) {
    return errorResponse(res, error.message, 400);
  }
};

/**
 * UC-80: Cập nhật thông tin nhận hàng / trạng thái đơn
 * PATCH /api/orders/:id/status
 */
export const updateOrderStatus = async (req, res) => {
  try {
    const order = await orderManagementService.updateOrderStatus(req.params.id, req.body, req.user, req);
    return successResponse(res, order, 'Cập nhật trạng thái đơn hàng thành công');
  } catch (error) {
    return errorResponse(res, error.message, 400);
  }
};

/**
 * UC-81: Hủy đơn hàng & Giải phóng tồn kho giữ chỗ
 * POST /api/orders/:id/cancel
 */
export const cancelOrder = async (req, res) => {
  try {
    const { cancelReason } = req.body;
    const order = await orderManagementService.cancelOrder(req.params.id, cancelReason, req.user, req);
    return successResponse(res, order, 'Hủy đơn hàng và giải phóng tồn kho thành công');
  } catch (error) {
    return errorResponse(res, error.message, 400);
  }
};

/**
 * Lấy danh sách đơn hàng
 * GET /api/orders
 */
export const getOrderList = async (req, res) => {
  try {
    const result = await orderManagementService.getOrderList(req.query, req.user);
    return successResponse(res, result, 'Lấy danh sách đơn hàng thành công');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

/**
 * Lấy chi tiết đơn hàng
 * GET /api/orders/:id
 */
export const getOrderById = async (req, res) => {
  try {
    const order = await orderManagementService.getOrderById(req.params.id);
    return successResponse(res, order, 'Lấy chi tiết đơn hàng thành công');
  } catch (error) {
    return errorResponse(res, error.message, 404);
  }
};

export default {
  createDirectOrder,
  confirmOrderReserve,
  updateOrderStatus,
  cancelOrder,
  getOrderList,
  getOrderById,
};
