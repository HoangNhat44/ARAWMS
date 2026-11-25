/*
 * Nguyễn Ngọc Huy - HE171157
 * Ngày: 14-11-2026
 * Giao diện theo dõi đơn hàng, hàng hoàn và khách hàng mới của chủ cửa hàng.
 */
import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Package,
  Truck,
  CheckCircle2,
  AlertTriangle,
  BarChart3,
  Table as TableIcon,
  Filter,
  XCircle,
  RotateCcw,
} from 'lucide-react';
import { WmsField, WmsSelect } from '../../components/ui/WmsControls';
import { Columns, SeriesPlot } from './OwnerCharts';
import { datetime, Metric, money, quantity, ResourceState, Table } from './OwnerUI';

export const channelLabels = {
  FACEBOOK: 'Facebook', SHOPEE: 'Shopee', TIKTOK: 'TikTok', UNKNOWN: 'Chưa rõ nguồn bán',
};
const reasonLabels = {
  CUSTOMER_REFUSED: 'Khách không nhận hàng', INVALID_ORDER: 'Đơn hàng không hợp lệ',
  PRODUCT_DEFECT: 'Sản phẩm bị lỗi', OTHER: 'Lý do khác', UNKNOWN: 'Chưa rõ lý do',
};
const orderLabels = {
  PENDING: 'Chờ xác nhận',
  CONFIRMED_RESERVED: 'Đã giữ hàng',
  PICKING: 'Đang lấy hàng',
  PACKED: 'Đã đóng gói',
  HANDED_OVER_CARRIER: 'Đang giao hàng',
  CARRIER_PICKED_UP: 'Đã lấy hàng',
  DELIVERED: 'Đã giao thành công',
  COMPLETED: 'Hoàn thành',
  CANCELLED: 'Đã hủy',
  RETURN_REQUESTED: 'Đang xử lý hoàn hàng',
  EXCHANGE_REQUESTED: 'Đang xử lý đổi hàng',
  RETURNED: 'Đã hoàn về kho',
  RETURN_COMPLETED: 'Hoàn thành công',
  PARTIALLY_RETURNED: 'Hoàn một phần',
  RETURN_FAILED: 'Hoàn không thành công',
};
const stepLabels = {
  WAIT_INSPECTION: 'Chờ kiểm hàng', WAIT_RESTOCK: 'Chờ nhập lại kho',
  FAILED_INSPECTION: 'Hàng kiểm không đạt', RESTOCKED: 'Đã nhập lại kho',
};
const percentage = value => value === null ? 'Chưa có đơn giao vận chuyển' : `${quantity(value)}%`;
const rateSeries = [{ key: 'refusalRate', label: 'Tỷ lệ bom hàng' }, { key: 'turnbackRate', label: 'Tỷ lệ đổi / trả' }];

function ReturnTrendChart({ points, threshold }) {
  const periodsWithShipments = points.filter(point => point.shipped > 0);
  if (!periodsWithShipments.length) return <p>Chưa có đơn bàn giao vận chuyển trong khoảng ngày đã chọn.</p>;

  // Nếu chỉ có một mốc hoặc có khoảng trống rời nhau, cột đọc dễ hơn một
  // đường gồm toàn điểm rời. Giữ các mốc trống giữa những kỳ có dữ liệu.
  const hasAdjacentPeriods = points.some((point, index) => point.shipped > 0 && points[index + 1]?.shipped > 0);
  const first = points.indexOf(periodsWithShipments[0]);
  const last = points.indexOf(periodsWithShipments.at(-1));
  const rows = points.slice(first, last + 1);
  const chartKind = hasAdjacentPeriods ? 'line' : 'column';
  return <>
    <SeriesPlot rows={rows} kind={chartKind} title="Tỷ lệ theo thời gian bàn giao vận chuyển"
      categoryLabel="Kỳ bàn giao vận chuyển" unitLabel="phần trăm" valueSuffix="%" reference={threshold} series={rateSeries} />
    <details><summary>Xem tỷ lệ và số đơn theo thời gian</summary>
      <Table headings={['Kỳ bàn giao', 'Đã bàn giao', 'Đơn quay đầu', 'Tỷ lệ quay đầu', 'Tỷ lệ bom hàng']}>
        {points.map(row => <tr key={row.label}><td>{row.label}</td><td>{quantity(row.shipped)}</td>
          <td>{quantity(row.turnedBack)}</td><td>{percentage(row.turnbackRate)}</td><td>{percentage(row.refusalRate)}</td></tr>)}
      </Table>
    </details>
  </>;
}

function ReturnTrend({ points, threshold }) {
  return <section className="owner-content-panel">
    <h2>Xu hướng đơn quay đầu và bom hàng</h2>
    <ReturnTrendChart points={points} threshold={threshold} />
  </section>;
}

