/*
 * File: SupplierInboundPage.jsx
 * Description: Redesigned Supplier Inbound Page following ARA ATELIER Design System
 * Design System: Editorial Luxury & Refined Beige + Enterprise WMS High-Contrast
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Package, RefreshCw, Plus, FileText, AlertCircle,
  CheckCircle2, Clock, XCircle, Search, Filter,
  Calendar, User, Box, TrendingUp, Archive
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { materialInboundService as api } from '../services/materialInboundService';
import DirectMaterialReceiptModal from '../components/DirectMaterialReceiptModal';
import LegacyMaterialReceiptForm from '../components/LegacyMaterialReceiptForm';
import RemnantReturnReview from '../components/RemnantReturnReview';
import '../styles/supplierInbound.css';

const statusConfig = {
  WAITING_RECEIPT: { label: 'Chờ nhập', color: '#9A5B06', bg: '#FEF0C7', border: '#F5B95F', icon: Clock },
  PARTIALLY_RECEIVED: { label: 'Đã nhập một phần', color: '#9A5B06', bg: '#FEF0C7', border: '#F5B95F', icon: Clock },
  DRAFT: { label: 'Bản nháp', color: '#6E5233', bg: '#EFE6DA', border: '#C8B9A6', icon: FileText },
  WAITING_QC: { label: 'Chờ kiểm tra', color: '#9A5B06', bg: '#FEF0C7', border: '#F5B95F', icon: AlertCircle },
  READY_TO_CONFIRM: { label: 'Chờ xác nhận', color: '#9A5B06', bg: '#FEF0C7', border: '#F5B95F', icon: Clock },
  COMPLETED: { label: 'Đã hoàn thiện', color: '#1E6B47', bg: '#E3F5EC', border: '#86CFA8', icon: CheckCircle2 },
  CANCELLED: { label: 'Đã hủy', color: '#A62626', bg: '#FCE4E4', border: '#EDA1A1', icon: XCircle }
};

const amount = (value) => Number(value || 0).toLocaleString('vi-VN', { maximumFractionDigits: 3 });

function StatusBadge({ status }) {
  const config = statusConfig[status] || statusConfig.DRAFT;
  const Icon = config.icon;
  return (
    <span
      className="wms-badge"
      style={{
        background: config.bg,
        color: config.color,
        border: `1px solid ${config.border}`,
        padding: '6px 10px',
        borderRadius: '6px',
        fontSize: '12px',
        fontWeight: '600',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px'
      }}
    >
      <Icon size={13} />
      {config.label}
    </span>
  );
}

export default function SupplierInboundPage() {
  const [searchParams] = useSearchParams();
  const requestedId = searchParams.get('request');
  const openedRequestId = useRef('');
  const { user } = useAuth();
  const optionCacheKey = `arawms-material-receipt-options:${user.id}`;

  const [options, setOptions] = useState({ suppliers: [], materials: [], locations: [] });
  const [requests, setRequests] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [target, setTarget] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [expandedRequest, setExpandedRequest] = useState(null);

  // Load options
  useEffect(() => {
    api.options().then((result) => {
      setOptions(result.data);
      localStorage.setItem(optionCacheKey, JSON.stringify(result.data));
    }).catch((failure) => {
      try {
        const cached = JSON.parse(localStorage.getItem(optionCacheKey) || 'null');
        if (cached) setOptions(cached);
        else setError(failure.message);
      } catch { setError(failure.message); }
    });
  }, [optionCacheKey]);

  // Load data
  const loadData = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const [requestResult, receiptPages] = await Promise.all([
        api.technicianRequests(),
        (async () => {
          const all = [];
          for (let page = 1; ; page++) {
            const batch = (await api.receipts({ page })).data.receipts;
            all.push(...batch);
            if (batch.length < 100) break;
          }
          return all;
        })()
      ]);
      setRequests(requestResult.data.requests);
      setReceipts(receiptPages);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData, refreshKey]);

  // Open the requested material workflow when arriving from the shared technician queue.
  useEffect(() => {
    if (!requestedId || openedRequestId.current === requestedId) return;
    const request = requests.find((item) => String(item._id) === requestedId);
    if (!request) return;
    openedRequestId.current = requestedId;
    if (['WAITING_RECEIPT', 'PARTIALLY_RECEIVED', 'DRAFT', 'WAITING_QC',
      'READY_TO_CONFIRM'].includes(request.status)) {
      setTarget({ kind: 'request', id: request._id, request });
    } else if (request.legacyCompleted) {
      setTarget({ kind: 'legacy', id: request._id });
    } else {
      const linked = receipts.filter((receipt) => String(receipt.inboundRequestId || '') === requestedId);
      if (linked.length === 1) setTarget({ kind: 'receipt', id: linked[0]._id });
      else setExpandedRequest(requestedId);
    }
  }, [requestedId, requests, receipts]);

  // Calculate KPIs
  const kpis = {
    totalRequests: requests.length,
    waitingReceipt: requests.filter(r => ['WAITING_RECEIPT', 'PARTIALLY_RECEIVED'].includes(r.status)).length,
    completed: requests.filter(r => r.status === 'COMPLETED').length,
    totalReceipts: receipts.length,
    pendingConfirm: receipts.filter(r => ['DRAFT', 'WAITING_QC', 'READY_TO_CONFIRM'].includes(r.status)).length
  };

  // Filter requests
  const filteredRequests = requests.filter(request => {
    if (filterStatus && request.status !== filterStatus) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        request.ticketCode?.toLowerCase().includes(query) ||
        request.requestedByTechnicianId?.fullName?.toLowerCase().includes(query) ||
        request.requestLines?.some(line =>
          line.rawMaterialId?.materialName?.toLowerCase().includes(query)
        )
      );
    }
    return true;
  });

  return (
    <div className="ara-acc-main-wrapper" style={{ background: '#E8DFD3' }}>
      <div className="wms-container">

        {/* PAGE HEADER */}
        <section className="wms-page-header">
          <div>
            <h1 className="wms-page-title">Nhập kho Nguyên Phụ Liệu</h1>
            <p className="wms-page-subtitle">
              Quản lý yêu cầu nhập hàng từ kỹ thuật viên may và tiếp nhận nguyên phụ liệu từ nhà cung cấp
            </p>
          </div>
          <div className="wms-header-actions">
            <button
              className="wms-btn wms-btn-secondary"
              onClick={() => { loadData(); setRefreshKey(k => k + 1); }}
              disabled={busy}
            >
              <RefreshCw size={15} />
              {busy ? 'Đang tải...' : 'Làm mới'}
            </button>
          </div>
        </section>

        <RemnantReturnReview locations={options.locations} />

        {/* KPI STRIP */}
        <div className="wms-kpi-strip">
          <div className="wms-kpi-card">
            <div className="wms-kpi-icon" style={{ background: '#EFE6DA', color: '#8A6A46' }}>
              <FileText size={20} />
            </div>
            <div className="wms-kpi-info">
              <span className="wms-kpi-label">Tổng Yêu Cầu</span>
              <span className="wms-kpi-value">{kpis.totalRequests}</span>
            </div>
          </div>

          <div className="wms-kpi-card">
            <div className="wms-kpi-icon" style={{ background: '#FEF0C7', color: '#9A5B06' }}>
              <Clock size={20} />
            </div>
            <div className="wms-kpi-info">
              <span className="wms-kpi-label">Chờ Nhập Hàng</span>
              <span className="wms-kpi-value" style={{ color: '#9A5B06' }}>{kpis.waitingReceipt}</span>
            </div>
          </div>

          <div className="wms-kpi-card">
            <div className="wms-kpi-icon" style={{ background: '#E3F5EC', color: '#1E6B47' }}>
              <CheckCircle2 size={20} />
            </div>
            <div className="wms-kpi-info">
              <span className="wms-kpi-label">Đã Hoàn Thiện</span>
              <span className="wms-kpi-value" style={{ color: '#1E6B47' }}>{kpis.completed}</span>
            </div>
          </div>

          <div className="wms-kpi-card">
            <div className="wms-kpi-icon" style={{ background: '#EFE6DA', color: '#8A6A46' }}>
              <Package size={20} />
            </div>
            <div className="wms-kpi-info">
              <span className="wms-kpi-label">Tổng Phiếu Nhập</span>
              <span className="wms-kpi-value">{kpis.totalReceipts}</span>
            </div>
          </div>

          <div className="wms-kpi-card">
            <div className="wms-kpi-icon" style={{ background: '#FEF0C7', color: '#9A5B06' }}>
              <TrendingUp size={20} />
            </div>
            <div className="wms-kpi-info">
              <span className="wms-kpi-label">Chờ Xác Nhận</span>
              <span className="wms-kpi-value" style={{ color: '#9A5B06' }}>{kpis.pendingConfirm}</span>
            </div>
          </div>
        </div>

        {/* FILTERS & SEARCH */}
        <div className="wms-toolbar">
          <div className="wms-search-box">
            <Search size={16} />
            <input
              type="text"
              placeholder="Tìm theo mã yêu cầu, kỹ thuật viên, nguyên phụ liệu..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="wms-search-input"
            />
          </div>

          <select
            className="wms-filter-select"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="">Tất cả trạng thái</option>
            <option value="WAITING_RECEIPT">Chờ nhập</option>
            <option value="PARTIALLY_RECEIVED">Đã nhập một phần</option>
            <option value="COMPLETED">Đã hoàn thiện</option>
            <option value="CANCELLED">Đã hủy</option>
          </select>
        </div>

        {/* ERROR MESSAGE */}
        {error && (
          <div className="wms-alert wms-alert-error" role="alert">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        {/* REQUESTS TABLE */}
        <div className="wms-card wms-table-card">
          <div className="wms-card-header">
            <h2 className="wms-card-title">Danh Sách Yêu Cầu Nhập Kho</h2>
          </div>

          <div className="wms-table-scroll no-horizontal-scroll" style={{ width: '100%', maxWidth: '100%', overflowX: 'auto' }}>
            <table className="wms-table wms-table-responsive-fit" style={{ width: '100%', tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '12%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '32%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '20%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Mã Yêu Cầu</th>
                  <th>Kỹ Thuật Viên</th>
                  <th>Nguyên Phụ Liệu Cần Nhận</th>
                  <th>Trạng Thái</th>
                  <th>Nguồn</th>
                  <th style={{ textAlign: 'center' }}>Thao Tác</th>
                </tr>
              </thead>
              <tbody>
                {filteredRequests.map((request) => {
                  const linkedReceipts = receipts.filter(r =>
                    String(r.inboundRequestId || '') === String(request._id)
                  );
                  const isExpanded = expandedRequest === request._id;

                  return (
                    <tr key={request._id}>
                      <td style={{ fontFamily: 'ui-monospace, Consolas, monospace', fontWeight: '700', color: '#141210', whiteSpace: 'nowrap' }}>
                        {request.ticketCode}
                        {request.legacyCompleted && (
                          <div style={{ fontSize: '11px', color: '#786E63', marginTop: '4px' }}>
                            Phiếu lịch sử
                          </div>
                        )}
                      </td>
                      <td style={{ wordWrap: 'break-word', overflowWrap: 'break-word' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '50%',
                            background: '#EFE6DA',
                            color: '#8A6A46',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '12px',
                            fontWeight: '700'
                          }}>
                            <User size={14} />
                          </div>
                          <span style={{ fontSize: '13px', color: '#26221E' }}>
                            {request.requestedByTechnicianId?.fullName || '—'}
                          </span>
                        </div>
                      </td>
                      <td style={{ wordWrap: 'break-word', overflowWrap: 'break-word', whiteSpace: 'normal' }}>
                        {request.requestLines.map((line, idx) => (
                          <div key={idx} style={{ marginBottom: '6px', fontSize: '12.5px', lineHeight: '1.4' }}>
                            <strong style={{ color: '#141210' }}>
                              {line.rawMaterialId?.materialName || 'Vật tư không còn'}
                            </strong>
                            <span style={{ color: '#574F46', marginLeft: '6px' }}>
                              {amount(line.receivedQty)} / {amount(line.requestedQty)} {line.rawMaterialId?.unit || ''}
                            </span>
                          </div>
                        ))}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <StatusBadge status={request.status} />
                      </td>
                      <td style={{ fontSize: '12px', color: '#574F46', whiteSpace: 'nowrap' }}>
                        {request.ticketType === 'INBOUND_FROM_PLAN' ? 'Kế hoạch' :
                         request.ticketType === 'INBOUND_FROM_REMNANT' ? 'Tồn vải' : 'Trực tiếp'}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'center' }}>
                          {/* Historical inbound tickets with no confirmed receipt can be fulfilled as a new linked receipt. */}
                          {['WAITING_RECEIPT', 'PARTIALLY_RECEIVED', 'DRAFT', 'WAITING_QC', 'READY_TO_CONFIRM'].includes(request.status) && (
                            <button
                              className="wms-btn wms-btn-sm wms-btn-primary"
                              onClick={() => setTarget({ kind: 'request', id: request._id, request })}
                            >
                              <Plus size={13} />
                              Nhập hàng
                            </button>
                          )}

                          {/* Completed and cancelled tickets remain available for review. */}
                          {['COMPLETED', 'CANCELLED'].includes(request.status) && (
                            <button
                              className="wms-btn wms-btn-sm wms-btn-secondary"
                              onClick={() => {
                                if (request.legacyCompleted) {
                                  // For legacy tickets, open the legacy form
                                  setTarget({ kind: 'legacy', id: request._id });
                                } else if (linkedReceipts.length === 1) {
                                  // For single receipt, open it directly
                                  setTarget({ kind: 'receipt', id: linkedReceipts[0]._id });
                                } else if (linkedReceipts.length > 1) {
                                  // For multiple receipts, toggle expansion
                                  setExpandedRequest(isExpanded ? null : request._id);
                                }
                              }}
                            >
                              <FileText size={13} />
                              Xem phiếu
                            </button>
                          )}

                          {/* Show receipt count badge for multiple receipts */}
                          {linkedReceipts.length > 1 && !isExpanded && (
                            <span style={{
                              fontSize: '11px',
                              color: '#8A6A46',
                              background: '#EFE6DA',
                              padding: '4px 8px',
                              borderRadius: '4px',
                              fontWeight: '600'
                            }}>
                              {linkedReceipts.length} phiếu
                            </span>
                          )}
                        </div>

                        {/* Expanded receipts list */}
                        {isExpanded && linkedReceipts.length > 0 && (
                          <div style={{
                            marginTop: '10px',
                            padding: '10px',
                            background: '#FAF7F2',
                            borderRadius: '6px',
                            border: '1px solid #E3D9CD'
                          }}>
                            <div style={{
                              fontSize: '11px',
                              color: '#786E63',
                              marginBottom: '8px',
                              fontWeight: '600'
                            }}>
                              Các phiếu nhập liên quan:
                            </div>
                            {linkedReceipts.map(receipt => (
                              <button
                                key={receipt._id}
                                className="wms-btn wms-btn-xs"
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  width: '100%',
                                  marginBottom: '4px',
                                  padding: '6px 8px',
                                  textAlign: 'left',
                                  background: '#FFFFFF',
                                  border: '1px solid #E3D9CD'
                                }}
                                onClick={() => setTarget({ kind: 'receipt', id: receipt._id })}
                              >
                                <span style={{
                                  fontFamily: 'ui-monospace, Consolas, monospace',
                                  fontSize: '11px',
                                  fontWeight: '700',
                                  color: '#141210'
                                }}>
                                  {receipt.ticketCode}
                                </span>
                                <StatusBadge status={receipt.status} />
                              </button>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {!busy && filteredRequests.length === 0 && (
            <div className="wms-empty-state">
              <Archive size={48} style={{ color: '#C8B9A6' }} />
              <p>Chưa có yêu cầu nhập kho nào.</p>
            </div>
          )}
        </div>

        {/* RECEIPTS TABLE */}
        <div className="wms-card wms-table-card">
          <div className="wms-card-header">
            <h2 className="wms-card-title">Phiếu Nhập Nguyên Phụ Liệu</h2>
          </div>

          <div className="wms-table-scroll no-horizontal-scroll" style={{ width: '100%', maxWidth: '100%', overflowX: 'auto' }}>
            <table className="wms-table wms-table-responsive-fit" style={{ width: '100%', tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '15%' }} />
                <col style={{ width: '40%' }} />
                <col style={{ width: '15%' }} />
                <col style={{ width: '15%' }} />
                <col style={{ width: '15%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Mã Phiếu</th>
                  <th>Nguyên Phụ Liệu</th>
                  <th>Trạng Thái</th>
                  <th>Ngày Tạo</th>
                  <th style={{ textAlign: 'center' }}>Thao Tác</th>
                </tr>
              </thead>
              <tbody>
                {receipts.map((receipt) => (
                  <tr key={receipt._id}>
                    <td style={{ fontFamily: 'ui-monospace, Consolas, monospace', fontWeight: '700', color: '#141210', whiteSpace: 'nowrap' }}>
                      {receipt.ticketCode}
                    </td>
                    <td style={{ wordWrap: 'break-word', overflowWrap: 'break-word', whiteSpace: 'normal' }}>
                      {receipt.receiptLines?.map((line, idx) => (
                        <div key={idx} style={{ marginBottom: '6px', fontSize: '12.5px', lineHeight: '1.4' }}>
                          <strong style={{ color: '#141210' }}>
                            {line.rawMaterialId?.materialName || 'Vật tư không còn'}
                          </strong>
                          <span style={{ color: '#574F46', marginLeft: '6px' }}>
                            {amount(line.acceptedQty)} {line.rawMaterialId?.unit || ''}
                          </span>
                        </div>
                      ))}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <StatusBadge status={receipt.status} />
                    </td>
                    <td style={{ fontSize: '12.5px', color: '#574F46', whiteSpace: 'nowrap' }}>
                      {receipt.createdAt ? new Date(receipt.createdAt).toLocaleDateString('vi-VN') : '—'}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        className="wms-btn wms-btn-sm wms-btn-secondary"
                        onClick={() => setTarget({ kind: 'receipt', id: receipt._id })}
                      >
                        <FileText size={13} />
                        {['COMPLETED', 'CANCELLED'].includes(receipt.status) ? 'Xem' : 'Tiếp tục'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!busy && receipts.length === 0 && (
            <div className="wms-empty-state">
              <Package size={48} style={{ color: '#C8B9A6' }} />
              <p>Chưa có phiếu nhập nào.</p>
            </div>
          )}
        </div>

      </div>

      {/* MODALS */}
      {target?.kind === 'legacy' && (
        <LegacyMaterialReceiptForm
          key={target.id}
          id={target.id}
          options={options}
          onClose={() => setTarget(null)}
          onChanged={() => setRefreshKey(k => k + 1)}
        />
      )}

      {target && target.kind !== 'legacy' && (
        <DirectMaterialReceiptModal
          key={`${target.kind}:${target.id}`}
          target={target}
          options={options}
          user={user}
          onClose={() => setTarget(null)}
          onChanged={() => setRefreshKey(k => k + 1)}
          onMaterialCreated={(material) =>
            setOptions(current => ({
              ...current,
              materials: [...current.materials, { ...material, _id: material._id || material.id }]
            }))
          }
        />
      )}
    </div>
  );
}
