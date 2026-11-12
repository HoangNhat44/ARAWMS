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
} from 'lucide-react';
import accountantProcurementApi from '../../services/accountantProcurementApi.js';
import { validateInboundPlanForm } from '../../utils/procurementValidation.js';

const PLAN_STATUS_BADGE = {
  SCHEDULED: {
    label: 'Chờ tiếp nhận (Hiện hành)',
    cls: 'wms-status-reserved',
  },
  IN_INSPECTION: {
    label: 'Đang kiểm định KCS',
    cls: 'wms-status-processing',
  },
  VERIFIED_MATCHED: {
    label: 'KCS Đạt chuẩn',
    cls: 'wms-status-available',
  },
  DEVIATION_REPORTED: {
    label: 'Sai lệch KCS',
    cls: 'wms-status-damaged',
  },
  DEVIATION_RESOLVED: {
    label: 'Đã xử lý sai lệch',
    cls: 'wms-status-available',
  },
  RESOLVED_SUPERSEDED: {
    label: 'Đã thay thế (SUPERSEDED)',
    cls: 'wms-status-completed',
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

  const isResolved =
    plan.deviationResolution?.status === 'RESOLVED' ||
    plan.status === 'DEVIATION_RESOLVED';
  const isMismatched =
    plan.deliveryComplianceStatus === 'MISMATCHED' ||
    plan.status === 'DEVIATION_REPORTED' ||
    plan.technicianVerification?.isMatchedWithPlan === false;
  const isMatched =
    plan.deliveryComplianceStatus === 'MATCHED' ||
    plan.status === 'VERIFIED_MATCHED' ||
    plan.technicianVerification?.isMatchedWithPlan === true;

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
          title={plan.technicianVerification?.deviationSummary || 'Có sai lệch'}
        >
          <AlertTriangle size={11} style={{ marginRight: 3 }} /> Sai kế hoạch
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
          Xử lý sai lệch →
        </Link>
      </div>
    );
  }

  if (isMatched) {
    return (
      <span
        className="wms-status-badge"
        style={{ background: '#F0FDF4', color: '#16A34A' }}
      >
        <CheckCircle2 size={11} style={{ marginRight: 3 }} /> Đúng kế hoạch
      </span>
    );
  }

  return (
    <span
      className="wms-badge-batch"
      style={{ color: '#64748B', background: '#F1F5F9' }}
    >
      <Clock size={11} style={{ marginRight: 3 }} /> Chờ kiểm tra
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

  const activeContracts = useMemo(() => {
    return (contracts || []).filter((c) => c.status === 'ACTIVE');
  }, [contracts]);

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
    const selectedContract =
      activeContracts.find(
        (ct) => String(ct._id || ct.id) === String(planForm.contractId)
      ) || activeContracts[0];
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

  const handleAutoBalanceBatches = () => {
    const selectedContract = activeContracts.find(
      (ct) => (ct._id || ct.id) === planForm.contractId
    );
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
    const selectedContract = activeContracts.find(
      (c) => (c._id || c.id) === planForm.contractId
    );
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
  }, [activeContracts, planForm.contractId, batches]);

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
    setPlanVersions([]);
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
        if (Array.isArray(versions)) {
          setPlanVersions(versions);
        }
      } catch (err) {
        console.warn('Lấy chi tiết kế hoạch qua API không thành công, hiển thị bản ghi đã tải:', err);
      }
    }
  };

  const handleRemovePhoto = (photoIndex) => {
    setPlanForm((prev) => ({
      ...prev,
      physicalContractPhotos: prev.physicalContractPhotos.filter((_, idx) => idx !== photoIndex),
    }));
  };

  const handleOpenAmendModal = (plan) => {
    setPlanErrors({});
    setFeedback(null);
    setShowContractSearch(false);
    setContractSearchKeyword('');

    const targetContract =
      activeContracts.find(
        (c) => String(c._id || c.id) === String(plan.contractId?._id || plan.contractId)
      ) || plan.contractId;

    const baseCode = (plan.planCode || 'KH-NHAP-001').replace(/-V\d+$/i, '');
    const currentVer = plan.versionNumber || 1;
    const nextVer = currentVer + 1;
    const nextCode = `${baseCode}-V${nextVer}`;

    let sourceBatches = [];
    if (Array.isArray(plan.batches) && plan.batches.length > 0) {
      sourceBatches = plan.batches.map((b, idx) => ({
        batchNumber: b.batchNumber || idx + 1,
        batchTitle: b.batchTitle || `Đợt ${idx + 1}: Tiếp nhận nguyên liệu (v${nextVer})`,
        batchPercentage: b.batchPercentage || 50,
        scheduledDeliveryDate: b.scheduledDeliveryDate
          ? String(b.scheduledDeliveryDate).slice(0, 10)
          : new Date().toISOString().slice(0, 10),
        notes: b.notes || '',
        expectedItems: (b.expectedItems || []).map((it) => {
          const contractMat = (targetContract?.contractedMaterials || []).find(
            (cm) =>
              String(cm.rawMaterialId?._id || cm.rawMaterialId) ===
              String(it.rawMaterialId?._id || it.rawMaterialId)
          );
          return {
            rawMaterialId: it.rawMaterialId?._id || it.rawMaterialId?.id || it.rawMaterialId,
            materialCode: it.rawMaterialId?.materialCode || contractMat?.materialCodeSnapshot || 'NVL',
            materialName: it.rawMaterialId?.materialName || contractMat?.materialNameSnapshot || '',
            unit: it.unitSnapshot || it.rawMaterialId?.unit || contractMat?.unitSnapshot || 'METER',
            contractedQty: Number(contractMat?.contractedQty || it.contractedQty || it.plannedQty || 0),
            plannedQty: Number(it.plannedQty || 0),
          };
        }),
      }));
    } else {
      sourceBatches = buildBatches(
        2,
        targetContract?.contractedMaterials || [],
        targetContract?.effectiveFrom,
        targetContract?.effectiveTo
      );
    }

    setBatchesCount(sourceBatches.length);
    setBatches(sourceBatches);

    setPlanForm({
      planCode: nextCode,
      contractId: targetContract?._id || targetContract?.id || '',
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
    return plans.filter((p) => {
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
          (p.status === 'DEVIATION_REPORTED' ||
            p.deliveryComplianceStatus === 'MISMATCHED' ||
            p.technicianVerification?.isMatchedWithPlan === false) &&
          p.deviationResolution?.status !== 'RESOLVED';
      } else if (statusFilter === 'DEVIATION_RESOLVED') {
        matchStatus =
          p.status === 'DEVIATION_RESOLVED' ||
          p.deviationResolution?.status === 'RESOLVED';
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
      const isResolved =
        p.deviationResolution?.status === 'RESOLVED' ||
        p.status === 'DEVIATION_RESOLVED';
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
              <option value="SCHEDULED">Chờ tiếp nhận (Hiện hành)</option>
              <option value="IN_INSPECTION">Đang kiểm định KCS</option>
              <option value="VERIFIED_MATCHED">Đúng kế hoạch (KCS Đạt chuẩn)</option>
              <option value="DEVIATION_REPORTED">Sai kế hoạch (Cần xử lý)</option>
              <option value="DEVIATION_RESOLVED">Đã xử lý sai lệch</option>
              <option value="RESOLVED_SUPERSEDED">Đã thay thế (SUPERSEDED)</option>
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

          <div className="wms-filter-field" style={{ minWidth: '240px' }}>
            <label className="wms-label">Chế độ hiển thị danh sách</label>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                type="button"
                className={`wms-btn wms-btn-sm ${viewMode === 'GROUPED' ? 'wms-btn-primary' : 'wms-btn-default'}`}
                onClick={() => setViewMode('GROUPED')}
                style={{ flex: 1, height: '36px', whiteSpace: 'nowrap' }}
                title="Gom nhóm các kế hoạch theo từng Hợp đồng để dễ phân biệt"
              >
                <Building2 size={13} /> Gom theo HĐ
              </button>
              <button
                type="button"
                className={`wms-btn wms-btn-sm ${viewMode === 'FLAT' ? 'wms-btn-primary' : 'wms-btn-default'}`}
                onClick={() => setViewMode('FLAT')}
                style={{ flex: 1, height: '36px', whiteSpace: 'nowrap' }}
                title="Hiển thị danh sách tất cả các kế hoạch"
              >
                <Layers size={13} /> Tất cả kế hoạch
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Content Section: Grouped by Contract or Flat Table */}
      {loading ? (
        <section className="wms-table-card" style={{ padding: '30px', textAlign: 'center' }}>
          <RefreshCw size={24} className="wms-spinner" style={{ margin: '0 auto 10px', color: 'var(--wms-accent)' }} />
          <div>Đang tải kế hoạch lịch trình tiếp nhận nguyên liệu...</div>
        </section>
      ) : filteredPlans.length === 0 ? (
        <section className="wms-table-card" style={{ padding: '30px', textAlign: 'center' }}>
          <AlertCircle size={28} style={{ margin: '0 auto 8px', color: 'var(--wms-secondary)' }} />
          <div>Chưa có kế hoạch lịch trình tiếp nhận nào khớp với bộ lọc.</div>
        </section>
      ) : viewMode === 'GROUPED' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {plansByContract.map((group) => (
            <section
              key={group.contractId}
              style={{
                border: group.isTerminated ? '1.5px solid #FCA5A5' : '1px solid var(--wms-border)',
                borderRadius: '10px',
                backgroundColor: group.isTerminated ? '#FFFBFB' : '#FFFFFF',
                boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
                overflow: 'hidden',
              }}
            >
              {/* Header của Nhóm Hợp đồng */}
              <div
                style={{
                  padding: '12px 16px',
                  background: group.isTerminated ? '#FEF2F2' : 'var(--wms-bg-subtle)',
                  borderBottom: '1px solid var(--wms-border)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '10px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '8px',
                      background: group.isTerminated ? '#FEE2E2' : 'var(--wms-primary-subtle)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: group.isTerminated ? '#DC2626' : 'var(--wms-accent)',
                      flexShrink: 0,
                    }}
                  >
                    {group.isTerminated ? <Ban size={18} /> : <Building2 size={18} />}
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '15px', fontWeight: 700, color: group.isTerminated ? '#991B1B' : 'var(--wms-text-primary)' }}>
                        Hợp đồng [{group.contractCode}]
                      </span>
                      <span
                        className="wms-badge-batch"
                        style={{ fontSize: '11px', padding: '2px 8px', background: 'var(--wms-primary-subtle)', color: 'var(--wms-accent)' }}
                      >
                        {group.plans.length} Kế hoạch / Phiên bản
                      </span>
                      {group.isTerminated && (
                        <span
                          className="wms-status-badge wms-status-rejected"
                          style={{
                            fontSize: '11px',
                            padding: '2px 8px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontWeight: 700,
                            backgroundColor: '#FEE2E2',
                            color: '#DC2626',
                            border: '1px solid #FCA5A5',
                          }}
                        >
                          <Ban size={12} /> Hợp đồng đã chấm dứt
                        </span>
                      )}
                    </div>
                    <div className="wms-helper-text" style={{ fontSize: '12.5px', marginTop: '2px' }}>
                      Nhà cung ứng: <strong>{group.supplierName}</strong> {group.supplierCode && `(${group.supplierCode})`}
                    </div>
                  </div>
                </div>
              </div>

              {/* Thông báo hợp đồng đã chấm dứt */}
              {group.isTerminated && (
                <div
                  style={{
                    padding: '10px 16px',
                    backgroundColor: '#FEF2F2',
                    borderBottom: '1px solid #FCA5A5',
                    color: '#991B1B',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '10px',
                    fontSize: '13px',
                    fontWeight: 600,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Ban size={16} color="#DC2626" style={{ flexShrink: 0 }} />
                    <span>
                      HỢP ĐỒNG ĐÃ CHẤM DỨT: Toàn bộ kế hoạch và lịch trình tiếp nhận của hợp đồng này đã bị ngừng hiệu lực.
                    </span>
                  </div>
                  {group.terminationReason && (
                    <span style={{ fontSize: '12px', fontWeight: 500, color: '#B91C1C', fontStyle: 'italic' }}>
                      • Ghi chú: {group.terminationReason}
                    </span>
                  )}
                </div>
              )}

              {/* Bảng Kế hoạch & Phiên bản của Hợp đồng này */}
              <div className="wms-table-scroll no-horizontal-scroll">
                <table className="wms-table wms-table-responsive-fit" style={{ margin: 0, fontSize: '12.5px' }}>
                  <colgroup>
                    <col style={{ width: '21%' }} />
                    <col style={{ width: '22%' }} />
                    <col style={{ width: '24%' }} />
                    <col style={{ width: '15%' }} />
                    <col style={{ width: '18%' }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Mã Kế hoạch & Phiên bản</th>
                      <th>Lộ trình các đợt giao hàng</th>
                      <th>Tổng quy mô & Chi tiết đợt</th>
                      <th style={{ textAlign: 'center' }}>Trạng thái KCS</th>
                      <th style={{ textAlign: 'center' }}>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.plans.map((plan, idx) => {
                      const badge = PLAN_STATUS_BADGE[plan.status] || {
                        label: plan.status,
                        cls: 'wms-status-pending',
                      };
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
                      const isSuperseded = plan.status === 'RESOLVED_SUPERSEDED';

                      return (
                        <tr
                          key={plan._id || plan.id || plan.planCode || idx}
                          className="wms-interactive-row wms-row-expandable"
                          style={{
                            opacity: group.isTerminated ? 0.55 : isSuperseded ? 0.75 : 1,
                            filter: group.isTerminated ? 'grayscale(35%)' : undefined,
                            backgroundColor: group.isTerminated ? '#F9FAFB' : undefined,
                          }}
                          onClick={() => handleOpenDetailModal(plan)}
                          title={
                            group.isTerminated
                              ? 'Hợp đồng đã chấm dứt - Nhấn để xem chi tiết lưu trữ'
                              : 'Nhấn vào hàng để xem chi tiết đầy đủ kế hoạch và ảnh hợp đồng vật lý'
                          }
                        >
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                              <span className="wms-code-pill" style={{ fontWeight: 700 }}>
                                {plan.planCode}
                              </span>
                              <span
                                className="wms-badge-batch"
                                style={{
                                  fontSize: '11px',
                                  padding: '1px 6px',
                                  background: isSuperseded ? 'var(--wms-gray-200)' : '#0284c7',
                                  color: isSuperseded ? 'var(--wms-text-secondary)' : '#FFFFFF',
                                }}
                                title={`Phiên bản v${plan.versionNumber || 1}`}
                              >
                                v{plan.versionNumber || 1}
                              </span>
                              {group.isTerminated && (
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
                                <span className="wms-photo-badge" title={`Có ${photosCount} ảnh hợp đồng đính kèm`}>
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
                          <td style={{ textAlign: 'center' }}>
                            {renderComplianceBadge(plan)}
                          </td>
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
                              <button
                                type="button"
                                className="wms-btn wms-btn-primary wms-btn-xs"
                                onClick={() => handleOpenAmendModal(plan)}
                                disabled={isSuperseded || plan.status === 'CANCELLED' || group.isTerminated}
                                title={
                                  group.isTerminated
                                    ? 'Hợp đồng đã chấm dứt, không thể tạo phiên bản mới'
                                    : isSuperseded
                                    ? 'Kế hoạch này đã được thay thế bởi phiên bản mới hơn'
                                    : `Cập nhật kế hoạch và lưu thành phiên bản v${(plan.versionNumber || 1) + 1}`
                                }
                              >
                                <GitBranch size={12} />
                                <span>Tạo v{(plan.versionNumber || 1) + 1}</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      ) : (
        /* Flat Table View */
        <section className="wms-table-card">
          <div className="wms-table-scroll no-horizontal-scroll">
            <table className="wms-table wms-table-responsive-fit">
              <colgroup>
                <col style={{ width: '16%' }} />
                <col style={{ width: '20%' }} />
                <col style={{ width: '16%' }} />
                <col style={{ width: '20%' }} />
                <col style={{ width: '13%' }} />
                <col style={{ width: '15%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Mã Kế hoạch & Phiên bản</th>
                  <th>Hợp đồng & Đối tác Cung ứng</th>
                  <th>Lịch trình giao hàng</th>
                  <th>Tổng quy mô & Các đợt giao</th>
                  <th style={{ textAlign: 'center' }}>Trạng thái KCS</th>
                  <th style={{ textAlign: 'center' }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filteredPlans.map((plan, idx) => {
                  const badge = PLAN_STATUS_BADGE[plan.status] || {
                    label: plan.status,
                    cls: 'wms-status-pending',
                  };
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
                  const isSuperseded = plan.status === 'RESOLVED_SUPERSEDED';
                  const isContractTerminated = isPlanContractTerminated(plan);

                  return (
                    <tr
                      key={plan._id || plan.id || plan.planCode || idx}
                      className="wms-interactive-row wms-row-expandable"
                      style={{
                        opacity: isContractTerminated ? 0.55 : isSuperseded ? 0.75 : 1,
                        filter: isContractTerminated ? 'grayscale(35%)' : undefined,
                        backgroundColor: isContractTerminated ? '#F9FAFB' : undefined,
                      }}
                      onClick={() => handleOpenDetailModal(plan)}
                      title={
                        isContractTerminated
                          ? 'Hợp đồng đã chấm dứt - Nhấn để xem chi tiết lưu trữ'
                          : 'Nhấn vào hàng để xem chi tiết đầy đủ kế hoạch và ảnh hợp đồng vật lý'
                      }
                    >
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          <span className="wms-code-pill" style={{ fontWeight: 700 }}>
                            {plan.planCode}
                          </span>
                          <span
                            className="wms-badge-batch"
                            style={{
                              fontSize: '11px',
                              padding: '1px 6px',
                              background: isSuperseded ? 'var(--wms-gray-200)' : '#0284c7',
                              color: isSuperseded ? 'var(--wms-text-secondary)' : '#FFFFFF',
                            }}
                          >
                            v{plan.versionNumber || 1}
                          </span>
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
                            <span className="wms-photo-badge" title={`Có ${photosCount} ảnh hợp đồng đính kèm`}>
                              <ImageIcon size={11} /> {photosCount}
                            </span>
                          )}
                        </div>
                        {plan.amendmentReason && (
                          <div
                            style={{
                              fontSize: '11.5px',
                              color: 'var(--wms-accent-hover)',
                              marginTop: '3px',
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
                      <td>
                        <div>
                          <strong>{plan.contractId?.contractCode || 'Hợp đồng'}</strong>
                          {isContractTerminated && (
                            <div style={{ color: '#DC2626', fontSize: '11px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '3px', marginTop: '2px' }}>
                              <Ban size={11} /> Hợp đồng đã chấm dứt
                            </div>
                          )}
                        </div>
                        <div className="wms-helper-text">
                          NCC: {plan.supplierId?.supplierName || '—'}
                        </div>
                      </td>
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
                      <td style={{ textAlign: 'center' }}>
                        {renderComplianceBadge(plan)}
                      </td>
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
                          <button
                            type="button"
                            className="wms-btn wms-btn-primary wms-btn-xs"
                            onClick={() => handleOpenAmendModal(plan)}
                            disabled={isSuperseded || plan.status === 'CANCELLED' || isContractTerminated}
                            title={
                              isContractTerminated
                                ? 'Hợp đồng đã chấm dứt, không thể tạo phiên bản mới'
                                : isSuperseded
                                ? 'Kế hoạch này đã được thay thế bởi phiên bản mới hơn'
                                : `Cập nhật kế hoạch và lưu thành phiên bản v${(plan.versionNumber || 1) + 1}`
                            }
                          >
                            <GitBranch size={12} />
                            <span>Tạo v{(plan.versionNumber || 1) + 1}</span>
                          </button>
                        </div>
                      </td>
                    </tr>
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

              {/* PHẦN 1: HỢP ĐỒNG & MÃ KẾ HOẠCH GỐC */}
              <div className="wms-form-section">
                <div className="wms-form-section-header">
                  <h3 className="wms-form-section-title">
                    <CalendarClock size={18} />
                    1. Thông tin Hợp đồng Mua sắm & Thiết lập Lịch trình Tiếp nhận
                  </h3>
                </div>

                <div className="wms-form-grid-3">
                  <div className={`wms-field ${planErrors.planCode ? 'has-error' : ''}`}>
                    <label htmlFor="pf-code" className="wms-label">
                      Mã Kế hoạch Gốc <span className="wms-required">*</span>
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

                  <div className={`wms-field ${planErrors.contractId ? 'has-error' : ''}`} style={{ position: 'relative' }}>
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
                        disabled={planForm.isNewVersion}
                        required
                      >
                        <option value="">-- Chọn Hợp đồng --</option>
                        {activeContracts.map((c) => {
                          const cid = c._id || c.id;
                          const hasPlan = (plans || []).some(
                            (p) => String(p.contractId?._id || p.contractId) === String(cid) && p.status !== 'CANCELLED'
                          );
                          return (
                            <option
                              key={cid || c.contractCode}
                              value={cid}
                            >
                              [{c.contractCode}] {c.supplierId?.supplierName} {hasPlan ? '— (Đã có KH nhập hàng)' : ''}
                            </option>
                          );
                        })}
                      </select>
                      {!planForm.isNewVersion && (
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
                      )}
                    </div>

                    {showContractSearch && !planForm.isNewVersion && (
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
                            <div
                              className="wms-helper-text"
                              style={{ padding: '6px 8px', textAlign: 'center' }}
                            >
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
                                    background: isSelected
                                      ? 'var(--wms-primary-subtle)'
                                      : 'transparent',
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
                                      <span
                                        className="wms-badge-batch"
                                        style={{ fontSize: '10px', padding: '1px 5px', background: '#FEF3C7', color: '#B45309' }}
                                      >
                                        Đã có KH
                                      </span>
                                    )}
                                    {isSelected && (
                                      <CheckCircle2 size={14} style={{ color: 'var(--wms-accent)', flexShrink: 0 }} />
                                    )}
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

                  <div className="wms-field">
                    <label className="wms-label">
                      Số lần / đợt giao hàng dự kiến (Tùy chọn)
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', border: '1px solid var(--wms-border-strong)', borderRadius: '6px', overflow: 'hidden', background: '#FFFFFF' }}>
                        <button
                          type="button"
                          onClick={() => handleBatchesCountChange(Math.max(1, (Number(batchesCount) || batches.length || 1) - 1))}
                          disabled={(Number(batchesCount) || 1) <= 1}
                          style={{
                            border: 'none',
                            background: 'var(--wms-bg-subtle)',
                            color: 'var(--wms-text-primary)',
                            fontWeight: 700,
                            fontSize: '15px',
                            width: '32px',
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
                            width: '54px',
                            height: '36px',
                            border: 'none',
                            borderLeft: '1px solid var(--wms-border)',
                            borderRight: '1px solid var(--wms-border)',
                            textAlign: 'center',
                            fontWeight: 700,
                            fontSize: '14px',
                            color: 'var(--wms-accent)',
                            outline: 'none',
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => handleBatchesCountChange(Math.min(24, (Number(batchesCount) || batches.length || 1) + 1))}
                          style={{
                            border: 'none',
                            background: 'var(--wms-bg-subtle)',
                            color: 'var(--wms-text-primary)',
                            fontWeight: 700,
                            fontSize: '15px',
                            width: '32px',
                            height: '36px',
                            cursor: 'pointer',
                          }}
                          title="Tăng 1 đợt giao"
                        >
                          +
                        </button>
                      </div>
                      {Number(batchesCount) > 1 && (
                        <button
                          type="button"
                          className="wms-btn wms-btn-default wms-btn-sm"
                          onClick={handleAutoBalanceBatches}
                          title="Tự động chia đều số lượng các mặt hàng cho từng đợt"
                          style={{ whiteSpace: 'nowrap', height: '38px' }}
                        >
                          <Scale size={14} /> Chia đều
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Ô NHẬP LÝ DO ĐIỀU CHỈNH KẾ HOẠCH TIẾP NHẬN (KHI TẠO PHIÊN BẢN MỚI) */}
                {planForm.isNewVersion && (
                  <div
                    className={`wms-field wms-field-span-full ${planErrors.amendmentReason ? 'has-error' : ''}`}
                    style={{ marginTop: '12px', background: 'var(--wms-bg-subtle)', padding: '12px', borderRadius: '6px', border: '1px dashed var(--wms-primary)' }}
                  >
                    <label className="wms-label" style={{ fontWeight: 700, color: 'var(--wms-text-primary)' }}>
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

                {/* BẢNG LỘ TRÌNH VÀ NGÀY GIAO HÀNG DỰ KIẾN CỤ THỂ CHO TỪNG ĐỢT */}
                {batches.length > 0 && (
                  <div style={{ marginTop: '14px', border: '1px solid var(--wms-border)', borderRadius: '6px', overflow: 'hidden' }}>
                    <div style={{ padding: '8px 12px', background: 'var(--wms-bg-subtle)', borderBottom: '1px solid var(--wms-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '12.5px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Calendar size={14} color="var(--wms-accent)" />
                        Lộ trình & Ngày giao hàng dự kiến cụ thể cho từng Đợt ({batches.length} đợt)
                      </span>
                      <span className="wms-helper-text" style={{ fontSize: '11.5px' }}>
                        Chỉnh sửa ngày giao dự kiến cho từng đợt tại đây hoặc ở thẻ chi tiết bên dưới
                      </span>
                    </div>
                    <div className="wms-table-scroll">
                      <table className="wms-table" style={{ fontSize: '12px', margin: 0 }}>
                        <thead>
                          <tr>
                            <th style={{ width: '80px' }}>Đợt</th>
                            <th>Mục đích / Tiêu đề đợt</th>
                            <th style={{ width: '190px' }}>Ngày giao dự kiến về kho *</th>
                            <th style={{ width: '110px', textAlign: 'center' }}>Tỷ lệ đợt</th>
                            <th className="wms-td-number" style={{ width: '150px' }}>Tổng quy mô đợt</th>
                          </tr>
                        </thead>
                        <tbody>
                          {batches.map((b, bIdx) => {
                            const bTotal = (b.expectedItems || []).reduce(
                              (sum, it) => sum + (Number(it.plannedQty) || 0),
                              0
                            );
                            const bErr = planErrors.batchErrors?.[bIdx] || {};
                            return (
                              <tr key={bIdx}>
                                <td>
                                  <span className="wms-badge-batch" style={{ fontSize: '11px', padding: '2px 6px' }}>
                                    Đợt {b.batchNumber}
                                  </span>
                                </td>
                                <td>
                                  <input
                                    type="text"
                                    className="wms-input"
                                    style={{ height: '30px', fontSize: '12px' }}
                                    value={b.batchTitle}
                                    placeholder={`Đợt ${b.batchNumber}`}
                                    onChange={(e) => handleBatchFieldChange(bIdx, 'batchTitle', e.target.value)}
                                  />
                                </td>
                                <td>
                                  <input
                                    type="date"
                                    className={`wms-input ${bErr.scheduledDeliveryDate ? 'has-error' : ''}`}
                                    style={{ height: '30px', fontSize: '12px', fontWeight: 600 }}
                                    value={b.scheduledDeliveryDate}
                                    onChange={(e) => handleBatchFieldChange(bIdx, 'scheduledDeliveryDate', e.target.value)}
                                    required
                                  />
                                  {bErr.scheduledDeliveryDate && (
                                    <span className="wms-field-error-text" style={{ fontSize: '11px' }}>
                                      {bErr.scheduledDeliveryDate}
                                    </span>
                                  )}
                                </td>
                                <td style={{ textAlign: 'center', fontWeight: 600 }}>
                                  {b.batchPercentage}%
                                </td>
                                <td className="wms-td-number" style={{ fontWeight: 600 }}>
                                  {Number(bTotal).toLocaleString('vi-VN')} {b.expectedItems?.[0]?.unit || 'METER'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              {/* PHẦN 2: BẢNG ĐỐI SOÁT & CÂN ĐỐI TIẾN ĐỘ PHÂN BỔ CÁC ĐỢT */}
              {allocationBalance.length > 0 && (
                <div className="wms-form-section" style={{ backgroundColor: 'var(--wms-bg-subtle)', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--wms-border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Scale size={15} color="var(--wms-accent)" />
                      Đối soát Tiến độ Phân bổ Số lượng qua {batchesCount} Đợt nhập
                    </h4>
                    <span className="wms-helper-text" style={{ fontSize: '12px' }}>
                      Tổng số lượng các đợt phải khớp với số lượng cam kết trên Hợp đồng
                    </span>
                  </div>

                  <div className="wms-table-scroll">
                    <table className="wms-table" style={{ fontSize: '12.5px' }}>
                      <thead>
                        <tr>
                          <th>Mặt hàng</th>
                          <th className="wms-td-number" style={{ width: '140px' }}>Tổng cam kết HĐ</th>
                          <th className="wms-td-number" style={{ width: '150px' }}>Đã chia ({batchesCount} đợt)</th>
                          <th className="wms-td-number" style={{ width: '130px' }}>Chênh lệch</th>
                          <th style={{ width: '150px', textAlign: 'center' }}>Trạng thái đối soát</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allocationBalance.map((item, abIdx) => (
                          <tr key={abIdx}>
                            <td>
                              <strong>{item.materialCode}</strong> — {item.materialName}
                            </td>
                            <td className="wms-td-number" style={{ fontWeight: 600 }}>
                              {Number(item.contractedQty).toLocaleString('vi-VN')} {item.unit}
                            </td>
                            <td className="wms-td-number" style={{ fontWeight: 700, color: 'var(--wms-accent-hover)' }}>
                              {Number(item.totalAllocated).toLocaleString('vi-VN')} {item.unit}
                            </td>
                            <td className="wms-td-number" style={{ fontWeight: 600, color: item.diff === 0 ? 'var(--wms-success)' : item.diff > 0 ? 'var(--wms-warning)' : 'var(--wms-danger)' }}>
                              {item.diff === 0 ? '0' : (item.diff > 0 ? `Thiếu ${Number(item.diff).toLocaleString('vi-VN')}` : `Dư ${Number(Math.abs(item.diff)).toLocaleString('vi-VN')}`)} {item.unit}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              {item.isBalanced ? (
                                <span className="wms-status-badge wms-status-available">
                                  ✓ Khớp 100%
                                </span>
                              ) : (
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', justifyContent: 'center' }}>
                                  <span className={`wms-status-badge ${item.diff > 0 ? 'wms-status-pending' : 'wms-status-damaged'}`}>
                                    {item.diff > 0 ? 'Chưa chia đủ' : 'Vượt hợp đồng'}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleScrollToPlanMismatchItem(abIdx)}
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
              )}

              {/* PHẦN 3: DANH SÁCH CHI TIẾT CÁC ĐỢT NHẬP */}
              <div className="wms-form-section">
                <div className="wms-form-section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 className="wms-form-section-title">
                    <Layers size={18} />
                    Chi tiết Lịch trình & Số lượng Dự kiến từng Đợt tiếp nhận ({batches.length} đợt)
                  </h3>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      type="button"
                      className="wms-btn wms-btn-default wms-btn-sm"
                      onClick={() => handleBatchesCountChange(batchesCount + 1)}
                      title="Thêm một đợt giao hàng tiếp theo"
                    >
                      <Plus size={13} /> Thêm đợt nhập
                    </button>
                    {batchesCount > 1 && (
                      <button
                        type="button"
                        className="wms-btn wms-btn-default wms-btn-sm"
                        onClick={() => handleBatchesCountChange(batchesCount - 1)}
                        title="Bớt đợt giao hàng cuối cùng"
                      >
                        <Trash2 size={13} /> Bớt đợt cuối
                      </button>
                    )}
                  </div>
                </div>

                {batches.map((batch, bIdx) => {
                  const bErr = planErrors.batchErrors?.[bIdx] || {};
                  const batchTotalQty = (batch.expectedItems || []).reduce(
                    (sum, it) => sum + (Number(it.plannedQty) || 0),
                    0
                  );

                  return (
                    <div key={bIdx} className="wms-batch-card">
                      <div className="wms-batch-card-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span className="wms-badge-batch">
                            ĐỢT {batch.batchNumber} / {batches.length}
                          </span>
                          <strong style={{ fontSize: '14px', color: 'var(--wms-text-primary)' }}>
                            {batch.batchTitle}
                          </strong>
                          <span className="wms-helper-text">
                            (Thuộc kế hoạch: <strong>{planForm.planCode}</strong>)
                          </span>
                        </div>
                        <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--wms-accent-hover)' }}>
                          Quy mô đợt: {Number(batchTotalQty).toLocaleString('vi-VN')} {batch.expectedItems?.[0]?.unit || 'METER'}
                        </div>
                      </div>

                      <div className="wms-form-grid-3" style={{ marginBottom: '12px' }}>
                        <div className="wms-field wms-field-span-2">
                          <label className="wms-label">Tiêu đề / Mục đích đợt nhập</label>
                          <input
                            type="text"
                            className="wms-input"
                            value={batch.batchTitle}
                            placeholder={`VD: Đợt ${batch.batchNumber}: Giao nguyên liệu đợt đầu`}
                            onChange={(e) => handleBatchFieldChange(bIdx, 'batchTitle', e.target.value)}
                          />
                        </div>

                        <div className={`wms-field ${bErr.scheduledDeliveryDate ? 'has-error' : ''}`}>
                          <label className="wms-label">
                            Ngày giao dự kiến về kho <span className="wms-required">*</span>
                          </label>
                          <input
                            type="date"
                            className="wms-input"
                            value={batch.scheduledDeliveryDate}
                            onChange={(e) => handleBatchFieldChange(bIdx, 'scheduledDeliveryDate', e.target.value)}
                            required
                          />
                          {bErr.scheduledDeliveryDate && (
                            <span className="wms-field-error-text">
                              <AlertCircle size={12} /> {bErr.scheduledDeliveryDate}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Bảng số lượng từng mặt hàng của đợt */}
                      <div className="wms-table-scroll" style={{ marginBottom: '8px' }}>
                        <table className="wms-table" style={{ fontSize: '12.5px' }}>
                          <thead>
                            <tr>
                              <th>Mã & Tên Nguyên phụ liệu</th>
                              <th style={{ width: '70px' }}>ĐVT</th>
                              <th className="wms-td-number" style={{ width: '130px' }}>Tổng SL Hợp đồng</th>
                              <th style={{ width: '160px' }}>SL giao trong Đợt {batch.batchNumber}</th>
                              <th style={{ width: '100px', textAlign: 'center' }}>Tỷ lệ đợt</th>
                            </tr>
                          </thead>
                          <tbody>
                            {batch.expectedItems.map((item, itIdx) => {
                              const itErr = bErr.itemErrors?.[itIdx];
                              const contracted = Number(item.contractedQty || 0);
                              const planned = Number(item.plannedQty || 0);
                              const pct = contracted > 0 ? Math.round((planned / contracted) * 100) : 0;

                              const isHighlightedMismatch =
                                highlightedMismatchItem?.itemIdx === itIdx;

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
                                  <td>
                                    <div>
                                      <strong>{item.materialCode}</strong> — {item.materialName}
                                    </div>
                                    {item.allRolls && item.allRolls.length > 0 && (
                                      <div
                                        onClick={() => {
                                          if (!(bIdx === batches.length - 1 && batches.length > 1) && item.allRolls.length === 1) {
                                            handleToggleBatchRoll(bIdx, itIdx, item.allRolls[0]);
                                          }
                                        }}
                                        style={{
                                          marginTop: '6px',
                                          padding: '8px 10px',
                                          background: '#f8fafc',
                                          border: '1px solid #e2e8f0',
                                          borderRadius: '6px',
                                          cursor:
                                            !(bIdx === batches.length - 1 && batches.length > 1) && item.allRolls.length === 1
                                              ? 'pointer'
                                              : 'default',
                                          userSelect: 'none',
                                        }}
                                      >
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px', flexWrap: 'wrap', gap: '4px' }}>
                                          <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#1e293b' }}>
                                            🧵 Chọn cuộn vải giao trong Đợt {batch.batchNumber}:
                                            <span style={{ marginLeft: '6px', color: '#0284c7' }}>
                                              ({(item.selectedRolls || []).reduce((s, r) => s + (Number(r.rollQty ?? 1) || 0), 0)}/{item.allRolls.reduce((s, r) => s + Math.max(1, Number(r.rollQty ?? 1) || 1), 0)} cuộn)
                                            </span>
                                          </span>
                                          {bIdx === batches.length - 1 && batches.length > 1 && (
                                            <span style={{ fontSize: '10.5px', background: '#e0f2fe', color: '#0369a1', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                                              ⚡ Tự động gom {(item.selectedRolls || []).reduce((s, r) => s + (Number(r.rollQty ?? 1) || 0), 0)} cuộn còn thiếu
                                            </span>
                                          )}
                                        </div>

                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                          {item.allRolls.map((roll, rIdx) => {
                                            const rollKey = roll.rollCode || `R-${roll.rollIndex || rIdx + 1}`;
                                            const totalRollQty = Math.max(1, Math.floor(Number(roll.rollQty ?? 1) || 1));
                                            const selectedEntry = (item.selectedRolls || []).find(
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
                                            const isLastBatch = bIdx === batches.length - 1 && batches.length > 1;
                                            const rollLen = Number(roll.lengthMeters || 0);

                                            if (totalRollQty > 1) {
                                              return (
                                                <div
                                                  key={rollKey}
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (!isLastBatch) {
                                                      handleToggleBatchRoll(bIdx, itIdx, roll);
                                                    }
                                                  }}
                                                  title={
                                                    isLastBatch
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
                                                    cursor: isLastBatch ? 'default' : 'pointer',
                                                    userSelect: 'none',
                                                    border: isSelectedInThisBatch ? '1px solid #0284c7' : '1px solid #cbd5e1',
                                                    background: isSelectedInThisBatch ? '#e0f2fe' : '#ffffff',
                                                    color: isSelectedInThisBatch ? '#0369a1' : '#475569',
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
                                                  {isLastBatch ? (
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
                                                          color: '#0369a1',
                                                          background: '#ffffff',
                                                          border: '1px solid #7dd3fc',
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
                                                disabled={isLastBatch}
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  handleToggleBatchRoll(bIdx, itIdx, roll);
                                                }}
                                                title={
                                                  isLastBatch
                                                    ? 'Đợt cuối cùng tự động nhận tất cả các cuộn vải còn lại'
                                                    : isSelectedInThisBatch
                                                    ? 'Bấm để bỏ cuộn này khỏi đợt'
                                                    : otherBatchIndex >= 0
                                                    ? `Đang gán ở Đợt ${otherBatchIndex + 1}. Bấm để chuyển sang Đợt ${batch.batchNumber}`
                                                    : 'Bấm để thêm cuộn này vào đợt'
                                                }
                                                style={{
                                                  display: 'inline-flex',
                                                  alignItems: 'center',
                                                  gap: '4px',
                                                  padding: '3px 8px',
                                                  borderRadius: '4px',
                                                  fontSize: '11px',
                                                  cursor: isLastBatch ? 'default' : 'pointer',
                                                  border: isSelectedInThisBatch
                                                    ? '1px solid #0284c7'
                                                    : '1px solid #cbd5e1',
                                                  background: isSelectedInThisBatch ? '#e0f2fe' : '#ffffff',
                                                  color: isSelectedInThisBatch ? '#0369a1' : '#475569',
                                                  fontWeight: isSelectedInThisBatch ? 600 : 400,
                                                  boxShadow: isSelectedInThisBatch ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                                                }}
                                              >
                                                <span>{isSelectedInThisBatch ? '☑' : '☐'}</span>
                                                <strong>#{rIdx + 1}:</strong>
                                                <span>{rollLen.toLocaleString('vi-VN')}m</span>
                                                {roll.note && <span style={{ opacity: 0.8, fontStyle: 'italic' }}>({roll.note})</span>}
                                                {!isSelectedInThisBatch && otherBatchIndex >= 0 && (
                                                  <span style={{ fontSize: '9.5px', color: '#94a3b8' }}>(Đợt {otherBatchIndex + 1})</span>
                                                )}
                                              </button>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    )}
                                  </td>
                                  <td>{item.unit}</td>
                                  <td className="wms-td-number">
                                    {Number(contracted).toLocaleString('vi-VN')}
                                  </td>
                                  <td>
                                    <div className={`wms-field ${itErr ? 'has-error' : ''}`} style={{ marginBottom: 0 }}>
                                      <input
                                        id={`plan-batch-input-${bIdx}-item-${itIdx}`}
                                        type="number"
                                        min="0"
                                        max={contracted}
                                        className="wms-input"
                                        style={{
                                          height: '34px',
                                          fontSize: '13px',
                                          fontWeight: 600,
                                          borderColor: itErr || isHighlightedMismatch ? '#EF4444' : undefined,
                                          background: batches.length > 1 && bIdx === batches.length - 1 ? '#f1f5f9' : '#ffffff',
                                        }}
                                        value={item.plannedQty === '' ? '' : item.plannedQty}
                                        onChange={(e) => handleBatchItemQtyChange(bIdx, itIdx, e.target.value)}
                                        readOnly={batches.length > 1 && bIdx === batches.length - 1}
                                        required
                                      />
                                      {batches.length > 1 && bIdx === batches.length - 1 && (
                                        <div style={{ fontSize: '10px', color: '#0284c7', marginTop: '2px', fontWeight: 600 }}>
                                          Tự động điền phần còn thiếu
                                        </div>
                                      )}
                                      {itErr && (
                                        <span className="wms-field-error-text">
                                          <AlertCircle size={11} /> {itErr}
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td style={{ textAlign: 'center', fontWeight: 600, color: 'var(--wms-secondary)' }}>
                                    {pct}%
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      <div className="wms-field" style={{ marginBottom: 0 }}>
                        <input
                          type="text"
                          className="wms-input"
                          style={{ height: '32px', fontSize: '12px' }}
                          placeholder={`Ghi chú riêng cho Đợt ${batch.batchNumber} (VD: xe tải 5 tấn, yêu cầu giao buổi sáng...)`}
                          value={batch.notes}
                          onChange={(e) => handleBatchFieldChange(bIdx, 'notes', e.target.value)}
                        />
                      </div>
                    </div>
                  );
                })}
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
                <h2 className="wms-modal-title">
                  Chi tiết Kế hoạch Tiếp nhận Nguyên phụ liệu: {selectedPlanForDetail.planCode}
                </h2>
                <div className="wms-helper-text" style={{ fontSize: '12px' }}>
                  Hợp đồng căn cứ: <strong>{selectedPlanForDetail.contractId?.contractCode || '—'}</strong>
                </div>
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
              {planVersions && planVersions.length > 1 && (
                <div className="wms-detail-card">
                  <div className="wms-detail-card-title">
                    <History size={16} color="var(--wms-accent)" />
                    <span>Lịch sử các Phiên bản Kế hoạch ({planVersions.length} phiên bản)</span>
                  </div>
                  <div className="wms-table-scroll">
                    <table className="wms-table" style={{ fontSize: '12px' }}>
                      <thead>
                        <tr>
                          <th style={{ width: '80px' }}>Phiên bản</th>
                          <th>Mã Kế hoạch</th>
                          <th>Lý do Điều chỉnh / Cập nhật</th>
                          <th style={{ width: '130px' }}>Ngày lập</th>
                          <th style={{ width: '150px', textAlign: 'center' }}>Trạng thái</th>
                        </tr>
                      </thead>
                      <tbody>
                        {planVersions.map((v, vIdx) => {
                          const vBadge = PLAN_STATUS_BADGE[v.status] || { label: v.status, cls: 'wms-status-pending' };
                          const isCurrentViewing = (v._id || v.id) === (selectedPlanForDetail._id || selectedPlanForDetail.id);
                          return (
                            <tr
                              key={vIdx}
                              style={{
                                background: isCurrentViewing ? 'var(--wms-primary-subtle)' : 'transparent',
                                cursor: 'pointer',
                              }}
                              onClick={() => setSelectedPlanForDetail(v)}
                              title="Nhấn để xem chi tiết phiên bản này"
                            >
                              <td>
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
                              <td style={{ color: v.amendmentReason ? 'var(--wms-text-primary)' : 'var(--wms-secondary)' }}>
                                {v.amendmentReason || 'Khởi tạo kế hoạch ban đầu'}
                              </td>
                              <td>{formatDate(v.createdAt)}</td>
                              <td style={{ textAlign: 'center' }}>
                                <span className={`wms-status-badge ${vBadge.cls}`} style={{ fontSize: '11px' }}>
                                  {vBadge.label}
                                </span>
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

            <div className="wms-modal-footer">
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
