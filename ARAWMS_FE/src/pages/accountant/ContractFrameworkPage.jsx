import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  FileSignature,
  Plus,
  Trash2,
  Eye,
  CheckCircle2,
  Send,
  Calendar,
  CalendarClock,
  RefreshCw,
  ShieldCheck,
  Building2,
  Layers,
  Scale,
  X,
  AlertCircle,
  MoreHorizontal,
  Edit3,
  GitBranch,
  History,
  CopyCheck,
  ChevronDown,
  ChevronUp,
  Printer,
  XCircle,
  Ban,
  Truck,
  Sparkles,
  PackageCheck,
  Package,
  AlertTriangle,
  Search,
} from 'lucide-react';
import accountantProcurementApi from '../../services/accountantProcurementApi.js';
import { validateContractForm, isRollFabricLine } from '../../utils/procurementValidation.js';

const CONTRACT_STATUS_BADGE = {
  DRAFT_FRAMEWORK: {
    label: 'Bản thảo khung',
    cls: 'wms-status-pending',
  },
  ACTIVE: {
    label: 'Đang hiệu lực',
    cls: 'wms-status-available',
  },
  DEVIATION_FLAGGED: {
    label: 'Cảnh báo sai lệch',
    cls: 'wms-status-damaged',
  },
  SUPERSEDED: {
    label: 'Đã thay thế',
    cls: 'wms-status-superseded',
  },
  COMPLETED: {
    label: 'Đã hoàn tất',
    cls: 'wms-status-completed',
  },
  CANCELLED: {
    label: 'Đã hủy',
    cls: 'wms-status-rejected',
  },
  TERMINATED: {
    label: 'Đã chấm dứt',
    cls: 'wms-status-rejected',
  },
};

const CONTRACT_TYPE_LABELS = {
  SALES_CONTRACT: 'Hợp đồng mua bán',
  FRAMEWORK_AGREEMENT: 'Hợp đồng mua bán',
  BATCH_LUMP_SUM: 'Hợp đồng mua bán',
  FIXED_UNIT_PRICE: 'Hợp đồng mua bán',
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

const resolveContractEffectiveTo = (contract) => {
  if (contract?.effectiveTo) return contract.effectiveTo;
  const start = contract?.effectiveFrom || contract?.signingDate || contract?.createdAt;
  if (!start) return null;
  const d = new Date(start);
  d.setMonth(d.getMonth() + 6);
  return d;
};

const numberToWordsVnd = (num) => {
  if (!num || isNaN(num) || Number(num) <= 0) return 'Không đồng';
  const digits = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
  const units = ['', 'nghìn', 'triệu', 'tỷ', 'nghìn tỷ', 'triệu tỷ'];

  const readThreeDigits = (n, hasHigher) => {
    let hundred = Math.floor(n / 100);
    let remainder = n % 100;
    let ten = Math.floor(remainder / 10);
    let unit = remainder % 10;
    let res = '';

    if (hundred > 0 || hasHigher) {
      res += `${digits[hundred]} trăm `;
    }
    if (ten > 1) {
      res += `${digits[ten]} mươi `;
      if (unit === 1) res += 'mốt ';
      else if (unit === 5) res += 'lăm ';
      else if (unit > 0) res += `${digits[unit]} `;
    } else if (ten === 1) {
      res += 'mười ';
      if (unit === 5) res += 'lăm ';
      else if (unit > 0) res += `${digits[unit]} `;
    } else if (hasHigher && unit > 0) {
      res += `lẻ ${digits[unit]} `;
    } else if (unit > 0) {
      res += `${digits[unit]} `;
    }
    return res.trim();
  };

  let n = Math.round(Number(num));
  let groups = [];
  while (n > 0) {
    groups.push(n % 1000);
    n = Math.floor(n / 1000);
  }

  let parts = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    let group = groups[i];
    if (group > 0) {
      let read = readThreeDigits(group, i < groups.length - 1);
      parts.push(`${read} ${units[i]}`.trim());
    }
  }

  let result = parts.join(' ').trim();
  if (!result) return 'Không đồng';
  return result.charAt(0).toUpperCase() + result.slice(1) + ' đồng chẵn.';
};

const buildPaymentSchedule = (
  count,
  depositPercent,
  currentSchedule = [],
  effectiveFromStr = '',
  effectiveToStr = '',
  preserveExistingPercents = false,
  totalContractAmount = 0
) => {
  const dep = Math.max(0, Math.min(100, Number(depositPercent) || 0));
  if (dep >= 100 || Number(count) <= 0) {
    return [];
  }
  const n = Math.max(1, Math.min(12, Math.floor(Number(count) || 1)));
  const remainingPct = Number((100 - dep).toFixed(2));
  const grandTotal = Number(totalContractAmount) || 0;
  const depositAmt = Math.round((grandTotal * dep) / 100);
  const remainingAmt = Math.max(0, grandTotal - depositAmt);

  const startMs = effectiveFromStr ? new Date(effectiveFromStr).getTime() : Date.now();
  const rawEndMs = effectiveToStr
    ? new Date(effectiveToStr).getTime()
    : startMs + 180 * 24 * 60 * 60 * 1000;
  const endMs = Number.isFinite(rawEndMs) && rawEndMs >= startMs ? rawEndMs : startMs;

  let percents = [];
  if (n === 1) {
    percents = [remainingPct];
  } else {
    let sumExistingFirst = 0;
    const hasValidExisting =
      preserveExistingPercents &&
      Array.isArray(currentSchedule) &&
      currentSchedule.length === n &&
      currentSchedule.slice(0, n - 1).every((item) => {
        const p = Number(item?.paymentPercent);
        sumExistingFirst += p;
        return Number.isFinite(p) && p > 0;
      }) &&
      sumExistingFirst < remainingPct;

    if (hasValidExisting) {
      for (let i = 0; i < n - 1; i++) {
        percents.push(Number(currentSchedule[i].paymentPercent));
      }
      percents.push(Number((remainingPct - sumExistingFirst).toFixed(2)));
    } else {
      const basePct = Number((Math.floor((remainingPct / n) * 100) / 100).toFixed(2));
      let sumFirst = 0;
      for (let i = 0; i < n - 1; i++) {
        percents.push(basePct);
        sumFirst += basePct;
      }
      percents.push(Number((remainingPct - sumFirst).toFixed(2)));
    }
  }

  let prevDateIso = effectiveFromStr || new Date(startMs).toISOString().slice(0, 10);
  let sumEarlierAmts = 0;

  return Array.from({ length: n }, (_, idx) => {
    const existing = currentSchedule[idx];
    let dueIso = existing?.dueDate ? String(existing.dueDate).slice(0, 10) : '';

    if (!dueIso) {
      const stepMs = startMs + Math.round(((endMs - startMs) * (idx + 1)) / (n + 1));
      const clampedMs = Math.max(startMs, Math.min(endMs, stepMs));
      dueIso = new Date(clampedMs).toISOString().slice(0, 10);
      if (dueIso < prevDateIso) dueIso = prevDateIso;
      if (effectiveToStr && dueIso > effectiveToStr) dueIso = effectiveToStr;
    }
    prevDateIso = dueIso;

    const isLast = idx === n - 1;
    const pct = percents[idx];
    let amt = 0;
    if (isLast) {
      amt = Math.max(0, remainingAmt - sumEarlierAmts);
    } else {
      amt = existing?.paymentAmount !== undefined && Number(existing.paymentAmount) > 0
        ? Number(existing.paymentAmount)
        : grandTotal > 0
        ? Math.round((grandTotal * pct) / 100)
        : 0;
      sumEarlierAmts += amt;
    }

    return {
      installmentNumber: idx + 1,
      dueDate: dueIso,
      paymentPercent: pct,
      paymentAmount: amt,
      note:
        existing?.note ||
        (idx === n - 1
          ? `Thanh toán lần cuối (${idx + 1}/${n}) – Tất toán phần giá trị hợp đồng còn lại`
          : `Thanh toán lần ${idx + 1}/${n} theo tiến độ giao hàng & nghiệm thu KCS`),
    };
  });
};

/**
 * Khởi tạo danh sách các đợt tiếp nhận nguyên vật liệu (Multi-batch Inbound Deliveries)
 * Chia theo số đợt tùy chọn của người dùng, bảo toàn 100% số lượng cam kết trên Hợp đồng
 */
export const buildBatches = (
  count,
  materials = [],
  effectiveFrom = null,
  effectiveTo = null,
  existingBatches = []
) => {
  const n = Math.max(1, Math.min(24, Math.floor(Number(count) || 1)));
  const startMs = effectiveFrom ? new Date(effectiveFrom).getTime() : Date.now() + 3 * 86400000;
  const endMs = effectiveTo ? new Date(effectiveTo).getTime() : startMs + 180 * 86400000;
  const isSameBatchCount = Array.isArray(existingBatches) && existingBatches.length === n;

  const totalContractQtyAll = (materials || []).reduce(
    (sum, m) => sum + (Number(m.contractedQty) || 0),
    0
  );

  const built = Array.from({ length: n }, (_, bIdx) => {
    const batchNo = bIdx + 1;
    const existing = isSameBatchCount ? existingBatches[bIdx] : null;

    let dateIso = existing?.scheduledDeliveryDate
      ? String(existing.scheduledDeliveryDate).slice(0, 10)
      : '';
    if (!dateIso) {
      const stepMs = n === 1 ? startMs : startMs + Math.round(((endMs - startMs) * bIdx) / (n - 1 || 1));
      dateIso = new Date(stepMs).toISOString().slice(0, 10);
    }

    const expectedItems = (materials || []).map((m, mIdx) => {
      const contractedQty = Number(m.contractedQty || 0);
      const isRollLine = isRollFabricLine(m);
      const allRolls =
        isRollLine && Array.isArray(m.rollDetails) && m.rollDetails.length > 0
          ? m.rollDetails
          : [];
      const existingItem = existing?.expectedItems?.[mIdx];

      const totalContractRollCount = allRolls.reduce(
        (sum, r) => sum + Math.max(1, Math.floor(Number(r.rollQty ?? 1) || 1)),
        0
      );
      const sumExistingForMaterial = isSameBatchCount
        ? existingBatches.reduce(
            (sum, eb) => sum + (Number(eb?.expectedItems?.[mIdx]?.plannedQty) || 0),
            0
          )
        : -1;
      const sumExistingRollsForMaterial =
        isSameBatchCount && allRolls.length > 0
          ? existingBatches.reduce(
              (sum, eb) =>
                sum +
                (eb?.expectedItems?.[mIdx]?.selectedRolls || []).reduce(
                  (s, sr) => s + (Number(sr.rollQty ?? 1) || 0),
                  0
                ),
              0
            )
          : totalContractRollCount;
      const everyBatchRollSumMatchesQty =
        isSameBatchCount && allRolls.length > 0
          ? existingBatches.every((eb) => {
              const bItem = eb?.expectedItems?.[mIdx];
              const rollsSum = (bItem?.selectedRolls || []).reduce(
                (s, r) => s + (Number(r.rollQty ?? 1) || 0) * (Number(r.lengthMeters) || 0),
                0
              );
              return Math.abs(rollsSum - Number(bItem?.plannedQty || 0)) < 0.001;
            })
          : true;
      const canPreserveExisting =
        isSameBatchCount &&
        existingItem &&
        Math.abs(sumExistingForMaterial - contractedQty) < 0.001 &&
        sumExistingRollsForMaterial === totalContractRollCount &&
        everyBatchRollSumMatchesQty;

      let selectedRolls =
        canPreserveExisting && Array.isArray(existingItem?.selectedRolls)
          ? [...existingItem.selectedRolls]
          : [];
      let plannedQty = canPreserveExisting ? Number(existingItem.plannedQty) : 0;

      if (!canPreserveExisting) {
        if (allRolls.length > 0 && totalContractRollCount > 0) {
          const startUnit = Math.floor((bIdx * totalContractRollCount) / n);
          const endUnit =
            bIdx === n - 1
              ? totalContractRollCount
              : Math.floor(((bIdx + 1) * totalContractRollCount) / n);
          let cursor = 0;
          selectedRolls = [];
          allRolls.forEach((r) => {
            const rQty = Math.max(1, Math.floor(Number(r.rollQty ?? 1) || 1));
            const overlapStart = Math.max(startUnit, cursor);
            const overlapEnd = Math.min(endUnit, cursor + rQty);
            const allocatedRollQty = Math.max(0, overlapEnd - overlapStart);
            if (allocatedRollQty > 0) {
              selectedRolls.push({
                ...r,
                rollQty: allocatedRollQty,
              });
            }
            cursor += rQty;
          });
          plannedQty = selectedRolls.reduce(
            (sum, r) => sum + (Number(r.rollQty ?? 1) || 0) * (Number(r.lengthMeters) || 0),
            0
          );
        } else {
          const startQty = Math.floor((bIdx * contractedQty) / n);
          const endQty =
            bIdx === n - 1 ? contractedQty : Math.floor(((bIdx + 1) * contractedQty) / n);
          plannedQty = Math.max(0, endQty - startQty);
          selectedRolls = [];
        }
      }

      const batchRollCount = selectedRolls.reduce(
        (sum, r) => sum + (Number(r.rollQty ?? 1) || 0),
        0
      );

      return {
        rawMaterialId: m.rawMaterialId?._id || m.rawMaterialId?.id || m.rawMaterialId,
        materialCode: m.materialCodeSnapshot || m.rawMaterialId?.materialCode || m.materialCode || 'NVL',
        materialName: m.materialNameSnapshot || m.rawMaterialId?.materialName || m.materialName || '',
        unit: m.unitSnapshot || m.rawMaterialId?.unit || m.unit || 'METER',
        contractedQty,
        plannedQty,
        allRolls,
        rollCount: batchRollCount || (n === 1 ? m.rollCount || 0 : 0),
        selectedRolls,
      };
    });

    const batchQtySum = expectedItems.reduce((sum, it) => sum + (Number(it.plannedQty) || 0), 0);
    const computedPct =
      totalContractQtyAll > 0
        ? Number(((batchQtySum / totalContractQtyAll) * 100).toFixed(1))
        : Number((100 / n).toFixed(1));

    return {
      batchNumber: batchNo,
      totalBatches: n,
      batchTitle:
        n === 1
          ? 'Tiếp nhận toàn bộ nguyên liệu (100% hợp đồng)'
          : batchNo === 1
          ? `Đợt 1/${n}: Giao nguyên liệu đợt đầu`
          : batchNo === n
          ? `Đợt ${n}/${n}: Giao toàn bộ nguyên liệu còn lại`
          : `Đợt ${batchNo}/${n}: Giao nguyên liệu theo tiến độ`,
      batchPercentage: computedPct,
      scheduledDeliveryDate: dateIso,
      notes: existing?.notes || '',
      expectedItems,
    };
  });

  if (n > 1) {
    const sumBeforeLastPct = built
      .slice(0, n - 1)
      .reduce((sum, b) => sum + (Number(b.batchPercentage) || 0), 0);
    built[n - 1].batchPercentage = Number(Math.max(0, 100 - sumBeforeLastPct).toFixed(1));
  } else if (n === 1) {
    built[0].batchPercentage = 100;
  }

  return built;
};

export const generateMaterialCodeFromName = (name) => {
  if (!name || !name.trim()) return '';
  const clean = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .join('-');
  return clean ? `NVL-${clean}` : 'NVL-MAT';
};

export const MATERIAL_UNIT_OPTIONS = [
  { value: 'METER', label: 'Mét (m)' },
  { value: 'KG', label: 'Kilogram (kg)' },
  { value: 'PIECE', label: 'Cái / Chiếc (pc)' },
  { value: 'SPOOL', label: 'Cuộn / Ống chỉ (spool)' },
  { value: 'BOX', label: 'Hộp / Thùng (box)' },
];

export const MATERIAL_CATEGORY_OPTIONS = [
  { value: 'FABRIC_ROLL', label: 'Vải cuộn / Vải may mặc', type: 'FABRIC' },
  { value: 'BUTTON', label: 'Cúc / Nút áo', type: 'AUXILIARY' },
  { value: 'THREAD', label: 'Chỉ may', type: 'AUXILIARY' },
  { value: 'ZIPPER', label: 'Khóa kéo / Dây kéo', type: 'AUXILIARY' },
  { value: 'CARE_LABEL', label: 'Nhãn mác / Nhãn giặt', type: 'AUXILIARY' },
  { value: 'PACKAGING_BAG', label: 'Túi đóng gói / Bao bì', type: 'AUXILIARY' },
  { value: 'NEEDLE', label: 'Kim may', type: 'AUXILIARY' },
  { value: 'CHALK', label: 'Phấn may', type: 'AUXILIARY' },
  { value: 'MARKER', label: 'Bút đánh dấu vải', type: 'AUXILIARY' },
  { value: 'ACCESSORY', label: 'Phụ kiện / Phụ liệu may', type: 'AUXILIARY' },
  { value: 'OTHER', label: 'Khác', type: 'AUXILIARY' },
];

