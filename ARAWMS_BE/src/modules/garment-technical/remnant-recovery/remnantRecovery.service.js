/*
 * File: remnantRecovery.service.js
 * Author: Duy Anh & Antigravity
 * Date: 2026-11-06
 * Description: Business logic for Garment Technician:
 * 1. Request raw material outbound from Warehouse Manager for cutting.
 * 2. Garment directly performs fabric cutting and measures remnant.
 * 3. Fetches dynamic leftover threshold from DB (SystemSetting); if >= threshold, requests inbound return to warehouse for manager approval.
 */
import mongoose from 'mongoose';
import MaterialTicket from '../../../models/MaterialTicket.model.js';
import RemnantRecoveryRequest from '../../../models/RemnantRecoveryRequest.model.js';
import FabricRoll from '../../../models/FabricRoll.model.js';
import RawMaterial from '../../../models/RawMaterial.model.js';
import SystemSetting from '../../../models/SystemSetting.model.js';
import CounterSequence from '../../../models/CounterSequence.model.js';

const fail = (ok, message, code = 'INVALID_INPUT', status = 400) => {
  if (!ok) {
    const error = new Error(message);
    error.code = code;
    error.status = status;
    throw error;
  }
};

/**
 * Fetch dynamic remnant threshold directly from DB (SystemSetting collection)
 */
export async function getSystemThreshold() {
  const setting =
    (await SystemSetting.findOne({ settingKey: 'GLOBAL_CONFIG' }).lean()) ||
    (await SystemSetting.findOne().lean());

  // Return value directly from DB; fall back to schema default (2.0) if DB collection has no record
  const threshold =
    setting?.defaultFabricLeftoverThresholdMeters != null
      ? Number(setting.defaultFabricLeftoverThresholdMeters)
      : 2.0;

  return {
    thresholdMeters: threshold,
    settingKey: setting?.settingKey || 'GLOBAL_CONFIG',
  };
}

/**
 * Get dropdown options for Garment: materials list + current threshold from DB
 */
export async function getOutboundOptions(user) {
  const [materials, thresholdInfo] = await Promise.all([
    RawMaterial.find({ isActive: true, isDeleted: { $ne: true } })
      .select('materialCode materialName materialType category unit color gsm widthCm onHandQty reservedQty pendingPutawayQty')
      .sort({ materialName: 1 })
      .lean(),
    getSystemThreshold(),
  ]);

  const materialsWithAvailable = materials.map((m) => {
    const available = Math.max(0, (m.onHandQty || 0) - (m.reservedQty || 0) - (m.pendingPutawayQty || 0));
    return {
      ...m,
      availableQty: Math.round(available * 1000) / 1000,
    };
  });

  return {
    materials: materialsWithAvailable,
    threshold: thresholdInfo.thresholdMeters,
  };
}

/**
 * Garment Technician creates an outbound request for raw materials
 */
export async function createOutboundRequest(payload, user) {
  const ticketCode = await CounterSequence.getNextSequence('MATERIAL_OUTBOUND_TICKET', 'PXNL', 6);

  // Find material details for each line
  const materialIds = payload.lines.map((l) => l.rawMaterialId);
  const foundMaterials = await RawMaterial.find({ _id: { $in: materialIds } }).lean();
  const materialMap = new Map(foundMaterials.map((m) => [String(m._id), m]));

  const lines = payload.lines.map((line) => {
    const mat = materialMap.get(String(line.rawMaterialId));
    fail(mat, `Không tìm thấy nguyên phụ liệu ID ${line.rawMaterialId}`);

    return {
      rawMaterialId: mat._id,
      materialCode: mat.materialCode,
      materialName: mat.materialName,
      color: mat.color || '',
      unit: mat.unit,
      quantity: Number(line.quantity),
      sources: [], // Will be allocated by Warehouse Manager / Staff
    };
  });

  const ticket = new MaterialTicket({
    ticketCode,
    ticketType: 'OUTBOUND_FOR_CUTTING',
    warehouseCode: 'KHONPL',
    issueDate: new Date(),
    department: payload.department || 'XƯỞNG MAY',
    recipient: user?.fullName || user?.username || 'Kỹ thuật viên may',
    purpose: payload.purpose || 'Cắt may sản xuất',
    lines,
    status: 'WAITING_SCAN', // Waiting for Warehouse Manager to review & issue
    receiptNote: `Yêu cầu xuất nguyên phụ liệu cắt may tạo bởi ${user?.fullName || user?.username || 'KCS'}. ${payload.purpose || ''}`,
    createdByUserId: user?._id,
    createdByManagerId: user?._id, // placeholder for garment technician
  });

  await ticket.save();
  return ticket;
}

