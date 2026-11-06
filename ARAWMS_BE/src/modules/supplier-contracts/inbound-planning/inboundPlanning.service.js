import { MaterialInboundPlan, SupplierContract, User } from '../../../models/index.js';
import { checkAndAutoTerminateExpiredContracts } from '../contract-workspace/contractWorkspace.service.js';

async function resolveAccountantUserId(explicitUserId) {
  if (explicitUserId) return explicitUserId;
  const accountant =
    (await User.findOne({ employeeCode: 'KETOAN' }).select('_id').lean()) ||
    (await User.findOne().select('_id').lean());
  return accountant?._id;
}

/**
 * UC: Lập kế hoạch lịch trình tiếp nhận nguyên phụ liệu - Danh sách
 */
export const listInboundPlans = async (filters = {}) => {
  const query = {};
  if (filters.contractId) query.contractId = filters.contractId;
  if (filters.supplierId) query.supplierId = filters.supplierId;
  if (filters.status && filters.status !== 'ALL') query.status = filters.status;
  if (filters.search && String(filters.search).trim()) {
    const regex = new RegExp(String(filters.search).trim(), 'i');
    query.planCode = regex;
  }

  return MaterialInboundPlan.find(query)
    .populate('contractId')
    .populate('supplierId')
    .populate('createdByAccountantId', 'fullName email employeeCode')
    .populate('expectedItems.rawMaterialId')
    .populate('batches.expectedItems.rawMaterialId')
    .populate('technicianVerification.verifiedByTechId', 'fullName email employeeCode')
    .populate('deviationResolution.resolvedByAccountantId', 'fullName email employeeCode')
    .populate('batches.technicianVerification.verifiedByTechId', 'fullName email employeeCode')
    .populate('batches.deviationResolution.resolvedByAccountantId', 'fullName email employeeCode')
    .populate('parentSupersededPlanId', 'planCode versionNumber status scheduledDeliveryDate amendmentReason')
    .populate('rootPlanId', 'planCode versionNumber')
    .sort({ scheduledDeliveryDate: -1, createdAt: -1 });
};

/**
 * UC: Lập kế hoạch lịch trình tiếp nhận nguyên phụ liệu - Chi tiết theo ID
 */
export const getInboundPlanById = async (planId) => {
  const plan = await MaterialInboundPlan.findById(planId)
    .populate('contractId')
    .populate('supplierId')
    .populate('createdByAccountantId', 'fullName email employeeCode')
    .populate('expectedItems.rawMaterialId')
    .populate('batches.expectedItems.rawMaterialId')
    .populate('technicianVerification.verifiedByTechId', 'fullName email employeeCode')
    .populate('parentSupersededPlanId', 'planCode versionNumber status scheduledDeliveryDate amendmentReason')
    .populate('rootPlanId', 'planCode versionNumber');

  if (!plan) {
    const err = new Error('Không tìm thấy kế hoạch tiếp nhận nguyên liệu');
    err.statusCode = 404;
    throw err;
  }
  return plan;
};

/**
 * Lấy tóm tắt tiến độ các đợt tiếp nhận của một Hợp đồng (Hỗ trợ chia nhiều đợt nhập)
 */
