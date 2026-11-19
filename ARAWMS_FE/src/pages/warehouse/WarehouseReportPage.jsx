/*
 * File: WarehouseReportPage.jsx
 * Author: Duy Anh
 * Date: 2026-11-19
 * Description: "Báo cáo thống kê" for the warehouse manager. Builds a warehouse statistics report for a period
 * from the system's data (finished goods, raw materials, locations, stocktakes, movements), lets the manager
 * add a comment per section, save it as a draft, preview it, and send it to the Owner. Sending freezes the
 * data for good; the Owner reads it under "Báo cáo quản lý".
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import WarehouseReportView from '../../components/reports/WarehouseReportView';
import { warehouseReportService } from '../../services/warehouseReportService';
import '../../styles/finishedGoods.css';
import '../../styles/warehouseReport.css';

const DAY = 24 * 60 * 60 * 1000;
/** Date -> "YYYY-MM-DD" in Vietnam time. */
const isoDay = (value) => new Date(new Date(value).getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
const today = () => isoDay(Date.now());
const monthStart = () => `${today().slice(0, 8)}01`;
const dayCount = (from, to) => (from && to ? Math.round((new Date(to) - new Date(from)) / DAY) + 1 : 0);
const STATUS = { DRAFT: ['Bản nháp (DRAFT)', 'draft'], SUBMITTED: ['Đã gửi Owner', 'submitted'], REVIEWED: ['Owner đã xem', 'reviewed'] };
const EMPTY_COMMENTS = { finishedGoods: '', materials: '', common: '' };

export default function WarehouseReportPage() {
  const [reports, setReports] = useState([]);
  const [report, setReport] = useState(null);
  const [comments, setComments] = useState(EMPTY_COMMENTS);
  const [dirty, setDirty] = useState(false);
  const [period, setPeriod] = useState({ periodStart: monthStart(), periodEnd: today() });
  const [busy, setBusy] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const isDraft = report?.status === 'DRAFT';

  const open = useCallback((data) => {
    setReport(data);
    setComments({ ...EMPTY_COMMENTS, ...(data?.content?.comments || {}) });
    setDirty(false);
    if (data) setPeriod({ periodStart: isoDay(data.periodStart), periodEnd: isoDay(new Date(data.periodEnd).getTime() - DAY) });
  }, []);

  const loadList = useCallback(async () => {
    const items = (await warehouseReportService.list()).data.items || [];
    setReports(items);
    return items;
  }, []);

  // Reopen the latest draft so unsent work is never lost.
  useEffect(() => {
    (async () => {
      try {
        const items = await loadList();
        const draft = items.find((item) => item.status === 'DRAFT');
        if (draft) open((await warehouseReportService.get(draft.id)).data);
      } catch (requestError) { setError(requestError.message); }
      finally { setLoading(false); }
    })();
  }, [loadList, open]);

  const run = async (label, task, success) => {
    if (busy) return;
    setBusy(label); setError(''); setMessage('');
    try {
      const data = await task();
      if (data) open(data);
      await loadList();
      if (success) setMessage(success);
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(''); }
  };

  const confirmLeave = () => !dirty || window.confirm('Nhận xét chưa được lưu. Vẫn tiếp tục?');
  const create = () => run('create', async () => (await warehouseReportService.create({ ...period, comments })).data,
    'Đã lập báo cáo nháp từ số liệu hiện tại.');
  const refresh = () => {
    if (!window.confirm('Tổng hợp lại số liệu theo kỳ đã chọn? Nhận xét đang nhập được giữ nguyên.')) return;
    run('refresh', async () => (await warehouseReportService.refresh(report.id, { ...period, comments })).data, 'Đã tổng hợp lại số liệu mới nhất.');
  };
  const save = () => run('save', async () => (await warehouseReportService.saveDraft(report.id, comments)).data, 'Đã lưu nháp.');
  const submit = () => {
    if (!window.confirm('Gửi báo cáo cho Owner? Số liệu và nhận xét sẽ bị khóa vĩnh viễn, không sửa được nữa.')) return;
    run('submit', async () => (await warehouseReportService.submit(report.id, comments)).data, 'Đã gửi báo cáo cho Owner.');
  };
  const removeDraft = () => {
    if (!window.confirm('Xóa bản nháp này?')) return;
    run('remove', async () => { await warehouseReportService.remove(report.id); open(null); return null; }, 'Đã xóa bản nháp.');
  };
  const openReport = (id) => {
    if (!confirmLeave()) return;
    setShowHistory(false);
    run('open', async () => (await warehouseReportService.get(id)).data);
  };
  const startNew = () => {
    if (!confirmLeave()) return;
    open(null); setPeriod({ periodStart: monthStart(), periodEnd: today() }); setMessage(''); setError('');
  };
  const changeComment = (key, value) => { setComments((current) => ({ ...current, [key]: value })); setDirty(true); };

  const [statusLabel, statusClass] = STATUS[report?.status] || STATUS.DRAFT;
  const periodFields = <>
    <label>Từ ngày<input type="date" value={period.periodStart} max={today()} disabled={Boolean(report && !isDraft)}
      onChange={(event) => setPeriod((current) => ({ ...current, periodStart: event.target.value }))} /></label>
    <label>Đến ngày<input type="date" value={period.periodEnd} min={period.periodStart} disabled={Boolean(report && !isDraft)}
      onChange={(event) => setPeriod((current) => ({ ...current, periodEnd: event.target.value }))} /></label>
    <span>Kỳ {dayCount(period.periodStart, period.periodEnd)} ngày</span>
  </>;

  const actions = <div className="finished-goods-main-actions">
    <button type="button" className="btn-ara-secondary" onClick={() => setShowHistory(true)}>Lịch sử báo cáo ({reports.length})</button>
    {report && <button type="button" className="btn-ara-secondary" onClick={() => setShowPreview(true)}>Xem trước</button>}
    {isDraft && <button type="button" className="btn-ara-secondary" disabled={Boolean(busy)} onClick={save}>{busy === 'save' ? 'Đang lưu…' : `Lưu nháp${dirty ? ' *' : ''}`}</button>}
    {isDraft && <button type="button" className="btn-ara-secondary" disabled={Boolean(busy)} onClick={removeDraft}>Xóa nháp</button>}
    {isDraft && <button type="button" className="btn-ara-primary" disabled={Boolean(busy)} onClick={submit}>{busy === 'submit' ? 'Đang gửi…' : 'Gửi Owner (khóa số liệu)'}</button>}
    {report && !isDraft && <button type="button" className="btn-ara-primary" onClick={startNew}>Lập báo cáo mới</button>}
  </div>;

  return <main className="finished-goods-page" style={{ padding: '1.5rem', maxWidth: '1440px', margin: '0 auto' }}>
    <nav className="product-breadcrumb" aria-label="Đường dẫn"><Link to="/">Trang chủ</Link><span>/</span><strong>Báo cáo thống kê</strong></nav>
    <div className="product-page-head finished-goods-hero">
      <div className="finished-goods-intro">
        <p className="product-eyebrow">QUẢN LÝ KHO · BÁO CÁO CHO OWNER</p>
        <h1>Báo cáo thống kê</h1>
        <p>Hệ thống tự tổng hợp số liệu kho thành phẩm, kho nguyên phụ liệu, vị trí kho, kiểm kê và nhập – xuất trong kỳ. Quản lý kho ghi nhận xét rồi gửi Owner.</p>
      </div>
      {actions}
    </div>
    {error && <p className="finished-goods-message error" role="alert">{error}</p>}
    {message && <p className="finished-goods-message success" role="status">{message}</p>}

    {loading ? <p className="fg-empty">Đang tải báo cáo…</p> : !report ? <section className="fg-stock-card wr-start">
      <div className="fg-stock-heading"><div><h2>Lập báo cáo kho</h2><p>Chọn kỳ báo cáo rồi tổng hợp số liệu. Báo cáo được lưu nháp cho tới khi gửi Owner.</p></div></div>
      <div className="wr-period" style={{ marginTop: '1rem' }}>{periodFields}</div>
      <div className="finished-goods-main-actions"><button type="button" className="btn-ara-primary" disabled={Boolean(busy) || !period.periodStart || !period.periodEnd} onClick={create}>
        {busy === 'create' ? 'Đang tổng hợp…' : 'Tổng hợp số liệu & lập báo cáo'}</button></div>
    </section> : <>
      <section className="fg-stock-card wr-info" aria-label="Thông tin báo cáo">
        <div className="fg-stock-heading"><div><h2>Lập Báo Cáo Kho · {report.code}</h2>
          <ul className="wr-meta"><li>Người lập: <strong>{report.content?.author?.name || '—'}</strong> (Quản lý kho)</li>
            <li>Thời gian lập: <strong>{new Date(report.createdAt).toLocaleString('vi-VN')}</strong></li>
            {report.submittedAt && <li>Gửi Owner: <strong>{new Date(report.submittedAt).toLocaleString('vi-VN')}</strong></li>}</ul></div>
          <span className={`fg-status ${statusClass === 'draft' ? 'empty' : 'ready'}`}>{statusLabel}</span></div>
        <div className="wr-period">{periodFields}{isDraft && <div className="finished-goods-main-actions"><button type="button" className="btn-ara-secondary" disabled={Boolean(busy)} onClick={refresh}>
          {busy === 'refresh' ? 'Đang tổng hợp…' : 'Tổng hợp lại dữ liệu'}</button></div>}</div>
        <p className="fg-stock-note" style={{ margin: 0 }}>{isDraft ? 'Số liệu tự động đóng băng vĩnh viễn khi chọn Gửi Owner. Trước đó có thể tổng hợp lại để lấy số mới nhất.'
          : 'Báo cáo đã gửi: số liệu và nhận xét đã khóa, không sửa được.'}{report.status === 'REVIEWED' && report.ownerComment ? ` Ghi chú của Owner: ${report.ownerComment}` : ''}</p>
      </section>
      <WarehouseReportView content={report.content} comments={comments} editable={isDraft} onCommentChange={changeComment} />
    </>}

    {showHistory && <div className="wr-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowHistory(false); }}>
      <aside className="wr-drawer" role="dialog" aria-modal="true" aria-label="Lịch sử báo cáo">
        <div className="wr-panel-head"><h2>Lịch sử báo cáo</h2><button type="button" className="wr-close" aria-label="Đóng" onClick={() => setShowHistory(false)}>×</button></div>
        <div className="finished-goods-main-actions" style={{ justifyContent: 'flex-start' }}><button type="button" className="btn-ara-primary" onClick={() => { setShowHistory(false); startNew(); }}>+ Lập báo cáo mới</button></div>
        {reports.length ? <ul className="wr-history">{reports.map((item) => <li key={item.id}>
          <button type="button" className={item.id === report?.id ? 'is-current' : ''} onClick={() => openReport(item.id)}>
            <strong>{item.code} · {(STATUS[item.status] || STATUS.DRAFT)[0]}</strong><span>{item.title}</span>
            <small>{item.submittedAt ? `Gửi ${new Date(item.submittedAt).toLocaleString('vi-VN')}`
              : `Lập ${new Date(item.createdAt).toLocaleString('vi-VN')}`}</small>
          </button></li>)}</ul> : <p className="fg-empty">Chưa có báo cáo nào.</p>}
      </aside>
    </div>}

    {showPreview && report && <div className="wr-preview-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowPreview(false); }}>
      <div className="wr-preview" role="dialog" aria-modal="true" aria-label="Xem trước báo cáo">
        <div className="wr-panel-head"><h2>Xem trước · {report.code}</h2><button type="button" className="wr-close" aria-label="Đóng" onClick={() => setShowPreview(false)}>×</button></div>
        <WarehouseReportView content={report.content} comments={comments} />
      </div>
    </div>}
  </main>;
}
