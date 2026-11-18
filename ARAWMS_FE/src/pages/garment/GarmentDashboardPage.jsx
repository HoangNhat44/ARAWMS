/**
 * ============================================================================
 * @title        : Garment Technician Dashboard Page
 * @author       : AraWMS Team
 * @createdDate  : 2026-11-18
 * @lastModified : 2026-11-18
 * @description  : Trang Tổng quan vận hành & Kiểm định chất lượng dành cho Nhân viên Kỹ thuật:
 *                 hàng đợi công việc cần xử lý ngay, tỷ lệ đạt/lỗi thành phẩm xưởng may,
 *                 biểu đồ xu hướng & cơ cấu nhóm lỗi, phân tích hàng hoàn/trả (3 trạng thái),
 *                 tiến độ quản lý lô hàng, đối soát kế hoạch nguyên phụ liệu, vải thừa và sản phẩm lỗi.
 * @module       : Garment Technical / Dashboard
 * @layer        : Front-end (Page)
 * ============================================================================
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  LayoutDashboard,
  RefreshCw,
  ClipboardCheck,
  RotateCcw,
  Layers,
  ScanLine,
  Shirt,
  ShieldAlert,
  CheckCircle2,
  Scissors,
  ArrowRight,
  AlertTriangle,
  Activity,
  BarChart3,
  PieChart,
} from 'lucide-react';
import garmentTechnicalService from '../../services/garmentTechnicalService';
import {
  DEFECT_CATEGORY_META,
  DEFECT_ACTION_LABELS,
  RETURN_CONDITION_LABELS,
  translateColorVi,
  translateProductNameVi,
} from '../../utils/garmentDisplayVi';

const RANGE_OPTIONS = [
  { key: '7d', label: '7 ngày' },
  { key: '30d', label: '30 ngày' },
  { key: '90d', label: '90 ngày' },
  { key: 'all', label: 'Toàn bộ' },
];

const ACTIVITY_BADGE = {
  WAITING_QC: { label: 'Chờ kiểm định', bg: '#FEF3C7', color: '#92400E' },
  READY_TO_CONFIRM: { label: 'Chờ Quản lý kho', bg: '#FEF3C7', color: '#92400E' },
  WAITING_RECEIPT: { label: 'Chờ nhập kho', bg: '#FEF3C7', color: '#92400E' },
  PARTIALLY_RECEIVED: { label: 'Đang nhập một phần', bg: '#DBEAFE', color: '#1E40AF' },
  COMPLETED: { label: 'Hoàn tất', bg: '#ECFDF5', color: '#047857' },
  CANCELLED: { label: 'Đã hủy', bg: '#F3F4F6', color: '#6B7280' },
  PASSED: { label: 'Hoàn thành công', bg: '#ECFDF5', color: '#047857' },
  PARTIAL: { label: 'Hoàn một phần', bg: '#FFF7ED', color: '#C2410C' },
  FAILED: { label: 'Hoàn không thành công', bg: '#FEF2F2', color: '#B91C1C' },
  DRAFT: { label: 'Lô nháp', bg: '#F3F4F6', color: '#374151' },
  REQUESTED: { label: 'Đã gửi Quản lý kho', bg: '#FEF3C7', color: '#B45309' },
  RECEIVED: { label: 'Đã nhập kho', bg: '#ECFDF5', color: '#047857' },
};

const formatNum = (n) => Number(n || 0).toLocaleString('vi-VN');

const formatShortDay = (isoDay) => {
  if (!isoDay) return '';
  const [, m, d] = String(isoDay).split('-');
  return `${d}/${m}`;
};

const formatDateTime = (value) =>
  value ? new Date(value).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }) : '—';

/** Biểu đồ cột chồng SVG thể hiện xu hướng kiểm định thành phẩm theo ngày (Đạt và Lỗi). */
function DailySewingStackedChart({ data = [] }) {
  if (!data.length) {
    return (
      <div style={{ padding: '2.5rem 1rem', textAlign: 'center', color: '#6B7280', fontSize: '0.86rem' }}>
        Chưa có dữ liệu phiếu kiểm định thành phẩm trong khoảng thời gian này.
      </div>
    );
  }

  const maxTotal = Math.max(1, ...data.map((d) => (d.passedQty || 0) + (d.failedQty || 0)));
  const chartHeight = 190;
  const barWidth = Math.max(16, Math.min(34, Math.floor(420 / data.length) - 8));
  const gap = 12;
  const leftPad = 36;
  const totalWidth = Math.max(460, leftPad + data.length * (barWidth + gap) + 20);

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${totalWidth} ${chartHeight + 44}`} style={{ width: '100%', height: 235, display: 'block' }}>
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = chartHeight - ratio * (chartHeight - 16) + 8;
          const labelVal = Math.round(maxTotal * ratio);
          return (
            <g key={ratio}>
              <line x1={leftPad} y1={y} x2={totalWidth - 8} y2={y} stroke="#F3F4F6" strokeWidth="1" />
              <text x={leftPad - 6} y={y + 4} textAnchor="end" fontSize="10" fill="#9CA3AF">
                {labelVal}
              </text>
            </g>
          );
        })}

        {data.map((entry, idx) => {
          const x = leftPad + idx * (barWidth + gap) + 8;
          const usableHeight = chartHeight - 16;
          const passedH = ((entry.passedQty || 0) / maxTotal) * usableHeight;
          const failedH = ((entry.failedQty || 0) / maxTotal) * usableHeight;
          const yPassed = chartHeight + 8 - passedH;
          const yFailed = yPassed - failedH;

          return (
            <g key={entry.date}>
              <title>
                {`${entry.date}: ${entry.passedQty} sản phẩm đạt / ${entry.failedQty} sản phẩm lỗi (${entry.tickets} phiếu)`}
              </title>
              {passedH > 0 && (
                <rect
                  x={x}
                  y={yPassed}
                  width={barWidth}
                  height={Math.max(2, passedH)}
                  rx={failedH > 0 ? 0 : 4}
                  fill="#10B981"
                />
              )}
              {failedH > 0 && (
                <rect
                  x={x}
                  y={yFailed}
                  width={barWidth}
                  height={Math.max(2, failedH)}
                  rx={4}
                  fill="#EF4444"
                />
              )}
              <text
                x={x + barWidth / 2}
                y={chartHeight + 24}
                textAnchor="middle"
                fontSize="10"
                fill="#6B7280"
              >
                {formatShortDay(entry.date)}
              </text>
            </g>
          );
        })}
      </svg>
      <div style={{ display: 'flex', gap: 16, justifyContent: 'center', fontSize: '0.78rem', color: '#4B5563', marginTop: 4 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: '#10B981' }} /> Đạt kiểm định chất lượng
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: '#EF4444' }} /> Hàng lỗi / hỏng
        </span>
      </div>
    </div>
  );
}

/** Biểu đồ tròn SVG thể hiện cơ cấu nhóm lỗi thành phẩm. */
function DefectCategoryDonut({ items = [], totalFailed = 0 }) {
  if (!items.length || totalFailed <= 0) {
    return (
      <div style={{ padding: '2.5rem 1rem', textAlign: 'center', color: '#047857', fontSize: '0.88rem' }}>
        <CheckCircle2 size={28} style={{ marginBottom: 6, opacity: 0.8 }} />
        <div style={{ fontWeight: 700 }}>Không ghi nhận hàng lỗi xưởng may!</div>
        <div style={{ fontSize: '0.78rem', color: '#6B7280', marginTop: 3 }}>
          100% sản phẩm kiểm định đều đạt chuẩn trong khoảng thời gian đã chọn.
        </div>
      </div>
    );
  }

  const radius = 56;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 16, alignItems: 'center' }}>
      <svg viewBox="0 0 150 150" style={{ width: 148, height: 148, margin: '0 auto' }}>
        <circle cx="75" cy="75" r={radius} fill="none" stroke="#F3F4F6" strokeWidth="18" />
        {items.map((item) => {
          const meta = DEFECT_CATEGORY_META[item.category] || DEFECT_CATEGORY_META.OTHER;
          const frac = item.count / totalFailed;
          const dash = frac * circumference;
          const seg = (
            <circle
              key={item.category}
              cx="75"
              cy="75"
              r={radius}
              fill="none"
              stroke={meta.color}
              strokeWidth="18"
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 75 75)"
            >
              <title>{`${meta.label}: ${item.count} sản phẩm (${item.percentage}%)`}</title>
            </circle>
          );
          offset += dash;
          return seg;
        })}
        <text x="75" y="71" textAnchor="middle" fontSize="18" fontWeight="800" fill="#B91C1C">
          {formatNum(totalFailed)}
        </text>
        <text x="75" y="88" textAnchor="middle" fontSize="9.5" fill="#6B7280">
          sản phẩm lỗi
        </text>
      </svg>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((item) => {
          const meta = DEFECT_CATEGORY_META[item.category] || DEFECT_CATEGORY_META.OTHER;
          return (
            <div key={item.category} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.82rem', gap: 8 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: '#374151' }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: meta.color, flexShrink: 0 }} />
                {meta.label}
              </span>
              <span style={{ fontWeight: 700, color: '#111827', whiteSpace: 'nowrap' }}>
                {formatNum(item.count)} sản phẩm <span style={{ color: '#6B7280', fontWeight: 500 }}>({item.percentage}%)</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function GarmentDashboardPage() {
  const [range, setRange] = useState('30d');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await garmentTechnicalService.dashboard.getSummary({ range });
      setData(res?.data || null);
    } catch (err) {
      setError(err.message || 'Không thể tải dữ liệu thống kê Kỹ thuật may');
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const cardStyle = {
    background: '#FFFFFF',
    border: '1px solid #E5E7EB',
    borderRadius: 14,
    padding: '1.15rem 1.25rem',
    boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
  };

  return (
    <div style={{ padding: '1.5rem', maxWidth: 1440, margin: '0 auto' }}>
      {/* Tiêu đề trang */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: '1.25rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.55rem', fontWeight: 800, color: '#141210', display: 'flex', alignItems: 'center', gap: 10 }}>
            <LayoutDashboard size={24} color="#8A6A46" />
            Tổng Quan Thống Kê Kỹ Thuật May &amp; Kiểm Định Chất Lượng
          </h1>
          <p style={{ margin: '5px 0 0', fontSize: '0.88rem', color: '#4B5563' }}>
            Theo dõi chất lượng may xưởng, cơ cấu nhóm lỗi, kiểm định hàng hoàn/trả, tiến độ quản lý lô hàng và các công việc cần xử lý ngay.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'inline-flex', background: '#F3F4F6', padding: 3, borderRadius: 9 }}>
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setRange(opt.key)}
                style={{
                  padding: '5px 12px',
                  borderRadius: 7,
                  border: 'none',
                  background: range === opt.key ? '#141210' : 'transparent',
                  color: range === opt.key ? '#FFF' : '#4B5563',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={loadDashboard}
            disabled={loading}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '0.48rem 0.9rem',
              borderRadius: 8,
              border: '1px solid #D1D5DB',
              background: '#FFF',
              color: '#374151',
              fontWeight: 600,
              fontSize: '0.84rem',
              cursor: 'pointer',
            }}
          >
            <RefreshCw size={14} className={loading ? 'spinning' : ''} /> Làm mới
          </button>
        </div>
      </header>

      {error && (
        <div style={{ padding: '0.9rem 1rem', borderRadius: 10, background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B', marginBottom: '1rem', fontSize: '0.88rem' }}>
          {error}
        </div>
      )}

      {loading && !data ? (
        <div style={{ ...cardStyle, padding: '3.5rem', textAlign: 'center', color: '#6B7280' }}>
          Đang tổng hợp số liệu kiểm định chất lượng và vận hành kỹ thuật...
        </div>
      ) : data ? (
        <>
          {/* ================================================================= */}
          {/* PHẦN 1: HÀNG ĐỢI CÔNG VIỆC CẦN XỬ LÝ NGAY                         */}
          {/* ================================================================= */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12, marginBottom: '1.25rem' }}>
            {[
              {
                label: 'Kế hoạch nguyên phụ liệu chờ đối soát',
                value: data.actionQueue.plansPendingVerification,
                to: '/garment/material-inbound-verification',
                icon: ClipboardCheck,
                accent: '#2563EB',
                bg: '#EFF6FF',
              },
              {
                label: 'Đơn hoàn/trả chờ phân loại kiểm định',
                value: data.actionQueue.returnsPendingReview,
                to: '/garment/return-inspection',
                icon: RotateCcw,
                accent: '#D97706',
                bg: '#FFFBEB',
              },
              {
                label: 'Lô hàng nháp chưa gửi Quản lý kho',
                value: data.actionQueue.draftLotsCount,
                to: '/garment/lots',
                icon: Layers,
                accent: '#8A6A46',
                bg: '#F8F4EE',
              },
              {
                label: 'Phiên kiểm kê chờ thực hiện',
                value: data.actionQueue.stocktakesPending,
                to: '/garment/stocktake-execution',
                icon: ScanLine,
                accent: '#7C3AED',
                bg: '#F5F3FF',
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.label}
                  to={item.to}
                  style={{
                    ...cardStyle,
                    textDecoration: 'none',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderLeft: `4px solid ${item.accent}`,
                    transition: 'transform 0.15s ease',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '0.78rem', color: '#6B7280', fontWeight: 600 }}>{item.label}</div>
                    <div style={{ fontSize: '1.65rem', fontWeight: 800, color: '#111827', marginTop: 4 }}>
                      {formatNum(item.value)}
                    </div>
                    <div style={{ fontSize: '0.74rem', color: item.accent, fontWeight: 600, marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      Xử lý ngay <ArrowRight size={12} />
                    </div>
                  </div>
                  <div style={{ width: 42, height: 42, borderRadius: 10, background: item.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: item.accent }}>
                    <Icon size={20} />
                  </div>
                </Link>
              );
            })}
          </div>

          {/* ================================================================= */}
          {/* PHẦN 2: 4 CHỈ SỐ CHẤT LƯỢNG & SẢN LƯỢNG                           */}
          {/* ================================================================= */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12, marginBottom: '1.25rem' }}>
            <div style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.78rem', color: '#6B7280', fontWeight: 600 }}>Kiểm định thành phẩm xưởng may</span>
                <Shirt size={16} color="#047857" />
              </div>
              <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#047857', marginTop: 6 }}>
                {formatNum(data.sewingKcs.passedQty)}{' '}
                <span style={{ fontSize: '0.86rem', fontWeight: 600, color: '#6B7280' }}>
                  / {formatNum(data.sewingKcs.totalBatchQty)} sản phẩm
                </span>
              </div>
              <div style={{ fontSize: '0.78rem', color: '#047857', marginTop: 4, fontWeight: 600 }}>
                Tỷ lệ đạt kiểm định: {data.sewingKcs.passRate}% · {data.sewingKcs.ticketCount} phiếu
              </div>
            </div>

            <div style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.78rem', color: '#6B7280', fontWeight: 600 }}>Hàng lỗi / hỏng xưởng may</span>
                <ShieldAlert size={16} color="#DC2626" />
              </div>
              <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#B91C1C', marginTop: 6 }}>
                {formatNum(data.sewingKcs.failedDefectQty)}{' '}
                <span style={{ fontSize: '0.86rem', fontWeight: 600, color: '#6B7280' }}>sản phẩm</span>
              </div>
              <div style={{ fontSize: '0.78rem', color: '#B91C1C', marginTop: 4, fontWeight: 600 }}>
                Tỷ lệ lỗi may: {data.sewingKcs.defectRate}%
              </div>
            </div>

            <div style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.78rem', color: '#6B7280', fontWeight: 600 }}>Kiểm định hàng hoàn/trả</span>
                <RotateCcw size={16} color="#2563EB" />
              </div>
              <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#111827', marginTop: 6 }}>
                {formatNum(data.returnKcs.totalOrders)}{' '}
                <span style={{ fontSize: '0.86rem', fontWeight: 600, color: '#6B7280' }}>đơn đã chốt</span>
              </div>
              <div style={{ fontSize: '0.78rem', color: '#4B5563', marginTop: 4 }}>
                <strong style={{ color: '#047857' }}>{data.returnKcs.passedOrders} hoàn thành công</strong> ·{' '}
                <strong style={{ color: '#C2410C' }}>{data.returnKcs.partialOrders} một phần</strong> ·{' '}
                <strong style={{ color: '#B91C1C' }}>{data.returnKcs.failedOrders} không đạt</strong>
              </div>
            </div>

            <div style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.78rem', color: '#6B7280', fontWeight: 600 }}>Hàng hoàn lỗi &amp; Vải thừa thu hồi</span>
                <Scissors size={16} color="#8A6A46" />
              </div>
              <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#111827', marginTop: 6 }}>
                {formatNum(data.returnKcs.totalDefectiveProductUnitsInSystem)}{' '}
                <span style={{ fontSize: '0.84rem', fontWeight: 600, color: '#B91C1C' }}>sản phẩm hàng lỗi</span>
              </div>
              <div style={{ fontSize: '0.78rem', color: '#8A6A46', marginTop: 4, fontWeight: 600 }}>
                Vải thừa thu hồi: {data.remnant.recoveredMeters} mét ({data.remnant.totalRequests} phiếu)
              </div>
            </div>
          </div>

          {/* ================================================================= */}
          {/* PHẦN 3: BIỂU ĐỒ KIỂM ĐỊNH THÀNH PHẨM & CƠ CẤU NHÓM LỖI            */}
          {/* ================================================================= */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1.3fr) minmax(320px, 1fr)', gap: '1.25rem', marginBottom: '1.25rem' }}>
            <section style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#111827', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <BarChart3 size={18} color="#047857" />
                  Xu hướng kiểm định thành phẩm theo ngày (Đạt và Lỗi)
                </h2>
                <Link to="/garment/finished-goods-inspection" style={{ fontSize: '0.8rem', color: '#2563EB', fontWeight: 600, textDecoration: 'none' }}>
                  Xem danh sách phiếu →
                </Link>
              </div>
              <DailySewingStackedChart data={data.sewingKcs.dailySewingTrend} />
            </section>

            <section style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#111827', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <PieChart size={18} color="#DC2626" />
                  Cơ cấu nhóm lỗi thành phẩm
                </h2>
              </div>
              <DefectCategoryDonut items={data.sewingKcs.defectByCategory} totalFailed={data.sewingKcs.failedDefectQty} />

              {data.sewingKcs.defectByAction.length > 0 && (
                <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #F3F4F6' }}>
                  <div style={{ fontSize: '0.76rem', fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', marginBottom: 6 }}>
                    Hướng xử lý hàng lỗi
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {data.sewingKcs.defectByAction.map((act) => (
                      <span
                        key={act.action}
                        style={{
                          fontSize: '0.78rem',
                          padding: '3px 9px',
                          borderRadius: 999,
                          background: '#FEF2F2',
                          color: '#991B1B',
                          border: '1px solid #FECACA',
                          fontWeight: 600,
                        }}
                      >
                        {DEFECT_ACTION_LABELS[act.action] || act.action}: {formatNum(act.count)} sản phẩm ({act.percentage}%)
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </div>

          {/* ================================================================= */}
          {/* PHẦN 4: HÀNG HOÀN/TRẢ & QUẢN LÝ LÔ / KẾ HOẠCH NGUYÊN PHỤ LIỆU     */}
          {/* ================================================================= */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.25rem', marginBottom: '1.25rem' }}>
            {/* Phân tích hàng hoàn/trả */}
            <section style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#111827', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <RotateCcw size={17} color="#B45309" />
                  Phân tích hàng hoàn/trả (3 trạng thái)
                </h2>
                <Link to="/garment/return-inspection" style={{ fontSize: '0.8rem', color: '#2563EB', fontWeight: 600, textDecoration: 'none' }}>
                  Mở trang kiểm tra hoàn →
                </Link>
              </div>

              {data.returnKcs.totalOrders > 0 ? (
                <>
                  <div style={{ display: 'flex', height: 14, borderRadius: 999, overflow: 'hidden', background: '#F3F4F6', marginBottom: 10 }}>
                    {data.returnKcs.passedOrders > 0 && (
                      <div
                        style={{ width: `${(data.returnKcs.passedOrders / data.returnKcs.totalOrders) * 100}%`, background: '#10B981' }}
                        title={`Hoàn thành công: ${data.returnKcs.passedOrders} đơn`}
                      />
                    )}
                    {data.returnKcs.partialOrders > 0 && (
                      <div
                        style={{ width: `${(data.returnKcs.partialOrders / data.returnKcs.totalOrders) * 100}%`, background: '#F59E0B' }}
                        title={`Hoàn một phần: ${data.returnKcs.partialOrders} đơn`}
                      />
                    )}
                    {data.returnKcs.failedOrders > 0 && (
                      <div
                        style={{ width: `${(data.returnKcs.failedOrders / data.returnKcs.totalOrders) * 100}%`, background: '#EF4444' }}
                        title={`Hoàn không thành công: ${data.returnKcs.failedOrders} đơn`}
                      />
                    )}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, textAlign: 'center', marginBottom: 14 }}>
                    <div style={{ padding: '8px', borderRadius: 8, background: '#ECFDF5' }}>
                      <div style={{ fontSize: '0.73rem', color: '#047857', fontWeight: 600 }}>Hoàn thành công</div>
                      <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#047857' }}>{data.returnKcs.passedOrders}</div>
                    </div>
                    <div style={{ padding: '8px', borderRadius: 8, background: '#FFF7ED' }}>
                      <div style={{ fontSize: '0.73rem', color: '#C2410C', fontWeight: 600 }}>Hoàn một phần</div>
                      <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#C2410C' }}>{data.returnKcs.partialOrders}</div>
                    </div>
                    <div style={{ padding: '8px', borderRadius: 8, background: '#FEF2F2' }}>
                      <div style={{ fontSize: '0.73rem', color: '#B91C1C', fontWeight: 600 }}>Hoàn không thành công</div>
                      <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#B91C1C' }}>{data.returnKcs.failedOrders}</div>
                    </div>
                  </div>
                </>
              ) : (
                <div style={{ padding: '1rem', textAlign: 'center', color: '#6B7280', fontSize: '0.84rem' }}>
                  Chưa có đơn hàng hoàn đã chốt trong giai đoạn này.
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.83rem', padding: '8px 10px', borderRadius: 8, background: '#F9FAFB', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                <span>Sản phẩm hoàn đạt nhập kho bán: <strong style={{ color: '#047857' }}>{formatNum(data.returnKcs.restockUnits)}</strong></span>
                <span>Sản phẩm hoàn lỗi: <strong style={{ color: '#B91C1C' }}>{formatNum(data.returnKcs.defectUnits)}</strong></span>
              </div>

              {data.returnKcs.conditionBreakdown.length > 0 && (
                <div>
                  <div style={{ fontSize: '0.76rem', fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', marginBottom: 8 }}>
                    Nguyên nhân hàng hoàn không đạt
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {data.returnKcs.conditionBreakdown.map((c) => (
                      <div key={c.condition}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: 3 }}>
                          <span>{RETURN_CONDITION_LABELS[c.condition] || c.condition}</span>
                          <strong>{c.count} sản phẩm ({c.percentage}%)</strong>
                        </div>
                        <div style={{ height: 6, borderRadius: 999, background: '#F3F4F6', overflow: 'hidden' }}>
                          <div style={{ width: `${c.percentage}%`, height: '100%', background: '#EF4444' }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>

            {/* Tổng quan Lô hàng & Đối soát kế hoạch nguyên phụ liệu */}
            <section style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#111827', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Layers size={17} color="#8A6A46" />
                  Quản lý lô hàng &amp; Đối soát nguyên phụ liệu
                </h2>
                <Link to="/garment/lots" style={{ fontSize: '0.8rem', color: '#2563EB', fontWeight: 600, textDecoration: 'none' }}>
                  Mở quản lý lô →
                </Link>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                <div style={{ padding: '0.85rem', borderRadius: 10, background: '#F9FAFB', border: '1px solid #E5E7EB' }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#374151', marginBottom: 6 }}>Lô Thành Phẩm ({data.lots.finishedGoods.total})</div>
                  <div style={{ fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span>Lô nháp: <strong>{data.lots.finishedGoods.draft}</strong></span>
                    <span style={{ color: '#B45309' }}>Đã gửi Quản lý kho: <strong>{data.lots.finishedGoods.requested}</strong></span>
                    <span style={{ color: '#047857' }}>Kho đã nhập: <strong>{data.lots.finishedGoods.received}</strong></span>
                  </div>
                </div>
                <div style={{ padding: '0.85rem', borderRadius: 10, background: '#F9FAFB', border: '1px solid #E5E7EB' }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#374151', marginBottom: 6 }}>Lô Nguyên Phụ Liệu ({data.lots.rawMaterials.total})</div>
                  <div style={{ fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span>Lô nháp: <strong>{data.lots.rawMaterials.draft}</strong></span>
                    <span style={{ color: '#B45309' }}>Đã gửi Quản lý kho: <strong>{data.lots.rawMaterials.requested}</strong></span>
                    <span style={{ color: '#047857' }}>Kho đã nhập: <strong>{data.lots.rawMaterials.received}</strong></span>
                  </div>
                </div>
              </div>

              <div style={{ padding: '0.85rem', borderRadius: 10, background: '#F8F4EE', border: '1px solid #E7DDD0', marginBottom: 10 }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#5C452B', marginBottom: 6 }}>
                  Đối soát kế hoạch nhập nguyên phụ liệu ({data.materialPlans.total} kế hoạch)
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', flexWrap: 'wrap', gap: 8 }}>
                  <span>Chờ kiểm tra: <strong style={{ color: '#2563EB' }}>{data.materialPlans.pendingVerification}</strong></span>
                  <span>Khớp kế hoạch: <strong style={{ color: '#047857' }}>{data.materialPlans.matched}</strong></span>
                  <span>Có sai lệch: <strong style={{ color: '#B91C1C' }}>{data.materialPlans.deviation}</strong></span>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', padding: '0.7rem 0.85rem', borderRadius: 10, background: '#F9FAFB', border: '1px solid #E5E7EB', flexWrap: 'wrap', gap: 8 }}>
                <span>Kiểm kê kho: <strong>{data.stocktake.completed}</strong> hoàn thành · <strong style={{ color: '#7C3AED' }}>{data.stocktake.pending}</strong> chờ đếm</span>
                <span>Vải thừa chờ kho duyệt: <strong style={{ color: '#B45309' }}>{data.remnant.waitingConfirmation}</strong></span>
              </div>
            </section>
          </div>

          {/* ================================================================= */}
          {/* PHẦN 5: SẢN PHẨM PHÁT SINH LỖI NHIỀU NHẤT & HOẠT ĐỘNG GẦN ĐÂY     */}
          {/* ================================================================= */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(360px, 1.35fr) minmax(300px, 1fr)', gap: '1.25rem' }}>
            <section style={cardStyle}>
              <h2 style={{ margin: '0 0 12px', fontSize: '1rem', fontWeight: 700, color: '#111827', display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertTriangle size={17} color="#DC2626" />
                Sản phẩm phát sinh lỗi nhiều nhất (Xưởng may)
              </h2>

              {data.sewingKcs.topDefectSkus.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#6B7280', fontSize: '0.86rem' }}>
                  Chưa có sản phẩm nào phát sinh lỗi trong giai đoạn này.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
                    <thead>
                      <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB', textAlign: 'left', color: '#4B5563' }}>
                        <th style={{ padding: '8px' }}>Sản phẩm / Mã biến thể</th>
                        <th style={{ padding: '8px', textAlign: 'right' }}>Lỗi / Tổng may</th>
                        <th style={{ padding: '8px', textAlign: 'right' }}>Tỷ lệ lỗi</th>
                        <th style={{ padding: '8px' }}>Nhóm lỗi chính &amp; Ghi chú</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.sewingKcs.topDefectSkus.map((sku) => {
                        const catMeta = DEFECT_CATEGORY_META[sku.topDefectCategory] || DEFECT_CATEGORY_META.OTHER;
                        const colorVi = translateColorVi(sku.color);
                        const variantInfo = [colorVi && `Màu ${colorVi}`, sku.size && `Cỡ ${sku.size}`]
                          .filter(Boolean)
                          .join(' · ');
                        return (
                          <tr key={sku.skuId} style={{ borderBottom: '1px solid #F3F4F6' }}>
                            <td style={{ padding: '8px' }}>
                              <div style={{ fontWeight: 700 }}>{translateProductNameVi(sku.productName)}</div>
                              <div style={{ fontSize: '0.75rem', color: '#6B7280' }}>
                                Mã: <strong>{sku.skuCode}</strong> {variantInfo ? `· ${variantInfo}` : ''}
                              </div>
                            </td>
                            <td style={{ padding: '8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                              <strong style={{ color: '#B91C1C' }}>{formatNum(sku.failedQty)}</strong> / {formatNum(sku.totalQty)}
                            </td>
                            <td style={{ padding: '8px', textAlign: 'right' }}>
                              <span style={{ padding: '2px 7px', borderRadius: 999, background: '#FEF2F2', color: '#B91C1C', fontWeight: 700, fontSize: '0.76rem' }}>
                                {sku.defectRate}%
                              </span>
                            </td>
                            <td style={{ padding: '8px' }}>
                              <div style={{ fontWeight: 600, color: catMeta.color, fontSize: '0.78rem' }}>{catMeta.label}</div>
                              {sku.latestDefectNote && (
                                <div style={{ fontSize: '0.75rem', color: '#4B5563' }}>{sku.latestDefectNote}</div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section style={cardStyle}>
              <h2 style={{ margin: '0 0 12px', fontSize: '1rem', fontWeight: 700, color: '#111827', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Activity size={17} color="#2563EB" />
                Hoạt động kiểm định &amp; Lô hàng gần đây
              </h2>

              {data.recentActivities.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#6B7280', fontSize: '0.86rem' }}>
                  Chưa có hoạt động nào trong khoảng thời gian đã chọn.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {data.recentActivities.map((act) => {
                    const badge = ACTIVITY_BADGE[act.status] || { label: act.status, bg: '#F3F4F6', color: '#374151' };
                    return (
                      <Link
                        key={`${act.type}-${act.id}`}
                        to={act.link}
                        style={{
                          textDecoration: 'none',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: 10,
                          padding: '8px 10px',
                          borderRadius: 9,
                          background: '#F9FAFB',
                          border: '1px solid #F3F4F6',
                        }}
                      >
                        <div>
                          <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.82rem', color: '#111827' }}>
                            {act.code}
                          </div>
                          <div style={{ fontSize: '0.78rem', color: '#4B5563' }}>{act.title}</div>
                          <div style={{ fontSize: '0.72rem', color: '#9CA3AF' }}>{formatDateTime(act.at)}</div>
                        </div>
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: 999,
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            background: badge.bg,
                            color: badge.color,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {badge.label}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}
