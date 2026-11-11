/*
 * File: outboundExecution.service.js
 * Description: Manages material issue drafts and atomically deducts checked physical sources.
 */
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { isFractionalMaterialUnit } from '../../../common/constants/materialUnits.js';
import FabricRoll from '../../../models/FabricRoll.model.js';
import MaterialStockLot from '../../../models/MaterialStockLot.model.js';
import MaterialOutbound from '../../../models/MaterialOutbound.model.js';
import MaterialTicket from '../../../models/MaterialTicket.model.js';
import RawMaterial from '../../../models/RawMaterial.model.js';
import WarehouseLocation from '../../../models/WarehouseLocation.model.js';
import WarehouseStockBarcode from '../../../models/WarehouseStockBarcode.model.js';
import InventoryTransaction from '../../../models/InventoryTransaction.model.js';
import User from '../../../models/User.model.js';
import WarehouseLayout from '../../../models/WarehouseLayout.model.js';
import { publishRealtime } from '../../../common/services/realtime.js';
import { canAccessLocation, hasWholeWarehouseAccess } from '../../../common/services/warehouseAccess.js';

const id = (value) => String(value || '');
const round = (value) => Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;
const equal = (a, b) => Math.abs(Number(a) - Number(b)) < 0.0001;
const error = (message, code, status = 400) => Object.assign(new Error(message), { code, status });
const requireRule = (condition, message, code, status) => { if (!condition) throw error(message, code, status); };
const permitted = (user) => user?.roles?.some((role) => ['OWNER', 'ADMIN', 'WAREHOUSE_MANAGER', 'WAREHOUSE_STAFF'].includes(role));
const access = (location, user) => canAccessLocation(location, user);
const quantity = (value, unit) => {
  const n = Number(value);
  const scale = isFractionalMaterialUnit(unit) ? 1000 : 1;
  requireRule(value !== '' && value != null && Number.isFinite(n) && n > 0 &&
    Math.abs(n * scale - Math.round(n * scale)) < 0.000001, 'Số lượng không hợp lệ theo đơn vị quản lý', 'INVALID_QUANTITY');
  return round(n);
};
const safeTicket = (ticket) => {
  const plain = ticket.toObject ? ticket.toObject() : ticket;
  delete plain.confirmationKey;
  return plain;
};
const outboundTicketFilter = { ticketType: 'OUTBOUND_WAREHOUSE' };

/** Resolves friendly Vietnamese rack name ("Kệ vải", "Kệ hộp", etc.) avoiding repeating bare codes */
export const resolveRackName = (rackName, rackCode, material, locationCode) => {
  const cleanName = String(rackName || '').trim();
  const cleanCode = String(rackCode || '').trim().toUpperCase();
  const cleanLoc = String(locationCode || '').trim().toUpperCase();

  // If rackName is already a valid descriptive name (not equal to raw code)
  if (
    cleanName &&
    cleanName.toUpperCase() !== cleanCode &&
    cleanName.toUpperCase() !== cleanLoc &&
    cleanName.toUpperCase() !== `KỆ ${cleanCode}` &&
    cleanName.toUpperCase() !== `KE ${cleanCode}` &&
    !/^([A-Z0-9_-]+)$/.test(cleanName)
  ) {
    if (/^(vải|hộp|phụ liệu|chỉ|cuộn)/i.test(cleanName)) {
      return `Kệ ${cleanName.toLowerCase()}`;
    }
    return cleanName.startsWith('Kệ ') || cleanName.startsWith('kệ ') ? cleanName : `Kệ ${cleanName}`;
  }

  // Location code / rack code hints
  if (cleanLoc.includes('VAI') || cleanCode.includes('VAI')) return 'Kệ vải';
  if (cleanLoc.includes('HOP') || cleanCode.includes('HOP') || cleanCode.includes('PK')) return 'Kệ hộp';

  // Material type / unit hints
  const matType = material?.materialType || material?.type;
  const unit = String(material?.unit || '').toUpperCase();
  const matName = String(material?.materialName || material?.name || '').toLowerCase();

  if (matType === 'FABRIC' || unit === 'METER' || matName.includes('vải')) {
    return 'Kệ vải';
  }

  if (
    matType === 'AUXILIARY' ||
    ['SPOOL', 'PIECE', 'SET', 'BOX', 'BAG', 'CONE', 'KG'].includes(unit) ||
    matName.includes('cúc') ||
    matName.includes('chỉ') ||
    matName.includes('khóa') ||
    matName.includes('nút') ||
    matName.includes('chun') ||
    matName.includes('mác') ||
    matName.includes('nhãn')
  ) {
    return 'Kệ hộp';
  }

  return unit === 'METER' ? 'Kệ vải' : 'Kệ hộp';
};

/** Lists usable materials and physical sources without exposing receipt unit costs. */
export async function getOutboundOptions(user) {
  requireRule(permitted(user), 'Không có quyền xuất kho nguyên phụ liệu', 'FORBIDDEN', 403);
  const locations = await WarehouseLocation.find({ warehouseType: 'RAW_MATERIAL', status: { $in: ['ACTIVE', 'FULL'] },
    isFrozenForStocktake: false, isDeleted: { $ne: true } }).select('locationCode zoneCode rackCode floorNo binNo shelfCode currentOccupancy').lean();
  const allowed = locations.filter((location) => access(location, user));
  const locationIds = allowed.map((location) => location._id);
  const [materials, rolls, lots] = await Promise.all([
    RawMaterial.find({ isActive: true, isDeleted: { $ne: true } }).select('materialCode materialName materialType color widthCm gsm unit onHandQty reservedQty pendingPutawayQty').lean(),
    FabricRoll.find({ locationId: { $in: locationIds }, status: 'IN_STOCK', currentLengthMeters: { $gt: 0 }, isDeleted: { $ne: true } })
      .select('rollBarcode rawMaterialId locationId inboundTicketId currentLengthMeters pendingReturnQty fifoInboundTimestamp').lean(),
    MaterialStockLot.find({ status: 'IN_STOCK', quality: 'ACCEPTED', currentQty: { $gt: 0 },
      'allocations.locationId': { $in: locationIds }, isDeleted: { $ne: true } })
      .select('lotBarcode rawMaterialId inboundTicketId currentQty allocations fifoInboundTimestamp').lean(),
  ]);
  const byLocation = new Map(allowed.map((location) => [id(location._id), location]));
  const sources = [
    ...rolls.map((roll) => ({ kind: 'ROLL', objectId: roll._id, barcode: roll.rollBarcode,
      rawMaterialId: roll.rawMaterialId, locationId: roll.locationId, inboundTicketId: roll.inboundTicketId,
      available: round(Math.max(0, roll.currentLengthMeters - (roll.pendingReturnQty || 0))),
      fifoInboundTimestamp: roll.fifoInboundTimestamp })).filter((source) => source.available > 0),
    ...lots.flatMap((lot) => lot.allocations.filter((allocation) => byLocation.has(id(allocation.locationId)) && allocation.putawayQty > 0)
      .map((allocation) => ({ kind: 'LOT', objectId: lot._id, barcode: lot.lotBarcode,
        rawMaterialId: lot.rawMaterialId, locationId: allocation.locationId, inboundTicketId: lot.inboundTicketId,
        available: Math.min(lot.currentQty, allocation.putawayQty), fifoInboundTimestamp: lot.fifoInboundTimestamp }))),
  ].map((source) => ({ ...source, locationCode: byLocation.get(id(source.locationId))?.locationCode }))
    .sort((a, b) => new Date(a.fifoInboundTimestamp) - new Date(b.fifoInboundTimestamp));
  return { warehouses: [...new Set(allowed.map((item) => item.zoneCode))], locations: allowed,
    materials: materials.map(({ onHandQty, reservedQty, pendingPutawayQty, ...material }) => ({ ...material,
      available: round(Math.max(0, (onHandQty || 0) - (reservedQty || 0) - (pendingPutawayQty || 0))) })), sources };
}

/** Returns a scoped list; separate units remain on their own lines. */
export async function listOutbounds(query, user) {
  requireRule(permitted(user), 'Không có quyền xem phiếu xuất', 'FORBIDDEN', 403);
  const filter = { isDeleted: { $ne: true } };
  if (query.warehouseCode) filter.warehouseCode = String(query.warehouseCode);
  if (query.status) {
    requireRule(['DRAFT', 'COMPLETED', 'CANCELLED'].includes(query.status), 'Trạng thái không hợp lệ', 'INVALID_STATUS');
    filter.status = query.status;
  }
  if (query.from || query.to) {
    filter.issueDate = {};
    if (query.from) filter.issueDate.$gte = new Date(`${query.from}T00:00:00Z`);
    if (query.to) filter.issueDate.$lte = new Date(`${query.to}T23:59:59Z`);
    requireRule(Object.values(filter.issueDate).every((date) => !Number.isNaN(date.getTime())), 'Ngày lọc không hợp lệ', 'INVALID_DATE');
  }
  const [current, legacy] = await Promise.all([
    MaterialTicket.find({ ...filter, ...outboundTicketFilter }).populate('createdByUserId', 'fullName')
      .populate('confirmedByUserId', 'fullName').sort({ createdAt: -1 }).limit(200).lean(),
    MaterialOutbound.find(filter).populate('createdByUserId', 'fullName')
      .populate('confirmedByUserId', 'fullName').sort({ createdAt: -1 }).limit(200).lean(),
  ]);
  const currentIds = new Set(current.map((ticket) => id(ticket._id)));
  const tickets = [...current, ...legacy.filter((ticket) => !currentIds.has(id(ticket._id)))]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 200);
  const allowed = hasWholeWarehouseAccess(user) ? null : await WarehouseLocation.find({ _id: { $in: user.warehouseIds } }).select('zoneCode').lean();
  const zones = allowed && new Set(allowed.map((location) => location.zoneCode));
  const search = String(query.search || '').trim().toLocaleLowerCase('vi');
  return tickets.filter((ticket) => (!zones || zones.has(ticket.warehouseCode)) && (!query.department || ticket.department === query.department) &&
    (!search || [ticket.ticketCode, ticket.recipient, ...(ticket.lines || []).map((line) => `${line.materialCode} ${line.materialName}`)]
      .some((value) => String(value || '').toLocaleLowerCase('vi').includes(search)))).map((ticket) => safeTicket({ ...ticket, lines: ticket.lines || [] }));
}

/** Reads only tickets belonging to a warehouse the user can access. */
export async function getOutbound(ticketId, user) {
  requireRule(mongoose.isValidObjectId(ticketId), 'Mã phiếu không hợp lệ', 'INVALID_TICKET');
  const ticket = await MaterialTicket.findOne({ _id: ticketId, ...outboundTicketFilter }) ||
    await MaterialOutbound.findById(ticketId);
  requireRule(ticket, 'Không tìm thấy phiếu xuất', 'TICKET_NOT_FOUND', 404);
  const locations = await WarehouseLocation.find({ warehouseType: 'RAW_MATERIAL', zoneCode: ticket.warehouseCode }).select('_id').lean();
  requireRule(locations.some((location) => access(location, user)), 'Không có quyền xem kho này', 'FORBIDDEN', 403);
  return ticket;
}

