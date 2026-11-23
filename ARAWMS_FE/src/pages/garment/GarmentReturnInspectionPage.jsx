/**
 * ============================================================================
 * @title        : Garment Return Inspection Page
 * @author       : AraWMS Team
 * @createdDate  : 2026-11-11
 * @lastModified : 2026-11-18
 * @description  : Giao diện Kiểm tra hàng hoàn/trả (Garment Technician) với 2 pha chuẩn vận hành:
 *                 - Pha 1: Quét QR đơn hàng hoàn/đổi liên tục + tự động quay video MediaRecorder + quét barcode từng sản phẩm.
 *                   Khi quét QR đơn tiếp theo, hệ thống tự ngừng quay đơn trước, lưu OPFS/IDB và upload nền lên Cloudinary.
 *                 - Pha 2: Phân loại từng sản phẩm (Đạt nhập kho bán lại vs Hàng lỗi DEFECTIVE),
 *                   tự đổi trạng thái đơn theo 3 mức (RETURNED / PARTIALLY_RETURNED / RETURN_FAILED)
 *                   và gửi đồng thời yêu cầu nhập kho hàng đạt (PNHH) + hàng lỗi (PNHL) sang Quản lý kho.
 * @module       : Garment Technical / Return Inspection
 * @layer        : Front-end (Page)
 * ============================================================================
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  RotateCcw,
  Search,
  ScanLine,
  Camera,
  CameraOff,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Video,
  Package,
  RefreshCw,
  Eye,
  Trash2,
  StopCircle,
  Send,
  ShieldCheck,
  ShieldAlert,
  Play,
  X,
  UploadCloud,
} from 'lucide-react';
import garmentTechnicalService from '../../services/garmentTechnicalService';
import {
  savePendingReturnVideo,
  listPendingReturnVideos,
  returnStorageEstimate,
} from '../../services/localReturnVideoQueue';
import { returnVideoUploadManager } from '../../services/returnVideoUploadManager';
import {
  translateColorVi,
  translateProductNameVi,
  formatStatusVi,
} from '../../utils/garmentDisplayVi';
import { useRealtimeRefresh } from '../../hooks/useRealtimeRefresh';

const ITEM_CONDITIONS = [
  { value: 'GOOD_INTACT', label: 'Nguyên vẹn, nguyên tem mác (Tốt)', isDefect: false },
  { value: 'MISSING_TAG', label: 'Mất tem mác / Rách bao bì', isDefect: true },
  { value: 'DIRTY_OR_DAMAGED', label: 'Bẩn, ố màu hoặc rách vải', isDefect: true },
  { value: 'DEFECTIVE_SEWING', label: 'Lỗi đường may, bung chỉ', isDefect: true },
  { value: 'WRONG_ITEM', label: 'Sai sản phẩm / Sai màu / Sai mẫu', isDefect: true },
  { value: 'USED', label: 'Đã qua sử dụng / Có mùi lạ', isDefect: true },
];

const SCAN_ERROR_MESSAGES = {
  BARCODE_ALREADY_SCANNED: 'Mã vạch sản phẩm này đã được quét trong đơn.',
  BARCODE_ASSIGNED_OTHER_ORDER: 'Sản phẩm này thuộc đơn hàng khác, không khớp đơn hoàn hiện tại.',
  ITEM_NOT_IN_ORDER: 'Mẫu, màu sắc hoặc kích cỡ của sản phẩm này không nằm trong đơn hàng gốc.',
  QTY_EXCEEDED: 'Đã quét đủ số lượng cho mã sản phẩm này trong đơn.',
  BARCODE_NOT_FOUND: 'Không tìm thấy mã vạch sản phẩm hoặc mã sản phẩm tương ứng trong đơn.',
  CLOUDINARY_NOT_CONFIGURED: 'Chưa cấu hình máy chủ lưu trữ video. Video đang giữ tạm trên thiết bị.',
  CLOUDINARY_AUTH_FAILED: 'Máy chủ lưu trữ video từ chối xác thực.',
  LOCAL_STORAGE_FULL: 'Thiết bị không đủ dung lượng để lưu video tạm.',
  VIDEO_TOO_LARGE: 'Video vượt giới hạn 512 MB.',
  AUTH_REQUIRED: 'Phiên đăng nhập hết hạn. Hãy đăng nhập lại rồi bấm thử tải lại video.',
};

const ORDER_STATUS_META = {
  EXCHANGE_REQUESTED: { label: 'Đang đổi hàng', bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE' },
  RETURN_REQUESTED: { label: 'Yêu cầu trả hàng', bg: '#FEF3C7', color: '#B45309', border: '#FDE68A' },
  RETURNED: { label: 'Đã hoàn về kho', bg: '#F3E8FF', color: '#6B21A8', border: '#E9D5FF' },
  RETURN_COMPLETED: { label: 'Hoàn thành công', bg: '#ECFDF5', color: '#047857', border: '#A7F3D0' },
  PARTIALLY_RETURNED: { label: 'Hoàn một phần', bg: '#FFF7ED', color: '#C2410C', border: '#FED7AA' },
  RETURN_FAILED: { label: 'Hoàn không thành công', bg: '#FEF2F2', color: '#B91C1C', border: '#FECACA' },
};

const RESULT_BADGE = {
  PASSED: { label: 'Hoàn thành công', bg: '#ECFDF5', color: '#047857', border: '#A7F3D0' },
  PARTIAL: { label: 'Hoàn một phần', bg: '#FFF7ED', color: '#C2410C', border: '#FED7AA' },
  FAILED: { label: 'Hoàn không thành công', bg: '#FEF2F2', color: '#B91C1C', border: '#FECACA' },
};

const createRandomId = (prefix) => {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return `${prefix}_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
};

const formatBytes = (value) => `${((Number(value) || 0) / 1024 / 1024).toFixed(1)} MB`;
const formatDateTime = (value) =>
  value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '—';
const formatTimer = (sec) => {
  const m = String(Math.floor(sec / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return `${m}:${s}`;
};

function playBeep(success = true) {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = success ? 'sine' : 'sawtooth';
    osc.frequency.setValueAtTime(success ? 880 : 320, ctx.currentTime);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc.start();
    osc.stop(ctx.currentTime + 0.16);
  } catch {
    // Ignore audio context restriction errors
  }
}

/** Computes live preview of Option-A order outcome from current unit dispositions. */
function previewOutcome(expectedTotalQty, units = []) {
  const passedQty = units.filter((u) => u.disposition !== 'QUARANTINE_DEFECT').length;
  const defectQty = units.filter((u) => u.disposition === 'QUARANTINE_DEFECT').length;
  if (expectedTotalQty > 0 && passedQty >= expectedTotalQty && defectQty === 0) {
    return { code: 'RETURN_COMPLETED', label: 'Hoàn thành công', passedQty, defectQty, style: RESULT_BADGE.PASSED };
  }
  if (passedQty > 0) {
    return {
      code: 'PARTIALLY_RETURNED',
      label: 'Hoàn một phần',
      passedQty,
      defectQty,
      style: RESULT_BADGE.PARTIAL,
    };
  }
  return { code: 'RETURN_FAILED', label: 'Hoàn không thành công', passedQty, defectQty, style: RESULT_BADGE.FAILED };
}