/**
 * List all outbound requests created by/for Garment
 */
export async function listGarmentOutboundRequests(user, query = {}) {
  const filter = {
    isDeleted: { $ne: true },
    ticketType: { $in: ['OUTBOUND_FOR_CUTTING', 'OUTBOUND_WAREHOUSE'] },
  };

  if (query.status && query.status !== 'ALL') {
    filter.status = query.status;
  }

  if (query.search) {
    const s = String(query.search).trim();
    filter.$or = [
      { ticketCode: { $regex: s, $options: 'i' } },
      { purpose: { $regex: s, $options: 'i' } },
      { recipient: { $regex: s, $options: 'i' } },
    ];
  }

  const tickets = await MaterialTicket.find(filter)
    .populate('createdByUserId', 'fullName employeeCode roleCode')
    .populate('confirmedByUserId', 'fullName employeeCode roleCode')
    .populate('lines.rawMaterialId', 'materialCode materialName unit color materialType')
    .sort({ createdAt: -1 })
    .lean();

  return tickets;
}

/**
 * Get detail of an outbound ticket
 */
export async function getOutboundRequestDetail(ticketId) {
  fail(mongoose.isValidObjectId(ticketId), 'ID phiếu xuất không hợp lệ');

  const ticket = await MaterialTicket.findOne({ _id: ticketId, isDeleted: { $ne: true } })
    .populate('createdByUserId', 'fullName employeeCode roleCode')
    .populate('confirmedByUserId', 'fullName employeeCode roleCode')
    .populate('lines.rawMaterialId', 'materialCode materialName unit color materialType')
    .lean();

  fail(ticket, 'Không tìm thấy phiếu xuất', 'TICKET_NOT_FOUND', 404);
  return ticket;
}

/**
 * List all fabric rolls issued to Garment from completed outbound tickets
 * Available for Garment to cut and report remnants.
 */
export async function listIssuedRollsForCutting(user, query = {}) {
  // Find completed outbound tickets for cutting
  const completedTickets = await MaterialTicket.find({
    ticketType: { $in: ['OUTBOUND_FOR_CUTTING', 'OUTBOUND_WAREHOUSE'] },
    status: 'COMPLETED',
    isDeleted: { $ne: true },
  })
    .populate('lines.rawMaterialId', 'materialCode materialName unit color materialType')
    .populate('items.rawMaterialId', 'materialCode materialName unit color materialType')
    .lean();

  // Find existing remnant recovery requests to know which rolls were already cut/recovered
  const existingRecoveries = await RemnantRecoveryRequest.find({ isDeleted: { $ne: true } }).lean();
  const recoveredRollIds = new Set(existingRecoveries.map((r) => String(r.originalRollId)));

  const issuedRolls = [];

  for (const ticket of completedTickets) {
    for (const item of ticket.items || []) {
      if (!item.fabricRollId || !item.isScannedCompleted || Number(item.scannedQty) <= 0) continue;
      issuedRolls.push({ outboundTicketId: ticket._id, outboundTicketCode: ticket.ticketCode,
        issueDate: ticket.confirmedAt || item.scannedAt || ticket.updatedAt || ticket.createdAt,
        department: ticket.department, recipient: ticket.recipient, purpose: ticket.purpose,
        rollId: item.fabricRollId, rollBarcode: item.rollBarcode,
        rawMaterialId: item.rawMaterialId?._id || item.rawMaterialId,
        materialCode: item.rawMaterialId?.materialCode || '',
        materialName: item.rawMaterialId?.materialName || '',
        color: item.rawMaterialId?.color || '', issuedLengthMeters: item.scannedQty,
        isRecovered: recoveredRollIds.has(String(item.fabricRollId)),
      });
    }
    for (const line of ticket.lines || []) {
      for (const src of line.sources || []) {
        if (src.kind === 'ROLL' && src.objectId) {
          const rollIdStr = String(src.objectId);
          const isRecovered = recoveredRollIds.has(rollIdStr);

          issuedRolls.push({
            outboundTicketId: ticket._id,
            outboundTicketCode: ticket.ticketCode,
            issueDate: ticket.confirmedAt || ticket.updatedAt || ticket.createdAt,
            department: ticket.department,
            recipient: ticket.recipient,
            purpose: ticket.purpose,
            rollId: src.objectId,
            rollBarcode: src.barcode,
            rawMaterialId: line.rawMaterialId?._id || line.rawMaterialId,
            materialCode: line.materialCode || line.rawMaterialId?.materialCode,
            materialName: line.materialName || line.rawMaterialId?.materialName,
            color: line.color || line.rawMaterialId?.color,
            issuedLengthMeters: src.quantity,
            isRecovered,
          });
        }
      }
    }
  }

  // Filter if needed
  if (query.search) {
    const s = String(query.search).trim().toLowerCase();
    return issuedRolls.filter(
      (r) =>
        r.rollBarcode.toLowerCase().includes(s) ||
        r.outboundTicketCode.toLowerCase().includes(s) ||
        (r.materialName && r.materialName.toLowerCase().includes(s))
    );
  }

  return issuedRolls;
}

