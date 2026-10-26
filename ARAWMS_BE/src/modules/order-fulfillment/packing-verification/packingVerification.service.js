/*
 * File: packingVerification.service.js
 * Author: Duy Anh
 * Date: 2026-10-21
 * Description: Manages station leases and packing scan rules.
 */
import mongoose from 'mongoose';
import SalesOrder from '../../../models/SalesOrder.model.js';
import FinishedGoodsBatch from '../../../models/FinishedGoodsBatch.model.js';
import WarehouseLocation from '../../../models/WarehouseLocation.model.js';
import PackingSession from '../../../models/PackingSession.js';
import ProductUnitAllocation from '../../../models/ProductUnitAllocation.js';
import PackingScanEvent from '../../../models/PackingScanEvent.js';
import { findProductUnit } from '../../../common/services/productUnitService.js';
import { ensurePackingIndexes } from './packingIndexes.js';

const LEASE_MS = 120_000;
const packableStatuses = new Set(['CONFIRMED_RESERVED', 'PICKING']);

export class PackingError extends Error {
  constructor(code, status = 409) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

/** Snapshots order lines so scan validation stays stable throughout a session. */
const snapshotItems = (order) => order.items.map((item, index) => ({
  lineKey: order.demoOnly ? item.id : `${index}`,
  ...(order.demoOnly ? { variantId: item.variantId } : {
    skuId: item.skuId,
    pickAllocations: item.fifoPickList.map((pick) => ({
      batchId: pick.batchId, locationId: pick.locationId, allocatedQty: pick.allocatedQty,
    })),
  }),
  skuCode: order.demoOnly ? item.sku : item.skuCode,
  name: order.demoOnly ? [item.productName, item.color, item.size].filter(Boolean).join(' · ') :
    [item.name || order.variantDetails?.[String(item.skuId)]?.productName,
      order.variantDetails?.[String(item.skuId)]?.color,
      order.variantDetails?.[String(item.skuId)]?.size].filter(Boolean).join(' · '),
  quantity: item.quantity ?? item.orderedQty,
}));

/** Returns the session progress and video state exposed to the client. */
export const toPackingSessionView = (session) => ({
  id: String(session._id),
  orderId: session.orderKey,
  state: session.state,
  leaseVersion: session.leaseVersion,
  leaseUntil: session.leaseUntil,
  items: session.items.map((item) => ({
    lineKey: item.lineKey, skuCode: item.skuCode, name: item.name, quantity: item.quantity,
    scanned: session.scannedUnits.filter((scan) => scan.lineKey === item.lineKey).length,
  })),
  scannedBarcodes: session.scannedUnits.map((scan) => scan.barcode),
  scannedUnits: session.scannedUnits.map((scan) => ({
    barcode: scan.barcode, lineKey: scan.lineKey, scannedAt: scan.scannedAt,
  })),
  video: session.video?.publicId ? {
    status: 'SAVED', durationMs: session.video.durationMs,
    uploadedAt: session.video.uploadedAt,
    url: session.video.url,
    playbackUrl: `/api/packing/sessions/${session._id}/video`,
  } : null,
});

/** Checks barcode availability, warehouse, SKU, and remaining order quantity. */
export const evaluatePackingBarcodeScan = (packing, unit, barcode) => {
  if (!unit) return { reason: 'BARCODE_NOT_FOUND' };
  if (unit.barcodeFormat !== 'CODE_128' || unit.inventoryStatus !== 'AVAILABLE') {
    return { reason: 'UNIT_UNAVAILABLE' };
  }
  if (packing.scannedUnits.some((scan) => scan.barcode === barcode)) return { reason: 'BARCODE_ALREADY_SCANNED' };
  const matching = packing.items.filter((item) => packing.sourceType === 'DEMO'
    ? item.variantId === unit.variantId && item.skuCode === unit.sku
    : String(item.skuId) === String(unit.skuId) &&
      item.pickAllocations?.some((pick) => String(pick.batchId) === String(unit.batchId) &&
        String(pick.locationId) === String(unit.warehouseId)));
  if (!matching.length) return { reason: 'ITEM_NOT_IN_ORDER' };
  const line = matching.find((item) => {
    if (packing.scannedUnits.filter((scan) => scan.lineKey === item.lineKey).length >= item.quantity) return false;
    if (packing.sourceType === 'DEMO') return true;
    const pick = item.pickAllocations.find((entry) => String(entry.batchId) === String(unit.batchId));
    const batchScans = packing.scannedUnits.filter((scan) =>
      scan.lineKey === item.lineKey && String(scan.batchId) === String(unit.batchId)).length;
    return pick && batchScans < pick.allocatedQty;
  });
  if (!line) return { reason: 'QTY_EXCEEDED' };
  return { lineKey: line.lineKey, ...(unit.batchId ? { batchId: unit.batchId } : {}) };
};

/** Opens a station session unless the order or station has an active conflicting lease. */
export const openPackingSession = async (order, operatorId, stationId) => {
  await ensurePackingIndexes();
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(stationId || '')) throw new PackingError('INVALID_STATION', 400);
  if (order.demoOnly) throw new PackingError('ORDER_NOT_PACKABLE');
  if (!order.demoOnly && !packableStatuses.has(order.status)) throw new PackingError('ORDER_NOT_PACKABLE');
  if (!order.demoOnly && !order.items?.length) throw new PackingError('ORDER_NOT_PACKABLE');
  if (!order.items.every((item) => item.fifoPickList?.length > 0 &&
      item.fifoPickList.every((pick) => pick.batchId && pick.locationId && pick.allocatedQty > 0) &&
      item.fifoPickList.reduce((sum, pick) => sum + pick.allocatedQty, 0) === (item.orderedQty ?? item.quantity))) {
    throw new PackingError('ORDER_NOT_PACKABLE');
  }
  const picks = order.items.flatMap((item) => item.fifoPickList.map((pick) => ({
    ...pick, skuId: item.skuId,
  })));
  const [batches, locations] = await Promise.all([
    FinishedGoodsBatch.find({ _id: { $in: picks.map((pick) => pick.batchId) },
      isDefectQuarantine: false, isDeleted: { $ne: true } })
      .select('_id skuId locationId currentOnHandQty reservedPickQty').lean(),
    WarehouseLocation.find({ _id: { $in: picks.map((pick) => pick.locationId) },
      warehouseType: 'FINISHED_GOODS', status: { $in: ['ACTIVE', 'FULL'] },
      isFrozenForStocktake: false, isDeleted: { $ne: true } }).select('_id').lean(),
  ]);
  const byBatch = new Map(batches.map((batch) => [String(batch._id), batch]));
  const validLocations = new Set(locations.map((location) => String(location._id)));
  const requiredByBatch = new Map();
  for (const pick of picks) {
    const batch = byBatch.get(String(pick.batchId));
    if (!batch || String(batch.skuId) !== String(pick.skuId) ||
        String(batch.locationId) !== String(pick.locationId) || !validLocations.has(String(pick.locationId))) {
      throw new PackingError('ORDER_NOT_PACKABLE');
    }
    requiredByBatch.set(String(pick.batchId), (requiredByBatch.get(String(pick.batchId)) || 0) + pick.allocatedQty);
  }
  if ([...requiredByBatch].some(([id, required]) => {
    const batch = byBatch.get(id);
    return batch.currentOnHandQty < required || batch.reservedPickQty < required;
  })) throw new PackingError('ORDER_NOT_PACKABLE');
  const sourceType = order.demoOnly ? 'DEMO' : 'REAL';
  const orderKey = String(order._id);
  const now = new Date();
  const leaseUntil = new Date(now.getTime() + LEASE_MS);
  const key = { sourceType, orderKey };
  const otherActive = await PackingSession.findOne({
    stationId, leaseUntil: { $gt: now },
    $or: [{ sourceType: { $ne: sourceType } }, { orderKey: { $ne: orderKey } }],
  }).select('_id');
  if (otherActive) throw new PackingError('STATION_BUSY');
  let packing = await PackingSession.findOne(key);
  if (!packing) {
    try {
      packing = await PackingSession.create({
        ...key, ...(order.demoOnly ? {} : { orderId: order._id, orderVersion: order.updatedAt }),
        operatorId, stationId, leaseUntil, leaseVersion: 1, items: snapshotItems(order),
      });
    } catch (error) {
      if (error.code !== 11000) throw error;
      packing = await PackingSession.findOne(key);
    }
  }
  if (!order.demoOnly && !packing.video?.publicId && (!packing.orderVersion || !order.updatedAt ||
      packing.orderVersion.getTime() !== order.updatedAt.getTime())) {
    throw new PackingError('ORDER_CHANGED');
  }
  if (packing.stationId !== stationId) {
    if (packing.leaseUntil > now) throw new PackingError('ORDER_LOCKED');
    packing = await PackingSession.findOneAndUpdate(
      { ...key, leaseVersion: packing.leaseVersion, leaseUntil: { $lte: now } },
      { $set: { stationId, operatorId, leaseUntil }, $inc: { leaseVersion: 1 } },
      { new: true }
    );
    if (!packing) throw new PackingError('ORDER_LOCKED');
  } else {
    packing = await PackingSession.findOneAndUpdate(
      { ...key, stationId, leaseVersion: packing.leaseVersion },
      { $set: { leaseUntil }, ...(packing.leaseUntil <= now ? { $inc: { leaseVersion: 1 } } : {}) },
      { new: true }
    );
    if (!packing) throw new PackingError('ORDER_LOCKED');
  }
  return toPackingSessionView(packing);
};

