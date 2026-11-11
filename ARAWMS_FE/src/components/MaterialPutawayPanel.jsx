import React, { useEffect, useRef, useState } from 'react';
import { warehousePutawayService as api } from '../services/warehousePutawayService';

const taskKey = (item) => `${item.receiptId}:${item.objectBarcode}:${item.locationId}`;

/** Uses the saved material barcode and the allocated shelf for each physical putaway. */
export default function MaterialPutawayPanel() {
  const [tasks, setTasks] = useState([]);
  const [locations, setLocations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [destinationId, setDestinationId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [verifiedLocation, setVerifiedLocation] = useState('');
  const [code, setCode] = useState('');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pendingRetry, setPendingRetry] = useState(null);
  const [printDialog, setPrintDialog] = useState(null);
  const [printingReceiptId, setPrintingReceiptId] = useState('');
  const [cameraOn, setCameraOn] = useState(false);
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const handlerRef = useRef(null);
  const lockedRef = useRef(false);
  const lastSeenRef = useRef({ code: '', at: 0 });

  const load = async () => {
    try {
      const [taskResponse, locationResponse] = await Promise.all([api.materialTasks(), api.materialLocations()]);
      setTasks(taskResponse.data.tasks || []);
      setLocations(locationResponse.data.locations || []);
    }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  const stopCamera = () => {
    controlsRef.current?.stop(); controlsRef.current = null;
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    setCameraOn(false);
  };
  useEffect(() => () => controlsRef.current?.stop(), []);

  const openTask = (item) => {
    stopCamera(); setSelected(item); setVerifiedLocation(''); setCode('');
    setDestinationId(item.locationId || '');
    setQuantity(String(item.remainingQuantity));
    setPendingRetry(null); setError(''); setNotice('');
  };
  const closeTask = () => {
    stopCamera(); setSelected(null); setVerifiedLocation(''); setCode('');
    setPendingRetry(null); load();
  };
  const submitLocation = async (barcode) => {
    if (!selected || lockedRef.current) return;
    const clean = String(barcode || '').trim().toUpperCase();
    if (!clean) return;
    let targetLocId = destinationId;
    if (!targetLocId) {
      const match = locations.find((l) =>
        String(l.barcode || '').trim().toUpperCase() === clean ||
        String(l.code || '').trim().toUpperCase() === clean
      );
      if (match) {
        targetLocId = match.id;
        setDestinationId(match.id);
      }
    }
    if (!targetLocId && !selected.locationId) {
      setError('Vui lòng chọn kệ hoặc quét đúng mã ô kệ.');
      return;
    }
    lockedRef.current = true; setBusy(true); setError('');
    try {
      const result = await api.materialLocation({ receiptId: selected.receiptId,
        objectBarcode: selected.objectBarcode, plannedLocationId: selected.locationId,
        locationId: targetLocId || selected.locationId, barcode: clean });
      if (result.data.location?.id) {
        setDestinationId(result.data.location.id);
      }
      setVerifiedLocation(result.data.location.barcode || result.data.location.locationCode);
      setNotice(`Đúng kệ (${result.data.location.locationCode || result.data.location.code}). Quét barcode cây vải hoặc lô nguyên phụ liệu.`);
      setCode('');
    } catch (err) { setError(err.message); }
    finally { lockedRef.current = false; setBusy(false); }
  };
  const submitObject = async (barcode, retry = null) => {
    if (!selected || !verifiedLocation || lockedRef.current) return;
    lockedRef.current = true; setBusy(true); setError('');
    const request = retry || { receiptId: selected.receiptId,
      objectBarcode: selected.objectBarcode, scannedBarcode: barcode,
      locationId: destinationId, locationBarcode: verifiedLocation,
      quantity: selected.kind === 'LOT' ? Number(quantity) : undefined,
      idempotencyKey: crypto.randomUUID() };
    try {
      const response = await api.materialScan(request);
      setPendingRetry(null); setCode(''); stopCamera();
      setNotice(response.data.result.alreadyProcessed
        ? 'Mã này đã được xác nhận trước đó, không cộng tồn thêm.'
        : `Đã xếp ${response.data.result.quantity} ${selected.unit} tại ${response.data.result.locationCode}.`);
      setSelected(null); setVerifiedLocation('');
      await load();
    } catch (err) {
      if (!err.status || err.status >= 500 || err.code === 'TASK_CHANGED') {
        setPendingRetry(request);
        setError('Chưa rõ kết quả. Thử lại cùng mã thao tác để tránh cộng tồn hai lần.');
      } else {
        setError(err.code === 'WRONG_MATERIAL'
          ? `Sai nguyên phụ liệu. Cần quét ${selected.objectBarcode}.` : err.message);
      }
    } finally { lockedRef.current = false; setBusy(false); }
  };
  handlerRef.current = (barcode) => {
    if (!selected || pendingRetry || lockedRef.current) return;
    const now = Date.now();
    if (lastSeenRef.current.code === barcode && now - lastSeenRef.current.at < 3000) return;
    lastSeenRef.current = { code: barcode, at: now };
    if (verifiedLocation) submitObject(barcode);
    else submitLocation(barcode);
  };
  const startCamera = async () => {
    if (cameraOn || !selected) return;
    setError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Camera cần HTTPS hoặc localhost và quyền truy cập thiết bị.'); return;
    }
    try {
      const { BarcodeFormat, BrowserMultiFormatReader } = await import('@zxing/browser');
      const reader = new BrowserMultiFormatReader();
      reader.possibleFormats = [BarcodeFormat.CODE_128, BarcodeFormat.QR_CODE];
      controlsRef.current = await reader.decodeFromConstraints({ video: {
        facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 },
      }, audio: false }, videoRef.current, (result) => {
        if (result) handlerRef.current?.(result.getText());
      });
      setCameraOn(true);
    } catch (err) { setError(`Không mở được camera: ${err.message}`); }
  };
  /** Opens the receipt's pending rolls/lots for review; printing happens from the dialog. */
  const printReceipt = async (receipt) => {
    setPrintingReceiptId(receipt.id); setError('');
    try {
      const response = await api.materialReceiptLabels(receipt.id);
      const pendingTasks = tasks.filter((item) => item.receiptId === receipt.id);
      const pending = new Set(pendingTasks.map((item) => item.objectBarcode));
      const labels = (response.data.labels || []).filter((item) => pending.has(item.barcode))
        .map((label) => {
          const related = pendingTasks.filter((item) => item.objectBarcode === label.barcode);
          return { ...label,
            pendingQuantity: related.reduce((total, item) => total + item.remainingQuantity, 0),
            pendingUnit: related[0]?.unit || label.unit, kind: related[0]?.kind,
            targetLocations: [...new Set(related.map((item) => item.locationCode).filter(Boolean))] };
        });
      if (!labels.length) throw new Error('Phiếu không còn tem nguyên phụ liệu chờ xếp.');
      setPrintDialog({ receipt, labels, selected: labels.map((item) => item.barcode), copies: 1 });
    } catch (err) { setError(err.message); }
    finally { setPrintingReceiptId(''); }
  };
  const printSelected = async () => {
    const copies = Number(printDialog?.copies);
    if (!printDialog?.selected.length || !Number.isSafeInteger(copies) || copies < 1 || copies > 10) return;
    const tab = window.open('', '_blank');
    if (!tab) { setError('Trình duyệt đang chặn cửa sổ in tem.'); return; }
    try {
      const { printMaterialLabels } = await import('../utils/materialLabelPrint');
      const chosen = printDialog.labels.filter((item) => printDialog.selected.includes(item.barcode));
      printMaterialLabels(chosen.flatMap((item) => Array.from({ length: copies }, () => item)), tab);
      setNotice(`Đã mở ${chosen.length * copies} tem của phiếu ${printDialog.receipt.code}.`);
      setPrintDialog(null);
    } catch (err) { tab.close(); setError(err.message); }
  };
  const formatDate = (value) => {
    const date = new Date(value);
    return value && !Number.isNaN(date.getTime()) ? date.toLocaleDateString('vi-VN') : '—';
  };

  const receipts = [...new Map(tasks.map((item) => [item.receiptId,
    { id: item.receiptId, code: item.receiptCode }])).values()].map((receipt) => {
    const lines = tasks.filter((item) => item.receiptId === receipt.id);
    return { ...receipt, objectCount: new Set(lines.map((item) => item.objectBarcode)).size,
      materials: [...new Set(lines.map((item) => item.materialName || item.materialCode).filter(Boolean))],
      remaining: [...lines.reduce((sum, item) => sum.set(item.unit,
        Math.round(((sum.get(item.unit) || 0) + item.remainingQuantity) * 1000) / 1000), new Map())]
        .map(([unit, total]) => `${total} ${unit}`).join(' · ') };
  });
  const visible = tasks.filter((item) => [item.receiptCode, item.materialCode,
    item.materialName, item.objectBarcode, item.locationCode].join(' ').toLocaleLowerCase()
    .includes(query.trim().toLocaleLowerCase()));

  return <main className="putaway-page">
    <header className="putaway-page-head"><div><span className="putaway-eyebrow">KHO NGUYÊN PHỤ LIỆU / XẾP HÀNG</span>
      <h1>Xếp nguyên phụ liệu vào kệ</h1>
      <p>In barcode đã cấp, quét đúng kệ rồi quét đúng cây vải hoặc lô khi đặt hàng vào kệ.</p></div>
      <button className="putaway-button putaway-button-light" type="button" onClick={load} disabled={busy}>↻ Làm mới</button></header>
    {error && <div className="putaway-toast putaway-toast-error" role="alert">{error}
      <button type="button" onClick={() => setError('')} aria-label="Đóng lỗi">×</button></div>}
    {notice && <div className="putaway-toast" role="status">{notice}
      <button type="button" onClick={() => setNotice('')} aria-label="Đóng thông báo">×</button></div>}
    <section className="putaway-card"><div className="putaway-section-title"><div>
      <span className="putaway-step">1</span><h2>In tem hàng chờ xếp</h2>
      <span className="putaway-count">{receipts.length} phiếu</span></div>
      <p>Mỗi cây vải hoặc lô dùng barcode đã lưu trên phiếu nhập.</p></div>
      <div className="putaway-table-scroll"><table className="putaway-table"><thead><tr>
        <th>Phiếu nhập</th><th>Nguyên phụ liệu</th><th>Hàng chờ xếp</th><th>Thao tác</th>
      </tr></thead><tbody>{receipts.map((receipt) => <tr key={receipt.id}>
        <td><strong>{receipt.code}</strong></td>
        <td>{receipt.materials.join(', ') || '—'}</td>
        <td><span className="putaway-quantity">{receipt.remaining}</span><small>{receipt.objectCount} cây/lô</small></td>
        <td><button className="putaway-button putaway-button-primary" type="button"
          disabled={busy || Boolean(printingReceiptId)} onClick={() => printReceipt(receipt)}>
          {printingReceiptId === receipt.id ? 'Đang lấy tem…' : 'Xem và in tem'}</button></td>
      </tr>)}</tbody></table></div>
      {!receipts.length && <p className="putaway-empty">{loading ? 'Đang tải phiếu…' : 'Không có phiếu chờ xếp.'}</p>}
    </section>
    <section className="putaway-card"><div className="putaway-section-title"><div>
      <span className="putaway-step">2</span><h2>Quét mã và xếp hàng</h2>
      <span className="putaway-count">{tasks.length} công việc</span></div>
      <p>Quét barcode kệ trước, barcode cây/lô sau. Một lần quét lô xác nhận số lượng còn chờ của vị trí đó.</p></div>
      <div className="putaway-filterbar"><label className="putaway-search"><span>⌕</span>
        <input value={query} onChange={(event) => setQuery(event.target.value)}
          placeholder="Tìm phiếu, nguyên phụ liệu, barcode hoặc kệ…" /></label></div>
      <div className="putaway-table-scroll"><table className="putaway-table"><thead><tr>
        <th>Nguyên phụ liệu</th><th>Phiếu</th><th>Kệ đích</th><th>Còn chờ</th><th>Thao tác</th>
      </tr></thead><tbody>{visible.map((item) => <tr key={taskKey(item)}>
        <td><strong>{item.materialCode} · {item.materialName}</strong>
          <small>{item.kind === 'ROLL' ? 'Cây vải' : 'Lô'} · {item.objectBarcode}</small></td>
        <td>{item.receiptCode}</td><td><strong>{item.locationCode || 'Chọn kệ khi xếp'}</strong><small>{item.rackName}</small></td>
        <td><span className="putaway-quantity">{item.remainingQuantity} {item.unit}</span></td>
        <td><button className="putaway-button putaway-button-primary" type="button"
          onClick={() => openTask(item)}>Quét xếp kệ</button></td>
      </tr>)}</tbody></table></div>
      {!visible.length && <p className="putaway-empty">{loading ? 'Đang tải công việc…' : 'Không có công việc phù hợp.'}</p>}
    </section>
    {printDialog && <div className="putaway-overlay" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) setPrintDialog(null);
    }}><section className="putaway-modal putaway-print-modal" role="dialog" aria-modal="true" aria-labelledby="material-print-title">
      <header className="putaway-modal-head"><div><span className="putaway-eyebrow">PHIẾU {printDialog.receipt.code}</span>
        <h2 id="material-print-title">Chi tiết tem nguyên phụ liệu</h2>
        <p>Kiểm tra từng cây vải / lô trước khi in tem.</p></div>
        <button type="button" className="putaway-close" aria-label="Đóng" onClick={() => setPrintDialog(null)}>×</button></header>
      <div className="putaway-modal-body"><p className="putaway-soft-note">In lại dùng đúng barcode đã lưu trên phiếu nhập, không tạo cây vải hoặc lô mới và không thay đổi tồn kho.</p>
        <label className="putaway-check"><input type="checkbox"
          checked={printDialog.labels.every((item) => printDialog.selected.includes(item.barcode))}
          onChange={(event) => setPrintDialog((current) => ({ ...current,
            selected: event.target.checked ? current.labels.map((item) => item.barcode) : [] }))} />
          Chọn tất cả {printDialog.labels.length} barcode</label>
        <div className="putaway-label-list">{printDialog.labels.map((item) => <label className="putaway-label-row" key={item.barcode}>
          <input type="checkbox" checked={printDialog.selected.includes(item.barcode)} onChange={(event) =>
            setPrintDialog((current) => ({ ...current, selected: event.target.checked
              ? [...current.selected, item.barcode] : current.selected.filter((code) => code !== item.barcode) }))} />
          <span><strong>{item.materialCode} · {item.materialName}</strong>
            <small>{item.kind === 'ROLL' ? 'Cây vải' : 'Lô'} {item.lotOrRollCode} · Nhà cung cấp: {item.supplierName || 'Chưa xác định'}</small>
            <small>Màu: {item.color || '—'} · Khổ: {item.widthCm ? `${item.widthCm} cm` : '—'} · Ngày nhập: {formatDate(item.receivedAt)}</small>
            <small>Chờ xếp: <b>{item.pendingQuantity} {item.pendingUnit}</b> · Kệ đích: <b>{item.targetLocations.join(', ') || 'Chọn khi xếp'}</b> · {item.quality === 'REJECTED' ? 'Hàng không đạt' : 'Hàng đạt'}</small>
            <code>{item.barcode}</code></span>{item.imageUrl && <img src={item.imageUrl} alt="" />}</label>)}</div>
        <label className="putaway-copies">Số bản mỗi barcode<input type="number" min="1" max="10" step="1"
          value={printDialog.copies} onChange={(event) => setPrintDialog((current) => ({ ...current, copies: event.target.value }))} /></label>
      </div><div className="putaway-modal-foot"><span>{printDialog.selected.length} barcode · {Number(printDialog.copies) * printDialog.selected.length || 0} tem</span>
        <div><button type="button" className="putaway-button" onClick={() => setPrintDialog(null)}>Hủy</button>{' '}
          <button type="button" className="putaway-button putaway-button-primary" onClick={printSelected}
            disabled={!printDialog.selected.length || !Number.isSafeInteger(Number(printDialog.copies)) ||
              Number(printDialog.copies) < 1 || Number(printDialog.copies) > 10}>In tem đã chọn</button></div></div>
    </section></div>}
    {selected && <div className="putaway-overlay" role="presentation"><section className="putaway-modal" role="dialog"
      aria-modal="true" aria-label="Quét xếp nguyên phụ liệu">
      <header className="putaway-modal-head"><div><h2>{selected.materialCode} · {selected.materialName}</h2>
        <p>{selected.receiptCode} · {selected.kind === 'ROLL' ? 'Cây vải' : 'Lô'} {selected.lotOrRollCode}</p></div>
        <button className="putaway-close" type="button" onClick={closeTask} aria-label="Đóng">×</button></header>
      <div className="putaway-modal-body"><div className="putaway-scan-overview">
        <div><small>BARCODE HÀNG</small><strong>{selected.objectBarcode}</strong></div>
        <div><small>KỆ ĐÍCH</small><strong>{selected.locationCode || 'Chọn kệ bên dưới'}</strong></div>
        <div><small>SỐ LƯỢNG CHỜ</small><strong>{selected.remainingQuantity} {selected.unit}</strong></div>
      </div>{!selected.locationId && <label className="putaway-destination">Kệ nguyên phụ liệu
        <select value={destinationId} disabled={Boolean(verifiedLocation) || busy}
          onChange={(event) => { setDestinationId(event.target.value); setCode(''); }}>
          <option value="">Chọn kệ</option>
          {locations.filter((item) => (!selected.receivingZone || item.zoneCode === selected.receivingZone) &&
            (!item.capacityUnit || item.capacityUnit === selected.unit || (item.currentOccupancy || 0) <= 0) &&
            item.freeQuantity >= (selected.kind === 'LOT' ? Number(quantity) : selected.remainingQuantity))
            .map((item) => <option key={item.id} value={item.id}>
            {item.code} · {item.rackName} · còn {item.freeQuantity} {selected.unit}</option>)}
        </select></label>}
      {selected.kind === 'LOT' && <label className="putaway-destination">Số lượng lô xếp lần này
        <input type="number" min="0.001" max={selected.remainingQuantity}
          step={['METER', 'KG'].includes(selected.unit) ? '0.001' : '1'}
          value={quantity} disabled={Boolean(verifiedLocation) || busy}
          onChange={(event) => { setQuantity(event.target.value); if (!selected.locationId) setDestinationId(''); }} />
      </label>}
      <div className="putaway-steps"><span className={verifiedLocation ? 'done' : 'active'}>1. Quét barcode kệ</span>
        <span className={verifiedLocation ? 'active' : ''}>2. Quét barcode cây/lô</span>
        {verifiedLocation && !pendingRetry && <button type="button" onClick={() => {
          setVerifiedLocation(''); setPendingRetry(null); setCode(''); }}>Quét lại kệ</button>}</div>
      <div className="putaway-camera"><video ref={videoRef} className={cameraOn ? '' : 'hidden'} muted playsInline />
        {!cameraOn && <button className="putaway-button" type="button" onClick={startCamera}
          disabled={selected.kind === 'LOT' && !(Number(quantity) > 0 && Number(quantity) <= selected.remainingQuantity)}>Mở camera quét mã</button>}
        {cameraOn && <button className="putaway-button" type="button" onClick={stopCamera}>Tắt camera</button>}
      </div><form className="putaway-scan-form" onSubmit={(event) => {
        event.preventDefault(); if (verifiedLocation) submitObject(code.trim().toUpperCase());
        else submitLocation(code.trim().toUpperCase()); }}>
        <label htmlFor="material-putaway-code">{verifiedLocation ? 'Barcode cây/lô' : 'Barcode kệ'}</label>
        <div><input id="material-putaway-code" value={code} disabled={busy || Boolean(pendingRetry)}
          onChange={(event) => setCode(event.target.value)} autoFocus autoComplete="off" />
          <button className="putaway-button putaway-button-primary" type="submit"
            disabled={busy || Boolean(pendingRetry) || !code.trim() ||
              selected.kind === 'LOT' && !(Number(quantity) > 0 && Number(quantity) <= selected.remainingQuantity)}>Xác nhận mã</button></div>
      </form>{pendingRetry && <div className="putaway-retry">Chưa rõ kết quả quét trước.
        <button className="putaway-button" type="button" disabled={busy}
          onClick={() => submitObject(pendingRetry.scannedBarcode, pendingRetry)}>Thử lại cùng mã</button></div>}</div>
      <footer className="putaway-modal-foot"><span>Số lượng được xác nhận sau khi máy chủ lưu xong.</span>
        <button className="putaway-button" type="button" onClick={closeTask}>Đóng</button></footer>
    </section></div>}
  </main>;
}
