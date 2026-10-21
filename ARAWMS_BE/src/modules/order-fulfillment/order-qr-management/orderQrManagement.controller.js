import { sendError, sendSuccess } from '../../../common/utils/responseHandler.js';
import { findOrder, issueQr, listOrdersForQr, replaceQr, publicOrderDetail, resolveQr } from './orderQrManagement.service.js';
import { canViewOrder, canIssueQr, canPackOrder } from '../../../common/services/orderAccessService.js';

const forbidden = (res) => sendError(res, 'Tài khoản chưa có quyền với đơn hàng này', { code: 'FORBIDDEN' }, 403);

export const listOrders = async (req, res, next) => {
  try {
    return sendSuccess(res, 'Danh sách đơn hàng', { orders: await listOrdersForQr(req.user) });
  } catch (error) { next(error); }
};

export const issueOrderQrBulk = async (req, res, next) => {
  try {
    const ids = req.body?.orderIds;
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > 100 ||
        ids.some((id) => typeof id !== 'string' || !id.trim()) ||
        new Set(ids).size !== ids.length) {
      return sendError(res, 'Chọn từ 1 đến 100 đơn không trùng nhau', { code: 'INVALID_ORDER_IDS' }, 400);
    }
    const results = [];
    for (const id of ids) {
      const order = await findOrder(id);
      if (!order) { results.push({ id, error: 'ORDER_NOT_FOUND' }); continue; }
      if (!canIssueQr(req.user, order)) { results.push({ id, error: 'FORBIDDEN' }); continue; }
      const result = await issueQr(order, req.user._id);
      results.push({ id, orderCode: order.orderCode, ...result,
        ...(result.qrValue ? { order: publicOrderDetail(order) } : {}) });
    }
    return sendSuccess(res, 'Kết quả cấp QR hàng loạt', { results });
  } catch (error) { next(error); }
};

export const lookupOrder = async (req, res, next) => {
  try {
    const order = await findOrder(req.query.code);
    if (!order) return sendError(res, 'Không tìm thấy đơn hàng', { code: 'ORDER_NOT_FOUND' }, 404);
    if (!canViewOrder(req.user, order)) return forbidden(res);
    return sendSuccess(res, 'Chi tiết đơn hàng', { order: publicOrderDetail(order) });
  } catch (error) {
    next(error);
  }
};

export const getOrderQr = async (req, res, next) => {
  try {
    const order = await findOrder(req.params.id);
    if (!order) return sendError(res, 'Không tìm thấy đơn hàng', { code: 'ORDER_NOT_FOUND' }, 404);
    if (!canIssueQr(req.user, order)) return forbidden(res);
    const result = await issueQr(order, req.user._id);
    if (result.error) return sendError(res, 'Không thể cấp QR cho đơn hàng này', { code: result.error }, 409);
    return sendSuccess(res, 'QR đơn hàng đang hiệu lực', { ...result, order: publicOrderDetail(order) });
  } catch (error) {
    next(error);
  }
};

export const resolveOrderQr = async (req, res, next) => {
  try {
    const result = await resolveQr(req.body.qrValue);
    if (result.error) return sendError(res, 'QR không hợp lệ hoặc không còn hiệu lực', { code: result.error }, 404);
    const order = await findOrder(result.order.id);
    if (!order || !canPackOrder(req.user, order)) return forbidden(res);
    return sendSuccess(res, 'Đã xác thực QR đơn hàng', { order: publicOrderDetail(order) });
  } catch (error) {
    next(error);
  }
};

export const replaceOrderQr = async (req, res, next) => {
  try {
    const order = await findOrder(req.params.id);
    if (!order) return sendError(res, 'Không tìm thấy đơn hàng', { code: 'ORDER_NOT_FOUND' }, 404);
    if (!canIssueQr(req.user, order)) return forbidden(res);
    const result = await replaceQr(order, req.user._id);
    if (result.error) return sendError(res, 'Không thể thay QR cho đơn hàng này', { code: result.error }, 409);
    return sendSuccess(res, 'Đã thu hồi QR cũ và cấp QR mới', { ...result, order: publicOrderDetail(order) });
  } catch (error) {
    next(error);
  }
};

export const confirmOrder = async (req, res, next) => {
  try {
    const SalesOrder = (await import('../../../models/SalesOrder.model.js')).default;
    const order = await findOrder(req.params.id);
    if (!order) return sendError(res, 'Không tìm thấy đơn', { code: 'ORDER_NOT_FOUND' }, 404);
    if (order.demoOnly) return sendError(res, 'Đơn mẫu đã ở trạng thái sẵn sàng', { code: 'DEMO_ORDER' }, 409);
    if (!canIssueQr(req.user, order)) return sendError(res, 'Không có quyền chốt đơn', { code: 'FORBIDDEN' }, 403);
    if (order.status !== 'PENDING') return sendError(res, 'Đơn không còn chờ chốt', { code: 'ORDER_NOT_PENDING' }, 409);
    const now = new Date();
    const confirmed = await SalesOrder.findOneAndUpdate(
      { _id: order._id, status: 'PENDING', updatedAt: order.updatedAt },
      { $set: { status: 'CONFIRMED', confirmedAt: now },
        $push: { statusHistory: { from: 'PENDING', to: 'CONFIRMED', by: req.user._id, at: now } } },
      { new: true }
    ).lean();
    if (!confirmed) return sendError(res, 'Đơn đã thay đổi, hãy tải lại', { code: 'ORDER_CHANGED' }, 409);
    const qr = await issueQr(confirmed, req.user._id);
    return sendSuccess(res, 'Đã chốt đơn và cấp QR', { order: publicOrderDetail(confirmed), qrValue: qr.qrValue });
  } catch (error) { next(error); }
};
