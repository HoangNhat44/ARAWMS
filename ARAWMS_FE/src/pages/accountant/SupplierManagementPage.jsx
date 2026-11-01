import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2,
  Plus,
  Edit3,
  FileSignature,
  RefreshCw,
  Search,
  X,
  AlertCircle,
} from 'lucide-react';
import accountantProcurementApi from '../../services/accountantProcurementApi.js';
import { validateSupplierForm } from '../../utils/procurementValidation.js';

const INITIAL_SUPPLIER_FORM = {
  supplierCode: '',
  supplierName: '',
  taxCode: '',
  representativeName: '',
  representativeRole: 'Giám đốc',
  contactName: '',
  phone: '',
  email: '',
  address: '',
  supplyCategory: 'BOTH',
  paymentTermDays: 30,
  leadTimeDays: 7,
  bankName: '',
  accountNo: '',
  accountHolder: '',
  branchName: '',
  notes: '',
  isActive: true,
};

const SUPPLY_CATEGORY_LABELS = {
  FABRIC: 'Vải cuộn (Fabric)',
  AUXILIARY: 'Phụ liệu may (Auxiliary)',
  BOTH: 'Vải & Phụ liệu may',
};

const formatVnd = (value) =>
  `${Number(value || 0).toLocaleString('vi-VN')} ₫`;