export const getContractInboundSummary = async (contractId) => {
  const contract = await SupplierContract.findById(contractId)
    .populate('supplierId')
    .populate('contractedMaterials.rawMaterialId');
  if (!contract) {
    const err = new Error('Không tìm thấy hợp đồng mua nguyên phụ liệu');
    err.statusCode = 404;
    throw err;
  }

  const existingPlans = await MaterialInboundPlan.find({ contractId })
    .sort({ batchNumber: 1, scheduledDeliveryDate: 1 })
    .populate('expectedItems.rawMaterialId')
    .populate('createdByAccountantId', 'fullName email employeeCode');

  const materialSummaries = (contract.contractedMaterials || []).map((mat) => {
    const rawIdStr = String(mat.rawMaterialId?._id || mat.rawMaterialId);
    let totalScheduledQty = 0;
    existingPlans.forEach((plan) => {
      if (plan.status !== 'CANCELLED') {
        const item = (plan.expectedItems || []).find(
          (i) => String(i.rawMaterialId?._id || i.rawMaterialId) === rawIdStr
        );
        if (item) {
          totalScheduledQty += Number(item.plannedQty || 0);
        }
      }
    });

    const contractedQty = Number(mat.contractedQty || 0);
    const remainingQty = Math.max(0, contractedQty - totalScheduledQty);
    const scheduledPercentage =
      contractedQty > 0
        ? Number(((totalScheduledQty / contractedQty) * 100).toFixed(2))
        : 0;

    return {
      rawMaterialId: rawIdStr,
      materialCode: mat.materialCodeSnapshot || mat.rawMaterialId?.materialCode || 'NVL',
      materialName: mat.materialNameSnapshot || mat.rawMaterialId?.materialName || '',
      unit: mat.unitSnapshot || mat.rawMaterialId?.unit || 'METER',
      contractedQty,
      totalScheduledQty,
      remainingQty,
      scheduledPercentage,
    };
  });

  const nextBatchNumber = existingPlans.length + 1;

  return {
    contract: {
      _id: contract._id,
      contractCode: contract.contractCode,
      contractTitle: contract.contractTitle,
      status: contract.status,
      effectiveFrom: contract.effectiveFrom,
      effectiveTo: contract.effectiveTo,
      supplier: contract.supplierId,
      contractedMaterials: contract.contractedMaterials,
      partialDeliveryAllowed: contract.commercialTerms?.partialDeliveryAllowed !== false,
    },
    existingPlans,
    materialSummaries,
    nextBatchNumber,
    totalExistingPlans: existingPlans.length,
  };
};

/**
 * UC: Lập kế hoạch lịch trình tiếp nhận nguyên phụ liệu - Tạo mới (Hỗ trợ 1 đợt hoặc nhiều đợt)
 */
