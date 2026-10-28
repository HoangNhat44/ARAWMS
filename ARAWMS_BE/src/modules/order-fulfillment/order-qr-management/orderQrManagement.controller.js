/*
 * File: orderQrManagement.controller.js
 * Author: Duy Anh
 * Date: 2026-10-21
 * Description: Handles order confirmation and QR API requests.
 */
import { sendError, sendSuccess } from '../../../common/utils/responseHandler.js';
import { findOrder, issueQr, listOrdersForQr, replaceQr, publicOrderDetail, resolveQr } from './orderQrManagement.service.js';
import { canViewOrder, canIssueQr, canPackOrder, canConfirmOrder } from '../../../common/services/orderAccessService.js';
import { reserveOrderStock } from './orderReservation.service.js';

const sendOrderAccessDenied = (res) => sendError(res, 'Tài khoản chưa có quyền với đơn hàng này', { code: 'FORBIDDEN' }, 403);

/** Lists orders visible to the authenticated user for QR management. */
export const listOrders = async (req, res, next) => {
  try {
    return sendSuccess(res, 'Danh sách đơn hàng', { orders: await listOrdersForQr(req.user) });
  } catch (error) { next(error); }
};

/** Issues QR values for up to 100 distinct orders and reports per-order failures. */
export const issueOrderQrBulk = async (req, res, next) => {
  try {
    const ids = req.body?.orderIds;
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > 100 ||
        ids.some((id) => typeof id !== 'string' || !id.trim()) ||
        new Set(ids).size !== ids.length) {
      return sendError(res, 'Chọn từ 1 đến 100 đơn không trùng nhau', { code: 'INVALID_ORDER_IDS' }, 400);
    }
    const results = new Array(ids.length);
    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(4, ids.length) }, async () => {
      while (cursor < ids.length) {
        const index = cursor++;
        const id = ids[index];
        try {
          const order = await findOrder(id);
          if (!order) { results[index] = { id, error: 'ORDER_NOT_FOUND' }; continue; }
          if (!canIssueQr(req.user, order)) { results[index] = { id, error: 'FORBIDDEN' }; continue; }
          const result = await issueQr(order, req.user._id);
          results[index] = { id, orderCode: order.orderCode, ...result,
            ...(result.qrValue ? { order: publicOrderDetail(order) } : {}) };
        } catch (error) {
          console.error('[Order QR] Bulk issue failed', id, error);
          results[index] = { id, error: 'QR_IMAGE_UPLOAD_FAILED' };
        }
      }
    }));
    return sendSuccess(res, 'Kết quả cấp QR hàng loạt', { results });
  } catch (error) { next(error); }
};

/** Looks up an order by code after checking the caller's access. */
export const lookupOrder = async (req, res, next) => {
  try {
    const order = await findOrder(req.query.code);
    if (!order) return sendError(res, 'Không tìm thấy đơn hàng', { code: 'ORDER_NOT_FOUND' }, 404);
    if (!canViewOrder(req.user, order)) return sendOrderAccessDenied(res);
    return sendSuccess(res, 'Chi tiết đơn hàng', { order: publicOrderDetail(order) });
  } catch (error) {
    next(error);
  }
};

/** Returns or creates the active QR value for an eligible order. */
export const getOrderQr = async (req, res, next) => {
  try {
    const order = await findOrder(req.params.id);
    if (!order) return sendError(res, 'Không tìm thấy đơn hàng', { code: 'ORDER_NOT_FOUND' }, 404);
    if (!canIssueQr(req.user, order)) return sendOrderAccessDenied(res);
    const result = await issueQr(order, req.user._id);
    if (result.error) return sendError(res, 'Không thể cấp QR cho đơn hàng này', { code: result.error }, 409);
    return sendSuccess(res, 'QR đơn hàng đang hiệu lực', { ...result, order: publicOrderDetail(order) });
  } catch (error) {
    next(error);
  }
};

/** Resolves a scanned QR value and verifies packing access to its order. */
export const resolveOrderQr = async (req, res, next) => {
  try {
    const result = await resolveQr(req.body.qrValue);
    if (result.error) return sendError(res, 'QR không hợp lệ hoặc không còn hiệu lực', { code: result.error }, 404);
    const order = await findOrder(result.order.id);
    if (!order || !canPackOrder(req.user, order)) return sendOrderAccessDenied(res);
    return sendSuccess(res, 'Đã xác thực QR đơn hàng', { order: publicOrderDetail(order) });
  } catch (error) {
    next(error);
  }
};

/** Revokes an existing QR value and issues a replacement for the same order. */
export const replaceOrderQr = async (req, res, next) => {
  try {
    const order = await findOrder(req.params.id);
    if (!order) return sendError(res, 'Không tìm thấy đơn hàng', { code: 'ORDER_NOT_FOUND' }, 404);
    if (!canIssueQr(req.user, order)) return sendOrderAccessDenied(res);
    const result = await replaceQr(order, req.user._id);
    if (result.error) return sendError(res, 'Không thể thay QR cho đơn hàng này', { code: result.error }, 409);
    return sendSuccess(res, 'Đã thu hồi QR cũ và cấp QR mới', { ...result, order: publicOrderDetail(order) });
  } catch (error) {
    next(error);
  }
};

/** Confirms a pending order only after its stock reservation succeeds. */
export const confirmOrder = async (req, res, next) => {
  try {
    const order = await findOrder(req.params.id);
    if (!order) return sendError(res, 'Không tìm thấy đơn', { code: 'ORDER_NOT_FOUND' }, 404);
    if (!canConfirmOrder(req.user, order)) return sendError(res, 'Không có quyền chốt đơn', { code: 'FORBIDDEN' }, 403);
    if (order.status !== 'PENDING') return sendError(res, 'Đơn không còn chờ chốt', { code: 'ORDER_NOT_PENDING' }, 409);
    const confirmed = await reserveOrderStock(order._id, req.user._id);
    const qr = await issueQr(confirmed, req.user._id);
    if (qr.error) return sendError(res, 'Đơn đã giữ hàng nhưng chưa thể cấp QR', { code: qr.error }, 409);
    const detail = await findOrder(String(confirmed._id));
    return sendSuccess(res, 'Đã giữ hàng và cấp QR', { order: publicOrderDetail(detail),
      qrValue: qr.qrValue, qrImageUrl: qr.qrImageUrl });
  } catch (error) {
    if (error.status) return sendError(res, 'Không thể giữ đủ hàng cho đơn', { code: error.code }, error.status);
    next(error);
  }
};
