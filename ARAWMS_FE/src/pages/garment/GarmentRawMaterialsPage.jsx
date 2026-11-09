/**
 * ============================================================================
 * @title        : Garment Raw Materials Page
 * @author       : AraWMS Team
 * @createdDate  : 2026-11-09
 * @lastModified : 2026-11-09
 * @description  : Giao diện Quản lý Kho & Danh Mục Nguyên Phụ Liệu cho Kỹ thuật viên xưởng may (Garment Technician / KCS).
 *                 Hỗ trợ Thêm, Sửa, Xóa (vô hiệu hóa an toàn), lọc phân loại, tra cứu tồn kho khả dụng và cảnh báo thiếu hàng.
 * @module       : Garment Technical / Raw Materials
 * @layer        : Front-end (Page)
 * ============================================================================
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Package,
  Plus,
  Search,
  Filter,
  Edit3,
  Trash2,
  Eye,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  X,
  Layers,
  Sliders,
  ShieldCheck,
  ShieldAlert,
  ArrowUpDown,
  Tag,
  ToggleLeft,
  ToggleRight,
  Info,
} from 'lucide-react';
import garmentTechnicalService from '../../services/garmentTechnicalService';

export default function GarmentRawMaterialsPage() {
  // State: Data & Loading
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [stats, setStats] = useState({
    totalMaterials: 0,
    fabricMaterials: 0,
    auxiliaryMaterials: 0,
    activeMaterials: 0,
    lowStockMaterials: 0,
  });

  // State: Metadata options
  const [meta, setMeta] = useState({
    suppliers: [],
    units: [],
    categories: [],
    types: [],
  });

  // State: Filters & Pagination
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL'); // 'ALL' | 'FABRIC' | 'AUXILIARY'
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'ACTIVE' | 'INACTIVE'
  const [lowStockFilter, setLowStockFilter] = useState(false);
  const [sortBy, setSortBy] = useState('createdAt_desc');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // State: Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState(null);
  const [viewingMaterial, setViewingMaterial] = useState(null);
  const [deletingMaterial, setDeletingMaterial] = useState(null);

  // State: Form
  const initialFormState = {
    materialCode: '',
    materialName: '',
    materialType: 'FABRIC',
    category: 'FABRIC_ROLL',
    unit: 'METER',
    color: '',
    gsm: '',
    widthCm: '',
    requiresWeightKg: false,
    unitCost: 0,
    safetyStockThreshold: 50,
    fifoAgingThresholdDays: 90,
    supplierId: '',
    isActive: true,
  };
  const [form, setForm] = useState(initialFormState);
  const [formError, setFormError] = useState('');

  // State: Alerts
  const [alert, setAlert] = useState(null);
  const showAlert = (type, message) => {
    setAlert({ type, message });
    setTimeout(() => setAlert(null), 6000);
  };

  // 1. Tải siêu dữ liệu (Suppliers, Units, Categories)
  useEffect(() => {
    garmentTechnicalService.materials
      .getMeta()
      .then((res) => {
        if (res?.data) {
          setMeta(res.data);
        }
      })
      .catch((err) => console.error('Lỗi nạp siêu dữ liệu NPL:', err));
  }, []);

  // 2. Tải danh sách nguyên phụ liệu
  const fetchMaterials = async () => {
    setLoading(true);
    try {
      const params = {
        page,
        limit: 15,
        search: search.trim() || undefined,
        materialType: typeFilter !== 'ALL' ? typeFilter : undefined,
        category: categoryFilter !== 'ALL' ? categoryFilter : undefined,
        status: statusFilter !== 'ALL' ? statusFilter : undefined,
        lowStock: lowStockFilter ? true : undefined,
        sortBy,
      };

      const res = await garmentTechnicalService.materials.getMaterials(params);
      if (res?.data) {
        setMaterials(res.data.items || []);
        if (res.data.pagination) {
          setTotalPages(res.data.pagination.totalPages || 1);
          setTotalCount(res.data.pagination.total || 0);
        }
        if (res.data.stats) {
          setStats(res.data.stats);
        }
      }
    } catch (err) {
      showAlert('error', err.message || 'Lỗi khi tải danh sách nguyên phụ liệu');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMaterials();
  }, [page, typeFilter, categoryFilter, statusFilter, lowStockFilter, sortBy]);

  // Xử lý chuyển loại NPL trong form
  const handleTypeChange = (newType) => {
    let defaultCat = newType === 'FABRIC' ? 'FABRIC_ROLL' : 'BUTTON';
    let defaultUnit = newType === 'FABRIC' ? 'METER' : 'PIECE';
    setForm((prev) => ({
      ...prev,
      materialType: newType,
      category: defaultCat,
      unit: defaultUnit,
      requiresWeightKg: newType === 'FABRIC',
    }));
  };

  // Mở modal tạo mới
  const handleOpenCreate = () => {
    setEditingMaterial(null);
    setForm(initialFormState);
    setFormError('');
    setShowCreateModal(true);
  };

  // Mở modal chỉnh sửa
  const handleOpenEdit = (material) => {
    setEditingMaterial(material);
    setForm({
      materialCode: material.materialCode || '',
      materialName: material.materialName || '',
      materialType: material.materialType || 'FABRIC',
      category: material.category || 'FABRIC_ROLL',
      unit: material.unit || (material.materialType === 'FABRIC' ? 'METER' : 'PIECE'),
      color: material.color || '',
      gsm: material.gsm || '',
      widthCm: material.widthCm || '',
      requiresWeightKg: Boolean(material.requiresWeightKg),
      unitCost: material.unitCost || 0,
      safetyStockThreshold: material.safetyStockThreshold !== undefined ? material.safetyStockThreshold : 50,
      fifoAgingThresholdDays: material.fifoAgingThresholdDays || 90,
      supplierId: material.supplierId?._id || material.supplierId || '',
      isActive: material.isActive !== undefined ? material.isActive : true,
    });
    setFormError('');
    setShowCreateModal(true);
  };

  // Lưu nguyên phụ liệu (Thêm mới hoặc Cập nhật)
  const handleSubmitForm = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!form.materialName.trim()) {
      setFormError('Vui lòng nhập tên nguyên phụ liệu');
      return;
    }

    if (form.materialType === 'FABRIC' && form.unit !== 'METER') {
      setFormError('Nguyên phụ liệu loại Vải bắt buộc có đơn vị tính là Mét (METER)');
      return;
    }

    setActionLoading(true);
    try {
      const payload = {
        ...form,
        materialCode: form.materialCode.trim() || undefined,
        materialName: form.materialName.trim(),
        color: form.color.trim(),
        gsm: form.gsm ? Number(form.gsm) : undefined,
        widthCm: form.widthCm ? Number(form.widthCm) : undefined,
        unitCost: Number(form.unitCost) || 0,
        safetyStockThreshold: Number(form.safetyStockThreshold) || 0,
        fifoAgingThresholdDays: Number(form.fifoAgingThresholdDays) || 90,
        supplierId: form.supplierId || undefined,
      };

      if (editingMaterial) {
        await garmentTechnicalService.materials.updateMaterial(editingMaterial._id, payload);
        showAlert('success', `Đã cập nhật nguyên phụ liệu "${form.materialName}" thành công!`);
      } else {
        await garmentTechnicalService.materials.createMaterial(payload);
        showAlert('success', `Đã thêm mới nguyên phụ liệu "${form.materialName}" vào hệ thống!`);
      }

      setShowCreateModal(false);
      fetchMaterials();
    } catch (err) {
      setFormError(err.message || 'Lỗi khi lưu nguyên phụ liệu');
    } finally {
      setActionLoading(false);
    }
  };

  // Xác nhận Xóa / Vô hiệu hóa
  const handleConfirmDelete = async () => {
    if (!deletingMaterial) return;
    setActionLoading(true);
    try {
      const res = await garmentTechnicalService.materials.deleteMaterial(deletingMaterial._id);
      showAlert(
        'success',
        res.message || `Đã xử lý xóa nguyên phụ liệu "${deletingMaterial.materialName}" thành công!`
      );
      setDeletingMaterial(null);
      fetchMaterials();
    } catch (err) {
      showAlert('error', err.message || 'Không thể xóa nguyên phụ liệu');
    } finally {
      setActionLoading(false);
    }
  };

  // Đổi nhanh trạng thái Kích hoạt / Ngừng sử dụng
  const handleToggleStatus = async (material) => {
    setActionLoading(true);
    try {
      const res = await garmentTechnicalService.materials.toggleStatus(material._id);
      showAlert('success', res.message || 'Đã cập nhật trạng thái nguyên phụ liệu');
      fetchMaterials();
    } catch (err) {
      showAlert('error', err.message || 'Không thể đổi trạng thái');
    } finally {
      setActionLoading(false);
    }
  };

  // Danh mục hiển thị thân thiện tiếng Việt
  const getCategoryLabel = (catValue) => {
    const found = meta.categories.find((c) => c.value === catValue);
    return found ? found.label : catValue;
  };

  // Format tiền tệ VNĐ
  const formatCurrency = (val) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val || 0);
  };

  return (
    <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '1.75rem 1.25rem', width: '100%', minHeight: '85vh' }}>
      {/* Alert Banner */}
      {alert && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          padding: '0.9rem 1.2rem',
          borderRadius: 'var(--radius-md)',
          marginBottom: '1.25rem',
          background: alert.type === 'error' ? '#FDF2F2' : '#F1F8F5',
          border: `1px solid ${alert.type === 'error' ? '#F87171' : '#34D399'}`,
          color: alert.type === 'error' ? '#991B1B' : '#065F46',
          fontSize: '0.92rem',
          fontWeight: 500,
          boxShadow: 'var(--ara-shadow-sm)',
        }}>
          {alert.type === 'error' ? <ShieldAlert size={20} /> : <CheckCircle2 size={20} />}
          <div style={{ flex: 1 }}>{alert.message}</div>
          <button
            type="button"
            onClick={() => setAlert(null)}
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
            <Package size={14} /> Kỹ thuật xưởng · Kho Nguyên Phụ Liệu
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--ara-noir)', margin: 0 }}>
            Kho & Danh Mục Nguyên Phụ Liệu
          </h1>
          <p style={{ color: 'var(--ara-text-muted)', fontSize: '0.92rem', margin: '0.35rem 0 0', maxWidth: '850px' }}>
            Quản lý danh mục nguyên vật liệu, vải cuộn và phụ liệu may mặc, thiết lập thông số kỹ thuật (khổ, GSM, màu sắc), định mức giá vốn và theo dõi tồn kho an toàn.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            type="button"
            className="btn-ara-secondary"
            onClick={fetchMaterials}
            title="Làm mới danh sách"
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <RefreshCw size={15} className={loading ? 'spinning' : ''} /> Làm mới
          </button>
          <button
            type="button"
            className="btn-ara-primary"
            onClick={handleOpenCreate}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <Plus size={16} /> Thêm nguyên phụ liệu mới
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
          <div style={{ fontSize: '0.78rem', color: 'var(--ara-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Tổng số mặt hàng
          </div>
          <div style={{ fontSize: '1.65rem', fontWeight: 700, color: 'var(--ara-noir)', marginTop: '0.2rem' }}>
            {stats.totalMaterials}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--ara-text-light)', marginTop: '0.2rem' }}>
            Trong danh mục kho NPL
          </div>
        </div>

        <div style={{ background: '#FFFFFF', padding: '1.1rem', borderRadius: 'var(--radius-md)', border: '1px solid #BFDBFE', boxShadow: 'var(--ara-shadow-sm)' }}>
          <div style={{ fontSize: '0.78rem', color: '#1E40AF', textTransform: 'uppercase', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <Layers size={14} /> Vải chính & Vải lót
          </div>
          <div style={{ fontSize: '1.65rem', fontWeight: 700, color: '#1E40AF', marginTop: '0.2rem' }}>
            {stats.fabricMaterials}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#3B82F6', marginTop: '0.2rem' }}>
            Quản lý theo cuộn, mét, khổ, GSM
          </div>
        </div>

        <div style={{ background: '#FFFFFF', padding: '1.1rem', borderRadius: 'var(--radius-md)', border: '1px solid #E9D5FF', boxShadow: 'var(--ara-shadow-sm)' }}>
          <div style={{ fontSize: '0.78rem', color: '#6B21A8', textTransform: 'uppercase', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <Sliders size={14} /> Phụ liệu may mặc
          </div>
          <div style={{ fontSize: '1.65rem', fontWeight: 700, color: '#6B21A8', marginTop: '0.2rem' }}>
            {stats.auxiliaryMaterials}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#9333EA', marginTop: '0.2rem' }}>
            Chỉ may, cúc, khóa, mác áo...
          </div>
        </div>

        <div style={{ background: '#FFFFFF', padding: '1.1rem', borderRadius: 'var(--radius-md)', border: '1px solid #A7F3D0', boxShadow: 'var(--ara-shadow-sm)' }}>
          <div style={{ fontSize: '0.78rem', color: '#065F46', textTransform: 'uppercase', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <CheckCircle2 size={14} /> Đang hoạt động
          </div>
          <div style={{ fontSize: '1.65rem', fontWeight: 700, color: '#065F46', marginTop: '0.2rem' }}>
            {stats.activeMaterials}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#047857', marginTop: '0.2rem' }}>
            Sẵn sàng nhập / xuất may
          </div>
        </div>

        <div style={{
          background: stats.lowStockMaterials > 0 ? '#FEF2F2' : '#FFFFFF',
          padding: '1.1rem',
          borderRadius: 'var(--radius-md)',
          border: `1px solid ${stats.lowStockMaterials > 0 ? '#FCA5A5' : 'var(--ara-border)'}`,
          boxShadow: 'var(--ara-shadow-sm)',
        }}>
          <div style={{ fontSize: '0.78rem', color: '#B91C1C', textTransform: 'uppercase', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <AlertTriangle size={14} /> Cảnh báo thiếu hàng
          </div>
          <div style={{ fontSize: '1.65rem', fontWeight: 700, color: '#B91C1C', marginTop: '0.2rem' }}>
            {stats.lowStockMaterials}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#991B1B', marginTop: '0.2rem' }}>
            Tồn khả dụng ≤ Ngưỡng an toàn
          </div>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div style={{
        background: '#FFFFFF',
        padding: '1rem 1.25rem',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--ara-border)',
        marginBottom: '1.25rem',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '0.85rem',
      }}>
        {/* Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: '240px' }}>
          <Search size={17} color="var(--ara-text-muted)" />
          <input
            type="text"
            placeholder="Tìm theo mã NPL, tên vật tư, màu sắc..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchMaterials()}
            style={{ width: '100%', border: 'none', outline: 'none', fontSize: '0.9rem' }}
          />
        </div>

        {/* Dropdowns */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
          {/* Type Filter */}
          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setPage(1);
            }}
            style={{ padding: '0.45rem 0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--ara-border)', fontSize: '0.86rem', background: '#FFFFFF' }}
          >
            <option value="ALL">Tất cả loại NPL</option>
            <option value="FABRIC">Chỉ xem Vải (FABRIC)</option>
            <option value="AUXILIARY">Chỉ xem Phụ liệu (AUXILIARY)</option>
          </select>

          {/* Category Filter */}
          <select
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setPage(1);
            }}
            style={{ padding: '0.45rem 0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--ara-border)', fontSize: '0.86rem', background: '#FFFFFF' }}
          >
            <option value="ALL">Tất cả danh mục</option>
            {meta.categories.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            style={{ padding: '0.45rem 0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--ara-border)', fontSize: '0.86rem', background: '#FFFFFF' }}
          >
            <option value="ALL">Tất cả trạng thái</option>
            <option value="ACTIVE">Đang hoạt động</option>
            <option value="INACTIVE">Ngừng sử dụng</option>
          </select>

          {/* Low Stock Toggle Button */}
          <button
            type="button"
            onClick={() => {
              setLowStockFilter(!lowStockFilter);
              setPage(1);
            }}
            style={{
              padding: '0.45rem 0.8rem',
              borderRadius: 'var(--radius-sm)',
              border: lowStockFilter ? '1px solid #DC2626' : '1px solid var(--ara-border)',
              background: lowStockFilter ? '#FEF2F2' : '#FFFFFF',
              color: lowStockFilter ? '#DC2626' : 'var(--ara-noir)',
              fontSize: '0.85rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              cursor: 'pointer',
            }}
          >
            <AlertTriangle size={14} color={lowStockFilter ? '#DC2626' : 'var(--ara-text-muted)'} />
            Hàng sắp hết
          </button>
        </div>
      </div>

      {/* Main Table */}
      <div style={{ background: '#FFFFFF', borderRadius: 'var(--radius-md)', border: '1px solid var(--ara-border)', overflow: 'hidden', boxShadow: 'var(--ara-shadow-sm)' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="table-ara" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
            <thead>
              <tr style={{ background: 'var(--ara-bg-surface)', borderBottom: '1px solid var(--ara-border)', color: 'var(--ara-text-muted)', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                <th style={{ padding: '0.85rem 1rem' }}>Mã NPL</th>
                <th style={{ padding: '0.85rem 1rem' }}>Tên Nguyên Phụ Liệu</th>
                <th style={{ padding: '0.85rem 1rem' }}>Phân Loại & ĐVT</th>
                <th style={{ padding: '0.85rem 1rem' }}>Quy Cách Kỹ Thuật</th>
                <th style={{ padding: '0.85rem 1rem' }}>Nhà Cung Cấp</th>
                <th style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>Tồn Kho Thực Tế</th>
                <th style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>Khả Dụng</th>
                <th style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>Đơn Giá Vốn</th>
                <th style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>Trạng Thái</th>
                <th style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>Thao Tác</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} style={{ textAlign: 'center', padding: '3rem', color: 'var(--ara-text-muted)' }}>
                    <RefreshCw size={24} className="spinning" style={{ margin: '0 auto 0.5rem' }} />
                    <div>Đang tải dữ liệu nguyên phụ liệu...</div>
                  </td>
                </tr>
              ) : materials.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ textAlign: 'center', padding: '3.5rem', color: 'var(--ara-text-muted)' }}>
                    <Package size={36} style={{ margin: '0 auto 0.6rem', opacity: 0.5 }} />
                    <div style={{ fontWeight: 600 }}>Không tìm thấy nguyên phụ liệu nào</div>
                    <div style={{ fontSize: '0.82rem', marginTop: '0.2rem' }}>Thử thay đổi bộ lọc hoặc thêm nguyên phụ liệu mới</div>
                  </td>
                </tr>
              ) : (
                materials.map((item) => (
                  <tr key={item._id} style={{ borderBottom: '1px solid var(--ara-border-subtle)', transition: 'background 0.2s' }}>
                    {/* Mã NPL */}
                    <td style={{ padding: '0.85rem 1rem', fontWeight: 700 }}>
                      <button
                        type="button"
                        onClick={() => setViewingMaterial(item)}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          cursor: 'pointer',
                          fontFamily: 'monospace',
                          fontSize: '0.92rem',
                          color: 'var(--ara-gold)',
                          textDecoration: 'underline',
                          fontWeight: 700,
                        }}
                        title="Xem chi tiết nguyên phụ liệu"
                      >
                        {item.materialCode}
                      </button>
                    </td>

                    {/* Tên NPL */}
                    <td style={{ padding: '0.85rem 1rem' }}>
                      <div style={{ fontWeight: 600, color: 'var(--ara-noir)' }}>{item.materialName}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--ara-text-muted)', marginTop: '2px' }}>
                        {getCategoryLabel(item.category)}
                      </div>
                    </td>

                    {/* Phân loại & ĐVT */}
                    <td style={{ padding: '0.85rem 1rem' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '0.15rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        background: item.materialType === 'FABRIC' ? '#DBEAFE' : '#F3E8FF',
                        color: item.materialType === 'FABRIC' ? '#1D4ED8' : '#7E22CE',
                        marginBottom: '3px',
                      }}>
                        {item.materialType === 'FABRIC' ? 'Vải' : 'Phụ liệu'}
                      </span>
                      <div style={{ fontSize: '0.78rem', color: 'var(--ara-text-muted)' }}>
                        ĐVT: <strong>{item.unit}</strong>
                      </div>
                    </td>

                    {/* Quy cách kỹ thuật */}
                    <td style={{ padding: '0.85rem 1rem', fontSize: '0.82rem' }}>
                      {item.color && (
                        <div>Màu: <strong>{item.color}</strong></div>
                      )}
                      {item.widthCm && (
                        <div>Khổ: {item.widthCm} cm</div>
                      )}
                      {item.gsm && (
                        <div>GSM: {item.gsm} g/m²</div>
                      )}
                      {!item.color && !item.widthCm && !item.gsm && (
                        <span style={{ color: 'var(--ara-text-light)' }}>Tiêu chuẩn</span>
                      )}
                    </td>

                    {/* Nhà cung cấp */}
                    <td style={{ padding: '0.85rem 1rem' }}>
                      {item.supplierId ? (
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{item.supplierId.supplierName}</div>
                          <div style={{ fontSize: '0.74rem', color: 'var(--ara-text-muted)' }}>
                            {item.supplierId.supplierCode} {item.supplierId.phone ? `· ${item.supplierId.phone}` : ''}
                          </div>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--ara-text-light)' }}>—</span>
                      )}
                    </td>

                    {/* Tồn thực tế */}
                    <td style={{ padding: '0.85rem 1rem', textAlign: 'right', fontWeight: 600 }}>
                      {item.onHandQty || 0} {item.unit}
                      {Number(item.pendingPutawayQty) > 0 && (
                        <div style={{ fontSize: '0.72rem', color: '#B45309' }}>
                          (+{item.pendingPutawayQty} chờ cất)
                        </div>
                      )}
                    </td>

                    {/* Tồn khả dụng */}
                    <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                      <div style={{
                        fontWeight: 700,
                        color: item.isLowStock ? '#DC2626' : '#047857',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-end',
                        gap: '0.3rem',
                      }}>
                        {item.isLowStock && <AlertTriangle size={13} />}
                        {item.availableQty} {item.unit}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--ara-text-muted)' }}>
                        Định mức: {item.safetyStockThreshold}
                      </div>
                    </td>

                    {/* Đơn giá vốn */}
                    <td style={{ padding: '0.85rem 1rem', textAlign: 'right', fontWeight: 600 }}>
                      {formatCurrency(item.unitCost)}
                    </td>

                    {/* Trạng thái */}
                    <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                      {item.isActive ? (
                        <span style={{ padding: '0.2rem 0.55rem', borderRadius: '4px', background: '#D1FAE5', color: '#065F46', fontSize: '0.75rem', fontWeight: 700 }}>
                          Hoạt động
                        </span>
                      ) : (
                        <span style={{ padding: '0.2rem 0.55rem', borderRadius: '4px', background: '#F3F4F6', color: '#6B7280', fontSize: '0.75rem', fontWeight: 700 }}>
                          Ngừng dùng
                        </span>
                      )}
                    </td>

                    {/* Thao tác */}
                    <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.4rem' }}>
                        <button
                          type="button"
                          className="btn-icon"
                          onClick={() => setViewingMaterial(item)}
                          title="Xem chi tiết"
                          style={{ padding: '0.35rem', borderRadius: '4px', border: '1px solid var(--ara-border)', background: '#FFFFFF', cursor: 'pointer' }}
                        >
                          <Eye size={15} color="var(--ara-text-muted)" />
                        </button>
                        <button
                          type="button"
                          className="btn-icon"
                          onClick={() => handleOpenEdit(item)}
                          title="Chỉnh sửa thông số NPL"
                          style={{ padding: '0.35rem', borderRadius: '4px', border: '1px solid var(--ara-border)', background: '#FFFFFF', cursor: 'pointer' }}
                        >
                          <Edit3 size={15} color="var(--ara-gold)" />
                        </button>
                        <button
                          type="button"
                          className="btn-icon"
                          onClick={() => handleToggleStatus(item)}
                          title={item.isActive ? "Chuyển sang Ngừng sử dụng" : "Kích hoạt lại NPL"}
                          style={{ padding: '0.35rem', borderRadius: '4px', border: '1px solid var(--ara-border)', background: '#FFFFFF', cursor: 'pointer' }}
                        >
                          {item.isActive ? <ToggleRight size={16} color="#059669" /> : <ToggleLeft size={16} color="#9CA3AF" />}
                        </button>
                        <button
                          type="button"
                          className="btn-icon"
                          onClick={() => setDeletingMaterial(item)}
                          title="Xóa / Vô hiệu hóa NPL"
                          style={{ padding: '0.35rem', borderRadius: '4px', border: '1px solid #FECACA', background: '#FEF2F2', cursor: 'pointer' }}
                        >
                          <Trash2 size={15} color="#DC2626" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Toolbar */}
        <div style={{
          padding: '0.85rem 1.25rem',
          borderTop: '1px solid var(--ara-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--ara-bg-surface)',
          fontSize: '0.85rem',
          color: 'var(--ara-text-muted)',
        }}>
          <div>
            Hiển thị <strong>{materials.length}</strong> trên tổng số <strong>{totalCount}</strong> nguyên phụ liệu
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              type="button"
              className="btn-ara-secondary"
              disabled={page <= 1 || loading}
              onClick={() => setPage(page - 1)}
              style={{ padding: '0.3rem 0.65rem', fontSize: '0.8rem' }}
            >
              Trang trước
            </button>
            <span style={{ fontWeight: 600, color: 'var(--ara-noir)' }}>
              Trang {page} / {totalPages}
            </span>
            <button
              type="button"
              className="btn-ara-secondary"
              disabled={page >= totalPages || loading}
              onClick={() => setPage(page + 1)}
              style={{ padding: '0.3rem 0.65rem', fontSize: '0.8rem' }}
            >
              Trang sau
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODAL 1: CREATE / EDIT RAW MATERIAL                                       */}
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
            maxWidth: '800px',
            maxHeight: '92vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: 'var(--ara-shadow-lg)',
            overflow: 'hidden',
          }}>
            {/* Header */}
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
                  {editingMaterial ? 'Cập Nhật Nguyên Phụ Liệu' : 'Khai Báo Nguyên Phụ Liệu Mới'}
                </div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--ara-noir)', margin: '0.15rem 0 0' }}>
                  {editingMaterial ? `Chỉnh sửa: ${editingMaterial.materialName}` : 'Thêm Nguyên Phụ Liệu Vào Kho'}
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

            {/* Form Body */}
            <form onSubmit={handleSubmitForm} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>
                {formError && (
                  <div style={{
                    padding: '0.75rem 1rem',
                    borderRadius: 'var(--radius-sm)',
                    background: '#FDF2F2',
                    border: '1px solid #FCA5A5',
                    color: '#991B1B',
                    fontSize: '0.88rem',
                    marginBottom: '1.25rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}>
                    <ShieldAlert size={16} />
                    {formError}
                  </div>
                )}

                {/* Section 1: Phân loại & Định danh */}
                <div style={{ marginBottom: '1.5rem' }}>
                  <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--ara-noir)', marginBottom: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Tag size={16} color="var(--ara-gold)" /> 1. Thông Tin Phân Loại & Tên Gọi
                  </h3>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                    {/* Loại NPL */}
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                        Loại nguyên phụ liệu <span style={{ color: '#DC2626' }}>*</span>
                      </label>
                      <div style={{ display: 'flex', gap: '1rem', marginTop: '0.4rem' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.9rem' }}>
                          <input
                            type="radio"
                            name="materialType"
                            checked={form.materialType === 'FABRIC'}
                            onChange={() => handleTypeChange('FABRIC')}
                          />
                          Vải (FABRIC)
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.9rem' }}>
                          <input
                            type="radio"
                            name="materialType"
                            checked={form.materialType === 'AUXILIARY'}
                            onChange={() => handleTypeChange('AUXILIARY')}
                          />
                          Phụ liệu (AUXILIARY)
                        </label>
                      </div>
                    </div>

                    {/* Danh mục */}
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                        Danh mục chi tiết <span style={{ color: '#DC2626' }}>*</span>
                      </label>
                      <select
                        value={form.category}
                        onChange={(e) => setForm({ ...form, category: e.target.value })}
                        style={{ width: '100%', padding: '0.55rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--ara-border)', fontSize: '0.9rem' }}
                      >
                        {meta.categories
                          .filter((c) => form.materialType === 'FABRIC' ? c.type === 'FABRIC' : c.type === 'AUXILIARY')
                          .map((c) => (
                            <option key={c.value} value={c.value}>
                              {c.label}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1rem' }}>
                    {/* Mã NPL */}
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                        Mã NPL (để trống tự sinh mã):
                      </label>
                      <input
                        type="text"
                        placeholder={form.materialType === 'FABRIC' ? "RM-FAB-xxxxx" : "RM-AUX-xxxxx"}
                        value={form.materialCode}
                        onChange={(e) => setForm({ ...form, materialCode: e.target.value.toUpperCase() })}
                        style={{ width: '100%', padding: '0.55rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--ara-border)', fontSize: '0.9rem', fontFamily: 'monospace' }}
                      />
                    </div>

                    {/* Tên NPL */}
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                        Tên nguyên phụ liệu <span style={{ color: '#DC2626' }}>*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="Ví dụ: Vải Cotton Single Jersey 100%, Chỉ may 40/2..."
                        value={form.materialName}
                        onChange={(e) => setForm({ ...form, materialName: e.target.value })}
                        style={{ width: '100%', padding: '0.55rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--ara-border)', fontSize: '0.9rem' }}
                      />
                    </div>
                  </div>
                </div>

                {/* Section 2: Đơn vị tính & Thông số kỹ thuật */}
                <div style={{ marginBottom: '1.5rem', borderTop: '1px solid var(--ara-border-subtle)', paddingTop: '1.25rem' }}>
                  <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--ara-noir)', marginBottom: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Sliders size={16} color="var(--ara-gold)" /> 2. Đơn Vị Tính & Thông Số Kỹ Thuật
                  </h3>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                    {/* Đơn vị tính */}
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                        Đơn vị tính <span style={{ color: '#DC2626' }}>*</span>
                      </label>
                      {form.materialType === 'FABRIC' ? (
                        <div>
                          <input
                            type="text"
                            value="METER (Mét)"
                            disabled
                            style={{ width: '100%', padding: '0.55rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--ara-border)', background: '#F3F4F6', color: '#6B7280', fontSize: '0.9rem', fontWeight: 600 }}
                          />
                          <div style={{ fontSize: '0.72rem', color: 'var(--ara-text-muted)', marginTop: '2px' }}>
                            Loại Vải cố định là Mét theo chuẩn kho
                          </div>
                        </div>
                      ) : (
                        <select
                          value={form.unit}
                          onChange={(e) => setForm({ ...form, unit: e.target.value })}
                          style={{ width: '100%', padding: '0.55rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--ara-border)', fontSize: '0.9rem' }}
                        >
                          {meta.units.map((u) => (
                            <option key={u.value} value={u.value}>
                              {u.label}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    {/* Màu sắc */}
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                        Màu sắc (Color):
                      </label>
                      <input
                        type="text"
                        placeholder="Ví dụ: Trắng, Xanh Navy, Đen..."
                        value={form.color}
                        onChange={(e) => setForm({ ...form, color: e.target.value })}
                        style={{ width: '100%', padding: '0.55rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--ara-border)', fontSize: '0.9rem' }}
                      />
                    </div>

                    {/* Khổ vải cm */}
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                        Khổ rộng (cm):
                      </label>
                      <input
                        type="number"
                        min="0"
                        placeholder="Ví dụ: 160"
                        value={form.widthCm}
                        onChange={(e) => setForm({ ...form, widthCm: e.target.value })}
                        style={{ width: '100%', padding: '0.55rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--ara-border)', fontSize: '0.9rem' }}
                      />
                    </div>

                    {/* Định lượng GSM */}
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                        Định lượng GSM (g/m²):
                      </label>
                      <input
                        type="number"
                        min="0"
                        placeholder="Ví dụ: 220"
                        value={form.gsm}
                        onChange={(e) => setForm({ ...form, gsm: e.target.value })}
                        style={{ width: '100%', padding: '0.55rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--ara-border)', fontSize: '0.9rem' }}
                      />
                    </div>
                  </div>

                  {/* Yêu cầu cân kg */}
                  {form.materialType === 'FABRIC' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
                      <input
                        type="checkbox"
                        id="requiresWeightKgCheck"
                        checked={form.requiresWeightKg}
                        onChange={(e) => setForm({ ...form, requiresWeightKg: e.target.checked })}
                      />
                      <label htmlFor="requiresWeightKgCheck" style={{ fontSize: '0.88rem', fontWeight: 600, cursor: 'pointer' }}>
                        Yêu cầu cân trọng lượng (kg) khi nhập kho cuộn vải
                      </label>
                    </div>
                  )}
                </div>

                {/* Section 3: Định mức kho & Đơn giá */}
                <div style={{ borderTop: '1px solid var(--ara-border-subtle)', paddingTop: '1.25rem' }}>
                  <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--ara-noir)', marginBottom: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Layers size={16} color="var(--ara-gold)" /> 3. Định Mức Tồn Kho, Giá Vốn & Nhà Cung Cấp
                  </h3>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                    {/* Đơn giá vốn */}
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                        Đơn giá vốn tham chiếu (VNĐ) <span style={{ color: '#DC2626' }}>*</span>
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={form.unitCost}
                        onChange={(e) => setForm({ ...form, unitCost: e.target.value })}
                        style={{ width: '100%', padding: '0.55rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--ara-border)', fontSize: '0.9rem', fontWeight: 700 }}
                      />
                    </div>

                    {/* Ngưỡng tồn an toàn */}
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                        Ngưỡng tồn an toàn (Safety Stock):
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={form.safetyStockThreshold}
                        onChange={(e) => setForm({ ...form, safetyStockThreshold: e.target.value })}
                        style={{ width: '100%', padding: '0.55rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--ara-border)', fontSize: '0.9rem' }}
                      />
                      <div style={{ fontSize: '0.72rem', color: 'var(--ara-text-muted)', marginTop: '2px' }}>
                        Cảnh báo khi tồn khả dụng ≤ ngưỡng này
                      </div>
                    </div>

                    {/* Ngưỡng FIFO */}
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                        Ngưỡng cảnh báo tuổi thọ FIFO (ngày):
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={form.fifoAgingThresholdDays}
                        onChange={(e) => setForm({ ...form, fifoAgingThresholdDays: e.target.value })}
                        style={{ width: '100%', padding: '0.55rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--ara-border)', fontSize: '0.9rem' }}
                      />
                    </div>

                    {/* Nhà cung cấp */}
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                        Nhà cung cấp chính:
                      </label>
                      <select
                        value={form.supplierId}
                        onChange={(e) => setForm({ ...form, supplierId: e.target.value })}
                        style={{ width: '100%', padding: '0.55rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--ara-border)', fontSize: '0.9rem' }}
                      >
                        <option value="">-- Chọn Nhà cung cấp --</option>
                        {meta.suppliers.map((s) => (
                          <option key={s._id} value={s._id}>
                            {s.supplierName} ({s.supplierCode})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Kích hoạt */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
                    <input
                      type="checkbox"
                      id="isActiveCheck"
                      checked={form.isActive}
                      onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                    />
                    <label htmlFor="isActiveCheck" style={{ fontSize: '0.88rem', fontWeight: 600, cursor: 'pointer' }}>
                      Kích hoạt cho phép sử dụng trong kế hoạch nhập/xuất kho
                    </label>
                  </div>
                </div>
              </div>

              {/* Footer */}
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
                  type="submit"
                  className="btn-ara-primary"
                  disabled={actionLoading}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  {actionLoading ? <RefreshCw size={15} className="spinning" /> : <CheckCircle2 size={15} />}
                  {editingMaterial ? 'Lưu cập nhật NPL' : 'Tạo mới NPL'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: VIEW RAW MATERIAL DETAILS                                        */}
      {/* ========================================================================= */}
      {viewingMaterial && (
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
            maxWidth: '780px',
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
                <div style={{ fontSize: '0.78rem', color: 'var(--ara-gold)', fontWeight: 700, textTransform: 'uppercase' }}>
                  Hồ Sơ Nguyên Phụ Liệu
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginTop: '0.2rem' }}>
                  <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--ara-noir)', margin: 0 }}>
                    {viewingMaterial.materialName}
                  </h2>
                  <span style={{ fontFamily: 'monospace', fontSize: '0.9rem', color: 'var(--ara-gold)', fontWeight: 700 }}>
                    ({viewingMaterial.materialCode})
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setViewingMaterial(null)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--ara-text-muted)' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>
              {/* Tồn kho Dashboard */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: '0.85rem',
                background: viewingMaterial.isLowStock ? '#FEF2F2' : '#F1F8F5',
                border: `1px solid ${viewingMaterial.isLowStock ? '#FCA5A5' : '#A7F3D0'}`,
                padding: '1rem',
                borderRadius: 'var(--radius-sm)',
                marginBottom: '1.5rem',
              }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--ara-text-muted)', textTransform: 'uppercase' }}>Khả dụng cho may</div>
                  <div style={{ fontSize: '1.45rem', fontWeight: 700, color: viewingMaterial.isLowStock ? '#DC2626' : '#047857' }}>
                    {viewingMaterial.availableQty} {viewingMaterial.unit}
                  </div>
                  {viewingMaterial.isLowStock && (
                    <div style={{ fontSize: '0.72rem', color: '#B91C1C', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '2px' }}>
                      <AlertTriangle size={11} /> Cảnh báo dưới an toàn
                    </div>
                  )}
                </div>

                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--ara-text-muted)', textTransform: 'uppercase' }}>Tồn thực tế trong kho</div>
                  <div style={{ fontSize: '1.45rem', fontWeight: 700, color: 'var(--ara-noir)' }}>
                    {viewingMaterial.onHandQty || 0} {viewingMaterial.unit}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--ara-text-muted)', textTransform: 'uppercase' }}>Chờ cất vào kệ</div>
                  <div style={{ fontSize: '1.45rem', fontWeight: 700, color: '#B45309' }}>
                    {viewingMaterial.pendingPutawayQty || 0} {viewingMaterial.unit}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--ara-text-muted)', textTransform: 'uppercase' }}>Đang giữ chỗ lệnh xuất</div>
                  <div style={{ fontSize: '1.45rem', fontWeight: 700, color: '#4B5563' }}>
                    {viewingMaterial.reservedQty || 0} {viewingMaterial.unit}
                  </div>
                </div>
              </div>

              {/* Grid thông số */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '1rem',
                fontSize: '0.88rem',
                marginBottom: '1.5rem',
              }}>
                <div style={{ background: '#F9FAFB', padding: '0.85rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--ara-border)' }}>
                  <span style={{ color: 'var(--ara-text-muted)', display: 'block', fontSize: '0.75rem' }}>Phân loại & Danh mục</span>
                  <strong>{viewingMaterial.materialType === 'FABRIC' ? 'Vải (FABRIC)' : 'Phụ liệu (AUXILIARY)'}</strong>
                  <div style={{ fontSize: '0.8rem', color: 'var(--ara-text-muted)' }}>{getCategoryLabel(viewingMaterial.category)}</div>
                </div>

                <div style={{ background: '#F9FAFB', padding: '0.85rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--ara-border)' }}>
                  <span style={{ color: 'var(--ara-text-muted)', display: 'block', fontSize: '0.75rem' }}>Quy cách kỹ thuật</span>
                  <div>Màu: <strong>{viewingMaterial.color || 'Tiêu chuẩn'}</strong></div>
                  <div>Khổ: <strong>{viewingMaterial.widthCm ? `${viewingMaterial.widthCm} cm` : '—'}</strong></div>
                  <div>GSM: <strong>{viewingMaterial.gsm ? `${viewingMaterial.gsm} g/m²` : '—'}</strong></div>
                </div>

                <div style={{ background: '#F9FAFB', padding: '0.85rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--ara-border)' }}>
                  <span style={{ color: 'var(--ara-text-muted)', display: 'block', fontSize: '0.75rem' }}>Định mức & Giá vốn</span>
                  <div>Đơn giá vốn: <strong>{formatCurrency(viewingMaterial.unitCost)}</strong></div>
                  <div>Tồn an toàn: <strong>{viewingMaterial.safetyStockThreshold} {viewingMaterial.unit}</strong></div>
                  <div>Ngưỡng FIFO: <strong>{viewingMaterial.fifoAgingThresholdDays} ngày</strong></div>
                </div>

                <div style={{ background: '#F9FAFB', padding: '0.85rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--ara-border)' }}>
                  <span style={{ color: 'var(--ara-text-muted)', display: 'block', fontSize: '0.75rem' }}>Nhà cung cấp</span>
                  <strong>{viewingMaterial.supplierId?.supplierName || 'Chưa liên kết'}</strong>
                  {viewingMaterial.supplierId?.phone && (
                    <div style={{ fontSize: '0.78rem', color: 'var(--ara-text-muted)' }}>SĐT: {viewingMaterial.supplierId.phone}</div>
                  )}
                  {viewingMaterial.supplierId?.address && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--ara-text-muted)' }}>{viewingMaterial.supplierId.address}</div>
                  )}
                </div>
              </div>

              {/* Lô & cuộn vải liên kết */}
              <div style={{
                padding: '0.9rem',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--ara-bg-surface)',
                border: '1px solid var(--ara-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                  <Info size={16} color="var(--ara-gold)" />
                  <span>
                    Mặt hàng này đang liên kết với <strong>{viewingMaterial.activeLotsCount || 0}</strong> lô kho (Lots) và <strong>{viewingMaterial.activeRollsCount || 0}</strong> cuộn vải trong hệ thống WMS.
                  </span>
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
                onClick={() => setViewingMaterial(null)}
              >
                Đóng
              </button>
              <button
                type="button"
                className="btn-ara-primary"
                onClick={() => {
                  const m = viewingMaterial;
                  setViewingMaterial(null);
                  handleOpenEdit(m);
                }}
                style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
              >
                <Edit3 size={15} /> Chỉnh sửa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: CONFIRM DELETE RAW MATERIAL                                      */}
      {/* ========================================================================= */}
      {deletingMaterial && (
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
            maxWidth: '520px',
            boxShadow: 'var(--ara-shadow-lg)',
            overflow: 'hidden',
          }}>
            <div style={{
              padding: '1.25rem 1.5rem',
              borderBottom: '1px solid var(--ara-border)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.65rem',
              background: '#FEF2F2',
              color: '#991B1B',
            }}>
              <AlertTriangle size={22} color="#DC2626" />
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>
                Xác Nhận Xóa / Vô Hiệu Hóa
              </h3>
            </div>

            <div style={{ padding: '1.5rem', fontSize: '0.9rem', lineHeight: 1.5 }}>
              <p style={{ margin: '0 0 0.85rem' }}>
                Bạn có chắc chắn muốn xóa nguyên phụ liệu:
              </p>
              <div style={{
                background: '#F9FAFB',
                padding: '0.85rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--ara-border)',
                marginBottom: '1rem',
              }}>
                <div style={{ fontWeight: 700, color: 'var(--ara-noir)' }}>{deletingMaterial.materialName}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--ara-text-muted)', marginTop: '2px' }}>
                  Mã NPL: <strong>{deletingMaterial.materialCode}</strong> · ĐVT: {deletingMaterial.unit}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--ara-text-muted)' }}>
                  Tồn kho hiện tại: <strong>{deletingMaterial.onHandQty || 0} {deletingMaterial.unit}</strong>
                </div>
              </div>

              <div style={{
                fontSize: '0.82rem',
                color: '#6B7280',
                background: '#F3F4F6',
                padding: '0.75rem',
                borderRadius: '4px',
              }}>
                <strong>* Nguyên tắc an toàn dữ liệu WMS:</strong>
                <ul style={{ margin: '0.35rem 0 0', paddingLeft: '1.2rem' }}>
                  <li>Nếu mặt hàng còn tồn kho (&gt; 0), hệ thống sẽ từ chối xóa để tránh thất thoát kho.</li>
                  <li>Nếu mặt hàng đã từng phát sinh chứng từ nhập/xuất/lô kho, hệ thống sẽ tự động chuyển sang trạng thái <strong>"Ngừng sử dụng"</strong> để bảo toàn toàn vẹn lịch sử.</li>
                  <li>Nếu là mặt hàng mới tạo chưa có phát sinh giao dịch, hệ thống sẽ xóa vĩnh viễn.</li>
                </ul>
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
                onClick={() => setDeletingMaterial(null)}
                disabled={actionLoading}
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={actionLoading}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: 'var(--radius-sm)',
                  background: '#DC2626',
                  color: '#FFFFFF',
                  border: '1px solid #B91C1C',
                  fontSize: '0.88rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  cursor: 'pointer',
                }}
              >
                {actionLoading ? <RefreshCw size={15} className="spinning" /> : <Trash2 size={15} />}
                Đồng ý thực hiện
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

