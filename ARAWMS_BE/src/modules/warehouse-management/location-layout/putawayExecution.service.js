/*
 * File: putawayExecution.service.js
 * Author: Duy Anh
 * Date: 2026-10-28
 * Description: Executes confirmed finished-goods putaway one physical barcode at a time. Transactions keep unit location, bin counters, allocation progress, and scan history consistent.
 */
import mongoose from 'mongoose';
import PutawayAllocation from '../../../models/PutawayAllocation.model.js';
import PutawayScanEvent from '../../../models/PutawayScanEvent.model.js';
import PutawayIncident from '../../../models/PutawayIncident.model.js';
import ProductUnit from '../../../models/ProductUnit.js';
import FinishedGoodsBatch from '../../../models/FinishedGoodsBatch.model.js';
import WarehouseLocation from '../../../models/WarehouseLocation.model.js';
import WarehouseLayout from '../../../models/WarehouseLayout.model.js';
import FinishedGoodsBulkDocument from '../../../models/FinishedGoodsBulkDocument.model.js';
import Sku from '../../../models/Sku.model.js';
import Product from '../../../models/Product.model.js';
import FabricRoll from '../../../models/FabricRoll.model.js';
import MaterialStockLot from '../../../models/MaterialStockLot.model.js';
import RawMaterial from '../../../models/RawMaterial.model.js';
import '../../../models/User.model.js';
import SystemLog from '../../../models/SystemLog.model.js';
import { publishRealtime } from '../../../common/services/realtime.js';
import { remainingQuantity } from './allocation.service.js';

const id = (value) => String(value || '');
const fail = (code, message, status = 409) => { throw Object.assign(new Error(message), { code, status }); };
const pendingIssue = (line) => Number(line.reportedShortageQuantity || 0) > 0;
const roundQty = (value) => Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;

// Fabric rolls physically on a shelf, and rolls already assigned to a shelf but not yet stocked.
const SHELVED_ROLL_STATUSES = ['IN_STOCK', 'REMNANT_RETURNED'];
const PENDING_ROLL_STATUSES = ['PENDING_QC', 'QC_PASSED'];
const OPEN_LOT_STATUSES = ['PENDING_PUTAWAY', 'IN_STOCK'];

/** Lot allocations record placed quantity per bin; never show more than the lot still holds. */
const lotPlacements = (lot) => {
  let left = Number(lot.currentQty || 0);
  return (lot.allocations || []).map((allocation) => {
    const placed = Math.max(0, Math.min(Number(allocation.putawayQty || 0), left));
    left -= placed;
    return { locationId: allocation.locationId, actual: roundQty(placed),
      pending: roundQty(Math.max(0, Number(allocation.quantity || 0) - Number(allocation.putawayQty || 0))) };
  });
};

/** Groups fabric rolls and accessory lots in raw-material bins by material, in the material's own unit. */
async function materialContentsByBin(binIds) {
  const result = new Map();
  if (!binIds.length) return result;
  const [rolls, lots] = await Promise.all([
    FabricRoll.find({ locationId: { $in: binIds }, isDeleted: { $ne: true },
      status: { $in: [...SHELVED_ROLL_STATUSES, ...PENDING_ROLL_STATUSES] } })
      .select('rawMaterialId locationId status currentLengthMeters').lean(),
    MaterialStockLot.find({ 'allocations.locationId': { $in: binIds }, isDeleted: { $ne: true },
      status: { $in: OPEN_LOT_STATUSES } }).select('rawMaterialId status currentQty allocations').lean(),
  ]);
  const binSet = new Set(binIds.map(id));
  const add = (binId, materialId, field, quantity, counter) => {
    if (!binSet.has(id(binId)) || !(quantity > 0)) return;
    if (!result.has(id(binId))) result.set(id(binId), new Map());
    const rows = result.get(id(binId));
    const row = rows.get(id(materialId)) || { rawMaterialId: materialId, actual: 0, pending: 0, rollCount: 0, lotCount: 0 };
    row[field] = roundQty(row[field] + quantity);
    if (field === 'actual') row[counter] += 1;
    rows.set(id(materialId), row);
  };
  for (const roll of rolls) {
    const field = SHELVED_ROLL_STATUSES.includes(roll.status) ? 'actual' : 'pending';
    add(roll.locationId, roll.rawMaterialId, field, Number(roll.currentLengthMeters || 0), 'rollCount');
  }
  for (const lot of lots) for (const placement of lotPlacements(lot)) {
    add(placement.locationId, lot.rawMaterialId, 'actual', placement.actual, 'lotCount');
    add(placement.locationId, lot.rawMaterialId, 'pending', placement.pending, 'lotCount');
  }
  const materialIds = [...new Set([...result.values()].flatMap((rows) => [...rows.keys()]))];
  const materials = await RawMaterial.find({ _id: { $in: materialIds } })
    .select('materialCode materialName unit color').lean();
  const materialById = new Map(materials.map((item) => [id(item._id), item]));
  for (const rows of result.values()) for (const row of rows.values()) {
    const material = materialById.get(id(row.rawMaterialId));
    Object.assign(row, { materialCode: material?.materialCode, materialName: material?.materialName,
      unit: material?.unit || '', color: material?.color });
  }
  return result;
}

