import { Supplier, SupplierContract, RawMaterial, User } from '../../../models/index.js';

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
  return Supplier.find(query).sort({ createdAt: -1 });
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
 */
export const listRawMaterialsCatalog = async () => {
  return RawMaterial.find({ isActive: true }).sort({ materialCode: 1 });
};

/**
 * UC 04: Draft Supplier Contract Framework - List & Detail
 */
export const listContracts = async (filters = {}) => {
  const query = {};
  if (filters.supplierId) query.supplierId = filters.supplierId;
  if (filters.status && filters.status !== 'ALL') query.status = filters.status;
  if (filters.search && String(filters.search).trim()) {
    const regex = new RegExp(String(filters.search).trim(), 'i');
    query.$or = [{ contractCode: regex }, { contractTitle: regex }];
  }

  return SupplierContract.find(query)
    .populate('supplierId')
    .populate('draftedByAccountantId', 'fullName email employeeCode')
    .populate('finalizedByOwnerId', 'fullName email employeeCode')
    .populate('parentSupersededContractId', 'contractCode status')
    .populate('contractedMaterials.rawMaterialId')
    .sort({ createdAt: -1 });
};

export const getContractById = async (contractId) => {
  const contract = await SupplierContract.findById(contractId)
    .populate('supplierId')
    .populate('draftedByAccountantId', 'fullName email employeeCode')
    .populate('finalizedByOwnerId', 'fullName email employeeCode')
    .populate('parentSupersededContractId', 'contractCode status')
    .populate('contractedMaterials.rawMaterialId');

  if (!contract) {
    const err = new Error('Không tìm thấy hợp đồng nhà cung cấp');
    err.statusCode = 404;
    throw err;
  }
  return contract;
};

async function normalizeContractMaterialsAndTotals(payload) {
  const materialIds = (payload.contractedMaterials || []).map((item) => item.rawMaterialId);
  const materialsInDb = await RawMaterial.find({ _id: { $in: materialIds } }).lean();
  const materialMap = new Map(materialsInDb.map((m) => [String(m._id), m]));

  const defaultVatRate = Number(payload.commercialTerms?.vatRatePct ?? 8);
  let subtotalAmount = 0;
  let vatAmount = 0;

  const normalizedMaterials = (payload.contractedMaterials || []).map((item) => {
    const dbMat = materialMap.get(String(item.rawMaterialId));
    const qty = Number(item.contractedQty) || 0;
    const price = Number(item.unitPrice) || 0;
    const itemVatPct = Number(item.vatRatePct ?? defaultVatRate);
    const lineSubtotal = qty * price;
    const lineVat = Math.round((lineSubtotal * itemVatPct) / 100);

    subtotalAmount += lineSubtotal;
    vatAmount += lineVat;

    return {
      rawMaterialId: item.rawMaterialId,
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

  return {
    normalizedMaterials,
    subtotalAmount,
    vatRatePct: defaultVatRate,
    vatAmount,
    totalContractAmount,
    depositPercent,
    depositAmount,
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

  return getContractById(contract._id);
};

/**
 * UC 04: Update Draft Contract Framework
 */
export const updateContractFramework = async (contractId, payload) => {
  const contract = await SupplierContract.findById(contractId);
  if (!contract) {
    const err = new Error('Không tìm thấy hợp đồng cần chỉnh sửa');
    err.statusCode = 404;
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

export default {
  listSuppliers,
  createSupplier,
  updateSupplier,
  listRawMaterialsCatalog,
  listContracts,
  getContractById,
  draftContractFramework,
  updateContractFramework,
  updateContractStatus,
};

