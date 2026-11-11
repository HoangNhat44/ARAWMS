/*
 * File: deliveryPlan.service.js
 * Description: Schedules supplier delivery batches and computes receipt progress from accepted stock only.
 */
import mongoose from 'mongoose';
import { isFractionalMaterialUnit } from '../../../common/constants/materialUnits.js';
import CounterSequence from '../../../models/CounterSequence.model.js';
import MaterialInboundPlan from '../../../models/MaterialInboundPlan.model.js';
import MaterialTicket from '../../../models/MaterialTicket.model.js';
import RawMaterial from '../../../models/RawMaterial.model.js';
import Supplier from '../../../models/Supplier.model.js';
import WarehouseLocation from '../../../models/WarehouseLocation.model.js';
import User from '../../../models/User.model.js';
import { canAccessLocation } from '../../../common/services/warehouseAccess.js';

const id = (value) => String(value || '');
const round = (value) => Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;
const fail = (condition, message, code, status = 400) => {
  if (!condition) throw Object.assign(new Error(message), { code, status });
};
const managers = (user) => user?.roles?.some((role) => ['OWNER', 'ADMIN', 'WAREHOUSE_MANAGER'].includes(role));
const accessible = (location, user) => canAccessLocation(location, user);
const day = (value) => value ? new Date(value).toISOString().slice(0, 10) : '';
const dayNumber = (value) => Date.parse(`${day(value)}T00:00:00.000Z`) / 86400000;
const today = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
const quantity = (value, unit) => {
  const amount = Number(value);
  const scale = isFractionalMaterialUnit(unit) ? 1000 : 1;
  fail(value !== '' && value != null && Number.isFinite(amount) && amount > 0 &&
    Math.abs(amount * scale - Math.round(amount * scale)) < 0.000001,
  'Số lượng kế hoạch không hợp lệ theo đơn vị', 'INVALID_PLAN_QUANTITY');
  return round(amount);
};
const active = (batch) => batch.status === 'OPEN' && batch.items.some((item) =>
  round(item.plannedQty - (item.acceptedQty || 0)) > 0.0001);

/** Freezes each receipt's timing against the period in force when stock is confirmed. */
export function evaluateDeliveryTimeliness(receivedAt, start, end) {
  const received = dayNumber(receivedAt);
  const first = dayNumber(start);
  const last = dayNumber(end);
  if (received < first) return { label: 'EARLY', daysDifference: first - received, expectedStart: start, expectedEnd: end };
  if (received > last) return { label: 'LATE', daysDifference: received - last, expectedStart: start, expectedEnd: end };
  return { label: 'ON_TIME', daysDifference: 0, expectedStart: start, expectedEnd: end };
}

/** Loads the assigned batch and its server-owned material lines for draft and confirmation checks. */
export async function getDeliveryBatchContext(planId, batchId, user, session = null) {
  fail(mongoose.isValidObjectId(planId) && mongoose.isValidObjectId(batchId),
    'Cần chọn kế hoạch và đợt giao', 'DELIVERY_BATCH_REQUIRED');
  const plan = await MaterialInboundPlan.findOne({ _id: planId, isDeleted: { $ne: true } }).session(session);
  fail(plan, 'Không tìm thấy kế hoạch nhập', 'PLAN_NOT_FOUND', 404);
  fail(plan.status !== 'CANCELLED', 'Kế hoạch đã hủy', 'PLAN_CLOSED', 409);
  const batch = plan.deliveryBatches.id(batchId);
  fail(batch, 'Đợt giao không thuộc kế hoạch', 'BATCH_NOT_FOUND', 404);
  const warehouse = await WarehouseLocation.findOne({ _id: plan.warehouseLocationId,
    warehouseType: 'RAW_MATERIAL', isDeleted: { $ne: true } }).session(session);
  fail(warehouse && accessible(warehouse, user), 'Kho nhận của kế hoạch không hợp lệ', 'PLAN_WAREHOUSE_FORBIDDEN', 403);
  fail(active(batch), 'Đợt giao đã hoàn tất hoặc đóng', 'BATCH_CLOSED', 409);
  return { plan, batch, warehouse };
}

