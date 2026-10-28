/*
 * File: inboundExecution.service.js
 * Author: Duy Anh
 * Date: 2026-10-26
 * Description: Implements supplier material receipt drafts and confirmation. Validates plan balances, inspection totals, physical rolls and lots, storage allocations, and idempotent inventory updates.
 */
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import MaterialInboundPlan from '../../../models/MaterialInboundPlan.model.js';
import MaterialTicket from '../../../models/MaterialTicket.model.js';
import MaterialStockLot from '../../../models/MaterialStockLot.model.js';
import FabricRoll from '../../../models/FabricRoll.model.js';
import RawMaterial from '../../../models/RawMaterial.model.js';
import Supplier from '../../../models/Supplier.model.js';
import SupplierContract from '../../../models/SupplierContract.model.js';
import WarehouseLocation from '../../../models/WarehouseLocation.model.js';
import InventoryTransaction from '../../../models/InventoryTransaction.model.js';
import User from '../../../models/User.model.js';
import { scheduleBarcodeImages } from '../../../common/services/barcodeImageStorage.js';

const allowedPlanStatuses = ['SCHEDULED', 'IN_INSPECTION', 'VERIFIED_MATCHED', 'DEVIATION_REPORTED'];
const round = (value) => Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;
const same = (a, b) => Math.abs(round(a) - round(b)) < 0.001;
const id = (value) => String(value || '');
const editableReceiptStatuses = ['DRAFT', 'WAITING_QC', 'READY_TO_CONFIRM'];

