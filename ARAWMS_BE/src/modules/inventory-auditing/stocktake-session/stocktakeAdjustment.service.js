/*
 * File: stocktakeAdjustment.service.js
 * Author: Duy Anh
 * Date: 2026-11-20
 * Description: Điều chỉnh tồn kho theo báo cáo kiểm kê đã duyệt (APPROVED_PENDING_ADJUSTMENT -> APPROVED_COMPLETED).
 *  - Thành phẩm có barcode từng chiếc: chiếc báo hỏng hoặc không đếm thấy bị loại khỏi kho (STOCKTAKE_WRITE_OFF):
 *    trừ tồn SKU, tồn lô, sức chứa ô và ghi phiếu STOCKTAKE_ADJUSTMENT. Barcode vẫn tra cứu được tới lúc bị loại.
 *  - Lô phụ liệu (đếm theo số lượng): chỉnh số lượng lô tại ô và tồn nguyên phụ liệu theo số đếm (trừ phần hỏng).
 *  - Còn lại (cuộn vải, chiếc hàng nằm sai ô, mã không xác định): đánh dấu cần xử lý thủ công, không tự đổi tồn.
 */
import { randomUUID } from 'node:crypto';
import StocktakeSession from '../../../models/StocktakeSession.model.js';
import StocktakeRecord from '../../../models/StocktakeRecord.model.js';
import ProductUnit from '../../../models/ProductUnit.js';
import Sku from '../../../models/Sku.model.js';
import FinishedGoodsBatch from '../../../models/FinishedGoodsBatch.model.js';
import WarehouseLocation from '../../../models/WarehouseLocation.model.js';
import MaterialStockLot from '../../../models/MaterialStockLot.model.js';
import RawMaterial from '../../../models/RawMaterial.model.js';
import InventoryTransaction from '../../../models/InventoryTransaction.model.js';
import { objectFields, versionField, objectId } from '../../../common/utils/ownerValidation.js';
import { ownerTransaction, ownerAudit } from '../../../common/utils/ownerOperation.js';
import { httpError } from '../../../common/utils/httpError.js';

const active = { isDeleted: { $ne: true } };
const REASONS = ['DAMAGED', 'LOST'];
export const REASON_LABEL = { DAMAGED: 'Hỏng khi kiểm kê', LOST: 'Thất lạc khi kiểm kê' };
const id = (value) => String(value || '');

/**
 * Việc cần làm với một dòng kiểm kê. unit = ProductUnit cùng barcode (nếu có).
 * kind: WRITE_OFF | QTY_ADJUST | MANUAL | NONE; reasonFixed = lý do không cho đổi (hàng đã báo hỏng).
 */
export function planLine(record, unit) {
  const actual = Number(record.actualScannedQty) || 0;
  const system = Number(record.systemSnapshotQty) || 0;
  const damaged = Math.min(Number(record.damagedQty) || 0, actual);
  const counted = Boolean(record.scannedAt);
  if (record.itemType === 'SKU_BATCH' && unit) {
    if (damaged > 0) return { kind: 'WRITE_OFF', quantity: 1, defaultReason: 'DAMAGED', reasonFixed: true };
    if (system >= 1 && (!counted || actual === 0)) return { kind: 'WRITE_OFF', quantity: 1, defaultReason: 'LOST' };
    if (system === 0 && actual >= 1) return { kind: 'MANUAL', note: 'Chiếc hàng đếm thấy ở ô này nhưng hệ thống ghi ở nơi khác; cần chuyển vị trí bằng chức năng xếp kệ.' };
    return { kind: 'NONE' };
  }
  if (record.itemType === 'RAW_MATERIAL') {
    const delta = (counted ? actual - damaged : 0) - system;
    if (!delta) return { kind: 'NONE' };
    return { kind: 'QTY_ADJUST', quantity: delta, defaultReason: delta < 0 ? (damaged > 0 ? 'DAMAGED' : 'LOST') : undefined };
  }
  if (actual !== system || damaged > 0 || !counted) {
    return { kind: 'MANUAL', note: record.itemType === 'FABRIC_ROLL' ? 'Cuộn vải cần xử lý thủ công (đo lại / chuyển kho lỗi).' : 'Mã không xác định được chiếc hàng; cần xử lý thủ công.' };
  }
  return { kind: 'NONE' };
}