/** Saves an unreserved draft; changed source quantities lose physical check marks. */
export async function saveOutbound(ticketId, input, user) {
  requireRule(permitted(user), 'Không có quyền lập phiếu xuất', 'FORBIDDEN', 403);
  const warehouseCode = String(input.warehouseCode || '').trim();
  const locations = await WarehouseLocation.find({ warehouseType: 'RAW_MATERIAL', zoneCode: warehouseCode,
    isDeleted: { $ne: true } }).select('locationCode zoneCode status isFrozenForStocktake').lean();
  requireRule(locations.some((location) => access(location, user)), 'Kho xuất không hợp lệ', 'INVALID_WAREHOUSE');
  const issueDate = new Date(input.issueDate);
  requireRule(!Number.isNaN(issueDate.getTime()), 'Ngày xuất không hợp lệ', 'INVALID_DATE');
  const todayInWarehouse = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
  requireRule(user.roles?.some((role) => ['OWNER', 'ADMIN', 'WAREHOUSE_MANAGER'].includes(role)) ||
    String(input.issueDate).slice(0, 10) === todayInWarehouse,
  'Không có quyền đổi ngày xuất', 'ISSUE_DATE_FORBIDDEN', 403);
  const fields = ['department', 'recipient', 'purpose'].map((key) => String(input[key] || '').trim().slice(0, 200));
  requireRule(Array.isArray(input.lines) && input.lines.length <= 100, 'Danh sách mặt hàng không hợp lệ', 'INVALID_LINES');
  const existing = ticketId ? await getOutbound(ticketId, user) : null;
  requireRule(!existing || existing.status === 'DRAFT', 'Phiếu không còn là bản nháp', 'TICKET_LOCKED', 409);
  if (existing) requireRule(Number(input.version) === existing.version, 'Bản nháp đã thay đổi, hãy tải lại', 'VERSION_CONFLICT', 409);
  const previous = new Map((existing?.lines || []).flatMap((line) => line.sources.map((source) =>
    [`${id(line.rawMaterialId)}:${id(source.objectId)}:${id(source.locationId)}:${source.quantity}`, source])));
  const materialIds = input.lines.map((line) => line.rawMaterialId);
  requireRule(new Set(materialIds.map(id)).size === materialIds.length && materialIds.every(mongoose.isValidObjectId),
    'Mặt hàng bị trùng hoặc không hợp lệ', 'INVALID_LINES');
  const materials = await RawMaterial.find({ _id: { $in: materialIds }, isActive: true }).lean();
  const materialMap = new Map(materials.map((material) => [id(material._id), material]));
  const lines = [];
  for (const inputLine of input.lines) {
    const material = materialMap.get(id(inputLine.rawMaterialId));
    requireRule(material, 'Nguyên phụ liệu không còn hoạt động', 'MATERIAL_UNAVAILABLE', 409);
    const requested = inputLine.quantity === '' || inputLine.quantity == null || Number(inputLine.quantity) === 0
      ? 0 : quantity(inputLine.quantity, material.unit);
    const sources = [];
    const seen = new Set();
    for (const entry of inputLine.sources || []) {
      requireRule(mongoose.isValidObjectId(entry.objectId) && mongoose.isValidObjectId(entry.locationId), 'Nguồn lấy không hợp lệ', 'INVALID_SOURCE');
      const key = `${id(entry.objectId)}:${id(entry.locationId)}`;
      requireRule(!seen.has(key), 'Nguồn lấy bị trùng', 'DUPLICATE_SOURCE');
      seen.add(key);
      const location = locations.find((item) => id(item._id) === id(entry.locationId));
      requireRule(location && access(location, user), 'Vị trí lấy không thuộc kho xuất', 'INVALID_LOCATION');
      const object = material.materialType === 'FABRIC'
        ? await FabricRoll.findById(entry.objectId).lean() : await MaterialStockLot.findById(entry.objectId).lean();
      requireRule(object && id(object.rawMaterialId) === id(material._id) &&
        (material.materialType === 'FABRIC' ? id(object.locationId) === id(location._id) :
          object.allocations.some((allocation) => id(allocation.locationId) === id(location._id))),
      'Cây/lô không thuộc mặt hàng và vị trí đã chọn', 'SOURCE_MISMATCH');
      const picked = quantity(entry.quantity, material.unit);
      const previousLine = existing?.lines.find((line) => id(line.rawMaterialId) === id(material._id));
      const old = equal(previousLine?.quantity, requested) ? previous.get(`${id(material._id)}:${key}:${picked}`) : null;
      sources.push({ kind: material.materialType === 'FABRIC' ? 'ROLL' : 'LOT', objectId: object._id,
        barcode: object.rollBarcode || object.lotBarcode, locationId: location._id, locationCode: location.locationCode,
        inboundTicketId: object.inboundTicketId, quantity: picked,
        checkedByUserId: old?.checkedByUserId, checkedAt: old?.checkedAt, checkedQuantity: old?.checkedQuantity });
    }
    requireRule(round(sources.reduce((sum, source) => sum + source.quantity, 0)) <= requested + 0.0001,
      'Tổng nguồn lấy vượt số lượng cần xuất', 'SOURCE_OVER_REQUEST');
    lines.push({ rawMaterialId: material._id, materialCode: material.materialCode,
      materialName: material.materialName, color: material.color, unit: material.unit, quantity: requested, sources });
  }
  if (!existing) return MaterialTicket.create({ ticketType: 'OUTBOUND_WAREHOUSE', status: 'DRAFT',
    createdByManagerId: user._id, ticketCode: `XNL-${Date.now()}-${randomUUID().slice(0, 6).toUpperCase()}`,
    warehouseCode, issueDate, department: fields[0], recipient: fields[1], purpose: fields[2], lines,
    createdByUserId: user._id, updatedByUserId: user._id });
  existing.set({ warehouseCode, issueDate, department: fields[0], recipient: fields[1], purpose: fields[2], lines,
    updatedByUserId: user._id, version: existing.version + 1 });
  await existing.save();
  return existing;
}

/** A barcode identifies a chosen source; the operator explicitly attests its picked quantity. */
export async function checkOutboundSource(ticketId, input, user) {
  const ticket = await getOutbound(ticketId, user);
  requireRule(ticket.status === 'DRAFT', 'Phiếu không còn là bản nháp', 'TICKET_LOCKED', 409);
  const barcode = String(input.barcode || '').trim().toUpperCase();
  const matches = ticket.lines.flatMap((line) => line.sources.map((source) => ({ line, source })))
    .filter(({ source }) => source.barcode.toUpperCase() === barcode &&
      (!input.locationId || id(source.locationId) === id(input.locationId)));
  requireRule(matches.length, 'Cây/lô này không nằm trong lựa chọn xuất', 'SOURCE_NOT_SELECTED', 409);
  requireRule(matches.length === 1, 'Mã lô có nhiều vị trí; cần chọn đúng vị trí lấy', 'AMBIGUOUS_SOURCE', 409);
  const { line, source } = matches[0];
  requireRule(!source.checkedAt, 'Nguồn này đã được kiểm tra', 'SOURCE_ALREADY_CHECKED', 409);
  requireRule(equal(quantity(input.quantity, line.unit), source.quantity), 'Lượng thực lấy không khớp lựa chọn', 'CHECK_QUANTITY_MISMATCH');
  await verifySource(source, line, ticket.warehouseCode, user);
  source.checkedByUserId = user._id;
  source.checkedAt = new Date();
  source.checkedQuantity = source.quantity;
  ticket.version += 1;
  await ticket.save();
  return ticket;
}

async function verifySource(source, line, warehouseCode, user, session) {
  const location = await WarehouseLocation.findById(source.locationId).session(session || null);
  requireRule(location && location.warehouseType === 'RAW_MATERIAL' && location.zoneCode === warehouseCode &&
    access(location, user) && ['ACTIVE', 'FULL'].includes(location.status) && !location.isFrozenForStocktake,
  'Vị trí lấy đã bị khóa hoặc thay đổi', 'LOCATION_UNAVAILABLE', 409);
  const object = source.kind === 'ROLL' ? await FabricRoll.findById(source.objectId).session(session || null)
    : await MaterialStockLot.findById(source.objectId).session(session || null);
  requireRule(object && id(object.rawMaterialId) === id(line.rawMaterialId) &&
    (source.kind === 'ROLL' ? object.rollBarcode === source.barcode && object.status === 'IN_STOCK' &&
      id(object.locationId) === id(location._id) &&
      object.currentLengthMeters - (object.pendingReturnQty || 0) >= source.quantity :
      object.lotBarcode === source.barcode && object.status === 'IN_STOCK' && object.quality === 'ACCEPTED' &&
      object.currentQty >= source.quantity && object.allocations.some((allocation) =>
        id(allocation.locationId) === id(location._id) && allocation.putawayQty >= source.quantity)),
  `Nguồn ${source.barcode} không còn đủ tồn khả dụng`, 'SOURCE_UNAVAILABLE', 409);
  return { location, object };
}