/** Loads compact employee tasks from confirmed manager allocations only. */
export async function listPutawayTasks() {
  const allocations = await PutawayAllocation.find({ status: 'CONFIRMED' })
    .select('allocationCode sourceReceiptId lines').sort({ confirmedAt: -1 }).limit(200)
    .populate('sourceReceiptId', 'documentCode')
    .populate({ path: 'lines.skuId', select: 'skuCode styleName color size productId',
      populate: { path: 'productId', select: 'productName thumbnailUrl' } })
    .populate('lines.targetLocationId', 'locationCode barcode status').lean();
  return allocations.flatMap((allocation) => allocation.lines.filter((line) => remainingQuantity(line) > 0)
    .map((line) => ({ allocationId: allocation._id, lineId: line.lineId,
      allocationCode: allocation.allocationCode, receiptId: allocation.sourceReceiptId?._id,
      receiptCode: allocation.sourceReceiptId?.documentCode,
      skuId: line.skuId?._id, skuCode: line.skuId?.skuCode,
      productName: line.skuId?.productId?.productName,
      thumbnailUrl: line.skuId?.productId?.thumbnailUrl, color: line.skuId?.color,
      size: line.skuId?.size, locationCode: line.targetLocationId?.locationCode,
      allocatedQuantity: line.allocatedQuantity, placedQuantity: line.placedQuantity || 0,
      remainingQuantity: remainingQuantity(line), issuePending: pendingIssue(line) })));
}

/** Returns current task progress from MongoDB after a pause or page reload. */
export async function getPutawayTask(allocationId, lineId) {
  if (!mongoose.isValidObjectId(allocationId) || !mongoose.isValidObjectId(lineId))
    fail('INVALID_ID', 'Nhiệm vụ không hợp lệ', 400);
  const allocation = await PutawayAllocation.findOne({ _id: allocationId, status: 'CONFIRMED' })
    .select('allocationCode sourceReceiptId lines version')
    .populate('sourceReceiptId', 'documentCode')
    .populate({ path: 'lines.skuId', select: 'skuCode styleName color size productId',
      populate: { path: 'productId', select: 'productName thumbnailUrl' } })
    .populate('lines.targetLocationId', 'locationCode barcode status').lean();
  const line = allocation?.lines.find((item) => id(item.lineId) === id(lineId));
  if (!line) fail('TASK_NOT_FOUND', 'Không tìm thấy hàng cần xếp', 404);
  return { allocationId: allocation._id, lineId: line.lineId,
    allocationCode: allocation.allocationCode, receiptCode: allocation.sourceReceiptId?.documentCode,
    skuId: line.skuId?._id, skuCode: line.skuId?.skuCode,
    productName: line.skuId?.productId?.productName,
    thumbnailUrl: line.skuId?.productId?.thumbnailUrl, color: line.skuId?.color,
    size: line.skuId?.size, locationCode: line.targetLocationId?.locationCode,
    allocatedQuantity: line.allocatedQuantity, placedQuantity: line.placedQuantity || 0,
    shortageQuantity: line.shortageQuantity || 0, remainingQuantity: remainingQuantity(line),
    issuePending: pendingIssue(line) };
}

/** Checks a scanned location against the current active barcode, including rotations. */
export async function verifyPutawayLocation(allocationId, lineId, barcode) {
  const task = await getPutawayTask(allocationId, lineId);
  if (!task.remainingQuantity) fail('TASK_COMPLETE', 'Dòng này đã xếp đủ');
  if (task.issuePending) fail('ISSUE_PENDING', 'Dòng này đang chờ quản lý xử lý thiếu hàng');
  const allocation = await PutawayAllocation.findById(allocationId).select('lines').lean();
  const line = allocation.lines.find((item) => id(item.lineId) === id(lineId));
  const target = await WarehouseLocation.findOne({ _id: line.targetLocationId,
    layoutBin: true, warehouseType: 'FINISHED_GOODS', isDeleted: { $ne: true } }).lean();
  if (!target || target.status !== 'ACTIVE' || target.isFrozenForStocktake)
    fail('BIN_UNAVAILABLE', 'Ô cần xếp hiện không hoạt động');
  const scanned = String(barcode || '').trim().toUpperCase();
  if (!scanned || (String(target.barcode || '').trim().toUpperCase() !== scanned &&
      String(target.locationCode || '').trim().toUpperCase() !== scanned))
    fail('WRONG_LOCATION', `Sai ô. Hãy quét ${target.locationCode}.`);
  return { locationCode: target.locationCode, barcode: target.barcode };
}

