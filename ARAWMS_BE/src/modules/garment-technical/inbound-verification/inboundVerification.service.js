/*
 * File: inboundVerification.service.js
 * Author: Duy Anh & Antigravity
 * Date: 2026-11-06 (Updated 2026-11-09)
 * Description: Business logic for Garment Technician (KCS) to verify MaterialInboundPlans from Accounting and request raw material inbound to Warehouse Manager.
 *              Maintains 1 plan per row in list view, with full batch breakdown for multi-delivery inspection.
 */
import mongoose from 'mongoose';
import MaterialInboundPlan from '../../../models/MaterialInboundPlan.model.js';
import MaterialTicket from '../../../models/MaterialTicket.model.js';
import Supplier from '../../../models/Supplier.model.js';
import SupplierContract from '../../../models/SupplierContract.model.js';
import RawMaterial from '../../../models/RawMaterial.model.js';
import WarehouseLocation from '../../../models/WarehouseLocation.model.js';
import CounterSequence from '../../../models/CounterSequence.model.js';
import { publishRealtime } from '../../../common/services/realtime.js';
import { createNotification } from '../../notifications/notification.service.js';

// Tells the Warehouse Manager's request list to reload when a technician sends a new request.
const notifyInboundRequestChanged = (ticket) => publishRealtime('material-inbound-request:changed',
  { requestId: String(ticket._id), status: ticket.status });

/**
 * Returns options for dropdowns (suppliers, materials, contracts, locations)
 */
export const getInboundVerificationOptions = async () => {
  const [suppliers, materials, contracts, locations] = await Promise.all([
    Supplier.find({ isActive: true }).select('supplierCode supplierName phone contactName address').lean(),
    RawMaterial.find({ isActive: true }).select('materialCode materialName materialType category unit color unitCost gsm widthCm').lean(),
    SupplierContract.find({ status: { $in: ['ACTIVE', 'APPROVED', 'DRAFT_FRAMEWORK'] } }).select('contractCode title supplierId status').lean(),
    WarehouseLocation.find({ warehouseType: 'RAW_MATERIAL', status: 'ACTIVE' }).select('locationCode barcode zoneCode rackCode shelfCode').lean(),
  ]);

  return { suppliers, materials, contracts, locations };
};

/**
 * List MaterialInboundPlans with filtering and statistics.
 * Each MaterialInboundPlan is returned as exactly 1 row, containing its full batches array.
 */
export const listInboundPlans = async (query = {}, user) => {
  const dbFilter = {};

  if (query.status && query.status !== 'ALL') {
    dbFilter.status = query.status;
  }

  if (query.supplierId) {
    dbFilter.supplierId = query.supplierId;
  }

  if (query.search) {
    const s = query.search.trim();
    dbFilter.$or = [
      { planCode: { $regex: s, $options: 'i' } },
      { deliveryNote: { $regex: s, $options: 'i' } },
    ];
  }

  // Count by status for quick stats dashboard
  const [totalScheduled, totalInspection, totalVerified, totalDeviation, totalPlans] = await Promise.all([
    MaterialInboundPlan.countDocuments({ status: 'SCHEDULED' }),
    MaterialInboundPlan.countDocuments({ status: 'IN_INSPECTION' }),
    MaterialInboundPlan.countDocuments({ status: 'VERIFIED_MATCHED' }),
    MaterialInboundPlan.countDocuments({ status: 'DEVIATION_REPORTED' }),
    MaterialInboundPlan.countDocuments({}),
  ]);

  const rawPlans = await MaterialInboundPlan.find(dbFilter)
    .populate('supplierId', 'supplierCode supplierName phone contactName')
    .populate('contractId', 'contractCode title status versionNumber isLatestVersion amendmentReason')
    .populate('expectedItems.rawMaterialId', 'materialCode materialName category unit color gsm widthCm unitCost')
    .populate('batches.expectedItems.rawMaterialId', 'materialCode materialName category unit color gsm widthCm unitCost')
    .populate('createdByAccountantId', 'fullName username email')
    .populate('technicianVerification.verifiedByTechId', 'fullName username')
    .populate('batches.technicianVerification.verifiedByTechId', 'fullName username')
    .sort({ scheduledDeliveryDate: -1, createdAt: -1 })
    .lean();

  const plans = rawPlans.map((plan) => {
    const batches = Array.isArray(plan.batches) ? plan.batches : [];
    const totalBatches = batches.length > 0 ? batches.length : (plan.totalBatches || 1);
    const completedBatchesCount = batches.filter(
      (b) => b.status === 'VERIFIED_MATCHED' || b.status === 'DEVIATION_REPORTED'
    ).length;

    return {
      ...plan,
      totalBatches,
      hasMultipleBatches: batches.length > 1,
      completedBatchesCount,
    };
  });

  return {
    plans,
    stats: {
      totalPlans,
      totalScheduled,
      totalInspection,
      totalVerified,
      totalDeviation,
    },
  };
};

