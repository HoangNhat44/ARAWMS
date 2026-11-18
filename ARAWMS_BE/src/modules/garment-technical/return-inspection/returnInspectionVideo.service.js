/**
 * ============================================================================
 * @title        : Return Inspection Video Service
 * @author       : AraWMS Team
 * @createdDate  : 2026-11-18
 * @lastModified : 2026-11-18
 * @description  : Streams return-unboxing recordings to Cloudinary, synchronizes video metadata
 *                 to ReturnInspection / SalesOrder / ReturnRequest, and proxies authenticated playback.
 * @module       : Garment Technical / Return Inspection
 * @layer        : Service
 * ============================================================================
 */

import { Transform, Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { v2 as cloudinary } from 'cloudinary';
import mongoose from 'mongoose';
import ReturnInspection from '../../../models/ReturnInspection.model.js';
import SalesOrder from '../../../models/SalesOrder.model.js';
import ReturnRequest from '../../../models/ReturnRequest.model.js';
import { ARASTORE_CLOUDINARY_FOLDERS } from '../../../config/cloudinaryFolders.js';

export const MAX_RETURN_VIDEO_BYTES = 512 * 1024 * 1024;
const ALLOWED_VIDEO_TYPES = new Set(['video/webm', 'video/mp4']);

/** Domain error carrying HTTP status and machine-readable code for video endpoints. */
export class ReturnVideoError extends Error {
  constructor(code, status = 409, message = code) {
    super(message);
    this.name = 'ReturnVideoError';
    this.code = code;
    this.status = status;
  }
}

/** Configures Cloudinary from backend environment variables. */
const configureCloudinary = () => {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    throw new ReturnVideoError(
      'CLOUDINARY_NOT_CONFIGURED',
      503,
      'Chưa cấu hình Cloudinary trên backend. Video vẫn đang chờ tải lên trên thiết bị.'
    );
  }
  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
    secure: true,
  });
};

/** Validates session and recording identifiers before storage access. */
const validateRecordingIds = (sessionId, recordingId) => {
  if (!mongoose.isValidObjectId(sessionId)) {
    throw new ReturnVideoError('INVALID_SESSION', 400, 'Mã phiên kiểm hàng hoàn không hợp lệ');
  }
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(recordingId || '')) {
    throw new ReturnVideoError('INVALID_RECORDING_ID', 400, 'Mã định danh video (recordingId) không hợp lệ');
  }
};

