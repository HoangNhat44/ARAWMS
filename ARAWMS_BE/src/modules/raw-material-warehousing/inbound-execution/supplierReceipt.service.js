/*
 * File: supplierReceipt.service.js
 * Author: Duy Anh
 * Date: 2026-10-27
 * Description: Receives supplier materials from the actual delivery document without an inbound plan. Validates inspection, physical objects, capacity, and inventory in one transaction.
 */
import { createHash, randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { v2 as cloudinary } from 'cloudinary';
import CounterSequence from '../../../models/CounterSequence.model.js';
import FabricRoll from '../../../models/FabricRoll.model.js';
import InventoryTransaction from '../../../models/InventoryTransaction.model.js';
import MaterialStockLot from '../../../models/MaterialStockLot.model.js';
import MaterialTicket from '../../../models/MaterialTicket.model.js';
import RawMaterial from '../../../models/RawMaterial.model.js';
import Supplier from '../../../models/Supplier.model.js';
import SystemLog from '../../../models/SystemLog.model.js';
import WarehouseLocation from '../../../models/WarehouseLocation.model.js';
import { ReceiptError, getReceiptOptions } from './inboundExecution.service.js';
import { configureProductCloudinary } from '../../../common/services/productMediaStorage.js';
import { scheduleBarcodeImages } from '../../../common/services/barcodeImageStorage.js';

const id = (value) => String(value || '');
const round = (value) => Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;
const same = (a, b) => Math.abs(round(a) - round(b)) < 0.001;
const editable = ['DRAFT', 'WAITING_QC', 'READY_TO_CONFIRM'];
const fail = (condition, message, code, status = 400) => {
  if (!condition) throw new ReceiptError(message, code, status);
};
const accessible = (location, user) => !user.warehouseIds?.length || user.warehouseIds.some((item) => id(item) === id(location._id));
const stockQuantity = (value, unit, field) => {
  const numeric = Number(value);
  const multiplier = ['METER', 'KG'].includes(unit) ? 1000 : 1;
  fail(value !== '' && value != null && Number.isFinite(numeric) && numeric >= 0 &&
    Math.abs(numeric * multiplier - Math.round(numeric * multiplier)) < 0.000001,
  `${field} không hợp lệ theo đơn vị ${unit}`, 'INVALID_QUANTITY');
  return round(numeric);
};
const deliveryCode = (value) => String(value || '').trim().replace(/\s+/g, ' ').toUpperCase();

/** Returns the selectable catalog and locations already scoped to the user's warehouse access. */
export async function getSupplierReceiptOptions(user) {
  const [base, materials] = await Promise.all([getReceiptOptions(user), RawMaterial.find({
    isActive: true, isDeleted: { $ne: true },
  }).select('materialCode materialName materialType category color widthCm gsm unit').sort({ materialCode: 1 }).lean()]);
  return { ...base, materials };
}

/** Creates a catalog entry explicitly before it may be selected on a receipt. */
export async function createSupplierMaterial(input) {
  const materialCode = String(input.materialCode || '').trim().toUpperCase();
  const materialName = String(input.materialName || '').trim();
  fail(/^[\p{L}\p{N}._-]{2,40}$/u.test(materialCode) && materialName.length >= 2 && materialName.length <= 160,
    'Mã hoặc tên nguyên phụ liệu không hợp lệ', 'INVALID_MATERIAL');
  fail(['FABRIC', 'AUXILIARY'].includes(input.materialType), 'Loại nguyên phụ liệu không hợp lệ', 'INVALID_MATERIAL_TYPE');
  fail((input.materialType === 'FABRIC' ? ['FABRIC_ROLL'] : ['BUTTON', 'THREAD', 'ZIPPER', 'CARE_LABEL', 'PACKAGING_BAG']).includes(input.category),
    'Danh mục không khớp loại nguyên phụ liệu', 'INVALID_MATERIAL_CATEGORY');
  fail(['METER', 'KG', 'PIECE', 'SPOOL', 'BOX'].includes(input.unit) &&
    (input.materialType !== 'FABRIC' || input.unit === 'METER'), 'Đơn vị tồn không hợp lệ', 'INVALID_MATERIAL_UNIT');
  const widthCm = input.widthCm === '' || input.widthCm == null ? undefined : Number(input.widthCm);
  fail(widthCm == null || Number.isFinite(widthCm) && widthCm > 0, 'Khổ vải không hợp lệ', 'INVALID_WIDTH');
  const unitCost = Number(input.unitCost);
  fail(Number.isFinite(unitCost) && unitCost >= 0, 'Đơn giá không hợp lệ', 'INVALID_UNIT_COST');
  return RawMaterial.create({ materialCode, materialName, materialType: input.materialType,
    category: input.category, unit: input.unit, color: String(input.color || '').trim().slice(0, 80),
    widthCm, unitCost });
}

/** Searches persisted supplier receipts without mixing quantities of different units. */
export async function listSupplierReceipts(query, user) {
  const filter = { ticketType: 'INBOUND_FROM_SUPPLIER', isDeleted: { $ne: true },
    ...(user.warehouseIds?.length ? { receivingLocationId: { $in: user.warehouseIds } } : {}) };
  if (query.supplierId) {
    fail(mongoose.isValidObjectId(query.supplierId), 'Nhà cung cấp không hợp lệ', 'INVALID_SUPPLIER');
    filter.supplierId = query.supplierId;
  }
  if (query.locationId) {
    fail(mongoose.isValidObjectId(query.locationId) && accessible({ _id: query.locationId }, user),
      'Kho lọc không hợp lệ', 'INVALID_LOCATION');
    filter.receivingLocationId = query.locationId;
  }
  if (query.status) {
    fail([...editable, 'COMPLETED', 'CANCELLED'].includes(query.status), 'Trạng thái không hợp lệ', 'INVALID_STATUS');
    filter.status = query.status;
  }
  if (query.code) filter.ticketCode = { $regex: String(query.code).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
  if (query.from || query.to) {
    filter.receivedAt = {};
    if (query.from) filter.receivedAt.$gte = new Date(`${query.from}T00:00:00.000Z`);
    if (query.to) filter.receivedAt.$lte = new Date(`${query.to}T23:59:59.999Z`);
    fail(Object.values(filter.receivedAt).every((date) => !Number.isNaN(date.getTime())), 'Ngày lọc không hợp lệ', 'INVALID_DATE');
  }
  const receipts = await MaterialTicket.find(filter)
    .select('ticketCode supplierId supplierDeliveryCode receivingLocationId receivedAt createdByManagerId status createdAt confirmedAt supplierReturns.status')
    .populate('supplierId', 'supplierName supplierCode')
    .populate('receivingLocationId', 'locationCode')
    .populate('createdByManagerId', 'fullName')
    .sort({ createdAt: -1 }).limit(100).lean();
  return receipts;
}

/** Reads an editable or confirmed supplier receipt and the current material names. */
export async function getSupplierReceipt(receiptId, user) {
  fail(mongoose.isValidObjectId(receiptId), 'Mã phiếu không hợp lệ', 'INVALID_RECEIPT');
  const receipt = await MaterialTicket.findOne({ _id: receiptId, ticketType: 'INBOUND_FROM_SUPPLIER', isDeleted: { $ne: true } })
    .populate('receiptLines.inspectedByUserId', 'fullName').lean();
  fail(receipt, 'Không tìm thấy phiếu nhập', 'RECEIPT_NOT_FOUND', 404);
  fail(accessible({ _id: receipt.receivingLocationId }, user), 'Bạn không có quyền xem phiếu này', 'RECEIPT_FORBIDDEN', 403);
  const materials = await RawMaterial.find({ _id: { $in: receipt.receiptLines.map((line) => line.rawMaterialId) } })
    .select('materialCode materialName materialType category color widthCm gsm unit').lean();
  return { receipt, materials };
}

/** Finds matching delivery codes so the manager can review duplicates without blocking legitimate split deliveries. */
export async function findDeliveryMatches(supplierId, code, excludeId) {
  fail(mongoose.isValidObjectId(supplierId), 'Nhà cung cấp không hợp lệ', 'INVALID_SUPPLIER');
  const normalized = deliveryCode(code);
  if (!normalized) return [];
  return MaterialTicket.find({ supplierId, supplierDeliveryCode: normalized,
    ticketType: 'INBOUND_FROM_SUPPLIER', isDeleted: { $ne: true },
    ...(mongoose.isValidObjectId(excludeId) ? { _id: { $ne: excludeId } } : {}) })
    .select('ticketCode status receivedAt').limit(10).lean();
}

/** Builds server-owned inspection lines from active catalog materials. */
export async function validateSupplierReceiptDraft(input, user, previousReceipt) {
  fail(mongoose.isValidObjectId(input.supplierId), 'Cần chọn nhà cung cấp', 'SUPPLIER_REQUIRED');
  const supplier = await Supplier.findOne({ _id: input.supplierId, isActive: true, isDeleted: { $ne: true } }).select('_id').lean();
  fail(supplier, 'Nhà cung cấp không còn hoạt động', 'SUPPLIER_UNAVAILABLE', 409);
  fail(mongoose.isValidObjectId(input.receivingLocationId), 'Cần chọn kho nhận', 'LOCATION_REQUIRED');
  const location = await WarehouseLocation.findOne({ _id: input.receivingLocationId, warehouseType: 'RAW_MATERIAL',
    status: 'ACTIVE', isFrozenForStocktake: false, isDeleted: { $ne: true } }).select('_id').lean();
  fail(location && accessible(location, user), 'Kho nhận không hoạt động hoặc bạn không có quyền', 'LOCATION_FORBIDDEN', 403);
  const receivedAt = new Date(input.receivedAt);
  fail(input.receivedAt && !Number.isNaN(receivedAt.getTime()) && receivedAt <= new Date(),
    'Ngày nhận không hợp lệ hoặc ở tương lai', 'INVALID_DATE');
  const handoverName = String(input.handoverName || '').trim();
  fail(handoverName.length >= 2 && handoverName.length <= 120, 'Cần nhập người giao', 'HANDOVER_REQUIRED');
  const code = deliveryCode(input.supplierDeliveryCode);
  fail(code.length <= 80, 'Mã chứng từ quá dài', 'INVALID_DELIVERY_CODE');
  fail(String(input.receiptNote || '').length <= 500, 'Ghi chú quá dài', 'INVALID_NOTE');
  let replacementForTicketId;
  if (input.replacementForTicketId) {
    fail(mongoose.isValidObjectId(input.replacementForTicketId), 'Phiếu trả gốc không hợp lệ', 'INVALID_RETURN_SOURCE');
    const source = await MaterialTicket.findOne({ _id: input.replacementForTicketId,
      supplierId: supplier._id, status: 'COMPLETED', 'supplierReturns.status': 'RETURNED',
      ticketType: { $in: ['INBOUND_FROM_PLAN', 'INBOUND_FROM_SUPPLIER'] } }).select('_id').lean();
    fail(source, 'Phiếu trả gốc chưa bàn giao hoặc không cùng NCC', 'INVALID_RETURN_SOURCE');
    replacementForTicketId = source._id;
  }
  fail(Array.isArray(input.receiptLines) && input.receiptLines.length <= 100,
    'Danh sách nguyên phụ liệu không hợp lệ', 'INVALID_LINES');
  const materialIds = input.receiptLines.map((line) => id(line.rawMaterialId));
  fail(new Set(materialIds).size === materialIds.length && materialIds.every(mongoose.isValidObjectId),
    'Nguyên phụ liệu bị trùng hoặc không hợp lệ', 'DUPLICATE_MATERIAL');
  const materials = await RawMaterial.find({ _id: { $in: materialIds }, isActive: true, isDeleted: { $ne: true } }).lean();
  const byMaterial = new Map(materials.map((item) => [id(item._id), item]));
  const previousLines = new Map((previousReceipt?.receiptLines || []).map((line) => [id(line.rawMaterialId), line]));
  fail(byMaterial.size === materialIds.length, 'Có nguyên phụ liệu không còn hoạt động', 'MATERIAL_UNAVAILABLE', 409);
  const seenObjects = new Set();
  const lines = input.receiptLines.map((line) => {
    const material = byMaterial.get(id(line.rawMaterialId));
    const unit = material.unit;
    const actualQty = stockQuantity(line.actualQty ?? 0, unit, 'Thực nhận');
    const acceptedQty = stockQuantity(line.acceptedQty ?? 0, unit, 'Đạt');
    const rejectedQty = stockQuantity(line.rejectedQty ?? 0, unit, 'Không đạt');
    const pendingQty = stockQuantity(line.pendingQty ?? 0, unit, 'Chờ kiểm tra');
    const previous = previousLines.get(id(line.rawMaterialId));
    const inspectionChanged = !previous || !['actualQty', 'acceptedQty', 'rejectedQty', 'pendingQty'].every((key) =>
      same(previous[key], { actualQty, acceptedQty, rejectedQty, pendingQty }[key])) ||
      String(previous.inspectionConclusion || '') !== String(line.inspectionConclusion || '').trim() ||
      String(previous.qualityInspectionRef || '') !== String(line.qualityInspectionRef || '').trim();
    fail(same(actualQty, acceptedQty + rejectedQty + pendingQty),
      'Thực nhận phải bằng đạt + không đạt + chờ kiểm tra', 'INSPECTION_TOTAL_MISMATCH');
    const rolls = Array.isArray(line.rolls) ? line.rolls : [];
    const lots = Array.isArray(line.lots) ? line.lots : [];
    fail(rolls.length + lots.length <= 500 && (material.materialType === 'FABRIC' ? !lots.length : !rolls.length),
      'Chi tiết cây/lô không khớp nguyên phụ liệu', 'INVALID_OBJECT_TYPE');
    const clientIds = [...rolls, ...lots].map((item) => String(item.clientLineId || ''));
    fail(clientIds.every((key) => /^[A-Za-z0-9_-]{1,80}$/.test(key) && !seenObjects.has(key)) &&
      new Set(clientIds).size === clientIds.length, 'Mã dòng cây/lô bị trùng', 'DUPLICATE_OBJECT');
    clientIds.forEach((key) => seenObjects.add(key));
    return { rawMaterialId: material._id,
      supplierDeclaredQty: line.supplierDeclaredQty === '' || line.supplierDeclaredQty == null
        ? undefined : stockQuantity(line.supplierDeclaredQty, unit, 'NCC báo giao'),
      actualQty, acceptedQty, rejectedQty, pendingQty,
      defectReason: String(line.defectReason || '').trim().slice(0, 500),
      qualityInspectionRef: String(line.qualityInspectionRef || '').trim().slice(0, 120),
      inspectedByUserId: actualQty > pendingQty ? inspectionChanged ? user._id : previous.inspectedByUserId : undefined,
      inspectedAt: actualQty > pendingQty ? inspectionChanged ? new Date() : previous.inspectedAt : undefined,
      inspectionConclusion: String(line.inspectionConclusion || '').trim().slice(0, 120),
      inspectionNote: String(line.inspectionNote || '').trim().slice(0, 500),
      rolls: rolls.map((roll) => ({ clientLineId: roll.clientLineId,
        supplierRollCode: String(roll.supplierRollCode || '').trim().slice(0, 80),
        lotCode: String(roll.lotCode || '').trim().slice(0, 80),
        widthCm: Number(roll.widthCm || 0), lengthMeters: stockQuantity(roll.lengthMeters ?? 0, 'METER', 'Chiều dài cây'),
        weightKg: stockQuantity(roll.weightKg ?? 0, 'KG', 'Cân nặng cây'), quality: roll.quality,
        defectReason: String(roll.defectReason || '').trim().slice(0, 500), locationId: roll.locationId || undefined })),
      lots: lots.map((lot) => ({ clientLineId: lot.clientLineId,
        supplierLotCode: String(lot.supplierLotCode || '').trim().slice(0, 80),
        packageUnit: String(lot.packageUnit || '').trim().slice(0, 40),
        packageCount: stockQuantity(lot.packageCount ?? 0, 'PIECE', 'Số bao gói'),
        unitsPerPackage: stockQuantity(lot.unitsPerPackage ?? 0, unit, 'Quy cách bao gói'),
        countedQty: stockQuantity(lot.countedQty ?? 0, unit, 'Số thực kiểm'), quality: lot.quality,
        defectReason: String(lot.defectReason || '').trim().slice(0, 500),
        allocations: (Array.isArray(lot.allocations) ? lot.allocations : []).map((item) => ({
          locationId: item.locationId || undefined, quantity: stockQuantity(item.quantity ?? 0, unit, 'Số phân bổ') })) })),
    };
  });
  const hasPending = lines.some((line) => line.pendingQty > 0);
  const hasObjects = lines.length > 0 && lines.some((line) => line.actualQty > 0) && lines.every((line) => {
    const objects = byMaterial.get(id(line.rawMaterialId)).materialType === 'FABRIC' ? line.rolls : line.lots;
    return same(objects.reduce((sum, item) => sum + (item.lengthMeters ?? item.countedQty), 0), line.actualQty);
  });
  return { supplierId: supplier._id, supplierDeliveryCode: code || undefined, replacementForTicketId, receivedAt,
    handoverName, receivingLocationId: location._id, receiptNote: String(input.receiptNote || '').trim(),
    receiptLines: lines, status: hasPending ? 'WAITING_QC' : hasObjects ? 'READY_TO_CONFIRM' : 'DRAFT' };
}

/** Creates a direct supplier receipt with an atomic human-readable code. */
export async function createSupplierReceipt(input, user) {
  const draft = await validateSupplierReceiptDraft(input, user);
  const ticketCode = await CounterSequence.getNextSequence('MATERIAL_SUPPLIER_RECEIPT', 'PNNL', 6);
  return MaterialTicket.create({ ...draft, ticketCode, ticketType: 'INBOUND_FROM_SUPPLIER',
    createdByManagerId: user._id, receiptVersion: 0 });
}

/** Replaces a draft only at its current version. */
export async function updateSupplierReceipt(receiptId, input, user) {
  const { receipt } = await getSupplierReceipt(receiptId, user);
  fail(editable.includes(receipt.status), 'Phiếu không còn chỉnh sửa được', 'RECEIPT_LOCKED', 409);
  fail(Number(input.expectedVersion) === receipt.receiptVersion, 'Phiếu đã thay đổi; hãy tải lại', 'VERSION_CONFLICT', 409);
  const draft = await validateSupplierReceiptDraft(input, user, receipt);
  const updated = await MaterialTicket.findOneAndUpdate({ _id: receiptId, receiptVersion: receipt.receiptVersion,
    status: { $in: editable } }, { $set: draft, $inc: { receiptVersion: 1 } }, { new: true, runValidators: true });
  fail(updated, 'Phiếu đã thay đổi; hãy tải lại', 'VERSION_CONFLICT', 409);
  return updated;
}

/** Keeps cancellation auditable without changing stock. */
export async function cancelSupplierReceipt(receiptId, input, user) {
  const { receipt } = await getSupplierReceipt(receiptId, user);
  fail(editable.includes(receipt.status) && Number(input.expectedVersion) === receipt.receiptVersion,
    'Phiếu đã thay đổi hoặc không thể hủy', 'VERSION_CONFLICT', 409);
  const result = await MaterialTicket.findOneAndUpdate({ _id: receiptId, receiptVersion: receipt.receiptVersion,
    status: { $in: editable } }, { $set: { status: 'CANCELLED' }, $inc: { receiptVersion: 1 } }, { new: true });
  fail(result, 'Phiếu đã thay đổi', 'VERSION_CONFLICT', 409);
  return result;
}

/** Uploads a bounded delivery document and records its immutable URL on an editable receipt. */
export async function uploadSupplierReceiptAttachment(receiptId, bytes, mimeType, fileName, user) {
  const { receipt } = await getSupplierReceipt(receiptId, user);
  fail(editable.includes(receipt.status), 'Phiếu đã khóa chứng từ', 'RECEIPT_LOCKED', 409);
  const maxBytes = Number(process.env.MATERIAL_RECEIPT_ATTACHMENT_MAX_BYTES) || 5 * 1024 * 1024;
  fail(Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.length <= maxBytes,
    'Tệp rỗng hoặc vượt giới hạn dung lượng', 'INVALID_ATTACHMENT_SIZE');
  const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
  fail(allowed.includes(mimeType), 'Định dạng chứng từ không được hỗ trợ', 'INVALID_ATTACHMENT_TYPE');
  const signature = mimeType === 'application/pdf' ? bytes.subarray(0, 4).toString() === '%PDF'
    : mimeType === 'image/jpeg' ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
      : mimeType === 'image/png' ? bytes.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))
        : bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
  fail(signature, 'Nội dung tệp không khớp định dạng', 'INVALID_ATTACHMENT_TYPE');
  fail((receipt.receiptAttachments || []).length < 10, 'Phiếu chỉ nhận tối đa 10 chứng từ', 'ATTACHMENT_LIMIT');
  let decodedName;
  try { decodedName = decodeURIComponent(String(fileName || 'chung-tu')); }
  catch { decodedName = 'chung-tu'; }
  const name = decodedName.replace(/[\\/\r\n]/g, '').slice(0, 120);
  configureProductCloudinary();
  const publicId = `arawms/material-receipts/${receipt.ticketCode}/${randomUUID()}`;
  const resourceType = mimeType === 'application/pdf' ? 'raw' : 'image';
  const uploaded = await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({ public_id: publicId, resource_type: resourceType,
      overwrite: false, unique_filename: false }, (error, result) => error ? reject(error) : resolve(result));
    stream.end(bytes);
  });
  fail(uploaded?.secure_url && uploaded?.public_id, 'Không lưu được chứng từ', 'ATTACHMENT_UPLOAD_FAILED', 502);
  try {
    const attachment = { fileName: name, mimeType, url: uploaded.secure_url,
      publicId: uploaded.public_id, uploadedByUserId: user._id, uploadedAt: new Date() };
    const updated = await MaterialTicket.findOneAndUpdate({ _id: receiptId, receiptVersion: receipt.receiptVersion,
      status: { $in: editable } }, { $push: { receiptAttachments: attachment }, $inc: { receiptVersion: 1 } },
    { new: true, runValidators: true });
    fail(updated, 'Phiếu đã thay đổi; hãy tải lại trước khi đính kèm', 'VERSION_CONFLICT', 409);
    return updated;
  } catch (error) {
    await cloudinary.uploader.destroy(uploaded.public_id, { resource_type: resourceType }).catch(() => {});
    throw error;
  }
}