/**
 * Get plan details including any created MaterialTickets.
 * Handles both regular planId and compound batch planId (e.g. {planId}_batch_{batchNum}).
 */
export const getInboundPlanDetails = async (planId) => {
  let actualPlanId = planId;
  let batchNum = null;

  if (typeof planId === 'string' && planId.includes('_batch_')) {
    const parts = planId.split('_batch_');
    actualPlanId = parts[0];
    batchNum = Number(parts[1]);
  }

  if (!mongoose.Types.ObjectId.isValid(actualPlanId)) {
    const err = new Error('Mã kế hoạch không hợp lệ');
    err.status = 400;
    throw err;
  }

  const plan = await MaterialInboundPlan.findById(actualPlanId)
    .populate('supplierId', 'supplierCode supplierName phone contactName address')
    .populate('contractId', 'contractCode title status signedAt versionNumber isLatestVersion amendmentReason')
    .populate('expectedItems.rawMaterialId', 'materialCode materialName materialType category unit color gsm widthCm unitCost')
    .populate('batches.expectedItems.rawMaterialId', 'materialCode materialName materialType category unit color gsm widthCm unitCost')
    .populate('deliveryBatches.items.rawMaterialId', 'materialCode materialName unit')
    .populate('createdByAccountantId', 'fullName username email')
    .populate('technicianVerification.verifiedByTechId', 'fullName username')
    .populate('batches.technicianVerification.verifiedByTechId', 'fullName username')
    .lean();

  if (!plan) {
    const err = new Error('Không tìm thấy kế hoạch nhập nguyên phụ liệu');
    err.status = 404;
    throw err;
  }

  const relatedTickets = await MaterialTicket.find({ inboundPlanId: actualPlanId })
    .select('ticketCode ticketType status supplierDeliveryCode receivedAt receiptLines createdAt deliveryBatchId receiptNote')
    .populate('receiptLines.rawMaterialId', 'materialCode materialName unit')
    .sort({ createdAt: -1 })
    .lean();

  return {
    ...plan,
    totalBatches: plan.batches?.length || plan.totalBatches || 1,
    hasMultipleBatches: Array.isArray(plan.batches) && plan.batches.length > 1,
    relatedTickets,
  };
};

/**
 * Technician performs physical KCS inspection and submits verification.
 * Supports verifying a specific delivery batch or an entire plan.
 * Transitions status to VERIFIED_MATCHED or DEVIATION_REPORTED,
 * and creates a MaterialTicket (INBOUND_FROM_PLAN) for Warehouse Manager.
 */
