/*
 * File: allocation.service.js
 * Author: Duy Anh
 * Date: 2026-10-27
 * Description: Reserves receipt quantities and storage capacity for planned putaway.
 */
import { createHash, randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import PutawayAllocation from '../../../models/PutawayAllocation.model.js';
import WarehouseLocation from '../../../models/WarehouseLocation.model.js';
import FinishedGoodsBulkDocument from '../../../models/FinishedGoodsBulkDocument.model.js';
import ProductUnit from '../../../models/ProductUnit.js';
import Sku from '../../../models/Sku.model.js';
import SystemLog from '../../../models/SystemLog.model.js';

const id = (value) => String(value || '');
const fail = (code, message, status = 409) => { throw Object.assign(new Error(message), { code, status }); };
export const fingerprint = (lines) => createHash('sha256').update(JSON.stringify(lines.map((line) =>
  [id(line.skuId), id(line.targetLocationId), Number(line.allocatedQuantity)]).sort())).digest('hex');
/** Only unplaced and unwaived units consume a destination bin's reservation. */
export const remainingQuantity = (line) => Math.max(0, Number(line.allocatedQuantity || 0) -
  Number(line.placedQuantity || 0) - Number(line.shortageQuantity || 0));

export function parseLines(input) {
  if (!Array.isArray(input) || !input.length || input.length > 100) fail('INVALID_LINES', 'Cần từ 1 đến 100 dòng phân bổ', 400);
  const lines = input.map((line) => ({ lineId: line.lineId || new mongoose.Types.ObjectId(),
    skuId: line.skuId, targetLocationId: line.targetLocationId,
    allocatedQuantity: Number(line.allocatedQuantity) }));
  if (lines.some((line) => !mongoose.isValidObjectId(line.skuId) || !mongoose.isValidObjectId(line.targetLocationId) ||
    !Number.isSafeInteger(line.allocatedQuantity) || line.allocatedQuantity < 1)) fail('INVALID_LINES', 'Dòng phân bổ không hợp lệ', 400);
  const pairs = lines.map((line) => `${id(line.skuId)}:${id(line.targetLocationId)}`);
  if (new Set(pairs).size !== pairs.length) fail('DUPLICATE_BIN', 'Mỗi SKU chỉ được chọn một lần cho mỗi ô', 400);
  return lines;
}

/** Reserves inbound destinations inside the receipt transaction using the existing plan rules. */
export async function confirmReceiptAllocation(user, receiptId, input, session, idempotencyKey = '') {
  if (!input?.length) return null;
  const lines = parseLines(input);
  const { receipt, oldByBin, newByBin } = await checkReservation(receiptId, lines, null, session);
  await moveCounters(receipt, oldByBin, newByBin, session);
  const [allocation] = await PutawayAllocation.create([{
    allocationCode: `PB-${randomUUID().slice(0, 12).toUpperCase()}`,
    sourceReceiptId: receipt._id, status: 'CONFIRMED', lines,
    ...(idempotencyKey ? { idempotencyKey, confirmationHash: fingerprint(lines) } : {}),
    createdByUserId: user._id, confirmedByUserId: user._id, confirmedAt: new Date(),
  }], { session });
  await log(user, 'CONFIRM_WITH_RECEIPT', allocation, null, { lines }, session);
  return allocation;
}

export async function allocationOptions() {
  const [receipts, locations, skus, staging] = await Promise.all([
    FinishedGoodsBulkDocument.find({ direction: 'IN', isDeleted: { $ne: true } })
      .select('documentCode items.skuId items.quantity locationId createdAt').sort({ createdAt: -1 }).limit(100).lean(),
    WarehouseLocation.find({ warehouseType: 'FINISHED_GOODS', layoutBin: true,
      isDeleted: { $ne: true } }).select('locationCode maxCapacity currentOccupancy plannedReservedQty status').lean(),
    Sku.find({ isActive: true, isDeleted: { $ne: true } }).select('skuCode').sort({ skuCode: 1 }).lean(),
    WarehouseLocation.find({ warehouseType: 'FINISHED_GOODS', layoutBin: { $ne: true },
      isDeleted: { $ne: true } }).select('_id').lean(),
  ]);
  const [eligible, confirmed] = await Promise.all([
    ProductUnit.aggregate([{ $match: { receivingDocumentId: { $in: receipts.map((item) => item._id) },
      warehouseId: { $in: staging.map((item) => item._id) }, inventoryStatus: 'AVAILABLE' } },
    { $group: { _id: { receiptId: '$receivingDocumentId', skuId: '$skuId' }, quantity: { $sum: 1 } } }]),
    PutawayAllocation.find({ sourceReceiptId: { $in: receipts.map((item) => item._id) },
      status: 'CONFIRMED' }).select('sourceReceiptId lines').lean(),
  ]);
  const available = new Map(eligible.map((item) =>
    [`${id(item._id.receiptId)}:${id(item._id.skuId)}`, item.quantity]));
  for (const allocation of confirmed) for (const line of allocation.lines) {
    const key = `${id(allocation.sourceReceiptId)}:${id(line.skuId)}`;
    available.set(key, (available.get(key) || 0) - remainingQuantity(line));
  }
  return { receipts: receipts.map((receipt) => ({ ...receipt,
    items: receipt.items.map((item) => ({ ...item,
      eligibleQty: Math.max(0, available.get(`${id(receipt._id)}:${id(item.skuId)}`) || 0) })) })),
    locations, skus };
}

/** Counts only units still at legacy receiving locations as putaway source. */
async function sourceQuantities(receiptId, session) {
  const receipt = await FinishedGoodsBulkDocument.findOne({ _id: receiptId, direction: 'IN',
    isDeleted: { $ne: true } }).session(session);
  if (!receipt) fail('SOURCE_NOT_FOUND', 'Không tìm thấy phiếu nhập thành phẩm', 404);
  const locations = await WarehouseLocation.find({ warehouseType: 'FINISHED_GOODS', layoutBin: { $ne: true },
    isDeleted: { $ne: true } }).select('_id').session(session).lean();
  const units = await ProductUnit.aggregate([{ $match: { receivingDocumentId: receipt._id,
    warehouseId: { $in: locations.map((item) => item._id) }, inventoryStatus: 'AVAILABLE' } },
  { $group: { _id: '$skuId', quantity: { $sum: 1 } } }]).session(session);
  return { receipt, quantities: new Map(units.map((item) => [id(item._id), item.quantity])) };
}

/** Validates the current source and bins inside the same transaction as counter updates. */
async function checkReservation(sourceId, lines, excludeAllocationId, session) {
  const { receipt, quantities } = await sourceQuantities(sourceId, session);
  const prior = await PutawayAllocation.find({ sourceReceiptId: sourceId, status: 'CONFIRMED',
    ...(excludeAllocationId ? { _id: { $ne: excludeAllocationId } } : {}) }).session(session).lean();
  const reserved = new Map();
  for (const allocation of prior) for (const line of allocation.lines) {
    const key = id(line.skuId);
    reserved.set(key, (reserved.get(key) || 0) + remainingQuantity(line));
  }
  const requested = new Map();
  const targetIds = [...new Set(lines.map((line) => id(line.targetLocationId)))];
  const targets = await WarehouseLocation.find({ _id: { $in: targetIds },
    warehouseType: 'FINISHED_GOODS', layoutBin: true, isDeleted: { $ne: true } }).session(session).lean();
  const byId = new Map(targets.map((target) => [id(target._id), target]));
  const binPlans = await PutawayAllocation.find({ status: 'CONFIRMED',
    'lines.targetLocationId': { $in: targetIds } }).select('lines').session(session).lean();
  const plannedByBin = new Map();
  for (const plan of binPlans) for (const line of plan.lines) {
    const key = id(line.targetLocationId);
    if (byId.has(key)) plannedByBin.set(key, (plannedByBin.get(key) || 0) + remainingQuantity(line));
  }
  for (const line of lines) {
    const skuId = id(line.skuId);
    requested.set(skuId, (requested.get(skuId) || 0) + line.allocatedQuantity);
    const target = byId.get(id(line.targetLocationId));
    if (!target || target.status !== 'ACTIVE' || target.isFrozenForStocktake) fail('BIN_UNAVAILABLE', 'Ô đích không hoạt động');
  }
  for (const [skuId, count] of requested) {
    if (count + (reserved.get(skuId) || 0) > (quantities.get(skuId) || 0)) fail('SOURCE_CAPACITY', 'Nguồn hàng chờ cất không đủ');
  }
  const activeSkuCount = await Sku.countDocuments({ _id: { $in: [...requested.keys()] },
    isActive: true, isDeleted: { $ne: true } }).session(session);
  if (activeSkuCount !== requested.size) fail('SKU_INACTIVE', 'SKU đã ngừng sử dụng');
  const old = excludeAllocationId ? await PutawayAllocation.findById(excludeAllocationId).session(session) : null;
  const oldByBin = new Map();
  if (old?.status === 'CONFIRMED') for (const line of old.lines) {
    const key = id(line.targetLocationId);
    oldByBin.set(key, (oldByBin.get(key) || 0) + remainingQuantity(line));
  }
  const newByBin = new Map();
  for (const line of lines) {
    const key = id(line.targetLocationId);
    newByBin.set(key, (newByBin.get(key) || 0) + line.allocatedQuantity);
  }
  for (const [binId, count] of newByBin) {
    const target = byId.get(binId);
    if ((target.plannedReservedQty || 0) !== (plannedByBin.get(binId) || 0)) {
      fail('RESERVATION_MISMATCH', `Ô ${target.locationCode} cần đối soát phần giữ chỗ`);
    }
    const actual = await ProductUnit.countDocuments({ warehouseId: target._id,
      inventoryStatus: 'AVAILABLE' }).session(session);
    if (actual !== (target.currentOccupancy || 0)) fail('LOCATION_STOCK_MISMATCH',
      `Ô ${target.locationCode} cần đối soát số hàng thực tế`);
    const available = target.maxCapacity - Math.max(actual, target.currentOccupancy || 0) -
      (target.plannedReservedQty || 0) + (oldByBin.get(binId) || 0);
    if (count > available) fail('BIN_CAPACITY', `Ô ${target.locationCode} không đủ chỗ`);
  }
  return { receipt, oldByBin, newByBin };
}

async function moveCounters(receipt, oldByBin, newByBin, session) {
  const allIds = new Set([...oldByBin.keys(), ...newByBin.keys()]);
  for (const binId of allIds) {
    const delta = (newByBin.get(binId) || 0) - (oldByBin.get(binId) || 0);
    if (!delta) continue;
    const result = await WarehouseLocation.updateOne({ _id: binId, plannedReservedQty: { $gte: Math.max(0, -delta) },
      $expr: { $lte: [{ $add: [{ $ifNull: ['$currentOccupancy', 0] },
        { $ifNull: ['$plannedReservedQty', 0] }, delta] }, '$maxCapacity'] } },
    { $inc: { plannedReservedQty: delta } }, { session });
    if (!result.modifiedCount) fail('BIN_CAPACITY', 'Sức chứa ô đã thay đổi');
  }
  // A write to the shared source document makes concurrent confirmations conflict.
  const lock = await FinishedGoodsBulkDocument.updateOne({ _id: receipt._id },
    { $inc: { putawayReservationEpoch: 1 } }, { session });
  if (!lock.modifiedCount) fail('SOURCE_CHANGED', 'Nguồn hàng đã thay đổi');
}

const log = (user, action, allocation, before, after, session) => SystemLog.create([{
  actorId: user._id, actorRole: user.roleCode, majorFeature: 'WAREHOUSE_PUTAWAY_PLAN',
  subFeature: 'FINISHED_GOODS', action, targetCollection: 'putaway_allocations',
  targetId: allocation._id, targetCode: allocation.allocationCode,
  beforeSnapshot: before, afterSnapshot: after,
}], { session });

export async function listAllocations() {
  return PutawayAllocation.find().sort({ createdAt: -1 }).limit(100).lean();
}

export async function createAllocation(user, input) {
  if (!mongoose.isValidObjectId(input.sourceReceiptId)) fail('INVALID_SOURCE', 'Nguồn hàng không hợp lệ', 400);
  const lines = parseLines(input.lines);
  const source = await FinishedGoodsBulkDocument.findOne({ _id: input.sourceReceiptId, direction: 'IN',
    isDeleted: { $ne: true } }).select('_id');
  if (!source) fail('SOURCE_NOT_FOUND', 'Không tìm thấy phiếu nhập', 404);
  const allocation = await PutawayAllocation.create({ allocationCode: `PB-${randomUUID().slice(0, 12).toUpperCase()}`,
    sourceReceiptId: source._id, lines, note: String(input.note || ''), createdByUserId: user._id });
  await log(user, 'CREATE_DRAFT', allocation, null, { sourceReceiptId: source._id, lines });
  return allocation;
}

export async function updateAllocation(user, allocationId, input) {
  const allocation = await PutawayAllocation.findById(allocationId);
  if (!allocation) fail('ALLOCATION_NOT_FOUND', 'Không tìm thấy phân bổ', 404);
  if (allocation.status === 'CANCELLED') fail('ALLOCATION_CANCELLED', 'Phân bổ đã hủy');
  if (Number(input.version) !== allocation.version) fail('VERSION_CONFLICT', 'Phân bổ đã thay đổi');
  if (allocation.lines.some((line) => Number(line.placedQuantity || 0) > 0 ||
    Number(line.shortageQuantity || 0) > 0 || Number(line.reportedShortageQuantity || 0) > 0))
    fail('PUTAWAY_STARTED', 'Phân bổ đã bắt đầu xếp hàng; không thể thay đổi kế hoạch');
  const lines = parseLines(input.lines);
  if (allocation.status === 'DRAFT') {
    const updated = await PutawayAllocation.findOneAndUpdate({ _id: allocationId, status: 'DRAFT',
      version: allocation.version }, { $set: { lines, note: String(input.note || '') },
      $inc: { version: 1 } }, { new: true });
    if (!updated) fail('VERSION_CONFLICT', 'Phân bổ đã thay đổi');
    await log(user, 'UPDATE_DRAFT', allocation, { lines: allocation.lines }, { lines });
    return updated;
  }
  if (!String(input.reason || '').trim()) fail('REASON_REQUIRED', 'Cần ghi lý do điều chỉnh', 400);
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const current = await PutawayAllocation.findOne({ _id: allocationId, status: 'CONFIRMED',
        version: allocation.version }).session(session);
      if (!current) fail('VERSION_CONFLICT', 'Phân bổ đã thay đổi');
      const { receipt, oldByBin, newByBin } = await checkReservation(current.sourceReceiptId,
        lines, current._id, session);
      await moveCounters(receipt, oldByBin, newByBin, session);
      result = await PutawayAllocation.findOneAndUpdate({ _id: current._id, version: current.version },
        { $set: { lines, adjustmentReason: String(input.reason).trim(), note: String(input.note || '') },
          $inc: { version: 1 } }, { new: true, session });
      if (!result) fail('VERSION_CONFLICT', 'Phân bổ đã thay đổi');
      await log(user, 'ADJUST', current, { lines: current.lines }, { lines, reason: input.reason }, session);
    });
    return result;
  } finally { await session.endSession(); }
}

