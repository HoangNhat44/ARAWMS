/* Người thực hiện: Nguyễn Ngọc Huy-HE171157 | Ngày: 2-11-2026
 * Báo cáo Owner: bộ lọc thời gian, so sánh tùy chọn, nhập hàng và tồn kho.
 * GBR-01/13: Gọi API xác thực; tồn cách ly riêng, không tính giá vốn hoặc lợi nhuận.
 */
import { useState } from 'react';
import { comparisonDates, quarterDates } from '../../utils/reportFilters';
import { useLocation } from 'react-router-dom';
import api from '../../services/api';
import { Columns, InventoryStatusChart } from './OwnerCharts';
import AnnualAnalytics, { SalesSourceChart, PeriodComparison } from './AnnualAnalytics';
import { useOwnerResource } from '../../hooks/useOwnerResource';
import { useOwnerQuery } from '../../hooks/useOwnerQuery';
import { defaultOwnerDates, dateRangeError } from '../../utils/ownerValidation';
import { ResourceState, Table, Metric, Status, money, quantity, datetime, labels, Notice } from './OwnerUI';
import { WmsButton, WmsInput, WmsSelect, WmsField, WmsLinkButton } from '../../components/ui/WmsControls';

// Các mã nguồn bán/trạng thái chỉ được đổi thành nhãn tiếng Việt ở FE; số liệu lấy từ API.
const titles = { dashboard: 'Tổng quan kinh doanh', bi: 'Báo cáo doanh thu', purchases: 'Báo cáo nhập hàng', inventory: 'Tồn kho nguyên liệu', finished: 'Tồn kho thành phẩm', payables: 'Lập phiếu chi trả nợ' };
const channelLabels = { FACEBOOK: 'Facebook', SHOPEE: 'Shopee', TIKTOK: 'TikTok', WHOLESALE: 'Bán buôn', RETAIL: 'Bán lẻ', DIRECT: 'Khách mua trực tiếp', UNKNOWN: 'Chưa rõ nguồn bán' };
const reasonLabels = { CUSTOMER_REFUSED: 'Khách không nhận hàng', INVALID_ORDER: 'Đơn hàng không hợp lệ', PRODUCT_DEFECT: 'Sản phẩm bị lỗi', OTHER: 'Lý do khác', UNKNOWN: 'Chưa rõ lý do' };
const iso = (d) => d.toISOString().slice(0, 10);
// Lùi một năm để lập kỳ đối chiếu mặc định. Ngày 29/02 được đưa về 28/02
// nếu năm đối chiếu không nhuận, tránh tự nhảy sang tháng 3.
const previousYear = (s) => {
  const d = new Date(`${s}T00:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCFullYear(d.getUTCFullYear() - 1);
  if (d.getUTCDate() !== day) d.setUTCDate(0);
  return iso(d);
};
// Khởi tạo từ đầu năm đến hôm nay theo giờ Việt Nam; ngày đối chiếu chỉ dùng khi bật so sánh.
const initial = () => { const dates = defaultOwnerDates(); return { ...dates, compareFrom: previousYear(dates.from), compareTo: previousYear(dates.to) }; };
// UC-13: Các lựa chọn tuần/tháng/quý/năm đều chuyển thành ngày rõ ràng, cho phép chọn kỳ lịch sử bất kỳ.
function preset(kind, anchor) {
  const d = new Date(`${anchor}T00:00:00Z`); const y = d.getUTCFullYear(); const m = d.getUTCMonth();
  // Tuần bắt đầu vào thứ Hai; tháng/quý/năm dùng ngày đầu và ngày cuối kỳ lịch.
  if (kind === 'week') { d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7); const end = new Date(d); end.setUTCDate(end.getUTCDate() + 6); return { from: iso(d), to: iso(end) }; }
  const start = kind === 'year' ? 0 : kind === 'quarter' ? Math.floor(m / 3) * 3 : m;
  return { from: iso(new Date(Date.UTC(y, start, 1))), to: iso(new Date(Date.UTC(y, start + (kind === 'year' ? 12 : kind === 'quarter' ? 3 : 1), 0))) };
}
// Nguyễn Ngọc Huy-HE171157, 2-11-2026: UC-12/13 - Gộp toàn bộ lựa chọn so sánh vào một bộ lọc.
/**
 * Form lọc dùng bản nháp (draft) để thay đổi ô nhập mà chưa tải lại báo cáo.
 * Bấm Áp dụng mới ghi ngày/nguồn bán/thanh toán vào URL của trang cha.
 * Tắt so sánh được áp dụng ngay để ẩn phần đối chiếu.
 */
function PeriodFilter({ value, onChange, showComparison = true }) {
  const [draft, setDraft] = useState(() => ({ from: value.from, to: value.to, compareFrom: value.compareFrom, compareTo: value.compareTo, salesChannel: value.salesChannel || '', paymentStatus: value.paymentStatus || '' }));
  const [comparing, setComparing] = useState(value.comparison === 'on');
  const [kind, setKind] = useState(value.compareMode === 'quarter' ? 'quarter' : 'custom'); const [mode, setMode] = useState(value.compareMode || 'previous-year'); const [error, setError] = useState('');
  const [quarters, setQuarters] = useState({ current: Math.floor((Number(value.from.slice(5, 7)) - 1) / 3) + 1, previous: Math.floor((Number(value.compareFrom.slice(5, 7)) - 1) / 3) + 1 });
  const changeQuarters = (next) => { setQuarters(next); const year = Number(draft.from.slice(0, 4)); const current = quarterDates(year, next.current), previous = quarterDates(year, next.previous); setDraft({ ...current, compareFrom: previous.from, compareTo: previous.to }); };
  const apply = (e) => {
    e.preventDefault();
    // Chặn ngày không tồn tại, ngày kết thúc trước ngày bắt đầu hoặc kỳ dài quá 366 ngày.
    const message = dateRangeError(draft);
    if (message) { setError(message); return; }

    // Chế độ quý tính lại đủ ranh giới quý; các chế độ còn lại giữ khoảng ngày đã nhập.
    const selectedMode = showComparison && comparing ? mode : 'previous-year';
    const current = selectedMode === 'quarter' ? quarterDates(Number(draft.from.slice(0, 4)), quarters.current) : draft;
    const previous = selectedMode === 'quarter' ? quarterDates(Number(draft.from.slice(0, 4)), quarters.previous) : null;
    const dates = {
      ...draft, ...current,
      ...(previous ? { compareFrom: previous.from, compareTo: previous.to } : comparisonDates(current, selectedMode)),
    };

    // Kiểm tra cả kỳ đối chiếu trước khi gửi bộ lọc lên trang cha; lỗi giữ nguyên form để sửa.
    const comparisonError = dateRangeError({ from: dates.compareFrom, to: dates.compareTo });
    setError(comparisonError);
    if (!comparisonError) onChange({ ...dates, compareMode: selectedMode, comparison: comparing ? 'on' : 'off' });
  };
  return <form className="owner-filters" onSubmit={apply}>
    <WmsField>Xem theo<WmsSelect value={kind} onChange={(e) => { const k = e.target.value; setKind(k); if (k !== 'custom') setDraft({ ...draft, ...preset(k, draft.from) }); }}><option value="custom">Khoảng thời gian</option><option value="week">Tuần</option><option value="month">Tháng</option><option value="quarter">Quý</option><option value="year">Năm</option></WmsSelect></WmsField>
    {[['from', 'Từ ngày'], ['to', 'Đến ngày']].map(([key, title]) => <WmsField key={key}>{title}<WmsInput type="date" required value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} /></WmsField>)}
    {showComparison && <WmsButton type="button" aria-pressed={comparing} onClick={() => { setComparing(!comparing); if (comparing) onChange({ ...value, comparison: 'off' }); }}>{comparing ? 'Tắt so sánh' : 'So sánh'}</WmsButton>}
    {showComparison && comparing && <WmsField>So sánh với<WmsSelect value={mode} onChange={(e) => { const next = e.target.value; setMode(next); if (next === 'quarter') { setKind('quarter'); changeQuarters({ current: 1, previous: 2 }); } }}><option value="previous-year">Cùng kỳ năm trước</option><option value="previous-period">Kỳ liền trước</option><option value="quarter">Quý khác trong năm</option><option value="custom">Khoảng ngày tự chọn</option></WmsSelect></WmsField>}
    {showComparison && comparing && mode === 'quarter' && [['current', 'Quý cần xem'], ['previous', 'Quý đối chiếu']].map(([key, title]) => <WmsField key={key}>{title}<WmsSelect value={String(quarters[key])} onChange={(e) => changeQuarters({ ...quarters, [key]: Number(e.target.value) })}>{[1, 2, 3, 4].map((q) => <option key={q} value={String(q)}>Quý {q}</option>)}</WmsSelect></WmsField>)}
    {showComparison && comparing && mode === 'custom' && [['compareFrom', 'So sánh từ ngày'], ['compareTo', 'So sánh đến ngày']].map(([key, title]) => <WmsField key={key}>{title}<WmsInput type="date" required value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} /></WmsField>)}
    {showComparison && <><WmsField>Nguồn bán<WmsSelect value={draft.salesChannel} onChange={(e) => setDraft({ ...draft, salesChannel: e.target.value })}><option value="">Tất cả nguồn bán</option>{Object.entries(channelLabels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</WmsSelect></WmsField><WmsField>Thanh toán<WmsSelect value={draft.paymentStatus} onChange={(e) => setDraft({ ...draft, paymentStatus: e.target.value })}><option value="">Tất cả tình trạng thanh toán</option><option value="PAID">Đã thanh toán</option><option value="UNPAID">Chưa thanh toán</option><option value="PARTIAL">Đã trả một phần</option><option value="UNKNOWN">Chưa rõ thanh toán</option></WmsSelect></WmsField></>}
    <WmsButton type="submit" className="btn-ara-primary">Áp dụng</WmsButton><Notice error={error} />
  </form>;
}
/**
 * Một trang dùng nhiều chế độ hiển thị: tổng quan, doanh thu, nhập hàng, tồn kho và phiếu chi.
 * useOwnerQuery giữ bộ lọc trong URL để tải lại/quay về từ hợp đồng vẫn giữ vị trí lọc.
 * Các chế độ chỉ lựa chọn phần dữ liệu cần hiển thị, không tự tạo số liệu mẫu ở FE.
 */
export default function OperationsPage({ mode = 'dashboard' }) {
  const location = useLocation();
  const [filters, setFilters] = useOwnerQuery({ ...initial(), search: '', status: '', unit: '', page: 1, salesChannel: '', paymentStatus: '', compareMode: 'previous-year', comparison: 'off', scope: ['purchases', 'payables'].includes(mode) ? 'all' : 'period' }); const { search, status, unit, page, ...query } = filters;
  const setQuery = (next) => setFilters({ ...filters, ...next }); const setSearch = (search) => setFilters({ ...filters, search, page: 1 }); const setStatus = (status) => setFilters({ ...filters, status, page: 1 });
  const [error, setError] = useState(''); const [success, setSuccess] = useState('');
  // Ngày, nguồn bán và thanh toán gửi tới BE; tìm kiếm/trạng thái/đơn vị lọc danh sách đã tải.
  const resource = useOwnerResource('operations-report', query); const data = resource.data;
  const matchUnit = (row) => !unit || row.unit === unit;
  const match = (row) => (!status || !row.status || row.status === status) && `${JSON.stringify(row)} ${labels[row.status] || ''}`.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi'));
  // Thao tác ghi (ví dụ lập phiếu chi) đi qua API xác thực; thành công mới tải lại báo cáo.
  const action = async (path, body, method = 'patch') => { setError(''); setSuccess(''); try { await api[method](`/owner/operations-report/${path}`, body); setSuccess('Đã lưu thay đổi.'); resource.reload(); } catch (e) { setError(e.message); } };
  return <><header className="owner-page-heading"><div><h1>{titles[mode]}</h1></div><WmsButton onClick={resource.reload}>Tải lại</WmsButton></header>
    {['purchases', 'payables'].includes(mode) && <div className="owner-filters"><WmsField>Phạm vi danh sách<WmsSelect value={query.scope} onChange={(e) => setQuery({ scope: e.target.value, page: 1 })}><option value="all">Tất cả thời gian</option><option value="period">Trong khoảng ngày</option></WmsSelect></WmsField></div>}
    {(!['purchases', 'payables'].includes(mode) || query.scope === 'period') && <PeriodFilter key={`${query.from}-${query.to}-${query.compareFrom}-${query.compareTo}-${query.compareMode}-${query.comparison}`} value={query} onChange={setQuery} showComparison={['dashboard', 'bi'].includes(mode)} />}<Notice error={error} success={success} />
    <ResourceState resource={resource}>{data && <>
      {/* Chỉ hiện kết quả đối chiếu khi Owner bật so sánh và áp dụng bộ lọc. */}
      {['dashboard', 'bi'].includes(mode) && query.comparison === 'on' && <PeriodComparison data={data} dates={query} />}
      {!['dashboard', 'bi'].includes(mode) && <div className="owner-filters"><WmsField>Tìm trong danh sách<WmsInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nhập mã hoặc tên cần tìm" /></WmsField>{!['dashboard', 'bi', 'payables'].includes(mode) && <WmsField>{mode === 'purchases' ? 'Trạng thái kế hoạch' : 'Trạng thái'}<WmsSelect value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Tất cả trạng thái</option>{[...new Set((['inventory', 'finished'].includes(mode) ? data.inventory : mode === 'purchases' ? data.purchases : []).map((r) => r.status))].filter(Boolean).map((s) => <option key={s} value={s}>{labels[s] || 'Chưa cập nhật'}</option>)}</WmsSelect></WmsField>}{['purchases', 'inventory', 'finished'].includes(mode) && <WmsField>Đơn vị tính<WmsSelect value={unit} onChange={(e) => setFilters({ ...filters, unit: e.target.value, page: 1 })}><option value="">Tất cả đơn vị</option>{['METER', 'SPOOL', 'KG', 'BOX', 'PIECE'].map((value) => <option key={value} value={value}>{labels[value]}</option>)}</WmsSelect></WmsField>}</div>}
      {/* Đếm kế hoạch theo mã để kế hoạch có nhiều nguyên liệu không bị tính lặp.
          Cảnh báo tồn kho đếm số mã hàng, không cộng lẫn số lượng mét/kg/cái. */}
      {mode === 'dashboard' && <><div className="owner-metrics"><Metric label="Kế hoạch nhập trong kỳ còn chờ hàng" value={new Set(data.purchases.filter((r) => r.planned > r.totalReceived && r.status !== 'CANCELLED').map((r) => r.planCode)).size} /><Metric label="Mặt hàng sắp hết hoặc đã hết hàng" value={data.inventory.filter((r) => ['LOW_STOCK', 'OUT_OF_STOCK'].includes(r.status)).length} /><Metric label="Hợp đồng nhà cung cấp" value={data.debts.length} /></div></>}
      {['dashboard', 'bi'].includes(mode) && <>

        {/* Các thẻ này dùng cùng kết quả sales của API; phần trăm thay đổi chỉ hiện khi bật đối chiếu. */}
        <div className="owner-metrics"><Metric label="Tổng giá trị đơn hàng trong kỳ" value={money(data.sales.orderValue)} />{query.comparison === 'on' && <Metric label="Thay đổi so với kỳ so sánh" value={data.orderValueChange === null ? 'Chưa có cơ sở so sánh' : `${quantity(data.orderValueChange)}%`} />}<Metric label="Số đơn hàng trong kỳ" value={quantity(data.sales.orders)} /><Metric label="Đơn hàng đã thanh toán" value={quantity(data.sales.paid)} /></div>

        {/* Xu hướng và số tổng cùng dùng chính xác khoảng ngày đang chọn. */}
        <AnnualAnalytics from={query.from} to={query.to} salesChannel={query.salesChannel} paymentStatus={query.paymentStatus} />

        {/* Tổng quan ghép nguồn bán và tồn kho thành hai thẻ cân nhau.
            Báo cáo doanh thu chỉ hiển thị nguồn bán trên toàn bộ chiều rộng. */}
        {mode === 'dashboard' ? <div className="owner-report-chart-grid">
          <SalesSourceChart channels={data.sales.channels} labels={channelLabels} />
          <InventoryStatusChart inventory={data.inventory} />
        </div> : <SalesSourceChart channels={data.sales.channels} labels={channelLabels} />}
        {/* Bảng chi tiết giữ đầy đủ từng nguồn bán để đối chiếu với biểu đồ phía trên. */}
        <Table headings={['Nguồn bán', 'Số đơn', 'Tổng giá trị đơn hàng', 'Đã thanh toán', 'Chưa thanh toán', 'Phí vận chuyển']} empty={!data.sales.orders}>{data.sales.channels.map((r) => <tr key={r.channel}><td>{channelLabels[r.channel]}</td><td>{r.orders}</td><td>{money(r.orderValue)}</td><td>{r.paid}</td><td><span title="Đơn chưa thanh toán hoặc chưa thanh toán đủ">{r.unpaid}</span></td><td>{money(r.shipping)}</td></tr>)}</Table>
        {/* Gom biểu đồ hàng hoàn vào vùng mở rộng để tổng quan không quá dài. */}
        <details className="owner-content-panel"><summary>Phân tích hàng hoàn trong kỳ</summary><div className="owner-report-chart-grid"><Columns title="Nguyên nhân hoàn hàng" allowDonut rows={data.sales.returnReasons.map((r) => ({ label: reasonLabels[r.reason], value: r.count }))} />
        <Columns title="Tiến độ xử lý đơn hoàn" allowDonut rows={data.returnStatuses.map((r) => ({ label: labels[r.status] || 'Chưa cập nhật', value: r.count }))} /></div></details>
      </>}
      {/* Danh sách nhập lọc theo đơn vị/trạng thái; hợp đồng tìm riêng theo mã hoặc nhà cung cấp. */}
      {mode === 'purchases' && <>
        <Table key={unit} headings={['Kế hoạch', 'Hợp đồng', 'Nhà cung cấp', 'Nguyên liệu', 'Đơn vị', 'Dự kiến về', 'Kế hoạch', 'Kiểm đạt', 'Đã nhập trong kỳ', 'Còn chờ về', 'Giá nhập', 'Người mua', 'Người nhận', 'Trạng thái']} empty={!data.purchases.filter(match).filter(matchUnit).length}>{data.purchases.filter(match).filter(matchUnit).map((r) => <tr key={r.id}><td>{r.planCode}</td><td>{r.contractCode}</td><td>{r.supplier}</td><td>{r.material}</td><td>{labels[r.unit]}</td><td>{datetime(r.scheduledDeliveryDate)}</td><td>{quantity(r.planned)}</td><td>{quantity(r.verified)}</td><td>{quantity(r.received)}</td><td>{quantity(Math.max(0, r.planned - r.totalReceived))}</td><td>{money(r.unitPrice)}</td><td>{r.buyer}</td><td>{r.receiver}</td><td><Status value={r.status} /></td></tr>)}</Table>
        <h2>Danh sách hợp đồng nhà cung cấp</h2>
        <Table headings={['Hợp đồng', 'Nhà cung cấp', 'Trạng thái', 'Số kế hoạch nhập', 'Tổng tiền', 'Đã trả', 'Còn nợ', 'Chi tiết']} empty={!data.debts.filter((row) => `${row.code} ${row.supplier} ${labels[row.status] || ''}`.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi'))).length}>{data.debts.filter((row) => `${row.code} ${row.supplier} ${labels[row.status] || ''}`.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi'))).map((r) => <tr key={r.code}><td>{r.code}</td><td>{r.supplier}</td><td><Status value={r.status} /></td><td>{r.planCount}</td><td>{money(r.total)}</td><td>{money(r.paid)}</td><td>{money(r.debt)}</td><td><WmsLinkButton to={`/owner/contracts/${r.id}`} state={{ from: location.pathname + location.search }}>Xem hợp đồng</WmsLinkButton></td></tr>)}</Table>
      </>}
      {/* Tách đúng loại kho trước khi lọc đơn vị. Lịch sử kho đối chiếu bằng ID nguyên liệu/SKU. */}
      {['inventory', 'finished'].includes(mode) && <><Inventory key={unit} rows={data.inventory.filter((r) => r.type === (mode === 'inventory' ? 'RAW_MATERIAL' : 'FINISHED_GOODS')).filter(match).filter(matchUnit)} movements={data.movements.filter((r) => r.warehouseType === (mode === 'inventory' ? 'RAW_MATERIAL' : 'FINISHED_GOODS')).filter((r) => !unit || data.inventory.some((item) => item.id === String(r.rawMaterialId || r.skuId) && matchUnit(item)))} />
        <h2>Kế hoạch xuất trong kỳ</h2><Table headings={['Mã phiếu hoặc đơn', 'Ngày dự kiến', 'Trạng thái']} empty={!(data.outboundPlans || []).filter((r) => r.type === (mode === 'inventory' ? 'RAW_MATERIAL' : 'FINISHED_GOODS')).filter(match).length}>{(data.outboundPlans || []).filter((r) => r.type === (mode === 'inventory' ? 'RAW_MATERIAL' : 'FINISHED_GOODS')).filter(match).map((r) => <tr key={r.id}><td>{r.code}</td><td>{datetime(r.date)}</td><td><Status value={r.status} /></td></tr>)}</Table></>}
      {mode === 'payables' && <PaymentForm debts={data.debts.filter((row) => `${row.code} ${row.supplier} ${labels[row.status] || ''}`.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi')))} action={action} />}

    </>}</ResourceState></>;
}
// Phản hồi 8; GBR-14: Phiếu chi trả nợ ở cuối thanh điều hướng, luôn gắn hợp đồng nguồn.
function PaymentForm({ debts, action }) {
  const [form, setForm] = useState({ contractId: '', amount: '', paymentMethod: 'BANK_TRANSFER', note: '' }); const [busy, setBusy] = useState(false);
  // Lấy dư nợ của hợp đồng đang chọn để đặt giới hạn nhập tiền; BE vẫn kiểm tra lại khi lưu.
  const contract = debts.find((r) => r.id === form.contractId);
  return <><DebtShare rows={debts} /><Table headings={['Hợp đồng', 'Nhà cung cấp', 'Đã trả', 'Còn nợ']} empty={!debts.length}>{debts.map((r) => <tr key={r.id}><td>{r.code}</td><td>{r.supplier}</td><td>{money(r.paid)}</td><td>{money(r.debt)}</td></tr>)}</Table>
    <form className="owner-filters" onSubmit={async (e) => { e.preventDefault(); setBusy(true); await action('payments', { ...form, amount: Number(form.amount) }, 'post'); setBusy(false); }}><WmsField>Hợp đồng cần trả nợ<WmsSelect required value={form.contractId} onChange={(e) => setForm({ ...form, contractId: e.target.value })}><option value="">Chọn hợp đồng</option>{debts.filter((r) => r.debt > 0 && !['DRAFT_FRAMEWORK', 'CANCELLED', 'SUPERSEDED', 'TERMINATED'].includes(r.status)).map((r) => <option key={r.id} value={r.id}>{r.code} · {r.supplier}</option>)}</WmsSelect></WmsField>
    <WmsField>Số tiền trả (đồng)<WmsInput type="number" min="1" max={contract?.debt || 0} step="1" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></WmsField><WmsField>Hình thức thanh toán<WmsSelect value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}><option value="BANK_TRANSFER">Chuyển khoản</option><option value="CASH">Tiền mặt</option></WmsSelect></WmsField><WmsField>Nội dung chi<WmsInput minLength={5} maxLength={500} required value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></WmsField><WmsButton type="submit" disabled={busy}>Lập phiếu chi</WmsButton></form></>;
}
// rows là tồn hiện tại đã lọc; movements là các bút toán nhập/xuất phát sinh trong khoảng ngày.
// Giữ hai phần riêng để không hiểu nhầm rằng số tồn hiện tại là tồn lịch sử ở cuối kỳ.
function Inventory({ rows, movements }) {
  return <><Columns title="Tình trạng mặt hàng trong kho hiện tại" allowDonut defaultKind="donut" unitLabel="mã hàng" rows={['AVAILABLE', 'LOW_STOCK', 'OUT_OF_STOCK'].map((s) => ({ label: labels[s], value: rows.filter((r) => r.status === s).length }))} />
    <Table headings={['Mã hàng', 'Tên hàng', 'Đơn vị', 'Tồn thực tế', 'Giữ chỗ', 'Khả dụng', 'Cách ly', 'Đơn giá']} empty={!rows.length}>{rows.map((r) => <tr key={r.id}><td>{r.code}</td><td>{r.name}</td><td>{labels[r.unit]}</td><td>{quantity(r.onHand)}</td><td>{quantity(r.reserved)}</td><td>{quantity(r.available)}</td><td>{quantity(r.quarantine)}</td><td>{money(r.price)}</td></tr>)}</Table>
    <h2>Lịch sử nhập và xuất trong kỳ</h2><Table headings={['Mã giao dịch', 'Ngày', 'Nghiệp vụ', 'Thay đổi', 'Tồn trước', 'Tồn sau']} empty={!movements.length}>{movements.map((r) => <tr key={r._id}><td>{r.transactionCode}</td><td>{datetime(r.createdAt)}</td><td>{labels[r.transactionType] || 'Chưa cập nhật'}</td><td>{quantity(r.quantityChange)}</td><td>{quantity(r.onHandBefore)}</td><td>{quantity(r.onHandAfter)}</td></tr>)}</Table></>;
}
// Nguyễn Ngọc Huy-HE171157, 2-11-2026: UC-12/13 - Tròn thể hiện hai phần thanh toán không trùng nhau trong tổng giá trị hợp đồng.
function DebtShare({ rows }) {
 return <Columns title="Tỷ trọng thanh toán nhà cung cấp" currency allowDonut defaultKind="donut" rows={[{ label: 'Đã thanh toán', value: rows.reduce((s, r) => s + r.paid, 0) }, { label: 'Còn nợ', value: rows.reduce((s, r) => s + r.debt, 0) }]} />;
}
