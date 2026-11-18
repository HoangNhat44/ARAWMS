import mongoose from 'mongoose';
import { Supplier, SupplierContract, RawMaterial, User, CashFlowVoucher, MaterialInboundPlan } from '../../../models/index.js';
import { objectId } from '../../../common/utils/ownerValidation.js';
import { safeUrl } from '../../../common/utils/ownerReadQuery.js';
import { httpError } from '../../../common/utils/httpError.js';

async function resolveAccountantUserId(explicitUserId) {
  if (explicitUserId) return explicitUserId;
  const accountant =
    (await User.findOne({ employeeCode: 'KETOAN' }).select('_id').lean()) ||
    (await User.findOne().select('_id').lean());
  return accountant?._id;
}

/**
 * UC 01: Manage Material Suppliers - List & Filter
 */
export const listSuppliers = async (filters = {}) => {
  const query = {};
  if (filters.isActive !== undefined && filters.isActive !== '') {
    query.isActive = filters.isActive === 'true' || filters.isActive === true;
  }
  if (filters.supplyCategory && filters.supplyCategory !== 'ALL') {
    query.supplyCategory = filters.supplyCategory;
  }
  if (filters.search && String(filters.search).trim()) {
    const regex = new RegExp(String(filters.search).trim(), 'i');
    query.$or = [
      { supplierCode: regex },
      { supplierName: regex },
      { taxCode: regex },
      { contactName: regex },
      { phone: regex },
    ];
  }

  // Quét đồng bộ dữ liệu thật: Đếm số HĐ Active và tính Công nợ trên Hợp đồng đang ACTIVE có hiệu lực
  const [suppliers, contracts, vouchers] = await Promise.all([
    Supplier.find(query).sort({ createdAt: -1 }),
    SupplierContract.find({ status: 'ACTIVE' }).select('supplierId totalContractAmount').lean(),
    CashFlowVoucher.find({ flowType: 'CASH_OUT', status: 'PAID', supplierId: { $ne: null } }).select('supplierId amount').lean(),
  ]);

  const contractsBySup = {};
  const activeContractsCountBySup = {};
  contracts.forEach((c) => {
    const sId = String(c.supplierId?._id || c.supplierId);
    contractsBySup[sId] = (contractsBySup[sId] || 0) + (Number(c.totalContractAmount) || 0);
    activeContractsCountBySup[sId] = (activeContractsCountBySup[sId] || 0) + 1;
  });

  const vouchersBySup = {};
  vouchers.forEach((v) => {
    const sId = String(v.supplierId?._id || v.supplierId);
    vouchersBySup[sId] = (vouchersBySup[sId] || 0) + (Number(v.amount) || 0);
  });

  // Đồng bộ và gắn đúng số dư nợ thật 100% khớp từ Hợp đồng thực tế và Phiếu chi
  return suppliers.map((sup) => {
    const sId = String(sup._id);
    const contracted = contractsBySup[sId] || 0;
    const paid = vouchersBySup[sId] || 0;
    const realDebt = Math.max(0, contracted - paid);
    const activeContractsCount = activeContractsCountBySup[sId] || 0;

    const supObj = sup.toObject ? sup.toObject() : { ...(sup._doc || sup) };
    supObj.totalPayableDebt = realDebt;
    supObj.totalContractedAmount = contracted;
    supObj.totalPaidAmount = paid;
    supObj.activeContractsCount = activeContractsCount;
    return supObj;
  });
};

/**
 * UC 02: Add Material Suppliers (<<Extend>>)
 */
export const createSupplier = async (payload) => {
  let code = payload.supplierCode ? String(payload.supplierCode).trim().toUpperCase() : '';
  if (!code) {
    const count = await Supplier.countDocuments();
    code = `SUP-${String(count + 1).padStart(3, '0')}`;
  }

  const existing = await Supplier.findOne({ supplierCode: code });
  if (existing) {
    const err = new Error(`Mã nhà cung ứng ${code} đã tồn tại trong hệ thống`);
    err.statusCode = 409;
    throw err;
  }

  const supplier = await Supplier.create({
    supplierCode: code,
    supplierName: String(payload.supplierName).trim(),
    taxCode: payload.taxCode ? String(payload.taxCode).trim() : '',
    representativeName: payload.representativeName ? String(payload.representativeName).trim() : '',
    representativeRole: payload.representativeRole || 'Giám đốc',
    contactName: payload.contactName ? String(payload.contactName).trim() : '',
    phone: String(payload.phone).trim(),
    email: payload.email ? String(payload.email).trim() : '',
    address: payload.address ? String(payload.address).trim() : '',
    supplyCategory: payload.supplyCategory || 'BOTH',
    paymentTermDays: Number(payload.paymentTermDays ?? 30),
    leadTimeDays: Number(payload.leadTimeDays ?? 7),
    bankInfo: {
      bankName: payload.bankInfo?.bankName || '',
      accountNo: payload.bankInfo?.accountNo || '',
      accountHolder: payload.bankInfo?.accountHolder || '',
      branchName: payload.bankInfo?.branchName || '',
    },
    notes: payload.notes || '',
    totalPayableDebt: Number(payload.totalPayableDebt || 0),
    isActive: payload.isActive !== undefined ? Boolean(payload.isActive) : true,
  });

  return supplier;
};

/**
 * UC 03: Update Material Suppliers (<<Extend>>)
 */
export const updateSupplier = async (supplierId, payload) => {
  const supplier = await Supplier.findById(supplierId);
  if (!supplier) {
    const err = new Error('Không tìm thấy nhà cung ứng nguyên vật liệu');
    err.statusCode = 404;
    throw err;
  }

  const updatableFields = [
    'supplierName',
    'taxCode',
    'representativeName',
    'representativeRole',
    'contactName',
    'phone',
    'email',
    'address',
    'supplyCategory',
    'paymentTermDays',
    'leadTimeDays',
    'notes',
    'isActive',
  ];

  updatableFields.forEach((field) => {
    if (payload[field] !== undefined) {
      supplier[field] = payload[field];
    }
  });

  if (payload.bankInfo) {
    supplier.bankInfo = {
      bankName: payload.bankInfo.bankName ?? supplier.bankInfo?.bankName ?? '',
      accountNo: payload.bankInfo.accountNo ?? supplier.bankInfo?.accountNo ?? '',
      accountHolder: payload.bankInfo.accountHolder ?? supplier.bankInfo?.accountHolder ?? '',
      branchName: payload.bankInfo.branchName ?? supplier.bankInfo?.branchName ?? '',
    };
  }

  await supplier.save();
  return supplier;
};

/**
 * Helper: List Raw Materials Catalog for Contract Drafting & Inbound Planning
 * Optional filter by supplierId
 */
export const listRawMaterialsCatalog = async (query = {}) => {
  const filter = { isActive: true };
  if (query.supplierId) {
    filter.supplierId = query.supplierId;
  }
  return RawMaterial.find(filter).populate('supplierId', 'supplierCode supplierName').sort({ materialCode: 1 });
};

/**
 * Helper: Tạo nhanh một nguyên phụ liệu mới từ form hợp đồng và gắn với NCC
 */
export const createRawMaterialQuick = async (payload) => {
  const code = String(payload.materialCode || '').trim().toUpperCase();
  const name = String(payload.materialName || '').trim();
  const unit = String(payload.unit || 'METER').trim().toUpperCase();

  if (!code) {
    const err = new Error('Mã nguyên phụ liệu không được để trống.');
    err.statusCode = 400;
    throw err;
  }
  if (!name) {
    const err = new Error('Tên nguyên phụ liệu không được để trống.');
    err.statusCode = 400;
    throw err;
  }

  const existing = await RawMaterial.findOne({ materialCode: code });
  if (existing) {
    const err = new Error(`Mã nguyên phụ liệu [${code}] đã tồn tại trong hệ thống.`);
    err.statusCode = 409;
    throw err;
  }

  const newMat = await RawMaterial.create({
    materialCode: code,
    materialName: name,
    materialType: payload.materialType || 'FABRIC',
    category: payload.category || (payload.materialType === 'AUXILIARY' ? 'ACCESSORY' : 'FABRIC_ROLL'),
    unit,
    color: payload.color || 'Theo bảng màu chuẩn',
    gsm: Number(payload.gsm) || 200,
    widthCm: Number(payload.widthCm) || 160,
    unitCost: Number(payload.unitCost) || 0,
    supplierId: payload.supplierId || null,
    isActive: true,
  });

  return newMat;
};