/**
 * Confirms one physical unit in a MongoDB transaction.
 * The request ID is stable across retries; the unit ID is unique across all accepted scans.
 * No stock is created here: receiving already created the unit and its SKU stock balance.
 */
export async function scanPutawayUnit(user, allocationId, lineId, input) {
  const requestId = String(input.requestId || '').trim();
  const barcode = String(input.productBarcode || '').trim();
  if (!mongoose.isValidObjectId(allocationId) || !mongoose.isValidObjectId(lineId) ||
    requestId.length < 8 || requestId.length > 100 || !barcode)
    fail('INVALID_SCAN', 'Thông tin quét không hợp lệ', 400);
  const prior = await PutawayScanEvent.findOne({ requestId }).lean();
  if (prior) {
    if (id(prior.allocationId) !== id(allocationId) || id(prior.lineId) !== id(lineId) ||
      prior.barcode !== barcode) fail('REQUEST_REUSED', 'Yêu cầu quét đã được dùng cho sản phẩm khác');
    const task = await getPutawayTask(allocationId, lineId);
    return { task, barcode, alreadyAccepted: true };
  }
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const allocation = await PutawayAllocation.findOne({ _id: allocationId,
        status: 'CONFIRMED' }).session(session);
      const lineIndex = allocation?.lines.findIndex((item) => id(item.lineId) === id(lineId));
      if (lineIndex == null || lineIndex < 0) fail('TASK_NOT_FOUND', 'Không tìm thấy hàng cần xếp', 404);
      const line = allocation.lines[lineIndex];
      if (pendingIssue(line)) fail('ISSUE_PENDING', 'Dòng này đang chờ quản lý xử lý thiếu hàng');
      if (!remainingQuantity(line)) fail('TASK_COMPLETE', 'Đã xếp đủ số lượng của dòng này');
      const target = await WarehouseLocation.findOne({ _id: line.targetLocationId,
        layoutBin: true, warehouseType: 'FINISHED_GOODS', isDeleted: { $ne: true } }).session(session);
      if (!target || target.status !== 'ACTIVE' || target.isFrozenForStocktake)
        fail('BIN_UNAVAILABLE', 'Ô cần xếp hiện không hoạt động');
      const locScanned = String(input.locationBarcode || '').trim().toUpperCase();
      if (String(target.barcode || '').trim().toUpperCase() !== locScanned &&
          String(target.locationCode || '').trim().toUpperCase() !== locScanned)
        fail('WRONG_LOCATION', `Sai ô. Hãy quét ${target.locationCode}.`);
      const unit = await ProductUnit.findOne({ barcode }).session(session);
      if (!unit) fail('UNIT_NOT_FOUND', 'Không tìm thấy barcode sản phẩm', 404);
      if (id(unit.skuId) !== id(line.skuId)) fail('WRONG_SKU', 'Sai sản phẩm hoặc biến thể của dòng cần xếp');
      if (id(unit.receivingDocumentId) !== id(allocation.sourceReceiptId))
        fail('WRONG_RECEIPT', 'Sản phẩm không thuộc phiếu nhập của dòng này');
      if (unit.inventoryStatus !== 'AVAILABLE' || unit.packedOrderId)
        fail('UNIT_UNAVAILABLE', 'Sản phẩm này hiện không thể xếp');
      if (id(unit.warehouseId) === id(target._id) ||
        await PutawayScanEvent.exists({ productUnitId: unit._id }).session(session))
        fail('UNIT_ALREADY_PLACED', 'Chiếc này đã được xác nhận. Không cộng thêm.');
      const source = await WarehouseLocation.findOne({ _id: unit.warehouseId,
        warehouseType: 'FINISHED_GOODS', layoutBin: { $ne: true },
        isDeleted: { $ne: true } }).session(session);
      if (!source) fail('UNIT_NOT_IN_STAGING', 'Sản phẩm không còn ở khu chờ xếp');
      let destinationBatchId = unit.batchId;
      if (unit.batchId) {
        const sourceBatch = await FinishedGoodsBatch.findOne({ _id: unit.batchId,
          skuId: unit.skuId, locationId: source._id }).session(session);
        if (!sourceBatch) fail('BATCH_SOURCE_MISMATCH', 'Lô hàng không khớp nguồn của barcode');
        const batchMoved = await FinishedGoodsBatch.updateOne({ _id: sourceBatch._id,
          $expr: { $gt: [{ $subtract: ['$currentOnHandQty',
            { $ifNull: ['$reservedPickQty', 0] }] }, 0] } },
        { $inc: { currentOnHandQty: -1 } }, { session });
        if (!batchMoved.modifiedCount) fail('BATCH_CHANGED', 'Số hàng trong lô vừa thay đổi');
        // A batch represents stock at one physical location. Split the received batch as scans place units.
        const destinationBatch = await FinishedGoodsBatch.findOneAndUpdate({
          batchCode: `FGP-${sourceBatch._id}-${target._id}`,
        }, { $setOnInsert: { skuId: sourceBatch.skuId, skuBarcode: sourceBatch.skuBarcode,
          locationId: target._id, fifoInboundTimestamp: sourceBatch.fifoInboundTimestamp },
          $inc: { initialQty: 1, labeledQty: 1, currentOnHandQty: 1 } },
        { upsert: true, new: true, session });
        destinationBatchId = destinationBatch._id;
      }
      const moved = await ProductUnit.updateOne({ _id: unit._id, warehouseId: source._id,
        inventoryStatus: 'AVAILABLE', packedOrderId: null },
      { $set: { warehouseId: target._id,
        ...(destinationBatchId ? { batchId: destinationBatchId } : {}) } }, { session });
      if (!moved.modifiedCount) fail('UNIT_CHANGED', 'Sản phẩm vừa được xử lý ở thiết bị khác');
      const from = await WarehouseLocation.updateOne({ _id: source._id,
        currentOccupancy: { $gte: 1 } }, { $inc: { currentOccupancy: -1 } }, { session });
      if (!from.modifiedCount) fail('SOURCE_MISMATCH', 'Số hàng ở khu chờ cần đối soát');
      const to = await WarehouseLocation.updateOne({ _id: target._id, status: 'ACTIVE',
        plannedReservedQty: { $gte: 1 },
        $expr: { $lte: [{ $add: ['$currentOccupancy', '$plannedReservedQty'] }, '$maxCapacity'] } },
      { $inc: { currentOccupancy: 1, plannedReservedQty: -1 } }, { session });
      if (!to.modifiedCount) fail('BIN_CHANGED', 'Ô hoặc chỗ giữ đã thay đổi');
      const progress = await PutawayAllocation.updateOne({ _id: allocation._id,
        status: 'CONFIRMED', version: allocation.version,
        [`lines.${lineIndex}.lineId`]: line.lineId },
      { $inc: { [`lines.${lineIndex}.placedQuantity`]: 1, version: 1 } }, { session });
      if (!progress.modifiedCount) fail('TASK_CHANGED', 'Tiến độ vừa thay đổi ở thiết bị khác');
      await PutawayScanEvent.create([{ requestId, allocationId: allocation._id,
        lineId: line.lineId, productUnitId: unit._id, barcode,
        sourceLocationId: source._id, targetLocationId: target._id, actorId: user._id }], { session });
      await SystemLog.create([{ actorId: user._id, actorRole: user.roleCode,
        majorFeature: 'WAREHOUSE_PUTAWAY', subFeature: 'FINISHED_GOODS', action: 'PLACE_UNIT',
        targetCollection: 'product_units', targetId: unit._id, targetCode: barcode,
        beforeSnapshot: { warehouseId: source._id }, afterSnapshot: { warehouseId: target._id,
          allocationId: allocation._id, lineId: line.lineId } }], { session });
      result = { barcode, targetLocationId: id(target._id), alreadyAccepted: false };
    });
  const task = await getPutawayTask(allocationId, lineId);
  if (!result.alreadyAccepted) {
    const event = { warehouseType: 'FINISHED_GOODS', allocationId: id(allocationId), lineId: id(lineId),
      targetLocationId: result.targetLocationId, locationCode: task.locationCode,
      skuId: id(task.skuId), reason: 'PUTAWAY_SCAN' };
    publishRealtime('warehouse-putaway:changed', event);
    publishRealtime('finished-goods:changed', { ...event, direction: 'PUTAWAY' });
  }
  return { ...result, task };
  } catch (error) {
    if (error.code === 11000) {
      const accepted = await PutawayScanEvent.findOne({ requestId }).lean();
      if (accepted && id(accepted.allocationId) === id(allocationId) &&
        id(accepted.lineId) === id(lineId) && accepted.barcode === barcode)
        return { barcode, alreadyAccepted: true, task: await getPutawayTask(allocationId, lineId) };
      fail('UNIT_ALREADY_PLACED', 'Chiếc này đã được xác nhận. Không cộng thêm.');
    }
    throw error;
  } finally { await session.endSession(); }
}