const createEmptyMaterialLine = (rawMat = null) => {
  const isFabric = !rawMat || isRollFabricLine(rawMat);
  const defaultRolls = isFabric
    ? [
        { rollIndex: 1, rollCode: 'C-01', rollQty: 1, lengthMeters: 100, weightKg: 100, note: '' },
      ]
    : [];
  const defaultRollCount = defaultRolls.length;
  const defaultContractedQty = isFabric ? 100 : 100;

  return {
    _uiKey: `mat-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    rawMaterialId: rawMat?._id || rawMat?.id || '',
    materialCodeSnapshot: rawMat?.materialCode || '',
    materialNameSnapshot: rawMat?.materialName || '',
    category: rawMat?.category || 'FABRIC_ROLL',
    materialType: rawMat?.materialType || (rawMat?.category === 'FABRIC_ROLL' ? 'FABRIC' : 'AUXILIARY'),
    unitSnapshot: rawMat?.unit || (isFabric ? 'METER' : 'CAI'),
    isCustomUnit: false,
    isNewMaterial: false,
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
    rollCount: defaultRollCount,
    rollDetails: defaultRolls,
    contractedQty: defaultContractedQty,
    unitPrice: rawMat?.unitCost || 85000,
    vatRatePct: 8,
    packagingSpec:
      'Cuộn bọc nilon 2 lớp chống ẩm, lõi ống giấy cứng, dán tem Barcode đầu cây vải',
    technicalNote: 'Không nối đầu cây quá 1 lần, không loang màu biên vải',
  };
};

// UC: Soạn thảo khung hợp đồng với nhà cung cấp
const ContractFrameworkPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const preselectedSupplierId = searchParams.get('supplierId') || '';
  const amendContractIdParam = searchParams.get('amendContractId') || '';

  const [activeTab, setActiveTab] = useState(
    preselectedSupplierId || amendContractIdParam ? 'DRAFT_FORM' : 'CONTRACT_LIST'
  );
  const [contracts, setContracts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [materialsCatalog, setMaterialsCatalog] = useState([]);

  const [editingContractId, setEditingContractId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState('NEWEST'); // 'NEWEST' (Mặc định: Mới -> Cũ) | 'OLDEST' | 'AMOUNT_DESC'

  // Preview Legal Contract Modal
  const [previewContract, setPreviewContract] = useState(null);
  const [showBlankTemplateModal, setShowBlankTemplateModal] = useState(false);
  const [contractErrors, setContractErrors] = useState({});
  const [activeMenuId, setActiveMenuId] = useState(null);

  // Modal Chấm dứt Hợp đồng
  const [selectedForTerminate, setSelectedForTerminate] = useState(null);
  const [terminateReason, setTerminateReason] = useState('');
  const [terminateErrors, setTerminateErrors] = useState({});
  const [submittingTerminate, setSubmittingTerminate] = useState(false);

  // Versioning & Amendment State (UC 04)
  const [isAmendingActive, setIsAmendingActive] = useState(false);
  const [sourceActiveContract, setSourceActiveContract] = useState(null);
  const [historyModalContract, setHistoryModalContract] = useState(null);
  const [contractVersionsList, setContractVersionsList] = useState([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [expandedFamilies, setExpandedFamilies] = useState(new Set());

  const toggleExpandFamily = (rootId) => {
    setExpandedFamilies((prev) => {
      const next = new Set(prev);
      if (next.has(rootId)) {
        next.delete(rootId);
      } else {
        next.add(rootId);
      }
      return next;
    });
  };

  // Draft Contract Form State (Full Real-World Garment Procurement Contract)
  const todayIso = new Date().toISOString().slice(0, 10);
  const sixMonthsLaterIso = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const [contractForm, setContractForm] = useState({
    contractCode: '',
    contractTitle:
      'Khung hợp đồng Cung ứng Vải & Nguyên Phụ Liệu May Mặc Năm 2026',
    contractType: 'FRAMEWORK_AGREEMENT',
    signingDate: todayIso,
    effectiveFrom: todayIso,
    effectiveTo: sixMonthsLaterIso,
    supplierId: preselectedSupplierId,
    status: 'DRAFT_FRAMEWORK',
    versionNumber: 1,
    isNewVersion: false,
    amendmentReason: '',
    parentSupersededContractId: null,
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
      paymentInstallmentsCount: 2,
      paymentSchedule: buildPaymentSchedule(2, 30, [], todayIso, sixMonthsLaterIso, false),
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
    inboundBatchesCount: 2,
    inboundBatches: [],
  });

  const [expandedHistoricalInboundPlans, setExpandedHistoricalInboundPlans] = useState(false);

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

      if (amendContractIdParam) {
        let target = contractsData.find(
          (c) => String(c._id || c.id) === String(amendContractIdParam)
        );
        if (target) {
          if (target.status === 'SUPERSEDED') {
            const rootId = String(target.rootContractId?._id || target.rootContractId || target._id);
            const activeOrLatest = contractsData.find(
              (c) =>
                (String(c.rootContractId?._id || c.rootContractId) === rootId || String(c._id) === rootId) &&
                (c.status === 'ACTIVE' || c.status === 'DEVIATION_FLAGGED')
            );
            if (activeOrLatest) {
              target = activeOrLatest;
            }
          }
          await handleEditExistingContract(target);
          const newParams = new URLSearchParams(searchParams);
          newParams.delete('amendContractId');
          setSearchParams(newParams, { replace: true });
        }
      } else {
        setContractForm((prev) => {
          const nextCode =
            prev.contractCode ||
            `HDK-2026-${String(contractsData.length + 1).padStart(3, '0')}`;
          const nextSupplierId =
            preselectedSupplierId ||
            prev.supplierId ||
            suppliersData[0]?._id ||
            suppliersData[0]?.id ||
            '';
          const nextLines =
            prev.contractedMaterials.length > 0
              ? prev.contractedMaterials
              : materialsData.length > 0
              ? [createEmptyMaterialLine(materialsData[0])]
              : [createEmptyMaterialLine()];

          const nextBatches = buildBatches(
            prev.inboundBatchesCount || 2,
            nextLines,
            prev.effectiveFrom,
            prev.effectiveTo,
            prev.inboundBatches
          );

          return {
            ...prev,
            contractCode: nextCode,
            supplierId: nextSupplierId,
            contractedMaterials: nextLines,
            inboundBatchesCount: prev.inboundBatchesCount || 2,
            inboundBatches: nextBatches,
          };
        });
      }
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

  // Tự động mở form tạo Version mới (v2) khi nhận param amendContractId từ trang Xử lý Sai lệch
  useEffect(() => {
    if (amendContractIdParam && contracts.length > 0 && !loading) {
      let target = contracts.find(
        (c) => String(c._id || c.id) === String(amendContractIdParam)
      );
      if (target) {
        if (target.status === 'SUPERSEDED') {
          const rootId = String(target.rootContractId?._id || target.rootContractId || target._id);
          const activeOrLatest = contracts.find(
            (c) =>
              (String(c.rootContractId?._id || c.rootContractId) === rootId || String(c._id) === rootId) &&
              (c.status === 'ACTIVE' || c.status === 'DEVIATION_FLAGGED')
          );
          if (activeOrLatest) {
            target = activeOrLatest;
          }
        }
        handleEditExistingContract(target);
        const newParams = new URLSearchParams(searchParams);
        newParams.delete('amendContractId');
        setSearchParams(newParams, { replace: true });
      }
    }
  }, [amendContractIdParam, contracts, loading]);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (!e.target.closest('.wms-action-dropdown')) {
        setActiveMenuId(null);
      }
    };
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, []);

  const selectedSupplier = useMemo(
    () => suppliers.find((s) => (s._id || s.id) === contractForm.supplierId) || null,
    [suppliers, contractForm.supplierId]
  );

  // Danh mục nguyên phụ liệu khả dụng theo Nhà cung ứng đang chọn
  const availableMaterialsForSupplier = useMemo(() => {
    if (!contractForm.supplierId) return [];
    return materialsCatalog.filter((m) => {
      const sId = m.supplierId?._id || m.supplierId?.id || m.supplierId;
      return String(sId) === String(contractForm.supplierId);
    });
  }, [materialsCatalog, contractForm.supplierId]);

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

  // Đồng bộ số tiền thanh toán khi tổng giá trị hợp đồng hoặc tiền cọc thay đổi
  useEffect(() => {
    const grandTotal = liveTotals.grandTotal;
    const depPct = Number(contractForm.commercialTerms?.depositPercent || 0);
    const depAmt = Math.round((grandTotal * depPct) / 100);
    const remainingAfterDep = Math.max(0, grandTotal - depAmt);
    const schedule = contractForm.commercialTerms?.paymentSchedule;

    if (!Array.isArray(schedule) || schedule.length === 0 || grandTotal <= 0) return;

    let hasChanged = false;
    const n = schedule.length;
    let sumEarlierAmt = 0;

    const nextSchedule = schedule.map((inst, idx) => {
      const isLast = idx === n - 1;
      let amt = Number(inst.paymentAmount || 0);
      let pct = Number(inst.paymentPercent || 0);

      if (isLast) {
        const autoAmt = Math.max(0, remainingAfterDep - sumEarlierAmt);
        const autoPct = grandTotal > 0 ? Number(((autoAmt / grandTotal) * 100).toFixed(2)) : 0;
        if (amt !== autoAmt || Math.abs(pct - autoPct) > 0.05) {
          hasChanged = true;
          return { ...inst, paymentAmount: autoAmt, paymentPercent: autoPct };
        }
        return inst;
      } else {
        if (amt === 0 && pct > 0) {
          amt = Math.round((grandTotal * pct) / 100);
          hasChanged = true;
        } else if (amt > 0) {
          const newPct = Number(((amt / grandTotal) * 100).toFixed(2));
          if (Math.abs(pct - newPct) > 0.05) {
            pct = newPct;
            hasChanged = true;
          }
        }
        sumEarlierAmt += amt;
        return { ...inst, paymentAmount: amt, paymentPercent: pct };
      }
    });

    if (hasChanged) {
      setContractForm((prev) => ({
        ...prev,
        commercialTerms: {
          ...prev.commercialTerms,
          paymentSchedule: nextSchedule,
        },
      }));
    }
  }, [liveTotals.grandTotal, contractForm.commercialTerms?.depositPercent]);

  const contractFamilies = useMemo(() => {
    const familiesMap = new Map();

    contracts.forEach((c) => {
      const rootId =
        String(c.rootContractId?._id || c.rootContractId || '') ||
        (c.contractCode || '').replace(/-V\d+$/i, '') ||
        String(c._id || c.id);

      if (!familiesMap.has(rootId)) {
        familiesMap.set(rootId, {
          rootId,
          baseCode: (c.contractCode || '').replace(/-V\d+$/i, ''),
          versions: [],
        });
      }
      familiesMap.get(rootId).versions.push(c);
    });

    const families = Array.from(familiesMap.values()).map((fam) => {
      fam.versions.sort((a, b) => (b.versionNumber || 1) - (a.versionNumber || 1));
      fam.totalVersions = fam.versions.length;
      fam.hasMultipleVersions = fam.totalVersions > 1;

      // Prefer ACTIVE, then PENDING_OWNER_APPROVAL, then DRAFT_FRAMEWORK, else latest version
      fam.primaryContract =
        fam.versions.find((v) => v.status === 'ACTIVE') ||
        fam.versions.find((v) => v.status === 'PENDING_OWNER_APPROVAL') ||
        fam.versions.find((v) => v.status === 'DRAFT_FRAMEWORK') ||
        fam.versions[0];

      if (!fam.baseCode && fam.primaryContract) {
        fam.baseCode = (fam.primaryContract.contractCode || '').replace(/-V\d+$/i, '');
      }

      return fam;
    });

    // Mặc định: Sắp xếp các chuỗi hợp đồng theo thời gian tạo mới nhất -> cũ nhất
    families.sort((a, b) => {
      const timeA = new Date(a.primaryContract?.createdAt || a.primaryContract?.signingDate || 0).getTime();
      const timeB = new Date(b.primaryContract?.createdAt || b.primaryContract?.signingDate || 0).getTime();
      return timeB - timeA;
    });

    return families;
  }, [contracts]);

  const filteredFamilies = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = contractFamilies.filter((fam) => {
      const matchesSearch =
        !q ||
        fam.baseCode.toLowerCase().includes(q) ||
        fam.versions.some(
          (v) =>
            (v.contractCode || '').toLowerCase().includes(q) ||
            (v.contractTitle || '').toLowerCase().includes(q) ||
            (v.supplierId?.supplierName || '').toLowerCase().includes(q)
        );

      const matchesStatus =
        statusFilter === 'ALL' ||
        fam.primaryContract.status === statusFilter ||
        fam.versions.some((v) => v.status === statusFilter);

      return matchesSearch && matchesStatus;
    });

    // Mặc định: Mới nhất -> Cũ nhất (NEWEST)
    return list.sort((a, b) => {
      const timeA = new Date(a.primaryContract?.createdAt || a.primaryContract?.signingDate || 0).getTime();
      const timeB = new Date(b.primaryContract?.createdAt || b.primaryContract?.signingDate || 0).getTime();
      if (sortBy === 'OLDEST') {
        return timeA - timeB;
      }
      if (sortBy === 'AMOUNT_DESC') {
        return (Number(b.primaryContract?.totalContractAmount) || 0) - (Number(a.primaryContract?.totalContractAmount) || 0);
      }
      return timeB - timeA;
    });
  }, [contractFamilies, searchQuery, statusFilter, sortBy]);

  const contractKpis = useMemo(() => {
    const total = contracts.length;
    let active = 0;
    let deviationFlagged = 0;
    let draft = 0;
    let terminated = 0;

    contracts.forEach((c) => {
      if (c.status === 'ACTIVE') active++;
      else if (c.status === 'DEVIATION_FLAGGED') deviationFlagged++;
      else if (c.status === 'DRAFT_FRAMEWORK') draft++;
      else if (c.status === 'TERMINATED') terminated++;
    });

    return { total, active, deviationFlagged, draft, terminated };
  }, [contracts]);

  const handleOpenTerminateModal = (contract) => {
    setSelectedForTerminate(contract);
    setTerminateReason('');
    setTerminateErrors({});
  };

  const handleConfirmTerminate = async (e) => {
    e.preventDefault();
    if (!terminateReason || !terminateReason.trim()) {
      setTerminateErrors({ reason: 'Vui lòng nhập lý do/ghi chú chấm dứt hợp đồng.' });
      return;
    }
    if (terminateReason.trim().length < 5) {
      setTerminateErrors({ reason: 'Lý do chấm dứt hợp đồng phải có độ dài tối thiểu 5 ký tự.' });
      return;
    }

    try {
      setSubmittingTerminate(true);
      const contractId = selectedForTerminate._id || selectedForTerminate.id;
      const res = await accountantProcurementApi.terminateContract(contractId, {
        terminationReason: terminateReason.trim(),
      });
      setFeedback({
        type: 'success',
        text: res.message || `Đã chấm dứt hợp đồng [${selectedForTerminate.contractCode}] thành công.`,
      });
      setSelectedForTerminate(null);
      await loadWorkspaceData();
    } catch (err) {
      console.error('Lỗi chấm dứt hợp đồng:', err);
      setFeedback({
        type: 'error',
        text: err.response?.data?.message || 'Có lỗi xảy ra khi chấm dứt hợp đồng.',
      });
    } finally {
      setSubmittingTerminate(false);
    }
  };

  const handleContractFieldChange = (field, value) => {
    if (contractErrors[field]) {
      setContractErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
    setContractForm((prev) => {
      const nextForm = {
        ...prev,
        [field]: value,
      };

      // Khi thay đổi Nhà cung cấp (Bên B), tự động lọc và reset các dòng NVL theo NCC mới
      if (field === 'supplierId') {
        const supplierMaterials = materialsCatalog.filter((m) => {
          const sId = m.supplierId?._id || m.supplierId?.id || m.supplierId;
          return String(sId) === String(value);
        });
        const defaultMat = supplierMaterials[0] || null;
        const freshMaterials = defaultMat ? [createEmptyMaterialLine(defaultMat)] : [];
        nextForm.contractedMaterials = freshMaterials;

        // Reset kế hoạch tiếp nhận (batches) tương ứng theo nguyên liệu mới
        const nextBatches = buildBatches(
          prev.inboundBatchesCount || 2,
          freshMaterials,
          nextForm.effectiveFrom,
          nextForm.effectiveTo,
          []
        );
        nextForm.inboundBatches = nextBatches;
      }

      return nextForm;
    });
  };

  const handleCommercialChange = (field, value) => {
    setContractErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      delete next.paymentSchedule;
      delete next.paymentScheduleLines;
      return next;
    });
    setContractForm((prev) => {
      const nextCommercial = {
        ...prev.commercialTerms,
        [field]: value,
      };

      if (field === 'depositPercent') {
        const nextDep = Math.max(0, Math.min(100, Number(value) || 0));
        nextCommercial.depositPercent = nextDep;
        if (nextDep >= 100) {
          nextCommercial.paymentInstallmentsCount = 0;
          nextCommercial.paymentSchedule = [];
        } else {
          const nextCount = Math.max(
            1,
            Math.min(12, Number(prev.commercialTerms.paymentInstallmentsCount) || 2)
          );
          nextCommercial.paymentInstallmentsCount = nextCount;
          nextCommercial.paymentSchedule = buildPaymentSchedule(
            nextCount,
            nextDep,
            prev.commercialTerms.paymentSchedule,
            prev.effectiveFrom,
            prev.effectiveTo,
            true
          );
        }
      } else if (field === 'paymentInstallmentsCount') {
        const dep = Number(prev.commercialTerms.depositPercent || 0);
        if (dep >= 100) {
          nextCommercial.paymentInstallmentsCount = 0;
          nextCommercial.paymentSchedule = [];
        } else {
          const nextCount = Math.max(1, Math.min(12, Math.floor(Number(value) || 1)));
          nextCommercial.paymentInstallmentsCount = nextCount;
          nextCommercial.paymentSchedule = buildPaymentSchedule(
            nextCount,
            dep,
            prev.commercialTerms.paymentSchedule,
            prev.effectiveFrom,
            prev.effectiveTo,
            false
          );
        }
      }

      return {
        ...prev,
        commercialTerms: nextCommercial,
      };
    });
  };

  const handleInstallmentChange = (index, field, value) => {
    setContractErrors((prev) => {
      const next = { ...prev };
      delete next.paymentSchedule;
      if (next.paymentScheduleLines?.[index]?.[field]) {
        const nextLines = { ...next.paymentScheduleLines };
        const nextRow = { ...nextLines[index] };
        delete nextRow[field];
        if (field === 'paymentAmount') delete nextRow.paymentPercent;
        if (field === 'paymentPercent') delete nextRow.paymentAmount;
        if (Object.keys(nextRow).length === 0) {
          delete nextLines[index];
        } else {
          nextLines[index] = nextRow;
        }
        next.paymentScheduleLines = nextLines;
      }
      // Also clear last row errors when earlier row changes
      if ((field === 'paymentAmount' || field === 'paymentPercent') && next.paymentScheduleLines) {
        const nextLines = { ...next.paymentScheduleLines };
        const lastIdx = (contractForm.commercialTerms.paymentSchedule?.length || 1) - 1;
        if (nextLines[lastIdx]) {
          const nextLastRow = { ...nextLines[lastIdx] };
          delete nextLastRow.paymentAmount;
          delete nextLastRow.paymentPercent;
          if (Object.keys(nextLastRow).length === 0) {
            delete nextLines[lastIdx];
          } else {
            nextLines[lastIdx] = nextLastRow;
          }
          next.paymentScheduleLines = nextLines;
        }
      }
      return next;
    });

    setContractForm((prev) => {
      const currentList = Array.isArray(prev.commercialTerms.paymentSchedule)
        ? [...prev.commercialTerms.paymentSchedule]
        : [];
      if (!currentList[index]) return prev;

      const grandTotal = liveTotals.grandTotal || 0;
      const depPct = Number(prev.commercialTerms.depositPercent || 0);
      const depAmt = Math.round((grandTotal * depPct) / 100);
      const remainingAfterDep = Math.max(0, grandTotal - depAmt);

      if (field === 'paymentAmount') {
        const rawAmt = value === '' ? '' : Math.max(0, Number(value));
        const numAmt = Number(rawAmt || 0);
        const calculatedPct = grandTotal > 0 ? Number(((numAmt / grandTotal) * 100).toFixed(2)) : 0;

        currentList[index] = {
          ...currentList[index],
          paymentAmount: rawAmt,
          paymentPercent: calculatedPct,
        };

        // AUTO-FILL LẦN CUỐI CÙNG: Tự động điền số tiền và % còn thiếu
        if (currentList.length > 0 && index < currentList.length - 1) {
          const sumBeforeLastAmt = currentList
            .slice(0, currentList.length - 1)
            .reduce((acc, row) => acc + (Number(row.paymentAmount) || 0), 0);
          const remainingForLastAmt = Math.max(0, remainingAfterDep - sumBeforeLastAmt);

          const sumBeforeLastPct = currentList
            .slice(0, currentList.length - 1)
            .reduce((acc, row) => acc + (Number(row.paymentPercent) || 0), 0);
          const remainingForLastPct = Number((100 - depPct - sumBeforeLastPct).toFixed(2));

          const lastIdx = currentList.length - 1;
          currentList[lastIdx] = {
            ...currentList[lastIdx],
            paymentAmount: remainingForLastAmt,
            paymentPercent: remainingForLastPct,
          };
        }
      } else if (field === 'paymentPercent') {
        const rawPct = value === '' ? '' : Math.max(0, Number(value));
        const numPct = Number(rawPct || 0);
        const calculatedAmt = grandTotal > 0 ? Math.round((grandTotal * numPct) / 100) : 0;

        currentList[index] = {
          ...currentList[index],
          paymentPercent: rawPct,
          paymentAmount: calculatedAmt,
        };

        // Auto-fill the last installment
        if (currentList.length > 0 && index < currentList.length - 1) {
          const sumBeforeLastPct = currentList
            .slice(0, currentList.length - 1)
            .reduce((acc, row) => acc + (Number(row.paymentPercent) || 0), 0);
          const remainingForLastPct = Number((100 - depPct - sumBeforeLastPct).toFixed(2));

          const sumBeforeLastAmt = currentList
            .slice(0, currentList.length - 1)
            .reduce((acc, row) => acc + (Number(row.paymentAmount) || 0), 0);
          const remainingForLastAmt = Math.max(0, remainingAfterDep - sumBeforeLastAmt);

          const lastIdx = currentList.length - 1;
          currentList[lastIdx] = {
            ...currentList[lastIdx],
            paymentPercent: remainingForLastPct,
            paymentAmount: remainingForLastAmt,
          };
        }
      } else {
        currentList[index] = { ...currentList[index], [field]: value };
      }

      return {
        ...prev,
        commercialTerms: {
          ...prev.commercialTerms,
          paymentSchedule: currentList,
        },
      };
    });
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

      // When changing rawMaterialId, auto-populate textile specs from catalog or prepare for new input
      if (field === 'rawMaterialId') {
        if (value === '__CREATE_NEW__') {
          currentLine.rawMaterialId = '__CREATE_NEW__';
          currentLine.isNewMaterial = true;
          currentLine.materialCodeSnapshot = '';
          currentLine.materialNameSnapshot = '';
          currentLine.category = 'FABRIC_ROLL';
          currentLine.materialType = 'FABRIC';
          currentLine.unitSnapshot = 'METER';
          currentLine.isCustomUnit = false;
          if (!currentLine.rollDetails || currentLine.rollDetails.length === 0) {
            currentLine.rollCount = 1;
            currentLine.rollDetails = [
              { rollIndex: 1, rollCode: 'C-01', rollQty: 1, lengthMeters: 100, note: '' },
            ];
            currentLine.contractedQty = 100;
          }
        } else {
          currentLine.isNewMaterial = false;
          const foundMat = materialsCatalog.find((m) => (m._id || m.id) === value);
          if (foundMat) {
            currentLine.materialCodeSnapshot = foundMat.materialCode;
            currentLine.materialNameSnapshot = foundMat.materialName;
            currentLine.category = foundMat.category || 'FABRIC_ROLL';
            currentLine.materialType = foundMat.materialType || (foundMat.category === 'FABRIC_ROLL' ? 'FABRIC' : 'AUXILIARY');
            currentLine.unitSnapshot = foundMat.unit || 'METER';
            currentLine.isCustomUnit = false;
            currentLine.colorSpec = foundMat.color || currentLine.colorSpec;
            currentLine.widthCm = foundMat.widthCm || 160;
            currentLine.gsm = foundMat.gsm || 210;
            currentLine.unitPrice = foundMat.unitCost || currentLine.unitPrice;
            currentLine.composition =
              foundMat.materialType === 'AUXILIARY'
                ? 'Phụ liệu tiêu chuẩn xuất khẩu'
                : '100% Combed Cotton Compact';

            // Nếu là vải cuộn và chưa có danh sách cuộn thì khởi tạo 1 cuộn mặc định; nếu là phụ liệu thì xóa cuộn cũ
            const isFabricType = isRollFabricLine(foundMat) || isRollFabricLine(currentLine);
            if (isFabricType) {
              if (!currentLine.rollDetails || currentLine.rollDetails.length === 0) {
                currentLine.rollCount = 1;
                currentLine.rollDetails = [
                  { rollIndex: 1, rollCode: 'C-01', rollQty: 1, lengthMeters: 100, weightKg: 100, note: '' },
                ];
                currentLine.contractedQty = 100;
              }
            } else {
              currentLine.rollCount = 0;
              currentLine.rollDetails = [];
            }
          }
        }
      }

      // Tự động sinh mã nguyên phụ liệu khi gõ tên mới
      if (field === 'materialNameSnapshot' && currentLine.isNewMaterial) {
        currentLine.materialCodeSnapshot = generateMaterialCodeFromName(value);
      }

      updated[index] = currentLine;

      // Đồng bộ các đợt giao (batches) trong kế hoạch tiếp nhận
      let nextBatches = prev.inboundBatches;
      if (['contractedQty', 'materialCodeSnapshot', 'materialNameSnapshot', 'unitSnapshot', 'rawMaterialId'].includes(field)) {
        nextBatches = buildBatches(
          prev.inboundBatchesCount || (prev.inboundBatches?.length || 2),
          updated,
          prev.effectiveFrom,
          prev.effectiveTo,
          prev.inboundBatches
        );
      }

      return {
        ...prev,
        contractedMaterials: updated,
        inboundBatches: nextBatches,
      };
    });
  };

  // Thêm 1 dòng cuộn vải mới vào danh sách của dòng nguyên phụ liệu
  const handleAddRoll = (matIndex) => {
    setContractForm((prev) => {
      const updated = [...prev.contractedMaterials];
      const line = { ...updated[matIndex] };
      const currentRolls = Array.isArray(line.rollDetails) ? [...line.rollDetails] : [];
      const nextIdx = currentRolls.length + 1;
      const lastMeter = currentRolls.length > 0 ? (currentRolls[currentRolls.length - 1].lengthMeters || 100) : 100;

      currentRolls.push({
        rollIndex: nextIdx,
        rollCode: `C-${String(nextIdx).padStart(2, '0')}`,
        rollQty: 1,
        lengthMeters: lastMeter,
        note: '',
      });

      line.rollCount = currentRolls.reduce((sum, r) => sum + (Number(r.rollQty ?? 1) || 0), 0);
      line.rollDetails = currentRolls;
      line.contractedQty = currentRolls.reduce(
        (sum, r) => sum + (Number(r.rollQty ?? 1) || 0) * (Number(r.lengthMeters) || 0),
        0
      );
      updated[matIndex] = line;

      const nextBatches = buildBatches(
        prev.inboundBatchesCount || (prev.inboundBatches?.length || 2),
        updated,
        prev.effectiveFrom,
        prev.effectiveTo,
        prev.inboundBatches
      );

      return {
        ...prev,
        contractedMaterials: updated,
        inboundBatches: nextBatches,
      };
    });
  };

  // Xóa 1 dòng cuộn vải khỏi danh sách
  const handleRemoveRoll = (matIndex, rollIndexToRemove) => {
    setContractForm((prev) => {
      const updated = [...prev.contractedMaterials];
      const line = { ...updated[matIndex] };
      const currentRolls = (line.rollDetails || []).filter((_, idx) => idx !== rollIndexToRemove);

      const reindexedRolls = currentRolls.map((r, idx) => ({
        ...r,
        rollIndex: idx + 1,
        rollCode: r.rollCode && r.rollCode.startsWith('C-') ? `C-${String(idx + 1).padStart(2, '0')}` : (r.rollCode || `C-${String(idx + 1).padStart(2, '0')}`),
      }));

      line.rollCount = reindexedRolls.reduce((sum, r) => sum + (Number(r.rollQty ?? 1) || 0), 0);
      line.rollDetails = reindexedRolls;
      line.contractedQty = reindexedRolls.reduce(
        (sum, r) => sum + (Number(r.rollQty ?? 1) || 0) * (Number(r.lengthMeters) || 0),
        0
      );
      updated[matIndex] = line;

      const nextBatches = buildBatches(
        prev.inboundBatchesCount || (prev.inboundBatches?.length || 2),
        updated,
        prev.effectiveFrom,
        prev.effectiveTo,
        prev.inboundBatches
      );

      return {
        ...prev,
        contractedMaterials: updated,
        inboundBatches: nextBatches,
      };
    });
  };

  // Cập nhật thuộc tính của 1 dòng cuộn vải (số lượng cuộn, chiều dài mét, ghi chú)
  const handleRollDetailChange = (matIndex, rollIdx, rollField, val) => {
    setContractForm((prev) => {
      const updated = [...prev.contractedMaterials];
      const line = { ...updated[matIndex] };
      const currentRolls = Array.isArray(line.rollDetails) ? [...line.rollDetails] : [];

      if (!currentRolls[rollIdx]) return prev;

      let parsedVal = val;
      if (rollField === 'lengthMeters') {
        parsedVal = val === '' ? '' : Math.max(0, Number(val));
      } else if (rollField === 'rollQty') {
        parsedVal = val === '' ? '' : Math.max(1, Math.floor(Number(val) || 1));
      }

      currentRolls[rollIdx] = {
        ...currentRolls[rollIdx],
        [rollField]: parsedVal,
      };

      line.rollDetails = currentRolls;
      if (rollField === 'lengthMeters' || rollField === 'rollQty') {
        line.rollCount = currentRolls.reduce((sum, r) => sum + (Number(r.rollQty ?? 1) || 0), 0);
        line.contractedQty = currentRolls.reduce(
          (sum, r) => sum + (Number(r.rollQty ?? 1) || 0) * (Number(r.lengthMeters) || 0),
          0
        );
      }
      updated[matIndex] = line;

      let nextBatches = prev.inboundBatches;
      if (rollField === 'lengthMeters' || rollField === 'rollQty') {
        nextBatches = buildBatches(
          prev.inboundBatchesCount || (prev.inboundBatches?.length || 2),
          updated,
          prev.effectiveFrom,
          prev.effectiveTo,
          []
        );
      }

      return {
        ...prev,
        contractedMaterials: updated,
        inboundBatches: nextBatches,
      };
    });
  };

  const handleAddMaterialLine = () => {
    setContractErrors((prev) => {
      const next = { ...prev };
      delete next.contractedMaterials;
      if (next.materialLines) {
        const shiftedLines = {};
        Object.keys(next.materialLines).forEach((k) => {
          shiftedLines[Number(k) + 1] = next.materialLines[k];
        });
        next.materialLines = shiftedLines;
      }
      return next;
    });

    const defaultMat = availableMaterialsForSupplier[0] || null;
    setContractForm((prev) => {
      // Ưu tiên đưa dòng nguyên phụ liệu mới thêm lên trên đầu danh sách
      const nextMaterials = [
        createEmptyMaterialLine(defaultMat),
        ...prev.contractedMaterials,
      ];
      // Dịch chuyển expectedItems tương ứng trong các đợt giao để giữ nguyên phân bổ của các dòng cũ
      const shiftedBatches = (prev.inboundBatches || []).map((b) => ({
        ...b,
        expectedItems: [null, ...(b.expectedItems || [])],
      }));
      const nextBatches = buildBatches(
        prev.inboundBatchesCount || (prev.inboundBatches?.length || 2),
        nextMaterials,
        prev.effectiveFrom,
        prev.effectiveTo,
        shiftedBatches
      );
      return {
        ...prev,
        contractedMaterials: nextMaterials,
        inboundBatches: nextBatches,
      };
    });
  };

  const handleRemoveMaterialLine = (index) => {
    if (contractForm.contractedMaterials.length <= 1) return;
    setContractErrors((prev) => {
      const next = { ...prev };
      if (next.materialLines) {
        const reindexed = {};
        Object.keys(next.materialLines).forEach((k) => {
          const numK = Number(k);
          if (numK < index) reindexed[numK] = next.materialLines[k];
          else if (numK > index) reindexed[numK - 1] = next.materialLines[k];
        });
        next.materialLines = reindexed;
      }
      return next;
    });

    setContractForm((prev) => {
      const nextMaterials = prev.contractedMaterials.filter((_, i) => i !== index);
      const filteredBatches = (prev.inboundBatches || []).map((b) => ({
        ...b,
        expectedItems: (b.expectedItems || []).filter((_, i) => i !== index),
      }));
      const nextBatches = buildBatches(
        prev.inboundBatchesCount || (prev.inboundBatches?.length || 2),
        nextMaterials,
        prev.effectiveFrom,
        prev.effectiveTo,
        filteredBatches
      );
      return {
        ...prev,
        contractedMaterials: nextMaterials,
        inboundBatches: nextBatches,
      };
    });
  };

  // UC: Kế hoạch Lịch trình Tiếp nhận Nguyên vật liệu (Inbound Delivery Schedule Handlers)
  const handleInboundBatchesCountChange = (newCount) => {
    if (newCount === '') {
      setContractForm((prev) => ({
        ...prev,
        inboundBatchesCount: '',
      }));
      return;
    }
    const c = Math.max(1, Math.min(24, Math.floor(Number(newCount) || 1)));
    setContractErrors((prev) => {
      const next = { ...prev };
      delete next.inboundBatches;
      delete next.inboundBatchErrors;
      return next;
    });
    setContractForm((prev) => {
      const updatedBatches = buildBatches(
        c,
        prev.contractedMaterials,
        prev.effectiveFrom,
        prev.effectiveTo,
        []
      );
      return {
        ...prev,
        inboundBatchesCount: c,
        inboundBatches: updatedBatches,
      };
    });
  };

  const handleRemoveInboundBatch = (bIdxToRemove) => {
    setContractForm((prev) => {
      const currentLen = (prev.inboundBatches || []).length;
      if (currentLen <= 1) return prev;
      const nextCount = currentLen - 1;
      const updatedBatches = buildBatches(
        nextCount,
        prev.contractedMaterials,
        prev.effectiveFrom,
        prev.effectiveTo,
        []
      );
      return {
        ...prev,
        inboundBatchesCount: nextCount,
        inboundBatches: updatedBatches,
      };
    });
    setContractErrors((prev) => {
      const next = { ...prev };
      delete next.inboundBatches;
      delete next.inboundBatchErrors;
      return next;
    });
  };

  const handleInboundBatchFieldChange = (bIdx, field, value) => {
    setContractForm((prev) => {
      const next = [...(prev.inboundBatches || [])];
      if (!next[bIdx]) return prev;
      next[bIdx] = { ...next[bIdx], [field]: value };
      return {
        ...prev,
        inboundBatches: next,
      };
    });

    if (contractErrors.inboundBatchErrors?.[bIdx]?.[field]) {
      setContractErrors((prev) => {
        const nextBatchErrors = { ...prev.inboundBatchErrors };
        delete nextBatchErrors[bIdx][field];
        if (Object.keys(nextBatchErrors[bIdx]).length === 0) {
          delete nextBatchErrors[bIdx];
        }
        return { ...prev, inboundBatchErrors: nextBatchErrors };
      });
    }
  };

  const handleInboundBatchItemQtyChange = (bIdx, itemIdx, value) => {
    const rawVal = value === '' ? '' : Math.max(0, Number(value));
    setContractForm((prev) => {
      const next = (prev.inboundBatches || []).map((b) => ({
        ...b,
        expectedItems: (b.expectedItems || []).map((it) => ({ ...it })),
      }));
      if (!next[bIdx] || !next[bIdx].expectedItems[itemIdx]) return prev;

      next[bIdx].expectedItems[itemIdx].plannedQty = rawVal;

      // Tự động điền số lượng còn thiếu cho đợt cuối cùng (áp dụng cho mọi số đợt >= 2)
      if (next.length >= 2 && rawVal !== '') {
        const lastIdx = next.length - 1;
        const contractedQty = Number(next[bIdx].expectedItems[itemIdx].contractedQty || 0);
        if (bIdx < lastIdx) {
          const sumBeforeLast = next
            .slice(0, lastIdx)
            .reduce((sum, b) => sum + (Number(b.expectedItems[itemIdx]?.plannedQty) || 0), 0);
          const remainingForLast = Math.max(0, contractedQty - sumBeforeLast);
          if (next[lastIdx]?.expectedItems[itemIdx]) {
            next[lastIdx].expectedItems[itemIdx].plannedQty = remainingForLast;
          }
        } else if (next.length === 2 && bIdx === 1) {
          const autoBalQty = Math.max(0, contractedQty - Number(rawVal));
          if (next[0]?.expectedItems[itemIdx]) {
            next[0].expectedItems[itemIdx].plannedQty = autoBalQty;
          }
        }
      }

      // Cập nhật lại % tỷ lệ của tất cả các đợt tương ứng
      const totalContractQty = next[0].expectedItems.reduce(
        (sum, it) => sum + (Number(it.contractedQty) || 0),
        0
      );
      if (totalContractQty > 0) {
        let sumPctBeforeLast = 0;
        next.forEach((b, idx) => {
          if (idx < next.length - 1) {
            const bQty = b.expectedItems.reduce(
              (sum, it) => sum + (Number(it.plannedQty) || 0),
              0
            );
            const pct = Number(((bQty / totalContractQty) * 100).toFixed(1));
            b.batchPercentage = pct;
            sumPctBeforeLast += pct;
          } else {
            b.batchPercentage = Number(Math.max(0, 100 - sumPctBeforeLast).toFixed(1));
          }
        });
      }

      return {
        ...prev,
        inboundBatches: next,
      };
    });

    setContractErrors((prev) => {
      const nextErrors = { ...prev };
      delete nextErrors.inboundBatches;
      if (nextErrors.inboundBatchErrors?.[bIdx]?.itemErrors?.[itemIdx]) {
        const nextBatchErrors = { ...nextErrors.inboundBatchErrors };
        delete nextBatchErrors[bIdx].itemErrors[itemIdx];
        const lastIdx = (contractForm.inboundBatches?.length || 1) - 1;
        if (nextBatchErrors[lastIdx]?.itemErrors?.[itemIdx]) {
          delete nextBatchErrors[lastIdx].itemErrors[itemIdx];
        }
        nextErrors.inboundBatchErrors = nextBatchErrors;
      }
      return nextErrors;
    });
  };

  // Chọn/bỏ chọn cuộn vải hoặc cập nhật số lượng cuộn giao cho từng đợt nhập trong Hợp đồng
  const handleContractBatchRollQtyChange = (bIdx, itemIdx, targetRoll, newRollQty) => {
    setContractForm((prev) => {
      const next = (prev.inboundBatches || []).map((b) => ({
        ...b,
        expectedItems: (b.expectedItems || []).map((it) => ({
          ...it,
          selectedRolls: Array.isArray(it.selectedRolls) ? it.selectedRolls.map((sr) => ({ ...sr })) : [],
        })),
      }));

      if (!next[bIdx] || !next[bIdx].expectedItems[itemIdx]) return prev;

      const targetItem = next[bIdx].expectedItems[itemIdx];
      const allRolls = targetItem.allRolls || prev.contractedMaterials?.[itemIdx]?.rollDetails || [];
      const rollKey = targetRoll.rollCode || `R-${targetRoll.rollIndex}`;
      const masterRoll = allRolls.find((r) => (r.rollCode || `R-${r.rollIndex}`) === rollKey) || targetRoll;
      const totalRollQty = Math.max(1, Math.floor(Number(masterRoll.rollQty ?? 1) || 1));
      const desiredQty =
        newRollQty === ''
          ? 0
          : Math.max(0, Math.min(totalRollQty, Math.floor(Number(newRollQty) || 0)));

      // Cập nhật số lượng cuộn trong đợt hiện tại bIdx
      targetItem.selectedRolls = targetItem.selectedRolls.filter(
        (r) => (r.rollCode || `R-${r.rollIndex}`) !== rollKey
      );
      if (desiredQty > 0) {
        targetItem.selectedRolls.push({
          ...masterRoll,
          rollQty: desiredQty,
        });
      }

      // Đảm bảo tổng số cuộn của loại này ở các đợt trước đợt cuối không vượt quá totalRollQty
      const lastBIdx = next.length - 1;
      if (lastBIdx > 0 && bIdx < lastBIdx) {
        let remainingAllowedOther = Math.max(0, totalRollQty - desiredQty);
        for (let b = 0; b < lastBIdx; b++) {
          if (b === bIdx) continue;
          const bRolls = next[b].expectedItems[itemIdx]?.selectedRolls || [];
          const foundIdx = bRolls.findIndex((r) => (r.rollCode || `R-${r.rollIndex}`) === rollKey);
          if (foundIdx >= 0) {
            const curQ = Math.max(0, Math.floor(Number(bRolls[foundIdx].rollQty ?? 1) || 0));
            const clampedQ = Math.min(curQ, remainingAllowedOther);
            remainingAllowedOther = Math.max(0, remainingAllowedOther - clampedQ);
            if (clampedQ <= 0) {
              bRolls.splice(foundIdx, 1);
            } else {
              bRolls[foundIdx] = { ...bRolls[foundIdx], rollQty: clampedQ };
            }
          }
        }
      }

      // ĐỢT CUỐI CÙNG: Auto-fill toàn bộ số cuộn vải còn thiếu chưa được gán ở các đợt trước
      if (lastBIdx >= 0 && allRolls.length > 0) {
        const lastBatchRolls = [];
        allRolls.forEach((r) => {
          const rKey = r.rollCode || `R-${r.rollIndex}`;
          const rTotalQty = Math.max(1, Math.floor(Number(r.rollQty ?? 1) || 1));
          let allocatedBeforeLast = 0;
          for (let b = 0; b < lastBIdx; b++) {
            const match = (next[b].expectedItems[itemIdx]?.selectedRolls || []).find(
              (sr) => (sr.rollCode || `R-${sr.rollIndex}`) === rKey
            );
            if (match) {
              allocatedBeforeLast += Math.max(0, Math.floor(Number(match.rollQty ?? 1) || 0));
            }
          }
          const remRollQty = lastBIdx === 0 ? rTotalQty : Math.max(0, rTotalQty - allocatedBeforeLast);
          if (remRollQty > 0) {
            lastBatchRolls.push({
              ...r,
              rollQty: remRollQty,
            });
          }
        });
        if (next[lastBIdx].expectedItems[itemIdx]) {
          next[lastBIdx].expectedItems[itemIdx].selectedRolls = lastBatchRolls;
        }
      }

      // Cập nhật plannedQty và rollCount cho tất cả các đợt đối với mặt hàng này
      next.forEach((b) => {
        const it = b.expectedItems[itemIdx];
        if (it && allRolls.length > 0) {
          it.plannedQty = (it.selectedRolls || []).reduce(
            (sum, r) => sum + (Number(r.rollQty ?? 1) || 0) * (Number(r.lengthMeters) || 0),
            0
          );
          it.rollCount = (it.selectedRolls || []).reduce(
            (sum, r) => sum + (Number(r.rollQty ?? 1) || 0),
            0
          );
        }
      });

      // Cập nhật lại batchPercentage cho các đợt
      const totalContractQty = next[0].expectedItems.reduce(
        (sum, it) => sum + (Number(it.contractedQty) || 0),
        0
      );
      if (totalContractQty > 0) {
        let sumPctBeforeLast = 0;
        next.forEach((b, idx) => {
          if (idx < next.length - 1) {
            const bQty = b.expectedItems.reduce(
              (sum, it) => sum + (Number(it.plannedQty) || 0),
              0
            );
            const pct = Number(((bQty / totalContractQty) * 100).toFixed(1));
            b.batchPercentage = pct;
            sumPctBeforeLast += pct;
          } else {
            b.batchPercentage = Number(Math.max(0, 100 - sumPctBeforeLast).toFixed(1));
          }
        });
      }

      return {
        ...prev,
        inboundBatches: next,
      };
    });

    setContractErrors((prev) => {
      const nextErrors = { ...prev };
      delete nextErrors.inboundBatches;
      return nextErrors;
    });
  };

  const handleToggleContractBatchRoll = (bIdx, itemIdx, targetRoll) => {
    const batch = contractForm.inboundBatches?.[bIdx];
    const targetItem = batch?.expectedItems?.[itemIdx];
    const allRolls = targetItem?.allRolls || contractForm.contractedMaterials?.[itemIdx]?.rollDetails || [];
    const rollKey = targetRoll.rollCode || `R-${targetRoll.rollIndex}`;
    const masterRoll = allRolls.find((r) => (r.rollCode || `R-${r.rollIndex}`) === rollKey) || targetRoll;
    const totalRollQty = Math.max(1, Math.floor(Number(masterRoll.rollQty ?? 1) || 1));
    const currentSelected = (targetItem?.selectedRolls || []).find(
      (r) => (r.rollCode || `R-${r.rollIndex}`) === rollKey
    );
    const isCurrentlySelected = Boolean(currentSelected && Number(currentSelected.rollQty ?? 1) > 0);

    // Nếu đang chọn thì bỏ chọn (0), nếu chưa chọn thì gán mặc định toàn bộ số cuộn của dòng này vào đợt bIdx
    handleContractBatchRollQtyChange(bIdx, itemIdx, targetRoll, isCurrentlySelected ? 0 : totalRollQty);
  };

  const handleAutoBalanceInboundBatches = () => {
    setContractForm((prev) => {
      const count = prev.inboundBatchesCount || 2;
      const freshBatches = buildBatches(
        count,
        prev.contractedMaterials,
        prev.effectiveFrom,
        prev.effectiveTo,
        []
      );
      return {
        ...prev,
        inboundBatches: freshBatches,
      };
    });
    setContractErrors((prev) => {
      const next = { ...prev };
      delete next.inboundBatches;
      delete next.inboundBatchErrors;
      return next;
    });
    setFeedback({
      type: 'success',
      text: `Đã tự động cân bằng số lượng đều nhau cho ${contractForm.inboundBatchesCount || 2} đợt giao hàng.`,
    });
  };

  // Đối soát cân đối giữa Tổng cam kết trên Hợp đồng và Tổng các đợt đã phân bổ (khớp chính xác theo từng dòng mIdx)
  const inboundAllocationBalance = useMemo(() => {
    if (!Array.isArray(contractForm.contractedMaterials) || contractForm.contractedMaterials.length === 0) {
      return [];
    }

    return contractForm.contractedMaterials.map((mat, mIdx) => {
      const rawIdStr = String(mat.rawMaterialId?._id || mat.rawMaterialId?.id || mat.rawMaterialId || mIdx);
      const contractedQty = Number(mat.contractedQty || 0);

      const totalAllocated = (contractForm.inboundBatches || []).reduce((sum, b) => {
        const item =
          b.expectedItems?.[mIdx] ||
          (b.expectedItems || []).find(
            (i) =>
              String(i.rawMaterialId?._id || i.rawMaterialId?.id || i.rawMaterialId) === rawIdStr &&
              (i.unit || '') === (mat.unitSnapshot || mat.rawMaterialId?.unit || '')
          );
        return sum + (Number(item?.plannedQty) || 0);
      }, 0);

      const diff = Number((contractedQty - totalAllocated).toFixed(4));
      const isBalanced = Math.abs(diff) < 0.001;

      return {
        rawMaterialId: rawIdStr,
        materialCode: mat.materialCodeSnapshot || mat.rawMaterialId?.materialCode || `NVL-${mIdx + 1}`,
        materialName: mat.materialNameSnapshot || mat.rawMaterialId?.materialName || 'Nguyên phụ liệu',
        unit: mat.unitSnapshot || mat.rawMaterialId?.unit || 'METER',
        contractedQty,
        totalAllocated,
        diff,
        isBalanced,
      };
    });
  }, [contractForm.contractedMaterials, contractForm.inboundBatches]);

  const [highlightedMismatchItem, setHighlightedMismatchItem] = useState(null);

  // Cuộn đến đúng dòng nguyên phụ liệu đang bị lệch số lượng trong các đợt giao
  const handleScrollToMismatchItem = (targetItemIdx) => {
    const itemIdx =
      targetItemIdx !== undefined
        ? targetItemIdx
        : inboundAllocationBalance.findIndex((b) => !b.isBalanced);
    if (itemIdx < 0) return;

    const batchesList = contractForm.inboundBatches || [];
    const contractedQty = Number(contractForm.contractedMaterials?.[itemIdx]?.contractedQty || 0);

    // Tìm đợt giao có sai lệch hoặc đợt đầu tiên cho phép người dùng chỉnh sửa
    let targetBatchIdx = batchesList.findIndex((b, bIdx) => {
      if (contractErrors.inboundBatchErrors?.[bIdx]?.itemErrors?.[itemIdx]) return true;
      const q = Number(b.expectedItems?.[itemIdx]?.plannedQty || 0);
      return q > contractedQty || q < 0;
    });
    if (targetBatchIdx < 0) {
      targetBatchIdx = 0;
    }

    setHighlightedMismatchItem({ batchIdx: targetBatchIdx, itemIdx });

    const rowEl =
      document.getElementById(`contract-batch-row-${targetBatchIdx}-item-${itemIdx}`) ||
      document.getElementById(`contract-batch-row-0-item-${itemIdx}`);
    if (rowEl) {
      rowEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    setTimeout(() => {
      const inputEl =
        document.getElementById(`contract-batch-input-${targetBatchIdx}-item-${itemIdx}`) ||
        document.getElementById(`contract-batch-input-0-item-${itemIdx}`);
      if (inputEl && !inputEl.readOnly) {
        inputEl.focus();
        if (typeof inputEl.select === 'function') inputEl.select();
      }
    }, 300);

    setTimeout(() => {
      setHighlightedMismatchItem((prev) =>
        prev?.itemIdx === itemIdx ? null : prev
      );
    }, 3500);
  };

  const startNewContractDraft = () => {
    setEditingContractId(null);
    setIsAmendingActive(false);
    setSourceActiveContract(null);
    setContractErrors({});
    setFeedback(null);
    const defaultLines =
      materialsCatalog.length > 0
        ? [createEmptyMaterialLine(materialsCatalog[0])]
        : [createEmptyMaterialLine()];
    const initialBatches = buildBatches(
      2,
      defaultLines,
      todayIso,
      sixMonthsLaterIso
    );
    setContractForm((prev) => ({
      ...prev,
      contractCode: `HDK-2026-${String(contracts.length + 1).padStart(3, '0')}`,
      contractTitle:
        'Khung hợp đồng Cung ứng Vải & Nguyên Phụ Liệu May Mặc Năm 2026',
      status: 'DRAFT_FRAMEWORK',
      versionNumber: 1,
      isNewVersion: false,
      amendmentReason: '',
      parentSupersededContractId: null,
      commercialTerms: {
        ...prev.commercialTerms,
        depositPercent: 30,
        paymentInstallmentsCount: 2,
        paymentSchedule: buildPaymentSchedule(
          2,
          30,
          [],
          todayIso,
          sixMonthsLaterIso,
          false
        ),
      },
      contractedMaterials: defaultLines,
      inboundBatchesCount: 2,
      inboundBatches: initialBatches,
    }));
    setActiveTab('DRAFT_FORM');
  };

  const handleEditExistingContract = async (contractOrTarget) => {
    let contract = contractOrTarget;
    const contractId = contract?._id || contract?.id || contractOrTarget;

    // Tự động tải bản ghi chi tiết đầy đủ nhất của hợp đồng nếu cần
    if (typeof contractOrTarget === 'string' || !contract?.contractedMaterials || !contract?.commercialTerms) {
      try {
        const detail = await accountantProcurementApi.getContractDetail(contractId);
        if (detail) contract = detail;
      } catch (err) {
        console.warn('Không thể tải chi tiết hợp đồng, dùng dữ liệu có sẵn:', err);
      }
    }

    // Chỉ có DRAFT_FRAMEWORK mới là bản thảo được sửa đè; mọi trạng thái khác đều phải tạo version mới
    const isContractActive = contract.status !== 'DRAFT_FRAMEWORK';
    setEditingContractId(contractId);
    setContractErrors({});
    setFeedback(null);

    const baseCode = (contract.contractCode || 'HDK-2026-001').replace(/-V\d+$/i, '');
    const currentVer = Number(contract.versionNumber) || 1;
    const nextVer = isContractActive ? currentVer + 1 : currentVer;
    const nextCode = isContractActive ? `${baseCode}-V${nextVer}` : (contract.contractCode || '');

    setIsAmendingActive(isContractActive);
    setSourceActiveContract(isContractActive ? contract : null);

    // GIỮ NGUYÊN TOÀN BỘ GIÁ TRỊ ĐÃ NHẬP TỪ HỢP ĐỒNG GỐC (V1)
    const resolvedSigningDate = contract.signingDate
      ? new Date(contract.signingDate).toISOString().slice(0, 10)
      : todayIso;
    const resolvedEffFrom = contract.effectiveFrom
      ? new Date(contract.effectiveFrom).toISOString().slice(0, 10)
      : todayIso;
    const resolvedEffTo = contract.effectiveTo
      ? new Date(contract.effectiveTo).toISOString().slice(0, 10)
      : sixMonthsLaterIso;

    const resolvedDepositPct = Number(contract.commercialTerms?.depositPercent ?? 30);
    const existingSchedule = Array.isArray(contract.commercialTerms?.paymentSchedule)
      ? contract.commercialTerms.paymentSchedule
      : [];
    const resolvedInstallmentsCount =
      resolvedDepositPct >= 100
        ? 0
        : Number(
            contract.commercialTerms?.paymentInstallmentsCount ||
              existingSchedule.length ||
              2
          );

    // Giữ nguyên các lần thanh toán đã thiết lập ở v1
    const resolvedSchedule = existingSchedule.length > 0
      ? existingSchedule.map((inst, idx) => ({
          installmentNumber: inst.installmentNumber || idx + 1,
          installmentTitle: inst.installmentTitle || `Đợt ${idx + 1}: Thanh toán tiền hàng`,
          paymentPercent: inst.paymentPercent ?? 0,
          paymentAmount: inst.paymentAmount ?? 0,
          dueDate: inst.dueDate
            ? new Date(inst.dueDate).toISOString().slice(0, 10)
            : resolvedEffFrom,
          paymentMilestone: inst.paymentMilestone || 'GIAO_HANG_THANH_CONG',
          notes: inst.notes || '',
        }))
      : buildPaymentSchedule(
          resolvedInstallmentsCount,
          resolvedDepositPct,
          existingSchedule,
          resolvedEffFrom,
          resolvedEffTo,
          false
        );

    // Load và giữ nguyên kế hoạch lịch trình tiếp nhận hiện có của Hợp đồng v1
    const existingPlan = contract.latestInboundPlan || contract.inboundPlans?.[0];
    const existingBatchesFromPlan = existingPlan?.batches?.length > 0
      ? existingPlan.batches.map((b, idx) => ({
          batchNumber: b.batchNumber || idx + 1,
          totalBatches: existingPlan.batches.length,
          batchTitle: b.batchTitle || `Đợt ${idx + 1}: Tiếp nhận nguyên liệu`,
          batchPercentage: b.batchPercentage || Number((100 / existingPlan.batches.length).toFixed(1)),
          scheduledDeliveryDate: b.scheduledDeliveryDate
            ? new Date(b.scheduledDeliveryDate).toISOString().slice(0, 10)
            : resolvedEffFrom,
          notes: b.notes || '',
          expectedItems: (b.expectedItems || []).map((it) => ({
            rawMaterialId: it.rawMaterialId?._id || it.rawMaterialId?.id || it.rawMaterialId,
            materialCode: it.rawMaterialId?.materialCode || it.materialCodeSnapshot || 'NVL',
            materialName: it.rawMaterialId?.materialName || it.materialNameSnapshot || '',
            unit: it.unitSnapshot || it.unit || 'METER',
            plannedQty: it.plannedQty || 0,
            contractedQty: (contract.contractedMaterials || []).find(
              (cm) => String(cm.rawMaterialId?._id || cm.rawMaterialId) === String(it.rawMaterialId?._id || it.rawMaterialId)
            )?.contractedQty || it.plannedQty || 0,
          })),
        }))
      : buildBatches(
          2,
          contract.contractedMaterials || [],
          resolvedEffFrom,
          resolvedEffTo
        );

    setContractForm({
      contractCode: nextCode,
      contractTitle: isContractActive
        ? `${contract.contractTitle?.replace(/\s*\(Phụ lục.*\)/i, '') || 'Khung hợp đồng cung ứng'} (Phụ lục v${nextVer})`
        : (contract.contractTitle ||
          `Hợp đồng cung ứng nguyên phụ liệu – ${contract.supplierId?.supplierName || ''}`),
      contractType: contract.contractType || 'FRAMEWORK_AGREEMENT',
      signingDate: resolvedSigningDate,
      effectiveFrom: resolvedEffFrom,
      effectiveTo: resolvedEffTo,
      supplierId: contract.supplierId?._id || contract.supplierId?.id || contract.supplierId || '',
      status: 'DRAFT_FRAMEWORK',
      versionNumber: nextVer,
      isNewVersion: isContractActive,
      amendmentReason: isContractActive
        ? (contract.amendmentReason || `Điều chỉnh phụ lục tiến độ & quy cách nguyên phụ liệu (Phiên bản v${nextVer})`)
        : (contract.amendmentReason || ''),
      parentSupersededContractId: isContractActive
        ? contractId
        : (contract.parentSupersededContractId?._id || contract.parentSupersededContractId || null),
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
        depositPercent: resolvedDepositPct,
        paymentMethod: contract.commercialTerms?.paymentMethod || 'BANK_TRANSFER',
        paymentCreditDays: contract.commercialTerms?.paymentCreditDays ?? 30,
        paymentInstallmentsCount: resolvedInstallmentsCount,
        paymentSchedule: resolvedSchedule,
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
      breachPenaltyClause: contract.breachPenaltyClause || 'Bên B cam kết bồi thường 100% thiệt hại nếu giao thiếu, chậm hoặc lỗi chất lượng nguyên phụ liệu so với thỏa thuận.',
      disputeResolutionClause:
        contract.disputeResolutionClause ||
        'Mọi tranh chấp phát sinh được ưu tiên giải quyết qua thương lượng trên cơ sở Biên bản KCS thực tế tại kho Bên A.',
      notes: contract.notes || '',
      contractedMaterials: (contract.contractedMaterials || []).map((m) => {
        const matId = String(m.rawMaterialId?._id || m.rawMaterialId?.id || m.rawMaterialId || '');
        const foundCatalogMat = materialsCatalog.find(
          (cat) => String(cat._id || cat.id) === matId
        );
        const isFabric =
          isRollFabricLine(m) ||
          isRollFabricLine(foundCatalogMat) ||
          isRollFabricLine(m.rawMaterialId) ||
          m.category === 'FABRIC_ROLL' ||
          m.materialType === 'FABRIC' ||
          ['METER', 'MET', 'M', 'ROLL', 'YARD', 'KG'].includes(String(m.unitSnapshot || m.rawMaterialId?.unit || foundCatalogMat?.unit).toUpperCase()) ||
          String(m.materialNameSnapshot || m.rawMaterialId?.materialName || foundCatalogMat?.materialName || '').toLowerCase().includes('vải') ||
          String(m.materialNameSnapshot || m.rawMaterialId?.materialName || foundCatalogMat?.materialName || '').toLowerCase().includes('thun');

        const category =
          m.category ||
          m.rawMaterialId?.category ||
          foundCatalogMat?.category ||
          (isFabric ? 'FABRIC_ROLL' : 'AUXILIARY');

        const materialType =
          m.materialType ||
          m.rawMaterialId?.materialType ||
          foundCatalogMat?.materialType ||
          (isFabric ? 'FABRIC' : 'AUXILIARY');

        let rawRolls = Array.isArray(m.rollDetails) && m.rollDetails.length > 0 ? m.rollDetails : [];
        if (isFabric && rawRolls.length === 0) {
          rawRolls = [
            {
              rollIndex: 1,
              rollCode: 'C-01',
              rollQty: 1,
              lengthMeters: Number(m.contractedQty) || 100,
              weightKg: Number(m.contractedQty) || 0,
              note: '',
            },
          ];
        }

        return {
          rawMaterialId: matId,
          materialCodeSnapshot:
            m.materialCodeSnapshot || m.rawMaterialId?.materialCode || foundCatalogMat?.materialCode || '',
          materialNameSnapshot:
            m.materialNameSnapshot || m.rawMaterialId?.materialName || foundCatalogMat?.materialName || '',
          category,
          materialType,
          unitSnapshot: m.unitSnapshot || m.rawMaterialId?.unit || foundCatalogMat?.unit || (isFabric ? 'METER' : 'CAI'),
          composition: m.composition || m.rawMaterialId?.composition || foundCatalogMat?.composition || '100% Combed Cotton Compact',
          colorSpec: m.colorSpec || m.rawMaterialId?.color || foundCatalogMat?.color || 'Trắng Sữa',
          widthCm: m.widthCm ?? m.rawMaterialId?.widthCm ?? foundCatalogMat?.widthCm ?? 160,
          gsm: m.gsm ?? m.rawMaterialId?.gsm ?? foundCatalogMat?.gsm ?? 210,
          shrinkageTolerancePct: m.shrinkageTolerancePct ?? 2.5,
          colorFastnessGrade: m.colorFastnessGrade || 'Grade 4.0 (ISO 105)',
          qtyTolerancePct: m.qtyTolerancePct ?? 3,
          moq: m.moq ?? 100,
          leadTimeDays: m.leadTimeDays ?? 7,
          contractedQty: m.contractedQty || (isFabric ? 100 : 100),
          unitPrice: m.unitPrice || foundCatalogMat?.unitCost || 0,
          vatRatePct: m.vatRatePct ?? contract.commercialTerms?.vatRatePct ?? 8,
          packagingSpec:
            m.packagingSpec ||
            'Cuộn bọc nilon 2 lớp chống ẩm, lõi ống giấy cứng, dán tem Barcode từng cây vải',
          technicalNote: m.technicalNote || '',
          rollCount: rawRolls.reduce((sum, r) => sum + (Number(r.rollQty ?? 1) || 0), 0),
          rollDetails: rawRolls.map((r, rIdx) => ({
            rollIndex: r.rollIndex || rIdx + 1,
            rollCode: r.rollCode || `C-${String(rIdx + 1).padStart(2, '0')}`,
            rollQty: r.rollQty || 1,
            lengthMeters: r.lengthMeters ?? (Number(m.contractedQty) || 100),
            weightKg: r.weightKg ?? 0,
            note: r.note || '',
          })),
        };
      }),
      inboundBatchesCount: existingBatchesFromPlan.length,
      inboundBatches: existingBatchesFromPlan,
    });
    setActiveTab('DRAFT_FORM');
  };

  const handleOpenVersionHistory = async (contract) => {
    const contractId = contract._id || contract.id;
    setHistoryModalContract(contract);
    setLoadingVersions(true);
    try {
      const versions = await accountantProcurementApi.getContractVersions(contractId);
      setContractVersionsList(versions);
    } catch (err) {
      console.error(err);
      setContractVersionsList([contract]);
    } finally {
      setLoadingVersions(false);
    }
  };

  const handleSaveContract = async (e) => {
    e.preventDefault();
    console.log('[ContractFrameworkPage] handleSaveContract called', { contractForm });
    const { isValid, errors } = validateContractForm(contractForm);
    console.log('[ContractFrameworkPage] Validation result:', { isValid, errors });
    if (!isValid) {
      console.warn('[ContractFrameworkPage] Validation errors:', errors);
      setContractErrors(errors);
      const errorList = [];
      Object.entries(errors).forEach(([k, v]) => {
        if (typeof v === 'string') errorList.push(v);
        else if (k === 'materialLines') {
          Object.values(v).forEach((lineErrs) => {
            Object.values(lineErrs).forEach((msg) => errorList.push(msg));
          });
        } else if (k === 'paymentScheduleLines') {
          Object.values(v).forEach((lineErrs) => {
            Object.values(lineErrs).forEach((msg) => errorList.push(msg));
          });
        } else if (k === 'inboundBatchErrors') {
          Object.values(v).forEach((bErrs) => {
            if (bErrs.scheduledDeliveryDate) errorList.push(bErrs.scheduledDeliveryDate);
            if (bErrs.itemErrors) Object.values(bErrs.itemErrors).forEach((msg) => errorList.push(msg));
          });
        }
      });

      setFeedback({
        type: 'error',
        text: `Vui lòng hoàn tất các thông tin bắt buộc còn thiếu (${errorList.length} mục) trước khi lưu:`,
        errorList,
      });

      setTimeout(() => {
        const firstErrorEl = document.querySelector('.has-error, .wms-field-error-text');
        if (firstErrorEl) {
          firstErrorEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
      return;
    }

    const isCreatingVersion =
      isAmendingActive ||
      Boolean(contractForm.isNewVersion) ||
      Boolean(contractForm.createVersion) ||
      Number(contractForm.versionNumber) > 1 ||
      (sourceActiveContract && sourceActiveContract.status !== 'DRAFT_FRAMEWORK') ||
      (editingContractId &&
        contracts.some(
          (c) =>
            String(c._id || c.id) === String(editingContractId) &&
            c.status !== 'DRAFT_FRAMEWORK'
        ));

    const sanitizedForm = {
      ...contractForm,
      supplierId: contractForm.supplierId?._id || contractForm.supplierId?.id || contractForm.supplierId,
      contractedMaterials: (contractForm.contractedMaterials || []).map((m) => ({
        ...m,
        rawMaterialId: m.rawMaterialId?._id || m.rawMaterialId?.id || m.rawMaterialId,
      })),
      inboundBatches: (contractForm.inboundBatches || []).map((b) => ({
        ...b,
        expectedItems: (b.expectedItems || []).map((it, itIdx) => ({
          ...it,
          itemIndex: it.itemIndex !== undefined && it.itemIndex !== null ? Number(it.itemIndex) : itIdx,
          rawMaterialId: it.rawMaterialId?._id || it.rawMaterialId?.id || it.rawMaterialId,
        })),
      })),
      createVersion: isCreatingVersion,
      isNewVersion: isCreatingVersion,
    };

    try {
      setSubmitting(true);
      setFeedback(null);
      setContractErrors({});
      if (isCreatingVersion) {
        const res = await accountantProcurementApi.amendContract(editingContractId, sanitizedForm);
        setFeedback({ type: 'success', text: res.message });
      } else if (editingContractId) {
        const res = await accountantProcurementApi.updateContract(
          editingContractId,
          sanitizedForm
        );
        setFeedback({ type: 'success', text: res.message });
      } else {
        const res = await accountantProcurementApi.draftContract(sanitizedForm);
        setFeedback({ type: 'success', text: res.message });
      }
      setIsAmendingActive(false);
      setEditingContractId(null);
      setSourceActiveContract(null);
      if (searchParams.has('amendContractId')) {
        const newParams = new URLSearchParams(searchParams);
        newParams.delete('amendContractId');
        setSearchParams(newParams, { replace: true });
      }
      navigate('/accountant/inbound-plans');
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
            Thiết lập hợp đồng mua bán nguyên phụ liệu may mặc với đầy đủ quy cách kỹ thuật dệt may (Khổ vải, GSM, Độ co rút, Độ bền màu, KCS 4-Point System), điều khoản tạm ứng và phạt vi phạm.
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
            className="wms-btn wms-btn-default"
            onClick={() => setShowBlankTemplateModal(true)}
            title="In khung hợp đồng mẫu (bản trống để Owner mang đi ký kết và tự điền tay)"
          >
            <Printer size={16} />
            <span>In khung hợp đồng mẫu</span>
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
        <div className={`wms-feedback-banner ${feedback.type}`} role="alert" style={{ alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600 }}>{feedback.text}</div>
            {Array.isArray(feedback.errorList) && feedback.errorList.length > 0 && (
              <ul style={{ margin: '6px 0 0 0', paddingLeft: '20px', fontSize: '12.5px', lineHeight: '1.6' }}>
                {feedback.errorList.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            )}
          </div>
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
          Danh sách Hợp đồng Nguyên phụ liệu ({contractFamilies.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'DRAFT_FORM'}
          className={`wms-tab-btn ${activeTab === 'DRAFT_FORM' ? 'active' : ''}`}
          onClick={() => setActiveTab('DRAFT_FORM')}
        >
          {isAmendingActive ? <GitBranch size={16} /> : <Plus size={16} />}
          {isAmendingActive
            ? `Tạo Phiên bản mới: ${contractForm.contractCode}`
            : editingContractId
            ? `Chỉnh sửa Hợp đồng: ${contractForm.contractCode}`
            : 'Biểu mẫu Soạn thảo Khung Hợp đồng'}
        </button>
      </div>

      {/* TAB 1: CONTRACT LIST */}
      {activeTab === 'CONTRACT_LIST' && (
        <>
          {/* KPI Summary Strip */}
          <section className="wms-kpi-strip" aria-label="Thống kê khung hợp đồng">
            <div className="wms-kpi-card">
              <span className="wms-kpi-label">Tổng số Hợp đồng</span>
              <span className="wms-kpi-value">{contractKpis.total} hợp đồng</span>
              <span className="wms-kpi-meta">{contractFamilies.length} chuỗi hợp đồng gốc</span>
            </div>

            <div className="wms-kpi-card">
              <span className="wms-kpi-label">Đang có Hiệu lực (ACTIVE)</span>
              <span className="wms-kpi-value" style={{ color: '#16A34A' }}>
                {contractKpis.active} hợp đồng
              </span>
              <span className="wms-kpi-meta">Sẵn sàng lập kế hoạch tiếp nhận</span>
            </div>

            <div className="wms-kpi-card">
              <span className="wms-kpi-label">Cảnh báo Sai lệch KCS</span>
              <span className="wms-kpi-value" style={{ color: '#D97706' }}>
                {contractKpis.deviationFlagged} hợp đồng
              </span>
              <span className="wms-kpi-meta">Cần xử lý: Chấm dứt hoặc Tạo v2</span>
            </div>

            <div className="wms-kpi-card">
              <span className="wms-kpi-label">Đã Chấm dứt / Hết hạn</span>
              <span className="wms-kpi-value" style={{ color: '#E11D48' }}>
                {contractKpis.terminated} hợp đồng
              </span>
              <span className="wms-kpi-meta">Chấm dứt hiệu lực hoặc quá hạn</span>
            </div>
          </section>

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
                  <option value="ACTIVE">Đang hiệu lực (Active)</option>
                  <option value="DEVIATION_FLAGGED">Cảnh báo sai lệch (Deviation Flagged)</option>
                  <option value="DRAFT_FRAMEWORK">Bản thảo khung (Draft)</option>
                  <option value="TERMINATED">Đã chấm dứt (Terminated)</option>
                  <option value="SUPERSEDED">Đã thay thế (Superseded)</option>
                  <option value="COMPLETED">Đã hoàn tất (Completed)</option>
                  <option value="CANCELLED">Đã hủy (Cancelled)</option>
                </select>
              </div>

              <div className="wms-filter-field">
                <label htmlFor="c-sort" className="wms-label">
                  Thứ tự hiển thị
                </label>
                <select
                  id="c-sort"
                  className="wms-select"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                >
                  <option value="NEWEST">Mới nhất trước (Mới → Cũ)</option>
                  <option value="OLDEST">Cũ nhất trước (Cũ → Mới)</option>
                  <option value="AMOUNT_DESC">Giá trị hợp đồng giảm dần</option>
                </select>
              </div>
            </div>
          </section>

          <section className="wms-table-card">
            <div className="wms-table-scroll no-horizontal-scroll">
              <table className="wms-table wms-table-responsive-fit">
                <colgroup>
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '20%' }} />
                  <col style={{ width: '18%' }} />
                  <col style={{ width: '11%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '11%' }} />
                  <col style={{ width: '16%' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>Số HĐ & Phiên bản</th>
                    <th>Đối tác & Tên hợp đồng</th>
                    <th>Nguyên phụ liệu cam kết</th>
                    <th>Thời hạn</th>
                    <th className="wms-td-number">Tổng giá trị</th>
                    <th>Trạng thái</th>
                    <th style={{ textAlign: 'right' }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={7}>Đang tải danh sách hợp đồng...</td>
                    </tr>
                  ) : filteredFamilies.length === 0 ? (
                    <tr>
                      <td colSpan={7}>
                        Chưa có hợp đồng nào khớp với điều kiện tìm kiếm.
                      </td>
                    </tr>
                  ) : (
                    filteredFamilies.map((family, idx) => {
                      const c = family.primaryContract;
                      const contractId = c._id || c.id;
                      const isExpanded = expandedFamilies.has(family.rootId);
                      const badge = CONTRACT_STATUS_BADGE[c.status] || {
                        label: c.status,
                        cls: 'wms-status-pending',
                      };
                      return (
                        <React.Fragment key={family.rootId || contractId || idx}>
                          <tr
                            className={`wms-interactive-row ${family.hasMultipleVersions ? 'wms-row-expandable' : ''} ${isExpanded ? 'wms-row-expanded' : ''}`}
                            onClick={() => {
                              if (family.hasMultipleVersions) {
                                toggleExpandFamily(family.rootId);
                              }
                            }}
                            title={
                              family.hasMultipleVersions
                                ? isExpanded
                                  ? 'Nhấn vào hàng để thu gọn danh sách phiên bản'
                                  : 'Nhấn vào hàng để xem tất cả các phiên bản của hợp đồng này'
                                : undefined
                            }
                          >
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                <span className="wms-code-pill">{family.baseCode}</span>
                                {family.hasMultipleVersions ? (
                                  <button
                                    type="button"
                                    className={`wms-btn-version-pill ${isExpanded ? 'expanded' : ''}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleExpandFamily(family.rootId);
                                    }}
                                    title="Nhấn để xem hoặc ẩn danh sách tất cả các phiên bản"
                                  >
                                    <span>v{c.versionNumber || 1}</span>
                                    <span style={{ opacity: 0.85, fontSize: '10px' }}>({family.totalVersions} pb)</span>
                                    <ChevronDown
                                      size={11}
                                      className={`wms-arrow-icon ${isExpanded ? 'rotated' : ''}`}
                                    />
                                  </button>
                                ) : (
                                  <span className="wms-badge-version">v{c.versionNumber || 1}</span>
                                )}
                              </div>
                              <div className="wms-helper-text" style={{ fontSize: '11px', marginTop: '3px' }}>
                                {CONTRACT_TYPE_LABELS[c.contractType] || 'Hợp đồng mua bán'}
                              </div>
                              {c.latestInboundPlan && (
                                <div style={{ marginTop: '4px' }}>
                                  <span
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '3px',
                                      fontSize: '10.5px',
                                      background: '#E0F2FE',
                                      color: '#0369A1',
                                      padding: '2px 6px',
                                      borderRadius: '4px',
                                      fontWeight: 600,
                                      border: '1px solid #BAE6FD',
                                    }}
                                    title={`Kế hoạch tiếp nhận ${c.latestInboundPlan.planCode} (v${c.latestInboundPlan.versionNumber || 1})`}
                                  >
                                    <Truck size={11} color="#0284C7" />
                                    {c.latestInboundPlan.planCode} (v{c.latestInboundPlan.versionNumber || 1})
                                  </span>
                                </div>
                              )}
                            </td>
                            <td>
                              <div>
                                <strong>{c.supplierId?.supplierName || 'Nhà cung ứng'}</strong>
                                {c.supplierId?.supplierCode && (
                                  <span style={{ fontSize: '11px', color: 'var(--wms-text-light)', marginLeft: '4px' }}>
                                    ({c.supplierId.supplierCode})
                                  </span>
                                )}
                              </div>
                              <div className="wms-helper-text" style={{ fontSize: '11.5px', marginTop: '2px', color: 'var(--wms-text-title)' }}>
                                {c.contractTitle || 'Hợp đồng cung ứng nguyên phụ liệu may mặc'}
                              </div>
                              <div className="wms-helper-text" style={{ fontSize: '11px' }}>
                                MST: {c.supplierId?.taxCode || '—'}
                              </div>
                            </td>
                            <td>
                              {(c.contractedMaterials || []).slice(0, 2).map((item, mIdx) => (
                                <div key={mIdx} className="wms-helper-text" style={{ fontSize: '11.5px', marginBottom: '2px' }}>
                                  • <strong>{item.materialCodeSnapshot || item.rawMaterialId?.materialCode || 'NVL'}</strong>:{' '}
                                  {Number(item.contractedQty || 0).toLocaleString('vi-VN')}{' '}
                                  {item.unitSnapshot || item.rawMaterialId?.unit || 'METER'}
                                  <span style={{ color: 'var(--wms-text-light)', marginLeft: 3 }}>
                                    ({item.widthCm || 160}cm, {item.gsm || 200}g)
                                  </span>
                                </div>
                              ))}
                              {(c.contractedMaterials || []).length > 2 && (
                                <div className="wms-helper-text" style={{ color: 'var(--wms-accent)', fontStyle: 'italic', fontSize: '11px' }}>
                                  + {(c.contractedMaterials.length - 2)} loại NVL khác...
                                </div>
                              )}
                            </td>
                            <td>
                              <div style={{ fontSize: '12px' }}>Ký: {formatDate(c.signingDate || c.createdAt)}</div>
                              <div className="wms-helper-text" style={{ fontSize: '11px', marginTop: '2px' }}>
                                HL: {formatDate(c.effectiveFrom || c.createdAt)} → {formatDate(resolveContractEffectiveTo(c))}
                              </div>
                            </td>
                            <td className="wms-td-number">
                              <div style={{ fontWeight: 700, fontSize: '12.5px' }}>{formatVnd(c.totalContractAmount)}</div>
                              <div className="wms-helper-text" style={{ fontSize: '11px' }}>
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
                              <div
                                className="wms-action-cell"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  className="wms-btn wms-btn-default wms-btn-sm"
                                  onClick={() => setPreviewContract(c)}
                                  title="Xem văn bản Hợp đồng kinh tế"
                                >
                                  <Eye size={13} />
                                  <span>Xem</span>
                                </button>

                                {c.status === 'DEVIATION_FLAGGED' && (
                                  <button
                                    type="button"
                                    className="wms-btn wms-btn-primary wms-btn-sm"
                                    onClick={() => handleEditExistingContract(c)}
                                    title={`Tạo Version mới (v${(c.versionNumber || 1) + 1})`}
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                  >
                                    <GitBranch size={13} />
                                    <span>Tạo v{(c.versionNumber || 1) + 1}</span>
                                  </button>
                                )}

                                {c.status !== 'TERMINATED' && c.status !== 'SUPERSEDED' ? (
                                  <button
                                    type="button"
                                    className="wms-btn wms-btn-danger wms-btn-sm"
                                    style={{
                                      backgroundColor: '#FEF2F2',
                                      color: '#DC2626',
                                      borderColor: '#FCA5A5',
                                      fontWeight: 600,
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                    }}
                                    onClick={() => handleOpenTerminateModal(c)}
                                    title="Chấm dứt hợp đồng này"
                                  >
                                    <Ban size={13} />
                                    <span>Chấm dứt</span>
                                  </button>
                                ) : c.status === 'TERMINATED' ? (
                                  <span
                                    className="wms-status-badge wms-status-rejected"
                                    style={{ fontSize: '11px', padding: '3px 6px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                                    title={c.terminationReason || 'Hợp đồng đã chấm dứt'}
                                  >
                                    <Ban size={11} /> Đã chấm dứt
                                  </span>
                                ) : null}

                                <div className="wms-action-dropdown">
                                  <button
                                    type="button"
                                    className={`wms-btn wms-btn-default wms-btn-sm wms-btn-icon ${activeMenuId === contractId ? 'active' : ''}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setActiveMenuId(activeMenuId === contractId ? null : contractId);
                                    }}
                                    title="Tất cả thao tác"
                                  >
                                    <MoreHorizontal size={14} />
                                  </button>

                                  {activeMenuId === contractId && (
                                    <div className="wms-dropdown-menu">
                                      <button
                                        type="button"
                                        className="wms-dropdown-item"
                                        onClick={() => {
                                          setActiveMenuId(null);
                                          setPreviewContract(c);
                                        }}
                                      >
                                        <Eye size={14} /> Xem Văn bản Hợp đồng
                                      </button>
                                      {c.status === 'ACTIVE' || c.status === 'DEVIATION_FLAGGED' ? (
                                        <button
                                          type="button"
                                          className="wms-dropdown-item"
                                          onClick={() => {
                                            setActiveMenuId(null);
                                            handleEditExistingContract(c);
                                          }}
                                          style={{ color: 'var(--wms-accent)', fontWeight: 600 }}
                                        >
                                          <GitBranch size={14} /> Tạo Version mới (v{(c.versionNumber || 1) + 1})
                                        </button>
                                      ) : (
                                        <button
                                          type="button"
                                          className="wms-dropdown-item"
                                          onClick={() => {
                                            setActiveMenuId(null);
                                            handleEditExistingContract(c);
                                          }}
                                        >
                                          <Edit3 size={14} /> Chỉnh sửa Bản thảo HĐ
                                        </button>
                                      )}
                                      {family.hasMultipleVersions && (
                                        <button
                                          type="button"
                                          className="wms-dropdown-item"
                                          onClick={() => {
                                            setActiveMenuId(null);
                                            toggleExpandFamily(family.rootId);
                                          }}
                                        >
                                          <GitBranch size={14} /> {isExpanded ? 'Ẩn các phiên bản' : `Xem tất cả ${family.totalVersions} phiên bản`}
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        className="wms-dropdown-item"
                                        onClick={() => {
                                          setActiveMenuId(null);
                                          handleOpenVersionHistory(c);
                                        }}
                                      >
                                        <History size={14} /> Lịch sử kiểm toán các phiên bản
                                      </button>
                                      <div className="wms-dropdown-divider" />
                                      {c.status === 'DRAFT_FRAMEWORK' && (
                                        <button
                                          type="button"
                                          className="wms-dropdown-item"
                                          onClick={() => {
                                            setActiveMenuId(null);
                                            handleTransitionStatus(
                                              contractId,
                                              'PENDING_OWNER_APPROVAL'
                                            );
                                          }}
                                        >
                                          <Send size={14} /> Trình Owner phê duyệt
                                        </button>
                                      )}
                                      {(c.status === 'DRAFT_FRAMEWORK' ||
                                        c.status === 'PENDING_OWNER_APPROVAL') && (
                                        <button
                                          type="button"
                                          className="wms-dropdown-item"
                                          onClick={() => {
                                            setActiveMenuId(null);
                                            handleTransitionStatus(contractId, 'ACTIVE');
                                          }}
                                        >
                                          <CheckCircle2 size={14} /> Kích hoạt Hợp đồng
                                        </button>
                                      )}
                                      {c.status !== 'TERMINATED' && c.status !== 'SUPERSEDED' && (
                                        <>
                                          <div className="wms-dropdown-divider" />
                                          <button
                                            type="button"
                                            className="wms-dropdown-item"
                                            style={{ color: '#DC2626', fontWeight: 600 }}
                                            onClick={() => {
                                              setActiveMenuId(null);
                                              handleOpenTerminateModal(c);
                                            }}
                                          >
                                            <Ban size={14} /> Chấm dứt Hợp đồng
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>

                          {/* Expanded sub-table showing all versions in this family */}
                          {isExpanded && (
                            <tr key={`${family.rootId}-subtable`} className="wms-family-subtable-row">
                              <td colSpan={7}>
                                <div className="wms-family-subtable-container">
                                  <div className="wms-family-subtable-title">
                                    <GitBranch size={15} color="var(--wms-accent)" />
                                    <span>
                                      Lịch sử tất cả các phiên bản của Hợp đồng <strong>{family.baseCode}</strong> ({family.totalVersions} phiên bản):
                                    </span>
                                  </div>
                                  <div className="wms-table-scroll">
                                    <table className="wms-nested-table">
                                    <thead>
                                      <tr>
                                        <th style={{ width: '85px' }}>Phiên bản</th>
                                        <th style={{ width: '135px' }}>Mã hợp đồng</th>
                                        <th>Tiêu đề & Nội dung phụ lục điều chỉnh</th>
                                        <th style={{ width: '135px' }}>Trạng thái</th>
                                        <th style={{ width: '135px' }}>Thời hạn</th>
                                        <th className="wms-td-number" style={{ width: '135px' }}>Tổng giá trị</th>
                                        <th style={{ width: '110px', textAlign: 'right' }}>Thao tác</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {family.versions.map((ver) => {
                                        const vBadge = CONTRACT_STATUS_BADGE[ver.status] || {
                                          label: ver.status,
                                          cls: 'wms-status-pending',
                                        };
                                        const vId = ver._id || ver.id;
                                        return (
                                          <tr key={vId}>
                                            <td>
                                              <span className="wms-badge-version">v{ver.versionNumber || 1}</span>
                                            </td>
                                            <td>
                                              <span className="wms-code-pill">{ver.contractCode}</span>
                                            </td>
                                            <td>
                                              <div><strong>{ver.contractTitle}</strong></div>
                                              <div className="wms-helper-text" style={{ fontStyle: 'italic', color: 'var(--wms-accent)', marginTop: '2px', fontSize: '11.5px' }}>
                                                {ver.amendmentReason ? `• Lý do: ${ver.amendmentReason}` : '• Bản thảo khởi tạo ban đầu'}
                                              </div>
                                            </td>
                                            <td>
                                              <span className={`wms-status-badge ${vBadge.cls}`}>{vBadge.label}</span>
                                            </td>
                                            <td>
                                              <div style={{ fontSize: '11.5px' }}>Ký: {formatDate(ver.signingDate || ver.createdAt)}</div>
                                              <div className="wms-helper-text" style={{ fontSize: '11px' }}>
                                                HL: {formatDate(ver.effectiveFrom || ver.createdAt)} → {formatDate(resolveContractEffectiveTo(ver))}
                                              </div>
                                            </td>
                                            <td className="wms-td-number">
                                              <div style={{ fontWeight: 700 }}>{formatVnd(ver.totalContractAmount)}</div>
                                              <div className="wms-helper-text" style={{ fontSize: '11px' }}>
                                                Cọc: {formatVnd(ver.commercialTerms?.depositAmount || Math.round((ver.totalContractAmount || 0) * 0.3))}
                                              </div>
                                            </td>
                                            <td>
                                              <div className="wms-action-cell">
                                                <button
                                                  type="button"
                                                  className="wms-btn wms-btn-default wms-btn-sm"
                                                  onClick={() => setPreviewContract(ver)}
                                                  title="Xem văn bản chi tiết phiên bản này"
                                                >
                                                  <Eye size={12} />
                                                  <span>Xem</span>
                                                </button>
                                                {ver.status !== 'TERMINATED' && ver.status !== 'SUPERSEDED' && (
                                                  <button
                                                    type="button"
                                                    className="wms-btn wms-btn-danger wms-btn-xs"
                                                    style={{
                                                      backgroundColor: '#FEF2F2',
                                                      color: '#DC2626',
                                                      borderColor: '#FCA5A5',
                                                      fontWeight: 600,
                                                      display: 'inline-flex',
                                                      alignItems: 'center',
                                                      gap: '3px',
                                                    }}
                                                    onClick={() => handleOpenTerminateModal(ver)}
                                                    title="Chấm dứt phiên bản hợp đồng này"
                                                  >
                                                    <Ban size={12} />
                                                    <span>Chấm dứt</span>
                                                  </button>
                                                )}
                                              </div>
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            </td>
                            </tr>
                          )}
                        </React.Fragment>
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
        <form noValidate onSubmit={handleSaveContract}>
          {isAmendingActive && (
            <div className="wms-amendment-banner">
              <div className="wms-amendment-banner-icon">
                <GitBranch size={22} />
              </div>
              <div>
                <div className="wms-amendment-banner-title">
                  KHỞI TẠO PHỤ LỤC / PHIÊN BẢN SỬA ĐỔI MỚI (v{contractForm.versionNumber})
                </div>
                <p className="wms-amendment-banner-desc">
                  Hợp đồng gốc <strong>{sourceActiveContract?.contractCode || contractForm.contractCode.replace(/-V\d+$/i, '')}</strong> hiện đang có hiệu lực (ACTIVE) nên không thể ghi đè trực tiếp. Mọi sửa đổi sẽ được lưu thành <strong>Phiên bản v{contractForm.versionNumber}</strong> ({contractForm.contractCode}). Toàn bộ bản gốc và lịch sử hợp đồng được bảo lưu toàn vẹn.
                </p>
              </div>
            </div>
          )}

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

              {isAmendingActive && (
                <div className={`wms-field ${contractErrors.amendmentReason ? 'has-error' : ''}`} style={{ gridColumn: 'span 2' }}>
                  <label htmlFor="cf-amend-reason" className="wms-label">
                    Lý do điều chỉnh / Nội dung Phụ lục mới <span className="wms-required">*</span>
                  </label>
                  <input
                    id="cf-amend-reason"
                    type="text"
                    className="wms-input"
                    placeholder="Ví dụ: Điều chỉnh đơn giá vải Cotton, gia hạn giao hàng thêm 30 ngày..."
                    value={contractForm.amendmentReason}
                    onChange={(e) => handleContractFieldChange('amendmentReason', e.target.value)}
                    required
                  />
                  {contractErrors.amendmentReason && (
                    <span className="wms-field-error-text">
                      <AlertCircle size={12} /> {contractErrors.amendmentReason}
                    </span>
                  )}
                </div>
              )}

              <div className="wms-field">
                <label htmlFor="cf-type" className="wms-label">
                  Loại hình Hợp đồng <span className="wms-required">*</span>
                </label>
                <select
                  id="cf-type"
                  className="wms-select"
                  value="FRAMEWORK_AGREEMENT"
                  onChange={(e) => handleContractFieldChange('contractType', e.target.value)}
                >
                  <option value="FRAMEWORK_AGREEMENT">
                    Hợp đồng mua bán
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
                      <option key={sup._id || sup.id} value={sup._id || sup.id}>
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
                <div key={line._uiKey || index} className="wms-material-line-card">
                  <div className="wms-material-line-header">
                    <span className="wms-material-line-title" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span>
                        Hạng mục Nguyên phụ liệu #{index + 1}:{' '}
                        {line.materialCodeSnapshot
                          ? `[${line.materialCodeSnapshot}] ${line.materialNameSnapshot}`
                          : 'Chọn nguyên vật liệu bên dưới'}
                      </span>
                      {index === 0 && contractForm.contractedMaterials.length > 1 && (
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: '999px',
                            background: '#E0F2FE',
                            color: '#0369A1',
                            border: '1px solid #BAE6FD',
                          }}
                        >
                          Mới nhất
                        </span>
                      )}
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
                        value={line.isNewMaterial ? '__CREATE_NEW__' : line.rawMaterialId}
                        onChange={(e) =>
                          handleMaterialLineChange(
                            index,
                            'rawMaterialId',
                            e.target.value
                          )
                        }
                        required
                        disabled={!contractForm.supplierId}
                      >
                        <option value="">
                          {contractForm.supplierId
                            ? availableMaterialsForSupplier.length > 0
                              ? '-- Chọn mã NVL của nhà cung ứng này --'
                              : '-- NCC này chưa có nguyên phụ liệu nào --'
                            : '-- Vui lòng chọn Nhà cung ứng ở Bước 1 trước --'}
                        </option>
                        {(contractForm.supplierId ? availableMaterialsForSupplier : materialsCatalog).map((mat) => (
                          <option key={mat._id || mat.id} value={mat._id || mat.id}>
                            [{mat.materialCode}] {mat.materialName} ({mat.unit})
                          </option>
                        ))}
                        {contractForm.supplierId && (
                          <option value="__CREATE_NEW__">
                            ➕ Thêm mới...
                          </option>
                        )}
                      </select>

                      {line.isNewMaterial && (
                        <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '8px' }}>
                            <div>
                              <label style={{ fontSize: '11px', fontWeight: 600, color: '#334155', marginBottom: '2px', display: 'block' }}>
                                Tên nguyên phụ liệu mới <span className="wms-required">*</span>
                              </label>
                              <input
                                type="text"
                                className={`wms-input ${lineErrors.materialNameSnapshot ? 'is-invalid' : ''}`}
                                placeholder="Nhập tên NVL (VD: Vải mè thun, Cúc áo...)"
                                value={line.materialNameSnapshot || ''}
                                onChange={(e) =>
                                  handleMaterialLineChange(index, 'materialNameSnapshot', e.target.value)
                                }
                                autoFocus
                              />
                            </div>
                            <div>
                              <label style={{ fontSize: '11px', fontWeight: 600, color: '#334155', marginBottom: '2px', display: 'block' }}>
                                Nhóm / Phân loại (Category) <span className="wms-required">*</span>
                              </label>
                              <select
                                className="wms-select"
                                value={line.category || 'FABRIC_ROLL'}
                                onChange={(e) => {
                                  const catVal = e.target.value;
                                  handleMaterialLineChange(index, 'category', catVal);
                                  const foundCat = MATERIAL_CATEGORY_OPTIONS.find((c) => c.value === catVal);
                                  if (foundCat) {
                                    handleMaterialLineChange(index, 'materialType', foundCat.type);
                                  }
                                }}
                              >
                                {MATERIAL_CATEGORY_OPTIONS.map((c) => (
                                  <option key={c.value} value={c.value}>
                                    {c.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>

                          {lineErrors.materialNameSnapshot && (
                            <span className="wms-field-error-text">
                              <AlertCircle size={12} /> {lineErrors.materialNameSnapshot}
                            </span>
                          )}

                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f8fafc', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                            <span style={{ fontSize: '12px', color: '#475569', fontWeight: 600 }}>Mã NVL tự sinh:</span>
                            <span style={{ fontSize: '12px', color: '#0369a1', fontFamily: 'monospace', fontWeight: 700, background: '#e0f2fe', padding: '2px 8px', borderRadius: '4px' }}>
                              {line.materialCodeSnapshot || generateMaterialCodeFromName(line.materialNameSnapshot) || 'NVL-... (Tự động tạo theo tên)'}
                            </span>
                            <span style={{ fontSize: '11px', color: '#64748b', marginLeft: 'auto' }}>✨ Tự động tạo mã in tem barcode</span>
                          </div>

                          <span className="wms-helper-text" style={{ color: '#0284c7', fontSize: '11px' }}>
                            💡 Bạn hãy nhập tên và chọn nhóm phân loại nguyên phụ liệu. Hệ thống sẽ tự động tạo mã vạch và lưu vào danh mục của nhà cung ứng này khi hợp đồng được xác nhận.
                          </span>
                        </div>
                      )}

                      {!contractForm.supplierId && (
                        <span className="wms-helper-text" style={{ color: '#D97706', marginTop: '3px' }}>
                          ⚠️ Vui lòng chọn Nhà cung cấp (Bên B) ở trên để tải danh sách NVL tương ứng.
                        </span>
                      )}
                      {lineErrors.rawMaterialId && !line.isNewMaterial && (
                        <span className="wms-field-error-text">
                          <AlertCircle size={12} /> {lineErrors.rawMaterialId}
                        </span>
                      )}
                    </div>

                    <div className={`wms-field ${lineErrors.unitSnapshot ? 'has-error' : ''}`}>
                      <label className="wms-label">
                        Đơn vị tính (ĐVT) <span className="wms-required">*</span>
                      </label>
                      <select
                        className="wms-select"
                        value={
                          line.isCustomUnit
                            ? '__CUSTOM__'
                            : (MATERIAL_UNIT_OPTIONS.some((u) => u.value === line.unitSnapshot)
                                ? line.unitSnapshot
                                : (line.unitSnapshot || 'METER'))
                        }
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === '__CUSTOM__') {
                            handleMaterialLineChange(index, 'isCustomUnit', true);
                            handleMaterialLineChange(index, 'unitSnapshot', '');
                          } else {
                            handleMaterialLineChange(index, 'isCustomUnit', false);
                            handleMaterialLineChange(index, 'unitSnapshot', val);
                          }
                        }}
                      >
                        {!MATERIAL_UNIT_OPTIONS.some((u) => u.value === line.unitSnapshot) &&
                          line.unitSnapshot &&
                          !line.isCustomUnit && (
                            <option value={line.unitSnapshot}>
                              {line.unitSnapshot} (Đơn vị danh mục)
                            </option>
                          )}
                        {MATERIAL_UNIT_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                        <option value="__CUSTOM__">➕ Thêm mới...</option>
                      </select>

                      {line.isCustomUnit && (
                        <div style={{ marginTop: '6px' }}>
                          <input
                            type="text"
                            className={`wms-input ${lineErrors.unitSnapshot ? 'is-invalid' : ''}`}
                            placeholder="Nhập ĐVT mới (VD: Cuộn, Gram, Tấn, Bộ...)"
                            value={line.unitSnapshot || ''}
                            onChange={(e) =>
                              handleMaterialLineChange(
                                index,
                                'unitSnapshot',
                                e.target.value
                              )
                            }
                            autoFocus
                          />
                          <span className="wms-helper-text" style={{ color: '#0284c7', fontSize: '11px' }}>
                            💡 Đơn vị tính mới này sẽ được lưu cùng nguyên phụ liệu vào cơ sở dữ liệu.
                          </span>
                        </div>
                      )}

                      {lineErrors.unitSnapshot && (
                        <span className="wms-field-error-text">
                          <AlertCircle size={12} /> {lineErrors.unitSnapshot}
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
                        Đúng sai số lượng giao (±%)
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

                    {/* KHỐI NHẬP SỐ LƯỢNG: PHÂN BIỆT VẢI CUỘN (CHI TIẾT TỪNG CUỘN) VÀ PHỤ LIỆU */}
                    {isRollFabricLine(line) ? (
                      <div className="wms-field wms-field-span-full" style={{ background: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: '8px', padding: '14px', marginTop: '6px' }}>
                        {/* Roll Setup Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: '13px', color: '#1E293B', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <Package size={16} color="var(--wms-primary)" />
                              Chi tiết Cuộn vải Nhập về (Số cuộn & Chi tiết từng cuộn) <span className="wms-required">*</span>
                            </div>
                            <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '2px' }}>
                              Điền chi tiết số cuộn vải và quy cách/số lượng mỗi cuộn ({line.unitSnapshot || 'mét'}). Tổng số lượng ký hợp đồng sẽ được tự động tính và đồng bộ.
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '12px', background: '#E0F2FE', color: '#0369A1', padding: '3px 10px', borderRadius: '6px', fontWeight: 700 }}>
                              {(line.rollDetails || []).reduce((sum, r) => sum + (Number(r.rollQty ?? 1) || 0), 0)} cuộn · Tổng: {(Number(line.contractedQty) || 0).toLocaleString('vi-VN')} {line.unitSnapshot}
                            </span>
                            <button
                              type="button"
                              className="wms-btn wms-btn-outline wms-btn-sm"
                              style={{ fontSize: '11px', padding: '3px 8px' }}
                              onClick={() => handleAddRoll(index)}
                            >
                              <Plus size={12} /> Thêm 1 dòng cuộn
                            </button>
                          </div>
                        </div>

                        {/* Rolls detail table */}
                        <div style={{ maxHeight: '240px', overflow: 'auto', WebkitOverflowScrolling: 'touch', border: '1px solid #E2E8F0', borderRadius: '6px', background: '#FFFFFF' }}>
                          <table style={{ width: '100%', minWidth: '500px', borderCollapse: 'collapse', fontSize: '12px' }}>
                            <thead>
                              <tr style={{ background: '#F1F5F9', borderBottom: '1px solid #E2E8F0', color: '#475569', textAlign: 'left' }}>
                                <th style={{ padding: '6px 10px', width: '50px', textAlign: 'center' }}>STT</th>
                                <th style={{ padding: '6px 10px', width: '150px' }}>Số lượng <span className="wms-required">*</span></th>
                                <th style={{ padding: '6px 10px', width: '190px' }}>
                                  {['KG', 'KILOGRAM'].includes(String(line.unitSnapshot || '').toUpperCase())
                                    ? 'Khối lượng / cuộn (KG)'
                                    : `Quy cách / Chiều dài (${line.unitSnapshot || 'mét'})`}{' '}
                                  <span className="wms-required">*</span>
                                </th>
                                <th style={{ padding: '6px 10px' }}>Ghi chú cuộn vải</th>
                                <th style={{ padding: '6px 10px', width: '60px', textAlign: 'center' }}>Xóa</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(!line.rollDetails || line.rollDetails.length === 0) ? (
                                <tr>
                                  <td colSpan={5} style={{ textAlign: 'center', padding: '16px', color: '#94A3B8' }}>
                                    Chưa có cuộn vải nào. Hãy nhấn "+ Thêm 1 dòng cuộn" ở góc trên bên phải.
                                  </td>
                                </tr>
                              ) : (
                                line.rollDetails.map((roll, rIdx) => {
                                  const rQty = roll.rollQty ?? 1;
                                  const rLen = Number(roll.lengthMeters || 0);
                                  return (
                                    <tr key={rIdx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                      <td style={{ textAlign: 'center', fontWeight: 600, color: '#64748B' }}>
                                        #{rIdx + 1}
                                      </td>
                                      <td style={{ padding: '4px 10px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                          <input
                                            type="number"
                                            min="1"
                                            step="1"
                                            value={rQty}
                                            onChange={(e) => handleRollDetailChange(index, rIdx, 'rollQty', e.target.value)}
                                            style={{ width: '78px', padding: '3px 6px', fontSize: '12px', fontWeight: 700, color: '#0F172A', borderRadius: '4px', border: '1px solid #CBD5E1' }}
                                          />
                                          <span style={{ fontSize: '12px', color: '#64748B' }}>cuộn</span>
                                        </div>
                                      </td>
                                      <td style={{ padding: '4px 10px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                                          <input
                                            type="number"
                                            min="0.1"
                                            step="any"
                                            value={roll.lengthMeters}
                                            onChange={(e) => handleRollDetailChange(index, rIdx, 'lengthMeters', e.target.value)}
                                            style={{ width: '85px', padding: '3px 6px', fontSize: '12px', fontWeight: 700, color: '#0369A1', borderRadius: '4px', border: '1px solid #CBD5E1' }}
                                          />
                                          <span style={{ fontSize: '12px', color: '#64748B' }}>{line.unitSnapshot || 'mét'}</span>
                                          {Number(rQty) > 1 && (
                                            <span style={{ fontSize: '11px', color: '#0284C7', fontWeight: 600 }}>
                                              (= {(Number(rQty) * rLen).toLocaleString('vi-VN')})
                                            </span>
                                          )}
                                        </div>
                                      </td>
                                      <td style={{ padding: '4px 10px' }}>
                                        <input
                                          type="text"
                                          placeholder="VD: Cuộn tiêu chuẩn, cuộn mẫu..."
                                          value={roll.note || ''}
                                          onChange={(e) => handleRollDetailChange(index, rIdx, 'note', e.target.value)}
                                          style={{ width: '100%', padding: '3px 6px', fontSize: '12px', borderRadius: '4px', border: '1px solid #E2E8F0' }}
                                        />
                                      </td>
                                      <td style={{ textAlign: 'center', padding: '4px 10px' }}>
                                        <button
                                          type="button"
                                          onClick={() => handleRemoveRoll(index, rIdx)}
                                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', padding: '2px' }}
                                          title="Xóa dòng cuộn này"
                                        >
                                          <Trash2 size={13} />
                                        </button>
                                      </td>
                                    </tr>
                                  );
                                })
                              )}
                            </tbody>
                          </table>
                        </div>

                        {/* Summary footer */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', fontSize: '12px', fontWeight: 600, flexWrap: 'wrap', gap: '8px' }}>
                          <span style={{ color: '#475569' }}>
                            Đã phân rã chi tiết: <strong style={{ color: '#0369A1' }}>{(line.rollDetails || []).reduce((sum, r) => sum + (Number(r.rollQty ?? 1) || 0), 0)} cuộn</strong>
                          </span>
                          <span style={{ color: '#0F172A', background: '#FFFFFF', padding: '4px 12px', borderRadius: '4px', border: '1px solid #CBD5E1' }}>
                            Tổng số lượng ký hợp đồng: <strong style={{ color: '#0284C7', fontSize: '13px' }}>{(Number(line.contractedQty) || 0).toLocaleString('vi-VN')} {line.unitSnapshot}</strong>
                          </span>
                        </div>
                      </div>
                    ) : (
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
                    )}

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

          {/* PHẦN IV: KẾ HOẠCH LỊCH TRÌNH TIẾP NHẬN NGUYÊN VẬT LIỆU (MULTI-BATCH INBOUND PLAN) */}
          <section className="wms-form-section" style={{ border: '2px solid #38BDF8', borderRadius: '12px', background: '#F8FAFC' }}>
            <div className="wms-form-section-header" style={{ borderBottom: '1px solid #BAE6FD', paddingBottom: '12px' }}>
              <div>
                <h2 className="wms-form-section-title" style={{ color: '#0369A1', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Truck size={20} color="#0284C7" />
                  Phần IV – Kế hoạch Lịch trình Tiếp nhận Nguyên vật liệu (Lập lịch & Phân bổ đợt giao)
                </h2>
                <p style={{ margin: '4px 0 0 0', fontSize: '12.5px', color: '#64748B' }}>
                  Tùy chọn số đợt giao hàng theo nhu cầu thực tế (1 đợt, 2 đợt, 3 đợt, 4 đợt...). Khi điều chỉnh số lượng các đợt trước, đợt cuối cùng sẽ tự động điền phần số lượng còn thiếu để luôn khớp 100% hợp đồng.
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="wms-btn-action"
                  style={{ background: '#0284C7', color: '#FFFFFF', border: '1px solid #0284C7', fontWeight: 600, fontSize: '12px' }}
                  onClick={() =>
                    handleInboundBatchesCountChange(
                      (Number(contractForm.inboundBatchesCount) || (contractForm.inboundBatches || []).length || 1) + 1
                    )
                  }
                  title="Thêm 1 đợt giao hàng mới"
                >
                  <Plus size={13} style={{ marginRight: 4 }} />
                  Thêm 1 đợt giao
                </button>
                <button
                  type="button"
                  className="wms-btn-action"
                  style={{ background: '#E0F2FE', color: '#0284C7', border: '1px solid #7DD3FC', fontWeight: 600, fontSize: '12px' }}
                  onClick={handleAutoBalanceInboundBatches}
                  title="Tự động chia đều lại số lượng cho tất cả các đợt"
                >
                  <RefreshCw size={13} style={{ marginRight: 4 }} />
                  Chia đều các đợt
                </button>
              </div>
            </div>

            {contractErrors.inboundBatches && (
              <div className="wms-alert-banner wms-alert-error" style={{ margin: '14px 0', fontSize: '13px' }}>
                <AlertCircle size={16} />
                <span>{contractErrors.inboundBatches}</span>
              </div>
            )}

            {/* Cấu hình số đợt tiếp nhận */}
            <div className="wms-form-grid-3" style={{ marginTop: '14px', background: '#FFFFFF', padding: '14px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
              <div className="wms-field">
                <label className="wms-label" style={{ fontWeight: 700, color: '#0F172A' }}>
                  Số đợt tiếp nhận nguyên liệu (Tùy chọn số đợt giao)
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', border: '1px solid #0284C7', borderRadius: '6px', overflow: 'hidden', background: '#FFFFFF' }}>
                    <button
                      type="button"
                      onClick={() =>
                        handleInboundBatchesCountChange(
                          Math.max(1, (Number(contractForm.inboundBatchesCount) || (contractForm.inboundBatches || []).length || 1) - 1)
                        )
                      }
                      disabled={(Number(contractForm.inboundBatchesCount) || 1) <= 1}
                      style={{
                        border: 'none',
                        background: '#F0F9FF',
                        color: '#0369A1',
                        fontWeight: 700,
                        fontSize: '15px',
                        width: '34px',
                        height: '36px',
                        cursor: (Number(contractForm.inboundBatchesCount) || 1) <= 1 ? 'not-allowed' : 'pointer',
                      }}
                      title="Giảm 1 đợt giao"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={1}
                      max={24}
                      value={contractForm.inboundBatchesCount ?? (contractForm.inboundBatches || []).length ?? 1}
                      onChange={(e) => handleInboundBatchesCountChange(e.target.value)}
                      onBlur={(e) => {
                        if (!e.target.value || Number(e.target.value) < 1) {
                          handleInboundBatchesCountChange(1);
                        }
                      }}
                      style={{
                        width: '56px',
                        height: '36px',
                        border: 'none',
                        borderLeft: '1px solid #BAE6FD',
                        borderRight: '1px solid #BAE6FD',
                        textAlign: 'center',
                        fontWeight: 700,
                        fontSize: '14px',
                        color: '#0284C7',
                        outline: 'none',
                      }}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        handleInboundBatchesCountChange(
                          Math.min(24, (Number(contractForm.inboundBatchesCount) || (contractForm.inboundBatches || []).length || 1) + 1)
                        )
                      }
                      style={{
                        border: 'none',
                        background: '#F0F9FF',
                        color: '#0369A1',
                        fontWeight: 700,
                        fontSize: '15px',
                        width: '34px',
                        height: '36px',
                        cursor: 'pointer',
                      }}
                      title="Tăng 1 đợt giao"
                    >
                      +
                    </button>
                  </div>

                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    {[1, 2, 3, 4, 5].map((presetNum) => {
                      const isCurr = Number(contractForm.inboundBatchesCount || (contractForm.inboundBatches || []).length) === presetNum;
                      return (
                        <button
                          key={presetNum}
                          type="button"
                          onClick={() => handleInboundBatchesCountChange(presetNum)}
                          style={{
                            padding: '5px 9px',
                            fontSize: '11.5px',
                            fontWeight: isCurr ? 700 : 500,
                            borderRadius: '5px',
                            border: isCurr ? '1px solid #0284C7' : '1px solid #CBD5E1',
                            background: isCurr ? '#0284C7' : '#F8FAFC',
                            color: isCurr ? '#FFFFFF' : '#334155',
                            cursor: 'pointer',
                          }}
                        >
                          {presetNum} đợt
                        </button>
                      );
                    })}
                  </div>
                </div>
                <span className="wms-helper-text">
                  Nhập trực tiếp số đợt bất kỳ (1–24 đợt) hoặc chọn nhanh. Hệ thống sẽ tự động chia lịch giao tương ứng.
                </span>
              </div>

              <div className="wms-field">
                <label className="wms-label">Ghi chú lịch trình tiếp nhận</label>
                <input
                  type="text"
                  className="wms-input"
                  placeholder="Ghi chú về địa điểm bốc dỡ, điều kiện lưu kho..."
                  value={contractForm.inboundPlanNotes || ''}
                  onChange={(e) => setContractForm((prev) => ({ ...prev, inboundPlanNotes: e.target.value }))}
                />
                <span className="wms-helper-text">Lưu ý cho Kỹ thuật viên & Quản lý kho khi hàng về</span>
              </div>

              <div className="wms-field">
                <label className="wms-label">Kho tiếp nhận vật lý</label>
                <input
                  type="text"
                  className="wms-input"
                  disabled
                  value={contractForm.buyerInfo?.receivingWarehouseAddress || 'Kho Tổng Nguyên Phụ Liệu AraStore'}
                  style={{ background: '#F1F5F9', color: '#475569' }}
                />
                <span className="wms-helper-text">Địa chỉ nhập kho theo thông tin Bên Mua</span>
              </div>
            </div>

            {/* Chi tiết từng đợt tiếp nhận */}
            <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {(contractForm.inboundBatches || []).map((batch, bIdx) => {
                const bErrors = contractErrors.inboundBatchErrors?.[bIdx] || {};
                const totalBatchesLen = (contractForm.inboundBatches || []).length;
                const isLastBatchMulti = totalBatchesLen > 1 && bIdx === totalBatchesLen - 1;
                return (
                  <div
                    key={bIdx}
                    style={{
                      background: '#FFFFFF',
                      border: '1px solid #CBD5E1',
                      borderRadius: '10px',
                      padding: '16px',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        borderBottom: '1px solid #F1F5F9',
                        paddingBottom: '10px',
                        marginBottom: '12px',
                        flexWrap: 'wrap',
                        gap: '8px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span
                          style={{
                            background: '#0284C7',
                            color: '#FFFFFF',
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: '12px',
                          }}
                        >
                          Đợt {batch.batchNumber || bIdx + 1}/{totalBatchesLen}
                        </span>
                        <input
                          type="text"
                          className="wms-input"
                          style={{ fontWeight: 700, color: '#0F172A', maxWidth: '320px', padding: '4px 8px' }}
                          value={batch.batchTitle || ''}
                          onChange={(e) => handleInboundBatchFieldChange(bIdx, 'batchTitle', e.target.value)}
                        />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '12px', color: '#64748B' }}>Tỷ lệ:</span>
                          <span style={{ fontWeight: 700, color: '#0284C7', fontSize: '13px' }}>
                            {batch.batchPercentage || 0}%
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '12px', color: '#64748B', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Calendar size={13} /> Ngày giao dự kiến:
                          </span>
                          <input
                            type="date"
                            className="wms-input"
                            style={{
                              padding: '4px 8px',
                              fontSize: '12px',
                              width: '135px',
                              borderColor: bErrors.scheduledDeliveryDate ? '#EF4444' : '#CBD5E1',
                            }}
                            min={contractForm.effectiveFrom}
                            max={contractForm.effectiveTo}
                            value={batch.scheduledDeliveryDate ? String(batch.scheduledDeliveryDate).slice(0, 10) : ''}
                            onChange={(e) => handleInboundBatchFieldChange(bIdx, 'scheduledDeliveryDate', e.target.value)}
                          />
                        </div>
                        {totalBatchesLen > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveInboundBatch(bIdx)}
                            title="Xóa đợt giao hàng này"
                            style={{
                              border: '1px solid #FCA5A5',
                              background: '#FEF2F2',
                              color: '#DC2626',
                              borderRadius: '6px',
                              padding: '4px 8px',
                              fontSize: '11.5px',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            <Trash2 size={12} /> Xóa đợt
                          </button>
                        )}
                      </div>
                    </div>

                    {bErrors.scheduledDeliveryDate && (
                      <div style={{ fontSize: '12px', color: '#DC2626', marginBottom: '8px' }}>
                        ⚠️ {bErrors.scheduledDeliveryDate}
                      </div>
                    )}

                    {/* Bảng phân bổ nguyên vật liệu đợt này */}
                    <div className="wms-table-scroll">
                      <table className="wms-table" style={{ fontSize: '12.5px', marginTop: '6px' }}>
                      <thead>
                        <tr style={{ background: '#F8FAFC' }}>
                          <th style={{ width: '40px', textAlign: 'center' }}>#</th>
                          <th style={{ width: '130px' }}>Mã NVL</th>
                          <th>Tên nguyên phụ liệu</th>
                          <th style={{ width: '80px', textAlign: 'center' }}>ĐVT</th>
                          <th style={{ width: '130px', textAlign: 'right' }}>SL Ký HĐ</th>
                          <th style={{ width: '190px', textAlign: 'right', background: '#E0F2FE', color: '#0369A1' }}>
                            Số lượng phân bổ đợt này
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {(batch.expectedItems || []).map((it, itIdx) => {
                          const cMat =
                            contractForm.contractedMaterials?.[itIdx] ||
                            (contractForm.contractedMaterials || []).find(
                              (cm) => String(cm.rawMaterialId?._id || cm.rawMaterialId) === String(it.rawMaterialId)
                            );
                          const cQty = Number(cMat?.contractedQty || it.contractedQty || 0);
                          const itErr = bErrors.itemErrors?.[itIdx];

                          const allRolls = it.allRolls || cMat?.rollDetails || [];
                          const isHighlightedMismatch =
                            highlightedMismatchItem?.itemIdx === itIdx;
                          return (
                            <tr
                              key={itIdx}
                              id={`contract-batch-row-${bIdx}-item-${itIdx}`}
                              style={
                                isHighlightedMismatch
                                  ? {
                                      background: '#FEF2F2',
                                      outline: '2px solid #EF4444',
                                      transition: 'all 0.25s ease',
                                    }
                                  : undefined
                              }
                            >
                              <td style={{ textAlign: 'center', color: '#94A3B8' }}>{itIdx + 1}</td>
                              <td style={{ fontWeight: 600 }}>
                                {it.materialCode || cMat?.materialCodeSnapshot || 'NVL'}
                              </td>
                              <td>
                                <div>{it.materialName || cMat?.materialNameSnapshot || '—'}</div>
                                {allRolls.length > 0 && totalBatchesLen > 1 && (
                                  <div
                                    onClick={() => {
                                      if (!isLastBatchMulti && allRolls.length === 1) {
                                        handleToggleContractBatchRoll(bIdx, itIdx, allRolls[0]);
                                      }
                                    }}
                                    style={{
                                      marginTop: '6px',
                                      padding: '6px 8px',
                                      background: '#F8FAFC',
                                      border: '1px solid #E2E8F0',
                                      borderRadius: '6px',
                                      cursor: !isLastBatchMulti && allRolls.length === 1 ? 'pointer' : 'default',
                                      userSelect: 'none',
                                    }}
                                  >
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px', flexWrap: 'wrap', gap: '4px' }}>
                                      <span style={{ fontSize: '11px', fontWeight: 600, color: '#1E293B' }}>
                                        🧵 Chọn cuộn vải giao Đợt {bIdx + 1}:
                                        <span style={{ marginLeft: '4px', color: '#0284C7' }}>
                                          ({(it.selectedRolls || []).reduce((s, r) => s + (Number(r.rollQty ?? 1) || 0), 0)}/{allRolls.reduce((s, r) => s + Math.max(1, Number(r.rollQty ?? 1) || 1), 0)} cuộn)
                                        </span>
                                      </span>
                                      {isLastBatchMulti && (
                                        <span style={{ fontSize: '10px', background: '#E0F2FE', color: '#0369A1', padding: '1px 5px', borderRadius: '4px', fontWeight: 600 }}>
                                          ⚡ Tự động gom {(it.selectedRolls || []).reduce((s, r) => s + (Number(r.rollQty ?? 1) || 0), 0)} cuộn còn thiếu
                                        </span>
                                      )}
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                      {allRolls.map((roll, rIdx) => {
                                        const rollKey = roll.rollCode || `R-${roll.rollIndex || rIdx + 1}`;
                                        const totalRollQty = Math.max(1, Math.floor(Number(roll.rollQty ?? 1) || 1));
                                        const selectedEntry = (it.selectedRolls || []).find(
                                          (r) => (r.rollCode || `R-${r.rollIndex || rIdx + 1}`) === rollKey
                                        );
                                        const selectedRollQty = selectedEntry ? Math.max(0, Math.floor(Number(selectedEntry.rollQty ?? 1) || 0)) : 0;
                                        const isSelectedInThisBatch = selectedRollQty > 0;
                                        const otherBatchIndex = (contractForm.inboundBatches || []).findIndex(
                                          (otherB, obIdx) =>
                                            obIdx !== bIdx &&
                                            (otherB.expectedItems[itIdx]?.selectedRolls || []).some(
                                              (r) =>
                                                (r.rollCode || `R-${r.rollIndex || rIdx + 1}`) === rollKey &&
                                                Number(r.rollQty ?? 1) > 0
                                            )
                                        );
                                        const rollLen = Number(roll.lengthMeters || 0);

                                        if (totalRollQty > 1) {
                                          return (
                                            <div
                                              key={rollKey}
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                if (!isLastBatchMulti) {
                                                  handleToggleContractBatchRoll(bIdx, itIdx, roll);
                                                }
                                              }}
                                              title={
                                                isLastBatchMulti
                                                  ? 'Đợt cuối tự động nhận số cuộn còn thiếu'
                                                  : 'Bấm vào khối này để chọn / bỏ chọn dòng cuộn'
                                              }
                                              style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '5px',
                                                padding: '3px 8px',
                                                borderRadius: '6px',
                                                fontSize: '11px',
                                                cursor: isLastBatchMulti ? 'default' : 'pointer',
                                                userSelect: 'none',
                                                border: isSelectedInThisBatch ? '1px solid #0284C7' : '1px solid #CBD5E1',
                                                background: isSelectedInThisBatch ? '#E0F2FE' : '#FFFFFF',
                                                color: isSelectedInThisBatch ? '#0369A1' : '#475569',
                                              }}
                                            >
                                              <span
                                                style={{
                                                  fontWeight: 700,
                                                  fontSize: '11px',
                                                  display: 'inline-flex',
                                                  alignItems: 'center',
                                                  gap: '3px',
                                                }}
                                              >
                                                <span>{isSelectedInThisBatch ? '☑' : '☐'}</span>
                                                <span>#{rIdx + 1} ({rollLen.toLocaleString('vi-VN')}m/cuộn):</span>
                                              </span>

                                              {isLastBatchMulti ? (
                                                <span style={{ fontWeight: 700 }}>
                                                  {selectedRollQty}/{totalRollQty} cuộn ({(selectedRollQty * rollLen).toLocaleString('vi-VN')}m)
                                                </span>
                                              ) : (
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                                  <span>SL giao:</span>
                                                  <input
                                                    type="number"
                                                    min={0}
                                                    max={totalRollQty}
                                                    step={1}
                                                    value={selectedRollQty}
                                                    onClick={(e) => e.stopPropagation()}
                                                    onChange={(e) =>
                                                      handleContractBatchRollQtyChange(bIdx, itIdx, roll, e.target.value)
                                                    }
                                                    style={{
                                                      width: '46px',
                                                      padding: '1px 4px',
                                                      fontSize: '11px',
                                                      fontWeight: 700,
                                                      textAlign: 'center',
                                                      color: '#0369A1',
                                                      background: '#FFFFFF',
                                                      border: '1px solid #7DD3FC',
                                                      borderRadius: '4px',
                                                    }}
                                                  />
                                                  <span>/{totalRollQty} cuộn</span>
                                                  <strong style={{ marginLeft: '2px' }}>
                                                    ({(selectedRollQty * rollLen).toLocaleString('vi-VN')}m)
                                                  </strong>
                                                </span>
                                              )}
                                              {roll.note && (
                                                <span style={{ opacity: 0.8, fontStyle: 'italic' }}>({roll.note})</span>
                                              )}
                                            </div>
                                          );
                                        }

                                        return (
                                          <button
                                            key={rollKey}
                                            type="button"
                                            disabled={isLastBatchMulti}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleToggleContractBatchRoll(bIdx, itIdx, roll);
                                            }}
                                            title={
                                              isLastBatchMulti
                                                ? 'Đợt cuối cùng tự động nhận tất cả các cuộn vải còn lại'
                                                : isSelectedInThisBatch
                                                ? 'Bấm để bỏ cuộn này khỏi đợt'
                                                : otherBatchIndex >= 0
                                                ? `Đang gán ở Đợt ${otherBatchIndex + 1}. Bấm để chuyển sang Đợt ${bIdx + 1}`
                                                : 'Bấm để thêm cuộn này vào đợt'
                                            }
                                            style={{
                                              display: 'inline-flex',
                                              alignItems: 'center',
                                              gap: '3px',
                                              padding: '2px 6px',
                                              borderRadius: '4px',
                                              fontSize: '10.5px',
                                              cursor: isLastBatchMulti ? 'default' : 'pointer',
                                              border: isSelectedInThisBatch ? '1px solid #0284C7' : '1px solid #CBD5E1',
                                              background: isSelectedInThisBatch ? '#E0F2FE' : '#FFFFFF',
                                              color: isSelectedInThisBatch ? '#0369A1' : '#475569',
                                              fontWeight: isSelectedInThisBatch ? 600 : 400,
                                            }}
                                          >
                                            <span>{isSelectedInThisBatch ? '☑' : '☐'}</span>
                                            <strong>#{rIdx + 1}:</strong>
                                            <span>{rollLen.toLocaleString('vi-VN')}m</span>
                                            {roll.note && <span style={{ opacity: 0.8, fontStyle: 'italic' }}>({roll.note})</span>}
                                            {!isSelectedInThisBatch && otherBatchIndex >= 0 && (
                                              <span style={{ fontSize: '9px', color: '#94A3B8' }}>(Đợt {otherBatchIndex + 1})</span>
                                            )}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                {it.unit || cMat?.unitSnapshot || 'METER'}
                              </td>
                              <td style={{ textAlign: 'right', fontWeight: 600, color: '#475569' }}>
                                {cQty.toLocaleString('vi-VN')}
                              </td>
                              <td style={{ textAlign: 'right', background: '#F0F9FF' }}>
                                <input
                                  id={`contract-batch-input-${bIdx}-item-${itIdx}`}
                                  type="number"
                                  className="wms-input"
                                  style={{
                                    textAlign: 'right',
                                    fontWeight: 700,
                                    color: '#0284C7',
                                    padding: '4px 8px',
                                    width: '125px',
                                    borderColor: itErr || isHighlightedMismatch ? '#EF4444' : '#BAE6FD',
                                    background: isLastBatchMulti ? '#F1F5F9' : '#FFFFFF',
                                  }}
                                  min={0}
                                  max={cQty}
                                  readOnly={isLastBatchMulti}
                                  value={it.plannedQty !== undefined ? it.plannedQty : ''}
                                  onChange={(e) => handleInboundBatchItemQtyChange(bIdx, itIdx, e.target.value)}
                                />
                                {isLastBatchMulti && (
                                  <div style={{ fontSize: '10px', color: '#0369A1', marginTop: '2px', fontWeight: 600 }}>
                                    Tự động điền phần còn thiếu
                                  </div>
                                )}
                                {itErr && (
                                  <div style={{ fontSize: '11px', color: '#DC2626', marginTop: '2px' }}>
                                    {itErr}
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
              })}
            </div>

            {/* Bảng đối soát cân đối tổng thể giữa Hợp đồng & Các đợt giao */}
            <div style={{ marginTop: '16px', background: '#FFFFFF', padding: '14px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <PackageCheck size={16} color="#059669" />
                  Đối soát cân đối giữa Hợp đồng & Các đợt giao (Bảo toàn 100% số lượng cam kết)
                </span>
                <span style={{ fontSize: '12px', color: '#64748B' }}>
                  {inboundAllocationBalance.every((b) => b.isBalanced) ? (
                    <span style={{ color: '#059669', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <CheckCircle2 size={13} /> Đã cân bằng khớp 100% tất cả các mặt hàng
                    </span>
                  ) : (
                    <span style={{ color: '#DC2626', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <AlertTriangle size={13} /> Có mặt hàng chưa cân bằng số lượng
                      </span>
                      <button
                        type="button"
                        onClick={() => handleScrollToMismatchItem()}
                        style={{
                          background: '#DC2626',
                          color: '#FFFFFF',
                          border: 'none',
                          borderRadius: '6px',
                          padding: '3px 10px',
                          fontSize: '11.5px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          boxShadow: '0 1px 2px rgba(220,38,38,0.2)',
                        }}
                        title="Cuộn đến dòng nhập số lượng bị lệch để kiểm tra"
                      >
                        <Search size={12} /> Kiểm tra
                      </button>
                    </span>
                  )}
                </span>
              </div>

              <div className="wms-table-scroll">
                <table className="wms-table" style={{ fontSize: '12px', margin: 0 }}>
                <thead>
                  <tr style={{ background: '#F8FAFC' }}>
                    <th>Mã NVL</th>
                    <th>Tên nguyên phụ liệu</th>
                    <th style={{ width: '80px', textAlign: 'center' }}>ĐVT</th>
                    <th style={{ width: '130px', textAlign: 'right' }}>SL Ký HĐ</th>
                    <th style={{ width: '140px', textAlign: 'right' }}>Tổng các đợt đã chia</th>
                    <th style={{ width: '120px', textAlign: 'right' }}>Chênh lệch</th>
                    <th style={{ width: '190px', textAlign: 'center' }}>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {inboundAllocationBalance.map((bal, idx) => (
                    <tr key={idx} style={{ background: bal.isBalanced ? '#F0FDF4' : '#FEF2F2' }}>
                      <td style={{ fontWeight: 600 }}>{bal.materialCode}</td>
                      <td>{bal.materialName}</td>
                      <td style={{ textAlign: 'center' }}>{bal.unit}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>
                        {bal.contractedQty.toLocaleString('vi-VN')}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: '#0284C7' }}>
                        {bal.totalAllocated.toLocaleString('vi-VN')}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: bal.isBalanced ? '#059669' : '#DC2626' }}>
                        {bal.diff === 0 ? '0' : (bal.diff > 0 ? `Thiếu ${bal.diff}` : `Thừa ${Math.abs(bal.diff)}`)}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {bal.isBalanced ? (
                          <span style={{ background: '#DCFCE7', color: '#15803D', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 700 }}>
                            ✓ Khớp 100%
                          </span>
                        ) : (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', justifyContent: 'center' }}>
                            <span style={{ background: '#FEE2E2', color: '#B91C1C', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 700 }}>
                              ⚠️ Lệch số lượng
                            </span>
                            <button
                              type="button"
                              onClick={() => handleScrollToMismatchItem(idx)}
                              style={{
                                background: '#FFFFFF',
                                color: '#B91C1C',
                                border: '1px solid #FCA5A5',
                                borderRadius: '6px',
                                padding: '2px 8px',
                                fontSize: '11px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px',
                              }}
                              title="Nhấn để cuộn đến ô nhập số lượng của mặt hàng này"
                            >
                              <Search size={11} /> Kiểm tra
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

          {/* PHẦN V: ĐIỀU KHOẢN THANH TOÁN & GIAO NHẬN */}
          <section className="wms-form-section">
            <div className="wms-form-section-header">
              <h2 className="wms-form-section-title">
                <Scale size={18} />
                Phần V – Điều khoản Thanh toán, Đặt cọc & Phương thức Giao nhận
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
                  Tỷ lệ Đặt cọc Tạm ứng khi ký HĐ (%)
                </label>
                <input
                  type="number"
                  step="any"
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

              <div
                className={`wms-field ${
                  contractErrors.paymentInstallmentsCount ? 'has-error' : ''
                }`}
              >
                <label className="wms-label">
                  Số lần thanh toán công nợ còn lại (Đợt){' '}
                  <span className="wms-required">*</span>
                </label>
                <select
                  className="wms-select"
                  value={
                    Number(contractForm.commercialTerms.depositPercent) >= 100
                      ? 0
                      : Number(
                          contractForm.commercialTerms.paymentInstallmentsCount ||
                            contractForm.commercialTerms.paymentSchedule?.length ||
                            1
                        )
                  }
                  disabled={Number(contractForm.commercialTerms.depositPercent) >= 100}
                  onChange={(e) =>
                    handleCommercialChange(
                      'paymentInstallmentsCount',
                      Number(e.target.value)
                    )
                  }
                >
                  {Number(contractForm.commercialTerms.depositPercent) >= 100 ? (
                    <option value={0}>0 lần (Đã đặt cọc 100% giá trị hợp đồng)</option>
                  ) : (
                    [1, 2, 3, 4, 5, 6, 8, 10, 12].map((num) => (
                      <option key={num} value={num}>
                        Thanh toán trong {num} lần ({num} đợt)
                      </option>
                    ))
                  )}
                </select>
                {contractErrors.paymentInstallmentsCount && (
                  <span className="wms-field-error-text">
                    <AlertCircle size={12} /> {contractErrors.paymentInstallmentsCount}
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
                    Cho phép giao từng đợt theo Kế hoạch lịch trình tiếp nhận
                  </option>
                  <option value="false">Bắt buộc giao đủ 1 lần duy nhất</option>
                </select>
              </div>

              <div className="wms-field wms-field-span-full">
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

            {/* BẢNG LỘ TRÌNH CÁC LẦN THANH TOÁN CỤ THỂ (PAYMENT SCHEDULE) */}
            {Number(contractForm.commercialTerms.depositPercent) < 100 && (
              <div
                style={{
                  marginTop: '18px',
                  border: '1px solid #cbd5e1',
                  borderRadius: '10px',
                  background: '#f8fafc',
                  padding: '16px',
                }}
              >
                {(() => {
                  const scheduleList =
                    contractForm.commercialTerms.paymentSchedule || [];
                  const depPct = Number(
                    contractForm.commercialTerms.depositPercent || 0
                  );
                  const sumSchedulePct = Number(
                    scheduleList
                      .reduce((acc, r) => acc + (Number(r.paymentPercent) || 0), 0)
                      .toFixed(2)
                  );
                  const totalPct = Number((depPct + sumSchedulePct).toFixed(2));
                  const isBalanced =
                    Math.abs(totalPct - 100) <= 0.01 &&
                    scheduleList.every((r) => Number(r.paymentPercent) > 0);

                  return (
                    <>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: '10px',
                          marginBottom: '12px',
                        }}
                      >
                        <div>
                          <div
                            style={{
                              fontWeight: 700,
                              fontSize: '14px',
                              color: '#0f172a',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                            }}
                          >
                            <Calendar size={16} style={{ color: '#2563eb' }} />
                            Lộ trình các lần thanh toán cụ thể (
                            {scheduleList.length} lần)
                          </div>
                          <div
                            style={{
                              fontSize: '12px',
                              color: '#475569',
                              marginTop: '2px',
                            }}
                          >
                            Hiệu lực hợp đồng:{' '}
                            <strong>{formatDate(contractForm.effectiveFrom)}</strong>{' '}
                            → <strong>{formatDate(contractForm.effectiveTo)}</strong>{' '}
                            (Nhập số tiền cho từng đợt thanh toán, hệ thống sẽ tự tính % tương ứng; lần cuối tự động điền số tiền còn thiếu để đủ 100%).
                          </div>
                        </div>

                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '6px 12px',
                            borderRadius: '8px',
                            fontSize: '12.5px',
                            fontWeight: 600,
                            background: isBalanced ? '#dcfce7' : '#fee2e2',
                            color: isBalanced ? '#166534' : '#991b1b',
                            border: `1px solid ${isBalanced ? '#86efac' : '#fca5a5'}`,
                          }}
                        >
                          <span>
                            Đặt cọc: <strong>{depPct}%</strong> (
                            {formatVnd(liveTotals.depositAmt)})
                          </span>
                          <span>+</span>
                          <span>
                            {scheduleList.length} đợt thanh toán:{' '}
                            <strong>{sumSchedulePct}%</strong> (
                            {formatVnd(liveTotals.remainingAmt)})
                          </span>
                          <span>=</span>
                          <span style={{ fontWeight: 800 }}>
                            Tổng: {totalPct}% / 100%
                          </span>
                        </div>
                      </div>

                      <div className="wms-table-wrapper">
                        <table className="wms-table">
                          <thead>
                            <tr>
                              <th style={{ width: '120px' }}>Lần thanh toán</th>
                              <th style={{ width: '190px' }}>
                                Ngày thanh toán cụ thể{' '}
                                <span className="wms-required">*</span>
                              </th>
                              <th style={{ width: '220px' }}>
                                Số tiền thanh toán (VNĐ){' '}
                                <span className="wms-required">*</span>
                              </th>
                              <th style={{ width: '140px', textAlign: 'center' }}>
                                Tỷ lệ tương ứng (%)
                              </th>
                              <th>Nội dung / Điều kiện nghiệm thu thanh toán</th>
                            </tr>
                          </thead>
                          <tbody>
                            {scheduleList.map((inst, idx) => {
                              const isLast = idx === scheduleList.length - 1;
                              const rowErrors =
                                contractErrors.paymentScheduleLines?.[idx] || {};
                              const instPct = Number(inst.paymentPercent || 0);
                              const prevDueIso =
                                idx > 0 && scheduleList[idx - 1]?.dueDate
                                  ? scheduleList[idx - 1].dueDate
                                  : contractForm.effectiveFrom;

                              return (
                                <tr key={idx}>
                                  <td>
                                    <div
                                      style={{
                                        fontWeight: 700,
                                        color: '#1e293b',
                                        fontSize: '13px',
                                      }}
                                    >
                                      Lần {idx + 1} / {scheduleList.length}
                                    </div>
                                  </td>

                                  <td>
                                    <input
                                      type="date"
                                      className={`wms-input ${
                                        rowErrors.dueDate ? 'input-error' : ''
                                      }`}
                                      min={
                                        prevDueIso ||
                                        contractForm.effectiveFrom ||
                                        undefined
                                      }
                                      max={contractForm.effectiveTo || undefined}
                                      value={inst.dueDate || ''}
                                      onChange={(e) =>
                                        handleInstallmentChange(
                                          idx,
                                          'dueDate',
                                          e.target.value
                                        )
                                      }
                                    />
                                    {rowErrors.dueDate && (
                                      <div
                                        className="wms-field-error-text"
                                        style={{ marginTop: '4px' }}
                                      >
                                        <AlertCircle size={12} /> {rowErrors.dueDate}
                                      </div>
                                    )}
                                  </td>

                                  <td>
                                    <div style={{ position: 'relative' }}>
                                      <input
                                        type="number"
                                        min="0"
                                        step="any"
                                        readOnly={isLast}
                                        className={`wms-input ${
                                          rowErrors.paymentAmount || rowErrors.paymentPercent ? 'input-error' : ''
                                        }`}
                                        style={{
                                          textAlign: 'right',
                                          fontWeight: 700,
                                          paddingRight: '28px',
                                          fontSize: '13px',
                                          ...(isLast
                                            ? {
                                                background: inst.paymentAmount <= 0 ? '#fef2f2' : '#f0fdf4',
                                                color: inst.paymentAmount <= 0 ? '#dc2626' : '#15803d',
                                                cursor: 'not-allowed',
                                                border: inst.paymentAmount <= 0 ? '1px solid #f87171' : '1px solid #86efac',
                                              }
                                            : {
                                                color: '#0f172a',
                                              }),
                                        }}
                                        placeholder={isLast ? 'Tự động tính...' : 'Nhập số tiền...'}
                                        value={inst.paymentAmount !== undefined && inst.paymentAmount !== '' ? inst.paymentAmount : ''}
                                        onChange={(e) => {
                                          if (isLast) return;
                                          handleInstallmentChange(
                                            idx,
                                            'paymentAmount',
                                            e.target.value === '' ? '' : Math.max(0, Number(e.target.value))
                                          );
                                        }}
                                        title={
                                          isLast
                                            ? 'Lần thanh toán cuối tự động điền số tiền còn thiếu để hoàn tất 100% hợp đồng'
                                            : `Nhập số tiền thanh toán cho lần ${idx + 1}`
                                        }
                                      />
                                      <span
                                        style={{
                                          position: 'absolute',
                                          right: '10px',
                                          top: '50%',
                                          transform: 'translateY(-50%)',
                                          fontWeight: 700,
                                          color: isLast ? (inst.paymentAmount <= 0 ? '#dc2626' : '#15803d') : '#64748b',
                                          fontSize: '12px',
                                          pointerEvents: 'none',
                                        }}
                                      >
                                        ₫
                                      </span>
                                    </div>
                                    <div
                                      style={{
                                        fontSize: '11px',
                                        textAlign: 'right',
                                        marginTop: '2px',
                                        fontWeight: 600,
                                        color: isLast ? (inst.paymentAmount <= 0 ? '#dc2626' : '#16a34a') : '#0369a1',
                                      }}
                                    >
                                      {isLast
                                        ? `⚡ ${formatVnd(inst.paymentAmount || 0)} (Tự động điền số tiền còn thiếu)`
                                        : (inst.paymentAmount > 0 ? formatVnd(inst.paymentAmount) : '')}
                                    </div>
                                    {(rowErrors.paymentAmount || rowErrors.paymentPercent) && (
                                      <div className="wms-field-error-text" style={{ marginTop: '4px' }}>
                                        <AlertCircle size={12} />{' '}
                                        {rowErrors.paymentAmount || rowErrors.paymentPercent}
                                      </div>
                                    )}
                                  </td>

                                  <td style={{ textAlign: 'center' }}>
                                    <div
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        background: instPct > 0 ? '#eff6ff' : '#fef2f2',
                                        color: instPct > 0 ? '#1d4ed8' : '#dc2626',
                                        border: instPct > 0 ? '1px solid #bfdbfe' : '1px solid #fecaca',
                                        padding: '4px 10px',
                                        borderRadius: '6px',
                                        fontWeight: 700,
                                        fontSize: '13px',
                                      }}
                                    >
                                      <span>{instPct.toFixed(2)}%</span>
                                    </div>
                                  </td>

                                  <td>
                                    <input
                                      type="text"
                                      className="wms-input"
                                      value={inst.note || ''}
                                      onChange={(e) =>
                                        handleInstallmentChange(
                                          idx,
                                          'note',
                                          e.target.value
                                        )
                                      }
                                      placeholder={`Ghi chú đợt thanh toán lần ${
                                        idx + 1
                                      }...`}
                                    />
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {contractErrors.paymentSchedule && (
                        <div
                          className="wms-field-error-text"
                          style={{ marginTop: '10px', fontSize: '13px' }}
                        >
                          <AlertCircle size={14} /> {contractErrors.paymentSchedule}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
          </section>

          {/* PHẦN VI: TIÊU CHUẨN KIỂM ĐỊNH KCS / QC & ĐIỀU KHOẢN PHẠT VI PHẠM */}
          <section className="wms-form-section">
            <div className="wms-form-section-header">
              <h2 className="wms-form-section-title">
                <ShieldCheck size={18} />
                Phần VI – Tiêu chuẩn Kiểm định Chất lượng KCS (4-Point System) & Điều khoản Phạt Vi phạm
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

            {feedback?.type === 'error' && Array.isArray(feedback.errorList) && feedback.errorList.length > 0 && (
              <div
                className="wms-feedback-banner error"
                style={{
                  margin: '16px 0',
                  textAlign: 'left',
                  display: 'block',
                  border: '1px solid #FECACA',
                  background: '#FEF2F2',
                  borderRadius: '8px',
                  padding: '12px 16px',
                }}
              >
                <div style={{ fontWeight: 700, color: '#B91C1C', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', fontSize: '13px' }}>
                  <AlertCircle size={16} /> Chưa thể lưu Hợp đồng! Vui lòng hoàn thành các mục bắt buộc sau ({feedback.errorList.length} lỗi):
                </div>
                <ul style={{ margin: 0, paddingLeft: '20px', color: '#991B1B', fontSize: '12.5px', lineHeight: '1.6' }}>
                  {feedback.errorList.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="wms-modal-footer">
              <button
                type="button"
                className="wms-btn wms-btn-default"
                onClick={() => setActiveTab('CONTRACT_LIST')}
              >
                Quay lại Danh sách
              </button>
              <button
                type="button"
                className="wms-btn wms-btn-secondary"
                onClick={() => {
                  setPreviewContract({
                    ...contractForm,
                    supplierId: selectedSupplier,
                    totalContractAmount: liveTotals.grandTotal,
                    draftedByAccountantId: { fullName: 'Kế toán phụ trách' },
                    signingDate: contractForm.signingDate || new Date().toISOString(),
                  });
                }}
              >
                <Eye size={16} />
                Xem trước Hợp đồng (Bản in)
              </button>
              <button
                type="submit"
                className="wms-btn wms-btn-primary"
                disabled={submitting}
              >
                {submitting
                  ? 'Đang xử lý...'
                  : isAmendingActive
                  ? `Lưu thành Phiên bản mới (v${contractForm.versionNumber})`
                  : editingContractId
                  ? 'Lưu Cập nhật Bản thảo Hợp đồng'
                  : 'Lưu Khung Hợp đồng Nguyên Phụ Liệu'}
              </button>
            </div>
          </section>
        </form>
      )}

      {/* MODAL PREVIEW REAL-WORLD GARMENT SUPPLY CONTRACT DOCUMENT (CHUẨN 12 ĐIỀU KHOẢN PHÁP LÝ THƯƠNG MẠI) */}
      {previewContract && (() => {
        const previewDate = previewContract.signingDate
          ? new Date(previewContract.signingDate)
          : new Date(previewContract.createdAt || Date.now());
        const previewDay = String(previewDate.getDate()).padStart(2, '0');
        const previewMonth = String(previewDate.getMonth() + 1).padStart(2, '0');
        const previewYear = previewDate.getFullYear();
        const previewDepositPct = previewContract.commercialTerms?.depositPercent ?? 30;
        const previewDepositAmount =
          previewContract.commercialTerms?.depositAmount ||
          Math.round((previewContract.totalContractAmount || 0) * (previewDepositPct / 100));

        return (
          <div className="wms-modal-backdrop" role="dialog" aria-modal="true">
            <div className="wms-modal-dialog wide">
              <div className="wms-modal-header no-print">
                <div>
                  <h2 className="wms-modal-title">
                    Văn bản Hợp đồng Kinh tế: {previewContract.contractCode}
                  </h2>
                  <div className="wms-helper-text" style={{ fontSize: '12px', marginTop: '2px' }}>
                    Khung Hợp đồng Nguyên tắc Cung ứng Nguyên phụ liệu May mặc chuẩn hóa 12 Điều khoản
                  </div>
                </div>
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
                  {/* QUỐC HIỆU & TIÊU NGỮ */}
                  <header className="wms-legal-header">
                    <div className="wms-legal-nation">
                      CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM
                    </div>
                    <div className="wms-legal-motto">
                      Độc lập – Tự do – Hạnh phúc
                    </div>
                    <div className="wms-national-motto-line"></div>

                    <div className="wms-legal-title">
                      HỢP ĐỒNG NGUYÊN TẮC
                    </div>
                    <div className="wms-legal-subtitle">
                      (V/v mua bán hàng hóa: {previewContract.contractTitle || 'Nguyên phụ liệu may mặc'})
                    </div>
                    <div className="wms-legal-meta">
                      Số: <strong>{previewContract.contractCode}</strong>
                      {previewContract.versionNumber > 1 && (
                        <span className="wms-badge-version" style={{ marginLeft: 6 }}>
                          v{previewContract.versionNumber}
                        </span>
                      )}
                    </div>

                    {/* CĂN CỨ PHÁP LÝ */}
                    <div className="wms-legal-preamble">
                      - Căn cứ Bộ Luật Dân sự số 91/2015/QH13 được Quốc hội nước CHXHCN Việt Nam thông qua ngày 24/11/2015;<br />
                      - Căn cứ Luật Thương mại số 36/2005/QH11 do Quốc hội nước Cộng hòa xã hội chủ nghĩa Việt Nam thông qua ngày 14 tháng 6 năm 2005;<br />
                      {previewContract.parentSupersededContractId && (
                        <>
                          - Căn cứ Hợp đồng nguyên tắc về việc cung cấp hàng hóa số{' '}
                          <strong>
                            {previewContract.parentSupersededContractId?.contractCode || 'Phiên bản trước'}
                          </strong>{' '}
                          ngày {formatDate(previewContract.parentSupersededContractId?.signingDate || previewContract.createdAt)};<br />
                        </>
                      )}
                      - Căn cứ nhu cầu và khả năng của hai Bên,
                    </div>
                  </header>

                  {/* THỜI GIAN & ĐỊA ĐIỂM */}
                  <p style={{ margin: '8px 0 14px 0' }}>
                    Hôm nay, ngày <strong>{previewDay}</strong> tháng <strong>{previewMonth}</strong> năm <strong>{previewYear}</strong>, tại{' '}
                    <strong>
                      {previewContract.buyerInfo?.receivingWarehouseAddress ||
                        'Trụ sở Bên Mua (KCN Tân Bình, TP. Hồ Chí Minh)'}
                    </strong>
                    , chúng tôi gồm:
                  </p>

                  {/* BÊN BÁN (BÊN A) */}
                  <div className="wms-legal-section">
                    <div style={{ lineHeight: '1.8' }}>
                      <strong>BÊN BÁN: {previewContract.supplierId?.supplierName || '—'}</strong>
                      <br />
                      • Địa chỉ: {previewContract.supplierId?.address || '—'}
                      <br />
                      • Điện thoại: {previewContract.supplierId?.phone || '—'}
                      <span style={{ margin: '0 18px' }}>|</span>
                      Fax: {previewContract.supplierId?.fax || '—'}
                      <br />
                      • Số ĐKKD / MST: <strong>{previewContract.supplierId?.taxCode || previewContract.supplierId?.supplierCode || '—'}</strong>
                      <span style={{ margin: '0 14px' }}>|</span>
                      Cấp ngày: {formatDate(previewContract.supplierId?.createdAt)} tại: Sở Kế hoạch và Đầu tư
                      <br />
                      • Đại diện: <strong>{previewContract.supplierId?.representativeName || previewContract.supplierId?.contactName || previewContract.supplierId?.supplierName}</strong>
                      <span style={{ margin: '0 18px' }}>|</span>
                      Chức vụ: <strong>{previewContract.supplierId?.representativeRole || 'Giám đốc'}</strong>
                      <br />
                      <em>(Sau đây gọi là “Bên A”)</em>
                    </div>
                  </div>

                  {/* BÊN MUA (BÊN B) */}
                  <div className="wms-legal-section">
                    <div style={{ lineHeight: '1.8' }}>
                      <strong>BÊN MUA: {previewContract.buyerInfo?.companyName || 'CÔNG TY TNHH THỜI TRANG & KHO VẬN ARA (ARASTORE)'}</strong>
                      <br />
                      • Địa chỉ: {previewContract.buyerInfo?.receivingWarehouseAddress || 'Kho Tổng Nguyên Phụ Liệu AraStore – KCN Tân Bình, TP. Hồ Chí Minh'}
                      <br />
                      • Điện thoại: {previewContract.buyerInfo?.phone || '028-3888-9999'}
                      <span style={{ margin: '0 18px' }}>|</span>
                      Fax: {previewContract.buyerInfo?.fax || '028-3888-9998'}
                      <br />
                      • Số ĐKKD / MST: <strong>{previewContract.buyerInfo?.taxCode || '0109888999'}</strong>
                      <span style={{ margin: '0 14px' }}>|</span>
                      Cấp ngày: 15/01/2020 tại: Sở Kế hoạch và Đầu tư TP. Hồ Chí Minh
                      <br />
                      • Đại diện: <strong>{previewContract.buyerInfo?.representativeName || 'Trần Hoàng'}</strong>
                      <span style={{ margin: '0 18px' }}>|</span>
                      Chức vụ: <strong>{previewContract.buyerInfo?.representativeRole || 'Chủ sở hữu / Giám đốc điều hành'}</strong>
                      <br />
                      <em>(Sau đây gọi là “Bên B”)</em>
                    </div>
                  </div>

                  {/* XÉT RẰNG */}
                  <div className="wms-legal-section">
                    <strong>XÉT RẰNG:</strong>
                    <div style={{ margin: '4px 0 8px 0', lineHeight: '1.75' }}>
                      - Bên A là một doanh nghiệp Việt Nam hoạt động trong lĩnh vực sản xuất, kinh doanh và phân phối nguyên phụ liệu may mặc tại Việt Nam, có khả năng cung ứng các mặt hàng dệt may theo quy chuẩn kỹ thuật và chất lượng cao;
                      <br />
                      - Bên B là một doanh nghiệp Việt Nam hoạt động trong lĩnh vực thiết kế, may mặc thời trang và vận hành chuỗi bán lẻ, có nhu cầu thu mua nguyên phụ liệu phục vụ hoạt động sản xuất kinh doanh thường nhật;
                    </div>
                    <p style={{ margin: '6px 0 12px 0' }}>
                      Sau khi thỏa thuận, hai Bên cùng đồng ý ký kết Hợp đồng nguyên tắc về việc cung ứng hàng hóa <strong>{previewContract.contractTitle || 'nguyên phụ liệu may mặc'}</strong> cho bên B (sau đây gọi là “Hợp đồng”) với các điều khoản sau:
                    </p>
                  </div>

                  {/* ĐIỀU 1 */}
                  <div className="wms-legal-section">
                    <div className="wms-legal-section-title">
                      Điều 1: Các nguyên tắc chung
                    </div>
                    <div style={{ lineHeight: '1.75' }}>
                      1. Hai Bên tham gia ký kết Hợp đồng này trên cơ sở quan hệ Bạn hàng, bình đẳng và cùng có lợi theo đúng các quy định của Pháp luật.
                      <br />
                      2. Các nội dung trong bản hợp đồng nguyên tắc này chỉ được sửa đổi khi có sự thỏa thuận của hai bên và được thống nhất bằng văn bản. Văn bản thay đổi nội dung hợp đồng nguyên tắc này được xem là Phụ lục và là một phần không thể tách rời của Hợp đồng.
                      <br />
                      3. Các nội dung hợp tác, mua bán hàng hóa cụ thể theo từng thời điểm sẽ được cụ thể hóa trong các bản Hợp đồng mua bán cụ thể hoặc Kế hoạch lịch trình tiếp nhận nguyên liệu (Inbound Plan) được hai bên xác nhận.
                      <br />
                      4. Điều khoản nào trong Hợp đồng mua bán mâu thuẫn với các điều khoản trong Hợp đồng này thì sẽ thực hiện theo các điều khoản được quy định trong Hợp đồng này.
                      <br />
                      5. Các tài liệu có liên quan và gắn liền với hợp đồng này bao gồm:
                      <br />
                      &nbsp;&nbsp;&nbsp;&nbsp;- Các hợp đồng mua bán cụ thể theo từng thời điểm trong thời gian Hợp đồng nguyên tắc này có hiệu lực;
                      <br />
                      &nbsp;&nbsp;&nbsp;&nbsp;- Kế hoạch lịch trình tiếp nhận nguyên liệu, Phụ lục hợp đồng, Đơn đặt hàng (PO);
                      <br />
                      &nbsp;&nbsp;&nbsp;&nbsp;- Biên bản kiểm định chất lượng KCS theo Hệ thống 4 điểm (ASTM D5430) và Phiếu nhập kho đã được các bên ký xác nhận.
                    </div>
                  </div>

                  {/* ĐIỀU 2 */}
                  <div className="wms-legal-section">
                    <div className="wms-legal-section-title">
                      Điều 2. Giải thích từ ngữ
                    </div>
                    <div style={{ lineHeight: '1.75' }}>
                      Trong phạm vi hợp đồng này và các tài liệu khác liên quan và gắn liền với hợp đồng này, các từ ngữ dưới đây được hiểu như sau:
                      <br />
                      1. Hợp đồng nguyên tắc là hợp đồng thể hiện những nguyên tắc chung làm cơ sở cho sự hợp tác giữa hai bên trong quan hệ cung ứng hàng hóa <strong>{previewContract.contractTitle || 'nguyên phụ liệu may mặc'}</strong> và là cơ sở cho các Hợp đồng mua bán cụ thể sau này.
                      <br />
                      2. Tiêu chuẩn kiểm định KCS (4-Point System): Hệ thống kiểm tra chất lượng dệt may theo chuẩn quốc tế ASTM D5430 nhằm chấm điểm khuyết tật ngoại quan trên bề mặt vải (tối đa không quá {previewContract.qualityStandards?.inspectionStandard || '20 điểm lỗi/100 sq.yds'}).
                      <br />
                      3. Dung sai số lượng (Tolerance): Tỷ lệ chênh lệch phần trăm cho phép giữa khối lượng giao nhận thực tế so với khối lượng hợp đồng cam kết (dao động trong khoảng ±{previewContract.contractedMaterials?.[0]?.qtyTolerancePct ?? 3}%).
                    </div>
                  </div>

                  {/* ĐIỀU 3 */}
                  <div className="wms-legal-section">
                    <div className="wms-legal-section-title">
                      Điều 3: Hàng hóa mua bán
                    </div>
                    <p style={{ margin: '4px 0 8px 0' }}>
                      Bên A đồng ý bán và bên B đồng ý mua số hàng hóa cụ thể như sau:
                    </p>
                    <div className="wms-table-scroll">
                      <table className="wms-legal-table">
                        <thead>
                          <tr>
                            <th style={{ width: '38px' }}>STT</th>
                            <th>TÊN HÀNG HÓA</th>
                            <th style={{ width: '65px' }}>Đ.vị tính</th>
                            <th>Quy cách – Chủng loại</th>
                            <th>Xuất xứ / Tiêu chuẩn</th>
                            <th style={{ width: '90px', textAlign: 'right' }}>Số lượng</th>
                            <th style={{ width: '110px', textAlign: 'right' }}>Đơn giá (Chưa VAT)</th>
                            <th style={{ width: '55px', textAlign: 'center' }}>VAT</th>
                            <th style={{ width: '125px', textAlign: 'right' }}>Thành tiền (VNĐ)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(previewContract.contractedMaterials || []).map((item, idx) => {
                            const lineQty = Number(item.contractedQty || 0);
                            const linePrice = Number(item.unitPrice || 0);
                            const lineTotal = lineQty * linePrice;
                            return (
                              <tr key={idx}>
                                <td style={{ textAlign: 'center' }}>{idx + 1}</td>
                                <td>
                                  <strong>
                                    {item.materialNameSnapshot || item.rawMaterialId?.materialName || 'Nguyên phụ liệu'}
                                  </strong>
                                  <div style={{ fontSize: '12px', color: '#4b5563' }}>
                                    Mã: {item.materialCodeSnapshot || item.rawMaterialId?.materialCode || '—'}
                                  </div>
                                  {Array.isArray(item.rollDetails) && item.rollDetails.length > 0 && (
                                    <div style={{ fontSize: '11.5px', color: '#0284c7', marginTop: '4px', background: '#f0f9ff', padding: '3px 6px', borderRadius: '4px', border: '1px solid #bae6fd' }}>
                                      🧵 <strong>Chi tiết {item.rollDetails.length} cuộn vải:</strong>{' '}
                                      {item.rollDetails.map((r, rIdx) => `${r.rollCode || `C-${rIdx + 1}`}: ${r.lengthMeters}m`).join(' | ')}
                                    </div>
                                  )}
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                  {item.unitSnapshot || item.rawMaterialId?.unit || 'METER'}
                                </td>
                                <td>
                                  <div>{item.composition || '100% Cotton'}</div>
                                  <div style={{ fontSize: '12px', color: '#4b5563' }}>
                                    Khổ: {item.widthCm || 160}cm | Định lượng: {item.gsm || 210} gsm | Màu: {item.colorSpec || 'Tiêu chuẩn'}
                                  </div>
                                </td>
                                <td>
                                  <div>Co rút: ±{item.shrinkageTolerancePct ?? 2.5}%</div>
                                  <div style={{ fontSize: '12px', color: '#4b5563' }}>
                                    Bền màu: {item.colorFastnessGrade || 'Grade 4.0'}
                                  </div>
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                  <strong>{lineQty.toLocaleString('vi-VN')}</strong>
                                  {(item.rollCount > 0 || (Array.isArray(item.rollDetails) && item.rollDetails.length > 0)) && (
                                    <div style={{ fontSize: '11px', color: '#0369a1', fontWeight: 700 }}>
                                      ({item.rollCount || item.rollDetails?.length} cuộn)
                                    </div>
                                  )}
                                  <div style={{ fontSize: '11px', color: '#6b7280' }}>
                                    (±{item.qtyTolerancePct ?? 3}%)
                                  </div>
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                  {formatVnd(linePrice)}
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                  {item.vatRatePct ?? 8}%
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                  <strong>{formatVnd(lineTotal)}</strong>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div style={{ lineHeight: '1.75', marginTop: '6px' }}>
                      - Đơn giá: theo bảng báo giá của bên B có sự xác nhận của Bên A (đơn giá chưa bao gồm thuế GTGT và được áp dụng cố định trong suốt thời gian thực hiện hợp đồng).
                      <br />
                      - Khối lượng cụ thể được thể hiện bằng các bản hợp đồng mua bán cụ thể hoặc Kế hoạch tiếp nhận nguyên liệu (Inbound Plan) được ký kết giữa hai bên.
                    </div>
                  </div>

                  {/* ĐIỀU 4: KẾ HOẠCH LỊCH TRÌNH TIẾP NHẬN NGUYÊN VẬT LIỆU */}
                  <div className="wms-legal-section">
                    <div className="wms-legal-section-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>Điều 4. Kế hoạch Lịch trình Tiếp nhận Nguyên vật liệu (Inbound Delivery Schedule)</span>
                      {previewContract.latestInboundPlan && (
                        <span style={{ fontSize: '11.5px', background: '#0284C7', color: '#FFFFFF', padding: '3px 9px', borderRadius: '12px', fontWeight: 600 }}>
                          Mã KH: {previewContract.latestInboundPlan.planCode} (v{previewContract.latestInboundPlan.versionNumber || 1})
                        </span>
                      )}
                    </div>
                    <div style={{ lineHeight: '1.75' }}>
                      1. Hai bên cam kết thực hiện việc giao nhận nguyên phụ liệu theo kế hoạch lịch trình tiếp nhận đã thống nhất. Nguyên phụ liệu được giao theo đúng số lượng, quy cách và thời hạn quy định dưới đây.
                      <br />

                      {/* KHỐI HIỂN THỊ PHIÊN BẢN KẾ HOẠCH MỚI NHẤT (NỔI BẬT CAO CẤP) */}
                      {previewContract.latestInboundPlan ? (
                        <div
                          style={{
                            margin: '12px 0 16px 0',
                            padding: '16px',
                            background: 'linear-gradient(135deg, #F0F9FF 0%, #E0F2FE 100%)',
                            border: '2px solid #0284C7',
                            borderRadius: '10px',
                            boxShadow: '0 4px 12px rgba(2, 132, 199, 0.12)',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', borderBottom: '1px solid #BAE6FD', paddingBottom: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span
                                style={{
                                  background: '#0284C7',
                                  color: '#FFFFFF',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  padding: '3px 10px',
                                  borderRadius: '12px',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                }}
                              >
                                <Sparkles size={12} /> Phiên bản Kế hoạch Mới nhất (Hiện hành – v{previewContract.latestInboundPlan.versionNumber || 1})
                              </span>
                              <span style={{ fontWeight: 700, color: '#0369A1', fontSize: '14px' }}>
                                Mã KH: {previewContract.latestInboundPlan.planCode}
                              </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              {previewContract.latestInboundPlan.deliveryComplianceStatus === 'MATCHED' && (
                                <span style={{ background: '#DCFCE7', color: '#15803D', padding: '3px 8px', borderRadius: '8px', fontSize: '11px', fontWeight: 700 }}>
                                  ✓ Đúng kế hoạch
                                </span>
                              )}
                              {previewContract.latestInboundPlan.deliveryComplianceStatus === 'MISMATCHED' && (
                                <span style={{ background: '#FFE4E6', color: '#BE123C', padding: '3px 8px', borderRadius: '8px', fontSize: '11px', fontWeight: 700 }}>
                                  ⚠️ Có sai lệch giao nhận
                                </span>
                              )}
                              <span style={{ fontSize: '12px', color: '#0284C7', fontWeight: 600 }}>
                                Tổng {previewContract.latestInboundPlan.batches?.length || previewContract.latestInboundPlan.totalBatches || 1} đợt giao
                              </span>
                            </div>
                          </div>

                          <div style={{ fontSize: '12px', color: '#334155', marginBottom: '10px', display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                            <span><strong>Ngày bắt đầu giao:</strong> {formatDate(previewContract.latestInboundPlan.scheduledDeliveryDate)}</span>
                            <span><strong>Người lập lịch:</strong> {previewContract.latestInboundPlan.createdByAccountantId?.fullName || 'Kế toán kho AraStore'}</span>
                            {previewContract.latestInboundPlan.notes && (
                              <span><strong>Ghi chú:</strong> {previewContract.latestInboundPlan.notes}</span>
                            )}
                          </div>

                          {/* Bảng chi tiết các đợt giao hàng */}
                          <div className="wms-table-scroll">
                            <table className="wms-legal-table" style={{ background: '#FFFFFF', margin: 0 }}>
                            <thead>
                              <tr style={{ background: '#E0F2FE' }}>
                                <th style={{ width: '85px', textAlign: 'center' }}>Đợt số</th>
                                <th style={{ width: '130px', textAlign: 'center' }}>Ngày giao dự kiến</th>
                                <th style={{ width: '80px', textAlign: 'center' }}>Tỷ lệ (%)</th>
                                <th>Chi tiết mặt hàng & Số lượng tiếp nhận</th>
                                <th style={{ width: '130px', textAlign: 'center' }}>Trạng thái đợt</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(previewContract.latestInboundPlan.batches || []).map((b, bIdx) => {
                                return (
                                  <tr key={bIdx}>
                                    <td style={{ textAlign: 'center', fontWeight: 700, color: '#0284C7' }}>
                                      Đợt {b.batchNumber || bIdx + 1}
                                    </td>
                                    <td style={{ textAlign: 'center', fontWeight: 600 }}>
                                      {formatDate(b.scheduledDeliveryDate)}
                                    </td>
                                    <td style={{ textAlign: 'center', fontWeight: 700 }}>
                                      {b.batchPercentage || 50}%
                                    </td>
                                    <td>
                                      <div style={{ fontWeight: 600, color: '#0F172A', marginBottom: '4px' }}>
                                        {b.batchTitle || `Đợt ${b.batchNumber || bIdx + 1}: Tiếp nhận nguyên liệu`}
                                      </div>
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '11.5px', color: '#475569' }}>
                                        {(b.expectedItems || []).map((it, itIdx) => {
                                          const matCode = it.rawMaterialId?.materialCode || it.materialCode || 'NVL';
                                          const matName = it.rawMaterialId?.materialName || it.materialName || '';
                                          return (
                                            <div key={itIdx}>
                                              • <strong>{matCode}</strong> - {matName}: <strong>{Number(it.plannedQty || 0).toLocaleString('vi-VN')} {it.unitSnapshot || it.unit || 'm'}</strong>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                      <span style={{ fontSize: '11px', background: '#F1F5F9', color: '#475569', padding: '2px 8px', borderRadius: '8px', fontWeight: 600 }}>
                                        {b.status === 'RECEIVED' ? 'Đã nhập kho' : 'Đã lên lịch'}
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                            </table>
                          </div>
                        </div>
                      ) : (
                        /* Trường hợp hợp đồng nháp chưa lưu có previewContract.inboundBatches */
                        Array.isArray(previewContract.inboundBatches) && previewContract.inboundBatches.length > 0 ? (
                          <div style={{ margin: '10px 0 14px 0' }}>
                            <div style={{ fontWeight: 700, marginBottom: '6px' }}>
                              &nbsp;&nbsp;&nbsp;&nbsp;• Lịch trình các đợt tiếp nhận nguyên phụ liệu ({previewContract.inboundBatches.length} đợt – Tổng phân bổ = 100%):
                            </div>
                            <div className="wms-table-scroll">
                              <table className="wms-legal-table">
                              <thead>
                                <tr>
                                  <th style={{ width: '85px', textAlign: 'center' }}>Đợt</th>
                                  <th style={{ width: '130px', textAlign: 'center' }}>Ngày giao hàng</th>
                                  <th style={{ width: '80px', textAlign: 'center' }}>Tỷ lệ (%)</th>
                                  <th>Danh mục mặt hàng & Số lượng giao</th>
                                </tr>
                              </thead>
                              <tbody>
                                {previewContract.inboundBatches.map((b, bIdx) => (
                                  <tr key={bIdx}>
                                    <td style={{ textAlign: 'center', fontWeight: 700 }}>
                                      Đợt {b.batchNumber || bIdx + 1}
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                      {formatDate(b.scheduledDeliveryDate)}
                                    </td>
                                    <td style={{ textAlign: 'center', fontWeight: 700 }}>
                                      {b.batchPercentage || 50}%
                                    </td>
                                    <td>
                                      <div style={{ fontWeight: 600, marginBottom: '3px' }}>
                                        {b.batchTitle || `Đợt ${b.batchNumber || bIdx + 1}`}
                                      </div>
                                      <div style={{ fontSize: '11.5px', color: '#4b5563' }}>
                                        {(b.expectedItems || []).map((it, itIdx) => (
                                          <span key={itIdx} style={{ marginRight: '12px' }}>
                                            {it.materialCode || 'NVL'}: <strong>{Number(it.plannedQty || 0).toLocaleString('vi-VN')} {it.unit || 'm'}</strong>
                                          </span>
                                        ))}
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ) : (
                          <div style={{ margin: '8px 0', fontStyle: 'italic', color: '#64748B' }}>
                            (Kế hoạch tiếp nhận chi tiết được xác lập theo từng đợt cắt may thực tế theo tiến độ hợp đồng).
                          </div>
                        )
                      )}

                      {/* LỊCH SỬ CÁC PHIÊN BẢN CŨ HƠN (ĐÃ THAY THẾ - SUPERSEDED) */}
                      {Array.isArray(previewContract.inboundPlans) && previewContract.inboundPlans.length > 1 && (
                        <div style={{ marginTop: '12px' }}>
                          <button
                            type="button"
                            onClick={() => setExpandedHistoricalInboundPlans((prev) => !prev)}
                            style={{
                              background: '#F1F5F9',
                              border: '1px dashed #94A3B8',
                              padding: '6px 12px',
                              borderRadius: '6px',
                              fontSize: '11.5px',
                              color: '#475569',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              fontWeight: 600,
                            }}
                          >
                            <History size={13} />
                            {expandedHistoricalInboundPlans ? 'Thu gọn' : 'Xem'} lịch sử các phiên bản kế hoạch trước đó ({previewContract.inboundPlans.length - 1} phiên bản đã thay thế)
                            {expandedHistoricalInboundPlans ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                          </button>

                          {expandedHistoricalInboundPlans && (
                            <div style={{ marginTop: '8px', padding: '10px', background: '#F8FAFC', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                              <div style={{ fontSize: '12px', color: '#64748B', marginBottom: '8px', fontWeight: 600 }}>
                                📑 Lịch sử điều chỉnh phiên bản Kế hoạch tiếp nhận (Audit Trail):
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {previewContract.inboundPlans.slice(1).map((oldPlan, opIdx) => (
                                  <div
                                    key={opIdx}
                                    style={{
                                      padding: '8px 12px',
                                      background: '#FFFFFF',
                                      border: '1px solid #CBD5E1',
                                      borderRadius: '6px',
                                      fontSize: '12px',
                                      opacity: 0.85,
                                    }}
                                  >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                      <div>
                                        <span style={{ fontWeight: 700, color: '#475569', marginRight: '8px' }}>
                                          Phiên bản v{oldPlan.versionNumber || 1} ({oldPlan.planCode})
                                        </span>
                                        <span style={{ background: '#E2E8F0', color: '#475569', padding: '1px 6px', borderRadius: '6px', fontSize: '10.5px' }}>
                                          Đã thay thế (Superseded)
                                        </span>
                                      </div>
                                      <span style={{ color: '#64748B', fontSize: '11px' }}>
                                        {formatDate(oldPlan.createdAt)}
                                      </span>
                                    </div>
                                    {oldPlan.amendmentReason && (
                                      <div style={{ marginTop: '4px', color: '#64748B', fontSize: '11.5px' }}>
                                        Lý do điều chỉnh: <em>"{oldPlan.amendmentReason}"</em>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      <br />
                      2. Dung sai số lượng giao hàng thực tế cho từng đợt được áp dụng theo quy định tại Điều 3 của Hợp đồng này.
                    </div>
                  </div>

                  {/* ĐIỀU 5: GIÁ TRỊ HỢP ĐỒNG & PHƯƠNG THỨC THANH TOÁN */}
                  <div className="wms-legal-section">
                    <div className="wms-legal-section-title">
                      Điều 5. Giá trị hợp đồng và phương thức thanh toán
                    </div>
                    <div style={{ lineHeight: '1.75' }}>
                      1. Giá trị hợp đồng là tạm tính căn cứ vào đơn giá được xác nhận giữa 2 bên từng thời điểm và khối lượng thực tế được nghiệm thu giữa hai bên.
                      <br />
                      &nbsp;&nbsp;&nbsp;&nbsp;• <strong>Tổng giá trị hợp đồng tạm tính (Đã bao gồm thuế VAT):</strong>{' '}
                      <strong style={{ fontSize: '15px' }}>{formatVnd(previewContract.totalContractAmount)}</strong>
                      <br />
                      &nbsp;&nbsp;&nbsp;&nbsp;• <em>Bằng chữ: <strong>{numberToWordsVnd(previewContract.totalContractAmount)}</strong></em>
                      <br />
                      &nbsp;&nbsp;&nbsp;&nbsp;• <strong>Tiền đặt cọc / Tạm ứng ({previewDepositPct}%):</strong>{' '}
                      <strong>{formatVnd(previewDepositAmount)}</strong>{' '}
                      <em>({numberToWordsVnd(previewDepositAmount)})</em> Bên B tạm ứng cho Bên A sau khi hai bên ký kết hợp đồng.
                      {Array.isArray(previewContract.commercialTerms?.paymentSchedule) &&
                        previewContract.commercialTerms.paymentSchedule.length > 0 && (
                          <div style={{ margin: '10px 0 12px 0' }}>
                            <div style={{ fontWeight: 700, marginBottom: '6px' }}>
                              &nbsp;&nbsp;&nbsp;&nbsp;• Lộ trình các lần thanh toán phần giá trị còn lại ({previewContract.commercialTerms.paymentSchedule.length} lần – Tổng Cọc & Thanh toán = 100%):
                            </div>
                            <div className="wms-table-scroll">
                              <table className="wms-legal-table">
                              <thead>
                                <tr>
                                  <th style={{ width: '90px' }}>Đợt</th>
                                  <th style={{ width: '130px' }}>Ngày thanh toán</th>
                                  <th style={{ width: '110px', textAlign: 'center' }}>Tỷ lệ (%)</th>
                                  <th style={{ width: '150px', textAlign: 'right' }}>Số tiền (VNĐ)</th>
                                  <th>Ghi chú / Điều kiện thanh toán</th>
                                </tr>
                              </thead>
                              <tbody>
                                {previewContract.commercialTerms.paymentSchedule.map((inst, idx) => {
                                  const pct = Number(inst.paymentPercent || 0);
                                  const amt =
                                    inst.paymentAmount ||
                                    Math.round(((previewContract.totalContractAmount || 0) * pct) / 100);
                                  return (
                                    <tr key={idx}>
                                      <td style={{ textAlign: 'center', fontWeight: 700 }}>
                                        Lần {idx + 1}
                                      </td>
                                      <td style={{ textAlign: 'center' }}>
                                        {formatDate(inst.dueDate)}
                                      </td>
                                      <td style={{ textAlign: 'center', fontWeight: 700 }}>
                                        {pct}%
                                      </td>
                                      <td style={{ textAlign: 'right', fontWeight: 700 }}>
                                        {formatVnd(amt)}
                                      </td>
                                      <td>
                                        {inst.note || `Thanh toán lần ${idx + 1}`}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                      <br />
                      2. Bên B thanh toán giá trị hợp đồng cho bên A bằng hình thức{' '}
                      <strong>
                        {PAYMENT_METHOD_LABELS[previewContract.commercialTerms?.paymentMethod] || 'chuyển khoản vào tài khoản ngân hàng của bên A'}
                      </strong>
                      , số tài khoản: <strong>{previewContract.supplierId?.bankInfo?.accountNo || '…………'}</strong> mở tại Ngân hàng{' '}
                      <strong>{previewContract.supplierId?.bankInfo?.bankName || '…………'}</strong>{' '}
                      (Chi nhánh: {previewContract.supplierId?.bankInfo?.branch || 'Hội sở chính'}, Chủ tài khoản:{' '}
                      <strong>{previewContract.supplierId?.bankInfo?.accountHolder || previewContract.supplierId?.supplierName}</strong>).
                      <br />
                      &nbsp;&nbsp;&nbsp;&nbsp;• Thời hạn thanh toán phần công nợ còn lại: Trong vòng{' '}
                      <strong>{previewContract.commercialTerms?.paymentCreditDays ?? 30} ngày</strong> kể từ ngày Kỹ thuật viên KCS Bên B ký Biên bản kiểm tra nghiệm thu đạt chuẩn.
                      <br />
                      &nbsp;&nbsp;&nbsp;&nbsp;• Điều kiện giao nhận: <strong>{DELIVERY_TERM_LABELS[previewContract.commercialTerms?.deliveryTerm] || 'Giao tại Kho Nguyên Phụ Liệu Bên A (AraStore)'}</strong>.
                      <br />
                      Đồng tiền sử dụng để thanh toán theo Hợp đồng này là Việt Nam Đồng (viết tắt VNĐ).
                    </div>
                  </div>

                  {/* ĐIỀU 6 */}
                  <div className="wms-legal-section">
                    <div className="wms-legal-section-title">
                      Điều 6: Quyền và nghĩa vụ của bên A
                    </div>
                    <div style={{ lineHeight: '1.75' }}>
                      <strong>1. Quyền của bên A:</strong>
                      <br />
                      - Yêu cầu Bên B tiếp nhận hàng hóa theo đúng kế hoạch, số lượng và thời gian đã được hai bên thống nhất;
                      <br />
                      - Yêu cầu Bên B thực hiện đầy đủ nghĩa vụ thanh toán tiền hàng đúng thời hạn quy định tại Điều 5;
                      <br />
                      - Tạm ngừng giao hàng các đợt tiếp theo nếu Bên B chậm trễ thanh toán tiền hàng đợt trước quá hạn thỏa thuận.
                      <br />
                      <strong>2. Nghĩa vụ của bên A:</strong>
                      <br />
                      - Cung cấp và giao hàng đúng chủng loại, quy cách, phẩm chất kỹ thuật dệt may (khổ vải, gsm, thành phần, màu sắc, độ co rút);
                      <br />
                      - Đảm bảo quy cách đóng gói: cuộn bọc màng nilon 2 lớp chống ẩm, lõi ống giấy cứng chịu lực, dán tem mã vạch Barcode định danh đầu cây vải; số mối nối tối đa không quá <strong>{previewContract.qualityStandards?.maxRollJoints ?? 1} mối/cuộn</strong>;
                      <br />
                      - Cung cấp đầy đủ hóa đơn GTGT hợp pháp, phiếu xuất kho và chứng nhận kiểm định chất lượng (CO/CQ) đi kèm lô hàng;
                      <br />
                      - Chịu trách nhiệm bảo hành, thu hồi, đổi trả hoặc bồi thường thiệt hại đối với các sản phẩm không đạt chuẩn KCS hoặc phát sinh lỗi do nhà sản xuất.
                    </div>
                  </div>

                  {/* ĐIỀU 7 */}
                  <div className="wms-legal-section">
                    <div className="wms-legal-section-title">
                      Điều 7: Quyền và nghĩa vụ của bên B
                    </div>
                    <div style={{ lineHeight: '1.75' }}>
                      <strong>1. Quyền của bên B:</strong>
                      <br />
                      - Tiến hành kiểm định chất lượng KCS theo Hệ thống 4 điểm ASTM D5430 đối với toàn bộ lô hàng trước khi đồng ý nhập kho chính thức;
                      <br />
                      - Từ chối tiếp nhận hoặc yêu cầu Bên A đổi mới toàn bộ lô hàng không đúng quy cách, lỗi dệt nhuộm hoặc không đạt chuẩn KCS;
                      <br />
                      - Yêu cầu Bên A bồi thường thiệt hại nếu giao hàng chậm trễ hoặc giao hàng kém chất lượng gây đình trệ tiến độ may mặc của xưởng sản xuất.
                      <br />
                      <strong>2. Nghĩa vụ của bên B:</strong>
                      <br />
                      - Chuẩn bị kho bãi, nhân sự và phương tiện tiếp nhận hàng hóa theo đúng lịch trình đã thỏa thuận;
                      <br />
                      - Tiến hành kiểm tra KCS và ký Biên bản nghiệm thu kiểm định trong vòng 03 ngày làm việc kể từ thời điểm nhận hàng;
                      <br />
                      - Thực hiện thanh toán đầy đủ, đúng hạn cho Bên A theo quy định tại Điều 5 của Hợp đồng này.
                    </div>
                  </div>

                  {/* ĐIỀU 8 */}
                  <div className="wms-legal-section">
                    <div className="wms-legal-section-title">
                      Điều 8. Bồi thường thiệt hại và phạt vi phạm hợp đồng
                    </div>
                    <div style={{ lineHeight: '1.75' }}>
                      Trong trường hợp mỗi bên thực hiện không đúng hoặc không đầy đủ nghĩa vụ của mình theo Hợp đồng này, bên đó phải chịu trách nhiệm bồi thường cho những tổn thất mà bên kia phải gánh chịu do việc thực hiện không đúng nghĩa vụ đó, bao gồm cả thiệt hại trực tiếp và gián tiếp xảy ra.
                      <br />
                      Mỗi bên thực hiện không đúng hoặc không đầy đủ nghĩa vụ của mình theo Hợp đồng này còn phải chịu một khoản tiền phạt vi phạm hợp đồng với số tiền:
                      <br />
                      - <strong>Phạt giao hàng chậm:</strong> Trường hợp Bên A giao hàng chậm so với tiến độ cam kết, Bên A chịu phạt <strong>0.5%/ngày</strong> trên giá trị phần hàng giao chậm, tổng mức phạt vi phạm không quá <strong>8%</strong> tổng giá trị hợp đồng vi phạm theo Luật Thương mại.
                      <br />
                      - <strong>Xử lý hàng lỗi KCS & Vi phạm phẩm cách:</strong> {previewContract.breachPenaltyClause || 'Bên A có trách nhiệm đổi trả/bổ sung hàng đạt chuẩn trong vòng 5 ngày làm việc. Nếu quá thời hạn không khắc phục được, Bên B có quyền đơn phương chấm dứt hợp đồng, Bên A phải hoàn trả 100% tiền tạm ứng và chịu phạt 8% giá trị lô hàng vi phạm.'}
                    </div>
                  </div>

                  {/* ĐIỀU 9 */}
                  <div className="wms-legal-section">
                    <div className="wms-legal-section-title">
                      Điều 9: Bảo mật
                    </div>
                    <div style={{ lineHeight: '1.75' }}>
                      1. Các Bên có trách nhiệm phải giữ kín tất cả những thông tin liên quan tới Hợp đồng và Phụ lục Hợp đồng, thông tin khách hàng mà mình nhận được từ phía Bên kia trong suốt thời hạn của Hợp đồng.
                      <br />
                      2. Mỗi Bên không được tiết lộ cho bất cứ Bên thứ ba nào bất kỳ thông tin nói trên trừ trường hợp được chấp thuận bằng văn bản của Bên kia hoặc theo yêu cầu của cơ quan quản lý Nhà nước có thẩm quyền.
                      <br />
                      3. Mỗi Bên phải tiến hành mọi biện pháp cần thiết để đảm bảo rằng không một nhân viên nào hay bất cứ ai thuộc sự quản lý của mình vi phạm điều khoản này.
                      <br />
                      4. Điều khoản này vẫn còn hiệu lực ngay cả khi Hợp đồng này hết hiệu lực và hai bên không còn hợp tác.
                    </div>
                  </div>

                  {/* ĐIỀU 10 */}
                  <div className="wms-legal-section">
                    <div className="wms-legal-section-title">
                      Điều 10: Loại trừ trách nhiệm của mỗi bên
                    </div>
                    <div style={{ lineHeight: '1.75' }}>
                      1. Trong trường hợp xảy ra sự kiện bất khả kháng khiến cho mỗi bên không thể thực hiện hoặc thực hiện không đầy đủ quyền và nghĩa vụ của mình theo hợp đồng này thì trách nhiệm bồi thường thiệt hại của mỗi bên được loại trừ.
                      <br />
                      2. Sự kiện bất khả kháng là các sự kiện xảy ra một cách khách quan không thể lường trước được và không thể khắc phục được, mặc dù đã áp dụng mọi biện pháp cần thiết mà khả năng cho phép, bao gồm nhưng không giới hạn ở các sự kiện như thiên tai, hỏa hoạn, lũ lụt, động đất, tai nạn, thảm hoạ, hạn chế về dịch bệnh, nhiễm hạt nhân hoặc phóng xạ, chiến tranh, nội chiến, khởi nghĩa, đình công hoặc bạo loạn, can thiệp của Cơ quan Chính phủ…
                      <br />
                      3. Trong trường hợp xảy ra sự kiện bất khả kháng, mỗi bên phải nhanh chóng thông báo cho bên kia bằng văn bản về việc không thực hiện được nghĩa vụ của mình do sự kiện bất khả kháng, và sẽ, trong thời gian 15 (mười lăm) ngày kể từ ngày xảy ra Sự kiện bất khả kháng, chuyển trực tiếp bằng thư bảo đảm cho Bên kia các bằng chứng về việc xảy ra Sự kiện bất khả kháng và khoảng thời gian xảy ra Sự kiện bất khả kháng đó.
                      <br />
                      Bên thông báo việc thực hiện Hợp đồng của họ trở nên không thể thực hiện được do Sự kiện bất khả kháng có trách nhiệm phải thực hiện mọi nỗ lực để giảm thiểu ảnh hưởng của Sự kiện bất khả kháng đó.
                      <br />
                      4. Khi Sự kiện bất khả kháng xảy ra, thì nghĩa vụ của các Bên tạm thời không thực hiện và sẽ ngay lập tức phục hồi lại các nghĩa vụ của mình theo Hợp đồng khi chấm dứt Sự kiện bất khả kháng hoặc khi Sự kiện bất khả kháng đó bị loại bỏ.
                    </div>
                  </div>

                  {/* ĐIỀU 11 */}
                  <div className="wms-legal-section">
                    <div className="wms-legal-section-title">
                      Điều 11: Sửa đổi, tạm ngừng thực hiện và chấm dứt Hợp đồng
                    </div>
                    <div style={{ lineHeight: '1.75' }}>
                      1. Bất kỳ sửa đổi hoặc bổ sung nào đối với Hợp đồng sẽ chỉ có hiệu lực khi có thoả thuận bằng văn bản của Các Bên (lập thành Phụ lục Hợp đồng).
                      <br />
                      2. Tạm ngừng thực hiện Hợp đồng: Mỗi bên có quyền tạm ngừng thực hiện nghĩa vụ hợp đồng nếu bên kia có hành vi vi phạm nghiêm trọng các cam kết về chất lượng hoặc nghĩa vụ thanh toán quá 15 ngày làm việc và đã có văn bản đôn đốc cảnh báo trước.
                      <br />
                      3. Hợp đồng chấm dứt trong các trường hợp sau:
                      <br />
                      &nbsp;&nbsp;&nbsp;&nbsp;a) Hợp đồng hết hạn và Các Bên không gia hạn Hợp đồng ; hoặc
                      <br />
                      &nbsp;&nbsp;&nbsp;&nbsp;b) Các Bên thỏa thuận chấm dứt Hợp đồng trước thời hạn; trong trường hợp đó, Các Bên sẽ thoả thuận về các điều kiện cụ thể liên quan tới việc chấm dứt Hợp đồng; hoặc
                      <br />
                      &nbsp;&nbsp;&nbsp;&nbsp;c) Một trong Các Bên ngừng kinh doanh, không có khả năng chi trả các khoản nợ đến hạn, lâm vào tình trạng hoặc bị xem là mất khả năng thanh toán, có quyết định giải thể, phá sản. Trong trường hợp này Hợp đồng sẽ kết thúc bằng cách thức do Hai Bên thoả thuận và/hoặc phù hợp với các quy định của pháp luật hiện hành; hoặc
                      <br />
                      4. Thanh lý Hợp đồng : Khi có nhu cầu thanh lý Hợp đồng, hai Bên tiến hành đối soát, thanh toán hoàn thiện các khoản phí. Sau khi hai Bên hoàn thành nghĩa vụ của mình sẽ tiến hành ký kết Biên bản thanh lý Hợp đồng.
                    </div>
                  </div>

                  {/* ĐIỀU 12 */}
                  <div className="wms-legal-section">
                    <div className="wms-legal-section-title">
                      Điều 12. Giải quyết tranh chấp
                    </div>
                    <div style={{ lineHeight: '1.75' }}>
                      Tất cả những phát sinh nếu có liên quan đến hợp đồng này sẽ được giải quyết bằng thương lượng trên tinh thần hợp tác cùng có lợi.
                      <br />
                      Nếu không thương lượng được thì tranh chấp sẽ được giải quyết tại{' '}
                      <strong>
                        {previewContract.disputeResolutionClause ||
                          'Trung tâm trọng tài quốc tế Việt Nam bên cạnh Phòng Thương mại và Công nghiệp Việt Nam (VIAC) theo Quy tắc tố tụng trọng tài của Trung tâm này hoặc Tòa án nhân dân có thẩm quyền tại TP. Hồ Chí Minh'}
                      </strong>
                      . Quyết định của trọng tài là quyết định cuối cùng và phải được các bên tuân theo. Phí trọng tài sẽ do bên thua kiện trả, trừ phi có sự thỏa thuận của hai bên.
                    </div>
                  </div>

                  {/* ĐIỀU 13 */}
                  <div className="wms-legal-section">
                    <div className="wms-legal-section-title">
                      Điều 13: Điều khoản quy định về hiệu lực và giải quyết tranh chấp hợp đồng
                    </div>
                    <div style={{ lineHeight: '1.75' }}>
                      1. Hợp đồng này có hiệu lực từ ngày{' '}
                      <strong>{formatDate(previewContract.effectiveFrom || previewContract.signingDate || previewContract.createdAt)}</strong>{' '}
                      đến hết ngày <strong>{formatDate(resolveContractEffectiveTo(previewContract))}</strong>.
                      <br />
                      2. Trong vòng một (01) tháng trước khi thời hạn hợp đồng kết thúc, nếu hai bên trong hợp đồng không có ý kiến gì thì hợp đồng này được tự động gia hạn 12 (Mười hai) tháng tiếp theo và chỉ được gia hạn 01 lần.
                      <br />
                      Hợp đồng này được lập thành 02 (hai) bản, mỗi bên giữ 01 (một) bản có giá trị pháp lý như nhau.
                    </div>
                  </div>

                  {/* CHỮ KÝ 2 BÊN CHUẨN ĐẠI DIỆN BÊN A & BÊN B */}
                  <div className="wms-legal-signatures">
                    <div>
                      <strong>ĐẠI DIỆN BÊN A</strong>
                      <div style={{ fontSize: '12px', fontStyle: 'italic', marginTop: '2px' }}>
                        (Ký, ghi rõ họ tên và đóng dấu)
                      </div>
                      <div style={{ height: '75px' }}></div>
                      <strong>
                        {previewContract.supplierId?.representativeName ||
                          previewContract.supplierId?.contactName ||
                          previewContract.supplierId?.supplierName}
                      </strong>
                    </div>

                    <div>
                      <strong>ĐẠI DIỆN BÊN B</strong>
                      <div style={{ fontSize: '12px', fontStyle: 'italic', marginTop: '2px' }}>
                        (Ký, ghi rõ họ tên và đóng dấu)
                      </div>
                      <div style={{ height: '75px' }}></div>
                      <strong>
                        {previewContract.buyerInfo?.representativeName || 'Trần Hoàng'}
                      </strong>
                    </div>
                  </div>
                </article>
              </div>

              <div className="wms-modal-footer no-print">
                {previewContract.status !== 'TERMINATED' && previewContract.status !== 'SUPERSEDED' && (
                  <button
                    type="button"
                    className="wms-btn wms-btn-danger"
                    style={{
                      marginRight: 'auto',
                      backgroundColor: '#DC2626',
                      color: '#FFFFFF',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontWeight: 600,
                    }}
                    onClick={() => {
                      const c = previewContract;
                      setPreviewContract(null);
                      handleOpenTerminateModal(c);
                    }}
                  >
                    <Ban size={16} />
                    Chấm dứt Hợp đồng này
                  </button>
                )}
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
                  <Printer size={16} />
                  In Hợp đồng / Xuất PDF
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL: IN KHUNG HỢP ĐỒNG MẪU (BẢN TRỐNG ĐIỀN TAY KÝ KẾT - CHUẨN 12 ĐIỀU KHOẢN PHÁP LÝ) */}
      {showBlankTemplateModal && (
        <div className="wms-modal-backdrop" role="dialog" aria-modal="true">
          <div className="wms-modal-dialog wide">
            <div className="wms-modal-header no-print">
              <div>
                <h2 className="wms-modal-title">
                  Khung Hợp đồng Cung ứng Nguyên phụ liệu (Bản mẫu in điền tay)
                </h2>
                <div className="wms-helper-text" style={{ fontSize: '12px', marginTop: '2px' }}>
                  Bản mẫu chuẩn hóa pháp lý 12 Điều khoản bỏ trống các trường thông tin để Owner in ra mang đi ký kết và tự điền tay.
                </div>
              </div>
              <button
                type="button"
                className="wms-btn wms-btn-default wms-btn-sm"
                onClick={() => setShowBlankTemplateModal(false)}
              >
                <X size={16} />
                Đóng
              </button>
            </div>

            <div className="wms-modal-body">
              <article className="wms-legal-doc printable-contract-doc">
                <header className="wms-legal-header">
                  <div className="wms-legal-nation">
                    CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM
                  </div>
                  <div className="wms-legal-motto">
                    Độc lập – Tự do – Hạnh phúc
                  </div>
                  <div className="wms-national-motto-line"></div>

                  <div className="wms-legal-title">
                    HỢP ĐỒNG NGUYÊN TẮC
                  </div>
                  <div className="wms-legal-subtitle">
                    (V/v mua bán hàng hóa <span className="wms-blank-field-line" style={{ width: '320px' }}></span>)
                  </div>
                  <div className="wms-legal-meta">
                    Số: <strong>HDK-2026 / </strong><span className="wms-blank-field-line" style={{ width: '180px' }}></span>
                  </div>

                  <div className="wms-legal-preamble">
                    - Căn cứ Bộ Luật Dân sự số 91/2015/QH13 được Quốc hội nước CHXHCN Việt Nam thông qua ngày 24/11/2015;<br />
                    - Căn cứ Luật Thương mại số 36/2005/QH11 do Quốc hội nước Cộng hòa xã hội chủ nghĩa Việt Nam thông qua ngày 14 tháng 6 năm 2005;<br />
                    - Căn cứ Hợp đồng nguyên tắc về việc cung cấp hàng hóa <span className="wms-blank-field-line" style={{ width: '140px' }}></span> số <span className="wms-blank-field-line" style={{ width: '100px' }}></span> ngày <span className="wms-blank-field-line" style={{ width: '30px' }}></span>/<span className="wms-blank-field-line" style={{ width: '30px' }}></span>/20<span className="wms-blank-field-line" style={{ width: '25px' }}></span>;<br />
                    - Căn cứ nhu cầu và khả năng của hai Bên,
                  </div>
                </header>

                <p style={{ margin: '8px 0 14px 0' }}>
                  Hôm nay, ngày <span className="wms-blank-field-line" style={{ width: '35px' }}></span> tháng <span className="wms-blank-field-line" style={{ width: '35px' }}></span> năm 2026, tại <span className="wms-blank-field-line" style={{ width: '360px' }}></span> chúng tôi gồm:
                </p>

                {/* BÊN BÁN (BÊN A) */}
                <div className="wms-legal-section">
                  <div style={{ lineHeight: '1.9' }}>
                    <strong>BÊN BÁN: </strong>
                    <span className="wms-blank-field-line" style={{ width: '75%' }}></span>
                    <br />
                    • Địa chỉ: <span className="wms-blank-field-line" style={{ width: '85%' }}></span>
                    <br />
                    • Điện thoại: <span className="wms-blank-field-line" style={{ width: '200px' }}></span>
                    <span style={{ margin: '0 16px' }}>|</span>
                    Fax: <span className="wms-blank-field-line" style={{ width: '180px' }}></span>
                    <br />
                    • Số ĐKKD: <span className="wms-blank-field-line" style={{ width: '180px' }}></span>
                    <span style={{ margin: '0 10px' }}>Cấp ngày:</span>
                    <span className="wms-blank-field-line" style={{ width: '100px' }}></span>
                    <span style={{ margin: '0 10px' }}>tại:</span>
                    <span className="wms-blank-field-line" style={{ width: '180px' }}></span>
                    <br />
                    • Mã số thuế: <span className="wms-blank-field-line" style={{ width: '220px' }}></span>
                    <br />
                    • Đại diện: <span className="wms-blank-field-line" style={{ width: '240px' }}></span>
                    <span style={{ margin: '0 16px' }}>|</span>
                    Chức vụ: <span className="wms-blank-field-line" style={{ width: '200px' }}></span>
                    <br />
                    <em>(Sau đây gọi là “Bên A”)</em>
                  </div>
                </div>

                {/* BÊN MUA (BÊN B) */}
                <div className="wms-legal-section">
                  <div style={{ lineHeight: '1.9' }}>
                    <strong>BÊN MUA: </strong>
                    <span className="wms-blank-field-line" style={{ width: '75%' }}>CÔNG TY TNHH THỜI TRANG & KHO VẬN ARA (ARASTORE)</span>
                    <br />
                    • Địa chỉ: <span className="wms-blank-field-line" style={{ width: '85%' }}>Kho Tổng Nguyên Phụ Liệu AraStore – KCN Tân Bình, TP. Hồ Chí Minh</span>
                    <br />
                    • Điện thoại: <span className="wms-blank-field-line" style={{ width: '200px' }}>028-3888-9999</span>
                    <span style={{ margin: '0 16px' }}>|</span>
                    Fax: <span className="wms-blank-field-line" style={{ width: '180px' }}>028-3888-9998</span>
                    <br />
                    • Số ĐKKD : <span className="wms-blank-field-line" style={{ width: '180px' }}>0109888999</span>
                    <span style={{ margin: '0 10px' }}>Cấp ngày:</span>
                    <span className="wms-blank-field-line" style={{ width: '100px' }}>15/01/2020</span>
                    <span style={{ margin: '0 10px' }}>tại:</span>
                    <span className="wms-blank-field-line" style={{ width: '180px' }}>Sở KH&ĐT TP.HCM</span>
                    <br />
                    • Mã số thuế : <span className="wms-blank-field-line" style={{ width: '220px' }}>0109888999</span>
                    <br />
                    • Đại diện : <span className="wms-blank-field-line" style={{ width: '240px' }}>Ông TRẦN HOÀNG</span>
                    <span style={{ margin: '0 16px' }}>|</span>
                    Chức vụ: <span className="wms-blank-field-line" style={{ width: '200px' }}>Chủ sở hữu / Giám đốc</span>
                    <br />
                    <em>(Sau đây gọi là “Bên B”)</em>
                  </div>
                </div>

                {/* XÉT RẰNG */}
                <div className="wms-legal-section">
                  <strong>XÉT RẰNG:</strong>
                  <div style={{ margin: '4px 0 8px 0', lineHeight: '1.8' }}>
                    - Bên A là một doanh nghiệp Việt Nam hoạt động trong lĩnh vực <span className="wms-blank-field-line" style={{ width: '300px' }}></span> tại Việt Nam, có khả năng <span className="wms-blank-field-line" style={{ width: '250px' }}></span>;
                    <br />
                    - Bên B là một doanh nghiệp Việt Nam hoạt động trong lĩnh vực <span className="wms-blank-field-line" style={{ width: '300px' }}></span> có nhu cầu <span className="wms-blank-field-line" style={{ width: '250px' }}></span>;
                  </div>
                  <p style={{ margin: '6px 0 12px 0' }}>
                    Sau khi thỏa thuận, hai Bên cùng đồng ý ký kết Hợp đồng nguyên tắc về việc cung ứng hàng hóa <span className="wms-blank-field-line" style={{ width: '280px' }}></span> cho bên B (sau đây gọi là “Hợp đồng”) với các điều khoản sau:
                  </p>
                </div>

                {/* ĐIỀU 1 */}
                <div className="wms-legal-section">
                  <div className="wms-legal-section-title">
                    Điều 1: Các nguyên tắc chung
                  </div>
                  <div style={{ lineHeight: '1.75' }}>
                    1. Hai Bên tham gia ký kết Hợp đồng này trên cơ sở quan hệ Bạn hàng, bình đẳng và cùng có lợi theo đúng các quy định của Pháp luật.
                    <br />
                    2. Các nội dung trong bản hợp đồng nguyên tắc này chỉ được sửa đổi khi có sự thỏa thuận của hai bên và được thống nhất bằng văn bản. Văn bản thay đổi nội dung hợp đồng nguyên tắc này được xem là Phụ lục và là một phần không thể tách rời của Hợp đồng.
                    <br />
                    3. Các nội dung hợp tác, mua bán hàng hóa cụ thể theo từng thời điểm sẽ được cụ thể hóa trong các bản Hợp đồng mua bán cụ thể.
                    <br />
                    4. Điều khoản nào trong Hợp đồng mua bán mâu thuẫn với các điều khoản trong Hợp đồng này thì sẽ thực hiện theo các điều khoản được quy định trong Hợp đồng này.
                    <br />
                    5. Các tài liệu có liên quan và gắn liền với hợp đồng này bao gồm :
                    <br />
                    &nbsp;&nbsp;&nbsp;&nbsp;- Các hợp đồng mua bán cụ thể theo từng thời điểm trong thời gian Hợp đồng nguyên tắc này có hiệu lực;
                    <br />
                    &nbsp;&nbsp;&nbsp;&nbsp;- <span className="wms-blank-field-line" style={{ width: '80%' }}></span>
                    <br />
                    &nbsp;&nbsp;&nbsp;&nbsp;- <span className="wms-blank-field-line" style={{ width: '80%' }}></span>
                  </div>
                </div>

                {/* ĐIỀU 2 */}
                <div className="wms-legal-section">
                  <div className="wms-legal-section-title">
                    Điều 2. Giải thích từ ngữ
                  </div>
                  <div style={{ lineHeight: '1.75' }}>
                    Trong phạm vi hợp đồng này và các tài liệu khác liên quan và gắn liền với hợp đồng này, các từ ngữ dưới đây được hiểu như sau :
                    <br />
                    1. Hợp đồng nguyên tắc là hợp đồng thể hiện những nguyên tắc chung làm cơ sở cho sự hợp tác giữa hai bên trong quan hệ cung ứng hàng hóa <span className="wms-blank-field-line" style={{ width: '280px' }}></span> và là cơ sở cho các Hợp đồng mua bán cụ thể sau này.
                    <br />
                    2. <span className="wms-blank-field-line" style={{ width: '95%' }}></span>
                  </div>
                </div>

                {/* ĐIỀU 3 */}
                <div className="wms-legal-section">
                  <div className="wms-legal-section-title">
                    Điều 3: Hàng hóa mua bán
                  </div>
                  <p style={{ margin: '4px 0 8px 0' }}>
                    Bên A đồng ý bán và bên B đồng ý mua số hàng hóa cụ thể như sau:
                  </p>
                  <div className="wms-table-scroll">
                    <table className="wms-blank-table">
                      <thead>
                        <tr>
                          <th style={{ width: '45px' }}>STT</th>
                          <th>TÊN HÀNG HÓA</th>
                          <th style={{ width: '90px' }}>Đ.vị tính</th>
                          <th>Quy cách – Chủng loại</th>
                          <th>Xuất xứ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[1, 2, 3, 4, 5].map((rowNum) => (
                          <tr key={rowNum} className="wms-blank-table-empty-row">
                            <td style={{ textAlign: 'center' }}>{rowNum}</td>
                            <td></td>
                            <td></td>
                            <td></td>
                            <td></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ lineHeight: '1.8', marginTop: '6px' }}>
                    - Đơn giá: theo bảng báo giá của bên B có sự xác nhận của Bên A.
                    <br />
                    - Khối lượng cụ thể được thể hiện bằng các bản hợp đồng mua bán cụ thể được ký kết giữa hai bên.
                  </div>
                </div>

                {/* ĐIỀU 4 */}
                <div className="wms-legal-section">
                  <div className="wms-legal-section-title">
                    Điều 4. Giá trị hợp đồng và phương thức thanh toán
                  </div>
                  <div style={{ lineHeight: '1.8' }}>
                    1. Giá trị hợp đồng là tạm tính căn cứ vào đơn giá được xác nhận giữa 2 bên từng thời điểm và khối lượng thực tế được nghiệm thu giữa hai bên.
                    <br />
                    2. Bên B thanh toán giá trị hợp đồng cho bên A bằng hình thức giao nhận tiền mặt hoặc chuyển khoản vào tài khoản ngân hàng của bên A, số tài khoản <span className="wms-blank-field-line" style={{ width: '220px' }}></span> mở tại Ngân hàng <span className="wms-blank-field-line" style={{ width: '340px' }}></span>
                    <br />
                    Đồng tiền sử dụng để thanh toán theo Hợp đồng này là Việt Nam Đồng (viết tắt VNĐ).
                  </div>
                </div>

                {/* ĐIỀU 5 */}
                <div className="wms-legal-section">
                  <div className="wms-legal-section-title">
                    Điều 5: Quyền và nghĩa vụ của bên A
                  </div>
                  <div style={{ lineHeight: '1.8' }}>
                    <strong>1. Quyền của bên A</strong>
                    <br />
                    <span className="wms-blank-field-line" style={{ width: '98%' }}></span>
                    <br />
                    <span className="wms-blank-field-line" style={{ width: '98%' }}></span>
                    <br />
                    <span className="wms-blank-field-line" style={{ width: '98%' }}></span>
                    <br />
                    <strong>2. Nghĩa vụ của bên A</strong>
                    <br />
                    <span className="wms-blank-field-line" style={{ width: '98%' }}></span>
                    <br />
                    <span className="wms-blank-field-line" style={{ width: '98%' }}></span>
                    <br />
                    <span className="wms-blank-field-line" style={{ width: '98%' }}></span>
                  </div>
                </div>

                {/* ĐIỀU 6 */}
                <div className="wms-legal-section">
                  <div className="wms-legal-section-title">
                    Điều 6: Quyền và nghĩa vụ của bên B
                  </div>
                  <div style={{ lineHeight: '1.8' }}>
                    <strong>1. Quyền của bên B</strong>
                    <br />
                    <span className="wms-blank-field-line" style={{ width: '98%' }}></span>
                    <br />
                    <span className="wms-blank-field-line" style={{ width: '98%' }}></span>
                    <br />
                    <span className="wms-blank-field-line" style={{ width: '98%' }}></span>
                    <br />
                    <strong>2. Nghĩa vụ của bên B</strong>
                    <br />
                    <span className="wms-blank-field-line" style={{ width: '98%' }}></span>
                    <br />
                    <span className="wms-blank-field-line" style={{ width: '98%' }}></span>
                    <br />
                    <span className="wms-blank-field-line" style={{ width: '98%' }}></span>
                  </div>
                </div>

                {/* ĐIỀU 7 */}
                <div className="wms-legal-section">
                  <div className="wms-legal-section-title">
                    Điều 7. Bồi thường thiệt hại và phạt vi phạm hợp đồng
                  </div>
                  <div style={{ lineHeight: '1.8' }}>
                    Trong trường hợp mỗi bên thực hiện không đúng hoặc không đầy đủ nghĩa vụ của mình theo Hợp đồng này, bên đó phải chịu trách nhiệm bồi thường cho những tổn thất mà bên kia phải gánh chịu do việc thực hiện không đúng nghĩa vụ đó, bao gồm cả thiệt hại trực tiếp và gián tiếp xảy ra.
                    <br />
                    Mỗi bên thực hiện không đúng hoặc không đầy đủ nghĩa vụ của mình theo Hợp đồng này còn phải chịu một khoản tiền phạt vi phạm hợp đồng với số tiền <span className="wms-blank-field-line" style={{ width: '350px' }}></span>
                  </div>
                </div>

                {/* ĐIỀU 8 */}
                <div className="wms-legal-section">
                  <div className="wms-legal-section-title">
                    Điều 8: Bảo mật
                  </div>
                  <div style={{ lineHeight: '1.75' }}>
                    1. Các Bên có trách nhiệm phải giữ kín tất cả những thông tin liên quan tới Hợp đồng và Phụ lục Hợp đồng, thông tin khách hàng mà mình nhận được từ phía Bên kia trong suốt thời hạn của Hợp đồng.
                    <br />
                    2. Mỗi Bên không được tiết lộ cho bất cứ Bên thứ ba nào bất kỳ thông tin nói trên trừ trường hợp được chấp thuận bằng văn bản của Bên kia hoặc theo yêu cầu của cơ quan quản lý Nhà nước có thẩm quyền.
                    <br />
                    3. Mỗi Bên phải tiến hành mọi biện pháp cần thiết để đảm bảo rằng không một nhân viên nào hay bất cứ ai thuộc sự quản lý của mình vi phạm điều khoản này.
                    <br />
                    4. Điều khoản này vẫn còn hiệu lực ngay cả khi Hợp đồng này hết hiệu lực và hai bên không còn hợp tác.
                  </div>
                </div>

                {/* ĐIỀU 9 */}
                <div className="wms-legal-section">
                  <div className="wms-legal-section-title">
                    Điều 9: Loại trừ trách nhiệm của mỗi bên
                  </div>
                  <div style={{ lineHeight: '1.75' }}>
                    1. Trong trường hợp xảy ra sự kiện bất khả kháng khiến cho mỗi bên không thể thực hiện hoặc thực hiện không đầy đủ quyền và nghĩa vụ của mình theo hợp đồng này thì trách nhiệm bồi thường thiệt hại của mỗi bên được loại trừ.
                    <br />
                    2. Sự kiện bất khả kháng là các sự kiện xảy ra một cách khách quan không thể lường trước được và không thể khắc phục được, mặc dù đã áp dụng mọi biện pháp cần thiết mà khả năng cho phép, bao gồm nhưng không giới hạn ở các sự kiện như thiên tai, hỏa hoạn, lũ lụt, động đất, tai nạn, thảm hoạ, hạn chế về dịch bệnh, nhiễm hạt nhân hoặc phóng xạ, chiến tranh, nội chiến, khởi nghĩa, đình công hoặc bạo loạn, can thiệp của Cơ quan Chính phủ…
                    <br />
                    3. Trong trường hợp xảy ra sự kiện bất khả kháng, mỗi bên phải nhanh chóng thông báo cho bên kia bằng văn bản về việc không thực hiện được nghĩa vụ của mình do sự kiện bất khả kháng, và sẽ, trong thời gian 15 (mười lăm) ngày kể từ ngày xảy ra Sự kiện bất khả kháng, chuyển trực tiếp bằng thư bảo đảm cho Bên kia các bằng chứng về việc xảy ra Sự kiện bất khả kháng và khoảng thời gian xảy ra Sự kiện bất khả kháng đó.
                    <br />
                    Bên thông báo việc thực hiện Hợp đồng của họ trở nên không thể thực hiện được do Sự kiện bất khả kháng có trách nhiệm phải thực hiện mọi nỗ lực để giảm thiểu ảnh hưởng của Sự kiện bất khả kháng đó.
                    <br />
                    4. Khi Sự kiện bất khả kháng xảy ra, thì nghĩa vụ của các Bên tạm thời không thực hiện và sẽ ngay lập tức phục hồi lại các nghĩa vụ của mình theo Hợp đồng khi chấm dứt Sự kiện bất khả kháng hoặc khi Sự kiện bất khả kháng đó bị loại bỏ.
                  </div>
                </div>

                {/* ĐIỀU 10 */}
                <div className="wms-legal-section">
                  <div className="wms-legal-section-title">
                    Điều 10: Sửa đổi, tạm ngừng thực hiện và chấm dứt Hợp đồng
                  </div>
                  <div style={{ lineHeight: '1.75' }}>
                    1. Bất kỳ sửa đổi hoặc bổ sung nào đối với Hợp đồng sẽ chỉ có hiệu lực khi có thoả thuận bằng văn bản của Các Bên.
                    <br />
                    2. Tạm ngừng thực hiện Hợp đồng:
                    <br />
                    <span className="wms-blank-field-line" style={{ width: '98%' }}></span>
                    <br />
                    <span className="wms-blank-field-line" style={{ width: '98%' }}></span>
                    <br />
                    3. Hợp đồng chấm dứt trong các trường hợp sau:
                    <br />
                    &nbsp;&nbsp;&nbsp;&nbsp;a) Hợp đồng hết hạn và Các Bên không gia hạn Hợp đồng ; hoặc
                    <br />
                    &nbsp;&nbsp;&nbsp;&nbsp;b) Các Bên thỏa thuận chấm dứt Hợp đồng trước thời hạn; trong trường hợp đó, Các Bên sẽ thoả thuận về các điều kiện cụ thể liên quan tới việc chấm dứt Hợp đồng; hoặc
                    <br />
                    &nbsp;&nbsp;&nbsp;&nbsp;c) Một trong Các Bên ngừng kinh doanh, không có khả năng chi trả các khoản nợ đến hạn, lâm vào tình trạng hoặc bị xem là mất khả năng thanh toán, có quyết định giải thể, phá sản. Trong trường hợp này Hợp đồng sẽ kết thúc bằng cách thức do Hai Bên thoả thuận và/hoặc phù hợp với các quy định của pháp luật hiện hành; hoặc
                    <br />
                    4. Thanh lý Hợp đồng : Khi có nhu cầu thanh lý Hợp đồng, hai Bên tiến hành đối soát, thanh toán hoàn thiện các khoản phí. Sau khi hai Bên hoàn thành nghĩa vụ của mình sẽ tiến hành ký kết Biên bản thanh lý Hợp đồng.
                  </div>
                </div>

                {/* ĐIỀU 11 */}
                <div className="wms-legal-section">
                  <div className="wms-legal-section-title">
                    Điều 11. Giải quyết tranh chấp
                  </div>
                  <div style={{ lineHeight: '1.75' }}>
                    Tất cả những phát sinh nếu có liên quan đến hợp đồng này sẽ được giải quyết bằng thương lượng.
                    <br />
                    Nếu không thương lượng được thì tranh chấp sẽ được giải quyết tại Trung tâm trọng tài quốc tế Việt Nam bên cạnh phòng thương mại và công nghiệp Việt Nam theo Quy tắc tố tụng trọng tài của Trung tâm này. Quyết định của trọng tài là quyết định cuối cùng và phải được các bên tuân theo. Phí trọng tài sẽ do bên thua kiện trả, trừ phi có sự thỏa thuận của hai bên.
                  </div>
                </div>

                {/* ĐIỀU 12 */}
                <div className="wms-legal-section">
                  <div className="wms-legal-section-title">
                    Điều 12: Điều khoản quy định về hiệu lực và giải quyết tranh chấp hợp đồng
                  </div>
                  <div style={{ lineHeight: '1.75' }}>
                    1. Hợp đồng này có hiệu lực từ ngày ký đến hết ngày <span className="wms-blank-field-line" style={{ width: '35px' }}></span>/<span className="wms-blank-field-line" style={{ width: '35px' }}></span>/20<span className="wms-blank-field-line" style={{ width: '25px' }}></span>.
                    <br />
                    2. Trong vòng một (01) tháng trước khi thời hạn hợp đồng kết thúc, nếu hai bên trong hợp đồng không có ý kiến gì thì hợp đồng này được tự động gia hạn 12 (Mười hai) tháng tiếp theo và chỉ được gia hạn 01 lần.
                    <br />
                    Hợp đồng này được lập thành 02 (hai) bản, mỗi bên giữ 01 (một) bản có giá trị pháp lý như nhau.
                  </div>
                </div>

                {/* CHỮ KÝ 2 BÊN */}
                <div className="wms-legal-signatures" style={{ marginTop: '36px' }}>
                  <div>
                    <strong>ĐẠI DIỆN BÊN A</strong>
                    <div style={{ fontSize: '12px', fontStyle: 'italic', marginTop: '2px' }}>
                      (Ký, ghi rõ họ tên & đóng dấu)
                    </div>
                    <div style={{ height: '80px' }}></div>
                    <span className="wms-blank-field-line" style={{ width: '200px' }}></span>
                  </div>

                  <div>
                    <strong>ĐẠI DIỆN BÊN B</strong>
                    <div style={{ fontSize: '12px', fontStyle: 'italic', marginTop: '2px' }}>
                      (Ký, ghi rõ họ tên & đóng dấu)
                    </div>
                    <div style={{ height: '80px' }}></div>
                    <span className="wms-blank-field-line" style={{ width: '200px' }}></span>
                  </div>
                </div>
              </article>
            </div>

            <div className="wms-modal-footer no-print">
              <button
                type="button"
                className="wms-btn wms-btn-default"
                onClick={() => setShowBlankTemplateModal(false)}
              >
                Đóng
              </button>
              <button
                type="button"
                className="wms-btn wms-btn-primary"
                onClick={() => window.print()}
              >
                <Printer size={16} />
                In Hợp đồng mẫu / Xuất PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CHẤM DỨT HỢP ĐỒNG (CÓ GHI CHÚ LÝ DO) */}
      {selectedForTerminate && (
        <div className="wms-modal-backdrop" role="dialog" aria-modal="true">
          <div className="wms-modal-dialog" style={{ maxWidth: '540px' }}>
            <div className="wms-modal-header">
              <div>
                <h2 className="wms-modal-title" style={{ color: '#E11D48', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <XCircle size={18} />
                  <span>Chấm dứt Hợp đồng: {selectedForTerminate.contractCode}</span>
                </h2>
                <div className="wms-helper-text" style={{ fontSize: '12px' }}>
                  NCC: <strong>{selectedForTerminate.supplierId?.supplierName || '—'}</strong> • Trạng thái hiện tại: {selectedForTerminate.status}
                </div>
              </div>
              <button
                type="button"
                className="wms-btn wms-btn-default wms-btn-sm"
                onClick={() => setSelectedForTerminate(null)}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleConfirmTerminate}>
              <div className="wms-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div
                  style={{
                    padding: '12px',
                    borderRadius: '6px',
                    background: '#FFF1F2',
                    border: '1px solid #FECDD3',
                    fontSize: '12.5px',
                    color: '#9F1239',
                    lineHeight: 1.5,
                  }}
                >
                  <strong>Cảnh báo quan trọng:</strong> Khi xác nhận chấm dứt, hợp đồng này sẽ chuyển sang trạng thái <strong>ĐÃ CHẤM DỨT (TERMINATED)</strong>. Mọi kế hoạch tiếp nhận mới và hoạt động mua bán liên quan sẽ bị ngừng hiệu lực.
                </div>

                <div className={`wms-field ${terminateErrors.reason ? 'has-error' : ''}`}>
                  <label htmlFor="term-reason" className="wms-label">
                    Lý do / Ghi chú chấm dứt hợp đồng <span className="wms-required">*</span>
                  </label>
                  <textarea
                    id="term-reason"
                    className="wms-textarea"
                    rows={4}
                    placeholder="Nhập lý do cụ thể chấm dứt hợp đồng (Ví dụ: Hai bên thống nhất thanh lý hợp đồng trước hạn do thay đổi kế hoạch sản xuất; Nhà cung ứng vi phạm nghiêm trọng tiến độ giao hàng...)"
                    value={terminateReason}
                    onChange={(e) => {
                      setTerminateReason(e.target.value);
                      if (terminateErrors.reason) {
                        setTerminateErrors({});
                      }
                    }}
                    required
                    autoFocus
                  />
                  {terminateErrors.reason && (
                    <span className="wms-field-error-text">
                      <AlertCircle size={12} /> {terminateErrors.reason}
                    </span>
                  )}
                  <span className="wms-helper-text" style={{ fontSize: '11.5px', marginTop: '4px' }}>
                    Lý do chấm dứt này sẽ được lưu cố định vào hồ sơ pháp lý và kiểm toán để đối soát sau này.
                  </span>
                </div>
              </div>

              <div className="wms-modal-footer">
                <button
                  type="button"
                  className="wms-btn wms-btn-default"
                  onClick={() => setSelectedForTerminate(null)}
                  disabled={submittingTerminate}
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="wms-btn wms-btn-danger"
                  disabled={submittingTerminate}
                >
                  {submittingTerminate ? 'Đang chấm dứt...' : 'Xác nhận Chấm dứt Hợp đồng'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: LỊCH SỬ CÁC PHIÊN BẢN HỢP ĐỒNG (VERSION HISTORY) */}
      {historyModalContract && (
        <div
          className="wms-modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={() => setHistoryModalContract(null)}
        >
          <div
            className="wms-modal-dialog wide"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="wms-modal-header">
              <div>
                <h2
                  className="wms-modal-title"
                  style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <History size={20} />
                  Lịch sử các Phiên bản Hợp đồng
                </h2>
                <p
                  className="wms-helper-text"
                  style={{ margin: '4px 0 0 0', fontSize: '13px' }}
                >
                  Theo dõi toàn bộ các phiên bản điều chỉnh và phụ lục của hợp đồng gốc{' '}
                  <strong>
                    {historyModalContract.contractCode.replace(/-V\d+$/i, '')}
                  </strong>
                </p>
              </div>
              <button
                type="button"
                className="wms-btn wms-btn-default wms-btn-sm"
                onClick={() => setHistoryModalContract(null)}
              >
                <X size={16} />
              </button>
            </div>

            <div className="wms-modal-body">
              {loadingVersions ? (
                <div style={{ textAlign: 'center', padding: '40px' }}>
                  <RefreshCw size={24} className="wms-spin" />
                  <p style={{ marginTop: '8px' }}>Đang tải lịch sử các phiên bản...</p>
                </div>
              ) : contractVersionsList.length === 0 ? (
                <div className="wms-empty-notice">
                  Không tìm thấy phiên bản liên quan.
                </div>
              ) : (
                <div className="wms-table-scroll">
                  <table className="wms-table">
                    <thead>
                      <tr>
                        <th style={{ width: '80px' }}>Version</th>
                        <th>Số Hợp đồng & Tiêu đề</th>
                        <th>Trạng thái</th>
                        <th>Thời hạn Hiệu lực</th>
                        <th className="wms-td-number">Tổng giá trị</th>
                        <th>Lý do điều chỉnh (Phụ lục)</th>
                        <th style={{ width: '90px' }}>Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contractVersionsList.map((ver, vIdx) => {
                        const vBadge = CONTRACT_STATUS_BADGE[ver.status] || {
                          label: ver.status,
                          cls: 'wms-status-pending',
                        };
                        return (
                          <tr key={ver._id || ver.id || vIdx}>
                            <td>
                              <span className="wms-badge-version">
                                v{ver.versionNumber || 1}
                              </span>
                            </td>
                            <td>
                              <strong>{ver.contractCode}</strong>
                              <div
                                className="wms-helper-text"
                                style={{ fontSize: '12px' }}
                              >
                                {ver.contractTitle}
                              </div>
                            </td>
                            <td>
                              <span className={`wms-status-badge ${vBadge.cls}`}>
                                {vBadge.label}
                              </span>
                            </td>
                            <td>
                              <div>Ký: {formatDate(ver.signingDate || ver.createdAt)}</div>
                              <div className="wms-helper-text">
                                HL: {formatDate(ver.effectiveFrom || ver.createdAt)} →{' '}
                                {formatDate(resolveContractEffectiveTo(ver))}
                              </div>
                            </td>
                            <td className="wms-td-number" style={{ fontWeight: 700 }}>
                              {formatVnd(ver.totalContractAmount)}
                            </td>
                            <td>
                              <span
                                className="wms-helper-text"
                                style={{ fontStyle: 'italic' }}
                              >
                                {ver.amendmentReason ||
                                  ((ver.versionNumber || 1) > 1
                                    ? 'Phụ lục điều chỉnh'
                                    : 'Khởi tạo ban đầu')}
                              </span>
                            </td>
                            <td>
                              <button
                                type="button"
                                className="wms-btn wms-btn-default wms-btn-sm"
                                onClick={() => {
                                  setPreviewContract(ver);
                                }}
                                title="Xem nội dung chi tiết phiên bản này"
                              >
                                <Eye size={12} />
                                <span>Xem</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="wms-modal-footer">
              <button
                type="button"
                className="wms-btn wms-btn-default"
                onClick={() => setHistoryModalContract(null)}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ContractFrameworkPage;