/** Creates a plan with stable batch/item IDs; an item may appear in several batches. */
export async function createDeliveryPlan(input, user) {
  fail(managers(user), 'Không có quyền lập kế hoạch nhập', 'FORBIDDEN', 403);
  fail(mongoose.isValidObjectId(input.supplierId) && mongoose.isValidObjectId(input.warehouseLocationId),
    'Cần chọn nhà cung cấp và kho nhận', 'INVALID_PLAN_HEADER');
  const [supplier, warehouse] = await Promise.all([
    Supplier.findOne({ _id: input.supplierId, isActive: true, isDeleted: { $ne: true } }).lean(),
    WarehouseLocation.findOne({ _id: input.warehouseLocationId, warehouseType: 'RAW_MATERIAL',
      layoutBin: true, status: 'ACTIVE', isFrozenForStocktake: false, isDeleted: { $ne: true } }).lean(),
  ]);
  fail(supplier && warehouse && accessible(warehouse, user), 'Nhà cung cấp hoặc kho nhận không khả dụng', 'PLAN_HEADER_UNAVAILABLE', 409);
  fail(Array.isArray(input.batches) && input.batches.length > 0 && input.batches.length <= 50,
    'Kế hoạch cần ít nhất một đợt giao', 'INVALID_BATCHES');
  const allIds = input.batches.flatMap((batch) => (batch.items || []).map((item) => id(item.rawMaterialId)));
  fail(allIds.every(mongoose.isValidObjectId), 'Mã nguyên phụ liệu không hợp lệ', 'INVALID_MATERIAL');
  const materials = await RawMaterial.find({ _id: { $in: allIds }, isActive: true, isDeleted: { $ne: true } })
    .select('unit').lean();
  const byMaterial = new Map(materials.map((material) => [id(material._id), material]));
  fail(byMaterial.size === new Set(allIds).size, 'Có nguyên phụ liệu không khả dụng', 'MATERIAL_UNAVAILABLE', 409);
  const totals = new Map();
  const batches = input.batches.map((entry, index) => {
    const expectedStart = new Date(entry.expectedStart);
    const expectedEnd = new Date(entry.expectedEnd);
    fail(!Number.isNaN(expectedStart.getTime()) && !Number.isNaN(expectedEnd.getTime()) &&
      dayNumber(expectedStart) <= dayNumber(expectedEnd), 'Khoảng ngày giao không hợp lệ', 'INVALID_DELIVERY_PERIOD');
    fail(Array.isArray(entry.items) && entry.items.length > 0 && entry.items.length <= 100,
      'Đợt giao cần ít nhất một nguyên phụ liệu', 'INVALID_BATCH_ITEMS');
    const seen = new Set();
    const items = entry.items.map((item) => {
      const materialId = id(item.rawMaterialId);
      fail(byMaterial.has(materialId) && !seen.has(materialId), 'Mặt hàng đợt giao bị trùng hoặc không hợp lệ', 'DUPLICATE_BATCH_ITEM');
      seen.add(materialId);
      const plannedQty = quantity(item.plannedQty, byMaterial.get(materialId).unit);
      totals.set(materialId, round((totals.get(materialId) || 0) + plannedQty));
      return { rawMaterialId: materialId, plannedQty };
    });
    return { batchCode: `Đợt ${index + 1}`, expectedStart, expectedEnd, items };
  });
  const planCode = await CounterSequence.getNextSequence('MATERIAL_DELIVERY_PLAN', 'KHNL', 6);
  return MaterialInboundPlan.create({ planCode, supplierId: supplier._id,
    warehouseLocationId: warehouse._id, scheduledDeliveryDate: batches[0].expectedStart,
    createdByAccountantId: user._id, deliveryNote: String(input.deliveryNote || '').trim().slice(0, 500),
    deliveryBatches: batches,
    expectedItems: [...totals].map(([rawMaterialId, plannedQty]) => ({ rawMaterialId, plannedQty })) });
}