/** Carries expected business validation failures to the HTTP layer. */
export class ReceiptError extends Error {
  constructor(message, code, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const requireValue = (condition, message, code, status) => {
  if (!condition) throw new ReceiptError(message, code, status);
};

/** Enforces quantity precision by the material's stock unit. */
const quantity = (value, unit, field) => {
  const number = Number(value);
  const precision = ['METER', 'KG'].includes(unit) ? 3 : 0;
  requireValue(value !== '' && value != null && Number.isFinite(number) && number >= 0 &&
    Math.abs(number * (10 ** precision) - Math.round(number * (10 ** precision))) < 0.000001,
  `${field} không hợp lệ theo đơn vị ${unit}`, 'INVALID_QUANTITY');
  return round(number);
};

/** Restricts assigned warehouse staff to their configured locations when assignments exist. */
const accessible = (location, user) => !user.warehouseIds?.length || user.warehouseIds.some((item) => id(item) === id(location._id));

/** Returns real suppliers and usable receiving/quarantine locations for the form. */
export async function getReceiptOptions(user) {
  const [suppliers, locations] = await Promise.all([
    Supplier.find({ isActive: true, isDeleted: { $ne: true } }).select('supplierCode supplierName').sort({ supplierName: 1 }).lean(),
    WarehouseLocation.find({ warehouseType: { $in: ['RAW_MATERIAL', 'DEFECT_QUARANTINE'] }, status: 'ACTIVE',
      isFrozenForStocktake: false, isDeleted: { $ne: true } }).select('locationCode barcode warehouseType zoneCode rackCode shelfCode maxCapacity currentOccupancy capacityUnit').sort({ zoneCode: 1, rackCode: 1, shelfCode: 1 }).lean(),
  ]);
  return { suppliers, locations: locations.filter((location) => accessible(location, user)) };
}

/** Creates a shelf in the raw-material or defect area for receipt allocations. */
export async function createReceiptLocation(input, user) {
  const locationCode = String(input.locationCode || '').trim().toUpperCase();
  const zoneCode = String(input.zoneCode || '').trim().toUpperCase();
  const rackCode = String(input.rackCode || '').trim().toUpperCase();
  const shelfCode = String(input.shelfCode || '').trim().toUpperCase();
  requireValue([locationCode, zoneCode, rackCode, shelfCode].every((part) => /^[A-Z0-9_-]{1,40}$/.test(part)),
    'Mã vị trí, khu, giá hoặc kệ không hợp lệ', 'INVALID_LOCATION');
  requireValue(['RAW_MATERIAL', 'DEFECT_QUARANTINE'].includes(input.warehouseType), 'Loại khu không hợp lệ', 'INVALID_WAREHOUSE_TYPE');
  requireValue(['METER', 'KG', 'PIECE', 'SPOOL', 'BOX'].includes(input.capacityUnit),
    'Cần chọn đơn vị sức chứa cho kệ', 'CAPACITY_UNIT_REQUIRED');
  const maxCapacity = quantity(input.maxCapacity, input.capacityUnit, 'Sức chứa');
  requireValue(maxCapacity > 0 && maxCapacity <= 100000000, 'Sức chứa không hợp lệ', 'INVALID_CAPACITY');
  const location = await WarehouseLocation.create({ locationCode, barcode: `LOC-${locationCode}`, warehouseType: input.warehouseType,
    zoneCode, rackCode, shelfCode, maxCapacity, capacityUnit: input.capacityUnit });
  if (user.warehouseIds?.length) await User.updateOne({ _id: user._id }, { $addToSet: { warehouseIds: location._id } });
  return location;
}

/** Calculates remaining receipt quantity from committed, approved units in the plan. */
const planLines = async (plan) => {
  const materialIds = [...new Set(plan.expectedItems.map((item) => id(item.rawMaterialId)))];
  const materials = await RawMaterial.find({ _id: { $in: materialIds } })
    .select('materialCode materialName materialType category unit color widthCm gsm isActive isDeleted').lean();
  const byId = new Map(materials.map((material) => [id(material._id), material]));
  return plan.expectedItems.map((item) => {
    const material = byId.get(id(item.rawMaterialId));
    requireValue(material, 'Không tìm thấy nguyên phụ liệu của kế hoạch', 'MATERIAL_UNAVAILABLE', 409);
    return {
      rawMaterialId: id(item.rawMaterialId), material,
      plannedQty: round(item.plannedQty), receivedPassedQty: round(item.actualVerifiedPassedQty || 0),
      remainingQty: Math.max(0, round(item.plannedQty - (item.actualVerifiedPassedQty || 0))),
    };
  });
};

/** Lists plans with a positive remaining quantity for the selected supplier. */
export async function getEligibleInboundPlans(supplierId) {
  requireValue(mongoose.isValidObjectId(supplierId), 'Nhà cung cấp không hợp lệ', 'INVALID_SUPPLIER');
  const plans = await MaterialInboundPlan.find({ supplierId, status: { $in: allowedPlanStatuses }, isDeleted: { $ne: true } })
    .sort({ scheduledDeliveryDate: 1 }).lean();
  const result = [];
  for (const plan of plans) {
    const remaining = plan.expectedItems.some((item) => round(item.plannedQty - (item.actualVerifiedPassedQty || 0)) > 0);
    if (remaining) result.push({ id: id(plan._id), planCode: plan.planCode, contractId: id(plan.contractId),
      scheduledDeliveryDate: plan.scheduledDeliveryDate, status: plan.status });
  }
  return result;
}

/** Returns a plan's actual lines and backend-calculated remaining quantities. */
export async function getInboundPlanDetails(planId, includeDeleted = false) {
  requireValue(mongoose.isValidObjectId(planId), 'Kế hoạch không hợp lệ', 'INVALID_PLAN');
  const plan = await MaterialInboundPlan.findOne({ _id: planId,
    ...(includeDeleted ? {} : { isDeleted: { $ne: true } }) }).lean();
  requireValue(plan, 'Không tìm thấy kế hoạch nhập', 'PLAN_NOT_FOUND', 404);
  const contract = await SupplierContract.findById(plan.contractId).select('contractCode status supplierId').lean();
  return { id: id(plan._id), planCode: plan.planCode, supplierId: id(plan.supplierId),
    contractId: id(plan.contractId), contractCode: contract?.contractCode || '',
    scheduledDeliveryDate: plan.scheduledDeliveryDate, status: plan.status, lines: await planLines(plan) };
}

/** Lists recent supplier receipt drafts and confirmed tickets without creating test data. */
export async function listMaterialReceipts(user) {
  return MaterialTicket.find({ ticketType: 'INBOUND_FROM_PLAN', isDeleted: { $ne: true },
    ...(user.warehouseIds?.length ? { receivingLocationId: { $in: user.warehouseIds } } : {}) })
    .select('ticketCode inboundPlanId supplierId supplierDeliveryCode supplierReturns.status status receiptVersion receivedAt createdAt confirmedAt')
    .sort({ createdAt: -1 }).limit(50).lean();
}

/** Loads one receipt with the source plan used to display and edit its lines. */
export async function getMaterialReceipt(receiptId, user) {
  requireValue(mongoose.isValidObjectId(receiptId), 'Mã phiếu không hợp lệ', 'INVALID_RECEIPT');
  const receipt = await MaterialTicket.findOne({ _id: receiptId,
    ticketType: { $in: ['INBOUND_FROM_PLAN', 'INBOUND_FROM_SUPPLIER'] }, isDeleted: { $ne: true } }).lean();
  requireValue(receipt, 'Không tìm thấy phiếu nhập', 'RECEIPT_NOT_FOUND', 404);
  if (user) requireValue(accessible({ _id: receipt.receivingLocationId }, user), 'Bạn không có quyền xem phiếu này', 'RECEIPT_FORBIDDEN', 403);
  return { receipt, plan: receipt.inboundPlanId ? await getInboundPlanDetails(receipt.inboundPlanId, true) : null };
}

/** Creates a plan-bound draft; the supplier delivery code is unique per supplier. */
export async function createMaterialReceiptDraft(input, user) {
  requireValue(mongoose.isValidObjectId(input.inboundPlanId), 'Cần chọn kế hoạch nhập', 'PLAN_REQUIRED');
  const plan = await getInboundPlanDetails(input.inboundPlanId);
  requireValue(allowedPlanStatuses.includes(plan.status) && plan.lines.some((line) => line.remainingQty > 0),
    'Kế hoạch không còn được phép nhận', 'PLAN_NOT_ELIGIBLE', 409);
  requireValue(plan.lines.every((line) => line.material.isActive && !line.material.isDeleted),
    'Kế hoạch chứa nguyên phụ liệu không còn hoạt động', 'MATERIAL_UNAVAILABLE', 409);
  if (input.replacementForTicketId) {
    requireValue(mongoose.isValidObjectId(input.replacementForTicketId), 'Phiếu trả gốc không hợp lệ', 'INVALID_RETURN_SOURCE');
    const source = await MaterialTicket.findOne({ _id: input.replacementForTicketId,
      ticketType: 'INBOUND_FROM_PLAN', supplierId: plan.supplierId, status: 'COMPLETED',
      'supplierReturns.status': 'RETURNED' }).select('_id').lean();
    requireValue(source, 'Phiếu trả gốc không thuộc NCC hoặc chưa bàn giao hàng trả', 'INVALID_RETURN_SOURCE');
  }
  const receipt = new MaterialTicket({ ticketCode: `NPL-${randomUUID().toUpperCase()}`,
    ticketType: 'INBOUND_FROM_PLAN', inboundPlanId: plan.id, supplierId: plan.supplierId,
    contractId: plan.contractId, replacementForTicketId: input.replacementForTicketId || undefined,
    createdByManagerId: user._id, status: 'DRAFT', receiptVersion: 0 });
  applyDraft(receipt, input, plan, user);
  await receipt.save();
  return receipt;
}

/** Validates the delivery identity, receiving location, and one line per planned material.
 * Accepted amounts cannot exceed the plan remainder; physical roll/lot IDs must be
 * unique before the draft is stored. Material identity always comes from the plan.
 */
function applyDraft(receipt, input, plan, user) {
  const deliveryCode = String(input.supplierDeliveryCode || '').trim().toUpperCase();
  const handoverName = String(input.handoverName || '').trim();
  requireValue(/^[A-Z0-9._/-]{2,80}$/.test(deliveryCode), 'Mã phiếu giao của NCC không hợp lệ', 'INVALID_DELIVERY_CODE');
  requireValue(handoverName.length >= 2 && handoverName.length <= 120, 'Cần nhập người giao', 'INVALID_HANDOVER');
  requireValue(mongoose.isValidObjectId(input.receivingLocationId), 'Cần chọn vị trí kho nhận', 'LOCATION_REQUIRED');
  requireValue(input.receivedAt && !Number.isNaN(new Date(input.receivedAt).getTime()), 'Ngày nhận không hợp lệ', 'INVALID_DATE');
  requireValue(String(input.receiptNote || '').length <= 500, 'Ghi chú quá dài', 'INVALID_NOTE');
  requireValue(Array.isArray(input.receiptLines), 'Thiếu chi tiết kiểm nhận', 'LINES_REQUIRED');
  const byMaterial = new Map(plan.lines.map((line) => [line.rawMaterialId, line]));
  requireValue(byMaterial.size === plan.lines.length, 'Kế hoạch có nguyên phụ liệu trùng mã; cần xử lý trước khi nhập', 'DUPLICATE_PLAN_MATERIAL', 409);
  requireValue(input.receiptLines.length === plan.lines.length, 'Chi tiết không khớp kế hoạch', 'LINES_MISMATCH');
  const seen = new Set();
  const seenObjects = new Set();
  receipt.receiptLines = input.receiptLines.map((line) => {
    const planned = byMaterial.get(id(line.rawMaterialId));
    requireValue(planned && !seen.has(planned.rawMaterialId), 'Chỉ được nhập nguyên phụ liệu trong kế hoạch', 'UNPLANNED_MATERIAL');
    seen.add(planned.rawMaterialId);
    const unit = planned.material.unit;
    const acceptedQty = quantity(line.acceptedQty ?? 0, unit, 'Số lượng đạt');
    const actualQty = quantity(line.actualQty ?? 0, unit, 'Thực nhận');
    const rejectedQty = quantity(line.rejectedQty ?? 0, unit, 'Không đạt');
    const pendingQty = quantity(line.pendingQty ?? 0, unit, 'Chờ kiểm tra');
    requireValue(acceptedQty <= planned.remainingQty + 0.0001, 'Số lượng đạt vượt kế hoạch còn lại', 'PLAN_EXCEEDED', 409);
    requireValue(actualQty <= planned.remainingQty + 0.0001, 'Thực nhận vượt kế hoạch còn lại', 'PLAN_EXCEEDED', 409);
    requireValue(same(actualQty, acceptedQty + rejectedQty + pendingQty),
      'Thực nhận phải bằng đạt + không đạt + chờ kiểm tra', 'INSPECTION_TOTAL_MISMATCH');
    const rolls = Array.isArray(line.rolls) ? line.rolls : [];
    const lots = Array.isArray(line.lots) ? line.lots : [];
    requireValue(rolls.length <= 500 && lots.length <= 500, 'Quá nhiều cây hoặc lô trên một dòng', 'TOO_MANY_OBJECTS');
    const clientIds = [...rolls, ...lots].map((item) => String(item.clientLineId || '').trim());
    requireValue(clientIds.every((key) => /^[A-Za-z0-9_-]{1,80}$/.test(key) && !seenObjects.has(key)) &&
      new Set(clientIds).size === clientIds.length,
      'Mỗi cây hoặc lô cần mã dòng riêng, không trùng', 'INVALID_CLIENT_LINE');
    clientIds.forEach((key) => seenObjects.add(key));
    return {
      rawMaterialId: planned.rawMaterialId,
      supplierDeclaredQty: quantity(line.supplierDeclaredQty ?? 0, unit, 'NCC báo giao'),
      actualQty,
      acceptedQty,
      rejectedQty,
      pendingQty,
      defectReason: String(line.defectReason || '').trim().slice(0, 500),
      qualityInspectionRef: String(line.qualityInspectionRef || '').trim().slice(0, 120),
      rolls: rolls.map((roll) => ({
        clientLineId: String(roll.clientLineId).trim(), supplierRollCode: String(roll.supplierRollCode || '').trim(),
        lotCode: String(roll.lotCode || '').trim(), widthCm: Number(roll.widthCm || 0),
        lengthMeters: quantity(roll.lengthMeters ?? 0, 'METER', 'Chiều dài cây'),
        weightKg: quantity(roll.weightKg ?? 0, 'KG', 'Cân nặng cây'), quality: roll.quality,
        defectReason: String(roll.defectReason || '').trim(), locationId: roll.locationId || undefined,
      })),
      lots: lots.map((lot) => ({
        clientLineId: String(lot.clientLineId).trim(), supplierLotCode: String(lot.supplierLotCode || '').trim(),
        packageUnit: String(lot.packageUnit || '').trim(), packageCount: quantity(lot.packageCount ?? 0, 'PIECE', 'Số bao gói'),
        unitsPerPackage: quantity(lot.unitsPerPackage ?? 0, unit, 'Quy cách đóng gói'),
        countedQty: quantity(lot.countedQty ?? 0, unit, 'Số lượng thực kiểm'), quality: lot.quality,
        defectReason: String(lot.defectReason || '').trim(),
        allocations: (Array.isArray(lot.allocations) ? lot.allocations : []).map((allocation) => ({
          locationId: allocation.locationId || undefined, quantity: quantity(allocation.quantity ?? 0, unit, 'Số lượng phân bổ'),
        })),
      })),
    };
  });
  receipt.supplierDeliveryCode = deliveryCode;
  receipt.handoverName = handoverName;
  receipt.receivedAt = new Date(input.receivedAt);
  receipt.receivingLocationId = input.receivingLocationId;
  receipt.receiptNote = String(input.receiptNote || '').trim();
  const hasReceived = receipt.receiptLines.some((line) => line.actualQty > 0);
  const hasAllObjects = receipt.receiptLines.every((line) => {
    const material = byMaterial.get(id(line.rawMaterialId)).material;
    const objects = material.materialType === 'FABRIC' ? line.rolls : line.lots;
    return objects.every((item) => {
      const value = material.materialType === 'FABRIC' ? item.lengthMeters : item.countedQty;
      const assignments = material.materialType === 'FABRIC'
        ? [{ locationId: item.locationId, quantity: value }] : item.allocations;
      return value > 0 && ['ACCEPTED', 'REJECTED'].includes(item.quality) &&
        (item.quality !== 'REJECTED' || item.defectReason) && assignments.length > 0 &&
        (material.materialType === 'FABRIC' ? item.widthCm > 0 : item.packageCount > 0 && item.unitsPerPackage > 0) &&
        assignments.every((assignment) => assignment.locationId && assignment.quantity > 0) &&
        same(assignments.reduce((sum, assignment) => sum + assignment.quantity, 0), value);
    }) && (line.rejectedQty === 0 || line.defectReason) && ['ACCEPTED', 'REJECTED'].every((quality) => same(objects.filter((item) => item.quality === quality)
      .reduce((sum, item) => sum + Number(material.materialType === 'FABRIC' ? item.lengthMeters : item.countedQty), 0),
    quality === 'ACCEPTED' ? line.acceptedQty : line.rejectedQty));
  });
  receipt.status = receipt.receiptLines.some((line) => line.pendingQty > 0) ? 'WAITING_QC'
    : hasReceived && hasAllObjects ? 'READY_TO_CONFIRM' : 'DRAFT';
  receipt.markModified('receiptLines');
  requireValue(accessible({ _id: input.receivingLocationId }, user), 'Bạn không được sử dụng vị trí kho này', 'LOCATION_FORBIDDEN', 403);
}

/** Replaces editable draft data only when the client still has its latest version. */
export async function updateMaterialReceiptDraft(receiptId, input, user) {
  const { receipt: current, plan } = await getMaterialReceipt(receiptId, user);
  requireValue(editableReceiptStatuses.includes(current.status), 'Phiếu không còn ở trạng thái nháp', 'RECEIPT_LOCKED', 409);
  requireValue(Number(input.expectedVersion) === current.receiptVersion, 'Phiếu đã được thay đổi; hãy tải lại', 'VERSION_CONFLICT', 409);
  requireValue(!input.inboundPlanId || id(input.inboundPlanId) === id(current.inboundPlanId), 'Không thể đổi kế hoạch của phiếu đã tạo', 'PLAN_CHANGE_FORBIDDEN');
  requireValue(!input.replacementForTicketId || id(input.replacementForTicketId) === id(current.replacementForTicketId),
    'Không thể đổi phiếu trả gốc của phiếu đã tạo', 'RETURN_SOURCE_CHANGE_FORBIDDEN');
  const receipt = new MaterialTicket(current);
  applyDraft(receipt, input, plan, user);
  const update = await MaterialTicket.findOneAndUpdate({ _id: receiptId, receiptVersion: current.receiptVersion,
    status: { $in: editableReceiptStatuses } }, { $set: {
      supplierDeliveryCode: receipt.supplierDeliveryCode, handoverName: receipt.handoverName,
      receivedAt: receipt.receivedAt, receivingLocationId: receipt.receivingLocationId,
      receiptNote: receipt.receiptNote, receiptLines: receipt.receiptLines, status: receipt.status,
    }, $inc: { receiptVersion: 1 } }, { new: true, runValidators: true });
  requireValue(update, 'Phiếu đã được thay đổi; hãy tải lại', 'VERSION_CONFLICT', 409);
  return update;
}

/** Cancels only an unconfirmed draft while retaining it for audit and duplicate-delivery checks. */
export async function cancelMaterialReceipt(receiptId, input, user) {
  const { receipt } = await getMaterialReceipt(receiptId, user);
  requireValue(editableReceiptStatuses.includes(receipt.status), 'Chỉ được hủy phiếu chưa xác nhận', 'RECEIPT_LOCKED', 409);
  requireValue(Number(input.expectedVersion) === receipt.receiptVersion, 'Phiếu đã thay đổi; hãy tải lại', 'VERSION_CONFLICT', 409);
  const cancelled = await MaterialTicket.findOneAndUpdate({ _id: receiptId, receiptVersion: receipt.receiptVersion,
    status: { $in: editableReceiptStatuses } }, { $set: { status: 'CANCELLED' }, $inc: { receiptVersion: 1 } }, { new: true });
  requireValue(cancelled, 'Phiếu đã thay đổi; hãy tải lại', 'VERSION_CONFLICT', 409);
  return cancelled;
}

/** Returns stable barcodes from confirmed roll and accessory-lot records for printing. */
export async function getMaterialReceiptLabels(receiptId, user) {
  const { receipt } = await getMaterialReceipt(receiptId, user);
  requireValue(receipt.status === 'COMPLETED', 'Chỉ in tem cho phiếu đã xác nhận', 'RECEIPT_NOT_CONFIRMED', 409);
  const [rolls, lots] = await Promise.all([
    FabricRoll.find({ inboundTicketId: receiptId }).select('rollBarcode barcodeImageUrl rawMaterialId initialLengthMeters measuredWidthCm supplierLotCode fifoInboundTimestamp status locationId').lean(),
    MaterialStockLot.find({ inboundTicketId: receiptId }).select('lotBarcode barcodeImageUrl rawMaterialId initialQty quality status allocations supplierLotCode fifoInboundTimestamp').lean(),
  ]);
  if ([...rolls, ...lots].some((item) => !item.barcodeImageUrl)) scheduleBarcodeImages('RAW_MATERIAL', receiptId);
  const materialIds = [...new Set([...rolls, ...lots].map((item) => id(item.rawMaterialId)))];
  const locationIds = [...new Set([...rolls.map((item) => id(item.locationId)),
    ...lots.flatMap((lot) => lot.allocations.map((item) => id(item.locationId)))])];
  const [materials, locations] = await Promise.all([
    RawMaterial.find({ _id: { $in: materialIds } }).select('materialName materialCode color unit').lean(),
    WarehouseLocation.find({ _id: { $in: locationIds } }).select('locationCode').lean(),
  ]);
  const byMaterial = new Map(materials.map((item) => [id(item._id), item]));
  const byLocation = new Map(locations.map((item) => [id(item._id), item.locationCode]));
  const labels = [
    ...rolls.map((roll) => ({ barcode: roll.rollBarcode, rawMaterialId: id(roll.rawMaterialId), quantity: roll.initialLengthMeters,
      imageUrl: roll.barcodeImageUrl || null,
      materialName: byMaterial.get(id(roll.rawMaterialId))?.materialName, materialCode: byMaterial.get(id(roll.rawMaterialId))?.materialCode,
      color: byMaterial.get(id(roll.rawMaterialId))?.color, unit: 'METER', widthCm: roll.measuredWidthCm,
      supplierLotCode: roll.supplierLotCode, receivedAt: roll.fifoInboundTimestamp,
      locationCodes: [byLocation.get(id(roll.locationId))].filter(Boolean),
      quality: ['DEFECTIVE', 'RETURNED_TO_SUPPLIER'].includes(roll.status) ? 'REJECTED' : 'ACCEPTED',
      putawayComplete: ['IN_STOCK', 'DEFECTIVE', 'RETURNED_TO_SUPPLIER'].includes(roll.status) })),
    ...lots.map((lot) => ({ barcode: lot.lotBarcode, rawMaterialId: id(lot.rawMaterialId), quantity: lot.initialQty,
      imageUrl: lot.barcodeImageUrl || null,
      materialName: byMaterial.get(id(lot.rawMaterialId))?.materialName, materialCode: byMaterial.get(id(lot.rawMaterialId))?.materialCode,
      color: byMaterial.get(id(lot.rawMaterialId))?.color, unit: byMaterial.get(id(lot.rawMaterialId))?.unit,
      supplierLotCode: lot.supplierLotCode, receivedAt: lot.fifoInboundTimestamp,
      locationCodes: lot.allocations.map((item) => byLocation.get(id(item.locationId))).filter(Boolean),
      quality: lot.quality, putawayComplete: ['IN_STOCK', 'QUARANTINED'].includes(lot.status),
      allocations: lot.allocations.map((allocation) => ({ locationId: id(allocation.locationId), quantity: allocation.quantity, putawayQty: allocation.putawayQty || 0 })) })),
  ];
  return { labels, total: labels.length, ready: labels.filter((item) => item.imageUrl).length };
}

/** Confirms a scanned accepted roll or lot allocation at its planned shelf exactly once.
 * Rejects a barcode from another receipt, a wrong location, or an amount above the
 * remaining allocation; rolls must be put away whole while lots may be split.
 */
export async function confirmMaterialPutaway(receiptId, input, user) {
  requireValue(mongoose.isValidObjectId(receiptId), 'Mã phiếu không hợp lệ', 'INVALID_RECEIPT');
  const key = String(input.idempotencyKey || '').trim();
  const barcode = String(input.objectBarcode || '').trim().toUpperCase();
  const locationBarcode = String(input.locationBarcode || '').trim().toUpperCase();
  requireValue(/^[A-Za-z0-9_-]{8,100}$/.test(key) && barcode && locationBarcode,
    'Cần barcode cây/lô, barcode vị trí và mã thao tác', 'INVALID_PUTAWAY');
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const receipt = await MaterialTicket.findOne({ _id: receiptId,
        ticketType: { $in: ['INBOUND_FROM_PLAN', 'INBOUND_FROM_SUPPLIER'] }, status: 'COMPLETED' }).session(session);
      requireValue(receipt, 'Phiếu chưa được xác nhận', 'RECEIPT_NOT_CONFIRMED', 409);
      requireValue(accessible({ _id: receipt.receivingLocationId }, user), 'Bạn không có quyền cất phiếu này', 'RECEIPT_FORBIDDEN', 403);
      const previous = receipt.putawayEvents.find((event) => event.key === key);
      if (previous) {
        requireValue(previous.barcode === barcode && previous.locationBarcode === locationBarcode &&
          (input.quantity == null || same(previous.quantity, input.quantity)),
          'Mã thao tác đã dùng cho dữ liệu khác', 'IDEMPOTENCY_CONFLICT', 409);
        result = { alreadyProcessed: true, quantity: previous.quantity };
        return;
      }
      const location = await WarehouseLocation.findOne({ barcode: locationBarcode, status: 'ACTIVE',
        isFrozenForStocktake: false, isDeleted: { $ne: true } }).session(session);
      requireValue(location?.warehouseType === 'RAW_MATERIAL' && accessible(location, user), 'Barcode vị trí không hợp lệ', 'INVALID_LOCATION');
      let amount;
      let materialId;
      if (barcode.startsWith('FR-')) {
        const roll = await FabricRoll.findOne({ rollBarcode: barcode, inboundTicketId: receiptId }).session(session);
        requireValue(roll && roll.status === 'QC_PASSED' && id(roll.locationId) === id(location._id),
          'Cây vải không chờ cất tại vị trí này', 'ROLL_NOT_PENDING', 409);
        amount = roll.initialLengthMeters;
        requireValue(input.quantity == null || same(input.quantity, amount), 'Phải cất toàn bộ cây vải', 'ROLL_QUANTITY_MISMATCH');
        materialId = roll.rawMaterialId;
        roll.status = 'IN_STOCK';
        roll.putawayConfirmedAt = new Date();
        await roll.save({ session });
      } else if (barcode.startsWith('ML-')) {
        const lot = await MaterialStockLot.findOne({ lotBarcode: barcode, inboundTicketId: receiptId, quality: 'ACCEPTED' }).session(session);
        requireValue(lot && lot.status === 'PENDING_PUTAWAY', 'Lô không chờ cất hàng', 'LOT_NOT_PENDING', 409);
        const allocation = lot.allocations.find((item) => id(item.locationId) === id(location._id));
        requireValue(allocation, 'Lô không phân bổ vào vị trí này', 'LOCATION_NOT_ALLOCATED');
        amount = input.quantity == null && lot.allocations.length === 1
          ? round(allocation.quantity - (allocation.putawayQty || 0)) : Number(input.quantity);
        requireValue(Number.isFinite(amount) && amount > 0 && amount <= round(allocation.quantity - (allocation.putawayQty || 0)) + 0.0001,
          'Số lượng cất vượt phần lô còn lại', 'PUTAWAY_QUANTITY_INVALID');
        const material = await RawMaterial.findById(lot.rawMaterialId).select('unit').session(session);
        requireValue(material, 'Không tìm thấy nguyên phụ liệu', 'MATERIAL_UNAVAILABLE', 409);
        amount = quantity(amount, material.unit, 'Số lượng cất');
        materialId = lot.rawMaterialId;
        allocation.putawayQty = round((allocation.putawayQty || 0) + amount);
        if (lot.allocations.every((item) => same(item.quantity, item.putawayQty || 0))) lot.status = 'IN_STOCK';
        await lot.save({ session });
      } else throw new ReceiptError('Barcode cây/lô không hợp lệ', 'INVALID_OBJECT_BARCODE');
      const updated = await RawMaterial.updateOne({ _id: materialId, pendingPutawayQty: { $gte: amount } },
        { $inc: { pendingPutawayQty: -amount } }, { session });
      requireValue(updated.matchedCount === 1, 'Số lượng chờ cất đã thay đổi', 'PENDING_STOCK_CHANGED', 409);
      receipt.putawayEvents.push({ key, barcode, locationBarcode, locationId: location._id, quantity: amount, at: new Date() });
      await receipt.save({ session });
      result = { alreadyProcessed: false, quantity: amount, locationCode: location.locationCode };
    });
    return result;
  } finally { await session.endSession(); }
}