/**
 * Garment cuts the fabric roll and records measured remnant.
 * Reads threshold directly from DB.
 * If remnant >= threshold: creates new Remnant FabricRoll and creates Inbound Ticket for Warehouse Manager approval.
 * If remnant < threshold: scraps below threshold.
 */
export async function recordCuttingAndRemnant(payload, user) {
  const {
    outboundTicketId,
    rollId,
    consumedCuttingLengthMeters,
    measuredRemnantLengthMeters,
    measuredRemnantWeightKg,
  } = payload;

  fail(mongoose.isValidObjectId(outboundTicketId), 'ID phiếu xuất không hợp lệ');
  fail(mongoose.isValidObjectId(rollId), 'ID cuộn vải không hợp lệ');

  const ticket = await MaterialTicket.findById(outboundTicketId);
  fail(ticket, 'Không tìm thấy phiếu xuất gốc', 'TICKET_NOT_FOUND', 404);

  const roll = await FabricRoll.findById(rollId).populate('rawMaterialId');
  fail(roll, 'Không tìm thấy thông tin cuộn vải', 'ROLL_NOT_FOUND', 404);

  // Check if this roll was already recorded
  const alreadyRecorded = await RemnantRecoveryRequest.findOne({
    originalRollId: roll._id,
    outboundTicketId: ticket._id,
    isDeleted: { $ne: true },
  });
  fail(!alreadyRecorded, `Cuộn vải ${roll.rollBarcode} đã được ghi nhận thu hồi trước đó (Mã: ${alreadyRecorded?.requestCode})`, 'ALREADY_RECORDED');

  // Load dynamic threshold directly from DB
  const thresholdInfo = await getSystemThreshold();
  const threshold = thresholdInfo.thresholdMeters;

  // Determine if remnant is above or below threshold
  const isAboveThreshold = Number(measuredRemnantLengthMeters) >= threshold;

  // Generate request code
  const requestCode = await CounterSequence.getNextSequence('REMNANT_RECOVERY_REQUEST', 'THVL', 6);

  // Find issued length from ticket line sources
  let issuedLengthMeters = 0;
  for (const line of ticket.lines || []) {
    const foundSrc = (line.sources || []).find((s) => String(s.objectId) === String(roll._id));
    if (foundSrc) {
      issuedLengthMeters = foundSrc.quantity;
      break;
    }
  }
  if (!issuedLengthMeters) {
    issuedLengthMeters = Number(consumedCuttingLengthMeters) + Number(measuredRemnantLengthMeters);
  }

  // Create RemnantRecoveryRequest record
  const recovery = new RemnantRecoveryRequest({
    requestCode,
    outboundTicketId: ticket._id,
    originalRollId: roll._id,
    rawMaterialId: roll.rawMaterialId?._id || roll.rawMaterialId,
    technicianId: user?._id,
    issuedLengthMeters,
    consumedCuttingLengthMeters: Number(consumedCuttingLengthMeters),
    measuredRemnantLengthMeters: Number(measuredRemnantLengthMeters),
    measuredRemnantWeightKg: measuredRemnantWeightKg ? Number(measuredRemnantWeightKg) : undefined,
    appliedThresholdMeters: threshold, // from DB!
    status: isAboveThreshold ? 'PENDING_RECEIPT_TICKET' : 'SCRAPPED_BELOW_THRESHOLD',
  });

  let generatedRemnantRoll = null;
  let generatedInboundTicket = null;

  if (isAboveThreshold) {
    // 1. Generate new Remnant Roll in fabric_rolls
    const remnantBarcode = `REM-${roll.rollBarcode || Date.now().toString().slice(-6)}-${Date.now().toString().slice(-3)}`;

    generatedRemnantRoll = await FabricRoll.create({
      rollBarcode: remnantBarcode,
      rawMaterialId: roll.rawMaterialId?._id || roll.rawMaterialId,
      supplierId: roll.supplierId,
      contractId: roll.contractId,
      isRemnantRoll: true,
      parentRollId: roll._id,
      initialLengthMeters: Number(measuredRemnantLengthMeters),
      currentLengthMeters: Number(measuredRemnantLengthMeters),
      initialWeightKg: measuredRemnantWeightKg ? Number(measuredRemnantWeightKg) : undefined,
      currentWeightKg: measuredRemnantWeightKg ? Number(measuredRemnantWeightKg) : undefined,
      unitCostPerMeter: roll.unitCostPerMeter || 0,
      status: 'PENDING_QC', // Waiting for warehouse manager to approve & putaway
      fifoInboundTimestamp: new Date(),
    });

    // 2. Generate Inbound Ticket for Warehouse Manager Approval
    const inboundTicketCode = await CounterSequence.getNextSequence('MATERIAL_INBOUND_TICKET', 'PNTH', 6);

    generatedInboundTicket = await MaterialTicket.create({
      ticketCode: inboundTicketCode,
      ticketType: 'INBOUND_FROM_REMNANT',
      receiptSource: 'DIRECT',
      status: 'READY_TO_CONFIRM', // Waiting for Warehouse Manager approval
      remnantRequestId: recovery._id,
      parentOutboundTicketId: ticket._id,
      receiptNote: `Nhập lại vải thừa sau cắt may từ phiếu xuất ${ticket.ticketCode} (Cuộn gốc: ${roll.rollBarcode}). Kỹ thuật viên may bàn giao: ${user?.fullName || user?.username || 'KCS'}. Vải thừa đo được: ${measuredRemnantLengthMeters}m (Ngưỡng hệ thống: ${threshold}m).`,
      createdByUserId: user?._id,
      createdByManagerId: user?._id,
      receiptLines: [
        {
          clientLineId: `LINE-REM-${Date.now()}`,
          rawMaterialId: roll.rawMaterialId?._id || roll.rawMaterialId,
          actualQty: Number(measuredRemnantLengthMeters),
          acceptedQty: Number(measuredRemnantLengthMeters),
          rejectedQty: 0,
          pendingQty: 0,
          inspectionConclusion: 'VẢI THỪA ĐẠT NGƯỠNG TÁI SỬ DỤNG',
          inspectionNote: `Thu hồi từ cuộn ${roll.rollBarcode}, độ dài ${measuredRemnantLengthMeters}m.`,
          rolls: [
            {
              clientLineId: `ROLL-REM-${Date.now()}`,
              supplierRollCode: remnantBarcode,
              lotCode: remnantBarcode,
              widthCm: roll.measuredWidthCm || 150,
              lengthMeters: Number(measuredRemnantLengthMeters),
              weightKg: measuredRemnantWeightKg ? Number(measuredRemnantWeightKg) : undefined,
              quality: 'ACCEPTED',
            },
          ],
        },
      ],
      receivedAt: new Date(),
    });

    // Link generated ids to recovery
    recovery.generatedRemnantRollId = generatedRemnantRoll._id;
    recovery.generatedInboundTicketId = generatedInboundTicket._id;
  }

  await recovery.save();

  return {
    recovery,
    remnantRoll: generatedRemnantRoll,
    inboundTicket: generatedInboundTicket,
    threshold,
    isAboveThreshold,
    message: isAboveThreshold
      ? `Vải thừa đo được ${measuredRemnantLengthMeters}m (≥ ngưỡng ${threshold}m). Đã sinh mã cuộn vải thừa "${generatedRemnantRoll?.rollBarcode}" và tạo phiếu yêu cầu nhập lại kho "${generatedInboundTicket?.ticketCode}" gửi Quản lý kho phê duyệt.`
      : `Vải thừa đo được ${measuredRemnantLengthMeters}m (< ngưỡng ${threshold}m). Đã ghi nhận là phế liệu/vụn cắt, không nhập kho.`,
  };
}

/**
 * List history of remnant recovery records
 */
export async function listRemnantRecoveryHistory(user, query = {}) {
  const filter = { isDeleted: { $ne: true } };

  if (query.status && query.status !== 'ALL') {
    filter.status = query.status;
  }

  const recoveries = await RemnantRecoveryRequest.find(filter)
    .populate('outboundTicketId', 'ticketCode department recipient purpose')
    .populate('originalRollId', 'rollBarcode initialLengthMeters')
    .populate('rawMaterialId', 'materialCode materialName unit color')
    .populate('technicianId', 'fullName employeeCode')
    .populate('generatedRemnantRollId', 'rollBarcode currentLengthMeters status')
    .populate('generatedInboundTicketId', 'ticketCode status')
    .sort({ createdAt: -1 })
    .lean();

  return recoveries;
}

