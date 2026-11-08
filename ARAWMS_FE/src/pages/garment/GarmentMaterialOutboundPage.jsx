/*
 * File: GarmentMaterialOutboundPage.jsx
 * Author: Duy Anh & Antigravity
 * Date: 2026-11-06
 * Role: GARMENT_TECHNICIAN (Kỹ thuật viên may / KCS)
 * Description: Screen for Garment Technicians to request raw materials from Warehouse Manager for cutting.
 */
import React, { useState, useEffect } from 'react';
import {
  ArrowUpRight,
  Plus,
  Trash2,
  RefreshCw,
  Search,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileText,
  Package,
  Layers,
  Send,
  Eye,
  X,
  UserCheck,
} from 'lucide-react';
import { garmentTechnicalService } from '../../services/garmentTechnicalService';

export default function GarmentMaterialOutboundPage() {
  const [tickets, setTickets] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [threshold, setThreshold] = useState(2.0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  // Search & Filter
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modal create
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [purpose, setPurpose] = useState('');
  const [department, setDepartment] = useState('XƯỞNG MAY');
  const [lines, setLines] = useState([{ rawMaterialId: '', quantity: '', note: '' }]);

  // Modal detail
  const [viewingTicket, setViewingTicket] = useState(null);

  // Load options & outbound tickets
  const loadData = async () => {
    try {
      setLoading(true);
      setError('');
      const [optRes, ticketsRes] = await Promise.all([
        garmentTechnicalService.remnant.getOptions(),
        garmentTechnicalService.remnant.getOutboundRequests(),
      ]);

      const optData = optRes.data?.data || optRes.data || {};
      setMaterials(optData.materials || []);
      if (optData.threshold != null) {
        setThreshold(Number(optData.threshold));
      }

      const ticketsData = ticketsRes.data?.data || ticketsRes.data || [];
      setTickets(ticketsData);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Không thể tải dữ liệu yêu cầu xuất kho');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const handleRealtime = () => {
      loadData();
    };
    window.addEventListener('arawms-material-outbound-realtime', handleRealtime);
    const interval = setInterval(() => {
      loadData();
    }, 8000); // 8s auto-refresh fallback
    return () => {
      window.removeEventListener('arawms-material-outbound-realtime', handleRealtime);
      clearInterval(interval);
    };
  }, []);

  // Handle adding line in create form
  const handleAddLine = () => {
    setLines([...lines, { rawMaterialId: '', quantity: '', note: '' }]);
  };

  // Handle removing line
  const handleRemoveLine = (index) => {
    if (lines.length === 1) return;
    setLines(lines.filter((_, i) => i !== index));
  };

  // Handle line change
  const handleLineChange = (index, field, value) => {
    const updated = [...lines];
    updated[index][field] = value;
    setLines(updated);
  };

  // Submit new outbound request
  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!purpose.trim()) {
      setError('Vui lòng nhập mục đích xuất nguyên phụ liệu');
      return;
    }

    const validLines = lines.filter((l) => l.rawMaterialId && Number(l.quantity) > 0);
    if (validLines.length === 0) {
      setError('Vui lòng chọn ít nhất một nguyên phụ liệu với số lượng hợp lệ (> 0)');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const payload = {
        purpose: purpose.trim(),
        department: department.trim() || 'XƯỞNG MAY',
        lines: validLines.map((l) => ({
          rawMaterialId: l.rawMaterialId,
          quantity: Number(l.quantity),
          note: l.note || '',
        })),
      };

      const res = await garmentTechnicalService.remnant.createOutboundRequest(payload);
      const created = res.data?.data || res.data;
      setNotice(`✓ Đã tạo thành công Phiếu yêu cầu xuất "${created.ticketCode}" gửi Quản lý kho!`);
      setShowCreateModal(false);
      setPurpose('');
      setLines([{ rawMaterialId: '', quantity: '', note: '' }]);
      loadData();
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Không thể tạo yêu cầu xuất nguyên liệu');
    } finally {
      setBusy(false);
    }
  };

  // Filtered tickets
  const filteredTickets = tickets.filter((t) => {
    const matchStatus =
      statusFilter === 'ALL' ||
      t.status === statusFilter ||
      (statusFilter === 'WAITING_SCAN' && t.status === 'DRAFT');
    const matchSearch =
      !searchTerm ||
      (t.ticketCode && t.ticketCode.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (t.purpose && t.purpose.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (t.recipient && t.recipient.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (t.assignedStaffName && t.assignedStaffName.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchStatus && matchSearch;
  });

  return (
    <div className="ara-page" style={{ padding: '1.5rem', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Toast Messages */}
      {notice && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          background: '#006c4a',
          color: '#FFFFFF',
          padding: '12px 18px',
          borderRadius: '8px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          zIndex: 9999,
          fontSize: '0.9rem',
          fontWeight: 600,
        }}>
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice('')} style={{ background: 'none', border: 'none', color: '#FFF', fontSize: '18px', cursor: 'pointer' }}>×</button>
        </div>
      )}

      {error && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          background: '#a31d1d',
          color: '#FFFFFF',
          padding: '12px 18px',
          borderRadius: '8px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          zIndex: 9999,
          fontSize: '0.9rem',
          fontWeight: 600,
        }}>
          <span>{error}</span>
          <button type="button" onClick={() => setError('')} style={{ background: 'none', border: 'none', color: '#FFF', fontSize: '18px', cursor: 'pointer' }}>×</button>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--ara-gold)', fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            <ArrowUpRight size={18} /> Phân hệ Kỹ thuật may · Xuất nguyên phụ liệu
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--ara-noir)', margin: '0.25rem 0' }}>
            Yêu cầu xuất nguyên phụ liệu cắt may
          </h1>
          <p style={{ color: 'var(--ara-text-muted)', fontSize: '0.9rem', margin: 0 }}>
            Lập phiếu yêu cầu xuất vải & phụ liệu phục vụ sản xuất gửi tới Quản lý kho phê duyệt và chuẩn bị hàng.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            type="button"
            onClick={loadData}
            className="btn-ara-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.1rem' }}
            disabled={loading}
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            <span>Làm mới</span>
          </button>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="btn-ara-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.25rem' }}
          >
            <Plus size={18} />
            <span>Tạo yêu cầu xuất NPL mới</span>
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div style={{
        background: 'var(--ara-bg-surface)',
        border: '1px solid var(--ara-border)',
        borderRadius: 'var(--radius-md)',
        padding: '1rem',
        marginBottom: '1.5rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1rem',
      }}>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {[
            ['ALL', 'Tất cả phiếu'],
            ['WAITING_SCAN', 'Chờ duyệt'],
            ['WAITING_PICKING', 'Chờ lấy hàng'],
            ['PICKING', 'Đang xuất kho'],
            ['COMPLETED', 'Hoàn thành'],
            ['CANCELLED', 'Đã hủy'],
          ].map(([val, label]) => (
            <button
              key={val}
              type="button"
              onClick={() => setStatusFilter(val)}
              style={{
                padding: '0.45rem 0.85rem',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.85rem',
                fontWeight: 600,
                border: '1px solid',
                borderColor: statusFilter === val ? 'var(--ara-gold)' : 'var(--ara-border)',
                background: statusFilter === val ? 'var(--ara-gold)' : '#FFFFFF',
                color: statusFilter === val ? '#FFFFFF' : 'var(--ara-text)',
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#FFFFFF', border: '1px solid var(--ara-border)', borderRadius: 'var(--radius-sm)', padding: '0.4rem 0.8rem', minWidth: '280px' }}>
          <Search size={16} color="var(--ara-text-muted)" />
          <input
            type="text"
            placeholder="Tìm theo mã phiếu, mục đích, người nhận..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ border: 'none', outline: 'none', width: '100%', fontSize: '0.88rem' }}
          />
        </div>
      </div>

      {/* Outbound Tickets Table */}
      <div style={{ background: '#FFFFFF', border: '1px solid var(--ara-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden', boxShadow: 'var(--ara-shadow-sm)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ background: 'var(--ara-bg-surface)', borderBottom: '1px solid var(--ara-border)', color: 'var(--ara-text-muted)', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <th style={{ padding: '0.85rem 1rem' }}>Mã phiếu xuất</th>
              <th style={{ padding: '0.85rem 1rem' }}>Mục đích & Bộ phận</th>
              <th style={{ padding: '0.85rem 1rem' }}>Nguyên phụ liệu yêu cầu</th>
              <th style={{ padding: '0.85rem 1rem' }}>Người tạo & Ngày tạo</th>
              <th style={{ padding: '0.85rem 1rem' }}>Trạng thái kho</th>
              <th style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {filteredTickets.length > 0 ? (
              filteredTickets.map((t) => {
                const isCompleted = t.status === 'COMPLETED';
                const isWaiting = t.status === 'WAITING_SCAN' || t.status === 'DRAFT';
                const isCancelled = t.status === 'CANCELLED';

                const totalItems = (t.lines || []).reduce((sum, l) => sum + (l.quantity || 0), 0);
                const hasSources = (t.lines || []).some((l) => (l.sources || []).length > 0);

                return (
                  <tr key={t._id} style={{ borderBottom: '1px solid var(--ara-border)' }}>
                    <td style={{ padding: '1rem' }}>
                      <strong style={{ color: 'var(--ara-noir)', fontSize: '0.95rem' }}>{t.ticketCode}</strong>
                      <div style={{ fontSize: '0.78rem', color: 'var(--ara-text-muted)', marginTop: '0.2rem' }}>
                        Loại: {t.ticketType === 'OUTBOUND_FOR_CUTTING' ? 'Xuất cắt may' : 'Xuất kho NPL'}
                      </div>
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <div style={{ fontWeight: 600, color: 'var(--ara-noir)' }}>{t.purpose || 'Cắt may sản xuất'}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--ara-text-muted)', marginTop: '0.2rem' }}>
                        Bộ phận: {t.department || 'XƯỞNG MAY'} · Người nhận: {t.recipient || '—'}
                      </div>
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <div>
                        <strong>{t.lines?.length || 0} loại</strong> ({totalItems} mét/chiếc)
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--ara-text-muted)', marginTop: '0.2rem' }}>
                        {t.lines?.slice(0, 2).map((l) => `${l.materialName || l.materialCode} (${l.quantity} ${l.unit || ''})`).join(', ')}
                        {t.lines?.length > 2 && ' ...'}
                      </div>
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{t.createdByUserId?.fullName || 'Kỹ thuật viên may'}</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--ara-text-muted)', marginTop: '0.2rem' }}>
                        {t.issueDate || t.createdAt ? new Date(t.issueDate || t.createdAt).toLocaleDateString('vi-VN') : '—'}
                      </div>
                    </td>
                    <td style={{ padding: '1rem' }}>
                      {t.status === 'WAITING_SCAN' || t.status === 'DRAFT' ? (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          padding: '0.28rem 0.75rem',
                          borderRadius: 999,
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          background: '#fff0da',
                          color: '#b06000',
                        }}>
                          <Clock size={13} /> Chờ quản lý kho duyệt
                        </span>
                      ) : t.status === 'WAITING_PICKING' ? (
                        <div>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            padding: '0.28rem 0.75rem',
                            borderRadius: 999,
                            fontSize: '0.78rem',
                            fontWeight: 700,
                            background: '#e8f0fe',
                            color: '#1a73e8',
                          }}>
                            <UserCheck size={13} /> Chờ lấy hàng
                          </span>
                          {t.assignedStaffName && (
                            <div style={{ fontSize: '0.75rem', color: '#1a73e8', marginTop: 3 }}>
                              NV: <strong>{t.assignedStaffName}</strong>
                            </div>
                          )}
                        </div>
                      ) : t.status === 'PICKING' ? (
                        <div>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            padding: '0.28rem 0.75rem',
                            borderRadius: 999,
                            fontSize: '0.78rem',
                            fontWeight: 700,
                            background: '#e3f2fd',
                            color: '#0d47a1',
                            border: '1px solid #90caf9',
                          }}>
                            <RefreshCw size={12} className="spin" /> Đang xuất kho
                          </span>
                          {t.assignedStaffName && (
                            <div style={{ fontSize: '0.75rem', color: '#0d47a1', marginTop: 3 }}>
                              NV: <strong>{t.assignedStaffName}</strong>
                            </div>
                          )}
                        </div>
                      ) : t.status === 'WAITING_DISCREPANCY' ? (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          padding: '0.28rem 0.75rem',
                          borderRadius: 999,
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          background: '#fce8e6',
                          color: '#c5221f',
                        }}>
                          <AlertCircle size={13} /> Chờ xử lý sai lệch
                        </span>
                      ) : t.status === 'COMPLETED' ? (
                        <div>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            padding: '0.28rem 0.75rem',
                            borderRadius: 999,
                            fontSize: '0.78rem',
                            fontWeight: 700,
                            background: '#e6f4ea',
                            color: '#137333',
                          }}>
                            <CheckCircle2 size={13} /> Hoàn thành
                          </span>
                          <div style={{ fontSize: '0.75rem', color: '#137333', marginTop: 3 }}>
                            ✓ Đã xuất kho NPL
                          </div>
                        </div>
                      ) : (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          padding: '0.28rem 0.75rem',
                          borderRadius: 999,
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          background: '#f1f3f4',
                          color: '#5f6368',
                        }}>
                          <X size={13} /> Đã hủy
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() => setViewingTicket(t)}
                        className="btn-ara-secondary"
                        style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                      >
                        <Eye size={14} /> Chi tiết
                      </button>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan="6" style={{ padding: '3rem', textAlign: 'center', color: 'var(--ara-text-muted)' }}>
                  <Package size={36} style={{ margin: '0 auto 0.75rem', opacity: 0.4 }} />
                  <div>Chưa có yêu cầu xuất nguyên phụ liệu nào.</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* CREATE MODAL */}
      {showCreateModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(3px)',
          display: 'grid',
          placeItems: 'center',
          padding: '1rem',
          zIndex: 10000,
        }}>
          <form
            onSubmit={handleCreateSubmit}
            style={{
              background: '#FFFFFF',
              borderRadius: 'var(--radius-md)',
              width: '850px',
              maxWidth: '96vw',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 24px 60px rgba(0,0,0,0.2)',
              overflow: 'hidden',
            }}
          >
            {/* Modal Head */}
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--ara-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--ara-gold)', textTransform: 'uppercase' }}>KỸ THUẬT MAY</span>
                <h3 style={{ margin: '0.15rem 0 0', fontSize: '1.25rem', fontWeight: 700, color: 'var(--ara-noir)' }}>
                  Lập phiếu yêu cầu xuất nguyên phụ liệu
                </h3>
              </div>
              <button type="button" onClick={() => setShowCreateModal(false)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'var(--ara-text-muted)' }}>
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                    Bộ phận yêu cầu *
                  </label>
                  <input
                    type="text"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    placeholder="VD: Xưởng may chuyền 1"
                    style={{ width: '100%', padding: '0.6rem 0.8rem', border: '1px solid var(--ara-border)', borderRadius: 'var(--radius-sm)', fontSize: '0.9rem' }}
                    required
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                    Mục đích sử dụng (Lệnh sản xuất / Đơn hàng) *
                  </label>
                  <input
                    type="text"
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value)}
                    placeholder="VD: Cắt may áo khoác thu đông theo Lệnh SX #45"
                    style={{ width: '100%', padding: '0.6rem 0.8rem', border: '1px solid var(--ara-border)', borderRadius: 'var(--radius-sm)', fontSize: '0.9rem' }}
                    required
                  />
                </div>
              </div>

              {/* Material Lines Section */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <label style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--ara-noir)' }}>
                    Danh sách nguyên phụ liệu cần xuất *
                  </label>
                  <button
                    type="button"
                    onClick={handleAddLine}
                    className="btn-ara-secondary"
                    style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                  >
                    <Plus size={14} /> Thêm nguyên liệu
                  </button>
                </div>

                <div style={{ border: '1px solid var(--ara-border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ background: 'var(--ara-bg-surface)', borderBottom: '1px solid var(--ara-border)', color: 'var(--ara-text-muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                        <th style={{ padding: '0.6rem 0.75rem', width: '45%' }}>Nguyên phụ liệu</th>
                        <th style={{ padding: '0.6rem 0.75rem', width: '25%' }}>Số lượng yêu cầu (để trống khi tạo)</th>
                        <th style={{ padding: '0.6rem 0.75rem', width: '25%' }}>Ghi chú</th>
                        <th style={{ padding: '0.6rem 0.75rem', width: '5%', textAlign: 'center' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((line, idx) => {
                        const selectedMat = materials.find((m) => String(m._id) === String(line.rawMaterialId));
                        return (
                          <tr key={idx} style={{ borderBottom: '1px solid var(--ara-border)' }}>
                            <td style={{ padding: '0.6rem 0.75rem' }}>
                              <select
                                value={line.rawMaterialId}
                                onChange={(e) => handleLineChange(idx, 'rawMaterialId', e.target.value)}
                                style={{ width: '100%', padding: '0.55rem', border: '1px solid var(--ara-border)', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem' }}
                                required
                              >
                                <option value="">-- Chọn nguyên phụ liệu trong kho --</option>
                                {materials.map((m) => (
                                  <option key={m._id} value={m._id}>
                                    {m.materialCode} · {m.materialName} ({m.color || ''} - Tồn khả dụng: {m.availableQty} {m.unit})
                                  </option>
                                ))}
                              </select>
                              {selectedMat && (
                                <div style={{ fontSize: '0.75rem', color: 'var(--ara-text-muted)', marginTop: '0.2rem' }}>
                                  Đơn vị: <strong>{selectedMat.unit}</strong> · Khổ vải: {selectedMat.widthCm ? `${selectedMat.widthCm}cm` : '—'} · Định lượng: {selectedMat.gsm ? `${selectedMat.gsm}gsm` : '—'}
                                </div>
                              )}
                            </td>
                            <td style={{ padding: '0.6rem 0.75rem' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                <input
                                  type="number"
                                  min="0.1"
                                  step="0.1"
                                  placeholder="Nhập số lượng..."
                                  value={line.quantity}
                                  onChange={(e) => handleLineChange(idx, 'quantity', e.target.value)}
                                  style={{ width: '100%', padding: '0.55rem', border: '1px solid var(--ara-border)', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem' }}
                                  required
                                />
                                <span style={{ fontSize: '0.8rem', color: 'var(--ara-text-muted)', whiteSpace: 'nowrap' }}>
                                  {selectedMat ? selectedMat.unit : ''}
                                </span>
                              </div>
                            </td>
                            <td style={{ padding: '0.6rem 0.75rem' }}>
                              <input
                                type="text"
                                placeholder="Ghi chú thêm..."
                                value={line.note}
                                onChange={(e) => handleLineChange(idx, 'note', e.target.value)}
                                style={{ width: '100%', padding: '0.55rem', border: '1px solid var(--ara-border)', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem' }}
                              />
                            </td>
                            <td style={{ padding: '0.6rem 0.75rem', textAlign: 'center' }}>
                              {lines.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveLine(idx)}
                                  style={{ background: 'none', border: 'none', color: '#c5221f', cursor: 'pointer', padding: '0.3rem' }}
                                >
                                  <Trash2 size={15} />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Modal Foot */}
            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--ara-border)', background: 'var(--ara-bg-surface)', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="btn-ara-secondary"
                style={{ padding: '0.55rem 1.1rem' }}
              >
                Hủy
              </button>
              <button
                type="submit"
                className="btn-ara-primary"
                disabled={busy}
                style={{ padding: '0.55rem 1.35rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <Send size={15} />
                <span>{busy ? 'Đang gửi...' : 'Gửi yêu cầu tới Quản lý kho'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* DETAIL MODAL */}
      {viewingTicket && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(3px)',
          display: 'grid',
          placeItems: 'center',
          padding: '1rem',
          zIndex: 10000,
        }}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: 'var(--radius-md)',
            width: '750px',
            maxWidth: '96vw',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 24px 60px rgba(0,0,0,0.2)',
            overflow: 'hidden',
          }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--ara-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--ara-gold)', textTransform: 'uppercase' }}>CHI TIẾT PHIẾU XUẤT</span>
                <h3 style={{ margin: '0.15rem 0 0', fontSize: '1.25rem', fontWeight: 700, color: 'var(--ara-noir)' }}>
                  {viewingTicket.ticketCode}
                </h3>
              </div>
              <button type="button" onClick={() => setViewingTicket(null)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'var(--ara-text-muted)' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ background: 'var(--ara-bg-surface)', padding: '1rem', borderRadius: 'var(--radius-sm)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.88rem' }}>
                <div><strong>Mục đích:</strong> {viewingTicket.purpose || 'Cắt may sản xuất'}</div>
                <div><strong>Bộ phận:</strong> {viewingTicket.department || 'XƯỞNG MAY'}</div>
                <div><strong>Người yêu cầu:</strong> {viewingTicket.createdByUserId?.fullName || 'Kỹ thuật viên may'}</div>
                <div>
                  <strong>Trạng thái: </strong>
                  {viewingTicket.status === 'WAITING_SCAN' || viewingTicket.status === 'DRAFT' ? (
                    <span style={{ color: '#b06000', fontWeight: 700 }}>Chờ quản lý kho duyệt</span>
                  ) : viewingTicket.status === 'WAITING_PICKING' ? (
                    <span style={{ color: '#1a73e8', fontWeight: 700 }}>
                      Đã duyệt · Chờ nhân viên lấy hàng {viewingTicket.assignedStaffName ? `(NV: ${viewingTicket.assignedStaffName})` : ''}
                    </span>
                  ) : viewingTicket.status === 'PICKING' ? (
                    <span style={{ color: '#0d47a1', fontWeight: 700 }}>
                      Đang xuất kho {viewingTicket.assignedStaffName ? `(NV: ${viewingTicket.assignedStaffName})` : ''}
                    </span>
                  ) : viewingTicket.status === 'WAITING_DISCREPANCY' ? (
                    <span style={{ color: '#c5221f', fontWeight: 700 }}>Chờ xử lý sai lệch</span>
                  ) : viewingTicket.status === 'COMPLETED' ? (
                    <span style={{ color: '#137333', fontWeight: 700 }}>✓ Hoàn thành (Đã xuất kho NPL)</span>
                  ) : (
                    <span>{viewingTicket.status}</span>
                  )}
                </div>
              </div>

              <div>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 700, margin: '0.5rem 0' }}>Danh sách nguyên phụ liệu yêu cầu</h4>
                <div style={{ border: '1px solid var(--ara-border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ background: 'var(--ara-bg-surface)', borderBottom: '1px solid var(--ara-border)' }}>
                        <th style={{ padding: '0.6rem' }}>Mã NPL</th>
                        <th style={{ padding: '0.6rem' }}>Tên nguyên phụ liệu</th>
                        <th style={{ padding: '0.6rem', textAlign: 'center' }}>Số lượng yêu cầu</th>
                        <th style={{ padding: '0.6rem' }}>Cây vải / Lô kho xuất thực tế</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(viewingTicket.lines || []).map((l, i) => {
                        const sourcesList = (l.pickedSources && l.pickedSources.length > 0)
                          ? l.pickedSources
                          : (l.designatedSources && l.designatedSources.length > 0)
                          ? l.designatedSources
                          : (l.sources && l.sources.length > 0)
                          ? l.sources
                          : [];

                        return (
                          <tr key={i} style={{ borderBottom: '1px solid var(--ara-border)' }}>
                            <td style={{ padding: '0.6rem', fontFamily: 'monospace', fontWeight: 700 }}>{l.materialCode}</td>
                            <td style={{ padding: '0.6rem' }}>{l.materialName} ({l.color || ''})</td>
                            <td style={{ padding: '0.6rem', textAlign: 'center', fontWeight: 700, color: 'var(--ara-gold)' }}>
                              {l.quantity} {l.unit}
                            </td>
                            <td style={{ padding: '0.6rem' }}>
                              {sourcesList.length > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                  {sourcesList.map((s, si) => (
                                    <div key={si} style={{ fontSize: '0.78rem', background: '#e6f4ea', color: '#137333', padding: '0.3rem 0.5rem', borderRadius: '4px', border: '1px solid #cce8d4' }}>
                                      Barcode: <strong>{s.barcode}</strong> ({s.locationCode || 'Kho NPL'}{s.rackName ? `, ${s.rackName}` : ''}) · <strong>{s.quantity} {l.unit}</strong>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <span style={{ fontSize: '0.78rem', color: 'var(--ara-text-muted)', fontStyle: 'italic' }}>
                                  {viewingTicket.status === 'WAITING_SCAN' ? 'Chưa phân bổ nguồn' : 'Chưa có cây/lô quét thực tế'}
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
            </div>

            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--ara-border)', background: 'var(--ara-bg-surface)', display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setViewingTicket(null)} className="btn-ara-secondary" style={{ padding: '0.5rem 1rem' }}>
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

