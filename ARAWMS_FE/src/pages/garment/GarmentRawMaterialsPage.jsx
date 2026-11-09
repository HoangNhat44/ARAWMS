/**
 * ============================================================================
 * @title        : Garment Raw Materials & Categories Page
 * @author       : AraWMS Team
 * @createdDate  : 2026-11-09
 * @lastModified : 2026-11-09
 * @description  : Giao diện Quản lý Kho & Danh Mục Phân Loại Nguyên Phụ Liệu:
 *                 - Tab 1: Kho & Danh sách NPL (Thêm, Sửa, Xóa NPL, cascade dọn dẹp cấu hình kho & lệnh xuất).
 *                 - Tab 2: Quản lý Danh mục (Thêm, Sửa, Xóa Danh mục; bắt buộc phải xóa hết NPL trong danh mục trước khi xóa).
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
  FolderTree,
  FolderPlus,
  ArrowRight,
  Boxes,
} from 'lucide-react';
import garmentTechnicalService from '../../services/garmentTechnicalService';

export default function GarmentRawMaterialsPage() {
  // Tab: 'MATERIALS' | 'CATEGORIES'
  const [activeTab, setActiveTab] = useState('MATERIALS');

  // State: Data & Loading
  const [materials, setMaterials] = useState([]);
  const [categoriesList, setCategoriesList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [categoryLoading, setCategoryLoading] = useState(false);
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

  // State: Filters & Pagination (Materials)
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL'); // 'ALL' | 'FABRIC' | 'AUXILIARY'
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'ACTIVE' | 'INACTIVE'
  const [lowStockFilter, setLowStockFilter] = useState(false);
  const [sortBy, setSortBy] = useState('createdAt_desc');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // State: Modals (Materials)
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState(null);
  const [viewingMaterial, setViewingMaterial] = useState(null);
  const [deletingMaterial, setDeletingMaterial] = useState(null);

  // State: Modals (Categories)
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [deletingCategory, setDeletingCategory] = useState(null);
  const [categoryForm, setCategoryForm] = useState({
    categoryCode: '',
    categoryName: '',
    materialType: 'AUXILIARY',
    description: '',
  });
  const [categoryFormError, setCategoryFormError] = useState('');

  // State: Form (Materials)
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
    setTimeout(() => setAlert(null), 7000);
  };

  // 1. Tải siêu dữ liệu (Suppliers, Units, Categories)
  const fetchMeta = async () => {
    try {
      const res = await garmentTechnicalService.materials.getMeta();
      if (res?.data) {
        setMeta(res.data);
      }
    } catch (err) {
      console.error('Lỗi nạp siêu dữ liệu NPL:', err);
    }
  };

  useEffect(() => {
    fetchMeta();
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

  // 3. Tải danh sách danh mục phân loại
  const fetchCategories = async () => {
    setCategoryLoading(true);
    try {
      const res = await garmentTechnicalService.materials.getCategories();
      if (res?.data) {
        setCategoriesList(res.data);
      }
    } catch (err) {
      showAlert('error', err.message || 'Lỗi khi tải danh mục NPL');
    } finally {
      setCategoryLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'MATERIALS') {
      fetchMaterials();
    } else {
      fetchCategories();
    }
  }, [activeTab, page, typeFilter, categoryFilter, statusFilter, lowStockFilter, sortBy]);

  // Xử lý chuyển loại NPL trong form
  const handleTypeChange = (newType) => {
    const defaultCat = newType === 'FABRIC' ? 'FABRIC_ROLL' : 'BUTTON';
    const defaultUnit = newType === 'FABRIC' ? 'METER' : 'PIECE';
    setForm((prev) => ({
      ...prev,
      materialType: newType,
      category: defaultCat,
      unit: defaultUnit,
      requiresWeightKg: newType === 'FABRIC',
    }));
  };

  // Mở modal tạo mới NPL
  const handleOpenCreate = () => {
    setEditingMaterial(null);
    setForm(initialFormState);
    setFormError('');
    setShowCreateModal(true);
  };

  // Mở modal chỉnh sửa NPL
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
      fetchMeta();
    } catch (err) {
      setFormError(err.message || 'Lỗi khi lưu nguyên phụ liệu');
    } finally {
      setActionLoading(false);
    }
  };

  // Xác nhận Xóa nguyên phụ liệu (triệt để + cascade dọn dẹp kho & lệnh xuất)
  const handleConfirmDelete = async () => {
    if (!deletingMaterial) return;
    setActionLoading(true);
    try {
      const res = await garmentTechnicalService.materials.deleteMaterial(deletingMaterial._id);
      showAlert(
        'success',
        res.message || `Đã xóa nguyên phụ liệu "${deletingMaterial.materialName}" và dọn dẹp cấu hình kho liên quan.`
      );
      setDeletingMaterial(null);
      fetchMaterials();
      fetchMeta();
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

  // =========================================================================
  // CATEGORY ACTIONS
  // =========================================================================
  const handleOpenCreateCategory = () => {
    setEditingCategory(null);
    setCategoryForm({
      categoryCode: '',
      categoryName: '',
      materialType: 'AUXILIARY',
      description: '',
    });
    setCategoryFormError('');
    setShowCategoryModal(true);
  };

  const handleOpenEditCategory = (cat) => {
    setEditingCategory(cat);
    setCategoryForm({
      categoryCode: cat.categoryCode || '',
      categoryName: cat.categoryName || '',
      materialType: cat.materialType || 'AUXILIARY',
      description: cat.description || '',
    });
    setCategoryFormError('');
    setShowCategoryModal(true);
  };

  const handleSubmitCategoryForm = async (e) => {
    e.preventDefault();
    setCategoryFormError('');

    if (!categoryForm.categoryName.trim()) {
      setCategoryFormError('Vui lòng nhập tên danh mục');
      return;
    }

    setActionLoading(true);
    try {
      if (editingCategory) {
        await garmentTechnicalService.materials.updateCategory(editingCategory._id, {
          categoryName: categoryForm.categoryName.trim(),
          description: categoryForm.description.trim(),
        });
        showAlert('success', `Đã cập nhật danh mục "${categoryForm.categoryName}" thành công!`);
      } else {
        await garmentTechnicalService.materials.createCategory({
          categoryCode: categoryForm.categoryCode.trim() || undefined,
          categoryName: categoryForm.categoryName.trim(),
          materialType: categoryForm.materialType,
          description: categoryForm.description.trim(),
        });
        showAlert('success', `Đã tạo mới danh mục "${categoryForm.categoryName}" thành công!`);
      }

      setShowCategoryModal(false);
      fetchCategories();
      fetchMeta();
    } catch (err) {
      setCategoryFormError(err.message || 'Lỗi khi lưu danh mục');
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmDeleteCategory = async () => {
    if (!deletingCategory) return;

    if (deletingCategory.itemCount > 0) {
      showAlert(
        'error',
        `Không thể xóa danh mục "${deletingCategory.categoryName}" vì vẫn còn ${deletingCategory.itemCount} nguyên phụ liệu thuộc danh mục này! Bạn phải xóa hết toàn bộ các nguyên phụ liệu trước khi xóa danh mục.`
      );
      return;
    }

    setActionLoading(true);
    try {
      const res = await garmentTechnicalService.materials.deleteCategory(deletingCategory._id);
      showAlert('success', res.message || `Đã xóa danh mục "${deletingCategory.categoryName}" khỏi hệ thống.`);
      setDeletingCategory(null);
      fetchCategories();
      fetchMeta();
    } catch (err) {
      showAlert('error', err.message || 'Không thể xóa danh mục');
    } finally {
      setActionLoading(false);
    }
  };

  // Chuyển sang xem danh sách NPL của một danh mục cụ thể
  const handleViewCategoryItems = (catCode) => {
    setCategoryFilter(catCode);
    setActiveTab('MATERIALS');
    setPage(1);
  };

  // Helper nhãn hiển thị danh mục
  const getCategoryLabel = (catValue) => {
    const found = meta.categories.find((c) => c.value === catValue);
    return found ? found.label : catValue;
  };

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
          <p style={{ color: 'var(--ara-text-muted)', fontSize: '0.92rem', margin: '0.35rem 0 0', maxWidth: '880px' }}>
            Quản lý danh mục phân loại và hồ sơ nguyên vật liệu, cấu hình khổ vải, GSM, màu sắc, đơn giá vốn tham chiếu và dọn dẹp đồng bộ cấu hình kho khi xóa nguyên phụ liệu.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            type="button"
            className="btn-ara-secondary"
            onClick={() => (activeTab === 'MATERIALS' ? fetchMaterials() : fetchCategories())}
            title="Làm mới"
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <RefreshCw size={15} className={loading || categoryLoading ? 'spinning' : ''} /> Làm mới
          </button>
          {activeTab === 'MATERIALS' ? (
            <button
              type="button"
              className="btn-ara-primary"
              onClick={handleOpenCreate}
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
            >
              <Plus size={16} /> Thêm nguyên phụ liệu mới
            </button>
          ) : (
            <button
              type="button"
              className="btn-ara-primary"
              onClick={handleOpenCreateCategory}
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
            >
              <FolderPlus size={16} /> Thêm danh mục mới
            </button>
          )}
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
          onClick={() => setActiveTab('MATERIALS')}
          style={{
            background: 'none',
            border: 'none',
            padding: '0.75rem 0.2rem',
            fontSize: '0.98rem',
            fontWeight: activeTab === 'MATERIALS' ? 700 : 500,
            color: activeTab === 'MATERIALS' ? 'var(--ara-noir)' : 'var(--ara-text-muted)',
            borderBottom: activeTab === 'MATERIALS' ? '3px solid var(--ara-gold)' : '3px solid transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <Boxes size={17} /> Danh sách Nguyên Phụ Liệu ({stats.totalMaterials})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('CATEGORIES')}
          style={{
            background: 'none',
            border: 'none',
            padding: '0.75rem 0.2rem',
            fontSize: '0.98rem',
            fontWeight: activeTab === 'CATEGORIES' ? 700 : 500,
            color: activeTab === 'CATEGORIES' ? 'var(--ara-noir)' : 'var(--ara-text-muted)',
            borderBottom: activeTab === 'CATEGORIES' ? '3px solid var(--ara-gold)' : '3px solid transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <FolderTree size={17} /> Quản lý Danh Mục Phân Loại ({meta.categories?.length || 0})
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: DANH SÁCH NGUYÊN PHỤ LIỆU                                          */}
      {/* ========================================================================= */}
      {activeTab === 'MATERIALS' && (
        <>
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
                    {c.label} {c.itemCount ? `(${c.itemCount})` : ''}
                  </option>
                ))}
              </select>

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

          {/* Table */}
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

                        <td style={{ padding: '0.85rem 1rem' }}>
                          <div style={{ fontWeight: 600, color: 'var(--ara-noir)' }}>{item.materialName}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--ara-text-muted)', marginTop: '2px' }}>
                            {getCategoryLabel(item.category)}
                          </div>
                        </td>

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

                        <td style={{ padding: '0.85rem 1rem', fontSize: '0.82rem' }}>
                          {item.color && <div>Màu: <strong>{item.color}</strong></div>}
                          {item.widthCm && <div>Khổ: {item.widthCm} cm</div>}
                          {item.gsm && <div>GSM: {item.gsm} g/m²</div>}
                          {!item.color && !item.widthCm && !item.gsm && (
                            <span style={{ color: 'var(--ara-text-light)' }}>Tiêu chuẩn</span>
                          )}
                        </td>

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

                        <td style={{ padding: '0.85rem 1rem', textAlign: 'right', fontWeight: 600 }}>
                          {item.onHandQty || 0} {item.unit}
                          {Number(item.pendingPutawayQty) > 0 && (
                            <div style={{ fontSize: '0.72rem', color: '#B45309' }}>
                              (+{item.pendingPutawayQty} chờ cất)
                            </div>
                          )}
                        </td>

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

                        <td style={{ padding: '0.85rem 1rem', textAlign: 'right', fontWeight: 600 }}>
                          {formatCurrency(item.unitCost)}
                        </td>

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
                              title="Xóa triệt để NPL (dọn dẹp cấu hình kho & lệnh xuất)"
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

            {/* Pagination */}
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
        </>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: QUẢN LÝ DANH MỤC PHÂN LOẠI (CATEGORIES)                            */}
      {/* ========================================================================= */}
      {activeTab === 'CATEGORIES' && (
        <div>
          {/* Important Rule Notice */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.9rem 1.2rem',
            borderRadius: 'var(--radius-md)',
            marginBottom: '1.25rem',
            background: '#FFFBEB',
            border: '1px solid #FCD34D',
            color: '#92400E',
            fontSize: '0.9rem',
            lineHeight: 1.5,
          }}>
            <AlertTriangle size={20} color="#D97706" style={{ flexShrink: 0 }} />
            <div>
              <strong>Quy tắc an toàn hệ thống:</strong> Trước khi xóa một danh mục nguyên phụ liệu, bạn <strong>bắt buộc phải xóa hết toàn bộ nguyên phụ liệu</strong> đang thuộc danh mục đó trước. Danh mục chỉ được phép xóa khi số lượng mặt hàng bằng <strong>0</strong>.
            </div>
          </div>

          {/* Categories Table */}
          <div style={{ background: '#FFFFFF', borderRadius: 'var(--radius-md)', border: '1px solid var(--ara-border)', overflow: 'hidden', boxShadow: 'var(--ara-shadow-sm)' }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="table-ara" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ background: 'var(--ara-bg-surface)', borderBottom: '1px solid var(--ara-border)', color: 'var(--ara-text-muted)', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    <th style={{ padding: '0.85rem 1.1rem' }}>Mã Danh Mục</th>
                    <th style={{ padding: '0.85rem 1.1rem' }}>Tên Danh Mục</th>
                    <th style={{ padding: '0.85rem 1.1rem' }}>Phân Loại</th>
                    <th style={{ padding: '0.85rem 1.1rem', textAlign: 'center' }}>Số Lượng NPL Chứa</th>
                    <th style={{ padding: '0.85rem 1.1rem' }}>Mô Tả Danh Mục</th>
                    <th style={{ padding: '0.85rem 1.1rem', textAlign: 'right' }}>Thao Tác</th>
                  </tr>
                </thead>
                <tbody>
                  {categoryLoading ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '3rem', color: 'var(--ara-text-muted)' }}>
                        <RefreshCw size={24} className="spinning" style={{ margin: '0 auto 0.5rem' }} />
                        <div>Đang tải danh sách danh mục...</div>
                      </td>
                    </tr>
                  ) : categoriesList.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '3rem', color: 'var(--ara-text-muted)' }}>
                        <FolderTree size={32} style={{ margin: '0 auto 0.5rem', opacity: 0.5 }} />
                        <div>Chưa có danh mục phân loại nào</div>
                      </td>
                    </tr>
                  ) : (
                    categoriesList.map((cat) => {
                      const hasItems = (cat.itemCount || 0) > 0;
                      return (
                        <tr key={cat._id} style={{ borderBottom: '1px solid var(--ara-border-subtle)' }}>
                          <td style={{ padding: '0.9rem 1.1rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--ara-gold)' }}>
                            {cat.categoryCode}
                          </td>

                          <td style={{ padding: '0.9rem 1.1rem', fontWeight: 600, color: 'var(--ara-noir)' }}>
                            {cat.categoryName}
                          </td>

                          <td style={{ padding: '0.9rem 1.1rem' }}>
                            <span style={{
                              display: 'inline-block',
                              padding: '0.15rem 0.5rem',
                              borderRadius: '4px',
                              fontSize: '0.74rem',
                              fontWeight: 700,
                              background: cat.materialType === 'FABRIC' ? '#DBEAFE' : '#F3E8FF',
                              color: cat.materialType === 'FABRIC' ? '#1D4ED8' : '#7E22CE',
                            }}>
                              {cat.materialType === 'FABRIC' ? 'Vải' : 'Phụ liệu'}
                            </span>
                          </td>

                          <td style={{ padding: '0.9rem 1.1rem', textAlign: 'center' }}>
                            {hasItems ? (
                              <button
                                type="button"
                                onClick={() => handleViewCategoryItems(cat.categoryCode)}
                                style={{
                                  padding: '0.2rem 0.6rem',
                                  borderRadius: '20px',
                                  background: '#FEF3C7',
                                  color: '#92400E',
                                  fontSize: '0.78rem',
                                  fontWeight: 700,
                                  border: '1px solid #FCD34D',
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.3rem',
                                }}
                                title="Bấm để xem danh sách các NPL của danh mục này"
                              >
                                {cat.itemCount} NPL <ArrowRight size={12} />
                              </button>
                            ) : (
                              <span style={{
                                padding: '0.2rem 0.6rem',
                                borderRadius: '20px',
                                background: '#D1FAE5',
                                color: '#065F46',
                                fontSize: '0.78rem',
                                fontWeight: 700,
                              }}>
                                0 NPL (Trống)
                              </span>
                            )}
                          </td>

                          <td style={{ padding: '0.9rem 1.1rem', fontSize: '0.85rem', color: 'var(--ara-text-muted)', maxWidth: '280px' }}>
                            {cat.description || '—'}
                          </td>

                          <td style={{ padding: '0.9rem 1.1rem', textAlign: 'right' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.4rem' }}>
                              <button
                                type="button"
                                className="btn-icon"
                                onClick={() => handleOpenEditCategory(cat)}
                                title="Chỉnh sửa danh mục"
                                style={{ padding: '0.35rem', borderRadius: '4px', border: '1px solid var(--ara-border)', background: '#FFFFFF', cursor: 'pointer' }}
                              >
                                <Edit3 size={15} color="var(--ara-gold)" />
                              </button>

                              <button
                                type="button"
                                className="btn-icon"
                                onClick={() => setDeletingCategory(cat)}
                                title={hasItems ? `Còn ${cat.itemCount} NPL. Phải xóa hết NPL trước khi xóa danh mục!` : "Xóa danh mục"}
                                style={{
                                  padding: '0.35rem',
                                  borderRadius: '4px',
                                  border: hasItems ? '1px solid #E5E7EB' : '1px solid #FECACA',
                                  background: hasItems ? '#F3F4F6' : '#FEF2F2',
                                  cursor: 'pointer',
                                  opacity: hasItems ? 0.6 : 1,
                                }}
                              >
                                <Trash2 size={15} color={hasItems ? '#9CA3AF' : '#DC2626'} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CREATE / EDIT RAW MATERIAL                                         */}
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

                <div style={{ marginBottom: '1.5rem' }}>
                  <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--ara-noir)', marginBottom: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Tag size={16} color="var(--ara-gold)" /> 1. Thông Tin Phân Loại & Tên Gọi
                  </h3>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
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

                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                        Danh mục phân loại <span style={{ color: '#DC2626' }}>*</span>
                      </label>
                      <select
                        value={form.category}
                        onChange={(e) => setForm({ ...form, category: e.target.value })}
                        style={{ width: '100%', padding: '0.55rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--ara-border)', fontSize: '0.9rem' }}
                      >
                        {meta.categories
                          .filter((c) => (form.materialType === 'FABRIC' ? c.type === 'FABRIC' : c.type === 'AUXILIARY'))
                          .map((c) => (
                            <option key={c.value} value={c.value}>
                              {c.label}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1rem' }}>
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

                <div style={{ marginBottom: '1.5rem', borderTop: '1px solid var(--ara-border-subtle)', paddingTop: '1.25rem' }}>
                  <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--ara-noir)', marginBottom: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Sliders size={16} color="var(--ara-gold)" /> 2. Đơn Vị Tính & Thông Số Kỹ Thuật
                  </h3>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
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

                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                        Màu sắc:
                      </label>
                      <input
                        type="text"
                        placeholder="Trắng, Đen, Xanh..."
                        value={form.color}
                        onChange={(e) => setForm({ ...form, color: e.target.value })}
                        style={{ width: '100%', padding: '0.55rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--ara-border)', fontSize: '0.9rem' }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                        Khổ rộng (cm):
                      </label>
                      <input
                        type="number"
                        min="0"
                        placeholder="160"
                        value={form.widthCm}
                        onChange={(e) => setForm({ ...form, widthCm: e.target.value })}
                        style={{ width: '100%', padding: '0.55rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--ara-border)', fontSize: '0.9rem' }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                        Định lượng GSM (g/m²):
                      </label>
                      <input
                        type="number"
                        min="0"
                        placeholder="220"
                        value={form.gsm}
                        onChange={(e) => setForm({ ...form, gsm: e.target.value })}
                        style={{ width: '100%', padding: '0.55rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--ara-border)', fontSize: '0.9rem' }}
                      />
                    </div>
                  </div>

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

                <div style={{ borderTop: '1px solid var(--ara-border-subtle)', paddingTop: '1.25rem' }}>
                  <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--ara-noir)', marginBottom: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Layers size={16} color="var(--ara-gold)" /> 3. Định Mức Tồn Kho, Giá Vốn & Nhà Cung Cấp
                  </h3>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
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
                    </div>

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
      {/* MODAL: VIEW RAW MATERIAL DETAILS                                          */}
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
                </div>
              </div>

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
              alignItems: 'center',
              gap: '0.75rem',
              background: 'var(--ara-bg-surface)',
            }}>
              <button
                type="button"
                onClick={() => {
                  const m = viewingMaterial;
                  setViewingMaterial(null);
                  setDeletingMaterial(m);
                }}
                style={{
                  padding: '0.45rem 0.85rem',
                  borderRadius: 'var(--radius-sm)',
                  background: '#FEF2F2',
                  color: '#DC2626',
                  border: '1px solid #FECACA',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  cursor: 'pointer',
                  marginRight: 'auto',
                }}
                title="Xóa triệt để NPL"
              >
                <Trash2 size={15} /> Xóa nguyên phụ liệu
              </button>
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
      {/* MODAL: CONFIRM DELETE RAW MATERIAL (TRIỆT ĐỂ & CASCADE)                   */}
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
            maxWidth: '540px',
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
                Xác Nhận Xóa Nguyên Phụ Liệu
              </h3>
            </div>

            <div style={{ padding: '1.5rem', fontSize: '0.9rem', lineHeight: 1.5 }}>
              <p style={{ margin: '0 0 0.85rem' }}>
                Bạn có chắc chắn muốn xóa nguyên phụ liệu sau?
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
                  Mã NPL: <strong>{deletingMaterial.materialCode}</strong> · Danh mục: {getCategoryLabel(deletingMaterial.category)}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--ara-text-muted)' }}>
                  Tồn kho hiện tại: <strong>{deletingMaterial.onHandQty || 0} {deletingMaterial.unit}</strong>
                </div>
              </div>

              <div style={{
                fontSize: '0.82rem',
                color: '#991B1B',
                background: '#FEF2F2',
                padding: '0.85rem',
                borderRadius: '4px',
                border: '1px solid #FECACA',
              }}>
                <strong>* Cảnh báo tác động đồng bộ:</strong>
                <ul style={{ margin: '0.35rem 0 0', paddingLeft: '1.2rem' }}>
                  <li>Mặt hàng này sẽ <strong>mất hoàn toàn</strong> khỏi kho nguyên phụ liệu.</li>
                  <li>Cấu hình kho (lô tồn kho, cuộn vải) của mặt hàng này sẽ được <strong>xóa và giải phóng ô kệ</strong>.</li>
                  <li>Các dòng vật tư tương ứng trong các <strong>lệnh xuất NPL (DRAFT)</strong> cũng sẽ được tự động dọn dẹp sạch sẽ.</li>
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
                Đồng ý xóa triệt để
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CREATE / EDIT CATEGORY                                             */}
      {/* ========================================================================= */}
      {showCategoryModal && (
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
            maxWidth: '560px',
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
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0, color: 'var(--ara-noir)' }}>
                {editingCategory ? 'Chỉnh Sửa Danh Mục' : 'Thêm Danh Mục Phân Loại Mới'}
              </h3>
              <button
                type="button"
                onClick={() => setShowCategoryModal(false)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--ara-text-muted)' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmitCategoryForm}>
              <div style={{ padding: '1.5rem' }}>
                {categoryFormError && (
                  <div style={{
                    padding: '0.7rem 0.9rem',
                    borderRadius: 'var(--radius-sm)',
                    background: '#FDF2F2',
                    border: '1px solid #FCA5A5',
                    color: '#991B1B',
                    fontSize: '0.85rem',
                    marginBottom: '1rem',
                  }}>
                    {categoryFormError}
                  </div>
                )}

                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                    Tên danh mục <span style={{ color: '#DC2626' }}>*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Ví dụ: Dây thun / Chun may, Ruy băng, Vải lót..."
                    value={categoryForm.categoryName}
                    onChange={(e) => setCategoryForm({ ...categoryForm, categoryName: e.target.value })}
                    style={{ width: '100%', padding: '0.55rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--ara-border)', fontSize: '0.9rem' }}
                  />
                </div>

                {!editingCategory && (
                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                      Phân loại cấp lớn <span style={{ color: '#DC2626' }}>*</span>
                    </label>
                    <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.3rem' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.9rem' }}>
                        <input
                          type="radio"
                          name="catMatType"
                          checked={categoryForm.materialType === 'FABRIC'}
                          onChange={() => setCategoryForm({ ...categoryForm, materialType: 'FABRIC' })}
                        />
                        Nhóm Vải (FABRIC)
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.9rem' }}>
                        <input
                          type="radio"
                          name="catMatType"
                          checked={categoryForm.materialType === 'AUXILIARY'}
                          onChange={() => setCategoryForm({ ...categoryForm, materialType: 'AUXILIARY' })}
                        />
                        Nhóm Phụ liệu (AUXILIARY)
                      </label>
                    </div>
                  </div>
                )}

                {!editingCategory && (
                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                      Mã danh mục (để trống tự sinh mã):
                    </label>
                    <input
                      type="text"
                      placeholder="Ví dụ: ELASTIC, RIBBON, LINING..."
                      value={categoryForm.categoryCode}
                      onChange={(e) => setCategoryForm({ ...categoryForm, categoryCode: e.target.value.toUpperCase() })}
                      style={{ width: '100%', padding: '0.55rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--ara-border)', fontSize: '0.9rem', fontFamily: 'monospace' }}
                    />
                  </div>
                )}

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                    Mô tả danh mục:
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Ghi chú chi tiết mục đích sử dụng của danh mục này..."
                    value={categoryForm.description}
                    onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
                    style={{ width: '100%', padding: '0.55rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--ara-border)', fontSize: '0.88rem', resize: 'vertical' }}
                  />
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
                  onClick={() => setShowCategoryModal(false)}
                  disabled={actionLoading}
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="btn-ara-primary"
                  disabled={actionLoading}
                >
                  {actionLoading ? <RefreshCw size={15} className="spinning" /> : editingCategory ? 'Lưu cập nhật' : 'Tạo danh mục'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CONFIRM DELETE CATEGORY (RÀNG BUỘC PHẢI HẾT NPL)                   */}
      {/* ========================================================================= */}
      {deletingCategory && (
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
              background: (deletingCategory.itemCount || 0) > 0 ? '#FEF2F2' : '#F9FAFB',
              color: (deletingCategory.itemCount || 0) > 0 ? '#991B1B' : 'var(--ara-noir)',
            }}>
              <AlertTriangle size={22} color={(deletingCategory.itemCount || 0) > 0 ? '#DC2626' : '#B45309'} />
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>
                {(deletingCategory.itemCount || 0) > 0 ? 'Chặn Xóa Danh Mục NPL' : 'Xác Nhận Xóa Danh Mục NPL'}
              </h3>
            </div>

            <div style={{ padding: '1.5rem', fontSize: '0.9rem', lineHeight: 1.5 }}>
              <div style={{
                background: '#F9FAFB',
                padding: '0.85rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--ara-border)',
                marginBottom: '1rem',
              }}>
                <div style={{ fontWeight: 700, color: 'var(--ara-noir)' }}>{deletingCategory.categoryName}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--ara-text-muted)', marginTop: '2px' }}>
                  Mã: <strong>{deletingCategory.categoryCode}</strong> · Phân loại: {deletingCategory.materialType === 'FABRIC' ? 'Vải' : 'Phụ liệu'}
                </div>
                <div style={{ fontSize: '0.85rem', marginTop: '4px' }}>
                  Số lượng nguyên phụ liệu đang có: <strong style={{ color: (deletingCategory.itemCount || 0) > 0 ? '#DC2626' : '#059669' }}>{deletingCategory.itemCount || 0} mặt hàng</strong>
                </div>
              </div>

              {(deletingCategory.itemCount || 0) > 0 ? (
                <div style={{
                  padding: '0.85rem',
                  borderRadius: '4px',
                  background: '#FEF2F2',
                  border: '1px solid #FECACA',
                  color: '#991B1B',
                  fontSize: '0.85rem',
                }}>
                  <strong>* Quy định an toàn hệ thống:</strong>
                  <p style={{ margin: '0.35rem 0 0' }}>
                    Danh mục này vẫn còn <strong>{deletingCategory.itemCount} nguyên phụ liệu</strong>. Bạn phải <strong>xóa hết tất cả {deletingCategory.itemCount} nguyên phụ liệu này</strong> trong tab "Kho & Danh sách NPL" trước khi được phép xóa danh mục!
                  </p>
                </div>
              ) : (
                <p style={{ margin: 0, color: '#374151' }}>
                  Danh mục này hiện không còn nguyên phụ liệu nào. Bạn có chắc chắn muốn xóa vĩnh viễn danh mục <strong>"{deletingCategory.categoryName}"</strong> khỏi hệ thống?
                </p>
              )}
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
                onClick={() => setDeletingCategory(null)}
              >
                {(deletingCategory.itemCount || 0) > 0 ? 'Đóng' : 'Hủy bỏ'}
              </button>

              {(deletingCategory.itemCount || 0) > 0 ? (
                <button
                  type="button"
                  className="btn-ara-primary"
                  onClick={() => {
                    const code = deletingCategory.categoryCode;
                    setDeletingCategory(null);
                    handleViewCategoryItems(code);
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                >
                  <ArrowRight size={15} /> Đi tới xóa NPL trong danh mục này
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleConfirmDeleteCategory}
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
                  Xác nhận xóa danh mục
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