/** Rechecks every source and commits all deductions or none in one MongoDB transaction. */
export async function confirmOutbound(ticketId, input, user) {
  requireRule(permitted(user), 'Không có quyền xuất kho', 'FORBIDDEN', 403);
  const key = String(input.confirmationKey || '').trim();
  requireRule(/^[\w-]{8,100}$/.test(key), 'Mã xác nhận không hợp lệ', 'INVALID_CONFIRMATION_KEY');
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const ticket = await MaterialTicket.findOne({ _id: ticketId, ...outboundTicketFilter }).session(session) ||
        await MaterialOutbound.findById(ticketId).session(session);
      requireRule(ticket, 'Không tìm thấy phiếu xuất', 'TICKET_NOT_FOUND', 404);
      if (ticket.status === 'COMPLETED' && ticket.confirmationKey === key) { result = ticket; return; }
      requireRule(ticket.status === 'DRAFT', 'Phiếu đã xác nhận hoặc hủy', 'TICKET_LOCKED', 409);
      requireRule(Number(input.version) === ticket.version, 'Bản nháp đã thay đổi, hãy tải lại', 'VERSION_CONFLICT', 409);
      requireRule(input.reviewed === true, 'Cần xác nhận đã kiểm tra bàn giao', 'REVIEW_REQUIRED');
      requireRule(ticket.department?.trim() && ticket.recipient?.trim() && ticket.purpose?.trim(),
        'Điền đủ thông tin bàn giao', 'REQUIRED_HANDOVER');
      requireRule(ticket.lines.length > 0, 'Phiếu cần ít nhất một mặt hàng', 'INVALID_LINES');
      const issued = new Map();
      for (const line of ticket.lines) {
        requireRule(line.sources.length > 0 && equal(line.quantity,
          round(line.sources.reduce((sum, source) => sum + source.quantity, 0))),
        'Chưa chọn đủ cây/lô', 'INCOMPLETE_SOURCES');
        let total = 0;
        for (const [index, source] of line.sources.entries()) {
          requireRule(source.checkedAt && equal(source.checkedQuantity, source.quantity),
            `Nguồn ${source.barcode} chưa được kiểm tra thực lấy`, 'UNCHECKED_SOURCE');
          const { location, object } = await verifySource(source, line, ticket.warehouseCode, user, session);
          const before = source.kind === 'ROLL' ? object.currentLengthMeters : object.currentQty;
          if (source.kind === 'ROLL') {
            const changed = await FabricRoll.updateOne({ _id: object._id, status: 'IN_STOCK', locationId: location._id,
              currentLengthMeters: { $gte: source.quantity } },
            { $inc: { currentLengthMeters: -source.quantity },
              ...(equal(before, source.quantity) ? { $set: { status: 'DEPLETED' } } : {}) }, { session });
            requireRule(changed.matchedCount === 1, 'Tồn cây vải đã thay đổi', 'SOURCE_UNAVAILABLE', 409);
          } else {
            const allocation = object.allocations.find((item) => id(item.locationId) === id(location._id));
            allocation.putawayQty = round(allocation.putawayQty - source.quantity);
            object.currentQty = round(object.currentQty - source.quantity);
            await object.save({ session });
          }
          const locationChanged = await WarehouseLocation.updateOne({ _id: location._id, currentOccupancy: { $gte: source.quantity } },
            { $inc: { currentOccupancy: -source.quantity } }, { session });
          requireRule(locationChanged.matchedCount === 1, 'Tồn vị trí đã thay đổi', 'LOCATION_STOCK_CHANGED', 409);
          await InventoryTransaction.create([{ transactionCode: `${ticket.ticketCode}-${line.materialCode}-${index + 1}`,
            warehouseType: 'RAW_MATERIAL', itemType: source.kind === 'ROLL' ? 'FABRIC_ROLL' : 'RAW_MATERIAL',
            rawMaterialId: line.rawMaterialId, ...(source.kind === 'ROLL'
              ? { fabricRollId: source.objectId } : { materialStockLotId: source.objectId }),
            locationId: location._id, transactionType: 'OUTBOUND_ISSUE_CUTTING',
            referenceModel: ticket.ticketType === 'OUTBOUND_WAREHOUSE' ? 'MaterialTicket' : 'MaterialOutbound',
            referenceId: ticket._id, quantityChange: -source.quantity, onHandBefore: before,
            onHandAfter: round(before - source.quantity), performedByUserId: user._id,
            note: `${ticket.ticketCode} · ${ticket.department} · ${source.barcode}` }], { session });
          total = round(total + source.quantity);
        }
        issued.set(id(line.rawMaterialId), round((issued.get(id(line.rawMaterialId)) || 0) + total));
      }
      for (const [materialId, amount] of issued) {
        const updated = await RawMaterial.updateOne({ _id: materialId,
          $expr: { $gte: [{ $subtract: [{ $ifNull: ['$onHandQty', 0] },
            { $add: [{ $ifNull: ['$reservedQty', 0] }, { $ifNull: ['$pendingPutawayQty', 0] }] }] }, amount] } },
        { $inc: { onHandQty: -amount } }, { session });
        requireRule(updated.matchedCount === 1, 'Tồn nguyên phụ liệu đã thay đổi', 'MATERIAL_STOCK_CHANGED', 409);
      }
      ticket.status = 'COMPLETED';
      ticket.confirmationKey = key;
      ticket.confirmedAt = new Date();
      ticket.confirmedByUserId = user._id;
      ticket.version += 1;
      await ticket.save({ session });
      result = ticket;
    });
  } finally { await session.endSession(); }
  return result;
}

/** Cancelling an unconfirmed draft never changes stock. */
export async function cancelOutbound(ticketId, user) {
  const ticket = await getOutbound(ticketId, user);
  requireRule(ticket.status === 'DRAFT', 'Chỉ được hủy bản nháp', 'TICKET_LOCKED', 409);
  ticket.status = 'CANCELLED';
  ticket.cancelledAt = new Date();
  ticket.cancelledByUserId = user._id;
  ticket.version += 1;
  await ticket.save();
  return ticket;
}

/**
 * Workflow: Garment Technician request -> Warehouse Manager approves & assigns -> Warehouse Staff picks & scans -> Handover & Outbound confirmation.
 */

/** Lists outbound requests sent from Garment Technician or other departments. */
export async function listOutboundRequests(query, user) {
  requireRule(permitted(user), 'Không có quyền xem yêu cầu xuất kho', 'FORBIDDEN', 403);
  const filter = {
    isDeleted: { $ne: true },
    ticketType: { $in: ['OUTBOUND_FOR_CUTTING', 'OUTBOUND_WAREHOUSE'] },
  };

  if (query.status && query.status !== 'ALL') {
    filter.status = query.status;
  }
  if (query.warehouseCode) {
    filter.warehouseCode = String(query.warehouseCode);
  }
  if (query.from || query.to) {
    filter.issueDate = {};
    if (query.from) filter.issueDate.$gte = new Date(`${query.from}T00:00:00Z`);
    if (query.to) filter.issueDate.$lte = new Date(`${query.to}T23:59:59Z`);
  }

  const search = String(query.search || '').trim().toLocaleLowerCase('vi');

  const tickets = await MaterialTicket.find(filter)
    .populate('createdByUserId', 'fullName employeeCode')
    .populate('assignedStaffId', 'fullName employeeCode')
    .populate('confirmedByUserId', 'fullName employeeCode')
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();

  return tickets
    .map((ticket) => ({ ...ticket, lines: ticket.lines || [] }))
    .filter((ticket) => {
      if (query.department && ticket.department !== query.department) return false;
      if (!search) return true;
      const text = [
        ticket.ticketCode,
        ticket.recipient,
        ticket.department,
        ticket.assignedStaffName,
        ...(ticket.lines || []).map((l) => `${l.materialCode} ${l.materialName}`),
      ].join(' ').toLocaleLowerCase('vi');
      return text.includes(search);
    });
}

/** Returns warehouse staff list for manager assignment dropdown. */
export async function getStaffUsers(user) {
  requireRule(permitted(user), 'Không có quyền truy cập', 'FORBIDDEN', 403);
  const users = await User.find({
    status: 'ACTIVE',
    // Only warehouse staff pick goods; listing owners/managers made them the default assignee.
    roleCode: 'WAREHOUSE_STAFF',
  })
    .select('_id fullName employeeCode email roleCode')
    .sort({ fullName: 1 })
    .lean();
  return users;
}