/** Rechecks every physical quantity, quality decision, shelf, and capacity at commit time. */
function validateConfirmation(receipt, materials, locations, user) {
  const byMaterial = new Map(materials.map((item) => [id(item._id), item]));
  const byLocation = new Map(locations.map((item) => [id(item._id), item]));
  const allocations = new Map();
  const units = new Map();
  fail(receipt.receiptLines.some((line) => line.actualQty > 0), 'Phiếu chưa có hàng thực nhận', 'EMPTY_RECEIPT');
  for (const line of receipt.receiptLines) {
    const material = byMaterial.get(id(line.rawMaterialId));
    fail(material, 'Nguyên phụ liệu không còn hoạt động', 'MATERIAL_UNAVAILABLE', 409);
    fail(same(line.actualQty, line.acceptedQty + line.rejectedQty + line.pendingQty), 'Kết quả kiểm nhận không khớp', 'INSPECTION_TOTAL_MISMATCH');
    fail(line.pendingQty === 0, 'Còn hàng chờ kiểm tra', 'QUALITY_PENDING');
    fail(!line.rejectedQty || line.defectReason, 'Cần lý do hàng không đạt', 'DEFECT_REASON_REQUIRED');
    fail(!line.actualQty || line.inspectedByUserId && line.inspectedAt &&
      (line.inspectionConclusion || line.qualityInspectionRef),
    'Cần người kiểm tra, thời gian và kết luận hoặc tham chiếu KCS', 'INSPECTION_REQUIRED');
    const objects = material.materialType === 'FABRIC' ? line.rolls : line.lots;
    fail(material.materialType === 'FABRIC' ? !line.lots.length && material.unit === 'METER' : !line.rolls.length,
      'Loại cây/lô hoặc đơn vị tồn không được hỗ trợ', 'OBJECT_TYPE_INVALID');
    for (const quality of ['ACCEPTED', 'REJECTED']) {
      const total = objects.filter((item) => item.quality === quality)
        .reduce((sum, item) => sum + (material.materialType === 'FABRIC' ? item.lengthMeters : item.countedQty), 0);
      fail(same(total, quality === 'ACCEPTED' ? line.acceptedQty : line.rejectedQty),
        'Tổng cây/lô không khớp kiểm nhận', 'OBJECT_TOTAL_MISMATCH');
    }
    for (const object of objects) {
      const value = material.materialType === 'FABRIC' ? object.lengthMeters : object.countedQty;
      fail(value > 0 && ['ACCEPTED', 'REJECTED'].includes(object.quality), 'Cây/lô cần số lượng và kết quả', 'INVALID_OBJECT');
      fail(object.quality !== 'REJECTED' || object.defectReason, 'Cây/lô không đạt cần lý do', 'DEFECT_REASON_REQUIRED');
      fail(material.materialType === 'FABRIC' ? object.widthCm > 0 : object.packageCount > 0 && object.unitsPerPackage > 0,
        'Thiếu khổ vải hoặc quy cách bao gói', 'OBJECT_DETAILS_REQUIRED');
      const destinations = material.materialType === 'FABRIC'
        ? [{ locationId: object.locationId, quantity: value }] : object.allocations;
      fail(destinations.length > 0 && same(destinations.reduce((sum, item) => sum + item.quantity, 0), value),
        'Tổng phân bổ vị trí phải bằng số lượng cây/lô', 'LOCATION_TOTAL_MISMATCH');
      const seen = new Set();
      for (const item of destinations) {
        const key = id(item.locationId);
        const location = byLocation.get(key);
        fail(location && item.quantity > 0 && !seen.has(key) && accessible(location, user),
          'Vị trí không hợp lệ hoặc phân bổ trùng', 'INVALID_LOCATION');
        seen.add(key);
        fail(location.warehouseType === (object.quality === 'ACCEPTED' ? 'RAW_MATERIAL' : 'DEFECT_QUARANTINE'),
          'Hàng đạt và không đạt phải ở đúng khu', 'WRONG_LOCATION_TYPE');
        fail((!location.capacityUnit || location.capacityUnit === material.unit) &&
          (!units.has(key) || units.get(key) === material.unit) &&
          (location.capacityUnit || !location.currentOccupancy), 'Đơn vị sức chứa không khớp', 'LOCATION_UNIT_MISMATCH');
        units.set(key, material.unit);
        allocations.set(key, round((allocations.get(key) || 0) + item.quantity));
      }
    }
  }
  for (const [key, amount] of allocations) {
    const location = byLocation.get(key);
    fail(round(location.currentOccupancy + amount) <= location.maxCapacity + 0.0001,
      `Vị trí ${location.locationCode} không đủ sức chứa`, 'LOCATION_FULL', 409);
  }
  return { allocations, units, byMaterial, byLocation };
}