export const scheduleInboundPlan = async (payload, currentUserId) => {
  await checkAndAutoTerminateExpiredContracts();
  const contract = await SupplierContract.findById(payload.contractId);
  if (!contract) {
    const err = new Error('Không tìm thấy hợp đồng mua nguyên phụ liệu');
    err.statusCode = 404;
    throw err;
  }

  if (contract.status !== 'ACTIVE') {
    const err = new Error(
      `Chỉ được phép lập kế hoạch tiếp nhận cho hợp đồng đang có hiệu lực (ACTIVE). Hợp đồng ${contract.contractCode} hiện đang ở trạng thái "${contract.status}".`
    );
    err.statusCode = 400;
    throw err;
  }

  // Quy tắc cốt lõi: 1 Hợp đồng chỉ được có 1 kế hoạch nhập hàng và các version của nó
  const existingPlanForContract = await MaterialInboundPlan.findOne({
    contractId: contract._id,
    status: { $ne: 'CANCELLED' },
  });
  if (existingPlanForContract) {
    const err = new Error(
      `Hợp đồng [${contract.contractCode}] này đã có kế hoạch nhập hàng (${existingPlanForContract.planCode}). Mỗi hợp đồng chỉ được có 1 kế hoạch nhập và các phiên bản của nó. Vui lòng tạo phiên bản mới (v...) cho kế hoạch hiện tại.`
    );
    err.statusCode = 400;
    throw err;
  }

  const accountantId = await resolveAccountantUserId(currentUserId);
  const totalExistingPlans = await MaterialInboundPlan.countDocuments();
  const planCode = payload.planCode
    ? String(payload.planCode).trim().toUpperCase()
    : `KH-NHAP-${String(totalExistingPlans + 1).padStart(3, '0')}`;

  const existing = await MaterialInboundPlan.findOne({ planCode });
  if (existing) {
    const err = new Error(`Mã kế hoạch tiếp nhận ${planCode} đã tồn tại trong hệ thống.`);
    err.statusCode = 409;
    throw err;
  }

  // Chuẩn hóa danh sách các đợt giao hàng (batches)
  let normalizedBatches = [];
  if (Array.isArray(payload.batches) && payload.batches.length > 0) {
    normalizedBatches = payload.batches.map((b, bIdx) => {
      const batchNo = Number(b.batchNumber || bIdx + 1);
      return {
        batchNumber: batchNo,
        batchTitle: b.batchTitle || `Đợt ${batchNo}/${payload.batches.length}: Tiếp nhận nguyên liệu`,
        batchPercentage: Number(b.batchPercentage || (100 / payload.batches.length).toFixed(1)),
        scheduledDeliveryDate: new Date(b.scheduledDeliveryDate),
        status: 'SCHEDULED',
        notes: b.notes || '',
        expectedItems: (b.expectedItems || []).map((item) => {
          const contractMat = (contract.contractedMaterials || []).find(
            (cm) => String(cm.rawMaterialId?._id || cm.rawMaterialId) === String(item.rawMaterialId)
          );
          return {
            rawMaterialId: item.rawMaterialId,
            plannedQty: Number(item.plannedQty || 0),
            unitSnapshot: item.unit || item.unitSnapshot || contractMat?.unitSnapshot || 'METER',
            actualVerifiedPassedQty: 0,
            actualDefectiveOrShortQty: 0,
          };
        }),
      };
    });
  }

  // Tổng hợp expectedItems cho toàn bộ kế hoạch (tổng các đợt)
  const aggregatedItemsMap = new Map();
  if (normalizedBatches.length > 0) {
    normalizedBatches.forEach((batch) => {
      batch.expectedItems.forEach((it) => {
        const idStr = String(it.rawMaterialId);
        if (!aggregatedItemsMap.has(idStr)) {
          aggregatedItemsMap.set(idStr, {
            rawMaterialId: it.rawMaterialId,
            plannedQty: it.plannedQty,
            unitSnapshot: it.unitSnapshot,
            actualVerifiedPassedQty: 0,
            actualDefectiveOrShortQty: 0,
          });
        } else {
          const cur = aggregatedItemsMap.get(idStr);
          cur.plannedQty += it.plannedQty;
        }
      });
    });
  } else if (Array.isArray(payload.expectedItems)) {
    payload.expectedItems.forEach((it) => {
      const contractMat = (contract.contractedMaterials || []).find(
        (cm) => String(cm.rawMaterialId?._id || cm.rawMaterialId) === String(it.rawMaterialId)
      );
      aggregatedItemsMap.set(String(it.rawMaterialId), {
        rawMaterialId: it.rawMaterialId,
        plannedQty: Number(it.plannedQty || 0),
        unitSnapshot: it.unit || it.unitSnapshot || contractMat?.unitSnapshot || 'METER',
        actualVerifiedPassedQty: 0,
        actualDefectiveOrShortQty: 0,
      });
    });
  }

  const rootExpectedItems = Array.from(aggregatedItemsMap.values());
  const firstDeliveryDate = normalizedBatches.length > 0
    ? normalizedBatches[0].scheduledDeliveryDate
    : (payload.scheduledDeliveryDate ? new Date(payload.scheduledDeliveryDate) : new Date());

  const plan = await MaterialInboundPlan.create({
    planCode,
    contractId: contract._id,
    supplierId: contract.supplierId,
    totalBatches: normalizedBatches.length || 1,
    batches: normalizedBatches,
    scheduledDeliveryDate: firstDeliveryDate,
    status: 'SCHEDULED',
    createdByAccountantId: accountantId,
    physicalContractPhotos: Array.isArray(payload.physicalContractPhotos)
      ? payload.physicalContractPhotos
      : [],
    notes: payload.notes || '',
    expectedItems: rootExpectedItems,
    batchNumber: 1,
    batchTitle: normalizedBatches.length > 1 ? `Kế hoạch ${normalizedBatches.length} đợt giao` : 'Tiếp nhận nguyên vật liệu',
    batchPercentage: 100,
  });

  return MaterialInboundPlan.findById(plan._id)
    .populate('contractId')
    .populate('supplierId')
    .populate('createdByAccountantId', 'fullName email employeeCode')
    .populate('expectedItems.rawMaterialId')
    .populate('batches.expectedItems.rawMaterialId');
};

export const updateInboundPlanStatus = async (planId, payload) => {
  const plan = await MaterialInboundPlan.findById(planId);
  if (!plan) {
    const err = new Error('Không tìm thấy kế hoạch tiếp nhận nguyên liệu');
    err.statusCode = 404;
    throw err;
  }

  if (payload.status) {
    plan.status = payload.status;
  }
  if (payload.scheduledDeliveryDate) {
    plan.scheduledDeliveryDate = new Date(payload.scheduledDeliveryDate);
  }
  if (Array.isArray(payload.physicalContractPhotos)) {
    plan.physicalContractPhotos = payload.physicalContractPhotos;
  }
  if (payload.notes !== undefined) {
    plan.notes = payload.notes;
  }
  await plan.save();

  return MaterialInboundPlan.findById(plan._id)
    .populate('contractId')
    .populate('supplierId')
    .populate('createdByAccountantId', 'fullName email employeeCode')
    .populate('expectedItems.rawMaterialId')
    .populate('batches.expectedItems.rawMaterialId')
    .populate('parentSupersededPlanId')
    .populate('rootPlanId');
};

