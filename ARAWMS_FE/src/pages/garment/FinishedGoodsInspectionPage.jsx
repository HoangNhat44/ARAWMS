/*
 * File: FinishedGoodsInspectionPage.jsx
 * Role: GARMENT_TECHNICIAN (Kỹ thuật viên may / KCS)
 * Description: Kiểm định chất lượng nhiều loại thành phẩm may từ xưởng gia công, lập biên bản KCS và gửi yêu cầu nhập kho thành phẩm tới Quản lý kho duyệt.
 */
import React, { useState, useEffect, useMemo } from 'react';
import {
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Search,
  Filter,
  Plus,
  RefreshCw,
  Package,
  Calendar,
  User,
  Eye,
  Check,
  X,
  Send,
  Layers,
  ShieldCheck,
  ShieldAlert,
  ArrowRight,
  Shirt,
  Trash2,
} from 'lucide-react';
import garmentTechnicalService from '../../services/garmentTechnicalService';

const initialItemRow = {
  skuId: '',
  totalQty: '',
  passedQty: '',
  failedQty: '',
  defectNote: '',
};

export default function FinishedGoodsInspectionPage() {
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [tickets, setTickets] = useState([]);
  const [stats, setStats] = useState({
    totalTickets: 0,
    waitingTickets: 0,
    readyTickets: 0,
    completedTickets: 0,
  });

  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Options
  const [options, setOptions] = useState({
    skus: [],
    locations: [],
  });

  // Create Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [items, setItems] = useState([{ ...initialItemRow }]);
  const [qcNote, setQcNote] = useState('');
  const [defectAction, setDefectAction] = useState('NONE');

  // View Details Modal
  const [selectedTicket, setSelectedTicket] = useState(null);

  // Notification
  const [alertBanner, setAlertBanner] = useState(null);

  const showAlert = (type, message) => {
    setAlertBanner({ type, message });
    setTimeout(() => setAlertBanner(null), 6000);
  };

  // Load options
  useEffect(() => {
    garmentTechnicalService.finishedGoods.getOptions()
      .then((res) => {
        if (res?.data) {
          setOptions(res.data);
        }
      })
      .catch((err) => console.error('Lỗi tải danh mục options thành phẩm:', err));
  }, []);

  // Fetch tickets
  const fetchTickets = async () => {
    setLoading(true);
    try {
      const res = await garmentTechnicalService.finishedGoods.getTickets({
        status: statusFilter,
        search: searchQuery,
      });
      if (res?.data) {
        setTickets(res.data.tickets || []);
        if (res.data.stats) setStats(res.data.stats);
      }
    } catch (err) {
      showAlert('error', err.message || 'Không thể tải danh sách phiếu thành phẩm');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTickets();
  }, [statusFilter]);

  // Handle Item Row Changes
  const handleItemChange = (index, field, value) => {
    const updated = [...items];
    const row = { ...updated[index], [field]: value };

    // Auto-calculate passed/failed if one changes
    if (field === 'totalQty') {
      const total = Number(value);
      if (row.passedQty !== '') {
        row.failedQty = Math.max(0, total - Number(row.passedQty));
      } else if (row.failedQty !== '') {
        row.passedQty = Math.max(0, total - Number(row.failedQty));
      }
    } else if (field === 'passedQty') {
      if (row.totalQty !== '') {
        row.failedQty = Math.max(0, Number(row.totalQty) - Number(value));
      }
    } else if (field === 'failedQty') {
      if (row.totalQty !== '') {
        row.passedQty = Math.max(0, Number(row.totalQty) - Number(value));
      }
    }

    updated[index] = row;
    setItems(updated);
  };

  // Add Item Row
  const handleAddItemRow = () => {
    setItems([...items, { ...initialItemRow }]);
  };

  // Remove Item Row
  const handleRemoveItemRow = (index) => {
    if (items.length <= 1) return;
    setItems(items.filter((_, idx) => idx !== index));
  };

  // Auto-calculated totals
  const totalBatchQty = useMemo(() => {
    return items.reduce((sum, it) => sum + (Number(it.totalQty) || 0), 0);
  }, [items]);

  const totalPassedQty = useMemo(() => {
    return items.reduce((sum, it) => sum + (Number(it.passedQty) || 0), 0);
  }, [items]);

  const totalFailedQty = useMemo(() => {
    return items.reduce((sum, it) => sum + (Number(it.failedQty) || 0), 0);
  }, [items]);

  // Auto-sync defectAction if failed > 0
  useEffect(() => {
    if (totalFailedQty > 0 && defectAction === 'NONE') {
      setDefectAction('REPAIR_AT_WORKSHOP');
    } else if (totalFailedQty === 0) {
      setDefectAction('NONE');
    }
  }, [totalFailedQty]);

  // Reset Modal Form
  const resetForm = () => {
    setItems([{ ...initialItemRow }]);
    setQcNote('');
    setDefectAction('NONE');
  };

  // Submit Create Ticket
  const handleSubmitTicket = async () => {
    // 1. Validation
    const validItems = items.filter((it) => it.skuId);
    if (!validItems.length) {
      showAlert('error', 'Vui lòng chọn ít nhất một SKU thành phẩm');
      return;
    }

    // Check for empty or invalid quantities in selected rows
    for (let i = 0; i < validItems.length; i++) {
      const it = validItems[i];
      const tot = Number(it.totalQty);
      const pas = Number(it.passedQty);
      const fai = Number(it.failedQty);

      if (!it.totalQty || tot <= 0) {
        showAlert('error', `Dòng ${i + 1}: Vui lòng nhập tổng số lượng may bàn giao (> 0)`);
        return;
      }
      if (it.passedQty === '' || pas < 0) {
        showAlert('error', `Dòng ${i + 1}: Vui lòng nhập số lượng đạt KCS`);
        return;
      }
      if (pas + fai !== tot) {
        showAlert('error', `Dòng ${i + 1}: Tổng số may (${tot}) phải bằng số đạt (${pas}) + số lỗi (${fai})`);
        return;
      }
    }

    if (totalPassedQty <= 0) {
      showAlert('error', 'Tổng số lượng đạt KCS phải lớn hơn 0 để có thể tạo yêu cầu nhập kho');
      return;
    }

    if (totalFailedQty > 0 && !qcNote.trim()) {
      showAlert('error', 'Vui lòng nhập biên bản kiểm tra KCS (mô tả lỗi) khi có hàng lỗi');
      return;
    }

    setActionLoading(true);
    try {
      const payload = {
        totalBatchQty,
        passedQty: totalPassedQty,
        failedDefectQty: totalFailedQty,
        qcNote: qcNote.trim(),
        defectAction: totalFailedQty > 0 ? (defectAction !== 'NONE' ? defectAction : 'REPAIR_AT_WORKSHOP') : 'NONE',
        items: validItems.map((it) => ({
          skuId: it.skuId,
          expectedQty: Number(it.passedQty) || 0, // Only passed units are sent to warehouse
        })),
      };

      const res = await garmentTechnicalService.finishedGoods.createTicket(payload);
      showAlert('success', `Đã tạo phiếu yêu cầu nhập kho thành phẩm ${res?.data?.ticketCode} (${validItems.length} loại SKU) gửi Quản lý kho thành công!`);
      setShowCreateModal(false);
      resetForm();
      fetchTickets();
    } catch (err) {
      showAlert('error', err.message || 'Lỗi khi gửi yêu cầu nhập thành phẩm');
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
            <Sparkles size={14} /> Kỹ thuật xưởng · Nghiệp vụ KCS Thành phẩm
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--ara-noir)', margin: 0 }}>
            Kiểm Định Chất Lượng & Yêu Cầu Nhập Kho Thành Phẩm
          </h1>
          <p style={{ color: 'var(--ara-text-muted)', fontSize: '0.92rem', margin: '0.35rem 0 0', maxWidth: '820px' }}>
            Nghiệm thu các loại thành phẩm may từ xưởng gia công, kiểm định đường may/kích thước/form dáng, tách số lượng đạt chuẩn và gửi yêu cầu nhập kho tới Quản lý kho.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            type="button"
            className="btn-ara-secondary"
            onClick={fetchTickets}
            title="Làm mới dữ liệu"
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <RefreshCw size={15} className={loading ? 'spinning' : ''} /> Làm mới
          </button>
          <button
            type="button"
            className="btn-ara-primary"
            onClick={() => {
              resetForm();
              setShowCreateModal(true);
            }}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <Plus size={16} /> Lập Phiếu KCS & Yêu Cầu Nhập Kho Thành Phẩm
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
            Tổng phiếu yêu cầu
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--ara-noir)', marginTop: '0.2rem' }}>
            {stats.totalTickets}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--ara-text-light)', marginTop: '0.2rem' }}>
            Phiếu nhập từ xưởng may (INBOUND_FROM_SEWING)
          </div>
        </div>

        <div style={{ background: '#FFFFFF', padding: '1.1rem', borderRadius: 'var(--radius-md)', border: '1px solid #FCD34D', boxShadow: 'var(--ara-shadow-sm)' }}>
          <div style={{ fontSize: '0.8rem', color: '#B45309', textTransform: 'uppercase', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <Calendar size={14} /> Chờ QL Kho xác nhận & xếp kệ
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#B45309', marginTop: '0.2rem' }}>
            {stats.readyTickets}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#92400E', marginTop: '0.2rem' }}>
            Đã KCS xong, chờ cất lên kệ
          </div>
        </div>

        <div style={{ background: '#FFFFFF', padding: '1.1rem', borderRadius: 'var(--radius-md)', border: '1px solid #6EE7B7', boxShadow: 'var(--ara-shadow-sm)' }}>
          <div style={{ fontSize: '0.8rem', color: '#047857', textTransform: 'uppercase', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <CheckCircle2 size={14} /> Đã nhập kho hoàn tất
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#047857', marginTop: '0.2rem' }}>
            {stats.completedTickets}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#065F46', marginTop: '0.2rem' }}>
            Kho đã quét mã và cất lên kệ
          </div>
        </div>
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
            placeholder="Tìm theo mã phiếu PNTP, ghi chú KCS..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchTickets()}
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
            <option value="READY_TO_CONFIRM">Chờ QL Kho xác nhận (READY_TO_CONFIRM)</option>
            <option value="COMPLETED">Đã nhập kho xong (COMPLETED)</option>
            <option value="CANCELLED">Đã hủy (CANCELLED)</option>
          </select>
        </div>
      </div>

      {/* Tickets Table */}
      <div style={{ background: '#FFFFFF', borderRadius: 'var(--radius-md)', border: '1px solid var(--ara-border)', overflow: 'hidden', boxShadow: 'var(--ara-shadow-sm)' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="table-ara" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ background: 'var(--ara-bg-surface)', borderBottom: '1px solid var(--ara-border)', color: 'var(--ara-text-muted)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                <th style={{ padding: '0.9rem 1.1rem' }}>Mã Phiếu Yêu Cầu</th>
                <th style={{ padding: '0.9rem 1.1rem' }}>Sản Phẩm & SKU May</th>
                <th style={{ padding: '0.9rem 1.1rem', textAlign: 'center' }}>Tổng May</th>
                <th style={{ padding: '0.9rem 1.1rem', textAlign: 'center' }}>Đạt KCS</th>
                <th style={{ padding: '0.9rem 1.1rem', textAlign: 'center' }}>Lỗi / Hỏng</th>
                <th style={{ padding: '0.9rem 1.1rem' }}>Hướng Xử Lý Lỗi</th>
                <th style={{ padding: '0.9rem 1.1rem' }}>Trạng Thái Kho</th>
                <th style={{ padding: '0.9rem 1.1rem' }}>Ngày Lập</th>
                <th style={{ padding: '0.9rem 1.1rem', textAlign: 'right' }}>Thao Tác</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '3rem', color: 'var(--ara-text-muted)' }}>
                    <RefreshCw size={24} className="spinning" style={{ margin: '0 auto 0.5rem' }} />
                    <div>Đang tải danh sách phiếu thành phẩm...</div>
                  </td>
                </tr>
              ) : tickets.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '3rem', color: 'var(--ara-text-muted)' }}>
                    <Shirt size={32} style={{ margin: '0 auto 0.5rem', opacity: 0.5 }} />
                    <div>Chưa có phiếu yêu cầu nhập thành phẩm nào</div>
                  </td>
                </tr>
              ) : (
                tickets.map((ticket) => {
                  const inspection = ticket.garmentInspection || {};
                  const firstItem = ticket.items?.[0] || {};
                  const sku = firstItem.skuId || {};
                  const isReady = ticket.status === 'READY_TO_CONFIRM';
                  const isCompleted = ticket.status === 'COMPLETED';

                  return (
                    <tr key={ticket._id} style={{ borderBottom: '1px solid var(--ara-border-subtle)' }}>
                      <td style={{ padding: '1rem 1.1rem', fontWeight: 700 }}>
                        <span style={{ fontFamily: 'monospace', fontSize: '0.95rem', color: 'var(--ara-gold)' }}>
                          {ticket.ticketCode}
                        </span>
                        <div style={{ fontSize: '0.75rem', color: 'var(--ara-text-muted)', fontWeight: 400 }}>
                          KCS: {inspection.inspectedByTechId?.fullName || 'Kỹ thuật may'}
                        </div>
                      </td>
                      <td style={{ padding: '1rem 1.1rem' }}>
                        <div style={{ fontWeight: 600, color: 'var(--ara-noir)' }}>
                          {sku.styleName || sku.productId?.productName || 'Sản phẩm may'}
                          {ticket.items?.length > 1 && (
                            <span style={{ fontSize: '0.75rem', color: 'var(--ara-gold)', marginLeft: '6px', fontWeight: 700 }}>
                              (+{ticket.items.length - 1} loại khác)
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--ara-text-muted)' }}>
                          {ticket.items?.length === 1 ? (
                            <>SKU: {sku.skuCode} · Size: <strong>{sku.size}</strong> · Màu: {sku.color}</>
                          ) : (
                            <>Tổng cộng <strong>{ticket.items?.length}</strong> loại SKU thành phẩm</>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '1rem 1.1rem', textAlign: 'center', fontWeight: 600 }}>
                        {inspection.totalBatchQty ?? firstItem.expectedQty}
                      </td>
                      <td style={{ padding: '1rem 1.1rem', textAlign: 'center', fontWeight: 700, color: '#047857' }}>
                        {inspection.passedQty ?? firstItem.expectedQty}
                      </td>
                      <td style={{ padding: '1rem 1.1rem', textAlign: 'center', fontWeight: 700, color: inspection.failedDefectQty > 0 ? '#B91C1C' : 'var(--ara-text-light)' }}>
                        {inspection.failedDefectQty || 0}
                      </td>
                      <td style={{ padding: '1rem 1.1rem', fontSize: '0.82rem' }}>
                        {ticket.defectAction === 'REPAIR_AT_WORKSHOP' && (
                          <span style={{ color: '#D97706', fontWeight: 600 }}>Sửa tại xưởng may</span>
                        )}
                        {ticket.defectAction === 'LIQUIDATION' && (
                          <span style={{ color: '#DC2626', fontWeight: 600 }}>Thanh lý hàng lỗi B</span>
                        )}
                        {ticket.defectAction === 'DESTRUCTION' && (
                          <span style={{ color: '#7F1D1D', fontWeight: 600 }}>Tiêu hủy hàng hỏng</span>
                        )}
                        {(!ticket.defectAction || ticket.defectAction === 'NONE') && (
                          <span style={{ color: '#059669', fontWeight: 500 }}>Không có hàng lỗi</span>
                        )}
                      </td>
                      <td style={{ padding: '1rem 1.1rem' }}>
                        {isReady && (
                          <span style={{ padding: '0.25rem 0.6rem', borderRadius: '4px', background: '#FEF3C7', color: '#92400E', fontSize: '0.78rem', fontWeight: 700 }}>
                            Chờ QL Kho xếp kệ
                          </span>
                        )}
                        {isCompleted && (
                          <span style={{ padding: '0.25rem 0.6rem', borderRadius: '4px', background: '#D1FAE5', color: '#065F46', fontSize: '0.78rem', fontWeight: 700 }}>
                            Đã nhập kho
                          </span>
                        )}
                        {!isReady && !isCompleted && (
                          <span style={{ padding: '0.25rem 0.6rem', borderRadius: '4px', background: '#F3F4F6', color: '#6B7280', fontSize: '0.78rem', fontWeight: 700 }}>
                            {ticket.status}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '1rem 1.1rem', fontSize: '0.85rem' }}>
                        {ticket.createdAt ? new Date(ticket.createdAt).toLocaleDateString('vi-VN') : '—'}
                      </td>
                      <td style={{ padding: '1rem 1.1rem', textAlign: 'right' }}>
                        <button
                          type="button"
                          className="btn-ara-secondary"
                          onClick={() => setSelectedTicket(ticket)}
                          style={{ fontSize: '0.82rem', padding: '0.35rem 0.75rem' }}
                        >
                          <Eye size={14} style={{ marginRight: '4px' }} /> Chi tiết
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

      {/* ========================================================================= */}
      {/* MODAL: CREATE FINISHED GOODS INBOUND TICKET (MULTI-PRODUCT)               */}
      {/* ========================================================================= */}
      {showCreateModal && (
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
            maxHeight: '92vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: 'var(--ara-shadow-lg)',
            overflow: 'hidden',
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '1.2rem 1.5rem',
              borderBottom: '1px solid var(--ara-border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: 'var(--ara-bg-surface)',
            }}>
              <div>
                <div style={{ fontSize: '0.78rem', color: 'var(--ara-gold)', fontWeight: 700, textTransform: 'uppercase' }}>
                  KCS Nghiệm Thu Lô May Xưởng
                </div>
                <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--ara-noir)', margin: '0.2rem 0 0' }}>
                  Lập Phiếu Yêu Cầu Nhập Kho Thành Phẩm (Nhiều Loại)
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--ara-text-muted)' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>
              {/* Items Section Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--ara-noir)', margin: 0 }}>
                    Danh sách thành phẩm may nghiệm thu KCS
                  </h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--ara-text-muted)', margin: '2px 0 0' }}>
                    Chọn từng mã SKU thành phẩm may và nhập số lượng kiểm tra thực tế (để trống ban đầu, tự điền)
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-ara-secondary"
                  onClick={handleAddItemRow}
                  style={{ fontSize: '0.82rem', padding: '0.35rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                >
                  <Plus size={15} /> Thêm thành phẩm
                </button>
              </div>

              {/* Items Table */}
              <div style={{ border: '1px solid var(--ara-border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', marginBottom: '1.25rem' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--ara-bg-surface)', borderBottom: '1px solid var(--ara-border)', color: 'var(--ara-text-muted)', fontSize: '0.78rem', textTransform: 'uppercase' }}>
                      <th style={{ padding: '0.7rem 0.8rem', textAlign: 'left' }}>SKU / Thành Phẩm May</th>
                      <th style={{ padding: '0.7rem 0.8rem', width: '115px', textAlign: 'center' }}>Tổng May</th>
                      <th style={{ padding: '0.7rem 0.8rem', width: '115px', textAlign: 'center' }}>Đạt KCS</th>
                      <th style={{ padding: '0.7rem 0.8rem', width: '115px', textAlign: 'center' }}>Lỗi / Hỏng</th>
                      <th style={{ padding: '0.7rem 0.8rem', textAlign: 'left' }}>Ghi chú lỗi (nếu có)</th>
                      <th style={{ padding: '0.7rem 0.8rem', width: '45px', textAlign: 'center' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((row, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--ara-border-subtle)', background: idx % 2 === 0 ? '#FFFFFF' : 'rgba(250, 247, 242, 0.4)' }}>
                        <td style={{ padding: '0.65rem 0.8rem' }}>
                          <select
                            value={row.skuId}
                            onChange={(e) => handleItemChange(idx, 'skuId', e.target.value)}
                            style={{
                              width: '100%',
                              padding: '0.45rem 0.6rem',
                              borderRadius: '4px',
                              border: '1px solid var(--ara-border)',
                              fontSize: '0.85rem',
                              background: '#FFFFFF',
                            }}
                          >
                            <option value="">-- Chọn thành phẩm & mã SKU --</option>
                            {options.skus?.map((sku) => (
                              <option key={sku._id} value={sku._id}>
                                {sku.styleName || sku.productId?.productName} — SKU: {sku.skuCode} (Size: {sku.size}, Màu: {sku.color})
                              </option>
                            ))}
                          </select>
                        </td>
                        <td style={{ padding: '0.65rem 0.8rem' }}>
                          <input
                            type="number"
                            min="0"
                            placeholder="0"
                            value={row.totalQty}
                            onChange={(e) => handleItemChange(idx, 'totalQty', e.target.value)}
                            style={{
                              width: '100%',
                              padding: '0.45rem',
                              borderRadius: '4px',
                              border: '1px solid var(--ara-border)',
                              fontSize: '0.92rem',
                              fontWeight: 700,
                              textAlign: 'center',
                            }}
                          />
                        </td>
                        <td style={{ padding: '0.65rem 0.8rem' }}>
                          <input
                            type="number"
                            min="0"
                            placeholder="0"
                            value={row.passedQty}
                            onChange={(e) => handleItemChange(idx, 'passedQty', e.target.value)}
                            style={{
                              width: '100%',
                              padding: '0.45rem',
                              borderRadius: '4px',
                              border: '2px solid #10B981',
                              fontSize: '0.92rem',
                              fontWeight: 700,
                              color: '#047857',
                              textAlign: 'center',
                            }}
                          />
                        </td>
                        <td style={{ padding: '0.65rem 0.8rem' }}>
                          <input
                            type="number"
                            min="0"
                            placeholder="0"
                            value={row.failedQty}
                            onChange={(e) => handleItemChange(idx, 'failedQty', e.target.value)}
                            style={{
                              width: '100%',
                              padding: '0.45rem',
                              borderRadius: '4px',
                              border: '2px solid #EF4444',
                              fontSize: '0.92rem',
                              fontWeight: 700,
                              color: '#B91C1C',
                              textAlign: 'center',
                            }}
                          />
                        </td>
                        <td style={{ padding: '0.65rem 0.8rem' }}>
                          <input
                            type="text"
                            placeholder="Lỗi chỉ, xước vải, nhãn mác..."
                            value={row.defectNote}
                            onChange={(e) => handleItemChange(idx, 'defectNote', e.target.value)}
                            style={{
                              width: '100%',
                              padding: '0.45rem 0.6rem',
                              borderRadius: '4px',
                              border: '1px solid var(--ara-border)',
                              fontSize: '0.85rem',
                            }}
                          />
                        </td>
                        <td style={{ padding: '0.65rem 0.8rem', textAlign: 'center' }}>
                          {items.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveItemRow(idx)}
                              style={{ background: 'none', border: 'none', color: '#DC2626', cursor: 'pointer', padding: '4px' }}
                              title="Xóa dòng này"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Total Summary Cards */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '1rem',
                marginBottom: '1.25rem',
                background: 'var(--ara-bg-surface)',
                padding: '1.1rem',
                borderRadius: 'var(--radius-sm)',
                textAlign: 'center',
              }}>
                <div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--ara-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                    Tổng số may bàn giao
                  </div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--ara-noir)', marginTop: '2px' }}>
                    {totalBatchQty || 0}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.78rem', color: '#047857', textTransform: 'uppercase', fontWeight: 600 }}>
                    Tổng đạt KCS (Gửi nhập kho)
                  </div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#047857', marginTop: '2px' }}>
                    {totalPassedQty || 0}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.78rem', color: '#B91C1C', textTransform: 'uppercase', fontWeight: 600 }}>
                    Tổng hàng lỗi / hỏng
                  </div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#B91C1C', marginTop: '2px' }}>
                    {totalFailedQty || 0}
                  </div>
                </div>
              </div>

              {/* Defect Action & Warehouse Shelf Info */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--ara-noir)', marginBottom: '0.35rem' }}>
                    Hướng xử lý hàng lỗi:
                  </label>
                  <select
                    value={defectAction}
                    onChange={(e) => setDefectAction(e.target.value)}
                    disabled={totalFailedQty === 0}
                    style={{
                      width: '100%',
                      padding: '0.6rem',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--ara-border)',
                      fontSize: '0.88rem',
                      background: totalFailedQty === 0 ? 'var(--ara-bg-surface)' : '#FFFFFF',
                    }}
                  >
                    <option value="NONE">Không có hàng lỗi (100% đạt)</option>
                    <option value="REPAIR_AT_WORKSHOP">Sửa chữa lại tại xưởng may</option>
                    <option value="LIQUIDATION">Hạ cấp / Thanh lý hàng B</option>
                    <option value="DESTRUCTION">Tiêu hủy (do rách/hỏng nặng)</option>
                  </select>
                </div>

                <div style={{
                  padding: '0.65rem 0.85rem',
                  background: 'var(--ara-bg-surface)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--ara-border)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--ara-noir)' }}>
                    📍 Phân bổ vị trí kệ kho:
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--ara-text-muted)', marginTop: '2px', lineHeight: 1.4 }}>
                    Vị trí kệ thành phẩm sẽ do <strong>Quản lý kho</strong> kiểm tra sức chứa và chỉ định khi phê duyệt phiếu.
                  </div>
                </div>
              </div>

              {/* QC Inspection Note */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--ara-noir)', marginBottom: '0.35rem' }}>
                  Biên bản kiểm định chất lượng KCS {totalFailedQty > 0 ? <span style={{ color: '#DC2626' }}>* (bắt buộc khi có hàng lỗi)</span> : <span style={{ color: 'var(--ara-text-muted)', fontWeight: 400 }}>(tùy chọn)</span>}:
                </label>
                <textarea
                  rows={3}
                  placeholder={totalFailedQty > 0 ? "Yêu cầu nhập chi tiết lỗi: đường may, nhãn mác, thông số size, cúc, khóa..." : "Nhập ghi chú kiểm tra chất lượng (nếu có)..."}
                  value={qcNote}
                  onChange={(e) => setQcNote(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.8rem',
                    borderRadius: 'var(--radius-sm)',
                    border: totalFailedQty > 0 && !qcNote.trim() ? '2px solid #EF4444' : '1px solid var(--ara-border)',
                    fontSize: '0.88rem',
                    resize: 'vertical',
                    outline: 'none',
                  }}
                />
                {totalFailedQty > 0 && !qcNote.trim() && (
                  <div style={{ color: '#DC2626', fontSize: '0.78rem', marginTop: '0.25rem', fontWeight: 500 }}>
                    * Bắt buộc nhập biên bản kiểm tra KCS khi phát hiện có hàng lỗi.
                  </div>
                )}
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
                onClick={() => setShowCreateModal(false)}
                disabled={actionLoading}
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                className="btn-ara-primary"
                onClick={handleSubmitTicket}
                disabled={actionLoading}
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
              >
                {actionLoading ? <RefreshCw size={16} className="spinning" /> : <Send size={16} />}
                Gửi Yêu Cầu Nhập Kho Tới Quản Lý Kho ({totalPassedQty} Đạt KCS)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: TICKET DETAILS VIEW                                                */}
      {/* ========================================================================= */}
      {selectedTicket && (
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
            maxWidth: '740px',
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
              <div>
                <span style={{ fontSize: '0.8rem', color: 'var(--ara-gold)', fontWeight: 700 }}>
                  PHIẾU YÊU CẦU NHẬP THÀNH PHẨM
                </span>
                <h2 style={{ fontSize: '1.35rem', fontWeight: 700, margin: '0.2rem 0 0', color: 'var(--ara-noir)' }}>
                  {selectedTicket.ticketCode}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTicket(null)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--ara-text-muted)' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1, fontSize: '0.9rem' }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '1rem',
                background: 'var(--ara-bg-surface)',
                padding: '1rem',
                borderRadius: 'var(--radius-sm)',
                marginBottom: '1.25rem',
              }}>
                <div>
                  <span style={{ color: 'var(--ara-text-muted)', display: 'block', fontSize: '0.78rem' }}>Kỹ thuật viên KCS</span>
                  <strong>{selectedTicket.garmentInspection?.inspectedByTechId?.fullName || 'KCS'}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--ara-text-muted)', display: 'block', fontSize: '0.78rem' }}>Trạng thái kho</span>
                  <strong>{selectedTicket.status}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--ara-text-muted)', display: 'block', fontSize: '0.78rem' }}>Ngày lập</span>
                  <span>{new Date(selectedTicket.createdAt).toLocaleString('vi-VN')}</span>
                </div>
                <div>
                  <span style={{ color: 'var(--ara-text-muted)', display: 'block', fontSize: '0.78rem' }}>Hướng xử lý lỗi</span>
                  <strong>{selectedTicket.defectAction || 'NONE'}</strong>
                </div>
              </div>

              {/* Quantities */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', textAlign: 'center', marginBottom: '1.25rem' }}>
                <div style={{ padding: '0.75rem', background: 'var(--ara-bg-surface)', borderRadius: 'var(--radius-sm)' }}>
                  <div style={{ fontSize: '0.78rem', color: 'var(--ara-text-muted)' }}>Tổng số may</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>{selectedTicket.garmentInspection?.totalBatchQty || 0}</div>
                </div>
                <div style={{ padding: '0.75rem', background: '#ECFDF5', borderRadius: 'var(--radius-sm)' }}>
                  <div style={{ fontSize: '0.78rem', color: '#047857' }}>Đạt KCS (Nhập kho)</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#047857' }}>{selectedTicket.garmentInspection?.passedQty || 0}</div>
                </div>
                <div style={{ padding: '0.75rem', background: '#FEF2F2', borderRadius: 'var(--radius-sm)' }}>
                  <div style={{ fontSize: '0.78rem', color: '#B91C1C' }}>Hàng lỗi</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#B91C1C' }}>{selectedTicket.garmentInspection?.failedDefectQty || 0}</div>
                </div>
              </div>

              {/* Items */}
              <div style={{ marginBottom: '1.25rem' }}>
                <h4 style={{ fontSize: '0.92rem', fontWeight: 700, margin: '0 0 0.5rem' }}>
                  Danh sách thành phẩm may ({selectedTicket.items?.length || 0} loại SKU):
                </h4>
                <div style={{ border: '1px solid var(--ara-border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ background: 'var(--ara-bg-surface)', borderBottom: '1px solid var(--ara-border)' }}>
                        <th style={{ padding: '0.6rem 0.8rem', textAlign: 'left' }}>SKU</th>
                        <th style={{ padding: '0.6rem 0.8rem', textAlign: 'left' }}>Barcode</th>
                        <th style={{ padding: '0.6rem 0.8rem', textAlign: 'left' }}>Vị trí kệ kho</th>
                        <th style={{ padding: '0.6rem 0.8rem', textAlign: 'right' }}>Số lượng nhập</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedTicket.items?.map((item, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--ara-border-subtle)' }}>
                          <td style={{ padding: '0.6rem 0.8rem' }}>
                            <div style={{ fontWeight: 600 }}>{item.skuId?.styleName || item.skuId?.skuCode}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--ara-text-muted)' }}>
                              Size: {item.skuId?.size} · Màu: {item.skuId?.color}
                            </div>
                          </td>
                          <td style={{ padding: '0.6rem 0.8rem', fontFamily: 'monospace' }}>
                            {item.skuBarcode}
                          </td>
                          <td style={{ padding: '0.6rem 0.8rem' }}>
                            {selectedTicket.status === 'COMPLETED' ? (
                              <span style={{ fontWeight: 600, color: 'var(--ara-gold)' }}>
                                {item.designatedFifoLocationId?.locationCode || 'Đã xếp kệ'}
                              </span>
                            ) : (
                              <span style={{ color: 'var(--ara-text-muted)', fontSize: '0.78rem' }}>
                                Chờ QL Kho xếp kệ
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '0.6rem 0.8rem', textAlign: 'right', fontWeight: 700, color: '#047857' }}>
                            {item.expectedQty}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* QC Note */}
              <div>
                <h4 style={{ fontSize: '0.92rem', fontWeight: 700, margin: '0 0 0.4rem' }}>Biên bản kiểm tra KCS:</h4>
                <div style={{
                  padding: '0.75rem 0.9rem',
                  background: 'var(--ara-bg-surface)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.88rem',
                  lineHeight: 1.5,
                  border: '1px solid var(--ara-border)',
                }}>
                  {selectedTicket.garmentInspection?.qcNote || 'Không có ghi chú thêm.'}
                </div>
              </div>
            </div>

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
                onClick={() => setSelectedTicket(null)}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
