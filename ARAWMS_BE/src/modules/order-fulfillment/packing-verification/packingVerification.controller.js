/*
 * File: packingVerification.controller.js
 * Author: Duy Anh
 * Date: 2026-10-21
 * Description: Handles packing session requests and API errors.
 */
import mongoose from 'mongoose';
import PackingSession from '../../../models/PackingSession.js';
import ProductUnit from '../../../models/ProductUnit.js';
import Sku from '../../../models/Sku.model.js';
import WarehouseLocation from '../../../models/WarehouseLocation.model.js';
import FinishedGoodsBatch from '../../../models/FinishedGoodsBatch.model.js';
import { sendError, sendSuccess } from '../../../common/utils/responseHandler.js';
import { findOrder, issueQr, publicOrderDetail, resolveQr } from '../order-qr-management/orderQrManagement.service.js';
import { canPackOrder, canViewOrder } from '../../../common/services/orderAccessService.js';
import { PackingError, discardPackingAttempt, openPackingSession, releasePackingSession, removeScannedBarcodeFromPacking, renewPackingSessionLease, scanProductBarcodeForPacking, toPackingSessionView } from './packingVerification.service.js';
import { ensurePackingIndexes } from './packingIndexes.js';
import { uploadPackingVideo as saveVideo, syncPackingVideo as syncVideo, streamPackingVideo } from './packingVideo.service.js';

const sendPackingErrorResponse = (res, error) => sendError(res, error.code, { code: error.code }, error.status);

/** Loads a packing session only when the operator may access its order. */
const loadAuthorizedPackingSession = async (req) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new PackingError('INVALID_SESSION', 400);
  const packing = await PackingSession.findById(req.params.id);
  if (!packing) throw new PackingError('SESSION_NOT_FOUND', 404);
  const order = await findOrder(packing.orderKey);
  if (!order || !canPackOrder(req.user, order)) throw new PackingError('FORBIDDEN', 403);
  return packing;
};

/** Opens or resumes a station session after resolving the order QR and checking access. */
export const openPackingSessionRequest = async (req, res, next) => {
  try {
    const resolved = await resolveQr(req.body.qrValue);
    if (resolved.error) return sendError(res, 'QR không hợp lệ', { code: resolved.error }, 404);
    const order = await findOrder(resolved.order.id);
    if (!order || !canViewOrder(req.user, order)) return sendError(res, 'Không có quyền đóng đơn này', { code: 'FORBIDDEN' }, 403);
    if (!canPackOrder(req.user, order)) return sendError(res, 'Đơn chưa được phân bổ đủ hàng theo lô', { code: 'ORDER_NOT_PACKABLE' }, 409);
    const session = await openPackingSession(order, req.user._id, req.body.stationId);
    return sendSuccess(res, 'Đã mở phiên soạn hàng', { order: publicOrderDetail(order), session });
  } catch (error) {
    if (error instanceof PackingError) return sendPackingErrorResponse(res, error);
    next(error);
  }
};

/** Returns scan progress and video status for an authorized session. */
export const getPackingSession = async (req, res, next) => {
  try {
    const packing = await loadAuthorizedPackingSession(req);
    return sendSuccess(res, 'Tiến độ soạn hàng', { session: toPackingSessionView(packing) });
  } catch (error) {
    if (error instanceof PackingError) return sendPackingErrorResponse(res, error);
    next(error);
  }
};

/** Renews the station lease to prevent another station from packing the same order. */
export const renewPackingSessionLeaseRequest = async (req, res, next) => {
  try {
    await loadAuthorizedPackingSession(req);
    const session = await renewPackingSessionLease(req.params.id, req.body.stationId, req.body.leaseVersion);
    return sendSuccess(res, 'Đã gia hạn phiên', { session });
  } catch (error) {
    if (error instanceof PackingError) return sendPackingErrorResponse(res, error);
    next(error);
  }
};

/** Releases the station lease while retaining the packing session. */
export const releasePackingSessionRequest = async (req, res, next) => {
  try {
    await loadAuthorizedPackingSession(req);
    const session = await releasePackingSession(req.params.id, req.body.stationId, req.body.leaseVersion);
    return sendSuccess(res, 'Đã tạm dừng phiên tại bàn này', { session });
  } catch (error) {
    if (error instanceof PackingError) return sendPackingErrorResponse(res, error);
    next(error);
  }
};

/** Discards an attempt without a saved video and releases its scanned units. */
export const discardPackingAttemptRequest = async (req, res, next) => {
  try {
    await loadAuthorizedPackingSession(req);
    const session = await discardPackingAttempt(req.params.id, req.body.stationId, req.body.leaseVersion);
    return sendSuccess(res, 'Đã kết thúc lần đóng hàng, đơn có thể đóng lại', { session });
  } catch (error) {
    if (error instanceof PackingError) return sendPackingErrorResponse(res, error);
    next(error);
  }
};

