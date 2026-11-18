/**
 * ============================================================================
 * @title        : Garment Lot Management Page
 * @author       : AraWMS Team
 * @createdDate  : 2026-11-18
 * @lastModified : 2026-11-18
 * @description  : Màn hình Quản lý Lô hàng (Lô Thành Phẩm & Lô Nguyên Phụ Liệu) dành cho Kỹ thuật may:
 *                 - Tạo / sửa / xóa các Lô nháp kèm mã lô (tự sinh hoặc nhập tay) và chuỗi QR chuẩn (LOT:FG:... / LOT:RM:...).
 *                 - Tích chọn nhiều Lô cùng loại để gửi yêu cầu nhập kho (PNTP / YCNNL) sang Quản lý kho sinh QR từng lô.
 *                 - Theo dõi trạng thái lô (Nháp / Chờ Quản lý kho / Đã nhập kho) và mã phiếu nhập kho liên kết.
 * @module       : Garment Technical / Lot Management
 * @layer        : Front-end (Page)
 * ============================================================================
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Layers,
  Plus,
  Search,
  Send,
  RefreshCw,
  Edit3,
  Trash2,
  Eye,
  QrCode,
  Copy,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Shirt,
  Package,
  X,
} from 'lucide-react';
import garmentTechnicalService from '../../services/garmentTechnicalService';
import {
  translateColorVi,
  translateProductNameVi,
  formatUnitVi,
  formatStatusVi,
} from '../../utils/garmentDisplayVi';

const DEFECT_CATEGORIES = [
  { value: 'SEWING_DEFECT', label: 'Lỗi đường may / bung chỉ' },
  { value: 'FABRIC_DEFECT', label: 'Lỗi vải / xước / rách vải' },
  { value: 'SIZE_SPEC_ERROR', label: 'Sai thông số kích cỡ / phom dáng' },
  { value: 'ACCESSORY_LABEL_ERROR', label: 'Lỗi cúc / khóa / nhãn mác' },
  { value: 'STAIN_DAMAGE', label: 'Bẩn / ố màu / hư hỏng' },
  { value: 'OTHER', label: 'Lỗi khác' },
];
const DEFECT_CATEGORY_LABELS = Object.fromEntries(DEFECT_CATEGORIES.map((c) => [c.value, c.label]));

const STATUS_META = {
  DRAFT: { label: 'Lô nháp (Chưa gửi kho)', bg: '#F3F4F6', color: '#374151', border: '#D1D5DB' },
  REQUESTED: { label: 'Đã gửi Quản lý kho (Chờ nhập & mã QR)', bg: '#FEF3C7', color: '#B45309', border: '#FCD34D' },
  RECEIVED: { label: 'Kho đã nhập & hoàn tất', bg: '#ECFDF5', color: '#047857', border: '#A7F3D0' },
  CANCELLED: { label: 'Đã hủy', bg: '#FEF2F2', color: '#B91C1C', border: '#FECACA' },
};

const EMPTY_FG_FORM = {
  lotCode: '',
  skuId: '',
  totalQty: '',
  quantity: '',
  failedQty: '0',
  defectCategory: 'NONE',
  defectNote: '',
  productionDate: new Date().toISOString().slice(0, 10),
  workshopName: '',
  productionOrderCode: '',
  note: '',
};

const EMPTY_RM_FORM = {
  lotCode: '',
  rawMaterialId: '',
  quantity: '',
  supplierId: '',
  supplierLotCode: '',
  dyeLot: '',
  packageUnit: '',
  packageCount: '',
  unitsPerPackage: '',
  manufactureDate: '',
  expiryDate: '',
  note: '',
};

const formatDate = (value) => (value ? new Date(value).toLocaleDateString('vi-VN') : '—');
const formatDateTime = (value) => (value ? new Date(value).toLocaleString('vi-VN') : '—');

export default function GarmentLotManagementPage() {
  const [activeTab, setActiveTab] = useState('FINISHED_GOODS'); // 'FINISHED_GOODS' | 'RAW_MATERIAL'
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const [lots, setLots] = useState([]);
  const [stats, setStats] = useState({
    totalCount: 0,
    fgCount: 0,
    rmCount: 0,
    draftCount: 0,
    requestedCount: 0,
    receivedCount: 0,
  });
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);

  const [options, setOptions] = useState({ skus: [], materials: [], suppliers: [] });

  // Multi-select draft lots for sending inbound request
  const [selectedIds, setSelectedIds] = useState([]);

  // Create / Edit modal
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingLot, setEditingLot] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FG_FORM);
  const [saving, setSaving] = useState(false);

  // Send inbound request confirmation modal
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [sendQcNote, setSendQcNote] = useState('');
  const [sendDefectAction, setSendDefectAction] = useState('NONE');
  const [sendRequestNote, setSendRequestNote] = useState('');
  const [sending, setSending] = useState(false);

  // Detail modal
  const [viewingLot, setViewingLot] = useState(null);

  // Toast alert
  const [alert, setAlert] = useState(null);
  const showAlert = useCallback((type, message) => {
    setAlert({ type, message });
    setTimeout(() => setAlert(null), 6000);
  }, []);

  // Load options once
  useEffect(() => {
    garmentTechnicalService.lots
      .getOptions()
      .then((res) => {
        if (res?.data) setOptions(res.data);
      })
      .catch((err) => console.error('Lỗi tải danh mục quản lý lô:', err));
  }, []);

  // Load lots list
  const fetchLots = useCallback(async () => {
    setLoading(true);
    try {
      const res = await garmentTechnicalService.lots.getLots({
        lotType: activeTab,
        status: statusFilter === 'ALL' ? undefined : statusFilter,
        search: search.trim() || undefined,
        page,
        limit: 25,
      });
      setLots(res?.data?.lots || []);
      if (res?.data?.stats) setStats(res.data.stats);
      if (res?.data?.pagination) setTotalPages(res.data.pagination.totalPages || 1);
    } catch (err) {
      showAlert('error', err.message || 'Không thể tải danh sách lô hàng');
    } finally {
      setLoading(false);
    }
  }, [activeTab, statusFilter, search, page, showAlert]);

  useEffect(() => {
    fetchLots();
    setSelectedIds([]);
  }, [fetchLots]);

  const draftLots = useMemo(() => lots.filter((l) => l.status === 'DRAFT'), [lots]);
  const selectedLots = useMemo(() => lots.filter((l) => selectedIds.includes(l._id)), [lots, selectedIds]);
  const selectedHasDefect = useMemo(
    () => selectedLots.some((l) => (Number(l.failedQty) || 0) > 0),
    [selectedLots]
  );

  const toggleSelect = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleSelectAllDrafts = () => {
    if (selectedIds.length === draftLots.length && draftLots.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(draftLots.map((l) => l._id));
    }
  };

  const openCreateModal = () => {
    setEditingLot(null);
    setFormData(activeTab === 'FINISHED_GOODS' ? { ...EMPTY_FG_FORM } : { ...EMPTY_RM_FORM });
    setFormModalOpen(true);
  };

  const openEditModal = (lot) => {
    setEditingLot(lot);
    if (lot.lotType === 'FINISHED_GOODS') {
      setFormData({
        lotCode: lot.lotCode || '',
        skuId: lot.skuId || '',
        totalQty: String(lot.totalQty || lot.quantity || ''),
        quantity: String(lot.quantity || ''),
        failedQty: String(lot.failedQty || 0),
        defectCategory: lot.defectCategory || 'NONE',
        defectNote: lot.defectNote || '',
        productionDate: lot.productionDate ? new Date(lot.productionDate).toISOString().slice(0, 10) : '',
        workshopName: lot.workshopName || '',
        productionOrderCode: lot.productionOrderCode || '',
        note: lot.note || '',
      });
    } else {
      setFormData({
        lotCode: lot.lotCode || '',
        rawMaterialId: lot.rawMaterialId || '',
        quantity: String(lot.quantity || ''),
        supplierId: lot.supplierId?._id || lot.supplierId || '',
        supplierLotCode: lot.supplierLotCode || '',
        dyeLot: lot.dyeLot || '',
        packageUnit: lot.packageUnit || '',
        packageCount: lot.packageCount != null ? String(lot.packageCount) : '',
        unitsPerPackage: lot.unitsPerPackage != null ? String(lot.unitsPerPackage) : '',
        manufactureDate: lot.manufactureDate ? new Date(lot.manufactureDate).toISOString().slice(0, 10) : '',
        expiryDate: lot.expiryDate ? new Date(lot.expiryDate).toISOString().slice(0, 10) : '',
        note: lot.note || '',
      });
    }
    setFormModalOpen(true);
  };

  const handleFormField = (field, value) => {
    setFormData((prev) => {
      const next = { ...prev, [field]: value };
      if (activeTab === 'FINISHED_GOODS') {
        if (field === 'totalQty') {
          const total = Number(value) || 0;
          const fail = Number(next.failedQty) || 0;
          next.quantity = String(Math.max(0, total - fail));
        } else if (field === 'quantity') {
          const total = Number(next.totalQty) || 0;
          const pass = Number(value) || 0;
          if (next.totalQty !== '') next.failedQty = String(Math.max(0, total - pass));
          else next.totalQty = String(pass + (Number(next.failedQty) || 0));
        } else if (field === 'failedQty') {
          const total = Number(next.totalQty) || 0;
          const fail = Number(value) || 0;
          if (next.totalQty !== '') next.quantity = String(Math.max(0, total - fail));
        }
        const numFail = Number(next.failedQty) || 0;
        if (numFail > 0 && (!next.defectCategory || next.defectCategory === 'NONE')) {
          next.defectCategory = 'SEWING_DEFECT';
        } else if (numFail === 0) {
          next.defectCategory = 'NONE';
          next.defectNote = '';
        }
      }
      return next;
    });
  };

  const handleSaveLot = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...formData, lotType: editingLot ? editingLot.lotType : activeTab };
      if (editingLot) {
        await garmentTechnicalService.lots.updateLot(editingLot._id, payload);
        showAlert('success', `Đã cập nhật lô ${editingLot.lotCode}!`);
      } else {
        const res = await garmentTechnicalService.lots.createLot(payload);
        showAlert('success', `Đã tạo lô mới ${res?.data?.lotCode || ''} (QR: ${res?.data?.qrValue || ''})!`);
      }
      setFormModalOpen(false);
      fetchLots();
    } catch (err) {
      showAlert('error', err.message || 'Không thể lưu thông tin lô');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteLot = async (lot) => {
    if (!window.confirm(`Xóa lô nháp ${lot.lotCode}?`)) return;
    try {
      await garmentTechnicalService.lots.deleteLot(lot._id);
      showAlert('success', `Đã xóa lô nháp ${lot.lotCode}`);
      fetchLots();
    } catch (err) {
      showAlert('error', err.message || 'Không thể xóa lô');
    }
  };

  const openSendModal = () => {
    if (selectedIds.length === 0) {
      showAlert('warning', 'Vui lòng tích chọn ít nhất một lô Nháp để gửi Quản lý kho');
      return;
    }
    if (activeTab === 'RAW_MATERIAL') {
      const missingSupplier = selectedLots.some((l) => !(l.supplierId?._id || l.supplierId));
      if (missingSupplier) {
        showAlert('error', 'Tất cả các lô nguyên phụ liệu phải có Nhà cung cấp trước khi gửi Quản lý kho');
        return;
      }
      const uniqueSuppliers = new Set(selectedLots.map((l) => String(l.supplierId?._id || l.supplierId)));
      if (uniqueSuppliers.size > 1) {
        showAlert(
          'warning',
          'Các lô nguyên phụ liệu trong cùng 1 phiếu yêu cầu nhập kho phải thuộc cùng 1 Nhà cung cấp. Vui lòng chỉ chọn các lô cùng Nhà cung cấp!'
        );
        return;
      }
    }
    setSendQcNote('');
    setSendRequestNote('');
    setSendDefectAction(selectedHasDefect ? 'REPAIR_AT_WORKSHOP' : 'NONE');
    setSendModalOpen(true);
  };

  const handleConfirmSendToWarehouse = async () => {
    setSending(true);
    try {
      const res = await garmentTechnicalService.lots.sendInboundRequest({
        lotType: activeTab,
        lotIds: selectedIds,
        qcNote: sendQcNote.trim(),
        defectAction: selectedHasDefect ? sendDefectAction : 'NONE',
        requestNote: sendRequestNote.trim(),
      });
      const ticketCode = res?.data?.ticket?.ticketCode || '';
      showAlert(
        'success',
        `Đã gửi ${res?.data?.sentCount || selectedIds.length} lô sang Quản lý kho — Mã phiếu: ${ticketCode}! Quản lý kho có thể sinh QR theo từng mã lô.`
      );
      setSendModalOpen(false);
      setSelectedIds([]);
      fetchLots();
    } catch (err) {
      showAlert('error', err.message || 'Không thể gửi yêu cầu nhập kho');
    } finally {
      setSending(false);
    }
  };

  const copyQrValue = (val) => {
    navigator.clipboard?.writeText(val).then(
      () => showAlert('success', `Đã sao chép chuỗi QR: ${val}`),
      () => {}
    );
  };

  return (
    <div style={{ padding: '1.5rem', maxWidth: 1440, margin: '0 auto' }}>
      {/* Toast Alert */}
      {alert && (
        <div
          role="alert"
          style={{
            position: 'fixed',
            top: 78,
            right: 24,
            zIndex: 9999,
            maxWidth: 480,
            padding: '0.85rem 1.1rem',
            borderRadius: 10,
            boxShadow: '0 10px 25px rgba(0,0,0,0.14)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: alert.type === 'success' ? '#ECFDF5' : alert.type === 'warning' ? '#FFFBEB' : '#FEF2F2',
            border: `1px solid ${alert.type === 'success' ? '#6EE7B7' : alert.type === 'warning' ? '#FCD34D' : '#FCA5A5'}`,
            color: alert.type === 'success' ? '#065F46' : alert.type === 'warning' ? '#92400E' : '#991B1B',
            fontSize: '0.88rem',
            fontWeight: 500,
          }}
        >
          {alert.type === 'success' ? <CheckCircle2 size={18} /> : alert.type === 'warning' ? <AlertTriangle size={18} /> : <XCircle size={18} />}
          <span style={{ flex: 1 }}>{alert.message}</span>
          <button type="button" onClick={() => setAlert(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* Header */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: '1.25rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: '#111827', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Layers size={24} color="#8A6A46" />
            Quản lý Lô Hàng (Thành phẩm &amp; Nguyên phụ liệu)
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: '0.88rem', color: '#4B5563' }}>
            Khai báo &amp; quản lý mã lô trước khi nhập kho, gắn chuỗi QR chuẩn (<code>LOT:FG:...</code> / <code>LOT:RM:...</code>) và chọn nhiều lô gửi yêu cầu sang Quản lý kho để duyệt nhập &amp; sinh tem QR cho từng lô.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={fetchLots}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '0.55rem 0.9rem',
              borderRadius: 8,
              border: '1px solid #D1D5DB',
              background: '#FFF',
              color: '#374151',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <RefreshCw size={15} /> Làm mới
          </button>
          <button
            type="button"
            onClick={openCreateModal}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '0.55rem 1rem',
              borderRadius: 8,
              border: 'none',
              background: '#111827',
              color: '#FFF',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <Plus size={16} /> Tạo Lô {activeTab === 'FINISHED_GOODS' ? 'Thành phẩm' : 'Nguyên phụ liệu'}
          </button>
        </div>
      </header>

      {/* Main Type Tabs */}
      <div style={{ display: 'flex', gap: 10, marginBottom: '1.15rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => {
            setActiveTab('FINISHED_GOODS');
            setPage(1);
          }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '0.65rem 1.15rem',
            borderRadius: 10,
            border: `1.5px solid ${activeTab === 'FINISHED_GOODS' ? '#111827' : '#D1D5DB'}`,
            background: activeTab === 'FINISHED_GOODS' ? '#111827' : '#FFF',
            color: activeTab === 'FINISHED_GOODS' ? '#FFF' : '#374151',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          <Shirt size={17} /> Lô Thành Phẩm ({stats.fgCount})
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab('RAW_MATERIAL');
            setPage(1);
          }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '0.65rem 1.15rem',
            borderRadius: 10,
            border: `1.5px solid ${activeTab === 'RAW_MATERIAL' ? '#111827' : '#D1D5DB'}`,
            background: activeTab === 'RAW_MATERIAL' ? '#111827' : '#FFF',
            color: activeTab === 'RAW_MATERIAL' ? '#FFF' : '#374151',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          <Package size={17} /> Lô Nguyên Phụ Liệu ({stats.rmCount})
        </button>
      </div>

      {/* KPI Strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: '1.25rem' }}>
        {[
          { label: 'Lô nháp (Chưa gửi kho)', value: stats.draftCount, color: '#374151', bg: '#F3F4F6' },
          { label: 'Đã gửi Quản lý kho (Chờ nhập)', value: stats.requestedCount, color: '#B45309', bg: '#FEF3C7' },
          { label: 'Kho đã nhập xong', value: stats.receivedCount, color: '#047857', bg: '#ECFDF5' },
        ].map((kpi) => (
          <div
            key={kpi.label}
            style={{
              background: '#FFF',
              border: '1px solid #E5E7EB',
              borderRadius: 12,
              padding: '0.9rem 1.1rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <div style={{ fontSize: '0.78rem', color: '#6B7280', fontWeight: 600 }}>{kpi.label}</div>
              <div style={{ fontSize: '1.45rem', fontWeight: 800, color: kpi.color, marginTop: 4 }}>{kpi.value || 0}</div>
            </div>
            <div style={{ width: 9, height: 34, borderRadius: 6, background: kpi.bg }} />
          </div>
        ))}
      </div>

      {/* Filter & Batch Action Bar */}
      <section style={{ background: '#FFF', border: '1px solid #E5E7EB', borderRadius: 14, padding: '1.1rem 1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: '1rem' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {[
              { key: 'ALL', label: 'Tất cả' },
              { key: 'DRAFT', label: 'Lô nháp' },
              { key: 'REQUESTED', label: 'Đã gửi Quản lý kho' },
              { key: 'RECEIVED', label: 'Đã nhập kho' },
            ].map((pill) => (
              <button
                key={pill.key}
                type="button"
                onClick={() => {
                  setStatusFilter(pill.key);
                  setPage(1);
                }}
                style={{
                  padding: '5px 12px',
                  borderRadius: 999,
                  border: `1px solid ${statusFilter === pill.key ? '#111827' : '#D1D5DB'}`,
                  background: statusFilter === pill.key ? '#111827' : '#FFF',
                  color: statusFilter === pill.key ? '#FFF' : '#374151',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {pill.label}
              </button>
            ))}

            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setPage(1);
                    fetchLots();
                  }
                }}
                placeholder="Tìm mã lô, mã sản phẩm, nguyên phụ liệu, xưởng, nhà cung cấp..."
                style={{ padding: '5px 10px 5px 28px', borderRadius: 8, border: '1px solid #D1D5DB', fontSize: '0.82rem', minWidth: 230 }}
              />
            </div>
          </div>

          <button
            type="button"
            disabled={selectedIds.length === 0}
            onClick={openSendModal}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '0.55rem 1.05rem',
              borderRadius: 8,
              border: 'none',
              background: selectedIds.length ? '#059669' : '#9CA3AF',
              color: '#FFF',
              fontWeight: 700,
              fontSize: '0.85rem',
              cursor: selectedIds.length ? 'pointer' : 'not-allowed',
            }}
          >
            <Send size={15} /> Gửi yêu cầu nhập kho ({selectedIds.length} lô)
          </button>
        </div>

        {/* Lots Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
            <thead>
              <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB', textAlign: 'left', color: '#4B5563' }}>
                <th style={{ padding: '10px', width: 38 }}>
                  <input
                    type="checkbox"
                    checked={draftLots.length > 0 && selectedIds.length === draftLots.length}
                    disabled={draftLots.length === 0}
                    onChange={toggleSelectAllDrafts}
                    title="Chọn tất cả lô nháp trên trang"
                  />
                </th>
                <th style={{ padding: '10px' }}>Mã Lô &amp; Chuỗi QR</th>
                <th style={{ padding: '10px' }}>{activeTab === 'FINISHED_GOODS' ? 'Thành phẩm / Mã sản phẩm' : 'Nguyên phụ liệu'}</th>
                <th style={{ padding: '10px' }}>Số lượng</th>
                <th style={{ padding: '10px' }}>{activeTab === 'FINISHED_GOODS' ? 'Xưởng / Lệnh sản xuất / Ngày may' : 'Nhà cung cấp / Lô nhà cung cấp / Lô nhuộm'}</th>
                <th style={{ padding: '10px' }}>Trạng thái &amp; Phiếu kho</th>
                <th style={{ padding: '10px', textAlign: 'right' }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: '#6B7280' }}>
                    Đang tải danh sách lô hàng...
                  </td>
                </tr>
              ) : lots.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '2.2rem', textAlign: 'center', color: '#6B7280' }}>
                    Chưa có lô nào. Hãy bấm <strong>"Tạo Lô"</strong> để khai báo lô mới rồi gửi sang Quản lý kho.
                  </td>
                </tr>
              ) : (
                lots.map((lot) => {
                  const st = STATUS_META[lot.status] || STATUS_META.DRAFT;
                  const isDraft = lot.status === 'DRAFT';
                  return (
                    <tr key={lot._id} style={{ borderBottom: '1px solid #F3F4F6', background: selectedIds.includes(lot._id) ? '#F0FDF4' : '#FFF' }}>
                      <td style={{ padding: '10px' }}>
                        <input
                          type="checkbox"
                          disabled={!isDraft}
                          checked={selectedIds.includes(lot._id)}
                          onChange={() => toggleSelect(lot._id)}
                          style={{ cursor: isDraft ? 'pointer' : 'not-allowed' }}
                        />
                      </td>
                      <td style={{ padding: '10px' }}>
                        <div style={{ fontWeight: 700, fontFamily: 'monospace', color: '#111827' }}>{lot.lotCode}</div>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 3 }}>
                          <span style={{ fontSize: '0.73rem', fontFamily: 'monospace', color: '#2563EB', background: '#EFF6FF', padding: '1px 6px', borderRadius: 4 }}>
                            <QrCode size={11} style={{ verticalAlign: 'middle', marginRight: 3 }} />
                            {lot.qrValue}
                          </span>
                          <button
                            type="button"
                            onClick={() => copyQrValue(lot.qrValue)}
                            title="Sao chép chuỗi QR"
                            style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#6B7280', padding: 2 }}
                          >
                            <Copy size={12} />
                          </button>
                        </div>
                      </td>
                      <td style={{ padding: '10px' }}>
                        {lot.lotType === 'FINISHED_GOODS' ? (
                          <>
                            <div style={{ fontWeight: 600 }}>{translateProductNameVi(lot.productName || lot.skuCode)}</div>
                            <div style={{ fontSize: '0.76rem', color: '#6B7280' }}>
                              Mã sản phẩm: <strong>{lot.skuCode}</strong>{' '}
                              {[lot.color && `Màu ${translateColorVi(lot.color)}`, lot.size && `Cỡ ${lot.size}`].filter(Boolean).join(' · ')}
                            </div>
                          </>
                        ) : (
                          <>
                            <div style={{ fontWeight: 600 }}>{lot.materialName || lot.materialCode}</div>
                            <div style={{ fontSize: '0.76rem', color: '#6B7280' }}>
                              Mã: <strong>{lot.materialCode}</strong> · {lot.materialType === 'FABRIC' ? 'Vải' : 'Phụ liệu'} {lot.color ? `· ${translateColorVi(lot.color)}` : ''}
                            </div>
                          </>
                        )}
                      </td>
                      <td style={{ padding: '10px' }}>
                        {lot.lotType === 'FINISHED_GOODS' ? (
                          <div>
                            <strong style={{ color: '#047857' }}>{lot.quantity} đạt</strong>
                            {lot.failedQty > 0 && (
                              <span style={{ color: '#B91C1C', marginLeft: 6, fontWeight: 600 }}>
                                / {lot.failedQty} lỗi
                              </span>
                            )}
                            {lot.failedQty > 0 && lot.defectCategory && lot.defectCategory !== 'NONE' && (
                              <div style={{ fontSize: '0.74rem', color: '#B91C1C' }}>
                                {DEFECT_CATEGORY_LABELS[lot.defectCategory] || lot.defectCategory}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div>
                            <strong>{lot.quantity}</strong> {formatUnitVi(lot.unit)}
                            {lot.packageCount > 0 && (
                              <div style={{ fontSize: '0.75rem', color: '#6B7280' }}>
                                {lot.packageCount} {lot.packageUnit || 'kiện'}
                                {lot.unitsPerPackage ? ` × ${lot.unitsPerPackage}` : ''}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '10px', fontSize: '0.8rem', color: '#4B5563' }}>
                        {lot.lotType === 'FINISHED_GOODS' ? (
                          <>
                            <div>{lot.workshopName || 'Xưởng mặc định'}{lot.productionOrderCode ? ` · Lệnh sản xuất: ${lot.productionOrderCode}` : ''}</div>
                            <div style={{ fontSize: '0.75rem', color: '#6B7280' }}>Ngày sản xuất: {formatDate(lot.productionDate)}</div>
                          </>
                        ) : (
                          <>
                            <div>{lot.supplierNameSnapshot || lot.supplierId?.supplierName || '—'}</div>
                            <div style={{ fontSize: '0.75rem', color: '#6B7280' }}>
                              {[
                                lot.inboundPlanId?.planCode && `Kế hoạch: ${lot.inboundPlanId.planCode}`,
                                lot.supplierLotCode && `Lô nhà cung cấp: ${lot.supplierLotCode}`,
                                lot.dyeLot && `Lô nhuộm: ${lot.dyeLot}`,
                              ].filter(Boolean).join(' · ') || '—'}
                            </div>
                          </>
                        )}
                      </td>
                      <td style={{ padding: '10px' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '3px 9px',
                            borderRadius: 999,
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            background: st.bg,
                            color: st.color,
                            border: `1px solid ${st.border}`,
                          }}
                        >
                          {st.label}
                        </span>
                        {lot.linkedTicketCode && (
                          <div style={{ fontSize: '0.76rem', fontFamily: 'monospace', color: '#1F2937', marginTop: 4, fontWeight: 700 }}>
                            Phiếu: {lot.linkedTicketCode}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '10px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button
                          type="button"
                          onClick={() => setViewingLot(lot)}
                          style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #D1D5DB', background: '#FFF', cursor: 'pointer', marginRight: 5 }}
                          title="Xem chi tiết lô"
                        >
                          <Eye size={14} />
                        </button>
                        {isDraft && (
                          <>
                            <button
                              type="button"
                              onClick={() => openEditModal(lot)}
                              style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #BFDBFE', background: '#EFF6FF', color: '#1D4ED8', cursor: 'pointer', marginRight: 5 }}
                              title="Sửa lô nháp"
                            >
                              <Edit3 size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteLot(lot)}
                              style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #FECACA', background: '#FEF2F2', color: '#B91C1C', cursor: 'pointer' }}
                              title="Xóa lô nháp"
                            >
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #D1D5DB', background: '#FFF' }}>
              Trước
            </button>
            <span style={{ fontSize: '0.84rem', alignSelf: 'center' }}>
              Trang {page} / {totalPages}
            </span>
            <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #D1D5DB', background: '#FFF' }}>
              Sau
            </button>
          </div>
        )}
      </section>

      {/* ===================================================================== */}
      {/* MODAL: CREATE / EDIT LOT                                              */}
      {/* ===================================================================== */}
      {formModalOpen && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => setFormModalOpen(false)}
        >
          <form
            onSubmit={handleSaveLot}
            onClick={(e) => e.stopPropagation()}
            style={{ background: '#FFF', borderRadius: 14, maxWidth: 680, width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: '1.25rem 1.4rem' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem' }}>
                {editingLot ? `Chỉnh sửa Lô ${editingLot.lotCode}` : `Tạo Lô ${activeTab === 'FINISHED_GOODS' ? 'Thành Phẩm' : 'Nguyên Phụ Liệu'} mới`}
              </h3>
              <button type="button" onClick={() => setFormModalOpen(false)} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            {activeTab === 'FINISHED_GOODS' ? (
              <div style={{ display: 'grid', gap: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 10 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>Sản phẩm thành phẩm *</label>
                    <select
                      required
                      value={formData.skuId}
                      onChange={(e) => handleFormField('skuId', e.target.value)}
                      style={{ width: '100%', padding: '0.55rem', borderRadius: 8, border: '1px solid #D1D5DB' }}
                    >
                      <option value="">-- Chọn sản phẩm thành phẩm --</option>
                      {options.skus.map((sku) => (
                        <option key={sku._id} value={sku._id}>
                          {sku.skuCode} — {translateProductNameVi(sku.styleName || sku.productId?.productName)} ({[translateColorVi(sku.color), sku.size && `Cỡ ${sku.size}`].filter(Boolean).join(' / ')})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>Mã Lô (để trống tự sinh)</label>
                    <input
                      value={formData.lotCode}
                      onChange={(e) => handleFormField('lotCode', e.target.value.toUpperCase())}
                      placeholder="Ví dụ: LOT-TP-000001"
                      style={{ width: '100%', padding: '0.55rem', borderRadius: 8, border: '1px solid #D1D5DB', fontFamily: 'monospace' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>Tổng may *</label>
                    <input
                      type="number"
                      min="1"
                      required
                      value={formData.totalQty}
                      onChange={(e) => handleFormField('totalQty', e.target.value)}
                      style={{ width: '100%', padding: '0.55rem', borderRadius: 8, border: '1px solid #D1D5DB' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#047857', marginBottom: 4 }}>Đạt kiểm định (Nhập kho) *</label>
                    <input
                      type="number"
                      min="1"
                      max="500"
                      required
                      value={formData.quantity}
                      onChange={(e) => handleFormField('quantity', e.target.value)}
                      style={{ width: '100%', padding: '0.55rem', borderRadius: 8, border: '1.5px solid #10B981' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#B91C1C', marginBottom: 4 }}>Lỗi / Hỏng</label>
                    <input
                      type="number"
                      min="0"
                      value={formData.failedQty}
                      onChange={(e) => handleFormField('failedQty', e.target.value)}
                      style={{ width: '100%', padding: '0.55rem', borderRadius: 8, border: '1.5px solid #EF4444' }}
                    />
                  </div>
                </div>

                {(Number(formData.failedQty) || 0) > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: 10, padding: 10, borderRadius: 8, background: '#FEF2F2', border: '1px solid #FECACA' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#991B1B', marginBottom: 4 }}>Nhóm lỗi (Thống kê tổng quan)</label>
                      <select
                        value={formData.defectCategory === 'NONE' ? 'SEWING_DEFECT' : formData.defectCategory}
                        onChange={(e) => handleFormField('defectCategory', e.target.value)}
                        style={{ width: '100%', padding: '0.5rem', borderRadius: 6, border: '1px solid #FCA5A5' }}
                      >
                        {DEFECT_CATEGORIES.map((c) => (
                          <option key={c.value} value={c.value}>{c.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#991B1B', marginBottom: 4 }}>Ghi chú lỗi chi tiết</label>
                      <input
                        value={formData.defectNote}
                        onChange={(e) => handleFormField('defectNote', e.target.value)}
                        placeholder="Bung chỉ cổ áo, rách gấu..."
                        style={{ width: '100%', padding: '0.5rem', borderRadius: 6, border: '1px solid #FCA5A5' }}
                      />
                    </div>
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>Ngày sản xuất / May</label>
                    <input
                      type="date"
                      value={formData.productionDate}
                      onChange={(e) => handleFormField('productionDate', e.target.value)}
                      style={{ width: '100%', padding: '0.55rem', borderRadius: 8, border: '1px solid #D1D5DB' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>Xưởng / Chuyền may</label>
                    <input
                      value={formData.workshopName}
                      onChange={(e) => handleFormField('workshopName', e.target.value)}
                      placeholder="Ví dụ: Chuyền may 1"
                      style={{ width: '100%', padding: '0.55rem', borderRadius: 8, border: '1px solid #D1D5DB' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>Mã lệnh sản xuất</label>
                    <input
                      value={formData.productionOrderCode}
                      onChange={(e) => handleFormField('productionOrderCode', e.target.value)}
                      placeholder="Ví dụ: LSX-2026-08"
                      style={{ width: '100%', padding: '0.55rem', borderRadius: 8, border: '1px solid #D1D5DB' }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>Ghi chú lô</label>
                  <textarea
                    rows={2}
                    value={formData.note}
                    onChange={(e) => handleFormField('note', e.target.value)}
                    placeholder="Ghi chú thêm cho Quản lý kho khi sinh QR & xếp kệ..."
                    style={{ width: '100%', padding: '0.55rem', borderRadius: 8, border: '1px solid #D1D5DB' }}
                  />
                </div>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 10 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>Nguyên phụ liệu *</label>
                    <select
                      required
                      value={formData.rawMaterialId}
                      onChange={(e) => handleFormField('rawMaterialId', e.target.value)}
                      style={{ width: '100%', padding: '0.55rem', borderRadius: 8, border: '1px solid #D1D5DB' }}
                    >
                      <option value="">-- Chọn nguyên phụ liệu --</option>
                      {options.materials.map((m) => (
                        <option key={m._id} value={m._id}>
                          {m.materialCode} — {m.materialName} ({formatUnitVi(m.unit)})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>Mã Lô (để trống tự sinh)</label>
                    <input
                      value={formData.lotCode}
                      onChange={(e) => handleFormField('lotCode', e.target.value.toUpperCase())}
                      placeholder="Ví dụ: LOT-NL-000001"
                      style={{ width: '100%', padding: '0.55rem', borderRadius: 8, border: '1px solid #D1D5DB', fontFamily: 'monospace' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 10 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>Số lượng nhập kho *</label>
                    <input
                      type="number"
                      step="any"
                      min="0.001"
                      required
                      value={formData.quantity}
                      onChange={(e) => handleFormField('quantity', e.target.value)}
                      style={{ width: '100%', padding: '0.55rem', borderRadius: 8, border: '1px solid #D1D5DB' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>Nhà cung cấp *</label>
                    <select
                      required
                      value={formData.supplierId}
                      onChange={(e) => handleFormField('supplierId', e.target.value)}
                      style={{ width: '100%', padding: '0.55rem', borderRadius: 8, border: '1px solid #D1D5DB' }}
                    >
                      <option value="">-- Chọn nhà cung cấp --</option>
                      {options.suppliers.map((s) => (
                        <option key={s._id} value={s._id}>{s.supplierName} ({s.supplierCode})</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>Mã lô nhà cung cấp</label>
                    <input
                      value={formData.supplierLotCode}
                      onChange={(e) => handleFormField('supplierLotCode', e.target.value)}
                      placeholder="Ví dụ: SUP-LOT-26A"
                      style={{ width: '100%', padding: '0.55rem', borderRadius: 8, border: '1px solid #D1D5DB' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>Mã lô nhuộm vải</label>
                    <input
                      value={formData.dyeLot}
                      onChange={(e) => handleFormField('dyeLot', e.target.value)}
                      placeholder="Ví dụ: DYE-BLK-09"
                      style={{ width: '100%', padding: '0.55rem', borderRadius: 8, border: '1px solid #D1D5DB' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>Đơn vị đóng gói</label>
                    <input
                      value={formData.packageUnit}
                      onChange={(e) => handleFormField('packageUnit', e.target.value)}
                      placeholder="Cây / Cuộn / Hộp..."
                      style={{ width: '100%', padding: '0.55rem', borderRadius: 8, border: '1px solid #D1D5DB' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>Số kiện / gói</label>
                    <input
                      type="number"
                      min="0"
                      value={formData.packageCount}
                      onChange={(e) => handleFormField('packageCount', e.target.value)}
                      style={{ width: '100%', padding: '0.55rem', borderRadius: 8, border: '1px solid #D1D5DB' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>Số lượng mỗi kiện</label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={formData.unitsPerPackage}
                      onChange={(e) => handleFormField('unitsPerPackage', e.target.value)}
                      style={{ width: '100%', padding: '0.55rem', borderRadius: 8, border: '1px solid #D1D5DB' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>Ngày sản xuất</label>
                    <input
                      type="date"
                      value={formData.manufactureDate}
                      onChange={(e) => handleFormField('manufactureDate', e.target.value)}
                      style={{ width: '100%', padding: '0.55rem', borderRadius: 8, border: '1px solid #D1D5DB' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>Hạn sử dụng (nếu có)</label>
                    <input
                      type="date"
                      value={formData.expiryDate}
                      onChange={(e) => handleFormField('expiryDate', e.target.value)}
                      style={{ width: '100%', padding: '0.55rem', borderRadius: 8, border: '1px solid #D1D5DB' }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>Ghi chú lô</label>
                  <textarea
                    rows={2}
                    value={formData.note}
                    onChange={(e) => handleFormField('note', e.target.value)}
                    placeholder="Ghi chú kiểm tra chất lượng / quy cách lô nguyên phụ liệu..."
                    style={{ width: '100%', padding: '0.55rem', borderRadius: 8, border: '1px solid #D1D5DB' }}
                  />
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16, paddingTop: 12, borderTop: '1px solid #E5E7EB' }}>
              <button type="button" onClick={() => setFormModalOpen(false)} style={{ padding: '0.55rem 1rem', borderRadius: 8, border: '1px solid #D1D5DB', background: '#FFF', cursor: 'pointer' }}>
                Hủy
              </button>
              <button
                type="submit"
                disabled={saving}
                style={{ padding: '0.55rem 1.2rem', borderRadius: 8, border: 'none', background: '#111827', color: '#FFF', fontWeight: 700, cursor: 'pointer' }}
              >
                {saving ? 'Đang lưu...' : editingLot ? 'Lưu thay đổi' : 'Tạo Lô (Nháp)'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: SEND SELECTED LOTS TO WAREHOUSE MANAGER                        */}
      {/* ===================================================================== */}
      {sendModalOpen && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => setSendModalOpen(false)}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#FFF', borderRadius: 14, maxWidth: 560, width: '100%', padding: '1.25rem 1.4rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>Gửi {selectedLots.length} lô sang Quản lý kho</h3>
              <button type="button" onClick={() => setSendModalOpen(false)} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>
            <p style={{ fontSize: '0.85rem', color: '#4B5563', marginTop: 0 }}>
              Hệ thống sẽ tạo 1 phiếu yêu cầu nhập kho ({activeTab === 'FINISHED_GOODS' ? 'Phiếu nhập thành phẩm' : 'Yêu cầu nhập nguyên phụ liệu'}) chứa đầy đủ mã lô &amp; chuỗi QR của từng lô để Quản lý kho duyệt nhập và sinh tem QR.
            </p>
            <div style={{ maxHeight: 170, overflowY: 'auto', border: '1px solid #E5E7EB', borderRadius: 8, padding: 8, marginBottom: 12, background: '#F9FAFB' }}>
              {selectedLots.map((l) => (
                <div key={l._id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', padding: '4px 2px', borderBottom: '1px dashed #E5E7EB' }}>
                  <span>
                    <strong style={{ fontFamily: 'monospace' }}>{l.lotCode}</strong> · {l.lotType === 'FINISHED_GOODS' ? `${l.skuCode} (${translateProductNameVi(l.productName)})` : `${l.materialCode} (${l.materialName})`}
                  </span>
                  <strong>
                    {l.quantity} {formatUnitVi(l.unit, 'Cái')}
                  </strong>
                </div>
              ))}
            </div>

            {activeTab === 'FINISHED_GOODS' ? (
              <div style={{ display: 'grid', gap: 10 }}>
                {selectedHasDefect && (
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>Hướng xử lý hàng lỗi</label>
                    <select
                      value={sendDefectAction}
                      onChange={(e) => setSendDefectAction(e.target.value)}
                      style={{ width: '100%', padding: '0.5rem', borderRadius: 8, border: '1px solid #D1D5DB' }}
                    >
                      <option value="REPAIR_AT_WORKSHOP">Sửa chữa lại tại xưởng may</option>
                      <option value="LIQUIDATION">Hạ cấp / Thanh lý hàng loại B</option>
                      <option value="DESTRUCTION">Tiêu hủy</option>
                    </select>
                  </div>
                )}
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>Biên bản / Ghi chú kiểm định gửi Quản lý kho</label>
                  <textarea
                    rows={3}
                    value={sendQcNote}
                    onChange={(e) => setSendQcNote(e.target.value)}
                    placeholder="Nhập ghi chú bàn giao lô thành phẩm (tùy chọn)..."
                    style={{ width: '100%', padding: '0.55rem', borderRadius: 8, border: '1px solid #D1D5DB' }}
                  />
                </div>
              </div>
            ) : (
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>Ghi chú yêu cầu nhập nguyên phụ liệu gửi Quản lý kho</label>
                <textarea
                  rows={3}
                  value={sendRequestNote}
                  onChange={(e) => setSendRequestNote(e.target.value)}
                  placeholder="Ghi chú bàn giao lô nguyên phụ liệu (tùy chọn)..."
                  style={{ width: '100%', padding: '0.55rem', borderRadius: 8, border: '1px solid #D1D5DB' }}
                />
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
              <button type="button" onClick={() => setSendModalOpen(false)} style={{ padding: '0.55rem 1rem', borderRadius: 8, border: '1px solid #D1D5DB', background: '#FFF' }}>
                Hủy
              </button>
              <button
                type="button"
                disabled={sending}
                onClick={handleConfirmSendToWarehouse}
                style={{ padding: '0.55rem 1.15rem', borderRadius: 8, border: 'none', background: '#059669', color: '#FFF', fontWeight: 700, cursor: 'pointer' }}
              >
                {sending ? 'Đang gửi...' : 'Xác nhận gửi Quản lý kho'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: VIEW LOT DETAILS                                               */}
      {/* ===================================================================== */}
      {viewingLot && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => setViewingLot(null)}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#FFF', borderRadius: 14, maxWidth: 620, width: '100%', padding: '1.25rem 1.4rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <h3 style={{ margin: 0, fontFamily: 'monospace' }}>{viewingLot.lotCode}</h3>
                <div style={{ fontSize: '0.8rem', color: '#6B7280' }}>
                  {viewingLot.lotType === 'FINISHED_GOODS' ? 'Lô Thành Phẩm' : 'Lô Nguyên Phụ Liệu'} · Tạo lúc {formatDateTime(viewingLot.createdAt)}
                </div>
              </div>
              <button type="button" onClick={() => setViewingLot(null)} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: 10, borderRadius: 8, background: '#EFF6FF', border: '1px solid #BFDBFE', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#1E40AF', fontWeight: 700 }}>CHUỖI QR LÔ (GỬI QUẢN LÝ KHO SINH TEM QR)</div>
                <div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '0.98rem', color: '#111827' }}>{viewingLot.qrValue}</div>
              </div>
              <button type="button" onClick={() => copyQrValue(viewingLot.qrValue)} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #2563EB', background: '#FFF', color: '#1D4ED8', fontWeight: 600, cursor: 'pointer' }}>
                Sao chép
              </button>
            </div>

            {viewingLot.qrImageUrl && (
              <div style={{ textAlign: 'center', marginBottom: 12 }}>
                <img src={viewingLot.qrImageUrl} alt={viewingLot.qrValue} style={{ width: 160, height: 160, border: '1px solid #E5E7EB', borderRadius: 8 }} />
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: '0.85rem' }}>
              <div><strong>Trạng thái:</strong> {STATUS_META[viewingLot.status]?.label || formatStatusVi(viewingLot.status)}</div>
              <div><strong>Phiếu nhập liên kết:</strong> {viewingLot.linkedTicketCode || 'Chưa gửi kho'}</div>
              {viewingLot.lotType === 'FINISHED_GOODS' ? (
                <>
                  <div><strong>Mã sản phẩm:</strong> {viewingLot.skuCode} ({translateProductNameVi(viewingLot.productName)})</div>
                  <div><strong>Số lượng:</strong> {viewingLot.quantity} đạt / {viewingLot.failedQty || 0} lỗi</div>
                  <div><strong>Xưởng / Lệnh sản xuất:</strong> {viewingLot.workshopName || '—'} / {viewingLot.productionOrderCode || '—'}</div>
                  <div><strong>Ngày sản xuất:</strong> {formatDate(viewingLot.productionDate)}</div>
                </>
              ) : (
                <>
                  <div><strong>Nguyên phụ liệu:</strong> {viewingLot.materialCode} — {viewingLot.materialName}</div>
                  <div><strong>Số lượng:</strong> {viewingLot.quantity} {formatUnitVi(viewingLot.unit)}</div>
                  <div><strong>Nhà cung cấp:</strong> {viewingLot.supplierNameSnapshot || '—'}</div>
                  <div><strong>Lô nhà cung cấp / Lô nhuộm:</strong> {viewingLot.supplierLotCode || '—'} / {viewingLot.dyeLot || '—'}</div>
                </>
              )}
            </div>

            {viewingLot.note && (
              <div style={{ marginTop: 12, padding: 10, borderRadius: 8, background: '#F9FAFB', fontSize: '0.84rem' }}>
                <strong>Ghi chú:</strong> {viewingLot.note}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