/** Records a shortage for manager review without releasing reserved capacity yet. */
export async function reportPutawayShortage(user, allocationId, lineId, reason) {
  const text = String(reason || '').trim();
  if (!text || text.length > 500) fail('REASON_REQUIRED', 'Cần ghi lý do thiếu hàng', 400);
  const allocation = await PutawayAllocation.findOne({ _id: allocationId, status: 'CONFIRMED' });
  const index = allocation?.lines.findIndex((line) => id(line.lineId) === id(lineId));
  if (index == null || index < 0) fail('TASK_NOT_FOUND', 'Không tìm thấy hàng cần xếp', 404);
  const line = allocation.lines[index];
  if (!remainingQuantity(line)) fail('TASK_COMPLETE', 'Dòng này đã hoàn tất');
  if (pendingIssue(line)) fail('ISSUE_PENDING', 'Đã báo thiếu, đang chờ quản lý xử lý');
  const updated = await PutawayAllocation.updateOne({ _id: allocation._id,
    version: allocation.version, status: 'CONFIRMED' }, { $set: {
      [`lines.${index}.reportedShortageQuantity`]: remainingQuantity(line),
      [`lines.${index}.shortageReason`]: text,
      [`lines.${index}.shortageReportedAt`]: new Date(),
      [`lines.${index}.shortageReportedByUserId`]: user._id }, $inc: { version: 1 } });
  if (!updated.modifiedCount) fail('TASK_CHANGED', 'Tiến độ vừa thay đổi, hãy tải lại');
  await SystemLog.create({ actorId: user._id, actorRole: user.roleCode,
    majorFeature: 'WAREHOUSE_PUTAWAY', subFeature: 'SHORTAGE', action: 'REPORT_SHORTAGE',
    targetCollection: 'putaway_allocations', targetId: allocation._id,
    afterSnapshot: { lineId, quantity: remainingQuantity(line), reason: text } });
  publishRealtime('warehouse-putaway:changed', { allocationId: id(allocationId), lineId: id(lineId), reason: 'SHORTAGE_REPORTED' });
  return getPutawayTask(allocationId, lineId);
}

