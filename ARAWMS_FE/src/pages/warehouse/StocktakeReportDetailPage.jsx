/*
 * File: StocktakeReportDetailPage.jsx
 * Author: Duy Anh
 * Date: 2026-11-20
 * Description: Quản lý kho xem báo cáo kiểm kê nhân viên kỹ thuật đã nộp: đối chiếu tồn chốt và thực đếm,
 * duyệt chênh lệch nhỏ, hoặc trả về và phát lệnh kiểm kê lại khi báo cáo không hợp lý.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { stocktakeService as api } from '../../services/stocktakeService';
import '../../styles/stocktake.css';

export const STOCKTAKE_STATUS = { WAITING: 'Chờ thực hiện', FROZEN_COUNTING: 'Đang kiểm', VARIANCE_REVIEW: 'Chờ duyệt',
  APPROVED_PENDING_ADJUSTMENT: 'Đã duyệt · chờ điều chỉnh', APPROVED_COMPLETED: 'Đã kết thúc',
  RECOUNT_REQUESTED: 'Đã yêu cầu kiểm lại', CANCELLED: 'Đã hủy' };
const WAREHOUSE = { RAW_MATERIAL: 'Kho nguyên phụ liệu', FINISHED_GOODS: 'Kho thành phẩm', ALL: 'Nguyên phụ liệu + thành phẩm' };
const ITEM_TYPE = { RAW_MATERIAL: 'Nguyên phụ liệu', FABRIC_ROLL: 'Cuộn vải', SKU_BATCH: 'Thành phẩm' };
const nf = (value) => (Number(value) || 0).toLocaleString('vi-VN', { maximumFractionDigits: 3 });
const vnd = (value) => (typeof value === 'number' ? `${Math.round(value).toLocaleString('vi-VN')} đ` : '—');
const when = (value) => (value ? new Date(value).toLocaleString('vi-VN') : '—');
const person = (value) => (value?.fullName ? `${value.fullName}${value.employeeCode ? ` (${value.employeeCode})` : ''}` : '—');
const signed = (value) => (value > 0 ? `+${nf(value)}` : nf(value));
const scopeOf = (s) => (s.scopeType === 'ZONE' ? `Khu ${s.zoneCode || ''}` : s.scopeType === 'RACK' ? `Kệ${s.zoneCode ? ` · khu ${s.zoneCode}` : ''}`
  : s.scopeType === 'ITEM' ? 'Một mặt hàng' : 'Toàn kho');
const errorText = (e) => e?.response?.data?.message || e?.message || 'Có lỗi xảy ra';

export default function StocktakeReportDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [onlyVariance, setOnlyVariance] = useState(false);
  const [dialog, setDialog] = useState(null); // 'approve' | 'recount'

  const load = useCallback(async () => {
    setError('');
    try { setData((await api.report(id)).data); } catch (e) { setError(errorText(e)); }
  }, [id]);
  useEffect(() => { setData(null); setNotice(''); load(); }, [load]);

  const rows = useMemo(() => (data?.records || []).filter((row) => !onlyVariance || row.varianceQty !== 0), [data, onlyVariance]);
  const stats = useMemo(() => {
    const records = data?.records || [];
    const sum = (pick) => records.reduce((total, r) => total + (Number(pick(r)) || 0), 0);
    return { total: records.length, counted: records.filter((r) => r.scannedAt).length,
      systemQty: sum((r) => r.systemSnapshotQty),
      countedQty: sum((r) => r.actualScannedQty),
      // Thiếu = phần tồn hệ thống chưa thấy khi đếm (dòng chưa kiểm tính cả số tồn chốt); hàng thừa không bù vào.
      missingQty: sum((r) => Math.max(0, r.systemSnapshotQty - (r.scannedAt ? r.actualScannedQty : 0))) };
  }, [data]);

  if (!data) {
    return <main className="stocktake-page"><StocktakeCrumbs code="" />
      {error ? <p className="stocktake-error" role="alert">{error}</p> : <p className="stocktake-empty">Đang tải báo cáo…</p>}
      <button type="button" onClick={() => navigate('/warehouse/stocktake')}>Quay lại danh sách</button></main>;
  }
  const { stocktake: s } = data;
  const done = (message) => { setDialog(null); setNotice(message); load(); };

  return <main className="stocktake-page">
    <StocktakeCrumbs code={s.sessionCode} />
    <header className="stocktake-hero"><div><h1>Báo cáo kiểm kê {s.sessionCode}</h1>
      <p>{s.name || 'Phiên kiểm kê'} · {WAREHOUSE[s.warehouseType] || s.warehouseType} · {scopeOf(s)}</p></div>
      <div className="stocktake-actions"><span className={`stocktake-status is-${s.status}`}>{STOCKTAKE_STATUS[s.status] || s.status}</span>
        <button type="button" onClick={load}>Làm mới</button></div></header>
    {error && <p className="stocktake-error" role="alert">{error}</p>}{notice && <p className="stocktake-notice">{notice}</p>}

    {s.recountOfSessionId && <p className="stocktake-banner">Đây là phiên kiểm lại của <Link to={`/warehouse/stocktake/${s.recountOfSessionId._id}`}>{s.recountOfSessionId.sessionCode}</Link>.</p>}

    <section className="stocktake-card stocktake-info">
      <div><small>Người kiểm (kỹ thuật xưởng)</small><strong>{person(s.inspectorId)}</strong></div>
      <div><small>Người duyệt được giao</small><strong>{person(s.approverId)}</strong></div>
      <div><small>Lịch kiểm</small><strong>{when(s.scheduledAt)}</strong><small>Hạn {when(s.dueAt)}</small></div>
      <div><small>Tiến độ đếm</small><strong>{nf(stats.counted)}/{nf(stats.total)} dòng</strong></div>
      {s.submissionInfo?.submittedAt && <div className="wide"><small>Nhân viên kỹ thuật nộp lúc {when(s.submissionInfo.submittedAt)}</small>
        {s.submissionInfo.note ? <p className={`stocktake-pre${s.submissionInfo.hasIssues ? ' stocktake-warn' : ''}`}>Ghi chú: {s.submissionInfo.note}</p>
          : <p>Kết quả khớp hoàn toàn, không có ghi chú.</p>}</div>}
      {s.instructions && <div className="wide"><small>Hướng dẫn</small><p className="stocktake-pre">{s.instructions}</p></div>}
    </section>

    <section className="stocktake-metrics">
      <Metric label="Số lượng đạt" value={nf(stats.systemQty)} hint="Tổng sản phẩm trên kho / ô kệ theo hệ thống" />
      <Metric label="Số lượng được kiểm" value={nf(stats.countedQty)} hint={`${nf(stats.counted)}/${nf(stats.total)} dòng đã đếm`} />
      <Metric label="Thiếu / chưa kiểm" value={nf(stats.missingQty)} hint="Có trên hệ thống nhưng chưa đếm thấy" tone={stats.missingQty ? 'is-short' : ''} />
    </section>

    <section className="stocktake-card">
      <div className="stocktake-table-head"><h2>Chi tiết từng dòng</h2>
        <label className="stocktake-check"><input type="checkbox" checked={onlyVariance} onChange={(e) => setOnlyVariance(e.target.checked)} />Chỉ hiện dòng lệch</label></div>
      {data.missingCost && <p className="stocktake-warn">Có dòng chưa có đơn giá nên chưa tính được giá trị chênh lệch. Cần bổ sung đơn giá trước khi duyệt.</p>}
      {data.records.some((r) => r.costBasis === 'CURRENT_MASTER_COST') && <p className="stocktake-warn">Một số dòng chưa chốt đơn giá lúc kiểm; báo cáo đang dùng giá danh mục hiện tại.</p>}
      <div className="stocktake-table"><table><thead><tr><th>Vị trí</th><th>Mặt hàng</th><th>Tồn chốt</th><th>Thực đếm</th><th>Chênh lệch</th><th>Hỏng</th><th>Đơn giá</th><th>Tồn lâu</th><th>Thời điểm đếm</th><th>Điều chỉnh</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.id} className={row.varianceQty ? 'has-variance' : ''}>
          <td>{row.locationCode || '—'}</td>
          <td><strong>{row.itemName || row.barcode}</strong><small>{ITEM_TYPE[row.itemType] || row.itemType} · {row.barcode}</small></td>
          <td>{nf(row.systemSnapshotQty)}{row.unit ? ` ${row.unit}` : ''}</td><td>{nf(row.actualScannedQty)}</td>
          <td className={row.varianceQty > 0 ? 'is-over' : row.varianceQty < 0 ? 'is-short' : ''}>{signed(row.varianceQty)}</td>
          <td>{row.damagedQty ? <><span className="is-short">{nf(row.damagedQty)}</span>{row.conditionNote && <small>{row.conditionNote}</small>}</> : '—'}</td>
          <td>{vnd(row.unitCost)}</td><td>{row.isAgingThresholdExceeded ? `${nf(row.agingDaysAtCount)} ngày` : 'Không'}</td>
          <td>{row.scannedAt ? when(row.scannedAt) : <span className="is-short">Chưa đếm</span>}</td>
          <td><AdjustmentCell row={row} /></td></tr>)}</tbody></table></div>
      {!rows.length && <p className="stocktake-empty">{data.records.length ? 'Không có dòng chênh lệch.' : 'Nhân viên kỹ thuật chưa ghi nhận dòng nào.'}</p>}
    </section>

    <Decision data={data} onApprove={() => setDialog('approve')} onRecount={() => setDialog('recount')} onAdjust={() => setDialog('adjust')} />
    {dialog === 'approve' && <ApproveDialog data={data} onClose={() => setDialog(null)} onDone={done} />}
    {dialog === 'adjust' && <AdjustDialog data={data} onClose={() => setDialog(null)} onDone={done} />}
    {dialog === 'recount' && <RecountDialog data={data} onClose={() => setDialog(null)} onDone={done} />}
  </main>;
}

function StocktakeCrumbs({ code }) {
  return <nav className="stocktake-crumbs"><Link to="/">Trang chủ</Link> / <Link to="/warehouse/stocktake">Kiểm kê kho</Link>{code ? ` / ${code}` : ''}</nav>;
}
function Metric({ label, value, hint, tone = '' }) {
  return <div className="stocktake-metric"><small>{label}</small><strong className={tone}>{value}</strong>{hint && <small>{hint}</small>}</div>;
}

const REASON = { DAMAGED: 'Hỏng', LOST: 'Thất lạc' };
const ADJUST_PLAN = { WRITE_OFF: 'Loại khỏi kho', QTY_ADJUST: 'Chỉnh số lượng', MANUAL: 'Xử lý thủ công' };
/** Dòng này sẽ được / đã được điều chỉnh thế nào. */
function AdjustmentCell({ row }) {
  const done = row.adjustment;
  if (done) {
    if (done.action === 'NONE') return '—';
    return <><strong className={done.action === 'MANUAL' ? '' : 'is-short'}>{ADJUST_PLAN[done.action]}{done.action === 'QTY_ADJUST' ? ` ${signed(done.quantity)}` : ''}</strong>
      {done.reason && <small>{REASON[done.reason]}</small>}{done.note && <small>{done.note}</small>}</>;
  }
  const plan = row.plan;
  if (!plan || plan.kind === 'NONE') return '—';
  return <span className="stocktake-plan">Sẽ {ADJUST_PLAN[plan.kind].toLowerCase()}{plan.kind === 'QTY_ADJUST' ? ` ${signed(plan.quantity)}` : ''}
    {plan.defaultReason && <small>{REASON[plan.defaultReason]}</small>}</span>;
}