/**
 * UC: Cập nhật & Tạo Phiên bản mới cho Kế hoạch Tiếp nhận Nguyên phụ liệu (Amend Version)
 * Tương tự cơ chế Versioning của Khung Hợp đồng SupplierContract
 */
export const amendInboundPlanVersion = async (planId, payload, currentUserId) => {
  const origPlan = await MaterialInboundPlan.findById(planId);
  if (!origPlan) {
    const err = new Error('Không tìm thấy kế hoạch tiếp nhận gốc cần điều chỉnh');
    err.statusCode = 404;
    throw err;
  }

  const contractId = payload.contractId || origPlan.contractId;
  const contract = await SupplierContract.findById(contractId);
  if (!contract) {
    const err = new Error('Không tìm thấy hợp đồng mua nguyên phụ liệu liên kết');
    err.statusCode = 404;
    throw err;
  }

  if (contract.status !== 'ACTIVE') {
    const err = new Error(
      `Chỉ được phép lập/cập nhật kế hoạch tiếp nhận cho hợp đồng đang có hiệu lực (ACTIVE). Hợp đồng ${contract.contractCode} hiện đang ở trạng thái "${contract.status}".`
    );
    err.statusCode = 400;
    throw err;
  }

  const accountantId = await resolveAccountantUserId(currentUserId);

  // Xác định root plan và số version tiếp theo
  const rootId = origPlan.rootPlanId || origPlan._id;
  const familyPlans = await MaterialInboundPlan.find({
    $or: [{ _id: rootId }, { rootPlanId: rootId }],
  });
  const maxVer = familyPlans.reduce(
    (max, p) => Math.max(max, Number(p.versionNumber) || 1),
    1
  );
  const nextVer = maxVer + 1;

  const rootPlan =
    familyPlans.find((p) => String(p._id) === String(rootId)) || origPlan;
  const baseCode = (rootPlan.planCode || origPlan.planCode || 'KH-NHAP-001').replace(
    /-V\d+$/i,
    ''
  );
  const nextCode = `${baseCode}-V${nextVer}`;

  // Chuẩn hóa danh sách các đợt giao hàng (batches)
  let normalizedBatches = [];
  if (Array.isArray(payload.batches) && payload.batches.length > 0) {
    normalizedBatches = payload.batches.map((b, bIdx) => {
      const batchNo = Number(b.batchNumber || bIdx + 1);
      return {
        batchNumber: batchNo,
        batchTitle:
          b.batchTitle ||
          `Đợt ${batchNo}/${payload.batches.length}: Tiếp nhận nguyên liệu (v${nextVer})`,
        batchPercentage: Number(
          b.batchPercentage || (100 / payload.batches.length).toFixed(1)
        ),
        scheduledDeliveryDate: new Date(b.scheduledDeliveryDate),
        status: 'SCHEDULED',
        notes: b.notes || '',
        expectedItems: (b.expectedItems || []).map((item) => {
          const contractMat = (contract.contractedMaterials || []).find(
            (cm) =>
              String(cm.rawMaterialId?._id || cm.rawMaterialId) ===
              String(item.rawMaterialId)
          );
          return {
            rawMaterialId: item.rawMaterialId,
            plannedQty: Number(item.plannedQty || 0),
            unitSnapshot:
              item.unit ||
              item.unitSnapshot ||
              contractMat?.unitSnapshot ||
              'METER',
            actualVerifiedPassedQty: 0,
            actualDefectiveOrShortQty: 0,
          };
        }),
      };
    });
  }

  // Tổng hợp expectedItems cho toàn bộ kế hoạch (tổng các đợt)
  const aggregatedItemsMap = new Map();
  if (normalizedBatches.length > 0) {
    normalizedBatches.forEach((batch) => {
      batch.expectedItems.forEach((it) => {
        const idStr = String(it.rawMaterialId);
        if (!aggregatedItemsMap.has(idStr)) {
          aggregatedItemsMap.set(idStr, {
            rawMaterialId: it.rawMaterialId,
            plannedQty: it.plannedQty,
            unitSnapshot: it.unitSnapshot,
            actualVerifiedPassedQty: 0,
            actualDefectiveOrShortQty: 0,
          });
        } else {
          const cur = aggregatedItemsMap.get(idStr);
          cur.plannedQty += it.plannedQty;
        }
      });
    });
  } else if (Array.isArray(payload.expectedItems)) {
    payload.expectedItems.forEach((it) => {
      const contractMat = (contract.contractedMaterials || []).find(
        (cm) =>
          String(cm.rawMaterialId?._id || cm.rawMaterialId) ===
          String(it.rawMaterialId)
      );
      aggregatedItemsMap.set(String(it.rawMaterialId), {
        rawMaterialId: it.rawMaterialId,
        plannedQty: Number(it.plannedQty || 0),
        unitSnapshot:
          it.unit || it.unitSnapshot || contractMat?.unitSnapshot || 'METER',
        actualVerifiedPassedQty: 0,
        actualDefectiveOrShortQty: 0,
      });
    });
  }

  const rootExpectedItems = Array.from(aggregatedItemsMap.values());
  const firstDeliveryDate =
    normalizedBatches.length > 0
      ? normalizedBatches[0].scheduledDeliveryDate
      : payload.scheduledDeliveryDate
      ? new Date(payload.scheduledDeliveryDate)
      : new Date();

  // Tạo bản ghi Kế hoạch phiên bản mới (v2, v3...)
  const newPlan = await MaterialInboundPlan.create({
    planCode: nextCode,
    contractId: contract._id,
    supplierId: contract.supplierId,
    totalBatches: normalizedBatches.length || 1,
    batches: normalizedBatches,
    scheduledDeliveryDate: firstDeliveryDate,
    status: 'SCHEDULED',
    createdByAccountantId: accountantId,
    physicalContractPhotos: Array.isArray(payload.physicalContractPhotos)
      ? payload.physicalContractPhotos
      : origPlan.physicalContractPhotos || [],
    notes: payload.notes !== undefined ? payload.notes : origPlan.notes,
    expectedItems: rootExpectedItems,
    batchNumber: 1,
    batchTitle:
      normalizedBatches.length > 1
        ? `Kế hoạch ${normalizedBatches.length} đợt giao (v${nextVer})`
        : `Tiếp nhận nguyên vật liệu (v${nextVer})`,
    batchPercentage: 100,
    versionNumber: nextVer,
    rootPlanId: rootId,
    parentSupersededPlanId: origPlan._id,
    amendmentReason:
      payload.amendmentReason ||
      'Cập nhật điều chỉnh lịch trình tiếp nhận & phân bổ số lượng các đợt giao',
  });

  // Chuyển toàn bộ các phiên bản cũ trong cùng chuỗi sang trạng thái RESOLVED_SUPERSEDED (Đã được thay thế)
  await MaterialInboundPlan.updateMany(
    {
      _id: { $ne: newPlan._id },
      $or: [{ _id: rootId }, { rootPlanId: rootId }],
      status: { $in: ['SCHEDULED'] },
    },
    {
      $set: { status: 'RESOLVED_SUPERSEDED' },
    }
  );

  return MaterialInboundPlan.findById(newPlan._id)
    .populate('contractId')
    .populate('supplierId')
    .populate('createdByAccountantId', 'fullName email employeeCode')
    .populate('expectedItems.rawMaterialId')
    .populate('batches.expectedItems.rawMaterialId')
    .populate('parentSupersededPlanId')
    .populate('rootPlanId');
};

