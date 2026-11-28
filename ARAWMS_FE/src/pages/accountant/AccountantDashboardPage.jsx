import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  RefreshCw,
  Wallet,
  TrendingUp,
  Boxes,
  Truck,
  AlertTriangle,
  FilePlus2,
  FileSpreadsheet,
  ArrowRight,
  Calendar,
  CheckCircle2,
  RotateCcw,
  ShieldAlert,
} from 'lucide-react';
import accountantProcurementApi from '../../services/accountantProcurementApi';
import {
  formatVnd,
  KpiDeltaBadge,
  CashFlowComparisonChart,
  ProfitCogsTrendChart,
  InventoryDonutChart,
  CodAndDebtComparisonCard,
} from '../../components/accountant/dashboard/AccountantCharts';
import './accountantDashboard.css';

const PERIOD_OPTIONS = [
  { key: 'WEEK', label: 'Tuần này' },
  { key: 'MONTH', label: 'Tháng này' },
  { key: 'QUARTER', label: 'Quý này' },
  { key: 'YEAR', label: 'Năm nay' },
  { key: 'CUSTOM', label: 'Tùy chọn' },
];

const PAYMENT_METHOD_LABEL = {
  BANK_TRANSFER: 'Chuyển khoản',
  CASH: 'Tiền mặt',
  COD_BALANCE_OFFSET: 'Bù trừ COD',
};

