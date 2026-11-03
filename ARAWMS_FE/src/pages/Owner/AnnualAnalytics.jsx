/* Người thực hiện: Nguyễn Ngọc Huy-HE171157 | Ngày: 2-11-2026
 * UC-12/13: Chọn năm, chỉ số và biểu đồ cột nhóm/đường; đủ 12 tháng, so sánh năm hoặc quý.
 * Nguồn dữ liệu máy chủ, không lấy số tổng của một kỳ rồi chia đều cho 12 tháng.
 */
import { useState } from 'react';
import { useOwnerResource } from '../../hooks/useOwnerResource';
import { WmsField, WmsSelect, WmsInput, WmsButton } from '../../components/ui/WmsControls';
import { ResourceState, Table, money, quantity } from './OwnerUI';
import { SeriesPlot, Columns } from './OwnerCharts';
const metrics = { revenue: 'Doanh thu', orders: 'Số đơn hàng', returns: 'Số yêu cầu hoàn', shipping: 'Phí vận chuyển', paid: 'Số đơn đã thanh toán', unpaid: 'Số đơn chưa trả hoặc trả một phần', late: 'Số đơn giao trễ' };
export default function AnnualAnalytics({ year, salesChannel, paymentStatus }) {
  const [years, setYears] = useState({ year, compareYear: year - 1 }); const [draft, setDraft] = useState(years);
  const [metric, setMetric] = useState('revenue'); const [kind, setKind] = useState('column'); const [group, setGroup] = useState('month');
  const resource = useOwnerResource('operations-report/annual', { ...years, salesChannel, paymentStatus });
  const currency = ['revenue', 'shipping'].includes(metric); const format = currency ? money : quantity;
  const source = resource.data ? (group === 'month' ? resource.data.months : resource.data.quarters) : [];
  const rows = (source || []).map((r) => ({ label: r.label, current: r[metric], previous: r.previous[metric] }));
  const title = `${metrics[metric]} theo ${group === 'month' ? '12 tháng' : '4 quý'}: năm ${years.year} và ${years.compareYear}`;
  return <section className="owner-content-panel owner-annual-analytics"><h2>Biểu đồ cả năm</h2>
    <form className="owner-filters" onSubmit={(e) => { e.preventDefault(); setYears({ year: Number(draft.year), compareYear: Number(draft.compareYear) }); }}>
      <WmsField>Năm cần xem<WmsInput type="number" min="2000" max="2200" required value={draft.year} onChange={(e) => setDraft({ ...draft, year: e.target.value })} /></WmsField>
      <WmsField>Năm đối chiếu<WmsInput type="number" min="2000" max="2200" required value={draft.compareYear} onChange={(e) => setDraft({ ...draft, compareYear: e.target.value })} /></WmsField><WmsButton type="submit">Xem hai năm</WmsButton>
      <WmsField>Chỉ số theo năm<WmsSelect value={metric} onChange={(e) => setMetric(e.target.value)}>{Object.entries(metrics).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</WmsSelect></WmsField>
      <WmsField>Chia theo<WmsSelect value={group} onChange={(e) => setGroup(e.target.value)}><option value="month">12 tháng</option><option value="quarter">4 quý</option></WmsSelect></WmsField>
      <WmsField>Dạng biểu đồ cả năm<WmsSelect value={kind} onChange={(e) => setKind(e.target.value)}><option value="column">Cột nhóm để so sánh</option><option value="line">Đường để xem xu hướng</option></WmsSelect></WmsField>
    </form><ResourceState resource={resource}>{resource.data && <><h3>{title}</h3><SeriesPlot rows={rows} title={title} currency={currency} kind={kind} categoryLabel={group === 'month' ? 'Tháng trong năm' : 'Quý trong năm'} unitLabel={metric === 'returns' ? 'yêu cầu hoàn' : 'đơn hàng'} series={[{ key: 'current', label: `Năm ${years.year}` }, { key: 'previous', label: `Năm ${years.compareYear}` }]} />
      <details><summary>Xem bảng số liệu và mức tăng giảm</summary><Table headings={[group === 'month' ? 'Tháng' : 'Quý', `Năm ${years.year}`, `Năm ${years.compareYear}`, 'Tăng hoặc giảm']} empty={!rows.length}>{rows.map((r) => <tr key={r.label}><td>{r.label}</td><td>{format(r.current)}</td><td>{format(r.previous)}</td><td>{r.previous === 0 ? 'Chưa có cơ sở so sánh' : `${quantity((r.current - r.previous) / Math.abs(r.previous) * 100)}%`}</td></tr>)}</Table></details>
    </>}</ResourceState>
  </section>;
}
// UC-13: Tỷ trọng chỉ dùng số không âm; tên đầy đủ trên thanh ngang, các số tiền vẫn có đơn vị đồng.
export function SalesSourceChart({ channels, labels }) {
  const [metric, setMetric] = useState('revenue');
  const options = { revenue: 'Doanh thu trước giảm trừ hàng trả', orders: 'Số đơn hàng', paid: 'Số đơn đã thanh toán', unpaid: 'Số đơn chưa trả hoặc trả một phần', late: 'Số đơn giao trễ', shipping: 'Phí vận chuyển' };
  return <div><WmsField>Chỉ số theo nguồn bán<WmsSelect value={metric} onChange={(e) => setMetric(e.target.value)}>{Object.entries(options).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</WmsSelect></WmsField><Columns title={`${options[metric]} theo nguồn bán`} allowDonut currency={['revenue', 'shipping'].includes(metric)} rows={channels.map((r) => ({ label: labels[r.channel], value: r[metric] }))} /></div>;
}

// Nguyễn Ngọc Huy-HE171157, 2-11-2026: UC-12/13 - Chủ cửa hàng chọn chỉ số để đối chiếu hai kỳ trên cùng đơn vị.
export function PeriodComparison({ data, dates }) {
 const [metric, setMetric] = useState('revenue');
 const options = { revenue: 'Doanh thu', orders: 'Số đơn hàng', paid: 'Số đơn đã thanh toán', unpaid: 'Số đơn chưa trả hoặc trả một phần', returns: 'Số yêu cầu hoàn', shipping: 'Phí vận chuyển' };
 return <div><WmsField>Chỉ số so sánh hai kỳ<WmsSelect value={metric} onChange={(e) => setMetric(e.target.value)}>{Object.entries(options).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</WmsSelect></WmsField><Columns title={`So sánh ${options[metric].toLocaleLowerCase('vi')} hai kỳ`} currency={['revenue', 'shipping'].includes(metric)} categoryLabel="Kỳ báo cáo" unitLabel={metric === 'returns' ? 'yêu cầu hoàn' : 'đơn hàng'} rows={[{ label: `${dates.from} – ${dates.to}`, value: data.sales[metric] }, { label: `${dates.compareFrom} – ${dates.compareTo}`, value: data.previous[metric] }]} /></div>;
}