/**
 * Lấy lịch sử các phiên bản của một Kế hoạch Tiếp nhận
 */
export const getInboundPlanVersions = async (planId) => {
  const plan = await MaterialInboundPlan.findById(planId);
  if (!plan) {
    const err = new Error('Không tìm thấy kế hoạch tiếp nhận nguyên liệu');
    err.statusCode = 404;
    throw err;
  }
  const rootId = plan.rootPlanId || plan._id;
  return MaterialInboundPlan.find({
    $or: [{ _id: rootId }, { rootPlanId: rootId }],
  })
    .sort({ versionNumber: -1, createdAt: -1 })
    .populate('contractId')
    .populate('supplierId')
    .populate('createdByAccountantId', 'fullName email employeeCode')
    .populate('expectedItems.rawMaterialId')
    .populate('batches.expectedItems.rawMaterialId')
    .populate('parentSupersededPlanId')
    .populate('rootPlanId');
};

/**
 * Kỹ thuật viên may (Garment Technician) đối soát và ghi nhận kết quả giao nhận
 * - isMatchedWithPlan: true (Đúng kế hoạch) -> status: 'VERIFIED_MATCHED', deliveryComplianceStatus: 'MATCHED'
 * - isMatchedWithPlan: false (Sai kế hoạch) -> status: 'DEVIATION_REPORTED', deliveryComplianceStatus: 'MISMATCHED', deviationResolution.status: 'UNRESOLVED'
 */