/** Gets single outbound request detail enriched with line remaining qty and FIFO source recommendations. */
export async function getOutboundRequestDetail(ticketId, user) {
  requireRule(mongoose.isValidObjectId(ticketId), 'Mã yêu cầu không hợp lệ', 'INVALID_TICKET');
  const ticket = await MaterialTicket.findById(ticketId)
    .populate('createdByUserId', 'fullName employeeCode')
    .populate('assignedStaffId', 'fullName employeeCode')
    .populate('confirmedByUserId', 'fullName employeeCode')
    .lean();
  requireRule(ticket, 'Không tìm thấy yêu cầu xuất kho', 'TICKET_NOT_FOUND', 404);

  // 1. Fetch all locations and layout in RAW_MATERIAL warehouse
  const [locations, layout] = await Promise.all([
    WarehouseLocation.find({
      warehouseType: 'RAW_MATERIAL',
      isDeleted: { $ne: true },
    }).select('locationCode barcode zoneCode rackCode rackName floorNo binNo shelfCode currentOccupancy capacityUnit status isFrozenForStocktake').lean(),
    WarehouseLayout.findOne({
      warehouseType: { $in: ['FINISHED_GOODS', 'RAW_MATERIAL'] },
    }).lean(),
  ]);

  const rackNameByCode = new Map();
  (layout?.active?.racks || []).forEach((r) => {
    if (r.code && r.name) {
      rackNameByCode.set(String(r.code).trim().toUpperCase(), r.name);
    }
  });

  const byLocation = new Map(locations.map((loc) => [id(loc._id), loc]));
  const getRackName = (loc, targetMat, targetLine) => {
    const layoutName = loc?.rackCode ? rackNameByCode.get(String(loc.rackCode).trim().toUpperCase()) : null;
    return resolveRackName(loc?.rackName || layoutName, loc?.rackCode, targetMat || targetLine, loc?.locationCode);
  };

  // 2. Resolve all raw materials related to the ticket lines
  const rawMaterialInputs = (ticket.lines || []).map((l) => ({
    id: l.rawMaterialId,
    code: l.materialCode,
    name: l.materialName,
  }));

  const queryConds = [];
  rawMaterialInputs.forEach((item) => {
    if (mongoose.isValidObjectId(item.id)) queryConds.push({ _id: item.id });
    if (item.code) queryConds.push({ materialCode: String(item.code).trim().toUpperCase() });
    if (item.name) queryConds.push({ materialName: String(item.name).trim() });
  });

  const allMaterials = queryConds.length > 0
    ? await RawMaterial.find({ $or: queryConds, isDeleted: { $ne: true } }).lean()
    : [];

  const matMapById = new Map(allMaterials.map((m) => [id(m._id), m]));
  const matMapByCode = new Map(allMaterials.map((m) => [m.materialCode?.toUpperCase(), m]));
  const matMapByName = new Map(allMaterials.map((m) => [m.materialName?.toLowerCase(), m]));

  const allMatIds = allMaterials.map((m) => m._id);

  // 3. Query all rolls, lots, completed receipts, stock barcodes, and inventory transactions
  const [rolls, lots, receiptTickets, stockBarcodes, txBalances] = await Promise.all([
    FabricRoll.find({
      rawMaterialId: { $in: allMatIds },
      currentLengthMeters: { $gt: 0 },
      isDeleted: { $ne: true },
      status: { $nin: ['DEPLETED', 'RETURNED_TO_SUPPLIER'] },
    }).select('rollBarcode supplierRollCode supplierLotCode rawMaterialId locationId inboundTicketId currentLengthMeters pendingReturnQty fifoInboundTimestamp status createdAt').lean(),

    MaterialStockLot.find({
      rawMaterialId: { $in: allMatIds },
      isDeleted: { $ne: true },
      quality: { $ne: 'REJECTED' },
      status: { $nin: ['RETURNED_TO_SUPPLIER', 'QUARANTINED'] },
    }).select('lotBarcode supplierLotCode rawMaterialId inboundTicketId initialQty currentQty allocations fifoInboundTimestamp status quality createdAt').lean(),

    MaterialTicket.find({
      ticketType: { $in: ['INBOUND_FROM_PLAN', 'INBOUND_FROM_SUPPLIER', 'INBOUND_FROM_REMNANT'] },
      status: 'COMPLETED',
      isDeleted: { $ne: true },
      'receiptLines.rawMaterialId': { $in: allMatIds },
    }).select('ticketCode receivingLocationId receiptLines createdAt').lean(),

    WarehouseStockBarcode.find({
      rawMaterialId: { $in: allMatIds },
    }).select('barcode stockType stockObjectId rawMaterialId').lean(),

    InventoryTransaction.aggregate([
      { $match: { rawMaterialId: { $in: allMatIds }, locationId: { $ne: null } } },
      { $group: { _id: { rawMaterialId: '$rawMaterialId', locationId: '$locationId' }, netQty: { $sum: '$quantityChange' } } },
      { $match: { netQty: { $gt: 0 } } },
    ]),
  ]);

  const barcodeByStockObjectId = new Map(stockBarcodes.map((b) => [id(b.stockObjectId), b.barcode]));

  const enrichedLines = (ticket.lines || []).map((line, idx) => {
    const mat = matMapById.get(id(line.rawMaterialId)) ||
      matMapByCode.get(line.materialCode?.toUpperCase()) ||
      matMapByName.get(line.materialName?.toLowerCase());

    const lineMatIds = [
      line.rawMaterialId,
      mat?._id,
      ...allMaterials.filter((m) =>
        (line.materialCode && m.materialCode?.toUpperCase() === line.materialCode.toUpperCase()) ||
        (line.materialName && m.materialName?.toLowerCase() === line.materialName.toLowerCase())
      ).map((m) => m._id),
    ].filter(Boolean).map(id);

    const lineMatIdSet = new Set(lineMatIds);

    const reqVal = Number(line.requestedQuantity || 0);
    const qtyVal = Number(line.quantity || 0);
    const requested = reqVal > 0 ? reqVal : (qtyVal > 0 ? qtyVal : 0);
    const issued = Number(line.issuedQuantity || 0);
    const remaining = Math.max(0, round(requested - issued));
    const approved = line.approvedQuantity != null && line.approvedQuantity > 0 ? Number(line.approvedQuantity) : remaining;

    const lineSources = [];
    const seenLocationLotKeys = new Set();

    // A. Fabric Rolls
    rolls.filter((r) => lineMatIdSet.has(id(r.rawMaterialId))).forEach((r) => {
      const avail = round(Math.max(0, (r.currentLengthMeters || 0) - (r.pendingReturnQty || 0)));
      if (avail > 0) {
        const loc = byLocation.get(id(r.locationId));
        const barcode = r.rollBarcode || r.supplierRollCode || barcodeByStockObjectId.get(id(r._id)) || `ROLL-${r._id.toString().slice(-6)}`;
        const key = `${id(r._id)}:${id(r.locationId)}`;
        seenLocationLotKeys.add(key);
        lineSources.push({
          kind: 'ROLL',
          objectId: r._id,
          barcode,
          rawMaterialId: r.rawMaterialId,
          locationId: r.locationId,
          locationCode: loc?.locationCode || 'Kho NPL',
          rackName: getRackName(loc, mat, line),
          rackCode: loc?.rackCode || '',
          materialName: line.materialName || mat?.materialName || '',
          inboundTicketId: r.inboundTicketId,
          available: avail,
          fifoInboundTimestamp: r.fifoInboundTimestamp || r.createdAt || new Date(),
        });
      }
    });

    // B. Lots from MaterialStockLot (Auxiliary materials, e.g. buttons, zippers, threads)
    lots.filter((l) => lineMatIdSet.has(id(l.rawMaterialId))).forEach((l) => {
      const totalLotQty = l.currentQty != null && l.currentQty > 0 ? l.currentQty : (l.initialQty || 0);
      const barcode = l.lotBarcode || l.supplierLotCode || barcodeByStockObjectId.get(id(l._id)) || `LOT-${l._id.toString().slice(-6)}`;
      const validAllocs = (l.allocations || []).filter((a) => a.locationId);

      if (validAllocs.length > 0) {
        validAllocs.forEach((a) => {
          const loc = byLocation.get(id(a.locationId));
          const shelfQty = a.putawayQty != null && a.putawayQty > 0 ? a.putawayQty : (a.quantity || totalLotQty);
          const avail = round(Math.min(totalLotQty, shelfQty));
          if (avail > 0) {
            const key = `${id(l._id)}:${id(a.locationId)}`;
            seenLocationLotKeys.add(key);
            lineSources.push({
              kind: 'LOT',
              objectId: l._id,
              barcode,
              rawMaterialId: l.rawMaterialId,
              locationId: a.locationId,
              locationCode: loc?.locationCode || 'Kho NPL',
              rackName: getRackName(loc, mat, line),
              rackCode: loc?.rackCode || '',
              materialName: line.materialName || mat?.materialName || '',
              inboundTicketId: l.inboundTicketId,
              available: avail,
              fifoInboundTimestamp: l.fifoInboundTimestamp || l.createdAt || new Date(),
            });
          }
        });
      } else if (totalLotQty > 0) {
        const fallbackLoc = locations.find((item) => item.status === 'ACTIVE') || locations[0];
        const key = `${id(l._id)}:${id(fallbackLoc?._id)}`;
        if (!seenLocationLotKeys.has(key)) {
          seenLocationLotKeys.add(key);
          lineSources.push({
            kind: 'LOT',
            objectId: l._id,
            barcode,
            rawMaterialId: l.rawMaterialId,
            locationId: fallbackLoc?._id,
            locationCode: fallbackLoc?.locationCode || 'Kho NPL',
            rackName: getRackName(fallbackLoc, mat, line),
            rackCode: fallbackLoc?.rackCode || '',
            materialName: line.materialName || mat?.materialName || '',
            inboundTicketId: l.inboundTicketId,
            available: round(totalLotQty),
            fifoInboundTimestamp: l.fifoInboundTimestamp || l.createdAt || new Date(),
          });
        }
      }
    });

    // C. Lots & Rolls from completed MaterialTicket receiptLines
    receiptTickets.forEach((rt) => {
      (rt.receiptLines || []).forEach((rl) => {
        if (lineMatIdSet.has(id(rl.rawMaterialId))) {
          (rl.lots || []).forEach((lotItem) => {
            (lotItem.allocations || []).forEach((a) => {
              if (a.locationId && a.quantity > 0) {
                const loc = byLocation.get(id(a.locationId));
                const key = `${lotItem.supplierLotCode || rl.clientLineId}:${id(a.locationId)}`;
                if (!seenLocationLotKeys.has(key)) {
                  seenLocationLotKeys.add(key);
                  const objId = new mongoose.Types.ObjectId();
                  lineSources.push({
                    kind: 'LOT',
                    objectId: objId,
                    barcode: lotItem.supplierLotCode || `LOT-${rt.ticketCode}`,
                    rawMaterialId: rl.rawMaterialId,
                    locationId: a.locationId,
                    locationCode: loc?.locationCode || 'Kho NPL',
                    rackName: getRackName(loc, mat, line),
                    rackCode: loc?.rackCode || '',
                    materialName: line.materialName || mat?.materialName || '',
                    inboundTicketId: rt._id,
                    available: round(a.quantity),
                    fifoInboundTimestamp: rt.createdAt || new Date(),
                  });
                }
              }
            });
          });
          (rl.rolls || []).forEach((rollItem) => {
            if (rollItem.locationId && rollItem.lengthMeters > 0) {
              const loc = byLocation.get(id(rollItem.locationId));
              const key = `${rollItem.supplierRollCode || rollItem.clientLineId}:${id(rollItem.locationId)}`;
              if (!seenLocationLotKeys.has(key)) {
                seenLocationLotKeys.add(key);
                const objId = new mongoose.Types.ObjectId();
                lineSources.push({
                  kind: 'ROLL',
                  objectId: objId,
                  barcode: rollItem.supplierRollCode || `ROLL-${rt.ticketCode}`,
                  rawMaterialId: rl.rawMaterialId,
                  locationId: rollItem.locationId,
                  locationCode: loc?.locationCode || 'Kho NPL',
                  rackName: getRackName(loc, mat, line),
                  rackCode: loc?.rackCode || '',
                  materialName: line.materialName || mat?.materialName || '',
                  inboundTicketId: rt._id,
                  available: round(rollItem.lengthMeters),
                  fifoInboundTimestamp: rt.createdAt || new Date(),
                });
              }
            }
          });
        }
      });
    });

    // D. InventoryTransaction ledger balances by location
    txBalances.forEach((tb) => {
      if (lineMatIdSet.has(id(tb._id.rawMaterialId)) && tb.netQty > 0) {
        const locId = id(tb._id.locationId);
        const loc = byLocation.get(locId);
        const isAlreadyCovered = lineSources.some((s) => id(s.locationId) === locId);
        if (!isAlreadyCovered && loc) {
          const objId = new mongoose.Types.ObjectId();
          lineSources.push({
            kind: mat?.materialType === 'FABRIC' ? 'ROLL' : 'LOT',
            objectId: objId,
            barcode: loc.barcode || `LOT-${loc.locationCode}`,
            rawMaterialId: mat?._id || line.rawMaterialId,
            locationId: loc._id,
            locationCode: loc.locationCode,
            rackName: getRackName(loc, mat, line),
            rackCode: loc?.rackCode || '',
            materialName: line.materialName || mat?.materialName || '',
            available: round(tb.netQty),
            fifoInboundTimestamp: new Date(),
          });
        }
      }
    });

    // E. Fallback: If lineSources is empty, check all occupied locations or raw-material shelves
    const onHand = mat ? Math.max(0, (mat.onHandQty || 0) - (mat.reservedQty || 0) - (mat.pendingPutawayQty || 0)) : (line.quantity || 100);
    if (lineSources.length === 0 && (onHand > 0 || (mat?.onHandQty || 0) > 0)) {
      const occupiedLocs = locations.filter((loc) => (loc.currentOccupancy || 0) > 0);
      const targetLocs = occupiedLocs.length > 0 ? occupiedLocs : locations.filter((loc) => loc.status === 'ACTIVE').slice(0, 5);

      targetLocs.forEach((loc) => {
        const avail = loc.currentOccupancy > 0 ? Math.min(onHand, loc.currentOccupancy) : onHand;
        const objId = new mongoose.Types.ObjectId();
        lineSources.push({
          kind: mat?.materialType === 'FABRIC' ? 'ROLL' : 'LOT',
          objectId: objId,
          barcode: loc.barcode || `LOT-${mat?.materialCode || 'NPL'}-${loc.locationCode}`,
          rawMaterialId: mat?._id || line.rawMaterialId,
          locationId: loc._id,
          locationCode: loc.locationCode,
          rackName: getRackName(loc, mat, line),
          rackCode: loc?.rackCode || '',
          materialName: line.materialName || mat?.materialName || '',
          available: round(avail),
          fifoInboundTimestamp: new Date(),
        });
      });
    }

    // Sort by FIFO inbound timestamp
    lineSources.sort((a, b) => new Date(a.fifoInboundTimestamp) - new Date(b.fifoInboundTimestamp));

    const pickedTotal = round((line.pickedSources || []).reduce((s, p) => s + Number(p.quantity || 0), 0));
    const stillNeededToPick = Math.max(0, round(approved - pickedTotal));

    const enrichedDesignated = (line.designatedSources || []).map((ds) => {
      const loc = byLocation.get(id(ds.locationId));
      const rName = ds.rackName
        ? resolveRackName(ds.rackName, ds.rackCode || loc?.rackCode, mat || line, ds.locationCode || loc?.locationCode)
        : getRackName(loc, mat, line);
      return {
        ...ds,
        locationCode: ds.locationCode || loc?.locationCode || 'Kho NPL',
        rackName: rName,
        rackCode: ds.rackCode || loc?.rackCode || '',
        materialName: ds.materialName || line.materialName || mat?.materialName || '',
      };
    });

    const enrichedPicked = (line.pickedSources || []).map((ps) => {
      const loc = byLocation.get(id(ps.locationId));
      const rName = ps.rackName
        ? resolveRackName(ps.rackName, ps.rackCode || loc?.rackCode, mat || line, ps.locationCode || loc?.locationCode)
        : getRackName(loc, mat, line);
      return {
        ...ps,
        locationCode: ps.locationCode || loc?.locationCode || 'Kho NPL',
        rackName: rName,
        rackCode: ps.rackCode || loc?.rackCode || '',
        materialName: ps.materialName || line.materialName || mat?.materialName || '',
      };
    });

    return {
      ...line,
      lineIndex: idx,
      materialName: line.materialName || mat?.materialName,
      materialCode: line.materialCode || mat?.materialCode,
      color: line.color || mat?.color,
      unit: line.unit || mat?.unit,
      specification: line.specification || (mat?.widthCm ? `Khổ ${mat.widthCm}cm, ${mat.gsm || ''}gsm` : ''),
      materialAvailable: mat ? round(Math.max(0, (mat.onHandQty || 0) - (mat.reservedQty || 0) - (mat.pendingPutawayQty || 0))) : 0,
      requestedQuantity: requested,
      issuedQuantity: issued,
      remainingQuantity: remaining,
      approvedQuantity: approved,
      hasDesignatedSources: Boolean(line.hasDesignatedSources),
      designatedSources: enrichedDesignated,
      pickedSources: enrichedPicked,
      pickedTotal,
      stillNeededToPick,
      fifoSugggestions: lineSources,
      shortageReport: line.shortageReport || { reported: false },
    };
  });

  return {
    ...ticket,
    lines: enrichedLines,
  };
}