export const verifyInboundPlan = async (planId, payload = {}, user) => {
  let actualPlanId = planId;
  let batchNum = payload.batchNumber ? Number(payload.batchNumber) : null;

  if (typeof planId === 'string' && planId.includes('_batch_')) {
    const parts = planId.split('_batch_');
    actualPlanId = parts[0];
    if (!batchNum) {
      batchNum = Number(parts[1]);
    }
  }

  if (!mongoose.Types.ObjectId.isValid(actualPlanId)) {
    const err = new Error('Mã kế hoạch không hợp lệ');
    err.status = 400;
    throw err;
  }

  const plan = await MaterialInboundPlan.findById(actualPlanId);
  if (!plan) {
    const err = new Error('Không tìm thấy kế hoạch nhập nguyên phụ liệu');
    err.status = 404;
    throw err;
  }

  // 1. Kiểm tra trạng thái Kế hoạch: chỉ xem nếu đã thay thế hoặc hủy
  if (['RESOLVED_SUPERSEDED', 'CANCELLED'].includes(plan.status) || plan.supersededByPlanId) {
    const statusText = plan.status === 'RESOLVED_SUPERSEDED' ? 'đã có phiên bản mới thay thế' : 'đã bị hủy';
    const err = new Error(`Kế hoạch [${plan.planCode}] ${statusText}. Kỹ thuật viên chỉ có quyền xem dữ liệu, không thể thực hiện nghiệm thu KCS.`);
    err.status = 400;
    throw err;
  }

  // 2. Kiểm tra trạng thái Hợp đồng: chỉ xem nếu hợp đồng đã có phiên bản mới hoặc đã hủy / chấm dứt
  if (plan.contractId) {
    const contract = await SupplierContract.findById(plan.contractId).select('status contractCode versionNumber isLatestVersion');
    if (contract && ['SUPERSEDED', 'CANCELLED', 'TERMINATED'].includes(contract.status)) {
      let cMsg = 'đã có phiên bản mới thay thế';
      if (contract.status === 'CANCELLED') cMsg = 'đã bị hủy';
      if (contract.status === 'TERMINATED') cMsg = 'đã chấm dứt hiệu lực';
      const err = new Error(`Hợp đồng kinh tế [${contract.contractCode}] ${cMsg}. Kỹ thuật viên chỉ có quyền xem dữ liệu, không thể thực hiện nghiệm thu KCS.`);
      err.status = 400;
      throw err;
    }
  }

  const {
    verifiedItems = [],
    isMatchedWithPlan = true,
    deviationSummary = '',
    evidenceImages = [],
    supplierDeliveryCode = '',
  } = payload;
  // Khi có sai lệch, chỉ tạo phiếu nếu KTV chủ động yêu cầu (tránh tự sinh phiếu ngoài ý muốn)
  const createInboundRequest = payload.createInboundRequest ?? Boolean(isMatchedWithPlan);

  // Validate required deviationSummary when there is a mismatch
  if (!isMatchedWithPlan && !deviationSummary?.trim()) {
    const err = new Error('Vui lòng nhập lý do và chi tiết sai lệch KCS khi phát hiện sai lệch');
    err.status = 400;
    throw err;
  }

  // Build a map of verified results
  const verifiedMap = new Map();
  verifiedItems.forEach((v) => {
    if (v.rawMaterialId) {
      verifiedMap.set(String(v.rawMaterialId), {
        actualVerifiedPassedQty: Number(v.actualVerifiedPassedQty) || 0,
        actualDefectiveOrShortQty: Number(v.actualDefectiveOrShortQty) || 0,
        defectReason: v.defectReason || '',
      });
    }
  });

  const targetBatch = (batchNum && Array.isArray(plan.batches) && plan.batches.length > 0)
    ? plan.batches.find((b) => Number(b.batchNumber) === batchNum || (payload.batchId && String(b._id) === String(payload.batchId)))
    : null;

  // Validation ràng buộc toàn vẹn: thực đạt + lỗi/thiếu phải bằng đúng kế hoạch
  const itemsToVerify = targetBatch ? targetBatch.expectedItems : plan.expectedItems;
  for (const item of itemsToVerify) {
    const key = String(item.rawMaterialId?._id || item.rawMaterialId);
    if (verifiedMap.has(key)) {
      const v = verifiedMap.get(key);
      const planned = Number(item.plannedQty || 0);
      const passed = Number(v.actualVerifiedPassedQty || 0);
      const defective = Number(v.actualDefectiveOrShortQty || 0);
      const total = passed + defective;
      if (total !== planned) {
        const matName = item.materialCodeSnapshot || item.rawMaterialId?.materialName || 'nguyên phụ liệu';
        const err = new Error(
          `Mặt hàng [${matName}]: Tổng số lượng thực nhận đạt chuẩn (${passed}) cộng với số lượng lỗi/thiếu (${defective}) bằng ${total}, không khớp với số lượng kế hoạch (${planned}). Vui lòng điều chỉnh để tổng đúng bằng số lượng kế hoạch.`
        );
        err.status = 400;
        throw err;
      }
    }
  }

  const now = new Date();
  const complianceStatus = isMatchedWithPlan ? 'MATCHED' : 'MISMATCHED';
  const newStatus = isMatchedWithPlan ? 'VERIFIED_MATCHED' : 'DEVIATION_REPORTED';

  let itemsForTicket = [];

  if (targetBatch) {
    // 1. Cập nhật số lượng kiểm định cho Đợt này
    targetBatch.expectedItems.forEach((item) => {
      const key = String(item.rawMaterialId);
      if (verifiedMap.has(key)) {
        const v = verifiedMap.get(key);
        item.actualVerifiedPassedQty = v.actualVerifiedPassedQty;
        item.actualDefectiveOrShortQty = v.actualDefectiveOrShortQty;
      }
    });

    targetBatch.technicianVerification = {
      verifiedByTechId: user?._id,
      verifiedAt: now,
      isMatchedWithPlan: Boolean(isMatchedWithPlan),
      complianceStatus,
      deviationSummary: deviationSummary?.trim() || '',
      evidenceImages: Array.isArray(evidenceImages) ? evidenceImages : [],
    };
    targetBatch.deliveryComplianceStatus = complianceStatus;
    targetBatch.status = newStatus;

    if (!isMatchedWithPlan) {
      targetBatch.deviationResolution = {
        status: 'UNRESOLVED',
        resolutionNotes: '',
      };
    }

    // 2. Cập nhật tổng dồn lên cấp root document
    plan.expectedItems.forEach((rootItem) => {
      let totalPassed = 0;
      let totalDefect = 0;
      plan.batches.forEach((b) => {
        const bItem = b.expectedItems.find((it) => String(it.rawMaterialId) === String(rootItem.rawMaterialId));
        if (bItem) {
          totalPassed += Number(bItem.actualVerifiedPassedQty || 0);
          totalDefect += Number(bItem.actualDefectiveOrShortQty || 0);
        }
      });
      rootItem.actualVerifiedPassedQty = totalPassed;
      rootItem.actualDefectiveOrShortQty = totalDefect;
    });

    // 3. Cập nhật trạng thái tổng thể của kế hoạch
    if (!isMatchedWithPlan) {
      plan.status = 'DEVIATION_REPORTED';
      plan.deliveryComplianceStatus = 'MISMATCHED';
      plan.technicianVerification = targetBatch.technicianVerification;
    } else {
      const allBatchesCompleted = plan.batches.every(
        (b) => b.status === 'VERIFIED_MATCHED' || (b.batchNumber === batchNum)
      );
      if (allBatchesCompleted) {
        plan.status = 'VERIFIED_MATCHED';
        plan.deliveryComplianceStatus = 'MATCHED';
      } else {
        plan.status = 'IN_INSPECTION';
      }
      plan.technicianVerification = targetBatch.technicianVerification;
    }

    itemsForTicket = targetBatch.expectedItems;
  } else {
    // Không có đợt hoặc kế hoạch 1 đợt đơn lẻ
    plan.expectedItems.forEach((item) => {
      const key = String(item.rawMaterialId);
      if (verifiedMap.has(key)) {
        const v = verifiedMap.get(key);
        item.actualVerifiedPassedQty = v.actualVerifiedPassedQty;
        item.actualDefectiveOrShortQty = v.actualDefectiveOrShortQty;
      }
    });

    plan.technicianVerification = {
      verifiedByTechId: user?._id,
      verifiedAt: now,
      isMatchedWithPlan: Boolean(isMatchedWithPlan),
      complianceStatus,
      deviationSummary: deviationSummary?.trim() || '',
      evidenceImages: Array.isArray(evidenceImages) ? evidenceImages : [],
    };
    plan.deliveryComplianceStatus = complianceStatus;
    plan.status = newStatus;

    itemsForTicket = plan.expectedItems;
  }

  // Cập nhật trạng thái hợp đồng nếu có sai lệch
  if (!isMatchedWithPlan && plan.contractId) {
    await SupplierContract.findByIdAndUpdate(plan.contractId, {
      status: 'DEVIATION_FLAGGED',
    });
  }

  // Gửi thông báo Realtime lên Kế toán nếu có sai lệch
  if (!isMatchedWithPlan) {
    try {
      const [contract, supplier] = await Promise.all([
        plan.contractId ? SupplierContract.findById(plan.contractId).select('contractCode contractTitle').lean() : null,
        plan.supplierId ? Supplier.findById(plan.supplierId).select('supplierName supplierCode').lean() : null,
      ]);

      const contractCodeStr = contract?.contractCode || '—';
      const supplierNameStr = supplier?.supplierName || 'Nhà cung ứng';
      const techNameStr = user?.fullName || user?.name || user?.username || 'Kỹ thuật may KCS';
      const batchNoteStr = targetBatch ? ` (Đợt ${targetBatch.batchNumber}/${plan.batches.length})` : '';

      await createNotification({
        title: `⚠️ Sai lệch giao nhận: ${plan.planCode}${batchNoteStr}`,
        message: `KCS ${techNameStr} đã báo cáo sai lệch khi nghiệm thu kế hoạch ${plan.planCode}${batchNoteStr} (HĐ: ${contractCodeStr} - ${supplierNameStr}). Lý do: ${deviationSummary.trim()}`,
        type: 'CONTRACT_DEVIATION',
        recipientRole: 'ACCOUNTANT',
        targetUrl: `/accountant/contract-deviations?planCode=${encodeURIComponent(plan.planCode)}&planId=${plan._id}`,
        metadata: {
          planId: plan._id,
          planCode: plan.planCode,
          batchNumber: targetBatch ? targetBatch.batchNumber : null,
          contractId: plan.contractId,
          contractCode: contractCodeStr,
          supplierId: plan.supplierId,
          supplierName: supplierNameStr,
          deviationSummary: deviationSummary.trim(),
          verifiedByTechId: user?._id,
          verifiedByTechName: techNameStr,
        },
      });
    } catch (notifErr) {
      console.error('⚠️ [Notification] Lỗi khi tạo thông báo Kế toán:', notifErr.message);
    }
  }

  await plan.save();

  let createdTicket = null;

  // Tạo MaterialTicket cho Quản lý kho nếu KCS yêu cầu
  const hasAcceptedQty = itemsForTicket.some((item) => Number(item.actualVerifiedPassedQty) > 0);

  // Không sinh phiếu rỗng: chỉ tạo khi có ít nhất một dòng đạt KCS
  if (createInboundRequest && hasAcceptedQty) {
    const ticketCode = await CounterSequence.getNextSequence('MATERIAL_INBOUND_TICKET', 'PNNL', 6);

    const receiptLines = itemsForTicket
      .filter((item) => (item.actualVerifiedPassedQty > 0 || item.actualDefectiveOrShortQty > 0))
      .map((item, idx) => {
        const v = verifiedMap.get(String(item.rawMaterialId)) || {};
        return {
          clientLineId: `LINE-${idx + 1}-${Date.now()}`,
          rawMaterialId: item.rawMaterialId,
          actualQty: (item.actualVerifiedPassedQty || 0) + (item.actualDefectiveOrShortQty || 0),
          acceptedQty: item.actualVerifiedPassedQty || 0,
          rejectedQty: item.actualDefectiveOrShortQty || 0,
          pendingQty: 0,
          defectReason: v.defectReason || '',
          inspectedByUserId: user?._id,
          inspectedAt: now,
          inspectionConclusion: isMatchedWithPlan ? 'ĐẠT CHUẨN KCS' : 'KCS XÁC NHẬN CÓ SAI LỆCH',
          inspectionNote: deviationSummary || '',
        };
      });

    const uniqueDeliveryCode = supplierDeliveryCode?.trim()
      ? `${supplierDeliveryCode.trim()}-${Date.now().toString().slice(-4)}`
      : `DELIV-${plan.planCode}${targetBatch ? `-D${targetBatch.batchNumber}` : ''}-${Date.now().toString().slice(-4)}`;

    const batchDesc = targetBatch ? ` (Đợt ${targetBatch.batchNumber}/${plan.batches.length})` : '';

    createdTicket = new MaterialTicket({
      ticketCode,
      ticketType: 'INBOUND_FROM_PLAN',
      inboundPlanId: plan._id,
      deliveryBatchId: targetBatch ? targetBatch._id : undefined,
      supplierId: plan.supplierId,
      contractId: plan.contractId,
      supplierDeliveryCode: uniqueDeliveryCode,
      receiptSource: 'PLAN',
      status: 'READY_TO_CONFIRM',
      receiptNote: `Yêu cầu nhập kho từ KCS theo kế hoạch ${plan.planCode}${batchDesc}. Kỹ thuật viên: ${user?.fullName || user?.username || 'KCS'}. ${deviationSummary ? `Lưu ý: ${deviationSummary}` : ''}`,
      createdByUserId: user?._id,
      createdByManagerId: user?._id,
      receiptLines,
      receivedAt: now,
    });

    await createdTicket.save();
    notifyInboundRequestChanged(createdTicket);
  }

  return {
    plan,
    ticket: createdTicket,
  };
};

