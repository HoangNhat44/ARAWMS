/*
 * File: technicianInboundRequest.service.js
 * Description: Stores technician inbound requests and advances them only from confirmed accepted receipts.
 */
import mongoose from 'mongoose';
import CounterSequence from '../../../models/CounterSequence.model.js';
import MaterialTicket from '../../../models/MaterialTicket.model.js';
import InventoryTransaction from '../../../models/InventoryTransaction.model.js';
import FabricRoll from '../../../models/FabricRoll.model.js';
import MaterialStockLot from '../../../models/MaterialStockLot.model.js';
import RawMaterial from '../../../models/RawMaterial.model.js';
import Supplier from '../../../models/Supplier.model.js';
import { publishRealtime } from '../../../common/services/realtime.js';
import { ReceiptError } from './inboundExecution.service.js';
import { isFractionalMaterialUnit } from '../../../common/constants/materialUnits.js';

const id = (value) => String(value || '');
const sameId = (left, right) => {
  const leftId = left?._id || left?.id || left;
  const rightId = right?._id || right?.id || right;
  return Boolean(leftId && rightId && (leftId.equals ? leftId.equals(rightId) : String(leftId) === String(rightId)));
};
const round = (value) => Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;
const fail = (condition, message, code, status = 400) => {
  if (!condition) throw new ReceiptError(message, code, status);
};
const openStatuses = ['WAITING_RECEIPT', 'PARTIALLY_RECEIVED'];
const legacyOpenStatuses = ['DRAFT', 'WAITING_QC', 'READY_TO_CONFIRM', 'PARTIALLY_RECEIVED'];
const requestLinesFor = (request) => (request.requestLines?.length ? request.requestLines :
  request.receiptLines?.length ? request.receiptLines.map((line) => ({ ...(line.toObject ? line.toObject() : line),
    clientLineId: line.clientLineId || id(line.rawMaterialId),
    requestedQty: line.actualQty || line.acceptedQty || 0,
    acceptedQty: line.acceptedQty ?? line.actualQty ?? 0, receivedQty: 0 })) :
    (request.items || []).map((item) => ({ clientLineId: id(item.rawMaterialId), rawMaterialId: item.rawMaterialId,
      requestedQty: item.expectedQty || 0, acceptedQty: item.expectedQty || 0, receivedQty: 0 })))
  .map((line) => {
    const plain = line.toObject ? line.toObject() : line;
    return { ...plain, clientLineId: plain.clientLineId || id(plain.rawMaterialId),
      acceptedQty: plain.acceptedQty ?? plain.requestedQty };
  });