const safeSegment = (value) => String(value || '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
const publicIdFor = (inspection) =>
  `${ARASTORE_CLOUDINARY_FOLDERS.returnInspectionVideos}/${safeSegment(inspection.orderCode)}_${safeSegment(inspection.inspectionCode)}`;

/** Looks up an existing Cloudinary video asset to recover interrupted uploads cleanly. */
const findCloudinaryResource = async (publicId) => {
  try {
    return await cloudinary.api.resource(publicId, { resource_type: 'video', type: 'authenticated' });
  } catch (error) {
    if (error?.http_code === 404 || error?.error?.http_code === 404) return null;
    throw error;
  }
};

/** Streams raw recording bytes to Cloudinary while enforcing the 512 MB cap. */
const streamToCloudinary = async (input, publicId) => {
  let sizeBytes = 0;
  const limit = new Transform({
    transform(chunk, encoding, callback) {
      sizeBytes += chunk.length;
      callback(
        sizeBytes > MAX_RETURN_VIDEO_BYTES
          ? new ReturnVideoError('VIDEO_TOO_LARGE', 413, 'Video vượt giới hạn 512 MB')
          : null,
        chunk
      );
    },
  });

  let settle;
  const resultPromise = new Promise((resolve, reject) => {
    settle = { resolve, reject };
  });
  resultPromise.catch(() => {});

  const upload = cloudinary.uploader.upload_chunked_stream(
    {
      resource_type: 'video',
      type: 'authenticated',
      public_id: publicId,
      asset_folder: ARASTORE_CLOUDINARY_FOLDERS.returnInspectionVideoAssetFolder,
      display_name: publicId.split('/').at(-1),
      overwrite: false,
      unique_filename: false,
      chunk_size: 6 * 1024 * 1024,
    },
    (error, result) => {
      if (error) settle.reject(error);
      else if (result?.done !== false) settle.resolve(result);
    }
  );

  let result;
  try {
    await pipeline(input, limit, upload);
    if (!sizeBytes) throw new ReturnVideoError('EMPTY_VIDEO', 400, 'Video vừa quay không có dữ liệu');
    result = await resultPromise;
  } catch (error) {
    const detail = error?.message || error?.error?.message || '';
    if (/invalid signature|api_secret mismatch|unknown api key/i.test(detail)) {
      throw new ReturnVideoError(
        'CLOUDINARY_AUTH_FAILED',
        503,
        'Cloudinary từ chối API Key hoặc API Secret. Hãy kiểm tra lại cấu hình backend.'
      );
    }
    throw error;
  }

  if (!result?.public_id || !result?.secure_url || !result?.asset_id) {
    throw new Error('Cloudinary không trả về đủ metadata video');
  }
  return { result, sizeBytes };
};

/** Persists uploaded Cloudinary video metadata across ReturnInspection, SalesOrder, and ReturnRequest. */
const linkReturnVideoMetadata = async (inspection, recordingId, resource, durationMs) => {
  const videoMeta = {
    recordingId,
    publicId: resource.public_id,
    assetId: resource.asset_id,
    url: resource.secure_url,
    mimeType: `video/${resource.format || 'webm'}`,
    sizeBytes: Number(resource.bytes) || 0,
    durationMs: Math.max(1, Math.round((resource.duration || 0) * 1000) || Number(durationMs) || 1),
    uploadedAt: new Date(resource.created_at || Date.now()),
    status: 'COMPLETED',
  };

  const updated = await ReturnInspection.findOneAndUpdate(
    { _id: inspection._id },
    {
      $set: {
        recordingId,
        video: videoMeta,
        videoUrl: videoMeta.url,
        videoPublicId: videoMeta.publicId,
      },
    },
    { new: true }
  ).lean();

  // Keep packagingVideoUrl untouched; store return unboxing video separately.
  await SalesOrder.updateOne(
    { _id: inspection.orderId },
    {
      $set: {
        'warehouseFulfillment.returnUnboxingVideoUrl': videoMeta.url,
        'warehouseFulfillment.returnInspectionId': inspection._id,
      },
    }
  );

  if (inspection.rmaId) {
    await ReturnRequest.updateOne(
      { _id: inspection.rmaId },
      { $set: { 'warehouseInspection.unboxingVideoUrl': videoMeta.url } }
    );
  }

  return { status: 'COMPLETED', inspection: updated, video: videoMeta };
};

/**
 * Reconciles an already-uploaded Cloudinary video asset with its ReturnInspection record.
 */
export const syncReturnInspectionVideo = async ({ sessionId, recordingId, durationMs = 1 }) => {
  validateRecordingIds(sessionId, recordingId);
  configureCloudinary();

  const inspection = await ReturnInspection.findById(sessionId);
  if (!inspection) throw new ReturnVideoError('SESSION_NOT_FOUND', 404, 'Không tìm thấy phiên kiểm hàng hoàn');

  if (inspection.video?.publicId) {
    if (inspection.video.recordingId && inspection.video.recordingId !== recordingId) {
      throw new ReturnVideoError('VIDEO_ALREADY_SAVED', 409, 'Phiên này đã gắn một video khác');
    }
    return { status: 'COMPLETED', inspection: inspection.toObject(), video: inspection.video };
  }

  const resource = await findCloudinaryResource(publicIdFor(inspection));
  if (!resource) {
    throw new ReturnVideoError('VIDEO_NOT_UPLOADED', 404, 'Video chưa tồn tại trên Cloudinary');
  }

  return linkReturnVideoMetadata(inspection, recordingId, resource, durationMs);
};

/**
 * Streams a recorded return-unboxing video to Cloudinary and links it to the inspection session.
 */
export const uploadReturnInspectionVideo = async ({ sessionId, recordingId, mimeType, durationMs, input }) => {
  validateRecordingIds(sessionId, recordingId);
  if (!ALLOWED_VIDEO_TYPES.has(mimeType)) {
    throw new ReturnVideoError('UNSUPPORTED_VIDEO_TYPE', 415, 'Định dạng video không được hỗ trợ');
  }
  if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > 30 * 60_000) {
    throw new ReturnVideoError('INVALID_VIDEO_DURATION', 400, 'Thời lượng video không hợp lệ');
  }

  configureCloudinary();

  const inspection = await ReturnInspection.findById(sessionId);
  if (!inspection) throw new ReturnVideoError('SESSION_NOT_FOUND', 404, 'Không tìm thấy phiên kiểm hàng hoàn');
  if (inspection.sessionStatus === 'CANCELLED') {
    throw new ReturnVideoError('SESSION_CANCELLED', 409, 'Phiên kiểm hàng hoàn đã bị hủy');
  }

  if (inspection.video?.publicId) {
    if (inspection.video.recordingId && inspection.video.recordingId !== recordingId) {
      throw new ReturnVideoError('VIDEO_ALREADY_SAVED', 409, 'Đơn hoàn này đã có video đã lưu');
    }
    input.resume();
    return { status: 'COMPLETED', inspection: inspection.toObject(), video: inspection.video };
  }

  const targetPublicId = publicIdFor(inspection);
  const existingAsset = await findCloudinaryResource(targetPublicId);
  if (existingAsset) {
    input.resume();
    return linkReturnVideoMetadata(inspection, recordingId, existingAsset, durationMs);
  }

  const { result } = await streamToCloudinary(input, targetPublicId);
  try {
    return await linkReturnVideoMetadata(inspection, recordingId, result, durationMs);
  } catch (error) {
    return { status: 'SYNC_PENDING', publicId: result.public_id, reason: error.code || 'DATABASE_SYNC_FAILED' };
  }
};

