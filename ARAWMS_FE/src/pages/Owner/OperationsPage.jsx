/* Người thực hiện: Nguyễn Ngọc Huy-HE171157 | Ngày: 2-11-2026
 * UC-12/13/19; phản hồi 1–8: Bộ lọc chung, so sánh cột, nhập hàng, tồn kho, sản xuất và giao việc.
 * GBR-01/13: Gọi API xác thực; tồn cách ly riêng, không tính giá vốn hoặc lợi nhuận.
 */
import { useState } from 'react';
import { comparisonDates, quarterDates } from '../../utils/reportFilters';
import { Link, useLocation } from 'react-router-dom';
import api from '../../services/api';
import { Columns } from './OwnerCharts';
import AnnualAnalytics, { SalesSourceChart, PeriodComparison } from './AnnualAnalytics';
import { useOwnerResource } from '../../hooks/useOwnerResource';
import { useOwnerQuery } from '../../hooks/useOwnerQuery';
import { defaultOwnerDates, dateRangeError, todayOwner } from '../../utils/ownerValidation';
import { ResourceState, Table, Metric, Status, money, quantity, datetime, labels, Notice } from './OwnerUI';
import { WmsButton, WmsInput, WmsSelect, WmsField } from '../../components/ui/WmsControls';

const titles = { dashboard: 'Tổng quan kho và sản xuất', bi: 'Báo cáo doanh thu', purchases: 'Báo cáo nhập hàng', production: 'Kế hoạch sản xuất', inventory: 'Tồn kho nguyên liệu', finished: 'Tồn kho thành phẩm', stocktakes: 'Lịch sử kiểm kê và chốt kho', tasks: 'Phân công công việc', payables: 'Lập phiếu chi trả nợ' };
const channelLabels = { FACEBOOK: 'Facebook', SHOPEE: 'Shopee', TIKTOK: 'TikTok', WHOLESALE: 'Bán buôn', RETAIL: 'Bán lẻ', DIRECT: 'Khách mua trực tiếp', UNKNOWN: 'Chưa rõ nguồn bán' };
const reasonLabels = { CUSTOMER_REFUSED: 'Khách không nhận hàng', INVALID_ORDER: 'Đơn hàng không hợp lệ', PRODUCT_DEFECT: 'Sản phẩm bị lỗi', OTHER: 'Lý do khác', UNKNOWN: 'Chưa rõ lý do' };
const iso = (d) => d.toISOString().slice(0, 10);
const previousYear = (s) => { const d = new Date(`${s}T00:00:00Z`); const day = d.getUTCDate(); d.setUTCFullYear(d.getUTCFullYear() - 1); if (d.getUTCDate() !== day) d.setUTCDate(0); return iso(d); };
const initial = () => { const dates = defaultOwnerDates(); return { ...dates, compareFrom: previousYear(dates.from), compareTo: previousYear(dates.to) }; };
// UC-13: Các lựa chọn tuần/tháng/quý/năm đều chuyển thành ngày rõ ràng, cho phép chọn kỳ lịch sử bất kỳ.
function preset(kind, anchor) {
  const d = new Date(`${anchor}T00:00:00Z`); const y = d.getUTCFullYear(); const m = d.getUTCMonth();
  if (kind === 'week') { d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7); const end = new Date(d); end.setUTCDate(end.getUTCDate() + 6); return { from: iso(d), to: iso(end) }; }
  const start = kind === 'year' ? 0 : kind === 'quarter' ? Math.floor(m / 3) * 3 : m;
  return { from: iso(new Date(Date.UTC(y, start, 1))), to: iso(new Date(Date.UTC(y, start + (kind === 'year' ? 12 : kind === 'quarter' ? 3 : 1), 0))) };
}
// Nguyễn Ngọc Huy-HE171157, 2-11-2026: UC-12/13 - Gộp toàn bộ lựa chọn so sánh vào một bộ lọc.
function PeriodFilter({ value, onChange, showComparison = true }) {
  const [draft, setDraft] = useState(() => ({ from: value.from, to: value.to, compareFrom: value.compareFrom, compareTo: value.compareTo, salesChannel: value.salesChannel || '', paymentStatus: value.paymentStatus || '' }));
  const [kind, setKind] = useState(value.compareMode === 'quarter' ? 'quarter' : 'custom'); const [mode, setMode] = useState(value.compareMode || 'previous-year'); const [error, setError] = useState('');
  const [quarters, setQuarters] = useState({ current: Math.floor((Number(value.from.slice(5, 7)) - 1) / 3) + 1, previous: Math.floor((Number(value.compareFrom.slice(5, 7)) - 1) / 3) + 1 });
  const changeQuarters = (next) => { setQuarters(next); const year = Number(draft.from.slice(0, 4)); const current = quarterDates(year, next.current), previous = quarterDates(year, next.previous); setDraft({ ...current, compareFrom: previous.from, compareTo: previous.to }); };
  const apply = (e) => { e.preventDefault(); const message = dateRangeError(draft); if (message) { setError(message); return; } const selectedMode = showComparison ? mode : 'previous-year'; const current = selectedMode === 'quarter' ? quarterDates(Number(draft.from.slice(0, 4)), quarters.current) : draft; const previous = selectedMode === 'quarter' ? quarterDates(Number(draft.from.slice(0, 4)), quarters.previous) : null; const dates = { ...draft, ...current, ...(previous ? { compareFrom: previous.from, compareTo: previous.to } : comparisonDates(current, selectedMode)) }; const error = dateRangeError({ from: dates.compareFrom, to: dates.compareTo }); setError(error); if (!error) onChange({ ...dates, compareMode: selectedMode }); };
  return <form className="owner-filters" onSubmit={apply}>
    <WmsField>Xem theo<WmsSelect value={kind} onChange={(e) => { const k = e.target.value; setKind(k); if (k !== 'custom') setDraft({ ...draft, ...preset(k, draft.from) }); }}><option value="custom">Khoảng thời gian</option><option value="week">Tuần</option><option value="month">Tháng</option><option value="quarter">Quý</option><option value="year">Năm</option></WmsSelect></WmsField>
    {[['from', 'Từ ngày'], ['to', 'Đến ngày']].map(([key, title]) => <WmsField key={key}>{title}<WmsInput type="date" required value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} /></WmsField>)}
    {showComparison && <WmsField>So sánh với<WmsSelect value={mode} onChange={(e) => { const next = e.target.value; setMode(next); if (next === 'quarter') { setKind('quarter'); changeQuarters({ current: 1, previous: 2 }); } }}><option value="previous-year">Cùng kỳ năm trước</option><option value="previous-period">Kỳ liền trước</option><option value="quarter">Quý khác trong năm</option><option value="custom">Khoảng ngày tự chọn</option></WmsSelect></WmsField>}
    {showComparison && mode === 'quarter' && [['current', 'Quý cần xem'], ['previous', 'Quý đối chiếu']].map(([key, title]) => <WmsField key={key}>{title}<WmsSelect value={String(quarters[key])} onChange={(e) => changeQuarters({ ...quarters, [key]: Number(e.target.value) })}>{[1, 2, 3, 4].map((q) => <option key={q} value={String(q)}>Quý {q}</option>)}</WmsSelect></WmsField>)}
    {showComparison && mode === 'custom' && [['compareFrom', 'So sánh từ ngày'], ['compareTo', 'So sánh đến ngày']].map(([key, title]) => <WmsField key={key}>{title}<WmsInput type="date" required value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} /></WmsField>)}
    {showComparison && <><WmsField>Nguồn bán<WmsSelect value={draft.salesChannel} onChange={(e) => setDraft({ ...draft, salesChannel: e.target.value })}><option value="">Tất cả nguồn bán</option>{Object.entries(channelLabels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</WmsSelect></WmsField><WmsField>Thanh toán<WmsSelect value={draft.paymentStatus} onChange={(e) => setDraft({ ...draft, paymentStatus: e.target.value })}><option value="">Tất cả tình trạng thanh toán</option><option value="PAID">Đã thanh toán</option><option value="UNPAID">Chưa thanh toán</option><option value="PARTIAL">Đã trả một phần</option><option value="UNKNOWN">Chưa rõ thanh toán</option></WmsSelect></WmsField></>}
    <WmsButton type="submit" className="btn-ara-primary">Áp dụng</WmsButton><Notice error={error} />
  </form>;
}
export default function OperationsPage({ mode = 'dashboard', warehouse }) {
  const [filters, setFilters] = useOwnerQuery({ ...initial(), search: '', status: '', page: 1, salesChannel: '', paymentStatus: '', compareMode: 'previous-year' }); const { search, status, page, ...query } = filters; const location = useLocation();
  const setQuery = (next) => setFilters({ ...filters, ...next }); const setSearch = (search) => setFilters({ ...filters, search }); const setStatus = (status) => setFilters({ ...filters, status });
  const [error, setError] = useState(''); const [success, setSuccess] = useState('');
  const resource = useOwnerResource('operations-report', query); const data = resource.data;
  const match = (row) => (!status || !row.status || row.status === status) && `${JSON.stringify(row)} ${labels[row.status] || ''}`.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi'));
  const action = async (path, body, method = 'patch') => { setError(''); setSuccess(''); try { await api[method](`/owner/operations-report/${path}`, body); setSuccess('Đã lưu thay đổi.'); resource.reload(); } catch (e) { setError(e.message); } };
  return <><header className="owner-page-heading"><div><h1>{titles[mode]}</h1></div><WmsButton onClick={resource.reload}>Tải lại</WmsButton></header>
    <PeriodFilter key={`${query.from}-${query.to}-${query.compareFrom}-${query.compareTo}-${query.compareMode}`} value={query} onChange={setQuery} showComparison={['dashboard', 'bi'].includes(mode)} /><Notice error={error} success={success} />
    <ResourceState resource={resource}>{data && <>
      {/* Nguyễn Ngọc Huy-HE171157, 2-11-2026: UC-12/13 - Kết quả so sánh là nội dung đầu tiên ngay dưới bộ lọc, trước các thẻ chỉ số. */}
      {['dashboard', 'bi'].includes(mode) && <PeriodComparison data={data} dates={query} />}
      {!['dashboard', 'bi'].includes(mode) && <div className="owner-filters"><WmsField>Tìm trong danh sách<WmsInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nhập mã hoặc tên cần tìm" /></WmsField>{!['dashboard', 'bi', 'payables'].includes(mode) && <WmsField>Trạng thái<WmsSelect value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Tất cả trạng thái</option>{[...new Set((['inventory', 'finished'].includes(mode) ? data.inventory : mode === 'purchases' ? data.purchases : mode === 'production' ? data.production : mode === 'tasks' ? data.tasks : data.sessions).map((r) => r.status))].filter(Boolean).map((s) => <option key={s} value={s}>{labels[s] || 'Chưa cập nhật'}</option>)}</WmsSelect></WmsField>}</div>}
      {mode === 'dashboard' && <><div className="owner-metrics"><Metric label="Kế hoạch nhập trong kỳ còn chờ hàng" value={new Set(data.purchases.filter((r) => r.planned > r.totalReceived && r.status !== 'CANCELLED').map((r) => r.planCode)).size} /><Metric label="Mã hàng dưới mức tồn tối thiểu" value={data.inventory.filter((r) => ['LOW_STOCK', 'OUT_OF_STOCK'].includes(r.status)).length} /><Metric label="Kế hoạch sản xuất thiếu nguyên liệu" value={data.production.filter((r) => r.requirements.some((m) => m.shortage > 0)).length} /><Metric label="Thành phẩm nhập từ sản xuất trong kỳ" value={quantity(data.output)} /></div><Columns title="Tình hình tồn kho theo số mã hàng" allowDonut defaultKind="donut" unitLabel="mã hàng" rows={['AVAILABLE', 'LOW_STOCK', 'OUT_OF_STOCK'].map((s) => ({ label: labels[s], value: data.inventory.filter((r) => r.status === s).length }))} /></>}
      {['dashboard', 'bi'].includes(mode) && <>

        <div className="owner-metrics"><Metric label="Doanh thu trong kỳ" value={money(data.sales.revenue)} /><Metric label="Thay đổi so với kỳ so sánh" value={data.change === null ? 'Chưa có cơ sở so sánh' : `${quantity(data.change)}%`} /><Metric label="Chỉ tiêu doanh thu cả năm" value={money(data.target)} /><Metric label="Doanh thu kỳ / chỉ tiêu cả năm" value={data.targetPercent === null ? 'Chưa đặt chỉ tiêu' : `${quantity(data.targetPercent)}%`} /></div>
        {mode === 'bi' && <TargetForm year={Number(query.from.slice(0, 4))} action={action} />}
        {/* Nguyễn Ngọc Huy-HE171157, 2-11-2026: UC-12/13 - Biểu đồ 12 tháng đọc số liệu theo tháng, không chia số tổng của kỳ. */}
        <AnnualAnalytics key={query.from.slice(0, 4)} year={Number(query.from.slice(0, 4))} salesChannel={query.salesChannel} paymentStatus={query.paymentStatus} />
        <SalesSourceChart channels={data.sales.channels} labels={channelLabels} />
        <Table headings={['Nguồn bán', 'Số đơn', 'Doanh thu trước giảm trừ hàng trả', 'Đã thanh toán', 'Chưa trả hoặc trả một phần', 'Chưa rõ thanh toán', 'Đơn trễ', 'Phí vận chuyển']} empty={!data.sales.orders}>{data.sales.channels.map((r) => <tr key={r.channel}><td>{channelLabels[r.channel]}</td><td>{r.orders}</td><td>{money(r.revenue)}</td><td>{r.paid}</td><td>{r.unpaid}</td><td>{r.unknownPayment}</td><td>{r.late}</td><td>{money(r.shipping)}</td></tr>)}</Table>
        <div className="owner-metrics"><Metric label="Số yêu cầu hoàn trong kỳ" value={data.sales.returns} /><Metric label="Giảm trừ hàng trả đã duyệt" value={money(data.sales.refunded)} /><Metric label="Phí vận chuyển của các đơn trong kỳ" value={money(data.sales.shipping)} /><Metric label="Thành phẩm nhập từ sản xuất trong kỳ" value={quantity(data.output)} /></div>
        <Columns title="Nguyên nhân hoàn hàng" allowDonut rows={data.sales.returnReasons.map((r) => ({ label: reasonLabels[r.reason], value: r.count }))} />
        <Columns title="Tiến độ xử lý đơn hoàn" allowDonut rows={data.returnStatuses.map((r) => ({ label: labels[r.status] || 'Chưa cập nhật', value: r.count }))} />
        {mode === 'dashboard' && <div className="owner-actions"><Link to="/owner/purchases">Xem nhập hàng và công nợ</Link><Link to="/owner/production">Xem nhu cầu nguyên liệu</Link><Link to="/owner/material-valuation">Xem tồn nguyên liệu</Link></div>}
      </>}
      {mode === 'purchases' && <>
        {[...new Set(data.purchases.filter(match).map((r) => r.unit))].map((unit) => <Columns key={unit || 'unknown'} title={`Kế hoạch và lượng nhập · ${labels[unit] || 'Chưa rõ đơn vị'}`} categoryLabel="Kế hoạch nhập và mặt hàng" unitLabel={labels[unit] || 'Chưa rõ'} rows={data.purchases.filter(match).filter((r) => r.unit === unit).flatMap((r) => [{ label: `${r.planCode} · ${r.material} · Kế hoạch`, value: r.planned }, { label: `${r.planCode} · Đã nhập`, value: r.received }])} />)}
        <Table headings={['Kế hoạch', 'Nhà cung cấp', 'Nguyên liệu', 'Đơn vị', 'Dự kiến về', 'Kế hoạch', 'Kiểm đạt', 'Đã nhập trong kỳ', 'Còn chờ về', 'Giá nhập', 'Người mua', 'Người nhận', 'Trạng thái']} empty={!data.purchases.filter(match).length}>{data.purchases.filter(match).map((r) => <tr key={r.id}><td>{r.planCode}</td><td>{r.supplier}</td><td>{r.material}</td><td>{labels[r.unit]}</td><td>{datetime(r.scheduledDeliveryDate)}</td><td>{quantity(r.planned)}</td><td>{quantity(r.verified)}</td><td>{quantity(r.received)}</td><td>{quantity(Math.max(0, r.planned - r.totalReceived))}</td><td>{money(r.unitPrice)}</td><td>{r.buyer}</td><td>{r.receiver}</td><td><Status value={r.status} /></td></tr>)}</Table>
        <h2>Thanh toán các hợp đồng thuộc kế hoạch trong kỳ</h2><DebtShare rows={data.debts.filter(match)} /><Columns title="Thanh toán và công nợ hiện tại" currency rows={data.debts.filter(match).flatMap((r) => [{ label: `${r.code} · Đã trả`, value: r.paid }, { label: `${r.code} · Còn nợ`, value: r.debt }])} />
        <Table headings={['Hợp đồng', 'Nhà cung cấp', 'Tổng tiền', 'Đã trả', 'Còn nợ']} empty={!data.debts.filter(match).length}>{data.debts.filter(match).map((r) => <tr key={r.code}><td>{r.code}</td><td>{r.supplier}</td><td>{money(r.total)}</td><td>{money(r.paid)}</td><td>{money(r.debt)}</td></tr>)}</Table>
        <h2>Phân công mua hàng và nhận nguyên liệu</h2><InboundAssignment plans={data.purchases} employees={data.employees} action={action} />
      </>}
      {mode === 'production' && <>{data.production.filter(match).map((r) => <section className="owner-content-panel" key={r.id}><h2>{r.code}</h2><Status value={r.status} /><p>{datetime(r.plannedStart)} – {datetime(r.plannedEnd)}</p><Link to={`/owner/production/${r.id}`} state={{ from: location.pathname + location.search }} aria-label={`Xem chi tiết ${r.code}`}>Xem chi tiết định mức và tiến độ</Link>
        {[...new Set(r.requirements.map((m) => m.unit))].map((unit) => <Columns key={unit || 'unknown'} title={`Nhu cầu và tồn khả dụng · ${labels[unit] || 'Chưa rõ đơn vị'}`} categoryLabel="Nguyên liệu và lượng đối chiếu" unitLabel={labels[unit] || 'Chưa rõ'} rows={r.requirements.filter((m) => m.unit === unit).flatMap((m) => [{ label: `${m.name} · Cần`, value: m.required }, { label: `${m.name} · Hiện có`, value: m.available ?? 0 }])} />)}
        <Table headings={['Nguyên liệu', 'Đơn vị', 'Nhu cầu', 'Khả dụng', 'Thiếu', 'Nguyên nhân']} empty={!r.requirements.length}>{r.requirements.map((m, i) => <tr key={i}><td>{m.name}</td><td>{labels[m.unit]}</td><td>{quantity(m.required)}</td><td>{quantity(m.available)}</td><td>{quantity(m.shortage)}</td><td>{m.cause}</td></tr>)}</Table>
        <Table headings={['Công đoạn', 'Trạng thái', 'Nguyên nhân chậm hoặc thiếu']} empty={!r.stages?.length}>{r.stages?.map((s, i) => <tr key={i}><td>{labels[s.stage || s.name || s.code] || 'Chưa rõ công đoạn'}</td><td><Status value={s.status} /></td><td>{s.blockedReason || s.note || 'Chưa ghi nhận'}</td></tr>)}</Table>
        <Columns title="Số thành phẩm theo kế hoạch và thực tế" categoryLabel="Tình trạng thực hiện" unitLabel="thành phẩm" rows={[{ label: 'Kế hoạch', value: r.items.reduce((s, i) => s + (i.plannedQty || 0), 0) }, { label: 'Hoàn thành', value: r.items.reduce((s, i) => s + (i.completedQty || 0), 0) }]} />
        <Columns title="Tỷ lệ hoàn thành kế hoạch" allowDonut defaultKind="donut" unitLabel="thành phẩm" rows={[{ label: 'Đã hoàn thành', value: r.items.reduce((s, i) => s + (i.completedQty || 0), 0) }, { label: 'Còn phải làm', value: r.items.reduce((s, i) => s + Math.max(0, (i.plannedQty || 0) - (i.completedQty || 0)), 0) }]} />
        {['DRAFT', 'PLANNED', 'MATERIAL_SHORTAGE'].includes(r.status) && <PlanForm order={r} action={action} />}
      </section>)}{!data.production.filter(match).length && <p>Chưa có kế hoạch phù hợp.</p>}</>}
      {['inventory', 'finished'].includes(mode) && <><Inventory rows={data.inventory.filter((r) => r.type === (mode === 'inventory' ? 'RAW_MATERIAL' : 'FINISHED_GOODS')).filter(match)} movements={data.movements.filter((r) => r.warehouseType === (mode === 'inventory' ? 'RAW_MATERIAL' : 'FINISHED_GOODS'))} />
        <h2>Kế hoạch xuất trong kỳ</h2><Table headings={['Mã phiếu hoặc đơn', 'Ngày dự kiến', 'Trạng thái']} empty={!(data.outboundPlans || []).filter((r) => r.type === (mode === 'inventory' ? 'RAW_MATERIAL' : 'FINISHED_GOODS')).filter(match).length}>{(data.outboundPlans || []).filter((r) => r.type === (mode === 'inventory' ? 'RAW_MATERIAL' : 'FINISHED_GOODS')).filter(match).map((r) => <tr key={r.id}><td>{r.code}</td><td>{datetime(r.date)}</td><td><Status value={r.status} /></td></tr>)}</Table></>}
      {mode === 'stocktakes' && <><Columns title="Tình trạng các kỳ kiểm kê" allowDonut defaultKind="donut" unitLabel="phiên kiểm kê" rows={Object.entries(data.sessions.filter((r) => !warehouse || r.warehouseType === warehouse).filter(match).reduce((a, r) => ({ ...a, [r.status]: (a[r.status] || 0) + 1 }), {})).map(([s, value]) => ({ label: labels[s] || 'Chưa cập nhật', value }))} /><Table headings={['Kỳ kiểm kê', 'Kho', 'Ngày mở', 'Ngày duyệt', 'Trạng thái', 'Chênh lệch']} empty={!data.sessions.filter((r) => !warehouse || r.warehouseType === warehouse).filter(match).length}>{data.sessions.filter((r) => !warehouse || r.warehouseType === warehouse).filter(match).map((r) => <tr key={r._id}><td><Link to={`/owner/stock-adjustments/${r._id}`}>{r.sessionCode}</Link></td><td>{labels[r.warehouseType]}</td><td>{datetime(r.createdAt)}</td><td>{datetime(r.approvalInfo?.approvedAt)}</td><td><Status value={r.status} /></td><td>{quantity(r.totalDiscrepancyCount)}</td></tr>)}</Table></>}
      {mode === 'tasks' && <Tasks data={data} match={match} action={action} />}
      {mode === 'payables' && <PaymentForm debts={data.debts.filter(match)} action={action} />}

    </>}</ResourceState></>;
}
// UC-13: Chỉ tiêu doanh thu cả năm được nhập rõ ràng và lưu ở máy chủ.
function TargetForm({ year, action }) {
  const [value, setValue] = useState(''); const [busy, setBusy] = useState(false);
  return <form className="owner-filters" onSubmit={async (e) => { e.preventDefault(); setBusy(true); await action('target', { year, revenue: Number(value) }, 'put'); setBusy(false); }}><WmsField>Chỉ tiêu doanh thu năm {year} (đồng)<WmsInput type="number" min="0" max="1000000000000000" required value={value} onChange={(e) => setValue(e.target.value)} /></WmsField><WmsButton type="submit" disabled={busy}>Lưu chỉ tiêu</WmsButton></form>;
}
// Phản hồi 3/6: Một lần phân công áp dụng cho cả kế hoạch, không lặp theo từng dòng nguyên liệu.
function InboundAssignment({ plans, employees, action }) {
  const [planId, setPlanId] = useState(''); const [buyerId, setBuyerId] = useState(''); const [receiverId, setReceiverId] = useState(''); const [busy, setBusy] = useState(false);
  const unique = [...new Map(plans.map((r) => [r.planId, r])).values()]; const plan = unique.find((r) => r.planId === planId);
  return <form className="owner-filters" onSubmit={async (e) => { e.preventDefault(); if (!plan) return; setBusy(true); await action(`inbound/${planId}/assignment`, { buyerId, receiverId, revision: plan.revision }); setBusy(false); }}>
    <WmsField>Kế hoạch nhập<WmsSelect required value={planId} onChange={(e) => setPlanId(e.target.value)}><option value="">Chọn kế hoạch</option>{unique.map((r) => <option value={r.planId} key={r.planId}>{r.planCode}</option>)}</WmsSelect></WmsField>
    {[['Người mua', buyerId, setBuyerId], ['Người nhận nguyên liệu', receiverId, setReceiverId]].map(([label, value, setter]) => <WmsField key={label}>{label}<WmsSelect required value={value} onChange={(e) => setter(e.target.value)}><option value="">Chọn nhân viên</option>{employees.map((r) => <option value={r.id} key={r.id}>{r.name}</option>)}</WmsSelect></WmsField>)}<WmsButton type="submit" disabled={busy}>Lưu phân công</WmsButton></form>;
}
// Phản hồi 8; GBR-14: Phiếu chi trả nợ ở cuối thanh điều hướng, luôn gắn hợp đồng nguồn.
function PaymentForm({ debts, action }) {
  const [form, setForm] = useState({ contractId: '', amount: '', paymentMethod: 'BANK_TRANSFER', note: '' }); const [busy, setBusy] = useState(false);
  const contract = debts.find((r) => r.id === form.contractId);
  return <><DebtShare rows={debts} /><Table headings={['Hợp đồng', 'Nhà cung cấp', 'Đã trả', 'Còn nợ']} empty={!debts.length}>{debts.map((r) => <tr key={r.id}><td>{r.code}</td><td>{r.supplier}</td><td>{money(r.paid)}</td><td>{money(r.debt)}</td></tr>)}</Table>
    <form className="owner-filters" onSubmit={async (e) => { e.preventDefault(); setBusy(true); await action('payments', { ...form, amount: Number(form.amount) }, 'post'); setBusy(false); }}><WmsField>Hợp đồng cần trả nợ<WmsSelect required value={form.contractId} onChange={(e) => setForm({ ...form, contractId: e.target.value })}><option value="">Chọn hợp đồng</option>{debts.filter((r) => r.debt > 0).map((r) => <option key={r.id} value={r.id}>{r.code} · {r.supplier}</option>)}</WmsSelect></WmsField>
    <WmsField>Số tiền trả (đồng)<WmsInput type="number" min="1" max={contract?.debt || 0} step="1" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></WmsField><WmsField>Hình thức thanh toán<WmsSelect value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}><option value="BANK_TRANSFER">Chuyển khoản</option><option value="CASH">Tiền mặt</option></WmsSelect></WmsField><WmsField>Nội dung chi<WmsInput minLength={5} maxLength={500} required value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></WmsField><WmsButton type="submit" disabled={busy}>Lập phiếu chi</WmsButton></form></>;
}
// UC-19: Người quản lý nhập tỷ lệ giảm và lý do; API chặn lệnh đã phát hành và dữ liệu cũ.
function PlanForm({ order, action }) {
  const [ratio, setRatio] = useState(''); const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false);
  return <form className="owner-filters" onSubmit={async (e) => { e.preventDefault(); setBusy(true); await action(`production/${order.id}`, { expectedVersion: order.__v || 0, ratio: Number(ratio) / 100, reason }); setBusy(false); }}><WmsField>Giữ lại bao nhiêu phần trăm kế hoạch<WmsInput type="number" min="1" max="100" required value={ratio} onChange={(e) => setRatio(e.target.value)} /></WmsField><WmsField>Lý do điều chỉnh<WmsInput required minLength={5} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} /></WmsField><WmsButton type="submit" disabled={busy}>Lưu kế hoạch</WmsButton></form>;
}
function Inventory({ rows, movements }) {
  return <><Columns title="Tình trạng mặt hàng trong kho" allowDonut defaultKind="donut" unitLabel="mã hàng" rows={['AVAILABLE', 'LOW_STOCK', 'OUT_OF_STOCK'].map((s) => ({ label: labels[s], value: rows.filter((r) => r.status === s).length }))} />
    {[...new Set(rows.map((r) => r.unit))].map((unit) => <Columns key={unit} allowDonut title={`Tồn kho hiện tại · Đơn vị: ${labels[unit] || 'Chưa rõ'}`} categoryLabel="Mặt hàng" unitLabel={labels[unit] || 'Chưa rõ'} rows={rows.filter((r) => r.unit === unit).map((r) => ({ label: r.name, value: r.onHand }))} />)}
    <Table headings={['Mã hàng', 'Tên hàng', 'Đơn vị', 'Tồn thực tế', 'Giữ chỗ', 'Khả dụng', 'Cách ly', 'Giá nhập nguyên liệu']} empty={!rows.length}>{rows.map((r) => <tr key={r.id}><td>{r.code}</td><td>{r.name}</td><td>{labels[r.unit]}</td><td>{quantity(r.onHand)}</td><td>{quantity(r.reserved)}</td><td>{quantity(r.available)}</td><td>{quantity(r.quarantine)}</td><td>{money(r.price)}</td></tr>)}</Table>
    <h2>Lịch sử nhập và xuất trong kỳ</h2><Table headings={['Mã giao dịch', 'Ngày', 'Nghiệp vụ', 'Thay đổi', 'Tồn trước', 'Tồn sau']} empty={!movements.length}>{movements.map((r) => <tr key={r._id}><td>{r.transactionCode}</td><td>{datetime(r.createdAt)}</td><td>{labels[r.transactionType] || 'Chưa cập nhật'}</td><td>{quantity(r.quantityChange)}</td><td>{quantity(r.onHandBefore)}</td><td>{quantity(r.onHandAfter)}</td></tr>)}</Table></>;
}
// Phản hồi 6: Danh sách giao việc lọc theo người nhận, trạng thái và hạn trong kỳ đang chọn.
function Tasks({ data, match, action }) {
  const [form, setForm] = useState({ title: '', assigneeId: '', dueDate: todayOwner() }); const [employee, setEmployee] = useState(''); const [busy, setBusy] = useState(false);
  const rows = data.tasks.filter(match).filter((r) => !employee || r.assigneeId === employee);
  return <><form className="owner-filters" onSubmit={async (e) => { e.preventDefault(); setBusy(true); await action('tasks', form, 'post'); setBusy(false); }}><WmsField>Nội dung công việc<WmsInput minLength={5} maxLength={200} required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></WmsField><WmsField>Người nhận<WmsSelect required value={form.assigneeId} onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}><option value="">Chọn nhân viên</option>{data.employees.map((r) => <option value={r.id} key={r.id}>{r.name}</option>)}</WmsSelect></WmsField><WmsField>Hạn hoàn thành<WmsInput type="date" required value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></WmsField><WmsButton type="submit" disabled={busy}>Giao việc</WmsButton></form>
    <WmsField>Lọc theo người nhận<WmsSelect value={employee} onChange={(e) => setEmployee(e.target.value)}><option value="">Tất cả nhân viên</option>{data.employees.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</WmsSelect></WmsField>
    <Columns title="Tiến độ công việc" allowDonut defaultKind="donut" unitLabel="công việc" rows={['NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED'].map((s) => ({ label: labels[s], value: rows.filter((r) => r.status === s).length }))} />
    <Table headings={['Công việc', 'Người nhận', 'Hạn', 'Trạng thái']} empty={!rows.length}>{rows.map((r) => <tr key={r._id}><td>{r.title}</td><td>{r.assigneeName}</td><td>{datetime(r.dueDate)}</td><td><WmsSelect aria-label={`Trạng thái công việc ${r.title}`} disabled={busy} value={r.status} onChange={async (e) => { setBusy(true); await action(`tasks/${r._id}`, { status: e.target.value, revision: r.revision }); setBusy(false); }}>{['NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED'].map((s) => <option key={s} value={s}>{labels[s]}</option>)}</WmsSelect></td></tr>)}</Table></>;
}

// Nguyễn Ngọc Huy-HE171157, 2-11-2026: UC-12/13 - Tròn thể hiện hai phần thanh toán không trùng nhau trong tổng giá trị hợp đồng.
function DebtShare({ rows }) {
 return <Columns title="Tỷ trọng thanh toán nhà cung cấp" currency allowDonut defaultKind="donut" rows={[{ label: 'Đã thanh toán', value: rows.reduce((s, r) => s + r.paid, 0) }, { label: 'Còn nợ', value: rows.reduce((s, r) => s + r.debt, 0) }]} />;
}
