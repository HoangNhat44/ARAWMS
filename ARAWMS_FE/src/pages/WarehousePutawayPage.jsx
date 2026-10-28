/*
 * File: WarehousePutawayPage.jsx
 * Author: Duy Anh
 * Date: 2026-10-28
 * Description: Guides warehouse staff from a confirmed allocation through location and unit barcode scans. Shows server-confirmed progress and keeps a stable request ID when retrying after a connection failure.
 */
import React, { useEffect, useRef, useState } from 'react';
import { warehousePutawayService as api } from '../services/warehousePutawayService';
import '../styles/warehousePutaway.css';

const key = (task) => `${task.allocationId}:${task.lineId}`;
const label = (task) => [task.productName || task.skuCode,
  task.color, task.size].filter(Boolean).join(' · ');

/** Keeps one camera session during a task while serializing barcode submissions. */
export default function WarehousePutawayPage() {
  const [tasks, setTasks] = useState([]);
  const [task, setTask] = useState(null);
  const [query, setQuery] = useState('');
  const [verifiedLocation, setVerifiedLocation] = useState('');
  const [manualCode, setManualCode] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [pendingRetry, setPendingRetry] = useState(null);
  const [showShortage, setShowShortage] = useState(false);
  const [shortageReason, setShortageReason] = useState('');
  const [showIncident, setShowIncident] = useState(false);
  const [incidentReason, setIncidentReason] = useState('');
  const [incidentBarcode, setIncidentBarcode] = useState('');
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const scanHandlerRef = useRef(null);
  const lockedRef = useRef(false);
  const lastSeenRef = useRef({ code: '', at: 0 });

  /** Refreshes only the compact work queue; task progress loads on selection. */
  const loadTasks = async () => {
    try { setTasks((await api.tasks()).data.tasks); }
    catch (err) { setError(err.message); }
  };
  useEffect(() => { loadTasks(); }, []);

  const stopCamera = () => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    setCameraOn(false);
  };
  useEffect(() => () => { controlsRef.current?.stop(); }, []);

  /** Reopening a task intentionally requires another location scan. */
  const openTask = async (selected) => {
    stopCamera(); setBusy(true); setError(''); setNotice('');
    setVerifiedLocation(''); setPendingRetry(null); setShowShortage(false); setShowIncident(false);
    try { setTask((await api.task(selected.allocationId, selected.lineId)).data.task); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  /** A product is counted only after the backend returns the committed progress. */
  const submitProduct = async (barcode, retry = null) => {
    if (!task || lockedRef.current || !verifiedLocation) return;
    lockedRef.current = true; setBusy(true); setError('');
    setNotice('Đã đọc mã. Đang xác nhận sản phẩm…');
    const request = retry || { productBarcode: barcode, locationBarcode: verifiedLocation,
      requestId: crypto.randomUUID() };
    try {
      const response = await api.scan(task.allocationId, task.lineId, request);
      const next = response.data.result.task;
      setTask(next); setPendingRetry(null);
      if (!next.remainingQuantity) stopCamera();
      setNotice(`Đã xếp — ${next.placedQuantity}/${next.allocatedQuantity}`);
      setManualCode('');
      await loadTasks();
    } catch (err) {
      if (!err.status || err.status >= 500 || err.code === 'TASK_CHANGED') {
        setPendingRetry(request);
        setError('Chưa nhận được xác nhận. Hãy thử lại cùng mã quét.');
      } else {
        const messages = {
          UNIT_ALREADY_PLACED: 'Chiếc này đã được xác nhận. Không cộng thêm.',
          WRONG_SKU: `Sai sản phẩm. Cần ${label(task)}.`,
          WRONG_LOCATION: `Sai ô. Hãy quét ${task.locationCode}.`,
          TASK_COMPLETE: 'Đã đủ số lượng, không cần xếp thêm.',
        };
        setError(messages[err.code] || err.message);
        if (err.code === 'WRONG_LOCATION') setVerifiedLocation('');
      }
      setNotice('');
    } finally { lockedRef.current = false; setBusy(false); }
  };

  /** Location validation always uses the current server barcode, so rotated labels fail. */
  const submitLocation = async (barcode) => {
    if (!task || lockedRef.current) return;
    lockedRef.current = true; setBusy(true); setError(''); setNotice('Đã đọc mã vị trí. Đang kiểm tra…');
    try {
      const response = await api.location(task.allocationId, task.lineId, barcode);
      setVerifiedLocation(response.data.location.barcode);
      setManualCode(''); setNotice('Đúng ô. Quét từng sản phẩm khi đặt vào ô.');
    } catch (err) { setError(err.code === 'WRONG_LOCATION'
      ? `Sai ô. Hãy quét ${task.locationCode}.` : err.message); setNotice(''); }
    finally { lockedRef.current = false; setBusy(false); }
  };

  scanHandlerRef.current = (barcode) => {
    if (pendingRetry || lockedRef.current || !task || !task.remainingQuantity) return;
    const now = Date.now();
    if (lastSeenRef.current.code === barcode && now - lastSeenRef.current.at < 3000) return;
    lastSeenRef.current = { code: barcode, at: now };
    if (verifiedLocation) submitProduct(barcode);
    else submitLocation(barcode);
  };

  /** The decode callback reads current task state through a ref without restarting the camera. */
  const startCamera = async () => {
    if (cameraOn || !task) return;
    setError('');
    try {
      const { BrowserMultiFormatReader } = await import('@zxing/browser');
      const reader = new BrowserMultiFormatReader();
      const controls = await reader.decodeFromConstraints({ video: { facingMode: 'environment' },
        audio: false }, videoRef.current, (result) => {
        if (result) scanHandlerRef.current?.(result.getText());
      });
      controlsRef.current = controls;
      setCameraOn(true);
    } catch (err) { setError(`Không mở được camera: ${err.message}`); }
  };

  const reportShortage = async () => {
    if (!shortageReason.trim() || !task) return;
    setBusy(true); setError('');
    try {
      setTask((await api.shortage(task.allocationId, task.lineId, shortageReason)).data.task);
      stopCamera();
      setShowShortage(false); setNotice('Đã báo quản lý. Tiến độ đã xếp được giữ nguyên.');
      await loadTasks();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  /** Reporting a mistaken scan creates a review item and leaves accepted stock untouched. */
  const reportIncident = async () => {
    if (!incidentReason.trim() || !task) return;
    setBusy(true); setError('');
    try {
      await api.incident(task.allocationId, task.lineId,
        { reason: incidentReason, barcode: incidentBarcode.trim() });
      setShowIncident(false); setIncidentReason(''); setIncidentBarcode('');
      setNotice('Đã báo sự cố cho quản lý. Hàng đã xác nhận vẫn được giữ nguyên.');
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  const visibleTasks = tasks.filter((item) => [label(item), item.receiptCode,
    item.locationCode, item.allocationCode].join(' ').toLowerCase().includes(query.toLowerCase()));

  return <main className="putaway-page">
    <header><small>NHÂN VIÊN KHO</small><h1>Xếp hàng vào kệ</h1>
      <p>Chọn hàng cần xếp, quét đúng ô, rồi quét từng chiếc khi đặt vào kệ.</p></header>
    {error && <div className="putaway-error" role="alert">{error}</div>}
    {notice && <div className="putaway-notice" role="status">{notice}</div>}
    {!task ? <section className="putaway-card">
      <div className="putaway-heading"><h2>Hàng chờ xếp</h2>
        <button type="button" onClick={loadTasks}>Làm mới</button></div>
      <input aria-label="Tìm sản phẩm, phiếu hoặc kệ" placeholder="Tìm sản phẩm, phiếu hoặc kệ…"
        value={query} onChange={(event) => setQuery(event.target.value)} />
      <div className="putaway-task-list">{visibleTasks.map((item) => <article key={key(item)}>
        {item.thumbnailUrl && <img src={item.thumbnailUrl} alt="" />}
        <div><strong>{label(item)}</strong><small>Phiếu {item.receiptCode || item.allocationCode}</small>
          <span>Ô {item.locationCode} · Đã xếp {item.placedQuantity}/{item.allocatedQuantity}</span>
          {item.issuePending && <em>Đang chờ quản lý xử lý báo thiếu</em>}</div>
        <button type="button" disabled={busy || item.issuePending} onClick={() => openTask(item)}>
          {item.placedQuantity ? 'Tiếp tục' : 'Bắt đầu'}</button>
      </article>)}{!visibleTasks.length && <p>Không có hàng chờ xếp phù hợp.</p>}</div>
    </section> : <section className="putaway-card">
      <div className="putaway-heading"><h2>{label(task)}</h2>
        <button type="button" onClick={() => { stopCamera(); setTask(null); setVerifiedLocation(''); loadTasks(); }}>
          Đổi vị trí</button></div>
      <p className="putaway-location">Vị trí: <strong>{task.locationCode}</strong></p>
      <div className="putaway-progress"><strong>Đã xếp: {task.placedQuantity}/{task.allocatedQuantity}</strong>
        <span>Còn lại: {task.remainingQuantity} chiếc</span></div>
      <p className="putaway-instruction">{task.issuePending ? 'Đang chờ quản lý xử lý báo thiếu.'
        : !task.remainingQuantity ? 'Đã xếp đủ. Chọn dòng tiếp theo.'
          : verifiedLocation ? 'Quét barcode từng sản phẩm khi đặt vào ô.'
            : `Quét barcode vị trí ${task.locationCode}.`}</p>
      {!task.issuePending && !!task.remainingQuantity && <>
        <button type="button" onClick={cameraOn ? stopCamera : startCamera}>
          {cameraOn ? 'Tắt camera' : 'Mở camera quét mã'}</button>
        <video ref={videoRef} muted playsInline className={cameraOn ? 'putaway-video' : 'putaway-video hidden'} />
        <form onSubmit={(event) => { event.preventDefault();
          if (manualCode.trim()) verifiedLocation ? submitProduct(manualCode.trim())
            : submitLocation(manualCode.trim()); }}>
          <label htmlFor="putaway-code">Hoặc dùng máy quét mã</label>
          <div className="putaway-input-row"><input id="putaway-code" value={manualCode}
            onChange={(event) => setManualCode(event.target.value)}
            placeholder={verifiedLocation ? 'Barcode sản phẩm' : 'Barcode vị trí'} />
            <button type="submit" disabled={busy || !manualCode.trim()}>Xác nhận</button></div></form>
        {pendingRetry && <button type="button" disabled={busy} onClick={() => submitProduct(
          pendingRetry.productBarcode, pendingRetry)}>Thử lại mã vừa quét</button>}
        <div className="putaway-actions"><button type="button" onClick={() => {
          stopCamera(); setTask(null); setVerifiedLocation(''); loadTasks(); }}>Tạm dừng</button>
          <button type="button" onClick={() => setShowShortage(true)}>Báo thiếu hàng</button></div>
        {showShortage && <div className="putaway-shortage"><label>Lý do cần quản lý xử lý
          <textarea value={shortageReason} maxLength={500}
            onChange={(event) => setShortageReason(event.target.value)} /></label>
          <button type="button" disabled={busy || !shortageReason.trim()}
            onClick={reportShortage}>Gửi báo cáo</button></div>}
      </>}
      <button type="button" onClick={() => setShowIncident(true)}>Báo sự cố xếp nhầm</button>
      {showIncident && <div className="putaway-shortage">
        <label>Barcode chiếc liên quan (nếu có)<input value={incidentBarcode}
          onChange={(event) => setIncidentBarcode(event.target.value)} /></label>
        <label>Mô tả sự cố<textarea value={incidentReason} maxLength={500}
          onChange={(event) => setIncidentReason(event.target.value)} /></label>
        <button type="button" disabled={busy || !incidentReason.trim()}
          onClick={reportIncident}>Gửi sự cố</button></div>}
      {!task.remainingQuantity && <button type="button" onClick={() => {
        stopCamera(); setTask(null); setVerifiedLocation(''); loadTasks(); }}>Xếp dòng tiếp theo</button>}
    </section>}
  </main>;
}