function BomOrderAnalytics({ bom = {}, threshold }) {
  const [channel, setChannel] = useState('');
  const [reasonKey, setReasonKey] = useState('');

  const details = bom.details || [];
  const reasons = bom.reasons || [];
  const count = bom.count || 0;
  const rateValue = bom.rate !== null && bom.rate !== undefined ? bom.rate : 0;
  const amount = bom.amount || 0;
  const isHighBomRate = threshold?.value && rateValue > threshold.value;

  const visible = details.filter(row =>
    (!channel || channel === row.channel) &&
    (!reasonKey || reasonKey === row.reasonKey)
  );

  return (
    <section id="owner-bom-analytics" className="owner-content-panel" style={{ marginTop: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            background: '#FEE2E2',
            color: '#DC2626',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <XCircle size={22} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#111827' }}>
              Phân tích đơn bom hàng (Giao không thành công)
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#6B7280' }}>
              Đơn đã xuất kho nhưng giao thất bại hoặc khách từ chối nhận trước khi giao thành công
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ background: isHighBomRate ? '#FEF2F2' : '#F9FAFB', border: `1px solid ${isHighBomRate ? '#FECACA' : '#E5E7EB'}`, padding: '8px 14px', borderRadius: '8px', textAlign: 'center' }}>
            <span style={{ fontSize: '11px', color: '#6B7280', display: 'block' }}>Tỷ lệ bom hàng</span>
            <strong style={{ fontSize: '16px', color: isHighBomRate ? '#DC2626' : '#111827' }}>
              {rateValue ? `${rateValue.toFixed(1)}%` : '0%'}
            </strong>
            {isHighBomRate && <small style={{ display: 'block', fontSize: '11px', color: '#DC2626', fontWeight: 600 }}>Vượt ngưỡng ({threshold.value}%)</small>}
          </div>
          <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', padding: '8px 14px', borderRadius: '8px', textAlign: 'center' }}>
            <span style={{ fontSize: '11px', color: '#6B7280', display: 'block' }}>Số đơn bom</span>
            <strong style={{ fontSize: '16px', color: '#111827' }}>{quantity(count)} đơn</strong>
          </div>
          <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', padding: '8px 14px', borderRadius: '8px', textAlign: 'center' }}>
            <span style={{ fontSize: '11px', color: '#6B7280', display: 'block' }}>Tổng thiệt hại</span>
            <strong style={{ fontSize: '16px', color: '#DC2626' }}>{money(amount)}</strong>
          </div>
        </div>
      </div>

      {/* Bộ lọc */}
      <div className="owner-filters" style={{ marginBottom: '16px' }}>
        <WmsField>
          Nguồn bán
          <WmsSelect value={channel} onChange={e => setChannel(e.target.value)}>
            <option value="">Tất cả nguồn bán</option>
            {Object.entries(channelLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </WmsSelect>
        </WmsField>
        <WmsField>
          Nguyên nhân bom hàng
          <WmsSelect value={reasonKey} onChange={e => setReasonKey(e.target.value)}>
            <option value="">Tất cả nguyên nhân ({reasons.length})</option>
            {reasons.map(r => <option key={r.key} value={r.key}>{r.label} ({quantity(r.count)})</option>)}
          </WmsSelect>
        </WmsField>
      </div>

      {/* Biểu đồ cơ cấu nguyên nhân bom hàng */}
      {reasons.length > 0 ? (
        <Columns
          title="Tỷ lệ lý do bom hàng (Giao không thành công)"
          defaultKind="horizontal"
          unitLabel="đơn hàng"
          allowDonut
          rows={reasons.map(r => ({
            label: r.label,
            value: r.count,
          }))}
        />
      ) : (
        <p style={{ color: '#6B7280', fontStyle: 'italic', padding: '16px 0' }}>Chưa ghi nhận đơn bom hàng nào trong kỳ.</p>
      )}

      {/* Danh sách đơn bom */}
      <details style={{ marginTop: '16px' }} open={Boolean(visible.length > 0 && visible.length <= 10)}>
        <summary style={{ cursor: 'pointer', fontWeight: 600, color: '#374151' }}>
          Xem danh sách chi tiết đơn bom hàng ({quantity(visible.length)} đơn)
        </summary>
        <div style={{ marginTop: '12px' }}>
          <Table
            headings={['Mã đơn hàng', 'Nguồn bán', 'Ngày bàn giao', 'Trạng thái GHN', 'Lý do bom hàng', 'Trị giá đơn hàng']}
            empty={!visible.length}
            paginated={visible.length > 15}
          >
            {visible.map(row => (
              <tr key={row.code}>
                <td><strong>{row.code}</strong></td>
                <td>{channelLabels[row.channel] || row.channel}</td>
                <td>{datetime(row.shippedAt)}</td>
                <td>
                  <span style={{ fontSize: '12px', padding: '2px 8px', borderRadius: '4px', background: '#FEE2E2', color: '#991B1B' }}>
                    {row.ghnStatus || 'Đang hoàn'}
                  </span>
                </td>
                <td>
                  <span style={{ color: '#DC2626', fontWeight: 500 }}>{row.reasonLabel}</span>
                  {row.detailNote && <small style={{ display: 'block', color: '#6B7280' }}>{row.detailNote}</small>}
                </td>
                <td><strong style={{ color: '#DC2626' }}>{money(row.amount)}</strong></td>
              </tr>
            ))}
          </Table>
        </div>
      </details>
    </section>
  );
}

function CustomerReturnAnalytics({ returns = {} }) {
  const [channel, setChannel] = useState('');
  const [returnType, setReturnType] = useState('');
  const [reasonKey, setReasonKey] = useState('');

  const details = returns.details || [];
  const reasons = returns.reasons || [];
  const count = returns.count || 0;
  const rateValue = returns.rate !== null && returns.rate !== undefined ? returns.rate : 0;
  const amount = returns.amount || 0;
  const exchangeCount = returns.exchangeCount || 0;
  const refundCount = returns.refundCount || 0;

  const visible = details.filter(row =>
    (!channel || channel === row.channel) &&
    (!returnType || returnType === row.returnType) &&
    (!reasonKey || reasonKey === row.reasonKey)
  );

  return (
    <section id="owner-return-analytics" className="owner-content-panel" style={{ marginTop: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            background: '#FEF3C7',
            color: '#D97706',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <RotateCcw size={22} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#111827' }}>
              Phân tích đơn đổi / trả hàng
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#6B7280' }}>
              Khách hàng phát sinh yêu cầu đổi sản phẩm mới hoặc trả hàng hoàn tiền sau khi mua
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ background: '#FFFDF7', border: '1px solid #FDE68A', padding: '8px 14px', borderRadius: '8px', textAlign: 'center' }}>
            <span style={{ fontSize: '11px', color: '#6B7280', display: 'block' }}>Tỷ lệ đổi / trả</span>
            <strong style={{ fontSize: '16px', color: '#D97706' }}>
              {rateValue ? `${rateValue.toFixed(1)}%` : '0%'}
            </strong>
          </div>
          <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', padding: '8px 14px', borderRadius: '8px', textAlign: 'center' }}>
            <span style={{ fontSize: '11px', color: '#6B7280', display: 'block' }}>Đổi sản phẩm</span>
            <strong style={{ fontSize: '16px', color: '#2563EB' }}>{quantity(exchangeCount)} đơn</strong>
          </div>
          <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', padding: '8px 14px', borderRadius: '8px', textAlign: 'center' }}>
            <span style={{ fontSize: '11px', color: '#6B7280', display: 'block' }}>Trả hàng hoàn tiền</span>
            <strong style={{ fontSize: '16px', color: '#4B5563' }}>{quantity(refundCount)} đơn</strong>
          </div>
          <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', padding: '8px 14px', borderRadius: '8px', textAlign: 'center' }}>
            <span style={{ fontSize: '11px', color: '#6B7280', display: 'block' }}>Tổng trị giá đổi trả</span>
            <strong style={{ fontSize: '16px', color: '#D97706' }}>{money(amount)}</strong>
          </div>
        </div>
      </div>

      {/* Bộ lọc */}
      <div className="owner-filters" style={{ marginBottom: '16px' }}>
        <WmsField>
          Nguồn bán
          <WmsSelect value={channel} onChange={e => setChannel(e.target.value)}>
            <option value="">Tất cả nguồn bán</option>
            {Object.entries(channelLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </WmsSelect>
        </WmsField>
        <WmsField>
          Loại yêu cầu
          <WmsSelect value={returnType} onChange={e => setReturnType(e.target.value)}>
            <option value="">Tất cả (Đổi &amp; Trả)</option>
            <option value="EXCHANGE_PRODUCT">Đổi sản phẩm mới</option>
            <option value="RETURN_FOR_REFUND">Trả hàng hoàn tiền</option>
          </WmsSelect>
        </WmsField>
        <WmsField>
          Lý do đổi / trả
          <WmsSelect value={reasonKey} onChange={e => setReasonKey(e.target.value)}>
            <option value="">Tất cả lý do ({reasons.length})</option>
            {reasons.map(r => <option key={r.key} value={r.key}>{r.label} ({quantity(r.count)})</option>)}
          </WmsSelect>
        </WmsField>
      </div>

      {/* Biểu đồ cơ cấu nguyên nhân đổi / trả hàng */}
      {reasons.length > 0 ? (
        <Columns
          title="Tỷ lệ lý do đổi / trả hàng"
          defaultKind="horizontal"
          unitLabel="đơn hàng"
          allowDonut
          rows={reasons.map(r => ({
            label: r.label,
            value: r.count,
          }))}
        />
      ) : (
        <p style={{ color: '#6B7280', fontStyle: 'italic', padding: '16px 0' }}>Chưa ghi nhận yêu cầu đổi/trả hàng nào trong kỳ.</p>
      )}

      {/* Danh sách đơn đổi trả */}
      <details style={{ marginTop: '16px' }} open={Boolean(visible.length > 0 && visible.length <= 10)}>
        <summary style={{ cursor: 'pointer', fontWeight: 600, color: '#374151' }}>
          Xem danh sách chi tiết đơn đổi / trả hàng ({quantity(visible.length)} đơn)
        </summary>
        <div style={{ marginTop: '12px' }}>
          <Table
            headings={['Mã đơn hàng', 'Mã RMA', 'Loại yêu cầu', 'Nguồn bán', 'Ngày tạo RMA', 'Lý do đổi/trả', 'Trạng thái', 'Trị giá hoàn/đổi']}
            empty={!visible.length}
            paginated={visible.length > 15}
          >
            {visible.map(row => (
              <tr key={row.code + (row.rmaCode || '')}>
                <td><strong>{row.code}</strong></td>
                <td><span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{row.rmaCode || '—'}</span></td>
                <td>
                  <span style={{
                    fontSize: '12px',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    background: row.returnType === 'EXCHANGE_PRODUCT' ? '#DBEAFE' : '#FEF3C7',
                    color: row.returnType === 'EXCHANGE_PRODUCT' ? '#1E40AF' : '#92400E',
                    fontWeight: 500,
                  }}>
                    {row.returnTypeLabel}
                  </span>
                </td>
                <td>{channelLabels[row.channel] || row.channel}</td>
                <td>{datetime(row.createdAt)}</td>
                <td>
                  <span style={{ color: '#111827', fontWeight: 500 }}>{row.reasonLabel}</span>
                  {row.reasonDescription && <small style={{ display: 'block', color: '#6B7280' }}>{row.reasonDescription}</small>}
                </td>
                <td>
                  <span style={{ fontSize: '12px', color: '#4B5563' }}>{row.status}</span>
                </td>
                <td><strong style={{ color: '#D97706' }}>{money(row.amount)}</strong></td>
              </tr>
            ))}
          </Table>
        </div>
      </details>
    </section>
  );
}

function ReturnWorklist({ rows, initialOverdueOnly }) {
  const [overdueOnly, setOverdueOnly] = useState(initialOverdueOnly);
  const visible = overdueOnly ? rows.filter(row => row.overdue) : rows;
  // Hai chuỗi loại trừ nhau và cộng lại bằng số đơn trong từng công đoạn.
  const steps = Object.entries(stepLabels).map(([key, label]) => ({
    label,
    other: visible.filter(row => row.step === key && !row.overdue).length,
    overdue: visible.filter(row => row.step === key && row.overdue).length,
  }));
  return <section id="owner-return-processing" tabIndex={-1} className="owner-content-panel owner-notification-target">
    <h2>Xử lý hàng hoàn</h2>
    <p>{quantity(rows.filter(row => row.overdue).length)} đơn đang quá hạn xử lý.</p>
    <label><input type="checkbox" checked={overdueOnly} onChange={event => setOverdueOnly(event.target.checked)} /> Chỉ xem đơn quá hạn</label>
    {visible.length > 0 && <SeriesPlot title="Số đơn theo công đoạn xử lý hàng hoàn" rows={steps}
      categoryLabel="Công đoạn hiện tại" unitLabel="đơn hàng"
      series={[{ key: 'other', label: 'Các đơn còn lại' }, { key: 'overdue', label: 'Quá hạn xử lý' }]} />}
    <details open={overdueOnly || undefined}><summary>Xem danh sách hàng hoàn</summary>
      <Table headings={['Mã đơn hàng', 'Nguồn bán', 'Ghi nhận nhận lại', 'Công đoạn', 'Hạn xử lý', 'Phiếu nhập kho']} empty={!visible.length}>
        {visible.map(row => <tr key={row.id}><td>{row.code}</td><td>{channelLabels[row.channel]}</td><td>{datetime(row.receivedAt)}{row.carriedOver && ' · Tồn từ kỳ trước'}</td>
          <td>{stepLabels[row.step]}{row.overdue && <strong className="owner-error"> · Quá hạn</strong>}</td>
          <td>{datetime(row.deadline)}</td><td>{row.ticket || '—'}</td></tr>)}
      </Table>
    </details>
  </section>;
}

const PIPELINE_STAGES = [
  {
    key: 'WAREHOUSE',
    label: '1. Xử lý tại kho',
    shortLabel: 'Tại kho',
    icon: Package,
    color: '#D97706',
    bg: '#FFFDF7',
    border: '#FDE68A',
    badgeBg: '#FEF3C7',
    badgeColor: '#92400E',
    dotColor: '#F59E0B',
    description: 'Chờ xác nhận, giữ tồn, nhặt & đóng hàng',
    statuses: ['PENDING', 'CONFIRMED_RESERVED', 'PICKING', 'PACKED'],
  },
  {
    key: 'SHIPPING',
    label: '2. Đang giao hàng (GHN)',
    shortLabel: 'Đang giao',
    icon: Truck,
    color: '#2563EB',
    bg: '#F8FAFF',
    border: '#BFDBFE',
    badgeBg: '#DBEAFE',
    badgeColor: '#1E40AF',
    dotColor: '#3B82F6',
    description: 'Bàn giao vận chuyển & trung chuyển giao hàng',
    statuses: ['HANDED_OVER_CARRIER', 'CARRIER_PICKED_UP'],
  },
  {
    key: 'SUCCESS',
    label: '3. Giao thành công',
    shortLabel: 'Thành công',
    icon: CheckCircle2,
    color: '#059669',
    bg: '#F6FEFA',
    border: '#A7F3D0',
    badgeBg: '#D1FAE5',
    badgeColor: '#065F46',
    dotColor: '#10B981',
    description: 'Khách nhận thành công / hoàn tất tại quầy',
    statuses: ['DELIVERED', 'COMPLETED'],
  },
  {
    key: 'RETURNS_RISK',
    label: '4. Đổi trả & Đơn hủy',
    shortLabel: 'Đổi trả / Hủy',
    icon: AlertTriangle,
    color: '#DC2626',
    bg: '#FFF8F8',
    border: '#FECACA',
    badgeBg: '#FEE2E2',
    badgeColor: '#991B1B',
    dotColor: '#EF4444',
    description: 'Khách hủy, yêu cầu đổi/trả & hoàn về kho',
    statuses: [
      'CANCELLED',
      'RETURN_REQUESTED',
      'EXCHANGE_REQUESTED',
      'RETURNED',
      'RETURN_COMPLETED',
      'PARTIALLY_RETURNED',
      'RETURN_FAILED',
    ],
  },
];

const STATUS_TO_STAGE = {};
PIPELINE_STAGES.forEach(stage => {
  stage.statuses.forEach(status => {
    STATUS_TO_STAGE[status] = stage;
  });
});

function OrderStatusPipeline({ orderStatuses = [] }) {
  const [selectedStage, setSelectedStage] = useState('ALL');
  const [onlyWithOrders, setOnlyWithOrders] = useState(true);
  const [viewMode, setViewMode] = useState('table'); // 'table' | 'chart'
  const [chartMetric, setChartMetric] = useState('count'); // 'count' | 'amount'

  // Tổng toàn kỳ
  const totalOrders = useMemo(
    () => orderStatuses.reduce((acc, row) => acc + (row.count || 0), 0),
    [orderStatuses]
  );
  const totalAmount = useMemo(
    () => orderStatuses.reduce((acc, row) => acc + (row.totalAmount || 0), 0),
    [orderStatuses]
  );

  // Thống kê theo từng khâu (Pipeline Stages)
  const stageStats = useMemo(() => {
    return PIPELINE_STAGES.map(stage => {
      const stageItems = orderStatuses.filter(s => stage.statuses.includes(s.status));
      const count = stageItems.reduce((sum, item) => sum + (item.count || 0), 0);
      const amount = stageItems.reduce((sum, item) => sum + (item.totalAmount || 0), 0);
      const activeItems = stageItems.filter(item => item.count > 0);
      const percentage = totalOrders > 0 ? (count / totalOrders) * 100 : 0;
      return {
        ...stage,
        count,
        amount,
        percentage,
        activeItems,
      };
    });
  }, [orderStatuses, totalOrders]);

  // Lọc danh sách dòng hiển thị
  const filteredRows = useMemo(() => {
    let rows = orderStatuses;
    if (selectedStage !== 'ALL') {
      const stageDef = PIPELINE_STAGES.find(s => s.key === selectedStage);
      if (stageDef) {
        rows = rows.filter(r => stageDef.statuses.includes(r.status));
      }
    }
    if (onlyWithOrders) {
      rows = rows.filter(r => r.count > 0);
    }
    return rows;
  }, [orderStatuses, selectedStage, onlyWithOrders]);

  const filteredOrdersTotal = useMemo(
    () => filteredRows.reduce((acc, r) => acc + (r.count || 0), 0),
    [filteredRows]
  );
  const filteredAmountTotal = useMemo(
    () => filteredRows.reduce((acc, r) => acc + (r.totalAmount || 0), 0),
    [filteredRows]
  );

  // Chuẩn bị dữ liệu cho biểu đồ
  const chartRows = useMemo(() => {
    const sourceRows = onlyWithOrders ? orderStatuses.filter(r => r.count > 0) : orderStatuses;
    return sourceRows.map(r => ({
      label: orderLabels[r.status] || r.status,
      value: chartMetric === 'amount' ? (r.totalAmount || 0) : (r.count || 0),
    }));
  }, [orderStatuses, onlyWithOrders, chartMetric]);

  return (
    <section id="owner-order-status" className="owner-content-panel" style={{ marginTop: '24px' }}>
      {/* Tiêu đề mục & Tổng quan nhanh */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px', marginBottom: '20px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#111827' }}>
            Trạng thái hiện tại của đơn hàng tạo trong kỳ
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#6B7280' }}>
            Theo dõi luồng xử lý đơn hàng theo 4 khâu vận hành thực tế kèm số lượng và dòng tiền (VNĐ)
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#F3F4F6', padding: '6px 14px', borderRadius: '8px' }}>
          <span style={{ fontSize: '13px', color: '#4B5563' }}>Tổng đơn trong kỳ:</span>
          <strong style={{ fontSize: '15px', color: '#111827', fontVariantNumeric: 'tabular-nums' }}>
            {quantity(totalOrders)} đơn
          </strong>
          <span style={{ color: '#D1D5DB' }}>|</span>
          <span style={{ fontSize: '13px', color: '#4B5563' }}>Tổng trị giá:</span>
          <strong style={{ fontSize: '15px', color: '#059669', fontVariantNumeric: 'tabular-nums' }}>
            {money(totalAmount)}
          </strong>
        </div>
      </div>

      {/* 4 Thẻ Funnel Pipeline */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        {stageStats.map(stage => {
          const IconComponent = stage.icon;
          const isSelected = selectedStage === stage.key;
          return (
            <div
              key={stage.key}
              onClick={() => setSelectedStage(prev => prev === stage.key ? 'ALL' : stage.key)}
              role="button"
              tabIndex={0}
              title={`Nhấp để ${isSelected ? 'bỏ lọc' : 'lọc'} danh sách theo ${stage.label}`}
              style={{
                background: stage.bg,
                border: `1.5px solid ${isSelected ? stage.color : stage.border}`,
                borderRadius: '12px',
                padding: '16px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: isSelected
                  ? `0 0 0 2px ${stage.color}33, 0 4px 6px -1px rgba(0, 0, 0, 0.1)`
                  : '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      background: stage.badgeBg,
                      color: stage.badgeColor,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <IconComponent size={18} />
                    </div>
                    <div>
                      <strong style={{ fontSize: '14px', color: '#111827', display: 'block' }}>
                        {stage.label}
                      </strong>
                    </div>
                  </div>
                  <span style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: '10px',
                    background: stage.badgeBg,
                    color: stage.badgeColor,
                  }}>
                    {stage.percentage.toFixed(1)}%
                  </span>
                </div>
                <p style={{ margin: '0 0 12px', fontSize: '12px', color: '#6B7280', lineHeight: 1.4 }}>
                  {stage.description}
                </p>
              </div>

              <div>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '24px', fontWeight: 700, color: '#111827', fontVariantNumeric: 'tabular-nums' }}>
                    {quantity(stage.count)} <small style={{ fontSize: '13px', fontWeight: 500, color: '#6B7280' }}>đơn</small>
                  </span>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: stage.color, fontVariantNumeric: 'tabular-nums' }}>
                    {money(stage.amount)}
                  </span>
                </div>

                {/* Danh sách trạng thái đang có đơn */}
                <div style={{ minHeight: '26px', marginTop: '8px', paddingTop: '8px', borderTop: `1px dashed ${stage.border}` }}>
                  {stage.activeItems.length > 0 ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {stage.activeItems.map(item => (
                        <span
                          key={item.status}
                          style={{
                            fontSize: '11px',
                            background: '#FFFFFF',
                            border: `1px solid ${stage.border}`,
                            borderRadius: '4px',
                            padding: '1px 6px',
                            color: '#374151',
                          }}
                        >
                          {orderLabels[item.status] || item.status}: <strong>{quantity(item.count)}</strong>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span style={{ fontSize: '11px', color: '#9CA3AF', fontStyle: 'italic' }}>
                      Chưa có đơn phát sinh trong khâu này
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Thanh điều khiển, Bộ lọc & Công tắc xem */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        background: '#FAFBFB',
        padding: '12px 16px',
        borderRadius: '8px',
        border: '1px solid #E5E7EB',
        marginBottom: '16px',
      }}>
        {/* Bộ lọc khâu */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#4B5563', marginRight: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Filter size={14} /> Khâu:
          </span>
          <button
            type="button"
            onClick={() => setSelectedStage('ALL')}
            style={{
              fontSize: '12px',
              padding: '4px 10px',
              borderRadius: '6px',
              border: selectedStage === 'ALL' ? '1px solid #315d48' : '1px solid #D1D5DB',
              background: selectedStage === 'ALL' ? '#315d48' : '#FFFFFF',
              color: selectedStage === 'ALL' ? '#FFFFFF' : '#374151',
              cursor: 'pointer',
              fontWeight: selectedStage === 'ALL' ? 600 : 400,
            }}
          >
            Tất cả ({quantity(totalOrders)})
          </button>
          {stageStats.map(stage => {
            const isSelected = selectedStage === stage.key;
            return (
              <button
                key={stage.key}
                type="button"
                onClick={() => setSelectedStage(stage.key)}
                style={{
                  fontSize: '12px',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  border: isSelected ? `1px solid ${stage.color}` : '1px solid #D1D5DB',
                  background: isSelected ? stage.badgeBg : '#FFFFFF',
                  color: isSelected ? stage.badgeColor : '#374151',
                  cursor: 'pointer',
                  fontWeight: isSelected ? 600 : 400,
                }}
              >
                {stage.shortLabel} ({quantity(stage.count)})
              </button>
            );
          })}
        </div>

        {/* Công tắc lọc 0 đơn & Chuyển chế độ xem */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#374151', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={onlyWithOrders}
              onChange={e => setOnlyWithOrders(e.target.checked)}
              style={{ cursor: 'pointer', accentColor: '#315d48' }}
            />
            Chỉ hiện trạng thái có đơn phát sinh (&gt; 0)
          </label>

          <div style={{ display: 'flex', border: '1px solid #D1D5DB', borderRadius: '6px', overflow: 'hidden' }}>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 10px',
                border: 'none',
                background: viewMode === 'table' ? '#E5E7EB' : '#FFFFFF',
                color: '#111827',
                fontSize: '12px',
                fontWeight: viewMode === 'table' ? 600 : 400,
                cursor: 'pointer',
              }}
            >
              <TableIcon size={14} /> Bảng chi tiết
            </button>
            <button
              type="button"
              onClick={() => setViewMode('chart')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 10px',
                border: 'none',
                borderLeft: '1px solid #D1D5DB',
                background: viewMode === 'chart' ? '#E5E7EB' : '#FFFFFF',
                color: '#111827',
                fontSize: '12px',
                fontWeight: viewMode === 'chart' ? 600 : 400,
                cursor: 'pointer',
              }}
            >
              <BarChart3 size={14} /> Biểu đồ
            </button>
          </div>
        </div>
      </div>

      {/* Hiển thị nội dung: Bảng hoặc Biểu đồ */}
      {viewMode === 'chart' ? (
        <Columns
          title="Biểu đồ phân tích trạng thái đơn hàng trong kỳ"
          defaultKind="horizontal"
          unitLabel={chartMetric === 'amount' ? 'đồng' : 'đơn hàng'}
          currency={chartMetric === 'amount'}
          controls={
            <WmsField>
              Chỉ số hiển thị
              <WmsSelect value={chartMetric} onChange={e => setChartMetric(e.target.value)}>
                <option value="count">Số lượng đơn hàng</option>
                <option value="amount">Giá trị tiền hàng (VNĐ)</option>
              </WmsSelect>
            </WmsField>
          }
          rows={chartRows}
        />
      ) : (
        <>
          {filteredRows.length === 0 ? (
            <div style={{ padding: '36px', textAlign: 'center', background: '#F9FAFB', borderRadius: '8px', border: '1px dashed #D1D5DB' }}>
              <p style={{ margin: 0, fontSize: '14px', color: '#6B7280' }}>
                Không có đơn hàng nào thuộc tiêu chí lọc này.
              </p>
              {onlyWithOrders && (
                <button
                  type="button"
                  onClick={() => setOnlyWithOrders(false)}
                  style={{
                    marginTop: '8px',
                    fontSize: '13px',
                    color: '#2563EB',
                    background: 'none',
                    border: 'none',
                    textDecoration: 'underline',
                    cursor: 'pointer',
                  }}
                >
                  Hiển thị tất cả 15 trạng thái (kể cả trạng thái 0 đơn)
                </button>
              )}
            </div>
          ) : (
            <Table
              headings={[
                'Khâu vận hành',
                'Trạng thái đơn hàng',
                'Số lượng đơn',
                'Tỷ trọng',
                'Tổng giá trị tiền hàng',
              ]}
              paginated={false}
            >
              {filteredRows.map(row => {
                const stage = STATUS_TO_STAGE[row.status] || PIPELINE_STAGES[0];
                const pct = totalOrders > 0 ? ((row.count || 0) / totalOrders) * 100 : 0;
                return (
                  <tr key={row.status}>
                    <td>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '12px',
                          fontWeight: 500,
                          padding: '2px 8px',
                          borderRadius: '6px',
                          background: stage.badgeBg,
                          color: stage.badgeColor,
                        }}
                      >
                        <span
                          style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            background: stage.dotColor,
                          }}
                        />
                        {stage.shortLabel}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontWeight: row.count > 0 ? 600 : 400, color: row.count > 0 ? '#111827' : '#6B7280' }}>
                        {orderLabels[row.status] || row.status}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontWeight: row.count > 0 ? 700 : 400, color: row.count > 0 ? '#111827' : '#9CA3AF' }}>
                        {quantity(row.count)}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-end' }}>
                        <div style={{ width: '60px', height: '6px', background: '#E5E7EB', borderRadius: '3px', overflow: 'hidden' }}>
                          <div
                            style={{
                              width: `${Math.min(100, pct)}%`,
                              height: '100%',
                              background: stage.dotColor,
                              borderRadius: '3px',
                            }}
                          />
                        </div>
                        <span style={{ fontSize: '12px', color: '#4B5563', width: '42px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          {pct.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                    <td>
                      <span
                        style={{
                          fontWeight: (row.totalAmount || 0) > 0 ? 600 : 400,
                          color: (row.totalAmount || 0) > 0 ? '#059669' : '#9CA3AF',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {money(row.totalAmount || 0)}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {/* Dòng tổng cộng */}
              <tr style={{ background: '#FAFBFB', fontWeight: 700 }}>
                <td>
                  <strong>Tổng cộng</strong>
                </td>
                <td>
                  <em style={{ fontSize: '12px', color: '#6B7280', fontWeight: 400 }}>
                    ({filteredRows.length} trạng thái đang hiển thị)
                  </em>
                </td>
                <td>
                  <strong style={{ color: '#111827' }}>{quantity(filteredOrdersTotal)}</strong>
                </td>
                <td>
                  <div style={{ textAlign: 'right', fontSize: '12px', color: '#111827' }}>
                    {totalOrders > 0 ? ((filteredOrdersTotal / totalOrders) * 100).toFixed(1) : '0.0'}%
                  </div>
                </td>
                <td>
                  <strong style={{ color: '#059669' }}>{money(filteredAmountTotal)}</strong>
                </td>
              </tr>
            </Table>
          )}
        </>
      )}
    </section>
  );
}

export default function BusinessActivity({ resource, salesChannel }) {
  const location = useLocation();
  const data = resource.data;
  const section = location.hash.slice(1);
  // Khi đến từ chuông, đợi dữ liệu dựng xong rồi đưa cuộn và tiêu điểm đến đúng phần.
  useEffect(() => {
    if (!data || !['owner-delivery-performance', 'owner-return-processing'].includes(section)) return;
    const frame = requestAnimationFrame(() => {
      const target = document.getElementById(section);
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ block: 'start' });
    });
    return () => cancelAnimationFrame(frame);
  }, [data, section, location.key]);
  const activity = data?.activity;
  const previousChannels = new Map(data?.previous?.channels.map(row => [row.channel, row]) || []);
  const channels = (activity?.channels || []).filter(row => !salesChannel || row.channel === salesChannel);
  const channelRows = channels.map(row => ({
    ...row, label: channelLabels[row.channel], previousCustomers: previousChannels.get(row.channel)?.newCustomers,
  }));
  const threshold = data && { value: data.policy.alertRate, label: `Ngưỡng cảnh báo ${data.policy.alertRate}%` };
  return <ResourceState resource={resource}>{activity && <>
    <section id="owner-delivery-performance" tabIndex={-1} className="owner-content-panel owner-notification-target">
      <h2>Giao hàng và khách mới</h2>
      <div className="owner-metrics">
        <Metric label="Đơn bàn giao vận chuyển" value={quantity(activity.shipped)} />
        <Metric label={`Đơn bom hàng (${quantity(activity.bom?.count ?? activity.refused)} đơn)`} value={percentage(activity.bom?.rate ?? activity.refusalRate)} note={activity.bom?.amount ? `Thiệt hại: ${money(activity.bom.amount)}` : undefined} />
        <Metric label={`Đơn đổi / trả (${quantity(activity.returns?.count ?? Math.max(0, activity.turnedBack - activity.refused))} đơn)`} value={percentage(activity.returns?.rate ?? (activity.shipped ? (Math.max(0, activity.turnedBack - activity.refused) / activity.shipped) * 100 : null))} note={activity.returns?.amount ? `Trị giá: ${money(activity.returns.amount)}` : undefined} />
        <Metric label="Khách hàng mới" value={quantity(activity.newCustomers)} />
      </div>
      {data.previous && <p>Kỳ đối chiếu có {quantity(data.previous.newCustomers)} khách mới và tỷ lệ bom hàng {percentage(data.previous.bom?.rate ?? data.previous.refusalRate)}.</p>}
      <div className="owner-report-chart-grid">
        <section className="owner-content-panel">
          <h3>Tỷ lệ bom hàng và đổi/trả theo kênh</h3>
          {activity.shipped > 0 ? <SeriesPlot rows={channelRows} series={rateSeries} title="Tỷ lệ bom hàng và đổi/trả theo kênh"
            categoryLabel="Nguồn bán" unitLabel="phần trăm" valueSuffix="%" reference={threshold} /> : <p>Chưa có đơn bàn giao vận chuyển trong kỳ.</p>}
        </section>
        <section className="owner-content-panel">
          <h3>Khách hàng mới theo kênh</h3>
          <SeriesPlot rows={channelRows} title="Khách hàng mới theo kênh" categoryLabel="Nguồn bán" unitLabel="khách hàng"
            series={[{ key: 'newCustomers', label: 'Kỳ đang xem' }, ...(data.previous ? [{ key: 'previousCustomers', label: 'Kỳ đối chiếu' }] : [])]} />
        </section>
      </div>
      <details><summary>Xem bảng vận chuyển và khách hàng theo kênh</summary>
        <Table headings={['Nguồn bán', 'Đã bàn giao', 'Đơn bom hàng', 'Tỷ lệ bom', 'Đơn đổi / trả', 'Tỷ lệ đổi trả', 'Khách mới',
          ...(data.previous ? ['Khách mới kỳ đối chiếu', 'Chênh lệch khách mới'] : [])]} paginated={false}>
          {channels.map(row => <tr key={row.channel}>
            <td>{channelLabels[row.channel]}</td><td>{quantity(row.shipped)}</td>
            <td><strong style={{ color: row.refused > 0 ? '#DC2626' : 'inherit' }}>{quantity(row.refused)}</strong></td><td>{percentage(row.refusalRate)}</td>
            <td><strong style={{ color: (row.returns?.count || 0) > 0 ? '#D97706' : 'inherit' }}>{quantity(row.returns?.count ?? Math.max(0, row.turnedBack - row.refused))}</strong></td><td>{percentage(row.returns?.rate ?? (row.shipped ? (Math.max(0, row.turnedBack - row.refused) / row.shipped) * 100 : null))}</td>
            <td>{quantity(row.newCustomers)}</td>
            {data.previous && <><td>{quantity(previousChannels.get(row.channel).newCustomers)}</td>
              <td>{quantity(row.newCustomers - previousChannels.get(row.channel).newCustomers)}</td></>}
          </tr>)}
        </Table>
      </details>
    </section>
    <ReturnTrend points={activity.points} threshold={threshold} />
    <BomOrderAnalytics bom={activity.bom} threshold={threshold} />
    <CustomerReturnAnalytics returns={activity.returns} />
    <ReturnWorklist key={location.key} rows={data.worklist} initialOverdueOnly={section === 'owner-return-processing'} />
    <OrderStatusPipeline orderStatuses={data.orderStatuses} />
  </>}</ResourceState>;
}
