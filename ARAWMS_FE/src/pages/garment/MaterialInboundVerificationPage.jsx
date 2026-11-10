/*
 * File: MaterialInboundVerificationPage.jsx
 * Role: GARMENT_TECHNICIAN (Kỹ thuật viên may / KCS)
 * Description: Tiếp nhận kế hoạch nhập nguyên phụ liệu từ Kế toán, hiển thị mỗi kế hoạch là 1 hàng với các đợt nhập phân rã,
 *              thực hiện nghiệm thu KCS từng đợt hoặc toàn bộ, đối soát số lượng và lập phiếu yêu cầu nhập kho gửi Quản lý kho duyệt.
 */
import React, { useState, useEffect, useMemo } from 'react';
import {
  ClipboardCheck,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Search,
  Filter,
  ArrowRight,
  ShieldAlert,
  ShieldCheck,
  Plus,
  RefreshCw,
  Package,
  Calendar,
  User,
  Truck,
  Eye,
  Check,
  X,
  Send,
  Layers,
  ChevronDown,
  ChevronUp,
  Clock,
  Info,
} from 'lucide-react';
import garmentTechnicalService from '../../services/garmentTechnicalService';

export default function MaterialInboundVerificationPage() {
  const [activeTab, setActiveTab] = useState('PLANS'); // 'PLANS' | 'REQUESTS'
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [plans, setPlans] = useState([]);
  const [requests, setRequests] = useState([]);
  const [stats, setStats] = useState({
    totalPlans: 0,
    totalScheduled: 0,
    totalInspection: 0,
    totalVerified: 0,
    totalDeviation: 0,
  });

  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Accordion state for multi-batch plans in main table
  const [expandedPlanIds, setExpandedPlanIds] = useState(new Set());

  // Options for dropdowns
  const [options, setOptions] = useState({
    suppliers: [],
    materials: [],
    contracts: [],
    locations: [],
  });

  // Modal: View Plan Details (with all batches)
  const [selectedPlanForDetail, setSelectedPlanForDetail] = useState(null);

  // Modal: Verify Plan / Specific Batch
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [verificationItems, setVerificationItems] = useState([]);
  const [isMatched, setIsMatched] = useState(true);
  const [deviationSummary, setDeviationSummary] = useState('');
  const [supplierDeliveryCode, setSupplierDeliveryCode] = useState('');
  const [createInboundRequest, setCreateInboundRequest] = useState(true);

  // Modal: Direct Request
  const [showDirectModal, setShowDirectModal] = useState(false);
  const [directForm, setDirectForm] = useState({
    supplierId: '',
    contractId: '',
    supplierDeliveryCode: '',
    note: '',
    items: [{ rawMaterialId: '', acceptedQty: 1, rejectedQty: 0, defectReason: '' }],
  });

  // Notification message
  const [alertBanner, setAlertBanner] = useState(null);

  const showAlert = (type, message) => {
    setAlertBanner({ type, message });
    setTimeout(() => setAlertBanner(null), 6000);
  };

  // Toggle expansion of batches for a plan
  const toggleExpandPlan = (planId) => {
    setExpandedPlanIds((prev) => {
      const next = new Set(prev);
      if (next.has(planId)) next.delete(planId);
      else next.add(planId);
      return next;
    });
  };

  // Load initial options
  useEffect(() => {
    garmentTechnicalService.inbound.getOptions()
      .then((res) => {
        if (res?.data) {
          setOptions(res.data);
        }
      })
      .catch((err) => console.error('Lỗi tải danh mục options:', err));
  }, []);

  // Fetch data
  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'PLANS') {
        const res = await garmentTechnicalService.inbound.getPlans({
          status: statusFilter,
          search: searchQuery,
        });
        if (res?.data) {
          setPlans(res.data.plans || []);
          if (res.data.stats) setStats(res.data.stats);
        }
      } else {
        const res = await garmentTechnicalService.inbound.getRequests({
          status: statusFilter,
          search: searchQuery,
        });
        if (res?.data) {
          setRequests(res.data || []);
        }
      }
    } catch (err) {
      showAlert('error', err.message || 'Không thể tải dữ liệu từ máy chủ');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [activeTab, statusFilter]);

  // Open Verify Modal for a plan or a specific batch of that plan
  const openVerifyModal = (plan, batch = null) => {
    let targetBatch = batch;
    if (!targetBatch && Array.isArray(plan.batches) && plan.batches.length > 0) {
      if (plan.batches.length === 1) {
        targetBatch = plan.batches[0];
      } else {
        targetBatch = plan.batches.find((b) => b.status === 'SCHEDULED' || b.status === 'IN_INSPECTION') || plan.batches[0];
      }
    }

    setSelectedPlan(plan);
    setSelectedBatch(targetBatch);

    const verificationSource = targetBatch?.technicianVerification || plan.technicianVerification;
    setSupplierDeliveryCode(targetBatch?.deliveryNote || plan.deliveryNote || '');
    setIsMatched(verificationSource?.isMatchedWithPlan ?? true);
    setDeviationSummary(verificationSource?.deviationSummary || '');
    setCreateInboundRequest(true);

    // Populate verification items for this batch or root plan
    const rawItems = targetBatch?.expectedItems && targetBatch.expectedItems.length > 0
      ? targetBatch.expectedItems
      : (plan.expectedItems || []);

    const items = rawItems.map((item) => {
      const planned = Number(item.plannedQty) || 0;
      const passed = Number(item.actualVerifiedPassedQty);
      const defective = Number(item.actualDefectiveOrShortQty) || 0;
      return {
        rawMaterialId: item.rawMaterialId?._id || item.rawMaterialId,
        material: item.rawMaterialId,
        plannedQty: planned,
        actualVerifiedPassedQty: passed > 0 ? passed : (item.actualVerifiedPassedQty === 0 && defective > 0 ? 0 : planned),
        actualDefectiveOrShortQty: defective,
        defectReason: item.defectReason || '',
        rollCount: item.rollCount || item.selectedRolls?.length || 0,
        selectedRolls: Array.isArray(item.selectedRolls) ? item.selectedRolls : [],
      };
    });
    setVerificationItems(items);
  };

  // Handle item change in Verify Modal
  const handleItemVerifyChange = (index, field, value) => {
    const updated = [...verificationItems];
    updated[index][field] = value;

    // Auto-detect mismatch if defect > 0 or passed != planned
    let hasDeviation = false;
    updated.forEach((it) => {
      if (Number(it.actualDefectiveOrShortQty) > 0 || Number(it.actualVerifiedPassedQty) !== Number(it.plannedQty)) {
        hasDeviation = true;
      }
    });
    if (hasDeviation) {
      setIsMatched(false);
    }

    setVerificationItems(updated);
  };

  // Submit Verification
  const submitVerification = async () => {
    if (!selectedPlan) return;

    if (!isMatched && !deviationSummary.trim()) {
      showAlert('error', 'Vui lòng điền nội dung báo cáo sai lệch KCS');
      return;
    }

    setActionLoading(true);
    try {
      const payload = {
        batchNumber: selectedBatch?.batchNumber,
        batchId: selectedBatch?._id,
        verifiedItems: verificationItems.map((it) => ({
          rawMaterialId: it.rawMaterialId,
          actualVerifiedPassedQty: Number(it.actualVerifiedPassedQty) || 0,
          actualDefectiveOrShortQty: Number(it.actualDefectiveOrShortQty) || 0,
          defectReason: it.defectReason || '',
        })),
        isMatchedWithPlan: isMatched,
        deviationSummary: deviationSummary.trim(),
        supplierDeliveryCode: supplierDeliveryCode.trim(),
        createInboundRequest: createInboundRequest,
      };

      const res = await garmentTechnicalService.inbound.verifyPlan(selectedPlan._id, payload);
      const batchTitleInfo = selectedBatch
        ? ` (Đợt ${selectedBatch.batchNumber}/${selectedPlan.totalBatches || selectedPlan.batches?.length || 1})`
        : '';

      showAlert(
        'success',
        isMatched
          ? `Đã nghiệm thu KCS thành công${batchTitleInfo} và gửi Phiếu yêu cầu nhập kho (${res?.data?.ticket?.ticketCode || 'PNNL'}) tới Quản lý kho!`
          : `Đã ghi nhận sai lệch KCS cho kế hoạch ${selectedPlan.planCode}${batchTitleInfo} và gửi thông báo Realtime tới bộ phận Kế toán!`
      );

      setSelectedPlan(null);
      setSelectedBatch(null);

      // Refresh list
      await fetchData();

      // If Detail Modal is open, update its state with the fresh plan
      if (selectedPlanForDetail && res?.data?.plan) {
        setSelectedPlanForDetail(res.data.plan);
      }
    } catch (err) {
      showAlert('error', err.message || 'Lỗi khi gửi nghiệm thu KCS');
    } finally {
      setActionLoading(false);
    }
  };

  // Submit Direct Inbound Request
  const submitDirectRequest = async () => {
    if (!directForm.supplierId) {
      showAlert('error', 'Vui lòng chọn Nhà cung cấp');
      return;
    }
    const validItems = directForm.items.filter((it) => it.rawMaterialId && (Number(it.acceptedQty) > 0 || Number(it.rejectedQty) > 0));
    if (!validItems.length) {
      showAlert('error', 'Vui lòng chọn ít nhất một nguyên phụ liệu có số lượng');
      return;
    }

    setActionLoading(true);
    try {
      const res = await garmentTechnicalService.inbound.createRequest({
        supplierId: directForm.supplierId,
        contractId: directForm.contractId || undefined,
        supplierDeliveryCode: directForm.supplierDeliveryCode,
        note: directForm.note,
        items: validItems,
      });

      showAlert('success', `Đã tạo phiếu yêu cầu nhập kho ${res?.data?.ticketCode} gửi Quản lý kho thành công!`);
      setShowDirectModal(false);
      setDirectForm({
        supplierId: '',
        contractId: '',
        supplierDeliveryCode: '',
        note: '',
        items: [{ rawMaterialId: '', acceptedQty: 1, rejectedQty: 0, defectReason: '' }],
      });
      if (activeTab === 'REQUESTS') fetchData();
      else setActiveTab('REQUESTS');
    } catch (err) {
      showAlert('error', err.message || 'Lỗi khi tạo yêu cầu nhập kho');
    } finally {
      setActionLoading(false);
    }
  };

  // Status badge renderers
  const renderPlanStatusBadge = (plan) => {
    if (plan.status === 'SCHEDULED') {
      return (
        <span style={{ padding: '0.25rem 0.6rem', borderRadius: '4px', background: '#FEF3C7', color: '#92400E', fontSize: '0.78rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
          <Clock size={13} /> Chờ KCS nghiệm thu
        </span>
      );
    }
    if (plan.status === 'IN_INSPECTION') {
      return (
        <span style={{ padding: '0.25rem 0.6rem', borderRadius: '4px', background: '#DBEAFE', color: '#1E40AF', fontSize: '0.78rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
          <RefreshCw size={13} /> Đang nghiệm thu ({plan.completedBatchesCount || 0}/{plan.totalBatches || 1} đợt)
        </span>
      );
    }
    if (plan.status === 'VERIFIED_MATCHED') {
      return (
        <span style={{ padding: '0.25rem 0.6rem', borderRadius: '4px', background: '#D1FAE5', color: '#065F46', fontSize: '0.78rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
          <CheckCircle2 size={13} /> Đã nghiệm thu khớp
        </span>
      );
    }
    if (plan.status === 'DEVIATION_REPORTED') {
      return (
        <span style={{ padding: '0.25rem 0.6rem', borderRadius: '4px', background: '#FEE2E2', color: '#991B1B', fontSize: '0.78rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
          <AlertTriangle size={13} /> Có sai lệch KCS
        </span>
      );
    }
    return <span style={{ fontSize: '0.78rem' }}>{plan.status}</span>;
  };

  const renderBatchStatusBadge = (status) => {
    switch (status) {
      case 'VERIFIED_MATCHED':
        return (
          <span style={{ padding: '0.2rem 0.55rem', borderRadius: '4px', background: '#D1FAE5', color: '#065F46', fontSize: '0.75rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
            <CheckCircle2 size={12} /> Đã nghiệm thu khớp
          </span>
        );
      case 'DEVIATION_REPORTED':
        return (
          <span style={{ padding: '0.2rem 0.55rem', borderRadius: '4px', background: '#FEE2E2', color: '#991B1B', fontSize: '0.75rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
            <AlertTriangle size={12} /> Có sai lệch KCS
          </span>
        );
      case 'IN_INSPECTION':
        return (
          <span style={{ padding: '0.2rem 0.55rem', borderRadius: '4px', background: '#DBEAFE', color: '#1E40AF', fontSize: '0.75rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
            <RefreshCw size={12} /> Đang kiểm định
          </span>
        );
      case 'SCHEDULED':
      default:
        return (
          <span style={{ padding: '0.2rem 0.55rem', borderRadius: '4px', background: '#FEF3C7', color: '#92400E', fontSize: '0.75rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
            <Clock size={12} /> Chờ KCS nghiệm thu
          </span>
        );
    }
  };

  return (
    <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '1.75rem 1.25rem', width: '100%', minHeight: '85vh' }}>
      {/* Alert Notification */}
      {alertBanner && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          padding: '0.9rem 1.2rem',
          borderRadius: 'var(--radius-md)',
          marginBottom: '1.25rem',
          background: alertBanner.type === 'error' ? '#FDF2F2' : '#F1F8F5',
          border: `1px solid ${alertBanner.type === 'error' ? '#F87171' : '#34D399'}`,
          color: alertBanner.type === 'error' ? '#991B1B' : '#065F46',
          fontSize: '0.92rem',
          fontWeight: 500,
          boxShadow: 'var(--ara-shadow-sm)',
        }}>
          {alertBanner.type === 'error' ? <ShieldAlert size={20} /> : <CheckCircle2 size={20} />}
          <div style={{ flex: 1 }}>{alertBanner.message}</div>
          <button
            type="button"
            onClick={() => setAlertBanner(null)}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit' }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.25rem 0.75rem',
            background: 'rgba(138, 106, 70, 0.12)',
            color: 'var(--ara-gold)',
            borderRadius: '20px',
            fontSize: '0.78rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            marginBottom: '0.4rem',
          }}>
            <ClipboardCheck size={14} /> Kỹ thuật xưởng · KCS Nguyên Phụ Liệu
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--ara-noir)', margin: 0 }}>
            Kế Hoạch & Nghiệm Thu Nhập Nguyên Phụ Liệu
          </h1>
          <p style={{ color: 'var(--ara-text-muted)', fontSize: '0.92rem', margin: '0.35rem 0 0', maxWidth: '850px' }}>
            Tiếp nhận kế hoạch giao hàng từ Kế toán, kiểm định KCS thực tế tại cửa kho theo từng đợt nhập, đối chiếu sai lệch và lập phiếu yêu cầu nhập kho gửi Quản lý kho duyệt.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            type="button"
            className="btn-ara-secondary"
            onClick={fetchData}
            title="Làm mới dữ liệu"
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <RefreshCw size={15} className={loading ? 'spinning' : ''} /> Làm mới
          </button>
          <button
            type="button"
            className="btn-ara-primary"
            onClick={() => setShowDirectModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <Plus size={16} /> Tạo yêu cầu nhập NPL trực tiếp
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
        gap: '1rem',
        marginBottom: '1.5rem',
      }}>
        <div style={{ background: '#FFFFFF', padding: '1.1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--ara-border)', boxShadow: 'var(--ara-shadow-sm)' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--ara-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Tổng kế hoạch nhận
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--ara-noir)', marginTop: '0.2rem' }}>
            {stats.totalPlans}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--ara-text-light)', marginTop: '0.2rem' }}>
            Từ phân hệ Kế toán & Mua hàng
          </div>
        </div>

        <div style={{ background: '#FFFFFF', padding: '1.1rem', borderRadius: 'var(--radius-md)', border: '1px solid #FCD34D', boxShadow: 'var(--ara-shadow-sm)' }}>
          <div style={{ fontSize: '0.8rem', color: '#B45309', textTransform: 'uppercase', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <Calendar size={14} /> Chờ KCS đối soát
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#B45309', marginTop: '0.2rem' }}>
            {stats.totalScheduled}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#92400E', marginTop: '0.2rem' }}>
            Cần kiểm tra hàng thực tế
          </div>
        </div>

        <div style={{ background: '#FFFFFF', padding: '1.1rem', borderRadius: 'var(--radius-md)', border: '1px solid #93C5FD', boxShadow: 'var(--ara-shadow-sm)' }}>
          <div style={{ fontSize: '0.8rem', color: '#1D4ED8', textTransform: 'uppercase', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <Layers size={14} /> Đang kiểm tra theo đợt
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#1D4ED8', marginTop: '0.2rem' }}>
            {stats.totalInspection}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#1E40AF', marginTop: '0.2rem' }}>
            Đang nghiệm thu dở dang
          </div>
        </div>

        <div style={{ background: '#FFFFFF', padding: '1.1rem', borderRadius: 'var(--radius-md)', border: '1px solid #6EE7B7', boxShadow: 'var(--ara-shadow-sm)' }}>
          <div style={{ fontSize: '0.8rem', color: '#047857', textTransform: 'uppercase', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <CheckCircle2 size={14} /> Đã nghiệm thu khớp
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#047857', marginTop: '0.2rem' }}>
            {stats.totalVerified}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#065F46', marginTop: '0.2rem' }}>
            Khớp 100% kế hoạch, đã gửi kho
          </div>
        </div>

        <div style={{ background: '#FFFFFF', padding: '1.1rem', borderRadius: 'var(--radius-md)', border: '1px solid #FCA5A5', boxShadow: 'var(--ara-shadow-sm)' }}>
          <div style={{ fontSize: '0.8rem', color: '#B91C1C', textTransform: 'uppercase', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <AlertTriangle size={14} /> Báo cáo có sai lệch
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#B91C1C', marginTop: '0.2rem' }}>
            {stats.totalDeviation}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#991B1B', marginTop: '0.2rem' }}>
            Lỗi ngoại quan / thiếu số lượng
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex',
        borderBottom: '2px solid var(--ara-border)',
        marginBottom: '1.25rem',
        gap: '1.5rem',
      }}>
        <button
          type="button"
          onClick={() => setActiveTab('PLANS')}
          style={{
            background: 'none',
            border: 'none',
            padding: '0.75rem 0.2rem',
            fontSize: '0.98rem',
            fontWeight: activeTab === 'PLANS' ? 700 : 500,
            color: activeTab === 'PLANS' ? 'var(--ara-noir)' : 'var(--ara-text-muted)',
            borderBottom: activeTab === 'PLANS' ? '3px solid var(--ara-gold)' : '3px solid transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <Calendar size={17} /> Kế hoạch nhập từ Kế toán
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('REQUESTS')}
          style={{
            background: 'none',
            border: 'none',
            padding: '0.75rem 0.2rem',
            fontSize: '0.98rem',
            fontWeight: activeTab === 'REQUESTS' ? 700 : 500,
            color: activeTab === 'REQUESTS' ? 'var(--ara-noir)' : 'var(--ara-text-muted)',
            borderBottom: activeTab === 'REQUESTS' ? '3px solid var(--ara-gold)' : '3px solid transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <Truck size={17} /> Yêu cầu nhập kho đã gửi QL Kho
        </button>
      </div>

      {/* Filter Toolbar */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: '#FFFFFF',
        padding: '0.9rem 1.25rem',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--ara-border)',
        marginBottom: '1.25rem',
        gap: '1rem',
        flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: '260px' }}>
          <Search size={17} color="var(--ara-text-muted)" />
          <input
            type="text"
            className="input-search"
            placeholder={activeTab === 'PLANS' ? "Tìm theo mã kế hoạch, ghi chú, đợt..." : "Tìm mã phiếu, vận đơn..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchData()}
            style={{ width: '100%', border: 'none', outline: 'none', fontSize: '0.92rem' }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--ara-text-muted)' }}>Trạng thái:</span>
          <select
            className="select-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              padding: '0.45rem 0.8rem',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--ara-border)',
              fontSize: '0.88rem',
              background: '#FFFFFF',
            }}
          >
            <option value="ALL">Tất cả trạng thái</option>
            {activeTab === 'PLANS' ? (
              <>
                <option value="SCHEDULED">Chờ KCS nghiệm thu (SCHEDULED)</option>
                <option value="IN_INSPECTION">Đang nghiệm thu theo đợt (IN_INSPECTION)</option>
                <option value="VERIFIED_MATCHED">Đã nghiệm thu khớp (VERIFIED_MATCHED)</option>
                <option value="DEVIATION_REPORTED">Báo cáo có sai lệch (DEVIATION_REPORTED)</option>
              </>
            ) : (
              <>
                <option value="READY_TO_CONFIRM">Chờ QL Kho xác nhận (READY_TO_CONFIRM)</option>
                <option value="COMPLETED">Đã nhập kho xong (COMPLETED)</option>
                <option value="CANCELLED">Đã hủy (CANCELLED)</option>
              </>
            )}
          </select>
        </div>
      </div>

      {/* Main Content Area */}
      {activeTab === 'PLANS' ? (
        /* TAB 1: Material Inbound Plans */
        <div style={{ background: '#FFFFFF', borderRadius: 'var(--radius-md)', border: '1px solid var(--ara-border)', overflow: 'hidden', boxShadow: 'var(--ara-shadow-sm)' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="table-ara" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ background: 'var(--ara-bg-surface)', borderBottom: '1px solid var(--ara-border)', color: 'var(--ara-text-muted)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  <th style={{ padding: '0.9rem 1.1rem' }}>Mã Kế Hoạch & Đợt Nhập</th>
                  <th style={{ padding: '0.9rem 1.1rem' }}>Nhà Cung Cấp</th>
                  <th style={{ padding: '0.9rem 1.1rem' }}>Hợp Đồng</th>
                  <th style={{ padding: '0.9rem 1.1rem' }}>Ngày Hẹn Giao</th>
                  <th style={{ padding: '0.9rem 1.1rem' }}>Số Loại Vật Tư</th>
                  <th style={{ padding: '0.9rem 1.1rem' }}>Kế Toán Lập</th>
                  <th style={{ padding: '0.9rem 1.1rem' }}>Trạng Thái KCS</th>
                  <th style={{ padding: '0.9rem 1.1rem', textAlign: 'right' }}>Thao Tác</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '3rem', color: 'var(--ara-text-muted)' }}>
                      <RefreshCw size={24} className="spinning" style={{ margin: '0 auto 0.5rem' }} />
                      <div>Đang tải danh sách kế hoạch...</div>
                    </td>
                  </tr>
                ) : plans.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '3rem', color: 'var(--ara-text-muted)' }}>
                      <FileText size={32} style={{ margin: '0 auto 0.5rem', opacity: 0.5 }} />
                      <div>Không tìm thấy kế hoạch nhập nguyên phụ liệu nào</div>
                    </td>
                  </tr>
                ) : (
                  plans.map((plan) => {
                    const isExpanded = expandedPlanIds.has(plan._id);
                    const isPending = plan.status === 'SCHEDULED' || plan.status === 'IN_INSPECTION';

                    return (
                      <React.Fragment key={plan._id}>
                        <tr style={{
                          borderBottom: isExpanded ? 'none' : '1px solid var(--ara-border-subtle)',
                          background: isExpanded ? 'rgba(159, 131, 101, 0.04)' : undefined,
                          transition: 'background 0.2s',
                        }}>
                          {/* Col 1: Plan Code + Batch Tag */}
                          <td style={{ padding: '1rem 1.1rem', fontWeight: 700, color: 'var(--ara-noir)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                              <button
                                type="button"
                                onClick={() => setSelectedPlanForDetail(plan)}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  padding: 0,
                                  cursor: 'pointer',
                                  fontFamily: 'monospace',
                                  fontSize: '0.95rem',
                                  color: 'var(--ara-gold)',
                                  textDecoration: 'underline',
                                  fontWeight: 700,
                                }}
                                title="Nhấn để xem chi tiết kế hoạch & các đợt"
                              >
                                {plan.planCode}
                              </button>

                              {plan.hasMultipleBatches ? (
                                <span style={{
                                  fontSize: '0.74rem',
                                  background: 'rgba(159, 131, 101, 0.15)',
                                  color: 'var(--ara-gold)',
                                  padding: '0.15rem 0.5rem',
                                  borderRadius: '4px',
                                  fontWeight: 700,
                                  border: '1px solid rgba(159, 131, 101, 0.3)',
                                  whiteSpace: 'nowrap',
                                }}>
                                  Gồm {plan.totalBatches} đợt ({plan.completedBatchesCount}/{plan.totalBatches} đợt xong)
                                </span>
                              ) : (
                                <span style={{
                                  fontSize: '0.72rem',
                                  background: '#F3F4F6',
                                  color: '#6B7280',
                                  padding: '0.15rem 0.45rem',
                                  borderRadius: '4px',
                                  fontWeight: 600,
                                  whiteSpace: 'nowrap',
                                }}>
                                  1 đợt giao
                                </span>
                              )}
                            </div>

                            {plan.deliveryNote && (
                              <div style={{ fontSize: '0.75rem', color: 'var(--ara-text-muted)', fontWeight: 400, marginTop: '4px', maxWidth: '320px' }}>
                                {plan.deliveryNote}
                              </div>
                            )}
                          </td>

                          {/* Col 2: Supplier */}
                          <td style={{ padding: '1rem 1.1rem' }}>
                            <div style={{ fontWeight: 600, color: 'var(--ara-noir)' }}>
                              {plan.supplierId?.supplierName || 'NCC không xác định'}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--ara-text-muted)' }}>
                              {plan.supplierId?.supplierCode} {plan.supplierId?.phone ? `· ${plan.supplierId.phone}` : ''}
                            </div>
                          </td>

                          {/* Col 3: Contract */}
                          <td style={{ padding: '1rem 1.1rem' }}>
                            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--ara-gold)' }}>
                              {plan.contractId?.contractCode || '—'}
                            </span>
                          </td>

                          {/* Col 4: Scheduled Delivery Date */}
                          <td style={{ padding: '1rem 1.1rem' }}>
                            {plan.scheduledDeliveryDate ? (
                              <span>{new Date(plan.scheduledDeliveryDate).toLocaleDateString('vi-VN')}</span>
                            ) : (
                              <span style={{ color: 'var(--ara-text-light)' }}>Chưa hẹn</span>
                            )}
                            {plan.hasMultipleBatches && (
                              <div style={{ fontSize: '0.73rem', color: 'var(--ara-text-muted)', marginTop: '2px' }}>
                                (Theo lịch từng đợt)
                              </div>
                            )}
                          </td>

                          {/* Col 5: Materials */}
                          <td style={{ padding: '1rem 1.1rem' }}>
                            <span style={{ fontWeight: 600 }}>{plan.expectedItems?.length || 0}</span> loại vật tư
                          </td>

                          {/* Col 6: Created By */}
                          <td style={{ padding: '1rem 1.1rem', fontSize: '0.85rem' }}>
                            {plan.createdByAccountantId?.fullName || plan.createdByAccountantId?.username || 'Kế toán'}
                          </td>

                          {/* Col 7: Status */}
                          <td style={{ padding: '1rem 1.1rem' }}>
                            {renderPlanStatusBadge(plan)}
                          </td>

                          {/* Col 8: Actions */}
                          <td style={{ padding: '1rem 1.1rem', textAlign: 'right' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.5rem' }}>
                              {plan.hasMultipleBatches ? (
                                <>
                                  <button
                                    type="button"
                                    className="btn-ara-secondary"
                                    onClick={() => toggleExpandPlan(plan._id)}
                                    style={{
                                      fontSize: '0.8rem',
                                      padding: '0.4rem 0.65rem',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '0.35rem',
                                      background: isExpanded ? 'rgba(159, 131, 101, 0.12)' : undefined,
                                      borderColor: isExpanded ? 'var(--ara-gold)' : undefined,
                                      color: isExpanded ? 'var(--ara-gold)' : undefined,
                                      fontWeight: 600,
                                    }}
                                    title={isExpanded ? "Thu gọn các đợt" : "Mở rộng danh sách các đợt nhập"}
                                  >
                                    {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                                    {isExpanded ? 'Thu gọn đợt' : `Xem ${plan.totalBatches} đợt`}
                                  </button>
                                  <button
                                    type="button"
                                    className="btn-ara-secondary"
                                    onClick={() => setSelectedPlanForDetail(plan)}
                                    style={{ fontSize: '0.8rem', padding: '0.4rem 0.6rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                                    title="Xem chi tiết toàn bộ kế hoạch"
                                  >
                                    <Eye size={14} /> Chi tiết
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    className={isPending ? "btn-ara-primary" : "btn-ara-secondary"}
                                    onClick={() => openVerifyModal(plan, plan.batches?.[0] || null)}
                                    style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem' }}
                                  >
                                    {isPending ? 'Nghiệm thu KCS & Gửi QL Kho' : 'Xem & Cập nhật KCS'}
                                  </button>
                                  <button
                                    type="button"
                                    className="btn-ara-secondary"
                                    onClick={() => setSelectedPlanForDetail(plan)}
                                    style={{ fontSize: '0.8rem', padding: '0.4rem 0.6rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                                    title="Xem chi tiết kế hoạch"
                                  >
                                    <Eye size={14} />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>

                        {/* EXPANDED SUB-ROW: Batches of Multi-Batch Plan */}
                        {plan.hasMultipleBatches && isExpanded && (
                          <tr style={{ background: 'rgba(159, 131, 101, 0.03)', borderBottom: '1px solid var(--ara-border)' }}>
                            <td colSpan={8} style={{ padding: '0.75rem 1.25rem 1.25rem' }}>
                              <div style={{
                                background: '#FFFFFF',
                                border: '1px solid var(--ara-border)',
                                borderRadius: 'var(--radius-sm)',
                                boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                                overflow: 'hidden',
                              }}>
                                <div style={{
                                  background: 'var(--ara-bg-surface)',
                                  padding: '0.65rem 1rem',
                                  borderBottom: '1px solid var(--ara-border)',
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                }}>
                                  <div style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--ara-noir)', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                    <Layers size={15} color="var(--ara-gold)" />
                                    Các đợt giao hàng & nghiệm thu ({plan.batches?.length || 0} đợt) của kế hoạch {plan.planCode}
                                  </div>
                                  <span style={{ fontSize: '0.78rem', color: 'var(--ara-text-muted)' }}>
                                    KCS kiểm định từng đợt hàng thực nhận tại cửa kho
                                  </span>
                                </div>

                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
                                  <thead>
                                    <tr style={{ borderBottom: '1px solid var(--ara-border)', color: 'var(--ara-text-muted)', fontSize: '0.76rem', textTransform: 'uppercase', background: '#FAFAFA' }}>
                                      <th style={{ padding: '0.65rem 0.9rem', width: '90px' }}>Đợt giao</th>
                                      <th style={{ padding: '0.65rem 0.9rem' }}>Tiêu đề / Tỷ lệ</th>
                                      <th style={{ padding: '0.65rem 0.9rem' }}>Ngày hẹn giao</th>
                                      <th style={{ padding: '0.65rem 0.9rem' }}>Vật tư của đợt</th>
                                      <th style={{ padding: '0.65rem 0.9rem' }}>Trạng thái KCS</th>
                                      <th style={{ padding: '0.65rem 0.9rem' }}>Kết quả / Ghi chú</th>
                                      <th style={{ padding: '0.65rem 0.9rem', textAlign: 'right' }}>Thao tác đợt</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {plan.batches && plan.batches.length > 0 ? (
                                      plan.batches.map((batch, bIdx) => {
                                        const bPending = batch.status === 'SCHEDULED' || batch.status === 'IN_INSPECTION';
                                        const bItems = batch.expectedItems || [];

                                        return (
                                          <tr key={batch._id || bIdx} style={{ borderBottom: '1px solid var(--ara-border-subtle)' }}>
                                            <td style={{ padding: '0.75rem 0.9rem', fontWeight: 700, color: 'var(--ara-gold)' }}>
                                              Đợt {batch.batchNumber || (bIdx + 1)}
                                            </td>
                                            <td style={{ padding: '0.75rem 0.9rem' }}>
                                              <div style={{ fontWeight: 600 }}>{batch.batchTitle || `Đợt giao ${batch.batchNumber || (bIdx + 1)}`}</div>
                                              <span style={{ fontSize: '0.75rem', color: 'var(--ara-text-muted)' }}>
                                                Khối lượng: <strong>{batch.batchPercentage || 0}%</strong>
                                              </span>
                                            </td>
                                            <td style={{ padding: '0.75rem 0.9rem' }}>
                                              {batch.scheduledDeliveryDate ? (
                                                new Date(batch.scheduledDeliveryDate).toLocaleDateString('vi-VN')
                                              ) : (
                                                <span style={{ color: 'var(--ara-text-light)' }}>Theo kế hoạch</span>
                                              )}
                                            </td>
                                            <td style={{ padding: '0.75rem 0.9rem' }}>
                                              <div style={{ fontWeight: 600 }}>{bItems.length} loại vật tư</div>
                                              <div style={{ fontSize: '0.73rem', color: 'var(--ara-text-muted)' }}>
                                                {bItems.slice(0, 2).map((it) => `${it.rawMaterialId?.materialName || 'Vật tư'}: ${it.plannedQty || 0} ${it.rawMaterialId?.unit || ''}`).join(', ')}
                                                {bItems.length > 2 ? '...' : ''}
                                              </div>
                                            </td>
                                            <td style={{ padding: '0.75rem 0.9rem' }}>
                                              {renderBatchStatusBadge(batch.status)}
                                            </td>
                                            <td style={{ padding: '0.75rem 0.9rem', fontSize: '0.8rem', color: 'var(--ara-text-muted)', maxWidth: '240px' }}>
                                              {batch.technicianVerification?.isMatchedWithPlan === false ? (
                                                <span style={{ color: '#DC2626' }}>
                                                  Sai lệch: {batch.technicianVerification.deviationSummary || 'Có lỗi/thiếu'}
                                                </span>
                                              ) : batch.technicianVerification?.isMatchedWithPlan === true ? (
                                                <span style={{ color: '#059669' }}>
                                                  Khớp 100% {batch.technicianVerification.verifiedAt ? `(${new Date(batch.technicianVerification.verifiedAt).toLocaleDateString('vi-VN')})` : ''}
                                                </span>
                                              ) : (
                                                batch.deliveryNote || '—'
                                              )}
                                            </td>
                                            <td style={{ padding: '0.75rem 0.9rem', textAlign: 'right' }}>
                                              <button
                                                type="button"
                                                className={bPending ? "btn-ara-primary" : "btn-ara-secondary"}
                                                onClick={() => openVerifyModal(plan, batch)}
                                                style={{
                                                  fontSize: '0.78rem',
                                                  padding: '0.35rem 0.7rem',
                                                  display: 'inline-flex',
                                                  alignItems: 'center',
                                                  gap: '0.3rem',
                                                }}
                                              >
                                                <ClipboardCheck size={13} />
                                                {bPending ? `Nghiệm thu Đợt ${batch.batchNumber}` : `Cập nhật Đợt ${batch.batchNumber}`}
                                              </button>
                                            </td>
                                          </tr>
                                        );
                                      })
                                    ) : (
                                      <tr>
                                        <td colSpan={7} style={{ textAlign: 'center', padding: '1.25rem', color: 'var(--ara-text-muted)' }}>
                                          Không có thông tin đợt chi tiết
                                        </td>
                                      </tr>
                                    )}
                                  </tbody>
                                </table>
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
        </div>
      ) : (
        /* TAB 2: Submitted Inbound Requests (MaterialTickets) */
        <div style={{ background: '#FFFFFF', borderRadius: 'var(--radius-md)', border: '1px solid var(--ara-border)', overflow: 'hidden', boxShadow: 'var(--ara-shadow-sm)' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="table-ara" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ background: 'var(--ara-bg-surface)', borderBottom: '1px solid var(--ara-border)', color: 'var(--ara-text-muted)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  <th style={{ padding: '0.9rem 1.1rem' }}>Mã Phiếu Yêu Cầu</th>
                  <th style={{ padding: '0.9rem 1.1rem' }}>Kế Hoạch Gốc</th>
                  <th style={{ padding: '0.9rem 1.1rem' }}>Nhà Cung Cấp</th>
                  <th style={{ padding: '0.9rem 1.1rem' }}>Số Dòng NPL</th>
                  <th style={{ padding: '0.9rem 1.1rem' }}>Ngày Lập</th>
                  <th style={{ padding: '0.9rem 1.1rem' }}>Trạng Thái Phê Duyệt Kho</th>
                  <th style={{ padding: '0.9rem 1.1rem' }}>Ghi Chú KCS</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '3rem', color: 'var(--ara-text-muted)' }}>
                      <RefreshCw size={24} className="spinning" style={{ margin: '0 auto 0.5rem' }} />
                      <div>Đang tải danh sách yêu cầu...</div>
                    </td>
                  </tr>
                ) : requests.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '3rem', color: 'var(--ara-text-muted)' }}>
                      <Truck size={32} style={{ margin: '0 auto 0.5rem', opacity: 0.5 }} />
                      <div>Chưa có phiếu yêu cầu nhập kho nguyên phụ liệu nào</div>
                    </td>
                  </tr>
                ) : (
                  requests.map((ticket) => (
                    <tr key={ticket._id} style={{ borderBottom: '1px solid var(--ara-border-subtle)' }}>
                      <td style={{ padding: '1rem 1.1rem', fontWeight: 700, color: 'var(--ara-noir)' }}>
                        <span style={{ fontFamily: 'monospace', fontSize: '0.95rem', color: 'var(--ara-gold)' }}>
                          {ticket.ticketCode}
                        </span>
                        {ticket.supplierDeliveryCode && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--ara-text-muted)', fontWeight: 400 }}>
                            Vận đơn NCC: {ticket.supplierDeliveryCode}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '1rem 1.1rem' }}>
                        {ticket.inboundPlanId?.planCode ? (
                          <div>
                            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{ticket.inboundPlanId.planCode}</span>
                            {ticket.deliveryBatchId && (
                              <span style={{
                                marginLeft: '0.4rem',
                                fontSize: '0.72rem',
                                background: 'rgba(159, 131, 101, 0.15)',
                                color: 'var(--ara-gold)',
                                padding: '0.1rem 0.4rem',
                                borderRadius: '3px',
                                fontWeight: 700,
                              }}>
                                Theo đợt
                              </span>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: 'var(--ara-text-light)' }}>Tạo trực tiếp</span>
                        )}
                      </td>
                      <td style={{ padding: '1rem 1.1rem' }}>
                        <div style={{ fontWeight: 600 }}>{ticket.supplierId?.supplierName || '—'}</div>
                      </td>
                      <td style={{ padding: '1rem 1.1rem' }}>
                        <span style={{ fontWeight: 600 }}>{ticket.receiptLines?.length || 0}</span> loại NPL
                      </td>
                      <td style={{ padding: '1rem 1.1rem' }}>
                        {ticket.createdAt ? new Date(ticket.createdAt).toLocaleDateString('vi-VN') : '—'}
                      </td>
                      <td style={{ padding: '1rem 1.1rem' }}>
                        {ticket.status === 'READY_TO_CONFIRM' && (
                          <span style={{ padding: '0.25rem 0.6rem', borderRadius: '4px', background: '#FEF3C7', color: '#92400E', fontSize: '0.78rem', fontWeight: 700 }}>
                            Chờ QL Kho duyệt & xếp kệ
                          </span>
                        )}
                        {ticket.status === 'COMPLETED' && (
                          <span style={{ padding: '0.25rem 0.6rem', borderRadius: '4px', background: '#D1FAE5', color: '#065F46', fontSize: '0.78rem', fontWeight: 700 }}>
                            Đã nhập kho thành công
                          </span>
                        )}
                        {ticket.status === 'CANCELLED' && (
                          <span style={{ padding: '0.25rem 0.6rem', borderRadius: '4px', background: '#F3F4F6', color: '#6B7280', fontSize: '0.78rem', fontWeight: 700 }}>
                            Đã hủy
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '1rem 1.1rem', fontSize: '0.85rem', color: 'var(--ara-text-muted)', maxWidth: '280px' }}>
                        {ticket.receiptNote || '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: VIEW FULL PLAN DETAILS & ALL DELIVERY BATCHES                    */}
      {/* ========================================================================= */}
      {selectedPlanForDetail && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9998,
          padding: '1rem',
        }}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: 'var(--radius-md)',
            width: '100%',
            maxWidth: '1020px',
            maxHeight: '92vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: 'var(--ara-shadow-lg)',
            overflow: 'hidden',
          }}>
            {/* Header */}
            <div style={{
              padding: '1.25rem 1.5rem',
              borderBottom: '1px solid var(--ara-border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: 'var(--ara-bg-surface)',
            }}>
              <div>
                <div style={{ fontSize: '0.78rem', color: 'var(--ara-gold)', fontWeight: 700, textTransform: 'uppercase' }}>
                  Chi Tiết Kế Hoạch Nhập Nguyên Phụ Liệu
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginTop: '0.2rem' }}>
                  <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--ara-noir)', margin: 0 }}>
                    {selectedPlanForDetail.planCode}
                  </h2>
                  {renderPlanStatusBadge(selectedPlanForDetail)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPlanForDetail(null)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--ara-text-muted)' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>
              {/* Meta Grid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '1rem',
                background: 'var(--ara-bg-surface)',
                padding: '1.1rem',
                borderRadius: 'var(--radius-sm)',
                marginBottom: '1.5rem',
                fontSize: '0.88rem',
              }}>
                <div>
                  <span style={{ color: 'var(--ara-text-muted)', display: 'block', fontSize: '0.78rem' }}>Nhà cung cấp</span>
                  <strong style={{ color: 'var(--ara-noir)' }}>{selectedPlanForDetail.supplierId?.supplierName || '—'}</strong>
                  <div style={{ fontSize: '0.75rem', color: 'var(--ara-text-muted)' }}>
                    Mã: {selectedPlanForDetail.supplierId?.supplierCode} {selectedPlanForDetail.supplierId?.phone ? `· SĐT: ${selectedPlanForDetail.supplierId.phone}` : ''}
                  </div>
                </div>

                <div>
                  <span style={{ color: 'var(--ara-text-muted)', display: 'block', fontSize: '0.78rem' }}>Hợp đồng kinh tế</span>
                  <strong style={{ color: 'var(--ara-gold)' }}>{selectedPlanForDetail.contractId?.contractCode || '—'}</strong>
                  {selectedPlanForDetail.contractId?.title && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--ara-text-muted)' }}>
                      {selectedPlanForDetail.contractId.title}
                    </div>
                  )}
                </div>

                <div>
                  <span style={{ color: 'var(--ara-text-muted)', display: 'block', fontSize: '0.78rem' }}>Ngày hẹn giao kế hoạch</span>
                  <strong>
                    {selectedPlanForDetail.scheduledDeliveryDate
                      ? new Date(selectedPlanForDetail.scheduledDeliveryDate).toLocaleDateString('vi-VN')
                      : 'Chưa có ngày hẹn'}
                  </strong>
                </div>

                <div>
                  <span style={{ color: 'var(--ara-text-muted)', display: 'block', fontSize: '0.78rem' }}>Phân kỳ đợt giao</span>
                  <strong style={{ color: 'var(--ara-gold)' }}>
                    {selectedPlanForDetail.batches?.length || 1} đợt giao hàng
                  </strong>
                  <div style={{ fontSize: '0.75rem', color: 'var(--ara-text-muted)' }}>
                    Đã nghiệm thu: {selectedPlanForDetail.completedBatchesCount || 0}/{selectedPlanForDetail.batches?.length || 1} đợt
                  </div>
                </div>

                <div>
                  <span style={{ color: 'var(--ara-text-muted)', display: 'block', fontSize: '0.78rem' }}>Kế toán phụ trách</span>
                  <strong>{selectedPlanForDetail.createdByAccountantId?.fullName || selectedPlanForDetail.createdByAccountantId?.username || 'Kế toán'}</strong>
                </div>

                <div>
                  <span style={{ color: 'var(--ara-text-muted)', display: 'block', fontSize: '0.78rem' }}>Ghi chú giao hàng</span>
                  <div style={{ fontSize: '0.84rem' }}>{selectedPlanForDetail.deliveryNote || 'Không có ghi chú'}</div>
                </div>
              </div>

              {/* SECTION: Delivery Batches (Phân rã theo đợt) */}
              <div style={{ marginBottom: '1.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, color: 'var(--ara-noir)', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                    <Layers size={18} color="var(--ara-gold)" />
                    Danh Sách Các Đợt Giao Hàng & Nghiệm Thu ({selectedPlanForDetail.batches?.length || 1} đợt)
                  </h3>
                  <span style={{ fontSize: '0.8rem', color: 'var(--ara-text-muted)' }}>
                    KCS kiểm định chi tiết theo từng đợt bên dưới
                  </span>
                </div>

                {Array.isArray(selectedPlanForDetail.batches) && selectedPlanForDetail.batches.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {selectedPlanForDetail.batches.map((batch, idx) => {
                      const bPending = batch.status === 'SCHEDULED' || batch.status === 'IN_INSPECTION';
                      const bItems = batch.expectedItems || [];

                      return (
                        <div
                          key={batch._id || idx}
                          style={{
                            border: '1px solid var(--ara-border)',
                            borderRadius: 'var(--radius-sm)',
                            overflow: 'hidden',
                            boxShadow: 'var(--ara-shadow-sm)',
                          }}
                        >
                          {/* Batch Card Header */}
                          <div style={{
                            background: '#F9FAFB',
                            padding: '0.85rem 1.1rem',
                            borderBottom: '1px solid var(--ara-border)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: '0.75rem',
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                              <span style={{
                                background: 'var(--ara-gold)',
                                color: '#FFFFFF',
                                fontSize: '0.82rem',
                                fontWeight: 700,
                                padding: '0.2rem 0.6rem',
                                borderRadius: '4px',
                              }}>
                                Đợt {batch.batchNumber || (idx + 1)}
                              </span>
                              <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--ara-noir)' }}>
                                {batch.batchTitle || `Đợt giao hàng ${batch.batchNumber || (idx + 1)}`}
                              </span>
                              <span style={{ fontSize: '0.82rem', color: 'var(--ara-text-muted)' }}>
                                ({batch.batchPercentage || 0}% khối lượng)
                              </span>
                              {batch.scheduledDeliveryDate && (
                                <span style={{ fontSize: '0.82rem', color: 'var(--ara-text-muted)', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                                  <Calendar size={13} /> {new Date(batch.scheduledDeliveryDate).toLocaleDateString('vi-VN')}
                                </span>
                              )}
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                              {renderBatchStatusBadge(batch.status)}
                              <button
                                type="button"
                                className={bPending ? "btn-ara-primary" : "btn-ara-secondary"}
                                onClick={() => openVerifyModal(selectedPlanForDetail, batch)}
                                style={{
                                  fontSize: '0.8rem',
                                  padding: '0.35rem 0.75rem',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.35rem',
                                }}
                              >
                                <ClipboardCheck size={14} />
                                {bPending ? `Nghiệm thu Đợt ${batch.batchNumber}` : `Xem / Cập nhật Đợt ${batch.batchNumber}`}
                              </button>
                            </div>
                          </div>

                          {/* Batch Items Table */}
                          <div style={{ padding: '0.75rem 1rem' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem', textAlign: 'left' }}>
                              <thead>
                                <tr style={{ color: 'var(--ara-text-muted)', fontSize: '0.76rem', textTransform: 'uppercase', borderBottom: '1px solid var(--ara-border-subtle)' }}>
                                  <th style={{ padding: '0.5rem 0.6rem' }}>Nguyên phụ liệu</th>
                                  <th style={{ padding: '0.5rem 0.6rem', width: '100px' }}>Quy cách / Khổ</th>
                                  <th style={{ padding: '0.5rem 0.6rem', width: '100px' }}>ĐVT</th>
                                  <th style={{ padding: '0.5rem 0.6rem', width: '110px' }}>Kế hoạch đợt</th>
                                  <th style={{ padding: '0.5rem 0.6rem', width: '110px' }}>Thực đạt KCS</th>
                                  <th style={{ padding: '0.5rem 0.6rem', width: '100px' }}>Lỗi / Thiếu</th>
                                  <th style={{ padding: '0.5rem 0.6rem' }}>Mô tả lỗi</th>
                                </tr>
                              </thead>
                              <tbody>
                                {bItems.map((item, iIdx) => (
                                  <tr key={iIdx} style={{ borderBottom: '1px solid var(--ara-border-subtle)' }}>
                                    <td style={{ padding: '0.6rem 0.6rem' }}>
                                      <div style={{ fontWeight: 600, color: 'var(--ara-noir)' }}>
                                        {item.rawMaterialId?.materialName || 'Vật tư'}
                                      </div>
                                      <div style={{ fontSize: '0.74rem', color: 'var(--ara-text-muted)' }}>
                                        Mã: {item.rawMaterialId?.materialCode}
                                      </div>
                                    </td>
                                    <td style={{ padding: '0.6rem 0.6rem', fontSize: '0.8rem', color: 'var(--ara-text-muted)' }}>
                                      {item.rawMaterialId?.widthCm ? `${item.rawMaterialId.widthCm}cm` : '—'}
                                      {item.rawMaterialId?.gsm ? ` · ${item.rawMaterialId.gsm}gsm` : ''}
                                    </td>
                                    <td style={{ padding: '0.6rem 0.6rem' }}>
                                      {item.rawMaterialId?.unit || '—'}
                                    </td>
                                    <td style={{ padding: '0.6rem 0.6rem', fontWeight: 700 }}>
                                      {item.plannedQty || 0}
                                    </td>
                                    <td style={{ padding: '0.6rem 0.6rem', fontWeight: 700, color: '#047857' }}>
                                      {item.actualVerifiedPassedQty !== undefined ? item.actualVerifiedPassedQty : '—'}
                                    </td>
                                    <td style={{ padding: '0.6rem 0.6rem', fontWeight: 700, color: Number(item.actualDefectiveOrShortQty) > 0 ? '#B91C1C' : '#6B7280' }}>
                                      {item.actualDefectiveOrShortQty !== undefined ? item.actualDefectiveOrShortQty : '—'}
                                    </td>
                                    <td style={{ padding: '0.6rem 0.6rem', fontSize: '0.8rem', color: 'var(--ara-text-muted)' }}>
                                      {item.defectReason || '—'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>

                            {/* Batch verification note if verified */}
                            {batch.technicianVerification && (
                              <div style={{
                                marginTop: '0.6rem',
                                padding: '0.6rem 0.8rem',
                                background: batch.technicianVerification.isMatchedWithPlan ? '#F1F8F5' : '#FEF2F2',
                                borderRadius: '4px',
                                border: `1px solid ${batch.technicianVerification.isMatchedWithPlan ? '#A7F3D0' : '#FECACA'}`,
                                fontSize: '0.8rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                flexWrap: 'wrap',
                              }}>
                                <strong>Biên bản KCS:</strong>
                                <span>
                                  {batch.technicianVerification.isMatchedWithPlan
                                    ? 'Khớp 100% với kế hoạch nhập'
                                    : `Có sai lệch: ${batch.technicianVerification.deviationSummary || 'Báo cáo sai lệch'}`}
                                </span>
                                {batch.technicianVerification.verifiedAt && (
                                  <span style={{ color: 'var(--ara-text-muted)', marginLeft: 'auto' }}>
                                    Nghiệm thu: {new Date(batch.technicianVerification.verifiedAt).toLocaleString('vi-VN')}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  /* Single batch fallback card */
                  <div style={{
                    border: '1px solid var(--ara-border)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '1rem',
                    background: '#FAFAFA',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                      <div style={{ fontWeight: 700 }}>Giao hàng 1 đợt (Toàn bộ kế hoạch)</div>
                      <button
                        type="button"
                        className="btn-ara-primary"
                        onClick={() => openVerifyModal(selectedPlanForDetail, null)}
                        style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
                      >
                        Nghiệm thu KCS & Gửi QL Kho
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* SECTION: Root Plan Aggregated Items */}
              <div style={{ marginBottom: '1.25rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 0.6rem', color: 'var(--ara-noir)' }}>
                  Tổng Hợp Vật Tư Toàn Bộ Kế Hoạch ({selectedPlanForDetail.expectedItems?.length || 0} loại)
                </h3>
                <div style={{ border: '1px solid var(--ara-border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ background: 'var(--ara-bg-surface)', borderBottom: '1px solid var(--ara-border)', color: 'var(--ara-text-muted)', fontSize: '0.76rem', textTransform: 'uppercase' }}>
                        <th style={{ padding: '0.65rem 0.8rem' }}>Nguyên phụ liệu</th>
                        <th style={{ padding: '0.65rem 0.8rem' }}>ĐVT</th>
                        <th style={{ padding: '0.65rem 0.8rem' }}>Tổng SL Kế Hoạch</th>
                        <th style={{ padding: '0.65rem 0.8rem' }}>Tổng Thực Đạt KCS</th>
                        <th style={{ padding: '0.65rem 0.8rem' }}>Tổng Lỗi / Thiếu</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedPlanForDetail.expectedItems || []).map((item, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--ara-border-subtle)' }}>
                          <td style={{ padding: '0.65rem 0.8rem' }}>
                            <div style={{ fontWeight: 600 }}>{item.rawMaterialId?.materialName || 'Vật tư'}</div>
                            <div style={{ fontSize: '0.74rem', color: 'var(--ara-text-muted)' }}>Mã: {item.rawMaterialId?.materialCode}</div>
                          </td>
                          <td style={{ padding: '0.65rem 0.8rem' }}>{item.rawMaterialId?.unit || '—'}</td>
                          <td style={{ padding: '0.65rem 0.8rem', fontWeight: 700 }}>{item.plannedQty || 0}</td>
                          <td style={{ padding: '0.65rem 0.8rem', fontWeight: 700, color: '#047857' }}>{item.actualVerifiedPassedQty || 0}</td>
                          <td style={{ padding: '0.65rem 0.8rem', fontWeight: 700, color: Number(item.actualDefectiveOrShortQty) > 0 ? '#B91C1C' : '#6B7280' }}>
                            {item.actualDefectiveOrShortQty || 0}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{
              padding: '1rem 1.5rem',
              borderTop: '1px solid var(--ara-border)',
              display: 'flex',
              justifyContent: 'flex-end',
              background: 'var(--ara-bg-surface)',
            }}>
              <button
                type="button"
                className="btn-ara-secondary"
                onClick={() => setSelectedPlanForDetail(null)}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: VERIFY PLAN / BATCH & SEND INBOUND REQUEST                      */}
      {/* ========================================================================= */}
      {selectedPlan && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '1rem',
        }}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: 'var(--radius-md)',
            width: '100%',
            maxWidth: '920px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: 'var(--ara-shadow-lg)',
            overflow: 'hidden',
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '1.25rem 1.5rem',
              borderBottom: '1px solid var(--ara-border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: 'var(--ara-bg-surface)',
            }}>
              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--ara-gold)', fontWeight: 700, textTransform: 'uppercase' }}>
                  Nghiệp vụ KCS Kiểm Định Thực Tế Tại Cửa Kho
                </div>
                <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--ara-noir)', margin: '0.2rem 0 0' }}>
                  Nghiệm Thu: {selectedPlan.planCode}
                  {selectedBatch && (
                    <span style={{ marginLeft: '0.6rem', fontSize: '1rem', color: 'var(--ara-gold)', fontWeight: 600 }}>
                      (Đợt {selectedBatch.batchNumber}/{selectedPlan.totalBatches || selectedPlan.batches?.length || 1} · {selectedBatch.batchPercentage}% {selectedBatch.batchTitle ? `· ${selectedBatch.batchTitle}` : ''})
                    </span>
                  )}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedPlan(null);
                  setSelectedBatch(null);
                }}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--ara-text-muted)' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>
              {/* Plan Metadata summary */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '1rem',
                background: 'var(--ara-bg-surface)',
                padding: '1rem',
                borderRadius: 'var(--radius-sm)',
                marginBottom: '1.25rem',
                fontSize: '0.88rem',
              }}>
                <div>
                  <span style={{ color: 'var(--ara-text-muted)', display: 'block', fontSize: '0.78rem' }}>Nhà cung cấp</span>
                  <strong>{selectedPlan.supplierId?.supplierName}</strong> ({selectedPlan.supplierId?.supplierCode})
                </div>
                <div>
                  <span style={{ color: 'var(--ara-text-muted)', display: 'block', fontSize: '0.78rem' }}>Hợp đồng kinh tế</span>
                  <strong>{selectedPlan.contractId?.contractCode || '—'}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--ara-text-muted)', display: 'block', fontSize: '0.78rem' }}>
                    {selectedBatch ? `Ngày hẹn giao (Đợt ${selectedBatch.batchNumber})` : 'Ngày hẹn giao'}
                  </span>
                  <strong>
                    {(selectedBatch?.scheduledDeliveryDate || selectedPlan.scheduledDeliveryDate)
                      ? new Date(selectedBatch?.scheduledDeliveryDate || selectedPlan.scheduledDeliveryDate).toLocaleDateString('vi-VN')
                      : '—'}
                  </strong>
                </div>
                {selectedBatch && (
                  <div>
                    <span style={{ color: 'var(--ara-text-muted)', display: 'block', fontSize: '0.78rem' }}>Tiến độ đợt giao</span>
                    <strong style={{ color: 'var(--ara-gold)' }}>
                      Đợt {selectedBatch.batchNumber}/{selectedPlan.totalBatches || selectedPlan.batches?.length || 1} ({selectedBatch.batchPercentage}%)
                    </strong>
                  </div>
                )}
              </div>

              {/* Delivery Note / Code */}
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.88rem', fontWeight: 600, color: 'var(--ara-noir)', marginBottom: '0.4rem' }}>
                  Số phiếu giao hàng / Vận đơn của NCC (nếu có):
                </label>
                <input
                  type="text"
                  placeholder="Ví dụ: NCC-HOA-THO-0921"
                  value={supplierDeliveryCode}
                  onChange={(e) => setSupplierDeliveryCode(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.8rem',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--ara-border)',
                    fontSize: '0.9rem',
                  }}
                />
              </div>

              {/* Verification Items Table */}
              <div style={{ marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--ara-noir)' }}>
                    Chi tiết kiểm định số lượng & lỗi từng loại nguyên phụ liệu
                  </h3>
                  <span style={{ fontSize: '0.8rem', color: 'var(--ara-text-muted)' }}>
                    Nhập số lượng thực nhận đạt chuẩn và số lượng lỗi
                  </span>
                </div>

                <div style={{ border: '1px solid var(--ara-border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ background: 'var(--ara-bg-surface)', borderBottom: '1px solid var(--ara-border)', color: 'var(--ara-text-muted)', fontSize: '0.78rem', textTransform: 'uppercase' }}>
                        <th style={{ padding: '0.7rem 0.9rem' }}>Vật tư / Quy cách</th>
                        <th style={{ padding: '0.7rem 0.9rem', width: '90px' }}>Kế hoạch</th>
                        <th style={{ padding: '0.7rem 0.9rem', width: '120px' }}>Thực đạt KCS</th>
                        <th style={{ padding: '0.7rem 0.9rem', width: '110px' }}>Lỗi / Thiếu</th>
                        <th style={{ padding: '0.7rem 0.9rem' }}>Mô tả lỗi KCS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {verificationItems.map((item, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--ara-border-subtle)' }}>
                          <td style={{ padding: '0.8rem 0.9rem' }}>
                            <div style={{ fontWeight: 600, color: 'var(--ara-noir)' }}>
                              {item.material?.materialName || 'Nguyên liệu'}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--ara-text-muted)' }}>
                              Mã: {item.material?.materialCode} · ĐVT: {item.material?.unit}
                              {item.material?.widthCm ? ` · Khổ: ${item.material.widthCm}cm` : ''}
                              {item.material?.gsm ? ` · GSM: ${item.material.gsm}` : ''}
                            </div>
                            {item.selectedRolls && item.selectedRolls.length > 0 && (
                              <div style={{ marginTop: '5px', display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.72rem', color: '#0369a1', fontWeight: 600 }}>
                                  🧵 {item.selectedRolls.length} cuộn giao đợt này:
                                </span>
                                {item.selectedRolls.map((r, rIdx) => (
                                  <span
                                    key={rIdx}
                                    style={{
                                      fontSize: '0.7rem',
                                      background: '#e0f2fe',
                                      color: '#0369a1',
                                      padding: '1px 5px',
                                      borderRadius: '3px',
                                      border: '1px solid #bae6fd',
                                    }}
                                  >
                                    {r.rollCode || `C-${rIdx + 1}`}: {r.lengthMeters}m {r.note ? `(${r.note})` : ''}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '0.8rem 0.9rem', fontWeight: 600 }}>
                            {item.plannedQty}
                          </td>
                          <td style={{ padding: '0.8rem 0.9rem' }}>
                            <input
                              type="number"
                              min="0"
                              value={item.actualVerifiedPassedQty}
                              onChange={(e) => handleItemVerifyChange(idx, 'actualVerifiedPassedQty', e.target.value)}
                              style={{
                                width: '100%',
                                padding: '0.4rem 0.5rem',
                                borderRadius: '4px',
                                border: '1px solid #10B981',
                                fontWeight: 700,
                                color: '#047857',
                                fontSize: '0.9rem',
                              }}
                            />
                          </td>
                          <td style={{ padding: '0.8rem 0.9rem' }}>
                            <input
                              type="number"
                              min="0"
                              value={item.actualDefectiveOrShortQty}
                              onChange={(e) => handleItemVerifyChange(idx, 'actualDefectiveOrShortQty', e.target.value)}
                              style={{
                                width: '100%',
                                padding: '0.4rem 0.5rem',
                                borderRadius: '4px',
                                border: '1px solid #EF4444',
                                fontWeight: 700,
                                color: '#B91C1C',
                                fontSize: '0.9rem',
                              }}
                            />
                          </td>
                          <td style={{ padding: '0.8rem 0.9rem' }}>
                            <input
                              type="text"
                              placeholder="Lệch màu, rách mép, loang sợi..."
                              value={item.defectReason}
                              onChange={(e) => handleItemVerifyChange(idx, 'defectReason', e.target.value)}
                              style={{
                                width: '100%',
                                padding: '0.4rem 0.5rem',
                                borderRadius: '4px',
                                border: '1px solid var(--ara-border)',
                                fontSize: '0.85rem',
                              }}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Conclusion & Deviation */}
              <div style={{
                background: isMatched ? '#F1F8F5' : '#FEF2F2',
                border: `1px solid ${isMatched ? '#A7F3D0' : '#FECACA'}`,
                borderRadius: 'var(--radius-sm)',
                padding: '1.1rem',
                marginBottom: '1.25rem',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.92rem', color: '#065F46' }}>
                    <input
                      type="radio"
                      name="matchingStatus"
                      checked={isMatched}
                      onChange={() => setIsMatched(true)}
                    />
                    <CheckCircle2 size={17} /> Khớp 100% với kế hoạch nhập
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.92rem', color: '#991B1B', marginLeft: '1rem' }}>
                    <input
                      type="radio"
                      name="matchingStatus"
                      checked={!isMatched}
                      onChange={() => setIsMatched(false)}
                    />
                    <AlertTriangle size={17} /> Có sai lệch (thiếu hàng, lỗi ngoại quan)
                  </label>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--ara-noir)', marginBottom: '0.35rem' }}>
                    Ghi chú kết luận KCS {!isMatched ? <span style={{ color: '#DC2626' }}>* (bắt buộc nhập khi có sai lệch)</span> : <span style={{ color: 'var(--ara-text-muted)', fontWeight: 400 }}>(tùy chọn)</span>}:
                  </label>
                  <textarea
                    rows={3}
                    placeholder={!isMatched ? "Yêu cầu nhập cụ thể nguyên nhân sai lệch, số lượng thiếu/lỗi, kết quả kiểm định..." : "Nhập ghi chú thêm nếu cần..."}
                    value={deviationSummary}
                    onChange={(e) => setDeviationSummary(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.55rem 0.75rem',
                      borderRadius: 'var(--radius-sm)',
                      border: !isMatched && !deviationSummary.trim() ? '2px solid #EF4444' : '1px solid var(--ara-border)',
                      fontSize: '0.88rem',
                      resize: 'vertical',
                      outline: 'none',
                    }}
                  />
                  {!isMatched && !deviationSummary.trim() && (
                    <div style={{ color: '#DC2626', fontSize: '0.78rem', marginTop: '0.3rem', fontWeight: 500 }}>
                      * Bắt buộc nhập chi tiết sai lệch KCS trước khi lưu.
                    </div>
                  )}
                </div>
              </div>

              {/* Auto Create MaterialTicket Checkbox */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <input
                  type="checkbox"
                  id="autoCreateTicketCheckbox"
                  checked={createInboundRequest}
                  onChange={(e) => setCreateInboundRequest(e.target.checked)}
                />
                <label htmlFor="autoCreateTicketCheckbox" style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--ara-noir)', cursor: 'pointer' }}>
                  Tự động sinh Phiếu yêu cầu nhập kho gửi Quản lý kho (chỉ nhập số lượng thực đạt KCS)
                </label>
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '1rem 1.5rem',
              borderTop: '1px solid var(--ara-border)',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '0.75rem',
              background: 'var(--ara-bg-surface)',
            }}>
              <button
                type="button"
                className="btn-ara-secondary"
                onClick={() => {
                  setSelectedPlan(null);
                  setSelectedBatch(null);
                }}
                disabled={actionLoading}
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                className={isMatched ? "btn-ara-primary" : "btn-ara-secondary"}
                onClick={submitVerification}
                disabled={actionLoading}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  background: !isMatched ? '#DC2626' : undefined,
                  color: !isMatched ? '#FFFFFF' : undefined,
                  borderColor: !isMatched ? '#B91C1C' : undefined,
                }}
              >
                {actionLoading ? (
                  <RefreshCw size={16} className="spinning" />
                ) : (
                  <Send size={16} />
                )}
                {isMatched
                  ? 'Xác nhận KCS & Gửi yêu cầu nhập kho tới QL Kho'
                  : createInboundRequest
                    ? 'Lưu biên bản sai lệch & Gửi phần đạt KCS tới QL Kho'
                    : 'Lưu biên bản sai lệch KCS (Từ chối nhập kho)'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: CREATE DIRECT MATERIAL INBOUND REQUEST                          */}
      {/* ========================================================================= */}
      {showDirectModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '1rem',
        }}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: 'var(--radius-md)',
            width: '100%',
            maxWidth: '840px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: 'var(--ara-shadow-lg)',
            overflow: 'hidden',
          }}>
            <div style={{
              padding: '1.25rem 1.5rem',
              borderBottom: '1px solid var(--ara-border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: 'var(--ara-bg-surface)',
            }}>
              <h2 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--ara-noir)', margin: 0 }}>
                Tạo Yêu Cầu Nhập Kho Nguyên Phụ Liệu (Gửi Quản Lý Kho)
              </h2>
              <button
                type="button"
                onClick={() => setShowDirectModal(false)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--ara-text-muted)' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                    Nhà cung cấp <span style={{ color: '#DC2626' }}>*</span>
                  </label>
                  <select
                    value={directForm.supplierId}
                    onChange={(e) => setDirectForm({ ...directForm, supplierId: e.target.value })}
                    style={{ width: '100%', padding: '0.55rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--ara-border)', fontSize: '0.9rem' }}
                  >
                    <option value="">-- Chọn Nhà cung cấp --</option>
                    {options.suppliers?.map((s) => (
                      <option key={s._id} value={s._id}>
                        {s.supplierName} ({s.supplierCode})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                    Hợp đồng kinh tế (tùy chọn)
                  </label>
                  <select
                    value={directForm.contractId}
                    onChange={(e) => setDirectForm({ ...directForm, contractId: e.target.value })}
                    style={{ width: '100%', padding: '0.55rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--ara-border)', fontSize: '0.9rem' }}
                  >
                    <option value="">-- Không theo hợp đồng / Trực tiếp --</option>
                    {options.contracts?.map((c) => (
                      <option key={c._id} value={c._id}>
                        {c.contractCode} - {c.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                    Số phiếu giao hàng NCC (nếu có)
                  </label>
                  <input
                    type="text"
                    placeholder="Mã phiếu giao NCC..."
                    value={directForm.supplierDeliveryCode}
                    onChange={(e) => setDirectForm({ ...directForm, supplierDeliveryCode: e.target.value })}
                    style={{ width: '100%', padding: '0.55rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--ara-border)', fontSize: '0.9rem' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                    Ghi chú / Biên bản bàn giao KCS
                  </label>
                  <input
                    type="text"
                    placeholder="Ghi chú giao nhận..."
                    value={directForm.note}
                    onChange={(e) => setDirectForm({ ...directForm, note: e.target.value })}
                    style={{ width: '100%', padding: '0.55rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--ara-border)', fontSize: '0.9rem' }}
                  />
                </div>
              </div>

              {/* Items */}
              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0 }}>Danh sách nguyên phụ liệu nghiệm thu</h3>
                  <button
                    type="button"
                    className="btn-ara-secondary"
                    onClick={() => setDirectForm({
                      ...directForm,
                      items: [...directForm.items, { rawMaterialId: '', acceptedQty: 1, rejectedQty: 0, defectReason: '' }],
                    })}
                    style={{ fontSize: '0.78rem', padding: '0.3rem 0.6rem' }}
                  >
                    + Thêm dòng
                  </button>
                </div>

                <div style={{ border: '1px solid var(--ara-border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ background: 'var(--ara-bg-surface)', borderBottom: '1px solid var(--ara-border)' }}>
                        <th style={{ padding: '0.6rem 0.8rem', textAlign: 'left' }}>Nguyên phụ liệu</th>
                        <th style={{ padding: '0.6rem 0.8rem', width: '110px' }}>Số lượng ĐẠT</th>
                        <th style={{ padding: '0.6rem 0.8rem', width: '110px' }}>Số lượng LỖI</th>
                        <th style={{ padding: '0.6rem 0.8rem' }}>Lý do lỗi</th>
                        <th style={{ padding: '0.6rem 0.8rem', width: '50px' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {directForm.items.map((row, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--ara-border-subtle)' }}>
                          <td style={{ padding: '0.6rem 0.8rem' }}>
                            <select
                              value={row.rawMaterialId}
                              onChange={(e) => {
                                const items = [...directForm.items];
                                items[idx].rawMaterialId = e.target.value;
                                setDirectForm({ ...directForm, items });
                              }}
                              style={{ width: '100%', padding: '0.4rem', borderRadius: '4px', border: '1px solid var(--ara-border)', fontSize: '0.85rem' }}
                            >
                              <option value="">-- Chọn vật tư --</option>
                              {options.materials?.map((m) => (
                                <option key={m._id} value={m._id}>
                                  {m.materialName} ({m.materialCode}) - ĐVT: {m.unit}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td style={{ padding: '0.6rem 0.8rem' }}>
                            <input
                              type="number"
                              min="0"
                              value={row.acceptedQty}
                              onChange={(e) => {
                                const items = [...directForm.items];
                                items[idx].acceptedQty = e.target.value;
                                setDirectForm({ ...directForm, items });
                              }}
                              style={{ width: '100%', padding: '0.4rem', borderRadius: '4px', border: '1px solid #10B981', color: '#047857', fontWeight: 600 }}
                            />
                          </td>
                          <td style={{ padding: '0.6rem 0.8rem' }}>
                            <input
                              type="number"
                              min="0"
                              value={row.rejectedQty}
                              onChange={(e) => {
                                const items = [...directForm.items];
                                items[idx].rejectedQty = e.target.value;
                                setDirectForm({ ...directForm, items });
                              }}
                              style={{ width: '100%', padding: '0.4rem', borderRadius: '4px', border: '1px solid #EF4444', color: '#B91C1C', fontWeight: 600 }}
                            />
                          </td>
                          <td style={{ padding: '0.6rem 0.8rem' }}>
                            <input
                              type="text"
                              placeholder="Lý do lỗi..."
                              value={row.defectReason}
                              onChange={(e) => {
                                const items = [...directForm.items];
                                items[idx].defectReason = e.target.value;
                                setDirectForm({ ...directForm, items });
                              }}
                              style={{ width: '100%', padding: '0.4rem', borderRadius: '4px', border: '1px solid var(--ara-border)', fontSize: '0.85rem' }}
                            />
                          </td>
                          <td style={{ padding: '0.6rem 0.8rem', textAlign: 'center' }}>
                            {directForm.items.length > 1 && (
                              <button
                                type="button"
                                onClick={() => {
                                  const items = directForm.items.filter((_, i) => i !== idx);
                                  setDirectForm({ ...directForm, items });
                                }}
                                style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer' }}
                              >
                                <X size={16} />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div style={{
              padding: '1rem 1.5rem',
              borderTop: '1px solid var(--ara-border)',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '0.75rem',
              background: 'var(--ara-bg-surface)',
            }}>
              <button
                type="button"
                className="btn-ara-secondary"
                onClick={() => setShowDirectModal(false)}
                disabled={actionLoading}
              >
                Hủy
              </button>
              <button
                type="button"
                className="btn-ara-primary"
                onClick={submitDirectRequest}
                disabled={actionLoading}
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
              >
                {actionLoading ? <RefreshCw size={15} className="spinning" /> : <Send size={15} />}
                Gửi Yêu Cầu Nhập Kho Tới Quản Lý Kho
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