export async function confirmAllocation(user, allocationId, input) {
  const key = String(input.idempotencyKey || '').trim();
  if (!key || key.length > 100) fail('IDEMPOTENCY_REQUIRED', 'Cần khóa chống gửi trùng', 400);
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const allocation = await PutawayAllocation.findById(allocationId).session(session);
      if (!allocation) fail('ALLOCATION_NOT_FOUND', 'Không tìm thấy phân bổ', 404);
      const hash = fingerprint(allocation.lines);
      if (allocation.status === 'CONFIRMED') {
        if (allocation.idempotencyKey === key && allocation.confirmationHash === hash &&
            Number(input.version) === allocation.version - 1 &&
            (!input.lines || fingerprint(parseLines(input.lines)) === hash)) { result = allocation; return; }
        fail('ALREADY_CONFIRMED', 'Phân bổ đã được xác nhận');
      }
      if (allocation.status !== 'DRAFT') fail('ALLOCATION_CANCELLED', 'Phân bổ đã hủy');
      if (Number(input.version) !== allocation.version) fail('VERSION_CONFLICT', 'Phân bổ đã thay đổi');
      const { receipt, oldByBin, newByBin } = await checkReservation(allocation.sourceReceiptId,
        allocation.lines, null, session);
      await moveCounters(receipt, oldByBin, newByBin, session);
      result = await PutawayAllocation.findOneAndUpdate({ _id: allocation._id, status: 'DRAFT',
        version: allocation.version }, { $set: { status: 'CONFIRMED', confirmedAt: new Date(),
        confirmedByUserId: user._id, idempotencyKey: key, confirmationHash: hash },
        $inc: { version: 1 } }, { new: true, session });
      if (!result) fail('VERSION_CONFLICT', 'Phân bổ đã thay đổi');
      await log(user, 'CONFIRM', allocation, { status: 'DRAFT' }, { status: 'CONFIRMED', lines: result.lines }, session);
    });
    return result;
  } finally { await session.endSession(); }
}

