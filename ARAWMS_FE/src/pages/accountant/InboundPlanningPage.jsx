import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  AlertCircle,
  AlertTriangle,
  Calendar,
  CalendarClock,
  Plus,
  RefreshCw,
  X,
  Eye,
  Image as ImageIcon,
  Trash2,
  ZoomIn,
  UploadCloud,
  FileText,
  Check,
  CheckCircle2,
  Clock,
  Building2,
  Layers,
  Scale,
  ShieldCheck,
  Search,
  GitBranch,
  History,
  Sparkles,
  Info,
  Wrench,
  Ban,
  Truck,
  PackageCheck,
  Send,
  ChevronDown,
} from 'lucide-react';
import accountantProcurementApi from '../../services/accountantProcurementApi.js';
import { validateInboundPlanForm } from '../../utils/procurementValidation.js';

const PLAN_STATUS_BADGE = {
  SCHEDULED: {
    label: 'Chờ tiếp nhận',
    cls: 'wms-status-reserved',
  },
  IN_INSPECTION: {
    label: 'Đang kiểm định',
    cls: 'wms-status-processing',
  },
  VERIFIED_MATCHED: {
    label: 'KCS đạt chuẩn',
    cls: 'wms-status-available',
  },
  DEVIATION_REPORTED: {
    label: 'Sai lệch KCS',
    cls: 'wms-status-damaged',
  },
  RESOLVED_SUPERSEDED: {
    label: 'Đã thay thế',
    cls: 'wms-status-superseded',
  },
  CANCELLED: {
    label: 'Đã hủy lịch',
    cls: 'wms-status-rejected',
  },
};