async function viewPlan(plan, user, includeHistory, lookups = null) {
  const legacy = !plan.deliveryBatches?.length;
  const plannedBatches = legacy ? [{ _id: null, batchCode: 'Đợt cũ',
    expectedStart: plan.scheduledDeliveryDate, expectedEnd: plan.scheduledDeliveryDate,
    status: 'OPEN', items: [...plan.expectedItems.reduce((totals, entry) => {
      const materialId = id(entry.rawMaterialId);
      const item = totals.get(materialId) || { _id: entry.rawMaterialId, rawMaterialId: entry.rawMaterialId,
        plannedQty: 0, acceptedQty: 0, rejectedQty: 0 };
      item.plannedQty = round(item.plannedQty + (entry.plannedQty || 0));
      item.acceptedQty = round(item.acceptedQty + (entry.actualVerifiedPassedQty || 0));
      totals.set(materialId, item);
      return totals;
    }, new Map()).values()] }] : plan.deliveryBatches;
  const [supplier, warehouse, creator, materials, receipts] = lookups ? [
    lookups.suppliers.get(id(plan.supplierId)), lookups.warehouses.get(id(plan.warehouseLocationId)),
    lookups.creators.get(id(plan.createdByAccountantId)),
    plannedBatches.flatMap((batch) => batch.items.map((item) => lookups.materials.get(id(item.rawMaterialId)))).filter(Boolean),
    lookups.receipts.get(id(plan._id)) || [],
  ] : await Promise.all([
    Supplier.findById(plan.supplierId).select('supplierCode supplierName').lean(),
    plan.warehouseLocationId ? WarehouseLocation.findById(plan.warehouseLocationId).select('locationCode zoneCode').lean() : null,
    User.findById(plan.createdByAccountantId).select('fullName').lean(),
    RawMaterial.find({ _id: { $in: plannedBatches.flatMap((batch) => batch.items.map((item) => item.rawMaterialId)) } })
      .select('materialCode materialName materialType color unit widthCm requiresWeightKg').lean(),
    MaterialTicket.find({ inboundPlanId: plan._id, deliveryBatchId: { $exists: true },
      isDeleted: { $ne: true } }).select('ticketCode deliveryBatchId receivedAt receiptLines.rawMaterialId receiptLines.actualQty receiptLines.acceptedQty receiptLines.rejectedQty status deliveryTimeliness')
      .sort({ receivedAt: 1, createdAt: 1 }).lean(),
  ]);
  fail(legacy || warehouse && accessible(warehouse, user), 'Không có quyền xem kho này', 'PLAN_WAREHOUSE_FORBIDDEN', 403);
  const byMaterial = new Map(materials.map((item) => [id(item._id), item]));
  const now = today();
  const batches = plannedBatches.map((batch) => {
    const lines = batch.items.map((item) => ({ id: id(item._id), rawMaterialId: id(item.rawMaterialId),
      material: byMaterial.get(id(item.rawMaterialId)), plannedQty: item.plannedQty,
      acceptedQty: item.acceptedQty || 0, rejectedQty: item.rejectedQty || 0,
      remainingQty: Math.max(0, round(item.plannedQty - (item.acceptedQty || 0))) }));
    const remaining = lines.some((line) => line.remainingQty > 0.0001);
    const history = receipts.filter((receipt) => id(receipt.deliveryBatchId) === id(batch._id));
    const confirmed = history.filter((receipt) => receipt.status === 'COMPLETED');
    const progress = batch.status === 'CANCELLED' ? 'CANCELLED' : batch.status === 'CLOSED_SHORT' ? 'CLOSED_SHORT' :
      !remaining ? 'RECEIVED_FULL' : confirmed.length || lines.some((line) => line.acceptedQty > 0 || line.rejectedQty > 0)
        ? 'IN_PROGRESS' : 'NOT_RECEIVED';
    const deadline = progress === 'RECEIVED_FULL' ? confirmed.length &&
      confirmed.at(-1).deliveryTimeliness?.label === 'LATE'
      ? { label: 'COMPLETED_LATE', daysDifference: confirmed.at(-1).deliveryTimeliness.daysDifference }
      : { label: 'COMPLETED' } : progress === 'CLOSED_SHORT' || progress === 'CANCELLED'
      ? { label: progress } : now < day(batch.expectedStart) ? { label: 'UPCOMING' } :
        now > day(batch.expectedEnd) ? { label: 'OVERDUE' } : { label: 'WITHIN_WINDOW' };
    return { id: id(batch._id), batchCode: batch.batchCode, expectedStart: batch.expectedStart,
      expectedEnd: batch.expectedEnd, status: batch.status, progress, deadline, lines,
      history: includeHistory ? history : [],
      closedReason: batch.closedReason, closedAt: batch.closedAt };
  });
  const progress = batches.every((batch) => batch.progress === 'RECEIVED_FULL') ? 'RECEIVED_FULL' :
    batches.some((batch) => batch.progress === 'IN_PROGRESS' || batch.progress === 'RECEIVED_FULL') ? 'IN_PROGRESS' :
      batches.every((batch) => batch.progress === 'CANCELLED') ? 'CANCELLED' :
        batches.some((batch) => batch.progress === 'CLOSED_SHORT') ? 'CLOSED_SHORT' : 'NOT_RECEIVED';
  return { id: id(plan._id), planCode: plan.planCode, supplier, warehouse, creator, needsSetup: legacy,
    legacyStatus: legacy ? plan.status : undefined,
    deliveryNote: plan.deliveryNote || '', version: plan.deliveryVersion || 0, progress,
    batches, history: plan.deliveryHistory || [] };
}