/** Displays background Cloudinary upload progress for return-unboxing recordings. */
function ReturnVideoUploadPanel({ queue }) {
  const jobs = queue.jobs || [];
  const active = jobs.filter((job) => job.status !== 'COMPLETED');
  const counts = {
    uploading: jobs.filter((j) => j.status === 'UPLOADING').length,
    waiting: jobs.filter((j) => j.autoRetry !== false && ['QUEUED', 'FAILED', 'SYNC_PENDING'].includes(j.status)).length,
    failed: jobs.filter((j) => j.autoRetry === false).length,
    completed: jobs.filter((j) => j.status === 'COMPLETED').length,
  };

  if (jobs.length === 0 && !queue.error) return null;

  return (
    <section
      style={{
        background: '#FFF',
        border: '1px solid #E5E7EB',
        borderRadius: 12,
        padding: '1rem 1.25rem',
        marginBottom: '1.25rem',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: '#1F2937' }}>
          <UploadCloud size={18} color="#2563EB" />
          <span>Trạng thái tải video hoàn/trả lên máy chủ</span>
        </div>
        <div style={{ fontSize: '0.82rem', color: '#4B5563', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <span>Mạng: <strong style={{ color: queue.online ? '#059669' : '#DC2626' }}>{queue.online ? 'Đang kết nối' : 'Mất kết nối'}</strong></span>
          <span>Đang tải: <strong>{counts.uploading}</strong></span>
          <span>Đang chờ: <strong>{counts.waiting}</strong></span>
          <span>Lỗi: <strong style={{ color: counts.failed ? '#DC2626' : '#374151' }}>{counts.failed}</strong></span>
          <span>Đã lưu: <strong style={{ color: '#059669' }}>{counts.completed}</strong></span>
          <span>Tạm trên máy: <strong>{formatBytes(active.reduce((s, j) => s + (j.fileSize || 0), 0))}</strong></span>
        </div>
      </div>

      {queue.error && (
        <div style={{ marginTop: 8, fontSize: '0.84rem', color: '#B91C1C' }}>{queue.error}</div>
      )}

      {active.map((job) => (
        <div
          key={job.recordingId}
          style={{
            marginTop: 10,
            paddingTop: 10,
            borderTop: '1px solid #F3F4F6',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, fontSize: '0.85rem' }}>
            <div>
              <strong>{job.orderCode || job.orderId}</strong>
              {job.inspectionCode ? ` (${job.inspectionCode})` : ''} · {formatBytes(job.fileSize)} ·{' '}
              <span style={{ color: job.autoRetry === false ? '#DC2626' : '#2563EB', fontWeight: 600 }}>
                {job.autoRetry === false
                  ? 'Cần thử lại'
                  : job.status === 'UPLOADING'
                    ? `Đang tải video lên hệ thống (${job.progress || 0}%)`
                    : job.status === 'SYNC_PENDING'
                      ? 'Đang đồng bộ dữ liệu...'
                      : 'Đang chờ tải'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {(job.status === 'FAILED' || job.autoRetry === false || job.status === 'SYNC_PENDING') && (
                <button
                  type="button"
                  onClick={() => returnVideoUploadManager.retry(job.recordingId)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 6,
                    border: '1px solid #2563EB',
                    background: '#EFF6FF',
                    color: '#1D4ED8',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Thử tải lại
                </button>
              )}
            </div>
          </div>
          {job.status === 'UPLOADING' && (
            <progress value={job.progress || 0} max="100" style={{ width: '100%', height: 8 }} />
          )}
          {job.lastError && (
            <div style={{ fontSize: '0.8rem', color: '#DC2626' }}>
              {SCAN_ERROR_MESSAGES[job.lastError] || job.lastError}
            </div>
          )}
        </div>
      ))}
    </section>
  );
}

export default function GarmentReturnInspectionPage() {
  // Camera & continuous MediaRecorder refs
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const activeSessionRef = useRef(null);
  const busyRef = useRef(false);
  const lastCameraScanRef = useRef({ value: '', at: 0 });
  const playbackUrlRef = useRef('');

  // Camera & Recording state
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [cameraDevices, setCameraDevices] = useState([]);
  const [activeDeviceIndex, setActiveDeviceIndex] = useState(0);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [busy, setBusy] = useState(false);

  // Active scan/record session state
  const [orderQrInput, setOrderQrInput] = useState('');
  const [unitBarcodeInput, setUnitBarcodeInput] = useState('');
  const [activeSession, setActiveSession] = useState(null);
  const [activeOrder, setActiveOrder] = useState(null);
  const [packedUnits, setPackedUnits] = useState([]);
  const [recentOrders, setRecentOrders] = useState([]);

  // Background upload queue
  const [uploadQueue, setUploadQueue] = useState(returnVideoUploadManager.snapshot);

  // Phase 2: Pending review inspections & per-unit classification state
  const [pendingReviews, setPendingReviews] = useState([]);
  const [loadingPending, setLoadingPending] = useState(false);
  const [selectedReviewIds, setSelectedReviewIds] = useState([]);
  // Map<inspectionId, { qcNote, rejectReason, units: Map<unitBarcode, { disposition, condition, note }> }>
  const [reviewEdits, setReviewEdits] = useState({});
  const [finalizingBatch, setFinalizingBatch] = useState(false);

  // Phase 3: Finalized history
  const [historyList, setHistoryList] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [stats, setStats] = useState({
    totalCount: 0,
    pendingReviewCount: 0,
    passedCount: 0,
    partialCount: 0,
    failedCount: 0,
    pendingInboundCount: 0,
  });
  const [resultFilter, setResultFilter] = useState('ALL');
  const [tableSearch, setTableSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Video playback modal & detail modal
  const [videoModal, setVideoModal] = useState(null); // { title, url, loading, error }
  const [viewingInspection, setViewingInspection] = useState(null);

  // Toast alert banner
  const [alertBanner, setAlertBanner] = useState(null);
  const alertTimerRef = useRef(null);
  const showAlert = useCallback((type, message) => {
    clearTimeout(alertTimerRef.current);
    setAlertBanner({ type, message });
    alertTimerRef.current = setTimeout(() => setAlertBanner(null), 6000);
  }, []);

  // Load recent eligible orders
  const fetchRecentOrders = useCallback(async () => {
    try {
      const res = await garmentTechnicalService.returnInspection.getRecentOrders();
      setRecentOrders(res?.data || []);
    } catch {
      // ignore non-fatal suggestion fetch error
    }
  }, []);

  // Load Phase 2: Pending review sessions
  // Tự tải lại khi role khác thay đổi dữ liệu liên quan (không cần reload trang)
  useRealtimeRefresh(['arawms-technical-inbound-realtime'], () => { fetchPendingReviews(); fetchHistory(); });
  const fetchPendingReviews = useCallback(async () => {
    setLoadingPending(true);
    try {
      const res = await garmentTechnicalService.returnInspection.getInspections({
        sessionStatus: 'PENDING_REVIEW',
        limit: 100,
      });
      const list = res?.data?.inspections || [];
      setPendingReviews(list);
      if (res?.data?.stats) setStats(res.data.stats);

      // Initialize per-unit edit state for newly loaded pending inspections
      setReviewEdits((prev) => {
        const next = { ...prev };
        for (const insp of list) {
          if (!next[insp._id]) {
            const unitsObj = {};
            for (const u of insp.scannedUnits || []) {
              unitsObj[u.unitBarcode] = {
                disposition: u.disposition || 'RESTOCK_SALEABLE',
                condition: u.condition || 'GOOD_INTACT',
                note: u.note || '',
              };
            }
            next[insp._id] = {
              qcNote: insp.qcNote || '',
              rejectReason: insp.rejectReason || '',
              units: unitsObj,
            };
          }
        }
        return next;
      });
    } catch (err) {
      console.error('Lỗi tải danh sách chờ phân loại:', err);
    } finally {
      setLoadingPending(false);
    }
  }, []);

  // Load Phase 3: Finalized history
  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await garmentTechnicalService.returnInspection.getInspections({
        sessionStatus: 'FINALIZED',
        result: resultFilter === 'ALL' ? undefined : resultFilter,
        search: tableSearch.trim() || undefined,
        page,
        limit: 20,
      });
      setHistoryList(res?.data?.inspections || []);
      if (res?.data?.stats) setStats(res.data.stats);
      if (res?.data?.pagination) setTotalPages(res.data.pagination.totalPages || 1);
    } catch (err) {
      showAlert('error', err.message || 'Không thể tải lịch sử kiểm tra hàng hoàn');
    } finally {
      setLoadingHistory(false);
    }
  }, [resultFilter, tableSearch, page, showAlert]);

  useEffect(() => {
    fetchRecentOrders();
    fetchPendingReviews();
  }, [fetchRecentOrders, fetchPendingReviews]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Subscribe to background return video upload manager
  useEffect(() => {
    const unsubQueue = returnVideoUploadManager.subscribe(setUploadQueue);
    const unsubDone = returnVideoUploadManager.onUploadCompleted((job) => {
      showAlert('success', `Video đơn ${job.orderCode || job.orderId} đã tải xong lên hệ thống!`);
      fetchPendingReviews();
      fetchHistory();
    });
    return () => {
      unsubQueue();
      unsubDone();
    };
  }, [fetchPendingReviews, fetchHistory, showAlert]);

  // Recording elapsed timer
  useEffect(() => {
    if (!recording) {
      setRecordingSeconds(0);
      return undefined;
    }
    const timer = setInterval(() => setRecordingSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [recording]);

  // Warn user before leaving while recording is active
  useEffect(() => {
    const warnUnload = (event) => {
      if (recorderRef.current) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warnUnload);
    return () => window.removeEventListener('beforeunload', warnUnload);
  }, []);

  // Preserve active recording to local queue if component unmounts mid-recording
  useEffect(() => {
    return () => {
      const activeRec = recorderRef.current;
      const sess = activeSessionRef.current;
      if (activeRec && sess) {
        if (activeRec.recorder.state === 'recording') activeRec.recorder.stop();
        activeRec.done
          .then(async ({ blob, durationMs }) => {
            if (blob.size) {
              await savePendingReturnVideo({
                sessionId: sess._id,
                orderId: sess.orderId,
                orderCode: sess.orderCode,
                inspectionCode: sess.inspectionCode,
                recordingId: activeRec.recordingId,
                blob,
                durationMs,
              });
              await returnVideoUploadManager.refresh();
              returnVideoUploadManager.pump();
            }
          })
          .catch(() => {})
          .finally(() => stopCameraInternal());
      } else {
        stopCameraInternal();
      }
      if (playbackUrlRef.current) URL.revokeObjectURL(playbackUrlRef.current);
      clearTimeout(alertTimerRef.current);
    };
  }, []);

  const stopCameraInternal = () => {
    if (controlsRef.current) {
      try {
        controlsRef.current.stop();
      } catch {
        // ignore
      }
      controlsRef.current = null;
    }
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach((track) => track.stop());
      } catch {
        // ignore
      }
      streamRef.current = null;
    }
    if (videoRef.current?.srcObject) {
      try {
        videoRef.current.srcObject.getTracks().forEach((track) => track.stop());
      } catch {
        // ignore
      }
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  };

  /** Starts MediaRecorder on the currently live camera stream. */
  const startRecordingOnLiveStream = async () => {
    const { usage, quota } = await returnStorageEstimate();
    if (quota && quota - usage < 100 * 1024 * 1024) {
      throw new Error('LOCAL_STORAGE_FULL');
    }
    const stream = streamRef.current || videoRef.current?.srcObject;
    if (!(stream instanceof MediaStream) || !stream.getVideoTracks().some((t) => t.readyState === 'live')) {
      throw new Error('Cần mở camera trước khi quét QR đơn hoàn để quay video.');
    }
    if (!window.MediaRecorder) {
      throw new Error('Trình duyệt này không hỗ trợ quay video.');
    }
    const mimeType = ['video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find((type) =>
      MediaRecorder.isTypeSupported(type)
    );
    if (!mimeType) {
      throw new Error('Thiết bị không hỗ trợ định dạng video WebM/MP4.');
    }

    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2_000_000 });
    const chunks = [];
    const startedAt = performance.now();
    const done = new Promise((resolve, reject) => {
      recorder.ondataavailable = (event) => {
        if (event.data?.size) chunks.push(event.data);
      };
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
    recorderRef.current = { recorder, done, recordingId: createRandomId('retvid') };
    setRecording(true);
    setRecordingSeconds(0);
  };

  /** Stops the active MediaRecorder and queues its blob for background Cloudinary upload. */
  const stopRecordingAndQueue = async (sessionObj) => {
    const activeRec = recorderRef.current;
    if (!activeRec) return false;
    if (activeRec.recorder.state === 'recording') activeRec.recorder.stop();
    const { blob, durationMs } = await activeRec.done;
    recorderRef.current = null;
    setRecording(false);
    if (!blob.size) throw new Error('Video vừa quay không có dữ liệu.');

    await savePendingReturnVideo({
      sessionId: sessionObj._id,
      orderId: sessionObj.orderId,
      orderCode: sessionObj.orderCode,
      inspectionCode: sessionObj.inspectionCode,
      recordingId: activeRec.recordingId,
      blob,
      durationMs,
    });
    await returnVideoUploadManager.refresh();
    returnVideoUploadManager.pump();
    return true;
  };

  /** Opens/switches to a return order session: stops & queues previous order's video automatically, then starts new recording. */
  const openOrSwitchOrderFromQr = async (rawCode) => {
    const code = String(rawCode || '').trim();
    if (!code || busyRef.current) return;

    const stream = streamRef.current || videoRef.current?.srcObject;
    if (!(stream instanceof MediaStream) || !stream.getVideoTracks().some((t) => t.readyState === 'live')) {
      showAlert('warning', 'Vui lòng bấm "Mở Camera" trước khi quét QR đơn hàng để hệ thống tự động quay video.');
      return;
    }

    busyRef.current = true;
    setBusy(true);
    try {
      const prevSession = activeSessionRef.current;

      // Avoid stopping recording if user accidentally re-scans the currently recording order
      if (prevSession) {
        const lookupRes = await garmentTechnicalService.returnInspection.lookupOrder(code);
        const targetOrder = lookupRes?.data?.order;
        if (targetOrder && String(targetOrder._id) === String(prevSession.orderId)) {
          showAlert('warning', `Đơn ${prevSession.orderCode} đang quay. Tiếp tục quét sản phẩm hoặc quét QR đơn khác để chuyển đơn.`);
          return;
        }

        // Stop previous recording -> push to background Cloudinary upload -> mark previous PENDING_REVIEW
        if (recorderRef.current) {
          await stopRecordingAndQueue(prevSession);
        }
        await garmentTechnicalService.returnInspection.finishRecording(prevSession._id);
        activeSessionRef.current = null;
        setActiveSession(null);
        setActiveOrder(null);
        setPackedUnits([]);
      }

      // Open new session & start recording immediately
      const res = await garmentTechnicalService.returnInspection.openSession(code);
      const { session: newSession, order: newOrder, packedUnits: units } = res.data;

      activeSessionRef.current = newSession;
      setActiveSession(newSession);
      setActiveOrder(newOrder);
      setPackedUnits(units || []);
      setOrderQrInput('');
      setUnitBarcodeInput('');

      const pendingJobs = await listPendingReturnVideos();
      const alreadyQueued = pendingJobs.some((j) => j.sessionId === newSession._id && j.status !== 'COMPLETED');
      if (!newSession.video?.publicId && !alreadyQueued) {
        await startRecordingOnLiveStream();
      }

      playBeep(true);
      if (prevSession) {
        const prevExpected = (prevSession.items || []).reduce((s, it) => s + (Number(it.quantity) || 0), 0);
        const prevScanned = (prevSession.scannedUnits || []).length;
        if (prevScanned < prevExpected) {
          showAlert(
            'warning',
            `Lưu ý: Đơn ${prevSession.orderCode} đang thiếu hàng — mới quét ${prevScanned}/${prevExpected} sản phẩm (thiếu ${prevExpected - prevScanned}). Video đã đưa lên hàng đợi tải và đang quay tiếp đơn ${newOrder.orderCode}.`
          );
        } else {
          showAlert(
            'success',
            `Đã lưu video đơn ${prevSession.orderCode} (${prevScanned}/${prevExpected}) vào hàng đợi tải và bắt đầu quay đơn ${newOrder.orderCode}!`
          );
        }
      } else {
        showAlert('success', `Đã mở đơn ${newOrder.orderCode} (${newSession.inspectionCode}) và bắt đầu quay video!`);
      }
      fetchPendingReviews();
      fetchRecentOrders();
    } catch (err) {
      playBeep(false);
      showAlert('error', SCAN_ERROR_MESSAGES[err.code] || SCAN_ERROR_MESSAGES[err.message] || err.message || 'Không thể mở đơn hàng hoàn');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  /** Scans one physical product unit barcode into the currently recording return order. */
  const handleScanUnitBarcode = async (rawBarcode) => {
    const sess = activeSessionRef.current;
    const barcode = String(rawBarcode || '').trim();
    if (!sess || !barcode || busyRef.current) return;

    busyRef.current = true;
    setBusy(true);
    try {
      const res = await garmentTechnicalService.returnInspection.scanUnit(sess._id, barcode);
      const { result, reason, session: updatedSession } = res.data;
      activeSessionRef.current = updatedSession;
      setActiveSession(updatedSession);
      setUnitBarcodeInput('');

      if (result === 'ACCEPTED') {
        playBeep(true);
        showAlert('success', `✓ Đã quét sản phẩm ${barcode} vào đơn ${updatedSession.orderCode}`);
      } else {
        playBeep(false);
        showAlert('error', `${SCAN_ERROR_MESSAGES[reason] || reason} (${barcode})`);
      }
    } catch (err) {
      playBeep(false);
      showAlert('error', err.message || `Không nhận mã vạch ${barcode}`);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  /** Removes a mistakenly scanned unit barcode during recording. */
  const handleRemoveScannedUnit = async (barcode) => {
    const sess = activeSessionRef.current;
    if (!sess || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const res = await garmentTechnicalService.returnInspection.removeUnit(sess._id, barcode);
      activeSessionRef.current = res.data.session;
      setActiveSession(res.data.session);
      showAlert('success', `Đã gỡ mã vạch ${barcode} khỏi đơn ${sess.orderCode}`);
    } catch (err) {
      showAlert('error', err.message || 'Không thể gỡ mã vạch');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  /** Stops the final order recording, queues Cloudinary upload, and moves order to Phase 2 review list. */
  const handleFinishLastOrder = async () => {
    const sess = activeSessionRef.current;
    if (!sess || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      if (recorderRef.current) {
        await stopRecordingAndQueue(sess);
      }
      await garmentTechnicalService.returnInspection.finishRecording(sess._id);
      activeSessionRef.current = null;
      setActiveSession(null);
      setActiveOrder(null);
      setPackedUnits([]);
      playBeep(true);
      const expected = (sess.items || []).reduce((s, it) => s + (Number(it.quantity) || 0), 0);
      const scanned = (sess.scannedUnits || []).length;
      if (scanned < expected) {
        showAlert(
          'warning',
          `Lưu ý: Đơn ${sess.orderCode} đang thiếu hàng — mới quét ${scanned}/${expected} sản phẩm (thiếu ${expected - scanned}). Video đang được tải lên hệ thống và đơn đã chuyển xuống danh sách chờ phân loại.`
        );
      } else {
        showAlert(
          'success',
          `Đã dừng quay đơn ${sess.orderCode} (${scanned}/${expected}), video đang tải lên hệ thống và đơn đã chuyển sang danh sách chờ phân loại bên dưới!`
        );
      }
      fetchPendingReviews();
      fetchRecentOrders();
    } catch (err) {
      playBeep(false);
      showAlert('error', SCAN_ERROR_MESSAGES[err.message] || err.message || 'Không thể kết thúc quay đơn');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  /** Cancels the active draft recording without saving video. */
  const handleCancelCurrentRecording = async () => {
    const sess = activeSessionRef.current;
    if (!sess || busyRef.current) return;
    if (!window.confirm(`Hủy lần quay hiện tại cho đơn ${sess.orderCode}? Video đang quay sẽ bị bỏ.`)) return;

    busyRef.current = true;
    setBusy(true);
    try {
      if (recorderRef.current) {
        const rec = recorderRef.current;
        if (rec.recorder.state === 'recording') rec.recorder.stop();
        await rec.done.catch(() => {});
        recorderRef.current = null;
        setRecording(false);
      }
      await garmentTechnicalService.returnInspection.cancelSession(sess._id);
      activeSessionRef.current = null;
      setActiveSession(null);
      setActiveOrder(null);
      setPackedUnits([]);
      showAlert('warning', `Đã hủy phiên quay nháp cho đơn ${sess.orderCode}.`);
      fetchPendingReviews();
      fetchRecentOrders();
    } catch (err) {
      showAlert('error', err.message || 'Không thể hủy phiên');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  /** Starts continuous camera + @zxing/browser scanner decoding both Order QR & ProductUnit CODE_128. */
  const startCamera = async (targetIndex = null) => {
    if (cameraActive && targetIndex === null) return;
    setCameraError('');

    if (!navigator.mediaDevices?.getUserMedia) {
      const msg = 'Trình duyệt yêu cầu kết nối an toàn (HTTPS hoặc localhost) để mở Camera.';
      setCameraError(msg);
      showAlert('error', msg);
      return;
    }

    try {
      stopCameraInternal();
      setCameraActive(true);
      await new Promise((resolve) => setTimeout(resolve, 80));

      const videoEl = videoRef.current;
      if (!videoEl) throw new Error('Không tìm thấy khung hình video.');

      let devices = [];
      try {
        devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
        setCameraDevices(devices);
      } catch {
        // ignore enumerate errors
      }

      const devIdx = targetIndex !== null ? targetIndex : activeDeviceIndex;
      const targetDevice = devices[devIdx];

      let stream;
      if (targetDevice?.deviceId) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { deviceId: { exact: targetDevice.deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } },
            audio: false,
          });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { deviceId: { exact: targetDevice.deviceId } },
            audio: false,
          });
        }
      } else {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
            audio: false,
          });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }
      }

      streamRef.current = stream;
      videoEl.srcObject = stream;
      videoEl.setAttribute('playsinline', 'true');
      videoEl.setAttribute('autoplay', 'true');
      videoEl.muted = true;
      await videoEl.play().catch(() => {});

      const { BarcodeFormat, BrowserMultiFormatReader } = await import('@zxing/browser');
      const reader = new BrowserMultiFormatReader();
      reader.possibleFormats = [
        BarcodeFormat.QR_CODE,
        BarcodeFormat.CODE_128,
        BarcodeFormat.CODE_39,
        BarcodeFormat.EAN_13,
        BarcodeFormat.UPC_A,
      ];

      const controls = await reader.decodeFromStream(stream, videoEl, (result) => {
        if (!result || busyRef.current) return;
        const text = String(result.getText() || '').trim();
        if (!text) return;

        const now = Date.now();
        if (lastCameraScanRef.current.value === text && now - lastCameraScanRef.current.at < 2000) return;
        lastCameraScanRef.current = { value: text, at: now };

        const isOrderQr =
          text.startsWith('PACK:v1:') ||
          /^[a-f0-9]{64}$/i.test(text) ||
          /^(ORD|SO|DH|RMA)-/i.test(text);

        if (isOrderQr || !activeSessionRef.current) {
          openOrSwitchOrderFromQr(text);
        } else {
          handleScanUnitBarcode(text);
        }
      });

      controlsRef.current = controls;
    } catch (err) {
      stopCameraInternal();
      const msg = `Không thể mở Camera: ${err.message || 'Vui lòng cấp quyền Camera.'}`;
      setCameraError(msg);
      showAlert('error', msg);
    }
  };

  const switchCamera = async () => {
    if (cameraDevices.length <= 1 || recording) return;
    const nextIdx = (activeDeviceIndex + 1) % cameraDevices.length;
    setActiveDeviceIndex(nextIdx);
    await startCamera(nextIdx);
  };

  /** Opens an authenticated Cloudinary video stream inside an inline player modal. */
  const openVideoPlayer = async (insp) => {
    setVideoModal({ title: `Video khui kiện — ${insp.orderCode} (${insp.inspectionCode})`, url: '', loading: true, error: '' });
    try {
      if (playbackUrlRef.current) {
        URL.revokeObjectURL(playbackUrlRef.current);
        playbackUrlRef.current = '';
      }
      if (insp.video?.publicId || insp.videoPublicId) {
        const blob = await garmentTechnicalService.returnInspection.getSavedVideo(insp._id);
        const objectUrl = URL.createObjectURL(blob);
        playbackUrlRef.current = objectUrl;
        setVideoModal({
          title: `Video khui kiện — ${insp.orderCode} (${insp.inspectionCode})`,
          url: objectUrl,
          loading: false,
          error: '',
        });
      } else if (insp.videoUrl) {
        setVideoModal({
          title: `Video khui kiện — ${insp.orderCode} (${insp.inspectionCode})`,
          url: insp.videoUrl,
          loading: false,
          error: '',
        });
      } else {
        throw new Error('Biên bản này chưa có video đã lưu.');
      }
    } catch (err) {
      setVideoModal({
        title: `Video khui kiện — ${insp.orderCode}`,
        url: '',
        loading: false,
        error: err.message || 'Không thể phát video.',
      });
    }
  };

  // Phase 2 helpers: update unit disposition / condition / note
  const updateUnitDecision = (inspId, unitBarcode, patch) => {
    setReviewEdits((prev) => {
      const current = prev[inspId] || { qcNote: '', rejectReason: '', units: {} };
      const unitCurr = current.units[unitBarcode] || { disposition: 'RESTOCK_SALEABLE', condition: 'GOOD_INTACT', note: '' };
      return {
        ...prev,
        [inspId]: {
          ...current,
          units: {
            ...current.units,
            [unitBarcode]: { ...unitCurr, ...patch },
          },
        },
      };
    });
  };

  const updateInspectionMeta = (inspId, field, value) => {
    setReviewEdits((prev) => ({
      ...prev,
      [inspId]: {
        ...(prev[inspId] || { qcNote: '', rejectReason: '', units: {} }),
        [field]: value,
      },
    }));
  };

  const isVideoReady = (insp) => Boolean(insp.video?.url || insp.videoUrl);
  const getActiveUploadForSession = (sessionId) =>
    (uploadQueue.jobs || []).find((j) => j.sessionId === sessionId && j.status !== 'COMPLETED');

  const readyReviewIds = useMemo(
    () => pendingReviews.filter((insp) => isVideoReady(insp)).map((insp) => insp._id),
    [pendingReviews]
  );

  const toggleSelectReview = (id) => {
    setSelectedReviewIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleSelectAllReady = () => {
    if (selectedReviewIds.length === readyReviewIds.length && readyReviewIds.length > 0) {
      setSelectedReviewIds([]);
    } else {
      setSelectedReviewIds(readyReviewIds);
    }
  };

  // Summary of selected pending reviews for Phase 2 batch action bar
  const selectedBatchSummary = useMemo(() => {
    let restockCount = 0;
    let defectCount = 0;
    for (const inspId of selectedReviewIds) {
      const insp = pendingReviews.find((x) => x._id === inspId);
      if (!insp) continue;
      const edits = reviewEdits[inspId]?.units || {};
      for (const u of insp.scannedUnits || []) {
        const disp = edits[u.unitBarcode]?.disposition || u.disposition || 'RESTOCK_SALEABLE';
        if (disp === 'QUARANTINE_DEFECT') defectCount += 1;
        else restockCount += 1;
      }
    }
    return { orderCount: selectedReviewIds.length, restockCount, defectCount };
  }, [selectedReviewIds, pendingReviews, reviewEdits]);

  /** Finalizes classification for selected orders, updates order statuses & DEFECTIVE units, and creates PNHH + PNHL tickets. */
  const handleFinalizeBatch = async (targetIds = selectedReviewIds) => {
    const ids = Array.isArray(targetIds) ? targetIds : [targetIds];
    if (ids.length === 0) {
      showAlert('warning', 'Vui lòng chọn ít nhất một đơn đã tải xong video để chốt phân loại & yêu cầu nhập kho.');
      return;
    }

    const payloadInspections = [];
    for (const inspId of ids) {
      const insp = pendingReviews.find((x) => x._id === inspId);
      if (!insp) continue;
      if (!isVideoReady(insp)) {
        showAlert('warning', `Đơn ${insp.orderCode} vẫn đang tải video lên hệ thống. Vui lòng đợi tải xong rồi chốt.`);
        return;
      }
      const edit = reviewEdits[inspId] || { qcNote: '', rejectReason: '', units: {} };
      const unitsPayload = (insp.scannedUnits || []).map((u) => {
        const d = edit.units[u.unitBarcode] || {};
        return {
          unitBarcode: u.unitBarcode,
          disposition: d.disposition || u.disposition || 'RESTOCK_SALEABLE',
          condition: d.condition || u.condition || 'GOOD_INTACT',
          note: d.note || '',
        };
      });
      payloadInspections.push({
        inspectionId: insp._id,
        qcNote: edit.qcNote || '',
        rejectReason: edit.rejectReason || '',
        units: unitsPayload,
      });
    }

    if (
      !window.confirm(
        `Xác nhận chốt phân loại cho ${payloadInspections.length} đơn hàng và gửi yêu cầu nhập kho (hàng đạt + hàng lỗi) sang Quản lý kho?`
      )
    ) {
      return;
    }

    setFinalizingBatch(true);
    try {
      const res = await garmentTechnicalService.returnInspection.finalizeAndRequestInbound({
        inspections: payloadInspections,
      });
      const { restockTicket, defectTicket, finalizedCount } = res.data || {};
      const parts = [`Đã chốt ${finalizedCount || payloadInspections.length} đơn hoàn!`];
      if (restockTicket) parts.push(`Phiếu nhập hàng đạt: ${restockTicket.ticketCode}`);
      if (defectTicket) parts.push(`Phiếu nhập hàng lỗi: ${defectTicket.ticketCode}`);
      playBeep(true);
      showAlert('success', parts.join(' · '));

      setSelectedReviewIds([]);
      fetchPendingReviews();
      fetchHistory();
      fetchRecentOrders();
    } catch (err) {
      playBeep(false);
      showAlert('error', err.message || 'Không thể chốt phân loại & tạo phiếu nhập kho');
    } finally {
      setFinalizingBatch(false);
    }
  };

  // Helper: active session progress per SKU
  const activeSessionProgress = useMemo(() => {
    if (!activeSession) return { scanned: 0, expected: 0 };
    const expected = (activeSession.items || []).reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);
    const scanned = (activeSession.scannedUnits || []).length;
    return { scanned, expected };
  }, [activeSession]);

  return (
    <div style={{ padding: '1.5rem', maxWidth: 1440, margin: '0 auto' }}>
      <style>{`
        @keyframes pulseRec {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.25; }
        }
      `}</style>

      {/* Alert Toast */}
      {alertBanner && (
        <div
          role="alert"
          style={{
            position: 'fixed',
            top: 78,
            right: 24,
            zIndex: 9999,
            maxWidth: 480,
            padding: '0.85rem 1.1rem',
            borderRadius: 10,
            boxShadow: '0 10px 25px rgba(0,0,0,0.14)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background:
              alertBanner.type === 'success' ? '#ECFDF5' : alertBanner.type === 'warning' ? '#FFFBEB' : '#FEF2F2',
            border: `1px solid ${
              alertBanner.type === 'success' ? '#6EE7B7' : alertBanner.type === 'warning' ? '#FCD34D' : '#FCA5A5'
            }`,
            color:
              alertBanner.type === 'success' ? '#065F46' : alertBanner.type === 'warning' ? '#92400E' : '#991B1B',
            fontSize: '0.88rem',
            fontWeight: 500,
          }}
        >
          {alertBanner.type === 'success' ? (
            <CheckCircle2 size={18} />
          ) : alertBanner.type === 'warning' ? (
            <AlertTriangle size={18} />
          ) : (
            <XCircle size={18} />
          )}
          <span style={{ flex: 1 }}>{alertBanner.message}</span>
          <button
            type="button"
            onClick={() => setAlertBanner(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 2 }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Page Header */}
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: '1.25rem',
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: '#111827', display: 'flex', alignItems: 'center', gap: 10 }}>
            <RotateCcw size={24} color="#B45309" />
            Kiểm tra & Quay video hàng hoàn/trả
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: '0.9rem', color: '#4B5563' }}>
            Giai đoạn 1: Quét mã QR đơn hoàn → tự quay video &amp; quét mã vạch từng sản phẩm → quét mã QR đơn tiếp theo để tự động lưu video lên hệ thống. Giai đoạn 2: Phân loại hàng đạt / hàng lỗi &amp; gửi yêu cầu nhập kho.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            fetchRecentOrders();
            fetchPendingReviews();
            fetchHistory();
          }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '0.55rem 0.95rem',
            borderRadius: 8,
            border: '1px solid #D1D5DB',
            background: '#FFF',
            color: '#374151',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <RefreshCw size={15} /> Làm mới dữ liệu
        </button>
      </header>

      {/* KPI Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 12,
          marginBottom: '1.25rem',
        }}
      >
        {[
          { label: 'Chờ phân loại & nhập kho', value: stats.pendingReviewCount, color: '#2563EB', bg: '#EFF6FF' },
          { label: 'Hoàn thành công', value: stats.passedCount, color: '#047857', bg: '#ECFDF5' },
          { label: 'Hoàn một phần', value: stats.partialCount, color: '#C2410C', bg: '#FFF7ED' },
          { label: 'Hoàn không thành công', value: stats.failedCount, color: '#B91C1C', bg: '#FEF2F2' },
        ].map((kpi) => (
          <div
            key={kpi.label}
            style={{
              background: '#FFF',
              border: '1px solid #E5E7EB',
              borderRadius: 12,
              padding: '0.95rem 1.15rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <div style={{ fontSize: '0.78rem', color: '#6B7280', fontWeight: 600 }}>{kpi.label}</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: kpi.color, marginTop: 4 }}>{kpi.value || 0}</div>
            </div>
            <div style={{ width: 10, height: 36, borderRadius: 6, background: kpi.bg, border: `1px solid ${kpi.color}33` }} />
          </div>
        ))}
      </div>

      {/* Background Cloudinary Upload Panel */}
      <ReturnVideoUploadPanel queue={uploadQueue} />

      {/* ===================================================================== */}
      {/* PHA 1: CAMERA QUÉT & QUAY VIDEO LIÊN TỤC                              */}
      {/* ===================================================================== */}
      <section
        style={{
          background: '#FFF',
          border: '1px solid #E5E7EB',
          borderRadius: 14,
          padding: '1.25rem',
          marginBottom: '1.5rem',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 10,
            marginBottom: '1rem',
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: '1.12rem', fontWeight: 700, color: '#111827', display: 'flex', alignItems: 'center', gap: 8 }}>
              <ScanLine size={19} color="#2563EB" />
              Giai đoạn 1 — Quét mã QR đơn hàng &amp; Quay video khui kiện liên tục
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '0.84rem', color: '#6B7280' }}>
              Mở camera một lần: quét mã QR đơn hoàn để bắt đầu quay → quét mã vạch từng sản phẩm trong kiện → quét mã QR đơn tiếp theo sẽ tự dừng quay đơn cũ và tải video lên hệ thống.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {cameraActive && cameraDevices.length > 1 && (
              <button
                type="button"
                disabled={recording || busy}
                onClick={switchCamera}
                style={{
                  padding: '0.5rem 0.85rem',
                  borderRadius: 8,
                  border: '1px solid #D1D5DB',
                  background: '#FFF',
                  cursor: recording ? 'not-allowed' : 'pointer',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                }}
              >
                Đổi Camera
              </button>
            )}
            <button
              type="button"
              disabled={recording || Boolean(recorderRef.current) || busy}
              onClick={() => (cameraActive ? stopCameraInternal() : startCamera())}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '0.55rem 1rem',
                borderRadius: 8,
                border: 'none',
                background: cameraActive ? '#DC2626' : '#111827',
                color: '#FFF',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: recording || Boolean(recorderRef.current) ? 'not-allowed' : 'pointer',
                opacity: recording || Boolean(recorderRef.current) ? 0.6 : 1,
              }}
            >
              {cameraActive ? <CameraOff size={16} /> : <Camera size={16} />}
              {cameraActive ? 'Tắt Camera' : 'Mở Camera quay & quét'}
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1.15fr) minmax(320px, 1fr)', gap: '1.25rem', alignItems: 'start' }}>
          {/* Left: Live Camera Viewfinder + Manual QR/Barcode inputs */}
          <div>
            <div
              style={{
                position: 'relative',
                background: '#0F172A',
                borderRadius: 12,
                overflow: 'hidden',
                aspectRatio: '16 / 10',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: recording ? '3px solid #DC2626' : '1px solid #1E293B',
              }}
            >
              <video
                ref={videoRef}
                muted
                playsInline
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: cameraActive ? 'block' : 'none',
                }}
              />
              {!cameraActive && (
                <div style={{ textAlign: 'center', color: '#CBD5E1', padding: '1.5rem' }}>
                  <Camera size={40} style={{ opacity: 0.6, marginBottom: 8 }} />
                  <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>Camera chưa mở</div>
                  <div style={{ fontSize: '0.82rem', color: '#94A3B8', marginTop: 4 }}>
                    Bấm "Mở Camera quay &amp; quét" để quét QR đơn hoàn và tự động quay video bằng chứng.
                  </div>
                </div>
              )}

              {recording && (
                <div
                  style={{
                    position: 'absolute',
                    top: 12,
                    left: 12,
                    background: 'rgba(220, 38, 38, 0.92)',
                    color: '#FFF',
                    padding: '6px 12px',
                    borderRadius: 999,
                    fontWeight: 700,
                    fontSize: '0.82rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <span
                    style={{
                      width: 9,
                      height: 9,
                      borderRadius: '50%',
                      background: '#FFF',
                      animation: 'pulseRec 1s infinite',
                    }}
                  />
                  ĐANG QUAY · {formatTimer(recordingSeconds)} · {activeSession?.orderCode}
                </div>
              )}
            </div>

            {cameraError && (
              <div style={{ marginTop: 8, color: '#DC2626', fontSize: '0.84rem' }}>{cameraError}</div>
            )}

            {/* Form nhập/quét QR đơn hàng (hỗ trợ máy quét cầm tay) */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                openOrSwitchOrderFromQr(orderQrInput);
              }}
              style={{ marginTop: 12 }}
            >
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                Quét / nhập mã QR đơn hàng (mã đóng gói, mã đơn, mã vận đơn hoặc mã đổi trả)
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={orderQrInput}
                  onChange={(e) => setOrderQrInput(e.target.value)}
                  placeholder="Đưa QR đơn vào camera hoặc nhập mã đơn rồi Enter..."
                  style={{
                    flex: 1,
                    padding: '0.6rem 0.8rem',
                    borderRadius: 8,
                    border: '1px solid #D1D5DB',
                    fontSize: '0.88rem',
                  }}
                />
                <button
                  type="submit"
                  disabled={busy || !orderQrInput.trim()}
                  style={{
                    padding: '0.6rem 1rem',
                    borderRadius: 8,
                    border: 'none',
                    background: '#2563EB',
                    color: '#FFF',
                    fontWeight: 600,
                    cursor: busy ? 'not-allowed' : 'pointer',
                  }}
                >
                  {activeSession ? 'Chuyển đơn & Quay' : 'Mở đơn & Quay'}
                </button>
              </div>
            </form>

            {/* Gợi ý đơn hoàn/đổi hợp lệ để chọn nhanh */}
            {recentOrders.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6B7280', marginBottom: 6 }}>
                  Đơn hoàn/đổi chờ kiểm tra ({recentOrders.length}):
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {recentOrders.slice(0, 8).map((ord) => {
                    const meta = ORDER_STATUS_META[ord.status] || { label: ord.status, bg: '#F3F4F6', color: '#374151', border: '#E5E7EB' };
                    return (
                      <button
                        key={ord._id}
                        type="button"
                        disabled={busy}
                        onClick={() => openOrSwitchOrderFromQr(ord.orderCode)}
                        style={{
                          padding: '4px 10px',
                          borderRadius: 999,
                          border: `1px solid ${meta.border}`,
                          background: meta.bg,
                          color: meta.color,
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                        title={`Mở đơn ${ord.orderCode} (${meta.label})`}
                      >
                        {ord.orderCode} · {meta.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Right: Active Recording Session & Unit Barcode Scanner */}
          <div
            style={{
              background: '#F9FAFB',
              border: '1px solid #E5E7EB',
              borderRadius: 12,
              padding: '1rem 1.15rem',
              minHeight: 320,
            }}
          >
            {!activeSession ? (
              <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#6B7280' }}>
                <Package size={38} style={{ opacity: 0.45, marginBottom: 10 }} />
                <div style={{ fontWeight: 700, color: '#374151', marginBottom: 6 }}>Chưa có đơn hàng đang quay</div>
                <div style={{ fontSize: '0.85rem' }}>
                  Hãy mở camera và quét mã QR trên kiện hàng hoàn/đổi. Hệ thống sẽ tự động bắt đầu quay video và hiển thị danh sách sản phẩm cần quét mã vạch tại đây.
                </div>
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#6B7280', fontWeight: 600 }}>
                      PHIÊN ĐANG QUAY · {activeSession.inspectionCode}
                    </div>
                    <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#111827' }}>
                      {activeSession.orderCode}
                    </div>
                    <div style={{ fontSize: '0.82rem', color: '#4B5563' }}>
                      {activeSession.customerName || 'Khách hàng'} · {activeSession.customerPhone || '—'}
                    </div>
                  </div>
                  <div
                    style={{
                      padding: '4px 10px',
                      borderRadius: 8,
                      background:
                        activeSessionProgress.scanned < activeSessionProgress.expected ? '#FEF3C7' : '#ECFDF5',
                      color:
                        activeSessionProgress.scanned < activeSessionProgress.expected ? '#B45309' : '#047857',
                      fontWeight: 700,
                      fontSize: '0.84rem',
                    }}
                  >
                    Đã quét: {activeSessionProgress.scanned} / {activeSessionProgress.expected} chiếc
                  </div>
                </div>

                {/* Thông báo trạng thái đủ / thiếu sản phẩm (không chặn thao tác) */}
                {activeSessionProgress.expected > 0 && (
                  <div
                    style={{
                      marginBottom: 10,
                      padding: '7px 10px',
                      borderRadius: 8,
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 7,
                      background:
                        activeSessionProgress.scanned < activeSessionProgress.expected ? '#FFFBEB' : '#ECFDF5',
                      border: `1px solid ${
                        activeSessionProgress.scanned < activeSessionProgress.expected ? '#FCD34D' : '#A7F3D0'
                      }`,
                      color:
                        activeSessionProgress.scanned < activeSessionProgress.expected ? '#92400E' : '#065F46',
                    }}
                  >
                    {activeSessionProgress.scanned < activeSessionProgress.expected ? (
                      <>
                        <AlertTriangle size={15} />
                        <span>
                          Đơn này đang thiếu sản phẩm: mới quét {activeSessionProgress.scanned}/{activeSessionProgress.expected} (thiếu{' '}
                          {activeSessionProgress.expected - activeSessionProgress.scanned} sản phẩm).
                        </span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={15} />
                        <span>
                          Đã quét đủ {activeSessionProgress.scanned}/{activeSessionProgress.expected} sản phẩm. Bạn có thể quét QR đơn tiếp theo hoặc bấm dừng quay.
                        </span>
                      </>
                    )}
                  </div>
                )}

                {/* Form quét barcode sản phẩm trong đơn */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleScanUnitBarcode(unitBarcodeInput);
                  }}
                  style={{ display: 'flex', gap: 8, marginBottom: 12 }}
                >
                  <input
                    value={unitBarcodeInput}
                    onChange={(e) => setUnitBarcodeInput(e.target.value)}
                    placeholder="Quét mã vạch sản phẩm trên tem..."
                    style={{
                      flex: 1,
                      padding: '0.55rem 0.75rem',
                      borderRadius: 8,
                      border: '1px solid #93C5FD',
                      background: '#FFF',
                      fontSize: '0.86rem',
                    }}
                  />
                  <button
                    type="submit"
                    disabled={busy || !unitBarcodeInput.trim()}
                    style={{
                      padding: '0.55rem 0.9rem',
                      borderRadius: 8,
                      border: 'none',
                      background: '#059669',
                      color: '#FFF',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Quét sản phẩm
                  </button>
                </form>

                {/* Danh sách SKU dự kiến trong đơn */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#374151', marginBottom: 6 }}>
                    Sản phẩm trong đơn gốc:
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {(activeSession.items || []).map((item, idx) => {
                      const scannedForSku = (activeSession.scannedUnits || []).filter(
                        (u) => String(u.skuId) === String(item.skuId)
                      ).length;
                      const done = scannedForSku >= (Number(item.quantity) || 0);
                      return (
                        <div
                          key={`${item.skuId}-${idx}`}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '6px 10px',
                            borderRadius: 8,
                            background: done ? '#ECFDF5' : '#FFF',
                            border: `1px solid ${done ? '#A7F3D0' : '#E5E7EB'}`,
                            fontSize: '0.84rem',
                          }}
                        >
                          <div>
                            <strong>{item.skuCode}</strong> · {translateProductNameVi(item.productName)}{' '}
                            <span style={{ color: '#6B7280' }}>
                              {[item.color && `Màu ${translateColorVi(item.color)}`, item.size && `Cỡ ${item.size}`].filter(Boolean).join(' / ')}
                            </span>
                          </div>
                          <strong style={{ color: done ? '#047857' : '#B45309' }}>
                            {scannedForSku}/{item.quantity}
                          </strong>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Gợi ý tem gốc của đơn (hỗ trợ đối chiếu nhanh) */}
                {packedUnits.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: '0.76rem', color: '#6B7280', marginBottom: 4 }}>
                      Tem đã đóng cho đơn này ({packedUnits.length}):
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {packedUnits.map((u) => {
                        const already = (activeSession.scannedUnits || []).some(
                          (s) => s.unitBarcode === u.barcode
                        );
                        return (
                          <button
                            key={u._id}
                            type="button"
                            disabled={already || busy}
                            onClick={() => handleScanUnitBarcode(u.barcode)}
                            style={{
                              padding: '3px 8px',
                              borderRadius: 6,
                              fontSize: '0.75rem',
                              fontFamily: 'monospace',
                              border: `1px solid ${already ? '#A7F3D0' : '#D1D5DB'}`,
                              background: already ? '#ECFDF5' : '#FFF',
                              color: already ? '#047857' : '#374151',
                              cursor: already ? 'default' : 'pointer',
                            }}
                          >
                            {already ? '✓ ' : ''}{u.barcode}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Mã vạch đã quét trong phiên */}
                {(activeSession.scannedUnits || []).length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#374151', marginBottom: 6 }}>
                      Mã vạch đã quét ({activeSession.scannedUnits.length}):
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 150, overflowY: 'auto' }}>
                      {activeSession.scannedUnits.map((u) => (
                        <div
                          key={u.unitBarcode}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '5px 9px',
                            borderRadius: 7,
                            background: '#FFF',
                            border: '1px solid #E5E7EB',
                            fontSize: '0.82rem',
                          }}
                        >
                          <span>
                            <strong style={{ fontFamily: 'monospace' }}>{u.unitBarcode}</strong> · {u.skuCode}
                          </span>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleRemoveScannedUnit(u.unitBarcode)}
                            style={{
                              border: 'none',
                              background: '#FEF2F2',
                              color: '#DC2626',
                              borderRadius: 6,
                              padding: '2px 8px',
                              fontSize: '0.76rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            Gỡ
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Controls kết thúc đơn cuối / hủy phiên */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 10, borderTop: '1px solid #E5E7EB' }}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleFinishLastOrder}
                    style={{
                      flex: 1,
                      display: 'inline-flex',
                      justifyContent: 'center',
                      alignItems: 'center',
                      gap: 6,
                      padding: '0.6rem 1rem',
                      borderRadius: 8,
                      border: 'none',
                      background: '#111827',
                      color: '#FFF',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    <StopCircle size={16} /> Dừng quay &amp; Lưu đơn này
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleCancelCurrentRecording}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      padding: '0.6rem 0.9rem',
                      borderRadius: 8,
                      border: '1px solid #FCA5A5',
                      background: '#FEF2F2',
                      color: '#B91C1C',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    <Trash2 size={15} /> Hủy quay
                  </button>
                </div>
                <div style={{ fontSize: '0.76rem', color: '#6B7280', marginTop: 6 }}>
                  Mẹo: Nếu còn đơn tiếp theo, bạn chỉ cần đưa mã QR đơn tiếp theo vào camera — hệ thống sẽ tự dừng quay &amp; tải video đơn này lên hệ thống.
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ===================================================================== */}
      {/* PHA 2: PHÂN LOẠI SẢN PHẨM (ĐẠT vs HÀNG LỖI) & YÊU CẦU NHẬP KHO         */}
      {/* ===================================================================== */}
      <section
        style={{
          background: '#FFF',
          border: '1px solid #E5E7EB',
          borderRadius: 14,
          padding: '1.25rem',
          marginBottom: '1.5rem',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 10,
            marginBottom: '1rem',
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: '1.12rem', fontWeight: 700, color: '#111827', display: 'flex', alignItems: 'center', gap: 8 }}>
              <ShieldCheck size={19} color="#059669" />
              Giai đoạn 2 — Phân loại sản phẩm &amp; Gửi yêu cầu nhập kho ({pendingReviews.length} đơn chờ)
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '0.84rem', color: '#6B7280' }}>
              Chọn từng sản phẩm là <strong>Đạt chuẩn (nhập kho bán lại)</strong> hoặc <strong>Hàng lỗi (nhập kho hàng lỗi)</strong>. Trạng thái đơn tự động cập nhật: 100% đạt → <strong>Hoàn thành công</strong>, đạt một phần → <strong>Hoàn một phần</strong>, không có sản phẩm đạt → <strong>Hoàn không thành công</strong>.
            </p>
          </div>
          {pendingReviews.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={toggleSelectAllReady}
                disabled={readyReviewIds.length === 0}
                style={{
                  padding: '0.5rem 0.85rem',
                  borderRadius: 8,
                  border: '1px solid #D1D5DB',
                  background: '#FFF',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  cursor: readyReviewIds.length ? 'pointer' : 'not-allowed',
                }}
              >
                {selectedReviewIds.length === readyReviewIds.length && readyReviewIds.length > 0
                  ? 'Bỏ chọn tất cả'
                  : `Chọn tất cả đơn đã có video (${readyReviewIds.length})`}
              </button>
              <button
                type="button"
                disabled={selectedReviewIds.length === 0 || finalizingBatch}
                onClick={() => handleFinalizeBatch(selectedReviewIds)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '0.55rem 1.1rem',
                  borderRadius: 8,
                  border: 'none',
                  background: selectedReviewIds.length ? '#059669' : '#9CA3AF',
                  color: '#FFF',
                  fontWeight: 700,
                  fontSize: '0.86rem',
                  cursor: selectedReviewIds.length && !finalizingBatch ? 'pointer' : 'not-allowed',
                }}
              >
                <Send size={15} />
                {finalizingBatch
                  ? 'Đang xử lý...'
                  : `Chốt & Gửi nhập kho (${selectedBatchSummary.orderCount} đơn · ${selectedBatchSummary.restockCount} đạt · ${selectedBatchSummary.defectCount} lỗi)`}
              </button>
            </div>
          )}
        </div>

        {loadingPending ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#6B7280' }}>Đang tải danh sách đơn chờ phân loại...</div>
        ) : pendingReviews.length === 0 ? (
          <div
            style={{
              padding: '2rem',
              textAlign: 'center',
              background: '#F9FAFB',
              borderRadius: 10,
              color: '#6B7280',
              fontSize: '0.88rem',
            }}
          >
            Chưa có đơn hàng nào đang chờ phân loại. Hãy quét &amp; quay video đơn hàng ở Pha 1.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {pendingReviews.map((insp) => {
              const edit = reviewEdits[insp._id] || { qcNote: '', rejectReason: '', units: {} };
              const unitsWithState = (insp.scannedUnits || []).map((u) => ({
                ...u,
                ...(edit.units[u.unitBarcode] || {}),
              }));
              const expectedQty = (insp.items || []).reduce((s, it) => s + (Number(it.quantity) || 0), 0);
              const preview = previewOutcome(expectedQty, unitsWithState);
              const videoReady = isVideoReady(insp);
              const activeJob = getActiveUploadForSession(insp._id);
              const checked = selectedReviewIds.includes(insp._id);

              return (
                <div
                  key={insp._id}
                  style={{
                    border: `1.5px solid ${checked ? '#059669' : '#E5E7EB'}`,
                    borderRadius: 12,
                    padding: '1rem 1.15rem',
                    background: checked ? '#F0FDF4' : '#FAFAFA',
                  }}
                >
                  {/* Card Header */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: 10,
                      marginBottom: 10,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!videoReady}
                        onChange={() => toggleSelectReview(insp._id)}
                        style={{ width: 18, height: 18, cursor: videoReady ? 'pointer' : 'not-allowed' }}
                      />
                      <strong style={{ fontSize: '1rem', color: '#111827' }}>{insp.orderCode}</strong>
                      <span style={{ fontSize: '0.8rem', color: '#6B7280' }}>({insp.inspectionCode})</span>
                      {insp.originalOrderStatus && ORDER_STATUS_META[insp.originalOrderStatus] && (
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: 999,
                            fontSize: '0.74rem',
                            fontWeight: 600,
                            background: ORDER_STATUS_META[insp.originalOrderStatus].bg,
                            color: ORDER_STATUS_META[insp.originalOrderStatus].color,
                          }}
                        >
                          Gốc: {ORDER_STATUS_META[insp.originalOrderStatus].label}
                        </span>
                      )}
                      <span
                        style={{
                          padding: '3px 10px',
                          borderRadius: 999,
                          fontSize: '0.76rem',
                          fontWeight: 700,
                          background: unitsWithState.length < expectedQty ? '#FEF3C7' : '#ECFDF5',
                          color: unitsWithState.length < expectedQty ? '#92400E' : '#047857',
                          border: `1px solid ${unitsWithState.length < expectedQty ? '#FCD34D' : '#A7F3D0'}`,
                        }}
                      >
                        {unitsWithState.length < expectedQty
                          ? `Thiếu hàng: ${unitsWithState.length}/${expectedQty} (thiếu ${expectedQty - unitsWithState.length})`
                          : `Đủ ${unitsWithState.length}/${expectedQty} sản phẩm`}
                      </span>
                      <span
                        style={{
                          padding: '3px 10px',
                          borderRadius: 999,
                          fontSize: '0.76rem',
                          fontWeight: 700,
                          background: preview.style.bg,
                          color: preview.style.color,
                          border: `1px solid ${preview.style.border}`,
                        }}
                      >
                        Dự kiến: {preview.label}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {videoReady ? (
                        <button
                          type="button"
                          onClick={() => openVideoPlayer(insp)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            padding: '4px 10px',
                            borderRadius: 8,
                            border: '1px solid #A7F3D0',
                            background: '#ECFDF5',
                            color: '#047857',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          <Play size={13} /> Xem video bằng chứng
                        </button>
                      ) : (
                        <span
                          style={{
                            padding: '4px 10px',
                            borderRadius: 8,
                            background: '#FEF3C7',
                            color: '#B45309',
                            fontSize: '0.78rem',
                            fontWeight: 600,
                          }}
                        >
                          {activeJob
                            ? `Đang tải video (${activeJob.progress || 0}%)...`
                            : 'Chưa có video đã lưu'}
                        </span>
                      )}

                      <button
                        type="button"
                        disabled={!videoReady || finalizingBatch}
                        onClick={() => handleFinalizeBatch([insp._id])}
                        style={{
                          padding: '5px 11px',
                          borderRadius: 8,
                          border: 'none',
                          background: videoReady ? '#2563EB' : '#D1D5DB',
                          color: '#FFF',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          cursor: videoReady ? 'pointer' : 'not-allowed',
                        }}
                      >
                        Chốt riêng đơn này
                      </button>
                    </div>
                  </div>

                  {/* Per-unit classification list */}
                  {unitsWithState.length === 0 ? (
                    <div
                      style={{
                        padding: '0.75rem 1rem',
                        borderRadius: 8,
                        background: '#FEF2F2',
                        color: '#991B1B',
                        fontSize: '0.84rem',
                        marginBottom: 8,
                      }}
                    >
                      Chưa có mã vạch sản phẩm nào được quét cho đơn này (0/{expectedQty}). Nếu chốt ngay, đơn sẽ chuyển thành <strong>Hoàn không thành công</strong>.
                    </div>
                  ) : (
                    <div style={{ overflowX: 'auto', marginBottom: 10 }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem', background: '#FFF', borderRadius: 8, overflow: 'hidden' }}>
                        <thead>
                          <tr style={{ background: '#F3F4F6', textAlign: 'left', color: '#374151' }}>
                            <th style={{ padding: '8px 10px' }}>Mã vạch sản phẩm</th>
                            <th style={{ padding: '8px 10px' }}>Sản phẩm / Mã sản phẩm</th>
                            <th style={{ padding: '8px 10px' }}>Phân loại nhập kho</th>
                            <th style={{ padding: '8px 10px' }}>Tình trạng / Lý do lỗi</th>
                            <th style={{ padding: '8px 10px' }}>Ghi chú sản phẩm</th>
                          </tr>
                        </thead>
                        <tbody>
                          {unitsWithState.map((u) => {
                            const isDefect = u.disposition === 'QUARANTINE_DEFECT';
                            return (
                              <tr key={u.unitBarcode} style={{ borderTop: '1px solid #E5E7EB' }}>
                                <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontWeight: 700 }}>
                                  {u.unitBarcode}
                                </td>
                                <td style={{ padding: '8px 10px' }}>
                                  <div style={{ fontWeight: 600 }}>{u.skuCode}</div>
                                  <div style={{ fontSize: '0.76rem', color: '#6B7280' }}>
                                    {translateProductNameVi(u.productName)}{' '}
                                    {[u.color && `Màu ${translateColorVi(u.color)}`, u.size && `Cỡ ${u.size}`].filter(Boolean).join(' · ')}
                                  </div>
                                </td>
                                <td style={{ padding: '8px 10px' }}>
                                  <div style={{ display: 'inline-flex', gap: 6 }}>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        updateUnitDecision(insp._id, u.unitBarcode, {
                                          disposition: 'RESTOCK_SALEABLE',
                                          condition: 'GOOD_INTACT',
                                        })
                                      }
                                      style={{
                                        padding: '4px 10px',
                                        borderRadius: 6,
                                        border: `1px solid ${!isDefect ? '#059669' : '#D1D5DB'}`,
                                        background: !isDefect ? '#ECFDF5' : '#FFF',
                                        color: !isDefect ? '#047857' : '#6B7280',
                                        fontWeight: !isDefect ? 700 : 500,
                                        fontSize: '0.78rem',
                                        cursor: 'pointer',
                                      }}
                                    >
                                      ✓ Đạt (Nhập kho bán)
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        updateUnitDecision(insp._id, u.unitBarcode, {
                                          disposition: 'QUARANTINE_DEFECT',
                                          condition: u.condition === 'GOOD_INTACT' ? 'DIRTY_OR_DAMAGED' : u.condition,
                                        })
                                      }
                                      style={{
                                        padding: '4px 10px',
                                        borderRadius: 6,
                                        border: `1px solid ${isDefect ? '#DC2626' : '#D1D5DB'}`,
                                        background: isDefect ? '#FEF2F2' : '#FFF',
                                        color: isDefect ? '#B91C1C' : '#6B7280',
                                        fontWeight: isDefect ? 700 : 500,
                                        fontSize: '0.78rem',
                                        cursor: 'pointer',
                                      }}
                                    >
                                      ✕ Hàng lỗi (Nhập kho lỗi)
                                    </button>
                                  </div>
                                </td>
                                <td style={{ padding: '8px 10px' }}>
                                  <select
                                    value={u.condition || 'GOOD_INTACT'}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      const def = ITEM_CONDITIONS.find((c) => c.value === val)?.isDefect;
                                      updateUnitDecision(insp._id, u.unitBarcode, {
                                        condition: val,
                                        disposition: def ? 'QUARANTINE_DEFECT' : 'RESTOCK_SALEABLE',
                                      });
                                    }}
                                    style={{
                                      padding: '4px 8px',
                                      borderRadius: 6,
                                      border: '1px solid #D1D5DB',
                                      fontSize: '0.8rem',
                                    }}
                                  >
                                    {ITEM_CONDITIONS.map((c) => (
                                      <option key={c.value} value={c.value}>
                                        {c.label}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                                <td style={{ padding: '8px 10px' }}>
                                  <input
                                    value={u.note || ''}
                                    onChange={(e) =>
                                      updateUnitDecision(insp._id, u.unitBarcode, { note: e.target.value })
                                    }
                                    placeholder={isDefect ? 'Mô tả lỗi cụ thể...' : 'Ghi chú (tuỳ chọn)'}
                                    style={{
                                      width: '100%',
                                      minWidth: 160,
                                      padding: '4px 8px',
                                      borderRadius: 6,
                                      border: '1px solid #D1D5DB',
                                      fontSize: '0.8rem',
                                    }}
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Order-level note */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <input
                      value={edit.qcNote || ''}
                      onChange={(e) => updateInspectionMeta(insp._id, 'qcNote', e.target.value)}
                      placeholder="Ghi chú kiểm tra chung của đơn..."
                      style={{ padding: '0.5rem 0.75rem', borderRadius: 8, border: '1px solid #D1D5DB', fontSize: '0.82rem', background: '#FFF' }}
                    />
                    {preview.code !== 'RETURN_COMPLETED' && (
                      <input
                        value={edit.rejectReason || ''}
                        onChange={(e) => updateInspectionMeta(insp._id, 'rejectReason', e.target.value)}
                        placeholder="Lý do hoàn không đủ / có hàng lỗi (gửi Chăm sóc khách hàng & Kế toán)..."
                        style={{ padding: '0.5rem 0.75rem', borderRadius: 8, border: '1px solid #FCA5A5', fontSize: '0.82rem', background: '#FFF' }}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ===================================================================== */}
      {/* PHA 3: LỊCH SỬ BIÊN BẢN ĐÃ CHỐT                                        */}
      {/* ===================================================================== */}
      <section style={{ background: '#FFF', border: '1px solid #E5E7EB', borderRadius: 14, padding: '1.25rem' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 10,
            marginBottom: '1rem',
          }}
        >
          <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#111827' }}>
            Lịch sử kiểm định hàng hoàn/trả ({stats.totalCount})
          </h2>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {[
              { key: 'ALL', label: 'Tất cả' },
              { key: 'PASSED', label: 'Hoàn thành công' },
              { key: 'PARTIAL', label: 'Hoàn một phần' },
              { key: 'FAILED', label: 'Hoàn không thành công' },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => {
                  setResultFilter(tab.key);
                  setPage(1);
                }}
                style={{
                  padding: '5px 12px',
                  borderRadius: 999,
                  border: `1px solid ${resultFilter === tab.key ? '#111827' : '#D1D5DB'}`,
                  background: resultFilter === tab.key ? '#111827' : '#FFF',
                  color: resultFilter === tab.key ? '#FFF' : '#374151',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {tab.label}
              </button>
            ))}

            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }} />
              <input
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setPage(1);
                    fetchHistory();
                  }
                }}
                placeholder="Tìm mã đơn / mã biên bản / số điện thoại..."
                style={{
                  padding: '5px 10px 5px 28px',
                  borderRadius: 8,
                  border: '1px solid #D1D5DB',
                  fontSize: '0.82rem',
                }}
              />
            </div>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB', textAlign: 'left', color: '#4B5563' }}>
                <th style={{ padding: '10px' }}>Biên bản / Đơn hàng</th>
                <th style={{ padding: '10px' }}>Khách hàng</th>
                <th style={{ padding: '10px' }}>Kết quả kiểm định</th>
                <th style={{ padding: '10px' }}>Video khui kiện</th>
                <th style={{ padding: '10px' }}>Phiếu yêu cầu nhập kho</th>
                <th style={{ padding: '10px' }}>Thời gian</th>
                <th style={{ padding: '10px' }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loadingHistory ? (
                <tr>
                  <td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: '#6B7280' }}>
                    Đang tải lịch sử kiểm tra...
                  </td>
                </tr>
              ) : historyList.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: '#6B7280' }}>
                    Chưa có biên bản kiểm định hoàn tất nào phù hợp bộ lọc.
                  </td>
                </tr>
              ) : (
                historyList.map((insp) => {
                  const badge = RESULT_BADGE[insp.inspectionResult] || RESULT_BADGE.FAILED;
                  return (
                    <tr key={insp._id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                      <td style={{ padding: '10px' }}>
                        <div style={{ fontWeight: 700, color: '#111827' }}>{insp.orderCode}</div>
                        <div style={{ fontSize: '0.76rem', color: '#6B7280' }}>{insp.inspectionCode}</div>
                      </td>
                      <td style={{ padding: '10px' }}>
                        <div>{insp.customerName || '—'}</div>
                        <div style={{ fontSize: '0.76rem', color: '#6B7280' }}>{insp.customerPhone || ''}</div>
                      </td>
                      <td style={{ padding: '10px' }}>
                        <span
                          style={{
                            padding: '3px 9px',
                            borderRadius: 999,
                            fontSize: '0.76rem',
                            fontWeight: 700,
                            background: badge.bg,
                            color: badge.color,
                            border: `1px solid ${badge.border}`,
                          }}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td style={{ padding: '10px' }}>
                        {insp.video?.publicId || insp.videoUrl ? (
                          <button
                            type="button"
                            onClick={() => openVideoPlayer(insp)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              padding: '4px 9px',
                              borderRadius: 6,
                              border: '1px solid #BFDBFE',
                              background: '#EFF6FF',
                              color: '#1D4ED8',
                              fontSize: '0.78rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            <Video size={13} /> Xem video
                          </button>
                        ) : (
                          <span style={{ color: '#9CA3AF', fontSize: '0.78rem' }}>Không có</span>
                        )}
                      </td>
                      <td style={{ padding: '10px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {insp.inboundTicketId && (
                            <span style={{ fontSize: '0.78rem', color: '#047857', fontWeight: 600 }}>
                              Hàng đạt: {insp.inboundTicketId.ticketCode || 'Đã gửi'} ({formatStatusVi(insp.inboundTicketId.status)})
                            </span>
                          )}
                          {insp.defectInboundTicketId && (
                            <span style={{ fontSize: '0.78rem', color: '#B91C1C', fontWeight: 600 }}>
                              Hàng lỗi: {insp.defectInboundTicketId.ticketCode || 'Đã gửi'} ({formatStatusVi(insp.defectInboundTicketId.status)})
                            </span>
                          )}
                          {!insp.inboundTicketId && !insp.defectInboundTicketId && (
                            <span style={{ fontSize: '0.78rem', color: '#9CA3AF' }}>—</span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '10px', fontSize: '0.8rem', color: '#6B7280' }}>
                        {formatDateTime(insp.inspectedAt || insp.createdAt)}
                      </td>
                      <td style={{ padding: '10px' }}>
                        <button
                          type="button"
                          onClick={() => setViewingInspection(insp)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '4px 9px',
                            borderRadius: 6,
                            border: '1px solid #D1D5DB',
                            background: '#FFF',
                            fontSize: '0.78rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          <Eye size={13} /> Chi tiết
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #D1D5DB', background: '#FFF', cursor: 'pointer' }}
            >
              Trước
            </button>
            <span style={{ fontSize: '0.84rem', alignSelf: 'center' }}>
              Trang {page} / {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #D1D5DB', background: '#FFF', cursor: 'pointer' }}
            >
              Sau
            </button>
          </div>
        )}
      </section>

      {/* Video Player Modal */}
      {videoModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.72)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => setVideoModal(null)}
        >
          <div
            style={{
              background: '#FFF',
              borderRadius: 14,
              maxWidth: 820,
              width: '100%',
              padding: '1.1rem 1.25rem',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <strong style={{ fontSize: '1rem' }}>{videoModal.title}</strong>
              <button
                type="button"
                onClick={() => setVideoModal(null)}
                style={{ border: 'none', background: 'none', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>
            {videoModal.loading && <div style={{ padding: '2rem', textAlign: 'center' }}>Đang tải video từ hệ thống...</div>}
            {videoModal.error && <div style={{ padding: '1rem', color: '#DC2626' }}>{videoModal.error}</div>}
            {!videoModal.loading && videoModal.url && (
              <video controls autoPlay src={videoModal.url} style={{ width: '100%', maxHeight: 520, borderRadius: 8, background: '#000' }} />
            )}
          </div>
        </div>
      )}

      {/* Detail Inspection Modal */}
      {viewingInspection && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.6)',
            zIndex: 9998,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => setViewingInspection(null)}
        >
          <div
            style={{
              background: '#FFF',
              borderRadius: 14,
              maxWidth: 760,
              width: '100%',
              maxHeight: '85vh',
              overflowY: 'auto',
              padding: '1.25rem',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <h3 style={{ margin: 0 }}>
                  Chi tiết biên bản {viewingInspection.inspectionCode} — {viewingInspection.orderCode}
                </h3>
                <div style={{ fontSize: '0.82rem', color: '#6B7280', marginTop: 2 }}>
                  Kiểm tra lúc {formatDateTime(viewingInspection.inspectedAt)}
                </div>
              </div>
              <button type="button" onClick={() => setViewingInspection(null)} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            {viewingInspection.qcNote && (
              <p style={{ fontSize: '0.86rem' }}><strong>Ghi chú kiểm định:</strong> {viewingInspection.qcNote}</p>
            )}
            {viewingInspection.rejectReason && (
              <p style={{ fontSize: '0.86rem', color: '#B91C1C' }}>
                <ShieldAlert size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                <strong>Lý do lỗi / thiếu:</strong> {viewingInspection.rejectReason}
              </p>
            )}

            {(viewingInspection.scannedUnits || []).length > 0 ? (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem', marginTop: 10 }}>
                <thead>
                  <tr style={{ background: '#F3F4F6', textAlign: 'left' }}>
                    <th style={{ padding: 8 }}>Mã vạch</th>
                    <th style={{ padding: 8 }}>Mã sản phẩm</th>
                    <th style={{ padding: 8 }}>Phân loại</th>
                    <th style={{ padding: 8 }}>Tình trạng</th>
                    <th style={{ padding: 8 }}>Ghi chú</th>
                  </tr>
                </thead>
                <tbody>
                  {viewingInspection.scannedUnits.map((u) => (
                    <tr key={u.unitBarcode} style={{ borderTop: '1px solid #E5E7EB' }}>
                      <td style={{ padding: 8, fontFamily: 'monospace', fontWeight: 700 }}>{u.unitBarcode}</td>
                      <td style={{ padding: 8 }}>{u.skuCode}</td>
                      <td style={{ padding: 8, fontWeight: 700, color: u.disposition === 'QUARANTINE_DEFECT' ? '#B91C1C' : '#047857' }}>
                        {u.disposition === 'QUARANTINE_DEFECT' ? 'Hàng lỗi' : 'Đạt nhập kho'}
                      </td>
                      <td style={{ padding: 8 }}>
                        {ITEM_CONDITIONS.find((c) => c.value === u.condition)?.label || u.condition}
                      </td>
                      <td style={{ padding: 8 }}>{u.note || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ fontSize: '0.84rem', color: '#6B7280' }}>Không có mã vạch sản phẩm nào được ghi nhận.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