/** Links a rejected physical object to its original receipt before supplier handover. */
export async function requestMaterialSupplierReturn(receiptId, input, user) {
  const { receipt } = await getMaterialReceipt(receiptId, user);
  requireValue(receipt.status === 'COMPLETED', 'Phiếu chưa xác nhận', 'RECEIPT_NOT_CONFIRMED', 409);
  const barcode = String(input.objectBarcode || '').trim().toUpperCase();
  const reason = String(input.reason || '').trim();
  requireValue(reason.length >= 2 && reason.length <= 500, 'Cần lý do trả NCC', 'RETURN_REASON_REQUIRED');
  const existing = (receipt.supplierReturns || []).find((item) => item.objectBarcode === barcode);
  if (existing) return { supplierReturn: existing, alreadyRequested: true };
  const object = barcode.startsWith('FR-')
    ? await FabricRoll.findOne({ rollBarcode: barcode, inboundTicketId: receiptId, status: 'DEFECTIVE' }).lean()
    : await MaterialStockLot.findOne({ lotBarcode: barcode, inboundTicketId: receiptId, quality: 'REJECTED', status: 'QUARANTINED' }).lean();
  requireValue(object, 'Chỉ được yêu cầu trả cây/lô không đạt của phiếu này', 'RETURN_OBJECT_INVALID');
  const supplierReturn = { objectBarcode: barcode, rawMaterialId: object.rawMaterialId,
    quantity: object.initialLengthMeters ?? object.initialQty, defectReason: reason,
    status: 'WAITING_RETURN', requestedByUserId: user._id, requestedAt: new Date() };
  const updated = await MaterialTicket.findOneAndUpdate({ _id: receiptId, status: 'COMPLETED',
    'supplierReturns.objectBarcode': { $ne: barcode } },
  { $push: { supplierReturns: supplierReturn }, $inc: { receiptVersion: 1 } }, { new: true });
  requireValue(updated, 'Yêu cầu trả đã được tạo; hãy tải lại phiếu', 'RETURN_ALREADY_REQUESTED', 409);
  return { supplierReturn: updated.supplierReturns.find((item) => item.objectBarcode === barcode), alreadyRequested: false };
}