/**
 * Helper: Tự động chấm dứt các Hợp đồng đã quá ngày kết thúc hiệu lực (effectiveTo < now)
 */
export const checkAndAutoTerminateExpiredContracts = async () => {
  const now = new Date();
  const expiredContracts = await SupplierContract.find({
    status: { $in: ['ACTIVE', 'DEVIATION_FLAGGED'] },
    effectiveTo: { $lt: now },
  });

  if (expiredContracts.length > 0) {
    for (const contract of expiredContracts) {
      contract.status = 'TERMINATED';
      contract.terminatedAt = now;
      contract.isAutoTerminated = true;
      const expDateStr = contract.effectiveTo
        ? new Date(contract.effectiveTo).toLocaleDateString('vi-VN')
        : '—';
      contract.terminationReason = `Hệ thống tự động chấm dứt do quá ngày kết thúc hiệu lực hợp đồng (Hết hạn ngày ${expDateStr}).`;
      await contract.save();
    }
  }
};

/**
 * UC 04: Draft Supplier Contract Framework - List & Detail
 */
export const listContracts = async (filters = {}) => {
  await checkAndAutoTerminateExpiredContracts();
  const query = {};
  if (filters.supplierId) query.supplierId = filters.supplierId;
  if (filters.status && filters.status !== 'ALL') query.status = filters.status;
  if (filters.search && String(filters.search).trim()) {
    const regex = new RegExp(String(filters.search).trim(), 'i');
    query.$or = [{ contractCode: regex }, { contractTitle: regex }];
  }

  const contracts = await SupplierContract.find(query)
    .populate('supplierId')
    .populate('draftedByAccountantId', 'fullName email employeeCode')
    .populate('finalizedByOwnerId', 'fullName email employeeCode')
    .populate('terminatedByUserId', 'fullName email employeeCode')
    .populate('parentSupersededContractId', 'contractCode versionNumber status')
    .populate('rootContractId', 'contractCode versionNumber status')
    .populate('contractedMaterials.rawMaterialId')
    .sort({ createdAt: -1 });

  const contractIds = contracts.map((c) => c._id);
  const allPlans = await MaterialInboundPlan.find({ contractId: { $in: contractIds } })
    .populate('expectedItems.rawMaterialId')
    .populate('batches.expectedItems.rawMaterialId')
    .populate('createdByAccountantId', 'fullName email employeeCode')
    .populate('parentSupersededPlanId', 'planCode versionNumber status scheduledDeliveryDate amendmentReason')
    .populate('rootPlanId', 'planCode versionNumber')
    .sort({ versionNumber: -1, createdAt: -1 })
    .lean();

  const plansByContract = {};
  allPlans.forEach((plan) => {
    const cId = String(plan.contractId);
    if (!plansByContract[cId]) plansByContract[cId] = [];
    plansByContract[cId].push(plan);
  });

  return contracts.map((c) => {
    const cObj = c.toObject ? c.toObject() : { ...(c._doc || c) };
    const plansForC = plansByContract[String(c._id)] || [];
    cObj.inboundPlans = plansForC;
    cObj.inboundPlansCount = plansForC.length;
    cObj.latestInboundPlan = plansForC[0] || null;
    return cObj;
  });
};

export const getContractById = async (contractId) => {
  await checkAndAutoTerminateExpiredContracts();
  const contract = await SupplierContract.findById(contractId)
    .populate('supplierId')
    .populate('draftedByAccountantId', 'fullName email employeeCode')
    .populate('finalizedByOwnerId', 'fullName email employeeCode')
    .populate('terminatedByUserId', 'fullName email employeeCode')
    .populate('parentSupersededContractId', 'contractCode versionNumber status')
    .populate('rootContractId', 'contractCode versionNumber status')
    .populate('contractedMaterials.rawMaterialId');

  if (!contract) {
    const err = new Error('Không tìm thấy hợp đồng nhà cung cấp');
    err.statusCode = 404;
    throw err;
  }

  const plans = await MaterialInboundPlan.find({ contractId: contract._id })
    .populate('expectedItems.rawMaterialId')
    .populate('batches.expectedItems.rawMaterialId')
    .populate('createdByAccountantId', 'fullName email employeeCode')
    .populate('technicianVerification.verifiedByTechId', 'fullName email employeeCode')
    .populate('parentSupersededPlanId', 'planCode versionNumber status scheduledDeliveryDate amendmentReason')
    .populate('rootPlanId', 'planCode versionNumber')
    .sort({ versionNumber: -1, createdAt: -1 })
    .lean();

  const cObj = contract.toObject ? contract.toObject() : { ...(contract._doc || contract) };
  cObj.inboundPlans = plans;
  cObj.inboundPlansCount = plans.length;
  cObj.latestInboundPlan = plans[0] || null;
  return cObj;
};

/**
 * UC 04: Get All Historical Versions of a Contract Family
 */
export const getContractVersions = async (contractId) => {
  const contract = await SupplierContract.findById(contractId).lean();
  if (!contract) {
    const err = new Error('Không tìm thấy hợp đồng');
    err.statusCode = 404;
    throw err;
  }
  const rootId = contract.rootContractId || contract._id;
  const versions = await SupplierContract.find({
    $or: [{ _id: rootId }, { rootContractId: rootId }],
  })
    .populate('supplierId', 'supplierName supplierCode taxCode')
    .populate('draftedByAccountantId', 'fullName email employeeCode')
    .populate('finalizedByOwnerId', 'fullName email employeeCode')
    .populate('parentSupersededContractId', 'contractCode versionNumber status')
    .populate('contractedMaterials.rawMaterialId')
    .sort({ versionNumber: -1, createdAt: -1 });

  return versions;
};