/** Lists plans independently of receipt drafts and calculates deadline labels per batch. */
export async function listDeliveryPlans(query, user) {
  const plans = await MaterialInboundPlan.find({ isDeleted: { $ne: true } })
    .sort({ createdAt: -1 }).limit(100).lean();
  if (!plans.length) return [];
  const materialIds = plans.flatMap((plan) => plan.deliveryBatches?.length
    ? plan.deliveryBatches.flatMap((batch) => batch.items.map((item) => item.rawMaterialId))
    : plan.expectedItems.map((item) => item.rawMaterialId));
  const [suppliers, warehouses, creators, materials, receipts] = await Promise.all([
    Supplier.find({ _id: { $in: plans.map((plan) => plan.supplierId) } })
      .select('supplierCode supplierName').lean(),
    WarehouseLocation.find({ _id: { $in: plans.map((plan) => plan.warehouseLocationId).filter(Boolean) } })
      .select('locationCode zoneCode').lean(),
    User.find({ _id: { $in: plans.map((plan) => plan.createdByAccountantId) } })
      .select('fullName').lean(),
    RawMaterial.find({ _id: { $in: materialIds } })
      .select('materialCode materialName materialType color unit widthCm requiresWeightKg').lean(),
    MaterialTicket.find({ inboundPlanId: { $in: plans.filter((plan) => plan.deliveryBatches?.length)
      .map((plan) => plan._id) }, deliveryBatchId: { $exists: true }, isDeleted: { $ne: true } })
      .select('ticketCode inboundPlanId deliveryBatchId receivedAt receiptLines.rawMaterialId receiptLines.actualQty receiptLines.acceptedQty receiptLines.rejectedQty status deliveryTimeliness')
      .sort({ receivedAt: 1, createdAt: 1 }).lean(),
  ]);
  const lookup = (rows) => new Map(rows.map((row) => [id(row._id), row]));
  const byPlan = new Map();
  for (const receipt of receipts) {
    const key = id(receipt.inboundPlanId);
    byPlan.set(key, [...(byPlan.get(key) || []), receipt]);
  }
  const lookups = { suppliers: lookup(suppliers), warehouses: lookup(warehouses),
    creators: lookup(creators), materials: lookup(materials), receipts: byPlan };
  const views = (await Promise.all(plans.map(async (plan) => {
    try { return await viewPlan(plan, user, false, lookups); }
    catch (error) { if (error.code === 'PLAN_WAREHOUSE_FORBIDDEN') return null; throw error; }
  }))).filter(Boolean);
  const search = String(query.search || '').trim().toLocaleLowerCase('vi');
  return views.filter((plan) => (!query.warehouseId || plan.warehouse?._id && id(plan.warehouse._id) === query.warehouseId) &&
    (!query.progress || plan.progress === query.progress) &&
    (!query.deadline || plan.batches.some((batch) => batch.deadline.label === query.deadline)) &&
    (!query.from || plan.batches.some((batch) => day(batch.expectedEnd) >= query.from)) &&
    (!query.to || plan.batches.some((batch) => day(batch.expectedStart) <= query.to)) &&
    (!search || [plan.planCode, plan.supplier?.supplierName,
      ...plan.batches.flatMap((batch) => batch.lines.map((line) => line.material?.materialName))]
      .some((value) => String(value || '').toLocaleLowerCase('vi').includes(search))));
}

