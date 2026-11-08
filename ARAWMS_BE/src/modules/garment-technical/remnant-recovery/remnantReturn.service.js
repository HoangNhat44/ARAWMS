import mongoose from 'mongoose';
import MaterialTicket from '../../../models/MaterialTicket.model.js';
import MaterialOutbound from '../../../models/MaterialOutbound.model.js';
import RemnantRecoveryRequest from '../../../models/RemnantRecoveryRequest.model.js';
import FabricRoll from '../../../models/FabricRoll.model.js';
import RawMaterial from '../../../models/RawMaterial.model.js';
import Supplier from '../../../models/Supplier.model.js';
import WarehouseLocation from '../../../models/WarehouseLocation.model.js';
import InventoryTransaction from '../../../models/InventoryTransaction.model.js';
import CounterSequence from '../../../models/CounterSequence.model.js';
import SystemSetting from '../../../models/SystemSetting.model.js';

const id = (value) => String(value?._id || value || '');
const round = (value) => Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;
const fail = (ok, message, code = 'INVALID_RETURN', status = 400) => {
  if (!ok) throw Object.assign(new Error(message), { code, status });
};
const pending = ['PENDING_RECEIPT_TICKET', 'WAITING_WAREHOUSE_CONFIRMATION', 'DISCREPANCY_REPORTED'];
const returned = ['WAITING_PUTAWAY_SCAN', 'RESTOCKED'];
const active = [...pending, ...returned];
const canManage = (user) => user?.roles?.some((role) =>
  ['OWNER', 'ADMIN', 'WAREHOUSE_MANAGER'].includes(role));
const canRequest = (user) => user?.roles?.some((role) =>
  ['OWNER', 'GARMENT_TECHNICIAN'].includes(role)) || user?.roleCode === 'GARMENT_TECHNICIAN';

async function thresholdMeters() {
  const setting = await SystemSetting.findOne({ settingKey: 'GLOBAL_CONFIG' }).lean() ||
    await SystemSetting.findOne().lean();
  return Number(setting?.defaultFabricLeftoverThresholdMeters ?? 2);
}

async function sourceTicket(ticketId, session) {
  fail(mongoose.isValidObjectId(ticketId), 'Phiếu xuất không hợp lệ', 'INVALID_ISSUE');
  const query = MaterialTicket.findById(ticketId);
  if (session) query.session(session);
  const ticket = await query || await (session
    ? MaterialOutbound.findById(ticketId).session(session) : MaterialOutbound.findById(ticketId));
  fail(ticket?.status === 'COMPLETED' && (!ticket.ticketType ||
    ['OUTBOUND_FOR_CUTTING', 'OUTBOUND_WAREHOUSE'].includes(ticket.ticketType)),
  'Cây vải chưa có phiếu xuất đã xác nhận', 'ISSUE_NOT_CONFIRMED', 409);
  return ticket;
}

function sourceAt(ticket, rollId, lineIndex, sourceIndex) {
  const matches = [];
  (ticket.lines || []).forEach((line, li) => (line.sources || []).forEach((source, si) => {
    if (source.kind === 'ROLL' && id(source.objectId) === id(rollId))
      matches.push({ line, source, lineIndex: li, sourceIndex: si });
  }));
  // Historical cutting tickets keep confirmed physical scans in items, not lines.sources.
  (ticket.items || []).forEach((item, index) => {
    if (id(item.fabricRollId) === id(rollId) && item.isScannedCompleted &&
        Number(item.scannedQty) > 0) matches.push({
      line: { rawMaterialId: item.rawMaterialId },
      source: { kind: 'ROLL', objectId: item.fabricRollId, barcode: item.rollBarcode,
        quantity: item.scannedQty }, lineIndex: index, sourceIndex: 0,
    });
  });
  const match = lineIndex == null || sourceIndex == null ? matches[0] :
    matches.find((item) => item.lineIndex === Number(lineIndex) &&
      item.sourceIndex === Number(sourceIndex));
  fail(match, 'Cây vải không thuộc dòng xuất đã chọn', 'SOURCE_NOT_IN_ISSUE', 409);
  return match;
}