export const recordTechnicianVerification = async (planId, payload, currentUserId) => {
  const plan = await MaterialInboundPlan.findById(planId);
  if (!plan) {
    const err = new Error('Không tìm thấy kế hoạch tiếp nhận nguyên liệu');
    err.statusCode = 404;
    throw err;
  }

  const isMatched =
    payload.isMatchedWithPlan === true ||
    payload.complianceStatus === 'MATCHED' ||
    String(payload.isMatchedWithPlan) === 'true';

  const complianceStatus = isMatched ? 'MATCHED' : 'MISMATCHED';
  const newStatus = isMatched ? 'VERIFIED_MATCHED' : 'DEVIATION_REPORTED';
  const now = new Date();

  // Tìm role Garment Technician nếu có
  let techUserId = currentUserId;
  if (!techUserId) {
    const techUser = await User.findOne({ role: 'GARMENT_TECHNICIAN' }).select('_id').lean();
    techUserId = techUser?._id || (await resolveAccountantUserId(null));
  }

  // Cập nhật đợt giao cụ thể nếu có batchNumber
  const batchNum = Number(payload.batchNumber);
  if (batchNum && Array.isArray(plan.batches) && plan.batches.length > 0) {
    const batch = plan.batches.find((b) => b.batchNumber === batchNum);
    if (batch) {
      batch.deliveryComplianceStatus = complianceStatus;
      batch.status = newStatus;
      batch.technicianVerification = {
        verifiedByTechId: techUserId,
        verifiedAt: now,
        isMatchedWithPlan: isMatched,
        complianceStatus,
        deviationSummary: payload.deviationSummary || '',
        evidenceImages: Array.isArray(payload.evidenceImages) ? payload.evidenceImages : [],
      };
      if (!isMatched) {
        batch.deviationResolution = {
          status: 'UNRESOLVED',
          resolutionNotes: '',
        };
      }
    }
  }

  // Cập nhật mức toàn bộ Kế hoạch
  plan.deliveryComplianceStatus = complianceStatus;
  plan.status = newStatus;
  plan.technicianVerification = {
    verifiedByTechId: techUserId,
    verifiedAt: now,
    isMatchedWithPlan: isMatched,
    complianceStatus,
    deviationSummary: payload.deviationSummary || '',
    evidenceImages: Array.isArray(payload.evidenceImages) ? payload.evidenceImages : [],
  };

  if (!isMatched) {
    plan.deviationResolution = {
      ...(plan.deviationResolution || {}),
      status: 'UNRESOLVED',
    };
  } else {
    plan.deviationResolution = {
      ...(plan.deviationResolution || {}),
      status: 'NONE',
    };
  }

  await plan.save();

  return MaterialInboundPlan.findById(plan._id)
    .populate('contractId')
    .populate('supplierId')
    .populate('createdByAccountantId', 'fullName email employeeCode')
    .populate('expectedItems.rawMaterialId')
    .populate('batches.expectedItems.rawMaterialId')
    .populate('technicianVerification.verifiedByTechId', 'fullName email employeeCode')
    .populate('deviationResolution.resolvedByAccountantId', 'fullName email employeeCode');
};

export default {
  listInboundPlans,
  getInboundPlanById,
  getContractInboundSummary,
  scheduleInboundPlan,
  updateInboundPlanStatus,
  amendInboundPlanVersion,
  getInboundPlanVersions,
  recordTechnicianVerification,
};
