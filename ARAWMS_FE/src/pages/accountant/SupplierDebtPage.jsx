import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Wallet,
  Receipt,
  Truck,
  Building2,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Eye,
  RefreshCw,
  Search,
  FileText,
  Printer,
  ExternalLink,
  ShieldAlert,
  X,
  CreditCard,
  Ban,
  ArrowLeftRight,
  Check,
  Package,
  Settings,
  History,
} from 'lucide-react';
import accountantProcurementApi from '../../services/accountantProcurementApi.js';

const AGING_BADGE = {
  IN_TERM: {
    label: 'Trong hạn',
    cls: 'wms-status-available',
  },
  DUE_SOON: {
    label: 'Sắp đến hạn (<= 7 ngày)',
    cls: 'wms-status-processing',
  },
  OVERDUE_1_30: {
    label: 'Quá hạn 1-30 ngày',
    cls: 'wms-status-damaged',
  },
  OVERDUE_31_60: {
    label: 'Quá hạn 31-60 ngày',
    cls: 'wms-status-rejected',
  },
  OVERDUE_OVER_60: {
    label: 'Quá hạn > 60 ngày',
    cls: 'wms-status-rejected',
  },
  SETTLED: {
    label: 'Đã tất toán (Hết nợ)',
    cls: 'wms-status-completed',
  },
};

const formatVnd = (amount) => {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(Number(amount) || 0);
};

const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return String(dateStr);
  }
};