/** Returns one plan with separate receipt history for every delivery batch. */
export async function getDeliveryPlan(planId, user) {
  fail(mongoose.isValidObjectId(planId), 'Mã kế hoạch không hợp lệ', 'INVALID_PLAN');
  const plan = await MaterialInboundPlan.findOne({ _id: planId, isDeleted: { $ne: true } }).lean();
  fail(plan, 'Không tìm thấy kế hoạch giao hàng', 'PLAN_NOT_FOUND', 404);
  return viewPlan(plan, user, true);
}

/** Assigns one explicit warehouse and delivery window to an old plan while keeping its original totals and audit fields. */
export async function setupLegacyDeliveryPlan(planId, input, user) {
  fail(managers(user), 'Không có quyền thiết lập kế hoạch cũ', 'FORBIDDEN', 403);
  fail(mongoose.isValidObjectId(planId) && mongoose.isValidObjectId(input.warehouseLocationId),
    'Kế hoạch hoặc kho nhận không hợp lệ', 'INVALID_LEGACY_SETUP');
  const plan = await MaterialInboundPlan.findOne({ _id: planId, isDeleted: { $ne: true } });
  fail(plan, 'Không tìm thấy kế hoạch nhập', 'PLAN_NOT_FOUND', 404);
  fail(!plan.deliveryBatches.length, 'Kế hoạch đã có đợt giao', 'PLAN_ALREADY_SETUP', 409);
  fail(Number(input.version) === plan.deliveryVersion,
    'Kế hoạch đã thay đổi; hãy tải lại', 'VERSION_CONFLICT', 409);
  const warehouse = await WarehouseLocation.findOne({ _id: input.warehouseLocationId,
    warehouseType: 'RAW_MATERIAL', layoutBin: true, status: 'ACTIVE', isFrozenForStocktake: false,
    isDeleted: { $ne: true } }).lean();
  fail(warehouse && accessible(warehouse, user), 'Kho nhận không khả dụng', 'PLAN_WAREHOUSE_FORBIDDEN', 403);
  const start = new Date(input.expectedStart || plan.scheduledDeliveryDate);
  const end = new Date(input.expectedEnd || plan.scheduledDeliveryDate);
  fail(!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && dayNumber(start) <= dayNumber(end),
    'Khoảng ngày giao không hợp lệ', 'INVALID_DELIVERY_PERIOD');
  const totals = new Map();
  for (const entry of plan.expectedItems) {
    const materialId = id(entry.rawMaterialId);
    const item = totals.get(materialId) || { rawMaterialId: entry.rawMaterialId, plannedQty: 0,
      acceptedQty: 0, rejectedQty: 0 };
    item.plannedQty = round(item.plannedQty + (entry.plannedQty || 0));
    item.acceptedQty = round(item.acceptedQty + (entry.actualVerifiedPassedQty || 0));
    totals.set(materialId, item);
  }
  fail(totals.size > 0 && [...totals.values()].every((item) => item.plannedQty > 0 &&
    item.acceptedQty >= 0 && item.acceptedQty <= item.plannedQty),
  'Số lượng kế hoạch cũ cần được kiểm tra trước khi thiết lập', 'INVALID_LEGACY_TOTALS', 409);
  const materialCount = await RawMaterial.countDocuments({ _id: { $in: [...totals.keys()] },
    isActive: true, isDeleted: { $ne: true } });
  fail(materialCount === totals.size, 'Có nguyên phụ liệu cũ không còn hoạt động', 'MATERIAL_UNAVAILABLE', 409);
  const updated = await MaterialInboundPlan.updateOne({ _id: plan._id, deliveryVersion: plan.deliveryVersion,
    'deliveryBatches.0': { $exists: false } }, { $set: { warehouseLocationId: warehouse._id,
    deliveryBatches: [{ batchCode: 'Đợt 1', expectedStart: start, expectedEnd: end,
      items: [...totals.values()] }] }, $inc: { deliveryVersion: 1 },
  $push: { deliveryHistory: { changeType: 'LEGACY_SETUP', oldStart: plan.scheduledDeliveryDate,
    newStart: start, newEnd: end, reason: 'Thiết lập kế hoạch cũ để nhận hàng theo đợt',
    changedByUserId: user._id, changedAt: new Date(), version: plan.deliveryVersion + 1 } } });
  fail(updated.matchedCount === 1, 'Kế hoạch đã được thiết lập; hãy tải lại', 'VERSION_CONFLICT', 409);
  return getDeliveryPlan(planId, user);
}

