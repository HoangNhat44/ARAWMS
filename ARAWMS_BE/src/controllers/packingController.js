import mongoose from 'mongoose';
import PackingSession from '../models/PackingSession.js';
import ProductUnit from '../models/ProductUnit.js';
import Sku from '../models/Sku.js';
import Config from '../models/Config.js';
import SalesOrder from '../models/SalesOrder.js';
import { sendError, sendSuccess } from '../utils/responseHandler.js';
import { findOrder, issueQr, publicOrderDetail, resolveQr } from '../services/orderQrService.js';
import { canPackOrder, canIssueQr } from '../services/orderAccessService.js';
import { PackingError, heartbeatPacking, preparePacking, releasePacking, scanProduct, sessionView } from '../services/packingService.js';
import { ensurePackingIndexes } from '../services/packingIndexes.js';

const fail = (res, error) => sendError(res, error.code, { code: error.code }, error.status);

const authorizedSession = async (req) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new PackingError('INVALID_SESSION', 400);
  const packing = await PackingSession.findById(req.params.id);
  if (!packing) throw new PackingError('SESSION_NOT_FOUND', 404);
  const order = await findOrder(packing.orderKey);
  if (!order || !canPackOrder(req.user, order)) throw new PackingError('FORBIDDEN', 403);
  return packing;
};

export const confirmOrder = async (req, res, next) => {
  try {
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

export const prepare = async (req, res, next) => {
  try {
    const resolved = await resolveQr(req.body.qrValue);
    if (resolved.error) return sendError(res, 'QR không hợp lệ', { code: resolved.error }, 404);
    const order = await findOrder(resolved.order.id);
    if (!order || !canPackOrder(req.user, order)) return sendError(res, 'Không có quyền đóng đơn này', { code: 'FORBIDDEN' }, 403);
    const session = await preparePacking(order, req.user._id, req.body.stationId);
    return sendSuccess(res, 'Đã mở phiên soạn hàng', { order: publicOrderDetail(order), session });
  } catch (error) {
    if (error instanceof PackingError) return fail(res, error);
    next(error);
  }
};

export const getPackingSession = async (req, res, next) => {
  try {
    const packing = await authorizedSession(req);
    return sendSuccess(res, 'Tiến độ soạn hàng', { session: sessionView(packing) });
  } catch (error) {
    if (error instanceof PackingError) return fail(res, error);
    next(error);
  }
};

export const heartbeat = async (req, res, next) => {
  try {
    await authorizedSession(req);
    const session = await heartbeatPacking(req.params.id, req.body.stationId, req.body.leaseVersion);
    return sendSuccess(res, 'Đã gia hạn phiên', { session });
  } catch (error) {
    if (error instanceof PackingError) return fail(res, error);
    next(error);
  }
};

export const release = async (req, res, next) => {
  try {
    await authorizedSession(req);
    const session = await releasePacking(req.params.id, req.body.stationId, req.body.leaseVersion);
    return sendSuccess(res, 'Đã tạm dừng phiên tại bàn này', { session });
  } catch (error) {
    if (error instanceof PackingError) return fail(res, error);
    next(error);
  }
};

export const scan = async (req, res, next) => {
  try {
    await authorizedSession(req);
    const result = await scanProduct({ sessionId: req.params.id, ...req.body });
    return sendSuccess(res, result.result === 'ACCEPTED' ? 'Đã nhận sản phẩm' : 'Barcode không được chấp nhận', result);
  } catch (error) {
    if (error instanceof PackingError) return fail(res, error);
    next(error);
  }
};

export const registerProductUnit = async (req, res, next) => {
  try {
    if (!req.user.roles?.includes('ADMIN')) return sendError(res, 'Không có quyền', { code: 'FORBIDDEN' }, 403);
    await ensurePackingIndexes();
    const { barcode, skuId, warehouseId } = req.body;
    if (typeof barcode !== 'string' || !/^[A-Za-z0-9_-]{3,128}$/.test(barcode) ||
        !mongoose.isValidObjectId(skuId) || !mongoose.isValidObjectId(warehouseId)) {
      return sendError(res, 'Dữ liệu tem không hợp lệ', { code: 'INVALID_UNIT' }, 400);
    }
    const [sku, warehouse] = await Promise.all([
      Sku.findById(skuId).select('_id'),
      Config.findOne({ _id: warehouseId, kind: 'WAREHOUSE' }).select('_id'),
    ]);
    if (!sku || !warehouse) return sendError(res, 'SKU hoặc kho không tồn tại', { code: 'INVALID_UNIT' }, 400);
    const unit = await ProductUnit.create({ barcode, barcodeFormat: 'CODE_128', skuId, warehouseId });
    return sendSuccess(res, 'Đã đăng ký tem sản phẩm vật lý', { id: unit.id, barcode: unit.barcode }, 201);
  } catch (error) {
    if (error.code === 11000) return sendError(res, 'Barcode đã tồn tại', { code: 'BARCODE_EXISTS' }, 409);
    next(error);
  }
};