/** Removes a rejected object from quarantine only after the supplier handover is recorded. */
export async function confirmMaterialSupplierReturn(receiptId, input, user) {
  requireValue(mongoose.isValidObjectId(receiptId), 'Mã phiếu không hợp lệ', 'INVALID_RECEIPT');
  const barcode = String(input.objectBarcode || '').trim().toUpperCase();
  const handoverName = String(input.handoverName || '').trim();
  requireValue(handoverName.length >= 2 && handoverName.length <= 120, 'Cần người nhận hàng trả', 'RETURN_HANDOVER_REQUIRED');
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const receipt = await MaterialTicket.findOne({ _id: receiptId,
        ticketType: { $in: ['INBOUND_FROM_PLAN', 'INBOUND_FROM_SUPPLIER'] }, status: 'COMPLETED' }).session(session);
      requireValue(receipt && accessible({ _id: receipt.receivingLocationId }, user), 'Phiếu không hợp lệ hoặc không có quyền', 'RECEIPT_FORBIDDEN', 403);
      const request = receipt.supplierReturns.find((item) => item.objectBarcode === barcode);
      requireValue(request, 'Chưa có yêu cầu trả NCC cho cây/lô này', 'RETURN_REQUEST_REQUIRED', 409);
      if (request.status === 'RETURNED') {
        requireValue(request.handoverName === handoverName, 'Hàng đã bàn giao cho người khác', 'RETURN_ALREADY_CONFIRMED', 409);
        result = { supplierReturn: request, alreadyProcessed: true };
        return;
      }
      const roll = barcode.startsWith('FR-')
        ? await FabricRoll.findOne({ rollBarcode: barcode, inboundTicketId: receiptId, status: 'DEFECTIVE' }).session(session) : null;
      const lot = barcode.startsWith('ML-')
        ? await MaterialStockLot.findOne({ lotBarcode: barcode, inboundTicketId: receiptId, quality: 'REJECTED', status: 'QUARANTINED' }).session(session) : null;
      requireValue(roll || lot, 'Cây/lô không còn ở khu cách ly', 'RETURN_OBJECT_CHANGED', 409);
      const allocations = roll ? [{ locationId: roll.locationId, quantity: roll.currentLengthMeters }]
        : lot.allocations.map((item) => ({ locationId: item.locationId, quantity: item.quantity }));
      for (const [index, allocation] of allocations.entries()) {
        const location = await WarehouseLocation.findOneAndUpdate({ _id: allocation.locationId,
          warehouseType: 'DEFECT_QUARANTINE', currentOccupancy: { $gte: allocation.quantity } },
        { $inc: { currentOccupancy: -allocation.quantity } }, { session, new: false });
        requireValue(location && accessible(location, user), 'Vị trí cách ly đã thay đổi', 'RETURN_LOCATION_CHANGED', 409);
        await InventoryTransaction.create([{ transactionCode: `MSR-${receiptId}-${barcode}-${index}`,
          warehouseType: 'DEFECT_QUARANTINE', itemType: 'RAW_MATERIAL', rawMaterialId: request.rawMaterialId,
          locationId: allocation.locationId, transactionType: 'SUPPLIER_RETURN_OUTBOUND',
          referenceModel: 'MaterialTicket', referenceId: receipt._id, quantityChange: -allocation.quantity,
          onHandBefore: location.currentOccupancy, onHandAfter: round(location.currentOccupancy - allocation.quantity),
          performedByUserId: user._id, note: request.defectReason }], { session });
      }
      if (roll) {
        roll.currentLengthMeters = 0;
        roll.status = 'RETURNED_TO_SUPPLIER';
        await roll.save({ session });
      } else {
        lot.currentQty = 0;
        lot.status = 'RETURNED_TO_SUPPLIER';
        await lot.save({ session });
      }
      request.status = 'RETURNED';
      request.handedOverByUserId = user._id;
      request.handoverName = handoverName;
      request.returnedAt = new Date();
      receipt.receiptVersion += 1;
      await receipt.save({ session });
      result = { supplierReturn: request, alreadyProcessed: false };
    });
    return result;
  } finally { await session.endSession(); }
}