export async function cancelAllocation(user, allocationId, input) {
  const reason = String(input.reason || '').trim();
  if (!reason) fail('REASON_REQUIRED', 'Cần ghi lý do hủy', 400);
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const allocation = await PutawayAllocation.findById(allocationId).session(session);
      if (!allocation) fail('ALLOCATION_NOT_FOUND', 'Không tìm thấy phân bổ', 404);
      if (allocation.status === 'CANCELLED') { result = allocation; return; }
      if (Number(input.version) !== allocation.version) fail('VERSION_CONFLICT', 'Phân bổ đã thay đổi');
      if (allocation.status === 'CONFIRMED') {
        if (allocation.lines.some((line) => Number(line.placedQuantity || 0) > 0 ||
          Number(line.shortageQuantity || 0) > 0 || Number(line.reportedShortageQuantity || 0) > 0))
          fail('PUTAWAY_STARTED', 'Phân bổ đã bắt đầu xếp hàng; không thể hủy kế hoạch');
        const receipt = await FinishedGoodsBulkDocument.findById(allocation.sourceReceiptId).session(session);
        const oldByBin = new Map();
        for (const line of allocation.lines) {
          const key = id(line.targetLocationId);
          oldByBin.set(key, (oldByBin.get(key) || 0) + remainingQuantity(line));
        }
        await moveCounters(receipt, oldByBin, new Map(), session);
      }
      result = await PutawayAllocation.findOneAndUpdate({ _id: allocation._id,
        version: allocation.version }, { $set: { status: 'CANCELLED', cancelReason: reason,
        cancelledByUserId: user._id, cancelledAt: new Date() }, $inc: { version: 1 } }, { new: true, session });
      if (!result) fail('VERSION_CONFLICT', 'Phân bổ đã thay đổi');
      await log(user, 'CANCEL', allocation, { status: allocation.status }, { reason }, session);
    });
    return result;
  } finally { await session.endSession(); }
}

