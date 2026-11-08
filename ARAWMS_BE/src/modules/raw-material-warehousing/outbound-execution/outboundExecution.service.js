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
import InventoryTransaction from '../../../models/InventoryTransaction.model.js';

const id = (value) => String(value || '');
const round = (value) => Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;
const equal = (a, b) => Math.abs(Number(a) - Number(b)) < 0.0001;
const error = (message, code, status = 400) => Object.assign(new Error(message), { code, status });
const requireRule = (condition, message, code, status) => { if (!condition) throw error(message, code, status); };
const permitted = (user) => user?.roles?.some((role) => ['OWNER', 'ADMIN', 'WAREHOUSE_MANAGER', 'WAREHOUSE_STAFF'].includes(role));
const access = (location, user) => !user.warehouseIds?.length || user.warehouseIds.some((value) => id(value) === id(location._id));
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
  const allowed = user.warehouseIds?.length ? await WarehouseLocation.find({ _id: { $in: user.warehouseIds } }).select('zoneCode').lean() : null;
  const zones = allowed && new Set(allowed.map((location) => location.zoneCode));
  const search = String(query.search || '').trim().toLocaleLowerCase('vi');
  return tickets.filter((ticket) => (!zones || zones.has(ticket.warehouseCode)) && (!query.department || ticket.department === query.department) &&
    (!search || [ticket.ticketCode, ticket.recipient, ...ticket.lines.map((line) => `${line.materialCode} ${line.materialName}`)]
      .some((value) => String(value || '').toLocaleLowerCase('vi').includes(search)))).map(safeTicket);
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