function Decision({ data, onApprove, onRecount, onAdjust }) {
  const { stocktake: s } = data;
  if (s.status === 'VARIANCE_REVIEW') {
    const issues = reportIssues(data);
    return <section className="stocktake-card stocktake-decision"><div><h2>Xử lý báo cáo</h2>
      <p>Báo cáo chấp nhận được thì duyệt, kể cả khi còn lệch. Nếu số đếm bất thường (nghi đếm nhầm, sót cả kệ) thì trả về và phát lệnh kiểm kê lại cho nhân viên kỹ thuật.</p>
      {issues.length > 0 && <ul className="stocktake-warn stocktake-issues">{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>}</div>
      <div className="stocktake-actions"><button type="button" disabled={!data.canRequestRecount} onClick={onRecount}>Yêu cầu kiểm kê lại</button>
        <button type="button" className="primary" disabled={!data.canApprove} onClick={onApprove}>Duyệt báo cáo</button></div></section>;
  }
  if (s.status === 'RECOUNT_REQUESTED') {
    const info = s.recountInfo || {};
    return <section className="stocktake-card stocktake-decision"><div><h2>Đã trả về để kiểm kê lại</h2>
      <p>{person(info.requestedByUserId)} · {when(info.requestedAt)}</p><p className="stocktake-pre">Lý do: {info.reason || '—'}</p>
      {info.recountSessionId && <p>Phiên kiểm lại: <Link to={`/warehouse/stocktake/${info.recountSessionId._id}`}>{info.recountSessionId.sessionCode}</Link> · {STOCKTAKE_STATUS[info.recountSessionId.status] || info.recountSessionId.status}</p>}</div></section>;
  }
  if (s.approvalInfo?.approvedAt) {
    const info = s.approvalInfo;
    return <section className="stocktake-card stocktake-decision"><div><h2>Đã duyệt</h2>
      <p>{person(info.approvedByUserId)} · {when(info.approvedAt)} · {info.approvalLevelRequired === 'MAJOR_OWNER' ? 'Owner duyệt' : 'Quản lý kho duyệt'}</p>
      {(info.exceededThreshold || info.uncountedCount > 0 || info.missingCost) && <p className="stocktake-warn">Duyệt khi báo cáo còn vấn đề:
        {[info.exceededThreshold && ' vượt ngưỡng', info.uncountedCount > 0 && ` ${nf(info.uncountedCount)} dòng chưa đếm`, info.missingCost && ' thiếu đơn giá'].filter(Boolean).join(',')}.</p>}
      <p className="stocktake-pre">Lý do: {info.adjustmentReason || '—'}</p>
      {info.agingStockActionPlan && <p className="stocktake-pre">Kế hoạch tồn lâu: {info.agingStockActionPlan}</p>}
      {s.status === 'APPROVED_PENDING_ADJUSTMENT' && <p className="stocktake-warn">Tồn kho chưa thay đổi; bấm "Điều chỉnh tồn kho" để áp dụng kết quả kiểm kê.</p>}
      {s.adjustmentInfo?.adjustedAt && <p>Đã điều chỉnh tồn: {person(s.adjustmentInfo.adjustedByUserId)} · {when(s.adjustmentInfo.adjustedAt)} — loại khỏi kho {nf(s.adjustmentInfo.writtenOffUnits)} chiếc,
        chỉnh số lượng {nf(s.adjustmentInfo.quantityAdjustedLines)} dòng{s.adjustmentInfo.manualLines ? `, ${nf(s.adjustmentInfo.manualLines)} dòng cần xử lý thủ công` : ''}.</p>}</div>
      {data.canAdjust && <div className="stocktake-actions"><button type="button" className="primary" onClick={onAdjust}>Điều chỉnh tồn kho</button></div>}</section>;
  }
  if (['WAITING', 'FROZEN_COUNTING'].includes(s.status)) {
    return <section className="stocktake-card stocktake-decision"><p>Nhân viên kỹ thuật chưa nộp báo cáo. Số liệu trên là kết quả đã ghi nhận đến lúc này.</p></section>;
  }
  return null;
}

function Dialog({ title, subtitle, busy, error, onClose, onSubmit, submitLabel, children, wide = false }) {
  return <div className="stocktake-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
    <form className={`stocktake-modal ${wide ? '' : 'stocktake-modal-sm'}`} onSubmit={onSubmit}>
      <header><div><h2>{title}</h2><p>{subtitle}</p></div><button type="button" aria-label="Đóng" disabled={busy} onClick={onClose}>×</button></header>
      <div className="stocktake-form-body"><section className="stocktake-card">{error && <p className="stocktake-error wide" role="alert">{error}</p>}{children}</section></div>
      <footer><button type="button" disabled={busy} onClick={onClose}>Quay lại</button><button className="primary" disabled={busy}>{busy ? 'Đang lưu…' : submitLabel}</button></footer>
    </form></div>;
}

// Những điểm "chưa đúng hết" của báo cáo: không chặn duyệt, chỉ để quản lý kho thấy trước khi quyết định.
function reportIssues(data) {
  const issues = [];
  if (data.uncountedCount) issues.push(`Còn ${nf(data.uncountedCount)} dòng chưa đếm — khi duyệt sẽ được tính là thiếu.`);
  if (data.summary && data.ownerRequired) issues.push(`Chênh lệch ${nf(data.summary.absoluteQuantity)} vượt ngưỡng ${nf(data.thresholds.quantity)} hoặc có hàng tồn lâu.`);
  if (data.missingCost) issues.push('Có dòng chưa có đơn giá nên chưa tính được giá trị chênh lệch.');
  return issues;
}

function ApproveDialog({ data, onClose, onDone }) {
  const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const submit = async (event) => {
    event.preventDefault();
    if (reason.trim().length < 10) { setError('Lý do duyệt cần ít nhất 10 ký tự.'); return; }
    setBusy(true); setError('');
    try {
      const res = await api.approve(data.stocktake.id, { expectedVersion: data.stocktake.approvalRevision || 0, reportHash: data.reportHash, adjustmentReason: reason });
      onDone(res.message || 'Đã duyệt báo cáo.');
    } catch (e) { setError(errorText(e)); setBusy(false); }
  };
  const issues = reportIssues(data);
  return <Dialog title={`Duyệt báo cáo ${data.stocktake.sessionCode}`} subtitle={data.summary ? `Tổng chênh lệch ${nf(data.summary.absoluteQuantity)} · ${vnd(data.summary.absoluteValue)}` : 'Chưa tính được giá trị chênh lệch.'}
    busy={busy} error={error} onClose={onClose} onSubmit={submit} submitLabel="Xác nhận duyệt">
    {issues.length > 0 && <ul className="wide stocktake-warn stocktake-issues">{issues.map((issue) => <li key={issue}>{issue}</li>)}
      <li>Bạn vẫn có thể duyệt; các điểm này được lưu cùng quyết định duyệt.</li></ul>}
    {data.stocktake.submissionInfo?.note && <p className="wide stocktake-pre">Ghi chú của nhân viên kỹ thuật: {data.stocktake.submissionInfo.note}</p>}
    <label className="wide">Lý do duyệt *<textarea required minLength={10} maxLength={2000} value={reason} disabled={busy} onChange={(e) => setReason(e.target.value)}
      placeholder="Ví dụ: hao hụt nhỏ do đo lại cuộn vải, đã đối chiếu với phiếu xuất" /></label>
    <p className="wide">Duyệt chưa làm thay đổi tồn kho; phiên chuyển sang chờ điều chỉnh.</p>
  </Dialog>;
}

function AdjustDialog({ data, onClose, onDone }) {
  const lines = data.records.filter((row) => row.plan && row.plan.kind !== 'NONE');
  const [choice, setChoice] = useState(() => Object.fromEntries(lines.map((row) => [row.id, { reason: row.plan.defaultReason, note: '' }])));
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const auto = lines.filter((row) => row.plan.kind !== 'MANUAL');
  const set = (rowId, patch) => setChoice((current) => ({ ...current, [rowId]: { ...current[rowId], ...patch } }));
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const payload = auto.map((row) => ({ recordId: row.id, ...(row.plan.defaultReason && !row.plan.reasonFixed ? { reason: choice[row.id].reason } : {}),
        ...(choice[row.id].note.trim() ? { note: choice[row.id].note.trim() } : {}) }));
      const res = await api.adjust(data.stocktake.id, { expectedVersion: data.stocktake.approvalRevision || 0, lines: payload });
      onDone(res.message || 'Đã điều chỉnh tồn kho.');
    } catch (e) { setError(errorText(e)); setBusy(false); }
  };
  return <Dialog title={`Điều chỉnh tồn kho theo ${data.stocktake.sessionCode}`} wide
    subtitle="Chiếc hàng hỏng / không đếm thấy sẽ bị loại khỏi kho; barcode vẫn tra cứu được tới lúc bị loại."
    busy={busy} error={error} onClose={onClose} onSubmit={submit} submitLabel={`Xác nhận điều chỉnh (${auto.length} dòng)`}>
    {!lines.length && <p className="wide">Số đếm khớp hệ thống, không có gì cần điều chỉnh. Xác nhận để đóng phiên.</p>}
    {lines.length > 0 && <div className="wide stocktake-table"><table className="stocktake-adjust-table"><thead><tr><th>Mặt hàng</th><th>Việc sẽ làm</th><th>Lý do</th><th>Ghi chú</th></tr></thead>
      <tbody>{lines.map((row) => <tr key={row.id}>
        <td><strong>{row.itemName || row.barcode}</strong><small>{row.barcode} · {row.locationCode || '—'}</small>
          {row.conditionNote && <small>Kỹ thuật ghi: {row.conditionNote}</small>}</td>
        <td>{row.plan.kind === 'MANUAL' ? <small>{row.plan.note}</small>
          : <>{ADJUST_PLAN[row.plan.kind]}{row.plan.kind === 'QTY_ADJUST' ? ` ${signed(row.plan.quantity)}${row.unit ? ` ${row.unit}` : ''}` : ''}</>}</td>
        <td>{row.plan.kind === 'MANUAL' || !row.plan.defaultReason ? '—' : row.plan.reasonFixed ? REASON[row.plan.defaultReason]
          : <select value={choice[row.id].reason} disabled={busy} onChange={(e) => set(row.id, { reason: e.target.value })}>
            <option value="LOST">Thất lạc</option><option value="DAMAGED">Hỏng</option></select>}</td>
        <td>{row.plan.kind === 'MANUAL' ? '—' : <input maxLength={300} value={choice[row.id].note} disabled={busy}
          placeholder="Tuỳ chọn" onChange={(e) => set(row.id, { note: e.target.value })} />}</td></tr>)}</tbody></table></div>}
    <p className="wide">Sau khi xác nhận: trừ tồn SKU, tồn lô và sức chứa ô; ghi phiếu điều chỉnh kiểm kê; phiên chuyển sang "Đã kết thúc". Không hoàn tác được.</p>
  </Dialog>;
}

