import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  CalendarClock,
  Plus,
  RefreshCw,
  X,
} from 'lucide-react';
import accountantProcurementApi from '../../services/accountantProcurementApi.js';
import { validateInboundPlanForm } from '../../utils/procurementValidation.js';

const PLAN_STATUS_BADGE = {
  SCHEDULED: {
    label: 'Đã lên lịch chờ hàng về (Scheduled)',
    cls: 'wms-status-reserved',
  },
  IN_INSPECTION: {
    label: 'Đang kiểm định KCS (In Inspection)',
    cls: 'wms-status-processing',
  },
  VERIFIED_MATCHED: {
    label: 'KCS Đạt chuẩn 100% (Verified Matched)',
    cls: 'wms-status-available',
  },
  DEVIATION_REPORTED: {
    label: 'Lệch kế hoạch / Lỗi KCS (Deviation Reported)',
    cls: 'wms-status-damaged',
  },
  RESOLVED_SUPERSEDED: {
    label: 'Đã xử lý sai lệch (Resolved)',
    cls: 'wms-status-completed',
  },
  CANCELLED: {
    label: 'Đã hủy lịch (Cancelled)',
    cls: 'wms-status-rejected',
  },
};

const formatDate = (val) =>
  val ? new Date(val).toLocaleDateString('vi-VN') : '—';