async function sourceBalance(ticket, roll, lineIndex, sourceIndex, session) {
  const match = sourceAt(ticket, roll._id, lineIndex, sourceIndex);
  fail(match.source.barcode === roll.rollBarcode, 'Barcode cây vải không khớp dòng xuất', 'BARCODE_MISMATCH', 409);
  const query = RemnantRecoveryRequest.find({ outboundTicketId: ticket._id,
    originalRollId: roll._id, isDeleted: { $ne: true } });
  if (session) query.session(session);
  const requests = await query.lean();
  const sameSource = requests.filter((item) => item.outboundLineIndex == null ||
    item.outboundSourceIndex == null || item.outboundLineIndex === match.lineIndex &&
    item.outboundSourceIndex === match.sourceIndex);
  const recorded = round(sameSource.filter((item) => returned.includes(item.status))
    .reduce((sum, item) => sum + item.measuredRemnantLengthMeters, 0));
  const waiting = round(sameSource.filter((item) => pending.includes(item.status))
    .reduce((sum, item) => sum + item.measuredRemnantLengthMeters, 0));
  const scrapped = sameSource.some((item) => item.status === 'SCRAPPED_BELOW_THRESHOLD');
  const issued = round(match.source.quantity);
  return { ...match, issued, recorded, waiting,
    available: scrapped ? 0 : round(Math.max(0, issued - recorded - waiting)), scrapped };
}

export async function lookupRemnantSources(barcode, outboundTicketId) {
  const normalized = String(barcode || '').trim().toUpperCase();
  fail(normalized, 'Quét barcode cây vải hoặc tra cứu từ phiếu xuất', 'BARCODE_REQUIRED');
  const roll = await FabricRoll.findOne({ rollBarcode: normalized, isDeleted: { $ne: true } }).lean();
  fail(roll, 'Không tìm thấy cây vải theo barcode', 'ROLL_NOT_FOUND', 404);
  const ticketFilter = { status: 'COMPLETED', $or: [{ 'lines.sources.objectId': roll._id },
    { 'items.fabricRollId': roll._id }],
    ...(outboundTicketId ? { _id: outboundTicketId } : {}) };
  const [current, legacy, material, supplier, inbound] = await Promise.all([
    MaterialTicket.find({ ...ticketFilter, ticketType: { $in: ['OUTBOUND_FOR_CUTTING',
      'OUTBOUND_WAREHOUSE'] } }).lean(), MaterialOutbound.find(ticketFilter).lean(),
    RawMaterial.findById(roll.rawMaterialId).select('materialCode materialName color widthCm gsm unit').lean(),
    roll.supplierId ? Supplier.findById(roll.supplierId).select('supplierCode supplierName').lean() : null,
    roll.inboundTicketId ? MaterialTicket.findById(roll.inboundTicketId).select('ticketCode').lean() : null,
  ]);
  const candidates = [];
  for (const ticket of [...current, ...legacy]) {
    (ticket.lines || []).forEach((line, lineIndex) => (line.sources || []).forEach((source, sourceIndex) => {
      if (source.kind === 'ROLL' && id(source.objectId) === id(roll._id) &&
          source.barcode === roll.rollBarcode) candidates.push({ ticket, lineIndex, sourceIndex });
    }));
    (ticket.items || []).forEach((item, lineIndex) => {
      if (id(item.fabricRollId) === id(roll._id) && item.rollBarcode === roll.rollBarcode &&
          item.isScannedCompleted && Number(item.scannedQty) > 0)
        candidates.push({ ticket, lineIndex, sourceIndex: 0 });
    });
  }
  fail(candidates.length, outboundTicketId
    ? 'Cây vải không thuộc phiếu xuất đã chọn hoặc phiếu chưa xác nhận'
    : 'Không có lần xuất đã xác nhận của cây vải', 'ISSUE_NOT_FOUND', 404);
  const issues = await Promise.all(candidates.map(async ({ ticket, lineIndex, sourceIndex }) => {
    const balance = await sourceBalance(ticket, roll, lineIndex, sourceIndex);
    return { outboundTicketId: id(ticket._id), outboundTicketCode: ticket.ticketCode,
      outboundLineIndex: lineIndex, outboundSourceIndex: sourceIndex,
      issueDate: ticket.confirmedAt || ticket.issueDate || ticket.createdAt,
      productionOrder: ticket.purpose || ticket.department || '',
      materialCode: balance.line.materialCode || material?.materialCode || '',
      issuedLengthMeters: balance.issued, returnedLengthMeters: balance.recorded,
      pendingLengthMeters: balance.waiting, availableLengthMeters: balance.available,
      scrapped: balance.scrapped };
  }));
  return { roll: { id: id(roll._id), barcode: roll.rollBarcode,
    materialCode: material?.materialCode || '', materialName: material?.materialName || '',
    color: material?.color || '', widthCm: roll.measuredWidthCm || material?.widthCm || null,
    gsm: material?.gsm || null, supplierName: supplier?.supplierName || roll.supplierNameSnapshot || '',
    supplierCode: supplier?.supplierCode || '', originalInboundCode: inbound?.ticketCode || '',
    supplierRollCode: roll.supplierRollCode || '', supplierLotCode: roll.supplierLotCode || '' },
  issues: issues.sort((a, b) => new Date(b.issueDate || 0) - new Date(a.issueDate || 0)) };
}

