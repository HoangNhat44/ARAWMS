/*
 * File: WarehousePackingPage.jsx
 * Author: Duy Anh
 * Date: 2026-10-19
 * Description: Runs order QR scans, unit scans, and packing recordings.
 */
import { useEffect, useRef, useState } from 'react';
import { packingSessionService } from '../services/packingSessionService';
import { savePendingVideo, listPendingVideos, storageEstimate } from '../services/localPackingVideoQueue';
import { packingVideoUploadManager } from '../services/packingVideoUploadManager';

const panel = { background: '#fff', border: '1px solid var(--ara-border)', borderRadius: 10, padding: '1.5rem' };
const inputStyle = { flex: '1 1 240px', padding: '0.7rem', border: '1px solid var(--ara-border)', borderRadius: 6 };
const formatMoney = (value) => value == null ? '—' : `${new Intl.NumberFormat('vi-VN').format(value)} đ`;
const formatDate = (value) => value ? new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'short', timeStyle: 'short',
}).format(new Date(value)) : '—';
const formatBytes = (value) => `${(value / 1024 / 1024).toFixed(1)} MB`;
function Detail({ label, value }) {
  if (value == null || value === '') return null;
  return <div><span style={{ color: 'var(--ara-text-muted)' }}>{label}: </span><strong>{value}</strong></div>;
}
/** Creates an unpredictable ID for the station or a recording retry key. */
const createRandomPackingId = (prefix) => {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return `${prefix}_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
};
const reasons = {
  CLOUDINARY_AUTH_FAILED: 'Cloudinary từ chối API Key hoặc API Secret. Hãy kiểm tra lại bộ khóa của đúng Cloud name trong backend.',
  BARCODE_NOT_FOUND: 'Barcode chưa có trong danh mục vật phẩm.',
  UNIT_UNAVAILABLE: 'Vật phẩm không sẵn sàng hoặc không dùng mã Code 128.',
  BARCODE_ALREADY_SCANNED: 'Vật phẩm này đã được quét trong đơn.',
  BARCODE_ALREADY_ASSIGNED: 'Vật phẩm đã được gắn với đơn này.',
  BARCODE_NOT_SCANNED: 'Barcode này không còn trong danh sách đã quét của đơn.',
  BARCODE_REMOVED: 'Barcode này đã được gỡ khỏi lần đóng hàng.',
  BARCODE_ALLOCATION_MISSING: 'Không tìm thấy liên kết của barcode với đơn. Hãy tải lại phiên trước khi sửa.',
  BARCODE_ASSIGNED_OTHER_ORDER: 'Vật phẩm đã gắn với đơn khác.',
  ITEM_NOT_IN_ORDER: 'Mẫu/SKU trên tem không nằm trong đơn hàng này.',
  QTY_EXCEEDED: 'Đơn đã đủ số lượng của biến thể này.',
  ORDER_LOCKED: 'Đơn đang được xử lý ở bàn kho khác.',
  STATION_BUSY: 'Bàn này đang giữ một đơn khác. Hãy kết thúc đơn hiện tại trước.',
  LEASE_EXPIRED: 'Phiên tại bàn đã hết hạn. Quét lại QR để tiếp tục.',
  ORDER_CHANGED: 'Nội dung đơn đã thay đổi. Cần đối soát lại trước khi quét tiếp.',
  ORDER_NOT_PACKABLE: 'Đơn chưa được phân bổ đủ lô và vị trí kho để đóng hàng.',
  SCAN_INCOMPLETE: 'Chưa quét đủ hàng của đơn. Hãy kiểm tra lại phiên đóng hàng.',
  UNIT_NOT_RESERVED: 'Tem hàng không thuộc lô đã giữ cho đơn này.',
  BATCH_STOCK_CHANGED: 'Tồn hoặc số giữ chỗ của lô đã thay đổi. Hãy báo quản lý kho đối soát.',
  SKU_STOCK_CHANGED: 'Tồn hoặc số giữ chỗ của SKU đã thay đổi. Hãy báo quản lý kho đối soát.',
  LOCATION_STOCK_CHANGED: 'Số lượng tại vị trí kho chưa khớp với lô. Hãy báo quản lý kho đối soát.',
  SCAN_CLOSED: 'Đơn đã đủ hàng; không nhận thêm barcode.',
  CLOUDINARY_NOT_CONFIGURED: 'Chưa cấu hình Cloudinary trên backend. Video vẫn chờ tải lên trên thiết bị này.',
  VIDEO_TOO_LARGE: 'Video vượt giới hạn 512 MB. Cần quay đoạn ngắn hơn.',
  LOCAL_STORAGE_FULL: 'Thiết bị không đủ dung lượng để lưu video an toàn. Hãy báo quản lý trước khi quay tiếp.',
  OPFS_UNAVAILABLE: 'Trình duyệt này không hỗ trợ lưu video tạm bằng OPFS.',
  AUTH_REQUIRED: 'Phiên đăng nhập hết hạn. Hãy đăng nhập lại rồi thử upload video.',
};

/** Displays recording upload progress, local storage use, and actionable errors. */
function VideoUploadStatusPanel({ queue }) {
  const jobs = queue.jobs;
  const active = jobs.filter((job) => job.status !== 'COMPLETED');
  const counts = Object.fromEntries(['UPLOADING', 'QUEUED', 'FAILED', 'SYNC_PENDING', 'COMPLETED']
    .map((status) => [status, jobs.filter((job) => job.status === status).length]));
  const needsSupport = active.filter((job) => job.autoRetry === false).length;
  const waiting = active.filter((job) => job.autoRetry !== false &&
    ['QUEUED', 'FAILED', 'SYNC_PENDING'].includes(job.status)).length;
  const remaining = queue.quota ? queue.quota - queue.usage : null;
  return <section style={panel}>
    <h2>Trạng thái lưu video</h2>
    <p>Mạng: {queue.online ? 'Đang kết nối' : 'Mất kết nối'} · Đang tải: {counts.UPLOADING} · Đang chờ: {waiting} · Cần hỗ trợ: {needsSupport} · Đã lưu: {counts.COMPLETED}</p>
    <p>Video còn trên thiết bị: {formatBytes(active.reduce((sum, job) => sum + (job.fileSize || 0), 0))} · Dung lượng đã dùng: {formatBytes(queue.usage)}{queue.quota ? ` / ${formatBytes(queue.quota)}` : ''}</p>
    {remaining !== null && remaining < 250 * 1024 * 1024 && <p role="alert" style={{ color: 'var(--ara-error)' }}>Thiết bị sắp đầy. Hãy báo quản lý trước khi quay thêm.</p>}
    {!!active.length && <p>Video đang chờ được giữ trên thiết bị này. Giữ nguyên dữ liệu website; khi có mạng, hệ thống sẽ tự tải tiếp.</p>}
    {queue.error && <p role="alert" style={{ color: 'var(--ara-error)' }}>{queue.error}</p>}
    {active.map((job) => <div key={job.recordingId} style={{ borderTop: '1px solid var(--ara-border)', paddingTop: '.65rem', marginTop: '.65rem', overflowWrap: 'anywhere' }}>
      <strong>{job.orderId}</strong> · {formatBytes(job.fileSize || 0)} · {job.autoRetry === false ? 'Cần hỗ trợ' : job.status === 'UPLOADING' ? 'Đang tải' : job.status === 'SYNC_PENDING' ? 'Đang xác nhận lưu' : 'Đang chờ tải'} {job.status === 'UPLOADING' ? `· ${job.progress || 0}%${job.progress === 99 ? ' (đang xác nhận lưu)' : ''}` : ''}
      {job.status === 'UPLOADING' && <progress value={job.progress || 0} max="100" style={{ display: 'block', width: '100%' }} />}
      <div>Quay lúc {formatDate(job.createdAt)}{job.nextRetryAt ? ` · hệ thống sẽ thử lại ${formatDate(job.nextRetryAt)}` : ''}</div>
      {job.lastError && <div role="alert" style={{ color: 'var(--ara-error)' }}>{reasons[job.lastError] || job.lastError}</div>}
      {job.autoRetry === false && <div role="alert" style={{ color: 'var(--ara-error)' }}>Video vẫn ở thiết bị. Hãy báo quản lý để kiểm tra.</div>}
    </div>)}
  </section>;
}

// Keep the station ID stable within this tab so the backend lease identifies one station.
const stationId = (() => {
  const saved = sessionStorage.getItem('arawms_packing_station_id');
  if (saved) return saved;
  const id = createRandomPackingId('station');
  sessionStorage.setItem('arawms_packing_station_id', id);
  return id;
})();

/** Runs the station workflow from order QR through unit scans and video capture.
 * Preserves upload progress and session state when a recording must retry. */
export default function WarehousePackingPage() {
  const [qrInput, setQrInput] = useState('');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [order, setOrder] = useState(null);
  const [session, setSession] = useState(null);
  const [message, setMessage] = useState('');
  const [scanNotice, setScanNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [cameraMode, setCameraMode] = useState(null);
  const [recording, setRecording] = useState(false);
  const [queue, setQueue] = useState(packingVideoUploadManager.snapshot);
  const [playbackUrl, setPlaybackUrl] = useState('');
  const videoRef = useRef(null);
  const recorderRef = useRef(null);
  const playbackUrlRef = useRef('');
  const controlsRef = useRef(null);
  const cameraRequestRef = useRef(0);
  const pendingScanRef = useRef(null);
  const sessionRef = useRef(null);
  const currentQrRef = useRef('');
  const busyRef = useRef(false);
  const lastCameraValueRef = useRef({ value: '', at: 0 });
  const removedCameraBarcodeRef = useRef('');
  const noticeTimerRef = useRef(null);

  // Subscribe to the shared upload queue so progress updates appear in this view.
  useEffect(() => packingVideoUploadManager.subscribe(setQueue), []);

  /** Displays a brief result for a scan without replacing persistent errors. */
  const showScanNotice = (value) => {
    clearTimeout(noticeTimerRef.current);
    setScanNotice(value);
    noticeTimerRef.current = setTimeout(() => setScanNotice(''), 3000);
  };

  /** Stops QR or barcode scanning and invalidates pending camera requests. */
  const stopCamera = () => {
    cameraRequestRef.current += 1;
    controlsRef.current?.stop();
    controlsRef.current = null;
    setCameraMode(null);
  };

  // Preserve an active recording in the local queue when the page unmounts.
  useEffect(() => () => {
    cameraRequestRef.current += 1;
    const active = recorderRef.current;
    if (active && sessionRef.current) {
      const sessionId = sessionRef.current.id;
      const orderId = sessionRef.current.orderId;
      if (active.recorder.state === 'recording') active.recorder.stop();
      active.done.then(async ({ blob, durationMs }) => {
        if (blob.size) await savePendingVideo({
          sessionId, orderId, recordingId: active.recordingId, blob, durationMs,
        });
        await packingVideoUploadManager.refresh();
      }).catch((err) => console.error('Không lưu được video khi rời trang:', err))
        .finally(() => controlsRef.current?.stop());
    } else {
      controlsRef.current?.stop();
    }
    if (playbackUrlRef.current) URL.revokeObjectURL(playbackUrlRef.current);
    clearTimeout(noticeTimerRef.current);
  }, []);

  useEffect(() => {
    /** Warns before a page unload while the local recorder is still active. */
    const warnBeforeLeaving = (event) => {
      if (recorderRef.current) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
  }, []);

  /** Starts recording the current camera stream; persistence follows when recording stops. */
  const startRecording = async () => {
    if (!window.indexedDB || !navigator.storage?.getDirectory) throw new Error('Trình duyệt này cần IndexedDB và OPFS để lưu video an toàn.');
    const { usage, quota } = await storageEstimate();
    if (quota && quota - usage < 100 * 1024 * 1024) throw new Error('LOCAL_STORAGE_FULL');
    const stream = videoRef.current?.srcObject;
    if (!(stream instanceof MediaStream) || !stream.getVideoTracks().some((track) => track.readyState === 'live')) {
      throw new Error('Cần mở camera trước khi quét QR để quay video.');
    }
    if (!window.MediaRecorder) throw new Error('Trình duyệt này không hỗ trợ quay video.');
    const mimeType = ['video/webm;codecs=vp8', 'video/webm', 'video/mp4']
      .find((type) => MediaRecorder.isTypeSupported(type));
    if (!mimeType) throw new Error('Thiết bị không hỗ trợ định dạng video phù hợp.');
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2_000_000 });
    const chunks = [];
    const startedAt = performance.now();
    const done = new Promise((resolve, reject) => {
      recorder.ondataavailable = (event) => { if (event.data?.size) chunks.push(event.data); };
      recorder.onerror = (event) => reject(event.error || new Error('Camera ngừng quay đột ngột.'));
      recorder.onstop = () => {
        setRecording(false);
        resolve({
          blob: new Blob(chunks, { type: mimeType.split(';')[0] }),
          durationMs: Math.max(1, Math.round(performance.now() - startedAt)),
        });
      };
    });
    recorder.start(2000);
    recorderRef.current = { recorder, done, recordingId: createRandomPackingId('recording') };
    setRecording(true);
  };

  /** Stops recording and queues the video in OPFS and IndexedDB. */
  const stopRecordingAndQueueVideo = async (activeSession) => {
    const active = recorderRef.current;
    if (!active) throw new Error('Video của đơn chưa được quay.');
    if (active.recorder.state === 'recording') active.recorder.stop();
    const { blob, durationMs } = await active.done;
    setRecording(false);
    if (!blob.size) throw new Error('Video vừa quay không có dữ liệu.');
    await savePendingVideo({ sessionId: activeSession.id, orderId: activeSession.orderId,
      recordingId: active.recordingId, blob, durationMs });
    recorderRef.current = null;
    await packingVideoUploadManager.refresh();
    packingVideoUploadManager.pump();
  };

  /** Fetches an authorized saved recording for playback. */
  const viewSavedVideo = async () => {
    if (!session) return;
    setError('');
    try {
      const blob = await packingSessionService.getSavedRecording(session.id);
      if (playbackUrlRef.current) URL.revokeObjectURL(playbackUrlRef.current);
      playbackUrlRef.current = URL.createObjectURL(blob);
      setPlaybackUrl(playbackUrlRef.current);
    } catch (err) { setError(`Không xem được video: ${err.message}`); }
  };

  // Renew the station lease each minute while its packing session is open.
  useEffect(() => {
    if (!session) return undefined;
    const timer = setInterval(async () => {
      try {
        const response = await packingSessionService.renewSessionLease(session.id, stationId, session.leaseVersion);
        if (!busyRef.current) {
          sessionRef.current = response.data.session;
          setSession(response.data.session);
        }
      } catch (err) {
        setError(`Phiên soạn hàng cần mở lại: ${err.message}`);
        stopCamera();
        sessionRef.current = null;
        setSession(null);
      }
    }, 60_000);
    return () => clearInterval(timer);
  }, [session?.id, session?.leaseVersion]);

  /** Finalizes the current recording before opening the next scanned order. */
  const openPackingOrderFromQr = async (value) => {
    if (busyRef.current) return;
    const qrValue = value.trim();
    if (sessionRef.current && qrValue === currentQrRef.current) return;
    busyRef.current = true;
    setBusy(true); setError(''); setMessage('');
    let newlyPreparedSession = null;
    try {
      if (!(videoRef.current?.srcObject instanceof MediaStream)) {
        throw new Error('Hãy mở camera trước để quay video cho đơn.');
      }
      if (sessionRef.current) {
        // Check the next QR before ending the current recording.
        const nextOrder = await packingSessionService.resolveOrderQr(qrValue);
        if (nextOrder.data.order.id === sessionRef.current.orderId) {
          setMessage('QR này thuộc đơn đang quay. Tiếp tục quay và quét QR đơn khác khi hoàn tất.');
          return;
        }
        const previous = sessionRef.current;
        const queued = (await listPendingVideos()).some((job) => job.sessionId === previous.id && job.status !== 'COMPLETED');
        if (recorderRef.current) await stopRecordingAndQueueVideo(previous);
        else if (!previous.video && !queued) throw new Error('Đơn hiện tại chưa có video để lưu.');
        await packingSessionService.releaseSession(previous.id, stationId, previous.leaseVersion);
        sessionRef.current = null;
        setSession(null); setOrder(null);
      }
      const response = await packingSessionService.openSession(qrValue, stationId);
      newlyPreparedSession = response.data.session;
      setOrder(response.data.order);
      sessionRef.current = response.data.session;
      setSession(response.data.session);
      setQrInput(qrValue);
      currentQrRef.current = qrValue;
      removedCameraBarcodeRef.current = '';
      setBarcodeInput('');
      const queuedForOrder = (await listPendingVideos()).some((job) => job.sessionId === response.data.session.id && job.status !== 'COMPLETED');
      if (!response.data.session.video && !queuedForOrder) await startRecording();
      else if (queuedForOrder) setMessage('Video của đơn này đang chờ tải lên Cloudinary.');
      showScanNotice(`✓ Đã quét QR đơn ${response.data.order.orderCode}`);
    } catch (err) {
      if (newlyPreparedSession && !recorderRef.current && !newlyPreparedSession.video) {
        await packingSessionService.releaseSession(newlyPreparedSession.id, stationId, newlyPreparedSession.leaseVersion).catch(() => {});
        sessionRef.current = null;
        currentQrRef.current = '';
        setSession(null); setOrder(null); setQrInput('');
      }
      setError(reasons[err.code] || reasons[err.message] || err.message);
    }
    finally { busyRef.current = false; setBusy(false); }
  };

  /** Sends one unit barcode for server validation against the order SKU and FIFO pick.
   * Accepted scans update progress; rejected scans show the specific rule that failed.
   */
  const scanBarcode = async (value) => {
    const activeSession = sessionRef.current;
    if (!activeSession || busyRef.current) return;
    busyRef.current = true;
    const barcode = value.trim();
    const clientEventId = pendingScanRef.current?.barcode === barcode
      ? pendingScanRef.current.id : createRandomPackingId('event');
    pendingScanRef.current = { barcode, id: clientEventId };
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await packingSessionService.scanProductBarcode(activeSession.id, {
        stationId, leaseVersion: activeSession.leaseVersion, clientEventId, barcode,
      });
      sessionRef.current = response.data.session;
      setSession(response.data.session);
      setBarcodeInput('');
      pendingScanRef.current = null;
      if (response.data.result === 'ACCEPTED') {
        showScanNotice(`✓ Đã quét barcode ${barcode}`);
      } else {
        setMessage(reasons[response.data.reason] || response.data.reason);
      }
    } catch (err) { setError(reasons[err.code] || err.message); }
    finally { busyRef.current = false; setBusy(false); }
  };

  /** Removes a scanned unit during recording so it can be replaced. */
  const removeScannedBarcode = async (barcode) => {
    const activeSession = sessionRef.current;
    if (!activeSession || !recording || busyRef.current) return;
    busyRef.current = true;
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await packingSessionService.removeScannedBarcode(activeSession.id, {
        stationId, leaseVersion: activeSession.leaseVersion, barcode,
      });
      sessionRef.current = response.data.session;
      setSession(response.data.session);
      pendingScanRef.current = null;
      removedCameraBarcodeRef.current = barcode;
      setMessage(`Đã gỡ barcode ${barcode}. Có thể quét barcode khác để thay thế.`);
    } catch (err) { setError(reasons[err.code] || err.message); }
    finally { busyRef.current = false; setBusy(false); }
  };

  /** Queues the recording before releasing the station lease. */
  const saveVideoAndReleaseOrder = async () => {
    if (!session) return;
    busyRef.current = true;
    setBusy(true); setError('');
    try {
      if (recorderRef.current) await stopRecordingAndQueueVideo(session);
      await packingSessionService.releaseSession(session.id, stationId, session.leaseVersion);
      sessionRef.current = null;
      setSession(null); setOrder(null); setQrInput(''); setBarcodeInput('');
      currentQrRef.current = '';
      setMessage('Đã kết thúc video và đưa vào hàng chờ lưu. Có thể quét QR đơn tiếp theo.');
    } catch (err) { setError(err.message); }
    finally { busyRef.current = false; setBusy(false); }
  };

  /** Discards the current attempt only when no video is awaiting upload. */
  const discardCurrentPackingAttempt = async () => {
    const activeSession = sessionRef.current;
    if (!activeSession || !recorderRef.current || busyRef.current) return;
    busyRef.current = true;
    setBusy(true); setError(''); setMessage('');
    try {
      const queued = (await listPendingVideos()).some((job) => job.sessionId === activeSession.id && job.status !== 'COMPLETED');
      if (queued) throw new Error('Đơn này đã có video trong hàng chờ. Hãy xử lý video đó trước khi kết thúc lần đóng hàng.');
      const active = recorderRef.current;
      if (active.recorder.state === 'recording') active.recorder.stop();
      await active.done;
      await packingSessionService.discardAttempt(activeSession.id, stationId, activeSession.leaseVersion);
      recorderRef.current = null;
      pendingScanRef.current = null;
      sessionRef.current = null;
      currentQrRef.current = '';
      setSession(null); setOrder(null); setQrInput(''); setBarcodeInput('');
      setMessage('Đã kết thúc và bỏ video lần này. Đơn chưa được tính là đã đóng hàng; có thể quét QR để đóng lại.');
    } catch (err) { setError(reasons[err.code] || err.message); }
    finally { busyRef.current = false; setBusy(false); }
  };

  /** Starts QR and Code 128 scanning while suppressing consecutive duplicate reads. */
  const startCamera = async () => {
    setError('');
    navigator.storage?.persist?.().catch(() => {});
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Camera cần HTTPS hoặc localhost và quyền truy cập thiết bị.');
      return;
    }
    if (cameraMode) return;
    const requestId = ++cameraRequestRef.current;
    setCameraMode('ACTIVE');
    try {
      const { BarcodeFormat, BrowserMultiFormatReader } = await import('@zxing/browser');
      if (requestId !== cameraRequestRef.current) return;
      const reader = new BrowserMultiFormatReader();
      reader.possibleFormats = [BarcodeFormat.QR_CODE, BarcodeFormat.CODE_128];
      const controls = await reader.decodeFromConstraints(
        { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false },
        videoRef.current,
        (result) => {
          if (!result || requestId !== cameraRequestRef.current) return;
          const value = result.getText();
          if (busyRef.current) return;
          if (value === removedCameraBarcodeRef.current) return;
          removedCameraBarcodeRef.current = '';
          const now = Date.now();
          if (lastCameraValueRef.current.value === value && now - lastCameraValueRef.current.at < 2000) return;
          lastCameraValueRef.current = { value, at: now };
          if (value.startsWith('PACK:v1:')) openPackingOrderFromQr(value);
          else if (sessionRef.current?.state === 'SCANNING' && !value.startsWith('PACK:v1:')) scanBarcode(value);
        }
      );
      if (requestId !== cameraRequestRef.current) controls.stop();
      else controlsRef.current = controls;
    } catch (err) {
      if (requestId !== cameraRequestRef.current) return;
      stopCamera();
      setError(`Không mở được camera: ${err.message}`);
    }
  };

  return (
    <div style={{ width: 'min(100%, 950px)', margin: '2rem auto', padding: '0 1rem', display: 'grid', gap: '1rem' }}>
      <h1>Bàn đóng hàng</h1>
      <p>Mở camera một lần: quét QR để mở đơn, sau đó đưa từng barcode sản phẩm vào cùng khung hình để đối soát.</p>
      {scanNotice && <div role="status" className="packing-scan-notice">{scanNotice}</div>}
      {error && <div role="alert" style={{ ...panel, color: 'var(--ara-error)' }}>{error}</div>}
      {message && <div role="status" style={{ ...panel, color: 'var(--ara-success)' }}>{message}</div>}
      <VideoUploadStatusPanel queue={queue} />
      <section style={panel}>
        <h2>1. Camera quét QR và barcode</h2>
        <p>{recording ? 'Đang quay đơn này. Quét QR đơn tiếp theo để tự kết thúc video và bắt đầu đơn mới.' :
          session ? 'Đơn đang mở. Quét QR đơn tiếp theo để chuyển đơn.' : 'Đưa QR đơn hàng vào khung hình.'}</p>
        <button className="btn-ara-secondary" type="button" disabled={recording || !!recorderRef.current || busy} onClick={() => cameraMode ? stopCamera() : startCamera()}>
          {cameraMode ? 'Tắt camera' : 'Mở camera quét mã'}
        </button>
        {recording && <strong role="status" style={{ marginLeft: '1rem', color: 'var(--ara-error)' }}>● ĐANG QUAY</strong>}
        <video ref={videoRef} playsInline muted style={{ display: cameraMode ? 'block' : 'none', width: '100%', maxWidth: 720, marginTop: '1rem', borderRadius: 8 }} />
        <h3 style={{ marginTop: '1rem' }}>Nhập hoặc dùng máy quét QR</h3>
        <form onSubmit={(event) => { event.preventDefault(); openPackingOrderFromQr(qrInput); }} style={{ display: 'flex', flexWrap: 'wrap', gap: '.75rem', marginTop: '1rem' }}>
          <input aria-label="QR đơn hàng" value={qrInput} onChange={(event) => setQrInput(event.target.value)} style={inputStyle} required placeholder="PACK:v1:..." />
          <button className="btn-ara-primary" type="submit" disabled={busy}>Mở đơn</button>
        </form>
      </section>
      {order && <section style={panel}>
        <h2>2. Chi tiết đơn {order.orderCode}</h2>
        <div className="packing-detail-grid">
          <Detail label="Mã đơn" value={order.orderCode} />
          <Detail label="Trạng thái" value={order.status} />
          <Detail label="Kênh bán" value={order.channel} />
          <Detail label="Mã đơn sàn" value={order.externalOrderNo} />
          <Detail label="Ngày tạo" value={order.createdAt && formatDate(order.createdAt)} />
          <Detail label="Ngày chốt" value={order.confirmedAt && formatDate(order.confirmedAt)} />
          <Detail label="Trạng thái đóng hàng" value={order.packingStatus} />
        </div>
        {order.customer && <><h3>Khách hàng</h3><div className="packing-detail-grid">
          <Detail label="Mã khách" value={order.customer.code} />
          <Detail label="Tên" value={order.customer.name} />
          <Detail label="Điện thoại" value={order.customer.phone} />
        </div></>}
        {order.recipient && <><h3>Người nhận</h3><div className="packing-detail-grid">
          <Detail label="Tên" value={order.recipient.name} />
          <Detail label="Điện thoại" value={order.recipient.phone} />
          <Detail label="Địa chỉ" value={order.recipient.address} />
        </div></>}
        {order.shipping && <><h3>Vận chuyển</h3><div className="packing-detail-grid">
          <Detail label="Đơn vị" value={order.shipping.carrierName} />
          <Detail label="Mã vận chuyển" value={order.shipping.carrierCode} />
          <Detail label="Phí khách trả" value={order.shipping.feeCustomer != null && formatMoney(order.shipping.feeCustomer)} />
        </div></>}
        {(order.paymentMethod || order.paymentStatus || order.amounts) && <><h3>Thanh toán</h3><div className="packing-detail-grid">
          <Detail label="Phương thức" value={order.paymentMethod} />
          <Detail label="Trạng thái" value={order.paymentStatus} />
          <Detail label="Tiền hàng" value={order.amounts?.subtotal != null && formatMoney(order.amounts.subtotal)} />
          <Detail label="Giảm giá" value={order.amounts?.discount != null && formatMoney(order.amounts.discount)} />
          <Detail label="Tổng tiền" value={order.amounts?.total != null && formatMoney(order.amounts.total)} />
          <Detail label="Tiền thu hộ" value={order.amounts?.codAmount != null && formatMoney(order.amounts.codAmount)} />
        </div></>}
        {order.note && <p><strong>Ghi chú:</strong> {order.note}</p>}
        <h3>Danh sách sản phẩm ({order.items.reduce((sum, item) => sum + item.quantity, 0)} món)</h3>
        <div className="packing-products-scroll">
          <table className="packing-products-table">
            <thead><tr><th>STT</th><th>Mã mẫu</th><th>Số lượng</th><th>Chiết khấu</th><th>Thành tiền</th></tr></thead>
            <tbody>{session?.items.map((item, index) => {
              const detail = order.items[index];
              return <tr key={item.lineKey}>
                <td>{index + 1}</td>
                <td><strong>{detail?.skuCode || item.skuCode}</strong><small>{[detail?.name || item.name, detail?.color, detail?.size].filter(Boolean).join(' · ')}</small></td>
                <td><strong>{item.scanned}/{item.quantity}</strong><div className="packing-product-checks" aria-label={`Đã quét ${item.scanned} trên ${item.quantity} món`}>
                  {Array.from({ length: item.quantity }, (_, unitIndex) => <span key={unitIndex}
                    className={unitIndex < item.scanned ? 'packing-product-check checked' : 'packing-product-check'}
                    aria-label={`Món ${unitIndex + 1}: ${unitIndex < item.scanned ? 'đã quét' : 'chưa quét'}`}>
                    {unitIndex < item.scanned ? '✓' : '○'}
                  </span>)}
                </div></td>
                <td>{formatMoney(detail?.discountAmount)}</td>
                <td>{formatMoney(detail?.lineTotal)}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>
      </section>}
      {session && <section style={panel}>
        <h2>3. Đối soát barcode sản phẩm</h2>
        <p>Phiên: {session.state === 'READY_TO_RECORD' ? 'Đã đủ hàng' : 'Đang đối soát'}.</p>
        {session.state === 'SCANNING' && <>
          <form onSubmit={(event) => { event.preventDefault(); scanBarcode(barcodeInput); }} style={{ display: 'flex', flexWrap: 'wrap', gap: '.75rem', margin: '1rem 0' }}>
            <input aria-label="Barcode sản phẩm" value={barcodeInput} onChange={(event) => setBarcodeInput(event.target.value)} style={inputStyle} required placeholder="Quét Code 128 trên từng món" />
            <button className="btn-ara-primary" type="submit" disabled={busy}>Gắn sản phẩm với đơn</button>
          </form>
          <p style={{ marginTop: '1rem' }}>Đưa barcode từng món vào khung camera ở trên hoặc dùng máy quét mã.</p>
        </>}
        {session.state === 'READY_TO_RECORD' && <p style={{ marginTop: '1rem', color: 'var(--ara-success)' }}>
          Đã quét đủ sản phẩm. Tiếp tục quay đến khi niêm phong xong, rồi quét QR đơn tiếp theo hoặc kết thúc đơn cuối.
        </p>}
        {session.video && <div style={{ marginTop: '1rem' }}>
          <p>Video đã lưu trên Cloudinary lúc {formatDate(session.video.uploadedAt)}.</p>
          <button type="button" className="btn-ara-secondary" onClick={viewSavedVideo}>Xem video đã lưu</button>
          {playbackUrl && <video controls src={playbackUrl} style={{ display: 'block', width: '100%', maxWidth: 720, marginTop: '1rem' }} />}
        </div>}
        {!!session.scannedUnits?.length && <div style={{ marginTop: '1rem' }}>
          <strong>Barcode đã quét:</strong>
          <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: '.5rem' }}>
            {session.scannedUnits.map((scan) => {
              const item = session.items.find((entry) => entry.lineKey === scan.lineKey);
              return <li key={scan.barcode} style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '.5rem', overflowWrap: 'anywhere' }}>
                <span><strong>{scan.barcode}</strong>{item && ` · ${item.skuCode || item.name}`}</span>
                <button type="button" className="btn-ara-secondary" disabled={busy || !recording || !!session.video}
                  aria-label={`Gỡ barcode ${scan.barcode} khỏi đơn`} onClick={() => removeScannedBarcode(scan.barcode)}>
                  Gỡ mã
                </button>
              </li>;
            })}
          </ul>
        </div>}
        <button type="button" className="btn-ara-secondary" disabled={busy} onClick={saveVideoAndReleaseOrder} style={{ marginTop: '1rem' }}>
          {recording || recorderRef.current ? 'Lưu video và hoàn tất đơn' : 'Đóng phiên tại bàn'}
        </button>
        {!!recorderRef.current && <button type="button" className="btn-ara-secondary" disabled={busy} onClick={discardCurrentPackingAttempt} style={{ marginTop: '1rem', marginLeft: '.5rem' }}>
          Kết thúc
        </button>}
        {!!recorderRef.current && <p style={{ marginTop: '.5rem' }}>“Kết thúc” bỏ video và kết quả quét lần này; đơn có thể đóng lại.</p>}
      </section>}
    </div>
  );
}