const SupplierDebtPage = () => {
  const navigate = useNavigate();

  // Tab State: 'SUPPLIERS' (Công nợ NCC - Phải trả) | 'CARRIER' (Công nợ GHN - Phải thu & Bù trừ COD)
  const [activeTab, setActiveTab] = useState('SUPPLIERS');

  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState(null);

  // Dữ liệu Công nợ NCC
  const [supplierDebtData, setSupplierDebtData] = useState({
    kpis: {
      totalSupplierDebt: 0,
      totalOverdueDebt: 0,
      totalDueSoonDebt: 0,
      totalInTermDebt: 0,
      suppliersWithDebtCount: 0,
      totalSuppliersCount: 0,
    },
    suppliers: [],
  });

  // Dữ liệu Công nợ GHN
  const [carrierDebtData, setCarrierDebtData] = useState({
    carrier: { carrierCode: 'GHN', carrierName: 'Giao Hàng Nhanh' },
    metrics: {
      totalOrdersCount: 0,
      deliveredOrdersCount: 0,
      returnedOrdersCount: 0,
      inTransitOrdersCount: 0,
      otherOrdersCount: 0,
      totalCodCollected: 0,
      totalPendingCod: 0,
      totalShippingFee: 0,
      netReceivableAmount: 0,
      redFlagDiscrepancyCount: 0,
      totalDiscrepancyAmount: 0,
    },
    recentBatches: [],
  });

  // Filter & Search cho Tab NCC
  const [searchTerm, setSearchTerm] = useState('');
  const [debtStatusFilter, setDebtStatusFilter] = useState('ALL'); // ALL | HAS_DEBT | OVERDUE | SETTLED
  const [sortBy, setSortBy] = useState('NEWEST'); // 'NEWEST' | 'OLDEST' | 'DEBT_DESC' | 'OVERDUE_FIRST'

  // Modal Sổ chi tiết công nợ NCC (Statement of Account)
  const [selectedSupplierForLedger, setSelectedSupplierForLedger] = useState(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerData, setLedgerData] = useState(null);

  // Modal Popover nhỏ xem danh sách đơn hàng của đợt đối soát GHN
  const [selectedBatchForOrders, setSelectedBatchForOrders] = useState(null);

  // Modal Chi tiết các đơn hàng cấu thành tiền COD thu hộ (1.990.000 ₫)
  const [showDeliveredOrdersModal, setShowDeliveredOrdersModal] = useState(false);

  // Modal Cấu hình cước phí GHN thỏa thuận
  const [showCarrierConfigModal, setShowCarrierConfigModal] = useState(false);
  const [configuredShippingFee, setConfiguredShippingFee] = useState(19000);
  const [applyToExistingOrders, setApplyToExistingOrders] = useState(true);
  const [savingCarrierConfig, setSavingCarrierConfig] = useState(false);

  // Modal Xác nhận đã nhận tiền COD từ GHN (Tất toán công nợ)
  const [showSettleCodModal, setShowSettleCodModal] = useState(false);
  const [settleAmount, setSettleAmount] = useState(0);
  const [settlePaymentMethod, setSettlePaymentMethod] = useState('BANK_TRANSFER');
  const [settleBankName, setSettleBankName] = useState('Ngân hàng TMCP Quân Đội (MB Bank)');
  const [settleAccountNo, setSettleAccountNo] = useState('0988888888');
  const [settleTransactionReference, setSettleTransactionReference] = useState('');
  const [settleNotes, setSettleNotes] = useState('');
  const [settleDate, setSettleDate] = useState('');
  const [submittingSettle, setSubmittingSettle] = useState(false);

  // Modal Xác nhận Shop thanh toán tiền cước cho GHN (Tất toán nợ cước phí)
  const [showSettleShippingModal, setShowSettleShippingModal] = useState(false);
  const [settleShippingAmount, setSettleShippingAmount] = useState(0);
  const [settleShippingPaymentMethod, setSettleShippingPaymentMethod] = useState('BANK_TRANSFER');
  const [settleShippingBankName, setSettleShippingBankName] = useState('Ngân hàng TMCP Việt Nam Thịnh Vượng (VPBank)');
  const [settleShippingAccountNo, setSettleShippingAccountNo] = useState('12345678999');
  const [settleShippingAccountHolder, setSettleShippingAccountHolder] = useState('CONG TY CO PHAN DICH VU GIAO HANG NHANH');
  const [settleShippingTransactionReference, setSettleShippingTransactionReference] = useState('');
  const [settleShippingNotes, setSettleShippingNotes] = useState('');
  const [settleShippingDate, setSettleShippingDate] = useState('');
  const [submittingSettleShipping, setSubmittingSettleShipping] = useState(false);

  // Modal Xem chi tiết một đợt thanh toán trước đó
  const [selectedSettlementDetail, setSelectedSettlementDetail] = useState(null);
  // Modal Lịch sử các đợt thanh toán & đối soát GHN
  const [showSettlementHistoryModal, setShowSettlementHistoryModal] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const [supRes, carRes] = await Promise.all([
        accountantProcurementApi.getSupplierDebtOverview().catch((err) => {
          console.warn('Lỗi lấy công nợ NCC:', err);
          return null;
        }),
        accountantProcurementApi.getCarrierDebtOverview().catch((err) => {
          console.warn('Lỗi lấy công nợ GHN:', err);
          return null;
        }),
      ]);

      if (supRes) setSupplierDebtData(supRes);
      if (carRes) {
        setCarrierDebtData(carRes);
        if (carRes.carrier?.baseShippingFee) {
          setConfiguredShippingFee(carRes.carrier.baseShippingFee);
        }
      }
    } catch (err) {
      console.error('Lỗi tải dữ liệu công nợ:', err);
      setFeedback({
        type: 'error',
        text: 'Không thể tải báo cáo công nợ. Vui lòng thử lại sau.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Lưu cấu hình cước phí đối tác GHN
  const handleSaveCarrierConfig = async (e) => {
    e.preventDefault();
    const fee = Number(configuredShippingFee);
    if (isNaN(fee) || fee < 0) {
      alert('Vui lòng nhập mức cước phí thỏa thuận hợp lệ (số không âm).');
      return;
    }

    try {
      setSavingCarrierConfig(true);
      await accountantProcurementApi.updateCarrierConfig({
        baseShippingFee: fee,
        updateExistingOrders: applyToExistingOrders,
      });

      setFeedback({
        type: 'success',
        text: `Đã cập nhật giá cước phí thỏa thuận cho GHN: ${formatVnd(fee)}/đơn!`,
      });
      setShowCarrierConfigModal(false);
      await loadData();
    } catch (err) {
      alert(err.response?.data?.message || 'Không thể lưu cấu hình cước phí.');
    } finally {
      setSavingCarrierConfig(false);
    }
  };

  // Mở modal xác nhận đã nhận tiền COD từ GHN
  const handleOpenSettleCodModal = () => {
    const netReceivable = carrierDebtData.metrics?.netReceivableAmount || 0;
    setSettleAmount(netReceivable);
    const todayStr = new Date().toISOString().split('T')[0];
    setSettleDate(todayStr);
    setSettleTransactionReference('');
    setSettleNotes('Thanh toán tiền COD kỳ đối soát Giao Hàng Nhanh sau bù trừ cước phí vận chuyển');
    setShowSettleCodModal(true);
  };

  // Xác nhận lưu phiếu thu và tất toán công nợ GHN
  const handleSubmitSettleCod = async (e) => {
    e.preventDefault();
    const amountNum = Number(settleAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      alert('Vui lòng nhập số tiền thanh toán hợp lệ (lớn hơn 0).');
      return;
    }

    if (!settleTransactionReference.trim()) {
      alert('Vui lòng nhập mã giao dịch ngân hàng / số tham chiếu chứng từ.');
      return;
    }

    try {
      setSubmittingSettle(true);
      const res = await accountantProcurementApi.settleCarrierCodPayment({
        amount: amountNum,
        paymentMethod: settlePaymentMethod,
        bankInfo: {
          bankName: settleBankName,
          accountNo: settleAccountNo,
          accountHolder: 'ARA STORE CO., LTD',
        },
        transactionReference: settleTransactionReference.trim(),
        notes: settleNotes.trim(),
        voucherDate: settleDate,
      });

      setFeedback({
        type: 'success',
        text: `Đã xác nhận nhận tiền COD thành công! Ghi nhận Phiếu Thu [${res.data?.voucher?.voucherCode}], tất toán ${res.data?.settledOrdersCount || 0} đơn hàng và đưa công nợ GHN về 0 ₫!`,
      });
      setShowSettleCodModal(false);
      await loadData();
    } catch (err) {
      alert(err.response?.data?.message || 'Không thể xác nhận nhận tiền COD.');
    } finally {
      setSubmittingSettle(false);
    }
  };

  // Mở modal xác nhận Shop thanh toán tiền cước cho GHN
  const handleOpenSettleShippingModal = () => {
    const debtAmount = carrierDebtData.metrics?.shopDebtToCarrier || 0;
    setSettleShippingAmount(debtAmount);
    const todayStr = new Date().toISOString().split('T')[0];
    setSettleShippingDate(todayStr);
    setSettleShippingTransactionReference('');
    setSettleShippingNotes('Thanh toán cước phí vận chuyển nợ đối tác Giao Hàng Nhanh (GHN)');
    setShowSettleShippingModal(true);
  };

  // Xác nhận lưu phiếu chi cước phí cho GHN
  const handleSubmitSettleShipping = async (e) => {
    e.preventDefault();
    const amountNum = Number(settleShippingAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      alert('Vui lòng nhập số tiền thanh toán cước hợp lệ (lớn hơn 0).');
      return;
    }

    if (!settleShippingTransactionReference.trim()) {
      alert('Vui lòng nhập mã giao dịch ngân hàng / số chứng từ ủy nhiệm chi.');
      return;
    }

    try {
      setSubmittingSettleShipping(true);
      const res = await accountantProcurementApi.settleCarrierShippingFeePayment({
        amount: amountNum,
        paymentMethod: settleShippingPaymentMethod,
        bankInfo: {
          bankName: settleShippingBankName,
          accountNo: settleShippingAccountNo,
          accountHolder: settleShippingAccountHolder,
        },
        transactionReference: settleShippingTransactionReference.trim(),
        notes: settleShippingNotes.trim(),
        voucherDate: settleShippingDate,
      });

      setFeedback({
        type: 'success',
        text: `Đã xác nhận thanh toán ${formatVnd(amountNum)} cước phí cho GHN thành công! Ghi nhận Phiếu Chi [${res.data?.voucher?.voucherCode}], tất toán cước ${res.data?.settledOrdersCount || 0} đơn hàng!`,
      });
      setShowSettleShippingModal(false);
      await loadData();
    } catch (err) {
      alert(err.response?.data?.message || 'Không thể xác nhận thanh toán cước GHN.');
    } finally {
      setSubmittingSettleShipping(false);
    }
  };

  // Lọc và sắp xếp danh sách NCC
  const filteredSuppliers = useMemo(() => {
    const list = supplierDebtData.suppliers || [];
    const q = searchTerm.trim().toLowerCase();

    const filtered = list.filter((sup) => {
      const matchSearch =
        !q ||
        sup.supplierName?.toLowerCase().includes(q) ||
        sup.supplierCode?.toLowerCase().includes(q) ||
        sup.phone?.includes(q) ||
        sup.taxCode?.includes(q);

      let matchFilter = true;
      if (debtStatusFilter === 'HAS_DEBT') {
        matchFilter = sup.currentDebt > 0;
      } else if (debtStatusFilter === 'OVERDUE') {
        matchFilter = sup.isOverdue && sup.currentDebt > 0;
      } else if (debtStatusFilter === 'DUE_SOON') {
        matchFilter = sup.isDueSoon && sup.currentDebt > 0;
      } else if (debtStatusFilter === 'SETTLED') {
        matchFilter = sup.currentDebt === 0;
      }

      return matchSearch && matchFilter;
    });

    return [...filtered].sort((a, b) => {
      if (sortBy === 'OLDEST') {
        return new Date(a.createdAt || a.updatedAt || 0) - new Date(b.createdAt || b.updatedAt || 0);
      }
      if (sortBy === 'DEBT_DESC') {
        return Number(b.currentDebt || 0) - Number(a.currentDebt || 0);
      }
      if (sortBy === 'OVERDUE_FIRST') {
        if (b.isOverdue && !a.isOverdue) return 1;
        if (!b.isOverdue && a.isOverdue) return -1;
        return Number(b.currentDebt || 0) - Number(a.currentDebt || 0);
      }
      // NEWEST (Mặc định): Mới nhất trước (Mới → Cũ)
      return new Date(b.createdAt || b.updatedAt || 0) - new Date(a.createdAt || a.updatedAt || 0);
    });
  }, [supplierDebtData.suppliers, searchTerm, debtStatusFilter, sortBy]);

  // Mở Sổ chi tiết công nợ NCC
  const handleOpenLedgerModal = async (supplier) => {
    setSelectedSupplierForLedger(supplier);
    setLedgerLoading(true);
    setLedgerData(null);
    try {
      const data = await accountantProcurementApi.getSupplierDebtLedger(supplier.supplierId);
      setLedgerData(data);
    } catch (err) {
      console.error('Lỗi lấy sổ chi tiết công nợ:', err);
      setFeedback({
        type: 'error',
        text: 'Không thể lấy sổ chi tiết công nợ của nhà cung ứng này.',
      });
    } finally {
      setLedgerLoading(false);
    }
  };

  return (
    <div>
      {/* Page Header */}
      <section className="wms-page-header">
        <div>
          <h1 className="wms-page-title">Quản lý Công nợ Toàn diện</h1>
          <p className="wms-page-subtitle">
            Theo dõi hai dòng công nợ trọng yếu: Công nợ Phải trả Nhà cung cấp vải/phụ liệu may và Công nợ Phải thu / Bù trừ COD đơn vị vận chuyển Giao Hàng Nhanh (GHN).
          </p>
        </div>
        <div className="wms-row-actions">
          <button
            type="button"
            className="wms-btn wms-btn-default"
            onClick={loadData}
            disabled={loading}
          >
            <RefreshCw size={15} /> Làm mới
          </button>
          <button
            type="button"
            className="wms-btn wms-btn-primary"
            onClick={() => navigate('/accountant/payment-vouchers')}
            title="Lập phiếu chi trả nợ NCC hoặc hoàn tiền"
          >
            <Receipt size={15} /> Lập Phiếu Chi Nhanh
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
            <X size={14} />
          </button>
        </div>
      )}

      {/* KPI Financial Overview Strip (4 thẻ chỉ số tài chính) */}
      <section className="wms-kpi-strip">
        <div className="wms-kpi-card">
          <div className="wms-kpi-label">Tổng nợ phải trả NCC (AP)</div>
          <div className="wms-kpi-value" style={{ color: '#D97706' }}>
            {formatVnd(supplierDebtData.kpis?.totalSupplierDebt)}
          </div>
          <div className="wms-kpi-sub">
            {supplierDebtData.kpis?.suppliersWithDebtCount} / {supplierDebtData.kpis?.totalSuppliersCount} NCC đang còn dư nợ
          </div>
        </div>

        <div className="wms-kpi-card">
          <div className="wms-kpi-label">Nợ NCC quá hạn thanh toán</div>
          <div className="wms-kpi-value" style={{ color: '#DC2626' }}>
            {formatVnd(supplierDebtData.kpis?.totalOverdueDebt)}
          </div>
          <div className="wms-kpi-sub" style={{ color: '#DC2626', fontWeight: 600 }}>
            {supplierDebtData.kpis?.totalOverdueDebt > 0 ? '⚠️ Cần ưu tiên thanh toán' : '✓ 100% nợ đang trong hạn'}
          </div>
        </div>

        <div className="wms-kpi-card">
          <div className="wms-kpi-label">Tiền COD GHN đang giữ (Phải thu)</div>
          <div className="wms-kpi-value" style={{ color: '#0284C7' }}>
            {formatVnd(carrierDebtData.metrics?.totalCodCollected)}
          </div>
          <div className="wms-kpi-sub">
            Từ {carrierDebtData.metrics?.deliveredOrdersCount || 0} đơn giao thành công
          </div>
        </div>

        {(() => {
          const shopDebt = carrierDebtData.metrics?.shopDebtToCarrier || 0;
          const carrierDebt = carrierDebtData.metrics?.carrierDebtToShop || 0;
          const isShopOwing = shopDebt > 0;

          return (
            <div className="wms-kpi-card">
              <div className="wms-kpi-label">
                {isShopOwing ? 'Shop nợ cước GHN (Net)' : 'Thực nhận sau bù trừ cước (Net)'}
              </div>
              <div
                className="wms-kpi-value"
                style={{ color: isShopOwing ? '#DC2626' : carrierDebt > 0 ? '#16A34A' : '#475569' }}
              >
                {isShopOwing
                  ? `- ${formatVnd(shopDebt)}`
                  : carrierDebt > 0
                  ? `+ ${formatVnd(carrierDebt)}`
                  : '0 ₫'}
              </div>
              <div className="wms-kpi-sub">
                {isShopOwing
                  ? `Chưa đủ COD bù trừ cước (${formatVnd(carrierDebtData.metrics?.totalShippingFee)})`
                  : `Đã trừ ${formatVnd(carrierDebtData.metrics?.totalShippingFee)} cước GHN`}
              </div>
            </div>
          );
        })()}
      </section>

      {/* Tabs Switcher: Phải trả NCC vs Phải thu Vận chuyển */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <button
          type="button"
          className={`wms-btn ${activeTab === 'SUPPLIERS' ? 'wms-btn-primary' : 'wms-btn-default'}`}
          onClick={() => setActiveTab('SUPPLIERS')}
          style={{ height: '38px', fontWeight: 600 }}
        >
          <Building2 size={16} />
          1. Công nợ Nhà Cung Cấp (Phải trả - AP) ({supplierDebtData.suppliers?.length || 0})
        </button>
        <button
          type="button"
          className={`wms-btn ${activeTab === 'CARRIER' ? 'wms-btn-primary' : 'wms-btn-default'}`}
          onClick={() => setActiveTab('CARRIER')}
          style={{ height: '38px', fontWeight: 600 }}
        >
          <Truck size={16} />
          2. Công nợ Vận chuyển GHN (Phải thu & Bù trừ COD)
        </button>
      </div>

      {/* TAB 1: CÔNG NỢ NHÀ CUNG CẤP (AP) */}
      {activeTab === 'SUPPLIERS' && (
        <section className="wms-table-card">
          {/* Filter Bar */}
          <div className="wms-filter-bar" style={{ padding: '14px 16px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: '260px' }}>
              <Search size={15} style={{ position: 'absolute', left: '10px', top: '11px', color: 'var(--wms-text-light)' }} />
              <input
                type="text"
                className="wms-input"
                style={{ paddingLeft: '32px' }}
                placeholder="Tìm NCC theo tên, mã nhà cung cấp, SĐT, mã số thuế..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div style={{ minWidth: '220px' }}>
              <select
                className="wms-select"
                value={debtStatusFilter}
                onChange={(e) => setDebtStatusFilter(e.target.value)}
              >
                <option value="ALL">Tất cả tình trạng nợ</option>
                <option value="HAS_DEBT">Chỉ xem NCC đang còn dư nợ</option>
                <option value="OVERDUE">🚨 Chỉ xem NCC có nợ quá hạn</option>
                <option value="DUE_SOON">⚠️ Sắp đến hạn thanh toán (7 ngày)</option>
                <option value="SETTLED">✓ Đã tất toán (Hết nợ)</option>
              </select>
            </div>

            <div style={{ minWidth: '220px' }}>
              <select
                className="wms-select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                title="Thứ tự sắp xếp danh sách nhà cung ứng"
              >
                <option value="NEWEST">Mới nhất trước (Mới → Cũ)</option>
                <option value="OLDEST">Cũ nhất trước (Cũ → Mới)</option>
                <option value="DEBT_DESC">Dư nợ giảm dần (Nợ nhiều → ít)</option>
                <option value="OVERDUE_FIRST">🚨 Nợ quá hạn ưu tiên</option>
              </select>
            </div>
          </div>

          {/* Supplier Debt Table */}
          <div className="wms-table-scroll no-horizontal-scroll">
            <table className="wms-table wms-table-responsive-fit" style={{ fontSize: '12.5px' }}>
              <colgroup>
                <col style={{ width: '18%' }} />
                <col style={{ width: '15%' }} />
                <col style={{ width: '9%' }} />
                <col style={{ width: '13%' }} />
                <col style={{ width: '13%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '8%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Mã & Tên Nhà Cung Ứng</th>
                  <th>Liên hệ & MST</th>
                  <th>Số Hợp Đồng</th>
                  <th className="wms-td-number">Tổng Mua Hàng</th>
                  <th className="wms-td-number">Đã Thanh Toán</th>
                  <th className="wms-td-number">Số Dư Nợ Hiện Tại</th>
                  <th style={{ textAlign: 'center' }}>Tuổi Nợ & Hạn Trả</th>
                  <th style={{ textAlign: 'center' }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '30px' }}>
                      <RefreshCw size={24} className="wms-spin" style={{ margin: '0 auto 8px' }} />
                      <div>Đang tải dữ liệu công nợ nhà cung ứng...</div>
                    </td>
                  </tr>
                ) : filteredSuppliers.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '30px', color: 'var(--wms-text-secondary)' }}>
                      Không tìm thấy nhà cung cấp nào khớp với bộ lọc.
                    </td>
                  </tr>
                ) : (
                  filteredSuppliers.map((sup) => {
                    const aging = AGING_BADGE[sup.agingCategory] || AGING_BADGE.IN_TERM;
                    const hasDebt = sup.currentDebt > 0;

                    return (
                      <tr
                        key={sup.supplierId}
                        className="wms-interactive-row"
                        style={{
                          backgroundColor: sup.isOverdue ? '#FFF5F5' : undefined,
                        }}
                      >
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span className="wms-code-pill" style={{ fontWeight: 700 }}>
                              {sup.supplierCode}
                            </span>
                          </div>
                          <div style={{ fontWeight: 600, fontSize: '13px', marginTop: '2px', color: 'var(--wms-text-primary)' }}>
                            {sup.supplierName}
                          </div>
                          {sup.bankInfo?.bankName && (
                            <div className="wms-helper-text" style={{ fontSize: '11px', marginTop: '2px' }}>
                              STK: {sup.bankInfo.accountNo} ({sup.bankInfo.bankName})
                            </div>
                          )}
                        </td>
                        <td>
                          <div>{sup.contactPerson || '—'}</div>
                          <div className="wms-helper-text">{sup.phone || '—'}</div>
                          {sup.taxCode && (
                            <div className="wms-helper-text" style={{ fontSize: '11px' }}>
                              MST: {sup.taxCode}
                            </div>
                          )}
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span className="wms-badge-batch">
                              {sup.contractsCount} Hợp đồng
                            </span>
                          </div>
                          <div className="wms-helper-text" style={{ fontSize: '11px', marginTop: '2px' }}>
                            Tín dụng: {sup.creditDays} ngày
                          </div>
                        </td>
                        <td className="wms-td-number">
                          <div style={{ fontWeight: 600 }}>{formatVnd(sup.totalContractedAmount)}</div>
                        </td>
                        <td className="wms-td-number">
                          <div style={{ color: '#16A34A', fontWeight: 600 }}>
                            {formatVnd(sup.totalPaidAmount)}
                          </div>
                          <div className="wms-helper-text" style={{ fontSize: '11px' }}>
                            {sup.vouchersCount} phiếu chi
                          </div>
                        </td>
                        <td className="wms-td-number">
                          <div
                            style={{
                              fontWeight: 700,
                              fontSize: '13.5px',
                              color: hasDebt ? (sup.isOverdue ? '#DC2626' : '#D97706') : '#16A34A',
                            }}
                          >
                            {formatVnd(sup.currentDebt)}
                          </div>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span className={`wms-status-badge ${aging.cls}`}>
                            {aging.label}
                          </span>
                          {hasDebt && sup.earliestDueDate && (
                            <div className="wms-helper-text" style={{ fontSize: '11px', marginTop: '3px' }}>
                              {sup.isOverdue ? (
                                <span style={{ color: '#DC2626', fontWeight: 600 }}>
                                  Quá hạn {sup.daysDiff} ngày
                                </span>
                              ) : sup.isDueSoon ? (
                                <span style={{ color: '#D97706', fontWeight: 600 }}>
                                  Còn {Math.abs(sup.daysDiff)} ngày
                                </span>
                              ) : (
                                <span>Hạn: {formatDate(sup.earliestDueDate)}</span>
                              )}
                            </div>
                          )}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <div className="wms-action-cell" style={{ justifyContent: 'center', gap: '4px' }}>
                            {hasDebt && (
                              <button
                                type="button"
                                className="wms-btn wms-btn-primary wms-btn-xs"
                                onClick={() => navigate(`/accountant/payment-vouchers?supplierId=${sup.supplierId}`)}
                                title="Lập phiếu chi trả nợ cho nhà cung cấp này"
                              >
                                <Receipt size={12} />
                                <span>Chi trả</span>
                              </button>
                            )}
                            <button
                              type="button"
                              className="wms-btn wms-btn-default wms-btn-xs"
                              onClick={() => handleOpenLedgerModal(sup)}
                              title="Xem sổ chi tiết biến động công nợ"
                            >
                              <FileText size={12} />
                              <span>Sổ nợ</span>
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
        </section>
      )}

      {/* TAB 2: CÔNG NỢ VẬN CHUYỂN GHN (AR NETTING) */}
      {activeTab === 'CARRIER' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Card Bù trừ 2 chiều Vận chuyển GHN */}
          <section className="wms-table-card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <Truck size={22} color="var(--wms-accent)" />
                  <h2 style={{ fontSize: '17px', fontWeight: 700, margin: 0 }}>
                    Đối tác Vận chuyển: {carrierDebtData.carrier?.carrierName} ({carrierDebtData.carrier?.carrierCode})
                  </h2>
                  <span
                    style={{
                      fontSize: '12px',
                      fontWeight: 700,
                      color: '#0284C7',
                      backgroundColor: '#F0F9FF',
                      border: '1px solid #BAE6FD',
                      padding: '2px 8px',
                      borderRadius: '12px',
                    }}
                  >
                    Cước thỏa thuận: {formatVnd(carrierDebtData.carrier?.baseShippingFee || 19000)}/đơn
                  </span>
                </div>
                <p className="wms-helper-text" style={{ marginTop: '4px' }}>
                  Cơ chế đối soát bù trừ hai chiều (Netting): Tiền thu hộ COD GHN giữ sẽ được khấu trừ cước vận chuyển trước khi thanh toán về tài khoản công ty.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="wms-btn wms-btn-default"
                  onClick={() => {
                    setConfiguredShippingFee(carrierDebtData.carrier?.baseShippingFee || 19000);
                    setShowCarrierConfigModal(true);
                  }}
                  title="Cài đặt mức cước vận chuyển thỏa thuận giữa Shop và GHN"
                >
                  <Settings size={14} /> Cấu hình cước phí
                </button>
                <button
                  type="button"
                  className="wms-btn wms-btn-default"
                  onClick={() => setShowSettlementHistoryModal(true)}
                  title="Xem danh sách lịch sử các đợt GHN thanh toán COD và các phiếu chi cước phí đã tất toán"
                  style={{ fontWeight: 600 }}
                >
                  <History size={14} /> Lịch sử thanh toán & đối soát ({carrierDebtData.settlementHistory?.length || 0})
                </button>
                <button
                  type="button"
                  className="wms-btn wms-btn-primary"
                  style={{
                    backgroundColor: '#15803D',
                    borderColor: '#166534',
                    color: '#FFFFFF',
                    fontWeight: 600,
                  }}
                  onClick={handleOpenSettleCodModal}
                  title="Xác nhận GHN đã chuyển tiền thanh toán COD về tài khoản và tất toán công nợ"
                >
                  <CreditCard size={14} />
                  <span>
                    Xác nhận nhận tiền COD
                    {(carrierDebtData.metrics?.carrierDebtToShop || 0) > 0
                      ? ` (${formatVnd(carrierDebtData.metrics?.carrierDebtToShop)})`
                      : ''}
                  </span>
                </button>
                <button
                  type="button"
                  className="wms-btn wms-btn-default"
                  onClick={() => navigate('/accountant/cod-reconciliation')}
                >
                  <ArrowLeftRight size={14} /> Đối soát tự động API GHN
                </button>
                {(carrierDebtData.metrics?.shopDebtToCarrier || 0) > 0 && (
                  <button
                    type="button"
                    className="wms-btn wms-btn-primary"
                    style={{
                      backgroundColor: '#DC2626',
                      borderColor: '#B91C1C',
                      color: '#FFFFFF',
                      fontWeight: 600,
                    }}
                    onClick={handleOpenSettleShippingModal}
                    title="Xác nhận Shop đã chuyển khoản thanh toán cước phí vận chuyển cho GHN và ghi nhận Phiếu Chi"
                  >
                    <CreditCard size={14} /> Xác nhận thanh toán cước GHN
                  </button>
                )}
              </div>
            </div>

            {/* Khung Bù trừ 2 chiều (Netting Formula Visualization) */}
            <div
              style={{
                marginTop: '18px',
                padding: '16px',
                borderRadius: '8px',
                backgroundColor: 'var(--wms-bg-subtle)',
                border: '1px solid var(--wms-border)',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '14px',
                alignItems: 'center',
              }}
            >
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: '6px',
                  background: '#F0F9FF',
                  border: '1px solid #BAE6FD',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div className="wms-detail-label" style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#0369A1' }}>
                    <ArrowDownRight size={14} color="#0284C7" />
                    <span>1. COD GHN Thu hộ (Phải thu)</span>
                  </div>
                  <button
                    type="button"
                    style={{
                      background: '#FFFFFF',
                      border: '1px solid #7DD3FC',
                      color: '#0284C7',
                      fontSize: '11px',
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: '10px',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                    onClick={() => setShowDeliveredOrdersModal(true)}
                    title="Xem chi tiết danh sách các đơn hàng tiền mặt cấu thành khoản 1.990.000 ₫ này"
                  >
                    <Eye size={11} /> Chi tiết {carrierDebtData.deliveredOrders?.length || carrierDebtData.metrics?.deliveredCodOrdersCount || 4} đơn tiền mặt
                  </button>
                </div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#0284C7', marginTop: '4px' }}>
                  {formatVnd(carrierDebtData.metrics?.totalCodCollected)}
                </div>
                <div
                  className="wms-helper-text"
                  style={{
                    fontSize: '11px',
                    color: '#0369A1',
                    marginTop: '2px',
                    cursor: 'pointer',
                  }}
                  onClick={() => setShowDeliveredOrdersModal(true)}
                >
                  Tổng hợp từ <strong>{carrierDebtData.deliveredOrders?.length || carrierDebtData.metrics?.deliveredCodOrdersCount || 4} đơn</strong> tiền mặt giao thành công (Nhấn xem)
                </div>
              </div>

              <div>
                <div className="wms-detail-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <ArrowUpRight size={14} color="#DC2626" />
                  <span>2. Cước vận chuyển (Phải trả)</span>
                </div>
                <div style={{ fontSize: '16px', fontWeight: 700, color: '#DC2626', marginTop: '4px' }}>
                  - {formatVnd(carrierDebtData.metrics?.totalShippingFee)}
                </div>
                <div className="wms-helper-text" style={{ fontSize: '11px' }}>
                  Tính trên tất cả {carrierDebtData.metrics?.totalOrdersCount || 0} đơn giao
                </div>
              </div>

              {(() => {
                const shopDebt = carrierDebtData.metrics?.shopDebtToCarrier || 0;
                const carrierDebt = carrierDebtData.metrics?.carrierDebtToShop || 0;

                if (shopDebt > 0) {
                  return (
                    <div
                      style={{
                        padding: '10px 14px',
                        borderRadius: '6px',
                        backgroundColor: '#FEF2F2',
                        border: '1px solid #FCA5A5',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div className="wms-detail-label" style={{ color: '#991B1B', fontWeight: 700 }}>
                          3. Shop nợ cước GHN (Net phải trả)
                        </div>
                        <button
                          type="button"
                          className="wms-btn wms-btn-sm"
                          style={{
                            backgroundColor: '#DC2626',
                            borderColor: '#B91C1C',
                            color: '#FFFFFF',
                            fontWeight: 700,
                            padding: '2px 8px',
                            fontSize: '11px',
                          }}
                          onClick={handleOpenSettleShippingModal}
                          title="Xác nhận Shop thanh toán cước phí còn nợ cho GHN"
                        >
                          <CreditCard size={11} /> Trả cước GHN
                        </button>
                      </div>
                      <div style={{ fontSize: '18px', fontWeight: 800, color: '#DC2626', marginTop: '2px' }}>
                        - {formatVnd(shopDebt)}
                      </div>
                      <div className="wms-helper-text" style={{ fontSize: '11px', color: '#B91C1C' }}>
                        Shop nợ cước vận chuyển (chưa có COD bù trừ)
                      </div>
                    </div>
                  );
                }

                if (carrierDebt > 0) {
                  return (
                    <div
                      style={{
                        padding: '10px 14px',
                        borderRadius: '6px',
                        backgroundColor: '#DCFCE7',
                        border: '1px solid #86EFAC',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div className="wms-detail-label" style={{ color: '#166534', fontWeight: 700 }}>
                          3. Thực nhận sau bù trừ cước (Net)
                        </div>
                        <button
                          type="button"
                          className="wms-btn wms-btn-sm"
                          style={{
                            backgroundColor: '#15803D',
                            borderColor: '#166534',
                            color: '#FFFFFF',
                            fontWeight: 700,
                            padding: '2px 8px',
                            fontSize: '11px',
                          }}
                          onClick={handleOpenSettleCodModal}
                          title="Xác nhận nhận tiền COD"
                        >
                          <CreditCard size={11} /> Nhận tiền COD
                        </button>
                      </div>
                      <div style={{ fontSize: '18px', fontWeight: 800, color: '#15803D', marginTop: '2px' }}>
                        + {formatVnd(carrierDebt)}
                      </div>
                      <div className="wms-helper-text" style={{ fontSize: '11px', color: '#166534' }}>
                        Số tiền GHN chuyển khoản về Shop
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    style={{
                      padding: '10px 14px',
                      borderRadius: '6px',
                      backgroundColor: '#F1F5F9',
                      border: '1px solid #CBD5E1',
                    }}
                  >
                    <div className="wms-detail-label" style={{ color: '#475569', fontWeight: 700 }}>
                      3. Thực nhận sau bù trừ cước (Net)
                    </div>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: '#475569', marginTop: '2px' }}>
                      0 ₫
                    </div>
                    <div className="wms-helper-text" style={{ fontSize: '11px', color: '#64748B' }}>
                      Đã tất toán toàn bộ công nợ kỳ này
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Chi tiết đơn bưu kiện */}
            <div style={{ marginTop: '18px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
              <div style={{ padding: '10px', background: '#FFFFFF', border: '1px solid var(--wms-border)', borderRadius: '6px' }}>
                <div className="wms-detail-label">Tổng đơn giao qua GHN</div>
                <div style={{ fontSize: '15px', fontWeight: 700, marginTop: '2px' }}>
                  {carrierDebtData.metrics?.totalOrdersCount || 0} đơn
                </div>
              </div>
              <div style={{ padding: '10px', background: '#FFFFFF', border: '1px solid var(--wms-border)', borderRadius: '6px' }}>
                <div className="wms-detail-label">Đơn giao thành công</div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: '#16A34A', marginTop: '2px' }}>
                  {carrierDebtData.metrics?.deliveredOrdersCount || 0} đơn
                </div>
              </div>
              <div style={{ padding: '10px', background: '#FFFFFF', border: '1px solid var(--wms-border)', borderRadius: '6px' }}>
                <div className="wms-detail-label">Đơn hoàn / Boom hàng</div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: '#DC2626', marginTop: '2px' }}>
                  {carrierDebtData.metrics?.returnedOrdersCount || 0} đơn
                </div>
              </div>
              <div style={{ padding: '10px', background: '#FFFFFF', border: '1px solid var(--wms-border)', borderRadius: '6px' }}>
                <div className="wms-detail-label">Đơn cờ đỏ lệch tiền</div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: '#D97706', marginTop: '2px' }}>
                  {carrierDebtData.metrics?.redFlagDiscrepancyCount || 0} đơn
                </div>
              </div>
            </div>
          </section>

          {/* Bảng kê các đợt đối soát gần đây */}
          <section className="wms-table-card">
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--wms-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 700, margin: 0 }}>
                Lịch sử các đợt Bảng kê Đối soát COD (7 đợt gần nhất)
              </h3>
              <button
                type="button"
                className="wms-btn wms-btn-default wms-btn-sm"
                onClick={() => navigate('/accountant/cod-reconciliation')}
              >
                Xem chi tiết đối soát <ExternalLink size={13} />
              </button>
            </div>

            <div className="wms-table-scroll no-horizontal-scroll">
              <table className="wms-table wms-table-responsive-fit" style={{ fontSize: '12.5px' }}>
                <colgroup>
                  <col style={{ width: '18%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '11%' }} />
                  <col style={{ width: '16%' }} />
                  <col style={{ width: '16%' }} />
                  <col style={{ width: '15%' }} />
                  <col style={{ width: '12%' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>Mã Bảng Kê</th>
                    <th>Thời gian</th>
                    <th style={{ textAlign: 'center' }}>Số Vận Đơn</th>
                    <th className="wms-td-number" title="Tổng tiền COD theo dữ liệu đơn hàng ARAWMS ghi nhận phải thu từ khách">
                      COD Dự Kiến (Sổ sách)
                    </th>
                    <th className="wms-td-number" title="Tổng tiền COD mà hãng GHN xác nhận đã thu được thực tế">
                      COD Thực Thu (GHN Báo)
                    </th>
                    <th className="wms-td-number" title="Số tiền chênh lệch giữa Sổ sách và Hãng vận chuyển báo về">
                      Chênh Lệch (Sai Lệch)
                    </th>
                    <th style={{ textAlign: 'center' }}>Trạng Thái</th>
                  </tr>
                </thead>
                <tbody>
                  {carrierDebtData.recentBatches?.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: '24px', color: 'var(--wms-text-secondary)' }}>
                        Chưa có đợt đối soát COD nào được đồng bộ. Nhấn "Đối soát tự động API GHN" để bắt đầu.
                      </td>
                    </tr>
                  ) : (
                    [...(carrierDebtData.recentBatches || [])]
                      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
                      .slice(0, 7)
                      .map((b) => {
                      const isDiscrepant = Number(b.totalDiscrepancyAmount || 0) > 0;
                      return (
                        <tr key={b.batchId}>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span className="wms-code-pill" style={{ fontWeight: 700 }}>
                                {b.batchCode}
                              </span>
                            </div>
                          </td>
                          <td>{formatDate(b.createdAt)}</td>
                          <td style={{ textAlign: 'center' }}>
                            <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                              {b.totalWaybillsCount >= 2 ? (
                                <button
                                  type="button"
                                  className="wms-badge-batch"
                                  style={{
                                    cursor: 'pointer',
                                    border: '1px solid #CBD5E1',
                                    background: '#F1F5F9',
                                    color: '#0F172A',
                                    fontWeight: 700,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '5px',
                                    padding: '3px 8px',
                                    borderRadius: '12px',
                                    transition: 'all 0.15s ease-in-out',
                                  }}
                                  onClick={() => setSelectedBatchForOrders(b)}
                                  title="Nhấn để xem danh sách các đơn hàng trong đợt này"
                                >
                                  <Package size={12} color="#0284C7" />
                                  <span>{b.totalWaybillsCount} vận đơn</span>
                                </button>
                              ) : (
                                <span className="wms-badge-batch">
                                  {b.totalWaybillsCount} vận đơn
                                </span>
                              )}
                              {b.redFlagCount > 0 && (
                                <span style={{ fontSize: '11px', color: '#DC2626', fontWeight: 600 }}>
                                  ({b.redFlagCount} cờ đỏ lệch)
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="wms-td-number">
                            <span style={{ fontWeight: 600, color: 'var(--wms-text-primary)' }}>
                              {formatVnd(b.totalExpectedCodAmount)}
                            </span>
                          </td>
                          <td className="wms-td-number">
                            <span
                              style={{
                                fontWeight: 700,
                                color: (b.totalCarrierReportedCodAmount > 0) ? '#16A34A' : '#64748B',
                              }}
                            >
                              {formatVnd(b.totalCarrierReportedCodAmount || 0)}
                            </span>
                          </td>
                          <td className="wms-td-number">
                            {isDiscrepant ? (
                              <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                                <AlertTriangle size={13} color="#DC2626" />
                                <span style={{ color: '#DC2626', fontWeight: 700 }}>
                                  {formatVnd(b.totalDiscrepancyAmount)}
                                </span>
                              </div>
                            ) : (
                              <span style={{ color: '#16A34A', fontWeight: 600 }}>
                                0 ₫ (Khớp 100%)
                              </span>
                            )}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span className={`wms-status-badge ${b.status === 'COMPLETED' ? 'wms-status-available' : 'wms-status-pending'}`}>
                              {b.status === 'COMPLETED' ? 'Đã hoàn tất' : 'Đang đối soát'}
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

          {/* KHUNG ĐIỀU HƯỚNG LỊCH SỬ THANH TOÁN & ĐỐI SOÁT CÔNG NỢ GHN */}
          <section
            className="wms-table-card"
            style={{
              padding: '16px 20px',
              backgroundColor: '#FFFFFF',
              border: '1px solid var(--wms-border)',
              borderRadius: '8px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '14px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Receipt size={18} color="var(--wms-accent)" />
                <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0, color: '#1e293b' }}>
                  Lịch Sử Thanh Toán & Đối Soát Công Nợ GHN
                </h3>
              </div>
              <p className="wms-helper-text" style={{ margin: '3px 0 0 0', fontSize: '12.5px' }}>
                Danh sách các đợt đối tác GHN thanh toán COD và các phiếu chi cước phí Shop đã hoàn tất ({carrierDebtData.settlementHistory?.length || 0} chứng từ).
              </p>
            </div>

            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="wms-btn wms-btn-default"
                onClick={() => setShowSettlementHistoryModal(true)}
                title="Nhấn để xem chi tiết danh sách tất cả các đợt thanh toán và chứng từ đối soát"
                style={{ fontWeight: 600, padding: '7px 14px' }}
              >
                <History size={15} />
                <span>Xem lịch sử thanh toán & đối soát ({carrierDebtData.settlementHistory?.length || 0})</span>
              </button>

              {(carrierDebtData.metrics?.shopDebtToCarrier || 0) > 0 && (
                <button
                  type="button"
                  className="wms-btn wms-btn-primary"
                  style={{ backgroundColor: '#DC2626', color: '#FFFFFF', borderColor: '#B91C1C', fontWeight: 700, padding: '7px 14px' }}
                  onClick={handleOpenSettleShippingModal}
                  title="Xác nhận Shop thanh toán cước phí còn nợ cho GHN"
                >
                  <CreditCard size={15} />
                  <span>Xác nhận thanh toán cước ({formatVnd(carrierDebtData.metrics?.shopDebtToCarrier)})</span>
                </button>
              )}

              <button
                type="button"
                className="wms-btn wms-btn-primary"
                style={{ backgroundColor: '#15803D', color: '#FFFFFF', borderColor: '#166534', fontWeight: 700, padding: '7px 14px' }}
                onClick={handleOpenSettleCodModal}
                title="Xác nhận GHN đã chuyển tiền thanh toán COD về tài khoản và tất toán công nợ hiện tại về 0 ₫"
              >
                <CreditCard size={15} />
                <span>
                  Xác nhận nhận tiền COD
                  {(carrierDebtData.metrics?.carrierDebtToShop || 0) > 0
                    ? ` (${formatVnd(carrierDebtData.metrics?.carrierDebtToShop)})`
                    : ''}
                </span>
              </button>
            </div>
          </section>
        </div>
      )}

      {/* MODAL: SỔ CHI TIẾT CÔNG NỢ NHÀ CUNG CẤP (STATEMENT OF ACCOUNT) */}
      {selectedSupplierForLedger && (
        <div className="wms-modal-backdrop" role="dialog" aria-modal="true">
          <div className="wms-modal-dialog wide" style={{ maxWidth: '950px' }}>
            <div className="wms-modal-header no-print">
              <div>
                <h2 className="wms-modal-title">
                  Sổ Chi Tiết Công Nợ: {selectedSupplierForLedger.supplierName}
                </h2>
                <div className="wms-helper-text" style={{ fontSize: '12px' }}>
                  Bản kê dòng thời gian đối soát công nợ tăng (Hợp đồng/Nhập kho) và nợ giảm (Phiếu chi tiền)
                </div>
              </div>
              <button
                type="button"
                className="wms-btn wms-btn-default wms-btn-sm"
                onClick={() => setSelectedSupplierForLedger(null)}
              >
                <X size={16} /> Đóng
              </button>
            </div>

            <div className="wms-modal-body">
              {ledgerLoading ? (
                <div style={{ textAlign: 'center', padding: '40px' }}>
                  <RefreshCw size={24} className="wms-spin" style={{ margin: '0 auto 8px' }} />
                  <div>Đang tính toán số dư công nợ lũy kế...</div>
                </div>
              ) : ledgerData ? (
                <div>
                  {/* Tóm tắt số dư sổ nợ */}
                  <div
                    style={{
                      padding: '14px 18px',
                      background: 'var(--wms-bg-subtle)',
                      borderRadius: '8px',
                      border: '1px solid var(--wms-border)',
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                      gap: '12px',
                      marginBottom: '16px',
                    }}
                  >
                    <div>
                      <div className="wms-detail-label">Tổng Cam Kết Mua Hàng</div>
                      <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--wms-text-primary)' }}>
                        {formatVnd(ledgerData.summary?.totalContractedAmount)}
                      </div>
                    </div>

                    <div>
                      <div className="wms-detail-label">Tổng Tiền Đã Thanh Toán</div>
                      <div style={{ fontSize: '16px', fontWeight: 700, color: '#16A34A' }}>
                        {formatVnd(ledgerData.summary?.totalPaidAmount)}
                      </div>
                    </div>

                    <div>
                      <div className="wms-detail-label">Số Dư Nợ Cuối Kỳ</div>
                      <div style={{ fontSize: '18px', fontWeight: 800, color: ledgerData.summary?.closingBalance > 0 ? '#DC2626' : '#16A34A' }}>
                        {formatVnd(ledgerData.summary?.closingBalance)}
                      </div>
                    </div>
                  </div>

                  {/* Bảng Dòng Thời Gian Lũy Kế */}
                  <div className="wms-table-scroll">
                    <table className="wms-table" style={{ fontSize: '12.5px' }}>
                      <thead>
                        <tr>
                          <th style={{ width: '95px' }}>Ngày</th>
                          <th style={{ width: '130px' }}>Mã Chứng Từ</th>
                          <th style={{ width: '150px' }}>Nghiệp Vụ</th>
                          <th>Diễn Giải Giao Dịch</th>
                          <th className="wms-td-number" style={{ width: '130px' }}>Ghi Tăng (+)</th>
                          <th className="wms-td-number" style={{ width: '130px' }}>Ghi Giảm (-)</th>
                          <th className="wms-td-number" style={{ width: '140px' }}>Số Dư Lũy Kế</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ledgerData.ledgerEntries?.length === 0 ? (
                          <tr>
                            <td colSpan={7} style={{ textAlign: 'center', padding: '24px', color: 'var(--wms-text-secondary)' }}>
                              Chưa phát sinh giao dịch công nợ nào với nhà cung cấp này.
                            </td>
                          </tr>
                        ) : (
                          ledgerData.ledgerEntries?.map((entry) => (
                            <tr key={entry.id}>
                              <td>{formatDate(entry.date)}</td>
                              <td>
                                <span className="wms-code-pill" style={{ fontWeight: 600 }}>
                                  {entry.documentCode}
                                </span>
                              </td>
                              <td>
                                <span
                                  className="wms-badge-batch"
                                  style={{
                                    background: entry.increaseAmount > 0 ? '#FEF3C7' : '#DCFCE7',
                                    color: entry.increaseAmount > 0 ? '#92400E' : '#166534',
                                  }}
                                >
                                  {entry.typeName}
                                </span>
                              </td>
                              <td>
                                <div>{entry.description}</div>
                                {entry.transactionReference && (
                                  <div className="wms-helper-text" style={{ fontSize: '11px' }}>
                                    Số GD: {entry.transactionReference}
                                  </div>
                                )}
                              </td>
                              <td className="wms-td-number">
                                {entry.increaseAmount > 0 ? (
                                  <strong style={{ color: '#D97706' }}>
                                    +{formatVnd(entry.increaseAmount)}
                                  </strong>
                                ) : (
                                  '—'
                                )}
                              </td>
                              <td className="wms-td-number">
                                {entry.decreaseAmount > 0 ? (
                                  <strong style={{ color: '#16A34A' }}>
                                    -{formatVnd(entry.decreaseAmount)}
                                  </strong>
                                ) : (
                                  '—'
                                )}
                              </td>
                              <td className="wms-td-number">
                                <strong style={{ color: entry.runningBalance > 0 ? '#DC2626' : '#16A34A' }}>
                                  {formatVnd(entry.runningBalance)}
                                </strong>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="wms-modal-footer no-print">
              <button
                type="button"
                className="wms-btn wms-btn-default"
                onClick={() => setSelectedSupplierForLedger(null)}
              >
                Đóng
              </button>
              <button
                type="button"
                className="wms-btn wms-btn-primary"
                onClick={() => window.print()}
              >
                <Printer size={15} /> In Sao Kê Công Nợ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL NHỎ: XEM DANH SÁCH ĐƠN HÀNG CỦA ĐỢT ĐỐI SOÁT */}
      {selectedBatchForOrders && (
        <div
          className="wms-modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={() => setSelectedBatchForOrders(null)}
          style={{ zIndex: 1050 }}
        >
          <div
            className="wms-modal-dialog"
            style={{ maxWidth: '480px', width: '90%' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="wms-modal-header" style={{ padding: '14px 18px', borderBottom: '1px solid var(--wms-border)' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Package size={18} color="var(--wms-accent)" />
                  <h3 className="wms-modal-title" style={{ fontSize: '15px', fontWeight: 700, margin: 0 }}>
                    Danh Sách Đơn Hàng Trong Đợt
                  </h3>
                </div>
                <div className="wms-helper-text" style={{ fontSize: '12px', marginTop: '3px' }}>
                  Đợt: <span className="wms-code-pill" style={{ fontWeight: 700 }}>{selectedBatchForOrders.batchCode}</span> • Ngày {formatDate(selectedBatchForOrders.createdAt)}
                </div>
              </div>
              <button
                type="button"
                className="wms-btn wms-btn-default wms-btn-xs"
                onClick={() => setSelectedBatchForOrders(null)}
                style={{ borderRadius: '50%', width: '28px', height: '28px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <X size={15} />
              </button>
            </div>

            <div className="wms-modal-body" style={{ padding: '16px 18px', maxHeight: '380px', overflowY: 'auto' }}>
              <div style={{ marginBottom: '10px', fontSize: '12.5px', color: 'var(--wms-text-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Tổng số: <strong>{selectedBatchForOrders.items?.length || selectedBatchForOrders.totalWaybillsCount} đơn hàng</strong></span>
                {selectedBatchForOrders.redFlagCount > 0 && (
                  <span style={{ color: '#DC2626', fontWeight: 600, fontSize: '11.5px' }}>
                    {selectedBatchForOrders.redFlagCount} đơn cờ đỏ sai lệch
                  </span>
                )}
              </div>

              {(!selectedBatchForOrders.items || selectedBatchForOrders.items.length === 0) ? (
                <div style={{ textAlign: 'center', padding: '24px', color: 'var(--wms-text-secondary)', fontSize: '13px' }}>
                  Không tìm thấy chi tiết danh sách đơn hàng cho đợt đối soát này.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {selectedBatchForOrders.items.map((it, idx) => (
                    <div
                      key={it.orderCode || idx}
                      style={{
                        padding: '10px 12px',
                        borderRadius: '6px',
                        border: it.isRedFlag ? '1px solid #FECACA' : '1px solid var(--wms-border)',
                        backgroundColor: it.isRedFlag ? '#FEF2F2' : 'var(--wms-bg-subtle)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--wms-text-primary)' }}>
                            {it.orderCode}
                          </span>
                        </div>
                        <div className="wms-helper-text" style={{ fontSize: '11.5px', marginTop: '2px' }}>
                          Vận đơn: <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{it.waybillCode || '—'}</span>
                        </div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '12.5px', fontWeight: 700, color: it.isRedFlag ? '#DC2626' : '#16A34A' }}>
                          {it.isRedFlag ? `Lệch: ${formatVnd(it.varianceAmount)}` : `COD: ${formatVnd(it.carrierReportedCod || it.systemExpectedCod)}`}
                        </div>
                        <div style={{ fontSize: '11px', marginTop: '2px' }}>
                          {it.isRedFlag ? (
                            <span style={{ color: '#DC2626', fontWeight: 600 }}>
                              Cờ đỏ ({it.redFlagReason === 'ORDER_NOT_FOUND' ? 'Hàng hoàn/không thu' : 'Lệch tiền'})
                            </span>
                          ) : (
                            <span style={{ color: '#16A34A', fontWeight: 600 }}>Khớp chuẩn</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="wms-modal-footer" style={{ padding: '12px 18px', borderTop: '1px solid var(--wms-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                type="button"
                className="wms-btn wms-btn-default wms-btn-sm"
                onClick={() => {
                  setSelectedBatchForOrders(null);
                  navigate('/accountant/cod-reconciliation');
                }}
              >
                <ExternalLink size={13} /> Xem trang đối soát chi tiết
              </button>
              <button
                type="button"
                className="wms-btn wms-btn-primary wms-btn-sm"
                onClick={() => setSelectedBatchForOrders(null)}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CHI TIẾT CÁC ĐƠN CẤU THÀNH TIỀN COD THU HỘ (1.990.000 ₫) */}
      {showDeliveredOrdersModal && (
        <div
          className="wms-modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={() => setShowDeliveredOrdersModal(false)}
          style={{ zIndex: 1050 }}
        >
          <div
            className="wms-modal-dialog"
            style={{ maxWidth: '640px', width: '95%' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="wms-modal-header" style={{ padding: '16px 20px', borderBottom: '1px solid var(--wms-border)' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ArrowDownRight size={20} color="#0284C7" />
                  <h3 className="wms-modal-title" style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: '#0369A1' }}>
                    Chi Tiết Các Đơn Cấu Thành COD Thu Hộ ({formatVnd(carrierDebtData.metrics?.totalCodCollected)})
                  </h3>
                </div>
                <div className="wms-helper-text" style={{ fontSize: '12px', marginTop: '3px' }}>
                  Danh sách {carrierDebtData.deliveredOrders?.length || 4} đơn tiền mặt giao thành công GHN đã thu hộ từ khách (Đã loại trừ đơn chuyển khoản trước)
                </div>
              </div>
              <button
                type="button"
                className="wms-btn wms-btn-default wms-btn-xs"
                onClick={() => setShowDeliveredOrdersModal(false)}
                style={{ borderRadius: '50%', width: '28px', height: '28px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <X size={15} />
              </button>
            </div>

            <div className="wms-modal-body" style={{ padding: '16px 20px', maxHeight: '420px', overflowY: 'auto' }}>
              {/* Box công thức cộng dồn */}
              <div
                style={{
                  padding: '10px 14px',
                  background: '#F0F9FF',
                  borderRadius: '6px',
                  border: '1px solid #BAE6FD',
                  marginBottom: '14px',
                  fontSize: '12px',
                  color: '#0369A1',
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: '4px' }}>Công thức cộng dồn dòng tiền COD đã thu:</div>
                <div style={{ fontSize: '12px', lineHeight: '1.6' }}>
                  {carrierDebtData.deliveredOrders
                    ?.filter((o) => o.codAmount > 0)
                    ?.map((o) => `${formatVnd(o.codAmount)} (${o.orderCode})`)
                    ?.join(' + ')}
                  {' = '}
                  <strong style={{ color: '#0284C7', fontSize: '13px' }}>
                    {formatVnd(carrierDebtData.metrics?.totalCodCollected)}
                  </strong>
                </div>
              </div>

              {/* Bảng danh sách đơn hàng */}
              <div className="wms-table-scroll" style={{ border: '1px solid var(--wms-border)', borderRadius: '6px' }}>
                <table className="wms-table" style={{ fontSize: '12px', margin: 0 }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC' }}>
                      <th style={{ width: '130px' }}>Mã Đơn Hàng</th>
                      <th style={{ width: '130px' }}>Mã Vận Đơn</th>
                      <th className="wms-td-number" style={{ width: '130px' }}>Tiền COD Thu Hộ</th>
                      <th className="wms-td-number" style={{ width: '110px' }}>Cước Phí GHN</th>
                      <th style={{ width: '110px', textAlign: 'center' }}>Trạng Thái</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(!carrierDebtData.deliveredOrders || carrierDebtData.deliveredOrders.length === 0) ? (
                      <tr>
                        <td colSpan={5} style={{ textAlign: 'center', padding: '20px', color: 'var(--wms-text-secondary)' }}>
                          Chưa có đơn hàng giao thành công nào.
                        </td>
                      </tr>
                    ) : (
                      carrierDebtData.deliveredOrders.map((o) => (
                        <tr key={o.orderId || o.orderCode}>
                          <td>
                            <span style={{ fontWeight: 700, color: 'var(--wms-text-primary)' }}>
                              {o.orderCode}
                            </span>
                          </td>
                          <td>
                            <span style={{ fontFamily: 'monospace', fontSize: '11.5px', color: '#64748B' }}>
                              {o.waybillCode}
                            </span>
                          </td>
                          <td className="wms-td-number">
                            <strong style={{ color: '#0284C7' }}>
                              {formatVnd(o.codAmount)}
                            </strong>
                          </td>
                          <td className="wms-td-number">
                            <span style={{ color: '#64748B' }}>
                              {formatVnd(o.shippingFee)}
                            </span>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span
                              className={`wms-status-badge ${
                                o.codReconciliationStatus === 'RED_FLAG_DISCREPANCY'
                                  ? 'wms-status-damaged'
                                  : 'wms-status-available'
                              }`}
                              style={{ fontSize: '10.5px' }}
                            >
                              {o.codReconciliationStatus === 'RED_FLAG_DISCREPANCY' ? 'Cờ đỏ lệch' : 'Khớp chuẩn'}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {carrierDebtData.deliveredOrders && carrierDebtData.deliveredOrders.length > 0 && (
                    <tfoot>
                      <tr style={{ background: '#F1F5F9', fontWeight: 700 }}>
                        <td colSpan={2}>
                          <strong>TỔNG CỘNG ({carrierDebtData.deliveredOrders.length} ĐƠN TIỀN MẶT)</strong>
                        </td>
                        <td className="wms-td-number" style={{ color: '#0284C7', fontSize: '13px' }}>
                          <strong>{formatVnd(carrierDebtData.metrics?.totalCodCollected)}</strong>
                        </td>
                        <td className="wms-td-number" style={{ color: '#DC2626', fontSize: '12.5px' }}>
                          <strong>
                            {formatVnd(
                              carrierDebtData.deliveredOrders.reduce((sum, o) => sum + (o.shippingFee || 0), 0)
                            )}
                          </strong>
                        </td>
                        <td style={{ textAlign: 'center', fontSize: '11px', color: '#16A34A' }}>
                          Hoàn tất giao
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>

            <div className="wms-modal-footer" style={{ padding: '12px 20px', borderTop: '1px solid var(--wms-border)', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="wms-btn wms-btn-primary wms-btn-sm"
                onClick={() => setShowDeliveredOrdersModal(false)}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CẤU HÌNH CƯỚC PHÍ ĐỐI TÁC VẬN CHUYỂN GHN */}
      {showCarrierConfigModal && (
        <div
          className="wms-modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={() => setShowCarrierConfigModal(false)}
          style={{ zIndex: 1050 }}
        >
          <div
            className="wms-modal-dialog"
            style={{ maxWidth: '500px', width: '92%' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="wms-modal-header" style={{ padding: '16px 20px', borderBottom: '1px solid var(--wms-border)' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Settings size={18} color="var(--wms-accent)" />
                  <h3 className="wms-modal-title" style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>
                    Cấu Hình Cước Phí Đối Tác GHN
                  </h3>
                </div>
                <div className="wms-helper-text" style={{ fontSize: '12px', marginTop: '3px' }}>
                  Đối tác: <strong>{carrierDebtData.carrier?.carrierName} (GHN)</strong>
                </div>
              </div>
              <button
                type="button"
                className="wms-btn wms-btn-default wms-btn-xs"
                onClick={() => setShowCarrierConfigModal(false)}
                style={{ borderRadius: '50%', width: '28px', height: '28px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <X size={15} />
              </button>
            </div>

            <form onSubmit={handleSaveCarrierConfig}>
              <div className="wms-modal-body" style={{ padding: '18px 20px' }}>
                <div
                  style={{
                    backgroundColor: '#F0F9FF',
                    border: '1px solid #BAE6FD',
                    padding: '12px 14px',
                    borderRadius: '6px',
                    marginBottom: '16px',
                    fontSize: '12.5px',
                    color: '#0369A1',
                    lineHeight: '1.5',
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: '4px' }}>📌 Quy tắc Nghiệp vụ (Business Rule):</div>
                  Cước phí vận chuyển cơ sở (Flat rate) áp dụng theo hợp đồng cam kết B2B giữa Shop và Giao Hàng Nhanh. Số tiền này sẽ được trừ trực tiếp vào tiền COD thu hộ trong chu kỳ đối soát bù trừ (Netting).
                </div>

                <div className="wms-field" style={{ marginBottom: '16px' }}>
                  <label htmlFor="carrier-base-shipping-fee" className="wms-label" style={{ fontWeight: 700 }}>
                    Giá Cước Phí Thỏa Thuận (₫ / Đơn) <span className="wms-required">*</span>
                  </label>
                  <input
                    id="carrier-base-shipping-fee"
                    type="number"
                    min="0"
                    step="500"
                    className="wms-input"
                    value={configuredShippingFee}
                    onChange={(e) => setConfiguredShippingFee(e.target.value)}
                    required
                    placeholder="Ví dụ: 19000"
                    style={{ fontSize: '15px', fontWeight: 700, color: 'var(--wms-text-primary)' }}
                  />
                  <div className="wms-helper-text" style={{ marginTop: '4px' }}>
                    Quy đổi: <strong>{formatVnd(configuredShippingFee)}</strong> / đơn giao hàng.
                  </div>
                </div>

                <div className="wms-field" style={{ marginBottom: '8px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                    <input
                      type="checkbox"
                      checked={applyToExistingOrders}
                      onChange={(e) => setApplyToExistingOrders(e.target.checked)}
                    />
                    <span>
                      Đồng thời cập nhật mức cước <strong>{formatVnd(configuredShippingFee)}</strong> cho toàn bộ các đơn hàng hiện có để đối soát đồng bộ
                    </span>
                  </label>
                </div>
              </div>

              <div className="wms-modal-footer" style={{ padding: '12px 20px', borderTop: '1px solid var(--wms-border)', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  className="wms-btn wms-btn-default wms-btn-sm"
                  onClick={() => setShowCarrierConfigModal(false)}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="wms-btn wms-btn-primary wms-btn-sm"
                  disabled={savingCarrierConfig}
                >
                  <Check size={14} />
                  <span>{savingCarrierConfig ? 'Đang lưu...' : 'Lưu Cấu Hình'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL XÁC NHẬN ĐÃ NHẬN TIỀN COD TỪ GHN (TẤT TOÁN CÔNG NỢ) */}
      {showSettleCodModal && (
        <div
          className="wms-modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={() => setShowSettleCodModal(false)}
          style={{ zIndex: 1050 }}
        >
          <div
            className="wms-modal-dialog"
            style={{ maxWidth: '540px', width: '92%' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="wms-modal-header" style={{ padding: '16px 20px', borderBottom: '1px solid var(--wms-border)' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Receipt size={20} color="#15803D" />
                  <h3 className="wms-modal-title" style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: '#166534' }}>
                    Xác Nhận Đã Nhận Tiền COD Từ GHN
                  </h3>
                </div>
                <div className="wms-helper-text" style={{ fontSize: '12px', marginTop: '3px' }}>
                  Ghi nhận tiền bưu cục GHN chuyển khoản thanh toán và tất toán công nợ hiện tại về 0 ₫
                </div>
              </div>
              <button
                type="button"
                className="wms-btn wms-btn-default wms-btn-xs"
                onClick={() => setShowSettleCodModal(false)}
                style={{ borderRadius: '50%', width: '28px', height: '28px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <X size={15} />
              </button>
            </div>

            <form onSubmit={handleSubmitSettleCod}>
              <div className="wms-modal-body" style={{ padding: '18px 20px' }}>
                {/* Tóm tắt số tiền */}
                <div
                  style={{
                    backgroundColor: '#F0FDF4',
                    border: '1px solid #BBF7D0',
                    padding: '12px 14px',
                    borderRadius: '8px',
                    marginBottom: '16px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <span style={{ fontSize: '12px', color: '#166534', fontWeight: 600 }}>Số tiền GHN thanh toán (Sau bù trừ cước):</span>
                    <div style={{ fontSize: '20px', fontWeight: 800, color: '#15803D', marginTop: '2px' }}>
                      {formatVnd(settleAmount)}
                    </div>
                  </div>
                  <span
                    style={{
                      backgroundColor: '#DCFCE7',
                      color: '#166534',
                      padding: '4px 10px',
                      borderRadius: '12px',
                      fontSize: '11.5px',
                      fontWeight: 700,
                      border: '1px solid #86EFAC',
                    }}
                  >
                    Tất toán {carrierDebtData.deliveredOrders?.filter(o => !o.isCodSettled)?.length || 0} đơn
                  </span>
                </div>

                <div className="wms-field" style={{ marginBottom: '14px' }}>
                  <label htmlFor="settle-amount" className="wms-label" style={{ fontWeight: 700 }}>
                    Số Tiền Thực Nhận (₫) <span className="wms-required">*</span>
                  </label>
                  <input
                    id="settle-amount"
                    type="number"
                    min="1"
                    className="wms-input"
                    value={settleAmount}
                    onChange={(e) => setSettleAmount(e.target.value)}
                    required
                    style={{ fontSize: '15px', fontWeight: 700, color: '#15803D' }}
                  />
                </div>

                <div className="wms-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                  <div className="wms-field">
                    <label htmlFor="settle-payment-method" className="wms-label">
                      Hình Thức Nhận Tiền <span className="wms-required">*</span>
                    </label>
                    <select
                      id="settle-payment-method"
                      className="wms-select"
                      value={settlePaymentMethod}
                      onChange={(e) => setSettlePaymentMethod(e.target.value)}
                    >
                      <option value="BANK_TRANSFER">Chuyển khoản Ngân hàng</option>
                      <option value="CASH">Tiền mặt</option>
                    </select>
                  </div>

                  <div className="wms-field">
                    <label htmlFor="settle-date" className="wms-label">
                      Ngày Tiền Về Tài Khoản <span className="wms-required">*</span>
                    </label>
                    <input
                      id="settle-date"
                      type="date"
                      className="wms-input"
                      value={settleDate}
                      onChange={(e) => setSettleDate(e.target.value)}
                      required
                    />
                  </div>
                </div>

                {settlePaymentMethod === 'BANK_TRANSFER' && (
                  <div className="wms-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                    <div className="wms-field">
                      <label htmlFor="settle-bank-name" className="wms-label">
                        Ngân Hàng Nhận Tiền
                      </label>
                      <input
                        id="settle-bank-name"
                        type="text"
                        className="wms-input"
                        value={settleBankName}
                        onChange={(e) => setSettleBankName(e.target.value)}
                        placeholder="VD: MB Bank, Vietcombank..."
                      />
                    </div>

                    <div className="wms-field">
                      <label htmlFor="settle-account-no" className="wms-label">
                        Số Tài Khoản Nhận
                      </label>
                      <input
                        id="settle-account-no"
                        type="text"
                        className="wms-input"
                        value={settleAccountNo}
                        onChange={(e) => setSettleAccountNo(e.target.value)}
                        placeholder="Số TK ngân hàng"
                      />
                    </div>
                  </div>
                )}

                <div className="wms-field" style={{ marginBottom: '14px' }}>
                  <label htmlFor="settle-tx-ref" className="wms-label" style={{ fontWeight: 700 }}>
                    Mã Giao Dịch / Mã Tham Chiếu Ngân Hàng <span className="wms-required">*</span>
                  </label>
                  <input
                    id="settle-tx-ref"
                    type="text"
                    className="wms-input"
                    value={settleTransactionReference}
                    onChange={(e) => setSettleTransactionReference(e.target.value)}
                    required
                    placeholder="VD: FT261106992384, UNC-GHN-01..."
                  />
                  <div className="wms-helper-text" style={{ marginTop: '3px' }}>
                    Mã giao dịch đối chiếu trên sao kê ngân hàng để phục vụ kiểm toán tài chính.
                  </div>
                </div>

                <div className="wms-field">
                  <label htmlFor="settle-notes" className="wms-label">
                    Diễn Giải / Ghi Chú Chứng Từ
                  </label>
                  <textarea
                    id="settle-notes"
                    rows="2"
                    className="wms-textarea"
                    value={settleNotes}
                    onChange={(e) => setSettleNotes(e.target.value)}
                    placeholder="Nhập ghi chú thêm nếu có..."
                  />
                </div>
              </div>

              <div className="wms-modal-footer" style={{ padding: '12px 20px', borderTop: '1px solid var(--wms-border)', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  className="wms-btn wms-btn-default wms-btn-sm"
                  onClick={() => setShowSettleCodModal(false)}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="wms-btn wms-btn-primary wms-btn-sm"
                  style={{ backgroundColor: '#15803D', borderColor: '#166534' }}
                  disabled={submittingSettle}
                >
                  <Check size={14} />
                  <span>{submittingSettle ? 'Đang xử lý...' : 'Xác Nhận & Tất Toán Công Nợ'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL XÁC NHẬN THANH TOÁN CƯỚC PHÍ VẬN CHUYỂN CHO GHN (TẤT TOÁN NỢ CƯỚC) */}
      {showSettleShippingModal && (
        <div
          className="wms-modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={() => setShowSettleShippingModal(false)}
          style={{ zIndex: 1050 }}
        >
          <div
            className="wms-modal-dialog"
            style={{ maxWidth: '580px', width: '95%' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="wms-modal-header" style={{ padding: '16px 20px', borderBottom: '1px solid var(--wms-border)' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CreditCard size={20} color="#DC2626" />
                  <h3 className="wms-modal-title" style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: '#991B1B' }}>
                    Xác Nhận Thanh Toán Cước Phí Cho GHN
                  </h3>
                </div>
                <div className="wms-helper-text" style={{ fontSize: '12px', marginTop: '3px' }}>
                  Ghi nhận chuyển khoản thanh toán cước vận chuyển nợ GHN và lập Phiếu Chi tương ứng
                </div>
              </div>
              <button
                type="button"
                className="wms-btn wms-btn-default wms-btn-xs"
                onClick={() => setShowSettleShippingModal(false)}
                style={{ borderRadius: '50%', width: '28px', height: '28px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <X size={15} />
              </button>
            </div>

            <form onSubmit={handleSubmitSettleShipping}>
              <div className="wms-modal-body" style={{ padding: '18px 20px' }}>
                {/* Tóm tắt số tiền nợ cước */}
                <div
                  style={{
                    backgroundColor: '#FEF2F2',
                    border: '1px solid #FCA5A5',
                    padding: '12px 14px',
                    borderRadius: '8px',
                    marginBottom: '16px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <span style={{ fontSize: '12px', color: '#991B1B', fontWeight: 600 }}>Cước phí Shop nợ GHN cần thanh toán:</span>
                    <div style={{ fontSize: '20px', fontWeight: 800, color: '#DC2626', marginTop: '2px' }}>
                      - {formatVnd(settleShippingAmount)}
                    </div>
                  </div>
                  <span
                    style={{
                      backgroundColor: '#FEE2E2',
                      color: '#991B1B',
                      padding: '4px 10px',
                      borderRadius: '12px',
                      fontSize: '11.5px',
                      fontWeight: 700,
                    }}
                  >
                    Công nợ cước phí
                  </span>
                </div>

                <div className="wms-form-grid-2">
                  <div className="wms-field">
                    <label htmlFor="settle-shipping-amount" className="wms-label required">
                      Số Tiền Thanh Toán (₫)
                    </label>
                    <input
                      id="settle-shipping-amount"
                      type="number"
                      className="wms-input"
                      value={settleShippingAmount}
                      onChange={(e) => setSettleShippingAmount(e.target.value)}
                      min="1"
                      required
                    />
                  </div>

                  <div className="wms-field">
                    <label htmlFor="settle-shipping-date" className="wms-label required">
                      Ngày Chi Tiền
                    </label>
                    <input
                      id="settle-shipping-date"
                      type="date"
                      className="wms-input"
                      value={settleShippingDate}
                      onChange={(e) => setSettleShippingDate(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="wms-field" style={{ marginTop: '12px' }}>
                  <label htmlFor="settle-shipping-method" className="wms-label required">
                    Hình Thức Thanh Toán
                  </label>
                  <select
                    id="settle-shipping-method"
                    className="wms-select"
                    value={settleShippingPaymentMethod}
                    onChange={(e) => setSettleShippingPaymentMethod(e.target.value)}
                  >
                    <option value="BANK_TRANSFER">Chuyển khoản Ngân hàng (Ủy nhiệm chi)</option>
                    <option value="CASH">Tiền mặt tại bưu cục</option>
                  </select>
                </div>

                {settleShippingPaymentMethod === 'BANK_TRANSFER' && (
                  <div
                    style={{
                      marginTop: '12px',
                      padding: '12px',
                      background: '#F8FAFC',
                      border: '1px solid #E2E8F0',
                      borderRadius: '6px',
                    }}
                  >
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '8px' }}>
                      Thông Tin Tài Khoản Thụ Hưởng của GHN:
                    </div>
                    <div className="wms-form-grid-2">
                      <div className="wms-field">
                        <label className="wms-label" style={{ fontSize: '11px' }}>Ngân Hàng</label>
                        <input
                          type="text"
                          className="wms-input"
                          value={settleShippingBankName}
                          onChange={(e) => setSettleShippingBankName(e.target.value)}
                          style={{ fontSize: '12px' }}
                        />
                      </div>
                      <div className="wms-field">
                        <label className="wms-label" style={{ fontSize: '11px' }}>Số Tài Khoản</label>
                        <input
                          type="text"
                          className="wms-input"
                          value={settleShippingAccountNo}
                          onChange={(e) => setSettleShippingAccountNo(e.target.value)}
                          style={{ fontSize: '12px' }}
                        />
                      </div>
                    </div>
                    <div className="wms-field" style={{ marginTop: '8px' }}>
                      <label className="wms-label" style={{ fontSize: '11px' }}>Chủ Tài Khoản</label>
                      <input
                        type="text"
                        className="wms-input"
                        value={settleShippingAccountHolder}
                        onChange={(e) => setSettleShippingAccountHolder(e.target.value)}
                        style={{ fontSize: '12px' }}
                      />
                    </div>
                  </div>
                )}

                <div className="wms-field" style={{ marginTop: '12px' }}>
                  <label htmlFor="settle-shipping-ref" className="wms-label required">
                    Mã Giao Dịch Ngân Hàng / Số Chứng Từ UNC
                  </label>
                  <input
                    id="settle-shipping-ref"
                    type="text"
                    className="wms-input"
                    value={settleShippingTransactionReference}
                    onChange={(e) => setSettleShippingTransactionReference(e.target.value)}
                    required
                    placeholder="VD: FT26110600129, UNC-CUOC-GHN-01..."
                  />
                  <div className="wms-helper-text" style={{ marginTop: '3px' }}>
                    Mã giao dịch đối chiếu trên sao kê ngân hàng để phục vụ kiểm toán tài chính.
                  </div>
                </div>

                <div className="wms-field" style={{ marginTop: '12px' }}>
                  <label htmlFor="settle-shipping-notes" className="wms-label">
                    Diễn Giải / Ghi Chú Chứng Từ
                  </label>
                  <textarea
                    id="settle-shipping-notes"
                    rows="2"
                    className="wms-textarea"
                    value={settleShippingNotes}
                    onChange={(e) => setSettleShippingNotes(e.target.value)}
                    placeholder="Nhập ghi chú thêm nếu có..."
                  />
                </div>
              </div>

              <div className="wms-modal-footer" style={{ padding: '12px 20px', borderTop: '1px solid var(--wms-border)', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  className="wms-btn wms-btn-default wms-btn-sm"
                  onClick={() => setShowSettleShippingModal(false)}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="wms-btn wms-btn-primary wms-btn-sm"
                  style={{ backgroundColor: '#DC2626', borderColor: '#B91C1C' }}
                  disabled={submittingSettleShipping}
                >
                  <Check size={14} />
                  <span>{submittingSettleShipping ? 'Đang xử lý...' : 'Xác Nhận & Lập Phiếu Chi Cước'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DANH SÁCH LỊCH SỬ THANH TOÁN & ĐỐI SOÁT CÔNG NỢ GHN */}
      {showSettlementHistoryModal && (
        <div
          className="wms-modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={() => setShowSettlementHistoryModal(false)}
          style={{ zIndex: 1040 }}
        >
          <div
            className="wms-modal-dialog"
            style={{ maxWidth: '1050px', width: '95%' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="wms-modal-header" style={{ padding: '16px 20px', borderBottom: '1px solid var(--wms-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Receipt size={20} color="var(--wms-accent)" />
                  <h3 className="wms-modal-title" style={{ fontSize: '17px', fontWeight: 700, margin: 0, color: '#1e293b' }}>
                    Lịch Sử Thanh Toán & Đối Soát Công NỢ GHN
                  </h3>
                </div>
                <div className="wms-helper-text" style={{ fontSize: '12.5px', marginTop: '3px' }}>
                  Danh sách các đợt đối tác GHN thanh toán COD và các phiếu chi cước phí Shop đã hoàn tất ({carrierDebtData.settlementHistory?.length || 0} chứng từ)
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  className="wms-btn wms-btn-primary"
                  style={{
                    backgroundColor: '#15803D',
                    borderColor: '#166534',
                    color: '#FFFFFF',
                    fontWeight: 600,
                  }}
                  onClick={() => {
                    setShowSettlementHistoryModal(false);
                    handleOpenSettleCodModal();
                  }}
                  title="Xác nhận GHN đã chuyển tiền thanh toán COD về tài khoản và tất toán công nợ"
                >
                  <CreditCard size={14} />
                  <span>
                    Xác nhận nhận tiền
                    {(carrierDebtData.metrics?.carrierDebtToShop || 0) > 0
                      ? ` (${formatVnd(carrierDebtData.metrics?.carrierDebtToShop)})`
                      : ''}
                  </span>
                </button>
                <button
                  type="button"
                  className="wms-btn wms-btn-default wms-btn-xs"
                  onClick={() => setShowSettlementHistoryModal(false)}
                  style={{ borderRadius: '50%', width: '28px', height: '28px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            <div className="wms-modal-body" style={{ padding: '16px' }}>
              <div className="wms-table-scroll no-horizontal-scroll" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                <table className="wms-table wms-table-responsive-fit">
                  <colgroup>
                    <col style={{ width: '15%' }} />
                    <col style={{ width: '11%' }} />
                    <col style={{ width: '13%' }} />
                    <col style={{ width: '19%' }} />
                    <col style={{ width: '12%' }} />
                    <col style={{ width: '12%' }} />
                    <col style={{ width: '9%' }} />
                    <col style={{ width: '9%' }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Mã Chứng Từ</th>
                      <th style={{ textAlign: 'center' }}>Loại Phiếu</th>
                      <th>Ngày Giao Dịch</th>
                      <th>Ngân Hàng & Tài Khoản</th>
                      <th>Mã GD Ngân Hàng</th>
                      <th className="wms-td-number">Số Tiền</th>
                      <th style={{ textAlign: 'center' }}>Số Đơn</th>
                      <th style={{ textAlign: 'center' }}>Thao Tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(!carrierDebtData.settlementHistory || carrierDebtData.settlementHistory.length === 0) ? (
                      <tr>
                        <td colSpan={8} style={{ textAlign: 'center', padding: '30px', color: 'var(--wms-text-secondary)', fontSize: '13px' }}>
                          Chưa có lịch sử thanh toán nào giữa Shop và GHN được ghi nhận.
                        </td>
                      </tr>
                    ) : (
                      [...(carrierDebtData.settlementHistory || [])]
                        .sort((a, b) => new Date(b.voucherDate || b.createdAt || 0) - new Date(a.voucherDate || a.createdAt || 0))
                        .map((s) => {
                        const isCashIn = s.flowType === 'CASH_IN';
                        return (
                          <tr key={s.voucherId || s.voucherCode}>
                            <td>
                              <span
                                className="wms-code-pill"
                                style={{ fontWeight: 700, color: isCashIn ? '#166534' : '#991B1B' }}
                              >
                                {s.voucherCode}
                              </span>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <span
                                className="wms-badge-batch"
                                style={{
                                  background: isCashIn ? '#DCFCE7' : '#FEE2E2',
                                  color: isCashIn ? '#166534' : '#991B1B',
                                  border: isCashIn ? '1px solid #BBF7D0' : '1px solid #FCA5A5',
                                  fontWeight: 600,
                                  fontSize: '11px',
                                }}
                              >
                                {isCashIn ? 'Thu tiền COD' : 'Chi trả cước'}
                              </span>
                            </td>
                            <td>
                              <div style={{ fontWeight: 600 }}>{formatDate(s.voucherDate)}</div>
                              <div className="wms-helper-text" style={{ fontSize: '11px' }}>
                                {new Date(s.voucherDate).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                              </div>
                            </td>
                            <td>
                              <div style={{ fontWeight: 600, fontSize: '12px' }}>{s.bankInfo?.bankName || 'Ngân hàng'}</div>
                              <div className="wms-helper-text" style={{ fontSize: '11px' }}>
                                STK: <strong>{s.bankInfo?.accountNo || '—'}</strong> ({s.bankInfo?.accountHolder || '—'})
                              </div>
                            </td>
                            <td>
                              <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--wms-accent-hover)', fontSize: '11.5px' }}>
                                {s.transactionReference}
                              </span>
                            </td>
                            <td className="wms-td-number">
                              <strong style={{ color: isCashIn ? '#15803D' : '#DC2626', fontSize: '13px' }}>
                                {isCashIn ? `+${formatVnd(s.amount)}` : `-${formatVnd(s.amount)}`}
                              </strong>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <span
                                className="wms-badge-batch"
                                style={{ background: isCashIn ? '#DCFCE7' : '#FEE2E2', color: isCashIn ? '#166534' : '#991B1B', fontWeight: 700, fontSize: '11px' }}
                              >
                                {s.settledOrdersCount} đơn
                              </span>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <button
                                type="button"
                                className="wms-btn wms-btn-default wms-btn-xs"
                                onClick={() => setSelectedSettlementDetail(s)}
                                title="Xem chi tiết chứng từ và danh sách các đơn hàng đã thanh toán"
                              >
                                <Eye size={12} />
                                <span>Chi tiết</span>
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

            <div className="wms-modal-footer" style={{ padding: '12px 20px', borderTop: '1px solid var(--wms-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '12px', color: '#64748b' }}>
                Nhấn <strong>Chi tiết</strong> trên từng dòng để tra cứu danh sách đơn hàng đối soát tương ứng
              </div>
              <button
                type="button"
                className="wms-btn wms-btn-default wms-btn-sm"
                onClick={() => setShowSettlementHistoryModal(false)}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CHI TIẾT ĐỢT THANH TOÁN COD TRƯỚC ĐÓ */}
      {selectedSettlementDetail && (
        <div
          className="wms-modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={() => setSelectedSettlementDetail(null)}
          style={{ zIndex: 1050 }}
        >
          <div
            className="wms-modal-dialog"
            style={{ maxWidth: '640px', width: '95%' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="wms-modal-header" style={{ padding: '16px 20px', borderBottom: '1px solid var(--wms-border)' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Receipt size={20} color={selectedSettlementDetail.flowType === 'CASH_OUT' ? '#DC2626' : '#15803D'} />
                  <h3 className="wms-modal-title" style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: selectedSettlementDetail.flowType === 'CASH_OUT' ? '#991B1B' : '#166534' }}>
                    {selectedSettlementDetail.flowType === 'CASH_OUT' ? 'Chi Tiết Phiếu Chi Cước GHN: ' : 'Chi Tiết Phiếu Thu COD: '} {selectedSettlementDetail.voucherCode}
                  </h3>
                </div>
                <div className="wms-helper-text" style={{ fontSize: '12px', marginTop: '3px' }}>
                  {selectedSettlementDetail.flowType === 'CASH_OUT'
                    ? 'Chứng từ ghi nhận thanh toán cước phí vận chuyển cho đối tác Giao Hàng Nhanh (GHN)'
                    : 'Chứng từ ghi nhận tiền thanh toán COD từ Giao Hàng Nhanh (GHN)'}
                </div>
              </div>
              <button
                type="button"
                className="wms-btn wms-btn-default wms-btn-xs"
                onClick={() => setSelectedSettlementDetail(null)}
                style={{ borderRadius: '50%', width: '28px', height: '28px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <X size={15} />
              </button>
            </div>

            <div className="wms-modal-body" style={{ padding: '18px 20px', maxHeight: '420px', overflowY: 'auto' }}>
              {/* Thẻ tóm tắt thông tin giao dịch */}
              <div
                style={{
                  backgroundColor: selectedSettlementDetail.flowType === 'CASH_OUT' ? '#FEF2F2' : '#F0FDF4',
                  border: selectedSettlementDetail.flowType === 'CASH_OUT' ? '1px solid #FCA5A5' : '1px solid #BBF7D0',
                  padding: '14px 16px',
                  borderRadius: '8px',
                  marginBottom: '16px',
                  fontSize: '13px',
                }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <span style={{ color: selectedSettlementDetail.flowType === 'CASH_OUT' ? '#991B1B' : '#166534', fontSize: '12px' }}>
                      {selectedSettlementDetail.flowType === 'CASH_OUT' ? 'Số tiền thanh toán cước:' : 'Số tiền thực nhận:'}
                    </span>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: selectedSettlementDetail.flowType === 'CASH_OUT' ? '#DC2626' : '#15803D', marginTop: '2px' }}>
                      {selectedSettlementDetail.flowType === 'CASH_OUT' ? `- ${formatVnd(selectedSettlementDetail.amount)}` : `+ ${formatVnd(selectedSettlementDetail.amount)}`}
                    </div>
                  </div>
                  <div>
                    <span style={{ color: selectedSettlementDetail.flowType === 'CASH_OUT' ? '#991B1B' : '#166534', fontSize: '12px' }}>Ngày giao dịch:</span>
                    <div style={{ fontWeight: 700, marginTop: '2px' }}>
                      {formatDate(selectedSettlementDetail.voucherDate)} ({new Date(selectedSettlementDetail.voucherDate).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })})
                    </div>
                  </div>
                  <div>
                    <span style={{ color: '#64748B', fontSize: '12px' }}>Mã GD Ngân hàng:</span>
                    <div style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--wms-accent-hover)', marginTop: '2px' }}>
                      {selectedSettlementDetail.transactionReference}
                    </div>
                  </div>
                  <div>
                    <span style={{ color: '#64748B', fontSize: '12px' }}>
                      {selectedSettlementDetail.flowType === 'CASH_OUT' ? 'Tài khoản thụ hưởng (GHN):' : 'Tài khoản nhận (Shop):'}
                    </span>
                    <div style={{ fontWeight: 600, marginTop: '2px' }}>
                      {selectedSettlementDetail.bankInfo?.bankName} — {selectedSettlementDetail.bankInfo?.accountNo}
                    </div>
                  </div>
                </div>

                {selectedSettlementDetail.notes && (
                  <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: selectedSettlementDetail.flowType === 'CASH_OUT' ? '1px dashed #FCA5A5' : '1px dashed #BBF7D0', fontSize: '12px', color: selectedSettlementDetail.flowType === 'CASH_OUT' ? '#991B1B' : '#166534' }}>
                    Diễn giải: {selectedSettlementDetail.notes}
                  </div>
                )}
              </div>

              {/* Bảng danh sách các đơn hàng đã thanh toán trong đợt này */}
              <div>
                <div style={{ fontWeight: 700, fontSize: '13px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Danh sách đơn hàng được tất toán ({selectedSettlementDetail.settledOrders?.length || 0} đơn):</span>
                </div>

                <div className="wms-table-scroll" style={{ border: '1px solid var(--wms-border)', borderRadius: '6px' }}>
                  <table className="wms-table" style={{ fontSize: '12px', margin: 0 }}>
                    <thead>
                      <tr style={{ background: '#F8FAFC' }}>
                        <th>Mã Đơn Hàng</th>
                        <th>Mã Vận Đơn</th>
                        <th className="wms-td-number">Tiền COD Thu Hộ</th>
                        <th className="wms-td-number">Cước Phí GHN</th>
                        <th style={{ textAlign: 'center' }}>Trạng Thái</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(!selectedSettlementDetail.settledOrders || selectedSettlementDetail.settledOrders.length === 0) ? (
                        <tr>
                          <td colSpan={5} style={{ textAlign: 'center', padding: '16px', color: 'var(--wms-text-secondary)' }}>
                            Không có thông tin chi tiết các đơn.
                          </td>
                        </tr>
                      ) : (
                        selectedSettlementDetail.settledOrders.map((o) => (
                          <tr key={o.orderCode}>
                            <td><strong>{o.orderCode}</strong></td>
                            <td><span style={{ fontFamily: 'monospace' }}>{o.waybillCode}</span></td>
                            <td className="wms-td-number" style={{ color: '#0284C7', fontWeight: 700 }}>
                              {formatVnd(o.codAmount)}
                            </td>
                            <td className="wms-td-number" style={{ color: '#DC2626' }}>
                              {formatVnd(o.shippingFee)}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <span className="wms-status-badge wms-status-available" style={{ fontSize: '10.5px' }}>
                                Đã thanh toán
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="wms-modal-footer" style={{ padding: '12px 20px', borderTop: '1px solid var(--wms-border)', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="wms-btn wms-btn-primary wms-btn-sm"
                onClick={() => setSelectedSettlementDetail(null)}
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

export default SupplierDebtPage;

