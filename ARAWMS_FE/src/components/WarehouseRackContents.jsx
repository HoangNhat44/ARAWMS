/*
 * File: WarehouseRackContents.jsx
 * Author: Duy Anh
 * Date: 2026-10-28
 * Description: Shows current stock and reserved putaway space for one rack. Loads unit barcodes in pages only when a manager opens a bin.
 */
import { useEffect, useRef, useState } from 'react';
import { warehousePutawayService as api } from '../services/warehousePutawayService';

/** Uses current unit locations for actual stock and confirmed allocation lines for pending work. */
export default function WarehouseRackContents({ rackId, notify, requestConfirm }) {
  const refreshPending = useRef(false);
  const refreshQueued = useRef(false);
  const unitsPending = useRef(false);
  const [contents, setContents] = useState(null);
  const [issues, setIssues] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [unitPage, setUnitPage] = useState(null);
  const [selectedBinId, setSelectedBinId] = useState('');
  const [busy, setBusy] = useState(false);

  /** Refreshes data when the rack opens or the manager requests an update. */
  const refresh = async () => {
    if (refreshPending.current) { refreshQueued.current = true; return; }
    refreshPending.current = true;
    setBusy(true);
    try {
      const [rack, reports, incidentsResponse] = await Promise.all([
        api.rackContents(rackId), api.issues(), api.incidents()]);
      setContents(rack.data.contents); setIssues(reports.data.issues);
      setIncidents(incidentsResponse.data.incidents);
    } catch (err) { notify(err.response?.data?.message || err.message, 'error'); }
    finally {
      refreshPending.current = false; setBusy(false);
      if (refreshQueued.current) { refreshQueued.current = false; queueMicrotask(() => refresh()); }
    }
  };
  useEffect(() => { refresh(); }, [rackId]);
  useEffect(() => {
    const update = (event) => { if (event.detail?.warehouseType === 'FINISHED_GOODS') refresh(); };
    window.addEventListener('arawms-putaway-realtime', update);
    return () => window.removeEventListener('arawms-putaway-realtime', update);
  }, [rackId]);

  /** Retrieves one page of barcodes, employee names, and scan times for the selected bin. */
  const openBin = async (binId, page = 1) => {
    if (unitsPending.current) return;
    unitsPending.current = true;
    setSelectedBinId(binId); setBusy(true);
    try { setUnitPage((await api.binUnits(binId, page)).data.page); }
    catch (err) { notify(err.response?.data?.message || err.message, 'error'); }
    finally { unitsPending.current = false; setBusy(false); }
  };

  const resolve = async (issue, accept) => {
    setBusy(true);
    try {
      await api.resolveIssue(issue.allocationId, issue.lineId, accept);
      notify(accept ? 'Đã xác nhận số lượng hàng thiếu.' : 'Đã trả lại yêu cầu để tiếp tục xếp hàng.');
      await refresh();
    } catch (err) { notify(err.response?.data?.message || err.message, 'error'); setBusy(false); }
  };

  const reviewIncident = async (incident) => {
    const note = window.prompt('Ghi kết quả xử lý sự cố:');
    if (!note?.trim()) return;
    requestConfirm({ title: 'Xác nhận xử lý sự cố',
      message: `Ghi nhận sự cố ${incident.barcode || 'xếp hàng'} đã được xử lý?`, label: 'Xác nhận xử lý',
      run: async () => {
        setBusy(true);
        try {
          await api.reviewIncident(incident._id, note.trim());
          notify('Đã ghi nhận kết quả xử lý sự cố.');
          await refresh();
        } catch (err) { notify(err.response?.data?.message || err.message, 'error'); setBusy(false); }
      } });
  };

  return <div className="layout-contents">
    <div className="layout-contents-title"><h3>Hàng trong kệ</h3>
      <button type="button" disabled={busy} onClick={refresh}>Làm mới</button></div>
    {contents && <>
      <div className="layout-contents-stats">
        <span>Tổng hàng thực tế trong kệ <strong>{contents.actual} chiếc</strong></span>
        <span>SKU có hàng <strong>{contents.skuCount}</strong></span>
        <span>Chờ xếp <strong>{contents.pending} chiếc</strong></span>
        <span>Còn chỗ <strong>{contents.available} chiếc</strong></span>
      </div>
      <h4 className="layout-bin-list-title">Số lượng hàng theo từng ô của kệ</h4>
      <div className="layout-contents-list">{contents.bins.map((bin) => <div key={bin.binId}
        className="layout-contents-bin"><div className="layout-bin-heading"><div><strong>Tầng {bin.floorNo} · Ô {String(bin.binNo).padStart(2, '0')}</strong>
          <small>{bin.locationCode}</small></div><div className="layout-bin-total">Thực tế trong ô <strong>{bin.actual} chiếc</strong>
            <small>{bin.pending} chiếc chờ xếp · Sức chứa {bin.capacity} chiếc</small></div></div>
        {bin.products.length ? bin.products.map((row) => <div key={row.skuId}
          className="layout-contents-row"><span><strong>{row.productName || row.skuCode}</strong>
            <small>{row.skuCode}{row.color ? ` · ${row.color}` : ''}{row.size ? ` · ${row.size}` : ''}</small></span>
          <span><strong>{row.actual} chiếc thực tế</strong><small>{row.pending} chiếc chờ xếp</small></span></div>)
          : <p>Chưa có hàng trong ô.</p>}
        <button type="button" disabled={busy} onClick={() => openBin(bin.binId)}>
          Xem barcode từng chiếc</button></div>)}</div>
    </>}
    {unitPage && <div className="layout-unit-page">
      <div className="layout-contents-title"><h4>Barcode tại {unitPage.bin}</h4>
        <button type="button" onClick={() => { setUnitPage(null); setSelectedBinId(''); }}>Đóng</button></div>
      {unitPage.units.map((unit) => <div key={unit.barcode} className="layout-unit-row">
        <code>{unit.barcode}</code><span>{unit.placedBy || 'Chưa có lần quét xếp hàng'}</span>
        <small>{unit.placedAt ? new Date(unit.placedAt).toLocaleString('vi-VN') : ''}</small>
      </div>)}
      <div className="layout-contents-title"><span>Trang {unitPage.page} · {unitPage.total} chiếc</span>
        <div><button type="button" disabled={busy || unitPage.page <= 1}
          onClick={() => openBin(selectedBinId, unitPage.page - 1)}>Trước</button>
          <button type="button" disabled={busy || unitPage.page * unitPage.limit >= unitPage.total}
            onClick={() => openBin(selectedBinId, unitPage.page + 1)}>Sau</button></div></div>
    </div>}
    {!!issues.length && <div className="layout-issues"><h3>Báo thiếu chờ xử lý</h3>
      {issues.map((issue) => <article key={`${issue.allocationId}:${issue.lineId}`}>
        <strong>{issue.skuCode} · {issue.locationCode}</strong>
        <span>Thiếu {issue.quantity} chiếc · {issue.reason}</span>
        <div><button type="button" disabled={busy} onClick={() => requestConfirm({
          title: 'Xác nhận trả lại yêu cầu',
          message: `Trả ${issue.quantity} chiếc ${issue.skuCode} tại ${issue.locationCode} để tiếp tục xếp hàng?`,
          label: 'Xác nhận trả lại', run: () => resolve(issue, false),
        })}>
          Trả lại để xếp tiếp</button>
          <button type="button" disabled={busy} onClick={() => requestConfirm({
            title: 'Xác nhận hàng thiếu',
            message: `Xác nhận thiếu ${issue.quantity} chiếc ${issue.skuCode} tại ${issue.locationCode}?`,
            label: 'Xác nhận thiếu', run: () => resolve(issue, true),
          })}>
            Xác nhận thiếu</button></div>
      </article>)}
    </div>}
    {!!incidents.length && <div className="layout-issues"><h3>Sự cố chờ xử lý</h3>
      {incidents.map((incident) => <article key={incident._id}>
        <strong>{incident.barcode || 'Sự cố xếp hàng'}</strong>
        <span>{incident.reason}</span><small>{incident.reportedBy}</small>
        <button type="button" disabled={busy} onClick={() => reviewIncident(incident)}>
          Ghi nhận đã xử lý</button></article>)}
    </div>}
  </div>;
}
