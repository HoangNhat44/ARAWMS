/* Người thực hiện: Nguyễn Ngọc Huy-HE171157 | Ngày: 2-11-2026
 * Xu hướng theo khoảng ngày được chọn và so sánh hai kỳ bằng cột hoặc đường.
 * Nguồn dữ liệu máy chủ, không lấy số tổng của một kỳ rồi chia đều cho 12 tháng.
 */
import { useState } from 'react';
import { useOwnerResource } from '../../hooks/useOwnerResource';
import { WmsField, WmsSelect } from '../../components/ui/WmsControls';
import { ResourceState, Table, money, quantity } from './OwnerUI';
import { SeriesPlot, Columns } from './OwnerCharts';
const metrics = { orderValue: 'Tổng giá trị đơn hàng', orders: 'Số đơn hàng', returns: 'Số yêu cầu hoàn', shipping: 'Phí vận chuyển', paid: 'Số đơn đã thanh toán', unpaid: 'Số đơn chưa thanh toán', late: 'Số đơn giao trễ' };
/**
 * API trend tổng hợp từng tháng trong đúng khoảng ngày, kể cả tháng đầu/cuối chỉ xem một phần.
 * Đổi chỉ số hoặc dạng biểu đồ chỉ đổi cách vẽ; dữ liệu tải lại khi ngày/nguồn bán/thanh toán đổi.
 */
