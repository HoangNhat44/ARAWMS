import { Transform, Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { v2 as cloudinary } from 'cloudinary';
import mongoose from 'mongoose';
import PackingSession from '../../../models/PackingSession.js';
import PackingVideo from '../../../models/PackingVideo.js';
import SalesOrder from '../../../models/SalesOrder.model.js';
import { ARASTORE_CLOUDINARY_FOLDERS } from '../../../config/cloudinaryFolders.js';
import { PackingError, toPackingSessionView } from './packingVerification.service.js';

export const MAX_VIDEO_BYTES = 512 * 1024 * 1024;
const videoTypes = new Set(['video/webm', 'video/mp4']);
let indexesReady;
const ensureVideoIndexes = () => {
  if (!indexesReady) indexesReady = PackingVideo.createIndexes().catch((error) => {
    indexesReady = null;
    throw error;
  });
  return indexesReady;
};

const configureCloudinary = () => {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    throw new PackingError('CLOUDINARY_NOT_CONFIGURED', 503);
  }
  cloudinary.config({ cloud_name: CLOUDINARY_CLOUD_NAME, api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET, secure: true });
};

const receiveVideo = async (input, publicId) => {
  let sizeBytes = 0;
  const limit = new Transform({
    transform(chunk, encoding, callback) {
      sizeBytes += chunk.length;
      callback(sizeBytes > MAX_VIDEO_BYTES ? new PackingError('VIDEO_TOO_LARGE', 413) : null, chunk);
    },
  });
  let settle;
  const resultPromise = new Promise((resolve, reject) => { settle = { resolve, reject }; });
  resultPromise.catch(() => {});
  const upload = cloudinary.uploader.upload_chunked_stream({
    resource_type: 'video', type: 'authenticated', public_id: publicId,
    asset_folder: ARASTORE_CLOUDINARY_FOLDERS.packingVideos,
    overwrite: false, unique_filename: false, chunk_size: 6 * 1024 * 1024,
  }, (error, result) => {
    if (error) settle.reject(error);
    else if (result?.done !== false) settle.resolve(result);
  });
  let result;
  try {
    await pipeline(input, limit, upload);
    if (!sizeBytes) throw new PackingError('EMPTY_VIDEO', 400);
    result = await resultPromise;
  } catch (error) {
    const detail = error?.message || error?.error?.message || '';
    if (/invalid signature|api_secret mismatch|unknown api key/i.test(detail)) {
      throw new PackingError('CLOUDINARY_AUTH_FAILED', 503);
    }
    throw error;
  }
  if (!result?.public_id || !result?.secure_url || !result?.asset_id) {
    throw new Error('Cloudinary did not return complete video metadata');
  }
  return { result, sizeBytes };
};

const validateRecording = (sessionId, recordingId) => {
  if (!mongoose.isValidObjectId(sessionId)) throw new PackingError('INVALID_SESSION', 400);
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(recordingId || '')) throw new PackingError('INVALID_RECORDING_ID', 400);
};

const publicIdFor = (sessionId, recordingId) => `${ARASTORE_CLOUDINARY_FOLDERS.packingVideos}/${sessionId}/${recordingId}`;
const legacyPublicIdFor = (sessionId, recordingId) => `packing/${sessionId}/${recordingId}`;

const stageVideo = async (packing, recordingId, resource, durationMs) => {
  await ensureVideoIndexes();
  const previous = await PackingVideo.findOne({ recordingId });
  if (previous && String(previous.sessionId) !== String(packing._id)) throw new PackingError('RECORDING_ID_CONFLICT');
  const publicId = resource.public_id;
  if (![publicIdFor(packing._id, recordingId), legacyPublicIdFor(packing._id, recordingId)].includes(publicId) ||
      !resource.asset_id || !resource.secure_url) {
    throw new PackingError('VIDEO_RESOURCE_MISMATCH', 502);
  }
  const staged = await PackingVideo.findOneAndUpdate(
    { recordingId },
    { $setOnInsert: {
      recordingId, sessionId: packing._id, orderId: packing.orderKey,
      cloudinaryPublicId: publicId, cloudinaryAssetId: resource.asset_id,
      cloudinaryUrl: resource.secure_url, mimeType: `video/${resource.format}`,
      fileSize: resource.bytes, durationMs: Math.max(1, Math.round((resource.duration || 0) * 1000) || durationMs),
      status: 'SYNC_PENDING', uploadedAt: new Date(resource.created_at || Date.now()),
    } },
    { upsert: true, new: true }
  );
  if (String(staged.sessionId) !== String(packing._id)) throw new PackingError('RECORDING_ID_CONFLICT');
  return staged;
};