/** Keeps an unresolved barcode/source mismatch on the confirmed issue itself. */
export async function reportUnidentifiedReturnSource(ticketId, barcode, reason, user) {
  fail(canRequest(user), 'Chỉ kỹ thuật viên được báo sai lệch nguồn', 'FORBIDDEN', 403);
  const message = String(reason || '').trim();
  fail(message.length >= 5, 'Mô tả sai lệch ít nhất 5 ký tự');
  const ticket = await sourceTicket(ticketId);
  ticket.sourceDiscrepancies.push({ sourceBarcode: String(barcode || '').trim().toUpperCase(),
    reason: message.slice(0, 500), reportedByUserId: user._id, reportedAt: new Date(), status: 'OPEN' });
  await ticket.save();
  return { ticketCode: ticket.ticketCode, discrepancy: ticket.sourceDiscrepancies.at(-1) };
}

const lengths = (input) => {
  const pieces = Array.isArray(input.pieces) ? input.pieces : [];
  return pieces.map((item) => Number(item.lengthMeters));
};
const sameOperation = (saved, input) => id(saved.outboundTicketId) === id(input.outboundTicketId) &&
  saved.sourceBarcode === String(input.barcode || '').trim().toUpperCase() &&
  saved.outboundLineIndex === Number(input.outboundLineIndex) &&
  saved.outboundSourceIndex === Number(input.outboundSourceIndex) &&
  saved.measuredRemnantLengthMeters === Number(input.measuredRemnantLengthMeters) &&
  saved.returnKind === (saved.status === 'SCRAPPED_BELOW_THRESHOLD'
    ? 'ORIGINAL_ROLL' : input.returnKind || 'ORIGINAL_ROLL') &&
  JSON.stringify((saved.pieces || []).map((item) => item.lengthMeters)) ===
    JSON.stringify(saved.status === 'SCRAPPED_BELOW_THRESHOLD' ? [] : lengths(input));

