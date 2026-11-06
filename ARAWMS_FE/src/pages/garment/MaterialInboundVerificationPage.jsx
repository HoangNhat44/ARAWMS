/*
 * File: MaterialInboundVerificationPage.jsx
 * Role: GARMENT_TECHNICIAN (Kỹ thuật viên may / KCS)
 * Description: Ghi nhận kế hoạch nhập nguyên phụ liệu từ kế toán, đối soát số lượng và nghiệm thu KCS ngoại quan/vật lý, sau đó tạo phiếu yêu cầu nhập kho gửi Quản lý kho duyệt.
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

  // Options for dropdowns
  const [options, setOptions] = useState({
    suppliers: [],
    materials: [],
    contracts: [],
    locations: [],
  });

  // Modal: Verify Plan
  const [selectedPlan, setSelectedPlan] = useState(null);
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

  // Open Verify Modal
  const openVerifyModal = (plan) => {
    setSelectedPlan(plan);
    setSupplierDeliveryCode('');
    setIsMatched(plan.technicianVerification?.isMatchedWithPlan ?? true);
    setDeviationSummary(plan.technicianVerification?.deviationSummary || '');
    setCreateInboundRequest(true);

    // Populate verification items
    const items = (plan.expectedItems || []).map((item) => ({
      rawMaterialId: item.rawMaterialId?._id || item.rawMaterialId,
      material: item.rawMaterialId,
      plannedQty: item.plannedQty,
      actualVerifiedPassedQty: item.actualVerifiedPassedQty > 0 ? item.actualVerifiedPassedQty : item.plannedQty,
      actualDefectiveOrShortQty: item.actualDefectiveOrShortQty || 0,
      defectReason: '',
    }));
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
      showAlert(
        'success',
        isMatched
          ? `Đã nghiệm thu KCS thành công và gửi Phiếu yêu cầu nhập kho (${res?.data?.ticket?.ticketCode || 'PNNL'}) tới Quản lý kho!`
          : `Đã ghi nhận báo cáo sai lệch KCS cho kế hoạch ${selectedPlan.planCode}!`
      );
      setSelectedPlan(null);
      fetchData();
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
          <p style={{ color: 'var(--ara-text-muted)', fontSize: '0.92rem', margin: '0.35rem 0 0', maxWidth: '820px' }}>
            Tiếp nhận kế hoạch giao hàng từ Kế toán, kiểm định KCS thực tế tại cửa kho, đối chiếu sai lệch và lập phiếu yêu cầu nhập kho gửi Quản lý kho duyệt.
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
            placeholder={activeTab === 'PLANS' ? "Tìm theo mã kế hoạch, ghi chú..." : "Tìm mã phiếu, vận đơn..."}
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
                <option value="SCHEDULED">Chờ nghiệm thu (SCHEDULED)</option>
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
                  <th style={{ padding: '0.9rem 1.1rem' }}>Mã Kế Hoạch</th>
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
                    const isPending = plan.status === 'SCHEDULED' || plan.status === 'IN_INSPECTION';
                    const isMatchedPlan = plan.status === 'VERIFIED_MATCHED';
                    const isDeviation = plan.status === 'DEVIATION_REPORTED';

                    return (
                      <tr key={plan._id} style={{ borderBottom: '1px solid var(--ara-border-subtle)', transition: 'background 0.2s' }}>
                        <td style={{ padding: '1rem 1.1rem', fontWeight: 700, color: 'var(--ara-noir)' }}>
                          <span style={{ fontFamily: 'monospace', fontSize: '0.95rem' }}>{plan.planCode}</span>
                          {plan.deliveryNote && (
                            <div style={{ fontSize: '0.75rem', color: 'var(--ara-text-muted)', fontWeight: 400, marginTop: '2px' }}>
                              {plan.deliveryNote}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '1rem 1.1rem' }}>
                          <div style={{ fontWeight: 600, color: 'var(--ara-noir)' }}>
                            {plan.supplierId?.supplierName || 'NCC không xác định'}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--ara-text-muted)' }}>
                            {plan.supplierId?.supplierCode} {plan.supplierId?.phone ? `· ${plan.supplierId.phone}` : ''}
                          </div>
                        </td>
                        <td style={{ padding: '1rem 1.1rem' }}>
                          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--ara-gold)' }}>
                            {plan.contractId?.contractCode || '—'}
                          </span>
                        </td>
                        <td style={{ padding: '1rem 1.1rem' }}>
                          {plan.scheduledDeliveryDate ? (
                            <span>{new Date(plan.scheduledDeliveryDate).toLocaleDateString('vi-VN')}</span>
                          ) : (
                            <span style={{ color: 'var(--ara-text-light)' }}>Chưa hẹn</span>
                          )}
                        </td>
                        <td style={{ padding: '1rem 1.1rem' }}>
                          <span style={{ fontWeight: 600 }}>{plan.expectedItems?.length || 0}</span> mục
                        </td>
                        <td style={{ padding: '1rem 1.1rem', fontSize: '0.85rem' }}>
                          {plan.createdByAccountantId?.fullName || plan.createdByAccountantId?.username || 'Kế toán'}
                        </td>
                        <td style={{ padding: '1rem 1.1rem' }}>
                          {isPending && (
                            <span style={{ padding: '0.25rem 0.6rem', borderRadius: '4px', background: '#FEF3C7', color: '#92400E', fontSize: '0.78rem', fontWeight: 700 }}>
                              Chờ KCS nghiệm thu
                            </span>
                          )}
                          {isMatchedPlan && (
                            <span style={{ padding: '0.25rem 0.6rem', borderRadius: '4px', background: '#D1FAE5', color: '#065F46', fontSize: '0.78rem', fontWeight: 700 }}>
                              Đã khớp KCS
                            </span>
                          )}
                          {isDeviation && (
                            <span style={{ padding: '0.25rem 0.6rem', borderRadius: '4px', background: '#FEE2E2', color: '#991B1B', fontSize: '0.78rem', fontWeight: 700 }}>
                              Có sai lệch KCS
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '1rem 1.1rem', textAlign: 'right' }}>
                          <button
                            type="button"
                            className={isPending ? "btn-ara-primary" : "btn-ara-secondary"}
                            onClick={() => openVerifyModal(plan)}
                            style={{ fontSize: '0.82rem', padding: '0.4rem 0.8rem' }}
                          >
                            {isPending ? 'Nghiệm thu KCS & Gửi QL Kho' : 'Xem & Cập nhật KCS'}
                          </button>
                        </td>
                      </tr>
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
                          <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{ticket.inboundPlanId.planCode}</span>
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
      {/* MODAL: VERIFY PLAN & SEND INBOUND REQUEST                                */}
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
                  Nghiệp vụ KCS Kiểm Định Thực Tế
                </div>
                <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--ara-noir)', margin: '0.2rem 0 0' }}>
                  Nghiệm Thu Kế Hoạch: {selectedPlan.planCode}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPlan(null)}
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
                  <span style={{ color: 'var(--ara-text-muted)', display: 'block', fontSize: '0.78rem' }}>Ngày hẹn giao</span>
                  <strong>{selectedPlan.scheduledDeliveryDate ? new Date(selectedPlan.scheduledDeliveryDate).toLocaleDateString('vi-VN') : '—'}</strong>
                </div>
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
                onClick={() => setSelectedPlan(null)}
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
      {/* MODAL: CREATE DIRECT MATERIAL INBOUND REQUEST                             */}
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