/** Confirms the direct receipt exactly once and commits objects, stock, ledger, and audit atomically. */
export async function confirmSupplierReceipt(receiptId, input, user) {
  fail(mongoose.isValidObjectId(receiptId), 'Mã phiếu không hợp lệ', 'INVALID_RECEIPT');
  const key = String(input.idempotencyKey || '').trim();
  fail(/^[A-Za-z0-9_-]{8,100}$/.test(key), 'Thiếu khóa xác nhận', 'IDEMPOTENCY_KEY_REQUIRED');
  const fingerprint = createHash('sha256').update(JSON.stringify({ expectedVersion: input.expectedVersion })).digest('hex');
  const session = await mongoose.startSession();
  try {
    let confirmed;
    await session.withTransaction(async () => {
      const receipt = await MaterialTicket.findOne({ _id: receiptId, ticketType: 'INBOUND_FROM_SUPPLIER',
        isDeleted: { $ne: true } }).session(session);
      fail(receipt, 'Không tìm thấy phiếu nhập', 'RECEIPT_NOT_FOUND', 404);
      fail(accessible({ _id: receipt.receivingLocationId }, user), 'Bạn không có quyền xác nhận', 'RECEIPT_FORBIDDEN', 403);
      if (receipt.status === 'COMPLETED') {
        fail(receipt.confirmationKey === key && receipt.confirmationFingerprint === fingerprint,
          'Phiếu đã xác nhận bằng yêu cầu khác', 'IDEMPOTENCY_CONFLICT', 409);
        confirmed = receipt;
        return;
      }
      fail(editable.includes(receipt.status), 'Phiếu không thể xác nhận', 'RECEIPT_LOCKED', 409);
      fail(Number(input.expectedVersion) === receipt.receiptVersion, 'Phiếu đã thay đổi; hãy tải lại', 'VERSION_CONFLICT', 409);
      const supplier = await Supplier.findOne({ _id: receipt.supplierId, isActive: true, isDeleted: { $ne: true } }).session(session);
      fail(supplier, 'Nhà cung cấp không còn hoạt động', 'SUPPLIER_UNAVAILABLE', 409);
      const materials = await RawMaterial.find({ _id: { $in: receipt.receiptLines.map((line) => line.rawMaterialId) },
        isActive: true, isDeleted: { $ne: true } }).session(session);
      const locationIds = new Set([id(receipt.receivingLocationId)]);
      for (const line of receipt.receiptLines) {
        for (const roll of line.rolls) locationIds.add(id(roll.locationId));
        for (const lot of line.lots) for (const item of lot.allocations) locationIds.add(id(item.locationId));
      }
      const locations = await WarehouseLocation.find({ _id: { $in: [...locationIds].filter(mongoose.isValidObjectId) }, status: 'ACTIVE',
        isFrozenForStocktake: false, isDeleted: { $ne: true } }).session(session);
      const receiving = locations.find((item) => id(item._id) === id(receipt.receivingLocationId));
      fail(receiving?.warehouseType === 'RAW_MATERIAL' && accessible(receiving, user), 'Kho nhận không hợp lệ', 'INVALID_RECEIVING_LOCATION');
      const { allocations, units, byMaterial, byLocation } = validateConfirmation(receipt, materials, locations, user);
      for (const [locationId, amount] of allocations) {
        const updated = await WarehouseLocation.updateOne({ _id: locationId, status: 'ACTIVE', isFrozenForStocktake: false,
          $or: [{ capacityUnit: units.get(locationId) }, { capacityUnit: null }],
          $expr: { $gte: [{ $subtract: ['$maxCapacity', { $ifNull: ['$currentOccupancy', 0] }] }, amount] } },
        { $inc: { currentOccupancy: amount }, $set: { capacityUnit: units.get(locationId) } }, { session });
        fail(updated.matchedCount === 1, 'Sức chứa vị trí đã thay đổi', 'LOCATION_FULL', 409);
      }
      const now = new Date();
      const quarantineBalances = new Map(locations.filter((item) => item.warehouseType === 'DEFECT_QUARANTINE')
        .map((item) => [id(item._id), item.currentOccupancy || 0]));
      for (const [lineIndex, line] of receipt.receiptLines.entries()) {
        const material = byMaterial.get(id(line.rawMaterialId));
        for (const [objectIndex, roll] of line.rolls.entries()) {
          await FabricRoll.create([{ rollBarcode: `FR-${String(receipt._id).toUpperCase()}-${lineIndex}-${objectIndex}`,
            rawMaterialId: material._id, supplierId: receipt.supplierId, inboundTicketId: receipt._id,
            clientLineId: roll.clientLineId, supplierRollCode: roll.supplierRollCode, supplierLotCode: roll.lotCode,
            measuredWidthCm: roll.widthCm, defectReason: roll.defectReason,
            initialLengthMeters: roll.lengthMeters, currentLengthMeters: roll.lengthMeters,
            initialWeightKg: roll.weightKg, currentWeightKg: roll.weightKg,
            unitCostPerMeter: material.unitCost, locationId: roll.locationId, fifoInboundTimestamp: now,
            status: roll.quality === 'ACCEPTED' ? 'QC_PASSED' : 'DEFECTIVE' }], { session });
        }
        for (const [objectIndex, lot] of line.lots.entries()) {
          await MaterialStockLot.create([{ lotBarcode: `ML-${String(receipt._id).toUpperCase()}-${lineIndex}-${objectIndex}`,
            rawMaterialId: material._id, supplierId: receipt.supplierId, inboundTicketId: receipt._id,
            clientLineId: lot.clientLineId, supplierLotCode: lot.supplierLotCode,
            packageUnit: lot.packageUnit, packageCount: lot.packageCount, unitsPerPackage: lot.unitsPerPackage,
            initialQty: lot.countedQty, currentQty: lot.countedQty, quality: lot.quality,
            status: lot.quality === 'ACCEPTED' ? 'PENDING_PUTAWAY' : 'QUARANTINED',
            defectReason: lot.defectReason, fifoInboundTimestamp: now, allocations: lot.allocations }], { session });
        }
        if (line.acceptedQty > 0) {
          const before = material.onHandQty || 0;
          material.onHandQty = round(before + line.acceptedQty);
          material.pendingPutawayQty = round((material.pendingPutawayQty || 0) + line.acceptedQty);
          await material.save({ session });
          const accepted = material.materialType === 'FABRIC' ? line.rolls.filter((item) => item.quality === 'ACCEPTED')
            .map((item) => [{ locationId: item.locationId, quantity: item.lengthMeters }])
            : line.lots.filter((item) => item.quality === 'ACCEPTED').map((item) => item.allocations);
          const totals = new Map();
          for (const allocation of accepted.flat()) totals.set(id(allocation.locationId),
            round((totals.get(id(allocation.locationId)) || 0) + allocation.quantity));
          let running = before;
          for (const [locationId, amount] of totals) {
            await InventoryTransaction.create([{ transactionCode: `MRI-${receipt._id}-${lineIndex}-${locationId}`,
              warehouseType: 'RAW_MATERIAL', itemType: 'RAW_MATERIAL', rawMaterialId: material._id,
              locationId, transactionType: 'INBOUND_RECEIPT', referenceModel: 'MaterialTicket', referenceId: receipt._id,
              quantityChange: amount, onHandBefore: running, onHandAfter: round(running + amount),
              unitCostSnapshot: material.unitCost, performedByUserId: user._id }], { session });
            running = round(running + amount);
          }
        }
        const rejected = material.materialType === 'FABRIC' ? line.rolls.filter((item) => item.quality === 'REJECTED')
          .map((item) => [{ locationId: item.locationId, quantity: item.lengthMeters, reason: item.defectReason }])
          : line.lots.filter((item) => item.quality === 'REJECTED')
            .map((item) => item.allocations.map((allocation) => ({ ...allocation.toObject(), reason: item.defectReason })));
        for (const [index, allocation] of rejected.flat().entries()) {
          const locationId = id(allocation.locationId);
          const before = quarantineBalances.get(locationId) || 0;
          await InventoryTransaction.create([{ transactionCode: `MQI-${receipt._id}-${lineIndex}-${index}`,
            warehouseType: 'DEFECT_QUARANTINE', itemType: 'RAW_MATERIAL', rawMaterialId: material._id,
            locationId, transactionType: 'DEFECT_QUARANTINE', referenceModel: 'MaterialTicket', referenceId: receipt._id,
            quantityChange: allocation.quantity, onHandBefore: before, onHandAfter: round(before + allocation.quantity),
            performedByUserId: user._id, note: allocation.reason }], { session });
          quarantineBalances.set(locationId, round(before + allocation.quantity));
        }
      }
      receipt.status = 'COMPLETED';
      receipt.confirmationKey = key;
      receipt.confirmationFingerprint = fingerprint;
      receipt.confirmedAt = now;
      receipt.confirmedByUserId = user._id;
      receipt.receiptVersion += 1;
      await receipt.save({ session });
      await SystemLog.create([{ actorId: user._id, actorRole: user.roles?.[0] || 'WAREHOUSE_MANAGER',
        majorFeature: 'RAW_MATERIAL', subFeature: 'SUPPLIER_INBOUND', action: 'CONFIRM_RECEIPT',
        targetCollection: 'material_tickets', targetId: receipt._id, targetCode: receipt.ticketCode,
        afterSnapshot: { status: receipt.status, receivedAt: receipt.receivedAt,
          lines: receipt.receiptLines.map((line) => ({ rawMaterialId: line.rawMaterialId,
            actualQty: line.actualQty, acceptedQty: line.acceptedQty, rejectedQty: line.rejectedQty })) } }], { session });
      confirmed = receipt;
    });
    scheduleBarcodeImages('RAW_MATERIAL', String(confirmed._id));
    return confirmed;
  } finally { await session.endSession(); }
}
