/* Người thực hiện: Nguyễn Ngọc Huy-HE171157 | Ngày: 2-11-2026
 * Xu hướng theo khoảng ngày được chọn và so sánh hai kỳ bằng cột hoặc đường.
 * Nguồn dữ liệu máy chủ, không lấy số tổng của một kỳ rồi chia đều cho 12 tháng.
 */
import { useState } from 'react';
import { useOwnerResource } from '../../hooks/useOwnerResource';
import { WmsField, WmsSelect } from '../../components/ui/WmsControls';
import { ResourceState, Table, money, quantity } from './OwnerUI';
import { SeriesPlot, Columns } from './OwnerCharts';
const metrics = { revenue: 'Tiền hàng sau giảm giá và trả hàng', orderValue: 'Tổng giá trị đơn hàng', orders: 'Số đơn hàng', returns: 'Số yêu cầu hoàn', shipping: 'Phí vận chuyển', paid: 'Số đơn đã thanh toán', unpaid: 'Số đơn chưa thanh toán', late: 'Số đơn giao trễ' };
const dateRange = (from, to) => [from, to].map(date => date.split('-').reverse().join('/')).join(' – ');
const channelColors = { FACEBOOK: '#315d48', SHOPEE: '#a66c28', TIKTOK: '#466c9b', UNKNOWN: '#626b75' };
/**
 * API trend tổng hợp từng tháng trong đúng khoảng ngày, kể cả tháng đầu/cuối chỉ xem một phần.
 * Đổi chỉ số hoặc dạng biểu đồ chỉ đổi cách vẽ; dữ liệu tải lại khi ngày/nguồn bán/thanh toán đổi.
 */