/**
 * Proxies an authenticated Cloudinary return-unboxing video with HTTP Range support for seeking.
 */
export const streamReturnInspectionVideo = async (sessionId, range, res) => {
  if (!mongoose.isValidObjectId(sessionId)) {
    throw new ReturnVideoError('INVALID_SESSION', 400, 'Mã phiên kiểm hàng hoàn không hợp lệ');
  }
  const inspection = await ReturnInspection.findById(sessionId).select('video videoPublicId videoUrl').lean();
  if (!inspection) throw new ReturnVideoError('SESSION_NOT_FOUND', 404, 'Không tìm thấy biên bản kiểm tra');

  const publicId = inspection.video?.publicId || inspection.videoPublicId;
  if (!publicId) throw new ReturnVideoError('VIDEO_NOT_FOUND', 404, 'Biên bản chưa có video lưu trên Cloudinary');

  configureCloudinary();
  const format = (inspection.video?.url || inspection.videoUrl || '').split('.').pop()?.split('?')[0];
  const signedUrl = cloudinary.url(publicId, {
    resource_type: 'video',
    type: 'authenticated',
    secure: true,
    sign_url: true,
    format: format && format.length <= 5 ? format : undefined,
  });

  const upstream = await fetch(signedUrl, { headers: range ? { Range: range } : {} });
  if (!upstream.ok && upstream.status !== 206) {
    throw new ReturnVideoError('VIDEO_UNAVAILABLE', 502, 'Không thể tải video từ Cloudinary');
  }
  res.status(upstream.status);
  for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
    const value = upstream.headers.get(name);
    if (value) res.set(name, value);
  }
  res.set('Cache-Control', 'private, no-store');
  await pipeline(Readable.fromWeb(upstream.body), res);
};