/** A manager may close a short batch only with an explicit reason; stock stays unchanged. */
export async function closeDeliveryBatch(planId, batchId, input, user) {
  fail(managers(user), 'Không có quyền đóng đợt giao', 'FORBIDDEN', 403);
  const { plan, batch } = await getDeliveryBatchContext(planId, batchId, user);
  const reason = String(input.reason || '').trim();
  fail(reason.length >= 3 && reason.length <= 500, 'Cần ghi lý do đóng thiếu', 'CLOSE_REASON_REQUIRED');
  fail(Number(input.version) === plan.deliveryVersion, 'Kế hoạch đã thay đổi; hãy tải lại', 'VERSION_CONFLICT', 409);
  const updated = await MaterialInboundPlan.updateOne({ _id: plan._id, deliveryVersion: plan.deliveryVersion,
    'deliveryBatches._id': batch._id }, { $set: { 'deliveryBatches.$.status': 'CLOSED_SHORT',
    'deliveryBatches.$.closedReason': reason, 'deliveryBatches.$.closedAt': new Date(),
    'deliveryBatches.$.closedByUserId': user._id }, $inc: { deliveryVersion: 1 } });
  fail(updated.matchedCount === 1, 'Kế hoạch đã thay đổi; hãy tải lại', 'VERSION_CONFLICT', 409);
  return getDeliveryPlan(planId, user);
}

/** Cancels an untouched batch with a reason; a partly received batch must be closed short instead. */
export async function cancelDeliveryBatch(planId, batchId, input, user) {
  fail(managers(user), 'Không có quyền hủy đợt giao', 'FORBIDDEN', 403);
  const { plan, batch } = await getDeliveryBatchContext(planId, batchId, user);
  fail(batch.items.every((item) => !item.acceptedQty && !item.rejectedQty),
    'Đợt đã nhận hàng; hãy đóng thiếu thay vì hủy', 'BATCH_HAS_RECEIPTS', 409);
  const reason = String(input.reason || '').trim();
  fail(reason.length >= 3 && reason.length <= 500, 'Cần ghi lý do hủy đợt', 'CANCEL_REASON_REQUIRED');
  fail(Number(input.version) === plan.deliveryVersion, 'Kế hoạch đã thay đổi; hãy tải lại', 'VERSION_CONFLICT', 409);
  const updated = await MaterialInboundPlan.updateOne({ _id: plan._id, deliveryVersion: plan.deliveryVersion,
    'deliveryBatches._id': batch._id }, { $set: { 'deliveryBatches.$.status': 'CANCELLED',
    'deliveryBatches.$.closedReason': reason, 'deliveryBatches.$.closedAt': new Date(),
    'deliveryBatches.$.closedByUserId': user._id }, $inc: { deliveryVersion: 1 } });
  fail(updated.matchedCount === 1, 'Kế hoạch đã thay đổi; hãy tải lại', 'VERSION_CONFLICT', 409);
  return getDeliveryPlan(planId, user);
}