/** Extends an active station lease when its version still matches. */
export const renewPackingSessionLease = async (sessionId, stationId, leaseVersion) => {
  const packing = await PackingSession.findOneAndUpdate(
    { _id: sessionId, stationId, leaseVersion, leaseUntil: { $gt: new Date() } },
    { $set: { leaseUntil: new Date(Date.now() + LEASE_MS) } },
    { new: true }
  );
  if (!packing) throw new PackingError('LEASE_EXPIRED');
  return toPackingSessionView(packing);
};

/** Releases a station lease while preserving the session for later resumption. */
export const releasePackingSession = async (sessionId, stationId, leaseVersion) => {
  const packing = await PackingSession.findOneAndUpdate(
    { _id: sessionId, stationId, leaseVersion, leaseUntil: { $gt: new Date() } },
    { $set: { leaseUntil: new Date(0) }, $inc: { leaseVersion: 1 } },
    { new: true }
  );
  if (!packing) throw new PackingError('LEASE_EXPIRED');
  return toPackingSessionView(packing);
};

/** Discards an attempt without video and clears barcode assignments atomically. */
export const discardPackingAttempt = async (sessionId, stationId, leaseVersion) => {
  if (!mongoose.isValidObjectId(sessionId)) throw new PackingError('INVALID_SESSION', 400);
  const dbSession = await mongoose.startSession();
  try {
    let result;
    await dbSession.withTransaction(async () => {
      const packing = await PackingSession.findById(sessionId).session(dbSession);
      if (!packing) throw new PackingError('SESSION_NOT_FOUND', 404);
      if (packing.stationId !== stationId || packing.leaseVersion !== leaseVersion || packing.leaseUntil <= new Date()) {
        throw new PackingError('LEASE_EXPIRED');
      }
      if (packing.video?.publicId) throw new PackingError('VIDEO_ALREADY_SAVED');
      await ProductUnitAllocation.deleteMany({ sessionId: packing._id }, { session: dbSession });
      await PackingScanEvent.deleteMany({ sessionId: packing._id }, { session: dbSession });
      packing.scannedUnits = [];
      packing.state = 'SCANNING';
      packing.leaseUntil = new Date(0);
      packing.leaseVersion += 1;
      packing.version += 1;
      await packing.save({ session: dbSession });
      result = toPackingSessionView(packing);
    });
    return result;
  } finally {
    await dbSession.endSession();
  }
};

