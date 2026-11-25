/*
 * File: packingStocktakeLock.js
 * Author: Duy Anh
 * Date: 2026-11-20
 * Description: Khóa đóng hàng trong khung giờ kiểm kê kho thành phẩm.
 *  - Trong khung giờ (phiên kiểm FINISHED_GOODS/ALL đang chờ hoặc đang đếm, scheduledAt <= now < dueAt):
 *    mọi thao tác đóng hàng bị từ chối (STOCKTAKE_LOCK). Lần đóng đang dở bị hủy kết quả quét.
 *  - Sau khung giờ: lần đóng bắt đầu TRƯỚC khi kiểm kê bắt đầu thì không được ghi nhận; hệ thống xóa
 *    kết quả quét để đóng lại từ đầu, giống như khi đang đóng bị mất mạng.
 */
import mongoose from 'mongoose';
import { v2 as cloudinary } from 'cloudinary';
import StocktakeSession from '../../../models/StocktakeSession.model.js';
import PackingSession from '../../../models/PackingSession.js';
import ProductUnit from '../../../models/ProductUnit.js';
import PackingScanEvent from '../../../models/PackingScanEvent.js';
import { PackingError } from './packingVerification.service.js';

const FINISHED_GOODS_COUNT = { warehouseType: { $in: ['FINISHED_GOODS', 'ALL'] }, isDeleted: { $ne: true } };

/** Phiên kiểm kê kho thành phẩm đang trong khung giờ, nếu có. */
export const activeStocktakeLock = (now = new Date()) => StocktakeSession.findOne({
  ...FINISHED_GOODS_COUNT, status: { $in: ['WAITING', 'FROZEN_COUNTING'] },
  scheduledAt: { $lte: now }, dueAt: { $gt: now },
}).sort({ dueAt: -1 }).select('sessionCode name scheduledAt dueAt').lean();

const hasAttempt = (packing) => !packing.video?.publicId && (packing.scannedUnits?.length > 0 || Boolean(packing.pendingVideo?.recordingId));
const attemptStart = (packing) => {
  const times = (packing.scannedUnits || []).map((unit) => new Date(unit.scannedAt).getTime()).filter(Number.isFinite);
  return times.length ? new Date(Math.min(...times)) : null;
};

/** Phiên kiểm kê bắt đầu sau khi lần đóng này đã bắt đầu (lần đóng bị gián đoạn). */
export const stocktakeInterrupting = async (packing, now = new Date()) => {
  if (!hasAttempt(packing)) return null;
  const start = attemptStart(packing) || packing.updatedAt;
  return StocktakeSession.findOne({ ...FINISHED_GOODS_COUNT, status: { $ne: 'CANCELLED' },
    scheduledAt: { $gt: start, $lte: now } }).select('sessionCode scheduledAt dueAt').lean();
};

/** Hủy kết quả của lần đóng dở: trả tem đã giữ, xóa lượt quét, bỏ video chưa ghi nhận. */
export const resetPackingAttempt = async (packingId) => {
  const dbSession = await mongoose.startSession();
  let droppedVideo = null;
  try {
    await dbSession.withTransaction(async () => {
      const packing = await PackingSession.findById(packingId).session(dbSession);
      if (!packing || !hasAttempt(packing)) return;
      droppedVideo = packing.pendingVideo?.cloudinaryPublicId || null;
      await ProductUnit.updateMany({ 'packingClaim.sessionId': packing._id }, { $unset: { packingClaim: '' } }, { session: dbSession });
      await PackingScanEvent.deleteMany({ sessionId: packing._id }, { session: dbSession });
      packing.scannedUnits = [];
      packing.state = 'SCANNING';
      packing.pendingVideo = undefined;
      packing.recordingId = undefined;
      packing.leaseUntil = new Date(0);
      packing.leaseVersion += 1;
      packing.version += 1;
      await packing.save({ session: dbSession });
    });
  } finally {
    await dbSession.endSession();
  }
  // Video đã tải lên của lần đóng bị hủy: xóa để lần đóng lại không dùng nhầm video cũ (cùng public id theo mã đơn).
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
  if (droppedVideo && CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET) {
    try {
      cloudinary.config({ cloud_name: CLOUDINARY_CLOUD_NAME, api_key: CLOUDINARY_API_KEY, api_secret: CLOUDINARY_API_SECRET, secure: true });
      await cloudinary.uploader.destroy(droppedVideo, { resource_type: 'video', type: 'authenticated', invalidate: true });
    }
    catch (error) { console.error('[packing] Không xóa được video của lần đóng bị hủy:', error.message); }
  }
};

const lockError = (lock) => Object.assign(new PackingError('STOCKTAKE_LOCK', 423),
  { details: { stocktakeCode: lock.sessionCode, from: lock.scheduledAt, to: lock.dueAt } });

/**
 * Chặn thao tác đóng hàng. packingId: phiên đóng đang thao tác (nếu có).
 * resumeSilently: mở lại phiên sau kiểm kê thì xóa lần đóng cũ và cho đóng lại, không báo lỗi.
 */
export const guardPacking = async ({ packingId = null, orderKey = null, resumeSilently = false } = {}) => {
  const now = new Date();
  const packing = packingId ? await PackingSession.findById(packingId)
    : orderKey ? await PackingSession.findOne({ orderKey }) : null;
  const lock = await activeStocktakeLock(now);
  if (lock) {
    if (packing && hasAttempt(packing)) await resetPackingAttempt(packing._id);
    throw lockError(lock);
  }
  if (packing && await stocktakeInterrupting(packing, now)) {
    await resetPackingAttempt(packing._id);
    if (!resumeSilently) throw new PackingError('PACKING_RESTARTED_AFTER_STOCKTAKE', 409);
    return { restarted: true };
  }
  return { restarted: false };
};