/** Plan cho mọi dòng của phiên, dùng cho cả trang chi tiết lẫn lúc điều chỉnh. */
export async function planSession(records, session = null) {
  const barcodes = records.filter((r) => r.itemType === 'SKU_BATCH').map((r) => r.barcode);
  const units = barcodes.length ? await ProductUnit.find({ barcode: { $in: barcodes } }).session(session) : [];
  const unitByBarcode = new Map(units.map((unit) => [unit.barcode, unit]));
  return records.map((record) => ({ record, unit: unitByBarcode.get(record.barcode), plan: planLine(record, unitByBarcode.get(record.barcode)) }));
}

const validateInput = (body = {}) => {
  objectFields(body, ['expectedVersion', 'lines']);
  if (body.lines !== undefined && !Array.isArray(body.lines)) throw httpError(400, 'Danh sách dòng điều chỉnh không hợp lệ.');
  const lines = new Map();
  for (const line of body.lines || []) {
    objectFields(line, ['recordId', 'reason', 'note']);
    objectId(line.recordId);
    if (line.reason !== undefined && !REASONS.includes(line.reason)) throw httpError(400, 'Lý do điều chỉnh không hợp lệ.');
    if (line.note !== undefined && (typeof line.note !== 'string' || line.note.length > 300)) throw httpError(400, 'Ghi chú mỗi dòng tối đa 300 ký tự.');
    lines.set(line.recordId, { reason: line.reason, note: line.note?.trim() || '' });
  }
  return { expectedVersion: versionField(body.expectedVersion), lines };
};

async function writeOffUnit({ req, session, stocktake, record, unit, reason, note, now }) {
  // Chiếc hàng đổi trạng thái/vị trí sau khi kiểm (vd vừa đóng đơn) thì không tự trừ nữa.
  if (unit.inventoryStatus !== 'AVAILABLE' || id(unit.warehouseId) !== id(record.locationId)) {
    return { action: 'MANUAL', note: 'Trạng thái hoặc vị trí chiếc hàng đã thay đổi sau khi kiểm; không tự điều chỉnh.' };
  }
  const sku = await Sku.findOneAndUpdate({ _id: unit.skuId, onHandQty: { $gte: 1 } }, { $inc: { onHandQty: -1 } }, { new: true, session });
  if (!sku) throw httpError(409, `Tồn SKU của ${unit.barcode} không đủ để trừ. Cần đối soát trước khi điều chỉnh.`);
  if (unit.batchId) {
    await FinishedGoodsBatch.updateOne({ _id: unit.batchId, currentOnHandQty: { $gte: 1 } }, { $inc: { currentOnHandQty: -1 } }, { session });
  }
  await WarehouseLocation.updateOne({ _id: unit.warehouseId, currentOccupancy: { $gte: 1 } }, { $inc: { currentOccupancy: -1 } }, { session });
  unit.inventoryStatus = 'STOCKTAKE_WRITE_OFF';
  unit.stocktakeWriteOff = { reason, note, sessionId: stocktake._id, sessionCode: stocktake.sessionCode,
    locationId: record.locationId, countedAt: record.scannedAt, at: now, byUserId: req.user._id };
  await unit.save({ session });
  await InventoryTransaction.create([{ transactionCode: `STK-${randomUUID()}`, warehouseType: 'FINISHED_GOODS', itemType: 'FINISHED_SKU',
    skuId: unit.skuId, locationId: record.locationId, transactionType: 'STOCKTAKE_ADJUSTMENT',
    referenceModel: 'StocktakeSession', referenceId: stocktake._id, quantityChange: -1,
    onHandBefore: sku.onHandQty + 1, onHandAfter: sku.onHandQty, unitCostSnapshot: sku.unitCogs || 0,
    totalValueSnapshot: sku.unitCogs || 0, performedByUserId: req.user._id,
    note: `${REASON_LABEL[reason]} · ${unit.barcode}${note ? ` · ${note}` : ''}`.slice(0, 500) }], { session });
  return { action: 'WRITE_OFF', reason, quantity: -1, note };
}

