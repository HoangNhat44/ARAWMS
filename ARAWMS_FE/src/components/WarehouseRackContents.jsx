/*
 * File: WarehouseRackContents.jsx
 * Author: Duy Anh
 * Date: 2026-10-28
 * Description: Shows current stock and reserved putaway space for one rack. Loads unit barcodes in pages only when a manager opens a bin.
 */
import { useEffect, useState } from 'react';
import { warehousePutawayService as api } from '../services/warehousePutawayService';

/** Uses current unit locations for actual stock and confirmed allocation lines for pending work. */
export default function WarehouseRackContents({ rackId }) {
  const [contents, setContents] = useState(null);
  const [issues, setIssues] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [unitPage, setUnitPage] = useState(null);
  const [selectedBinId, setSelectedBinId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  /** Refreshes data when the rack opens or the manager requests an update. */
  const refresh = async () => {
    setBusy(true); setError('');
    try {
      const [rack, reports, incidentsResponse] = await Promise.all([
        api.rackContents(rackId), api.issues(), api.incidents()]);
      setContents(rack.data.contents); setIssues(reports.data.issues);
      setIncidents(incidentsResponse.data.incidents);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  useEffect(() => { refresh(); }, [rackId]);

  /** Retrieves one page of barcodes, employee names, and scan times for the selected bin. */
  const openBin = async (binId, page = 1) => {
    setSelectedBinId(binId); setBusy(true); setError('');
    try { setUnitPage((await api.binUnits(binId, page)).data.page); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  const resolve = async (issue, accept) => {
    setBusy(true); setError('');
    try { await api.resolveIssue(issue.allocationId, issue.lineId, accept); await refresh(); }
    catch (err) { setError(err.message); setBusy(false); }
  };

  const reviewIncident = async (incident) => {
    const note = window.prompt('Ghi kết quả xử lý sự cố:');
    if (!note?.trim()) return;
    setBusy(true); setError('');
    try { await api.reviewIncident(incident._id, note.trim()); await refresh(); }
    catch (err) { setError(err.message); setBusy(false); }
  };

  return <div className="layout-contents">
    <div className="layout-contents-title"><h3>Hàng trong kệ</h3>
      <button type="button" disabled={busy} onClick={refresh}>Làm mới</button></div>
    {error && <p role="alert" className="layout-alert">{error}</p>}
    {contents && <>
      <div className="layout-contents-stats">
        <span>Thực tế <strong>{contents.actual}</strong></span>
        <span>SKU <strong>{contents.skuCount}</strong></span>
        <span>Chờ xếp <strong>{contents.pending}</strong></span>
        <span>Còn chỗ <strong>{contents.available}</strong></span>
      </div>
      <div className="layout-contents-list">{contents.bins.map((bin) => <div key={bin.binId}
        className="layout-contents-bin"><div><strong>Tầng {bin.floorNo} · Ô {String(bin.binNo).padStart(2, '0')}</strong>
          <small>{bin.locationCode}</small></div>
        {bin.products.length ? bin.products.map((row) => <div key={row.skuId}
          className="layout-contents-row"><span>{row.productName || row.skuCode}
            {row.color ? ` · ${row.color}` : ''}{row.size ? ` · ${row.size}` : ''}</span>
          <span>{row.actual} thực tế · {row.pending} chờ xếp</span></div>)
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
        <div><button type="button" disabled={busy} onClick={() => resolve(issue, false)}>
          Trả lại để xếp tiếp</button>
          <button type="button" disabled={busy} onClick={() => resolve(issue, true)}>
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