/** Removes a scan and releases the unit allocation for that order. */
export const removeScannedBarcodeFromPacking = async ({ sessionId, stationId, leaseVersion, barcode }) => {
  if (!mongoose.isValidObjectId(sessionId)) throw new PackingError('INVALID_SESSION', 400);
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(stationId || '')) throw new PackingError('INVALID_STATION', 400);
  if (typeof barcode !== 'string' || !/^[A-Za-z0-9_-]{3,128}$/.test(barcode)) {
    throw new PackingError('INVALID_BARCODE', 400);
  }
  const dbSession = await mongoose.startSession();
  try {
    let result;
    await dbSession.withTransaction(async () => {
      const packing = await PackingSession.findById(sessionId).session(dbSession);
      if (!packing) throw new PackingError('SESSION_NOT_FOUND', 404);
      if (packing.stationId !== stationId || packing.leaseVersion !== leaseVersion || packing.leaseUntil <= new Date()) {
        throw new PackingError('LEASE_EXPIRED');
      }
      if (packing.video?.publicId) throw new PackingError('VIDEO_ALREADY_SAVED');
      if (packing.sourceType === 'REAL') {
        const order = await SalesOrder.findById(packing.orderId).select('updatedAt status').session(dbSession).lean();
        if (!order || !packableStatuses.has(order.status) || !order.updatedAt || !packing.orderVersion ||
            order.updatedAt.getTime() !== packing.orderVersion.getTime()) {
          throw new PackingError('ORDER_CHANGED');
        }
      }
      const scan = packing.scannedUnits.find((item) => item.barcode === barcode);
      if (!scan) throw new PackingError('BARCODE_NOT_SCANNED');
      const allocation = await ProductUnitAllocation.deleteOne({
        sessionId: packing._id, sourceType: packing.sourceType, barcode,
      }, { session: dbSession });
      if (allocation.deletedCount !== 1) throw new PackingError('BARCODE_ALLOCATION_MISSING');
      await PackingScanEvent.updateMany(
        { sessionId: packing._id, barcode, result: 'ACCEPTED', reversedAt: null },
        { $set: { reversedAt: new Date() } }, { session: dbSession }
      );
      packing.scannedUnits = packing.scannedUnits.filter((item) => item.barcode !== barcode);
      packing.state = 'SCANNING';
      packing.version += 1;
      await packing.save({ session: dbSession });
      result = toPackingSessionView(packing);
    });
    return result;
  } finally {
    await dbSession.endSession();
  }
};

