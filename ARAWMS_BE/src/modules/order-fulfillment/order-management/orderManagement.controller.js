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

/**
 * Chỉnh sửa sản phẩm và chi tiết đơn hàng khi đang ở trạng thái PENDING
 * PUT /api/orders/:id/items
 * @businessRule GBR-08 Đơn hàng chỉ được phép sửa sản phẩm khi ở PENDING
 */
export const updateOrderItems = async (req, res) => {
  try {
    const order = await orderManagementService.updateOrderItemsAndDetails(req.params.id, req.body, req.user, req);
    return successResponse(res, order, 'Cập nhật sản phẩm đơn hàng thành công');
  } catch (error) {
    return errorResponse(res, error.message, 400);
  }
};

/**
 * Tạo đơn bán lẻ trực tiếp tại quầy AraStore POS
 * POST /api/orders/pos-direct
 */
export const createPosDirectOrder = async (req, res) => {
  try {
    const order = await orderManagementService.createPosDirectOrder(req.body, req.user, req);
    return successResponse(res, order, 'Tạo đơn hàng bán tại quầy POS thành công', 201);
  } catch (error) {
    return errorResponse(res, error.message, 400);
  }
};

/**
 * Gửi phiếu xác nhận đơn hàng vào chat
 * POST /api/orders/:id/send-confirmation
 */
export const sendOrderConfirmationReceipt = async (req, res) => {
  try {
    const result = await orderManagementService.sendOrderConfirmationReceipt(req.params.id, req.user, req);
    return successResponse(res, result, 'Đã gửi phiếu xác nhận đơn hàng vào chat');
  } catch (error) {
    return errorResponse(res, error.message, 400);
  }
};

/**
 * Giả lập khách hàng nhắn tin xác nhận chốt đơn (Sandbox)
 * POST /api/orders/:id/simulate-confirm
 */
export const simulateCustomerConfirm = async (req, res) => {
  try {
    const result = await orderManagementService.simulateCustomerConfirm(req.params.id, req.user, req);
    return successResponse(res, result, 'Giả lập khách chốt đơn thành công');
  } catch (error) {
    return errorResponse(res, error.message, 400);
  }
};

/**
 * Tự động tạo/lấy mã vận đơn từ GHN API và đồng bộ trạng thái Realtime từ GHN
 * POST /api/orders/:id/sync-ghn
 */
export const syncOrderWithGhn = async (req, res) => {
  try {
    const order = await orderManagementService.syncOrderWithGhn(req.params.id, req.user, req);
    if (order.orderType === 'POS_DIRECT' || order.channel === 'POS' || order.channel === 'POS_OFFLINE') {
      return successResponse(
        res,
        order,
        'Đơn bán tại quầy nhận trực tiếp, không phát sinh vận đơn giao hàng.'
      );
    }
    const chatInfo = order.chatNotified
      ? ' và đã gửi tin nhắn cập nhật cho khách'
      : '';
    const waybill = order.warehouseFulfillment?.waybillCode || '';
    return successResponse(
      res,
      order,
      waybill
        ? `Đã lấy mã vận đơn GHN: ${waybill}${chatInfo}`
        : `Đã đồng bộ trạng thái đơn hàng từ GHN${chatInfo}`
    );
  } catch (error) {
    return errorResponse(res, error.message, 400);
  }
};

/**
 * Chuyển trạng thái vận đơn theo chuẩn GHN (ready_to_pick, picking, storing, delivering, delivered, cancel, return, returned)
 * và tự động bắn tin nhắn cho khách qua khung Chat
 * POST /api/orders/:id/ghn-status
 */
export const switchOrderGhnStatus = async (req, res) => {
  try {
    const { ghnStatus } = req.body;
    const order = await orderManagementService.switchOrderGhnStatus(req.params.id, ghnStatus, req.user, req);
    const chatInfo = order.chatNotified
      ? ' và đã gửi tin thông báo cho khách qua Chat!'
      : '';
    const statusLabel = order.warehouseFulfillment?.ghnStatusName || ghnStatus;
    return successResponse(
      res,
      order,
      `Đã cập nhật trạng thái GHN: ${statusLabel}${chatInfo}`
    );
  } catch (error) {
    return errorResponse(res, error.message, 400);
  }
};

export default {
  createDirectOrder,
  updateOrderItems,
  confirmOrderReserve,
  updateOrderStatus,
  syncOrderWithGhn,
  switchOrderGhnStatus,
  cancelOrder,
  createPosDirectOrder,
  sendOrderConfirmationReceipt,
  simulateCustomerConfirm,
  getOrderList,
  getOrderById,
};