export async function submitRemnantReturn(input, user) {
  fail(canRequest(user), 'Chỉ kỹ thuật viên được gửi yêu cầu nhập lại', 'FORBIDDEN', 403);
  const key = String(input.operationKey || '').trim();
  fail(/^[\w-]{8,100}$/.test(key), 'Thiếu mã thao tác gửi yêu cầu', 'OPERATION_KEY_REQUIRED');
  const existing = await RemnantRecoveryRequest.findOne({ operationKey: key });
  if (existing) {
    fail(sameOperation(existing, input), 'Mã thao tác đã dùng cho yêu cầu khác', 'OPERATION_CONFLICT', 409);
    return { recovery: existing, isAboveThreshold: existing.status !== 'SCRAPPED_BELOW_THRESHOLD',
      alreadyProcessed: true };
  }
  const barcode = String(input.barcode || '').trim().toUpperCase();
  fail(Number.isInteger(Number(input.outboundLineIndex)) &&
    Number.isInteger(Number(input.outboundSourceIndex)) &&
    input.outboundLineIndex != null && input.outboundSourceIndex != null,
  'Chọn đúng dòng xuất và cây vải đã bàn giao', 'SOURCE_SELECTION_REQUIRED');
  const roll = await FabricRoll.findOne({ rollBarcode: barcode, isDeleted: { $ne: true } });
  fail(roll, 'Barcode cây vải không tồn tại', 'ROLL_NOT_FOUND', 404);
  const returnKind = input.returnKind || 'ORIGINAL_ROLL';
  fail(['ORIGINAL_ROLL', 'SEPARATE_PIECES'].includes(returnKind), 'Loại vải trả không hợp lệ');
  fail(input.measuredRemnantLengthMeters !== '' && input.measuredRemnantLengthMeters != null,
    'Nhập chiều dài vải thừa thực tế');
  const amount = Number(input.measuredRemnantLengthMeters);
  fail(Number.isFinite(amount) && amount > 0 && round(amount) === amount,
    'Chiều dài phải là số mét với tối đa ba chữ số thập phân');
  const threshold = await thresholdMeters();
  const qualifies = amount >= threshold;
  const pieceLengths = lengths(input);
  fail(!qualifies || returnKind !== 'SEPARATE_PIECES' || pieceLengths.length > 0 &&
    pieceLengths.every((value) => Number.isFinite(value) && value > 0 && round(value) === value) &&
    round(pieceLengths.reduce((sum, value) => sum + value, 0)) === amount,
  'Nhập đúng số mét cho từng khúc vải');
  fail(!qualifies || input.reusable !== false, 'Vải không đủ điều kiện dùng lại', 'NOT_REUSABLE', 409);
  const ticket = await sourceTicket(input.outboundTicketId);
  const balance = await sourceBalance(ticket, roll, input.outboundLineIndex, input.outboundSourceIndex);
  fail(!balance.scrapped, 'Phế liệu của dòng xuất này đã chốt', 'SCRAP_FINALIZED', 409);
  fail(amount <= balance.available, `Chỉ còn ${balance.available} m có thể yêu cầu trả`, 'RETURN_EXCEEDS_ISSUE', 409);
  const session = await mongoose.startSession();
  try {
    let recovery;
    await session.withTransaction(async () => {
      const committed = await RemnantRecoveryRequest.findOne({ operationKey: key }).session(session);
      if (committed) {
        fail(sameOperation(committed, input), 'Mã thao tác đã dùng cho yêu cầu khác', 'OPERATION_CONFLICT', 409);
        recovery = committed;
        return;
      }
      const lockedTicket = await sourceTicket(ticket._id, session);
      const lockedRoll = await FabricRoll.findById(roll._id).session(session);
      fail(lockedRoll?.rollBarcode === barcode, 'Nguồn cây vải đã thay đổi', 'ROLL_CHANGED', 409);
      // Every request for this issue writes the issue document; concurrent reservations then conflict.
      const locked = await lockedTicket.constructor.updateOne({ _id: lockedTicket._id, status: 'COMPLETED' },
        { $inc: { version: 1 } }, { session });
      fail(locked.matchedCount === 1, 'Phiếu xuất đã thay đổi', 'ISSUE_CHANGED', 409);
      const fresh = await sourceBalance(lockedTicket, lockedRoll,
        input.outboundLineIndex, input.outboundSourceIndex, session);
      fail(!fresh.scrapped && amount <= fresh.available,
        `Chỉ còn ${fresh.available} m có thể yêu cầu trả`, 'RETURN_EXCEEDS_ISSUE', 409);
      const requestCode = await CounterSequence.getNextSequence('REMNANT_RECOVERY_REQUEST', 'THVL', 6);
      [recovery] = await RemnantRecoveryRequest.create([{
        requestCode, operationKey: key, outboundTicketId: ticket._id,
        outboundTicketCodeSnapshot: ticket.ticketCode,
        outboundLineIndex: fresh.lineIndex, outboundSourceIndex: fresh.sourceIndex,
        sourceBarcode: barcode, originalRollId: roll._id, rawMaterialId: roll.rawMaterialId,
        technicianId: user._id, issuedLengthMeters: fresh.issued,
        consumedCuttingLengthMeters: Number(input.consumedCuttingLengthMeters || 0),
        measuredRemnantLengthMeters: amount,
        measuredRemnantWeightKg: input.measuredRemnantWeightKg == null ? undefined : Number(input.measuredRemnantWeightKg),
        appliedThresholdMeters: threshold, returnKind: qualifies ? returnKind : 'ORIGINAL_ROLL',
        pieces: qualifies ? pieceLengths.map((lengthMeters) => ({ lengthMeters })) : [],
        conditionNote: String(input.conditionNote || '').trim().slice(0, 500),
        requestedAt: new Date(),
        status: qualifies ? 'WAITING_WAREHOUSE_CONFIRMATION' : 'SCRAPPED_BELOW_THRESHOLD',
      }], { session });
    });
    return { recovery, threshold, isAboveThreshold: qualifies,
      message: qualifies ? 'Đã gửi yêu cầu nhập lại, chờ kho xác nhận; tồn kho chưa tăng.' :
        `Dưới ngưỡng ${threshold} m: đã chốt phế liệu, không tạo phiếu nhập.` };
  } catch (error) {
    if (error.code === 11000) {
      const same = await RemnantRecoveryRequest.findOne({ operationKey: key });
      if (same) {
        fail(sameOperation(same, input), 'Mã thao tác đã dùng cho yêu cầu khác', 'OPERATION_CONFLICT', 409);
        return { recovery: same, threshold, isAboveThreshold: same.status !== 'SCRAPPED_BELOW_THRESHOLD',
          alreadyProcessed: true };
      }
    }
    throw error;
  } finally { await session.endSession(); }
}