/**
 * 1. Quản lý kho duyệt yêu cầu và giao việc
 * Sets approved quantities, assigns staff, optionally designates sources.
 * Status becomes WAITING_PICKING ("Chờ lấy hàng").
 * Does NOT create official outbound ticket and does NOT deduct stock yet.
 */
export async function approveAndAssignRequest(ticketId, input, user) {
  requireRule(user?.roles?.some((role) => ['OWNER', 'ADMIN', 'WAREHOUSE_MANAGER'].includes(role)),
    'Chỉ Quản lý kho mới có quyền duyệt và giao việc', 'FORBIDDEN', 403);
  requireRule(mongoose.isValidObjectId(ticketId), 'Mã yêu cầu không hợp lệ', 'INVALID_TICKET');

  const ticket = await MaterialTicket.findById(ticketId);
  requireRule(ticket, 'Không tìm thấy yêu cầu xuất kho', 'TICKET_NOT_FOUND', 404);
  requireRule(['WAITING_SCAN', 'DRAFT', 'WAITING_DISCREPANCY'].includes(ticket.status),
    'Yêu cầu không ở trạng thái chờ duyệt hoặc cần phân bổ lại', 'TICKET_LOCKED', 409);

  requireRule(mongoose.isValidObjectId(input.assignedStaffId), 'Vui lòng chọn nhân viên kho thực hiện', 'STAFF_REQUIRED');
  const staff = await User.findById(input.assignedStaffId).lean();
  requireRule(staff && staff.status === 'ACTIVE' && staff.roleCode === 'WAREHOUSE_STAFF',
    'Chỉ được giao cho nhân viên kho đang hoạt động', 'INVALID_STAFF');

  requireRule(Array.isArray(input.lines) && input.lines.length > 0, 'Dữ liệu duyệt không hợp lệ', 'INVALID_LINES');

  for (const inputLine of input.lines) {
    const targetLine = ticket.lines.find((l) =>
      (inputLine.rawMaterialId && id(l.rawMaterialId) === id(inputLine.rawMaterialId)) ||
      (inputLine.materialCode && l.materialCode?.toUpperCase() === String(inputLine.materialCode).trim().toUpperCase())
    );
    requireRule(targetLine, 'Không tìm thấy mặt hàng trong yêu cầu', 'LINE_NOT_FOUND');

    const reqVal = Number(targetLine.requestedQuantity || 0);
    const qtyVal = Number(targetLine.quantity || 0);
    const requested = reqVal > 0 ? reqVal : (qtyVal > 0 ? qtyVal : 0);
    const issued = Number(targetLine.issuedQuantity || 0);
    const remaining = Math.max(0, round(requested - issued));

    const approvedQty = Number(inputLine.approvedQuantity);
    requireRule(Number.isFinite(approvedQty) && approvedQty > 0, 'Số lượng duyệt cấp phải lớn hơn 0', 'INVALID_APPROVED_QTY');
    requireRule(approvedQty <= remaining + 0.0001, `Số lượng duyệt cấp (${approvedQty}) vượt quá số lượng còn phải cấp (${remaining})`, 'APPROVED_EXCEEDS_REMAINING');

    targetLine.requestedQuantity = requested;
    targetLine.issuedQuantity = issued;
    targetLine.approvedQuantity = approvedQty;
    targetLine.quantity = approvedQty;
    targetLine.hasDesignatedSources = Boolean(inputLine.hasDesignatedSources);

    if (inputLine.hasDesignatedSources && Array.isArray(inputLine.designatedSources) && inputLine.designatedSources.length > 0) {
      const designated = [];
      let designatedTotal = 0;
      for (const src of inputLine.designatedSources) {
        const barcode = String(src.barcode || '').trim().toUpperCase();
        const validLocId = (src.locationId && mongoose.isValidObjectId(src.locationId)) ? src.locationId : null;
        requireRule(barcode && validLocId, 'Thông tin nguồn chỉ định không hợp lệ', 'INVALID_DESIGNATED_SOURCE');
        const qty = Number(src.quantity);
        requireRule(Number.isFinite(qty) && qty > 0, 'Số lượng nguồn chỉ định không hợp lệ', 'INVALID_DESIGNATED_QTY');
        designatedTotal = round(designatedTotal + qty);
        const objId = (src.objectId && mongoose.isValidObjectId(src.objectId)) ? src.objectId : new mongoose.Types.ObjectId();
        const loc = await WarehouseLocation.findById(validLocId).select('locationCode rackName rackCode').lean();
        const rName = resolveRackName(src.rackName || loc?.rackName, src.rackCode || loc?.rackCode, targetLine, src.locationCode || loc?.locationCode);
        const inboundId = (src.inboundTicketId && mongoose.isValidObjectId(src.inboundTicketId)) ? src.inboundTicketId : undefined;
        designated.push({
          kind: src.kind === 'ROLL' ? 'ROLL' : 'LOT',
          objectId: objId,
          barcode,
          locationId: validLocId,
          locationCode: src.locationCode || loc?.locationCode || '',
          rackName: rName,
          rackCode: src.rackCode || loc?.rackCode || '',
          materialName: src.materialName || targetLine.materialName || '',
          inboundTicketId: inboundId,
          quantity: qty,
        });
      }
      requireRule(designatedTotal <= approvedQty + 0.0001, `Tổng nguồn chỉ định (${designatedTotal}) vượt số lượng duyệt (${approvedQty})`, 'DESIGNATED_EXCEEDS_APPROVED');
      targetLine.designatedSources = designated;
    } else {
      targetLine.hasDesignatedSources = false;
      targetLine.designatedSources = [];
    }
  }

  ticket.assignedStaffId = staff._id;
  ticket.assignedStaffName = staff.fullName;
  ticket.assignedAt = new Date();
  ticket.status = 'WAITING_PICKING';
  ticket.version = (ticket.version || 0) + 1;
  ticket.updatedByUserId = user._id;

  await ticket.save();

  publishRealtime('material-outbound:changed', {
    ticketId: ticket._id,
    ticketCode: ticket.ticketCode,
    status: ticket.status,
    assignedStaffName: ticket.assignedStaffName,
  });

  return getOutboundRequestDetail(ticket._id, user);
}

/** Lists tasks for warehouse staff: Chờ lấy hàng, Đang lấy hàng, Chờ xử lý sai lệch, Đã xuất. */
export async function listStaffOutboundTasks(user) {
  requireRule(permitted(user), 'Không có quyền xem công việc kho', 'FORBIDDEN', 403);

  const filter = {
    isDeleted: { $ne: true },
    ticketType: { $in: ['OUTBOUND_FOR_CUTTING', 'OUTBOUND_WAREHOUSE'] },
    status: { $in: ['WAITING_PICKING', 'PICKING', 'WAITING_DISCREPANCY', 'COMPLETED'] },
  };

  const isManager = user.roles?.some((r) => ['OWNER', 'ADMIN', 'WAREHOUSE_MANAGER'].includes(r));
  if (!isManager && user.roleCode === 'WAREHOUSE_STAFF') {
    filter.$or = [{ assignedStaffId: user._id }, { assignedStaffId: null }];
  }

  const tasks = await MaterialTicket.find(filter)
    .populate('createdByUserId', 'fullName')
    .populate('assignedStaffId', 'fullName')
    .sort({ assignedAt: -1, createdAt: -1 })
    .limit(100)
    .lean();

  return tasks.map((t) => ({
    _id: t._id,
    ticketCode: t.ticketCode,
    department: t.department,
    recipient: t.recipient,
    purpose: t.purpose,
    assignedAt: t.assignedAt || t.createdAt,
    assignedStaffName: t.assignedStaffName || t.assignedStaffId?.fullName || 'Chưa phân công',
    linesCount: (t.lines || []).length,
    status: t.status,
    lines: (t.lines || []).map((l) => ({
      materialCode: l.materialCode,
      materialName: l.materialName,
      unit: l.unit,
      approvedQuantity: l.approvedQuantity || l.quantity,
      pickedTotal: (l.pickedSources || []).reduce((s, p) => s + (p.quantity || 0), 0),
    })),
  }));
}

/** Staff starts picking: moves status from WAITING_PICKING to PICKING. */
export async function startPicking(ticketId, user) {
  requireRule(permitted(user), 'Không có quyền thực hiện lấy hàng', 'FORBIDDEN', 403);
  const ticket = await MaterialTicket.findById(ticketId);
  requireRule(ticket, 'Không tìm thấy yêu cầu xuất', 'TICKET_NOT_FOUND', 404);
  requireRule(['WAITING_PICKING', 'PICKING', 'WAITING_DISCREPANCY'].includes(ticket.status),
    'Công việc không ở trạng thái có thể lấy hàng', 'INVALID_STATUS', 409);

  if (ticket.status === 'WAITING_PICKING') {
    ticket.status = 'PICKING';
    ticket.updatedByUserId = user._id;
    await ticket.save();

    publishRealtime('material-outbound:changed', {
      ticketId: ticket._id,
      ticketCode: ticket.ticketCode,
      status: ticket.status,
      assignedStaffName: ticket.assignedStaffName,
    });
  }
  return getOutboundRequestDetail(ticket._id, user);
}

