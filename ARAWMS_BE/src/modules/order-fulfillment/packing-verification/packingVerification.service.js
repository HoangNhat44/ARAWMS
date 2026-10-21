import mongoose from 'mongoose';
import SalesOrder from '../../../models/SalesOrder.model.js';
import PackingSession from '../../../models/PackingSession.js';
import ProductUnitAllocation from '../../../models/ProductUnitAllocation.js';
import PackingScanEvent from '../../../models/PackingScanEvent.js';
import { findProductUnit } from '../../../common/services/productUnitService.js';
import { ensurePackingIndexes } from './packingIndexes.js';

const LEASE_MS = 120_000;
const packableStatuses = new Set(['CONFIRMED', 'PICKING']);

export class PackingError extends Error {
  constructor(code, status = 409) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

const snapshotItems = (order) => order.items.map((item, index) => ({
  lineKey: order.demoOnly ? item.id : `${index}`,
  ...(order.demoOnly ? { variantId: item.variantId } : {
    skuId: item.skuId, warehouseId: item.reservation?.warehouseId,
  }),
  skuCode: order.demoOnly ? item.sku : item.skuCode,
  name: order.demoOnly ? [item.productName, item.color, item.size].filter(Boolean).join(' · ') :
    [item.name || order.variantDetails?.[String(item.skuId)]?.productName,
      order.variantDetails?.[String(item.skuId)]?.color?.name,
      order.variantDetails?.[String(item.skuId)]?.size?.name].filter(Boolean).join(' · '),
  quantity: item.quantity,
}));

export const sessionView = (session) => ({
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
  video: session.video?.publicId ? {
    status: 'SAVED', durationMs: session.video.durationMs,
    uploadedAt: session.video.uploadedAt,
    playbackUrl: `/api/packing/sessions/${session._id}/video`,
  } : null,
});

export const decideScan = (packing, unit, barcode) => {
  if (!unit) return { reason: 'BARCODE_NOT_FOUND' };
  if (unit.barcodeFormat !== 'CODE_128' || unit.inventoryStatus !== 'AVAILABLE') {
    return { reason: 'UNIT_UNAVAILABLE' };
  }
  if (packing.scannedUnits.some((scan) => scan.barcode === barcode)) return { reason: 'BARCODE_ALREADY_SCANNED' };
  const matching = packing.items.filter((item) => packing.sourceType === 'DEMO'
    ? item.variantId === unit.variantId && item.skuCode === unit.sku
    : String(item.skuId) === String(unit.skuId) &&
      (!item.warehouseId || String(item.warehouseId) === String(unit.warehouseId)));
  if (!matching.length) return { reason: 'ITEM_NOT_IN_ORDER' };
  const line = matching.find((item) =>
    packing.scannedUnits.filter((scan) => scan.lineKey === item.lineKey).length < item.quantity
  );
  if (!line) return { reason: 'QTY_EXCEEDED' };
  return { lineKey: line.lineKey };
};

export const preparePacking = async (order, operatorId, stationId) => {
  await ensurePackingIndexes();
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(stationId || '')) throw new PackingError('INVALID_STATION', 400);
  if (!order.demoOnly && !packableStatuses.has(order.status)) throw new PackingError('ORDER_NOT_PACKABLE');
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
  return sessionView(packing);
};

export const heartbeatPacking = async (sessionId, stationId, leaseVersion) => {
  const packing = await PackingSession.findOneAndUpdate(
    { _id: sessionId, stationId, leaseVersion, leaseUntil: { $gt: new Date() } },
    { $set: { leaseUntil: new Date(Date.now() + LEASE_MS) } },
    { new: true }
  );
  if (!packing) throw new PackingError('LEASE_EXPIRED');
  return sessionView(packing);
};

export const releasePacking = async (sessionId, stationId, leaseVersion) => {
  const packing = await PackingSession.findOneAndUpdate(
    { _id: sessionId, stationId, leaseVersion, leaseUntil: { $gt: new Date() } },
    { $set: { leaseUntil: new Date(0) }, $inc: { leaseVersion: 1 } },
    { new: true }
  );
  if (!packing) throw new PackingError('LEASE_EXPIRED');
  return sessionView(packing);
};

export const scanProduct = async ({ sessionId, stationId, leaseVersion, clientEventId, barcode }) => {
  await ensurePackingIndexes();
  if (!mongoose.isValidObjectId(sessionId)) throw new PackingError('INVALID_SESSION', 400);
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(stationId || '')) throw new PackingError('INVALID_STATION', 400);
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(clientEventId || '')) throw new PackingError('INVALID_EVENT_ID', 400);
  if (typeof barcode !== 'string' || !/^[A-Za-z0-9_-]{3,128}$/.test(barcode)) throw new PackingError('INVALID_BARCODE', 400);
  const duplicate = await PackingScanEvent.findOne({ sessionId, clientEventId });
  if (duplicate) {
    const packing = await PackingSession.findById(sessionId);
    return { result: duplicate.result, reason: duplicate.reason, duplicate: true, session: sessionView(packing) };
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
      const unit = await findProductUnit(packing.sourceType, barcode, dbSession);
      const decision = decideScan(packing, unit, barcode);
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
        packing.scannedUnits.push({ barcode, lineKey: decision.lineKey, scannedAt: new Date() });
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
      response = { result: reason ? 'REJECTED' : 'ACCEPTED', reason, duplicate: false, session: sessionView(packing) };
    });
    return response;
  } catch (error) {
    if (error.code === 11000) {
      const duplicateEvent = await PackingScanEvent.findOne({ sessionId, clientEventId });
      if (duplicateEvent) {
        const packing = await PackingSession.findById(sessionId);
        return { result: duplicateEvent.result, reason: duplicateEvent.reason, duplicate: true, session: sessionView(packing) };
      }
      throw new PackingError('BARCODE_ASSIGNED_OTHER_ORDER');
    }
    throw error;
  } finally {
    await dbSession.endSession();
  }
};