export async function listRemnantReturns() {
  return RemnantRecoveryRequest.find({ isDeleted: { $ne: true } })
    .populate({ path: 'originalRollId',
      select: 'rollBarcode supplierId supplierNameSnapshot supplierRollCode supplierLotCode measuredWidthCm inboundTicketId',
      populate: [{ path: 'supplierId', select: 'supplierCode supplierName' },
        { path: 'inboundTicketId', select: 'ticketCode' }] })
    .populate('rawMaterialId', 'materialCode materialName unit color')
    .populate('outboundTicketId', 'ticketCode issueDate purpose department')
    .populate('technicianId', 'fullName')
    .populate('generatedInboundTicketId', 'ticketCode status')
    .sort({ createdAt: -1 }).lean();
}

export async function reportRemnantDiscrepancy(requestId, reason, user) {
  fail(canManage(user), 'Chỉ quản lý kho được báo sai lệch', 'FORBIDDEN', 403);
  const message = String(reason || '').trim();
  fail(message, 'Nhập lý do sai lệch');
  const request = await RemnantRecoveryRequest.findOneAndUpdate({ _id: requestId,
    status: 'WAITING_WAREHOUSE_CONFIRMATION' }, { $set: { status: 'DISCREPANCY_REPORTED',
    discrepancyReason: message, discrepancyAt: new Date() } }, { new: true });
  fail(request, 'Yêu cầu không còn chờ kho xác nhận', 'REQUEST_CHANGED', 409);
  return request;
}

export async function closeRemnantReturn(requestId, status, user) {
  fail(['CANCELLED', 'REJECTED'].includes(status), 'Trạng thái không hợp lệ');
  fail(status === 'CANCELLED' || canManage(user), 'Chỉ quản lý kho được từ chối', 'FORBIDDEN', 403);
  const own = await RemnantRecoveryRequest.findById(requestId).select('technicianId').lean();
  fail(own && (canManage(user) || id(own.technicianId) === id(user?._id)),
    'Không có quyền đóng yêu cầu này', 'FORBIDDEN', 403);
  const request = await RemnantRecoveryRequest.findOneAndUpdate({ _id: requestId,
    status: { $in: pending } }, { $set: { status, cancelledAt: new Date(),
    cancelledByUserId: user._id } }, { new: true });
  fail(request, 'Yêu cầu không còn chờ xử lý', 'REQUEST_CHANGED', 409);
  return request;
}