export default function AnnualAnalytics({ from, to, salesChannel, paymentStatus }) {
  const [metric, setMetric] = useState('orderValue'); const [kind, setKind] = useState('line');
  const daily = Date.parse(to) - Date.parse(from) < 31 * 86400000;
  const resource = useOwnerResource('operations-report/trend', { from, to, salesChannel, paymentStatus, bucket: daily ? 'day' : 'month' });
  // Kỳ ngắn chia theo ngày; kỳ dài chia theo tháng. Chỉ số tiền hiển thị bằng đồng.
  const currency = ['revenue', 'orderValue', 'shipping'].includes(metric); const format = currency ? money : quantity;
  const rows = (resource.data?.points || []).map((r) => ({ label: r.label, current: r[metric] }));
  const title = `${metrics[metric]} · ${from} – ${to}`;
  return <section className="owner-content-panel owner-annual-analytics"><h2>Xu hướng trong kỳ</h2>
    <div className="owner-filters"><WmsField>Chỉ số<WmsSelect value={metric} onChange={(e) => setMetric(e.target.value)}>{Object.entries(metrics).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</WmsSelect></WmsField>
    <WmsField>Dạng biểu đồ<WmsSelect value={kind} onChange={(e) => setKind(e.target.value)}><option value="column">Biểu đồ cột</option><option value="line">Biểu đồ đường</option></WmsSelect></WmsField></div>
    <ResourceState resource={resource}>{resource.data && <><SeriesPlot rows={rows} title={title} currency={currency} kind={kind} categoryLabel={daily ? 'Ngày ghi nhận' : 'Tháng ghi nhận'} unitLabel={metric === 'returns' ? 'yêu cầu hoàn' : 'đơn hàng'} series={[{ key: 'current', label: 'Kỳ đang xem' }]} />
    <details><summary>Xem bảng số liệu</summary><Table headings={[daily ? 'Ngày' : 'Tháng', metrics[metric]]} empty={!rows.length}>{rows.map((row) => <tr key={row.label}><td>{row.label}</td><td>{format(row.current)}</td></tr>)}</Table></details></>}</ResourceState>
  </section>;
}
// UC-13: Tỷ trọng chỉ dùng số không âm; tên đầy đủ trên thanh ngang, các số tiền vẫn có đơn vị đồng.
// Bộ chọn chỉ số nằm trong thẻ biểu đồ; tiêu đề cố định giúp hai thẻ cạnh nhau thẳng hàng.
export function SalesSourceChart({ channels, labels }) {
  const [metric, setMetric] = useState('orderValue');
  const options = { revenue: metrics.revenue, orderValue: metrics.orderValue, refunded: 'Giá trị hàng trả đã duyệt', orders: metrics.orders, paid: metrics.paid, unpaid: metrics.unpaid, late: metrics.late, shipping: metrics.shipping };
  return <Columns title="Kết quả theo nguồn bán"
    controls={<WmsField>Chỉ số theo nguồn bán<WmsSelect value={metric} onChange={(e) => setMetric(e.target.value)}>{Object.entries(options).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</WmsSelect></WmsField>} allowDonut defaultKind="donut" currency={['revenue', 'orderValue', 'refunded', 'shipping'].includes(metric)} categoryLabel="Nguồn bán" unitLabel="đơn hàng" rows={channels.map((r) => ({ label: labels[r.channel], value: r[metric] }))} />;
}

// Nguyễn Ngọc Huy-HE171157, 2-11-2026: UC-12/13 - Chủ cửa hàng chọn chỉ số để đối chiếu hai kỳ trên cùng đơn vị.
export function PeriodComparison({ data, dates }) {
  const [metric, setMetric] = useState('orderValue');
  const options = { revenue: metrics.revenue, orderValue: metrics.orderValue, orders: metrics.orders, paid: metrics.paid, unpaid: metrics.unpaid, returns: metrics.returns, shipping: metrics.shipping };
  const currency = ['revenue', 'orderValue', 'shipping'].includes(metric);
  const rows = [
    { label: `Kỳ đang xem: ${dateRange(dates.from, dates.to)}`, value: data.sales[metric] },
    { label: `Kỳ đối chiếu: ${dateRange(dates.compareFrom, dates.compareTo)}`, value: data.previous[metric] },
  ];
  return <Columns title="So sánh hai kỳ" rows={rows} currency={currency} categoryLabel="Khoảng thời gian của từng kỳ"
    unitLabel={metric === 'returns' ? 'yêu cầu hoàn' : 'đơn hàng'}
    controls={<WmsField>Chỉ số so sánh
      <WmsSelect value={metric} onChange={(e) => setMetric(e.target.value)}>
        {Object.entries(options).map(([key, label]) => <option value={key} key={key}>{label}</option>)}
      </WmsSelect>
    </WmsField>}
    lineContent={<ComparisonTrend dates={dates} metric={metric} title={options[metric]} currency={currency} />}
  />;
}

// Khi chọn cả năm, gom thành bốn nhóm quý và vẽ hai cột cạnh nhau trong mỗi nhóm.
// Năm đối chiếu dùng cùng bộ lọc nguồn bán và trạng thái thanh toán.
export function QuarterlyRevenue({ year, compareYear, salesChannel, paymentStatus }) {
  const resource = useOwnerResource('operations-report/annual', { year, compareYear, salesChannel, paymentStatus });
  const [grouping, setGrouping] = useState('months');
  const [kind, setKind] = useState('column');
  const rows = (resource.data?.[grouping] || []).map(row => ({
    label: row.label, current: row.orderValue, previous: row.previous?.orderValue,
  }));
  return <section className="owner-content-panel">
    <h2>So sánh tổng giá trị đơn hàng hai năm</h2>
    <div className="owner-filters"><WmsField>Xem theo<WmsSelect value={grouping} onChange={event => setGrouping(event.target.value)}>
      <option value="months">Tháng</option><option value="quarters">Quý</option>
    </WmsSelect></WmsField>
    <WmsField>Dạng biểu đồ<WmsSelect value={kind} onChange={event => setKind(event.target.value)}>
      <option value="column">Biểu đồ cột</option><option value="line">Biểu đồ đường</option>
    </WmsSelect></WmsField></div>
    <ResourceState resource={resource}>{resource.data && <>
      <SeriesPlot title="So sánh tổng giá trị đơn hàng hai năm" rows={rows} kind={kind} currency categoryLabel={grouping === 'months' ? 'Tháng' : 'Quý'}
        series={[{ key: 'current', label: String(year) }, { key: 'previous', label: String(compareYear) }]} />
      <details><summary>Xem bảng tổng giá trị đơn hàng hai năm</summary>
        <Table headings={[grouping === 'months' ? 'Tháng' : 'Quý', String(year), String(compareYear)]} paginated={false}>
          {rows.map(row => <tr key={row.label}><td>{row.label}</td><td>{row.current == null ? '—' : money(row.current)}</td><td>{row.previous == null ? '—' : money(row.previous)}</td></tr>)}
        </Table>
      </details>
    </>}</ResourceState>
  </section>;
}

// Thanh ngang 100% dùng để so cơ cấu nguồn bán. Mỗi hàng tự chia theo
// tổng giá trị đơn của kỳ đó; giữ bảng số liệu cho kỳ có tổng bằng 0.
export function ChannelMixComparison({ data, dates, labels }) {
  const periods = [
    { label: dateRange(dates.from, dates.to), sales: data.sales },
    { label: dateRange(dates.compareFrom, dates.compareTo), sales: data.previous },
  ];
  const share = (sales, value) => sales.orderValue > 0 && sales.channels.every(row => row.orderValue >= 0)
    ? value / sales.orderValue * 100 : null;
  const included = data.sales.channels.filter(row => !dates.salesChannel || row.channel === dates.salesChannel);
  return <section className="owner-content-panel">
    <h2>Tỷ trọng giá trị đơn hàng theo nguồn bán</h2>
    {periods.map(({ label, sales }) => <div key={label + (sales === data.sales ? '-current' : '-previous')}>
      <h3>{sales === data.sales ? 'Kỳ đang xem' : 'Kỳ đối chiếu'} · {label}</h3>
      {share(sales, sales.orderValue) === null ? <p>Chưa thể tính tỷ trọng cho kỳ này.</p> :
        <div className="owner-channel-share-bar" aria-hidden="true">
          {sales.channels.filter(row => row.orderValue > 0).map(row => <div key={row.channel}
            style={{ width: `${share(sales, row.orderValue)}%`, background: channelColors[row.channel] }}
            title={`${labels[row.channel]} · ${quantity(share(sales, row.orderValue))}%`} />)}
        </div>}
    </div>)}
    <div className="owner-chart-legend">{included.map(row => <span key={row.channel}>
      <i style={{ background: channelColors[row.channel] }} />{labels[row.channel]}
    </span>)}</div>
    <Table headings={['Nguồn bán', 'Tỷ trọng kỳ đang xem', 'Tỷ trọng kỳ đối chiếu']} paginated={false}>
      {included.map(row => <tr key={row.channel}><td>{labels[row.channel]}</td>
        {periods.map(({ sales }, index) => {
          const percentage = share(sales, sales.channels.find(channel => channel.channel === row.channel).orderValue);
          return <td key={index}>{percentage === null ? '—' : `${quantity(percentage)}%`}</td>;
        })}
      </tr>)}
    </Table>
  </section>;
}
/**
 * Mỗi kỳ có một truy vấn trend riêng, cùng điều kiện nguồn bán và thanh toán.
 * Căn điểm theo thứ tự ngày/tháng trong kỳ để có thể so sánh hai khoảng thời gian khác nhau.
 */
function ComparisonTrend({ dates, metric, title, currency }) {
  const span = Math.max(Date.parse(dates.to) - Date.parse(dates.from), Date.parse(dates.compareTo) - Date.parse(dates.compareFrom));
  // Nếu cả hai khoảng ngắn hơn 63 ngày (tính cả hai đầu), chia theo ngày; còn lại chia theo tháng.
  const daily = span < 62 * 86400000;
  const bucket = daily ? 'day' : 'month';
  const scope = { salesChannel: dates.salesChannel, paymentStatus: dates.paymentStatus, bucket };
  const current = useOwnerResource('operations-report/trend', { ...scope, from: dates.from, to: dates.to });
  const previous = useOwnerResource('operations-report/trend', { ...scope, from: dates.compareFrom, to: dates.compareTo });
  const currentPoints = current.data?.points || [], previousPoints = previous.data?.points || [];
  const format = currency ? money : quantity;
  // Kỳ dài hơn quyết định số điểm; null biểu thị ngoài phạm vi kỳ ngắn hơn, không thay bằng 0.
  const period = daily ? 'Ngày' : 'Tháng';
  const rows = Array.from({ length: Math.max(currentPoints.length, previousPoints.length) }, (_, index) => {
    const currentPoint = currentPoints[index];
    const previousPoint = previousPoints[index];
    const label = `${period} thứ ${index + 1}`;
    const describePoint = (name, point) => point
      ? `${name} · ${point.label}: ${format(point[metric])}`
      : `${name}: Ngoài phạm vi kỳ`;
    return {
      label,
      dates: { current: currentPoint?.label, previous: previousPoint?.label },
      current: currentPoint?.[metric] ?? null,
      previous: previousPoint?.[metric] ?? null,
      tooltip: [label, describePoint('Kỳ đang xem', currentPoint), describePoint('Kỳ đối chiếu', previousPoint)].join('\n'),
    };
  });
  const chartTitle = `${title} theo ${period.toLocaleLowerCase('vi')} của hai kỳ`;
  const categoryLabel = daily ? 'Ngày thứ 1, thứ 2… tính từ ngày bắt đầu của từng kỳ' : 'Tháng thứ 1, thứ 2… tính từ tháng bắt đầu của từng kỳ';
  const series = [
    { key: 'current', label: `Kỳ đang xem: ${dateRange(dates.from, dates.to)}` },
    { key: 'previous', label: `Kỳ đối chiếu: ${dateRange(dates.compareFrom, dates.compareTo)}` },
  ];
  return <ResourceState resource={current}><ResourceState resource={previous}>{current.data && previous.data && (rows.length ? <>
    <h3 className="owner-comparison-chart-title">{chartTitle}</h3>
    <SeriesPlot rows={rows} kind="line" currency={currency} title={chartTitle} categoryLabel={categoryLabel}
      unitLabel={metric === 'returns' ? 'yêu cầu hoàn' : 'đơn hàng'} series={series} compactAxis />
    <details>
      <summary>Xem ${period.toLocaleLowerCase('vi')} và số liệu của từng kỳ</summary>
      <Table caption={chartTitle} headings={['Mốc tính từ đầu kỳ', `${period} kỳ đang xem`, 'Số liệu kỳ đang xem', `${period} kỳ đối chiếu`, 'Số liệu kỳ đối chiếu']}>
        {rows.map(row => <tr key={row.label}>
          <td>{row.label}</td>
          <td>{row.dates.current || '—'}</td>
          <td>{row.dates.current ? format(row.current) : 'Ngoài phạm vi kỳ'}</td>
          <td>{row.dates.previous || '—'}</td>
          <td>{row.dates.previous ? format(row.previous) : 'Ngoài phạm vi kỳ'}</td>
        </tr>)}
      </Table>
    </details>
  </> : <p>Chưa có dữ liệu phù hợp.</p>)}</ResourceState></ResourceState>;
}