/**
 * 3. Bắt buộc quét barcode cây vải hoặc lô thực tế
 * Validates scanned barcode against physical rolls/lots, shelf location, and allocation rules.
 */
export async function scanOutboundBarcode(ticketId, input, user) {
  requireRule(permitted(user), 'Không có quyền quét barcode', 'FORBIDDEN', 403);
  requireRule(mongoose.isValidObjectId(ticketId), 'Mã yêu cầu không hợp lệ', 'INVALID_TICKET');

  const ticket = await MaterialTicket.findById(ticketId);
  requireRule(ticket, 'Không tìm thấy yêu cầu xuất kho', 'TICKET_NOT_FOUND', 404);
  requireRule(['WAITING_PICKING', 'PICKING', 'WAITING_DISCREPANCY'].includes(ticket.status),
    'Công việc không ở trạng thái lấy hàng', 'TICKET_LOCKED', 409);

  const barcode = String(input.barcode || '').trim().toUpperCase();
  requireRule(barcode, 'Vui lòng nhập hoặc quét mã barcode', 'BARCODE_REQUIRED');

  const lineIndex = Number(input.lineIndex);
  requireRule(Number.isInteger(lineIndex) && lineIndex >= 0 && lineIndex < ticket.lines.length,
    'Dòng nguyên phụ liệu không hợp lệ', 'INVALID_LINE_INDEX');
  const line = ticket.lines[lineIndex];

  // 1. Quét tem vị trí, mã danh mục -> Báo Vui lòng quét barcode trên tem cây vải hoặc lô phụ liệu
  const isLocation = await WarehouseLocation.findOne({
    $or: [{ barcode }, { locationCode: barcode }],
    isDeleted: { $ne: true },
  }).lean();
  if (isLocation) {
    throw error('Vui lòng quét barcode trên tem cây vải hoặc lô phụ liệu', 'SCANNED_LOCATION_BARCODE', 400);
  }

  // 2. Search physical roll or lot or designated source
  const [roll, lot, stockBarcode] = await Promise.all([
    FabricRoll.findOne({
      $or: [{ rollBarcode: barcode }, { supplierRollCode: barcode }],
      isDeleted: { $ne: true },
    }).lean(),
    MaterialStockLot.findOne({
      $or: [{ lotBarcode: barcode }, { supplierLotCode: barcode }],
      isDeleted: { $ne: true },
    }).lean(),
    WarehouseStockBarcode.findOne({ barcode }).lean(),
  ]);

  const designatedMatch = (line.designatedSources || []).find(
    (d) => d.barcode.toUpperCase() === barcode
  );

  const physical = roll || lot || stockBarcode || (designatedMatch ? {
    _id: designatedMatch.objectId,
    rawMaterialId: line.rawMaterialId,
    locationId: designatedMatch.locationId,
  } : null);

  if (!physical) {
    throw error('Vui lòng quét barcode trên tem cây vải hoặc lô phụ liệu', 'SOURCE_NOT_FOUND', 400);
  }

  // 3. Verify matching material
  const physicalMatId = id(physical.rawMaterialId || stockBarcode?.rawMaterialId);
  const lineMatId = id(line.rawMaterialId);
  if (physicalMatId && physicalMatId !== lineMatId) {
    const [pMat, lMat] = await Promise.all([
      RawMaterial.findById(physicalMatId).select('materialCode').lean(),
      RawMaterial.findById(lineMatId).select('materialCode').lean(),
    ]);
    if (!pMat || !lMat || pMat.materialCode !== lMat.materialCode) {
      throw error('Sai nguyên phụ liệu, sai quy cách hoặc sai kho', 'MATERIAL_MISMATCH', 400);
    }
  }

  // 4. Verify location and status eligibility
  let locationId = designatedMatch?.locationId || (input.locationId ? mongoose.Types.ObjectId(input.locationId) : null);
  let locationCode = designatedMatch?.locationCode || '';
  let availableQty = 0;
  const isRoll = Boolean(roll);

  if (isRoll) {
    locationId = locationId || roll.locationId;
    if (!locationId || roll.status === 'QUARANTINED' || roll.status === 'DEPLETED') {
      throw error('Nguồn hàng không đủ điều kiện xuất', 'SOURCE_NOT_ELIGIBLE', 400);
    }
    availableQty = round(Math.max(0, roll.currentLengthMeters - (roll.pendingReturnQty || 0)));
    if (availableQty <= 0) {
      throw error('Nguồn hàng không đủ điều kiện xuất', 'SOURCE_DEPLETED', 400);
    }
  } else if (lot) {
    if (lot.quality === 'REJECTED' || lot.status === 'QUARANTINED') {
      throw error('Nguồn hàng không đủ điều kiện xuất', 'SOURCE_NOT_ELIGIBLE', 400);
    }
    const lotStock = lot.currentQty != null && lot.currentQty > 0 ? lot.currentQty : (lot.initialQty || 0);
    const alloc = (lot.allocations || []).find((a) => (locationId ? id(a.locationId) === id(locationId) : true)) || lot.allocations?.[0];
    if (alloc && alloc.locationId) {
      locationId = locationId || alloc.locationId;
      const shelfQty = alloc.putawayQty != null && alloc.putawayQty > 0 ? alloc.putawayQty : (alloc.quantity || lotStock);
      availableQty = round(Math.min(lotStock, shelfQty));
    } else {
      availableQty = round(lotStock);
    }
  } else if (designatedMatch) {
    availableQty = round(designatedMatch.quantity || 100);
  }

  const loc = locationId ? await WarehouseLocation.findById(locationId).select('locationCode rackName rackCode').lean() : null;
  if (loc?.locationCode && !locationCode) {
    locationCode = loc.locationCode;
  }
  const rName = resolveRackName(
    loc?.rackName || designatedMatch?.rackName,
    loc?.rackCode || designatedMatch?.rackCode,
    line,
    locationCode || loc?.locationCode
  );

  // 5. Designation info: Matching physical rolls/lots of the requested raw material are permitted for warehouse picking.
  const isDesignated = (line.designatedSources || []).some(
    (d) => d.barcode.toUpperCase() === barcode || id(d.objectId) === id(physical._id)
  );

  // 6. Check if already recorded on this line for this shelf
  const existingSource = (line.pickedSources || []).find(
    (p) => (p.barcode.toUpperCase() === barcode || id(p.objectId) === id(physical._id)) &&
           (!locationId || id(p.locationId) === id(locationId))
  );

  if (existingSource) {
    return {
      valid: true,
      alreadyRecorded: true,
      scanId: existingSource.scanId,
      barcode,
      kind: isRoll ? 'ROLL' : 'LOT',
      objectId: physical._id,
      locationId,
      locationCode: locationCode || existingSource.locationCode,
      rackName: existingSource.rackName || rName,
      rackCode: existingSource.rackCode || loc?.rackCode || '',
      materialName: line.materialName || '',
      recordedQuantity: existingSource.quantity,
      available: availableQty,
      lineIndex,
    };
  }

  const scanId = `scan-${Date.now()}-${randomUUID().slice(0, 6)}`;

  return {
    valid: true,
    alreadyRecorded: false,
    scanId,
    barcode,
    kind: isRoll ? 'ROLL' : 'LOT',
    objectId: physical._id,
    locationId,
    locationCode: locationCode || 'Kho NPL',
    rackName: rName,
    rackCode: loc?.rackCode || designatedMatch?.rackCode || '',
    materialName: line.materialName || '',
    available: availableQty,
    lineIndex,
  };
}

/** Records picked quantity after a valid barcode scan. */
export async function recordPickedQuantity(ticketId, input, user) {
  requireRule(permitted(user), 'Không có quyền ghi nhận số lượng', 'FORBIDDEN', 403);
  requireRule(mongoose.isValidObjectId(ticketId), 'Mã yêu cầu không hợp lệ', 'INVALID_TICKET');

  const ticket = await MaterialTicket.findById(ticketId);
  requireRule(ticket, 'Không tìm thấy yêu cầu xuất kho', 'TICKET_NOT_FOUND', 404);
  requireRule(['WAITING_PICKING', 'PICKING', 'WAITING_DISCREPANCY'].includes(ticket.status),
    'Công việc không ở trạng thái lấy hàng', 'TICKET_LOCKED', 409);

  const lineIndex = Number(input.lineIndex);
  requireRule(Number.isInteger(lineIndex) && lineIndex >= 0 && lineIndex < ticket.lines.length,
    'Dòng nguyên phụ liệu không hợp lệ', 'INVALID_LINE_INDEX');
  const line = ticket.lines[lineIndex];

  const scanId = String(input.scanId || '').trim();
  requireRule(scanId, 'Mã quét không hợp lệ', 'INVALID_SCAN_ID');

  const barcode = String(input.barcode || '').trim().toUpperCase();
  requireRule(barcode, 'Mã barcode không hợp lệ', 'INVALID_BARCODE');

  const pickedQty = quantity(input.pickedQuantity, line.unit);
  requireRule(pickedQty > 0, 'Số lượng thực lấy phải lớn hơn 0', 'INVALID_PICKED_QTY');

  const [roll, lot] = await Promise.all([
    FabricRoll.findOne({
      $or: [{ rollBarcode: barcode }, { supplierRollCode: barcode }],
      isDeleted: { $ne: true },
    }).lean(),
    MaterialStockLot.findOne({
      $or: [{ lotBarcode: barcode }, { supplierLotCode: barcode }],
      isDeleted: { $ne: true },
    }).lean(),
  ]);

  const designatedMatch = (line.designatedSources || []).find((d) => d.barcode.toUpperCase() === barcode);
  const physical = roll || lot || designatedMatch || { _id: new mongoose.Types.ObjectId() };

  const rawLocId = input.locationId || designatedMatch?.locationId || (roll ? roll.locationId : lot?.allocations?.[0]?.locationId);
  let locationId = (rawLocId && mongoose.isValidObjectId(rawLocId)) ? rawLocId : null;
  let location = locationId ? await WarehouseLocation.findById(locationId).select('locationCode rackName rackCode').lean() : null;
  if (!location) {
    location = await WarehouseLocation.findOne({ warehouseType: 'RAW_MATERIAL', status: 'ACTIVE' }).select('locationCode rackName rackCode').lean();
    if (location) locationId = location._id;
  }

  const locCode = location?.locationCode || designatedMatch?.locationCode || 'Kho NPL';
  const rName = resolveRackName(
    location?.rackName || designatedMatch?.rackName,
    location?.rackCode || designatedMatch?.rackCode,
    line,
    locCode
  );

  const otherPicked = (line.pickedSources || []).filter(
    (p) => p.scanId !== scanId && !(p.barcode.toUpperCase() === barcode && id(p.locationId) === id(locationId))
  );
  const totalOther = round(otherPicked.reduce((sum, p) => sum + p.quantity, 0));
  const newTotal = round(totalOther + pickedQty);
  const approvedLimit = Number(line.approvedQuantity || line.quantity || 0);

  if (newTotal > approvedLimit + 0.0001) {
    throw error(`Tổng lượng lấy (${newTotal} ${line.unit}) vượt số lượng duyệt (${approvedLimit} ${line.unit})`, 'EXCEEDS_APPROVED_LIMIT');
  }

  ticket.outboundScanRecords = ticket.outboundScanRecords || [];
  const existingRecordIndex = ticket.outboundScanRecords.findIndex(
    (r) => r.scanId === scanId || (r.barcode.toUpperCase() === barcode && id(r.locationId) === id(locationId))
  );
  const scanRecord = {
    scanId,
    lineIndex,
    rawMaterialId: line.rawMaterialId,
    objectId: physical._id,
    barcode,
    locationId,
    locationCode: locCode,
    pickedQuantity: pickedQty,
    scannedAt: new Date(),
    scannedByUserId: user._id,
  };

  if (existingRecordIndex >= 0) {
    ticket.outboundScanRecords[existingRecordIndex] = scanRecord;
  } else {
    ticket.outboundScanRecords.push(scanRecord);
  }

  line.pickedSources = line.pickedSources || [];
  const existingSourceIndex = line.pickedSources.findIndex(
    (p) => p.scanId === scanId || (p.barcode.toUpperCase() === barcode && id(p.locationId) === id(locationId))
  );

  const rawInboundId = physical.inboundTicketId || designatedMatch?.inboundTicketId;
  const inboundTicketId = (rawInboundId && mongoose.isValidObjectId(rawInboundId)) ? rawInboundId : undefined;

  const pickedSource = {
    scanId,
    kind: roll ? 'ROLL' : 'LOT',
    objectId: (physical._id && mongoose.isValidObjectId(physical._id)) ? physical._id : new mongoose.Types.ObjectId(),
    barcode,
    locationId,
    locationCode: locCode,
    rackName: rName,
    rackCode: location?.rackCode || designatedMatch?.rackCode || '',
    materialName: line.materialName || designatedMatch?.materialName || '',
    inboundTicketId,
    quantity: pickedQty,
    checkedByUserId: user._id,
    checkedAt: new Date(),
    checkedQuantity: pickedQty,
  };

  if (existingSourceIndex >= 0) {
    line.pickedSources[existingSourceIndex] = pickedSource;
  } else {
    line.pickedSources.push(pickedSource);
  }

  if (ticket.status === 'WAITING_PICKING') {
    ticket.status = 'PICKING';
  }

  ticket.version = (ticket.version || 0) + 1;
  ticket.updatedByUserId = user._id;

  await ticket.save();

  publishRealtime('material-outbound:changed', {
    ticketId: ticket._id,
    ticketCode: ticket.ticketCode,
    status: ticket.status,
    assignedStaffName: ticket.assignedStaffName,
  });

  return getOutboundRequestDetail(ticket._id, user);
}