const AccountantDashboardPage = () => {
  const [periodType, setPeriodType] = useState('MONTH');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [filterError, setFilterError] = useState('');

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState('');

  // [UC-009, UC-111] View Dashboard & Report Cash Flow - Tải KPI tổng quan & biểu đồ phân tích dòng tiền theo kỳ
  const fetchDashboard = useCallback(async (type, start, end) => {
    setFilterError('');
    setApiError('');

    if (type === 'CUSTOM') {
      if (!start || !end) {
        setFilterError('Vui lòng chọn đầy đủ Ngày bắt đầu và Ngày kết thúc.');
        return;
      }
      const d1 = new Date(start);
      const d2 = new Date(end);
      if (d1 > d2) {
        setFilterError('Ngày bắt đầu không được lớn hơn ngày kết thúc.');
        return;
      }
      const diffDays = Math.ceil((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      if (diffDays > 366) {
        setFilterError('Khoảng thời gian tùy chỉnh tối đa 366 ngày.');
        return;
      }
    }

    setLoading(true);
    try {
      const params = { periodType: type };
      if (type === 'CUSTOM') {
        params.fromDate = start;
        params.toDate = end;
      }
      const resData = await accountantProcurementApi.getDashboardSummary(params);
      setData(resData);
    } catch (err) {
      setApiError(
        err?.response?.data?.message || err?.message || 'Không thể tải dữ liệu Dashboard Kế toán.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (periodType !== 'CUSTOM') {
      fetchDashboard(periodType, '', '');
    }
  }, [periodType, fetchDashboard]);

  // [UC-111] Report Cash Flow - Áp dụng bộ lọc khoảng thời gian tùy chọn cho báo cáo dòng tiền
  const handleApplyCustom = (e) => {
    e.preventDefault();
    fetchDashboard('CUSTOM', fromDate, toDate);
  };

  const kpis = data?.kpis || {};
  const snapshot = data?.balanceSnapshot || {};
  const charts = data?.charts || {};
  const alerts = data?.actionAlerts || {};
  const periodInfo = data?.period || {};
  const currentLabel = periodInfo.current?.label || 'Kỳ hiện tại';
  const previousLabel = periodInfo.previous?.label || 'Kỳ trước';

  return (
    <div className="acc-dash-container">
      {/* TẦNG 1: THANH BỘ LỌC KỲ & THAO TÁC NHANH */}
      <div className="acc-dash-toolbar">
        <div className="acc-dash-period-group">
          <Calendar size={16} color="#64748B" />
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              className={`acc-dash-period-btn ${periodType === opt.key ? 'active' : ''}`}
              onClick={() => {
                setFilterError('');
                setPeriodType(opt.key);
              }}
            >
              {opt.label}
            </button>
          ))}

          {periodType === 'CUSTOM' && (
            <form onSubmit={handleApplyCustom} className="acc-dash-custom-dates">
              <input
                type="date"
                className="acc-dash-date-input"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                aria-label="Từ ngày"
              />
              <span style={{ color: '#64748B', fontSize: 13 }}>đến</span>
              <input
                type="date"
                className="acc-dash-date-input"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                aria-label="Đến ngày"
              />
              <button type="submit" className="acc-dash-period-btn active">
                Áp dụng
              </button>
            </form>
          )}
        </div>

        <div className="acc-dash-quick-actions">
          <button
            type="button"
            className="acc-dash-action-btn"
            onClick={() => fetchDashboard(periodType, fromDate, toDate)}
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? 'spinning' : ''} />
            Làm mới
          </button>
          <Link to="/accountant/cash-flow-vouchers" className="acc-dash-action-btn primary">
            <FilePlus2 size={14} />
            Lập phiếu thu/chi
          </Link>
          <Link to="/accountant/cod-reconciliation" className="acc-dash-action-btn">
            <FileSpreadsheet size={14} />
            Đối soát COD
          </Link>
        </div>
      </div>

      {filterError && (
        <div className="acc-alert-card danger">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#991B1B', fontSize: 13 }}>
            <AlertTriangle size={16} />
            <strong>Lỗi bộ lọc:</strong> {filterError}
          </div>
        </div>
      )}

      {apiError && (
        <div className="acc-alert-card danger">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#991B1B', fontSize: 13 }}>
            <AlertTriangle size={16} />
            <span>{apiError}</span>
          </div>
        </div>
      )}

      {data && (
        <div className="acc-dash-period-banner">
          <span>
            Đang đối chiếu: <strong>{currentLabel}</strong> so với kỳ trước{' '}
            <strong>{previousLabel}</strong>
          </span>
          <span>
            Đơn hàng trong kỳ: <strong>{kpis.orderCount?.current || 0}</strong> đơn (Kỳ trước:{' '}
            {kpis.orderCount?.previous || 0} đơn)
          </span>
        </div>
      )}

      {/* TẦNG 2: 3 THẺ KPI CHÍNH + SO SÁNH KỲ TRƯỚC */}
      <div className="acc-dash-kpi-grid">
        <div className="acc-dash-kpi-card">
          <div className="acc-dash-kpi-top">
            <span className="acc-dash-kpi-label">Dòng tiền ròng trong kỳ</span>
            <div className="acc-dash-kpi-icon" style={{ background: '#CCFBF1', color: '#0F766E' }}>
              <TrendingUp size={18} />
            </div>
          </div>
          <div className="acc-dash-kpi-value">{formatVnd(kpis.netCashFlow?.current)}</div>
          <div className="acc-dash-kpi-compare">
            <span>
              Thu: <strong style={{ color: '#0F766E' }}>{formatVnd(kpis.cashIn?.current)}</strong> · Chi:{' '}
              <strong style={{ color: '#DC2626' }}>{formatVnd(kpis.cashOut?.current)}</strong>
            </span>
            <KpiDeltaBadge delta={kpis.netCashFlow} />
          </div>
        </div>

        <div className="acc-dash-kpi-card">
          <div className="acc-dash-kpi-top">
            <span className="acc-dash-kpi-label">Tổng Giá trị Tài sản Kho</span>
            <div className="acc-dash-kpi-icon" style={{ background: '#FEF3C7', color: '#B45309' }}>
              <Boxes size={18} />
            </div>
          </div>
          <div className="acc-dash-kpi-value">{formatVnd(snapshot.totalInventoryAssetValue)}</div>
          <div className="acc-dash-kpi-compare">
            <span>
              NPL: <strong>{formatVnd((snapshot.rawMaterialValue || 0) + (snapshot.rawMaterialPendingValue || 0))}</strong>
            </span>
            <span>
              TP: <strong>{formatVnd(snapshot.finishedGoodsValue || 0)}</strong>
            </span>
          </div>
        </div>

        <div className="acc-dash-kpi-card">
          <div className="acc-dash-kpi-top">
            <span className="acc-dash-kpi-label">Công nợ NCC &amp; Phải thu GHN</span>
            <div className="acc-dash-kpi-icon" style={{ background: '#FEE2E2', color: '#B91C1C' }}>
              <Wallet size={18} />
            </div>
          </div>
          <div className="acc-dash-kpi-value" style={{ color: '#B91C1C' }}>
            {formatVnd(snapshot.supplierTotalRemainingDebt)}
          </div>
          <div className="acc-dash-kpi-compare">
            <span>
              Nợ {snapshot.supplierCountWithDebt || 0} NCC (Quá hạn:{' '}
              <strong>{formatVnd(snapshot.supplierOverdueDebt)}</strong>)
            </span>
            <span style={{ color: '#0369A1', fontWeight: 600 }}>
              Thu GHN: {formatVnd(snapshot.carrierNetAmount)}
            </span>
          </div>
        </div>
      </div>

      {/* TẦNG 3: CẢNH BÁO RỦI RO & VIỆC CẦN XỬ LÝ NGAY */}
      <div className="acc-dash-alerts-grid">
        <Link
          to="/accountant/cod-reconciliation"
          className={`acc-alert-card ${alerts.codRedFlagsCount > 0 ? 'danger' : 'ok'}`}
        >
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
              Cờ đỏ sai lệch COD
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#0F172A', marginTop: 2 }}>
              {alerts.codRedFlagsCount || 0} đơn
            </div>
            <div style={{ fontSize: 12, color: '#475569' }}>
              Chênh lệch: {formatVnd(alerts.codRedFlagsAmount)}
            </div>
          </div>
          {alerts.codRedFlagsCount > 0 ? (
            <ShieldAlert size={24} color="#DC2626" />
          ) : (
            <CheckCircle2 size={24} color="#16A34A" />
          )}
        </Link>

        <Link
          to="/accountant/contract-deviations"
          className={`acc-alert-card ${alerts.openDeviationsCount > 0 ? 'warning' : 'ok'}`}
        >
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
              Sai lệch KCS hợp đồng
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#0F172A', marginTop: 2 }}>
              {alerts.openDeviationsCount || 0} biên bản
            </div>
            <div style={{ fontSize: 12, color: '#475569' }}>Chờ xử lý / lập phụ lục</div>
          </div>
          <AlertTriangle size={24} color={alerts.openDeviationsCount > 0 ? '#D97706' : '#16A34A'} />
        </Link>

        <Link
          to="/accountant/supplier-debts"
          className={`acc-alert-card ${alerts.overdueSupplierDebt > 0 ? 'danger' : 'info'}`}
        >
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
              Nợ NCC quá hạn thanh toán
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#0F172A', marginTop: 2 }}>
              {formatVnd(alerts.overdueSupplierDebt)}
            </div>
            <div style={{ fontSize: 12, color: '#475569' }}>
              Tranh chấp GHN mở: {alerts.openDisputesCount || 0}
            </div>
          </div>
          <Truck size={24} color={alerts.overdueSupplierDebt > 0 ? '#DC2626' : '#0284C7'} />
        </Link>

        <Link
          to="/accountant/cash-flow-vouchers"
          className={`acc-alert-card ${alerts.pendingRefundsCount > 0 ? 'warning' : 'ok'}`}
        >
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
              Hoàn tiền trả hàng chờ duyệt
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#0F172A', marginTop: 2 }}>
              {alerts.pendingRefundsCount || 0} yêu cầu
            </div>
            <div style={{ fontSize: 12, color: '#475569' }}>
              Tổng tiền: {formatVnd(alerts.pendingRefundsAmount)}
            </div>
          </div>
          <RotateCcw size={24} color={alerts.pendingRefundsCount > 0 ? '#D97706' : '#16A34A'} />
        </Link>
      </div>

      {/* TẦNG 4: LƯỚI BIỂU ĐỒ TRỰC QUAN & SO SÁNH KỲ CŨ */}
      <div className="acc-dash-charts-grid">
        <CashFlowComparisonChart
          series={charts.cashFlowTimeSeries || []}
          currentLabel={currentLabel}
          previousLabel={previousLabel}
        />

        <ProfitCogsTrendChart
          series={charts.profitAndCogsSeries || []}
          currentLabel={currentLabel}
          previousLabel={previousLabel}
        />

        <InventoryDonutChart
          items={charts.inventoryBreakdown || []}
          totalValue={snapshot.totalInventoryAssetValue || 0}
        />

        <CodAndDebtComparisonCard
          codComparison={charts.codReconciliationComparison || {}}
          topDebtSuppliers={charts.topDebtSuppliers || []}
          currentLabel={currentLabel}
          previousLabel={previousLabel}
        />
      </div>

      {/* TẦNG 5: GIAO DỊCH THU / CHI GẦN ĐÂY */}
      <div className="acc-chart-card">
        <div className="acc-chart-header">
          <div>
            <h3 className="acc-chart-title">Phiếu Thu / Chi phát sinh gần nhất</h3>
            <p className="acc-chart-subtitle">
              Theo dõi các chứng từ dòng tiền mới nhất trong hệ thống
            </p>
          </div>
          <Link to="/accountant/cash-flow-vouchers" className="acc-dash-action-btn">
            Xem tất cả chứng từ <ArrowRight size={14} />
          </Link>
        </div>

        <div className="acc-table-wrap">
          <table className="acc-table">
            <thead>
              <tr>
                <th>Mã phiếu</th>
                <th>Loại</th>
                <th>Đối tượng</th>
                <th>Nội dung chi / thu</th>
                <th>Phương thức</th>
                <th>Ngày chứng từ</th>
                <th style={{ textAlign: 'right' }}>Số tiền</th>
              </tr>
            </thead>
            <tbody>
              {(data?.recentVouchers || []).length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', color: '#64748B', padding: 20 }}>
                    Chưa có phiếu thu / chi nào được ghi nhận.
                  </td>
                </tr>
              ) : (
                data.recentVouchers.map((v) => (
                  <tr key={v._id}>
                    <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>{v.voucherCode}</td>
                    <td>
                      <span className={`acc-pill ${v.flowType === 'CASH_IN' ? 'in' : 'out'}`}>
                        {v.flowType === 'CASH_IN' ? 'Phiếu Thu' : 'Phiếu Chi'}
                      </span>
                    </td>
                    <td>{v.recipient?.name || '—'}</td>
                    <td style={{ maxWidth: 280 }}>{v.paymentReason}</td>
                    <td>{PAYMENT_METHOD_LABEL[v.paymentMethod] || v.paymentMethod}</td>
                    <td>
                      {v.voucherDate ? new Date(v.voucherDate).toLocaleDateString('vi-VN') : '—'}
                    </td>
                    <td
                      style={{
                        textAlign: 'right',
                        fontWeight: 700,
                        color: v.flowType === 'CASH_IN' ? '#0F766E' : '#B91C1C',
                      }}
                    >
                      {v.flowType === 'CASH_IN' ? '+' : '-'}
                      {formatVnd(v.amount)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AccountantDashboardPage;

