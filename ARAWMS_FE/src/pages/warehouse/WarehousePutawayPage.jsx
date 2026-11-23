/*
 * File: WarehousePutawayPage.jsx
 * Author: Duy Anh
 * Date: 2026-10-28
 * Description: Guides warehouse staff from a confirmed allocation through location and unit barcode scans. Shows server-confirmed progress and keeps a stable request ID when retrying after a connection failure.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { warehousePutawayService as api } from '../../services/warehousePutawayService';
import MaterialPutawayPanel from '../../components/warehouse/MaterialPutawayPanel';
import { useBarcodeCamera } from '../../hooks/useBarcodeCamera';
import '../../styles/warehousePutaway.css';

const key = (task) => `${task.allocationId}:${task.lineId}`;
// Mỗi lần gửi xếp hàng loạt tối đa 200 chiếc (một giao dịch); nhóm lớn hơn được chia phần tự động.
const BULK_CHUNK = 200;
const label = (task) => [task.productName || task.skuCode,
  task.color, task.size].filter(Boolean).join(' · ');
const locationName = (code = '') => {
  const match = code.match(/^(.*)-T(\d+)-O(\d+)$/);
  return match ? `${match[1]} · Tầng ${Number(match[2])} · Ô ${Number(match[3])}` : code;
};

/** Keeps one camera session during a task while serializing barcode submissions. */
function FinishedGoodsPutawayPanel() {
  const [tasks, setTasks] = useState([]);
  const [task, setTask] = useState(null);
  const [query, setQuery] = useState('');
  const [receiptFilter, setReceiptFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [verifiedLocation, setVerifiedLocation] = useState('');
  const [manualCode, setManualCode] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [printingReceiptId, setPrintingReceiptId] = useState('');
  const [printDialog, setPrintDialog] = useState(null);
  const [pendingRetry, setPendingRetry] = useState(null);
  const [scanLog, setScanLog] = useState([]);
  const [showShortage, setShowShortage] = useState(false);
  const [shortageReason, setShortageReason] = useState('');
  const [showIncident, setShowIncident] = useState(false);
  const [incidentReason, setIncidentReason] = useState('');
  const [incidentBarcode, setIncidentBarcode] = useState('');
  // Xếp hàng loạt: các tem đã chọn/vừa in, quét mã ô một lần cho mỗi ô.
  const [bulk, setBulk] = useState(null);
  const [lastPrinted, setLastPrinted] = useState(null);
  const scanHandlerRef = useRef(null);
  const lockedRef = useRef(false);
  const lastSeenRef = useRef({ code: '', at: 0 });
  // Duplicate reads are filtered by scanHandlerRef itself (only accepted scans count), so the hook does not.
  const camera = useBarcodeCamera({ onScan: (code) => scanHandlerRef.current?.(code), onError: setError,
    formats: ['CODE_128', 'QR_CODE'], duplicateWindowMs: 0 });
  const { videoRef, cameraOn, stopCamera } = camera;

  /** Refreshes only the compact work queue; task progress loads on selection. */
  const loadTasks = async () => {
    try { setTasks((await api.tasks()).data.tasks); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { window.scrollTo(0, 0); loadTasks(); }, []);
  useEffect(() => {
    const refresh = (event) => {
      loadTasks();
      if (task && (!event.detail?.allocationId || String(event.detail.allocationId) === String(task.allocationId)) &&
          (!event.detail?.lineId || String(event.detail.lineId) === String(task.lineId))) {
        api.task(task.allocationId, task.lineId).then((response) => setTask(response.data.task)).catch(() => {});
      }
    };
    window.addEventListener('arawms-putaway-realtime', refresh);
    return () => window.removeEventListener('arawms-putaway-realtime', refresh);
  }, [task?.allocationId, task?.lineId]);


  /** Reopening a task intentionally requires another location scan. */
  const openTask = async (selected) => {
    stopCamera(); setBusy(true); setError(''); setNotice('');
    setVerifiedLocation(''); setPendingRetry(null); setShowShortage(false); setShowIncident(false);
    setManualCode(''); setScanLog([]);
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
      setScanLog((current) => [{ barcode: request.productBarcode, time: new Date() }, ...current]
        .filter((entry, index, list) => list.findIndex((item) => item.barcode === entry.barcode) === index));
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

  /** Location QR validation uses the current server code, so rotated labels fail. */
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

  /** Mở bước xếp hàng loạt: hỏi hệ thống các tem đã chọn sẽ vào ô nào. Chưa thay đổi tồn kho. */
  const openBulk = async (receipt, barcodes, locationCode = '') => {
    if (!barcodes.length) return;
    stopCamera(); setPrintDialog(null); setError(''); setNotice('');
    setBulk({ receipt, barcodes, plan: null, loading: true, done: {}, placed: {}, requestIds: {}, active: '', code: '' });
    try {
      const plan = (await api.bulkPlan(receipt.id, barcodes, locationCode)).data;
      const first = plan.groups.find((group) => !group.blockedReason && group.locationCode === locationCode)
        || plan.groups.find((group) => !group.blockedReason);
      setBulk((current) => current && { ...current, plan, loading: false, active: first?.locationId || '' });
    } catch (err) { setBulk(null); setError(err.message); }
  };

  const closeBulk = () => { stopCamera(); setBulk(null); loadTasks(); };

  /** Quét mã ô một lần: xếp toàn bộ tem của nhóm đang chọn lên ô đó, dù nhiều bao nhiêu chiếc.
   * Nhóm lớn được gửi thành từng phần 200 chiếc sau cùng một lần quét; mỗi phần là một giao dịch,
   * sai ô thì không xếp chiếc nào, mất mạng giữa chừng thì quét lại để xếp tiếp phần còn lại. */
  const submitBulkLocation = async (code) => {
    const scanned = String(code || '').trim();
    if (!bulk?.plan || lockedRef.current || !scanned) return;
    const group = bulk.plan.groups.find((item) => item.locationId === bulk.active);
    if (!group || bulk.done[group.locationId] != null) { setError('Chọn ô cần xếp trước khi quét.'); return; }
    const placedBefore = bulk.placed?.[group.locationId] || [];
    const remaining = group.barcodes.filter((barcode) => !placedBefore.includes(barcode));
    const chunks = [];
    for (let i = 0; i < remaining.length; i += BULK_CHUNK) chunks.push(remaining.slice(i, i + BULK_CHUNK));
    lockedRef.current = true; setBusy(true); setError('');
    let placed = [...placedBefore];
    let requestIds = { ...bulk.requestIds };
    try {
      for (const chunk of chunks) {
        setNotice(`Đang xếp vào ô ${group.locationCode}… ${placed.length}/${group.barcodes.length} chiếc`);
        // Giữ nguyên requestId của từng phần khi thử lại để hệ thống không xếp hai lần.
        const chunkKey = `${group.locationId}|${chunk[0]}|${chunk.length}`;
        requestIds = { ...requestIds, [chunkKey]: requestIds[chunkKey] || crypto.randomUUID() };
        setBulk((current) => current && { ...current, requestIds });
        await api.bulkPlace(bulk.receipt.id, { requestId: requestIds[chunkKey], locationBarcode: scanned, barcodes: chunk });
        placed = [...placed, ...chunk];
        setBulk((current) => current && { ...current, placed: { ...(current.placed || {}), [group.locationId]: placed } });
      }
      const done = { ...bulk.done, [group.locationId]: placed.length };
      const next = bulk.plan.groups.find((item) => !item.blockedReason && done[item.locationId] == null);
      setBulk((current) => ({ ...current, done, active: next?.locationId || '', code: '' }));
      const total = Object.values(done).reduce((sum, value) => sum + value, 0);
      if (!next) {
        stopCamera();
        setNotice(`Đã xếp xong ${total} chiếc vào kệ.`);
        if (lastPrinted?.receipt.id === bulk.receipt.id) setLastPrinted(null);
      } else setNotice(`Đã xếp ${placed.length} chiếc vào ô ${group.locationCode}. Quét mã ô tiếp theo: ${next.locationCode}.`);
      await loadTasks();
    } catch (err) {
      setNotice('');
      const partly = placed.length > placedBefore.length || placedBefore.length
        ? ` Đã xếp ${placed.length}/${group.barcodes.length} chiếc; quét lại mã ô để xếp tiếp phần còn lại.` : '';
      setError(err.code === 'WRONG_LOCATION' ? `Sai ô. Nhóm này cần xếp vào ô ${group.locationCode}; chưa xếp thêm chiếc nào.${partly}`
        : !err.status || err.status >= 500 ? `Chưa nhận được xác nhận. Hãy quét lại mã ô (hệ thống không xếp trùng).${partly}` : err.message + partly);
      setBulk((current) => current && { ...current, code: '' });
      if (placed.length > placedBefore.length) loadTasks();
    } finally { lockedRef.current = false; setBusy(false); }
  };

  scanHandlerRef.current = (barcode) => {
    if (bulk) {
      const now = Date.now();
      if (lastSeenRef.current.code === barcode && now - lastSeenRef.current.at < 3000) return;
      lastSeenRef.current = { code: barcode, at: now };
      submitBulkLocation(barcode);
      return;
    }
    if (pendingRetry || lockedRef.current || !task || !task.remainingQuantity) return;
    const now = Date.now();
    if (lastSeenRef.current.code === barcode && now - lastSeenRef.current.at < 3000) return;
    lastSeenRef.current = { code: barcode, at: now };
    if (verifiedLocation) submitProduct(barcode);
    else submitLocation(barcode);
  };

  /** The scan callback reads current task state through a ref without restarting the camera. */
  const startCamera = () => {
    if (cameraOn || !task) return;
    setError('');
    camera.startCamera();
  };

  const reportShortage = async () => {
    if (!shortageReason.trim() || !task ||
      !window.confirm('Gửi báo thiếu hàng cho quản lý? Tiến độ đã xếp sẽ được giữ nguyên.')) return;
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
    if (!incidentReason.trim() || !task || !window.confirm('Gửi sự cố xếp hàng cho quản lý xem xét?')) return;
    setBusy(true); setError('');
    try {
      await api.incident(task.allocationId, task.lineId,
        { reason: incidentReason, barcode: incidentBarcode.trim() });
      setShowIncident(false); setIncidentReason(''); setIncidentBarcode('');
      setNotice('Đã báo sự cố cho quản lý. Hàng đã xác nhận vẫn được giữ nguyên.');
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  /** A receipt can contain several SKUs; task printing selects only its exact variant. */
  /** Các ô còn cần xếp của phiếu (lọc theo SKU nếu có): mỗi ô kèm số chiếc còn thiếu của từng SKU. */
  const binsForReceipt = (receiptId, skuFilter = '') => {
    const bins = new Map();
    for (const line of tasks) {
      if (String(line.receiptId) !== String(receiptId) || line.issuePending || !line.remainingQuantity) continue;
      if (skuFilter && String(line.skuId) !== String(skuFilter)) continue;
      const bin = bins.get(line.locationCode) || { locationCode: line.locationCode, total: 0, skus: new Map() };
      const sku = bin.skus.get(String(line.skuId)) || { skuId: String(line.skuId), skuCode: line.skuCode,
        productName: line.productName, color: line.color, size: line.size, quantity: 0 };
      sku.quantity += line.remainingQuantity; bin.total += line.remainingQuantity;
      bin.skus.set(sku.skuId, sku); bins.set(line.locationCode, bin);
    }
    return [...bins.values()].map((bin) => ({ ...bin, skus: [...bin.skus.values()] }))
      .sort((a, b) => a.locationCode.localeCompare(b.locationCode));
  };
  /** Chọn ô: tự tick đúng số tem ô đó còn cần cho từng SKU (vd 40 chiếc AK002 cho B-01 · Tầng 2 · Ô 1). */
  const labelsForBin = (labels, bin) => (bin ? bin.skus.flatMap((sku) => labels
    .filter((item) => String(item.skuId) === sku.skuId).slice(0, sku.quantity).map((item) => item.barcode)) : []);

  /** mode PRINT: in tem; mode BULK: chọn các tem đã dán để xếp hàng loạt (quét mã ô một lần). */
  const printReceipt = async (receipt, skuId = '', mode = 'PRINT', locationCode = '') => {
    setPrintingReceiptId(receipt.id); setError('');
    try {
      const response = await api.receiptLabels(receipt.id);
      const labels = response.data.labels;
      if (!labels.length) throw new Error('Phiếu này không còn sản phẩm chờ dán tem.');
      const matching = skuId ? labels.filter((item) => String(item.skuId) === String(skuId)) : [];
      if (skuId && !matching.length) throw new Error('SKU của công việc này không còn tem chờ xếp. Hãy làm mới tiến độ.');
      // Xếp hàng loạt: mở từ một dòng công việc thì chọn sẵn ô của dòng đó; SKU chỉ có một ô thì chọn luôn ô đó.
      const bins = binsForReceipt(receipt.id, skuId);
      const bin = mode === 'BULK' ? bins.find((item) => item.locationCode === locationCode) || (bins.length === 1 ? bins[0] : null) : null;
      setPrintDialog({ receipt, labels, skuFilter: String(skuId), mode, binCode: bin?.locationCode || '',
        selected: mode === 'BULK' ? labelsForBin(labels, bin) : matching.map((item) => item.barcode), copies: 1 });
    } catch (err) { setError(err.message); }
    finally { setPrintingReceiptId(''); }
  };

  const printSelected = async () => {
    if (!printDialog?.selected.length) return;
    const copies = Number(printDialog.copies);
    if (!Number.isSafeInteger(copies) || copies < 1 || copies > 10) return;
    const tab = window.open('', '_blank');
    if (!tab) { setError('Trình duyệt đang chặn cửa sổ in tem.'); return; }
    try {
      const { printProductLabels } = await import('../../utils/productLabelPrint');
      const selected = printDialog.labels.filter((item) => printDialog.selected.includes(item.barcode));
      printProductLabels(selected.flatMap((item) => Array.from({ length: copies }, () => item)), tab);
      setNotice(`Đã mở ${selected.length * copies} tem của phiếu ${printDialog.receipt.code}.`);
      setLastPrinted({ receipt: printDialog.receipt, barcodes: selected.map((item) => item.barcode) });
      setPrintDialog(null);
    } catch (err) { tab.close(); setError(err.message); }
  };

  const receipts = [...new Map(tasks.filter((item) => item.receiptId)
    .map((item) => [String(item.receiptId), { id: String(item.receiptId), code: item.receiptCode }])).values()];
  const receiptRows = receipts.map((receipt) => {
    const lines = tasks.filter((item) => String(item.receiptId) === receipt.id);
    return { ...receipt, lineCount: lines.length,
      remaining: lines.reduce((total, item) => total + item.remainingQuantity, 0) };
  });
  const search = query.trim().toLocaleLowerCase();
  const visibleReceipts = receiptRows.filter((item) => !search || [item.code, ...tasks
    .filter((taskItem) => String(taskItem.receiptId) === item.id).map(label)]
    .join(' ').toLocaleLowerCase().includes(search));
  const visibleTasks = tasks.filter((item) => {
    const status = item.issuePending ? 'ISSUE' : item.placedQuantity ? 'DOING' : 'NEW';
    return (statusFilter === 'ALL' || statusFilter === status) &&
      (!receiptFilter || String(item.receiptId) === receiptFilter) &&
      (!search || [label(item), item.receiptCode, item.locationCode, item.allocationCode]
        .join(' ').toLocaleLowerCase().includes(search));
  });
  const printableLabels = printDialog?.skuFilter
    ? printDialog.labels.filter((item) => String(item.skuId) === printDialog.skuFilter)
    : printDialog?.labels || [];
  const printableSkus = printDialog ? [...new Map(printDialog.labels.map((item) =>
    [String(item.skuId), item])).values()] : [];
  const statusCounts = { ALL: tasks.length, NEW: 0, DOING: 0, ISSUE: 0 };
  tasks.forEach((item) => { statusCounts[item.issuePending ? 'ISSUE' : item.placedQuantity ? 'DOING' : 'NEW'] += 1; });
  const progress = task ? Math.min(100, Math.round(task.placedQuantity / task.allocatedQuantity * 100)) : 0;
  const closeTask = () => { stopCamera(); setTask(null); setVerifiedLocation(''); setManualCode('');
    setPendingRetry(null); setShowShortage(false); setShowIncident(false); loadTasks(); };
  const refresh = async () => {
    setBusy(true);
    try {
      await loadTasks();
      if (task) {
        setTask((await api.task(task.allocationId, task.lineId)).data.task);
        stopCamera(); setVerifiedLocation(''); setPendingRetry(null);
      }
      setNotice('Đã tải lại tiến độ mới nhất từ hệ thống.');
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  return <main className="putaway-page">
    <header className="putaway-page-head"><div><span className="putaway-eyebrow">KHO THÀNH PHẨM / XẾP HÀNG</span>
      <h1>Xếp hàng vào kệ</h1><p>In tem từng chiếc rồi xếp lên kệ: quét từng chiếc, hoặc chọn các tem đã in và quét mã ô một lần để xếp cả nhóm.</p></div>
      <div className="putaway-head-actions"><Link className="putaway-button putaway-button-light" to="/warehouse/staff/finished-goods">Xem kho thành phẩm</Link>
      <button type="button" className="putaway-button putaway-button-light" onClick={refresh} disabled={busy}>↻ Làm mới</button></div></header>
    {error && <div className="putaway-toast putaway-toast-error" role="alert">{error}
      <button type="button" aria-label="Đóng thông báo lỗi" onClick={() => setError('')}>×</button></div>}
    {notice && <div className="putaway-toast" role="status">{notice}
      <button type="button" aria-label="Đóng thông báo" onClick={() => setNotice('')}>×</button></div>}

    {lastPrinted && !bulk && <div className="putaway-bulk-bar" role="status">
      <span>Vừa in <strong>{lastPrinted.barcodes.length} tem</strong> của phiếu {lastPrinted.receipt.code}. Dán tem xong, đặt hàng lên kệ rồi quét mã ô một lần.</span>
      <div><button type="button" className="putaway-button putaway-button-primary" disabled={busy}
        onClick={() => openBulk(lastPrinted.receipt, lastPrinted.barcodes)}>Xếp {lastPrinted.barcodes.length} tem vừa in</button>
        <button type="button" className="putaway-button" onClick={() => setLastPrinted(null)}>Bỏ qua</button></div></div>}

    <section className="putaway-card" aria-label="In tem hàng chờ xếp">
      <div className="putaway-section-title"><div><span className="putaway-step">1</span><h2>In tem hàng chờ xếp</h2>
        <span className="putaway-count">{receiptRows.length} phiếu</span></div>
        <p>In lại barcode đã cấp cho từng chiếc. In tem không làm thay đổi tồn kho.</p></div>
      <div className="putaway-filterbar"><label className="putaway-search"><span>⌕</span>
        <input value={query} onChange={(event) => setQuery(event.target.value)}
          placeholder="Tìm mã phiếu, sản phẩm hoặc vị trí…" aria-label="Tìm phiếu hoặc công việc" /></label>
        <button type="button" className="putaway-button putaway-button-muted" onClick={() => {
          setQuery(''); setReceiptFilter(''); setStatusFilter('ALL'); }}>Xóa bộ lọc</button></div>
      <div className="putaway-table-scroll"><table className="putaway-table"><thead><tr>
        <th>Mã phiếu nhập</th><th>Hàng chờ xếp</th><th>Công việc</th><th>Thao tác</th>
      </tr></thead><tbody>{visibleReceipts.map((receipt) => <tr key={receipt.id}>
        <td><strong>{receipt.code || receipt.id}</strong><small>Đã phân bổ vị trí</small></td>
        <td><span className="putaway-quantity">{receipt.remaining} chiếc</span></td>
        <td>{receipt.lineCount} dòng cần xếp</td>
        <td><button type="button" className="putaway-button putaway-button-primary"
          disabled={Boolean(printingReceiptId)} onClick={() => printReceipt(receipt)}>
          {printingReceiptId === receipt.id ? 'Đang lấy tem…' : 'Xem và in tem'}</button>{' '}
          <button type="button" className="putaway-button" disabled={Boolean(printingReceiptId) || busy}
            onClick={() => printReceipt(receipt, '', 'BULK')}>Xếp hàng loạt</button></td>
      </tr>)}</tbody></table></div>
      {!visibleReceipts.length && <p className="putaway-empty">{loading ? 'Đang tải phiếu…' : 'Không có phiếu phù hợp.'}</p>}
    </section>

    <section className="putaway-card" aria-label="Quét mã và xếp hàng">
      <div className="putaway-section-title"><div><span className="putaway-step">2</span><h2>Quét mã và xếp hàng</h2>
        <span className="putaway-count">{tasks.length} công việc</span></div>
        <p><strong>Quét từng chiếc:</strong> bấm "Bắt đầu", quét QR ô rồi quét barcode từng chiếc.
          {' '}<strong>Xếp hàng loạt:</strong> bấm "Xếp hàng loạt", tick các tem đã dán rồi quét QR ô một lần.</p></div>
      <div className="putaway-task-controls"><div className="putaway-tabs" role="group" aria-label="Lọc trạng thái">
        {[["ALL", "Tất cả"], ["NEW", "Chưa bắt đầu"], ["DOING", "Đang xếp"], ["ISSUE", "Chờ xử lý"]].map(([value, text]) =>
          <button key={value} type="button" className={statusFilter === value ? 'active' : ''}
            aria-pressed={statusFilter === value} onClick={() => setStatusFilter(value)}>{text} <span>{statusCounts[value]}</span></button>)}
      </div><select aria-label="Lọc theo phiếu nhập" value={receiptFilter}
        onChange={(event) => setReceiptFilter(event.target.value)}><option value="">Tất cả phiếu nhập</option>
        {receipts.map((receipt) => <option key={receipt.id} value={receipt.id}>{receipt.code}</option>)}</select></div>
      <div className="putaway-table-scroll"><table className="putaway-table putaway-task-table"><thead><tr>
        <th>Sản phẩm & thuộc tính</th><th>Phiếu nhập</th><th>Vị trí đích</th><th>Tiến độ</th><th>Trạng thái</th><th>Thao tác</th>
      </tr></thead><tbody>{visibleTasks.map((item) => <tr key={key(item)}>
        <td><div className="putaway-product">{item.thumbnailUrl ? <img src={item.thumbnailUrl} alt="" />
          : <span className="putaway-product-placeholder">□</span>}<div><strong>{item.productName || item.skuCode}</strong>
          <small>{item.skuCode} · {[item.color, item.size].filter(Boolean).join(' · ')}</small></div></div></td>
        <td><strong>{item.receiptCode || '—'}</strong><small>{item.allocationCode}</small></td>
        <td><strong>{locationName(item.locationCode)}</strong><small>{item.locationCode}</small></td>
        <td><strong>{item.placedQuantity}/{item.allocatedQuantity}</strong>
          <div className="putaway-mini-track"><span style={{ width: `${Math.min(100, Math.round(item.placedQuantity / item.allocatedQuantity * 100))}%` }} /></div>
          <small>Còn {item.remainingQuantity} chiếc</small></td>
        <td><span className={`putaway-status ${item.issuePending ? 'issue' : item.placedQuantity ? 'doing' : 'new'}`}>
          {item.issuePending ? 'Chờ quản lý' : item.placedQuantity ? 'Đang xếp' : 'Chưa bắt đầu'}</span></td>
        <td><button type="button" className="putaway-button" disabled={Boolean(printingReceiptId)}
          onClick={() => printReceipt({ id: String(item.receiptId), code: item.receiptCode }, item.skuId)}>Tem đúng SKU</button>{' '}
          <button type="button" className="putaway-button" disabled={Boolean(printingReceiptId) || busy || item.issuePending}
          onClick={() => printReceipt({ id: String(item.receiptId), code: item.receiptCode }, item.skuId, 'BULK', item.locationCode)}>Xếp hàng loạt</button>{' '}
          <button type="button" className="putaway-button putaway-button-primary" disabled={busy || item.issuePending}
          onClick={() => openTask(item)}>{item.placedQuantity ? 'Tiếp tục' : 'Bắt đầu'} →</button></td>
      </tr>)}</tbody></table></div>
      {!visibleTasks.length && <p className="putaway-empty">{loading ? 'Đang tải công việc…' : 'Không có công việc phù hợp.'}</p>}
    </section>

    {printDialog && <div className="putaway-overlay" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) setPrintDialog(null);
    }}><section className="putaway-modal putaway-print-modal" role="dialog" aria-modal="true" aria-labelledby="putaway-print-title">
      <div className="putaway-modal-head"><div><span className="putaway-eyebrow">PHIẾU {printDialog.receipt.code}</span>
        <h2 id="putaway-print-title">{printDialog.mode === 'BULK' ? 'Chọn tem để xếp hàng loạt' : 'In tem sản phẩm'}</h2>
        <p>{printDialog.mode === 'BULK' ? 'Tick các chiếc đã dán tem và đặt lên kệ (bao nhiêu cũng được), rồi quét mã ô một lần.'
          : 'Chọn đúng SKU của công việc xếp kệ trước khi in.'}</p></div>
        <button type="button" className="putaway-close" aria-label="Đóng" onClick={() => setPrintDialog(null)}>×</button></div>
      <div className="putaway-modal-body"><p className="putaway-soft-note">{printDialog.mode === 'BULK'
          ? 'Chỉ tick đúng những chiếc đang được đặt lên kệ: hệ thống xếp tất cả tem đã tick sau một lần quét mã ô, không quét từng chiếc.'
          : 'In lại không tạo barcode hoặc sản phẩm mới. Cùng một SKU có thể được phân bổ vào nhiều ô; tem không gắn cố định với một ô.'}</p>
        <label className="putaway-copies">Lọc SKU<select value={printDialog.skuFilter} onChange={(event) => {
          const skuFilter = event.target.value;
          setPrintDialog((current) => {
            if (current.mode === 'BULK') {
              const bins = binsForReceipt(current.receipt.id, skuFilter);
              const bin = bins.length === 1 ? bins[0] : null;
              return { ...current, skuFilter, binCode: bin?.locationCode || '', selected: labelsForBin(current.labels, bin) };
            }
            return { ...current, skuFilter,
              selected: skuFilter ? current.labels.filter((item) => String(item.skuId) === skuFilter).map((item) => item.barcode) : [] };
          });
        }}><option value="">Tất cả SKU trong phiếu</option>{printableSkus.map((item) =>
          <option key={item.skuId} value={item.skuId}>{[item.skuCode, item.color, item.size].filter(Boolean).join(' · ')}</option>)}</select></label>
        {printDialog.mode === 'BULK' && (() => {
          const bins = binsForReceipt(printDialog.receipt.id, printDialog.skuFilter);
          const bin = bins.find((item) => item.locationCode === printDialog.binCode);
          return <>
            <label className="putaway-copies">Xếp vào ô<select value={printDialog.binCode} onChange={(event) => {
              const next = bins.find((item) => item.locationCode === event.target.value);
              setPrintDialog((current) => ({ ...current, binCode: next?.locationCode || '', selected: labelsForBin(current.labels, next) }));
            }}><option value="">Tự chọn tem (không theo ô)</option>{bins.map((item) => <option key={item.locationCode} value={item.locationCode}>
              {locationName(item.locationCode)} — còn {item.total} chiếc{item.skus.length > 1 ? ` (${item.skus.length} SKU)` : ''}</option>)}</select></label>
            {bin && <p className="putaway-bulk-bin-note">Ô <strong>{locationName(bin.locationCode)}</strong> còn cần: {bin.skus.map((sku) =>
              `${sku.quantity} × ${[sku.skuCode, sku.productName, sku.color, sku.size].filter(Boolean).join(' · ')}`).join('; ')}.
              Đã tự tick {printDialog.selected.length} tem; bỏ tick nếu số chiếc thực tế đặt lên ô ít hơn.</p>}
          </>;
        })()}
        <label className="putaway-check"><input type="checkbox"
          checked={printableLabels.length > 0 && printableLabels.every((item) => printDialog.selected.includes(item.barcode))}
          onChange={(event) => setPrintDialog((current) => ({ ...current,
            selected: event.target.checked ? printableLabels.map((item) => item.barcode) : [] }))} />
          Chọn tất cả {printableLabels.length} barcode đang hiển thị</label>
        <div className="putaway-label-list">{printableLabels.map((item) => <label className="putaway-label-row" key={item.barcode}>
          <input type="checkbox" checked={printDialog.selected.includes(item.barcode)} onChange={(event) =>
            setPrintDialog((current) => ({ ...current, selected: event.target.checked
              ? [...current.selected, item.barcode] : current.selected.filter((code) => code !== item.barcode) }))} />
          <span><strong>{item.productName || item.skuCode}</strong><small>{[item.skuCode, item.color, item.size].filter(Boolean).join(' · ')}</small>
            <code>{item.barcode}</code></span>{item.imageUrl && <img src={item.imageUrl} alt="" />}</label>)}</div>
        {printDialog.mode !== 'BULK' && <label className="putaway-copies">Số bản mỗi barcode<input type="number" min="1" max="10" step="1"
          value={printDialog.copies} onChange={(event) => setPrintDialog((current) => ({ ...current, copies: event.target.value }))} /></label>}
      </div><div className="putaway-modal-foot"><span>{printDialog.mode === 'BULK' ? `${printDialog.selected.length} chiếc sẽ xếp`
        : `${printDialog.selected.length} barcode · ${Number(printDialog.copies) * printDialog.selected.length || 0} tem`}</span>
        <div><button type="button" className="putaway-button" onClick={() => setPrintDialog(null)}>Hủy</button>
          <button type="button" className={`putaway-button${printDialog.mode === 'BULK' ? ' putaway-button-primary' : ''}`} disabled={!printDialog.selected.length || busy}
            title="Các tem đã chọn đã được dán lên hàng: quét mã ô một lần để xếp tất cả"
            onClick={() => openBulk(printDialog.receipt, printDialog.selected, printDialog.binCode)}>Xếp các tem đã chọn vào kệ</button>
          {printDialog.mode !== 'BULK' && <button type="button" className="putaway-button putaway-button-primary" onClick={printSelected}
            disabled={!printDialog.selected.length || !Number.isSafeInteger(Number(printDialog.copies)) ||
              Number(printDialog.copies) < 1 || Number(printDialog.copies) > 10}>In tem đã chọn</button>}</div></div>
    </section></div>}

    {bulk && <div className="putaway-overlay" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) closeBulk();
    }}><section className="putaway-modal" role="dialog" aria-modal="true" aria-labelledby="putaway-bulk-title">
      <div className="putaway-modal-head"><div><span className="putaway-eyebrow">PHIẾU {bulk.receipt.code} · XẾP HÀNG LOẠT</span>
        <h2 id="putaway-bulk-title">Xếp {bulk.barcodes.length} tem đã chọn</h2>
        <p>Đặt hàng đã dán tem lên đúng ô, rồi quét mã ô một lần. Hệ thống xếp toàn bộ chiếc của nhóm vào ô đó.</p></div>
        <button type="button" className="putaway-close" aria-label="Đóng" disabled={busy} onClick={closeBulk}>×</button></div>
      <div className="putaway-modal-body">
        {bulk.loading && <p className="putaway-empty">Đang kiểm tra các tem đã chọn…</p>}
        {bulk.plan && <>
          {!!bulk.plan.invalid.length && <div className="putaway-bulk-invalid"><strong>{bulk.plan.invalid.length} tem không xếp được</strong>
            <ul>{bulk.plan.invalid.map((item) => <li key={item.barcode}><code>{item.barcode}</code> — {item.reason}</li>)}</ul></div>}
          {!bulk.plan.groups.length ? <p className="putaway-empty">Không có tem nào xếp được. Hãy làm mới và chọn lại.</p>
            : <div className="putaway-bulk-groups">{bulk.plan.groups.map((group) => {
              const done = bulk.done[group.locationId];
              const active = bulk.active === group.locationId;
              return <label key={group.locationId} className={`putaway-bulk-group${active ? ' active' : ''}${done != null ? ' done' : ''}${group.blockedReason ? ' blocked' : ''}`}>
                <input type="radio" name="bulk-bin" checked={active} disabled={done != null || !!group.blockedReason || busy}
                  onChange={() => setBulk((current) => ({ ...current, active: group.locationId }))} />
                <span><small>Ô ĐÍCH</small><strong>{locationName(group.locationCode)}</strong><code>{group.locationCode}</code></span>
                <span>{group.skus.map((sku) => <em key={sku.skuId}>{sku.quantity} × {[sku.productName || sku.skuCode, sku.color, sku.size].filter(Boolean).join(' · ')}</em>)}</span>
                <b>{done != null ? `✓ Đã xếp ${done} chiếc` : group.blockedReason || (bulk.placed?.[group.locationId]?.length
                  ? `Đã xếp ${bulk.placed[group.locationId].length}/${group.barcodes.length} · quét lại ô để xếp tiếp` : `${group.barcodes.length} chiếc · chờ quét ô`)}</b>
              </label>;
            })}</div>}
          {bulk.plan.groups.some((group) => !group.blockedReason && bulk.done[group.locationId] == null) && <div className="putaway-scan-columns"><div className="putaway-scan-left">
            <div className="putaway-camera"><video ref={videoRef} muted playsInline className={cameraOn ? '' : 'hidden'} />
              <div className="putaway-camera-top"><span>CAMERA QUÉT MÃ Ô</span>
                <button type="button" className="putaway-button" disabled={busy}
                  onClick={cameraOn ? stopCamera : () => { setError(''); camera.startCamera(); }}>{cameraOn ? 'Tắt camera' : 'Mở camera'}</button></div>
              {!cameraOn && <div className="putaway-reticle" aria-hidden="true" />}
              <p>{cameraOn ? 'Hướng camera vào QR của ô đang chọn.' : 'Camera chưa mở · Có thể dùng máy quét hoặc nhập mã ô bên dưới.'}</p></div>
            <form className="putaway-scan-form" onSubmit={(event) => { event.preventDefault(); submitBulkLocation(bulk.code); }}>
              <label htmlFor="putaway-bulk-code">Mã QR ô · {bulk.plan.groups.find((group) => group.locationId === bulk.active)?.locationCode || 'chọn ô ở trên'}</label>
              <div><input id="putaway-bulk-code" autoComplete="off" value={bulk.code} disabled={busy || !bulk.active}
                onChange={(event) => { const code = event.target.value; setBulk((current) => ({ ...current, code })); }}
                placeholder="Quét hoặc nhập QR của ô" />
                <button type="submit" className="putaway-button putaway-button-primary" disabled={busy || !bulk.active || !bulk.code.trim()}>
                  Xếp cả nhóm vào ô</button></div></form>
          </div></div>}
        </>}
      </div><div className="putaway-modal-foot"><span>{Object.values(bulk.done).reduce((sum, value) => sum + value, 0)} chiếc đã xếp trong lần này</span>
        <div><button type="button" className="putaway-button" disabled={busy} onClick={closeBulk}>
          {bulk.plan && bulk.plan.groups.every((group) => group.blockedReason || bulk.done[group.locationId] != null) ? 'Xong' : 'Đóng'}</button></div></div>
    </section></div>}

    {task && <div className="putaway-overlay" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) closeTask();
    }}><section className="putaway-modal" role="dialog" aria-modal="true" aria-labelledby="putaway-scan-title">
      <div className="putaway-modal-head"><div><span className="putaway-eyebrow">PHIẾU {task.receiptCode || task.allocationCode}</span>
        <h2 id="putaway-scan-title">Quét mã và xếp hàng</h2>
        <p>Quét đúng ô đã phân bổ, sau đó quét barcode riêng của từng chiếc.</p></div>
        <button type="button" className="putaway-close" aria-label="Tạm dừng và đóng" onClick={closeTask}>×</button></div>
      <div className="putaway-modal-body"><div className="putaway-scan-overview">
        <div className="putaway-scan-product">{task.thumbnailUrl ? <img src={task.thumbnailUrl} alt="" />
          : <span className="putaway-product-placeholder">□</span>}
          <div><small>{task.skuCode}</small><h3>{task.productName || task.skuCode}</h3>
            <p>{[task.color, task.size].filter(Boolean).join(' · ')}</p></div></div>
        <div className="putaway-scan-target"><small>VỊ TRÍ ĐƯỢC PHÂN BỔ</small>
          <strong>{locationName(task.locationCode)}</strong><span>{task.locationCode}</span></div>
        <div className="putaway-scan-progress"><small>ĐÃ XÁC NHẬN TRÊN HỆ THỐNG</small>
          <strong>{task.placedQuantity}<span> / {task.allocatedQuantity} chiếc · {progress}%</span></strong>
          <p>Còn {task.remainingQuantity} chiếc</p><div className="putaway-mini-track"><span style={{ width: `${progress}%` }} /></div></div>
      </div><div className="putaway-steps"><span className={verifiedLocation ? 'done' : 'active'}>
        {verifiedLocation ? '✓' : '1'} · {verifiedLocation ? 'Đã kiểm tra đúng ô' : 'Quét QR ô trước'}</span>
        <span className={verifiedLocation ? 'active' : ''}>2 · Quét barcode từng chiếc</span>
        {verifiedLocation && !!task.remainingQuantity && <button type="button" onClick={() => {
          if (window.confirm('Quét lại ô đã phân bổ? Các sản phẩm đã xác nhận vẫn được giữ.')) {
            setVerifiedLocation(''); setPendingRetry(null); setManualCode('');
          }
        }}>Quét lại ô</button>}</div>
      <div className="putaway-scan-columns"><div className="putaway-scan-left">
        <div className="putaway-camera"><video ref={videoRef} muted playsInline className={cameraOn ? '' : 'hidden'} />
          <div className="putaway-camera-top"><span>CAMERA QUÉT MÃ</span>
            <button type="button" className="putaway-button" disabled={busy || !task.remainingQuantity || task.issuePending}
              onClick={cameraOn ? stopCamera : startCamera}>{cameraOn ? 'Tắt camera' : 'Mở camera'}</button></div>
          {!cameraOn && <div className="putaway-reticle" aria-hidden="true" />}
          <p>{cameraOn ? 'Hướng camera vào QR ô hoặc barcode sản phẩm.' : 'Camera chưa mở · Có thể dùng máy quét hoặc nhập mã bên dưới.'}</p></div>
        <form className="putaway-scan-form" onSubmit={(event) => { event.preventDefault();
          if (manualCode.trim()) verifiedLocation ? submitProduct(manualCode.trim()) : submitLocation(manualCode.trim()); }}>
          <label htmlFor="putaway-code">{verifiedLocation ? 'Barcode sản phẩm' : `Mã QR ô cần quét · ${task.locationCode}`}</label>
          <div><input id="putaway-code" autoComplete="off" value={manualCode}
            onChange={(event) => setManualCode(event.target.value)}
            placeholder={verifiedLocation ? 'Quét hoặc nhập barcode sản phẩm' : 'Quét hoặc nhập QR vị trí'}
            disabled={busy || !!pendingRetry || !task.remainingQuantity || task.issuePending} />
            <button type="submit" className="putaway-button putaway-button-primary"
              disabled={busy || !!pendingRetry || !manualCode.trim() || !task.remainingQuantity || task.issuePending}>
              {verifiedLocation ? 'Ghi nhận chiếc' : 'Kiểm tra ô'}</button></div></form>
        {pendingRetry && <div className="putaway-retry"><p>Chưa rõ lượt quét vừa rồi đã được ghi nhận hay chưa.</p>
          <button type="button" className="putaway-button putaway-button-primary" disabled={busy}
            onClick={() => submitProduct(pendingRetry.productBarcode, pendingRetry)}>Thử lại cùng mã quét</button></div>}
        <div className="putaway-scan-feedback" role="status">{task.issuePending ? 'Đang chờ quản lý xử lý báo thiếu.'
          : !task.remainingQuantity ? 'Đã xếp đủ theo xác nhận của hệ thống.'
            : verifiedLocation ? 'Đúng ô. Quét từng sản phẩm khi đặt vào kệ.'
              : 'Quét mã ô đã được phân bổ trước khi quét sản phẩm.'}</div>
      </div><aside className="putaway-scan-right"><div className="putaway-log-head"><h3>Lượt quét trong phiên này</h3>
        <span>{scanLog.length} chiếc</span></div>
        <div className="putaway-scan-feed">{scanLog.length ? scanLog.map((entry) => <article key={entry.barcode}>
          <code>{entry.barcode}</code><small>{new Intl.DateTimeFormat('vi-VN', { timeStyle: 'medium' }).format(entry.time)}</small>
          <span>Đã xác nhận trên hệ thống</span></article>) : <p>Chưa có lượt quét sản phẩm trong phiên này.</p>}</div>
        <div className="putaway-soft-note"><strong>Tiến độ chính thức</strong>
          <p>Đã xếp {task.placedQuantity}/{task.allocatedQuantity} chiếc. Tạm dừng không hủy các lượt đã xác nhận.</p></div>
      </aside></div>
      {showShortage && <div className="putaway-report"><h3>Báo thiếu hàng</h3>
        <label>Lý do để quản lý xử lý<textarea value={shortageReason} maxLength={500}
          onChange={(event) => setShortageReason(event.target.value)} /></label>
        <div><button type="button" className="putaway-button" onClick={() => setShowShortage(false)}>Hủy</button>
          <button type="button" className="putaway-button putaway-button-primary" disabled={busy || !shortageReason.trim()}
            onClick={reportShortage}>Gửi báo thiếu</button></div></div>}
      {showIncident && <div className="putaway-report"><h3>Báo sự cố xếp hàng</h3>
        <label>Barcode chiếc liên quan (nếu có)<input value={incidentBarcode}
          onChange={(event) => setIncidentBarcode(event.target.value)} /></label>
        <label>Mô tả sự cố<textarea value={incidentReason} maxLength={500}
          onChange={(event) => setIncidentReason(event.target.value)} /></label>
        <div><button type="button" className="putaway-button" onClick={() => setShowIncident(false)}>Hủy</button>
          <button type="button" className="putaway-button putaway-button-primary" disabled={busy || !incidentReason.trim()}
            onClick={reportIncident}>Gửi sự cố</button></div></div>}
      </div><div className="putaway-modal-foot"><div><button type="button" className="putaway-button" disabled={busy}
        onClick={() => { stopCamera(); setShowShortage(false); setShowIncident((value) => !value); }}>Báo sự cố</button>
        {!!task.remainingQuantity && !task.issuePending && <button type="button" className="putaway-button" disabled={busy}
          onClick={() => { stopCamera(); setShowIncident(false); setShowShortage((value) => !value); }}>Báo thiếu hàng</button>}</div>
        <div><button type="button" className="putaway-button" onClick={closeTask}>Tạm dừng</button>
          {!task.remainingQuantity && <button type="button" className="putaway-button putaway-button-primary"
            onClick={closeTask}>Về danh sách</button>}</div></div>
    </section></div>}
  </main>;
}

export default function WarehousePutawayPage() {
  const [type, setType] = useState('MATERIAL');
  return <>
    <nav className="putaway-type-tabs" aria-label="Loại hàng xếp kệ">
      <button type="button" className={type === 'MATERIAL' ? 'active' : ''}
        aria-pressed={type === 'MATERIAL'} onClick={() => setType('MATERIAL')}>Nguyên phụ liệu</button>
      <button type="button" className={type === 'FINISHED' ? 'active' : ''}
        aria-pressed={type === 'FINISHED'} onClick={() => setType('FINISHED')}>Thành phẩm</button>
    </nav>
    {type === 'MATERIAL' ? <MaterialPutawayPanel /> : <FinishedGoodsPutawayPanel />}
  </>;
}