/** Removes a picked source and its associated scan record from progress. */
export async function removePickedSource(ticketId, input, user) {
  requireRule(permitted(user), 'Không có quyền xóa nguồn lấy', 'FORBIDDEN', 403);
  requireRule(mongoose.isValidObjectId(ticketId), 'Mã yêu cầu không hợp lệ', 'INVALID_TICKET');

  const ticket = await MaterialTicket.findById(ticketId);
  requireRule(ticket, 'Không tìm thấy yêu cầu xuất kho', 'TICKET_NOT_FOUND', 404);
  requireRule(['WAITING_PICKING', 'PICKING', 'WAITING_DISCREPANCY'].includes(ticket.status),
    'Công việc không ở trạng thái lấy hàng', 'TICKET_LOCKED', 409);

  const lineIndex = Number(input.lineIndex);
  requireRule(Number.isInteger(lineIndex) && lineIndex >= 0 && lineIndex < ticket.lines.length,
    'Dòng nguyên phụ liệu không hợp lệ', 'INVALID_LINE_INDEX');
  const line = ticket.lines[lineIndex];

  const barcode = String(input.barcode || '').trim().toUpperCase();
  const scanId = String(input.scanId || '').trim();
  const locationId = input.locationId;

  line.pickedSources = (line.pickedSources || []).filter(
    (p) => !(p.scanId === scanId || (barcode && p.barcode.toUpperCase() === barcode && (!locationId || id(p.locationId) === id(locationId))))
  );

  ticket.outboundScanRecords = (ticket.outboundScanRecords || []).filter(
    (r) => !(r.scanId === scanId || (barcode && r.barcode.toUpperCase() === barcode && (!locationId || id(r.locationId) === id(locationId))))
  );

  ticket.version = (ticket.version || 0) + 1;
  ticket.updatedByUserId = user._id;

  await ticket.save();

  publishRealtime('material-outbound:changed', {
    ticketId: ticket._id,
    ticketCode: ticket.ticketCode,
    status: ticket.status,
    assignedStaffName: ticket.assignedStaffName,
  });

  return getOutboundRequestDetail(ticket._id, user);
}

/** 4. Báo thiếu / sai lệch: staff reports shortage with actual picked quantity and reason. */
export async function reportShortage(ticketId, input, user) {
  requireRule(permitted(user), 'Không có quyền báo thiếu', 'FORBIDDEN', 403);
  requireRule(mongoose.isValidObjectId(ticketId), 'Mã yêu cầu không hợp lệ', 'INVALID_TICKET');

  const ticket = await MaterialTicket.findById(ticketId);
  requireRule(ticket, 'Không tìm thấy yêu cầu xuất kho', 'TICKET_NOT_FOUND', 404);
  requireRule(['WAITING_PICKING', 'PICKING', 'WAITING_DISCREPANCY'].includes(ticket.status),
    'Công việc không ở trạng thái lấy hàng', 'TICKET_LOCKED', 409);

  const lineIndex = Number(input.lineIndex);
  requireRule(Number.isInteger(lineIndex) && lineIndex >= 0 && lineIndex < ticket.lines.length,
    'Dòng nguyên phụ liệu không hợp lệ', 'INVALID_LINE_INDEX');
  const line = ticket.lines[lineIndex];

  const reason = String(input.reason || '').trim();
  requireRule(reason, 'Vui lòng nêu lý do thiếu hàng hoặc sai lệch tem barcode', 'REASON_REQUIRED');

  line.shortageReport = {
    reported: true,
    reason,
    reportedByUserId: user._id,
    reportedAt: new Date(),
    approvedByManagerId: null,
    approvedAt: null,
  };

  ticket.status = 'WAITING_DISCREPANCY';
  ticket.version = (ticket.version || 0) + 1;
  ticket.updatedByUserId = user._id;

  await ticket.save();

  publishRealtime('material-outbound:changed', {
    ticketId: ticket._id,
    ticketCode: ticket.ticketCode,
    status: ticket.status,
    assignedStaffName: ticket.assignedStaffName,
  });

  return getOutboundRequestDetail(ticket._id, user);
}

/** Manager resolves shortage report: confirms shortage (adjusting approved qty) or reallocates. */
export async function resolveShortage(ticketId, input, user) {
  requireRule(user?.roles?.some((role) => ['OWNER', 'ADMIN', 'WAREHOUSE_MANAGER'].includes(role)),
    'Chỉ Quản lý kho mới có quyền xử lý sai lệch / duyệt xuất thiếu', 'FORBIDDEN', 403);
  requireRule(mongoose.isValidObjectId(ticketId), 'Mã yêu cầu không hợp lệ', 'INVALID_TICKET');

  const ticket = await MaterialTicket.findById(ticketId);
  requireRule(ticket, 'Không tìm thấy yêu cầu xuất kho', 'TICKET_NOT_FOUND', 404);
  requireRule(ticket.status === 'WAITING_DISCREPANCY', 'Yêu cầu không ở trạng thái chờ xử lý sai lệch', 'TICKET_NOT_DISCREPANCY', 409);

  const lineIndex = Number(input.lineIndex);
  requireRule(Number.isInteger(lineIndex) && lineIndex >= 0 && lineIndex < ticket.lines.length,
    'Dòng nguyên phụ liệu không hợp lệ', 'INVALID_LINE_INDEX');
  const line = ticket.lines[lineIndex];

  const action = input.action;
  if (action === 'CONFIRM_SHORTAGE') {
    const pickedTotal = round((line.pickedSources || []).reduce((s, p) => s + p.quantity, 0));
    line.approvedQuantity = pickedTotal;
    line.quantity = pickedTotal;
    line.shortageReport.approvedByManagerId = user._id;
    line.shortageReport.approvedAt = new Date();
  }

  const hasUnapprovedShortage = ticket.lines.some(
    (l) => l.shortageReport?.reported && !l.shortageReport?.approvedByManagerId
  );
  if (!hasUnapprovedShortage) {
    ticket.status = 'PICKING';
  }

  ticket.version = (ticket.version || 0) + 1;
  ticket.updatedByUserId = user._id;

  await ticket.save();

  publishRealtime('material-outbound:changed', {
    ticketId: ticket._id,
    ticketCode: ticket.ticketCode,
    status: ticket.status,
    assignedStaffName: ticket.assignedStaffName,
  });

  return getOutboundRequestDetail(ticket._id, user);
}

/** Manager reallocates designated sources for a line; invalidates outdated scans. */
export async function reallocateSources(ticketId, input, user) {
  requireRule(user?.roles?.some((role) => ['OWNER', 'ADMIN', 'WAREHOUSE_MANAGER'].includes(role)),
    'Chỉ Quản lý kho mới có quyền đổi phân bổ nguồn', 'FORBIDDEN', 403);
  requireRule(mongoose.isValidObjectId(ticketId), 'Mã yêu cầu không hợp lệ', 'INVALID_TICKET');

  const ticket = await MaterialTicket.findById(ticketId);
  requireRule(ticket, 'Không tìm thấy yêu cầu xuất kho', 'TICKET_NOT_FOUND', 404);

  const lineIndex = Number(input.lineIndex);
  requireRule(Number.isInteger(lineIndex) && lineIndex >= 0 && lineIndex < ticket.lines.length,
    'Dòng nguyên phụ liệu không hợp lệ', 'INVALID_LINE_INDEX');
  const line = ticket.lines[lineIndex];

  const newDesignated = (input.designatedSources || []).map((src) => ({
    kind: src.kind || 'ROLL',
    objectId: src.objectId,
    barcode: String(src.barcode).trim().toUpperCase(),
    locationId: src.locationId,
    locationCode: src.locationCode || '',
    inboundTicketId: src.inboundTicketId,
    quantity: Number(src.quantity),
  }));

  const newBarcodes = new Set(newDesignated.map((d) => d.barcode));

  const removedBarcodes = new Set(
    (line.pickedSources || []).map((p) => p.barcode.toUpperCase()).filter((b) => !newBarcodes.has(b))
  );

  line.designatedSources = newDesignated;
  line.hasDesignatedSources = newDesignated.length > 0;
  line.pickedSources = (line.pickedSources || []).filter((p) => !removedBarcodes.has(p.barcode.toUpperCase()));

  ticket.outboundScanRecords = (ticket.outboundScanRecords || []).filter(
    (r) => !(r.lineIndex === lineIndex && removedBarcodes.has(r.barcode.toUpperCase()))
  );

  ticket.status = 'PICKING';
  ticket.version = (ticket.version || 0) + 1;
  ticket.updatedByUserId = user._id;

  await ticket.save();

  publishRealtime('material-outbound:changed', {
    ticketId: ticket._id,
    ticketCode: ticket.ticketCode,
    status: ticket.status,
    assignedStaffName: ticket.assignedStaffName,
  });

  return getOutboundRequestDetail(ticket._id, user);
}

