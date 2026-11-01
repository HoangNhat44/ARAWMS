import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  FileSignature,
  Plus,
  Trash2,
  Eye,
  CheckCircle2,
  Send,
  CalendarClock,
  RefreshCw,
  ShieldCheck,
  Building2,
  Layers,
  Scale,
  X,
  AlertCircle,
} from 'lucide-react';
import accountantProcurementApi from '../../services/accountantProcurementApi.js';
import { validateContractForm } from '../../utils/procurementValidation.js';

const CONTRACT_STATUS_BADGE = {
  DRAFT_FRAMEWORK: {
    label: 'Bản thảo khung (Draft Framework)',
    cls: 'wms-status-pending',
  },
  PENDING_OWNER_APPROVAL: {
    label: 'Chờ Owner duyệt ký (Pending Approval)',
    cls: 'wms-status-processing',
  },
  ACTIVE: {
    label: 'Đang hiệu lực (Active)',
    cls: 'wms-status-available',
  },
  DEVIATION_FLAGGED: {
    label: 'Cảnh báo sai lệch (Deviation Flagged)',
    cls: 'wms-status-damaged',
  },
  SUPERSEDED: {
    label: 'Đã thay thế (Superseded)',
    cls: 'wms-status-out-of-stock',
  },
  COMPLETED: {
    label: 'Đã hoàn tất (Completed)',
    cls: 'wms-status-completed',
  },
  CANCELLED: {
    label: 'Đã hủy (Cancelled)',
    cls: 'wms-status-rejected',
  },
};

const CONTRACT_TYPE_LABELS = {
  FRAMEWORK_AGREEMENT: 'Hợp đồng nguyên tắc / Khung giao nhiều đợt',
  BATCH_LUMP_SUM: 'Hợp đồng trọn gói theo lô sản xuất',
  FIXED_UNIT_PRICE: 'Hợp đồng theo đơn giá cố định',
};

const DELIVERY_TERM_LABELS = {
  GIAO_TAI_KHO_BEN_A: 'Giao tại Kho Nguyên Phụ Liệu Bên A (AraStore)',
  GIAO_TAI_XUONG_MAY: 'Giao trực tiếp tại Xưởng May Gia Công chỉ định',
  NHAN_TAI_KHO_NCC: 'Nhận hàng tại Kho / Nhà máy Nhà cung ứng (EXW)',
};

const PAYMENT_METHOD_LABELS = {
  BANK_TRANSFER: 'Chuyển khoản Ngân hàng (Ủy nhiệm chi)',
  LETTER_OF_CREDIT: 'Thư tín dụng (L/C thương mại)',
  CASH: 'Tiền mặt tại quỹ',
};

const formatVnd = (val) => `${Number(val || 0).toLocaleString('vi-VN')} ₫`;
const formatDate = (val) =>
  val ? new Date(val).toLocaleDateString('vi-VN') : '—';

const createEmptyMaterialLine = (rawMat = null) => ({
  rawMaterialId: rawMat?._id || '',
  materialCodeSnapshot: rawMat?.materialCode || '',
  materialNameSnapshot: rawMat?.materialName || '',
  unitSnapshot: rawMat?.unit || 'METER',
  composition:
    rawMat?.materialType === 'AUXILIARY'
      ? 'Hợp kim không gỉ / Polyester cao cấp'
      : '100% Combed Cotton Compact',
  colorSpec: rawMat?.color || 'Trắng Sữa (Pantone 11-0602 TCX)',
  widthCm: rawMat?.widthCm || 160,
  gsm: rawMat?.gsm || 210,
  shrinkageTolerancePct: 2.5,
  colorFastnessGrade: 'Grade 4.0 (ISO 105-C06)',
  qtyTolerancePct: 3,
  moq: 100,
  leadTimeDays: 7,
  contractedQty: 500,
  unitPrice: rawMat?.unitCost || 85000,
  vatRatePct: 8,
  packagingSpec:
    'Cuộn bọc nilon 2 lớp chống ẩm, lõi ống giấy cứng, dán tem Barcode đầu cây vải',
  technicalNote: 'Không nối đầu cây quá 1 lần, không loang màu biên vải',
});

const ContractFrameworkPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedSupplierId = searchParams.get('supplierId') || '';

  const [activeTab, setActiveTab] = useState(
    preselectedSupplierId ? 'DRAFT_FORM' : 'CONTRACT_LIST'
  );
  const [contracts, setContracts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [materialsCatalog, setMaterialsCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Preview Legal Contract Modal
  const [previewContract, setPreviewContract] = useState(null);
  const [contractErrors, setContractErrors] = useState({});

  // Draft Contract Form State (Full Real-World Garment Procurement Contract)
  const todayIso = new Date().toISOString().slice(0, 10);
  const sixMonthsLaterIso = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const [editingContractId, setEditingContractId] = useState(null);
  const [contractForm, setContractForm] = useState({
    contractCode: '',
    contractTitle:
      'Hợp đồng Khung Cung ứng Vải & Nguyên Phụ Liệu May Mặc Năm 2026',
    contractType: 'FRAMEWORK_AGREEMENT',
    signingDate: todayIso,
    effectiveFrom: todayIso,
    effectiveTo: sixMonthsLaterIso,
    supplierId: preselectedSupplierId,
    status: 'DRAFT_FRAMEWORK',
    frameworkDocumentUrl: 'https://storage.arawms.vn/contracts/HDK-2026-draft.pdf',
    buyerInfo: {
      companyName: 'CÔNG TY TNHH THỜI TRANG & KHO VẬN ARA (ARASTORE)',
      taxCode: '0109888999',
      representativeName: 'Trần Hoàng Chủ Tịch',
      representativeRole: 'Chủ sở hữu / Giám đốc',
      receivingWarehouseAddress:
        'Kho Tổng Nguyên Phụ Liệu AraStore – KCN Tân Bình, TP.HCM',
    },
    commercialTerms: {
      vatRatePct: 8,
      depositPercent: 30,
      paymentMethod: 'BANK_TRANSFER',
      paymentCreditDays: 30,
      deliveryTerm: 'GIAO_TAI_KHO_BEN_A',
      partialDeliveryAllowed: true,
    },
    qualityStandards: {
      inspectionStandard:
        'Hệ thống 4 điểm (ASTM D5430 4-Point System) đối với vải cuộn; AQL 2.5 đối với phụ liệu may',
      maxDefectPointsPer100SqYards: 20,
      maxRollJoints: 1,
      requirePreShipmentSample: true,
      returnExchangeWarrantyDays: 15,
    },
    latePenaltyPercentPerDay: 0.5,
    maxPenaltyPercent: 8,
    breachPenaltyClause:
      'Giao chậm phạt 0.5%/ngày trên giá trị lô hàng chậm tiến độ (tối đa 8%). Nếu vải/phụ liệu không đạt kiểm định KCS (sai khổ vải, lệch định lượng GSM, độ co rút vượt ngưỡng hoặc lỗi ngoại quan > 20 điểm/100 sq.yds), Bên B phải đổi trả 100% trong vòng 5 ngày làm việc và chịu toàn bộ chi phí vận chuyển hai chiều.',
    disputeResolutionClause:
      'Mọi tranh chấp phát sinh được ưu tiên giải quyết qua thương lượng trên cơ sở Biên bản KCS thực tế tại kho Bên A; nếu không đạt thỏa thuận sẽ đưa ra Tòa án Kinh tế có thẩm quyền tại TP.HCM.',
    notes: '',
    contractedMaterials: [],
  });

  const loadWorkspaceData = async () => {
    try {
      setLoading(true);
      const [contractsData, suppliersData, materialsData] = await Promise.all([
        accountantProcurementApi.getContracts(),
        accountantProcurementApi.getSuppliers(),
        accountantProcurementApi.getMaterialsCatalog(),
      ]);
      setContracts(contractsData);
      setSuppliers(suppliersData);
      setMaterialsCatalog(materialsData);

      setContractForm((prev) => {
        const nextCode =
          prev.contractCode ||
          `HDK-2026-${String(contractsData.length + 1).padStart(3, '0')}`;
        const nextSupplierId =
          prev.supplierId ||
          preselectedSupplierId ||
          suppliersData[0]?._id ||
          '';
        const nextLines =
          prev.contractedMaterials.length > 0
            ? prev.contractedMaterials
            : materialsData.length > 0
            ? [createEmptyMaterialLine(materialsData[0])]
            : [createEmptyMaterialLine()];

        return {
          ...prev,
          contractCode: nextCode,
          supplierId: nextSupplierId,
          contractedMaterials: nextLines,
        };
      });
    } catch (error) {
      setFeedback({
        type: 'error',
        text: error.response?.data?.message || 'Không thể tải dữ liệu hợp đồng',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWorkspaceData();
  }, []);

  const selectedSupplier = useMemo(
    () => suppliers.find((s) => s._id === contractForm.supplierId) || null,
    [suppliers, contractForm.supplierId]
  );

  // Calculate live contract financial totals
  const liveTotals = useMemo(() => {
    let subtotal = 0;
    let vatTotal = 0;
    contractForm.contractedMaterials.forEach((line) => {
      const qty = Number(line.contractedQty || 0);
      const price = Number(line.unitPrice || 0);
      const vatPct = Number(line.vatRatePct ?? contractForm.commercialTerms.vatRatePct ?? 8);
      const lineSub = qty * price;
      const lineVat = Math.round((lineSub * vatPct) / 100);
      subtotal += lineSub;
      vatTotal += lineVat;
    });
    const grandTotal = subtotal + vatTotal;
    const depositPct = Number(contractForm.commercialTerms.depositPercent || 0);
    const depositAmt = Math.round((grandTotal * depositPct) / 100);
    const remainingAmt = grandTotal - depositAmt;
    return { subtotal, vatTotal, grandTotal, depositAmt, remainingAmt };
  }, [contractForm.contractedMaterials, contractForm.commercialTerms]);

  const filteredContracts = useMemo(() => {
    return contracts.filter((c) => {
      const q = searchQuery.trim().toLowerCase();
      const matchSearch =
        !q ||
        (c.contractCode || '').toLowerCase().includes(q) ||
        (c.contractTitle || '').toLowerCase().includes(q) ||
        (c.supplierId?.supplierName || '').toLowerCase().includes(q);
      const matchStatus = statusFilter === 'ALL' || c.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [contracts, searchQuery, statusFilter]);

  const handleContractFieldChange = (field, value) => {
    if (contractErrors[field]) {
      setContractErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
    setContractForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleCommercialChange = (field, value) => {
    if (contractErrors[field]) {
      setContractErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
    setContractForm((prev) => ({
      ...prev,
      commercialTerms: {
        ...prev.commercialTerms,
        [field]: value,
      },
    }));
  };

  const handleQualityChange = (field, value) => {
    if (contractErrors[field]) {
      setContractErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
    setContractForm((prev) => ({
      ...prev,
      qualityStandards: {
        ...prev.qualityStandards,
        [field]: value,
      },
    }));
  };

  const handleMaterialLineChange = (index, field, value) => {
    if (contractErrors.materialLines?.[index]?.[field]) {
      setContractErrors((prev) => {
        if (!prev.materialLines || !prev.materialLines[index]) return prev;
        const nextMat = { ...prev.materialLines };
        const nextLine = { ...nextMat[index] };
        delete nextLine[field];
        if (Object.keys(nextLine).length === 0) {
          delete nextMat[index];
        } else {
          nextMat[index] = nextLine;
        }
        return { ...prev, materialLines: nextMat };
      });
    }

    setContractForm((prev) => {
      const updated = [...prev.contractedMaterials];
      const currentLine = { ...updated[index], [field]: value };

      // When changing rawMaterialId, auto-populate textile specs from catalog
      if (field === 'rawMaterialId') {
        const foundMat = materialsCatalog.find((m) => m._id === value);
        if (foundMat) {
          currentLine.materialCodeSnapshot = foundMat.materialCode;
          currentLine.materialNameSnapshot = foundMat.materialName;
          currentLine.unitSnapshot = foundMat.unit || 'METER';
          currentLine.colorSpec = foundMat.color || currentLine.colorSpec;
          currentLine.widthCm = foundMat.widthCm || 160;
          currentLine.gsm = foundMat.gsm || 210;
          currentLine.unitPrice = foundMat.unitCost || currentLine.unitPrice;
          currentLine.composition =
            foundMat.materialType === 'AUXILIARY'
              ? 'Phụ liệu tiêu chuẩn xuất khẩu'
              : '100% Combed Cotton Compact';
        }
      }

      updated[index] = currentLine;
      return { ...prev, contractedMaterials: updated };
    });
  };

  const handleAddMaterialLine = () => {
    if (contractErrors.contractedMaterials) {
      setContractErrors((prev) => {
        const next = { ...prev };
        delete next.contractedMaterials;
        return next;
      });
    }
    const defaultMat = materialsCatalog[0] || null;
    setContractForm((prev) => ({
      ...prev,
      contractedMaterials: [
        ...prev.contractedMaterials,
        createEmptyMaterialLine(defaultMat),
      ],
    }));
  };

  const handleRemoveMaterialLine = (index) => {
    if (contractForm.contractedMaterials.length <= 1) return;
    setContractForm((prev) => ({
      ...prev,
      contractedMaterials: prev.contractedMaterials.filter((_, i) => i !== index),
    }));
  };

  const startNewContractDraft = () => {
    setEditingContractId(null);
    setContractErrors({});
    setFeedback(null);
    setContractForm((prev) => ({
      ...prev,
      contractCode: `HDK-2026-${String(contracts.length + 1).padStart(3, '0')}`,
      contractTitle:
        'Hợp đồng Khung Cung ứng Vải & Nguyên Phụ Liệu May Mặc Năm 2026',
      status: 'DRAFT_FRAMEWORK',
      contractedMaterials:
        materialsCatalog.length > 0
          ? [createEmptyMaterialLine(materialsCatalog[0])]
          : [createEmptyMaterialLine()],
    }));
    setActiveTab('DRAFT_FORM');
  };

  const handleEditExistingContract = (contract) => {
    setEditingContractId(contract._id);
    setContractErrors({});
    setFeedback(null);
    setContractForm({
      contractCode: contract.contractCode || '',
      contractTitle:
        contract.contractTitle ||
        `Hợp đồng cung ứng nguyên phụ liệu – ${contract.supplierId?.supplierName || ''}`,
      contractType: contract.contractType || 'FRAMEWORK_AGREEMENT',
      signingDate: contract.signingDate
        ? new Date(contract.signingDate).toISOString().slice(0, 10)
        : todayIso,
      effectiveFrom: contract.effectiveFrom
        ? new Date(contract.effectiveFrom).toISOString().slice(0, 10)
        : todayIso,
      effectiveTo: contract.effectiveTo
        ? new Date(contract.effectiveTo).toISOString().slice(0, 10)
        : sixMonthsLaterIso,
      supplierId: contract.supplierId?._id || contract.supplierId || '',
      status: contract.status || 'DRAFT_FRAMEWORK',
      frameworkDocumentUrl: contract.frameworkDocumentUrl || '',
      buyerInfo: {
        companyName:
          contract.buyerInfo?.companyName ||
          'CÔNG TY TNHH THỜI TRANG & KHO VẬN ARA (ARASTORE)',
        taxCode: contract.buyerInfo?.taxCode || '0109888999',
        representativeName:
          contract.buyerInfo?.representativeName || 'Trần Hoàng Chủ Tịch',
        representativeRole:
          contract.buyerInfo?.representativeRole || 'Chủ sở hữu / Giám đốc',
        receivingWarehouseAddress:
          contract.buyerInfo?.receivingWarehouseAddress ||
          'Kho Tổng Nguyên Phụ Liệu AraStore – KCN Tân Bình, TP.HCM',
      },
      commercialTerms: {
        vatRatePct: contract.commercialTerms?.vatRatePct ?? 8,
        depositPercent: contract.commercialTerms?.depositPercent ?? 30,
        paymentMethod: contract.commercialTerms?.paymentMethod || 'BANK_TRANSFER',
        paymentCreditDays: contract.commercialTerms?.paymentCreditDays ?? 30,
        deliveryTerm:
          contract.commercialTerms?.deliveryTerm || 'GIAO_TAI_KHO_BEN_A',
        partialDeliveryAllowed:
          contract.commercialTerms?.partialDeliveryAllowed !== false,
      },
      qualityStandards: {
        inspectionStandard:
          contract.qualityStandards?.inspectionStandard ||
          'Hệ thống 4 điểm (ASTM D5430 4-Point System) đối với vải cuộn; AQL 2.5 đối với phụ liệu may',
        maxDefectPointsPer100SqYards:
          contract.qualityStandards?.maxDefectPointsPer100SqYards ?? 20,
        maxRollJoints: contract.qualityStandards?.maxRollJoints ?? 1,
        requirePreShipmentSample:
          contract.qualityStandards?.requirePreShipmentSample !== false,
        returnExchangeWarrantyDays:
          contract.qualityStandards?.returnExchangeWarrantyDays ?? 15,
      },
      latePenaltyPercentPerDay: contract.latePenaltyPercentPerDay ?? 0.5,
      maxPenaltyPercent: contract.maxPenaltyPercent ?? 8,
      breachPenaltyClause: contract.breachPenaltyClause || '',
      disputeResolutionClause:
        contract.disputeResolutionClause ||
        'Mọi tranh chấp phát sinh được ưu tiên giải quyết qua thương lượng trên cơ sở Biên bản KCS thực tế tại kho Bên A.',
      notes: contract.notes || '',
      contractedMaterials: (contract.contractedMaterials || []).map((m) => ({
        rawMaterialId: m.rawMaterialId?._id || m.rawMaterialId || '',
        materialCodeSnapshot:
          m.materialCodeSnapshot || m.rawMaterialId?.materialCode || '',
        materialNameSnapshot:
          m.materialNameSnapshot || m.rawMaterialId?.materialName || '',
        unitSnapshot: m.unitSnapshot || m.rawMaterialId?.unit || 'METER',
        composition: m.composition || '100% Combed Cotton Compact',
        colorSpec: m.colorSpec || m.rawMaterialId?.color || 'Trắng Sữa',
        widthCm: m.widthCm ?? m.rawMaterialId?.widthCm ?? 160,
        gsm: m.gsm ?? m.rawMaterialId?.gsm ?? 210,
        shrinkageTolerancePct: m.shrinkageTolerancePct ?? 2.5,
        colorFastnessGrade: m.colorFastnessGrade || 'Grade 4.0 (ISO 105)',
        qtyTolerancePct: m.qtyTolerancePct ?? 3,
        moq: m.moq ?? 100,
        leadTimeDays: m.leadTimeDays ?? 7,
        contractedQty: m.contractedQty || 100,
        unitPrice: m.unitPrice || 0,
        vatRatePct: m.vatRatePct ?? 8,
        packagingSpec:
          m.packagingSpec ||
          'Cuộn bọc nilon 2 lớp chống ẩm, lõi ống giấy cứng, dán tem Barcode từng cây vải',
        technicalNote: m.technicalNote || '',
      })),
    });
    setActiveTab('DRAFT_FORM');
  };

  const handleSaveContract = async (e) => {
    e.preventDefault();
    const { isValid, errors } = validateContractForm(contractForm);
    if (!isValid) {
      setContractErrors(errors);
      setFeedback({
        type: 'error',
        text: 'Vui lòng kiểm tra và sửa các thông tin Hợp đồng chưa hợp lệ theo cảnh báo đỏ bên dưới.',
      });
      return;
    }

    try {
      setSubmitting(true);
      setFeedback(null);
      setContractErrors({});
      if (editingContractId) {
        const res = await accountantProcurementApi.updateContract(
          editingContractId,
          contractForm
        );
        setFeedback({ type: 'success', text: res.message });
      } else {
        const res = await accountantProcurementApi.draftContract(contractForm);
        setFeedback({ type: 'success', text: res.message });
      }
      await loadWorkspaceData();
      setActiveTab('CONTRACT_LIST');
    } catch (error) {
      setFeedback({
        type: 'error',
        text:
          error.response?.data?.message ||
          'Lỗi khi lưu khung hợp đồng nguyên phụ liệu',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleTransitionStatus = async (contractId, nextStatus) => {
    try {
      setSubmitting(true);
      const res = await accountantProcurementApi.updateContractStatus(contractId, {
        status: nextStatus,
      });
      setFeedback({ type: 'success', text: res.message });
      await loadWorkspaceData();
    } catch (error) {
      setFeedback({
        type: 'error',
        text: error.response?.data?.message || 'Không thể cập nhật trạng thái hợp đồng',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      {/* Page Header */}
      <section className="wms-page-header">
        <div>
          <h1 className="wms-page-title">
            Soạn thảo Khung Hợp đồng Nhà cung cấp (Draft Supplier Contract Framework)
          </h1>
          <p className="wms-page-subtitle">
            UC 04 (Luồng 1): Thiết lập hợp đồng mua bán nguyên phụ liệu quần áo với đầy đủ quy cách kỹ thuật dệt may (Khổ vải, GSM, Độ co rút, Độ bền màu, KCS 4-Point System), điều khoản tạm ứng và phạt vi phạm.
          </p>
        </div>
        <div className="wms-row-actions">
          <button
            type="button"
            className="wms-btn wms-btn-default"
            onClick={loadWorkspaceData}
            disabled={loading}
          >
            <RefreshCw size={16} />
            Làm mới
          </button>
          <button
            type="button"
            className="wms-btn wms-btn-primary"
            onClick={startNewContractDraft}
          >
            <Plus size={16} />
            Soạn Hợp đồng Khung mới
          </button>
        </div>
      </section>

      {feedback && (
        <div className={`wms-feedback-banner ${feedback.type}`} role="alert">
          <span>{feedback.text}</span>
          <button
            type="button"
            className="wms-btn wms-btn-default wms-btn-sm"
            onClick={() => setFeedback(null)}
          >
            Đóng
          </button>
        </div>
      )}

      {/* Tabs Navigation */}
      <div className="wms-tabs-bar" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'CONTRACT_LIST'}
          className={`wms-tab-btn ${activeTab === 'CONTRACT_LIST' ? 'active' : ''}`}
          onClick={() => setActiveTab('CONTRACT_LIST')}
        >
          <FileSignature size={16} />
          Danh sách Hợp đồng Nguyên phụ liệu ({contracts.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'DRAFT_FORM'}
          className={`wms-tab-btn ${activeTab === 'DRAFT_FORM' ? 'active' : ''}`}
          onClick={() => setActiveTab('DRAFT_FORM')}
        >
          <Plus size={16} />
          {editingContractId
            ? `Chỉnh sửa Hợp đồng: ${contractForm.contractCode}`
            : 'Biểu mẫu Soạn thảo Khung Hợp đồng Thực tế'}
        </button>
      </div>

      {/* TAB 1: CONTRACT LIST */}
      {activeTab === 'CONTRACT_LIST' && (
        <>
          <section className="wms-filter-bar">
            <div className="wms-filter-group">
              <div className="wms-filter-field search-wide">
                <label htmlFor="c-search" className="wms-label">
                  Tìm kiếm Số hợp đồng / Tên hợp đồng / Nhà cung ứng
                </label>
                <input
                  id="c-search"
                  type="search"
                  className="wms-input"
                  placeholder="Nhập mã HDK-2026-..., tên NCC..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="wms-filter-field">
                <label htmlFor="c-status" className="wms-label">
                  Trạng thái Hợp đồng
                </label>
                <select
                  id="c-status"
                  className="wms-select"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="ALL">Tất cả trạng thái</option>
                  <option value="DRAFT_FRAMEWORK">Bản thảo khung (Draft)</option>
                  <option value="PENDING_OWNER_APPROVAL">Chờ Owner phê duyệt</option>
                  <option value="ACTIVE">Đang hiệu lực (Active)</option>
                  <option value="DEVIATION_FLAGGED">Cảnh báo sai lệch</option>
                  <option value="COMPLETED">Đã hoàn tất</option>
                </select>
              </div>
            </div>
          </section>

          <section className="wms-table-card">
            <div className="wms-table-scroll">
              <table className="wms-table">
                <thead>
                  <tr>
                    <th>Số Hợp đồng</th>
                    <th>Tên Hợp đồng & Loại hình</th>
                    <th>Nhà cung ứng (Bên B)</th>
                    <th>Danh mục Nguyên phụ liệu & Quy cách</th>
                    <th>Thời hạn Hiệu lực</th>
                    <th className="wms-td-number">Tổng giá trị (Sau VAT)</th>
                    <th>Trạng thái</th>
                    <th>Thao tác nghiệp vụ</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={8}>Đang tải danh sách hợp đồng...</td>
                    </tr>
                  ) : filteredContracts.length === 0 ? (
                    <tr>
                      <td colSpan={8}>
                        Chưa có hợp đồng nào khớp với điều kiện tìm kiếm.
                      </td>
                    </tr>
                  ) : (
                    filteredContracts.map((c) => {
                      const badge = CONTRACT_STATUS_BADGE[c.status] || {
                        label: c.status,
                        cls: 'wms-status-pending',
                      };
                      return (
                        <tr key={c._id}>
                          <td>
                            <span className="wms-code-pill">{c.contractCode}</span>
                          </td>
                          <td>
                            <div>
                              <strong>
                                {c.contractTitle ||
                                  'Hợp đồng cung ứng nguyên phụ liệu may mặc'}
                              </strong>
                            </div>
                            <div className="wms-helper-text">
                              {CONTRACT_TYPE_LABELS[c.contractType] ||
                                'Hợp đồng nguyên tắc / Khung'}
                            </div>
                          </td>
                          <td>
                            <div>
                              <strong>
                                {c.supplierId?.supplierName || 'Nhà cung ứng'}
                              </strong>
                            </div>
                            <div className="wms-helper-text">
                              Mã: {c.supplierId?.supplierCode || '—'} | MST:{' '}
                              {c.supplierId?.taxCode || '—'}
                            </div>
                          </td>
                          <td>
                            {(c.contractedMaterials || []).map((item, idx) => (
                              <div key={idx} className="wms-helper-text">
                                •{' '}
                                <strong>
                                  {item.materialCodeSnapshot ||
                                    item.rawMaterialId?.materialCode ||
                                    'NVL'}
                                </strong>
                                : {Number(item.contractedQty || 0).toLocaleString('vi-VN')}{' '}
                                {item.unitSnapshot ||
                                  item.rawMaterialId?.unit ||
                                  'METER'}{' '}
                                ({item.composition || '100% Cotton'}, Khổ{' '}
                                {item.widthCm || 160}cm, {item.gsm || 200} GSM)
                              </div>
                            ))}
                          </td>
                          <td>
                            <div>Ký: {formatDate(c.signingDate || c.createdAt)}</div>
                            <div className="wms-helper-text">
                              Hiệu lực: {formatDate(c.effectiveFrom || c.createdAt)} →{' '}
                              {formatDate(c.effectiveTo)}
                            </div>
                          </td>
                          <td className="wms-td-number">
                            <div>{formatVnd(c.totalContractAmount)}</div>
                            <div className="wms-helper-text">
                              Cọc {c.commercialTerms?.depositPercent ?? 30}%:{' '}
                              {formatVnd(
                                c.commercialTerms?.depositAmount ||
                                  Math.round((c.totalContractAmount || 0) * 0.3)
                              )}
                            </div>
                          </td>
                          <td>
                            <span className={`wms-status-badge ${badge.cls}`}>
                              {badge.label}
                            </span>
                          </td>
                          <td>
                            <div className="wms-row-actions">
                              <button
                                type="button"
                                className="wms-btn wms-btn-default wms-btn-sm"
                                onClick={() => setPreviewContract(c)}
                              >
                                <Eye size={14} />
                                Xem Bản HĐ
                              </button>

                              <button
                                type="button"
                                className="wms-btn wms-btn-default wms-btn-sm"
                                onClick={() => handleEditExistingContract(c)}
                              >
                                Sửa Khung
                              </button>

                              {c.status === 'DRAFT_FRAMEWORK' && (
                                <button
                                  type="button"
                                  className="wms-btn wms-btn-default wms-btn-sm"
                                  onClick={() =>
                                    handleTransitionStatus(
                                      c._id,
                                      'PENDING_OWNER_APPROVAL'
                                    )
                                  }
                                  disabled={submitting}
                                >
                                  <Send size={14} />
                                  Trình Owner
                                </button>
                              )}

                              {(c.status === 'DRAFT_FRAMEWORK' ||
                                c.status === 'PENDING_OWNER_APPROVAL') && (
                                <button
                                  type="button"
                                  className="wms-btn wms-btn-primary wms-btn-sm"
                                  onClick={() =>
                                    handleTransitionStatus(c._id, 'ACTIVE')
                                  }
                                  disabled={submitting}
                                >
                                  <CheckCircle2 size={14} />
                                  Kích hoạt HĐ
                                </button>
                              )}

                              <button
                                type="button"
                                className="wms-btn wms-btn-primary wms-btn-sm"
                                onClick={() =>
                                  navigate(
                                    `/accountant/inbound-plans?contractId=${c._id}`
                                  )
                                }
                              >
                                <CalendarClock size={14} />
                                Lập lịch nhập
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {/* TAB 2: FULL REAL-WORLD GARMENT PROCUREMENT CONTRACT FORM */}
      {activeTab === 'DRAFT_FORM' && (
        <form onSubmit={handleSaveContract}>
          {/* PHẦN I: ĐỊNH DANH & HIỆU LỰC HỢP ĐỒNG */}
          <section className="wms-form-section">
            <div className="wms-form-section-header">
              <h2 className="wms-form-section-title">
                <FileSignature size={18} />
                Phần I – Thông tin Định danh & Thời hạn Hiệu lực Hợp đồng
              </h2>
              <span className="wms-status-badge wms-status-reserved">
                Chuẩn Hợp đồng Mua bán Nguyên phụ liệu Dệt May
              </span>
            </div>

            <div className="wms-form-grid-3">
              <div className={`wms-field ${contractErrors.contractCode ? 'has-error' : ''}`}>
                <label htmlFor="cf-code" className="wms-label">
                  Số Hợp đồng Kinh tế <span className="wms-required">*</span>
                </label>
                <input
                  id="cf-code"
                  type="text"
                  className="wms-input"
                  value={contractForm.contractCode}
                  onChange={(e) => handleContractFieldChange('contractCode', e.target.value)}
                  required
                />
                {contractErrors.contractCode && (
                  <span className="wms-field-error-text">
                    <AlertCircle size={12} /> {contractErrors.contractCode}
                  </span>
                )}
              </div>

              <div className="wms-field">
                <label htmlFor="cf-type" className="wms-label">
                  Loại hình Hợp đồng <span className="wms-required">*</span>
                </label>
                <select
                  id="cf-type"
                  className="wms-select"
                  value={contractForm.contractType}
                  onChange={(e) => handleContractFieldChange('contractType', e.target.value)}
                >
                  <option value="FRAMEWORK_AGREEMENT">
                    Hợp đồng nguyên tắc / Khung (Giao nhiều đợt theo lịch)
                  </option>
                  <option value="BATCH_LUMP_SUM">
                    Hợp đồng trọn gói theo lô sản xuất
                  </option>
                  <option value="FIXED_UNIT_PRICE">
                    Hợp đồng theo đơn giá cố định
                  </option>
                </select>
              </div>

              <div className="wms-field">
                <label htmlFor="cf-status" className="wms-label">
                  Trạng thái khởi tạo
                </label>
                <select
                  id="cf-status"
                  className="wms-select"
                  value={contractForm.status}
                  onChange={(e) => handleContractFieldChange('status', e.target.value)}
                >
                  <option value="DRAFT_FRAMEWORK">
                    Bản thảo khung (DRAFT_FRAMEWORK)
                  </option>
                  <option value="PENDING_OWNER_APPROVAL">
                    Trình Owner thương thảo & phê duyệt (PENDING_OWNER_APPROVAL)
                  </option>
                  <option value="ACTIVE">
                    Đã ký & có hiệu lực ngay (ACTIVE)
                  </option>
                </select>
              </div>

              <div className={`wms-field wms-field-span-full ${contractErrors.contractTitle ? 'has-error' : ''}`}>
                <label htmlFor="cf-title" className="wms-label">
                  Tên / Tiêu đề Hợp đồng <span className="wms-required">*</span>
                </label>
                <input
                  id="cf-title"
                  type="text"
                  className="wms-input"
                  value={contractForm.contractTitle}
                  onChange={(e) => handleContractFieldChange('contractTitle', e.target.value)}
                  required
                />
                {contractErrors.contractTitle && (
                  <span className="wms-field-error-text">
                    <AlertCircle size={12} /> {contractErrors.contractTitle}
                  </span>
                )}
              </div>

              <div className={`wms-field ${contractErrors.signingDate ? 'has-error' : ''}`}>
                <label htmlFor="cf-sign-date" className="wms-label">
                  Ngày lập / Ký kết <span className="wms-required">*</span>
                </label>
                <input
                  id="cf-sign-date"
                  type="date"
                  className="wms-input"
                  value={contractForm.signingDate}
                  onChange={(e) => handleContractFieldChange('signingDate', e.target.value)}
                  required
                />
                {contractErrors.signingDate && (
                  <span className="wms-field-error-text">
                    <AlertCircle size={12} /> {contractErrors.signingDate}
                  </span>
                )}
              </div>

              <div className={`wms-field ${contractErrors.effectiveFrom ? 'has-error' : ''}`}>
                <label htmlFor="cf-eff-from" className="wms-label">
                  Ngày bắt đầu hiệu lực <span className="wms-required">*</span>
                </label>
                <input
                  id="cf-eff-from"
                  type="date"
                  className="wms-input"
                  value={contractForm.effectiveFrom}
                  onChange={(e) => handleContractFieldChange('effectiveFrom', e.target.value)}
                  required
                />
                {contractErrors.effectiveFrom && (
                  <span className="wms-field-error-text">
                    <AlertCircle size={12} /> {contractErrors.effectiveFrom}
                  </span>
                )}
              </div>

              <div className={`wms-field ${contractErrors.effectiveTo ? 'has-error' : ''}`}>
                <label htmlFor="cf-eff-to" className="wms-label">
                  Ngày hết hạn hiệu lực <span className="wms-required">*</span>
                </label>
                <input
                  id="cf-eff-to"
                  type="date"
                  className="wms-input"
                  value={contractForm.effectiveTo}
                  onChange={(e) => handleContractFieldChange('effectiveTo', e.target.value)}
                  required
                />
                {contractErrors.effectiveTo && (
                  <span className="wms-field-error-text">
                    <AlertCircle size={12} /> {contractErrors.effectiveTo}
                  </span>
                )}
              </div>
            </div>
          </section>

          {/* PHẦN II: CHỦ THỂ HỢP ĐỒNG (BÊN A & BÊN B) */}
          <section className="wms-form-section">
            <div className="wms-form-section-header">
              <h2 className="wms-form-section-title">
                <Building2 size={18} />
                Phần II – Thông tin Chủ thể Ký kết Hợp đồng (Bên A – Bên Mua & Bên B – Nhà Cung Ứng)
              </h2>
            </div>

            <div className="wms-form-grid-2">
              {/* BÊN A */}
              <div className="wms-material-line-card">
                <div className="wms-material-line-header">
                  <span className="wms-material-line-title">
                    BÊN A (BÊN MUA HÀNG – ARASTORE)
                  </span>
                </div>
                <div className="wms-form-grid-2">
                  <div className="wms-field wms-field-span-full">
                    <label className="wms-label">Tên Pháp nhân Bên A</label>
                    <input
                      type="text"
                      className="wms-input"
                      value={contractForm.buyerInfo.companyName}
                      onChange={(e) =>
                        setContractForm((prev) => ({
                          ...prev,
                          buyerInfo: {
                            ...prev.buyerInfo,
                            companyName: e.target.value,
                          },
                        }))
                      }
                    />
                  </div>
                  <div className="wms-field">
                    <label className="wms-label">Mã số thuế Bên A</label>
                    <input
                      type="text"
                      className="wms-input"
                      value={contractForm.buyerInfo.taxCode}
                      onChange={(e) =>
                        setContractForm((prev) => ({
                          ...prev,
                          buyerInfo: {
                            ...prev.buyerInfo,
                            taxCode: e.target.value,
                          },
                        }))
                      }
                    />
                  </div>
                  <div className="wms-field">
                    <label className="wms-label">Người đại diện ký kết</label>
                    <input
                      type="text"
                      className="wms-input"
                      value={contractForm.buyerInfo.representativeName}
                      onChange={(e) =>
                        setContractForm((prev) => ({
                          ...prev,
                          buyerInfo: {
                            ...prev.buyerInfo,
                            representativeName: e.target.value,
                          },
                        }))
                      }
                    />
                  </div>
                  <div className="wms-field wms-field-span-full">
                    <label className="wms-label">
                      Địa điểm Kho nhận hàng tiêu chuẩn
                    </label>
                    <input
                      type="text"
                      className="wms-input"
                      value={contractForm.buyerInfo.receivingWarehouseAddress}
                      onChange={(e) =>
                        setContractForm((prev) => ({
                          ...prev,
                          buyerInfo: {
                            ...prev.buyerInfo,
                            receivingWarehouseAddress: e.target.value,
                          },
                        }))
                      }
                    />
                  </div>
                </div>
              </div>

              {/* BÊN B */}
              <div className="wms-material-line-card">
                <div className="wms-material-line-header">
                  <span className="wms-material-line-title">
                    BÊN B (BÊN CUNG ỨNG NGUYÊN PHỤ LIỆU MAY MẶC)
                  </span>
                </div>
                <div className={`wms-field ${contractErrors.supplierId ? 'has-error' : ''}`}>
                  <label htmlFor="cf-supplier" className="wms-label">
                    Chọn Nhà cung ứng (Bên B) <span className="wms-required">*</span>
                  </label>
                  <select
                    id="cf-supplier"
                    className="wms-select"
                    value={contractForm.supplierId}
                    onChange={(e) => handleContractFieldChange('supplierId', e.target.value)}
                    required
                  >
                    <option value="">-- Chọn Nhà cung ứng nguyên phụ liệu --</option>
                    {suppliers.map((sup) => (
                      <option key={sup._id} value={sup._id}>
                        [{sup.supplierCode}] {sup.supplierName} (MST:{' '}
                        {sup.taxCode || 'N/A'})
                      </option>
                    ))}
                  </select>
                  {contractErrors.supplierId && (
                    <span className="wms-field-error-text">
                      <AlertCircle size={12} /> {contractErrors.supplierId}
                    </span>
                  )}
                </div>

                {selectedSupplier && (
                  <div className="wms-summary-box">
                    <div className="wms-summary-item">
                      <span className="wms-summary-label">Mã số thuế & Đại diện</span>
                      <span>
                        <strong>MST: {selectedSupplier.taxCode || '—'}</strong>
                      </span>
                      <span className="wms-helper-text">
                        ĐD:{' '}
                        {selectedSupplier.representativeName ||
                          selectedSupplier.contactName ||
                          '—'}{' '}
                        ({selectedSupplier.representativeRole || 'Giám đốc'})
                      </span>
                    </div>
                    <div className="wms-summary-item">
                      <span className="wms-summary-label">Liên hệ & Địa chỉ</span>
                      <span>
                        <strong>SĐT: {selectedSupplier.phone}</strong>
                      </span>
                      <span className="wms-helper-text">
                        {selectedSupplier.address || 'Chưa cập nhật địa chỉ'}
                      </span>
                    </div>
                    <div className="wms-summary-item">
                      <span className="wms-summary-label">Tài khoản Thụ hưởng</span>
                      <span>
                        <strong>
                          {selectedSupplier.bankInfo?.bankName || 'Ngân hàng'}
                        </strong>
                      </span>
                      <span className="wms-helper-text">
                        STK: {selectedSupplier.bankInfo?.accountNo || '—'} (
                        {selectedSupplier.bankInfo?.accountHolder || '—'})
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* PHẦN III: DANH MỤC NGUYÊN PHỤ LIỆU & QUY CÁCH KỸ THUẬT DỆT MAY */}
          <section className="wms-form-section">
            <div className="wms-form-section-header">
              <h2 className="wms-form-section-title">
                <Layers size={18} />
                Phần III – Bảng Danh mục Nguyên Phụ Liệu & Quy cách Kỹ thuật Dệt May Cam kết
              </h2>
              <button
                type="button"
                className="wms-btn wms-btn-dashed"
                onClick={handleAddMaterialLine}
              >
                <Plus size={16} />
                Thêm dòng Nguyên phụ liệu
              </button>
            </div>

            {contractErrors.contractedMaterials && (
              <div className="wms-feedback-banner error" style={{ margin: '8px 0' }}>
                <span>
                  <AlertCircle size={14} style={{ display: 'inline', marginRight: 6 }} />
                  {contractErrors.contractedMaterials}
                </span>
              </div>
            )}

            {contractForm.contractedMaterials.map((line, index) => {
              const lineSub =
                Number(line.contractedQty || 0) * Number(line.unitPrice || 0);
              const lineVat = Math.round(
                (lineSub * Number(line.vatRatePct ?? 8)) / 100
              );
              const lineTotal = lineSub + lineVat;
              const lineErrors = contractErrors.materialLines?.[index] || {};

              return (
                <div key={index} className="wms-material-line-card">
                  <div className="wms-material-line-header">
                    <span className="wms-material-line-title">
                      Hạng mục Nguyên phụ liệu #{index + 1}:{' '}
                      {line.materialCodeSnapshot
                        ? `[${line.materialCodeSnapshot}] ${line.materialNameSnapshot}`
                        : 'Chọn nguyên vật liệu bên dưới'}
                    </span>
                    {contractForm.contractedMaterials.length > 1 && (
                      <button
                        type="button"
                        className="wms-btn wms-btn-danger wms-btn-sm"
                        onClick={() => handleRemoveMaterialLine(index)}
                      >
                        <Trash2 size={14} />
                        Xóa dòng
                      </button>
                    )}
                  </div>

                  <div className="wms-form-grid-4">
                    <div className={`wms-field ${lineErrors.rawMaterialId ? 'has-error' : ''}`}>
                      <label className="wms-label">
                        Mã Nguyên phụ liệu <span className="wms-required">*</span>
                      </label>
                      <select
                        className="wms-select"
                        value={line.rawMaterialId}
                        onChange={(e) =>
                          handleMaterialLineChange(
                            index,
                            'rawMaterialId',
                            e.target.value
                          )
                        }
                        required
                      >
                        <option value="">-- Chọn mã NVL --</option>
                        {materialsCatalog.map((mat) => (
                          <option key={mat._id} value={mat._id}>
                            [{mat.materialCode}] {mat.materialName} ({mat.unit})
                          </option>
                        ))}
                      </select>
                      {lineErrors.rawMaterialId && (
                        <span className="wms-field-error-text">
                          <AlertCircle size={12} /> {lineErrors.rawMaterialId}
                        </span>
                      )}
                    </div>

                    <div className="wms-field">
                      <label className="wms-label">
                        Thành phần sợi / Chất liệu (Composition)
                      </label>
                      <input
                        type="text"
                        className="wms-input"
                        placeholder="VD: 100% Combed Cotton"
                        value={line.composition}
                        onChange={(e) =>
                          handleMaterialLineChange(
                            index,
                            'composition',
                            e.target.value
                          )
                        }
                      />
                    </div>

                    <div className="wms-field">
                      <label className="wms-label">
                        Mã màu / Bảng màu (Pantone / Swatch)
                      </label>
                      <input
                        type="text"
                        className="wms-input"
                        placeholder="VD: Pantone 11-0602 TCX - Trắng Sữa"
                        value={line.colorSpec}
                        onChange={(e) =>
                          handleMaterialLineChange(
                            index,
                            'colorSpec',
                            e.target.value
                          )
                        }
                      />
                    </div>

                    <div className={`wms-field ${lineErrors.widthCm ? 'has-error' : ''}`}>
                      <label className="wms-label">Khổ vải hữu dụng (cm)</label>
                      <input
                        type="number"
                        min="0"
                        className="wms-input"
                        value={line.widthCm}
                        onChange={(e) =>
                          handleMaterialLineChange(index, 'widthCm', e.target.value)
                        }
                      />
                      {lineErrors.widthCm && (
                        <span className="wms-field-error-text">
                          <AlertCircle size={12} /> {lineErrors.widthCm}
                        </span>
                      )}
                    </div>

                    <div className={`wms-field ${lineErrors.gsm ? 'has-error' : ''}`}>
                      <label className="wms-label">
                        Định lượng vải GSM (g/m²)
                      </label>
                      <input
                        type="number"
                        min="0"
                        className="wms-input"
                        value={line.gsm}
                        onChange={(e) =>
                          handleMaterialLineChange(index, 'gsm', e.target.value)
                        }
                      />
                      {lineErrors.gsm && (
                        <span className="wms-field-error-text">
                          <AlertCircle size={12} /> {lineErrors.gsm}
                        </span>
                      )}
                    </div>

                    <div className={`wms-field ${lineErrors.shrinkageTolerancePct ? 'has-error' : ''}`}>
                      <label className="wms-label">
                        Độ co rút cho phép sau giặt (±%)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        className="wms-input"
                        value={line.shrinkageTolerancePct}
                        onChange={(e) =>
                          handleMaterialLineChange(
                            index,
                            'shrinkageTolerancePct',
                            e.target.value
                          )
                        }
                      />
                      {lineErrors.shrinkageTolerancePct && (
                        <span className="wms-field-error-text">
                          <AlertCircle size={12} /> {lineErrors.shrinkageTolerancePct}
                        </span>
                      )}
                    </div>

                    <div className="wms-field">
                      <label className="wms-label">
                        Tiêu chuẩn độ bền màu (Color Fastness)
                      </label>
                      <input
                        type="text"
                        className="wms-input"
                        value={line.colorFastnessGrade}
                        onChange={(e) =>
                          handleMaterialLineChange(
                            index,
                            'colorFastnessGrade',
                            e.target.value
                          )
                        }
                      />
                    </div>

                    <div className={`wms-field ${lineErrors.qtyTolerancePct ? 'has-error' : ''}`}>
                      <label className="wms-label">
                        Dung sai số lượng giao (±%)
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        className="wms-input"
                        value={line.qtyTolerancePct}
                        onChange={(e) =>
                          handleMaterialLineChange(
                            index,
                            'qtyTolerancePct',
                            e.target.value
                          )
                        }
                      />
                      {lineErrors.qtyTolerancePct && (
                        <span className="wms-field-error-text">
                          <AlertCircle size={12} /> {lineErrors.qtyTolerancePct}
                        </span>
                      )}
                    </div>

                    <div className={`wms-field ${lineErrors.moq ? 'has-error' : ''}`}>
                      <label className="wms-label">
                        Số lượng đặt tối thiểu / đợt (MOQ)
                      </label>
                      <input
                        type="number"
                        min="1"
                        className="wms-input"
                        value={line.moq}
                        onChange={(e) =>
                          handleMaterialLineChange(index, 'moq', e.target.value)
                        }
                      />
                      {lineErrors.moq && (
                        <span className="wms-field-error-text">
                          <AlertCircle size={12} /> {lineErrors.moq}
                        </span>
                      )}
                    </div>

                    <div className={`wms-field ${lineErrors.contractedQty ? 'has-error' : ''}`}>
                      <label className="wms-label">
                        Số lượng ký Hợp đồng ({line.unitSnapshot}){' '}
                        <span className="wms-required">*</span>
                      </label>
                      <input
                        type="number"
                        min="1"
                        className="wms-input"
                        value={line.contractedQty}
                        onChange={(e) =>
                          handleMaterialLineChange(
                            index,
                            'contractedQty',
                            e.target.value
                          )
                        }
                        required
                      />
                      {lineErrors.contractedQty && (
                        <span className="wms-field-error-text">
                          <AlertCircle size={12} /> {lineErrors.contractedQty}
                        </span>
                      )}
                    </div>

                    <div className={`wms-field ${lineErrors.unitPrice ? 'has-error' : ''}`}>
                      <label className="wms-label">
                        Đơn giá chưa VAT (VNĐ/{line.unitSnapshot}){' '}
                        <span className="wms-required">*</span>
                      </label>
                      <input
                        type="number"
                        min="0"
                        className="wms-input"
                        value={line.unitPrice}
                        onChange={(e) =>
                          handleMaterialLineChange(
                            index,
                            'unitPrice',
                            e.target.value
                          )
                        }
                        required
                      />
                      {lineErrors.unitPrice && (
                        <span className="wms-field-error-text">
                          <AlertCircle size={12} /> {lineErrors.unitPrice}
                        </span>
                      )}
                    </div>

                    <div className="wms-field">
                      <label className="wms-label">
                        Thuế suất VAT (%) & Thành tiền
                      </label>
                      <div className="wms-row-actions">
                        <select
                          className="wms-select"
                          value={line.vatRatePct}
                          onChange={(e) =>
                            handleMaterialLineChange(
                              index,
                              'vatRatePct',
                              Number(e.target.value)
                            )
                          }
                        >
                          <option value={8}>VAT 8% — {formatVnd(lineTotal)}</option>
                          <option value={10}>VAT 10% — {formatVnd(lineTotal)}</option>
                          <option value={0}>VAT 0% — {formatVnd(lineTotal)}</option>
                        </select>
                      </div>
                    </div>

                    <div className="wms-field wms-field-span-full">
                      <label className="wms-label">
                        Quy cách đóng gói, bảo quản & dán tem Barcode cuộn vải
                      </label>
                      <input
                        type="text"
                        className="wms-input"
                        value={line.packagingSpec}
                        onChange={(e) =>
                          handleMaterialLineChange(
                            index,
                            'packagingSpec',
                            e.target.value
                          )
                        }
                      />
                    </div>
                  </div>
                </div>
              );
            })}

            {/* LIVE TOTALS SUMMARY BOX */}
            <div className="wms-summary-box">
              <div className="wms-summary-item">
                <span className="wms-summary-label">
                  Tổng tiền hàng trước thuế (Subtotal)
                </span>
                <span className="wms-summary-val">
                  {formatVnd(liveTotals.subtotal)}
                </span>
              </div>
              <div className="wms-summary-item">
                <span className="wms-summary-label">Tổng tiền thuế GTGT (VAT)</span>
                <span className="wms-summary-val">
                  {formatVnd(liveTotals.vatTotal)}
                </span>
              </div>
              <div className="wms-summary-item">
                <span className="wms-summary-label">
                  Tổng giá trị Hợp đồng sau thuế
                </span>
                <span className="wms-summary-val highlight">
                  {formatVnd(liveTotals.grandTotal)}
                </span>
              </div>
              <div className="wms-summary-item">
                <span className="wms-summary-label">
                  Tạm ứng Đặt cọc ({contractForm.commercialTerms.depositPercent}%)
                </span>
                <span className="wms-summary-val">
                  {formatVnd(liveTotals.depositAmt)}
                </span>
                <span className="wms-helper-text">
                  Còn lại thanh toán sau KCS: {formatVnd(liveTotals.remainingAmt)}
                </span>
              </div>
            </div>
          </section>

          {/* PHẦN IV: ĐIỀU KHOẢN THANH TOÁN & GIAO NHẬN */}
          <section className="wms-form-section">
            <div className="wms-form-section-header">
              <h2 className="wms-form-section-title">
                <Scale size={18} />
                Phần IV – Điều khoản Thanh toán, Đặt cọc & Phương thức Giao nhận
              </h2>
            </div>

            <div className="wms-form-grid-3">
              <div className="wms-field">
                <label className="wms-label">Phương thức thanh toán</label>
                <select
                  className="wms-select"
                  value={contractForm.commercialTerms.paymentMethod}
                  onChange={(e) =>
                    setContractForm((prev) => ({
                      ...prev,
                      commercialTerms: {
                        ...prev.commercialTerms,
                        paymentMethod: e.target.value,
                      },
                    }))
                  }
                >
                  <option value="BANK_TRANSFER">
                    Chuyển khoản Ngân hàng (Ủy nhiệm chi)
                  </option>
                  <option value="LETTER_OF_CREDIT">
                    Thư tín dụng thương mại (L/C)
                  </option>
                  <option value="CASH">Tiền mặt tại quỹ</option>
                </select>
              </div>

              <div className={`wms-field ${contractErrors.depositPercent ? 'has-error' : ''}`}>
                <label className="wms-label">
                  Tỷ lệ Đặt cọc Tạm ứng đợt 1 (%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  className="wms-input"
                  value={contractForm.commercialTerms.depositPercent}
                  onChange={(e) =>
                    handleCommercialChange('depositPercent', Number(e.target.value))
                  }
                />
                {contractErrors.depositPercent && (
                  <span className="wms-field-error-text">
                    <AlertCircle size={12} /> {contractErrors.depositPercent}
                  </span>
                )}
              </div>

              <div className={`wms-field ${contractErrors.paymentCreditDays ? 'has-error' : ''}`}>
                <label className="wms-label">
                  Thời hạn công nợ sau nghiệm thu KCS (Ngày)
                </label>
                <input
                  type="number"
                  min="0"
                  className="wms-input"
                  value={contractForm.commercialTerms.paymentCreditDays}
                  onChange={(e) =>
                    handleCommercialChange('paymentCreditDays', Number(e.target.value))
                  }
                />
                {contractErrors.paymentCreditDays && (
                  <span className="wms-field-error-text">
                    <AlertCircle size={12} /> {contractErrors.paymentCreditDays}
                  </span>
                )}
              </div>

              <div className="wms-field">
                <label className="wms-label">Điều kiện & Địa điểm giao hàng</label>
                <select
                  className="wms-select"
                  value={contractForm.commercialTerms.deliveryTerm}
                  onChange={(e) =>
                    handleCommercialChange('deliveryTerm', e.target.value)
                  }
                >
                  <option value="GIAO_TAI_KHO_BEN_A">
                    Giao tại Kho Nguyên Phụ Liệu Bên A (AraStore)
                  </option>
                  <option value="GIAO_TAI_XUONG_MAY">
                    Giao trực tiếp tại Xưởng May Gia Công
                  </option>
                  <option value="NHAN_TAI_KHO_NCC">
                    Nhận tại Kho Nhà cung ứng (EXW)
                  </option>
                </select>
              </div>

              <div className="wms-field">
                <label className="wms-label">
                  Cho phép chia nhỏ giao nhiều đợt theo Lịch trình nhập
                </label>
                <select
                  className="wms-select"
                  value={
                    contractForm.commercialTerms.partialDeliveryAllowed
                      ? 'true'
                      : 'false'
                  }
                  onChange={(e) =>
                    handleCommercialChange(
                      'partialDeliveryAllowed',
                      e.target.value === 'true'
                    )
                  }
                >
                  <option value="true">
                    Cho phép giao từng đợt theo Kế hoạch lịch trình nhập (UC 05)
                  </option>
                  <option value="false">Bắt buộc giao đủ 1 lần duy nhất</option>
                </select>
              </div>

              <div className="wms-field">
                <label className="wms-label">
                  Đường dẫn File PDF Khung Hợp đồng
                </label>
                <input
                  type="text"
                  className="wms-input"
                  value={contractForm.frameworkDocumentUrl}
                  onChange={(e) =>
                    handleContractFieldChange('frameworkDocumentUrl', e.target.value)
                  }
                />
              </div>
            </div>
          </section>

          {/* PHẦN V: TIÊU CHUẨN KIỂM ĐỊNH KCS / QC & ĐIỀU KHOẢN PHẠT VI PHẠM */}
          <section className="wms-form-section">
            <div className="wms-form-section-header">
              <h2 className="wms-form-section-title">
                <ShieldCheck size={18} />
                Phần V – Tiêu chuẩn Kiểm định Chất lượng KCS (4-Point System) & Điều khoản Phạt Vi phạm
              </h2>
            </div>

            <div className="wms-form-grid-3">
              <div className="wms-field wms-field-span-full">
                <label className="wms-label">
                  Tiêu chuẩn Kiểm định Chất lượng Đầu vào (KCS/QC)
                </label>
                <input
                  type="text"
                  className="wms-input"
                  value={contractForm.qualityStandards.inspectionStandard}
                  onChange={(e) =>
                    handleQualityChange('inspectionStandard', e.target.value)
                  }
                />
              </div>

              <div className="wms-field">
                <label className="wms-label">
                  Điểm lỗi tối đa / 100 yard vuông (4-Point System)
                </label>
                <input
                  type="number"
                  min="1"
                  className="wms-input"
                  value={
                    contractForm.qualityStandards.maxDefectPointsPer100SqYards
                  }
                  onChange={(e) =>
                    handleQualityChange(
                      'maxDefectPointsPer100SqYards',
                      Number(e.target.value)
                    )
                  }
                />
              </div>

              <div className="wms-field">
                <label className="wms-label">
                  Số mối nối tối đa cho phép / 1 cây vải
                </label>
                <input
                  type="number"
                  min="0"
                  className="wms-input"
                  value={contractForm.qualityStandards.maxRollJoints}
                  onChange={(e) =>
                    handleQualityChange('maxRollJoints', Number(e.target.value))
                  }
                />
              </div>

              <div className="wms-field">
                <label className="wms-label">
                  Thời hạn bảo hành & đổi trả hàng lỗi KCS (Ngày)
                </label>
                <input
                  type="number"
                  min="1"
                  className="wms-input"
                  value={contractForm.qualityStandards.returnExchangeWarrantyDays}
                  onChange={(e) =>
                    handleQualityChange(
                      'returnExchangeWarrantyDays',
                      Number(e.target.value)
                    )
                  }
                />
              </div>

              <div className={`wms-field ${contractErrors.latePenaltyPercentPerDay ? 'has-error' : ''}`}>
                <label className="wms-label">
                  Mức phạt chậm giao hàng mỗi ngày (%/ngày)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  className="wms-input"
                  value={contractForm.latePenaltyPercentPerDay}
                  onChange={(e) =>
                    handleContractFieldChange(
                      'latePenaltyPercentPerDay',
                      Number(e.target.value)
                    )
                  }
                />
                {contractErrors.latePenaltyPercentPerDay && (
                  <span className="wms-field-error-text">
                    <AlertCircle size={12} /> {contractErrors.latePenaltyPercentPerDay}
                  </span>
                )}
              </div>

              <div className={`wms-field ${contractErrors.maxPenaltyPercent ? 'has-error' : ''}`}>
                <label className="wms-label">
                  Trần mức phạt vi phạm tối đa (% giá trị HĐ)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  className="wms-input"
                  value={contractForm.maxPenaltyPercent}
                  onChange={(e) =>
                    handleContractFieldChange('maxPenaltyPercent', Number(e.target.value))
                  }
                />
                {contractErrors.maxPenaltyPercent && (
                  <span className="wms-field-error-text">
                    <AlertCircle size={12} /> {contractErrors.maxPenaltyPercent}
                  </span>
                )}
              </div>

              <div className="wms-field">
                <label className="wms-label">
                  Yêu cầu duyệt Mẫu đầu cây (Swatch Card) trước giao hàng
                </label>
                <select
                  className="wms-select"
                  value={
                    contractForm.qualityStandards.requirePreShipmentSample
                      ? 'true'
                      : 'false'
                  }
                  onChange={(e) =>
                    handleQualityChange(
                      'requirePreShipmentSample',
                      e.target.value === 'true'
                    )
                  }
                >
                  <option value="true">
                    Bắt buộc có Mẫu đối (Swatch Card) được KCS ký duyệt
                  </option>
                  <option value="false">Không bắt buộc duyệt mẫu trước</option>
                </select>
              </div>

              <div className={`wms-field wms-field-span-full ${contractErrors.breachPenaltyClause ? 'has-error' : ''}`}>
                <label className="wms-label">
                  Điều khoản Phạt vi phạm Tiến độ & Chất lượng Nguyên phụ liệu{' '}
                  <span className="wms-required">*</span>
                </label>
                <textarea
                  className="wms-textarea"
                  value={contractForm.breachPenaltyClause}
                  onChange={(e) =>
                    handleContractFieldChange('breachPenaltyClause', e.target.value)
                  }
                  required
                />
                {contractErrors.breachPenaltyClause && (
                  <span className="wms-field-error-text">
                    <AlertCircle size={12} /> {contractErrors.breachPenaltyClause}
                  </span>
                )}
              </div>

              <div className="wms-field wms-field-span-full">
                <label className="wms-label">
                  Điều khoản Giải quyết Tranh chấp & Cơ quan Tài phán
                </label>
                <textarea
                  className="wms-textarea"
                  value={contractForm.disputeResolutionClause}
                  onChange={(e) =>
                    setContractForm((prev) => ({
                      ...prev,
                      disputeResolutionClause: e.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <div className="wms-modal-footer">
              <button
                type="button"
                className="wms-btn wms-btn-default"
                onClick={() => setActiveTab('CONTRACT_LIST')}
              >
                Quay lại Danh sách
              </button>
              <button
                type="submit"
                className="wms-btn wms-btn-primary"
                disabled={submitting}
              >
                {submitting
                  ? 'Đang lưu Hợp đồng...'
                  : editingContractId
                  ? 'Lưu Cập nhật Khung Hợp đồng'
                  : 'Lưu Khung Hợp đồng Nguyên Phụ Liệu'}
              </button>
            </div>
          </section>
        </form>
      )}

      {/* MODAL PREVIEW REAL-WORLD GARMENT SUPPLY CONTRACT DOCUMENT */}
      {previewContract && (
        <div className="wms-modal-backdrop" role="dialog" aria-modal="true">
          <div className="wms-modal-dialog wide">
            <div className="wms-modal-header">
              <h2 className="wms-modal-title">
                Văn bản Hợp đồng Kinh tế Cung ứng Nguyên Phụ Liệu:{' '}
                {previewContract.contractCode}
              </h2>
              <button
                type="button"
                className="wms-btn wms-btn-default wms-btn-sm"
                onClick={() => setPreviewContract(null)}
              >
                <X size={16} />
                Đóng bản xem
              </button>
            </div>

            <div className="wms-modal-body">
              <article className="wms-legal-doc">
                <header className="wms-legal-header">
                  <div className="wms-legal-nation">
                    CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM
                  </div>
                  <div className="wms-legal-motto">
                    Độc lập – Tự do – Hạnh phúc
                  </div>
                  <div className="wms-legal-title">
                    {previewContract.contractTitle ||
                      'HỢP ĐỒNG NGUYÊN TẮC CUNG ỨNG NGUYÊN PHỤ LIỆU MAY MẶC'}
                  </div>
                  <div>
                    Số: <strong>{previewContract.contractCode}</strong> | Ngày ký:{' '}
                    <strong>
                      {formatDate(
                        previewContract.signingDate || previewContract.createdAt
                      )}
                    </strong>
                  </div>
                </header>

                <div className="wms-legal-section">
                  <div className="wms-legal-section-title">
                    ĐIỀU 1. CHỦ THỂ THAM GIA KÝ KẾT HỢP ĐỒNG
                  </div>
                  <p>
                    <strong>1. BÊN MUA HÀNG (BÊN A):</strong>{' '}
                    {previewContract.buyerInfo?.companyName ||
                      'CÔNG TY TNHH THỜI TRANG & KHO VẬN ARA (ARASTORE)'}
                    <br />• Mã số thuế:{' '}
                    {previewContract.buyerInfo?.taxCode || '0109888999'} | Đại diện:{' '}
                    <strong>
                      {previewContract.buyerInfo?.representativeName ||
                        'Trần Hoàng Chủ Tịch'}
                    </strong>{' '}
                    ({previewContract.buyerInfo?.representativeRole || 'Giám đốc'})
                    <br />• Địa điểm Kho nhận hàng:{' '}
                    {previewContract.buyerInfo?.receivingWarehouseAddress ||
                      'Kho Tổng Nguyên Phụ Liệu AraStore – KCN Tân Bình, TP.HCM'}
                  </p>
                  <p>
                    <strong>2. BÊN CUNG ỨNG (BÊN B):</strong>{' '}
                    {previewContract.supplierId?.supplierName}
                    <br />• Mã NCC: {previewContract.supplierId?.supplierCode} | Mã số
                    thuế: {previewContract.supplierId?.taxCode || '—'} | Điện thoại:{' '}
                    {previewContract.supplierId?.phone || '—'}
                    <br />• Địa chỉ: {previewContract.supplierId?.address || '—'}
                    <br />• Tài khoản ngân hàng:{' '}
                    {previewContract.supplierId?.bankInfo?.accountNo || '—'} tại{' '}
                    {previewContract.supplierId?.bankInfo?.bankName || '—'} (Chủ TK:{' '}
                    {previewContract.supplierId?.bankInfo?.accountHolder || '—'})
                  </p>
                </div>

                <div className="wms-legal-section">
                  <div className="wms-legal-section-title">
                    ĐIỀU 2. DANH MỤC NGUYÊN PHỤ LIỆU & QUY CÁCH KỸ THUẬT DỆT MAY
                  </div>
                  <div className="wms-table-scroll">
                    <table className="wms-table">
                      <thead>
                        <tr>
                          <th>Mã & Tên NVL</th>
                          <th>Thành phần & Màu sắc</th>
                          <th>Khổ vải & GSM</th>
                          <th>Độ co rút & Bền màu</th>
                          <th className="wms-td-number">Số lượng (±Dung sai)</th>
                          <th className="wms-td-number">Đơn giá (Chưa VAT)</th>
                          <th className="wms-td-number">VAT</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(previewContract.contractedMaterials || []).map(
                          (item, idx) => (
                            <tr key={idx}>
                              <td>
                                <strong>
                                  {item.materialCodeSnapshot ||
                                    item.rawMaterialId?.materialCode}
                                </strong>
                                <div>
                                  {item.materialNameSnapshot ||
                                    item.rawMaterialId?.materialName}
                                </div>
                              </td>
                              <td>
                                <div>{item.composition || '100% Cotton'}</div>
                                <div className="wms-helper-text">
                                  Màu: {item.colorSpec || 'Trắng Sữa'}
                                </div>
                              </td>
                              <td>
                                <div>Khổ: {item.widthCm || 160} cm</div>
                                <div className="wms-helper-text">
                                  {item.gsm || 210} g/m² (GSM)
                                </div>
                              </td>
                              <td>
                                <div>
                                  Co rút: ±{item.shrinkageTolerancePct ?? 2.5}%
                                </div>
                                <div className="wms-helper-text">
                                  {item.colorFastnessGrade || 'Grade 4.0'}
                                </div>
                              </td>
                              <td className="wms-td-number">
                                {Number(item.contractedQty || 0).toLocaleString(
                                  'vi-VN'
                                )}{' '}
                                {item.unitSnapshot || 'METER'} (±
                                {item.qtyTolerancePct ?? 3}%)
                              </td>
                              <td className="wms-td-number">
                                {formatVnd(item.unitPrice)}
                              </td>
                              <td className="wms-td-number">
                                {item.vatRatePct ?? 8}%
                              </td>
                            </tr>
                          )
                        )}
                      </tbody>
                    </table>
                  </div>
                  <p className="wms-helper-text">
                    * Tổng giá trị hợp đồng (đã gồm VAT):{' '}
                    <strong>{formatVnd(previewContract.totalContractAmount)}</strong>{' '}
                    | Tạm ứng đặt cọc ({previewContract.commercialTerms?.depositPercent ?? 30}
                    %):{' '}
                    <strong>
                      {formatVnd(
                        previewContract.commercialTerms?.depositAmount ||
                          Math.round(
                            (previewContract.totalContractAmount || 0) * 0.3
                          )
                      )}
                    </strong>
                  </p>
                </div>

                <div className="wms-legal-section">
                  <div className="wms-legal-section-title">
                    ĐIỀU 3. PHƯƠNG THỨC GIAO NHẬN & THANH TOÁN CÔNG NỢ
                  </div>
                  <p>
                    • Điều kiện giao hàng:{' '}
                    {DELIVERY_TERM_LABELS[
                      previewContract.commercialTerms?.deliveryTerm
                    ] || 'Giao tại Kho Nguyên Phụ Liệu Bên A'}
                    . Hiệu lực từ{' '}
                    {formatDate(
                      previewContract.effectiveFrom || previewContract.createdAt
                    )}{' '}
                    đến {formatDate(previewContract.effectiveTo)}.
                    <br />• Thanh toán bằng:{' '}
                    {PAYMENT_METHOD_LABELS[
                      previewContract.commercialTerms?.paymentMethod
                    ] || 'Chuyển khoản Ngân hàng'}{' '}
                    trong vòng{' '}
                    <strong>
                      {previewContract.commercialTerms?.paymentCreditDays ?? 30} ngày
                    </strong>{' '}
                    kể từ khi Kỹ thuật viên KCS Bên A ký biên bản nghiệm thu đạt
                    chuẩn.
                  </p>
                </div>

                <div className="wms-legal-section">
                  <div className="wms-legal-section-title">
                    ĐIỀU 4. TIÊU CHUẨN KIỂM ĐỊNH KCS (4-POINT SYSTEM) & PHẠT VI PHẠM
                  </div>
                  <p>
                    • Tiêu chuẩn kiểm định:{' '}
                    {previewContract.qualityStandards?.inspectionStandard ||
                      'Hệ thống 4 điểm ASTM D5430 (tối đa 20 điểm lỗi/100 sq.yds)'}
                    . Số mối nối tối đa:{' '}
                    {previewContract.qualityStandards?.maxRollJoints ?? 1} mối/cuộn.
                    <br />• Chế tài phạt vi phạm:{' '}
                    {previewContract.breachPenaltyClause}
                  </p>
                </div>

                <div className="wms-legal-signatures">
                  <div>
                    <strong>ĐẠI DIỆN BÊN A (ARASTORE)</strong>
                    <div className="wms-helper-text">(Ký, ghi rõ họ tên & đóng dấu)</div>
                    <br />
                    <br />
                    <strong>
                      {previewContract.buyerInfo?.representativeName ||
                        'Trần Hoàng Chủ Tịch'}
                    </strong>
                  </div>
                  <div>
                    <strong>ĐẠI DIỆN BÊN B (NHÀ CUNG ỨNG)</strong>
                    <div className="wms-helper-text">(Ký, ghi rõ họ tên & đóng dấu)</div>
                    <br />
                    <br />
                    <strong>
                      {previewContract.supplierId?.representativeName ||
                        previewContract.supplierId?.contactName ||
                        previewContract.supplierId?.supplierName}
                    </strong>
                  </div>
                  <div>
                    <strong>KẾ TOÁN SOẠN THẢO KHUNG HĐ</strong>
                    <div className="wms-helper-text">(Kiểm soát điều khoản tài chính)</div>
                    <br />
                    <br />
                    <strong>
                      {previewContract.draftedByAccountantId?.fullName ||
                        'Kế toán Kho & Tài chính'}
                    </strong>
                  </div>
                </div>
              </article>
            </div>

            <div className="wms-modal-footer">
              <button
                type="button"
                className="wms-btn wms-btn-default"
                onClick={() => setPreviewContract(null)}
              >
                Đóng
              </button>
              <button
                type="button"
                className="wms-btn wms-btn-primary"
                onClick={() => window.print()}
              >
                In / Xuất PDF Hợp đồng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ContractFrameworkPage;