export async function confirmRemnantReturn(requestId, input, user) {
  fail(canManage(user), 'Chỉ quản lý kho được xác nhận nhập lại', 'FORBIDDEN', 403);
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const request = await RemnantRecoveryRequest.findById(requestId).session(session);
      fail(request, 'Không tìm thấy yêu cầu', 'REQUEST_NOT_FOUND', 404);
      if (returned.includes(request.status)) {
        const receipt = request.generatedInboundTicketId ?
          await MaterialTicket.findById(request.generatedInboundTicketId).session(session) : null;
        result = { request, receiptId: request.generatedInboundTicketId,
          receiptCode: receipt?.ticketCode || '', alreadyProcessed: true };
        return;
      }
      fail(request.status === 'WAITING_WAREHOUSE_CONFIRMATION',
        'Yêu cầu chưa sẵn sàng xác nhận', 'REQUEST_NOT_READY', 409);
      fail(String(input.barcode || '').trim().toUpperCase() === request.sourceBarcode,
        'Barcode bàn giao không khớp cây vải gốc', 'BARCODE_MISMATCH', 409);
      fail(input.lengthMeters !== '' && input.lengthMeters != null &&
        Number.isFinite(Number(input.lengthMeters)) &&
        round(input.lengthMeters) === request.measuredRemnantLengthMeters,
        'Số mét thực nhận không khớp yêu cầu; hãy báo sai lệch', 'QUANTITY_MISMATCH', 409);
      const roll = await FabricRoll.findById(request.originalRollId).session(session);
      fail(roll?.rollBarcode === request.sourceBarcode, 'Cây vải gốc đã thay đổi', 'ROLL_CHANGED', 409);
      const ticket = await sourceTicket(request.outboundTicketId, session);
      sourceAt(ticket, roll._id, request.outboundLineIndex, request.outboundSourceIndex);
      const locationId = input.locationId || roll.locationId;
      const location = locationId ? await WarehouseLocation.findById(locationId).session(session) :
        await WarehouseLocation.findOne({ warehouseType: 'RAW_MATERIAL', zoneCode: 'A',
          status: 'ACTIVE', isDeleted: { $ne: true } }).session(session);
      fail(location?.warehouseType === 'RAW_MATERIAL' && location.status === 'ACTIVE' &&
        !location.isFrozenForStocktake, 'Chọn vị trí nhận nguyên liệu hợp lệ', 'LOCATION_REQUIRED', 409);
      const amount = request.measuredRemnantLengthMeters;
      fail(amount > 0 && amount >= request.appliedThresholdMeters,
        'Yêu cầu không đạt ngưỡng đã áp dụng', 'BELOW_THRESHOLD', 409);
      if (request.returnKind !== 'SEPARATE_PIECES')
        fail(!roll.pendingReturnReceiptId || roll.pendingReturnQty === 0,
          'Cây vải đang chờ xếp lần trả trước', 'ROLL_RETURN_PENDING', 409);
      if (request.returnKind !== 'SEPARATE_PIECES' && roll.status === 'IN_STOCK' &&
          roll.currentLengthMeters > 0)
        fail(!input.locationId || id(input.locationId) === id(roll.locationId),
          'Cây còn tồn phải xếp lại đúng vị trí hiện có', 'ORIGINAL_ROLL_LOCATION', 409);
      const receiptCode = await CounterSequence.getNextSequence('MATERIAL_INBOUND_TICKET', 'PNTH', 6);
      const [receipt] = await MaterialTicket.create([{ ticketCode: receiptCode,
        ticketType: 'INBOUND_FROM_REMNANT', receiptSource: 'DIRECT', status: 'COMPLETED',
        remnantRequestId: request._id, parentOutboundTicketId: ticket._id,
        receivingLocationId: location._id, usesPlannedLocationReservation: true,
        receiptLines: [{ clientLineId: `return-${request._id}`, rawMaterialId: roll.rawMaterialId,
          actualQty: amount, acceptedQty: amount, rejectedQty: 0, pendingQty: 0,
          inspectionConclusion: 'VẢI THỪA ĐỦ ĐIỀU KIỆN NHẬP LẠI',
          rolls: request.returnKind === 'SEPARATE_PIECES'
            ? request.pieces.map((piece, index) => ({ clientLineId: `piece-${index}`,
              lengthMeters: piece.lengthMeters, quality: 'ACCEPTED' }))
            : [{ clientLineId: 'original-roll', supplierRollCode: roll.rollBarcode,
              lengthMeters: amount, quality: 'ACCEPTED' }] }],
        confirmedAt: new Date(), confirmedByUserId: user._id,
        createdByManagerId: user._id, createdByUserId: user._id,
      }], { session });
      let affectedRolls = [];
      if (request.returnKind === 'SEPARATE_PIECES') {
        affectedRolls = [];
        for (let index = 0; index < request.pieces.length; index++) {
          const piece = request.pieces[index];
          const [created] = await FabricRoll.create([{ rollBarcode: `REM-${request.requestCode}-${index + 1}`,
            rawMaterialId: roll.rawMaterialId, supplierId: roll.supplierId,
            supplierNameSnapshot: roll.supplierNameSnapshot, contractId: roll.contractId,
            supplierRollCode: roll.supplierRollCode, supplierLotCode: roll.supplierLotCode,
            inboundTicketId: receipt._id, returnRequestId: request._id,
            sourceOutboundTicketId: ticket._id,
            sourceOutboundLineIndex: request.outboundLineIndex,
            sourceOutboundSourceIndex: request.outboundSourceIndex,
            isRemnantRoll: true, parentRollId: roll._id,
            initialLengthMeters: piece.lengthMeters, currentLengthMeters: piece.lengthMeters,
            measuredWidthCm: roll.measuredWidthCm, unitCostPerMeter: roll.unitCostPerMeter,
            status: 'QC_PASSED', fifoInboundTimestamp: new Date() }], { session });
          piece.rollId = created._id; piece.barcode = created.rollBarcode;
          affectedRolls.push(created);
        }
      } else {
        roll.currentLengthMeters = round(roll.currentLengthMeters + amount);
        if (roll.status === 'DEPLETED') roll.locationId = location._id;
        roll.pendingReturnQty = round((roll.pendingReturnQty || 0) + amount);
        roll.pendingReturnReceiptId = receipt._id;
        roll.returnReceiptIds.push(receipt._id);
        if (roll.status === 'DEPLETED') roll.status = 'QC_PASSED';
        await roll.save({ session });
        affectedRolls = [roll];
      }
      const material = await RawMaterial.findById(roll.rawMaterialId).session(session);
      fail(material, 'Không tìm thấy vật tư gốc', 'MATERIAL_NOT_FOUND', 409);
      const before = Number(material.onHandQty || 0);
      material.onHandQty = round(before + amount);
      material.pendingPutawayQty = round((material.pendingPutawayQty || 0) + amount);
      await material.save({ session });
      await InventoryTransaction.create([{ transactionCode: `${receiptCode}-RETURN`,
        warehouseType: 'RAW_MATERIAL', itemType: 'FABRIC_ROLL',
        rawMaterialId: roll.rawMaterialId, fabricRollId: affectedRolls[0]._id,
        referenceModel: 'MaterialTicket', referenceId: receipt._id,
        transactionType: 'INBOUND_RECEIPT', quantityChange: amount,
        onHandBefore: before, onHandAfter: material.onHandQty,
        performedByUserId: user._id, note: `Trả từ ${ticket.ticketCode}, ${request.sourceBarcode}` }], { session });
      request.generatedInboundTicketId = receipt._id;
      request.generatedRemnantRollId = request.returnKind === 'SEPARATE_PIECES'
        ? affectedRolls[0]._id : undefined;
      request.status = 'WAITING_PUTAWAY_SCAN';
      request.confirmedAt = new Date(); request.confirmedByUserId = user._id;
      await request.save({ session });
      result = { request, receiptId: receipt._id, receiptCode, rolls: affectedRolls.map((item) =>
        ({ barcode: item.rollBarcode, id: id(item._id) })) };
    });
    return result;
  } finally { await session.endSession(); }
}