const InboundPlanningPage = () => {
  const [searchParams] = useSearchParams();
  const preselectedContractId = searchParams.get('contractId') || '';

  const [plans, setPlans] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modal Create Inbound Plan
  const [isModalOpen, setIsModalOpen] = useState(Boolean(preselectedContractId));
  const [planErrors, setPlanErrors] = useState({});
  const [planForm, setPlanForm] = useState({
    planCode: '',
    contractId: preselectedContractId,
    scheduledDeliveryDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10),
    expectedItems: [],
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const [plansData, contractsData] = await Promise.all([
        accountantProcurementApi.getInboundPlans(),
        accountantProcurementApi.getContracts(),
      ]);
      setPlans(plansData);
      setContracts(contractsData);

      const defaultContract =
        contractsData.find((c) => c._id === preselectedContractId) ||
        contractsData[0] ||
        null;

      setPlanForm((prev) => ({
        ...prev,
        planCode: `KH-NHAP-${String(plansData.length + 1).padStart(3, '0')}`,
        contractId: defaultContract?._id || '',
        expectedItems: (defaultContract?.contractedMaterials || []).map((m) => ({
          rawMaterialId: m.rawMaterialId?._id || m.rawMaterialId,
          materialCode:
            m.materialCodeSnapshot || m.rawMaterialId?.materialCode || 'NVL',
          materialName:
            m.materialNameSnapshot || m.rawMaterialId?.materialName || '',
          unit: m.unitSnapshot || m.rawMaterialId?.unit || 'METER',
          contractedQty: m.contractedQty || 0,
          plannedQty: m.contractedQty || 100,
        })),
      }));
    } catch (error) {
      setFeedback({
        type: 'error',
        text:
          error.response?.data?.message ||
          'Không thể tải kế hoạch lịch trình tiếp nhận nguyên liệu',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSelectContract = (contractId) => {
    const found = contracts.find((c) => c._id === contractId);
    setPlanErrors((prev) => {
      const next = { ...prev };
      delete next.contractId;
      delete next.expectedItems;
      delete next.itemErrors;
      return next;
    });
    setPlanForm((prev) => ({
      ...prev,
      contractId,
      expectedItems: (found?.contractedMaterials || []).map((m) => ({
        rawMaterialId: m.rawMaterialId?._id || m.rawMaterialId,
        materialCode:
          m.materialCodeSnapshot || m.rawMaterialId?.materialCode || 'NVL',
        materialName:
          m.materialNameSnapshot || m.rawMaterialId?.materialName || '',
        unit: m.unitSnapshot || m.rawMaterialId?.unit || 'METER',
        contractedQty: m.contractedQty || 0,
        plannedQty: m.contractedQty || 100,
      })),
    }));
  };

  const handleExpectedQtyChange = (idx, value) => {
    setPlanErrors((prev) => {
      if (!prev.itemErrors || !prev.itemErrors[idx]) return prev;
      const nextItemErrors = { ...prev.itemErrors };
      delete nextItemErrors[idx];
      return { ...prev, itemErrors: nextItemErrors };
    });
    setPlanForm((prev) => {
      const next = [...prev.expectedItems];
      next[idx] = { ...next[idx], plannedQty: Number(value) };
      return { ...prev, expectedItems: next };
    });
  };

  const handleOpenModal = () => {
    setPlanErrors({});
    setFeedback(null);
    setIsModalOpen(true);
  };

  const handleSubmitPlan = async (e) => {
    e.preventDefault();
    const { isValid, errors } = validateInboundPlanForm(planForm);
    if (!isValid) {
      setPlanErrors(errors);
      setFeedback({
        type: 'error',
        text: 'Vui lòng kiểm tra lại thông tin Kế hoạch tiếp nhận theo cảnh báo đỏ bên dưới.',
      });
      return;
    }

    try {
      setSubmitting(true);
      setFeedback(null);
      setPlanErrors({});
      const res = await accountantProcurementApi.createInboundPlan({
        planCode: planForm.planCode.trim().toUpperCase(),
        contractId: planForm.contractId,
        scheduledDeliveryDate: planForm.scheduledDeliveryDate,
        expectedItems: planForm.expectedItems.map((i) => ({
          rawMaterialId: i.rawMaterialId,
          plannedQty: Number(i.plannedQty),
        })),
      });
      setFeedback({ type: 'success', text: res.message });
      setIsModalOpen(false);
      await loadData();
    } catch (error) {
      setFeedback({
        type: 'error',
        text:
          error.response?.data?.message ||
          'Lỗi khi lập kế hoạch lịch trình tiếp nhận nguyên liệu',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const filteredPlans = useMemo(() => {
    return plans.filter((p) => {
      const q = searchTerm.trim().toLowerCase();
      const matchSearch =
        !q ||
        (p.planCode || '').toLowerCase().includes(q) ||
        (p.contractId?.contractCode || '').toLowerCase().includes(q) ||
        (p.supplierId?.supplierName || '').toLowerCase().includes(q);
      const matchStatus = statusFilter === 'ALL' || p.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [plans, searchTerm, statusFilter]);

  return (
    <div>
      {/* Page Header */}
      <section className="wms-page-header">
        <div>
          <h1 className="wms-page-title">
            Lập Kế hoạch Lịch trình Tiếp nhận Nguyên liệu (Schedule Material Inbound Plan)
          </h1>
          <p className="wms-page-subtitle">
            UC 05 (Luồng 1): Lên lịch các đợt giao hàng nguyên phụ liệu từ Hợp đồng để Kỹ thuật viên may (Garment Technician) đối chiếu số lượng và kiểm định KCS khi hàng về kho.
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
          <button
            type="button"
            className="wms-btn wms-btn-primary"
            onClick={handleOpenModal}
          >
            <Plus size={16} />
            Lập Kế hoạch Tiếp nhận mới
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

      {/* Filter Bar */}
      <section className="wms-filter-bar">
        <div className="wms-filter-group">
          <div className="wms-filter-field search-wide">
            <label htmlFor="p-search" className="wms-label">
              Tìm kiếm Mã Kế hoạch / Số Hợp đồng / Nhà cung ứng
            </label>
            <input
              id="p-search"
              type="search"
              className="wms-input"
              placeholder="Nhập KH-NHAP-..., HDK-2026-..., tên NCC..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="wms-filter-field">
            <label htmlFor="p-status" className="wms-label">
              Trạng thái Tiếp nhận & Kiểm định KCS
            </label>
            <select
              id="p-status"
              className="wms-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="ALL">Tất cả trạng thái</option>
              <option value="SCHEDULED">Đã lên lịch chờ hàng về</option>
              <option value="IN_INSPECTION">Đang kiểm định KCS</option>
              <option value="VERIFIED_MATCHED">KCS Đạt chuẩn 100%</option>
              <option value="DEVIATION_REPORTED">Lệch kế hoạch / Lỗi KCS</option>
              <option value="RESOLVED_SUPERSEDED">Đã xử lý sai lệch</option>
            </select>
          </div>
        </div>
      </section>

      {/* Plans Table */}
      <section className="wms-table-card">
        <div className="wms-table-scroll">
          <table className="wms-table">
            <thead>
              <tr>
                <th>Mã Kế hoạch</th>
                <th>Số Hợp đồng & Nhà cung ứng</th>
                <th>Ngày giao dự kiến</th>
                <th>Chi tiết Số lượng Dự kiến vs. Thực nhận KCS</th>
                <th>Kết quả Đối chiếu của Kỹ thuật may (KCS)</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6}>Đang tải kế hoạch tiếp nhận nguyên liệu...</td>
                </tr>
              ) : filteredPlans.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    Chưa có kế hoạch lịch trình tiếp nhận nào khớp với bộ lọc.
                  </td>
                </tr>
              ) : (
                filteredPlans.map((plan) => {
                  const badge = PLAN_STATUS_BADGE[plan.status] || {
                    label: plan.status,
                    cls: 'wms-status-pending',
                  };
                  return (
                    <tr key={plan._id}>
                      <td>
                        <span className="wms-code-pill">{plan.planCode}</span>
                      </td>
                      <td>
                        <div>
                          <strong>
                            {plan.contractId?.contractCode || 'Hợp đồng'}
                          </strong>
                        </div>
                        <div className="wms-helper-text">
                          NCC: {plan.supplierId?.supplierName || '—'}
                        </div>
                      </td>
                      <td>
                        <strong>{formatDate(plan.scheduledDeliveryDate)}</strong>
                      </td>
                      <td>
                        {(plan.expectedItems || []).map((item, idx) => (
                          <div key={idx} className="wms-helper-text">
                            •{' '}
                            <strong>
                              {item.rawMaterialId?.materialCode || 'NVL'}
                            </strong>{' '}
                            ({item.rawMaterialId?.materialName || ''}): Dự kiến{' '}
                            <strong>
                              {Number(item.plannedQty || 0).toLocaleString('vi-VN')}
                            </strong>{' '}
                            | Đạt KCS:{' '}
                            <strong>
                              {Number(
                                item.actualVerifiedPassedQty || 0
                              ).toLocaleString('vi-VN')}
                            </strong>{' '}
                            | Lỗi/Thiếu:{' '}
                            <strong>
                              {Number(
                                item.actualDefectiveOrShortQty || 0
                              ).toLocaleString('vi-VN')}
                            </strong>
                          </div>
                        ))}
                      </td>
                      <td>
                        <div>
                          {plan.technicianVerification?.deviationSummary ||
                            'Đang chờ lô vải/phụ liệu cập kho để KCS đối chiếu'}
                        </div>
                      </td>
                      <td>
                        <span className={`wms-status-badge ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Modal Create Inbound Plan */}
      {isModalOpen && (
        <div className="wms-modal-backdrop" role="dialog" aria-modal="true">
          <form className="wms-modal-dialog wide" onSubmit={handleSubmitPlan}>
            <div className="wms-modal-header">
              <h2 className="wms-modal-title">
                Lập Kế hoạch Lịch trình Tiếp nhận Nguyên phụ liệu (Schedule Material Inbound Plan)
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
                    <CalendarClock size={18} />
                    Thông tin Đợt giao hàng & Phân bổ Số lượng Dự kiến về Kho
                  </h3>
                </div>

                <div className="wms-form-grid-3">
                  <div className={`wms-field ${planErrors.planCode ? 'has-error' : ''}`}>
                    <label htmlFor="pf-code" className="wms-label">
                      Mã Kế hoạch Tiếp nhận <span className="wms-required">*</span>
                    </label>
                    <input
                      id="pf-code"
                      type="text"
                      className="wms-input"
                      value={planForm.planCode}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (planErrors.planCode) {
                          setPlanErrors((prev) => {
                            const next = { ...prev };
                            delete next.planCode;
                            return next;
                          });
                        }
                        setPlanForm((prev) => ({
                          ...prev,
                          planCode: val,
                        }));
                      }}
                      required
                    />
                    {planErrors.planCode && (
                      <span className="wms-field-error-text">
                        <AlertCircle size={12} /> {planErrors.planCode}
                      </span>
                    )}
                  </div>

                  <div className={`wms-field ${planErrors.contractId ? 'has-error' : ''}`}>
                    <label htmlFor="pf-contract" className="wms-label">
                      Chọn Hợp đồng Nguyên phụ liệu{' '}
                      <span className="wms-required">*</span>
                    </label>
                    <select
                      id="pf-contract"
                      className="wms-select"
                      value={planForm.contractId}
                      onChange={(e) => handleSelectContract(e.target.value)}
                      required
                    >
                      <option value="">-- Chọn Hợp đồng --</option>
                      {contracts.map((c) => (
                        <option key={c._id} value={c._id}>
                          [{c.contractCode}] {c.supplierId?.supplierName} ({c.status})
                        </option>
                      ))}
                    </select>
                    {planErrors.contractId && (
                      <span className="wms-field-error-text">
                        <AlertCircle size={12} /> {planErrors.contractId}
                      </span>
                    )}
                  </div>

                  <div className={`wms-field ${planErrors.scheduledDeliveryDate ? 'has-error' : ''}`}>
                    <label htmlFor="pf-date" className="wms-label">
                      Ngày giao hàng dự kiến về Kho{' '}
                      <span className="wms-required">*</span>
                    </label>
                    <input
                      id="pf-date"
                      type="date"
                      className="wms-input"
                      value={planForm.scheduledDeliveryDate}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (planErrors.scheduledDeliveryDate) {
                          setPlanErrors((prev) => {
                            const next = { ...prev };
                            delete next.scheduledDeliveryDate;
                            return next;
                          });
                        }
                        setPlanForm((prev) => ({
                          ...prev,
                          scheduledDeliveryDate: val,
                        }));
                      }}
                      required
                    />
                    {planErrors.scheduledDeliveryDate && (
                      <span className="wms-field-error-text">
                        <AlertCircle size={12} /> {planErrors.scheduledDeliveryDate}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="wms-form-section">
                <div className="wms-form-section-header">
                  <h3 className="wms-form-section-title">
                    Danh mục Nguyên phụ liệu dự kiến tiếp nhận trong đợt này
                  </h3>
                </div>

                {planErrors.expectedItems && (
                  <div className="wms-feedback-banner error" style={{ margin: '8px 0' }}>
                    <span>
                      <AlertCircle size={14} style={{ display: 'inline', marginRight: 6 }} />
                      {planErrors.expectedItems}
                    </span>
                  </div>
                )}

                <div className="wms-table-scroll">
                  <table className="wms-table">
                    <thead>
                      <tr>
                        <th>Mã & Tên Nguyên phụ liệu</th>
                        <th>Đơn vị tính</th>
                        <th className="wms-td-number">Tổng SL theo Hợp đồng</th>
                        <th>Số lượng dự kiến giao đợt này</th>
                      </tr>
                    </thead>
                    <tbody>
                      {planForm.expectedItems.map((item, idx) => (
                        <tr key={idx}>
                          <td>
                            <strong>{item.materialCode}</strong> —{' '}
                            {item.materialName}
                          </td>
                          <td>{item.unit}</td>
                          <td className="wms-td-number">
                            {Number(item.contractedQty || 0).toLocaleString(
                              'vi-VN'
                            )}
                          </td>
                          <td>
                            <div className={`wms-field ${planErrors.itemErrors?.[idx] ? 'has-error' : ''}`}>
                              <input
                                type="number"
                                min="1"
                                className="wms-input"
                                value={item.plannedQty}
                                onChange={(e) =>
                                  handleExpectedQtyChange(idx, e.target.value)
                                }
                                required
                              />
                              {planErrors.itemErrors?.[idx] && (
                                <span className="wms-field-error-text">
                                  <AlertCircle size={12} /> {planErrors.itemErrors[idx]}
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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
                  ? 'Đang lưu Kế hoạch...'
                  : 'Xác nhận Lập Kế hoạch Tiếp nhận'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default InboundPlanningPage;