/** Revising a window records the old dates; already confirmed receipts retain their timing snapshot. */
export async function reviseDeliveryWindow(planId, batchId, input, user) {
  fail(managers(user), 'Không có quyền sửa lịch giao', 'FORBIDDEN', 403);
  const { plan, batch } = await getDeliveryBatchContext(planId, batchId, user);
  const start = new Date(input.expectedStart);
  const end = new Date(input.expectedEnd);
  const reason = String(input.reason || '').trim();
  fail(!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && dayNumber(start) <= dayNumber(end),
    'Khoảng ngày giao không hợp lệ', 'INVALID_DELIVERY_PERIOD');
  fail(reason.length >= 3 && reason.length <= 500, 'Cần lý do sửa lịch giao', 'REVISION_REASON_REQUIRED');
  fail(Number(input.version) === plan.deliveryVersion, 'Kế hoạch đã thay đổi; hãy tải lại', 'VERSION_CONFLICT', 409);
  const updated = await MaterialInboundPlan.updateOne({ _id: plan._id, deliveryVersion: plan.deliveryVersion,
    'deliveryBatches._id': batch._id }, { $set: { 'deliveryBatches.$.expectedStart': start,
    'deliveryBatches.$.expectedEnd': end }, $inc: { deliveryVersion: 1 },
  $push: { deliveryHistory: { batchId: batch._id, changeType: 'WINDOW', oldStart: batch.expectedStart, oldEnd: batch.expectedEnd,
    newStart: start, newEnd: end, reason, changedByUserId: user._id,
    changedAt: new Date(), version: plan.deliveryVersion + 1 } } });
  fail(updated.matchedCount === 1, 'Kế hoạch đã thay đổi; hãy tải lại', 'VERSION_CONFLICT', 409);
  return getDeliveryPlan(planId, user);
}

/** Adjusts planned accepted quantities or adds a material, retaining line IDs and a reason after receipts exist. */
export async function reviseDeliveryItems(planId, batchId, input, user) {
  fail(managers(user), 'Không có quyền sửa mặt hàng kế hoạch', 'FORBIDDEN', 403);
  const { plan, batch } = await getDeliveryBatchContext(planId, batchId, user);
  const reason = String(input.reason || '').trim();
  fail(reason.length >= 3 && reason.length <= 500, 'Cần lý do điều chỉnh kế hoạch', 'REVISION_REASON_REQUIRED');
  fail(Number(input.version) === plan.deliveryVersion, 'Kế hoạch đã thay đổi; hãy tải lại', 'VERSION_CONFLICT', 409);
  fail(Array.isArray(input.items) && input.items.length >= batch.items.length && input.items.length <= 100,
    'Danh sách mặt hàng điều chỉnh không hợp lệ', 'INVALID_BATCH_ITEMS');
  const ids = input.items.map((item) => id(item.rawMaterialId));
  fail(ids.every(mongoose.isValidObjectId) && new Set(ids).size === ids.length,
    'Mặt hàng bị trùng hoặc không hợp lệ', 'DUPLICATE_BATCH_ITEM');
  const materials = await RawMaterial.find({ _id: { $in: ids }, isActive: true, isDeleted: { $ne: true } })
    .select('unit').lean();
  const byMaterial = new Map(materials.map((material) => [id(material._id), material]));
  fail(byMaterial.size === ids.length, 'Có nguyên phụ liệu không còn hoạt động', 'MATERIAL_UNAVAILABLE', 409);
  const existing = new Map(batch.items.map((item) => [id(item.rawMaterialId), item]));
  fail([...existing.keys()].every((materialId) => ids.includes(materialId)),
    'Không thể bỏ mặt hàng khỏi đợt; hãy giữ dòng với lượng phù hợp', 'REMOVE_PLAN_ITEM_FORBIDDEN');
  const revised = input.items.map((item) => {
    const materialId = id(item.rawMaterialId);
    const plannedQty = quantity(item.plannedQty, byMaterial.get(materialId).unit);
    const old = existing.get(materialId);
    fail(!old || plannedQty >= (old.acceptedQty || 0) - .0001,
      'Lượng kế hoạch không được thấp hơn lượng đạt đã nhập', 'PLAN_BELOW_RECEIVED', 409);
    return { _id: old?._id || new mongoose.Types.ObjectId(), rawMaterialId: materialId, plannedQty,
      acceptedQty: old?.acceptedQty || 0, rejectedQty: old?.rejectedQty || 0 };
  });
  const batchIndex = plan.deliveryBatches.findIndex((entry) => id(entry._id) === id(batch._id));
  const totals = new Map();
  plan.deliveryBatches.forEach((entry, index) => (index === batchIndex ? revised : entry.items).forEach((item) => {
    const materialId = id(item.rawMaterialId);
    totals.set(materialId, round((totals.get(materialId) || 0) + item.plannedQty));
  }));
  const updated = await MaterialInboundPlan.updateOne({ _id: plan._id, deliveryVersion: plan.deliveryVersion,
    [`deliveryBatches.${batchIndex}.status`]: 'OPEN' }, { $set: {
    [`deliveryBatches.${batchIndex}.items`]: revised,
    expectedItems: [...totals].map(([rawMaterialId, plannedQty]) => ({ rawMaterialId, plannedQty })),
  }, $inc: { deliveryVersion: 1 }, $push: { deliveryHistory: {
    batchId: batch._id, changeType: 'ITEMS', reason, changedByUserId: user._id,
    changedAt: new Date(), version: plan.deliveryVersion + 1,
    oldItems: batch.items.map((item) => ({ rawMaterialId: item.rawMaterialId, plannedQty: item.plannedQty })),
    newItems: revised.map((item) => ({ rawMaterialId: item.rawMaterialId, plannedQty: item.plannedQty })),
  } } });
  fail(updated.matchedCount === 1, 'Kế hoạch đã thay đổi; hãy tải lại', 'VERSION_CONFLICT', 409);
  return getDeliveryPlan(planId, user);
}

