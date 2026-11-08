import React, { useState, useEffect, useMemo } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Search,
  Filter,
  RefreshCw,
  Eye,
  FileText,
  Building2,
  Calendar,
  AlertCircle,
  X,
  ShieldAlert,
  ArrowRight,
  ExternalLink,
  Wrench,
  Check,
  Info,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import accountantProcurementApi from '../../services/accountantProcurementApi';

const ACTION_LABELS = {
  SUPPLIER_RE_DELIVERY: 'Nhà cung cấp giao bù số lượng',
  CONTRACT_PENALTY: 'Lập biên bản phạt hợp đồng',
  DEBT_DEDUCTION: 'Khấu trừ công nợ phải trả',
  RETURN_GOODS: 'Trả lại toàn bộ đợt hàng',
  ACCEPT_PARTIAL: 'Chấp nhận một phần & Điều chỉnh kế hoạch',
  OTHER: 'Phương án thỏa thuận khác',
};

const ContractDeviationPage = () => {
  const [deviations, setDeviations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL'); // ALL | UNRESOLVED | RESOLVED
  const [sortBy, setSortBy] = useState('NEWEST'); // 'NEWEST' (Mặc định: Mới -> Cũ) | 'OLDEST'

  // Modals
  const [selectedForResolve, setSelectedForResolve] = useState(null);
  const [selectedForViewDetail, setSelectedForViewDetail] = useState(null);

  // Resolve Form
  const [resolveForm, setResolveForm] = useState({
    actionTaken: 'SUPPLIER_RE_DELIVERY',
    resolutionNotes: '',
    batchNumber: null,
  });
  const [resolveErrors, setResolveErrors] = useState({});

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await accountantProcurementApi.getContractDeviations();
      setDeviations(data || []);
    } catch (err) {
      console.error('Lỗi tải danh sách sai lệch:', err);
      setFeedback({
        type: 'error',
        text: err.response?.data?.message || 'Không thể tải danh sách sai lệch hợp đồng.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filtered List
  const filteredDeviations = useMemo(() => {
    return (deviations || []).filter((item) => {
      const q = searchTerm.trim().toLowerCase();
      const matchSearch =
        !q ||
        (item.planCode || '').toLowerCase().includes(q) ||
        (item.contractId?.contractCode || '').toLowerCase().includes(q) ||
        (item.supplierId?.supplierName || '').toLowerCase().includes(q) ||
        (item.technicianVerification?.deviationSummary || '').toLowerCase().includes(q);

      const isResolved =
        item.deviationResolution?.status === 'RESOLVED' ||
        item.status === 'DEVIATION_RESOLVED';

      let matchStatus = true;
      if (statusFilter === 'UNRESOLVED') {
        matchStatus = !isResolved;
      } else if (statusFilter === 'RESOLVED') {
        matchStatus = isResolved;
      }

      return matchSearch && matchStatus;
    });

    // Mặc định: Mới nhất -> Cũ nhất (NEWEST)
    return list.sort((a, b) => {
      const timeA = new Date(a.technicianVerification?.verifiedAt || a.updatedAt || a.createdAt || 0).getTime();
      const timeB = new Date(b.technicianVerification?.verifiedAt || b.updatedAt || b.createdAt || 0).getTime();
      if (sortBy === 'OLDEST') {
        return timeA - timeB;
      }
      return timeB - timeA;
    });
  }, [deviations, searchTerm, statusFilter, sortBy]);

  // Statistics
  const stats = useMemo(() => {
    const total = deviations.length;
    let unresolved = 0;
    let resolved = 0;

    deviations.forEach((d) => {
      const isResolved =
        d.deviationResolution?.status === 'RESOLVED' ||
        d.status === 'DEVIATION_RESOLVED';
      if (isResolved) resolved++;
      else unresolved++;
    });

    return { total, unresolved, resolved };
  }, [deviations]);

  const handleOpenResolveModal = (item) => {
    setSelectedForResolve(item);
    setResolveErrors({});
    setResolveForm({
      actionTaken: item.deviationResolution?.actionTaken || 'SUPPLIER_RE_DELIVERY',
      resolutionNotes: item.deviationResolution?.resolutionNotes || '',
      batchNumber: item.batchNumber || null,
    });
  };

  const handleConfirmResolve = async (e) => {
    e.preventDefault();
    if (!resolveForm.resolutionNotes || !resolveForm.resolutionNotes.trim()) {
      setResolveErrors({
        resolutionNotes: 'Vui lòng nhập ghi chú mô tả phương án đã xử lý sai lệch.',
      });
      return;
    }
    if (resolveForm.resolutionNotes.trim().length < 5) {
      setResolveErrors({
        resolutionNotes: 'Ghi chú xử lý phải có độ dài tối thiểu 5 ký tự.',
      });
      return;
    }

    try {
      setSubmitting(true);
      const res = await accountantProcurementApi.resolveContractDeviation(
        selectedForResolve._id,
        {
          resolutionNotes: resolveForm.resolutionNotes.trim(),
          actionTaken: resolveForm.actionTaken,
          batchNumber: resolveForm.batchNumber,
        }
      );

      setFeedback({
        type: 'success',
        text: res.message || 'Đã xác nhận xử lý sai lệch thành công.',
      });
      setSelectedForResolve(null);
      await loadData();
    } catch (err) {
      console.error('Lỗi xử lý sai lệch:', err);
      setFeedback({
        type: 'error',
        text: err.response?.data?.message || 'Có lỗi xảy ra khi xác nhận xử lý sai lệch.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '—';
    try {
      const d = new Date(dateString);
      if (Number.isNaN(d.getTime())) return '—';
      return d.toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    } catch {
      return '—';
    }
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return '—';
    try {
      const d = new Date(dateString);
      if (Number.isNaN(d.getTime())) return '—';
      return `${d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} ${d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;
    } catch {
      return '—';
    }
  };

  return (
    <div>
      {/* Header */}
      <section className="wms-page-header">
        <div>
          <h1 className="wms-page-title">Xử lý Sai lệch Hợp đồng Mua sắm</h1>
          <p className="wms-page-subtitle">
            Tiếp nhận cảnh báo từ Kỹ thuật viên may (Garment Technician) về các đợt giao nhận sai kế hoạch, thực hiện xử lý sai lệch và cập nhật trạng thái đã giải quyết.
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
          <Link to="/accountant/inbound-plans" className="wms-btn wms-btn-primary">
            <Calendar size={16} />
            Kế hoạch lịch trình nhập
          </Link>
        </div>
      </section>

      {/* Feedback Banner */}
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

      {/* KPI Strip */}
      <section className="wms-kpi-strip" aria-label="Thống kê sai lệch hợp đồng">
        <div className="wms-kpi-card">
          <span className="wms-kpi-label">Tổng đợt giao sai kế hoạch</span>
          <span className="wms-kpi-value">{stats.total} đợt</span>
          <span className="wms-kpi-meta">Được Garment Technician báo về</span>
        </div>

        <div className="wms-kpi-card">
          <span className="wms-kpi-label">Chưa xử lý (Cần xử lý)</span>
          <span className="wms-kpi-value" style={{ color: '#E11D48' }}>
            {stats.unresolved} đợt
          </span>
          <span className="wms-kpi-meta">Đang chờ Kế toán xác nhận giải pháp</span>
        </div>

        <div className="wms-kpi-card">
          <span className="wms-kpi-label">Đã xử lý sai lệch</span>
          <span className="wms-kpi-value" style={{ color: '#16A34A' }}>
            {stats.resolved} đợt
          </span>
          <span className="wms-kpi-meta">Đã ghi nhận phương án và biên bản</span>
        </div>
      </section>

      {/* Filter Bar */}
      <section className="wms-filter-bar" aria-label="Bộ lọc sai lệch">
        <div className="wms-filter-group">
          <div className="wms-filter-field search-wide">
            <label htmlFor="dev-search" className="wms-label">
              Tìm kiếm Kế hoạch / Số Hợp đồng / Nhà cung ứng
            </label>
            <input
              id="dev-search"
              type="search"
              className="wms-input"
              placeholder="Nhập mã kế hoạch KH-NHAP-..., mã HDK-2026-..., tên NCC..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="wms-filter-field">
            <label htmlFor="dev-status-filter" className="wms-label">
              Trạng thái Xử lý Sai lệch
            </label>
            <select
              id="dev-status-filter"
              className="wms-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="ALL">Tất cả trạng thái</option>
              <option value="UNRESOLVED">Chưa xử lý ({stats.unresolved})</option>
              <option value="RESOLVED">Đã xử lý ({stats.resolved})</option>
            </select>
          </div>

          <div className="wms-filter-field">
            <label htmlFor="dev-sort-filter" className="wms-label">
              Thứ tự hiển thị
            </label>
            <select
              id="dev-sort-filter"
              className="wms-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="NEWEST">Mới nhất trước (Mới → Cũ)</option>
              <option value="OLDEST">Cũ nhất trước (Cũ → Mới)</option>
            </select>
          </div>
        </div>
      </section>

      {/* Data Table */}
      <section className="wms-table-card" aria-label="Bảng danh sách đợt giao sai kế hoạch">
        {loading ? (
          <div className="wms-loading-state">
            <RefreshCw size={24} className="wms-spin" />
            <p>Đang tải danh sách đợt giao sai kế hoạch...</p>
          </div>
        ) : filteredDeviations.length === 0 ? (
          <div className="wms-empty-state">
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: 'var(--wms-primary-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
                color: 'var(--wms-accent)',
              }}
            >
              <CheckCircle2 size={32} />
            </div>
            <p className="wms-empty-title">Không có sai lệch nào</p>
            <p className="wms-empty-desc">
              {deviations.length === 0
                ? 'Hiện chưa có đợt giao hàng nào bị Garment Technician ghi nhận sai kế hoạch.'
                : 'Không tìm thấy đợt giao sai lệch phù hợp với bộ lọc hiện tại.'}
            </p>
          </div>
        ) : (
          <div className="wms-table-scroll no-horizontal-scroll">
            <table className="wms-table wms-table-responsive-fit">
              <colgroup>
                <col style={{ width: '20%' }} />
                <col style={{ width: '18%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '28%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '10%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Mã Kế hoạch & Hợp đồng</th>
                  <th>Nhà cung ứng</th>
                  <th>Lịch giao dự kiến</th>
                  <th>Nội dung sai lệch KCS</th>
                  <th style={{ textAlign: 'center' }}>Trạng thái xử lý</th>
                  <th style={{ textAlign: 'center' }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filteredDeviations.map((item) => {
                  const isResolved =
                    item.deviationResolution?.status === 'RESOLVED' ||
                    item.status === 'DEVIATION_RESOLVED';
                  const verification = item.technicianVerification;
                  const resolution = item.deviationResolution;

                  return (
                    <tr key={item._id} className="wms-interactive-row">
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span className="wms-code-pill" style={{ fontWeight: 700 }}>
                            {item.planCode}
                          </span>
                          <span
                            className="wms-badge-batch"
                            style={{
                              fontSize: '11px',
                              padding: '1px 6px',
                              background: '#0284c7',
                              color: '#FFFFFF',
                            }}
                          >
                            v{item.versionNumber || 1}
                          </span>
                        </div>
                        <div
                          className="wms-helper-text"
                          style={{ fontSize: '11.5px', marginTop: '3px' }}
                        >
                          HĐ:{' '}
                          <span style={{ fontWeight: 600, color: 'var(--wms-text-primary)' }}>
                            {item.contractId?.contractCode || '—'}
                          </span>
                        </div>
                      </td>

                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--wms-text-primary)' }}>
                          {item.supplierId?.supplierName || '—'}
                        </div>
                        <div className="wms-helper-text" style={{ fontSize: '11px' }}>
                          {item.supplierId?.supplierCode || ''}
                        </div>
                      </td>

                      <td>
                        <div style={{ fontSize: '13px', fontWeight: 600 }}>
                          {formatDate(item.scheduledDeliveryDate)}
                        </div>
                        <div className="wms-helper-text" style={{ fontSize: '11px' }}>
                          {item.batches?.length > 1
                            ? `${item.batches.length} đợt giao`
                            : '1 đợt giao'}
                        </div>
                      </td>

                      <td>
                        <div
                          style={{
                            color: '#BE123C',
                            fontSize: '12.5px',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '4px',
                          }}
                        >
                          <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: '2px' }} />
                          <span>
                            {verification?.deviationSummary || 'Giao nhận không đúng kế hoạch cam kết.'}
                          </span>
                        </div>
                        <div
                          className="wms-helper-text"
                          style={{ fontSize: '11px', marginTop: '2px' }}
                        >
                          KTV kiểm tra: {verification?.verifiedByTechId?.fullName || 'Garment Technician'} •{' '}
                          {formatDateTime(verification?.verifiedAt)}
                        </div>
                      </td>

                      <td style={{ textAlign: 'center' }}>
                        {isResolved ? (
                          <span
                            className="wms-status-badge wms-status-verified"
                            style={{ background: '#DCFCE7', color: '#15803D' }}
                            title={resolution?.resolutionNotes}
                          >
                            <Check size={12} style={{ marginRight: '3px' }} /> Đã xử lý
                          </span>
                        ) : (
                          <span
                            className="wms-status-badge wms-status-rejected"
                            style={{ background: '#FEE2E2', color: '#B91C1C' }}
                          >
                            <Clock size={12} style={{ marginRight: '3px' }} /> Chưa xử lý
                          </span>
                        )}
                      </td>

                      <td style={{ textAlign: 'center' }}>
                        <div className="wms-action-cell" style={{ justifyContent: 'center', gap: '6px' }}>
                          {!isResolved ? (
                            <button
                              type="button"
                              className="wms-btn wms-btn-primary wms-btn-sm"
                              onClick={() => handleOpenResolveModal(item)}
                              title="Ghi nhận phương án xử lý sai lệch cho đợt giao này"
                            >
                              <Wrench size={13} />
                              <span>Xử lý</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="wms-btn wms-btn-default wms-btn-sm"
                              onClick={() => setSelectedForViewDetail(item)}
                              title="Xem chi tiết ghi chú mô tả đã xử lý"
                            >
                              <Eye size={13} />
                              <span>Xem ghi chú</span>
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
        )}
      </section>

      {/* Modal 1: Xử lý sai lệch (Ghi chú mô tả đã xử lý như thế nào) */}
      {selectedForResolve && (
        <div className="wms-modal-backdrop" role="dialog" aria-modal="true">
          <div className="wms-modal-dialog" style={{ maxWidth: '640px' }}>
            <div className="wms-modal-header">
              <div>
                <h2 className="wms-modal-title">
                  Xử lý Sai lệch Giao nhận: {selectedForResolve.planCode}
                </h2>
                <div className="wms-helper-text" style={{ fontSize: '12px' }}>
                  Hợp đồng: <strong>{selectedForResolve.contractId?.contractCode || '—'}</strong> •{' '}
                  NCC: <strong>{selectedForResolve.supplierId?.supplierName || '—'}</strong>
                </div>
              </div>
              <button
                type="button"
                className="wms-btn wms-btn-default wms-btn-sm"
                onClick={() => setSelectedForResolve(null)}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleConfirmResolve}>
              <div className="wms-modal-body">
                {/* Thông tin phản ánh từ Garment Technician */}
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: '8px',
                    background: '#FFF1F2',
                    border: '1px solid #FECDD3',
                    marginBottom: '16px',
                  }}
                >
                  <div
                    style={{
                      fontSize: '12.5px',
                      fontWeight: 700,
                      color: '#9F1239',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      marginBottom: '4px',
                    }}
                  >
                    <AlertTriangle size={15} />
                    Nội dung Kỹ thuật viên may (Garment Technician) ghi nhận:
                  </div>
                  <div style={{ fontSize: '13px', color: '#881337', lineHeight: 1.5 }}>
                    {selectedForResolve.technicianVerification?.deviationSummary ||
                      'Giao nhận không đúng số lượng hoặc chủng loại cam kết theo kế hoạch.'}
                  </div>
                  <div
                    style={{
                      fontSize: '11px',
                      color: '#9F1239',
                      marginTop: '6px',
                      opacity: 0.85,
                    }}
                  >
                    Thời gian kiểm: {formatDateTime(selectedForResolve.technicianVerification?.verifiedAt)} • KTV: {selectedForResolve.technicianVerification?.verifiedByTechId?.fullName || 'Kỹ thuật may KCS'}
                  </div>
                </div>

                {/* Chọn phương án xử lý */}
                <div className="wms-field" style={{ marginBottom: '14px' }}>
                  <label className="wms-label">
                    Phương án xử lý sai lệch <span className="wms-required">*</span>
                  </label>
                  <select
                    className="wms-select"
                    value={resolveForm.actionTaken}
                    onChange={(e) =>
                      setResolveForm((prev) => ({ ...prev, actionTaken: e.target.value }))
                    }
                  >
                    {Object.entries(ACTION_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Textarea: Ghi chú mô tả đã xử lý như thế nào */}
                <div
                  className={`wms-field ${resolveErrors.resolutionNotes ? 'has-error' : ''}`}
                  style={{ marginBottom: '10px' }}
                >
                  <label htmlFor="res-notes" className="wms-label">
                    Ghi chú mô tả đã xử lý như thế nào <span className="wms-required">*</span>
                  </label>
                  <textarea
                    id="res-notes"
                    className="wms-textarea"
                    rows={4}
                    placeholder="Mô tả cụ thể giải pháp đã xử lý (Ví dụ: Đã liên hệ NCC yêu cầu giao bổ sung 300m còn thiếu vào ngày mai; NCC đã ký biên bản cam kết phạt 5% giá trị đợt hàng theo điều khoản hợp đồng...)"
                    value={resolveForm.resolutionNotes}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (resolveErrors.resolutionNotes) {
                        setResolveErrors((prev) => {
                          const next = { ...prev };
                          delete next.resolutionNotes;
                          return next;
                        });
                      }
                      setResolveForm((prev) => ({ ...prev, resolutionNotes: val }));
                    }}
                    autoFocus
                    required
                  />
                  {resolveErrors.resolutionNotes && (
                    <span className="wms-field-error-text">
                      <AlertCircle size={12} /> {resolveErrors.resolutionNotes}
                    </span>
                  )}
                  <span className="wms-helper-text" style={{ fontSize: '11.5px', marginTop: '4px' }}>
                    Ghi chú này sẽ được lưu cố định vào biên bản kiểm toán để đối soát công nợ và lưu vết xử lý sai lệch hợp đồng.
                  </span>
                </div>
              </div>

              <div className="wms-modal-footer">
                <button
                  type="button"
                  className="wms-btn wms-btn-default"
                  onClick={() => setSelectedForResolve(null)}
                  disabled={submitting}
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="wms-btn wms-btn-primary"
                  disabled={submitting}
                >
                  {submitting ? 'Đang xác nhận...' : 'Xác nhận đã xử lý'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Xem chi tiết ghi chú đã xử lý */}
      {selectedForViewDetail && (
        <div className="wms-modal-backdrop" role="dialog" aria-modal="true">
          <div className="wms-modal-dialog" style={{ maxWidth: '600px' }}>
            <div className="wms-modal-header">
              <div>
                <h2 className="wms-modal-title">
                  Biên bản Đã Xử lý Sai lệch: {selectedForViewDetail.planCode}
                </h2>
                <div className="wms-helper-text" style={{ fontSize: '12px' }}>
                  Hợp đồng: <strong>{selectedForViewDetail.contractId?.contractCode || '—'}</strong>
                </div>
              </div>
              <button
                type="button"
                className="wms-btn wms-btn-default wms-btn-sm"
                onClick={() => setSelectedForViewDetail(null)}
              >
                <X size={16} />
              </button>
            </div>

            <div className="wms-modal-body">
              {/* Phản ánh của Kỹ thuật may */}
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: '8px',
                  background: '#FFF1F2',
                  border: '1px solid #FECDD3',
                  marginBottom: '16px',
                }}
              >
                <div
                  style={{
                    fontSize: '12.5px',
                    fontWeight: 700,
                    color: '#9F1239',
                    marginBottom: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <AlertTriangle size={14} />
                  Kỹ thuật viên may ghi nhận sai lệch:
                </div>
                <div style={{ fontSize: '13px', color: '#881337' }}>
                  {selectedForViewDetail.technicianVerification?.deviationSummary ||
                    'Giao nhận không đúng kế hoạch.'}
                </div>
                <div style={{ fontSize: '11px', color: '#9F1239', marginTop: '4px' }}>
                  Kiểm tra lúc: {formatDateTime(selectedForViewDetail.technicianVerification?.verifiedAt)} • KTV: {selectedForViewDetail.technicianVerification?.verifiedByTechId?.fullName || 'Garment Technician'}
                </div>
              </div>

              {/* Kết quả xử lý của Kế toán */}
              <div
                style={{
                  padding: '14px',
                  borderRadius: '8px',
                  background: '#F0FDF4',
                  border: '1px solid #BBF7D0',
                }}
              >
                <div
                  style={{
                    fontSize: '13px',
                    fontWeight: 700,
                    color: '#166534',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    marginBottom: '8px',
                  }}
                >
                  <CheckCircle2 size={16} color="#16A34A" />
                  Kết quả xử lý của Kế toán (Đã xử lý):
                </div>

                <div className="wms-detail-item" style={{ marginBottom: '6px' }}>
                  <span className="wms-detail-label">Phương án:</span>
                  <span className="wms-detail-value" style={{ fontWeight: 600 }}>
                    {ACTION_LABELS[selectedForViewDetail.deviationResolution?.actionTaken] ||
                      selectedForViewDetail.deviationResolution?.actionTaken ||
                      'Thỏa thuận xử lý'}
                  </span>
                </div>

                <div className="wms-detail-item" style={{ marginBottom: '6px' }}>
                  <span className="wms-detail-label">Ghi chú mô tả đã xử lý:</span>
                  <span
                    className="wms-detail-value"
                    style={{ fontWeight: 600, color: '#15803D', lineHeight: 1.5 }}
                  >
                    {selectedForViewDetail.deviationResolution?.resolutionNotes || '—'}
                  </span>
                </div>

                <div className="wms-detail-item">
                  <span className="wms-detail-label">Người xử lý & Thời gian:</span>
                  <span className="wms-detail-value" style={{ fontSize: '12px' }}>
                    {selectedForViewDetail.deviationResolution?.resolvedByAccountantId?.fullName ||
                      'Kế toán Kho & Tài chính'}{' '}
                    • {formatDateTime(selectedForViewDetail.deviationResolution?.resolvedAt)}
                  </span>
                </div>
              </div>
            </div>

            <div className="wms-modal-footer">
              <button
                type="button"
                className="wms-btn wms-btn-default"
                onClick={() => setSelectedForViewDetail(null)}
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

export default ContractDeviationPage;