const linkExistingOrderVideo = async (packing, video, dbSession) => {
  if (packing.sourceType !== 'REAL') return;
  const linked = await SalesOrder.updateOne(
    { _id: packing.orderId, $or: [
      { 'warehouseFulfillment.packagingVideoUrl': { $exists: false } },
      { 'warehouseFulfillment.packagingVideoUrl': null },
      { 'warehouseFulfillment.packagingVideoUrl': video.cloudinaryUrl },
    ] },
    { $set: { 'warehouseFulfillment.packagingVideoUrl': video.cloudinaryUrl } },
    dbSession ? { session: dbSession } : undefined
  );
  if (!linked.matchedCount) throw new PackingError('ORDER_CHANGED');
  await SalesOrder.updateOne(
    { _id: packing.orderId, status: { $in: ['CONFIRMED', 'CONFIRMED_RESERVED', 'PICKING'] } },
    { $set: { status: 'PACKED', 'warehouseFulfillment.packedAt': new Date(),
      'warehouseFulfillment.packedByStaffId': packing.operatorId } },
    dbSession ? { session: dbSession } : undefined
  );
};

const completeVideo = async (packing, video) => {
  if (packing.video?.publicId) {
    if (packing.video.recordingId !== video.recordingId) throw new PackingError('VIDEO_ALREADY_SAVED');
    await linkExistingOrderVideo(packing, video);
    await PackingVideo.updateOne({ recordingId: video.recordingId }, { $set: { status: 'COMPLETED' } });
    return { status: 'COMPLETED', session: toPackingSessionView(packing) };
  }
  const dbSession = await mongoose.startSession();
  try {
    let saved;
    await dbSession.withTransaction(async () => {
      const current = await PackingSession.findById(packing._id).session(dbSession);
      if (!current) throw new PackingError('SESSION_NOT_FOUND', 404);
      if (current.video?.publicId) {
        if (current.video.recordingId !== video.recordingId) throw new PackingError('VIDEO_ALREADY_SAVED');
        await linkExistingOrderVideo(current, video, dbSession);
      } else {
        const updated = await PackingSession.findOneAndUpdate(
          { _id: packing._id, 'video.publicId': { $exists: false } },
          { $set: { video: {
            recordingId: video.recordingId, publicId: video.cloudinaryPublicId,
            assetId: video.cloudinaryAssetId, url: video.cloudinaryUrl,
            mimeType: video.mimeType, sizeBytes: video.fileSize,
            durationMs: video.durationMs, uploadedAt: video.uploadedAt,
          } }, $inc: { version: 1 } },
          { new: true, session: dbSession }
        );
        if (!updated) throw new PackingError('VIDEO_ALREADY_SAVED');
        if (updated.sourceType === 'REAL') {
          const order = await SalesOrder.findOneAndUpdate(
            { _id: updated.orderId, updatedAt: updated.orderVersion, status: { $in: ['CONFIRMED', 'CONFIRMED_RESERVED', 'PICKING'] } },
            { $set: {
              status: 'PACKED',
              'warehouseFulfillment.packagingVideoUrl': video.cloudinaryUrl,
              'warehouseFulfillment.packedAt': new Date(),
              'warehouseFulfillment.packedByStaffId': updated.operatorId,
            } },
            { new: true, session: dbSession }
          );
          if (!order) throw new PackingError('ORDER_CHANGED');
          updated.orderVersion = order.updatedAt;
          await updated.save({ session: dbSession });
        }
        current.video = updated.video;
      }
      await PackingVideo.updateOne(
        { recordingId: video.recordingId, sessionId: packing._id },
        { $set: { status: 'COMPLETED' } }, { session: dbSession }
      );
      saved = toPackingSessionView(current);
    });
    return { status: 'COMPLETED', session: saved };
  } finally {
    await dbSession.endSession();
  }
};

