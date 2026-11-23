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
import { notifyWorkflow, ROLE_PAGES } from '../../../common/services/workflowNotify.js';
import { code128DataUrl } from '../../../common/services/codeImageRenderer.js';
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
 * Moves one physical unit from the unplaced area onto a line's target bin inside the caller's transaction.
 * Shared by single-unit scanning and bulk putaway so both apply the same checks and counters.
 * The caller has already loaded the allocation (document) and an ACTIVE, verified target bin.
 */
async function placeUnitInTransaction({ session, allocation, lineIndex, target, barcode, requestId, user, bulkRequestId = null }) {
  const line = allocation.lines[lineIndex];
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
  // Cùng một giao dịch có thể xếp nhiều chiếc của phiếu: giữ bản sao cục bộ khớp với DB.
  allocation.version += 1;
  line.placedQuantity = Number(line.placedQuantity || 0) + 1;
  await PutawayScanEvent.create([{ requestId, allocationId: allocation._id,
    lineId: line.lineId, productUnitId: unit._id, barcode,
    sourceLocationId: source._id, targetLocationId: target._id, actorId: user._id }], { session });
  await SystemLog.create([{ actorId: user._id, actorRole: user.roleCode,
    majorFeature: 'WAREHOUSE_PUTAWAY', subFeature: 'FINISHED_GOODS', action: bulkRequestId ? 'PLACE_UNIT_BULK' : 'PLACE_UNIT',
    targetCollection: 'product_units', targetId: unit._id, targetCode: barcode,
    beforeSnapshot: { warehouseId: source._id }, afterSnapshot: { warehouseId: target._id,
      allocationId: allocation._id, lineId: line.lineId, ...(bulkRequestId ? { mode: 'BULK', bulkRequestId } : {}) } }], { session });
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
      await placeUnitInTransaction({ session, allocation, lineIndex, target, barcode, requestId, user });
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

// ---------------------------------------------------------------------------------------------
// Xếp hàng loạt: chọn các tem đã in của một phiếu, quét mã ô một lần, hệ thống xếp cả nhóm.
// ---------------------------------------------------------------------------------------------
// Xem trước nhận tới 2000 tem; mỗi lần xếp (một giao dịch) tối đa 200 chiếc, giao diện tự chia phần.
const BULK_PLAN_LIMIT = 2000;
const BULK_PLACE_LIMIT = 200;
const upper = (value) => String(value || '').trim().toUpperCase();

/** Validates the receipt ID and the selected barcodes (unique, 1..limit). */
const bulkInput = (receiptId, barcodes, limit) => {
  if (!mongoose.isValidObjectId(receiptId)) fail('INVALID_RECEIPT', 'Phiếu nhập không hợp lệ', 400);
  if (!Array.isArray(barcodes) || !barcodes.length) fail('INVALID_BARCODES', 'Chọn ít nhất một tem để xếp', 400);
  const list = [...new Set(barcodes.map((value) => String(value || '').trim()).filter(Boolean))];
  if (!list.length || list.length !== barcodes.length) fail('INVALID_BARCODES', 'Danh sách tem có mã trống hoặc trùng', 400);
  if (list.length > limit) fail('TOO_MANY_BARCODES', `Mỗi lần tối đa ${limit} chiếc`, 400);
  return list;
};

/** Confirmed allocation lines of a receipt that can still take units (oldest allocation first). */
const openReceiptLines = (allocations) => allocations.flatMap((allocation) => allocation.lines
  .map((line, lineIndex) => ({ allocation, line, lineIndex }))
  .filter(({ line }) => !pendingIssue(line) && remainingQuantity(line) > 0));

/**
 * Read-only plan: groups the selected units of a receipt by the bin they will go to.
 * Units are spread over the SKU's open lines (the preferred bin first, then in order); units that cannot be placed are listed with a reason.
 */
export async function bulkPutawayPlan(receiptId, barcodes, preferredLocationCode = '') {
  const list = bulkInput(receiptId, barcodes, BULK_PLAN_LIMIT);
  const [allocations, units] = await Promise.all([
    PutawayAllocation.find({ sourceReceiptId: receiptId, status: 'CONFIRMED' }).sort({ confirmedAt: 1, _id: 1 }).lean(),
    ProductUnit.find({ barcode: { $in: list } }).select('barcode skuId receivingDocumentId warehouseId inventoryStatus packedOrderId').lean(),
  ]);
  if (!allocations.length) fail('RECEIPT_NOT_ASSIGNED', 'Phiếu chưa có hàng được giao xếp', 404);
  const unitByBarcode = new Map(units.map((unit) => [unit.barcode, unit]));
  const [placedEvents, stagingLocations] = await Promise.all([
    PutawayScanEvent.find({ productUnitId: { $in: units.map((unit) => unit._id) } }).select('productUnitId').lean(),
    WarehouseLocation.find({ _id: { $in: units.map((unit) => unit.warehouseId).filter(Boolean) },
      warehouseType: 'FINISHED_GOODS', layoutBin: { $ne: true }, isDeleted: { $ne: true } }).select('_id').lean(),
  ]);
  const placed = new Set(placedEvents.map((event) => id(event.productUnitId)));
  const staging = new Set(stagingLocations.map((location) => id(location._id)));
  // Ô người xếp đã chọn (vd B-01-T2-O1) được nhận tem trước; phần dư mới rải sang các ô khác của SKU.
  const preferred = preferredLocationCode ? await WarehouseLocation.findOne({ locationCode: upper(preferredLocationCode),
    warehouseType: 'FINISHED_GOODS', isDeleted: { $ne: true } }).select('_id').lean() : null;
  const lines = openReceiptLines(allocations).map((entry) => ({ ...entry, left: remainingQuantity(entry.line) }))
    .sort((a, b) => Number(id(b.line.targetLocationId) === id(preferred?._id)) - Number(id(a.line.targetLocationId) === id(preferred?._id)));
  const invalid = [];
  const assigned = new Map(); // targetLocationId -> [{ barcode, skuId }]
  for (const barcode of list) {
    const unit = unitByBarcode.get(barcode);
    const reject = (reason) => invalid.push({ barcode, reason });
    if (!unit) { reject('Không tìm thấy barcode'); continue; }
    if (id(unit.receivingDocumentId) !== id(receiptId)) { reject('Không thuộc phiếu nhập này'); continue; }
    if (placed.has(id(unit._id))) { reject('Đã được xếp lên kệ'); continue; }
    if (unit.inventoryStatus !== 'AVAILABLE' || unit.packedOrderId) { reject('Chiếc này hiện không thể xếp'); continue; }
    if (!staging.has(id(unit.warehouseId))) { reject('Không còn ở khu chờ xếp'); continue; }
    const slot = lines.find((entry) => entry.left > 0 && id(entry.line.skuId) === id(unit.skuId));
    if (!slot) { reject('SKU này không còn số lượng cần xếp (hoặc đang chờ quản lý xử lý)'); continue; }
    slot.left -= 1;
    const key = id(slot.line.targetLocationId);
    if (!assigned.has(key)) assigned.set(key, []);
    assigned.get(key).push({ barcode, skuId: id(unit.skuId) });
  }
  const [locations, skus] = await Promise.all([
    WarehouseLocation.find({ _id: { $in: [...assigned.keys()] } }).select('locationCode status isFrozenForStocktake').lean(),
    Sku.find({ _id: { $in: [...new Set(units.map((unit) => id(unit.skuId)))] } })
      .select('skuCode color size productId').populate('productId', 'productName').lean(),
  ]);
  const locationById = new Map(locations.map((location) => [id(location._id), location]));
  const skuById = new Map(skus.map((sku) => [id(sku._id), sku]));
  const groups = [...assigned.entries()].map(([locationId, items]) => {
    const location = locationById.get(locationId);
    const bySku = new Map();
    for (const item of items) bySku.set(item.skuId, (bySku.get(item.skuId) || 0) + 1);
    return {
      locationId, locationCode: location?.locationCode || '',
      blockedReason: !location || location.status !== 'ACTIVE' ? 'Ô hiện không hoạt động'
        : location.isFrozenForStocktake ? 'Ô đang khóa để kiểm kê' : null,
      barcodes: items.map((item) => item.barcode),
      skus: [...bySku.entries()].map(([skuId, quantity]) => {
        const sku = skuById.get(skuId);
        return { skuId, quantity, skuCode: sku?.skuCode || '', productName: sku?.productId?.productName || '',
          color: sku?.color || '', size: sku?.size || '' };
      }),
    };
  }).sort((a, b) => a.locationCode.localeCompare(b.locationCode));
  return { groups, invalid, total: list.length };
}

/**
 * Places every selected unit onto the scanned bin in ONE transaction: one bin scan for the whole group.
 * Units only fill lines whose target is the scanned bin. Any failing unit rolls back the whole group.
 * Retrying with the same requestId never places a unit twice.
 */
export async function bulkPlaceUnits(user, receiptId, input = {}) {
  const list = bulkInput(receiptId, input.barcodes, BULK_PLACE_LIMIT);
  const requestId = String(input.requestId || '').trim();
  const scanned = upper(input.locationBarcode);
  if (requestId.length < 8 || requestId.length > 100 || !scanned) fail('INVALID_SCAN', 'Thông tin quét không hợp lệ', 400);
  const unitRequestId = (barcode) => `${requestId}:${barcode}`;

  // Gửi lại cùng requestId (mất mạng rồi thử lại): trả kết quả cũ, không xếp lần hai.
  const prior = await PutawayScanEvent.find({ requestId: { $in: list.map(unitRequestId) } }).select('targetLocationId').lean();
  if (prior.length) {
    if (prior.length !== list.length) fail('REQUEST_REUSED', 'Yêu cầu xếp đã được dùng cho danh sách tem khác');
    const location = await WarehouseLocation.findById(prior[0].targetLocationId).select('locationCode').lean();
    return { placed: list.length, locationCode: location?.locationCode || '', alreadyAccepted: true };
  }

  const session = await mongoose.startSession();
  let outcome;
  try {
    await session.withTransaction(async () => {
      const allocations = await PutawayAllocation.find({ sourceReceiptId: receiptId, status: 'CONFIRMED' })
        .sort({ confirmedAt: 1, _id: 1 }).session(session);
      if (!allocations.length) fail('RECEIPT_NOT_ASSIGNED', 'Phiếu chưa có hàng được giao xếp', 404);
      const lines = openReceiptLines(allocations);
      const targets = await WarehouseLocation.find({ _id: { $in: [...new Set(lines.map(({ line }) => id(line.targetLocationId)))] },
        layoutBin: true, warehouseType: 'FINISHED_GOODS', isDeleted: { $ne: true } }).session(session);
      const target = targets.find((location) => upper(location.barcode) === scanned || upper(location.locationCode) === scanned);
      if (!target) fail('WRONG_LOCATION', 'Mã ô này không thuộc các ô được phân bổ cho tem đã chọn.');
      if (target.status !== 'ACTIVE' || target.isFrozenForStocktake) fail('BIN_UNAVAILABLE', `Ô ${target.locationCode} hiện không hoạt động`);
      const units = await ProductUnit.find({ barcode: { $in: list } }).select('barcode skuId').session(session).lean();
      const skuByBarcode = new Map(units.map((unit) => [unit.barcode, id(unit.skuId)]));
      const touched = new Map();
      for (const barcode of list) {
        const skuId = skuByBarcode.get(barcode);
        if (!skuId) fail('UNIT_NOT_FOUND', `${barcode}: không tìm thấy barcode sản phẩm`, 404);
        const slot = lines.find(({ line }) => id(line.targetLocationId) === id(target._id)
          && id(line.skuId) === skuId && remainingQuantity(line) > 0);
        if (!slot) fail('NO_SLOT_IN_BIN', `${barcode}: ô ${target.locationCode} không còn chỗ được phân bổ cho sản phẩm này. Hãy kiểm tra lại các tem đã chọn.`);
        try {
          await placeUnitInTransaction({ session, allocation: slot.allocation, lineIndex: slot.lineIndex, target,
            barcode, requestId: unitRequestId(barcode), user, bulkRequestId: requestId });
        } catch (error) {
          if (error.status) error.message = `${barcode}: ${error.message}`;
          throw error;
        }
        touched.set(`${id(slot.allocation._id)}:${id(slot.line.lineId)}`,
          { allocationId: id(slot.allocation._id), lineId: id(slot.line.lineId), skuId });
      }
      outcome = { placed: list.length, locationCode: target.locationCode, targetLocationId: id(target._id),
        alreadyAccepted: false, lines: [...touched.values()] };
    });
  } catch (error) {
    if (error.code === 11000) fail('UNIT_ALREADY_PLACED', 'Có chiếc trong danh sách vừa được xếp ở thiết bị khác. Hãy tải lại và chọn lại tem.');
    throw error;
  } finally { await session.endSession(); }

  for (const line of outcome.lines) {
    const event = { warehouseType: 'FINISHED_GOODS', ...line, targetLocationId: outcome.targetLocationId,
      locationCode: outcome.locationCode, reason: 'PUTAWAY_BULK' };
    publishRealtime('warehouse-putaway:changed', event);
    publishRealtime('finished-goods:changed', { ...event, direction: 'PUTAWAY' });
  }
  const { lines, targetLocationId, ...result } = outcome;
  return result;
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
  notifyWorkflow({ actor: user, type: 'STOCK_ALERT', priority: 'HIGH',
    roles: { WAREHOUSE_MANAGER: '/warehouse/layout' },
    title: `Báo thiếu khi xếp kệ: ${allocation.allocationCode || 'phiếu phân bổ'}`,
    message: `${user?.fullName || 'Nhân viên kho'} báo thiếu ${remainingQuantity(line)} sản phẩm. Lý do: ${text}`,
    metadata: { allocationId: id(allocationId), lineId: id(lineId) } });
  return getPutawayTask(allocationId, lineId);
}

/** Manager either waives the missing quantity or returns the task for scanning. */
export async function resolvePutawayShortage(user, allocationId, lineId, accept) {
  const session = await mongoose.startSession();
  let reporterId = null;
  try {
    await session.withTransaction(async () => {
      const allocation = await PutawayAllocation.findOne({ _id: allocationId,
        status: 'CONFIRMED' }).session(session);
      const index = allocation?.lines.findIndex((line) => id(line.lineId) === id(lineId));
      if (index == null || index < 0) fail('TASK_NOT_FOUND', 'Không tìm thấy báo thiếu', 404);
      const line = allocation.lines[index];
      reporterId = line.shortageReportedByUserId || null;
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
    notifyWorkflow({ actor: user, type: 'STOCK_ALERT',
      users: reporterId ? [{ userId: reporterId, role: 'WAREHOUSE_STAFF', url: ROLE_PAGES.WAREHOUSE_STAFF.putaway }] : [],
      roles: reporterId ? {} : { WAREHOUSE_STAFF: ROLE_PAGES.WAREHOUSE_STAFF.putaway },
      title: `Quản lý đã xử lý báo thiếu: ${task.allocationCode || ''}`.trim(),
      message: accept
        ? `Quản lý kho chấp nhận thiếu ${task.skuCode || ''} ô ${task.locationCode || ''}; dòng này không cần xếp thêm.`
        : `Quản lý kho không chấp nhận báo thiếu ${task.skuCode || ''} ô ${task.locationCode || ''}. Vui lòng tìm và xếp tiếp phần còn lại.`,
      metadata: { allocationId: id(allocationId), lineId: id(lineId), accept: Boolean(accept) } });
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
  publishRealtime('warehouse-putaway:changed', { allocationId: id(allocationId), lineId: id(lineId), reason: 'INCIDENT_REPORTED' });
  notifyWorkflow({ actor: user, type: 'STOCK_ALERT', priority: 'HIGH',
    roles: { WAREHOUSE_MANAGER: '/warehouse/layout' },
    title: 'Sự cố khi xếp kệ',
    message: `${user?.fullName || 'Nhân viên kho'} báo sự cố${barcode ? ` (tem ${barcode})` : ''}: ${reason}`,
    metadata: { incidentId: id(incident._id), allocationId: id(allocationId), lineId: id(lineId) } });
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
  publishRealtime('warehouse-putaway:changed', { allocationId: id(incident.allocationId), lineId: id(incident.lineId), reason: 'INCIDENT_REVIEWED' });
  notifyWorkflow({ actor: user, type: 'STOCK_ALERT',
    users: [{ userId: incident.reportedByUserId, role: 'WAREHOUSE_STAFF', url: ROLE_PAGES.WAREHOUSE_STAFF.putaway }],
    title: 'Quản lý đã xử lý sự cố xếp kệ',
    message: `Sự cố "${incident.reason}" đã được xử lý: ${reviewNote}`,
    metadata: { incidentId: id(incident._id) } });
  return incident;
}

/** Existing labels of units still waiting in the unplaced area for a receipt that has assigned putaway work.
 * Printing never issues new barcodes or changes inventory. */
export async function listUnplacedReceiptLabels(receiptId) {
  const confirmed = await PutawayAllocation.exists({ sourceReceiptId: receiptId, status: 'CONFIRMED' });
  if (!confirmed) throw Object.assign(new Error('Phiếu chưa có hàng được giao xếp'), { code: 'RECEIPT_NOT_ASSIGNED', status: 404 });
  const source = await WarehouseLocation.findOne({ warehouseType: 'FINISHED_GOODS',
    isSystemUnplaced: true, isDeleted: { $ne: true } }).select('_id').lean();
  const units = source ? await ProductUnit.find({ receivingDocumentId: receiptId,
    warehouseId: source._id, inventoryStatus: 'AVAILABLE' })
    .select('barcode skuId').sort({ barcode: 1 })
    .populate({ path: 'skuId', select: 'skuCode color size productId',
      populate: { path: 'productId', select: 'productName' } }).lean() : [];
  return { labels: units.map((unit) => ({
    barcode: unit.barcode, imageUrl: code128DataUrl(unit.barcode),
    skuId: String(unit.skuId?._id || ''), skuCode: unit.skuId?.skuCode || '',
    productName: unit.skuId?.productId?.productName || '',
    color: unit.skuId?.color || '', size: unit.skuId?.size || '',
  })), total: units.length };
}