/** Scans one physical unit; rejects another SKU or an unreserved batch/location. */
export const scanPackingProductBarcodeRequest = async (req, res, next) => {
  try {
    await loadAuthorizedPackingSession(req);
    const result = await scanProductBarcodeForPacking({ sessionId: req.params.id, ...req.body });
    return sendSuccess(res, result.result === 'ACCEPTED' ? 'Đã nhận sản phẩm' : 'Barcode không được chấp nhận', result);
  } catch (error) {
    if (error instanceof PackingError) return sendPackingErrorResponse(res, error);
    next(error);
  }
};

/** Removes a previously scanned barcode from the session. */
export const removeScannedBarcodeRequest = async (req, res, next) => {
  try {
    await loadAuthorizedPackingSession(req);
    const session = await removeScannedBarcodeFromPacking({ sessionId: req.params.id, ...req.body });
    return sendSuccess(res, 'Đã gỡ barcode khỏi lần đóng hàng', { session });
  } catch (error) {
    if (error instanceof PackingError) return sendPackingErrorResponse(res, error);
    next(error);
  }
};

/** Streams a recording to storage and synchronizes its order metadata. */
export const uploadPackingVideo = async (req, res, next) => {
  try {
    await loadAuthorizedPackingSession(req);
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
    if (error instanceof PackingError) return sendPackingErrorResponse(res, error);
    next(error);
  }
};

/** Retries metadata synchronization when the recording exists in Cloudinary. */
export const syncPackingVideo = async (req, res, next) => {
  try {
    await loadAuthorizedPackingSession(req);
    const result = await syncVideo({
      sessionId: req.params.id, recordingId: req.params.recordingId,
      durationMs: Number(req.body?.durationMs) || 1,
    });
    return sendSuccess(res, result.status === 'COMPLETED' ? 'Đã đồng bộ video' : 'Video đang chờ đồng bộ', result,
      result.status === 'COMPLETED' ? 200 : 202);
  } catch (error) {
    if (error instanceof PackingError) return sendPackingErrorResponse(res, error);
    next(error);
  }
};

/** Streams a saved recording to an operator authorized for the order. */
export const getPackingVideo = async (req, res, next) => {
  try {
    const packing = await loadAuthorizedPackingSession(req);
    await streamPackingVideo(packing, req.header('Range'), res);
  } catch (error) {
    if (res.headersSent) return res.destroy(error);
    if (error instanceof PackingError) return sendPackingErrorResponse(res, error);
    next(error);
  }
};

/** Registers one physical unit barcode against an available finished goods batch. */
export const registerProductUnit = async (req, res, next) => {
  try {
    if (!req.user.roles?.includes('ADMIN')) return sendError(res, 'Không có quyền', { code: 'FORBIDDEN' }, 403);
    await ensurePackingIndexes();
    const { barcode, skuId, warehouseId, batchId } = req.body;
    if (typeof barcode !== 'string' || !/^[A-Za-z0-9_-]{3,128}$/.test(barcode) ||
        !mongoose.isValidObjectId(skuId) || !mongoose.isValidObjectId(warehouseId) ||
        !mongoose.isValidObjectId(batchId)) {
      return sendError(res, 'Dữ liệu tem không hợp lệ', { code: 'INVALID_UNIT' }, 400);
    }
    const [sku, warehouse, batch] = await Promise.all([
      Sku.findOne({ _id: skuId, isActive: true, isDeleted: { $ne: true } }).select('_id'),
      WarehouseLocation.findOne({ _id: warehouseId, warehouseType: 'FINISHED_GOODS', isDeleted: { $ne: true } }).select('_id'),
      FinishedGoodsBatch.findOne({ _id: batchId, skuId, locationId: warehouseId,
        isDefectQuarantine: false, isDeleted: { $ne: true } }).select('_id'),
    ]);
    if (!sku || !warehouse || !batch) return sendError(res, 'SKU, lô hoặc vị trí kho không hợp lệ', { code: 'INVALID_UNIT' }, 400);
    const dbSession = await mongoose.startSession();
    let unit;
    try {
      // Reserve one label slot and create the unit together to prevent duplicate inventory labels.
      await dbSession.withTransaction(async () => {
        const labeled = await FinishedGoodsBatch.findOneAndUpdate({
          _id: batchId,
          $expr: { $lt: [{ $ifNull: ['$labeledQty', 0] }, '$currentOnHandQty'] },
        }, { $inc: { labeledQty: 1 } }, { session: dbSession });
        if (!labeled) throw new PackingError('BATCH_LABEL_LIMIT');
        [unit] = await ProductUnit.create([{
          barcode, barcodeFormat: 'CODE_128', skuId, warehouseId, batchId,
        }], { session: dbSession });
      });
    } finally { await dbSession.endSession(); }
    return sendSuccess(res, 'Đã đăng ký tem sản phẩm vật lý', { id: unit.id, barcode: unit.barcode }, 201);
  } catch (error) {
    if (error.code === 11000) return sendError(res, 'Barcode đã tồn tại', { code: 'BARCODE_EXISTS' }, 409);
    if (error instanceof PackingError) return sendPackingErrorResponse(res, error);
    next(error);
  }
};