/** Manager either waives the missing quantity or returns the task for scanning. */
export async function resolvePutawayShortage(user, allocationId, lineId, accept) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const allocation = await PutawayAllocation.findOne({ _id: allocationId,
        status: 'CONFIRMED' }).session(session);
      const index = allocation?.lines.findIndex((line) => id(line.lineId) === id(lineId));
      if (index == null || index < 0) fail('TASK_NOT_FOUND', 'Không tìm thấy báo thiếu', 404);
      const line = allocation.lines[index];
      if (!pendingIssue(line)) fail('ISSUE_NOT_FOUND', 'Dòng này không có báo thiếu đang chờ');
      const remaining = remainingQuantity(line);
      if (remaining !== line.reportedShortageQuantity) fail('TASK_CHANGED', 'Tiến độ đã đổi, cần đối soát');
      if (accept) {
        const bin = await WarehouseLocation.updateOne({ _id: line.targetLocationId,
          plannedReservedQty: { $gte: remaining } },
        { $inc: { plannedReservedQty: -remaining } }, { session });
        if (!bin.modifiedCount) fail('RESERVATION_MISMATCH', 'Chỗ giữ trong ô cần đối soát');
        const receipt = await FinishedGoodsBulkDocument.updateOne({ _id: allocation.sourceReceiptId },
          { $inc: { putawayReservationEpoch: 1 } }, { session });
        if (!receipt.modifiedCount) fail('SOURCE_CHANGED', 'Phiếu nhập đã thay đổi');
      }
      const updated = await PutawayAllocation.updateOne({ _id: allocation._id,
        version: allocation.version }, { $set: {
          [`lines.${index}.shortageQuantity`]: (line.shortageQuantity || 0) + (accept ? remaining : 0),
          [`lines.${index}.reportedShortageQuantity`]: 0,
          [`lines.${index}.shortageResolvedAt`]: new Date(),
          [`lines.${index}.shortageResolvedByUserId`]: user._id }, $inc: { version: 1 } }, { session });
      if (!updated.modifiedCount) fail('TASK_CHANGED', 'Báo thiếu vừa được xử lý');
      await SystemLog.create([{ actorId: user._id, actorRole: user.roleCode,
        majorFeature: 'WAREHOUSE_PUTAWAY', subFeature: 'SHORTAGE',
        action: accept ? 'ACCEPT_SHORTAGE' : 'REJECT_SHORTAGE',
        targetCollection: 'putaway_allocations', targetId: allocation._id,
        afterSnapshot: { lineId, quantity: remaining, reason: line.shortageReason } }], { session });
    });
    const task = await getPutawayTask(allocationId, lineId);
    publishRealtime('warehouse-putaway:changed', { warehouseType: 'FINISHED_GOODS',
      allocationId: id(allocationId), lineId: id(lineId), reason: 'SHORTAGE_RESOLVED' });
    publishRealtime('finished-goods:changed', { warehouseType: 'FINISHED_GOODS', direction: 'PUTAWAY',
      allocationId: id(allocationId), lineId: id(lineId), reason: 'SHORTAGE_RESOLVED' });
    return task;
  } finally { await session.endSession(); }
}