const cloudinaryResource = async (publicId) => {
  try {
    return await cloudinary.api.resource(publicId, { resource_type: 'video', type: 'authenticated' });
  } catch (error) {
    if (error?.http_code === 404 || error?.error?.http_code === 404) return null;
    throw error;
  }
};

export const syncPackingVideo = async ({ sessionId, recordingId, durationMs = 1 }) => {
  validateRecording(sessionId, recordingId);
  configureCloudinary();
  const packing = await PackingSession.findById(sessionId);
  if (!packing) throw new PackingError('SESSION_NOT_FOUND', 404);
  if (packing.video?.publicId && packing.video.recordingId !== recordingId) throw new PackingError('VIDEO_ALREADY_SAVED');
  let video = await PackingVideo.findOne({ recordingId });
  if (video && String(video.sessionId) !== sessionId) throw new PackingError('RECORDING_ID_CONFLICT');
  if (!video) {
    const resource = await cloudinaryResource(publicIdFor(sessionId, recordingId)) ||
      await cloudinaryResource(legacyPublicIdFor(sessionId, recordingId));
    if (!resource) throw new PackingError('VIDEO_NOT_UPLOADED', 404);
    video = await stageVideo(packing, recordingId, resource, durationMs);
  }
  try {
    return await completeVideo(packing, video);
  } catch (error) {
    if (error instanceof PackingError && ['VIDEO_ALREADY_SAVED', 'RECORDING_ID_CONFLICT'].includes(error.code)) throw error;
    return { status: 'SYNC_PENDING', publicId: video.cloudinaryPublicId, reason: error.code || 'DATABASE_SYNC_FAILED' };
  }
};

export const uploadPackingVideo = async ({ sessionId, recordingId, mimeType, durationMs, input }) => {
  validateRecording(sessionId, recordingId);
  if (!videoTypes.has(mimeType)) throw new PackingError('UNSUPPORTED_VIDEO_TYPE', 415);
  if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > 30 * 60_000) {
    throw new PackingError('INVALID_VIDEO_DURATION', 400);
  }
  configureCloudinary();
  const existing = await PackingSession.findById(sessionId);
  if (!existing) throw new PackingError('SESSION_NOT_FOUND', 404);
  if (existing.video?.publicId) {
    if (existing.video.recordingId !== recordingId) throw new PackingError('VIDEO_ALREADY_SAVED');
    input.resume();
    return syncPackingVideo({ sessionId, recordingId, durationMs });
  }
  if (!['SCANNING', 'READY_TO_RECORD'].includes(existing.state)) throw new PackingError('SESSION_NOT_PACKABLE');
  const known = await PackingVideo.findOne({ recordingId });
  if (known || await cloudinaryResource(publicIdFor(sessionId, recordingId)) ||
      await cloudinaryResource(legacyPublicIdFor(sessionId, recordingId))) {
    input.resume();
    return syncPackingVideo({ sessionId, recordingId, durationMs });
  }
  const { result } = await receiveVideo(input, publicIdFor(sessionId, recordingId));
  try {
    await stageVideo(existing, recordingId, result, durationMs);
    return syncPackingVideo({ sessionId, recordingId, durationMs });
  } catch (error) {
    // The deterministic public ID lets a later sync recover this asset if MongoDB failed.
    return { status: 'SYNC_PENDING', publicId: result.public_id, reason: error.code || 'DATABASE_SYNC_FAILED' };
  }
};

export const streamPackingVideo = async (packing, range, res) => {
  if (!packing.video?.publicId) throw new PackingError('VIDEO_NOT_FOUND', 404);
  configureCloudinary();
  const signedUrl = cloudinary.url(packing.video.publicId, {
    resource_type: 'video', type: 'authenticated', secure: true,
    sign_url: true, format: packing.video.url?.split('.').pop()?.split('?')[0],
  });
  const upstream = await fetch(signedUrl, { headers: range ? { Range: range } : {} });
  if (!upstream.ok && upstream.status !== 206) throw new PackingError('VIDEO_UNAVAILABLE', 502);
  res.status(upstream.status);
  for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
    const value = upstream.headers.get(name);
    if (value) res.set(name, value);
  }
  res.set('Cache-Control', 'private, no-store');
  await pipeline(Readable.fromWeb(upstream.body), res);
};