/** Checks inspection totals, quality decisions, and every declared roll or lot.
 * Accepted and rejected objects must sum to their line totals, use the right
 * warehouse area and stock unit, and fit the destination location capacity.
 */
function validateForConfirmation(receipt, plan, locations, user) {
  const byMaterial = new Map(plan.lines.map((line) => [line.rawMaterialId, line]));
  const byLocation = new Map(locations.map((location) => [id(location._id), location]));
  const occupancy = new Map();
  const locationUnits = new Map();
  let objects = 0;
  requireValue(receipt.receiptLines.some((line) => line.actualQty > 0), 'Phiếu chưa có hàng thực nhận', 'EMPTY_RECEIPT');
  for (const line of receipt.receiptLines) {
    const planned = byMaterial.get(id(line.rawMaterialId));
    requireValue(planned, 'Dòng không còn thuộc kế hoạch', 'PLAN_CHANGED', 409);
    requireValue(line.acceptedQty <= planned.remainingQty + 0.0001, 'Số lượng đạt vượt kế hoạch còn lại', 'PLAN_EXCEEDED', 409);
    requireValue(line.actualQty <= planned.remainingQty + 0.0001,
      'Thực nhận vượt kế hoạch; cần xử lý ngoại lệ trước khi xác nhận', 'PLAN_EXCEEDED', 409);
    requireValue(same(line.actualQty, line.acceptedQty + line.rejectedQty + line.pendingQty),
      'Thực nhận phải bằng đạt + không đạt + chờ kiểm tra', 'INSPECTION_TOTAL_MISMATCH');
    requireValue(line.pendingQty === 0, 'Còn hàng chờ kiểm tra chất lượng', 'QUALITY_PENDING');
    if (line.rejectedQty > 0) requireValue(line.defectReason, 'Cần ghi lý do hàng không đạt', 'DEFECT_REASON_REQUIRED');
    const material = planned.material;
    if (material.materialType === 'FABRIC') requireValue(material.unit === 'METER',
      'Cây vải hiện được quản lý theo mét; cần đổi đơn vị tồn của nguyên liệu', 'FABRIC_UNIT_UNSUPPORTED', 409);
    const objectsForLine = material.materialType === 'FABRIC' ? line.rolls : line.lots;
    requireValue(objectsForLine.length > 0 || line.actualQty === 0, 'Cần khai báo cây vải hoặc lô phụ liệu', 'OBJECTS_REQUIRED');
    requireValue(material.materialType === 'FABRIC' ? line.lots.length === 0 : line.rolls.length === 0,
      'Loại cây/lô không khớp nguyên phụ liệu', 'WRONG_OBJECT_TYPE');
    let accepted = 0;
    let rejected = 0;
    for (const object of objectsForLine) {
      const value = material.materialType === 'FABRIC' ? object.lengthMeters : object.countedQty;
      requireValue(value > 0 && ['ACCEPTED', 'REJECTED'].includes(object.quality), 'Cây/lô cần số lượng và kết quả chất lượng', 'INVALID_OBJECT');
      if (object.quality === 'ACCEPTED') accepted = round(accepted + value);
      else {
        rejected = round(rejected + value);
        requireValue(object.defectReason, 'Cây/lô không đạt cần lý do', 'DEFECT_REASON_REQUIRED');
      }
      const allocations = material.materialType === 'FABRIC'
        ? [{ locationId: object.locationId, quantity: value }] : object.allocations;
      requireValue(allocations.length > 0 && same(allocations.reduce((sum, item) => sum + item.quantity, 0), value),
        'Tổng phân bổ vị trí phải bằng số lượng cây/lô', 'LOCATION_TOTAL_MISMATCH');
      if (material.materialType !== 'FABRIC') {
        requireValue(object.packageCount > 0 && object.unitsPerPackage > 0,
          'Cần số bao gói và quy cách đóng gói', 'PACKAGING_REQUIRED');
      } else requireValue(object.widthCm > 0, 'Cây vải cần khổ thực tế', 'ROLL_WIDTH_REQUIRED');
      const uniqueLocations = new Set();
      for (const allocation of allocations) {
        const location = byLocation.get(id(allocation.locationId));
        requireValue(location && !uniqueLocations.has(id(allocation.locationId)) && accessible(location, user),
          'Vị trí phân bổ không hợp lệ hoặc bị trùng', 'INVALID_LOCATION');
        uniqueLocations.add(id(allocation.locationId));
        requireValue(location.warehouseType === (object.quality === 'ACCEPTED' ? 'RAW_MATERIAL' : 'DEFECT_QUARANTINE'),
          'Hàng đạt và không đạt phải vào đúng khu vực', 'WRONG_LOCATION_TYPE');
        requireValue((!location.capacityUnit || location.capacityUnit === material.unit) &&
          (!locationUnits.has(id(location._id)) || locationUnits.get(id(location._id)) === material.unit) &&
          (location.capacityUnit || !location.currentOccupancy),
        'Đơn vị sức chứa của kệ không khớp nguyên phụ liệu', 'LOCATION_UNIT_MISMATCH');
        locationUnits.set(id(location._id), material.unit);
        occupancy.set(id(location._id), round((occupancy.get(id(location._id)) || 0) + allocation.quantity));
      }
      objects += 1;
    }
    requireValue(same(accepted, line.acceptedQty) && same(rejected, line.rejectedQty),
      'Tổng cây/lô không khớp kết quả kiểm nhận', 'OBJECT_TOTAL_MISMATCH');
  }
  for (const [locationId, amount] of occupancy) {
    const location = byLocation.get(locationId);
    requireValue(round(location.currentOccupancy + amount) <= location.maxCapacity + 0.0001,
      `Vị trí ${location.locationCode} không đủ sức chứa`, 'LOCATION_FULL', 409);
  }
  return { occupancy, locationUnits, objects };
}