/** Summarizes a rack from current unit locations, not historical scan counts. */
export async function rackContents(rackId) {
  if (!mongoose.isValidObjectId(rackId)) fail('INVALID_ID', 'Kệ không hợp lệ', 400);
  const layout = await WarehouseLayout.findOne({ warehouseType: 'FINISHED_GOODS' }).lean();
  const rack = layout?.active?.racks.find((item) => id(item.id) === id(rackId));
  if (!rack) fail('RACK_NOT_FOUND', 'Không tìm thấy kệ đang áp dụng', 404);
  const bins = await WarehouseLocation.find({ _id: { $in: layout.active.bins
    .filter((item) => id(item.rackId) === id(rackId)).map((item) => item.id) },
  layoutBin: true, isDeleted: { $ne: true } }).sort({ floorNo: 1, binNo: 1 }).lean();
  const binIds = bins.map((item) => item._id);
  const rawBinIds = bins.filter((bin) => bin.warehouseType === 'RAW_MATERIAL').map((bin) => bin._id);
  const [actual, allocations, materialRows] = await Promise.all([
    ProductUnit.aggregate([{ $match: { warehouseId: { $in: binIds },
      inventoryStatus: 'AVAILABLE' } },
    { $group: { _id: { binId: '$warehouseId', skuId: '$skuId' }, quantity: { $sum: 1 } } }]),
    PutawayAllocation.find({ status: 'CONFIRMED',
      'lines.targetLocationId': { $in: binIds } }).select('lines').lean(),
    materialContentsByBin(rawBinIds),
  ]);
  const skuIds = [...new Set([...actual.map((item) => id(item._id.skuId)),
    ...allocations.flatMap((plan) => plan.lines.map((line) => id(line.skuId)))])];
  const skus = await Sku.find({ _id: { $in: skuIds } }).select('skuCode productId color size').lean();
  const products = await Product.find({ _id: { $in: skus.map((item) => item.productId) } })
    .select('productName thumbnailUrl').lean();
  const skuById = new Map(skus.map((item) => [id(item._id), item]));
  const productById = new Map(products.map((item) => [id(item._id), item]));
  const rows = new Map();
  for (const bin of bins) rows.set(id(bin._id), new Map());
  for (const item of actual) {
    const key = id(item._id.binId);
    rows.get(key)?.set(id(item._id.skuId), { skuId: item._id.skuId,
      actual: item.quantity, pending: 0 });
  }
  for (const plan of allocations) for (const line of plan.lines) {
    const bin = rows.get(id(line.targetLocationId));
    if (!bin) continue;
    const key = id(line.skuId);
    const row = bin.get(key) || { skuId: line.skuId, actual: 0, pending: 0 };
    row.pending += remainingQuantity(line);
    bin.set(key, row);
  }
  const items = bins.map((bin) => {
    const isRaw = bin.warehouseType === 'RAW_MATERIAL';
    const materials = [...(materialRows.get(id(bin._id))?.values() || [])];
    const actualUnits = [...rows.get(id(bin._id)).values()].reduce((sum, row) => sum + row.actual, 0);
    const pendingUnits = [...rows.get(id(bin._id)).values()].reduce((sum, row) => sum + row.pending, 0);
    return { binId: bin._id, locationCode: bin.locationCode, warehouseType: bin.warehouseType,
      floorNo: bin.floorNo, binNo: bin.binNo, capacity: bin.maxCapacity,
      actual: actualUnits, pending: pendingUnits,
      // Raw-material bins track occupancy in mixed units, so free space comes from the stored counter.
      available: isRaw ? Math.max(0, Number(bin.maxCapacity || 0) - Number(bin.currentOccupancy || 0))
        : Math.max(0, bin.maxCapacity - actualUnits - pendingUnits),
      materials,
      products: [...rows.get(id(bin._id)).values()].map((row) => {
        const sku = skuById.get(id(row.skuId));
        const product = productById.get(id(sku?.productId));
        return { ...row, skuCode: sku?.skuCode, productName: product?.productName,
          color: sku?.color, size: sku?.size };
      }) };
  });
  const allMaterials = items.flatMap((item) => item.materials);
  return { rack: { id: rack.id, code: rack.code, name: rack.name, zoneCode: rack.zoneCode },
    warehouseType: items.length && items.every((item) => item.warehouseType === 'RAW_MATERIAL')
      ? 'RAW_MATERIAL' : 'FINISHED_GOODS',
    actual: items.reduce((sum, item) => sum + item.actual, 0),
    pending: items.reduce((sum, item) => sum + item.pending, 0),
    skuCount: new Set(items.flatMap((item) => item.products.filter((row) => row.actual)
      .map((row) => id(row.skuId)))).size,
    materialCount: new Set(allMaterials.filter((row) => row.actual > 0).map((row) => id(row.rawMaterialId))).size,
    rollCount: allMaterials.reduce((sum, row) => sum + row.rollCount, 0),
    lotCount: allMaterials.reduce((sum, row) => sum + row.lotCount, 0),
    available: items.reduce((sum, item) => sum + item.available, 0),
    bins: items };
}

