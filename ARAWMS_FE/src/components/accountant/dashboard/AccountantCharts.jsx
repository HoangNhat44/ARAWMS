import React, { useState, useMemo } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

export const formatVnd = (amount) =>
  `${Math.round(Number(amount || 0)).toLocaleString('vi-VN')} ₫`;

export const formatCompactVnd = (amount) => {
  const num = Number(amount || 0);
  const abs = Math.abs(num);
  if (abs >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(1)} tỷ`;
  if (abs >= 1_000_000) return `${(num / 1_000_000).toFixed(1)} tr`;
  if (abs >= 1_000) return `${Math.round(num / 1_000)}k`;
  return String(Math.round(num));
};

export const KpiDeltaBadge = ({ delta, invertColor = false }) => {
  if (!delta) return null;
  const pct = Number(delta.deltaPct || 0);
  const isZero = delta.deltaAmount === 0;

  let tone = 'neutral';
  if (!isZero) {
    const isUp = delta.deltaAmount > 0;
    const isGood = invertColor ? !isUp : isUp;
    tone = isGood ? 'positive' : 'negative';
  }

  return (
    <span className={`acc-delta-badge ${tone}`} title={`Kỳ trước: ${formatVnd(delta.previous)}`}>
      {isZero ? (
        <Minus size={12} />
      ) : delta.deltaAmount > 0 ? (
        <TrendingUp size={12} />
      ) : (
        <TrendingDown size={12} />
      )}
      {isZero ? '0%' : `${pct > 0 ? '+' : ''}${pct}%`}
      {delta.isNew && ' (Mới)'}
    </span>
  );
};

/**
 * 1. Biểu đồ cột ghép so sánh Dòng tiền Thu - Chi (Kỳ này vs Kỳ trước)
 */
export const CashFlowComparisonChart = ({ series = [], currentLabel, previousLabel }) => {
  const [mode, setMode] = useState('IN_COMPARE'); // IN_COMPARE | OUT_COMPARE | NET_CURRENT
  const [hoverIdx, setHoverIdx] = useState(null);

  const chartConfig = useMemo(() => {
    const count = Math.max(1, series.length);
    const width = Math.max(620, count * 38);
    const height = 250;
    const pad = { top: 20, right: 16, bottom: 38, left: 56 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;

    let maxVal = 0;
    series.forEach((d) => {
      if (mode === 'IN_COMPARE') {
        maxVal = Math.max(maxVal, d.currentIn || 0, d.previousIn || 0);
      } else if (mode === 'OUT_COMPARE') {
        maxVal = Math.max(maxVal, d.currentOut || 0, d.previousOut || 0);
      } else {
        maxVal = Math.max(maxVal, d.currentIn || 0, d.currentOut || 0);
      }
    });
    if (maxVal === 0) maxVal = 1000000;

    return { width, height, pad, plotW, plotH, maxVal };
  }, [series, mode]);

  const { width, height, pad, plotW, plotH, maxVal } = chartConfig;
  const stepX = plotW / Math.max(1, series.length);
  const barW = Math.min(14, Math.max(5, stepX * 0.28));

  const legendMeta =
    mode === 'IN_COMPARE'
      ? {
          aLabel: `Tiền thu (${currentLabel})`,
          aColor: '#0F766E',
          bLabel: `Tiền thu (${previousLabel})`,
          bColor: '#99F6E4',
        }
      : mode === 'OUT_COMPARE'
      ? {
          aLabel: `Tiền chi (${currentLabel})`,
          aColor: '#DC2626',
          bLabel: `Tiền chi (${previousLabel})`,
          bColor: '#FECACA',
        }
      : {
          aLabel: `Tiền thu (${currentLabel})`,
          aColor: '#0F766E',
          bLabel: `Tiền chi (${currentLabel})`,
          bColor: '#DC2626',
        };

  const labelInterval = series.length > 16 ? Math.ceil(series.length / 10) : 1;

  return (
    <div className="acc-chart-card">
      <div className="acc-chart-header">
        <div>
          <h3 className="acc-chart-title">So sánh Dòng tiền Thu – Chi giữa các kỳ</h3>
          <p className="acc-chart-subtitle">
            Đối chiếu biến động tiền mặt &amp; chuyển khoản theo từng mốc thời gian
          </p>
        </div>
        <div className="acc-chart-tabs">
          <button
            type="button"
            className={`acc-chart-tab ${mode === 'IN_COMPARE' ? 'active' : ''}`}
            onClick={() => setMode('IN_COMPARE')}
          >
            Thu: Kỳ này vs Cũ
          </button>
          <button
            type="button"
            className={`acc-chart-tab ${mode === 'OUT_COMPARE' ? 'active' : ''}`}
            onClick={() => setMode('OUT_COMPARE')}
          >
            Chi: Kỳ này vs Cũ
          </button>
          <button
            type="button"
            className={`acc-chart-tab ${mode === 'NET_CURRENT' ? 'active' : ''}`}
            onClick={() => setMode('NET_CURRENT')}
          >
            Thu &amp; Chi kỳ này
          </button>
        </div>
      </div>

      <div className="acc-chart-legend">
        <span className="acc-legend-item">
          <span className="acc-legend-swatch" style={{ background: legendMeta.aColor }} />
          {legendMeta.aLabel}
        </span>
        <span className="acc-legend-item">
          <span className="acc-legend-swatch" style={{ background: legendMeta.bColor }} />
          {legendMeta.bLabel}
        </span>
      </div>

      <div className="acc-svg-wrap" onMouseLeave={() => setHoverIdx(null)}>
        {hoverIdx !== null && series[hoverIdx] && (
          <div
            className="acc-chart-tooltip"
            style={{
              left: Math.min(width - 210, Math.max(8, pad.left + hoverIdx * stepX)),
              top: 6,
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 4 }}>{series[hoverIdx].label}</div>
            <div>
              {legendMeta.aLabel}:{' '}
              <strong>
                {formatVnd(
                  mode === 'OUT_COMPARE' ? series[hoverIdx].currentOut : series[hoverIdx].currentIn
                )}
              </strong>
            </div>
            <div>
              {legendMeta.bLabel}:{' '}
              <strong>
                {formatVnd(
                  mode === 'IN_COMPARE'
                    ? series[hoverIdx].previousIn
                    : mode === 'OUT_COMPARE'
                    ? series[hoverIdx].previousOut
                    : series[hoverIdx].currentOut
                )}
              </strong>
            </div>
          </div>
        )}

        <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ minWidth: 520, display: 'block' }}>
          {[0, 0.25, 0.5, 0.75, 1].map((t) => {
            const y = pad.top + plotH * (1 - t);
            return (
              <g key={t}>
                <line x1={pad.left} y1={y} x2={width - pad.right} y2={y} stroke="#E2E8F0" strokeDasharray="3 3" />
                <text x={pad.left - 8} y={y + 4} textAnchor="end" fontSize="11" fill="#64748B">
                  {formatCompactVnd(maxVal * t)}
                </text>
              </g>
            );
          })}

          {series.map((d, i) => {
            const cx = pad.left + i * stepX + stepX / 2;
            const valA = mode === 'OUT_COMPARE' ? d.currentOut : d.currentIn;
            const valB =
              mode === 'IN_COMPARE'
                ? d.previousIn
                : mode === 'OUT_COMPARE'
                ? d.previousOut
                : d.currentOut;

            const hA = (Math.max(0, valA) / maxVal) * plotH;
            const hB = (Math.max(0, valB) / maxVal) * plotH;

            return (
              <g
                key={d.label + i}
                onMouseEnter={() => setHoverIdx(i)}
                style={{ cursor: 'pointer' }}
              >
                <rect
                  x={cx - stepX / 2}
                  y={pad.top}
                  width={stepX}
                  height={plotH}
                  fill={hoverIdx === i ? 'rgba(148, 163, 184, 0.12)' : 'transparent'}
                />
                <rect
                  x={cx - barW - 1.5}
                  y={pad.top + plotH - hA}
                  width={barW}
                  height={Math.max(valA > 0 ? 2 : 0, hA)}
                  rx={2}
                  fill={legendMeta.aColor}
                />
                <rect
                  x={cx + 1.5}
                  y={pad.top + plotH - hB}
                  width={barW}
                  height={Math.max(valB > 0 ? 2 : 0, hB)}
                  rx={2}
                  fill={legendMeta.bColor}
                />
                {i % labelInterval === 0 && (
                  <text
                    x={cx}
                    y={height - 12}
                    textAnchor="middle"
                    fontSize="10.5"
                    fill="#64748B"
                  >
                    {d.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};

/**
 * 2. Biểu đồ đường so sánh Doanh thu, Giá vốn (COGS) & Lợi nhuận gộp qua các kỳ
 */
export const ProfitCogsTrendChart = ({ series = [], currentLabel, previousLabel }) => {
  const [metric, setMetric] = useState('REVENUE_VS_COGS'); // REVENUE_VS_COGS | GROSS_PROFIT_COMPARE
  const [hoverIdx, setHoverIdx] = useState(null);

  const width = Math.max(620, series.length * 36);
  const height = 250;
  const pad = { top: 20, right: 16, bottom: 38, left: 56 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const maxVal = useMemo(() => {
    let m = 0;
    series.forEach((d) => {
      if (metric === 'REVENUE_VS_COGS') {
        m = Math.max(m, d.currentRevenue || 0, d.currentCogs || 0, d.previousRevenue || 0);
      } else {
        m = Math.max(m, d.currentGrossProfit || 0, d.previousGrossProfit || 0);
      }
    });
    return m === 0 ? 1000000 : m;
  }, [series, metric]);

  const stepX = series.length > 1 ? plotW / (series.length - 1) : plotW / 2;
  const toPoint = (idx, val) => {
    const x = series.length > 1 ? pad.left + idx * stepX : pad.left + plotW / 2;
    const y = pad.top + plotH - (Math.max(0, val) / maxVal) * plotH;
    return `${x},${y}`;
  };

  const buildPolyline = (getter) => series.map((d, i) => toPoint(i, getter(d))).join(' ');
  const labelInterval = series.length > 16 ? Math.ceil(series.length / 10) : 1;

  return (
    <div className="acc-chart-card">
      <div className="acc-chart-header">
        <div>
          <h3 className="acc-chart-title">Xu hướng Doanh thu, Giá vốn (COGS) &amp; Lãi gộp</h3>
          <p className="acc-chart-subtitle">
            So sánh đường xu hướng kỳ này (nét liền) với kỳ trước (nét đứt)
          </p>
        </div>
        <div className="acc-chart-tabs">
          <button
            type="button"
            className={`acc-chart-tab ${metric === 'REVENUE_VS_COGS' ? 'active' : ''}`}
            onClick={() => setMetric('REVENUE_VS_COGS')}
          >
            Doanh thu &amp; COGS
          </button>
          <button
            type="button"
            className={`acc-chart-tab ${metric === 'GROSS_PROFIT_COMPARE' ? 'active' : ''}`}
            onClick={() => setMetric('GROSS_PROFIT_COMPARE')}
          >
            Lãi gộp 2 kỳ
          </button>
        </div>
      </div>

      <div className="acc-chart-legend">
        {metric === 'REVENUE_VS_COGS' ? (
          <>
            <span className="acc-legend-item">
              <span className="acc-legend-line" style={{ borderColor: '#0284C7' }} />
              Doanh thu ({currentLabel})
            </span>
            <span className="acc-legend-item">
              <span className="acc-legend-line" style={{ borderColor: '#D97706' }} />
              Giá vốn COGS ({currentLabel})
            </span>
            <span className="acc-legend-item">
              <span className="acc-legend-line dashed" style={{ borderColor: '#94A3B8' }} />
              Doanh thu ({previousLabel})
            </span>
          </>
        ) : (
          <>
            <span className="acc-legend-item">
              <span className="acc-legend-line" style={{ borderColor: '#16A34A' }} />
              Lãi gộp ({currentLabel})
            </span>
            <span className="acc-legend-item">
              <span className="acc-legend-line dashed" style={{ borderColor: '#94A3B8' }} />
              Lãi gộp ({previousLabel})
            </span>
          </>
        )}
      </div>

      <div className="acc-svg-wrap" onMouseLeave={() => setHoverIdx(null)}>
        {hoverIdx !== null && series[hoverIdx] && (
          <div
            className="acc-chart-tooltip"
            style={{
              left: Math.min(width - 230, Math.max(8, pad.left + hoverIdx * stepX - 40)),
              top: 6,
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 4 }}>{series[hoverIdx].label}</div>
            {metric === 'REVENUE_VS_COGS' ? (
              <>
                <div>Doanh thu kỳ này: <strong>{formatVnd(series[hoverIdx].currentRevenue)}</strong></div>
                <div>Giá vốn COGS: <strong>{formatVnd(series[hoverIdx].currentCogs)}</strong></div>
                <div>Doanh thu kỳ trước: <strong>{formatVnd(series[hoverIdx].previousRevenue)}</strong></div>
              </>
            ) : (
              <>
                <div>Lãi gộp kỳ này: <strong>{formatVnd(series[hoverIdx].currentGrossProfit)}</strong></div>
                <div>Lãi gộp kỳ trước: <strong>{formatVnd(series[hoverIdx].previousGrossProfit)}</strong></div>
              </>
            )}
          </div>
        )}

        <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ minWidth: 520, display: 'block' }}>
          {[0, 0.25, 0.5, 0.75, 1].map((t) => {
            const y = pad.top + plotH * (1 - t);
            return (
              <g key={t}>
                <line x1={pad.left} y1={y} x2={width - pad.right} y2={y} stroke="#E2E8F0" strokeDasharray="3 3" />
                <text x={pad.left - 8} y={y + 4} textAnchor="end" fontSize="11" fill="#64748B">
                  {formatCompactVnd(maxVal * t)}
                </text>
              </g>
            );
          })}

          {series.length > 0 && metric === 'REVENUE_VS_COGS' && (
            <>
              <polyline
                fill="none"
                stroke="#94A3B8"
                strokeWidth="2"
                strokeDasharray="5 4"
                points={buildPolyline((d) => d.previousRevenue)}
              />
              <polyline
                fill="none"
                stroke="#D97706"
                strokeWidth="2.4"
                points={buildPolyline((d) => d.currentCogs)}
              />
              <polyline
                fill="none"
                stroke="#0284C7"
                strokeWidth="2.6"
                points={buildPolyline((d) => d.currentRevenue)}
              />
            </>
          )}

          {series.length > 0 && metric === 'GROSS_PROFIT_COMPARE' && (
            <>
              <polyline
                fill="none"
                stroke="#94A3B8"
                strokeWidth="2"
                strokeDasharray="5 4"
                points={buildPolyline((d) => d.previousGrossProfit)}
              />
              <polyline
                fill="none"
                stroke="#16A34A"
                strokeWidth="2.6"
                points={buildPolyline((d) => d.currentGrossProfit)}
              />
            </>
          )}

          {series.map((d, i) => {
            const cx = series.length > 1 ? pad.left + i * stepX : pad.left + plotW / 2;
            const mainVal =
              metric === 'REVENUE_VS_COGS' ? d.currentRevenue : d.currentGrossProfit;
            const cy = pad.top + plotH - (Math.max(0, mainVal) / maxVal) * plotH;
            return (
              <g key={d.label + i} onMouseEnter={() => setHoverIdx(i)} style={{ cursor: 'pointer' }}>
                <rect
                  x={cx - Math.max(10, stepX / 2)}
                  y={pad.top}
                  width={Math.max(20, stepX)}
                  height={plotH}
                  fill="transparent"
                />
                {hoverIdx === i && (
                  <>
                    <line x1={cx} y1={pad.top} x2={cx} y2={pad.top + plotH} stroke="#CBD5E1" />
                    <circle
                      cx={cx}
                      cy={cy}
                      r={4.5}
                      fill={metric === 'REVENUE_VS_COGS' ? '#0284C7' : '#16A34A'}
                      stroke="#FFFFFF"
                      strokeWidth="2"
                    />
                  </>
                )}
                {i % labelInterval === 0 && (
                  <text x={cx} y={height - 12} textAnchor="middle" fontSize="10.5" fill="#64748B">
                    {d.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};

/**
 * 3. Biểu đồ Donut cơ cấu Giá trị Tài sản Tồn kho
 */
export const InventoryDonutChart = ({ items = [], totalValue = 0 }) => {
  const size = 180;
  const radius = 64;
  const strokeWidth = 24;
  const circumference = 2 * Math.PI * radius;

  const safeTotal = totalValue > 0 ? totalValue : 0;
  let accumulated = 0;

  return (
    <div className="acc-chart-card">
      <div className="acc-chart-header">
        <div>
          <h3 className="acc-chart-title">Cơ cấu Giá trị Tài sản Tồn kho</h3>
          <p className="acc-chart-subtitle">
            Phân bổ vốn giữa Nguyên phụ liệu &amp; Thành phẩm tại thời điểm hiện tại
          </p>
        </div>
      </div>

      <div className="acc-donut-layout">
        <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="#F1F5F9"
              strokeWidth={strokeWidth}
            />
            {safeTotal > 0 &&
              items.map((item) => {
                const val = Math.max(0, Number(item.value || 0));
                if (val === 0) return null;
                const ratio = val / safeTotal;
                const dashLength = ratio * circumference;
                const dashOffset = -accumulated * circumference;
                accumulated += ratio;
                return (
                  <circle
                    key={item.key}
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke={item.color}
                    strokeWidth={strokeWidth}
                    strokeDasharray={`${dashLength} ${circumference}`}
                    strokeDashoffset={dashOffset}
                    transform={`rotate(-90 ${size / 2} ${size / 2})`}
                  />
                );
              })}
          </svg>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              pointerEvents: 'none',
            }}
          >
            <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>TỔNG TỒN KHO</span>
            <span style={{ fontSize: '15px', color: '#0F172A', fontWeight: 800 }}>
              {formatCompactVnd(totalValue)}
            </span>
          </div>
        </div>

        <div className="acc-donut-legend-list">
          {items.map((item) => {
            const pct = safeTotal > 0 ? ((item.value / safeTotal) * 100).toFixed(1) : '0.0';
            return (
              <div key={item.key} className="acc-donut-legend-row">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="acc-legend-swatch" style={{ background: item.color }} />
                  <span style={{ color: '#334155', fontWeight: 500 }}>{item.label}</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <strong style={{ color: '#0F172A' }}>{formatVnd(item.value)}</strong>
                  <span style={{ marginLeft: 6, fontSize: 11.5, color: '#64748B' }}>({pct}%)</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

/**
 * 4. Biểu đồ so sánh Đối soát COD 2 kỳ & Công nợ Nhà cung cấp lớn nhất
 */
export const CodAndDebtComparisonCard = ({
  codComparison = {},
  topDebtSuppliers = [],
  currentLabel,
  previousLabel,
}) => {
  const renderCodBar = (title, data = {}) => {
    const matched = Number(data.matchedAmount || 0);
    const pending = Number(data.pendingAmount || 0);
    const redFlag = Number(data.redFlagAmount || 0);
    const total = matched + pending + redFlag;
    const pct = (v) => (total > 0 ? (v / total) * 100 : 0);

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
          <strong style={{ color: '#1E293B' }}>{title}</strong>
          <span style={{ color: '#64748B' }}>
            Tổng COD: <strong>{formatVnd(total)}</strong> ({(data.matchedCount || 0) + (data.pendingCount || 0) + (data.redFlagCount || 0)} đơn)
          </span>
        </div>
        <div className="acc-progress-track">
          <div style={{ width: `${pct(matched)}%`, background: '#16A34A' }} title={`Đã khớp: ${formatVnd(matched)}`} />
          <div style={{ width: `${pct(pending)}%`, background: '#F59E0B' }} title={`Chờ đối soát: ${formatVnd(pending)}`} />
          <div style={{ width: `${pct(redFlag)}%`, background: '#DC2626' }} title={`Cờ đỏ sai lệch: ${formatVnd(redFlag)}`} />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 11.5, color: '#475569' }}>
          <span>● Đã khớp: <strong style={{ color: '#15803D' }}>{formatVnd(matched)}</strong> ({data.matchedCount || 0})</span>
          <span>● Chờ đối soát: <strong style={{ color: '#B45309' }}>{formatVnd(pending)}</strong> ({data.pendingCount || 0})</span>
          <span>● Cờ đỏ: <strong style={{ color: '#B91C1C' }}>{formatVnd(redFlag)}</strong> ({data.redFlagCount || 0})</span>
        </div>
      </div>
    );
  };

  return (
    <div className="acc-chart-card">
      <div className="acc-chart-header">
        <div>
          <h3 className="acc-chart-title">Đối soát COD (2 kỳ) &amp; Top Dư nợ Nhà cung cấp</h3>
          <p className="acc-chart-subtitle">
            So sánh tỷ lệ khớp tiền COD vận chuyển và các khoản nợ NCC cần ưu tiên chi trả
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 12, borderBottom: '1px solid #F1F5F9' }}>
        {renderCodBar(`Kỳ hiện tại (${currentLabel})`, codComparison.current)}
        {renderCodBar(`Kỳ trước (${previousLabel})`, codComparison.previous)}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: '#334155', textTransform: 'uppercase' }}>
          Top Nhà cung cấp có dư nợ phải trả cao nhất
        </div>
        {topDebtSuppliers.length === 0 ? (
          <div style={{ fontSize: 13, color: '#64748B', padding: '8px 0' }}>
            Hiện không có công nợ nhà cung cấp tồn đọng.
          </div>
        ) : (
          topDebtSuppliers.map((sup) => {
            const paidPct =
              sup.totalContractValue > 0
                ? Math.min(100, (sup.totalPaid / sup.totalContractValue) * 100)
                : 0;
            return (
              <div key={sup.supplierId} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <strong style={{ color: '#0F172A' }}>{sup.supplierName}</strong>
                    {sup.isOverdue && (
                      <span className="acc-delta-badge negative">Quá hạn</span>
                    )}
                    {!sup.isOverdue && sup.isDueSoon && (
                      <span className="acc-delta-badge" style={{ background: '#FEF3C7', color: '#B45309' }}>
                        Sắp đến hạn
                      </span>
                    )}
                  </div>
                  <span style={{ fontWeight: 700, color: '#B91C1C' }}>
                    Còn nợ: {formatVnd(sup.remainingDebt)}
                  </span>
                </div>
                <div className="acc-progress-track" style={{ height: 7 }}>
                  <div style={{ width: `${paidPct}%`, background: '#0F766E' }} />
                  <div style={{ width: `${100 - paidPct}%`, background: '#FCA5A5' }} />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

