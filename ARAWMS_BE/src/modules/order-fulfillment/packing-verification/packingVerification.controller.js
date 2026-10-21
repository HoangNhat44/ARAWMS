import mongoose from 'mongoose';
import PackingSession from '../../../models/PackingSession.js';
import ProductUnit from '../../../models/ProductUnit.js';
import Sku from '../../../models/Sku.model.js';
import { sendError, sendSuccess } from '../../../common/utils/responseHandler.js';
import { findOrder, issueQr, publicOrderDetail, resolveQr } from '../order-qr-management/orderQrManagement.service.js';
import { canPackOrder, canIssueQr } from '../../../common/services/orderAccessService.js';
import { PackingError, heartbeatPacking, preparePacking, releasePacking, scanProduct, sessionView } from './packingVerification.service.js';
import { ensurePackingIndexes } from './packingIndexes.js';
import { uploadPackingVideo as saveVideo, syncPackingVideo as syncVideo, streamPackingVideo } from './packingVideo.service.js';

const fail = (res, error) => sendError(res, error.code, { code: error.code }, error.status);

const authorizedSession = async (req) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new PackingError('INVALID_SESSION', 400);
  const packing = await PackingSession.findById(req.params.id);
  if (!packing) throw new PackingError('SESSION_NOT_FOUND', 404);
  const order = await findOrder(packing.orderKey);
  if (!order || !canPackOrder(req.user, order)) throw new PackingError('FORBIDDEN', 403);
  return packing;
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

export const uploadPackingVideo = async (req, res, next) => {
  try {
    await authorizedSession(req);
    const session = await saveVideo({
      sessionId: req.params.id,
      recordingId: req.header('X-Recording-Id'),
      durationMs: Number(req.header('X-Video-Duration-Ms')),
      mimeType: req.header('Content-Type')?.split(';')[0].toLowerCase(),
      input: req,
    });
    return sendSuccess(res, session.status === 'COMPLETED' ? 'Đã lưu video đóng hàng' : 'Video đang chờ đồng bộ', session,
      session.status === 'COMPLETED' ? 201 : 202);
  } catch (error) {
    if (error instanceof PackingError) return fail(res, error);
    next(error);
  }
};

export const syncPackingVideo = async (req, res, next) => {
  try {
    await authorizedSession(req);
    const result = await syncVideo({
      sessionId: req.params.id, recordingId: req.params.recordingId,
      durationMs: Number(req.body?.durationMs) || 1,
    });
    return sendSuccess(res, result.status === 'COMPLETED' ? 'Đã đồng bộ video' : 'Video đang chờ đồng bộ', result,
      result.status === 'COMPLETED' ? 200 : 202);
  } catch (error) {
    if (error instanceof PackingError) return fail(res, error);
    next(error);
  }
};

export const getPackingVideo = async (req, res, next) => {
  try {
    const packing = await authorizedSession(req);
    await streamPackingVideo(packing, req.header('Range'), res);
  } catch (error) {
    if (res.headersSent) return res.destroy(error);
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
      // Config model no longer exists in new structure, need to adjust
      mongoose.connection.db.collection('warehouse_locations').findOne({ _id: mongoose.Types.ObjectId(warehouseId) }),
    ]);
    if (!sku || !warehouse) return sendError(res, 'SKU hoặc kho không tồn tại', { code: 'INVALID_UNIT' }, 400);
    const unit = await ProductUnit.create({ barcode, barcodeFormat: 'CODE_128', skuId, warehouseId });
    return sendSuccess(res, 'Đã đăng ký tem sản phẩm vật lý', { id: unit.id, barcode: unit.barcode }, 201);
  } catch (error) {
    if (error.code === 11000) return sendError(res, 'Barcode đã tồn tại', { code: 'BARCODE_EXISTS' }, 409);
    next(error);
  }
};
