/*
 * File: WarehouseRackContents.jsx
 * Author: Duy Anh
 * Date: 2026-10-28
 * Description: Shows current stock and reserved putaway space for one rack. Loads unit barcodes in pages only when a manager opens a bin.
 */
import { useEffect, useRef, useState } from 'react';
import { warehousePutawayService as api } from '../services/warehousePutawayService';
import { MATERIAL_UNIT_OPTIONS } from '../utils/materialUnits';
import { code128Svg } from '../utils/barcodePrint';

/** Shows the scannable Code 128 image next to the typed code; invalid codes fall back to text only. */
function UnitBarcode({ value }) {
  let src = '';
  try { src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(code128Svg(String(value || '').toUpperCase()))}`; }
  catch { src = ''; }
  return <div className="layout-unit-codes">
    <span><small>Mã nhập tay</small><code>{value}</code></span>
    {src ? <img src={src} alt={`Barcode ${value}`} /> : <small>Không tạo được ảnh barcode cho mã này</small>}
  </div>;
}

const unitShort = new Map(MATERIAL_UNIT_OPTIONS.map((option) => [option.value, option.shortLabel]));
const qty = (value, unit) => `${Number(value || 0).toLocaleString('vi-VN', { maximumFractionDigits: 3 })} ${
  unitShort.get(String(unit || '').toUpperCase()) || String(unit || '').toLowerCase()}`.trim();

/** Raw-material bins hold rolls and lots in their own units instead of counted finished-goods pieces. */
function MaterialBin({ bin, busy, onOpen }) {
  return <div className="layout-contents-bin"><div className="layout-bin-heading"><div>
    <strong>Tầng {bin.floorNo} · Ô {String(bin.binNo).padStart(2, '0')}</strong><small>{bin.locationCode}</small></div>
    <div className="layout-bin-total">Vật tư trong ô <strong>{bin.materials.filter((row) => row.actual > 0).length} loại</strong>
      <small>Sức chứa {Number(bin.capacity || 0).toLocaleString('vi-VN')} · Còn trống {Number(bin.available || 0).toLocaleString('vi-VN')}</small></div></div>
    {bin.materials.length ? bin.materials.map((row) => <div key={String(row.rawMaterialId)}
      className="layout-contents-row"><span><strong>{row.materialName || row.materialCode || 'Vật tư không còn trong danh mục'}</strong>
        <small>{row.materialCode}{row.color ? ` · ${row.color}` : ''}
          {row.rollCount ? ` · ${row.rollCount} cuộn vải` : ''}{row.lotCount ? ` · ${row.lotCount} lô` : ''}</small></span>
      <span><strong>{qty(row.actual, row.unit)} thực tế</strong>
        <small>{qty(row.pending, row.unit)} chờ xếp</small></span></div>)
      : <p>Chưa có nguyên phụ liệu trong ô.</p>}
    <button type="button" disabled={busy} onClick={() => onOpen(bin.binId)}>Xem barcode cuộn / lô</button></div>;
}

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
    // Material receipts and outbound picks change what sits on raw-material shelves.
    const materialEvents = ['arawms-material-request-realtime', 'arawms-material-outbound-realtime'];
    window.addEventListener('arawms-putaway-realtime', update);
    materialEvents.forEach((name) => window.addEventListener(name, refresh));
    return () => {
      window.removeEventListener('arawms-putaway-realtime', update);
      materialEvents.forEach((name) => window.removeEventListener(name, refresh));
    };
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
    {contents?.warehouseType === 'RAW_MATERIAL' && <>
      <div className="layout-contents-stats">
        <span>Loại vật tư có hàng <strong>{contents.materialCount}</strong></span>
        <span>Cuộn vải <strong>{contents.rollCount}</strong></span>
        <span>Lô phụ liệu <strong>{contents.lotCount}</strong></span>
        <span>Còn chỗ <strong>{Number(contents.available || 0).toLocaleString('vi-VN')}</strong></span>
      </div>
      <h4 className="layout-bin-list-title">Nguyên phụ liệu theo từng ô của kệ</h4>
      <div className="layout-contents-list">{contents.bins.map((bin) =>
        <MaterialBin key={bin.binId} bin={bin} busy={busy} onOpen={openBin} />)}</div>
    </>}
    {contents && contents.warehouseType !== 'RAW_MATERIAL' && <>
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
      {unitPage.warehouseType === 'RAW_MATERIAL'
        ? unitPage.units.map((unit, index) => <div key={`${unit.barcode}:${index}`} className="layout-unit-row">
          <UnitBarcode value={unit.barcode} />
          <span>{unit.kind === 'ROLL' ? 'Cuộn vải' : 'Lô'} · {unit.materialName || unit.materialCode} · {qty(unit.quantity, unit.unit)}
            {unit.pending ? ' (chờ xếp)' : ''}</span>
          <small>{unit.placedAt ? `Nhập ${new Date(unit.placedAt).toLocaleDateString('vi-VN')}` : ''}</small>
        </div>)
        : unitPage.units.map((unit) => <div key={unit.barcode} className="layout-unit-row">
          <strong>{unit.productName || unit.skuCode || 'Sản phẩm không còn trong danh mục'}</strong>
          <small>{[unit.skuCode, unit.color, unit.size].filter(Boolean).join(' · ')}</small>
          <UnitBarcode value={unit.barcode} /><span>{unit.placedBy ?`Đang trên kệ · xếp bởi ${unit.placedBy}`
            : 'Đang trên kệ · không có lịch sử quét xếp (người/thời gian xếp không được ghi nhận)'}</span>
          <small>{unit.placedAt ? new Date(unit.placedAt).toLocaleString('vi-VN') : ''}</small>
        </div>)}
      <div className="layout-contents-title"><span>Trang {unitPage.page} · {unitPage.total} {
        unitPage.warehouseType === 'RAW_MATERIAL' ? 'cuộn / lô' : 'chiếc'}</span>
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