const SupplierManagementPage = () => {
  const navigate = useNavigate();
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modal state for Add / Update Supplier (UC 02 & UC 03)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [formData, setFormData] = useState(INITIAL_SUPPLIER_FORM);
  const [formErrors, setFormErrors] = useState({});

  const fetchSuppliers = async () => {
    try {
      setLoading(true);
      const data = await accountantProcurementApi.getSuppliers();
      setSuppliers(data);
    } catch (error) {
      setFeedback({
        type: 'error',
        text: error.response?.data?.message || 'Không thể tải danh sách nhà cung ứng',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const filteredSuppliers = useMemo(() => {
    return suppliers.filter((sup) => {
      const q = searchTerm.trim().toLowerCase();
      const matchSearch =
        !q ||
        (sup.supplierCode || '').toLowerCase().includes(q) ||
        (sup.supplierName || '').toLowerCase().includes(q) ||
        (sup.taxCode || '').toLowerCase().includes(q) ||
        (sup.contactName || '').toLowerCase().includes(q) ||
        (sup.phone || '').toLowerCase().includes(q);

      const matchCat =
        categoryFilter === 'ALL' || (sup.supplyCategory || 'BOTH') === categoryFilter;

      const matchStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'ACTIVE' && sup.isActive !== false) ||
        (statusFilter === 'INACTIVE' && sup.isActive === false);

      return matchSearch && matchCat && matchStatus;
    });
  }, [suppliers, searchTerm, categoryFilter, statusFilter]);

  const kpis = useMemo(() => {
    const total = suppliers.length;
    const activeCount = suppliers.filter((s) => s.isActive !== false).length;
    const totalDebt = suppliers.reduce(
      (sum, s) => sum + Number(s.totalPayableDebt || 0),
      0
    );
    return { total, activeCount, totalDebt };
  }, [suppliers]);

  const openAddModal = () => {
    setEditingSupplier(null);
    setFormData({
      ...INITIAL_SUPPLIER_FORM,
      supplierCode: `SUP-${String(suppliers.length + 1).padStart(3, '0')}`,
    });
    setFormErrors({});
    setFeedback(null);
    setIsModalOpen(true);
  };

  const openEditModal = (supplier) => {
    setEditingSupplier(supplier);
    setFormData({
      supplierCode: supplier.supplierCode || '',
      supplierName: supplier.supplierName || '',
      taxCode: supplier.taxCode || '',
      representativeName: supplier.representativeName || supplier.contactName || '',
      representativeRole: supplier.representativeRole || 'Giám đốc',
      contactName: supplier.contactName || '',
      phone: supplier.phone || '',
      email: supplier.email || '',
      address: supplier.address || '',
      supplyCategory: supplier.supplyCategory || 'BOTH',
      paymentTermDays: supplier.paymentTermDays ?? 30,
      leadTimeDays: supplier.leadTimeDays ?? 7,
      bankName: supplier.bankInfo?.bankName || '',
      accountNo: supplier.bankInfo?.accountNo || '',
      accountHolder: supplier.bankInfo?.accountHolder || '',
      branchName: supplier.bankInfo?.branchName || '',
      notes: supplier.notes || '',
      isActive: supplier.isActive !== false,
    });
    setFormErrors({});
    setFeedback(null);
    setIsModalOpen(true);
  };

  const handleFormChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (formErrors[field]) {
      setFormErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const handleSubmitSupplier = async (e) => {
    e.preventDefault();
    const { isValid, errors } = validateSupplierForm(formData);
    if (!isValid) {
      setFormErrors(errors);
      setFeedback({
        type: 'error',
        text: 'Vui lòng kiểm tra và sửa các thông tin chưa hợp lệ theo cảnh báo đỏ bên dưới.',
      });
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        supplierCode: formData.supplierCode.trim().toUpperCase(),
        supplierName: formData.supplierName.trim(),
        taxCode: formData.taxCode.trim(),
        representativeName: formData.representativeName.trim(),
        representativeRole: formData.representativeRole.trim() || 'Giám đốc',
        contactName: formData.contactName.trim(),
        phone: formData.phone.trim(),
        email: formData.email.trim(),
        address: formData.address.trim(),
        supplyCategory: formData.supplyCategory,
        paymentTermDays: Number(formData.paymentTermDays || 30),
        leadTimeDays: Number(formData.leadTimeDays || 7),
        bankInfo: {
          bankName: formData.bankName.trim(),
          accountNo: formData.accountNo.trim(),
          accountHolder: formData.accountHolder.trim().toUpperCase(),
          branchName: formData.branchName.trim(),
        },
        notes: formData.notes.trim(),
        isActive: Boolean(formData.isActive),
      };

      if (editingSupplier) {
        const res = await accountantProcurementApi.updateSupplier(
          editingSupplier._id,
          payload
        );
        setFeedback({ type: 'success', text: res.message });
      } else {
        const res = await accountantProcurementApi.createSupplier(payload);
        setFeedback({ type: 'success', text: res.message });
      }

      setIsModalOpen(false);
      await fetchSuppliers();
    } catch (error) {
      setFeedback({
        type: 'error',
        text: error.response?.data?.message || 'Lỗi khi lưu thông tin nhà cung ứng',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      {/* Page Header */}
      <section className="wms-page-header">
        <div>
          <h1 className="wms-page-title">
            Quản lý Nhà cung ứng Nguyên phụ liệu (Manage Material Suppliers)
          </h1>
          <p className="wms-page-subtitle">
            UC 01–03: Quản lý hồ sơ pháp lý, điều khoản công nợ, tài khoản ngân hàng thụ hưởng và năng lực cung ứng vải/phụ liệu may mặc.
          </p>
        </div>
        <div className="wms-row-actions">
          <button
            type="button"
            className="wms-btn wms-btn-default"
            onClick={fetchSuppliers}
            disabled={loading}
          >
            <RefreshCw size={16} />
            Làm mới dữ liệu
          </button>
          <button
            type="button"
            className="wms-btn wms-btn-primary"
            onClick={openAddModal}
          >
            <Plus size={16} />
            Thêm Nhà cung ứng (Add Supplier)
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

      {/* KPI Strip */}
      <section className="wms-kpi-strip" aria-label="Thống kê nhà cung ứng">
        <div className="wms-kpi-card">
          <span className="wms-kpi-label">Tổng số Nhà cung ứng</span>
          <span className="wms-kpi-value">{kpis.total} đối tác</span>
          <span className="wms-kpi-meta">Danh mục đối tác cung ứng nguyên phụ liệu</span>
        </div>
        <div className="wms-kpi-card">
          <span className="wms-kpi-label">Đang hợp tác cung ứng</span>
          <span className="wms-kpi-value">{kpis.activeCount} đối tác</span>
          <span className="wms-kpi-meta">Đủ điều kiện ký hợp đồng khung</span>
        </div>
        <div className="wms-kpi-card">
          <span className="wms-kpi-label">Tổng dư nợ phải trả NCC</span>
          <span className="wms-kpi-value">{formatVnd(kpis.totalDebt)}</span>
          <span className="wms-kpi-meta">Công nợ phát sinh từ các hợp đồng ACTIVE</span>
        </div>
      </section>

      {/* Filter Bar */}
      <section className="wms-filter-bar" aria-label="Bộ lọc nhà cung ứng">
        <div className="wms-filter-group">
          <div className="wms-filter-field search-wide">
            <label htmlFor="sup-search" className="wms-label">
              Tìm kiếm Nhà cung ứng
            </label>
            <input
              id="sup-search"
              type="search"
              className="wms-input"
              placeholder="Nhập mã NCC, tên công ty, mã số thuế, người liên hệ, SĐT..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="wms-filter-field">
            <label htmlFor="sup-cat-filter" className="wms-label">
              Nhóm nguyên liệu cung ứng
            </label>
            <select
              id="sup-cat-filter"
              className="wms-select"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="ALL">Tất cả nhóm cung ứng</option>
              <option value="BOTH">Vải & Phụ liệu may</option>
              <option value="FABRIC">Chuyên Vải cuộn (Fabric)</option>
              <option value="AUXILIARY">Chuyên Phụ liệu (Auxiliary)</option>
            </select>
          </div>

          <div className="wms-filter-field">
            <label htmlFor="sup-status-filter" className="wms-label">
              Trạng thái hợp tác
            </label>
            <select
              id="sup-status-filter"
              className="wms-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="ALL">Tất cả trạng thái</option>
              <option value="ACTIVE">Đang hoạt động (Available)</option>
              <option value="INACTIVE">Ngừng giao dịch</option>
            </select>
          </div>
        </div>
      </section>

      {/* Suppliers Table */}
      <section className="wms-table-card" aria-label="Bảng danh sách nhà cung ứng">
        <div className="wms-table-scroll">
          <table className="wms-table">
            <thead>
              <tr>
                <th>Mã NCC</th>
                <th>Tên Doanh nghiệp & Mã số thuế</th>
                <th>Người đại diện & Liên hệ</th>
                <th>Nhóm cung ứng & Kỳ hạn nợ</th>
                <th>Tài khoản Ngân hàng Thụ hưởng</th>
                <th className="wms-td-number">Dư nợ phải trả</th>
                <th>Trạng thái</th>
                <th>Thao tác nghiệp vụ</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8}>Đang tải danh sách nhà cung ứng từ MongoDB Atlas...</td>
                </tr>
              ) : filteredSuppliers.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    Không tìm thấy nhà cung ứng nào khớp với bộ lọc hiện tại.
                  </td>
                </tr>
              ) : (
                filteredSuppliers.map((sup) => (
                  <tr key={sup._id}>
                    <td>
                      <span className="wms-code-pill">{sup.supplierCode}</span>
                    </td>
                    <td>
                      <div>
                        <strong>{sup.supplierName}</strong>
                      </div>
                      <div className="wms-helper-text">
                        MST: {sup.taxCode || 'Chưa cập nhật'}
                      </div>
                      <div className="wms-helper-text">
                        Đ/c: {sup.address || 'Chưa cập nhật'}
                      </div>
                    </td>
                    <td>
                      <div>
                        <strong>
                          {sup.representativeName || sup.contactName || 'Đại diện NCC'}
                        </strong>{' '}
                        ({sup.representativeRole || 'Giám đốc'})
                      </div>
                      <div className="wms-helper-text">
                        Liên hệ: {sup.contactName || '—'} | SĐT: {sup.phone}
                      </div>
                      <div className="wms-helper-text">{sup.email || ''}</div>
                    </td>
                    <td>
                      <div>
                        <span className="wms-status-badge wms-status-reserved">
                          {SUPPLY_CATEGORY_LABELS[sup.supplyCategory || 'BOTH']}
                        </span>
                      </div>
                      <div className="wms-helper-text">
                        Công nợ: {sup.paymentTermDays ?? 30} ngày | Giao hàng:{' '}
                        {sup.leadTimeDays ?? 7} ngày
                      </div>
                    </td>
                    <td>
                      <div>
                        <strong>{sup.bankInfo?.bankName || 'Chưa khai báo NH'}</strong>
                      </div>
                      <div className="wms-helper-text">
                        STK: {sup.bankInfo?.accountNo || '—'}
                      </div>
                      <div className="wms-helper-text">
                        Chủ TK: {sup.bankInfo?.accountHolder || '—'}
                      </div>
                    </td>
                    <td className="wms-td-number">
                      {formatVnd(sup.totalPayableDebt)}
                    </td>
                    <td>
                      {sup.isActive !== false ? (
                        <span className="wms-status-badge wms-status-available">
                          Available (Đang hợp tác)
                        </span>
                      ) : (
                        <span className="wms-status-badge wms-status-out-of-stock">
                          Ngừng hợp tác
                        </span>
                      )}
                    </td>
                    <td>
                      <div className="wms-row-actions">
                        <button
                          type="button"
                          className="wms-btn wms-btn-default wms-btn-sm"
                          onClick={() => openEditModal(sup)}
                        >
                          <Edit3 size={14} />
                          Cập nhật
                        </button>
                        <button
                          type="button"
                          className="wms-btn wms-btn-primary wms-btn-sm"
                          onClick={() =>
                            navigate(`/accountant/contracts?supplierId=${sup._id}`)
                          }
                        >
                          <FileSignature size={14} />
                          Lập HĐ Khung
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Modal Add / Update Material Supplier */}
      {isModalOpen && (
        <div className="wms-modal-backdrop" role="dialog" aria-modal="true">
          <form className="wms-modal-dialog wide" onSubmit={handleSubmitSupplier}>
            <div className="wms-modal-header">
              <h2 className="wms-modal-title">
                {editingSupplier
                  ? `Cập nhật Nhà cung ứng: ${editingSupplier.supplierCode} (Update Material Supplier)`
                  : 'Thêm mới Nhà cung ứng Nguyên phụ liệu (Add Material Supplier)'}
              </h2>
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
                <div className="wms-form-section">
                  <div className="wms-form-section-header">
                    <h3 className="wms-form-section-title">
                      <Building2 size={18} />
                      1. Thông tin Pháp nhân & Liên hệ Nhà cung ứng
                    </h3>
                  </div>

                  <div className="wms-form-grid-3">
                    <div className={`wms-field ${formErrors.supplierCode ? 'has-error' : ''}`}>
                      <label htmlFor="f-sup-code" className="wms-label">
                        Mã Nhà cung ứng <span className="wms-required">*</span>
                      </label>
                      <input
                        id="f-sup-code"
                        type="text"
                        className="wms-input"
                        value={formData.supplierCode}
                        disabled={Boolean(editingSupplier)}
                        onChange={(e) => handleFormChange('supplierCode', e.target.value)}
                        required
                      />
                      {formErrors.supplierCode && (
                        <span className="wms-field-error-text">
                          <AlertCircle size={12} /> {formErrors.supplierCode}
                        </span>
                      )}
                    </div>

                    <div className={`wms-field wms-field-span-2 ${formErrors.supplierName ? 'has-error' : ''}`}>
                      <label htmlFor="f-sup-name" className="wms-label">
                        Tên Pháp nhân Doanh nghiệp <span className="wms-required">*</span>
                      </label>
                      <input
                        id="f-sup-name"
                        type="text"
                        className="wms-input"
                        placeholder="VD: Công ty CP Dệt May Phong Phú"
                        value={formData.supplierName}
                        onChange={(e) => handleFormChange('supplierName', e.target.value)}
                        required
                      />
                      {formErrors.supplierName && (
                        <span className="wms-field-error-text">
                          <AlertCircle size={12} /> {formErrors.supplierName}
                        </span>
                      )}
                    </div>

                    <div className={`wms-field ${formErrors.taxCode ? 'has-error' : ''}`}>
                      <label htmlFor="f-sup-tax" className="wms-label">
                        Mã số thuế Doanh nghiệp <span className="wms-required">*</span>
                      </label>
                      <input
                        id="f-sup-tax"
                        type="text"
                        className="wms-input"
                        placeholder="VD: 0301445566"
                        value={formData.taxCode}
                        onChange={(e) => handleFormChange('taxCode', e.target.value)}
                        required
                      />
                      {formErrors.taxCode && (
                        <span className="wms-field-error-text">
                          <AlertCircle size={12} /> {formErrors.taxCode}
                        </span>
                      )}
                    </div>

                    <div className="wms-field">
                      <label htmlFor="f-sup-rep" className="wms-label">
                        Người đại diện pháp luật (Ký HĐ)
                      </label>
                      <input
                        id="f-sup-rep"
                        type="text"
                        className="wms-input"
                        placeholder="VD: Ông Lê Quốc Bảo"
                        value={formData.representativeName}
                        onChange={(e) =>
                          handleFormChange('representativeName', e.target.value)
                        }
                      />
                    </div>

                    <div className="wms-field">
                      <label htmlFor="f-sup-role" className="wms-label">
                        Chức vụ người đại diện
                      </label>
                      <input
                        id="f-sup-role"
                        type="text"
                        className="wms-input"
                        placeholder="VD: Tổng Giám đốc"
                        value={formData.representativeRole}
                        onChange={(e) =>
                          handleFormChange('representativeRole', e.target.value)
                        }
                      />
                    </div>

                    <div className="wms-field">
                      <label htmlFor="f-sup-contact" className="wms-label">
                        Đầu mối điều phối đơn hàng
                      </label>
                      <input
                        id="f-sup-contact"
                        type="text"
                        className="wms-input"
                        placeholder="VD: Nguyễn Thị Lan (Phòng KD)"
                        value={formData.contactName}
                        onChange={(e) => handleFormChange('contactName', e.target.value)}
                      />
                    </div>

                    <div className={`wms-field ${formErrors.phone ? 'has-error' : ''}`}>
                      <label htmlFor="f-sup-phone" className="wms-label">
                        Số điện thoại liên hệ <span className="wms-required">*</span>
                      </label>
                      <input
                        id="f-sup-phone"
                        type="tel"
                        className="wms-input"
                        placeholder="VD: 0903888999"
                        value={formData.phone}
                        onChange={(e) => handleFormChange('phone', e.target.value)}
                        required
                      />
                      {formErrors.phone && (
                        <span className="wms-field-error-text">
                          <AlertCircle size={12} /> {formErrors.phone}
                        </span>
                      )}
                    </div>

                    <div className={`wms-field ${formErrors.email ? 'has-error' : ''}`}>
                      <label htmlFor="f-sup-email" className="wms-label">
                        Email nhận Hợp đồng & Đơn đặt hàng
                      </label>
                      <input
                        id="f-sup-email"
                        type="email"
                        className="wms-input"
                        placeholder="sales@supplier.vn"
                        value={formData.email}
                        onChange={(e) => handleFormChange('email', e.target.value)}
                      />
                      {formErrors.email && (
                        <span className="wms-field-error-text">
                          <AlertCircle size={12} /> {formErrors.email}
                        </span>
                      )}
                    </div>

                    <div className="wms-field wms-field-span-full">
                      <label htmlFor="f-sup-cat" className="wms-label">
                        Nhóm nguyên phụ liệu cung ứng
                      </label>
                      <select
                        id="f-sup-cat"
                        className="wms-select"
                        value={formData.supplyCategory}
                        onChange={(e) =>
                          handleFormChange('supplyCategory', e.target.value)
                        }
                      >
                        <option value="BOTH">Cung ứng cả Vải cuộn & Phụ liệu may</option>
                        <option value="FABRIC">Chuyên Vải cuộn dệt kim / dệt thoi</option>
                        <option value="AUXILIARY">Chuyên Phụ liệu (Cúc, Chỉ, Khóa kéo, Nhãn)</option>
                      </select>
                    </div>

                    <div className="wms-field wms-field-span-full">
                      <label htmlFor="f-sup-addr" className="wms-label">
                        Địa chỉ trụ sở / Nhà máy dệt may
                      </label>
                      <input
                        id="f-sup-addr"
                        type="text"
                        className="wms-input"
                        placeholder="VD: Lô D12, Khu Công Nghiệp Tân Tạo, Quận Bình Tân, TP.HCM"
                        value={formData.address}
                        onChange={(e) => handleFormChange('address', e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <div className="wms-form-section">
                  <div className="wms-form-section-header">
                    <h3 className="wms-form-section-title">
                      2. Tài khoản Ngân hàng Thụ hưởng & Điều khoản Thương mại Mặc định
                    </h3>
                  </div>

                  <div className="wms-form-grid-3">
                    <div className="wms-field">
                      <label htmlFor="f-bank-name" className="wms-label">
                        Ngân hàng thụ hưởng
                      </label>
                      <input
                        id="f-bank-name"
                        type="text"
                        className="wms-input"
                        placeholder="VD: Vietcombank - CN TP.HCM"
                        value={formData.bankName}
                        onChange={(e) => handleFormChange('bankName', e.target.value)}
                      />
                    </div>

                    <div className={`wms-field ${formErrors.accountNo ? 'has-error' : ''}`}>
                      <label htmlFor="f-bank-no" className="wms-label">
                        Số tài khoản ngân hàng
                      </label>
                      <input
                        id="f-bank-no"
                        type="text"
                        className="wms-input"
                        placeholder="VD: 0071009988776"
                        value={formData.accountNo}
                        onChange={(e) => handleFormChange('accountNo', e.target.value)}
                      />
                      {formErrors.accountNo && (
                        <span className="wms-field-error-text">
                          <AlertCircle size={12} /> {formErrors.accountNo}
                        </span>
                      )}
                    </div>

                    <div className="wms-field">
                      <label htmlFor="f-bank-holder" className="wms-label">
                        Tên chủ tài khoản thụ hưởng
                      </label>
                      <input
                        id="f-bank-holder"
                        type="text"
                        className="wms-input"
                        placeholder="VD: CONG TY CP DET MAY PHONG PHU"
                        value={formData.accountHolder}
                        onChange={(e) =>
                          handleFormChange('accountHolder', e.target.value)
                        }
                      />
                    </div>

                    <div className={`wms-field ${formErrors.paymentTermDays ? 'has-error' : ''}`}>
                      <label htmlFor="f-pay-days" className="wms-label">
                        Kỳ hạn công nợ mặc định (Ngày)
                      </label>
                      <input
                        id="f-pay-days"
                        type="number"
                        min="0"
                        max="365"
                        className="wms-input"
                        value={formData.paymentTermDays}
                        onChange={(e) =>
                          handleFormChange('paymentTermDays', e.target.value)
                        }
                      />
                      {formErrors.paymentTermDays && (
                        <span className="wms-field-error-text">
                          <AlertCircle size={12} /> {formErrors.paymentTermDays}
                        </span>
                      )}
                    </div>

                    <div className={`wms-field ${formErrors.leadTimeDays ? 'has-error' : ''}`}>
                      <label htmlFor="f-lead-days" className="wms-label">
                        Thời gian giao hàng tiêu chuẩn (Ngày)
                      </label>
                      <input
                        id="f-lead-days"
                        type="number"
                        min="1"
                        max="180"
                        className="wms-input"
                        value={formData.leadTimeDays}
                        onChange={(e) =>
                          handleFormChange('leadTimeDays', e.target.value)
                        }
                      />
                      {formErrors.leadTimeDays && (
                        <span className="wms-field-error-text">
                          <AlertCircle size={12} /> {formErrors.leadTimeDays}
                        </span>
                      )}
                    </div>

                    <div className="wms-field">
                      <label htmlFor="f-sup-active" className="wms-label">
                        Trạng thái giao dịch
                      </label>
                      <select
                        id="f-sup-active"
                        className="wms-select"
                        value={formData.isActive ? 'true' : 'false'}
                        onChange={(e) =>
                          handleFormChange('isActive', e.target.value === 'true')
                        }
                      >
                        <option value="true">Đang hợp tác (Available)</option>
                        <option value="false">Tạm ngưng giao dịch</option>
                      </select>
                    </div>
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
                    ? 'Đang lưu...'
                    : editingSupplier
                    ? 'Lưu cập nhật Nhà cung ứng'
                    : 'Tạo mới Nhà cung ứng'}
                </button>
              </div>
            </form>
          </div>
        )}
    </div>
  );
};

export default SupplierManagementPage;