function RecountDialog({ data, onClose, onDone }) {
  const s = data.stocktake;
  const today = new Date().toLocaleDateString('sv-SE');
  const [form, setForm] = useState({ reason: '', inspectorId: s.inspectorId?._id || '', date: today, startTime: '', endTime: '' });
  const [inspectors, setInspectors] = useState(s.inspectorId ? [s.inspectorId] : []);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  useEffect(() => { api.options().then((res) => { if (res.data?.inspectors?.length) setInspectors(res.data.inspectors); }).catch(() => {}); }, []);
  const submit = async (event) => {
    event.preventDefault();
    if (form.reason.trim().length < 10) { setError('Lý do kiểm kê lại cần ít nhất 10 ký tự.'); return; }
    if (!form.startTime || !form.endTime || form.endTime <= form.startTime) { setError('Chọn khung giờ kiểm kê lại: giờ kết thúc phải sau giờ bắt đầu.'); return; }
    if (new Date(`${form.date}T${form.endTime}`) <= new Date()) { setError('Khung giờ kiểm kê lại đã qua, hãy chọn giờ khác.'); return; }
    setBusy(true); setError('');
    try {
      const res = await api.recount(s.id, { expectedVersion: s.approvalRevision || 0, reason: form.reason, inspectorId: form.inspectorId, date: form.date, startTime: form.startTime, endTime: form.endTime });
      onDone(`${res.message || 'Đã phát lệnh kiểm kê lại.'} Phiên mới: ${res.data?.recount?.sessionCode || ''}`);
    } catch (e) { setError(errorText(e)); setBusy(false); }
  };
  return <Dialog title={`Yêu cầu kiểm kê lại ${s.sessionCode}`} subtitle="Báo cáo này sẽ bị trả về; hệ thống phát phiên kiểm mới cùng phạm vi vào khung giờ bạn chọn."
    busy={busy} error={error} onClose={onClose} onSubmit={submit} submitLabel="Phát lệnh kiểm lại">
    <label className="wide">Lý do báo cáo không hợp lý *<textarea required minLength={10} maxLength={1000} value={form.reason} disabled={busy}
      onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Ví dụ: kệ A-02 lệch 40%, nghi đếm sót tầng trên; cần đếm lại toàn bộ" /></label>
    <label>Người kiểm lại (kỹ thuật xưởng) *<select required value={form.inspectorId} disabled={busy} onChange={(e) => setForm({ ...form, inspectorId: e.target.value })}>
      <option value="">Chọn nhân viên kỹ thuật xưởng</option>
      {inspectors.map((p) => <option key={p._id} value={p._id}>{p.employeeCode ? `${p.employeeCode} · ` : ''}{p.fullName}</option>)}</select></label>
    <fieldset className="wide stocktake-window"><legend>Thời gian kiểm kê lại *</legend>
      <label>Ngày<input type="date" required min={today} value={form.date} disabled={busy} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
      <label>Từ giờ<input type="time" required value={form.startTime} disabled={busy} onChange={(e) => setForm({ ...form, startTime: e.target.value })} /></label>
      <label>Đến giờ<input type="time" required min={form.startTime} value={form.endTime} disabled={busy} onChange={(e) => setForm({ ...form, endTime: e.target.value })} /></label>
      <p>Nhân viên kỹ thuật và nhân viên kho sẽ nhận thông báo.{['FINISHED_GOODS', 'ALL'].includes(s.warehouseType) && ' Đóng hàng bị khóa trong khung giờ này.'}</p>
    </fieldset>
  </Dialog>;
}