export async function binOccupancy(binId) {
  const bin = await WarehouseLocation.findOne({ _id: binId, layoutBin: true,
    isDeleted: { $ne: true } }).lean();
  if (!bin) fail('BIN_NOT_FOUND', 'Không tìm thấy ô', 404);
  const [actual, actualBySku, units, allocations] = await Promise.all([
    ProductUnit.countDocuments({ warehouseId: bin._id, inventoryStatus: 'AVAILABLE' }),
    ProductUnit.aggregate([{ $match: { warehouseId: bin._id, inventoryStatus: 'AVAILABLE' } },
      { $group: { _id: '$skuId', quantity: { $sum: 1 } } }]),
    ProductUnit.find({ warehouseId: bin._id, inventoryStatus: 'AVAILABLE' })
      .select('skuId barcode').limit(500).lean(),
    PutawayAllocation.find({ status: 'CONFIRMED', 'lines.targetLocationId': bin._id })
      .select('allocationCode sourceReceiptId createdByUserId confirmedAt lines').lean(),
  ]);
  const planned = allocations.flatMap((item) => item.lines.filter((line) => id(line.targetLocationId) === id(bin._id))
    .map((line) => ({ allocationCode: item.allocationCode, sourceReceiptId: item.sourceReceiptId,
      skuId: line.skuId, quantity: remainingQuantity(line), createdByUserId: item.createdByUserId,
      confirmedAt: item.confirmedAt })));
  const reserved = planned.reduce((sum, item) => sum + item.quantity, 0);
  const actualReliable = actual === (bin.currentOccupancy || 0);
  const reservationReliable = reserved === (bin.plannedReservedQty || 0);
  return { bin, actual: actualReliable ? actual : null,
    actualBySku: actualReliable ? actualBySku.map((item) => ({ skuId: item._id,
      quantity: item.quantity })) : [], actualReliable, reservationReliable,
    reserved: reservationReliable ? reserved : null,
    available: actualReliable && reservationReliable
      ? Math.max(0, bin.maxCapacity - actual - reserved) : null,
    units: actualReliable ? units : [], planned,
    calculatedAt: new Date() };
}
