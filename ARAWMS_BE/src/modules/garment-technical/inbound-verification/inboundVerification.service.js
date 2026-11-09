/*
 * File: inboundVerification.service.js
 * Author: Duy Anh & Antigravity
 * Date: 2026-11-06 (Updated 2026-11-09 for multi-batch delivery plans)
 * Description: Business logic for Garment Technician (KCS) to verify MaterialInboundPlans from Accounting and request raw material inbound to Warehouse Manager.
 *              Supports multi-batch (đợt giao hàng) verification: decomposes multi-batch plans into individual inspectable batches.
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
 * Multi-batch plans are flattened into individual batch items so KCS can inspect each delivery batch independently.
 */
export const listInboundPlans = async (query = {}, user) => {
  const dbFilter = {};

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

  const rawPlans = await MaterialInboundPlan.find(dbFilter)
    .populate('supplierId', 'supplierCode supplierName phone contactName')
    .populate('contractId', 'contractCode title status')
    .populate('expectedItems.rawMaterialId', 'materialCode materialName category unit color gsm widthCm unitCost')
    .populate('batches.expectedItems.rawMaterialId', 'materialCode materialName category unit color gsm widthCm unitCost')
    .populate('createdByAccountantId', 'fullName username email')
    .populate('technicianVerification.verifiedByTechId', 'fullName username')
    .populate('batches.technicianVerification.verifiedByTechId', 'fullName username')
    .sort({ scheduledDeliveryDate: -1, createdAt: -1 })
    .lean();

  const flattenedPlans = [];

  rawPlans.forEach((plan) => {
    const hasBatches = Array.isArray(plan.batches) && plan.batches.length > 1;

    if (hasBatches) {
      plan.batches.forEach((b) => {
        const batchNum = Number(b.batchNumber) || 1;
        const batchTitle = b.batchTitle || `Đợt ${batchNum}/${plan.batches.length}: Tiếp nhận nguyên liệu`;
        const batchStatus = b.status || (
          b.technicianVerification?.complianceStatus === 'MATCHED'
            ? 'VERIFIED_MATCHED'
            : (b.technicianVerification?.complianceStatus === 'MISMATCHED'
                ? 'DEVIATION_REPORTED'
                : (plan.status || 'SCHEDULED'))
        );

        // Lấy đúng danh sách vật tư và số lượng dự kiến của riêng đợt này
        const batchExpectedItems = (Array.isArray(b.expectedItems) && b.expectedItems.length > 0)
          ? b.expectedItems
          : plan.expectedItems;

        flattenedPlans.push({
          ...plan,
          _id: `${plan._id}_batch_${batchNum}`,
          planId: plan._id,
          batchId: b._id,
          batchNumber: batchNum,
          batchTitle,
          batchPercentage: b.batchPercentage || Number((100 / plan.batches.length).toFixed(1)),
          totalBatches: plan.batches.length,
          isBatch: true,
          displayCode: `${plan.planCode} (Đợt ${batchNum}/${plan.batches.length})`,
          scheduledDeliveryDate: b.scheduledDeliveryDate || plan.scheduledDeliveryDate,
          status: batchStatus,
          deliveryComplianceStatus: b.deliveryComplianceStatus || b.technicianVerification?.complianceStatus || 'PENDING',
          technicianVerification: b.technicianVerification || {
            complianceStatus: 'PENDING',
            isMatchedWithPlan: null,
          },
          expectedItems: batchExpectedItems,
          deviationResolution: b.deviationResolution || plan.deviationResolution,
        });
      });
    } else {
      // Kế hoạch 1 đợt hoặc kế hoạch truyền thống
      const singleBatch = (Array.isArray(plan.batches) && plan.batches.length === 1) ? plan.batches[0] : null;
      flattenedPlans.push({
        ...plan,
        _id: String(plan._id),
        planId: plan._id,
        batchNumber: singleBatch?.batchNumber || 1,
        totalBatches: 1,
        isBatch: false,
        displayCode: plan.planCode,
        scheduledDeliveryDate: singleBatch?.scheduledDeliveryDate || plan.scheduledDeliveryDate,
        expectedItems: (singleBatch?.expectedItems?.length ? singleBatch.expectedItems : plan.expectedItems),
        technicianVerification: singleBatch?.technicianVerification?.verifiedAt
          ? singleBatch.technicianVerification
          : plan.technicianVerification,
        status: singleBatch?.status || plan.status,
      });
    }
  });

  // Tính toán thống kê dashboard theo các đợt tiếp nhận cụ thể
  let totalScheduled = 0;
  let totalInspection = 0;
  let totalVerified = 0;
  let totalDeviation = 0;

  flattenedPlans.forEach((p) => {
    if (p.status === 'SCHEDULED') totalScheduled++;
    else if (p.status === 'IN_INSPECTION') totalInspection++;
    else if (p.status === 'VERIFIED_MATCHED') totalVerified++;
    else if (p.status === 'DEVIATION_REPORTED') totalDeviation++;
  });

  const totalPlans = flattenedPlans.length;

  // Lọc theo trạng thái KCS nếu có query
  const plans = (query.status && query.status !== 'ALL')
    ? flattenedPlans.filter((p) => p.status === query.status)
    : flattenedPlans;

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
    .populate('contractId', 'contractCode title status signedAt')
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

  // Look for any MaterialTicket already tied to this plan
  const relatedTickets = await MaterialTicket.find({ inboundPlanId: actualPlanId })
    .select('ticketCode ticketType status supplierDeliveryCode receivedAt receiptLines createdAt deliveryBatchId receiptNote')
    .populate('receiptLines.rawMaterialId', 'materialCode materialName unit')
    .sort({ createdAt: -1 })
    .lean();

  if (batchNum && Array.isArray(plan.batches) && plan.batches.length > 0) {
    const batch = plan.batches.find((b) => Number(b.batchNumber) === batchNum);
    if (batch) {
      return {
        ...plan,
        _id: `${plan._id}_batch_${batch.batchNumber}`,
        planId: plan._id,
        batchId: batch._id,
        displayCode: `${plan.planCode} (Đợt ${batch.batchNumber}/${plan.batches.length})`,
        batchNumber: batch.batchNumber,
        batchTitle: batch.batchTitle || `Đợt ${batch.batchNumber}/${plan.batches.length}`,
        batchPercentage: batch.batchPercentage,
        totalBatches: plan.batches.length,
        isBatch: true,
        scheduledDeliveryDate: batch.scheduledDeliveryDate || plan.scheduledDeliveryDate,
        expectedItems: (Array.isArray(batch.expectedItems) && batch.expectedItems.length > 0)
          ? batch.expectedItems
          : plan.expectedItems,
        technicianVerification: batch.technicianVerification || plan.technicianVerification,
        status: batch.status || (
          batch.technicianVerification?.complianceStatus === 'MATCHED'
            ? 'VERIFIED_MATCHED'
            : (batch.technicianVerification?.complianceStatus === 'MISMATCHED' ? 'DEVIATION_REPORTED' : plan.status)
        ),
        relatedTickets,
      };
    }
  }

  return { ...plan, relatedTickets };
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

  const {
    verifiedItems = [],
    isMatchedWithPlan = true,
    deviationSummary = '',
    evidenceImages = [],
    supplierDeliveryCode = '',
    createInboundRequest = true,
  } = payload;

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
  if (createInboundRequest) {
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