/**
 * List all Inbound Requests (MaterialTickets) created by or routed to Warehouse Manager
 */
export const listInboundRequests = async (query = {}, user) => {
  const filter = { ticketType: 'INBOUND_FROM_PLAN' };

  if (query.status && query.status !== 'ALL') {
    filter.status = query.status;
  }

  if (query.search) {
    const s = query.search.trim();
    filter.$or = [
      { ticketCode: { $regex: s, $options: 'i' } },
      { supplierDeliveryCode: { $regex: s, $options: 'i' } },
      { receiptNote: { $regex: s, $options: 'i' } },
    ];
  }

  const tickets = await MaterialTicket.find(filter)
    .populate('supplierId', 'supplierCode supplierName phone')
    .populate('contractId', 'contractCode title')
    .populate('inboundPlanId', 'planCode scheduledDeliveryDate status')
    .populate('receiptLines.rawMaterialId', 'materialCode materialName unit category color')
    .populate('createdByUserId', 'fullName username')
    .sort({ createdAt: -1 })
    .lean();

  return tickets;
};

/**
 * Technician creates an ad-hoc or direct Material Inbound Request to Warehouse Manager
 */
export const createDirectInboundRequest = async (payload = {}, user) => {
  const {
    supplierId,
    contractId,
    inboundPlanId,
    supplierDeliveryCode,
    note,
    items = [],
  } = payload;

  if (!supplierId || !mongoose.Types.ObjectId.isValid(supplierId)) {
    const err = new Error('Vui lòng chọn Nhà cung cấp');
    err.status = 400;
    throw err;
  }

  if (!items.length) {
    const err = new Error('Danh sách nguyên phụ liệu không được để trống');
    err.status = 400;
    throw err;
  }

  const ticketCode = await CounterSequence.getNextSequence('MATERIAL_INBOUND_TICKET', 'PNNL', 6);

  const receiptLines = items.map((item, idx) => ({
    clientLineId: `LINE-${idx + 1}-${Date.now()}`,
    rawMaterialId: item.rawMaterialId,
    actualQty: Number(item.actualQty) || Number(item.acceptedQty) || 0,
    acceptedQty: Number(item.acceptedQty) || 0,
    rejectedQty: Number(item.rejectedQty) || 0,
    pendingQty: 0,
    defectReason: item.defectReason || '',
    inspectedByUserId: user?._id,
    inspectedAt: new Date(),
    inspectionConclusion: (Number(item.rejectedQty) > 0) ? 'KCS XÁC NHẬN CÓ HÀNG LỖI' : 'ĐẠT CHUẨN KCS',
  }));

  const uniqueDeliveryCode = supplierDeliveryCode?.trim()
    ? `${supplierDeliveryCode.trim()}-${Date.now().toString().slice(-4)}`
    : `DIRECT-${Date.now()}`;

  const ticket = new MaterialTicket({
    ticketCode,
    ticketType: 'INBOUND_FROM_PLAN',
    supplierId,
    contractId: contractId && mongoose.Types.ObjectId.isValid(contractId) ? contractId : undefined,
    inboundPlanId: inboundPlanId && mongoose.Types.ObjectId.isValid(inboundPlanId) ? inboundPlanId : undefined,
    supplierDeliveryCode: uniqueDeliveryCode,
    receiptSource: inboundPlanId ? 'PLAN' : 'DIRECT',
    status: 'READY_TO_CONFIRM',
    receiptNote: note || `Yêu cầu nhập kho nguyên phụ liệu gửi Quản lý kho bởi Kỹ thuật viên ${user?.fullName || user?.username || 'KCS'}`,
    createdByUserId: user?._id,
    createdByManagerId: user?._id,
    receiptLines,
    receivedAt: new Date(),
  });

  await ticket.save();
  notifyInboundRequestChanged(ticket);

  return ticket;
};