/** Exposes open and completed requests without mixing them with stock receipts. */
export async function listTechnicianInboundRequests() {
  const [requests, historicalTickets] = await Promise.all([
    MaterialTicket.find({ ticketType: 'INBOUND_REQUEST', isDeleted: { $ne: true } })
      .select('ticketCode status requestedByTechnicianId requestedAt inspectionCompletedAt requestVersion requestNote receivingLocationId requestLines createdAt')
      .populate('requestedByTechnicianId', 'fullName employeeCode')
      .populate('requestLines.rawMaterialId', 'materialCode materialName color unit materialType widthCm gsm requiresWeightKg')
      .populate('requestLines.supplierId', 'supplierCode supplierName')
      .sort({ createdAt: -1 }).lean(),
    // Older inbound tickets may use any code and have items or receipt lines instead of request lines.
    MaterialTicket.find({ ticketType: { $in: ['INBOUND_FROM_PLAN', 'INBOUND_FROM_REMNANT'] },
      isDeleted: { $ne: true } })
      .select('ticketCode ticketType status requestStatus supplierId receivedAt items receiptLines requestLines createdAt')
      .populate('supplierId', 'supplierName supplierCode')
      .populate('requestLines.rawMaterialId', 'materialCode materialName color unit materialType widthCm gsm requiresWeightKg')
      .populate('items.rawMaterialId', 'materialCode materialName color unit materialType widthCm requiresWeightKg')
      .populate('receiptLines.rawMaterialId', 'materialCode materialName color unit materialType widthCm requiresWeightKg')
      .sort({ createdAt: -1 }).lean(),
  ]);
  const current = requests.map((request) => ({ ...request, requestLines: requestLinesFor(request).map((line) => ({
    ...line, remainingQty: round(Math.max(0, (line.acceptedQty ?? line.requestedQty) - (line.receivedQty || 0))),
  })) }));
  const historical = historicalTickets.map((ticket) => ({
    _id: ticket._id, ticketCode: ticket.ticketCode, ticketType: ticket.ticketType,
    status: ticket.requestStatus || ticket.status,
    supplierId: ticket.supplierId, receivedAt: ticket.receivedAt,
    createdAt: ticket.createdAt, legacyCompleted: true,
    requestLines: legacyOpenStatuses.includes(ticket.status) ? requestLinesFor(ticket).map((line) => ({ ...line,
      remainingQty: round(Math.max(0, line.requestedQty - (line.receivedQty || 0))) })) :
      ticket.items?.length ? ticket.items.map((item) => ({ rawMaterialId: item.rawMaterialId,
      requestedQty: item.expectedQty, receivedQty: item.scannedQty || 0,
      remainingQty: round(Math.max(0, item.expectedQty - (item.scannedQty || 0))) })) :
      (ticket.receiptLines || []).map((line) => ({ rawMaterialId: line.rawMaterialId,
        requestedQty: line.actualQty || 0, receivedQty: line.acceptedQty || 0,
        remainingQty: round(Math.max(0, (line.actualQty || 0) - (line.acceptedQty || 0))) })),
  }));
  return [...current, ...historical].sort((a, b) =>
    new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

/** A request is owned by the technician and names catalog materials with bounded quantities. */
export async function createTechnicianInboundRequest(input, user) {
  fail(user?.roleCode === 'GARMENT_TECHNICIAN' || user?.roles?.includes('GARMENT_TECHNICIAN'),
    'Chỉ kỹ thuật viên may được tạo yêu cầu nhập', 'TECHNICIAN_REQUIRED', 403);
  const lines = input?.requestLines;
  fail(Array.isArray(lines) && lines.length > 0 && lines.length <= 100,
    'Yêu cầu cần từ 1 đến 100 nguyên phụ liệu', 'INVALID_REQUEST_LINES');
  const seen = new Set();
  const parsed = lines.map((line) => {
    const materialId = id(line?.rawMaterialId);
    const quantity = Number(line?.requestedQty);
    const clientLineId = String(line?.clientLineId || `reqline-${new mongoose.Types.ObjectId()}`);
    const acceptedQty = Number(line?.acceptedQty ?? quantity);
    const supplierId = line?.supplierId ? id(line.supplierId) : '';
    const unitCost = line?.unitCost == null || line.unitCost === '' ? undefined : Number(line.unitCost);
    fail(mongoose.isValidObjectId(materialId) && /^[A-Za-z0-9_-]{1,100}$/.test(clientLineId) &&
      Number.isFinite(quantity) && quantity > 0 && quantity <= 1_000_000 &&
      Math.abs(quantity * 1000 - Math.round(quantity * 1000)) < 0.000001 &&
      Number.isFinite(acceptedQty) && acceptedQty >= 0 && acceptedQty <= quantity &&
      (unitCost == null || Number.isFinite(unitCost) && unitCost >= 0),
    'Nguyên phụ liệu hoặc số lượng yêu cầu không hợp lệ', 'INVALID_REQUEST_LINE');
    seen.add(materialId);
    return { clientLineId, rawMaterialId: materialId, supplierId: supplierId || undefined,
      supplierNameSnapshot: String(line?.supplierNameSnapshot || line?.supplierName || '').trim() || undefined,
      requestedQty: round(quantity), acceptedQty: round(acceptedQty), receivedQty: 0, unitCost,
      inspectionRef: String(line?.inspectionRef || '').trim().slice(0, 120),
      inspectedAt: line?.inspectedAt ? new Date(line.inspectedAt) : new Date(), inspectedByUserId: user._id,
      inspectionConclusion: String(line?.inspectionConclusion || 'Đã kiểm tra').trim(),
      rolls: Array.isArray(line?.rolls) ? line.rolls : [], lots: Array.isArray(line?.lots) ? line.lots : [] };
  });
  const materials = await RawMaterial.find({ _id: { $in: [...seen] }, isActive: true,
    isDeleted: { $ne: true } }).select('_id unit').lean();
  fail(materials.length === seen.size, 'Có nguyên phụ liệu không còn hoạt động', 'MATERIAL_UNAVAILABLE', 409);
  const supplierIds = [...new Set(parsed.map((line) => id(line.supplierId)).filter(Boolean))];
  const suppliers = supplierIds.length ? await Supplier.find({ _id: { $in: supplierIds }, isActive: true,
    isDeleted: { $ne: true } }).select('_id supplierName').lean() : [];
  fail(suppliers.length === supplierIds.length, 'Nhà cung cấp không còn hoạt động', 'SUPPLIER_UNAVAILABLE', 409);
  const supplierNames = new Map(suppliers.map((supplier) => [id(supplier._id), supplier.supplierName]));
  parsed.forEach((line) => { if (line.supplierId && !line.supplierNameSnapshot) line.supplierNameSnapshot = supplierNames.get(id(line.supplierId)); });
  const units = new Map(materials.map((material) => [id(material._id), material.unit]));
  fail(parsed.every((line) => isFractionalMaterialUnit(units.get(id(line.rawMaterialId))) ||
    Number.isInteger(line.requestedQty)), 'Số lượng phải là số nguyên theo đơn vị vật tư', 'INVALID_REQUEST_QUANTITY');
  const note = String(input?.requestNote || '').trim();
  fail(note.length <= 500, 'Ghi chú quá dài', 'INVALID_REQUEST_NOTE');
  const ticketCode = await CounterSequence.getNextSequence('TECHNICIAN_MATERIAL_INBOUND_REQUEST', 'YCNNL', 6);
  const request = await MaterialTicket.create({ ticketCode, ticketType: 'INBOUND_REQUEST',
    status: 'WAITING_RECEIPT', createdByUserId: user._id,
    requestedByTechnicianId: user._id, requestedAt: new Date(), inspectionCompletedAt: new Date(),
    receivingLocationId: input.receivingLocationId || undefined, requestNote: note,
    requestLines: parsed });
  publishRealtime('material-inbound-request:changed', { requestId: id(request._id), status: request.status });
  return request;
}

/** Validates a receipt against the current request; draft checks are repeated at commit. */
export async function validateInboundRequestReceipt(requestId, lines, session, expectedRequestVersion) {
  fail(mongoose.isValidObjectId(requestId), 'Yêu cầu nhập không hợp lệ', 'INVALID_INBOUND_REQUEST');
  const query = MaterialTicket.findOne({ _id: requestId,
    ticketType: { $in: ['INBOUND_REQUEST', 'INBOUND_FROM_PLAN', 'INBOUND_FROM_REMNANT'] },
    isDeleted: { $ne: true } });
  const request = await (session ? query.session(session) : query);
  fail(request, 'Không tìm thấy yêu cầu nhập', 'INBOUND_REQUEST_NOT_FOUND', 404);
  const legacy = request.ticketType !== 'INBOUND_REQUEST';
  fail(!legacy || request.requestStatus !== 'COMPLETED',
    'Yêu cầu đã nhận đủ hoặc đã đóng', 'INBOUND_REQUEST_CLOSED', 409);
  fail((legacy ? legacyOpenStatuses : openStatuses).includes(request.status),
    'Yêu cầu đã nhận đủ hoặc đã đóng', 'INBOUND_REQUEST_CLOSED', 409);
  if (legacy) {
    const recorded = await Promise.all([
      InventoryTransaction.exists({ referenceId: request._id, transactionType: 'INBOUND_RECEIPT' }).session(session),
      FabricRoll.exists({ inboundTicketId: request._id }).session(session),
      MaterialStockLot.exists({ inboundTicketId: request._id }).session(session),
    ]);
    fail(recorded.every((item) => !item), 'Phiếu gốc đã ghi nhận tồn kho', 'SOURCE_STOCK_ALREADY_RECORDED', 409);
  }
  if (expectedRequestVersion != null) fail(Number(request.requestVersion || 0) === Number(expectedRequestVersion),
    'Yêu cầu đã thay đổi sau khi mở form; hãy tải lại', 'REQUEST_VERSION_CONFLICT', 409);
  const requestedLines = requestLinesFor(request);
  const requested = new Map(requestedLines.map((line) => [String(line.clientLineId || id(line.rawMaterialId)), line]));
  const uniqueMaterial = new Set(requestedLines.map((line) => id(line.rawMaterialId))).size === requestedLines.length;
  const resolveLine = (line) => requested.get(String(line.requestLineId || line.clientLineId || '')) ||
    (uniqueMaterial ? requestedLines[0] : null);
  fail(lines.length > 0 && lines.every((line) => resolveLine(line)),
    'Phiếu có nguyên phụ liệu ngoài yêu cầu', 'MATERIAL_NOT_REQUESTED');
  const totals = new Map();
  for (const line of lines) {
    const requestLine = resolveLine(line);
    const key = String(requestLine.clientLineId || id(requestLine.rawMaterialId));
    totals.set(key, round((totals.get(key) || 0) + Number(line.acceptedQty || 0)));
    fail(sameId(line.rawMaterialId, requestLine.rawMaterialId),
      'Nguyên phụ liệu không khớp dòng yêu cầu', 'REQUEST_LINE_MISMATCH', 409);
    if (requestLine.supplierId) fail(sameId(line.supplierId, requestLine.supplierId),
      'Nhà cung cấp không khớp dòng yêu cầu', 'REQUEST_SUPPLIER_MISMATCH', 409);
    if (requestLine.unitCost != null) fail(Number(line.unitCost) === Number(requestLine.unitCost),
      'Đơn giá không khớp dữ liệu yêu cầu', 'REQUEST_COST_MISMATCH', 409);
    if (request.inspectionCompletedAt) fail(Number(line.actualQty) === Number(line.acceptedQty) &&
      Number(line.rejectedQty || 0) === 0 && Number(line.pendingQty || 0) === 0,
    'Không được sửa kết quả đã kiểm tra; hãy báo sai lệch', 'REQUEST_INSPECTION_IMMUTABLE', 409);
  }
  fail([...totals].every(([lineId, quantity]) => {
    const source = requested.get(lineId);
    return quantity <= round((source.acceptedQty ?? source.requestedQty) - (source.receivedQty || 0)) + .0001;
  }),
  'Số lượng đạt vượt phần còn thiếu của yêu cầu', 'REQUEST_QUANTITY_EXCEEDED', 409);
  if (session && request.inspectionCompletedAt) fail(requestedLines.every((source) => {
    const key = String(source.clientLineId || id(source.rawMaterialId));
    const remaining = round((source.acceptedQty ?? source.requestedQty) - (source.receivedQty || 0));
    return remaining <= 0 || Math.abs((totals.get(key) || 0) - remaining) <= .0001;
  }), 'Bàn giao chưa đủ số lượng đạt đã duyệt; hãy báo sai lệch thay vì xác nhận', 'REQUEST_DELIVERY_MISMATCH', 409);
  return request;
}

/** Runs inside the receipt transaction, so request progress and stock commit together. */
export async function applyInboundRequestReceipt(requestId, lines, session) {
  const request = await validateInboundRequestReceipt(requestId, lines, session);
  const accepted = new Map();
  for (const line of lines) {
    const key = String(line.requestLineId || line.clientLineId || id(line.rawMaterialId));
    accepted.set(key, round((accepted.get(key) || 0) + Number(line.acceptedQty || 0)));
  }
  const nextLines = requestLinesFor(request).map((line) => ({
    ...(line.toObject ? line.toObject() : line),
    receivedQty: round((line.receivedQty || 0) + (accepted.get(String(line.clientLineId || id(line.rawMaterialId))) || 0)),
  }));
  const status = nextLines.every((line) => line.receivedQty >= (line.acceptedQty ?? line.requestedQty) - .0001)
    ? 'COMPLETED' : nextLines.some((line) => line.receivedQty > 0)
      ? 'PARTIALLY_RECEIVED' : 'WAITING_RECEIPT';
  const legacy = request.ticketType !== 'INBOUND_REQUEST';
  const updated = await MaterialTicket.updateOne({ _id: request._id,
    ...(request.ticketType === 'INBOUND_REQUEST' ? { requestVersion: request.requestVersion } :
      { $or: [{ requestVersion: request.requestVersion }, { requestVersion: { $exists: false } }] }),
    status: { $in: legacy ? legacyOpenStatuses : openStatuses },
    ...(legacy ? { requestStatus: { $ne: 'COMPLETED' } } : {}) },
  { $set: { requestLines: nextLines, [legacy ? 'requestStatus' : 'status']: status },
    $inc: { requestVersion: 1 } }, { session });
  fail(updated.matchedCount === 1, 'Yêu cầu vừa thay đổi; hãy tải lại', 'REQUEST_VERSION_CONFLICT', 409);
  return status;
}

/** Records a delivery mismatch and prevents warehouse confirmation until the technician resubmits corrected data. */
export async function reportInboundRequestDiscrepancy(requestId, input, user) {
  fail(mongoose.isValidObjectId(requestId), 'Yêu cầu nhập không hợp lệ', 'INVALID_INBOUND_REQUEST');
  const reason = String(input?.reason || '').trim();
  fail(reason.length >= 3 && reason.length <= 1000, 'Cần mô tả sai lệch bàn giao', 'DISCREPANCY_REASON_REQUIRED');
  const request = await MaterialTicket.findOne({ _id: requestId,
    ticketType: { $in: ['INBOUND_REQUEST', 'INBOUND_FROM_PLAN', 'INBOUND_FROM_REMNANT'] },
    isDeleted: { $ne: true } });
  fail(request, 'Không tìm thấy yêu cầu nhập', 'INBOUND_REQUEST_NOT_FOUND', 404);
  const legacy = request.ticketType !== 'INBOUND_REQUEST';
  const currentStatus = legacy ? request.requestStatus || request.status : request.status;
  fail((legacy ? legacyOpenStatuses : openStatuses).includes(request.status) && currentStatus !== 'COMPLETED',
    'Yêu cầu đã đóng hoặc không thể báo sai lệch', 'INBOUND_REQUEST_CLOSED', 409);
  fail(Number(input.expectedRequestVersion) === Number(request.requestVersion || 0),
    'Yêu cầu đã thay đổi; hãy tải lại trước khi báo sai lệch', 'REQUEST_VERSION_CONFLICT', 409);
  const updated = await MaterialTicket.findOneAndUpdate({ _id: request._id,
    requestVersion: request.requestVersion || 0, status: { $in: legacy ? legacyOpenStatuses : openStatuses } }, {
    $push: { discrepancyReports: { receiptId: mongoose.isValidObjectId(input.receiptId) ? input.receiptId : undefined,
      requestVersion: request.requestVersion || 0, reason, reportedByUserId: user._id,
      reportedAt: new Date(), status: 'OPEN' } },
    $set: { [legacy ? 'requestStatus' : 'status']: 'DISCREPANCY_REPORTED' }, $inc: { requestVersion: 1 },
  }, { new: true, runValidators: true });
  fail(updated, 'Yêu cầu vừa thay đổi; hãy tải lại trước khi báo sai lệch', 'REQUEST_VERSION_CONFLICT', 409);
  publishRealtime('material-inbound-request:changed', { requestId: id(request._id), status: 'DISCREPANCY_REPORTED' });
  return updated;
}