const renderComplianceBadge = (plan) => {
  if (plan.status === 'RESOLVED_SUPERSEDED') {
    return (
      <span
        className="wms-status-badge wms-status-superseded"
        title="Kế hoạch này đã được nâng cấp lên phiên bản mới"
      >
        Đã thay thế (v{plan.versionNumber || 1})
      </span>
    );
  }

  if (plan.status === 'CANCELLED') {
    return (
      <span className="wms-status-badge wms-status-rejected">
        Đã hủy lịch
      </span>
    );
  }

  const isResolved = plan.deviationResolution?.status === 'RESOLVED';
  const isMismatched =
    plan.deliveryComplianceStatus === 'MISMATCHED' ||
    plan.status === 'DEVIATION_REPORTED' ||
    plan.technicianVerification?.isMatchedWithPlan === false;
  const isMatched =
    plan.deliveryComplianceStatus === 'MATCHED' ||
    plan.status === 'VERIFIED_MATCHED' ||
    plan.technicianVerification?.isMatchedWithPlan === true;
  const isUnderInspection = plan.status === 'UNDER_INSPECTION';

  if (isResolved) {
    return (
      <span
        className="wms-status-badge"
        style={{ background: '#DCFCE7', color: '#15803D' }}
        title={plan.deviationResolution?.resolutionNotes}
      >
        <Check size={11} style={{ marginRight: 3 }} /> Đã xử lý sai lệch
      </span>
    );
  }

  if (isMismatched) {
    return (
      <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
        <span
          className="wms-status-badge"
          style={{ background: '#FFE4E6', color: '#BE123C' }}
          title={plan.technicianVerification?.deviationSummary || 'Có sai lệch KCS'}
        >
          <AlertTriangle size={11} style={{ marginRight: 3 }} /> Sai lệch KCS
        </span>
        <Link
          to="/accountant/contract-deviations"
          style={{
            fontSize: '11px',
            color: '#E11D48',
            fontWeight: 700,
            textDecoration: 'underline',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          chi tiết sai lệch →
        </Link>
      </div>
    );
  }

  if (isUnderInspection) {
    return (
      <span
        className="wms-status-badge"
        style={{ background: '#FEF3C7', color: '#B45309' }}
      >
        <Clock size={11} style={{ marginRight: 3 }} /> Đang kiểm định
      </span>
    );
  }

  if (isMatched) {
    return (
      <span
        className="wms-status-badge"
        style={{ background: '#F0FDF4', color: '#16A34A' }}
      >
        <CheckCircle2 size={11} style={{ marginRight: 3 }} /> KCS đạt chuẩn
      </span>
    );
  }

  return (
    <span
      className="wms-badge-batch"
      style={{ color: '#64748B', background: '#F1F5F9' }}
      title="Lô hàng đang theo lịch trình giao nhận, chưa kiểm định KCS"
    >
      <Clock size={11} style={{ marginRight: 3 }} /> Chờ tiếp nhận
    </span>
  );
};

const formatDate = (val) => {
  if (!val) return '—';
  try {
    const d = new Date(val);
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('vi-VN');
  } catch {
    return '—';
  }
};

/**
 * Nén ảnh tự động trên trình duyệt trước khi chuyển sang Base64
 * Giúp giảm dung lượng ảnh từ 5MB xuống ~150-250KB nhưng vẫn giữ độ nét cực cao cho văn bản hợp đồng
 */
const compressImage = (file, maxWidth = 1600, quality = 0.82) => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => resolve(e.target.result);
      img.src = e.target.result;
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
};

/**
 * Khởi tạo danh sách các đợt nhập hàng (Batches Builder)
 * Tự động chia đều số lượng và tính toán ngày giao dự kiến cho từng đợt
 */
const buildBatches = (count, materials = [], effectiveFrom = null, effectiveTo = null, existingBatches = []) => {
  const n = Math.max(1, Math.min(24, Math.floor(Number(count) || 1)));
  const startMs = effectiveFrom ? new Date(effectiveFrom).getTime() : Date.now() + 3 * 86400000;
  const endMs = effectiveTo ? new Date(effectiveTo).getTime() : startMs + 90 * 86400000;
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
      const allRolls = Array.isArray(m.rollDetails) && m.rollDetails.length > 0 ? m.rollDetails : [];
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
          selectedRolls = n === 1 && allRolls.length > 0 ? [...allRolls] : [];
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

// UC: Lập kế hoạch lịch trình tiếp nhận nguyên phụ liệu
const InboundPlanningPage = () => {
  const [searchParams] = useSearchParams();
  const preselectedContractId = searchParams.get('contractId') || '';

  const [plans, setPlans] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [reportingOwner, setReportingOwner] = useState(false);

  const handleReportToOwner = async (plan) => {
    const planId = plan?._id || plan?.id;
    if (!planId) return;
    if (
      !window.confirm(
        `Bạn có chắc chắn muốn trình báo biên bản sai lệch KCS của kế hoạch [${plan.planCode}] lên Chủ sở hữu (Owner)?`
      )
    ) {
      return;
    }
    try {
      setReportingOwner(true);
      await accountantProcurementApi.reportDeviationToOwner(planId, {
        notes: 'Kế toán trình báo biên bản sai lệch kiểm định KCS cần Owner xem xét và phê duyệt phương án giải quyết.',
      });
      setFeedback({
        type: 'success',
        text: `Đã gửi báo cáo sai lệch của kế hoạch [${plan.planCode}] lên Chủ sở hữu (Owner) thành công!`,
      });
      if (
        selectedPlanForDetail &&
        String(selectedPlanForDetail._id || selectedPlanForDetail.id) === String(planId)
      ) {
        setSelectedPlanForDetail((prev) => ({
          ...prev,
          reportedToOwner: { isReported: true, reportedAt: new Date() },
        }));
      }
      loadData();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err.response?.data?.message || 'Không thể gửi báo cáo lên Owner',
      });
    } finally {
      setReportingOwner(false);
    }
  };

  const activeContracts = useMemo(() => {
    return (contracts || []).filter((c) => c.status === 'ACTIVE');
  }, [contracts]);

  // Chi tiết hợp đồng gắn liền với kế hoạch đang thao tác (đặc biệt khi tạo version mới)
  const [selectedContractInfo, setSelectedContractInfo] = useState(null);

  // Search inside Contract selector
  const [showContractSearch, setShowContractSearch] = useState(false);
  const [contractSearchKeyword, setContractSearchKeyword] = useState('');

  const filteredActiveContracts = useMemo(() => {
    const q = contractSearchKeyword.trim().toLowerCase();
    if (!q) return activeContracts;
    return activeContracts.filter(
      (c) =>
        (c.contractCode || '').toLowerCase().includes(q) ||
        (c.supplierId?.supplierName || '').toLowerCase().includes(q) ||
        (c.supplierId?.supplierCode || '').toLowerCase().includes(q) ||
        (c.contractTitle || '').toLowerCase().includes(q)
    );
  }, [activeContracts, contractSearchKeyword]);

  // Filters & View Mode
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState('NEWEST'); // 'NEWEST' (Mặc định: Mới -> Cũ) | 'OLDEST' | 'DELIVERY_DESC' | 'DELIVERY_ASC'
  const [viewMode, setViewMode] = useState('GROUPED'); // 'GROUPED' (Gộp chung theo Hợp đồng) | 'FLAT' (Danh sách tất cả)
  const [expandedFamilies, setExpandedFamilies] = useState(new Set());

  const toggleExpandFamily = (rootKey) => {
    setExpandedFamilies((prev) => {
      const next = new Set(prev);
      if (next.has(rootKey)) {
        next.delete(rootKey);
      } else {
        next.add(rootKey);
      }
      return next;
    });
  };

  // Multi-batch State (Mặc định 2 đợt giao hàng tự chia đều 50% - 50%)
  const [batchesCount, setBatchesCount] = useState(2);
  const [batches, setBatches] = useState([]);

  // Modal Amend Inbound Plan (Create New Version v2, v3...)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [planErrors, setPlanErrors] = useState({});
  const [planForm, setPlanForm] = useState({
    planCode: '',
    contractId: preselectedContractId,
    physicalContractPhotos: [],
    notes: '',
    amendmentReason: '',
    isNewVersion: true,
    originalPlanId: null,
    originalPlanCode: '',
    versionNumber: 1,
  });

  // Hợp đồng hiện hành đang chọn/gắn liền với kế hoạch
  const currentContract = useMemo(() => {
    const cId = String(planForm.contractId || '');
    if (!cId) return selectedContractInfo || null;
    return (
      activeContracts.find((c) => String(c._id || c.id) === cId) ||
      (contracts || []).find((c) => String(c._id || c.id) === cId) ||
      selectedContractInfo ||
      null
    );
  }, [planForm.contractId, activeContracts, contracts, selectedContractInfo]);

  // Modal Detail View & Version History
  const [selectedPlanForDetail, setSelectedPlanForDetail] = useState(null);
  const [planVersions, setPlanVersions] = useState([]);

  // Lightbox Preview for Fullsize Image
  const [lightboxImage, setLightboxImage] = useState(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [plansData, contractsData] = await Promise.all([
        accountantProcurementApi.getInboundPlans(),
        accountantProcurementApi.getContracts(),
      ]);
      setPlans(plansData);
      setContracts(contractsData);

      if (preselectedContractId) {
        const foundPre = (contractsData || []).find(
          (c) => String(c._id || c.id) === String(preselectedContractId)
        );
        if (foundPre?.contractCode) {
          setSearchTerm(foundPre.contractCode);
        }
      }
    } catch (error) {
      setFeedback({
        type: 'error',
        text:
          error.response?.data?.message ||
          'Không thể tải kế hoạch lịch trình tiếp nhận nguyên liệu',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSelectContract = (contractId) => {
    const found = contracts.find((c) => String(c._id || c.id) === String(contractId));
    setPlanErrors((prev) => {
      const next = { ...prev };
      delete next.contractId;
      delete next.batchErrors;
      return next;
    });

    if (found && found.status !== 'ACTIVE') {
      setPlanErrors((prev) => ({
        ...prev,
        contractId: `Hợp đồng [${found.contractCode}] đang ở trạng thái "${found.status}". Chỉ cho phép chọn Hợp đồng đang có hiệu lực (ACTIVE).`,
      }));
      setPlanForm((prev) => ({
        ...prev,
        contractId: '',
      }));
      setBatches([]);
      return;
    }

    // Quy tắc: 1 Hợp đồng chỉ được có 1 kế hoạch tiếp nhận và các version của nó
    if (!planForm.isNewVersion && contractId) {
      const existingPlan = (plans || []).find(
        (p) => String(p.contractId?._id || p.contractId) === String(contractId) && p.status !== 'CANCELLED'
      );
      if (existingPlan) {
        setPlanErrors((prev) => ({
          ...prev,
          contractId: 'Hợp đồng này đã có kế hoạch nhập hàng',
        }));
        setFeedback({
          type: 'error',
          text: 'Hợp đồng này đã có kế hoạch nhập hàng',
        });
        setPlanForm((prev) => ({
          ...prev,
          contractId: '',
        }));
        setBatches([]);
        return;
      }
    }

    const targetCount = batchesCount || 2;
    const nextBatches = buildBatches(
      targetCount,
      found?.contractedMaterials || [],
      found?.effectiveFrom,
      found?.effectiveTo,
      batches
    );
    setBatches(nextBatches);

    setPlanForm((prev) => ({
      ...prev,
      contractId,
    }));
  };

  const handleBatchesCountChange = (newCount) => {
    if (newCount === '') {
      setBatchesCount('');
      return;
    }
    const c = Math.max(1, Math.min(24, Math.floor(Number(newCount) || 1)));
    setBatchesCount(c);
    const selectedContract = currentContract || activeContracts[0];
    const newBatches = buildBatches(
      c,
      selectedContract?.contractedMaterials || [],
      selectedContract?.effectiveFrom,
      selectedContract?.effectiveTo,
      []
    );
    setBatches(newBatches);
    setPlanErrors((prev) => {
      const next = { ...prev };
      delete next.batchErrors;
      return next;
    });
  };

  const handleBatchFieldChange = (bIdx, field, value) => {
    setBatches((prev) => {
      const next = [...prev];
      next[bIdx] = { ...next[bIdx], [field]: value };
      return next;
    });
    if (planErrors.batchErrors?.[bIdx]?.[field]) {
      setPlanErrors((prev) => {
        const nextBatchErrors = { ...prev.batchErrors };
        delete nextBatchErrors[bIdx][field];
        if (Object.keys(nextBatchErrors[bIdx]).length === 0) {
          delete nextBatchErrors[bIdx];
        }
        return { ...prev, batchErrors: nextBatchErrors };
      });
    }
  };

  const handleBatchItemQtyChange = (bIdx, itemIdx, value) => {
    const rawVal = value === '' ? '' : Math.max(0, Number(value));
    setBatches((prev) => {
      const next = prev.map((b) => ({
        ...b,
        expectedItems: b.expectedItems.map((it) => ({ ...it })),
      }));

      // Cập nhật số lượng của đợt hiện tại
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

      return next;
    });

    if (planErrors.batchErrors?.[bIdx]?.itemErrors?.[itemIdx]) {
      setPlanErrors((prev) => {
        const nextBatchErrors = { ...prev.batchErrors };
        delete nextBatchErrors[bIdx].itemErrors[itemIdx];
        const lastIdx = (batches.length || 1) - 1;
        if (nextBatchErrors[lastIdx]?.itemErrors?.[itemIdx]) {
          delete nextBatchErrors[lastIdx].itemErrors[itemIdx];
        }
        return { ...prev, batchErrors: nextBatchErrors };
      });
    }
  };

  // Chọn/bỏ chọn cuộn vải hoặc cập nhật số lượng cuộn giao cho từng đợt nhập, đợt cuối cùng tự động nhận tất cả các cuộn còn thiếu
  const handleBatchRollQtyChange = (bIdx, itemIdx, targetRoll, newRollQty) => {
    setBatches((prev) => {
      const next = prev.map((b) => ({
        ...b,
        expectedItems: b.expectedItems.map((it) => ({
          ...it,
          selectedRolls: Array.isArray(it.selectedRolls) ? it.selectedRolls.map((sr) => ({ ...sr })) : [],
        })),
      }));

      const targetItem = next[bIdx].expectedItems[itemIdx];
      const allRolls = targetItem.allRolls || [];
      const rollKey = targetRoll.rollCode || `R-${targetRoll.rollIndex}`;
      const masterRoll = allRolls.find((r) => (r.rollCode || `R-${r.rollIndex}`) === rollKey) || targetRoll;
      const totalRollQty = Math.max(1, Math.floor(Number(masterRoll.rollQty ?? 1) || 1));
      const desiredQty =
        newRollQty === ''
          ? 0
          : Math.max(0, Math.min(totalRollQty, Math.floor(Number(newRollQty) || 0)));

      targetItem.selectedRolls = targetItem.selectedRolls.filter(
        (r) => (r.rollCode || `R-${r.rollIndex}`) !== rollKey
      );
      if (desiredQty > 0) {
        targetItem.selectedRolls.push({
          ...masterRoll,
          rollQty: desiredQty,
        });
      }

      const lastBIdx = next.length - 1;
      if (lastBIdx > 0 && bIdx < lastBIdx) {
        let remainingAllowedOther = Math.max(0, totalRollQty - desiredQty);
        for (let b = 0; b < lastBIdx; b++) {
          if (b === bIdx) continue;
          const bRolls = next[b].expectedItems[itemIdx].selectedRolls || [];
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

      // ĐỢT CUỐI CÙNG: Auto-fill toàn bộ các cuộn vải còn thiếu chưa được gán
      if (lastBIdx >= 0 && allRolls.length > 0) {
        const lastBatchRolls = [];
        allRolls.forEach((r) => {
          const rKey = r.rollCode || `R-${r.rollIndex}`;
          const rTotalQty = Math.max(1, Math.floor(Number(r.rollQty ?? 1) || 1));
          let allocatedBeforeLast = 0;
          for (let b = 0; b < lastBIdx; b++) {
            const match = (next[b].expectedItems[itemIdx].selectedRolls || []).find(
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
        next[lastBIdx].expectedItems[itemIdx].selectedRolls = lastBatchRolls;
      }

      // Cập nhật plannedQty và rollCount cho tất cả các đợt đối với mặt hàng này
      next.forEach((b) => {
        const it = b.expectedItems[itemIdx];
        if (it.allRolls && it.allRolls.length > 0) {
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

      return next;
    });

    if (planErrors.batchErrors?.[bIdx]?.itemErrors?.[itemIdx]) {
      setPlanErrors((prev) => {
        const nextBatchErrors = { ...prev.batchErrors };
        delete nextBatchErrors[bIdx].itemErrors[itemIdx];
        return { ...prev, batchErrors: nextBatchErrors };
      });
    }
  };

  const handleToggleBatchRoll = (bIdx, itemIdx, targetRoll) => {
    const targetItem = batches[bIdx]?.expectedItems?.[itemIdx];
    const allRolls = targetItem?.allRolls || [];
    const rollKey = targetRoll.rollCode || `R-${targetRoll.rollIndex}`;
    const masterRoll = allRolls.find((r) => (r.rollCode || `R-${r.rollIndex}`) === rollKey) || targetRoll;
    const totalRollQty = Math.max(1, Math.floor(Number(masterRoll.rollQty ?? 1) || 1));
    const currentSelected = (targetItem?.selectedRolls || []).find(
      (r) => (r.rollCode || `R-${r.rollIndex}`) === rollKey
    );
    const isCurrentlySelected = Boolean(currentSelected && Number(currentSelected.rollQty ?? 1) > 0);
    handleBatchRollQtyChange(bIdx, itemIdx, targetRoll, isCurrentlySelected ? 0 : totalRollQty);
  };

  const handleRemoveBatch = (bIdxToRemove) => {
    if (batches.length <= 1) return;
    const nextCount = batches.length - 1;
    setBatchesCount(nextCount);
    const selectedContract = currentContract || activeContracts[0];
    const updatedBatches = buildBatches(
      nextCount,
      selectedContract?.contractedMaterials || [],
      selectedContract?.effectiveFrom,
      selectedContract?.effectiveTo,
      []
    );
    setBatches(updatedBatches);
    setPlanErrors((prev) => {
      const next = { ...prev };
      delete next.batchErrors;
      return next;
    });
  };

  const handleAutoBalanceBatches = () => {
    const selectedContract =
      currentContract ||
      activeContracts.find((ct) => String(ct._id || ct.id) === String(planForm.contractId));
    const freshBatches = buildBatches(
      batchesCount,
      selectedContract?.contractedMaterials || [],
      selectedContract?.effectiveFrom,
      selectedContract?.effectiveTo,
      [] // force recalculate fresh
    );
    setBatches(freshBatches);
    setFeedback({
      type: 'success',
      text: `Đã tự động cân bằng số lượng đều nhau cho ${batchesCount} đợt giao hàng.`,
    });
  };

  // Đối soát cân đối giữa Tổng cam kết trên Hợp đồng và Tổng các đợt đã phân bổ (khớp chính xác theo từng dòng mIdx)
  const allocationBalance = useMemo(() => {
    const selectedContract =
      currentContract ||
      activeContracts.find((c) => String(c._id || c.id) === String(planForm.contractId));
    if (!selectedContract || !Array.isArray(selectedContract.contractedMaterials)) {
      return [];
    }

    return selectedContract.contractedMaterials.map((mat, mIdx) => {
      const rawIdStr = String(mat.rawMaterialId?._id || mat.rawMaterialId?.id || mat.rawMaterialId);
      const contractedQty = Number(mat.contractedQty || 0);

      const totalAllocated = (batches || []).reduce((sum, b) => {
        const item =
          b.expectedItems?.[mIdx] ||
          (b.expectedItems || []).find(
            (i) => String(i.rawMaterialId?._id || i.rawMaterialId?.id || i.rawMaterialId) === rawIdStr
          );
        return sum + (Number(item?.plannedQty) || 0);
      }, 0);

      const diff = Number((contractedQty - totalAllocated).toFixed(4));
      const isBalanced = Math.abs(diff) < 0.001;

      return {
        materialCode: mat.materialCodeSnapshot || mat.rawMaterialId?.materialCode || 'NVL',
        materialName: mat.materialNameSnapshot || mat.rawMaterialId?.materialName || '',
        unit: mat.unitSnapshot || mat.rawMaterialId?.unit || 'METER',
        contractedQty,
        totalAllocated,
        diff,
        isBalanced,
      };
    });
  }, [currentContract, activeContracts, planForm.contractId, batches]);

  const [highlightedMismatchItem, setHighlightedMismatchItem] = useState(null);

  const handleScrollToPlanMismatchItem = (targetItemIdx) => {
    const itemIdx =
      targetItemIdx !== undefined
        ? targetItemIdx
        : allocationBalance.findIndex((b) => !b.isBalanced);
    if (itemIdx < 0) return;

    const contractedQty = Number(allocationBalance[itemIdx]?.contractedQty || 0);
    let targetBatchIdx = (batches || []).findIndex((b, bIdx) => {
      if (planErrors.batchErrors?.[bIdx]?.itemErrors?.[itemIdx]) return true;
      const q = Number(b.expectedItems?.[itemIdx]?.plannedQty || 0);
      return q > contractedQty || q < 0;
    });
    if (targetBatchIdx < 0) targetBatchIdx = 0;

    setHighlightedMismatchItem({ batchIdx: targetBatchIdx, itemIdx });

    const rowEl =
      document.getElementById(`plan-batch-row-${targetBatchIdx}-item-${itemIdx}`) ||
      document.getElementById(`plan-batch-row-0-item-${itemIdx}`);
    if (rowEl) {
      rowEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    setTimeout(() => {
      const inputEl =
        document.getElementById(`plan-batch-input-${targetBatchIdx}-item-${itemIdx}`) ||
        document.getElementById(`plan-batch-input-0-item-${itemIdx}`);
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

  const handlePhotoUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const validFiles = [];
    const errorMsgs = [];

    files.forEach((file) => {
      if (!file.type.startsWith('image/')) {
        errorMsgs.push(`File "${file.name}" không phải là định dạng hình ảnh hợp lệ.`);
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        errorMsgs.push(`File "${file.name}" vượt quá dung lượng tối đa 10MB.`);
        return;
      }
      validFiles.push(file);
    });

    if (errorMsgs.length > 0) {
      setFeedback({ type: 'error', text: errorMsgs.join(' ') });
    }

    try {
      const compressedList = await Promise.all(
        validFiles.map((file) => compressImage(file))
      );
      const readyPhotos = compressedList.filter(Boolean);
      if (readyPhotos.length > 0) {
        setPlanForm((prev) => ({
          ...prev,
          physicalContractPhotos: [...prev.physicalContractPhotos, ...readyPhotos],
        }));
      }
    } catch (err) {
      console.error('Lỗi xử lý ảnh:', err);
      setFeedback({ type: 'error', text: 'Có lỗi xảy ra khi nén hoặc tải ảnh lên.' });
    }

    e.target.value = '';
  };

  const handleOpenDetailModal = async (plan) => {
    setSelectedPlanForDetail(plan);
    const planBaseCode = (plan.planCode || '').replace(/-V\d+$/i, '').trim().toUpperCase();
    const pRootId = String(plan.rootPlanId?._id || plan.rootPlanId || '');

    // Khởi tạo trước từ state plans để giao diện hiển thị ngay lập tức
    const localFamilyVersions = (plans || []).filter((p) => {
      const bCode = (p.planCode || '').replace(/-V\d+$/i, '').trim().toUpperCase();
      const rId = String(p.rootPlanId?._id || p.rootPlanId || '');
      return (pRootId && (rId === pRootId || String(p._id) === pRootId)) || (bCode === planBaseCode);
    }).sort((a, b) => (Number(b.versionNumber) || 1) - (Number(a.versionNumber) || 1));

    setPlanVersions(localFamilyVersions.length > 0 ? localFamilyVersions : [plan]);

    const planId = plan._id || plan.id;
    if (planId) {
      try {
        const [fullDetail, versions] = await Promise.all([
          accountantProcurementApi.getInboundPlanDetail(planId),
          accountantProcurementApi.getInboundPlanVersions(planId).catch(() => []),
        ]);
        if (fullDetail) {
          setSelectedPlanForDetail(fullDetail);
        }
        if (Array.isArray(versions) && versions.length > 0) {
          setPlanVersions(versions);
        }
      } catch (err) {
        console.warn('Lấy chi tiết kế hoạch qua API không thành công, hiển thị bản ghi đã tải:', err);
      }
    }
  };

  const handleSwitchViewingVersion = async (versionPlan) => {
    if (!versionPlan) return;
    setSelectedPlanForDetail(versionPlan);
    const vId = versionPlan._id || versionPlan.id;
    if (vId) {
      try {
        const full = await accountantProcurementApi.getInboundPlanDetail(vId);
        if (full) {
          setSelectedPlanForDetail(full);
        }
      } catch (e) {
        console.warn('Lỗi tải chi tiết phiên bản:', e);
      }
    }
  };

  const handleRemovePhoto = (photoIndex) => {
    setPlanForm((prev) => ({
      ...prev,
      physicalContractPhotos: prev.physicalContractPhotos.filter((_, idx) => idx !== photoIndex),
    }));
  };

  const handleOpenAmendModal = async (plan) => {
    setPlanErrors({});
    setFeedback(null);
    setShowContractSearch(false);
    setContractSearchKeyword('');

    const planContractId = String(plan.contractId?._id || plan.contractId?.id || plan.contractId || '');
    let targetContract =
      activeContracts.find((c) => String(c._id || c.id) === planContractId) ||
      (contracts || []).find((c) => String(c._id || c.id) === planContractId) ||
      (typeof plan.contractId === 'object' && plan.contractId !== null ? plan.contractId : null);

    if (planContractId && (!targetContract || !Array.isArray(targetContract.contractedMaterials) || targetContract.contractedMaterials.length === 0)) {
      try {
        const detail = await accountantProcurementApi.getContractDetail(planContractId);
        if (detail && Array.isArray(detail.contractedMaterials) && detail.contractedMaterials.length > 0) {
          targetContract = detail;
        }
      } catch (err) {
        console.warn('Không thể tải chi tiết hợp đồng cho kế hoạch:', err);
      }
    }

    setSelectedContractInfo(targetContract);
    const targetMaterials = Array.isArray(targetContract?.contractedMaterials) ? targetContract.contractedMaterials : [];

    const baseCode = (plan.planCode || 'KH-NHAP-001').replace(/-V\d+$/i, '');
    const currentVer = plan.versionNumber || 1;
    const nextVer = currentVer + 1;
    const nextCode = `${baseCode}-V${nextVer}`;

    let sourceBatches = [];
    if (Array.isArray(plan.batches) && plan.batches.length > 0) {
      const totalLen = plan.batches.length;
      sourceBatches = plan.batches.map((b, idx) => {
        const expectedItems = (b.expectedItems || []).map((it) => {
          const itRawId = String(it.rawMaterialId?._id || it.rawMaterialId?.id || it.rawMaterialId || '');
          const contractMat = targetMaterials.find(
            (cm) => String(cm.rawMaterialId?._id || cm.rawMaterialId?.id || cm.rawMaterialId || '') === itRawId
          );
          const contractedQty = Number(contractMat?.contractedQty || it.contractedQty || it.plannedQty || 0);
          const allRolls = Array.isArray(contractMat?.rollDetails) && contractMat.rollDetails.length > 0
            ? contractMat.rollDetails
            : Array.isArray(it.allRolls) ? it.allRolls : [];

          return {
            rawMaterialId: it.rawMaterialId?._id || it.rawMaterialId?.id || it.rawMaterialId,
            materialCode: it.rawMaterialId?.materialCode || contractMat?.materialCodeSnapshot || it.materialCode || 'NVL',
            materialName: it.rawMaterialId?.materialName || contractMat?.materialNameSnapshot || it.materialName || '',
            unit: it.unitSnapshot || it.rawMaterialId?.unit || contractMat?.unitSnapshot || it.unit || 'METER',
            contractedQty,
            plannedQty: Number(it.plannedQty || 0),
            allRolls,
            selectedRolls: Array.isArray(it.selectedRolls) ? it.selectedRolls : [],
          };
        });

        return {
          batchNumber: b.batchNumber || idx + 1,
          totalBatches: totalLen,
          batchTitle: b.batchTitle || (idx === 0 ? `Đợt 1/${totalLen}: Giao nguyên liệu đợt đầu` : idx === totalLen - 1 ? `Đợt ${totalLen}/${totalLen}: Giao toàn bộ nguyên liệu còn lại` : `Đợt ${idx + 1}/${totalLen}: Giao nguyên liệu theo tiến độ`),
          batchPercentage: b.batchPercentage || Math.round(100 / totalLen),
          scheduledDeliveryDate: b.scheduledDeliveryDate
            ? String(b.scheduledDeliveryDate).slice(0, 10)
            : new Date().toISOString().slice(0, 10),
          notes: b.notes || '',
          expectedItems,
        };
      });
    } else {
      sourceBatches = buildBatches(
        2,
        targetMaterials,
        targetContract?.effectiveFrom,
        targetContract?.effectiveTo
      );
    }

    setBatchesCount(sourceBatches.length);
    setBatches(sourceBatches);

    setPlanForm({
      planCode: nextCode,
      contractId: targetContract?._id || targetContract?.id || planContractId,
      physicalContractPhotos: Array.isArray(plan.physicalContractPhotos)
        ? [...plan.physicalContractPhotos]
        : [],
      notes: plan.notes || '',
      amendmentReason: `Điều chỉnh phụ lục tiến độ tiếp nhận (Phiên bản v${nextVer})`,
      isNewVersion: true,
      originalPlanId: plan._id || plan.id,
      originalPlanCode: plan.planCode,
      versionNumber: nextVer,
    });

    setIsModalOpen(true);
  };

  const handleSubmitPlan = async (e) => {
    e.preventDefault();
    const validationResult = validateInboundPlanForm({
      planCode: planForm.planCode,
      contractId: planForm.contractId,
      batches,
      isNewVersion: planForm.isNewVersion,
      amendmentReason: planForm.amendmentReason,
    });

    if (!validationResult.isValid) {
      setPlanErrors(validationResult.errors);
      setFeedback({
        type: 'error',
        text: 'Vui lòng kiểm tra lại thông tin các đợt giao hàng hoặc lý do điều chỉnh theo cảnh báo đỏ bên dưới.',
      });
      return;
    }

    const selectedContract = activeContracts.find(
      (c) => String(c._id || c.id) === String(planForm.contractId)
    );
    if (!selectedContract) {
      setPlanErrors((prev) => ({
        ...prev,
        contractId: 'Vui lòng chọn một Hợp đồng đang có hiệu lực (ACTIVE).',
      }));
      setFeedback({
        type: 'error',
        text: 'Chỉ được phép lập kế hoạch tiếp nhận cho hợp đồng đang ở trạng thái ACTIVE.',
      });
      return;
    }

    if (!planForm.isNewVersion) {
      const existingPlan = (plans || []).find(
        (p) => String(p.contractId?._id || p.contractId) === String(planForm.contractId) && p.status !== 'CANCELLED'
      );
      if (existingPlan) {
        setPlanErrors((prev) => ({
          ...prev,
          contractId: 'Hợp đồng này đã có kế hoạch nhập hàng',
        }));
        setFeedback({
          type: 'error',
          text: 'Hợp đồng này đã có kế hoạch nhập hàng',
        });
        return;
      }
    }

    try {
      setSubmitting(true);
      setFeedback(null);
      setPlanErrors({});
      const basePlanCode = planForm.planCode.trim().toUpperCase();

      const payload = {
        planCode: basePlanCode,
        contractId: planForm.contractId,
        physicalContractPhotos: planForm.physicalContractPhotos || [],
        notes: planForm.notes || '',
        amendmentReason: planForm.amendmentReason || '',
        batches: batches.map((b, idx) => ({
          batchNumber: idx + 1,
          totalBatches: batches.length,
          planCode:
            batches.length > 1
              ? `${basePlanCode}-D${idx + 1}`
              : basePlanCode,
          batchTitle: b.batchTitle,
          batchPercentage: b.batchPercentage,
          scheduledDeliveryDate: b.scheduledDeliveryDate,
          notes: b.notes || '',
          expectedItems: (b.expectedItems || []).map((i) => ({
            rawMaterialId: i.rawMaterialId,
            plannedQty: Number(i.plannedQty),
            unit: i.unit,
            unitSnapshot: i.unit,
          })),
        })),
      };

      if (planForm.isNewVersion && planForm.originalPlanId) {
        const res = await accountantProcurementApi.amendInboundPlan(
          planForm.originalPlanId,
          payload
        );
        setFeedback({ type: 'success', text: res.message });
      } else {
        const res = await accountantProcurementApi.createInboundPlan(payload);
        setFeedback({ type: 'success', text: res.message });
      }

      setIsModalOpen(false);
      await loadData();
    } catch (error) {
      setFeedback({
        type: 'error',
        text:
          error.response?.data?.message ||
          'Lỗi khi lưu kế hoạch lịch trình tiếp nhận nguyên liệu',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const filteredPlans = useMemo(() => {
    const list = plans.filter((p) => {
      const q = searchTerm.trim().toLowerCase();
      const matchSearch =
        !q ||
        (p.planCode || '').toLowerCase().includes(q) ||
        (p.contractId?.contractCode || '').toLowerCase().includes(q) ||
        (p.supplierId?.supplierName || '').toLowerCase().includes(q);

      let matchStatus = statusFilter === 'ALL' || p.status === statusFilter;
      if (statusFilter === 'VERIFIED_MATCHED') {
        matchStatus =
          p.status === 'VERIFIED_MATCHED' ||
          p.deliveryComplianceStatus === 'MATCHED' ||
          p.technicianVerification?.isMatchedWithPlan === true;
      } else if (statusFilter === 'DEVIATION_REPORTED') {
        matchStatus =
          p.status === 'DEVIATION_REPORTED' ||
          p.deliveryComplianceStatus === 'MISMATCHED' ||
          p.technicianVerification?.isMatchedWithPlan === false;
      }

      return matchSearch && matchStatus;
    });

    // Mặc định: Mới nhất -> Cũ nhất (NEWEST)
    return list.sort((a, b) => {
      const timeA = new Date(a.createdAt || a.scheduledDeliveryDate || 0).getTime();
      const timeB = new Date(b.createdAt || b.scheduledDeliveryDate || 0).getTime();
      const delA = new Date(a.scheduledDeliveryDate || a.createdAt || 0).getTime();
      const delB = new Date(b.scheduledDeliveryDate || b.createdAt || 0).getTime();

      if (sortBy === 'OLDEST') {
        return timeA - timeB;
      }
      if (sortBy === 'DELIVERY_DESC') {
        return delB - delA;
      }
      if (sortBy === 'DELIVERY_ASC') {
        return delA - delB;
      }
      return timeB - timeA;
    });
  }, [plans, searchTerm, statusFilter, sortBy]);

  const planKpis = useMemo(() => {
    const total = plans.length;
    let matched = 0;
    let mismatched = 0;
    let resolved = 0;

    plans.forEach((p) => {
      const isResolved = p.deviationResolution?.status === 'RESOLVED';
      const isMismatched =
        p.deliveryComplianceStatus === 'MISMATCHED' ||
        p.status === 'DEVIATION_REPORTED' ||
        p.technicianVerification?.isMatchedWithPlan === false;
      const isMatched =
        p.deliveryComplianceStatus === 'MATCHED' ||
        p.status === 'VERIFIED_MATCHED' ||
        p.technicianVerification?.isMatchedWithPlan === true;

      if (isResolved) resolved++;
      else if (isMismatched) mismatched++;
      else if (isMatched) matched++;
    });

    return { total, matched, mismatched, resolved };
  }, [plans]);

  const isPlanContractTerminated = (plan) => {
    if (!plan) return false;
    if (plan.contractId?.status === 'TERMINATED') return true;
    const cId = String(plan.contractId?._id || plan.contractId?.id || plan.contractId || '');
    const match = (contracts || []).find((c) => String(c._id || c.id) === cId);
    return match?.status === 'TERMINATED';
  };

  const getPlanContractTerminationReason = (plan) => {
    if (!plan) return '';
    if (plan.contractId?.terminationReason) return plan.contractId.terminationReason;
    const cId = String(plan.contractId?._id || plan.contractId?.id || plan.contractId || '');
    const match = (contracts || []).find((c) => String(c._id || c.id) === cId);
    return match?.terminationReason || '';
  };

  const planFamilies = useMemo(() => {
    const familiesMap = new Map();

    filteredPlans.forEach((plan) => {
      const contractObj = typeof plan.contractId === 'object' ? plan.contractId : null;
      const contractIdStr = String(
        contractObj?._id || contractObj?.id || plan.contractId || ''
      );
      const fullContract = (contracts || []).find(
        (c) => String(c._id || c.id) === contractIdStr
      ) || contractObj;

      const planBaseCode = (plan.planCode || '').replace(/-V\d+$/i, '').trim().toUpperCase();
      const contractBaseCode = (fullContract?.contractCode || '').replace(/-V\d+$/i, '').trim().toUpperCase();

      // Group key: gom nhóm toàn bộ các phiên bản của cùng 1 kế hoạch/hợp đồng gốc (ưu tiên planBaseCode)
      const rootKey = planBaseCode || contractBaseCode || String(plan._id || plan.id);

      if (!familiesMap.has(rootKey)) {
        familiesMap.set(rootKey, {
          rootKey,
          baseCode: planBaseCode,
          contract: fullContract,
          contractCode: fullContract?.contractCode || '—',
          supplierName:
            plan.supplierId?.supplierName ||
            fullContract?.supplierId?.supplierName ||
            'Nhà cung ứng',
          supplierCode:
            plan.supplierId?.supplierCode ||
            fullContract?.supplierId?.supplierCode ||
            '',
          isTerminated: fullContract?.status === 'TERMINATED',
          terminationReason: fullContract?.terminationReason || '',
          versions: [],
        });
      }
      familiesMap.get(rootKey).versions.push(plan);
    });

    const families = Array.from(familiesMap.values()).map((fam) => {
      fam.versions.sort((a, b) => {
        const vA = Number(a.versionNumber) || 1;
        const vB = Number(b.versionNumber) || 1;
        if (vB !== vA) return vB - vA;
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      });
      fam.totalVersions = fam.versions.length;
      fam.hasMultipleVersions = fam.totalVersions > 1;

      // Primary plan: prefer latest version that is not RESOLVED_SUPERSEDED or CANCELLED, else top version
      fam.primaryPlan =
        fam.versions.find((v) => v.status !== 'RESOLVED_SUPERSEDED' && v.status !== 'CANCELLED') ||
        fam.versions[0];

      fam.baseCode = (fam.primaryPlan.planCode || '').replace(/-V\d+$/i, '');
      if (!fam.baseCode && fam.versions[0]) {
        fam.baseCode = (fam.versions[0].planCode || '').replace(/-V\d+$/i, '');
      }

      // Cập nhật thông tin Hợp đồng đại diện theo phiên bản kế hoạch mới nhất
      if (fam.primaryPlan?.contractId) {
        const pContract = typeof fam.primaryPlan.contractId === 'object'
          ? fam.primaryPlan.contractId
          : (contracts || []).find((c) => String(c._id || c.id) === String(fam.primaryPlan.contractId));
        if (pContract?.contractCode) {
          fam.contractCode = pContract.contractCode;
          fam.contract = pContract;
        }
      }

      return fam;
    });

    // Mặc định: Kế hoạch có ngày tạo/lịch giao mới nhất lên đầu (NEWEST)
    families.sort((a, b) => {
      const timeA = new Date(a.primaryPlan?.createdAt || a.primaryPlan?.scheduledDeliveryDate || 0).getTime();
      const timeB = new Date(b.primaryPlan?.createdAt || b.primaryPlan?.scheduledDeliveryDate || 0).getTime();
      if (sortBy === 'OLDEST') {
        return timeA - timeB;
      }
      return timeB - timeA;
    });

    return families;
  }, [filteredPlans, contracts, sortBy]);

  const plansByContract = useMemo(() => {
    const map = new Map();

    filteredPlans.forEach((plan) => {
      const contractObj = typeof plan.contractId === 'object' ? plan.contractId : null;
      const contractIdStr = String(
        contractObj?._id || contractObj?.id || plan.contractId || 'OTHER'
      );
      const fullContract = (contracts || []).find(
        (c) => String(c._id || c.id) === contractIdStr
      ) || contractObj;

      const contractCode = fullContract?.contractCode || contractObj?.contractCode || 'HĐ Chưa định danh';
      const supplierName =
        plan.supplierId?.supplierName ||
        fullContract?.supplierId?.supplierName ||
        contractObj?.supplierId?.supplierName ||
        'Nhà cung ứng';
      const isTerminated = fullContract?.status === 'TERMINATED' || contractObj?.status === 'TERMINATED';
      const terminationReason = fullContract?.terminationReason || contractObj?.terminationReason || '';

      if (!map.has(contractIdStr)) {
        map.set(contractIdStr, {
          contractId: contractIdStr,
          contractCode,
          contract: fullContract || contractObj,
          supplierName,
          supplierCode:
            plan.supplierId?.supplierCode ||
            fullContract?.supplierId?.supplierCode ||
            contractObj?.supplierId?.supplierCode ||
            '',
          isTerminated,
          terminationReason,
          plans: [],
        });
      }
      map.get(contractIdStr).plans.push(plan);
    });

    const groups = Array.from(map.values());
    groups.forEach((grp) => {
      grp.plans.sort((a, b) => {
        const vA = Number(a.versionNumber) || 1;
        const vB = Number(b.versionNumber) || 1;
        if (vB !== vA) return vB - vA;
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      });
      grp.latestPlan = grp.plans[0];
    });

    // Mặc định: Hợp đồng có kế hoạch mới nhất lên đầu (NEWEST)
    groups.sort((a, b) => {
      const timeA = new Date(a.latestPlan?.createdAt || a.contract?.createdAt || 0).getTime();
      const timeB = new Date(b.latestPlan?.createdAt || b.contract?.createdAt || 0).getTime();
      if (sortBy === 'OLDEST') {
        return timeA - timeB;
      }
      return timeB - timeA;
    });

    return groups;
  }, [filteredPlans, contracts, sortBy]);

  return (
    <div>
      {/* Page Header */}
      <section className="wms-page-header">
        <div>
          <h1 className="wms-page-title">
            Lập Kế hoạch Lịch trình Tiếp nhận Nguyên liệu
          </h1>
          <p className="wms-page-subtitle">
            Lên lịch các đợt giao hàng nguyên phụ liệu từ Hợp đồng để Kỹ thuật viên may (Garment Technician) đối chiếu số lượng và kiểm định KCS khi hàng về kho.
          </p>
        </div>
        <div className="wms-row-actions">
          <button
            type="button"
            className="wms-btn wms-btn-default"
            onClick={loadData}
            disabled={loading}
          >
            <RefreshCw size={16} />
            Làm mới
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

      {/* KPI Summary Strip */}
      <section className="wms-kpi-strip" aria-label="Thống kê kế hoạch tiếp nhận">
        <div className="wms-kpi-card">
          <span className="wms-kpi-label">Tổng Kế hoạch Tiếp nhận</span>
          <span className="wms-kpi-value">{planKpis.total} kế hoạch</span>
          <span className="wms-kpi-meta">Bao gồm các đợt giao và phiên bản</span>
        </div>

        <div className="wms-kpi-card">
          <span className="wms-kpi-label">KCS Đúng Kế hoạch</span>
          <span className="wms-kpi-value" style={{ color: '#16A34A' }}>
            {planKpis.matched} kế hoạch
          </span>
          <span className="wms-kpi-meta">Nghiệm thu đạt chuẩn 100%</span>
        </div>

        <div className="wms-kpi-card">
          <span className="wms-kpi-label">Sai Kế hoạch (Cần Xử lý)</span>
          <span className="wms-kpi-value" style={{ color: '#E11D48' }}>
            {planKpis.mismatched} kế hoạch
          </span>
          <span className="wms-kpi-meta">
            <Link to="/accountant/contract-deviations" style={{ color: '#E11D48', fontWeight: 600 }}>
              Xử lý sai lệch hợp đồng →
            </Link>
          </span>
        </div>

        <div className="wms-kpi-card">
          <span className="wms-kpi-label">Đã Xử lý Sai lệch</span>
          <span className="wms-kpi-value" style={{ color: '#15803D' }}>
            {planKpis.resolved} kế hoạch
          </span>
          <span className="wms-kpi-meta">Đã ghi nhận phương án giải quyết</span>
        </div>
      </section>

      {/* Filter Bar */}
      <section className="wms-filter-bar">
        <div className="wms-filter-group">
          <div className="wms-filter-field search-wide">
            <label htmlFor="p-search" className="wms-label">
              Tìm kiếm Mã Kế hoạch / Số Hợp đồng / Nhà cung ứng
            </label>
            <input
              id="p-search"
              type="search"
              className="wms-input"
              placeholder="Nhập KH-NHAP-..., HDK-2026-..., tên NCC..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="wms-filter-field">
            <label htmlFor="p-status" className="wms-label">
              Trạng thái Tiếp nhận & Kiểm định KCS
            </label>
            <select
              id="p-status"
              className="wms-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="ALL">Tất cả trạng thái</option>
              <option value="SCHEDULED">Chờ tiếp nhận</option>
              <option value="IN_INSPECTION">Đang kiểm định</option>
              <option value="VERIFIED_MATCHED">KCS đạt chuẩn</option>
              <option value="DEVIATION_REPORTED">Sai lệch KCS</option>
              <option value="RESOLVED_SUPERSEDED">Đã thay thế</option>
              <option value="CANCELLED">Đã hủy lịch</option>
            </select>
          </div>

          <div className="wms-filter-field">
            <label htmlFor="p-sort" className="wms-label">
              Thứ tự hiển thị
            </label>
            <select
              id="p-sort"
              className="wms-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="NEWEST">Mới nhất trước (Mới → Cũ)</option>
              <option value="OLDEST">Cũ nhất trước (Cũ → Mới)</option>
              <option value="DELIVERY_DESC">Ngày giao hàng xa nhất</option>
              <option value="DELIVERY_ASC">Ngày giao hàng gần nhất</option>
            </select>
          </div>
        </div>
      </section>

      {/* Content Section: Unified Plan Family Table with Version Expansion */}
      {loading ? (
        <section className="wms-table-card" style={{ padding: '30px', textAlign: 'center' }}>
          <RefreshCw size={24} className="wms-spinner" style={{ margin: '0 auto 10px', color: 'var(--wms-accent)' }} />
          <div>Đang tải kế hoạch lịch trình tiếp nhận nguyên liệu...</div>
        </section>
      ) : planFamilies.length === 0 ? (
        <section className="wms-table-card" style={{ padding: '30px', textAlign: 'center' }}>
          <AlertCircle size={28} style={{ margin: '0 auto 8px', color: 'var(--wms-secondary)' }} />
          <div>Chưa có kế hoạch lịch trình tiếp nhận nào khớp với bộ lọc.</div>
        </section>
      ) : (
        <section className="wms-table-card">
          <div className="wms-table-scroll no-horizontal-scroll">
            <table className="wms-table wms-table-responsive-fit">
              <colgroup>
                <col style={{ width: '22%' }} />
                <col style={{ width: '20%' }} />
                <col style={{ width: '16%' }} />
                <col style={{ width: '18%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '12%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Mã Kế hoạch & Phiên bản</th>
                  <th>Hợp đồng & Đối tác Cung ứng</th>
                  <th>Lịch trình giao hàng</th>
                  <th>Tổng quy mô & Chi tiết đợt</th>
                  <th style={{ textAlign: 'center' }}>Trạng thái KCS</th>
                  <th style={{ textAlign: 'center' }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {planFamilies.map((family) => {
                  const plan = family.primaryPlan;
                  const isExpanded = expandedFamilies.has(family.rootKey);
                  const isContractTerminated = family.isTerminated || isPlanContractTerminated(plan);
                  const isSuperseded = plan.status === 'RESOLVED_SUPERSEDED';
                  const totalQty = (plan.expectedItems || []).reduce(
                    (acc, item) => acc + (Number(item.plannedQty) || 0),
                    0
                  );
                  const primaryUnit =
                    plan.expectedItems?.[0]?.unitSnapshot ||
                    plan.expectedItems?.[0]?.rawMaterialId?.unit ||
                    plan.expectedItems?.[0]?.unit ||
                    'METER';
                  const photosCount = plan.physicalContractPhotos?.length || 0;
                  const hasBatches = Array.isArray(plan.batches) && plan.batches.length > 0;
                  const batchCount = hasBatches ? plan.batches.length : (plan.totalBatches || 1);

                  return (
                    <React.Fragment key={family.rootKey}>
                      <tr
                        className={`wms-interactive-row wms-row-expandable ${isExpanded ? 'wms-row-parent-expanded' : ''}`}
                        style={{
                          opacity: isContractTerminated ? 0.6 : isSuperseded ? 0.8 : 1,
                          backgroundColor: isExpanded ? 'rgba(2, 132, 199, 0.03)' : undefined,
                        }}
                        onClick={() => handleOpenDetailModal(plan)}
                        title="Nhấn để xem chi tiết đầy đủ kế hoạch tiếp nhận"
                      >
                        {/* 1. Mã Kế hoạch & Phiên bản */}
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <span className="wms-code-pill" style={{ fontWeight: 700, fontSize: '13px' }}>
                              {family.baseCode || plan.planCode}
                            </span>

                            {/* Nút bấm mở rộng xem lịch sử phiên bản */}
                            {family.hasMultipleVersions ? (
                              <button
                                type="button"
                                className={`wms-btn-version-pill ${isExpanded ? 'expanded' : ''}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleExpandFamily(family.rootKey);
                                }}
                                title="Nhấn để mở rộng/thu gọn lịch sử các phiên bản kế hoạch này"
                              >
                                v{plan.versionNumber || 1} ({family.totalVersions} pb)
                                <ChevronDown size={12} className="wms-pill-caret" />
                              </button>
                            ) : (
                              <span className="wms-badge-version">
                                v{plan.versionNumber || 1}
                              </span>
                            )}

                            {isContractTerminated && (
                              <span
                                className="wms-status-badge wms-status-rejected"
                                style={{
                                  fontSize: '10.5px',
                                  padding: '1px 6px',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '3px',
                                  fontWeight: 700,
                                  backgroundColor: '#FEE2E2',
                                  color: '#DC2626',
                                  border: '1px solid #FCA5A5',
                                }}
                                title="Kế hoạch thuộc hợp đồng đã chấm dứt"
                              >
                                <Ban size={11} /> HĐ đã chấm dứt
                              </span>
                            )}

                            {batchCount > 1 && (
                              <span className="wms-badge-batch" title={`Kế hoạch gồm ${batchCount} đợt giao`}>
                                {batchCount} đợt
                              </span>
                            )}

                            {photosCount > 0 && (
                              <span className="wms-photo-badge" title={`Có ${photosCount} ảnh biên bản/hợp đồng đính kèm`}>
                                <ImageIcon size={11} /> {photosCount}
                              </span>
                            )}
                          </div>

                          {plan.amendmentReason && (
                            <div
                              style={{
                                fontSize: '11.5px',
                                color: 'var(--wms-accent-hover)',
                                marginTop: '4px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                              }}
                            >
                              <Info size={11} style={{ flexShrink: 0 }} />
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '280px' }}>
                                {plan.amendmentReason}
                              </span>
                            </div>
                          )}
                        </td>

                        {/* 2. Hợp đồng & Đối tác Cung ứng */}
                        <td>
                          <div>
                            <strong style={{ color: '#0F172A' }}>
                              {plan.contractId?.contractCode || family.contractCode || '—'}
                            </strong>
                            {isContractTerminated && (
                              <div style={{ color: '#DC2626', fontSize: '11px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '3px', marginTop: '2px' }}>
                                <Ban size={11} /> Hợp đồng đã chấm dứt
                              </div>
                            )}
                          </div>
                          <div className="wms-helper-text" style={{ fontSize: '12px', marginTop: '2px' }}>
                            {plan.supplierId?.supplierName || family.supplierName || '—'}
                          </div>
                        </td>

                        {/* 3. Lịch trình giao hàng */}
                        <td>
                          {hasBatches && plan.batches.length > 1 ? (
                            <div style={{ fontSize: '12px', lineHeight: '1.4' }}>
                              {plan.batches.slice(0, 2).map((b, bIdx) => (
                                <div key={bIdx}>
                                  <strong>Đợt {b.batchNumber}:</strong> {formatDate(b.scheduledDeliveryDate)}
                                </div>
                              ))}
                              {plan.batches.length > 2 && (
                                <div className="wms-helper-text" style={{ fontSize: '11px', fontStyle: 'italic' }}>
                                  + {plan.batches.length - 2} đợt tiếp theo...
                                </div>
                              )}
                            </div>
                          ) : (
                            <div>
                              <strong>{formatDate(plan.scheduledDeliveryDate)}</strong>
                              <div className="wms-helper-text" style={{ fontSize: '11px' }}>
                                Kho Tân Bình
                              </div>
                            </div>
                          )}
                        </td>

                        {/* 4. Tổng quy mô & Chi tiết đợt */}
                        <td>
                          <div style={{ fontWeight: 600 }}>
                            Tổng: {Number(totalQty).toLocaleString('vi-VN')} {primaryUnit}
                          </div>
                          {hasBatches && plan.batches.length > 1 ? (
                            <div className="wms-helper-text" style={{ fontSize: '11px', color: 'var(--wms-accent-hover)', marginTop: '2px' }}>
                              {plan.batches.map((b) => {
                                const bQty = (b.expectedItems || []).reduce(
                                  (sum, it) => sum + (Number(it.plannedQty) || 0),
                                  0
                                );
                                return `Đ${b.batchNumber}: ${Number(bQty).toLocaleString('vi-VN')} (${b.batchPercentage}%)`;
                              }).join(' • ')}
                            </div>
                          ) : (
                            <div className="wms-helper-text" style={{ fontSize: '11px', color: 'var(--wms-accent-hover)' }}>
                              {plan.batchTitle || `${plan.expectedItems?.length || 0} loại nguyên phụ liệu`}
                            </div>
                          )}
                        </td>

                        {/* 5. Trạng thái KCS */}
                        <td style={{ textAlign: 'center' }}>
                          {renderComplianceBadge(plan)}
                        </td>

                        {/* 6. Thao tác */}
                        <td style={{ textAlign: 'center' }}>
                          <div
                            className="wms-action-cell"
                            style={{ justifyContent: 'center', gap: '6px' }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              className="wms-btn wms-btn-default wms-btn-xs"
                              onClick={() => handleOpenDetailModal(plan)}
                              title="Xem chi tiết kế hoạch tiếp nhận và ảnh hợp đồng vật lý"
                            >
                              <Eye size={12} />
                              <span>Chi tiết</span>
                            </button>
                            {plan.status === 'DEVIATION_REPORTED' && (
                              plan.reportedToOwner?.isReported ? (
                                <span
                                  className="wms-status-badge wms-status-completed"
                                  style={{ fontSize: '11px', padding: '2px 6px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                                  title={`Đã trình báo Owner lúc ${formatDate(plan.reportedToOwner.reportedAt)}`}
                                >
                                  <CheckCircle2 size={11} /> Đã báo Owner
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  className="wms-btn wms-btn-danger wms-btn-xs"
                                  onClick={() => handleReportToOwner(plan)}
                                  disabled={reportingOwner}
                                  title="Trình báo biên bản sai lệch KCS này lên Chủ sở hữu (Owner)"
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                                >
                                  <Send size={11} />
                                  <span>Trình báo Owner</span>
                                </button>
                              )
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Sub-table mở rộng danh sách các phiên bản của kế hoạch này */}
                      {isExpanded && (
                        <tr className="wms-family-subtable-row">
                          <td colSpan={6} style={{ padding: 0 }}>
                            <div className="wms-family-subtable-container">
                              <div className="wms-family-subtable-title">
                                <GitBranch size={14} color="#0284c7" />
                                <span>
                                  Lịch sử các phiên bản kế hoạch tiếp nhận: <strong>{family.baseCode}</strong> ({family.totalVersions} phiên bản)
                                </span>
                              </div>
                              <table className="wms-nested-table">
                                <thead>
                                  <tr>
                                    <th style={{ width: '80px', textAlign: 'center' }}>Phiên bản</th>
                                    <th style={{ width: '150px' }}>Mã Kế hoạch</th>
                                    <th style={{ width: '160px' }}>Hợp đồng liên kết</th>
                                    <th>Nội dung điều chỉnh / Ghi chú</th>
                                    <th style={{ width: '150px' }}>Lịch trình</th>
                                    <th style={{ width: '130px' }}>Quy mô</th>
                                    <th style={{ width: '140px', textAlign: 'center' }}>Trạng thái KCS</th>
                                    <th style={{ width: '100px', textAlign: 'center' }}>Thao tác</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {family.versions.map((vPlan) => {
                                    const vTotalQty = (vPlan.expectedItems || []).reduce(
                                      (acc, item) => acc + (Number(item.plannedQty) || 0),
                                      0
                                    );
                                    const vUnit =
                                      vPlan.expectedItems?.[0]?.unitSnapshot ||
                                      vPlan.expectedItems?.[0]?.rawMaterialId?.unit ||
                                      'METER';
                                    const vIsSuperseded = vPlan.status === 'RESOLVED_SUPERSEDED';

                                    return (
                                      <tr
                                        key={vPlan._id || vPlan.id}
                                        style={{
                                          opacity: vIsSuperseded ? 0.75 : 1,
                                          backgroundColor: vIsSuperseded ? '#F8FAFC' : '#FFFFFF',
                                        }}
                                      >
                                        <td style={{ textAlign: 'center' }}>
                                          <span
                                            className="wms-badge-version"
                                            style={{
                                              backgroundColor: vIsSuperseded ? '#CBD5E1' : '#0284c7',
                                              color: '#FFFFFF',
                                            }}
                                          >
                                            v{vPlan.versionNumber || 1}
                                          </span>
                                        </td>
                                        <td>
                                          <strong style={{ color: '#0F172A' }}>{vPlan.planCode}</strong>
                                          {vIsSuperseded && (
                                            <div style={{ fontSize: '11px', color: '#64748B' }}>
                                              (Đã được thay thế)
                                            </div>
                                          )}
                                        </td>
                                        <td>
                                          <strong>{vPlan.contractId?.contractCode || '—'}</strong>
                                        </td>
                                        <td>
                                          <div style={{ fontSize: '12px', color: '#334155' }}>
                                            {vPlan.amendmentReason || 'Khởi tạo theo hợp đồng gốc'}
                                          </div>
                                        </td>
                                        <td>
                                          <div style={{ fontSize: '12px' }}>
                                            {vPlan.batches && vPlan.batches.length > 1
                                              ? `${vPlan.batches.length} đợt giao`
                                              : formatDate(vPlan.scheduledDeliveryDate)}
                                          </div>
                                        </td>
                                        <td>
                                          <strong>{Number(vTotalQty).toLocaleString('vi-VN')} {vUnit}</strong>
                                        </td>
                                        <td style={{ textAlign: 'center' }}>
                                          {renderComplianceBadge(vPlan)}
                                        </td>
                                        <td style={{ textAlign: 'center' }}>
                                          <button
                                            type="button"
                                            className="wms-btn wms-btn-default wms-btn-xs"
                                            onClick={() => handleOpenDetailModal(vPlan)}
                                            title="Xem chi tiết phiên bản này"
                                          >
                                            <Eye size={12} /> Chi tiết
                                          </button>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Modal 1: Create Inbound Plan (With Multi-Batch Deliveries & Physical Contract Photos) */}
      {isModalOpen && (
        <div className="wms-modal-backdrop" role="dialog" aria-modal="true">
          <form className="wms-modal-dialog wide" onSubmit={handleSubmitPlan}>
            <div className="wms-modal-header">
              <div>
                <h2 className="wms-modal-title">
                  {planForm.isNewVersion
                    ? `Cập nhật Kế hoạch & Tạo Phiên bản mới: ${planForm.planCode}`
                    : 'Lập Kế hoạch Lịch trình Tiếp nhận Nguyên phụ liệu'}
                </h2>
                {planForm.isNewVersion && (
                  <div className="wms-helper-text" style={{ fontSize: '12px' }}>
                    Nâng cấp từ kế hoạch gốc: <strong>[{planForm.originalPlanCode}]</strong>
                  </div>
                )}
              </div>
              <button
                type="button"
                className="wms-btn wms-btn-default wms-btn-sm"
                onClick={() => setIsModalOpen(false)}
              >
                <X size={16} />
                Đóng
              </button>
            </div>

            <div className="wms-modal-body">
              {/* Cảnh báo Phiên bản mới */}
              {planForm.isNewVersion && (
                <div
                  className="wms-feedback-banner info"
                  style={{
                    marginBottom: '16px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    padding: '12px 14px',
                    borderRadius: '8px',
                  }}
                >
                  <GitBranch size={18} color="var(--wms-primary)" style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div style={{ fontSize: '13px', lineHeight: 1.5 }}>
                    <strong>Cơ chế Quản lý Phiên bản Kế hoạch (Plan Versioning):</strong> Bạn đang điều chỉnh kế hoạch gốc <strong>[{planForm.originalPlanCode}]</strong> để lưu thành <strong>Phiên bản v{planForm.versionNumber}</strong> ({planForm.planCode}). Phiên bản cũ sẽ được bảo lưu trong lịch sử kiểm toán và chuyển sang trạng thái <em>Đã thay thế (SUPERSEDED)</em>.
                  </div>
                </div>
              )}

              {/* THÔNG TIN HỢP ĐỒNG GẮN LIỀN & PHIÊN BẢN KẾ HOẠCH TIẾP NHẬN */}
              <div className="wms-form-section">
                <div className="wms-form-section-header">
                  <h3 className="wms-form-section-title">
                    <CalendarClock size={18} />
                    1. Hợp đồng Mua sắm & Định danh Phiên bản Kế hoạch
                  </h3>
                </div>

                {planForm.isNewVersion ? (
                  <div
                    style={{
                      background: '#F8FAFC',
                      border: '1px solid #CBD5E1',
                      borderRadius: '8px',
                      padding: '14px',
                      marginBottom: '14px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span
                          style={{
                            background: '#0F172A',
                            color: '#FFFFFF',
                            fontSize: '11.5px',
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: '4px',
                          }}
                        >
                          HỢP ĐỒNG GỐC: [{currentContract?.contractCode || 'HD-2026-003'}]
                        </span>
                        <strong style={{ fontSize: '13.5px', color: '#0F172A' }}>
                          {currentContract?.contractTitle || 'Hợp đồng Cung ứng Nguyên phụ liệu'}
                        </strong>
                      </div>
                      <span style={{ fontSize: '12px', color: '#475569' }}>
                        Thời hạn HĐ: <strong>{currentContract?.effectiveFrom ? new Date(currentContract.effectiveFrom).toLocaleDateString('vi-VN') : '—'}</strong> đến <strong>{currentContract?.effectiveTo ? new Date(currentContract.effectiveTo).toLocaleDateString('vi-VN') : '—'}</strong>
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '12.5px', color: '#334155', borderTop: '1px solid #E2E8F0', paddingTop: '8px' }}>
                      <div>
                        Nhà cung cấp: <strong>{currentContract?.supplierId?.supplierName || '—'}</strong> ({currentContract?.supplierId?.supplierCode || 'NCC'})
                      </div>
                      <div>
                        Mã Kế hoạch mới: <strong style={{ color: '#0284C7' }}>{planForm.planCode}</strong> (Nâng cấp từ: <em>{planForm.originalPlanCode}</em>)
                      </div>
                      <div>
                        Số mặt hàng ký HĐ: <strong>{(currentContract?.contractedMaterials || []).length} mặt hàng</strong>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="wms-form-grid-3">
                    <div className={`wms-field ${planErrors.planCode ? 'has-error' : ''}`}>
                      <label htmlFor="pf-code" className="wms-label">
                        Mã Kế hoạch <span className="wms-required">*</span>
                      </label>
                      <input
                        id="pf-code"
                        type="text"
                        className="wms-input"
                        value={planForm.planCode}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (planErrors.planCode) {
                            setPlanErrors((prev) => {
                              const next = { ...prev };
                              delete next.planCode;
                              return next;
                            });
                          }
                          setPlanForm((prev) => ({
                            ...prev,
                            planCode: val,
                          }));
                        }}
                        required
                      />
                      {planErrors.planCode && (
                        <span className="wms-field-error-text">
                          <AlertCircle size={12} /> {planErrors.planCode}
                        </span>
                      )}
                    </div>

                    <div className={`wms-field wms-field-span-2 ${planErrors.contractId ? 'has-error' : ''}`} style={{ position: 'relative' }}>
                      <label htmlFor="pf-contract" className="wms-label">
                        Hợp đồng Nguyên phụ liệu (ACTIVE) <span className="wms-required">*</span>
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <select
                          id="pf-contract"
                          className="wms-select"
                          style={{ flex: 1, minWidth: 0 }}
                          value={planForm.contractId}
                          onChange={(e) => handleSelectContract(e.target.value)}
                          required
                        >
                          <option value="">-- Chọn Hợp đồng --</option>
                          {activeContracts.map((c) => {
                            const cid = c._id || c.id;
                            const hasPlan = (plans || []).some(
                              (p) => String(p.contractId?._id || p.contractId) === String(cid) && p.status !== 'CANCELLED'
                            );
                            return (
                              <option key={cid || c.contractCode} value={cid}>
                                [{c.contractCode}] {c.supplierId?.supplierName} {hasPlan ? '— (Đã có KH nhập hàng)' : ''}
                              </option>
                            );
                          })}
                        </select>
                        <button
                          type="button"
                          className={`wms-btn ${showContractSearch ? 'wms-btn-primary' : 'wms-btn-default'}`}
                          style={{
                            height: '38px',
                            width: '38px',
                            padding: 0,
                            flexShrink: 0,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                          title="Tìm kiếm nhanh hợp đồng"
                          onClick={() => setShowContractSearch((prev) => !prev)}
                        >
                          <Search size={15} />
                        </button>
                      </div>

                      {showContractSearch && (
                        <div
                          style={{
                            marginTop: '6px',
                            padding: '8px',
                            borderRadius: '6px',
                            border: '1px solid var(--wms-border-strong)',
                            backgroundColor: '#FFFFFF',
                            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
                          }}
                        >
                          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                            <Search
                              size={14}
                              style={{
                                position: 'absolute',
                                left: '10px',
                                color: 'var(--wms-secondary)',
                                pointerEvents: 'none',
                              }}
                            />
                            <input
                              type="text"
                              className="wms-input"
                              style={{
                                paddingLeft: '30px',
                                paddingRight: '28px',
                                height: '34px',
                                fontSize: '12.5px',
                              }}
                              placeholder="Nhập mã HĐ, tên hoặc mã NCC để tìm..."
                              value={contractSearchKeyword}
                              onChange={(e) => setContractSearchKeyword(e.target.value)}
                              autoFocus
                            />
                            {contractSearchKeyword && (
                              <button
                                type="button"
                                onClick={() => setContractSearchKeyword('')}
                                title="Xóa từ khóa"
                                style={{
                                  position: 'absolute',
                                  right: '8px',
                                  background: 'none',
                                  border: 'none',
                                  cursor: 'pointer',
                                  color: 'var(--wms-secondary)',
                                  display: 'inline-flex',
                                  padding: '2px',
                                }}
                              >
                                <X size={13} />
                              </button>
                            )}
                          </div>

                          <div
                            style={{
                              maxHeight: '180px',
                              overflowY: 'auto',
                              marginTop: '6px',
                              borderTop: '1px solid var(--wms-border)',
                              paddingTop: '4px',
                            }}
                          >
                            {filteredActiveContracts.length === 0 ? (
                              <div className="wms-helper-text" style={{ padding: '6px 8px', textAlign: 'center' }}>
                                Không tìm thấy hợp đồng ACTIVE phù hợp.
                              </div>
                            ) : (
                              filteredActiveContracts.map((c) => {
                                const cid = String(c._id || c.id);
                                const isSelected = String(planForm.contractId) === cid;
                                const hasPlan = (plans || []).some(
                                  (p) => String(p.contractId?._id || p.contractId) === cid && p.status !== 'CANCELLED'
                                );

                                return (
                                  <button
                                    key={cid || c.contractCode}
                                    type="button"
                                    onClick={() => {
                                      handleSelectContract(cid);
                                      setShowContractSearch(false);
                                    }}
                                    style={{
                                      width: '100%',
                                      textAlign: 'left',
                                      padding: '6px 8px',
                                      borderRadius: '4px',
                                      border: 'none',
                                      background: isSelected ? 'var(--wms-primary-subtle)' : 'transparent',
                                      cursor: 'pointer',
                                      fontSize: '12.5px',
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      alignItems: 'center',
                                      gap: '8px',
                                    }}
                                  >
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      <strong>[{c.contractCode}]</strong> {c.supplierId?.supplierName}
                                    </span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                                      {hasPlan && (
                                        <span className="wms-badge-batch" style={{ fontSize: '10px', padding: '1px 5px', background: '#FEF3C7', color: '#B45309' }}>
                                          Đã có KH
                                        </span>
                                      )}
                                      {isSelected && <CheckCircle2 size={14} style={{ color: 'var(--wms-accent)', flexShrink: 0 }} />}
                                    </div>
                                  </button>
                                );
                              })
                            )}
                          </div>
                        </div>
                      )}
                      {planErrors.contractId && (
                        <span className="wms-field-error-text">
                          <AlertCircle size={12} /> {planErrors.contractId}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Ô NHẬP LÝ DO ĐIỀU CHỈNH KẾ HOẠCH TIẾP NHẬN (KHI TẠO PHIÊN BẢN MỚI) */}
                {planForm.isNewVersion && (
                  <div
                    className={`wms-field wms-field-span-full ${planErrors.amendmentReason ? 'has-error' : ''}`}
                    style={{ background: '#F8FAFC', padding: '12px', borderRadius: '6px', border: '1px dashed #0284C7' }}
                  >
                    <label className="wms-label" style={{ fontWeight: 700, color: '#0F172A' }}>
                      Lý do điều chỉnh / Nội dung phụ lục Kế hoạch tiếp nhận <span className="wms-required">*</span>
                    </label>
                    <textarea
                      rows={2}
                      className="wms-textarea"
                      placeholder="VD: Điều chỉnh lịch giao đợt 2 theo đề xuất của nhà cung ứng, gia hạn giao hàng thêm 5 ngày và nâng tỷ lệ đợt 1 lên 60%..."
                      value={planForm.amendmentReason}
                      onChange={(e) => {
                        const val = e.target.value;
                        setPlanForm((prev) => ({ ...prev, amendmentReason: val }));
                        if (planErrors.amendmentReason) {
                          setPlanErrors((prev) => {
                            const next = { ...prev };
                            delete next.amendmentReason;
                            return next;
                          });
                        }
                      }}
                      required
                    />
                    {planErrors.amendmentReason && (
                      <span className="wms-field-error-text">
                        <AlertCircle size={12} /> {planErrors.amendmentReason}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* PHẦN LẬP LỊCH & PHÂN BỔ ĐỢT GIAO HÀNG (CHUẨN FORM HỢP ĐỒNG PHẦN IV) */}
              <div className="wms-form-section">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <h2 className="wms-form-section-title" style={{ color: '#0369A1', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Truck size={20} color="#0284C7" />
                      Kế hoạch Lịch trình Tiếp nhận Nguyên vật liệu (Lập lịch & Phân bổ đợt giao)
                    </h2>
                    <p style={{ margin: '4px 0 0 0', fontSize: '12.5px', color: '#64748B' }}>
                      Tùy chọn số đợt giao hàng theo nhu cầu thực tế (1 đợt, 2 đợt, 3 đợt, 4 đợt...). Khi điều chỉnh số lượng các đợt trước, đợt cuối cùng sẽ tự động điền phần số lượng còn thiếu để luôn khớp 100% hợp đồng.
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="wms-btn"
                      style={{ background: '#0284C7', color: '#FFFFFF', border: '1px solid #0284C7', fontWeight: 600, fontSize: '12px' }}
                      onClick={() => handleBatchesCountChange((Number(batchesCount) || batches.length || 1) + 1)}
                      title="Thêm 1 đợt giao hàng mới"
                    >
                      <Plus size={13} style={{ marginRight: 4 }} />
                      Thêm 1 đợt giao
                    </button>
                    <button
                      type="button"
                      className="wms-btn"
                      style={{ background: '#E0F2FE', color: '#0284C7', border: '1px solid #7DD3FC', fontWeight: 600, fontSize: '12px' }}
                      onClick={handleAutoBalanceBatches}
                      title="Tự động chia đều lại số lượng cho tất cả các đợt"
                    >
                      <RefreshCw size={13} style={{ marginRight: 4 }} />
                      Chia đều các đợt
                    </button>
                  </div>
                </div>

                {/* Cấu hình 3 trường chuẩn: Số đợt tiếp nhận, Ghi chú lịch trình, Kho tiếp nhận vật lý */}
                <div className="wms-form-grid-3" style={{ marginTop: '14px', background: '#FFFFFF', padding: '14px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                  <div className="wms-field">
                    <label className="wms-label" style={{ fontWeight: 700, color: '#0F172A' }}>
                      Số đợt tiếp nhận nguyên liệu (Tùy chọn số đợt giao)
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', border: '1px solid #0284C7', borderRadius: '6px', overflow: 'hidden', background: '#FFFFFF' }}>
                        <button
                          type="button"
                          onClick={() => handleBatchesCountChange(Math.max(1, (Number(batchesCount) || batches.length || 1) - 1))}
                          disabled={(Number(batchesCount) || 1) <= 1}
                          style={{
                            border: 'none',
                            background: '#F0F9FF',
                            color: '#0369A1',
                            fontWeight: 700,
                            fontSize: '15px',
                            width: '34px',
                            height: '36px',
                            cursor: (Number(batchesCount) || 1) <= 1 ? 'not-allowed' : 'pointer',
                          }}
                          title="Giảm 1 đợt giao"
                        >
                          −
                        </button>
                        <input
                          type="number"
                          min={1}
                          max={24}
                          value={batchesCount}
                          onChange={(e) => handleBatchesCountChange(e.target.value)}
                          onBlur={(e) => {
                            if (!e.target.value || Number(e.target.value) < 1) {
                              handleBatchesCountChange(1);
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
                          onClick={() => handleBatchesCountChange(Math.min(24, (Number(batchesCount) || batches.length || 1) + 1))}
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
                          const isCurr = Number(batchesCount || batches.length) === presetNum;
                          return (
                            <button
                              key={presetNum}
                              type="button"
                              onClick={() => handleBatchesCountChange(presetNum)}
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
                      value={planForm.notes || ''}
                      onChange={(e) => setPlanForm((prev) => ({ ...prev, notes: e.target.value }))}
                    />
                    <span className="wms-helper-text">Lưu ý cho Kỹ thuật viên & Quản lý kho khi hàng về</span>
                  </div>

                  <div className="wms-field">
                    <label className="wms-label">Kho tiếp nhận vật lý</label>
                    <input
                      type="text"
                      className="wms-input"
                      disabled
                      value={currentContract?.buyerInfo?.receivingWarehouseAddress || 'Kho Tổng Nguyên Phụ Liệu AraStore'}
                      style={{ background: '#F1F5F9', color: '#475569' }}
                    />
                    <span className="wms-helper-text">Địa chỉ nhập kho theo thông tin Bên Mua</span>
                  </div>
                </div>

                {/* Chi tiết từng đợt tiếp nhận */}
                <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {batches.map((batch, bIdx) => {
                    const bErr = planErrors.batchErrors?.[bIdx] || {};
                    const totalBatchesLen = batches.length;
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
                              onChange={(e) => handleBatchFieldChange(bIdx, 'batchTitle', e.target.value)}
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
                                  borderColor: bErr.scheduledDeliveryDate ? '#EF4444' : '#CBD5E1',
                                }}
                                min={currentContract?.effectiveFrom ? String(currentContract.effectiveFrom).slice(0, 10) : undefined}
                                max={currentContract?.effectiveTo ? String(currentContract.effectiveTo).slice(0, 10) : undefined}
                                value={batch.scheduledDeliveryDate ? String(batch.scheduledDeliveryDate).slice(0, 10) : ''}
                                onChange={(e) => handleBatchFieldChange(bIdx, 'scheduledDeliveryDate', e.target.value)}
                              />
                            </div>

                            {totalBatchesLen > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveBatch(bIdx)}
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

                        {bErr.scheduledDeliveryDate && (
                          <div style={{ fontSize: '12px', color: '#DC2626', marginBottom: '8px' }}>
                            ⚠️ {bErr.scheduledDeliveryDate}
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
                                  (currentContract?.contractedMaterials || [])[itIdx] ||
                                  (currentContract?.contractedMaterials || []).find(
                                    (cm) =>
                                      String(cm.rawMaterialId?._id || cm.rawMaterialId?.id || cm.rawMaterialId) ===
                                      String(it.rawMaterialId?._id || it.rawMaterialId?.id || it.rawMaterialId)
                                  );
                                const cQty = Number(cMat?.contractedQty || it.contractedQty || 0);
                                const itErr = bErr.itemErrors?.[itIdx];
                                const allRolls = it.allRolls || cMat?.rollDetails || [];
                                const isHighlightedMismatch = highlightedMismatchItem?.itemIdx === itIdx;

                                return (
                                  <tr
                                    key={itIdx}
                                    id={`plan-batch-row-${bIdx}-item-${itIdx}`}
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
                                              handleToggleBatchRoll(bIdx, itIdx, allRolls[0]);
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
                                              const otherBatchIndex = batches.findIndex(
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
                                                        handleToggleBatchRoll(bIdx, itIdx, roll);
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
                                                            handleBatchRollQtyChange(bIdx, itIdx, roll, e.target.value)
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
                                                    handleToggleBatchRoll(bIdx, itIdx, roll);
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
                                        id={`plan-batch-input-${bIdx}-item-${itIdx}`}
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
                                        onChange={(e) => handleBatchItemQtyChange(bIdx, itIdx, e.target.value)}
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

                        <div className="wms-field" style={{ marginTop: '10px', marginBottom: 0 }}>
                          <input
                            type="text"
                            className="wms-input"
                            style={{ height: '32px', fontSize: '12px' }}
                            placeholder={`Ghi chú riêng cho Đợt ${batch.batchNumber || bIdx + 1} (VD: xe tải 5 tấn, yêu cầu giao buổi sáng...)`}
                            value={batch.notes || ''}
                            onChange={(e) => handleBatchFieldChange(bIdx, 'notes', e.target.value)}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Bảng đối soát cân đối tổng thể giữa Hợp đồng & Các đợt giao */}
                {allocationBalance.length > 0 && (
                  <div style={{ marginTop: '16px', background: '#FFFFFF', padding: '14px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <PackageCheck size={16} color="#059669" />
                        Đối soát cân đối giữa Hợp đồng & Các đợt giao (Bảo toàn 100% số lượng cam kết)
                      </span>
                      <span style={{ fontSize: '12px', color: '#64748B' }}>
                        {allocationBalance.every((b) => b.isBalanced) ? (
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
                              onClick={() => handleScrollToPlanMismatchItem()}
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
                          {allocationBalance.map((bal, idx) => (
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
                                {bal.diff === 0 ? '0' : bal.diff > 0 ? `Thiếu ${bal.diff}` : `Thừa ${Math.abs(bal.diff)}`}
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                {bal.isBalanced ? (
                                  <span style={{ color: '#059669', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                    <CheckCircle2 size={13} /> Khớp 100%
                                  </span>
                                ) : (
                                  <span style={{ color: '#DC2626', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                    <AlertTriangle size={13} /> {bal.diff > 0 ? 'Chưa phân bổ đủ' : 'Vượt số lượng HĐ'}
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              {/* PHẦN 4: ẢNH CHỤP HỢP ĐỒNG VẬT LÝ & GHI CHÚ CHUNG */}
              <div className="wms-form-section">
                <div className="wms-form-section-header">
                  <h3 className="wms-form-section-title">
                    <ImageIcon size={18} />
                    Ảnh chụp Hợp đồng vật lý & Biên bản ký kết đính kèm
                  </h3>
                  <span className="wms-helper-text">
                    Đã tải lên: <strong>{planForm.physicalContractPhotos.length} ảnh</strong>
                  </span>
                </div>

                <div className="wms-photo-uploader">
                  <label htmlFor="photo-file-input" className="wms-photo-dropzone">
                    <UploadCloud size={28} color="var(--wms-accent)" />
                    <div>
                      <strong>Nhấn để chọn ảnh chụp Hợp đồng vật lý</strong> hoặc phiếu giao hàng
                    </div>
                    <div className="wms-helper-text" style={{ fontSize: '11.5px' }}>
                      Hỗ trợ định dạng JPG, PNG, WEBP (Tối đa 5MB / ảnh, cho phép chọn nhiều ảnh cùng lúc)
                    </div>
                    <input
                      id="photo-file-input"
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handlePhotoUpload}
                      style={{ display: 'none' }}
                    />
                  </label>

                  {/* Previews grid */}
                  {planForm.physicalContractPhotos.length > 0 && (
                    <div className="wms-photo-grid">
                      {planForm.physicalContractPhotos.map((photoUrl, pIdx) => (
                        <div key={pIdx} className="wms-photo-card">
                          <img
                            src={photoUrl}
                            alt={`Hợp đồng vật lý trang ${pIdx + 1}`}
                            onClick={() => setLightboxImage(photoUrl)}
                            title="Nhấn để phóng to ảnh"
                          />
                          <div className="wms-photo-card-actions">
                            <button
                              type="button"
                              className="wms-photo-delete-btn"
                              onClick={() => handleRemovePhoto(pIdx)}
                              title="Xóa ảnh này"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Ghi chú kế hoạch chung */}
                <div className="wms-field" style={{ marginTop: '16px' }}>
                  <label htmlFor="pf-notes" className="wms-label">
                    Ghi chú chung cho toàn bộ lịch trình tiếp nhận
                  </label>
                  <textarea
                    id="pf-notes"
                    rows={2}
                    className="wms-textarea"
                    placeholder="Nhập ghi chú chung yêu cầu KCS, thời gian xe tải vào kho, điều phối lái xe..."
                    value={planForm.notes}
                    onChange={(e) =>
                      setPlanForm((prev) => ({ ...prev, notes: e.target.value }))
                    }
                  />
                </div>
              </div>
            </div>

            <div className="wms-modal-footer">
              <button
                type="button"
                className="wms-btn wms-btn-default"
                onClick={() => setIsModalOpen(false)}
              >
                Hủy bỏ
              </button>
              <button
                type="submit"
                className="wms-btn wms-btn-primary"
                disabled={submitting}
              >
                {submitting
                  ? 'Đang lưu Kế hoạch...'
                  : planForm.isNewVersion
                  ? `Lưu thành Phiên bản mới (v${planForm.versionNumber})`
                  : batches.length > 1
                  ? `Xác nhận Lập Kế hoạch (${batches.length} đợt nhập)`
                  : 'Xác nhận Lập Kế hoạch Tiếp nhận'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal 2: Plan Detail View (Tất cả dữ liệu & Ảnh hợp đồng vật lý) */}
      {selectedPlanForDetail && (
        <div className="wms-modal-backdrop" role="dialog" aria-modal="true">
          <div className="wms-modal-dialog wide">
            <div className="wms-modal-header">
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <h2 className="wms-modal-title" style={{ margin: 0 }}>
                    Chi tiết Kế hoạch Tiếp nhận: {selectedPlanForDetail.planCode}
                  </h2>
                  <span className="wms-badge-version" style={{ backgroundColor: '#0284C7', color: '#FFFFFF', padding: '2px 8px' }}>
                    v{selectedPlanForDetail.versionNumber || 1}
                  </span>
                </div>
                <div className="wms-helper-text" style={{ fontSize: '12px', marginTop: '4px' }}>
                  Hợp đồng căn cứ: <strong>{selectedPlanForDetail.contractId?.contractCode || '—'}</strong>
                  {selectedPlanForDetail.supplierId?.supplierName && ` · NCC: ${selectedPlanForDetail.supplierId.supplierName}`}
                </div>

                {/* Các nút chuyển đổi version nhanh nếu có nhiều hơn 1 phiên bản */}
                {planVersions && planVersions.length > 1 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>Xem phiên bản:</span>
                    {planVersions.map((pv, pIdx) => {
                      const isViewing = String(pv._id || pv.id) === String(selectedPlanForDetail._id || selectedPlanForDetail.id);
                      return (
                        <button
                          key={pIdx}
                          type="button"
                          onClick={() => handleSwitchViewingVersion(pv)}
                          style={{
                            fontSize: '11.5px',
                            padding: '2px 9px',
                            borderRadius: '4px',
                            border: isViewing ? '1.5px solid #0284C7' : '1px solid #CBD5E1',
                            background: isViewing ? '#0284C7' : '#FFFFFF',
                            color: isViewing ? '#FFFFFF' : '#334155',
                            fontWeight: isViewing ? 700 : 500,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            boxShadow: isViewing ? '0 1px 2px rgba(2, 132, 199, 0.2)' : 'none',
                          }}
                          title={`Chuyển sang xem phiên bản v${pv.versionNumber || 1} (${pv.planCode})`}
                        >
                          <GitBranch size={11} />
                          v{pv.versionNumber || 1} {isViewing ? '(Đang xem)' : ''}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <button
                type="button"
                className="wms-btn wms-btn-default wms-btn-sm"
                onClick={() => setSelectedPlanForDetail(null)}
              >
                <X size={16} />
                Đóng
              </button>
            </div>

            <div className="wms-modal-body">
              {isPlanContractTerminated(selectedPlanForDetail) && (
                <div
                  style={{
                    padding: '12px 16px',
                    backgroundColor: '#FEF2F2',
                    border: '1.5px solid #FCA5A5',
                    borderRadius: '8px',
                    marginBottom: '16px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    color: '#991B1B',
                  }}
                >
                  <Ban size={20} color="#DC2626" style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '13.5px' }}>
                      HỢP ĐỒNG ĐÃ CHẤM DỨT ({selectedPlanForDetail.contractId?.contractCode || 'Hợp đồng gốc'})
                    </div>
                    <div style={{ fontSize: '12.5px', marginTop: '4px', lineHeight: 1.5 }}>
                      Hợp đồng liên kết với kế hoạch này đã bị chấm dứt hiệu lực. Mọi tiến trình tiếp nhận, kiểm định KCS và điều chỉnh đợt giao tiếp theo đã ngừng thực hiện.
                      {getPlanContractTerminationReason(selectedPlanForDetail) && (
                        <div style={{ fontStyle: 'italic', marginTop: '4px', color: '#B91C1C' }}>
                          • Ghi chú lý do: {getPlanContractTerminationReason(selectedPlanForDetail)}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Thẻ 1: Thông tin tổng quan */}
              <div className="wms-detail-card">
                <div className="wms-detail-card-title">
                  <FileText size={16} color="var(--wms-accent)" />
                  <span>Thông tin Tổng quan Kế hoạch Tiếp nhận</span>
                </div>
                <div className="wms-detail-grid-2">
                  <div className="wms-detail-item">
                    <span className="wms-detail-label">Mã kế hoạch tiếp nhận</span>
                    <span className="wms-detail-value" style={{ fontWeight: 700 }}>
                      {selectedPlanForDetail.planCode}
                    </span>
                  </div>

                  <div className="wms-detail-item">
                    <span className="wms-detail-label">Quy mô các đợt giao hàng</span>
                    <span className="wms-detail-value">
                      <span className="wms-badge-batch" style={{ marginRight: 6 }}>
                        {selectedPlanForDetail.batches?.length || selectedPlanForDetail.totalBatches || 1} đợt giao
                      </span>
                      <span>
                        (Gộp chung {selectedPlanForDetail.batches?.length || selectedPlanForDetail.totalBatches || 1} đợt nhập theo tiến độ hợp đồng)
                      </span>
                    </span>
                  </div>

                  <div className="wms-detail-item">
                    <span className="wms-detail-label">Trạng thái tiếp nhận & KCS</span>
                    <div>
                      {(() => {
                        const b = PLAN_STATUS_BADGE[selectedPlanForDetail.status] || {
                          label: selectedPlanForDetail.status,
                          cls: 'wms-status-pending',
                        };
                        return <span className={`wms-status-badge ${b.cls}`}>{b.label}</span>;
                      })()}
                    </div>
                  </div>

                  <div className="wms-detail-item">
                    <span className="wms-detail-label">Hợp đồng mua sắm căn cứ</span>
                    <span className="wms-detail-value">
                      <strong>{selectedPlanForDetail.contractId?.contractCode || '—'}</strong>
                      {selectedPlanForDetail.contractId?.contractTitle && (
                        <span style={{ marginLeft: 6, fontSize: '12px', color: 'var(--wms-secondary)' }}>
                          ({selectedPlanForDetail.contractId.contractTitle})
                        </span>
                      )}
                    </span>
                  </div>

                  <div className="wms-detail-item">
                    <span className="wms-detail-label">Đối tác cung ứng (Bên B)</span>
                    <span className="wms-detail-value">
                      <strong>{selectedPlanForDetail.supplierId?.supplierName || '—'}</strong>
                      {selectedPlanForDetail.supplierId?.taxCode && (
                        <span style={{ marginLeft: 6, fontSize: '12px' }}>
                          (MST: {selectedPlanForDetail.supplierId.taxCode})
                        </span>
                      )}
                    </span>
                  </div>

                  <div className="wms-detail-item">
                    <span className="wms-detail-label">Lịch trình giao hàng các đợt</span>
                    <span className="wms-detail-value" style={{ fontWeight: 700, color: 'var(--wms-accent-hover)' }}>
                      {selectedPlanForDetail.batches?.length > 1
                        ? `Từ ${formatDate(selectedPlanForDetail.batches[0]?.scheduledDeliveryDate)} đến ${formatDate(selectedPlanForDetail.batches[selectedPlanForDetail.batches.length - 1]?.scheduledDeliveryDate)} (${selectedPlanForDetail.batches.length} đợt)`
                        : formatDate(selectedPlanForDetail.scheduledDeliveryDate)}
                    </span>
                  </div>

                  <div className="wms-detail-item">
                    <span className="wms-detail-label">Kho tiếp nhận chỉ định</span>
                    <span className="wms-detail-value">
                      Kho Tổng Nguyên Phụ Liệu AraStore – KCN Tân Bình, TP.HCM
                    </span>
                  </div>

                  <div className="wms-detail-item">
                    <span className="wms-detail-label">Kế toán lập kế hoạch</span>
                    <span className="wms-detail-value">
                      {selectedPlanForDetail.createdByAccountantId?.fullName || 'Kế toán Kho & Tài chính'}
                      {selectedPlanForDetail.createdByAccountantId?.employeeCode && (
                        <span style={{ marginLeft: 4, fontSize: '12px' }}>
                          ({selectedPlanForDetail.createdByAccountantId.employeeCode})
                        </span>
                      )}
                    </span>
                  </div>

                  <div className="wms-detail-item">
                    <span className="wms-detail-label">Thời gian tạo lập hồ sơ</span>
                    <span className="wms-detail-value">
                      {formatDate(selectedPlanForDetail.createdAt)}
                    </span>
                  </div>

                  <div className="wms-detail-item">
                    <span className="wms-detail-label">Phiên bản kế hoạch</span>
                    <span className="wms-detail-value" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="wms-badge-batch" style={{ fontSize: '11px', background: '#0284c7', color: '#fff' }}>
                        Phiên bản v{selectedPlanForDetail.versionNumber || 1}
                      </span>
                      {selectedPlanForDetail.parentSupersededPlanId && (
                        <span className="wms-helper-text" style={{ fontSize: '11.5px' }}>
                          (Nâng cấp từ {selectedPlanForDetail.parentSupersededPlanId.planCode || 'bản trước'})
                        </span>
                      )}
                    </span>
                  </div>

                  {selectedPlanForDetail.amendmentReason && (
                    <div className="wms-detail-item" style={{ gridColumn: 'span 2' }}>
                      <span className="wms-detail-label">Lý do điều chỉnh / Nội dung phụ lục</span>
                      <span className="wms-detail-value" style={{ color: 'var(--wms-accent-hover)', fontWeight: 600 }}>
                        {selectedPlanForDetail.amendmentReason}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Thẻ: Cây Lịch sử Phiên bản (Version History) */}
              {planVersions && planVersions.length > 0 && (
                <div className="wms-detail-card">
                  <div className="wms-detail-card-title">
                    <History size={16} color="var(--wms-accent)" />
                    <span>Lịch sử các Phiên bản của Kế hoạch này ({planVersions.length} phiên bản)</span>
                  </div>
                  <div className="wms-table-scroll">
                    <table className="wms-table" style={{ fontSize: '12px' }}>
                      <thead>
                        <tr>
                          <th style={{ width: '80px', textAlign: 'center' }}>Phiên bản</th>
                          <th style={{ width: '150px' }}>Mã Kế hoạch</th>
                          <th style={{ width: '150px' }}>Hợp đồng liên kết</th>
                          <th>Lý do Điều chỉnh / Ghi chú</th>
                          <th style={{ width: '110px' }}>Ngày lập</th>
                          <th style={{ width: '140px', textAlign: 'center' }}>Trạng thái KCS</th>
                          <th style={{ width: '100px', textAlign: 'center' }}>Thao tác</th>
                        </tr>
                      </thead>
                      <tbody>
                        {planVersions.map((v, vIdx) => {
                          const vBadge = PLAN_STATUS_BADGE[v.status] || { label: v.status, cls: 'wms-status-pending' };
                          const isCurrentViewing = String(v._id || v.id) === String(selectedPlanForDetail._id || selectedPlanForDetail.id);
                          return (
                            <tr
                              key={vIdx}
                              style={{
                                background: isCurrentViewing ? 'var(--wms-primary-subtle)' : 'transparent',
                                cursor: 'pointer',
                              }}
                              onClick={() => handleSwitchViewingVersion(v)}
                              title="Nhấn để xem chi tiết phiên bản này"
                            >
                              <td style={{ textAlign: 'center' }}>
                                <span className="wms-badge-batch" style={{ fontSize: '11px', background: isCurrentViewing ? '#0284c7' : 'var(--wms-gray-200)', color: isCurrentViewing ? '#fff' : 'inherit' }}>
                                  v{v.versionNumber || 1}
                                </span>
                              </td>
                              <td>
                                <strong>{v.planCode}</strong>
                                {isCurrentViewing && (
                                  <span style={{ marginLeft: 6, fontSize: '11px', color: 'var(--wms-accent-hover)', fontWeight: 600 }}>
                                    (Đang xem)
                                  </span>
                                )}
                              </td>
                              <td>
                                <strong style={{ color: '#0F172A' }}>{v.contractId?.contractCode || '—'}</strong>
                              </td>
                              <td style={{ color: v.amendmentReason ? 'var(--wms-text-primary)' : 'var(--wms-secondary)' }}>
                                {v.amendmentReason || 'Khởi tạo kế hoạch ban đầu'}
                              </td>
                              <td>{formatDate(v.createdAt)}</td>
                              <td style={{ textAlign: 'center' }}>
                                <span className={`wms-status-badge ${vBadge.cls}`} style={{ fontSize: '11px' }}>
                                  {vBadge.label}
                                </span>
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                <button
                                  type="button"
                                  className={`wms-btn ${isCurrentViewing ? 'wms-btn-primary' : 'wms-btn-default'} wms-btn-xs`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSwitchViewingVersion(v);
                                  }}
                                  style={{ fontSize: '11px', padding: '2px 8px' }}
                                >
                                  {isCurrentViewing ? 'Đang xem' : 'Xem bản này'}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Thẻ 2: Tiến độ các đợt giao hàng gộp chung */}
              {Array.isArray(selectedPlanForDetail.batches) && selectedPlanForDetail.batches.length > 0 && (
                <div className="wms-detail-card">
                  <div className="wms-detail-card-title">
                    <Calendar size={16} color="var(--wms-accent)" />
                    <span>Lịch trình Tiến độ {selectedPlanForDetail.batches.length} Đợt Nhập Hàng Gộp Chung</span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {selectedPlanForDetail.batches.map((b, bIdx) => (
                      <div
                        key={bIdx}
                        className="wms-batch-card"
                        style={{
                          padding: '14px',
                          background: 'var(--wms-gray-50)',
                          borderRadius: '8px',
                          border: '1px solid var(--wms-border)',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '8px',
                            flexWrap: 'wrap',
                            gap: '6px',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span className="wms-badge-batch" style={{ fontSize: '12px' }}>
                              Đợt {b.batchNumber}/{selectedPlanForDetail.batches.length} ({b.batchPercentage}%)
                            </span>
                            <strong style={{ fontSize: '13px' }}>
                              {b.batchTitle || `Tiếp nhận đợt ${b.batchNumber}`}
                            </strong>
                          </div>
                          <div style={{ fontSize: '12.5px', color: 'var(--wms-text-muted)' }}>
                            Ngày giao dự kiến:{' '}
                            <strong style={{ color: 'var(--wms-accent-hover)' }}>
                              {formatDate(b.scheduledDeliveryDate)}
                            </strong>
                          </div>
                        </div>

                        {b.notes && (
                          <div
                            style={{
                              fontSize: '12px',
                              color: 'var(--wms-secondary)',
                              marginBottom: '8px',
                              fontStyle: 'italic',
                            }}
                          >
                            Ghi chú: {b.notes}
                          </div>
                        )}

                        <div className="wms-table-scroll" style={{ marginBottom: 0 }}>
                          <table className="wms-table" style={{ fontSize: '12px' }}>
                            <thead>
                              <tr>
                                <th style={{ width: '40px' }}>STT</th>
                                <th>Mã & Tên Nguyên phụ liệu</th>
                                <th style={{ width: '70px' }}>ĐVT</th>
                                <th className="wms-td-number" style={{ width: '150px' }}>
                                  SL Giao trong Đợt {b.batchNumber}
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {(b.expectedItems || []).map((it, itIdx) => {
                                const rolls = (Array.isArray(it.rollDetails) && it.rollDetails.length > 0)
                                  ? it.rollDetails
                                  : (Array.isArray(it.selectedRolls) ? it.selectedRolls : []);
                                return (
                                  <tr key={itIdx}>
                                    <td style={{ textAlign: 'center' }}>{itIdx + 1}</td>
                                    <td>
                                      <div>
                                        <strong>
                                          {it.rawMaterialId?.materialCode || it.materialCode || 'NVL'}
                                        </strong>{' '}
                                        — {it.rawMaterialId?.materialName || it.materialName || '—'}
                                      </div>
                                      {rolls.length > 0 && (
                                        <div style={{
                                          marginTop: '6px',
                                          padding: '6px 8px',
                                          background: '#f8fafc',
                                          border: '1px solid #e2e8f0',
                                          borderRadius: '4px',
                                        }}>
                                          <div style={{ fontSize: '11px', fontWeight: 600, color: '#0369a1', marginBottom: '4px' }}>
                                            🧵 Quy cách: {rolls.length} cuộn vải giao trong đợt này
                                          </div>
                                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                            {rolls.map((r, rIdx) => (
                                              <span
                                                key={rIdx}
                                                style={{
                                                  fontSize: '10.5px',
                                                  background: '#e0f2fe',
                                                  color: '#0369a1',
                                                  padding: '2px 6px',
                                                  borderRadius: '3px',
                                                  border: '1px solid #bae6fd',
                                                  display: 'inline-flex',
                                                  alignItems: 'center',
                                                  gap: '3px',
                                                }}
                                              >
                                                <strong>{r.rollCode || `C-${String(rIdx + 1).padStart(2, '0')}`}:</strong>
                                                <span>{Number(r.lengthMeters || 0).toLocaleString('vi-VN')}m</span>
                                                {r.note && <span style={{ opacity: 0.8, fontStyle: 'italic' }}>({r.note})</span>}
                                              </span>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                    </td>
                                    <td>
                                      {it.unitSnapshot ||
                                        it.rawMaterialId?.unit ||
                                        it.unit ||
                                        'METER'}
                                    </td>
                                    <td className="wms-td-number" style={{ fontWeight: 700 }}>
                                      {Number(it.plannedQty || 0).toLocaleString('vi-VN')}
                                      {rolls.length > 0 && (
                                        <div style={{ fontSize: '11px', color: '#0369a1', fontWeight: 600, marginTop: '2px' }}>
                                          ({rolls.length} cuộn)
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
                    ))}
                  </div>
                </div>
              )}

              {/* Thẻ 3: Danh mục Nguyên phụ liệu chi tiết (Tổng hợp các đợt) */}
              <div className="wms-detail-card">
                <div className="wms-detail-card-title">
                  <Layers size={16} color="var(--wms-accent)" />
                  <span>Tổng hợp Số lượng Dự kiến Tiếp nhận vs. Thực nhận KCS Toàn Kế hoạch</span>
                </div>

                <div className="wms-table-scroll">
                  <table className="wms-table">
                    <thead>
                      <tr>
                        <th style={{ width: '40px' }}>STT</th>
                        <th>Mã & Tên Nguyên phụ liệu</th>
                        <th style={{ width: '70px' }}>ĐVT</th>
                        <th className="wms-td-number" style={{ width: '130px' }}>SL Dự kiến đợt này</th>
                        <th className="wms-td-number" style={{ width: '130px' }}>KCS Đạt chuẩn</th>
                        <th className="wms-td-number" style={{ width: '130px' }}>Lỗi / Thiếu hụt</th>
                        <th style={{ width: '120px' }}>Đánh giá</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedPlanForDetail.expectedItems || []).map((item, iIdx) => {
                        const planned = Number(item.plannedQty || 0);
                        const passed = Number(item.actualVerifiedPassedQty || 0);
                        const short = Number(item.actualDefectiveOrShortQty || 0);
                        const matCode =
                          item.rawMaterialId?.materialCode || item.materialCode || 'NVL';
                        const matName =
                          item.rawMaterialId?.materialName || item.materialName || '—';
                        const unit =
                          item.unitSnapshot || item.rawMaterialId?.unit || item.unit || 'METER';

                        const isInspected = passed > 0 || short > 0;
                        const isFullPass = isInspected && passed >= planned && short === 0;

                        // Tổng hợp toàn bộ các cuộn của mặt hàng này qua tất cả các đợt hoặc từ item
                        const itemRolls = (Array.isArray(item.rollDetails) && item.rollDetails.length > 0)
                          ? item.rollDetails
                          : (Array.isArray(item.selectedRolls) ? item.selectedRolls : []);
                        
                        let allPlanRolls = [...itemRolls];
                        if (allPlanRolls.length === 0 && Array.isArray(selectedPlanForDetail.batches)) {
                          selectedPlanForDetail.batches.forEach((b) => {
                            const bIt = (b.expectedItems || []).find(
                              (bi) => String(bi.rawMaterialId?._id || bi.rawMaterialId) === String(item.rawMaterialId?._id || item.rawMaterialId)
                            );
                            const bRolls = bIt?.rollDetails || bIt?.selectedRolls || [];
                            allPlanRolls.push(...bRolls);
                          });
                        }

                        return (
                          <tr key={iIdx}>
                            <td style={{ textAlign: 'center' }}>{iIdx + 1}</td>
                            <td>
                              <div>
                                <strong>{matCode}</strong> — {matName}
                              </div>
                              {allPlanRolls.length > 0 && (
                                <div style={{
                                  marginTop: '6px',
                                  padding: '6px 8px',
                                  background: '#f8fafc',
                                  border: '1px solid #e2e8f0',
                                  borderRadius: '4px',
                                }}>
                                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                                    🧵 Toàn bộ {allPlanRolls.length} cuộn vải của kế hoạch:
                                  </div>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                    {allPlanRolls.map((r, rIdx) => (
                                      <span
                                        key={rIdx}
                                        style={{
                                          fontSize: '10.5px',
                                          background: '#f1f5f9',
                                          color: '#334155',
                                          padding: '2px 6px',
                                          borderRadius: '3px',
                                          border: '1px solid #cbd5e1',
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '3px',
                                        }}
                                      >
                                        <strong>{r.rollCode || `C-${String(rIdx + 1).padStart(2, '0')}`}:</strong>
                                        <span>{Number(r.lengthMeters || 0).toLocaleString('vi-VN')}m</span>
                                        {r.note && <span style={{ opacity: 0.8, fontStyle: 'italic' }}>({r.note})</span>}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </td>
                            <td>{unit}</td>
                            <td className="wms-td-number" style={{ fontWeight: 700 }}>
                              {planned.toLocaleString('vi-VN')}
                              {allPlanRolls.length > 0 && (
                                <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, marginTop: '2px' }}>
                                  ({allPlanRolls.length} cuộn)
                                </div>
                              )}
                            </td>
                            <td className="wms-td-number" style={{ color: 'var(--wms-success)', fontWeight: 700 }}>
                              {passed.toLocaleString('vi-VN')}
                            </td>
                            <td className="wms-td-number" style={{ color: short > 0 ? 'var(--wms-danger)' : 'inherit', fontWeight: 600 }}>
                              {short.toLocaleString('vi-VN')}
                            </td>
                            <td>
                              {!isInspected ? (
                                <span className="wms-helper-text">Chờ hàng về</span>
                              ) : isFullPass ? (
                                <span className="wms-status-badge wms-status-available">
                                  Đạt 100%
                                </span>
                              ) : (
                                <span className="wms-status-badge wms-status-damaged">
                                  Có sai lệch
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Thẻ 3: Kết quả kiểm định KCS của Kỹ thuật may */}
              <div className="wms-detail-card">
                <div className="wms-detail-card-title">
                  <ShieldCheck size={16} color="var(--wms-accent)" />
                  <span>Biên bản Kiểm định Chất lượng KCS (Kỹ thuật may)</span>
                </div>
                {selectedPlanForDetail.technicianVerification?.verifiedAt || selectedPlanForDetail.deliveryComplianceStatus ? (
                  <div className="wms-detail-grid-2">
                    <div className="wms-detail-item">
                      <span className="wms-detail-label">Trạng thái Giao nhận</span>
                      <span className="wms-detail-value">
                        {renderComplianceBadge(selectedPlanForDetail)}
                      </span>
                    </div>

                    <div className="wms-detail-item">
                      <span className="wms-detail-label">Kỹ thuật viên KCS đối soát</span>
                      <span className="wms-detail-value">
                        {selectedPlanForDetail.technicianVerification?.verifiedByTechId?.fullName ||
                          'Kỹ thuật viên May KCS'}
                      </span>
                    </div>

                    <div className="wms-detail-item">
                      <span className="wms-detail-label">Thời điểm nghiệm thu KCS</span>
                      <span className="wms-detail-value">
                        {formatDate(selectedPlanForDetail.technicianVerification?.verifiedAt)}
                      </span>
                    </div>

                    <div className="wms-detail-item" style={{ gridColumn: '1 / -1' }}>
                      <span className="wms-detail-label">Nội dung đối soát & Sai lệch phát hiện</span>
                      <div className="wms-helper-text" style={{ fontSize: '13px', color: 'var(--wms-text-primary)', marginTop: '4px' }}>
                        {selectedPlanForDetail.technicianVerification?.deviationSummary || 'Lô vải/phụ liệu đạt chuẩn nghiệm thu 100%.'}
                      </div>
                    </div>

                    {/* Hiển thị kết quả xử lý sai lệch của kế toán nếu có */}
                    {selectedPlanForDetail.deviationResolution?.status && selectedPlanForDetail.deviationResolution.status !== 'NONE' && (
                      <div
                        className="wms-detail-item"
                        style={{
                          gridColumn: '1 / -1',
                          padding: '12px',
                          background: selectedPlanForDetail.deviationResolution.status === 'RESOLVED' ? '#F0FDF4' : '#FFF1F2',
                          borderRadius: '6px',
                          border: `1px solid ${selectedPlanForDetail.deviationResolution.status === 'RESOLVED' ? '#86EFAC' : '#FECDD3'}`,
                        }}
                      >
                        <div style={{ fontWeight: 700, color: selectedPlanForDetail.deviationResolution.status === 'RESOLVED' ? '#16A34A' : '#E11D48', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {selectedPlanForDetail.deviationResolution.status === 'RESOLVED' ? <Check size={14} /> : <AlertTriangle size={14} />}
                          <span>Kết quả Xử lý Sai lệch (Kế toán Kho & Tài chính)</span>
                        </div>
                        <div style={{ fontSize: '12.5px' }}>
                          <strong>Trạng thái: </strong>
                          {selectedPlanForDetail.deviationResolution.status === 'RESOLVED' ? 'Đã xử lý' : 'Chưa xử lý'}
                        </div>
                        {selectedPlanForDetail.deviationResolution.actionTaken && (
                          <div style={{ fontSize: '12.5px', marginTop: '2px' }}>
                            <strong>Phương án: </strong>
                            {selectedPlanForDetail.deviationResolution.actionTaken}
                          </div>
                        )}
                        {selectedPlanForDetail.deviationResolution.resolutionNotes && (
                          <div style={{ fontSize: '12.5px', marginTop: '2px' }}>
                            <strong>Ghi chú mô tả đã xử lý: </strong>
                            {selectedPlanForDetail.deviationResolution.resolutionNotes}
                          </div>
                        )}
                        {selectedPlanForDetail.deviationResolution.resolvedAt && (
                          <div className="wms-helper-text" style={{ fontSize: '11px', marginTop: '4px' }}>
                            Thời điểm xử lý: {formatDate(selectedPlanForDetail.deviationResolution.resolvedAt)}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="wms-helper-text" style={{ fontStyle: 'italic', padding: '6px 0' }}>
                    * Lô hàng đang trong trạng thái chờ cập kho. Kỹ thuật viên may sẽ thực hiện kiểm tra ngoại quan, khổ vải, GSM, độ co rút và kiểm định 4-Point System ngay khi xe giao hàng cập cảng dỡ hàng.
                  </div>
                )}
              </div>

              {/* Thẻ 4: Ảnh chụp Hợp đồng vật lý đính kèm */}
              <div className="wms-detail-card">
                <div className="wms-detail-card-title">
                  <ImageIcon size={16} color="var(--wms-accent)" />
                  <span>
                    Ảnh chụp Hợp đồng vật lý & Phiếu giao hàng ký kết ({selectedPlanForDetail.physicalContractPhotos?.length || 0})
                  </span>
                </div>

                {selectedPlanForDetail.physicalContractPhotos?.length > 0 ? (
                  <div>
                    <div className="wms-helper-text" style={{ marginBottom: '10px' }}>
                      Nhấn vào từng ảnh để phóng to toàn màn hình xem rõ nội dung chữ ký, con dấu pháp lý:
                    </div>
                    <div className="wms-photo-grid">
                      {selectedPlanForDetail.physicalContractPhotos.map((photo, pIdx) => (
                        <div key={pIdx} className="wms-photo-card" style={{ height: '140px' }}>
                          <img
                            src={photo}
                            alt={`Hợp đồng vật lý trang ${pIdx + 1}`}
                            onClick={() => setLightboxImage(photo)}
                            title="Nhấn để phóng to toàn màn hình"
                          />
                          <div
                            style={{
                              position: 'absolute',
                              bottom: 0,
                              left: 0,
                              right: 0,
                              backgroundColor: 'rgba(20, 18, 16, 0.75)',
                              color: '#FAF7F2',
                              fontSize: '11px',
                              padding: '2px 6px',
                              textAlign: 'center',
                            }}
                          >
                            Trang {pIdx + 1}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="wms-helper-text" style={{ fontStyle: 'italic', padding: '10px 0' }}>
                    Chưa có ảnh chụp hợp đồng vật lý đính kèm cho kế hoạch tiếp nhận này.
                  </div>
                )}
              </div>

              {/* Thẻ 5: Ghi chú kế hoạch */}
              {selectedPlanForDetail.notes && (
                <div className="wms-detail-card">
                  <div className="wms-detail-card-title">
                    <FileText size={16} color="var(--wms-accent)" />
                    <span>Ghi chú Tiếp nhận</span>
                  </div>
                  <div style={{ fontSize: '13px', lineHeight: 1.6, color: 'var(--wms-text-primary)' }}>
                    {selectedPlanForDetail.notes}
                  </div>
                </div>
              )}
            </div>

            <div className="wms-modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                {(selectedPlanForDetail.status === 'DEVIATION_REPORTED' || selectedPlanForDetail.deliveryComplianceStatus === 'MISMATCHED') && (
                  selectedPlanForDetail.reportedToOwner?.isReported ? (
                    <span
                      className="wms-status-badge wms-status-completed"
                      style={{ fontSize: '12px', padding: '4px 8px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    >
                      <CheckCircle2 size={13} /> Đã trình báo Owner ({formatDate(selectedPlanForDetail.reportedToOwner.reportedAt)})
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="wms-btn wms-btn-danger"
                      onClick={() => handleReportToOwner(selectedPlanForDetail)}
                      disabled={reportingOwner}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                    >
                      <Send size={13} />
                      <span>{reportingOwner ? 'Đang gửi trình báo...' : 'Trình báo lên Owner'}</span>
                    </button>
                  )
                )}
              </div>
              <button
                type="button"
                className="wms-btn wms-btn-default"
                onClick={() => setSelectedPlanForDetail(null)}
              >
                Đóng chi tiết
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 3: Lightbox Preview Fullscreen Image */}
      {lightboxImage && (
        <div
          className="wms-lightbox-backdrop"
          onClick={() => setLightboxImage(null)}
          role="dialog"
          aria-modal="true"
        >
          <div className="wms-lightbox-content" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="wms-lightbox-close"
              onClick={() => setLightboxImage(null)}
            >
              <X size={18} />
              <span>Đóng</span>
            </button>
            <img src={lightboxImage} alt="Ảnh chụp hợp đồng vật lý phóng to" />
          </div>
        </div>
      )}
    </div>
  );
};

export default InboundPlanningPage;