/** Lists roll and lot barcodes in a raw-material bin with their remaining quantity. */
async function binMaterialBarcodes(bin, page, limit) {
  const [rolls, lots] = await Promise.all([
    FabricRoll.find({ locationId: bin._id, isDeleted: { $ne: true },
      status: { $in: [...SHELVED_ROLL_STATUSES, ...PENDING_ROLL_STATUSES] } })
      .select('rollBarcode rawMaterialId status currentLengthMeters fifoInboundTimestamp')
      .populate('rawMaterialId', 'materialCode materialName unit').sort({ fifoInboundTimestamp: 1 }).lean(),
    MaterialStockLot.find({ 'allocations.locationId': bin._id, isDeleted: { $ne: true },
      status: { $in: OPEN_LOT_STATUSES } })
      .select('lotBarcode rawMaterialId status currentQty allocations fifoInboundTimestamp')
      .populate('rawMaterialId', 'materialCode materialName unit').sort({ fifoInboundTimestamp: 1 }).lean(),
  ]);
  const rows = [
    ...rolls.filter((roll) => Number(roll.currentLengthMeters || 0) > 0).map((roll) => ({
      barcode: roll.rollBarcode, kind: 'ROLL', materialName: roll.rawMaterialId?.materialName,
      materialCode: roll.rawMaterialId?.materialCode, quantity: roundQty(roll.currentLengthMeters),
      unit: roll.rawMaterialId?.unit || 'METER', pending: PENDING_ROLL_STATUSES.includes(roll.status),
      placedAt: roll.fifoInboundTimestamp || null })),
    ...lots.flatMap((lot) => lotPlacements(lot).filter((placement) => id(placement.locationId) === id(bin._id))
      .flatMap((placement) => [
        placement.actual > 0 && { quantity: placement.actual, pending: false },
        placement.pending > 0 && { quantity: placement.pending, pending: true },
      ].filter(Boolean).map((part) => ({ barcode: lot.lotBarcode, kind: 'LOT',
        materialName: lot.rawMaterialId?.materialName, materialCode: lot.rawMaterialId?.materialCode,
        quantity: part.quantity, unit: lot.rawMaterialId?.unit || '', pending: part.pending,
        placedAt: lot.fifoInboundTimestamp || null })))),
  ];
  return { bin: bin.locationCode, warehouseType: 'RAW_MATERIAL', page, limit, total: rows.length,
    units: rows.slice((page - 1) * limit, page * limit) };
}

/** Paginates current unit barcodes and the employee/time of their accepted putaway scan. */
export async function binUnits(binId, pageInput) {
  if (!mongoose.isValidObjectId(binId)) fail('INVALID_ID', 'Ô không hợp lệ', 400);
  const page = Math.max(1, Math.min(100000, Number(pageInput) || 1));
  const limit = 30;
  const bin = await WarehouseLocation.findOne({ _id: binId, layoutBin: true,
    isDeleted: { $ne: true } }).select('locationCode warehouseType').lean();
  if (!bin) fail('BIN_NOT_FOUND', 'Không tìm thấy ô', 404);
  if (bin.warehouseType === 'RAW_MATERIAL') return binMaterialBarcodes(bin, page, limit);
  const [total, units] = await Promise.all([
    ProductUnit.countDocuments({ warehouseId: bin._id, inventoryStatus: 'AVAILABLE' }),
    ProductUnit.find({ warehouseId: bin._id, inventoryStatus: 'AVAILABLE' })
      .select('barcode skuId').sort({ _id: 1 }).skip((page - 1) * limit).limit(limit).lean(),
  ]);
  const events = await PutawayScanEvent.find({ productUnitId: { $in: units.map((unit) => unit._id) } })
    .select('productUnitId actorId createdAt').populate('actorId', 'fullName employeeCode').lean();
  const eventByUnit = new Map(events.map((event) => [id(event.productUnitId), event]));
  // Name each unit so managers can tell products apart in the barcode list.
  const skus = await Sku.find({ _id: { $in: [...new Set(units.map((unit) => id(unit.skuId)))] } })
    .select('skuCode productId color size').lean();
  const products = await Product.find({ _id: { $in: skus.map((sku) => sku.productId) } })
    .select('productName').lean();
  const skuById = new Map(skus.map((sku) => [id(sku._id), sku]));
  const productById = new Map(products.map((product) => [id(product._id), product]));
  return { bin: bin.locationCode, page, limit, total, units: units.map((unit) => {
    const sku = skuById.get(id(unit.skuId));
    return {
    barcode: unit.barcode, skuId: unit.skuId, skuCode: sku?.skuCode || '',
    productName: productById.get(id(sku?.productId))?.productName || '',
    color: sku?.color || '', size: sku?.size || '',
    placedBy: eventByUnit.get(id(unit._id))?.actorId?.fullName || null,
    placedAt: eventByUnit.get(id(unit._id))?.createdAt || null };
  }) };
}