/** Records a valid scan once per client event ID to make retries safe. */
export const scanProductBarcodeForPacking = async ({ sessionId, stationId, leaseVersion, clientEventId, barcode }) => {
  await ensurePackingIndexes();
  if (!mongoose.isValidObjectId(sessionId)) throw new PackingError('INVALID_SESSION', 400);
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(stationId || '')) throw new PackingError('INVALID_STATION', 400);
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(clientEventId || '')) throw new PackingError('INVALID_EVENT_ID', 400);
  if (typeof barcode !== 'string' || !/^[A-Za-z0-9_-]{3,128}$/.test(barcode)) throw new PackingError('INVALID_BARCODE', 400);
  const duplicate = await PackingScanEvent.findOne({ sessionId, clientEventId });
  if (duplicate) {
    const packing = await PackingSession.findById(sessionId);
    return { result: duplicate.reversedAt ? 'REJECTED' : duplicate.result,
      reason: duplicate.reversedAt ? 'BARCODE_REMOVED' : duplicate.reason,
      duplicate: true, session: toPackingSessionView(packing) };
  }
  const dbSession = await mongoose.startSession();
  try {
    let response;
    await dbSession.withTransaction(async () => {
      const packing = await PackingSession.findById(sessionId).session(dbSession);
      if (!packing) throw new PackingError('SESSION_NOT_FOUND', 404);
      if (packing.stationId !== stationId || packing.leaseVersion !== leaseVersion || packing.leaseUntil <= new Date()) {
        throw new PackingError('LEASE_EXPIRED');
      }
      if (packing.state !== 'SCANNING') throw new PackingError('SCAN_CLOSED');
      if (packing.sourceType === 'REAL') {
        const order = await SalesOrder.findById(packing.orderId).select('updatedAt status').session(dbSession).lean();
        if (!order || !packableStatuses.has(order.status) || !order.updatedAt || !packing.orderVersion ||
            order.updatedAt.getTime() !== packing.orderVersion.getTime()) {
          throw new PackingError('ORDER_CHANGED');
        }
      }
      if (packing.sourceType !== 'REAL') throw new PackingError('ORDER_NOT_PACKABLE');
      const unit = await findProductUnit(barcode, dbSession);
      const decision = evaluatePackingBarcodeScan(packing, unit, barcode);
      let reason = decision.reason;
      if (!reason) {
        const allocation = await ProductUnitAllocation.findOne({ sourceType: packing.sourceType, barcode }).session(dbSession);
        if (allocation) reason = allocation.orderKey === packing.orderKey ? 'BARCODE_ALREADY_ASSIGNED' : 'BARCODE_ASSIGNED_OTHER_ORDER';
      }
      if (!reason) {
        await ProductUnitAllocation.create([{
          sourceType: packing.sourceType, barcode, orderKey: packing.orderKey,
          sessionId: packing._id, lineKey: decision.lineKey,
        }], { session: dbSession });
        packing.scannedUnits.push({ barcode, lineKey: decision.lineKey,
          batchId: decision.batchId, scannedAt: new Date() });
        const complete = packing.items.every((item) =>
          packing.scannedUnits.filter((scan) => scan.lineKey === item.lineKey).length === item.quantity
        );
        if (complete) packing.state = 'READY_TO_RECORD';
        packing.version += 1;
        await packing.save({ session: dbSession });
      }
      await PackingScanEvent.create([{
        sessionId: packing._id, clientEventId, barcode, result: reason ? 'REJECTED' : 'ACCEPTED',
        reason, lineKey: decision.lineKey, phase: 'PRE_RECORD', videoOffsetMs: null,
      }], { session: dbSession });
      response = { result: reason ? 'REJECTED' : 'ACCEPTED', reason, duplicate: false, session: toPackingSessionView(packing) };
    });
    return response;
  } catch (error) {
    if (error.code === 11000) {
      const duplicateEvent = await PackingScanEvent.findOne({ sessionId, clientEventId });
      if (duplicateEvent) {
        const packing = await PackingSession.findById(sessionId);
        return { result: duplicateEvent.reversedAt ? 'REJECTED' : duplicateEvent.result,
          reason: duplicateEvent.reversedAt ? 'BARCODE_REMOVED' : duplicateEvent.reason,
          duplicate: true, session: toPackingSessionView(packing) };
      }
      throw new PackingError('BARCODE_ASSIGNED_OTHER_ORDER');
    }
    throw error;
  } finally {
    await dbSession.endSession();
  }
};