function removeVietnameseTones(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

export function generateMaterialCodeFromName(name) {
  const clean = removeVietnameseTones(name)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .join('-');
  return clean ? `NVL-${clean}` : 'NVL-MAT';
}

export async function normalizeContractMaterialsAndTotals(payload) {
  const targetSupplierId =
    payload.supplierId?._id ||
    payload.supplierId?.id ||
    payload.supplierId ||
    null;

  // Tự động kiểm tra và tạo mới các nguyên phụ liệu nếu người dùng nhập mới trực tiếp trên hợp đồng
  const processedContractedMaterials = [];
  for (const item of (payload.contractedMaterials || [])) {
    let rawId = item.rawMaterialId;
    const isNew = item.isNewMaterial || rawId === '__NEW__' || rawId === '__CREATE_NEW__' || !rawId;
    // Nếu là nguyên phụ liệu mới (nhập tên mới hoặc có mã)
    if (isNew && (item.materialNameSnapshot || item.materialName || item.materialCodeSnapshot || item.materialCode)) {
      const matName = String(item.materialNameSnapshot || item.materialName || '').trim();
      let matCode = String(item.materialCodeSnapshot || item.materialCode || '').trim().toUpperCase();
      if (!matCode && matName) {
        matCode = generateMaterialCodeFromName(matName);
      }

      // Đảm bảo tính duy nhất của materialCode trong DB
      let existing = await RawMaterial.findOne({ materialCode: matCode });
      if (existing && isNew && !item.materialCodeSnapshot) {
        let suffix = 1;
        while (existing) {
          const candidateCode = `${matCode}-${String(suffix).padStart(2, '0')}`;
          existing = await RawMaterial.findOne({ materialCode: candidateCode });
          if (!existing) {
            matCode = candidateCode;
            break;
          }
          suffix += 1;
        }
      }

      const unitVal = String(item.unitSnapshot || item.unit || 'METER').trim().toUpperCase();
      const selectedCategory = item.category || (['METER', 'YARD', 'CÂY VẢI / CUỘN'].includes(unitVal) ? 'FABRIC_ROLL' : 'ACCESSORY');
      const resolvedMaterialType = item.materialType || (selectedCategory === 'FABRIC_ROLL' ? 'FABRIC' : 'AUXILIARY');

      if (!existing) {
        existing = await RawMaterial.create({
          materialCode: matCode,
          materialName: matName || matCode,
          materialType: resolvedMaterialType,
          category: selectedCategory,
          unit: unitVal,
          color: item.colorSpec || item.color || 'Theo bảng màu chuẩn',
          gsm: Number(item.gsm) || 200,
          widthCm: Number(item.widthCm) || 160,
          unitCost: Number(item.unitPrice) || 0,
          supplierId: targetSupplierId,
          isActive: true,
        });
      } else if (!existing.supplierId && targetSupplierId) {
        existing.supplierId = targetSupplierId;
        if (item.category) existing.category = item.category;
        await existing.save();
      }
      rawId = existing._id;
      processedContractedMaterials.push({
        ...item,
        rawMaterialId: rawId,
        materialCodeSnapshot: existing.materialCode,
        materialNameSnapshot: existing.materialName,
        unitSnapshot: item.unitSnapshot || existing.unit,
        isNewMaterial: false,
      });
    } else {
      processedContractedMaterials.push(item);
    }
  }

  const materialIds = processedContractedMaterials.map((item) => item.rawMaterialId).filter(Boolean);
  const materialsInDb = await RawMaterial.find({ _id: { $in: materialIds } }).lean();
  const materialMap = new Map(materialsInDb.map((m) => [String(m._id), m]));

  const defaultVatRate = Number(payload.commercialTerms?.vatRatePct ?? 8);
  let subtotalAmount = 0;
  let vatAmount = 0;

  const normalizedMaterials = processedContractedMaterials.map((item) => {
    const dbMat = materialMap.get(String(item.rawMaterialId));
    const rawRolls = Array.isArray(item.rollDetails) ? item.rollDetails : [];
    const rollDetails = rawRolls.map((r, rIdx) => ({
      rollIndex: Number(r.rollIndex || rIdx + 1),
      rollCode: r.rollCode || `C-${String(rIdx + 1).padStart(2, '0')}`,
      rollQty: Math.max(1, Math.floor(Number(r.rollQty ?? 1) || 1)),
      lengthMeters: Number(r.lengthMeters || 0),
      weightKg: Number(r.weightKg || 0),
      note: r.note || '',
    }));

    let qty = Number(item.contractedQty) || 0;
    if (rollDetails.length > 0) {
      const sumRollMeters = rollDetails.reduce(
        (sum, r) => sum + (Number(r.rollQty ?? 1) || 1) * (Number(r.lengthMeters) || 0),
        0
      );
      if (sumRollMeters > 0) {
        qty = sumRollMeters;
      }
    }
    const rollCount =
      rollDetails.length > 0
        ? rollDetails.reduce((sum, r) => sum + (Number(r.rollQty ?? 1) || 1), 0)
        : Number(item.rollCount || 0);

    const price = Number(item.unitPrice) || 0;
    const itemVatPct = Number(item.vatRatePct ?? defaultVatRate);
    const lineSubtotal = qty * price;
    const lineVat = Math.round((lineSubtotal * itemVatPct) / 100);

    subtotalAmount += lineSubtotal;
    vatAmount += lineVat;

    return {
      rawMaterialId: item.rawMaterialId?._id || item.rawMaterialId?.id || item.rawMaterialId,
      materialCodeSnapshot: item.materialCodeSnapshot || dbMat?.materialCode || '',
      materialNameSnapshot: item.materialNameSnapshot || dbMat?.materialName || '',
      unitSnapshot: item.unitSnapshot || dbMat?.unit || 'METER',
      composition: item.composition || (dbMat?.materialType === 'FABRIC' ? '100% Combed Cotton' : 'Tiêu chuẩn may xuất khẩu'),
      colorSpec: item.colorSpec || dbMat?.color || 'Theo bảng màu chuẩn (Swatch Card)',
      widthCm: Number(item.widthCm ?? dbMat?.widthCm ?? 160),
      gsm: Number(item.gsm ?? dbMat?.gsm ?? 200),
      shrinkageTolerancePct: Number(item.shrinkageTolerancePct ?? 2.5),
      colorFastnessGrade: item.colorFastnessGrade || 'Grade 4.0 (ISO 105-C06)',
      qtyTolerancePct: Number(item.qtyTolerancePct ?? 3),
      moq: Number(item.moq ?? 100),
      leadTimeDays: Number(item.leadTimeDays ?? 7),
      contractedQty: qty,
      rollCount: rollCount,
      rollDetails: rollDetails,
      unitPrice: price,
      vatRatePct: itemVatPct,
      packagingSpec:
        item.packagingSpec ||
        'Cuộn bọc nilon 2 lớp chống ẩm, lõi ống giấy cứng, dán tem Barcode từng cây vải',
      technicalNote: item.technicalNote || '',
    };
  });

  const totalContractAmount = subtotalAmount + vatAmount;
  const depositPercent = Number(payload.commercialTerms?.depositPercent ?? 30);
  const depositAmount = Math.round((totalContractAmount * depositPercent) / 100);

  const rawSchedule = Array.isArray(payload.commercialTerms?.paymentSchedule)
    ? payload.commercialTerms.paymentSchedule
    : [];
  const paymentSchedule = rawSchedule.map((inst, idx) => {
    let pct = Number(inst.paymentPercent || 0);
    let amt = Number(inst.paymentAmount || 0);
    if (amt > 0 && totalContractAmount > 0 && (pct <= 0 || !Number.isFinite(pct))) {
      pct = Number(((amt / totalContractAmount) * 100).toFixed(2));
    }
    if (pct > 0 && totalContractAmount > 0 && amt <= 0) {
      amt = Math.round((totalContractAmount * pct) / 100);
    }
    return {
      installmentNumber: idx + 1,
      dueDate: inst.dueDate ? new Date(inst.dueDate) : new Date(),
      paymentPercent: pct,
      paymentAmount: amt,
      note: inst.note || `Thanh toán lần ${idx + 1}`,
    };
  });
  const paymentInstallmentsCount =
    depositPercent >= 100
      ? 0
      : Number(
          payload.commercialTerms?.paymentInstallmentsCount ?? (paymentSchedule.length || 1)
        );

  return {
    normalizedMaterials,
    subtotalAmount,
    vatRatePct: defaultVatRate,
    vatAmount,
    totalContractAmount,
    depositPercent,
    depositAmount,
    paymentInstallmentsCount,
    paymentSchedule,
  };
}

/**
 * UC 04: Draft Supplier Contract Framework - Create
 */
export const draftContractFramework = async (payload, currentUserId) => {
  const supplier = await Supplier.findById(payload.supplierId);
  if (!supplier) {
    const err = new Error('Nhà cung ứng được chọn không tồn tại');
    err.statusCode = 404;
    throw err;
  }

  const accountantId = await resolveAccountantUserId(currentUserId || payload.draftedByAccountantId);
  const count = await SupplierContract.countDocuments();
  const contractCode = payload.contractCode
    ? String(payload.contractCode).trim().toUpperCase()
    : `HDK-${new Date().getFullYear()}-${String(count + 1).padStart(3, '0')}`;

  const existingCode = await SupplierContract.findOne({ contractCode });
  if (existingCode) {
    const err = new Error(`Mã hợp đồng ${contractCode} đã tồn tại`);
    err.statusCode = 409;
    throw err;
  }

  const {
    normalizedMaterials,
    subtotalAmount,
    vatRatePct,
    vatAmount,
    totalContractAmount,
    depositPercent,
    depositAmount,
    paymentInstallmentsCount,
    paymentSchedule,
  } = await normalizeContractMaterialsAndTotals(payload);

  const contract = await SupplierContract.create({
    contractCode,
    contractTitle:
      payload.contractTitle ||
      `Hợp đồng cung ứng nguyên phụ liệu may mặc – ${supplier.supplierName}`,
    contractType: payload.contractType || 'FRAMEWORK_AGREEMENT',
    signingDate: payload.signingDate ? new Date(payload.signingDate) : new Date(),
    effectiveFrom: payload.effectiveFrom ? new Date(payload.effectiveFrom) : new Date(),
    effectiveTo: payload.effectiveTo
      ? new Date(payload.effectiveTo)
      : new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
    supplierId: supplier._id,
    parentSupersededContractId: payload.parentSupersededContractId || null,
    rootContractId: null,
    versionNumber: 1,
    amendmentReason: payload.amendmentReason || '',
    status: payload.status || 'DRAFT_FRAMEWORK',
    draftedByAccountantId: accountantId,
    buyerInfo: {
      companyName:
        payload.buyerInfo?.companyName ||
        'CÔNG TY TNHH THỜI TRANG & KHO VẬN ARA (ARASTORE)',
      taxCode: payload.buyerInfo?.taxCode || '0109888999',
      representativeName: payload.buyerInfo?.representativeName || 'Trần Hoàng Chủ Tịch',
      representativeRole: payload.buyerInfo?.representativeRole || 'Chủ sở hữu / Giám đốc',
      receivingWarehouseAddress:
        payload.buyerInfo?.receivingWarehouseAddress ||
        'Kho Tổng Nguyên Phụ Liệu AraStore – KCN Tân Bình, TP.HCM',
    },
    commercialTerms: {
      currency: 'VND',
      subtotalAmount,
      vatRatePct,
      vatAmount,
      depositPercent,
      depositAmount,
      paymentMethod: payload.commercialTerms?.paymentMethod || 'BANK_TRANSFER',
      paymentCreditDays: Number(
        payload.commercialTerms?.paymentCreditDays ?? supplier.paymentTermDays ?? 30
      ),
      paymentInstallmentsCount,
      paymentSchedule,
      deliveryTerm: payload.commercialTerms?.deliveryTerm || 'GIAO_TAI_KHO_BEN_A',
      partialDeliveryAllowed:
        payload.commercialTerms?.partialDeliveryAllowed !== undefined
          ? Boolean(payload.commercialTerms.partialDeliveryAllowed)
          : true,
    },
    qualityStandards: {
      inspectionStandard:
        payload.qualityStandards?.inspectionStandard ||
        'Hệ thống 4 điểm (ASTM D5430 4-Point System) đối với vải cuộn; AQL 2.5 đối với phụ liệu may',
      maxDefectPointsPer100SqYards: Number(
        payload.qualityStandards?.maxDefectPointsPer100SqYards ?? 20
      ),
      maxRollJoints: Number(payload.qualityStandards?.maxRollJoints ?? 1),
      requirePreShipmentSample:
        payload.qualityStandards?.requirePreShipmentSample !== undefined
          ? Boolean(payload.qualityStandards.requirePreShipmentSample)
          : true,
      returnExchangeWarrantyDays: Number(
        payload.qualityStandards?.returnExchangeWarrantyDays ?? 15
      ),
    },
    frameworkDocumentUrl:
      payload.frameworkDocumentUrl || `https://storage.arawms.vn/contracts/${contractCode}.pdf`,
    signedContractDocumentUrl: payload.signedContractDocumentUrl || '',
    totalContractAmount,
    totalPaidAmount: Number(payload.totalPaidAmount || 0),
    latePenaltyPercentPerDay: Number(payload.latePenaltyPercentPerDay ?? 0.5),
    maxPenaltyPercent: Number(payload.maxPenaltyPercent ?? 8),
    breachPenaltyClause:
      payload.breachPenaltyClause ||
      'Giao chậm phạt 0.5%/ngày trên giá trị lô hàng chậm tiến độ (tối đa 8%). Nếu vải/phụ liệu không đạt kiểm định KCS (sai khổ vải, lệch định lượng GSM, độ co rút vượt ngưỡng hoặc lỗi ngoại quan > 20 điểm/100 sq.yds), Bên B phải đổi trả 100% trong vòng 5 ngày làm việc và chịu toàn bộ chi phí vận chuyển hai chiều.',
    disputeResolutionClause:
      payload.disputeResolutionClause ||
      'Mọi tranh chấp phát sinh được ưu tiên giải quyết qua thương lượng trên cơ sở Biên bản KCS thực tế tại kho Bên A; nếu không đạt thỏa thuận sẽ đưa ra Tòa án Kinh tế có thẩm quyền tại TP.HCM.',
    notes: payload.notes || '',
    contractedMaterials: normalizedMaterials,
  });

  if (contract.status === 'ACTIVE') {
    contract.finalizedAt = new Date();
    contract.finalizedByOwnerId = accountantId;
    await contract.save();
    await Supplier.findByIdAndUpdate(supplier._id, {
      $inc: { totalPayableDebt: Math.max(0, totalContractAmount - contract.totalPaidAmount) },
    });
  }

  // Tự động tạo Kế hoạch Lịch trình Tiếp nhận Nguyên vật liệu (MaterialInboundPlan) kèm theo Hợp đồng
  let inboundBatchesToSave = [];
  if (Array.isArray(payload.inboundBatches) && payload.inboundBatches.length > 0) {
    inboundBatchesToSave = payload.inboundBatches;
  } else if (Array.isArray(payload.inboundPlan?.batches) && payload.inboundPlan.batches.length > 0) {
    inboundBatchesToSave = payload.inboundPlan.batches;
  }

  // Mặc định khởi tạo 2 đợt giao hàng tự chia đều 50% - 50%
  if (inboundBatchesToSave.length === 0) {
    const startMs = contract.effectiveFrom ? new Date(contract.effectiveFrom).getTime() : Date.now();
    const endMs = contract.effectiveTo ? new Date(contract.effectiveTo).getTime() : startMs + 180 * 24 * 60 * 60 * 1000;
    const midMs = startMs + Math.round((endMs - startMs) / 3);
    const date1Iso = new Date(midMs);
    const date2Iso = new Date(endMs);

    inboundBatchesToSave = [
      {
        batchNumber: 1,
        totalBatches: 2,
        batchTitle: 'Đợt 1/2: Giao nguyên liệu đợt đầu (50%)',
        batchPercentage: 50,
        scheduledDeliveryDate: date1Iso,
        notes: 'Tiếp nhận đợt 1 theo kế hoạch hợp đồng',
        expectedItems: normalizedMaterials.map((mat) => ({
          rawMaterialId: mat.rawMaterialId,
          plannedQty: Math.ceil(mat.contractedQty / 2),
          unitSnapshot: mat.unitSnapshot || 'METER',
          actualVerifiedPassedQty: 0,
          actualDefectiveOrShortQty: 0,
        })),
      },
      {
        batchNumber: 2,
        totalBatches: 2,
        batchTitle: 'Đợt 2/2: Giao toàn bộ nguyên liệu còn lại (50%)',
        batchPercentage: 50,
        scheduledDeliveryDate: date2Iso,
        notes: 'Tiếp nhận đợt 2 hoàn tất hợp đồng',
        expectedItems: normalizedMaterials.map((mat) => ({
          rawMaterialId: mat.rawMaterialId,
          plannedQty: Math.max(0, mat.contractedQty - Math.ceil(mat.contractedQty / 2)),
          unitSnapshot: mat.unitSnapshot || 'METER',
          actualVerifiedPassedQty: 0,
          actualDefectiveOrShortQty: 0,
        })),
      },
    ];
  }

  const normalizedBatches = inboundBatchesToSave.map((b, bIdx) => {
    const batchNo = Number(b.batchNumber || bIdx + 1);
    return {
      batchNumber: batchNo,
      batchTitle: b.batchTitle || `Đợt ${batchNo}/${inboundBatchesToSave.length}: Tiếp nhận nguyên liệu`,
      batchPercentage: Number(b.batchPercentage || (100 / inboundBatchesToSave.length).toFixed(1)),
      scheduledDeliveryDate: b.scheduledDeliveryDate ? new Date(b.scheduledDeliveryDate) : new Date(contract.effectiveFrom),
      status: 'SCHEDULED',
      notes: b.notes || '',
      expectedItems: (b.expectedItems || []).map((item, itemIdx) => {
        const itemLineIdx = item.itemIndex !== undefined && item.itemIndex !== null
          ? Number(item.itemIndex)
          : itemIdx;
        const cMat =
          normalizedMaterials[itemLineIdx] ||
          normalizedMaterials[itemIdx] ||
          normalizedMaterials.find(
            (cm) => String(cm.rawMaterialId?._id || cm.rawMaterialId) === String(item.rawMaterialId)
          ) ||
          normalizedMaterials.find(
            (cm) => cm.materialCodeSnapshot && cm.materialCodeSnapshot === (item.materialCodeSnapshot || item.materialCode)
          );
        const rawRolls = (Array.isArray(item.rollDetails) && item.rollDetails.length > 0)
          ? item.rollDetails
          : (Array.isArray(item.selectedRolls) ? item.selectedRolls : []);
        const rolls = rawRolls.map((r, rIdx) => ({
          rollIndex: Number(r.rollIndex || rIdx + 1),
          rollCode: r.rollCode || `C-${String(rIdx + 1).padStart(2, '0')}`,
          rollQty: Math.max(1, Math.floor(Number(r.rollQty ?? 1) || 1)),
          lengthMeters: Number(r.lengthMeters || 0),
          weightKg: Number(r.weightKg || 0),
          note: r.note || '',
        }));
        const sumBatchRolls = rolls.reduce((sum, r) => sum + (Number(r.rollQty ?? 1) || 1), 0);
        return {
          itemIndex: itemLineIdx,
          rawMaterialId: cMat?.rawMaterialId || item.rawMaterialId,
          plannedQty: Number(item.plannedQty || 0),
          unitSnapshot: item.unitSnapshot || item.unit || cMat?.unitSnapshot || 'METER',
          rollCount: sumBatchRolls || Number(item.rollCount || 0),
          rollDetails: rolls,
          selectedRolls: rolls,
          actualVerifiedPassedQty: 0,
          actualDefectiveOrShortQty: 0,
        };
      }),
    };
  });

  // Xây dựng expectedItems cho root plan theo từng dòng của normalizedMaterials
  const planExpectedItems = normalizedMaterials.map((cMat, cIdx) => {
    let totalPlannedQty = 0;
    let allRolls = [];
    normalizedBatches.forEach((batch) => {
      const it =
        batch.expectedItems?.find((x) => x.itemIndex === cIdx) ||
        batch.expectedItems?.[cIdx];
      if (it) {
        totalPlannedQty += Number(it.plannedQty || 0);
        const rolls = it.rollDetails || it.selectedRolls || [];
        if (Array.isArray(rolls) && rolls.length > 0) {
          allRolls.push(...rolls);
        }
      }
    });
    return {
      itemIndex: cIdx,
      rawMaterialId: cMat.rawMaterialId,
      plannedQty: totalPlannedQty || cMat.contractedQty,
      unitSnapshot: cMat.unitSnapshot || 'METER',
      rollCount: allRolls.length || cMat.rollCount || 0,
      rollDetails: allRolls.length > 0 ? allRolls : (cMat.rollDetails || []),
      selectedRolls: allRolls.length > 0 ? allRolls : (cMat.rollDetails || []),
      actualVerifiedPassedQty: 0,
      actualDefectiveOrShortQty: 0,
    };
  });

  const totalPlansCount = await MaterialInboundPlan.countDocuments();
  const planCode = `KH-NHAP-${String(totalPlansCount + 1).padStart(3, '0')}`;

  await MaterialInboundPlan.create({
    planCode,
    contractId: contract._id,
    supplierId: supplier._id,
    versionNumber: 1,
    totalBatches: normalizedBatches.length,
    batches: normalizedBatches,
    scheduledDeliveryDate: normalizedBatches[0]?.scheduledDeliveryDate || contract.effectiveFrom,
    status: 'SCHEDULED',
    createdByAccountantId: accountantId,
    notes: payload.inboundPlanNotes || `Kế hoạch tiếp nhận nguyên liệu được thiết lập theo hợp đồng ${contract.contractCode}`,
    expectedItems: planExpectedItems,
    batchNumber: 1,
    batchTitle: normalizedBatches.length > 1 ? `Kế hoạch ${normalizedBatches.length} đợt giao` : 'Tiếp nhận nguyên vật liệu',
    batchPercentage: 100,
  });

  return getContractById(contract._id);
};

/**
 * UC 04: Amend Contract - Create Next Version from an Active/Existing Contract
 */
export const amendContractVersion = async (contractId, payload, currentUserId) => {
  const origContract = await SupplierContract.findById(contractId);
  if (!origContract) {
    const err = new Error('Không tìm thấy hợp đồng gốc cần điều chỉnh');
    err.statusCode = 404;
    throw err;
  }

  const rootId = origContract.rootContractId || origContract._id;
  const allVersions = await SupplierContract.find({
    $or: [{ _id: rootId }, { rootContractId: rootId }],
  });

  const maxVersion = Math.max(
    ...allVersions.map((v) => Number(v.versionNumber) || 1),
    Number(origContract.versionNumber) || 1,
    1
  );
  const nextVersion = maxVersion + 1;

  // Generate next version contract code, e.g. HD-2026-003-V2
  const baseCode = (origContract.contractCode || 'HDK-2026-001').replace(/-V\d+$/i, '');
  let nextCode = payload.contractCode
    ? String(payload.contractCode).trim().toUpperCase()
    : `${baseCode}-V${nextVersion}`;

  if (nextCode === origContract.contractCode) {
    nextCode = `${baseCode}-V${nextVersion}`;
  }

  const existingWithCode = await SupplierContract.findOne({ contractCode: nextCode });
  if (existingWithCode) {
    nextCode = `${baseCode}-V${nextVersion}-${Date.now().toString().slice(-4)}`;
  }

  const {
    normalizedMaterials,
    subtotalAmount,
    vatRatePct,
    vatAmount,
    totalContractAmount,
    depositPercent,
    depositAmount,
    paymentInstallmentsCount,
    paymentSchedule,
  } = await normalizeContractMaterialsAndTotals(
    payload.contractedMaterials && payload.contractedMaterials.length > 0 ? payload : origContract
  );

  const accountantId = await resolveAccountantUserId(currentUserId || payload.draftedByAccountantId);

  const newVersion = await SupplierContract.create({
    contractCode: nextCode,
    contractTitle:
      payload.contractTitle ||
      `${origContract.contractTitle} (Phụ lục phiên bản v${nextVersion})`,
    contractType: payload.contractType || origContract.contractType,
    signingDate: payload.signingDate ? new Date(payload.signingDate) : new Date(),
    effectiveFrom: payload.effectiveFrom ? new Date(payload.effectiveFrom) : new Date(),
    effectiveTo: payload.effectiveTo
      ? new Date(payload.effectiveTo)
      : origContract.effectiveTo || new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
    supplierId: origContract.supplierId,
    rootContractId: rootId,
    parentSupersededContractId: origContract._id,
    versionNumber: nextVersion,
    amendmentReason:
      payload.amendmentReason ||
      'Điều chỉnh phụ lục hợp đồng nguyên tắc / Cập nhật điều khoản',
    status: 'ACTIVE',
    finalizedAt: new Date(),
    finalizedByOwnerId: accountantId,
    draftedByAccountantId: accountantId,
    buyerInfo: {
      companyName:
        payload.buyerInfo?.companyName ||
        origContract.buyerInfo?.companyName ||
        'CÔNG TY TNHH THỜI TRANG & KHO VẬN ARA (ARASTORE)',
      taxCode:
        payload.buyerInfo?.taxCode || origContract.buyerInfo?.taxCode || '0109888999',
      representativeName:
        payload.buyerInfo?.representativeName ||
        origContract.buyerInfo?.representativeName ||
        'Trần Hoàng Chủ Tịch',
      representativeRole:
        payload.buyerInfo?.representativeRole ||
        origContract.buyerInfo?.representativeRole ||
        'Chủ sở hữu / Giám đốc',
      receivingWarehouseAddress:
        payload.buyerInfo?.receivingWarehouseAddress ||
        origContract.buyerInfo?.receivingWarehouseAddress ||
        'Kho Tổng Nguyên Phụ Liệu AraStore – KCN Tân Bình, TP.HCM',
    },
    commercialTerms: {
      currency: 'VND',
      subtotalAmount,
      vatRatePct,
      vatAmount,
      depositPercent,
      depositAmount,
      paymentMethod:
        payload.commercialTerms?.paymentMethod ||
        origContract.commercialTerms?.paymentMethod ||
        'BANK_TRANSFER',
      paymentCreditDays: Number(
        payload.commercialTerms?.paymentCreditDays ??
          origContract.commercialTerms?.paymentCreditDays ??
          30
      ),
      paymentInstallmentsCount,
      paymentSchedule,
      deliveryTerm:
        payload.commercialTerms?.deliveryTerm ||
        origContract.commercialTerms?.deliveryTerm ||
        'GIAO_TAI_KHO_BEN_A',
      partialDeliveryAllowed:
        payload.commercialTerms?.partialDeliveryAllowed !== undefined
          ? Boolean(payload.commercialTerms.partialDeliveryAllowed)
          : origContract.commercialTerms?.partialDeliveryAllowed !== false,
    },
    qualityStandards: {
      inspectionStandard:
        payload.qualityStandards?.inspectionStandard ||
        origContract.qualityStandards?.inspectionStandard ||
        'Hệ thống 4 điểm (ASTM D5430 4-Point System) đối với vải cuộn; AQL 2.5 đối với phụ liệu may',
      maxDefectPointsPer100SqYards: Number(
        payload.qualityStandards?.maxDefectPointsPer100SqYards ??
          origContract.qualityStandards?.maxDefectPointsPer100SqYards ??
          20
      ),
      maxRollJoints: Number(
        payload.qualityStandards?.maxRollJoints ??
          origContract.qualityStandards?.maxRollJoints ??
          1
      ),
      requirePreShipmentSample:
        payload.qualityStandards?.requirePreShipmentSample !== undefined
          ? Boolean(payload.qualityStandards.requirePreShipmentSample)
          : origContract.qualityStandards?.requirePreShipmentSample !== false,
      returnExchangeWarrantyDays: Number(
        payload.qualityStandards?.returnExchangeWarrantyDays ??
          origContract.qualityStandards?.returnExchangeWarrantyDays ??
          15
      ),
    },
    frameworkDocumentUrl:
      payload.frameworkDocumentUrl || origContract.frameworkDocumentUrl || '',
    signedContractDocumentUrl: '',
    totalContractAmount,
    totalPaidAmount: 0,
    latePenaltyPercentPerDay: Number(
      payload.latePenaltyPercentPerDay ?? origContract.latePenaltyPercentPerDay ?? 0.5
    ),
    maxPenaltyPercent: Number(
      payload.maxPenaltyPercent ?? origContract.maxPenaltyPercent ?? 8
    ),
    breachPenaltyClause:
      payload.breachPenaltyClause || origContract.breachPenaltyClause || '',
    disputeResolutionClause:
      payload.disputeResolutionClause || origContract.disputeResolutionClause || '',
    notes: payload.notes || origContract.notes || '',
    contractedMaterials: normalizedMaterials,
  });

  // Cập nhật hợp đồng gốc sang trạng thái SUPERSEDED (Đã thay thế)
  origContract.status = 'SUPERSEDED';
  if (!origContract.rootContractId) {
    origContract.rootContractId = rootId;
  }
  if (!origContract.versionNumber) origContract.versionNumber = 1;
  await origContract.save();

  try {
    await Supplier.findByIdAndUpdate(origContract.supplierId, {
      $inc: { totalPayableDebt: Math.max(0, totalContractAmount - newVersion.totalPaidAmount) },
    });
  } catch (syncErr) {
    console.error('Lỗi cập nhật công nợ khi tạo version mới:', syncErr);
  }

  // Kế thừa hoặc tạo mới kế hoạch tiếp nhận cho phiên bản hợp đồng mới
  const existingOrigPlan = await MaterialInboundPlan.findOne({
    contractId: origContract._id,
    status: { $ne: 'CANCELLED' },
  }).sort({ versionNumber: -1, createdAt: -1 });

  // Cập nhật tất cả kế hoạch tiếp nhận cũ của hợp đồng sang trạng thái RESOLVED_SUPERSEDED và đánh dấu ĐÃ XỬ LÝ (RESOLVED)
  await MaterialInboundPlan.updateMany(
    {
      $or: [
        { contractId: origContract._id },
        { contractId: rootId },
      ],
      _id: { $ne: newVersion._id },
    },
    {
      $set: {
        status: 'RESOLVED_SUPERSEDED',
        'deviationResolution.status': 'RESOLVED',
        'deviationResolution.actionTaken': 'AMEND_NEW_VERSION',
        'deviationResolution.resolutionNotes':
          payload.amendmentReason ||
          `Đã xử lý sai lệch bằng việc lập Phụ lục & tạo Phiên bản mới (${nextCode}).`,
        'deviationResolution.resolvedAt': new Date(),
        'deviationResolution.resolvedByAccountantId': accountantId,
      },
    }
  );

  let batchesForNewVersion = [];
  if (Array.isArray(payload.inboundBatches) && payload.inboundBatches.length > 0) {
    batchesForNewVersion = payload.inboundBatches;
  } else if (existingOrigPlan?.batches?.length > 0) {
    batchesForNewVersion = existingOrigPlan.batches;
  }

  if (batchesForNewVersion.length > 0) {
    const nextPlanVersion = nextVersion;
    const basePlanCode = (
      existingOrigPlan?.planCode ||
      origContract.contractCode?.replace(/^HDK?|^HD/i, 'KH-NHAP') ||
      `KH-NHAP-${baseCode.replace(/\D/g, '').slice(-3) || '001'}`
    ).replace(/-V\d+$/i, '');

    let newPlanCode = `${basePlanCode}-V${nextPlanVersion}`;
    const duplicatePlan = await MaterialInboundPlan.findOne({ planCode: newPlanCode });
    if (duplicatePlan) {
      newPlanCode = `${basePlanCode}-V${nextPlanVersion}-${Date.now().toString().slice(-4)}`;
    }

    const normBatches = batchesForNewVersion.map((b, idx) => ({
      batchNumber: Number(b.batchNumber || idx + 1),
      batchTitle: b.batchTitle || `Đợt ${idx + 1}/${batchesForNewVersion.length}: Tiếp nhận nguyên liệu`,
      batchPercentage: Number(b.batchPercentage || (100 / batchesForNewVersion.length).toFixed(1)),
      scheduledDeliveryDate: b.scheduledDeliveryDate ? new Date(b.scheduledDeliveryDate) : new Date(newVersion.effectiveFrom),
      status: 'SCHEDULED',
      notes: b.notes || '',
      expectedItems: (b.expectedItems || []).map((it, itIdx) => {
        const itemLineIdx = it.itemIndex !== undefined && it.itemIndex !== null
          ? Number(it.itemIndex)
          : itIdx;
        const cMat =
          normalizedMaterials[itemLineIdx] ||
          normalizedMaterials[itIdx] ||
          normalizedMaterials.find(
            (cm) => String(cm.rawMaterialId?._id || cm.rawMaterialId) === String(it.rawMaterialId)
          ) ||
          normalizedMaterials.find(
            (cm) => cm.materialCodeSnapshot && cm.materialCodeSnapshot === (it.materialCodeSnapshot || it.materialCode)
          );
        const rawRolls = (Array.isArray(it.rollDetails) && it.rollDetails.length > 0)
          ? it.rollDetails
          : (Array.isArray(it.selectedRolls) ? it.selectedRolls : []);
        const rolls = rawRolls.map((r, rIdx) => ({
          rollIndex: Number(r.rollIndex || rIdx + 1),
          rollCode: r.rollCode || `C-${String(rIdx + 1).padStart(2, '0')}`,
          rollQty: Math.max(1, Math.floor(Number(r.rollQty ?? 1) || 1)),
          lengthMeters: Number(r.lengthMeters || 0),
          weightKg: Number(r.weightKg || 0),
          note: r.note || '',
        }));
        const sumBatchRolls = rolls.reduce((sum, r) => sum + (Number(r.rollQty ?? 1) || 1), 0);
        const matId = cMat?.rawMaterialId || it.rawMaterialId;
        const plannedQty = Number(it.plannedQty || 0);
        const unitSnapshot = it.unitSnapshot || it.unit || cMat?.unitSnapshot || 'METER';

        return {
          itemIndex: itemLineIdx,
          rawMaterialId: matId,
          plannedQty: plannedQty,
          unitSnapshot: unitSnapshot,
          rollCount: sumBatchRolls || Number(it.rollCount || 0),
          rollDetails: rolls,
          selectedRolls: rolls,
          actualVerifiedPassedQty: 0,
          actualDefectiveOrShortQty: 0,
        };
      }),
    }));

    // Xây dựng expectedItems cho root plan theo từng dòng của normalizedMaterials
    const planExpectedItems = normalizedMaterials.map((cMat, cIdx) => {
      let totalPlannedQty = 0;
      let allRolls = [];
      normBatches.forEach((batch) => {
        const it =
          batch.expectedItems?.find((x) => x.itemIndex === cIdx) ||
          batch.expectedItems?.[cIdx];
        if (it) {
          totalPlannedQty += Number(it.plannedQty || 0);
          const rolls = it.rollDetails || it.selectedRolls || [];
          if (Array.isArray(rolls) && rolls.length > 0) {
            allRolls.push(...rolls);
          }
        }
      });
      return {
        itemIndex: cIdx,
        rawMaterialId: cMat.rawMaterialId,
        plannedQty: totalPlannedQty || cMat.contractedQty,
        unitSnapshot: cMat.unitSnapshot || 'METER',
        rollCount: allRolls.length || cMat.rollCount || 0,
        rollDetails: allRolls.length > 0 ? allRolls : (cMat.rollDetails || []),
        selectedRolls: allRolls.length > 0 ? allRolls : (cMat.rollDetails || []),
        actualVerifiedPassedQty: 0,
        actualDefectiveOrShortQty: 0,
      };
    });

    await MaterialInboundPlan.create({
      planCode: newPlanCode,
      contractId: newVersion._id,
      supplierId: newVersion.supplierId,
      versionNumber: nextPlanVersion,
      totalBatches: normBatches.length,
      batches: normBatches,
      scheduledDeliveryDate: normBatches[0]?.scheduledDeliveryDate || newVersion.effectiveFrom,
      status: 'SCHEDULED',
      createdByAccountantId: accountantId,
      parentSupersededPlanId: existingOrigPlan?._id || null,
      rootPlanId: existingOrigPlan?.rootPlanId || existingOrigPlan?._id || null,
      notes: `Kế hoạch tiếp nhận theo hợp đồng ${newVersion.contractCode} (phiên bản v${nextVersion})`,
      expectedItems: planExpectedItems,
      batchNumber: 1,
      batchTitle: normBatches.length > 1 ? `Kế hoạch ${normBatches.length} đợt giao` : 'Tiếp nhận nguyên vật liệu',
      batchPercentage: 100,
    });
  }

  return getContractById(newVersion._id);
};

/**
 * UC 04: Update Draft Contract Framework
 */
export const updateContractFramework = async (contractId, payload, currentUserId) => {
  const contract = await SupplierContract.findById(contractId);
  if (!contract) {
    const err = new Error('Không tìm thấy hợp đồng cần chỉnh sửa');
    err.statusCode = 404;
    throw err;
  }

  // Business Rule: Hợp đồng đã có trạng thái ACTIVE, DEVIATION_FLAGGED hoặc SUPERSEDED thì KHÔNG cho phép chỉnh sửa thông thường trực tiếp.
  // Mọi sửa đổi phải lưu thành phiên bản tiếp theo (Version mới).
  if (
    contract.status === 'ACTIVE' ||
    contract.status === 'DEVIATION_FLAGGED' ||
    contract.status === 'SUPERSEDED'
  ) {
    if (
      payload.createVersion === true ||
      payload.isNewVersion === true ||
      Number(payload.versionNumber) > (Number(contract.versionNumber) || 1)
    ) {
      return amendContractVersion(contractId, payload, currentUserId);
    }
    const err = new Error(
      `Hợp đồng đang ở trạng thái "${contract.status}" không thể ghi đè trực tiếp. Vui lòng chọn "Lưu thành Phiên bản mới" để tạo version tiếp theo và bảo lưu bản hợp đồng hiện tại.`
    );
    err.statusCode = 400;
    throw err;
  }

  if (payload.contractedMaterials && Array.isArray(payload.contractedMaterials)) {
    const {
      normalizedMaterials,
      subtotalAmount,
      vatRatePct,
      vatAmount,
      totalContractAmount,
      depositPercent,
      depositAmount,
      paymentInstallmentsCount,
      paymentSchedule,
    } = await normalizeContractMaterialsAndTotals(payload);

    contract.contractedMaterials = normalizedMaterials;
    contract.totalContractAmount = totalContractAmount;
    contract.commercialTerms = {
      ...(contract.commercialTerms?.toObject?.() || contract.commercialTerms || {}),
      ...(payload.commercialTerms || {}),
      subtotalAmount,
      vatRatePct,
      vatAmount,
      depositPercent,
      depositAmount,
      paymentInstallmentsCount,
      paymentSchedule,
    };
  } else if (payload.commercialTerms) {
    contract.commercialTerms = {
      ...(contract.commercialTerms?.toObject?.() || contract.commercialTerms || {}),
      ...payload.commercialTerms,
    };
  }

  const directFields = [
    'contractTitle',
    'contractType',
    'signingDate',
    'effectiveFrom',
    'effectiveTo',
    'frameworkDocumentUrl',
    'signedContractDocumentUrl',
    'latePenaltyPercentPerDay',
    'maxPenaltyPercent',
    'breachPenaltyClause',
    'disputeResolutionClause',
    'notes',
    'amendmentReason',
  ];

  directFields.forEach((field) => {
    if (payload[field] !== undefined) {
      contract[field] = payload[field];
    }
  });

  if (payload.buyerInfo) {
    contract.buyerInfo = {
      ...(contract.buyerInfo?.toObject?.() || contract.buyerInfo || {}),
      ...payload.buyerInfo,
    };
  }

  if (payload.qualityStandards) {
    contract.qualityStandards = {
      ...(contract.qualityStandards?.toObject?.() || contract.qualityStandards || {}),
      ...payload.qualityStandards,
    };
  }

  await contract.save();
  return getContractById(contract._id);
};

/**
 * UC 04: Submit for Owner Approval / Finalize Contract Status
 */
export const updateContractStatus = async (contractId, payload, currentUserId) => {
  const contract = await SupplierContract.findById(contractId);
  if (!contract) {
    const err = new Error('Không tìm thấy hợp đồng');
    err.statusCode = 404;
    throw err;
  }

  const prevStatus = contract.status;
  const nextStatus = payload.status;
  contract.status = nextStatus;

  if (payload.signedContractDocumentUrl !== undefined) {
    contract.signedContractDocumentUrl = payload.signedContractDocumentUrl;
  }

  if (nextStatus === 'ACTIVE' && prevStatus !== 'ACTIVE') {
    const actorId = await resolveAccountantUserId(currentUserId);
    contract.finalizedAt = new Date();
    contract.finalizedByOwnerId = actorId;

    // If this is an amendment replacing a previous version, supersede all older active versions in family!
    if (contract.parentSupersededContractId) {
      const rootId = contract.rootContractId || contract.parentSupersededContractId;
      await SupplierContract.updateMany(
        {
          _id: { $ne: contract._id },
          $or: [{ _id: rootId }, { rootContractId: rootId }],
          status: 'ACTIVE',
        },
        { $set: { status: 'SUPERSEDED' } }
      );
    }

    const unpaid = Math.max(0, (contract.totalContractAmount || 0) - (contract.totalPaidAmount || 0));
    if (unpaid > 0) {
      await Supplier.findByIdAndUpdate(contract.supplierId, {
        $inc: { totalPayableDebt: unpaid },
      });
    }
  }

  await contract.save();
  return getContractById(contract._id);
};

/**
 * Chấm dứt Hợp đồng Mua sắm (Accountant Contract Termination with Notes)
 */
export const terminateContract = async (contractId, payload, currentUserId) => {
  await checkAndAutoTerminateExpiredContracts();
  const contract = await SupplierContract.findById(contractId);
  if (!contract) {
    const err = new Error('Không tìm thấy hợp đồng');
    err.statusCode = 404;
    throw err;
  }

  if (contract.status === 'TERMINATED') {
    const err = new Error(`Hợp đồng [${contract.contractCode}] đã ở trạng thái đã chấm dứt trước đó.`);
    err.statusCode = 400;
    throw err;
  }

  if (contract.status === 'SUPERSEDED') {
    const err = new Error(`Hợp đồng [${contract.contractCode}] đã bị thay thế bởi phiên bản mới hơn (v${contract.versionNumber + 1}), không thể thao tác chấm dứt trực tiếp.`);
    err.statusCode = 400;
    throw err;
  }

  const reason = payload.terminationReason ? String(payload.terminationReason).trim() : '';
  if (!reason || reason.length < 5) {
    const err = new Error('Vui lòng nhập lý do/ghi chú chấm dứt hợp đồng (tối thiểu 5 ký tự).');
    err.statusCode = 400;
    throw err;
  }

  const actorId = await resolveAccountantUserId(currentUserId);
  contract.status = 'TERMINATED';
  contract.terminatedAt = new Date();
  contract.terminatedByUserId = actorId;
  contract.terminationReason = reason;
  contract.isAutoTerminated = false;

  await contract.save();

  // Nghiệp vụ Option 2: Công nợ chỉ tính trên các hợp đồng ACTIVE -> Cập nhật giảm nợ ngay khi chấm dứt HĐ
  try {
    const [supActiveContracts, supPaidVouchers] = await Promise.all([
      SupplierContract.find({ supplierId: contract.supplierId, status: 'ACTIVE' }).select('totalContractAmount').lean(),
      CashFlowVoucher.find({ supplierId: contract.supplierId, flowType: 'CASH_OUT', status: 'PAID' }).select('amount').lean(),
    ]);
    const newDebt = Math.max(
      0,
      supActiveContracts.reduce((sum, c) => sum + (Number(c.totalContractAmount) || 0), 0) -
      supPaidVouchers.reduce((sum, v) => sum + (Number(v.amount) || 0), 0)
    );
    await Supplier.findByIdAndUpdate(contract.supplierId, { totalPayableDebt: newDebt });
  } catch (syncErr) {
    console.error('Lỗi cập nhật công nợ khi chấm dứt hợp đồng:', syncErr);
  }

  return getContractById(contract._id);
};

const active = { isDeleted: { $ne: true } };
const read = (name, filter, projection) => mongoose.connection.collection(name).find({ ...active, ...filter }, { projection }).toArray();

export async function contractDetail(id) {
  objectId(id);
  const [contract] = await read('supplier_contracts', { _id: new mongoose.Types.ObjectId(id) });
  if (!contract) throw httpError(404, 'Không tìm thấy hợp đồng.');
  // Native collection reads preserve the historical contract fields absent from the older Mongoose schema.
  const [suppliers, plans, payments] = await Promise.all([
    read('suppliers', { _id: contract.supplierId }, { supplierCode: 1, supplierName: 1, taxCode: 1, contactName: 1, representativeName: 1, phone: 1, email: 1, address: 1 }),
    read('material_inbound_plans', { contractId: contract._id }),
    read('cash_flow_vouchers', { contractId: contract._id, flowType: 'CASH_OUT' }),
  ]);
  const materialIds = [...(contract.contractedMaterials || []), ...plans.flatMap(p => [...(p.expectedItems || []), ...(p.batches || []).flatMap(b => b.expectedItems || [])])].map(i => i.rawMaterialId).filter(Boolean);
  const [materials, users] = await Promise.all([
    read('raw_materials', { _id: { $in: materialIds } }, { materialCode: 1, materialName: 1, unit: 1 }),
    read('users', { _id: { $in: [contract.draftedByAccountantId, contract.finalizedByOwnerId, contract.terminatedByUserId].filter(Boolean) } }, { fullName: 1 }),
  ]);
  const materialMap = new Map(materials.map(m => [String(m._id), m]));
  const name = (id) => users.find(u => String(u._id) === String(id))?.fullName || null;
  const item = (line) => { const material = materialMap.get(String(line.rawMaterialId)); return { materialId: String(line.rawMaterialId || ''), code: line.materialCodeSnapshot || material?.materialCode || null, name: line.materialNameSnapshot || material?.materialName || null, unit: line.unitSnapshot || material?.unit || null }; };
  const planItems = (lines) => (lines || []).map(line => ({
    ...item(line),
    plannedQty: line.plannedQty,
    rollCount: line.rollCount || (line.rollDetails?.length || line.selectedRolls?.length || 0),
    rollDetails: line.rollDetails || line.selectedRolls || [],
    selectedRolls: line.selectedRolls || line.rollDetails || [],
    verifiedQty: line.actualVerifiedPassedQty,
    defectiveOrShortQty: line.actualDefectiveOrShortQty,
  }));
  const supplier = suppliers[0];
  return {
    id: String(contract._id), code: contract.contractCode, title: contract.contractTitle, type: contract.contractType, status: contract.status,
    signingDate: contract.signingDate, effectiveFrom: contract.effectiveFrom, effectiveTo: contract.effectiveTo, createdAt: contract.createdAt,
    draftedBy: name(contract.draftedByAccountantId), finalizedBy: name(contract.finalizedByOwnerId), finalizedAt: contract.finalizedAt,
    total: contract.totalContractAmount, paid: contract.totalPaidAmount ?? 0, debt: Math.max(0, (contract.totalContractAmount ?? 0) - (contract.totalPaidAmount ?? 0)),
    buyerInfo: contract.buyerInfo || {}, commercialTerms: contract.commercialTerms || {}, qualityStandards: contract.qualityStandards || {},
    breachPenaltyClause: contract.breachPenaltyClause, disputeResolutionClause: contract.disputeResolutionClause, notes: contract.notes,
    terminationReason: contract.terminationReason, terminatedAt: contract.terminatedAt, terminatedBy: name(contract.terminatedByUserId),
    versionNumber: contract.versionNumber, amendmentReason: contract.amendmentReason,
    frameworkDocumentUrl: safeUrl(contract.frameworkDocumentUrl), signedContractDocumentUrl: safeUrl(contract.signedContractDocumentUrl),
    supplier: supplier ? { code: supplier.supplierCode, name: supplier.supplierName, taxCode: supplier.taxCode, contact: supplier.contactName || supplier.representativeName, phone: supplier.phone, email: supplier.email, address: supplier.address } : null,
    items: (contract.contractedMaterials || []).map(line => ({ ...item(line), quantity: line.contractedQty, rollCount: line.rollCount || (line.rollDetails?.length || 0), rollDetails: line.rollDetails || [], unitPrice: line.unitPrice, vatRatePct: line.vatRatePct, composition: line.composition, colorSpec: line.colorSpec, widthCm: line.widthCm, gsm: line.gsm, shrinkageTolerancePct: line.shrinkageTolerancePct, colorFastnessGrade: line.colorFastnessGrade, qtyTolerancePct: line.qtyTolerancePct, moq: line.moq, leadTimeDays: line.leadTimeDays, packagingSpec: line.packagingSpec, technicalNote: line.technicalNote })),
    plans: plans.sort((a,b) => new Date(a.scheduledDeliveryDate) - new Date(b.scheduledDeliveryDate)).map(p => ({
      id: String(p._id),
      code: p.planCode,
      status: p.status,
      scheduledDeliveryDate: p.scheduledDeliveryDate,
      notes: p.notes,
      technicianVerification: p.technicianVerification || null,
      deviationResolution: p.deviationResolution || null,
      reportedToOwner: p.reportedToOwner || null,
      deliveryComplianceStatus: p.deliveryComplianceStatus || null,
      items: planItems(p.expectedItems),
      batches: (p.batches || []).map(b => ({
        number: b.batchNumber,
        title: b.batchTitle,
        percentage: b.batchPercentage,
        scheduledDeliveryDate: b.scheduledDeliveryDate,
        status: b.status,
        notes: b.notes,
        technicianVerification: b.technicianVerification || null,
        items: planItems(b.expectedItems)
      }))
    })),
    payments: payments.sort((a,b) => new Date(b.voucherDate) - new Date(a.voucherDate)).map(v => ({ id: String(v._id), code: v.voucherCode, date: v.voucherDate, category: v.category, amount: v.amount, method: v.paymentMethod, status: v.status, paidAt: v.paidAt, note: v.note, attachmentUrl: safeUrl(v.attachmentUrl) })),
    basis: 'Giá trị và số đã trả lấy từ hợp đồng; lịch sử phiếu chi hiển thị riêng, không tự cộng phiếu nháp hoặc phiếu hủy vào số đã thanh toán. Đơn vị và tên nguyên liệu ưu tiên thông tin chốt trên hợp đồng.',
  };
}

export default {
  listSuppliers,
  createSupplier,
  updateSupplier,
  listRawMaterialsCatalog,
  createRawMaterialQuick,
  listContracts,
  getContractById,
  getContractVersions,
  draftContractFramework,
  amendContractVersion,
  updateContractFramework,
  updateContractStatus,
  terminateContract,
  checkAndAutoTerminateExpiredContracts,
  contractDetail,
};