/** Lists unresolved shortages for a manager without loading task details on the staff screen. */
export async function listPutawayIssues() {
  const allocations = await PutawayAllocation.find({ status: 'CONFIRMED',
    'lines.reportedShortageQuantity': { $gt: 0 } }).select('allocationCode lines')
    .populate('lines.targetLocationId', 'locationCode')
    .populate('lines.skuId', 'skuCode').lean();
  return allocations.flatMap((allocation) => allocation.lines.filter(pendingIssue).map((line) => ({
    allocationId: allocation._id, lineId: line.lineId, allocationCode: allocation.allocationCode,
    skuCode: line.skuId?.skuCode, locationCode: line.targetLocationId?.locationCode,
    quantity: line.reportedShortageQuantity, reason: line.shortageReason,
    reportedAt: line.shortageReportedAt })));
}

/** Reports an already accepted mistaken scan without silently undoing physical stock. */
export async function reportPutawayIncident(user, allocationId, lineId, input) {
  const reason = String(input.reason || '').trim();
  const barcode = String(input.barcode || '').trim();
  if (!reason || reason.length > 500) fail('REASON_REQUIRED', 'Cần ghi rõ sự cố', 400);
  const allocation = await PutawayAllocation.findById(allocationId).select('lines').lean();
  if (!allocation?.lines.some((line) => id(line.lineId) === id(lineId)))
    fail('TASK_NOT_FOUND', 'Không tìm thấy dòng phân bổ', 404);
  if (barcode && !await PutawayScanEvent.exists({ allocationId, lineId, barcode }))
    fail('BARCODE_NOT_IN_TASK', 'Barcode này chưa được xác nhận trong dòng', 400);
  const incident = await PutawayIncident.create({ allocationId, lineId, barcode,
    reason, reportedByUserId: user._id });
  await SystemLog.create({ actorId: user._id, actorRole: user.roleCode,
    majorFeature: 'WAREHOUSE_PUTAWAY', subFeature: 'INCIDENT', action: 'REPORT_INCIDENT',
    targetCollection: 'putaway_incidents', targetId: incident._id,
    afterSnapshot: { allocationId, lineId, barcode, reason } });
  return incident;
}

/** Shows manager review items while keeping shortage decisions separate from incidents. */
export async function listPutawayIncidents() {
  const incidents = await PutawayIncident.find({ status: 'OPEN' })
    .select('allocationId lineId barcode reason createdAt reportedByUserId')
    .populate('reportedByUserId', 'fullName employeeCode')
    .sort({ createdAt: -1 }).limit(100).lean();
  return incidents.map((item) => ({ ...item,
    reportedBy: item.reportedByUserId?.fullName || item.reportedByUserId?.employeeCode }));
}

/** Acknowledges manager review; any stock correction remains a separate audited operation. */
export async function reviewPutawayIncident(user, incidentId, note) {
  if (!mongoose.isValidObjectId(incidentId)) fail('INVALID_ID', 'Sự cố không hợp lệ', 400);
  const reviewNote = String(note || '').trim();
  if (!reviewNote || reviewNote.length > 500) fail('REVIEW_NOTE_REQUIRED', 'Cần ghi kết quả xử lý', 400);
  const incident = await PutawayIncident.findOneAndUpdate({ _id: incidentId, status: 'OPEN' },
    { $set: { status: 'REVIEWED', reviewedByUserId: user._id,
      reviewedAt: new Date(), reviewNote } }, { new: true });
  if (!incident) fail('INCIDENT_NOT_FOUND', 'Sự cố đã được xử lý hoặc không tồn tại', 404);
  await SystemLog.create({ actorId: user._id, actorRole: user.roleCode,
    majorFeature: 'WAREHOUSE_PUTAWAY', subFeature: 'INCIDENT', action: 'REVIEW_INCIDENT',
    targetCollection: 'putaway_incidents', targetId: incident._id,
    afterSnapshot: { reviewNote } });
  return incident;
}