async function adjustLot({ req, session, stocktake, record, delta, reason, note }) {
  const lot = await MaterialStockLot.findOne({ lotBarcode: record.barcode, ...active }).session(session);
  const allocation = lot?.allocations.find((item) => id(item.locationId) === id(record.locationId));
  if (!lot || !allocation || lot.currentQty + delta < 0) return { action: 'MANUAL', note: 'Không khớp được lô phụ liệu tại ô này; cần xử lý thủ công.' };
  allocation.quantity = Math.max(0, allocation.quantity + delta);
  if (allocation.putawayQty) allocation.putawayQty = Math.max(0, allocation.putawayQty + delta);
  lot.currentQty += delta;
  await lot.save({ session });
  const material = await RawMaterial.findOneAndUpdate({ _id: lot.rawMaterialId, onHandQty: { $gte: Math.max(0, -delta) } },
    { $inc: { onHandQty: delta } }, { new: true, session });
  if (!material) throw httpError(409, `Tồn nguyên phụ liệu của lô ${lot.lotBarcode} không đủ để trừ. Cần đối soát trước khi điều chỉnh.`);
  await InventoryTransaction.create([{ transactionCode: `STK-${randomUUID()}`, warehouseType: 'RAW_MATERIAL', itemType: 'RAW_MATERIAL',
    rawMaterialId: lot.rawMaterialId, materialStockLotId: lot._id, locationId: record.locationId, transactionType: 'STOCKTAKE_ADJUSTMENT',
    referenceModel: 'StocktakeSession', referenceId: stocktake._id, quantityChange: delta,
    onHandBefore: material.onHandQty - delta, onHandAfter: material.onHandQty, unitCostSnapshot: material.unitCost || 0,
    totalValueSnapshot: Math.abs(delta) * (material.unitCost || 0), performedByUserId: req.user._id,
    note: `${delta < 0 ? REASON_LABEL[reason] : 'Thừa khi kiểm kê'} · lô ${lot.lotBarcode}${note ? ` · ${note}` : ''}`.slice(0, 500) }], { session });
  return { action: 'QTY_ADJUST', reason: delta < 0 ? reason : undefined, quantity: delta, note };
}

export async function adjustStocktakeInventory(req) {
  objectId(req.params.id);
  const input = validateInput(req.body || {});
  return ownerTransaction(async (session) => {
    const stocktake = await StocktakeSession.findOne({ _id: req.params.id, ...active }).session(session);
    if (!stocktake) throw httpError(404, 'Không tìm thấy phiên kiểm kê.');
    if (stocktake.status !== 'APPROVED_PENDING_ADJUSTMENT') throw httpError(409, 'Chỉ phiên đã duyệt, đang chờ điều chỉnh mới điều chỉnh được tồn kho.');
    if ((stocktake.approvalRevision || 0) !== input.expectedVersion) throw httpError(409, 'Phiên đã thay đổi. Cần tải lại trước khi điều chỉnh.');
    const records = await StocktakeRecord.find({ sessionId: stocktake._id, ...active }).sort({ _id: 1 }).session(session);
    const now = new Date();
    const counts = { writtenOffUnits: 0, quantityAdjustedLines: 0, manualLines: 0 };
    for (const { record, unit, plan } of await planSession(records, session)) {
      const chosen = input.lines.get(id(record._id)) || {};
      const reason = plan.reasonFixed ? plan.defaultReason : chosen.reason || plan.defaultReason;
      const note = chosen.note || record.conditionNote || '';
      let result = { action: plan.kind, note: plan.note };
      if (plan.kind === 'WRITE_OFF') result = await writeOffUnit({ req, session, stocktake, record, unit, reason, note, now });
      if (plan.kind === 'QTY_ADJUST') result = await adjustLot({ req, session, stocktake, record, delta: plan.quantity, reason, note });
      if (result.action === 'WRITE_OFF') counts.writtenOffUnits += 1;
      if (result.action === 'QTY_ADJUST') counts.quantityAdjustedLines += 1;
      if (result.action === 'MANUAL') counts.manualLines += 1;
      record.adjustment = { ...result, adjustedAt: now };
      await record.save({ session });
    }
    const before = { status: stocktake.status };
    stocktake.status = 'APPROVED_COMPLETED';
    stocktake.approvalRevision = input.expectedVersion + 1;
    stocktake.adjustmentInfo = { adjustedByUserId: req.user._id, adjustedAt: now, ...counts };
    await stocktake.save({ session });
    await ownerAudit(req, session, 'Inventory Auditing', 'Stock Adjustment', 'APPLY_STOCKTAKE_ADJUSTMENT',
      { collection: 'stocktake_sessions', id: stocktake._id, code: stocktake.sessionCode }, before,
      { status: stocktake.status, adjustmentInfo: stocktake.adjustmentInfo });
    return { stocktake, ...counts };
  });
}