/** Commits only accepted quantities, with one versioned plan write inside the receipt transaction. */
export async function commitDeliveryReceipt(receipt, user, session) {
  const { plan, batch, warehouse } = await getDeliveryBatchContext(receipt.inboundPlanId, receipt.deliveryBatchId, user, session);
  fail(id(receipt.supplierId) === id(plan.supplierId) && id(receipt.receivingLocationId) === id(warehouse._id),
    'Phiếu không khớp nhà cung cấp hoặc kho của kế hoạch', 'PLAN_RECEIPT_MISMATCH', 409);
  const increments = { deliveryVersion: 1 };
  for (const line of receipt.receiptLines) {
    const index = batch.items.findIndex((item) => id(item.rawMaterialId) === id(line.rawMaterialId) &&
      id(item._id) === id(line.deliveryBatchItemId));
    fail(index >= 0, 'Mặt hàng không thuộc đợt giao', 'UNPLANNED_MATERIAL', 409);
    const item = batch.items[index];
    fail(line.acceptedQty <= round(item.plannedQty - (item.acceptedQty || 0)) + .0001,
      `Đợt ${batch.batchCode} không còn đủ số lượng cần nhận đạt`, 'BATCH_EXCEEDED', 409);
    const batchIndex = plan.deliveryBatches.findIndex((entry) => id(entry._id) === id(batch._id));
    increments[`deliveryBatches.${batchIndex}.items.${index}.acceptedQty`] = line.acceptedQty;
    increments[`deliveryBatches.${batchIndex}.items.${index}.rejectedQty`] = line.rejectedQty;
  }
  const updated = await MaterialInboundPlan.updateOne({ _id: plan._id, deliveryVersion: plan.deliveryVersion,
    [`deliveryBatches.${plan.deliveryBatches.findIndex((entry) => id(entry._id) === id(batch._id))}.status`]: 'OPEN' },
  { $inc: increments }, { session });
  fail(updated.matchedCount === 1, 'Đợt giao đã thay đổi; hãy kiểm tra lại lượng còn thiếu', 'BATCH_CONFLICT', 409);
  receipt.deliveryTimeliness = evaluateDeliveryTimeliness(receipt.receivedAt, batch.expectedStart, batch.expectedEnd);
}