export default function AnnualAnalytics({ from, to, salesChannel, paymentStatus }) {
  const [metric, setMetric] = useState('orderValue'); const [kind, setKind] = useState('line');
  const resource = useOwnerResource('operations-report/trend', { from, to, salesChannel, paymentStatus });
  // Tổng giá trị đơn hàng và phí vận chuyển hiển thị bằng VND; các chỉ số còn lại là số đếm.
  const currency = ['orderValue', 'shipping'].includes(metric); const format = currency ? money : quantity;
  const rows = (resource.data?.months || []).map((r) => ({ label: r.label, current: r[metric] }));
  const title = `${metrics[metric]} · ${from} – ${to}`;
  return <section className="owner-content-panel owner-annual-analytics"><h2>Xu hướng trong kỳ</h2>
    <div className="owner-filters"><WmsField>Chỉ số<WmsSelect value={metric} onChange={(e) => setMetric(e.target.value)}>{Object.entries(metrics).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</WmsSelect></WmsField>
    <WmsField>Dạng biểu đồ<WmsSelect value={kind} onChange={(e) => setKind(e.target.value)}><option value="column">Biểu đồ cột</option><option value="line">Biểu đồ đường</option></WmsSelect></WmsField></div>
    <ResourceState resource={resource}>{resource.data && <><SeriesPlot rows={rows} title={title} currency={currency} kind={kind} categoryLabel="Tháng trong kỳ đã chọn" unitLabel={metric === 'returns' ? 'yêu cầu hoàn' : 'đơn hàng'} series={[{ key: 'current', label: 'Kỳ đang xem' }]} />
    <details><summary>Xem bảng số liệu</summary><Table headings={['Tháng', metrics[metric]]} empty={!rows.length}>{rows.map((row) => <tr key={row.label}><td>{row.label}</td><td>{format(row.current)}</td></tr>)}</Table></details></>}</ResourceState>
  </section>;
}
// UC-13: Tỷ trọng chỉ dùng số không âm; tên đầy đủ trên thanh ngang, các số tiền vẫn có đơn vị đồng.
// Bộ chọn chỉ số nằm trong thẻ biểu đồ; tiêu đề cố định giúp hai thẻ cạnh nhau thẳng hàng.
export function SalesSourceChart({ channels, labels }) {
  const [metric, setMetric] = useState('orderValue');
  const options = { orderValue: 'Tổng giá trị đơn hàng', orders: 'Số đơn hàng', paid: 'Số đơn đã thanh toán', unpaid: 'Số đơn chưa thanh toán', late: 'Số đơn giao trễ', shipping: 'Phí vận chuyển' };
  return <Columns title="Kết quả theo nguồn bán" controls={<WmsField>Chỉ số theo nguồn bán<WmsSelect value={metric} onChange={(e) => setMetric(e.target.value)}>{Object.entries(options).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</WmsSelect></WmsField>} allowDonut currency={['orderValue', 'shipping'].includes(metric)} categoryLabel="Nguồn bán" unitLabel="đơn hàng" rows={channels.map((r) => ({ label: labels[r.channel], value: r[metric] }))} />;
}

// Nguyễn Ngọc Huy-HE171157, 2-11-2026: UC-12/13 - Chủ cửa hàng chọn chỉ số để đối chiếu hai kỳ trên cùng đơn vị.
export function PeriodComparison({ data, dates }) {
  const [metric, setMetric] = useState('orderValue'); const [kind, setKind] = useState('column');
  const options = { orderValue: 'Tổng giá trị đơn hàng', orders: 'Số đơn hàng', paid: 'Số đơn đã thanh toán', unpaid: 'Số đơn chưa thanh toán', returns: 'Số yêu cầu hoàn', shipping: 'Phí vận chuyển' };
  const currency = ['orderValue', 'shipping'].includes(metric);
  return <section className="owner-content-panel"><h2>So sánh hai kỳ</h2><div className="owner-filters"><WmsField>Chỉ số so sánh<WmsSelect value={metric} onChange={(e) => setMetric(e.target.value)}>{Object.entries(options).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</WmsSelect></WmsField>
    <WmsField>Dạng biểu đồ so sánh<WmsSelect value={kind} onChange={(e) => setKind(e.target.value)}><option value="column">Biểu đồ cột · Tổng hai kỳ</option><option value="line">Biểu đồ đường · Xu hướng hai kỳ</option></WmsSelect></WmsField></div>
    {kind === 'line' ? <ComparisonTrend dates={dates} metric={metric} title={options[metric]} currency={currency} /> : <Columns title={`So sánh ${options[metric].toLocaleLowerCase('vi')} hai kỳ`} currency={currency} categoryLabel="Kỳ báo cáo" unitLabel={metric === 'returns' ? 'yêu cầu hoàn' : 'đơn hàng'} rows={[{ label: `${dates.from} – ${dates.to}`, value: data.sales[metric] }, { label: `${dates.compareFrom} – ${dates.compareTo}`, value: data.previous[metric] }]} />}
  </section>;
}
/**
 * Mỗi kỳ có một truy vấn trend riêng, cùng điều kiện nguồn bán và thanh toán.
 * Căn điểm theo thứ tự ngày/tháng trong kỳ để có thể so sánh hai khoảng thời gian khác nhau.
 */
function ComparisonTrend({ dates, metric, title, currency }) {
  const span = Math.max(Date.parse(dates.to) - Date.parse(dates.from), Date.parse(dates.compareTo) - Date.parse(dates.compareFrom));
  // Nếu cả hai khoảng ngắn hơn 63 ngày (tính cả hai đầu), chia theo ngày; còn lại chia theo tháng.
  const bucket = span < 62 * 86400000 ? 'day' : 'month';
  const scope = { salesChannel: dates.salesChannel, paymentStatus: dates.paymentStatus, bucket };
  const current = useOwnerResource('operations-report/trend', { ...scope, from: dates.from, to: dates.to });
  const previous = useOwnerResource('operations-report/trend', { ...scope, from: dates.compareFrom, to: dates.compareTo });
  const a = current.data?.points || [], b = previous.data?.points || [];
  // Kỳ dài hơn quyết định số điểm; null biểu thị ngoài phạm vi kỳ ngắn hơn, không thay bằng 0.
  const rows = Array.from({ length: Math.max(a.length, b.length) }, (_, i) => ({ label: `${a[i]?.label || '—'} / ${b[i]?.label || '—'}`, current: a[i]?.[metric] ?? null, previous: b[i]?.[metric] ?? null }));
  const format = currency ? money : quantity;
  return <ResourceState resource={current}><ResourceState resource={previous}>{current.data && previous.data && <>
    <p className="owner-method">Đối chiếu theo thứ tự {bucket === 'day' ? 'ngày' : 'tháng'} trong mỗi kỳ. Mỗi nhãn hiển thị thời gian của kỳ đang xem / kỳ đối chiếu; phần ngoài phạm vi một kỳ được để trống.</p>
    <SeriesPlot rows={rows} kind="line" currency={currency} title={`So sánh xu hướng ${title.toLocaleLowerCase('vi')}`} categoryLabel={bucket === 'day' ? 'Ngày của hai kỳ (theo thứ tự)' : 'Tháng của hai kỳ (theo thứ tự)'} unitLabel={metric === 'returns' ? 'yêu cầu hoàn' : 'đơn hàng'} series={[{ key: 'current', label: `Kỳ đang xem: ${dates.from} – ${dates.to}` }, { key: 'previous', label: `Kỳ đối chiếu: ${dates.compareFrom} – ${dates.compareTo}` }]} />
    <details><summary>Xem số liệu đối chiếu</summary><Table headings={['Ngày / tháng hai kỳ', 'Kỳ đang xem', 'Kỳ đối chiếu']} empty={!rows.length}>{rows.map((r) => <tr key={r.label}><td>{r.label}</td><td>{r.current === null ? 'Ngoài phạm vi kỳ' : format(r.current)}</td><td>{r.previous === null ? 'Ngoài phạm vi kỳ' : format(r.previous)}</td></tr>)}</Table></details>
  </>}</ResourceState></ResourceState>;
}