/** Confirms once in a MongoDB transaction, including stock, lots, ledger, and plan progress. */
export async function confirmMaterialReceipt(receiptId, input, user) {
  requireValue(mongoose.isValidObjectId(receiptId), 'Mã phiếu không hợp lệ', 'INVALID_RECEIPT');
  const key = String(input.idempotencyKey || '').trim();
  requireValue(/^[A-Za-z0-9_-]{8,100}$/.test(key), 'Thiếu khóa xác nhận', 'IDEMPOTENCY_KEY_REQUIRED');
  const session = await mongoose.startSession();
  try {
    let confirmed;
    await session.withTransaction(async () => {
      const receipt = await MaterialTicket.findOne({ _id: receiptId, ticketType: 'INBOUND_FROM_PLAN', isDeleted: { $ne: true } }).session(session);
      requireValue(receipt, 'Không tìm thấy phiếu nhập', 'RECEIPT_NOT_FOUND', 404);
      requireValue(accessible({ _id: receipt.receivingLocationId }, user), 'Bạn không có quyền xác nhận phiếu này', 'RECEIPT_FORBIDDEN', 403);
      if (receipt.status === 'COMPLETED') {
        requireValue(receipt.confirmationKey === key, 'Phiếu đã xác nhận bằng yêu cầu khác', 'ALREADY_CONFIRMED', 409);
        confirmed = receipt;
        return;
      }
      requireValue(editableReceiptStatuses.includes(receipt.status), 'Phiếu không thể xác nhận', 'RECEIPT_LOCKED', 409);
      requireValue(Number(input.expectedVersion) === receipt.receiptVersion, 'Phiếu đã thay đổi; hãy tải lại', 'VERSION_CONFLICT', 409);
      const plan = await MaterialInboundPlan.findOne({ _id: receipt.inboundPlanId, status: { $in: allowedPlanStatuses }, isDeleted: { $ne: true } }).session(session);
      requireValue(plan, 'Kế hoạch không còn được phép nhận', 'PLAN_NOT_ELIGIBLE', 409);
      const materialIds = plan.expectedItems.map((item) => item.rawMaterialId);
      const materials = await RawMaterial.find({ _id: { $in: materialIds }, isActive: true, isDeleted: { $ne: true } }).session(session);
      const byMaterial = new Map(materials.map((material) => [id(material._id), material]));
      const planView = { lines: plan.expectedItems.map((item) => ({ rawMaterialId: id(item.rawMaterialId),
        material: byMaterial.get(id(item.rawMaterialId)),
        remainingQty: round(item.plannedQty - (item.actualVerifiedPassedQty || 0)) })) };
      requireValue(planView.lines.every((line) => line.material), 'Nguyên phụ liệu của kế hoạch không còn hoạt động', 'MATERIAL_UNAVAILABLE', 409);
      const locationIds = new Set([id(receipt.receivingLocationId)]);
      for (const line of receipt.receiptLines) {
        for (const roll of line.rolls) locationIds.add(id(roll.locationId));
        for (const lot of line.lots) for (const allocation of lot.allocations) locationIds.add(id(allocation.locationId));
      }
      const locations = await WarehouseLocation.find({ _id: { $in: [...locationIds] }, status: 'ACTIVE',
        isFrozenForStocktake: false, isDeleted: { $ne: true } }).session(session);
      const receiving = locations.find((location) => id(location._id) === id(receipt.receivingLocationId));
      requireValue(receiving?.warehouseType === 'RAW_MATERIAL' && accessible(receiving, user), 'Vị trí kho nhận không hợp lệ', 'INVALID_RECEIVING_LOCATION');
      const { occupancy, locationUnits } = validateForConfirmation(receipt, planView, locations, user);
      const now = new Date();
      for (const [locationId, amount] of occupancy) {
        const updated = await WarehouseLocation.updateOne({ _id: locationId, status: 'ACTIVE', isFrozenForStocktake: false,
          $or: [{ capacityUnit: locationUnits.get(locationId) }, { capacityUnit: null }],
          $expr: { $gte: [{ $subtract: ['$maxCapacity', { $ifNull: ['$currentOccupancy', 0] }] }, amount] } },
        { $inc: { currentOccupancy: amount }, $set: { capacityUnit: locationUnits.get(locationId) } }, { session });
        requireValue(updated.matchedCount === 1, 'Sức chứa vị trí đã thay đổi', 'LOCATION_FULL', 409);
      }
      for (const [lineIndex, line] of receipt.receiptLines.entries()) {
        const material = byMaterial.get(id(line.rawMaterialId));
        const planItem = plan.expectedItems.find((item) => id(item.rawMaterialId) === id(line.rawMaterialId));
        planItem.actualVerifiedPassedQty = round((planItem.actualVerifiedPassedQty || 0) + line.acceptedQty);
        planItem.actualDefectiveOrShortQty = round((planItem.actualDefectiveOrShortQty || 0) + line.rejectedQty);
        const acceptedObjects = material.materialType === 'FABRIC' ? line.rolls.filter((roll) => roll.quality === 'ACCEPTED')
          : line.lots.filter((lot) => lot.quality === 'ACCEPTED');
        for (const [objectIndex, roll] of line.rolls.entries()) {
          await FabricRoll.create([{ rollBarcode: `FR-${String(receipt._id).toUpperCase()}-${lineIndex}-${objectIndex}`,
            rawMaterialId: material._id, supplierId: receipt.supplierId, contractId: receipt.contractId,
            inboundTicketId: receipt._id, clientLineId: roll.clientLineId, supplierRollCode: roll.supplierRollCode,
            supplierLotCode: roll.lotCode, measuredWidthCm: roll.widthCm, defectReason: roll.defectReason,
            initialLengthMeters: roll.lengthMeters, currentLengthMeters: roll.lengthMeters,
            initialWeightKg: roll.weightKg, currentWeightKg: roll.weightKg, unitCostPerMeter: material.unitCost,
            locationId: roll.locationId, fifoInboundTimestamp: now,
            status: roll.quality === 'ACCEPTED' ? 'QC_PASSED' : 'DEFECTIVE' }], { session });
        }
        for (const [objectIndex, lot] of line.lots.entries()) {
          await MaterialStockLot.create([{ lotBarcode: `ML-${String(receipt._id).toUpperCase()}-${lineIndex}-${objectIndex}`,
            rawMaterialId: material._id, supplierId: receipt.supplierId, inboundTicketId: receipt._id,
            clientLineId: lot.clientLineId, supplierLotCode: lot.supplierLotCode,
            packageUnit: lot.packageUnit, packageCount: lot.packageCount, unitsPerPackage: lot.unitsPerPackage,
            initialQty: lot.countedQty,
            currentQty: lot.countedQty, quality: lot.quality,
            status: lot.quality === 'ACCEPTED' ? 'PENDING_PUTAWAY' : 'QUARANTINED', defectReason: lot.defectReason,
            fifoInboundTimestamp: now, allocations: lot.allocations }], { session });
        }
        if (!acceptedObjects.length) continue;
        const before = material.onHandQty || 0;
        material.onHandQty = round(before + line.acceptedQty);
        material.pendingPutawayQty = round((material.pendingPutawayQty || 0) + line.acceptedQty);
        await material.save({ session });
        const allocationTotals = new Map();
        if (material.materialType === 'FABRIC') {
          for (const roll of acceptedObjects) allocationTotals.set(id(roll.locationId), round((allocationTotals.get(id(roll.locationId)) || 0) + roll.lengthMeters));
        } else for (const lot of acceptedObjects) for (const allocation of lot.allocations) {
          allocationTotals.set(id(allocation.locationId), round((allocationTotals.get(id(allocation.locationId)) || 0) + allocation.quantity));
        }
        let running = before;
        for (const [locationId, amount] of allocationTotals) {
          await InventoryTransaction.create([{ transactionCode: `MRI-${receipt._id}-${lineIndex}-${locationId}`,
            warehouseType: 'RAW_MATERIAL', itemType: 'RAW_MATERIAL', rawMaterialId: material._id,
            locationId, transactionType: 'INBOUND_RECEIPT', referenceModel: 'MaterialTicket', referenceId: receipt._id,
            quantityChange: amount, onHandBefore: running, onHandAfter: round(running + amount),
            unitCostSnapshot: material.unitCost, performedByUserId: user._id,
          }], { session });
          running = round(running + amount);
        }
      }
      const quarantineBalances = new Map(locations.filter((location) => location.warehouseType === 'DEFECT_QUARANTINE')
        .map((location) => [id(location._id), location.currentOccupancy || 0]));
      for (const [lineIndex, line] of receipt.receiptLines.entries()) {
        const rejectedObjects = [...line.rolls, ...line.lots].filter((object) => object.quality === 'REJECTED');
        for (const [objectIndex, object] of rejectedObjects.entries()) {
          const allocations = 'lengthMeters' in object
            ? [{ locationId: object.locationId, quantity: object.lengthMeters }] : object.allocations;
          for (const [allocationIndex, allocation] of allocations.entries()) {
            const locationId = id(allocation.locationId);
            const before = quarantineBalances.get(locationId) || 0;
            await InventoryTransaction.create([{ transactionCode: `MQI-${receipt._id}-${lineIndex}-${objectIndex}-${allocationIndex}`,
              warehouseType: 'DEFECT_QUARANTINE', itemType: 'RAW_MATERIAL', rawMaterialId: line.rawMaterialId,
              locationId: allocation.locationId, transactionType: 'DEFECT_QUARANTINE',
              referenceModel: 'MaterialTicket', referenceId: receipt._id, quantityChange: allocation.quantity,
              onHandBefore: before, onHandAfter: round(before + allocation.quantity),
              performedByUserId: user._id, note: object.defectReason || line.defectReason }], { session });
            quarantineBalances.set(locationId, round(before + allocation.quantity));
          }
        }
      }
      const hasDeviation = receipt.receiptLines.some((line) => line.rejectedQty > 0 || !same(line.actualQty, line.supplierDeclaredQty));
      const hasRemaining = plan.expectedItems.some((item) => round(item.plannedQty - (item.actualVerifiedPassedQty || 0)) > 0);
      plan.status = hasDeviation || plan.status === 'DEVIATION_REPORTED' ? 'DEVIATION_REPORTED'
        : hasRemaining ? 'IN_INSPECTION' : 'VERIFIED_MATCHED';
      await plan.save({ session });
      receipt.status = 'COMPLETED';
      receipt.confirmationKey = key;
      receipt.confirmedAt = now;
      receipt.confirmedByUserId = user._id;
      receipt.receiptVersion += 1;
      await receipt.save({ session });
      confirmed = receipt;
    });
    scheduleBarcodeImages('RAW_MATERIAL', String(confirmed._id));
    return confirmed;
  } finally {
    await session.endSession();
  }
}