/** Staff pauses picking: progress is saved in DB without deducting stock. */
export async function pausePicking(ticketId, user) {
  requireRule(permitted(user), 'Không có quyền tạm dừng', 'FORBIDDEN', 403);
  const ticket = await MaterialTicket.findById(ticketId);
  requireRule(ticket, 'Không tìm thấy yêu cầu xuất', 'TICKET_NOT_FOUND', 404);
  ticket.version = (ticket.version || 0) + 1;
  ticket.updatedByUserId = user._id;
  await ticket.save();

  publishRealtime('material-outbound:changed', {
    ticketId: ticket._id,
    ticketCode: ticket.ticketCode,
    status: ticket.status,
    assignedStaffName: ticket.assignedStaffName,
  });

  return getOutboundRequestDetail(ticket._id, user);
}

/**
 * 5. Xác nhận bàn giao và xuất kho
 * Server re-verifies request approval, genuine scan records, and available stock.
 * Atomically commits stock deduction in a single MongoDB transaction.
 * Saves roll/lot sources for complete remnant return traceability.
 */
export async function confirmHandoverAndOutbound(ticketId, input, user) {
  requireRule(permitted(user), 'Không có quyền xác nhận bàn giao và xuất kho', 'FORBIDDEN', 403);
  requireRule(mongoose.isValidObjectId(ticketId), 'Mã yêu cầu không hợp lệ', 'INVALID_TICKET');

  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const ticket = await MaterialTicket.findById(ticketId).session(session);
      requireRule(ticket, 'Không tìm thấy yêu cầu xuất kho', 'TICKET_NOT_FOUND', 404);

      if (ticket.status === 'COMPLETED') {
        result = ticket;
        return;
      }

      requireRule(['PICKING', 'WAITING_PICKING', 'WAITING_DISCREPANCY'].includes(ticket.status),
        'Yêu cầu đã được xác nhận hoặc đã hủy', 'TICKET_LOCKED', 409);

      const hasUnresolvedShortage = (ticket.lines || []).some(
        (l) => l.shortageReport?.reported && !l.shortageReport?.approvedByManagerId
      );
      requireRule(!hasUnresolvedShortage,
        'Yêu cầu đang có báo thiếu chưa được Quản lý duyệt lại số lượng', 'UNRESOLVED_SHORTAGE', 409);

      requireRule(ticket.lines.length > 0, 'Yêu cầu không có mặt hàng nào', 'EMPTY_LINES');

      const issuedByMaterial = new Map();

      for (let li = 0; li < ticket.lines.length; li += 1) {
        const line = ticket.lines[li];
        const approvedQty = Number(line.approvedQuantity || line.quantity || 0);
        const pickedSources = line.pickedSources || [];

        requireRule(pickedSources.length > 0,
          `Mặt hàng ${line.materialName} chưa được lấy và quét barcode`, 'UNPICKED_LINE', 400);

        const pickedTotal = round(pickedSources.reduce((s, p) => s + Number(p.quantity || 0), 0));
        requireRule(equal(pickedTotal, approvedQty) || pickedTotal <= approvedQty + 0.0001,
          `Số lượng thực lấy (${pickedTotal}) không khớp số lượng duyệt (${approvedQty}) cho mặt hàng ${line.materialName}`,
          'QUANTITY_MISMATCH', 400);

        let lineTotal = 0;

        for (let si = 0; si < pickedSources.length; si += 1) {
          const source = pickedSources[si];

          // Strict scan verification
          const scanRecord = (ticket.outboundScanRecords || []).find(
            (r) => r.scanId === source.scanId &&
              r.barcode.toUpperCase() === source.barcode.toUpperCase() &&
              equal(r.pickedQuantity, source.quantity)
          );
          requireRule(scanRecord,
            `Nguồn ${source.barcode} chưa có bản ghi quét barcode hợp lệ từ hệ thống`, 'SCAN_RECORD_MISSING', 400);

          const location = await WarehouseLocation.findById(source.locationId).session(session);
          requireRule(location && ['ACTIVE', 'FULL'].includes(location.status) && !location.isFrozenForStocktake,
            `Vị trí ${source.locationCode || ''} không đủ điều kiện xuất`, 'LOCATION_UNAVAILABLE', 409);

          if (source.kind === 'ROLL') {
            const roll = await FabricRoll.findOne({
              _id: source.objectId,
              status: 'IN_STOCK',
              locationId: location._id,
              currentLengthMeters: { $gte: source.quantity },
            }).session(session);

            requireRule(roll, `Cây vải ${source.barcode} không còn đủ tồn khả dụng`, 'ROLL_UNAVAILABLE', 409);

            const before = roll.currentLengthMeters;
            const remainingMeters = round(before - source.quantity);

            const rollUpdate = await FabricRoll.updateOne(
              { _id: roll._id, currentLengthMeters: { $gte: source.quantity } },
              {
                $inc: { currentLengthMeters: -source.quantity },
                $set: {
                  sourceOutboundTicketId: ticket._id,
                  sourceOutboundLineIndex: li,
                  sourceOutboundSourceIndex: si,
                  ...(remainingMeters <= 0.0001 ? { status: 'DEPLETED' } : {}),
                },
              },
              { session }
            );
            requireRule(rollUpdate.matchedCount === 1, `Tồn cây vải ${source.barcode} đã thay đổi`, 'CONCURRENCY_ERROR', 409);

            await InventoryTransaction.create([{
              transactionCode: `${ticket.ticketCode}-${line.materialCode}-${li + 1}-${si + 1}`,
              warehouseType: 'RAW_MATERIAL',
              itemType: 'FABRIC_ROLL',
              rawMaterialId: line.rawMaterialId,
              fabricRollId: roll._id,
              locationId: location._id,
              transactionType: 'OUTBOUND_ISSUE_CUTTING',
              referenceModel: 'MaterialTicket',
              referenceId: ticket._id,
              quantityChange: -source.quantity,
              onHandBefore: before,
              onHandAfter: remainingMeters,
              performedByUserId: user._id,
              note: `${ticket.ticketCode} · ${ticket.department} · Cây ${source.barcode} · ${source.quantity}m`,
            }], { session });

          } else {
            let lot = mongoose.isValidObjectId(source.objectId)
              ? await MaterialStockLot.findById(source.objectId).session(session)
              : null;
            if (!lot) {
              lot = await MaterialStockLot.findOne({
                $or: [{ lotBarcode: source.barcode }, { supplierLotCode: source.barcode }],
              }).session(session);
            }

            const before = lot ? (lot.currentQty != null ? lot.currentQty : lot.initialQty) : source.quantity;

            if (lot) {
              requireRule(lot.quality !== 'REJECTED', `Lô ${source.barcode} đang bị từ chối / cách ly`, 'LOT_REJECTED', 409);
              const allocation = (lot.allocations || []).find((a) => id(a.locationId) === id(location._id));
              if (allocation) {
                if (allocation.putawayQty != null && allocation.putawayQty > 0) {
                  allocation.putawayQty = Math.max(0, round(allocation.putawayQty - source.quantity));
                }
                if (allocation.quantity != null) {
                  allocation.quantity = Math.max(0, round(allocation.quantity - source.quantity));
                }
              }
              lot.currentQty = Math.max(0, round((lot.currentQty != null ? lot.currentQty : lot.initialQty) - source.quantity));
              await lot.save({ session });
            }

            await InventoryTransaction.create([{
              transactionCode: `${ticket.ticketCode}-${line.materialCode}-${li + 1}-${si + 1}`,
              warehouseType: 'RAW_MATERIAL',
              itemType: 'RAW_MATERIAL',
              rawMaterialId: line.rawMaterialId,
              ...(lot ? { materialStockLotId: lot._id } : {}),
              locationId: location._id,
              transactionType: 'OUTBOUND_ISSUE_CUTTING',
              referenceModel: 'MaterialTicket',
              referenceId: ticket._id,
              quantityChange: -source.quantity,
              onHandBefore: before,
              onHandAfter: Math.max(0, round(before - source.quantity)),
              performedByUserId: user._id,
              note: `${ticket.ticketCode} · ${ticket.department} · Lô ${source.barcode} · ${source.quantity}`,
            }], { session });
          }

          const locationChanged = await WarehouseLocation.updateOne(
            { _id: location._id, currentOccupancy: { $gte: source.quantity } },
            { $inc: { currentOccupancy: -source.quantity } },
            { session }
          );
          if (locationChanged.matchedCount === 0 && location.currentOccupancy > 0) {
            await WarehouseLocation.updateOne({ _id: location._id }, { $set: { currentOccupancy: 0 } }, { session });
          }

          lineTotal = round(lineTotal + source.quantity);
        }

        line.sources = pickedSources.map((s) => ({
          scanId: s.scanId,
          kind: s.kind,
          objectId: s.objectId,
          barcode: s.barcode,
          locationId: s.locationId,
          locationCode: s.locationCode,
          rackName: s.rackName || resolveRackName(s.rackName, s.rackCode, line, s.locationCode),
          rackCode: s.rackCode || '',
          materialName: s.materialName || line.materialName || '',
          inboundTicketId: s.inboundTicketId,
          quantity: s.quantity,
          checkedByUserId: s.checkedByUserId || user._id,
          checkedAt: s.checkedAt || new Date(),
          checkedQuantity: s.quantity,
        }));

        line.issuedQuantity = round((line.issuedQuantity || 0) + lineTotal);
        line.quantity = lineTotal;

        const currentIssued = issuedByMaterial.get(id(line.rawMaterialId)) || 0;
        issuedByMaterial.set(id(line.rawMaterialId), round(currentIssued + lineTotal));
      }

      for (const [materialId, totalIssued] of issuedByMaterial) {
        const matUpdate = await RawMaterial.updateOne(
          { _id: materialId, onHandQty: { $gte: totalIssued } },
          { $inc: { onHandQty: -totalIssued } },
          { session }
        );
        requireRule(matUpdate.matchedCount === 1,
          'Tồn kho nguyên phụ liệu đã thay đổi, không đủ để xuất', 'MATERIAL_STOCK_CHANGED', 409);
      }

      ticket.status = 'COMPLETED';
      ticket.confirmedAt = new Date();
      ticket.confirmedByUserId = user._id;
      if (input.recipient) ticket.recipient = String(input.recipient).trim();
      if (input.handoverName) ticket.handoverName = String(input.handoverName).trim();
      ticket.version = (ticket.version || 0) + 1;

      await ticket.save({ session });
      result = ticket;
    });
  } finally {
    await session.endSession();
  }

  publishRealtime('material-outbound:changed', {
    ticketId: result._id,
    ticketCode: result.ticketCode,
    status: result.status,
    recipient: result.recipient,
  });

  return getOutboundRequestDetail(result._id, user);
}
