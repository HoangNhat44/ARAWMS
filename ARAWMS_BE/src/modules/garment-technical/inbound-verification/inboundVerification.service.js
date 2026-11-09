/*
 * File: inboundVerification.service.js
 * Author: Duy Anh & Antigravity
 * Date: 2026-11-06
 * Description: Business logic for Garment Technician (KCS) to verify MaterialInboundPlans from Accounting and request raw material inbound to Warehouse Manager.
 */
import mongoose from 'mongoose';
import MaterialInboundPlan from '../../../models/MaterialInboundPlan.model.js';
import MaterialTicket from '../../../models/MaterialTicket.model.js';
import Supplier from '../../../models/Supplier.model.js';
import SupplierContract from '../../../models/SupplierContract.model.js';
import RawMaterial from '../../../models/RawMaterial.model.js';
import WarehouseLocation from '../../../models/WarehouseLocation.model.js';
import CounterSequence from '../../../models/CounterSequence.model.js';
import { createNotification } from '../../notifications/notification.service.js';

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
 * List MaterialInboundPlans with filtering and statistics
 */
export const listInboundPlans = async (query = {}, user) => {
  const filter = {};

  if (query.status && query.status !== 'ALL') {
    filter.status = query.status;
  }

  if (query.supplierId) {
    filter.supplierId = query.supplierId;
  }

  if (query.search) {
    const s = query.search.trim();
    filter.$or = [
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

  const plans = await MaterialInboundPlan.find(filter)
    .populate('supplierId', 'supplierCode supplierName phone contactName')
    .populate('contractId', 'contractCode title status')
    .populate('expectedItems.rawMaterialId', 'materialCode materialName category unit color gsm widthCm unitCost')
    .populate('createdByAccountantId', 'fullName username email')
    .populate('technicianVerification.verifiedByTechId', 'fullName username')
    .sort({ createdAt: -1 })
    .lean();

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
 * Get plan details including any created MaterialTickets
 */
export const getInboundPlanDetails = async (planId) => {
  if (!mongoose.Types.ObjectId.isValid(planId)) {
    const err = new Error('Mã kế hoạch không hợp lệ');
    err.status = 400;
    throw err;
  }

  const plan = await MaterialInboundPlan.findById(planId)
    .populate('supplierId', 'supplierCode supplierName phone contactName address')
    .populate('contractId', 'contractCode title status signedAt')
    .populate('expectedItems.rawMaterialId', 'materialCode materialName materialType category unit color gsm widthCm unitCost')
    .populate('deliveryBatches.items.rawMaterialId', 'materialCode materialName unit')
    .populate('createdByAccountantId', 'fullName username email')
    .populate('technicianVerification.verifiedByTechId', 'fullName username')
    .lean();

  if (!plan) {
    const err = new Error('Không tìm thấy kế hoạch nhập nguyên phụ liệu');
    err.status = 404;
    throw err;
  }

  // Look for any MaterialTicket already tied to this plan
  const relatedTickets = await MaterialTicket.find({ inboundPlanId: planId })
    .select('ticketCode ticketType status supplierDeliveryCode receivedAt receiptLines createdAt')
    .populate('receiptLines.rawMaterialId', 'materialCode materialName unit')
    .sort({ createdAt: -1 })
    .lean();

  return { ...plan, relatedTickets };
};

/**
 * Technician performs physical KCS inspection and submits verification
 * Transitions status to VERIFIED_MATCHED or DEVIATION_REPORTED,
 * and creates a MaterialTicket (INBOUND_FROM_PLAN) for Warehouse Manager.
 */
export const verifyInboundPlan = async (planId, payload = {}, user) => {
  if (!mongoose.Types.ObjectId.isValid(planId)) {
    const err = new Error('Mã kế hoạch không hợp lệ');
    err.status = 400;
    throw err;
  }

  const plan = await MaterialInboundPlan.findById(planId);
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

  // Update expectedItems with inspection results
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

  plan.expectedItems.forEach((item) => {
    const key = String(item.rawMaterialId);
    if (verifiedMap.has(key)) {
      const v = verifiedMap.get(key);
      item.actualVerifiedPassedQty = v.actualVerifiedPassedQty;
      item.actualDefectiveOrShortQty = v.actualDefectiveOrShortQty;
    }
  });

  // Validate required deviationSummary when there is a mismatch
  if (!isMatchedWithPlan && !deviationSummary?.trim()) {
    const err = new Error('Vui lòng nhập lý do và chi tiết sai lệch KCS khi phát hiện sai lệch');
    err.status = 400;
    throw err;
  }

  // Set technician verification record (no hardcoded prefill)
  plan.technicianVerification = {
    verifiedByTechId: user?._id,
    verifiedAt: new Date(),
    isMatchedWithPlan: Boolean(isMatchedWithPlan),
    deviationSummary: deviationSummary?.trim() || '',
    evidenceImages: Array.isArray(evidenceImages) ? evidenceImages : [],
  };

  // Status transition
  if (isMatchedWithPlan) {
    plan.status = 'VERIFIED_MATCHED';
  } else {
    plan.status = 'DEVIATION_REPORTED';

    // Cập nhật trạng thái hợp đồng thành DEVIATION_FLAGGED nếu có contractId
    if (plan.contractId) {
      await SupplierContract.findByIdAndUpdate(plan.contractId, {
        status: 'DEVIATION_FLAGGED',
      });
    }

    // Gửi thông báo Realtime lên Kế toán (UC 06)
    try {
      const [contract, supplier] = await Promise.all([
        plan.contractId ? SupplierContract.findById(plan.contractId).select('contractCode contractTitle').lean() : null,
        plan.supplierId ? Supplier.findById(plan.supplierId).select('supplierName supplierCode').lean() : null,
      ]);

      const contractCodeStr = contract?.contractCode || '—';
      const supplierNameStr = supplier?.supplierName || 'Nhà cung ứng';
      const techNameStr = user?.fullName || user?.name || user?.username || 'Kỹ thuật may KCS';

      await createNotification({
        title: `⚠️ Sai lệch giao nhận: ${plan.planCode}`,
        message: `KCS ${techNameStr} đã báo cáo sai lệch khi nghiệm thu kế hoạch ${plan.planCode} (HĐ: ${contractCodeStr} - ${supplierNameStr}). Lý do: ${deviationSummary.trim()}`,
        type: 'CONTRACT_DEVIATION',
        recipientRole: 'ACCOUNTANT',
        targetUrl: `/accountant/contract-deviations?planCode=${encodeURIComponent(plan.planCode)}&planId=${plan._id}`,
        metadata: {
          planId: plan._id,
          planCode: plan.planCode,
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

  // If matched or technician requests creating an inbound ticket for warehouse manager approval
  if (createInboundRequest) {
    const ticketCode = await CounterSequence.getNextSequence('MATERIAL_INBOUND_TICKET', 'PNNL', 6);

    const receiptLines = plan.expectedItems
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
          inspectedAt: new Date(),
          inspectionConclusion: isMatchedWithPlan ? 'ĐẠT CHUẨN KCS' : 'KCS XÁC NHẬN CÓ SAI LỆCH',
          inspectionNote: deviationSummary || '',
        };
      });

    const uniqueDeliveryCode = supplierDeliveryCode?.trim()
      ? `${supplierDeliveryCode.trim()}-${Date.now().toString().slice(-4)}`
      : `DELIV-${plan.planCode}-${Date.now().toString().slice(-4)}`;

    createdTicket = new MaterialTicket({
      ticketCode,
      ticketType: 'INBOUND_FROM_PLAN',
      inboundPlanId: plan._id,
      supplierId: plan.supplierId,
      contractId: plan.contractId,
      supplierDeliveryCode: uniqueDeliveryCode,
      receiptSource: 'PLAN',
      status: 'READY_TO_CONFIRM', // Ready for Warehouse Manager confirmation & putaway
      receiptNote: `Yêu cầu nhập kho từ KCS theo kế hoạch ${plan.planCode}. Kỹ thuật viên: ${user?.fullName || user?.username || 'KCS'}. ${deviationSummary ? `Lưu ý: ${deviationSummary}` : ''}`,
      createdByUserId: user?._id,
      createdByManagerId: user?._id,
      receiptLines,
      receivedAt: new Date(),
    });

    await createdTicket.save();
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

  return ticket;
};

