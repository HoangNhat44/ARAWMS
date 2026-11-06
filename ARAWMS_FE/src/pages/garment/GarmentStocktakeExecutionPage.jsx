/*
 * File: GarmentStocktakeExecutionPage.jsx
 * Author: Duy Anh & Antigravity
 * Date: 2026-11-06
 * Role: GARMENT_TECHNICIAN (Kỹ thuật viên may / KCS)
 * Description: Screen and two-step barcode scanning workflow for inventory stocktaking requested by Warehouse Manager.
 * Step 1: Scan shelf/rack barcode -> Step 2: Scan product barcodes on that shelf.
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  ScanBarcode,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ArrowLeft,
  Camera,
  CameraOff,
  Layers,
  Archive,
  RefreshCw,
  Send,
  Edit2,
  HelpCircle,
  ShieldCheck,
  ChevronRight,
  Maximize2,
  Check,
  X,
} from 'lucide-react';
import { garmentTechnicalService } from '../../services/garmentTechnicalService';
import '../../styles/warehousePutaway.css';

// Audio feedback helper for scanner beeps
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
    // Ignore audio play errors
  }
}

export default function GarmentStocktakeExecutionPage() {
  // Navigation / View state
  const [activeTab, setActiveTab] = useState('SESSIONS'); // 'SESSIONS' or 'COUNTING'
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Data state
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [sessionRecords, setSessionRecords] = useState([]);
  const [verifiedLocation, setVerifiedLocation] = useState(null);

  // Scanner state (reusing ZXing camera logic)
  const [cameraOn, setCameraOn] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [scanLog, setScanLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  // Modal states
  const [editingRecord, setEditingRecord] = useState(null);
  const [editQtyValue, setEditQtyValue] = useState('');
  const [showSubmitModal, setShowSubmitModal] = useState(false);

  // Scanner refs
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const scanHandlerRef = useRef(null);
  const lockedRef = useRef(false);
  const lastSeenRef = useRef({ code: '', at: 0 });
  const manualInputRef = useRef(null);

  // Load assigned stocktake sessions
  const loadSessions = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await garmentTechnicalService.stocktake.getSessions();
      setSessions(res.data?.data || res.data || []);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Không thể tải danh sách lệnh kiểm kê');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSessions();
  }, []);

  // Stop camera stream safely
  const stopCamera = () => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    setCameraOn(false);
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  // Start camera stream using @zxing/browser (reused from putaway module)
  const startCamera = async () => {
    if (cameraOn || !selectedSession) return;
    setError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Trình duyệt yêu cầu kết nối an toàn (HTTPS/localhost) để mở camera.');
      return;
    }
    try {
      const { BarcodeFormat, BrowserMultiFormatReader } = await import('@zxing/browser');
      const reader = new BrowserMultiFormatReader();
      reader.possibleFormats = [BarcodeFormat.CODE_128, BarcodeFormat.QR_CODE, BarcodeFormat.EAN_13];
      const controls = await reader.decodeFromConstraints(
        {
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        },
        videoRef.current,
        (result) => {
          if (result) {
            scanHandlerRef.current?.(result.getText());
          }
        }
      );
      controlsRef.current = controls;
      setCameraOn(true);
    } catch (err) {
      setError(`Không thể bật camera: ${err.message}`);
    }
  };

  // Open counting view for a session
  const openSessionCounting = async (session) => {
    stopCamera();
    setBusy(true);
    setError('');
    setNotice('');
    setVerifiedLocation(null);
    setManualCode('');
    setScanLog([]);
    try {
      const res = await garmentTechnicalService.stocktake.getSession(session._id);
      const data = res.data?.data || res.data;
      setSelectedSession(data.session);
      setSessionRecords(data.records || []);
      setActiveTab('COUNTING');
      setTimeout(() => manualInputRef.current?.focus(), 300);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Không thể tải chi tiết đợt kiểm kê');
    } finally {
      setBusy(false);
    }
  };

  // Step 1: Submit & verify shelf barcode
  const handleVerifyShelf = async (barcode) => {
    if (!selectedSession || lockedRef.current) return;
    const trimmed = String(barcode || '').trim();
    if (!trimmed) return;

    lockedRef.current = true;
    setBusy(true);
    setError('');
    setNotice(`Đang kiểm tra mã kệ "${trimmed}"…`);

    try {
      const res = await garmentTechnicalService.stocktake.verifyShelf(selectedSession._id, {
        shelfBarcode: trimmed,
      });
      const data = res.data?.data || res.data;
      setVerifiedLocation(data.location);

      // Refresh records for active shelf
      const shelfRecs = data.records || [];
      setSessionRecords(shelfRecs);

      playBeep(true);
      setNotice(`✓ Đã xác nhận Kệ: ${data.location.locationCode} (${data.location.zoneCode} · Kệ ${data.location.rackCode} · Tầng ${data.location.shelfCode}). Hãy quét barcode sản phẩm trên kệ.`);
      setManualCode('');
      setTimeout(() => manualInputRef.current?.focus(), 200);
    } catch (err) {
      playBeep(false);
      setError(err.response?.data?.message || err.message || 'Mã kệ không hợp lệ hoặc nằm ngoài phạm vi kiểm kê');
      setNotice('');
    } finally {
      lockedRef.current = false;
      setBusy(false);
    }
  };

  // Step 2: Submit & verify product barcode on current shelf
  const handleSubmitProductBarcode = async (barcode, qty = 1) => {
    if (!selectedSession || !verifiedLocation || lockedRef.current) return;
    const trimmed = String(barcode || '').trim();
    if (!trimmed) return;

    lockedRef.current = true;
    setBusy(true);
    setError('');
    setNotice(`Đang ghi nhận barcode "${trimmed}"…`);

    try {
      const res = await garmentTechnicalService.stocktake.scanItem(selectedSession._id, {
        locationId: verifiedLocation._id,
        barcode: trimmed,
        qty: Number(qty) || 1,
      });
      const data = res.data?.data || res.data;
      const scanned = data.scannedRecord;
      const isNew = data.isNewItem;

      // Update shelf records list
      setSessionRecords(data.shelfRecords || []);

      // Append to scan log
      const logEntry = {
        id: crypto.randomUUID(),
        barcode: trimmed,
        itemTitle: getItemName(scanned),
        actualQty: scanned.actualScannedQty,
        variance: scanned.varianceQty,
        time: new Date(),
        isNew,
      };
      setScanLog((prev) => [logEntry, ...prev].slice(0, 30));

      playBeep(true);
      setNotice(`✓ Đã ghi nhận: ${getItemName(scanned)} — Đã quét: ${scanned.actualScannedQty} (Lệch: ${scanned.varianceQty >= 0 ? '+' : ''}${scanned.varianceQty})`);
      setManualCode('');
      setTimeout(() => manualInputRef.current?.focus(), 150);
    } catch (err) {
      playBeep(false);
      setError(err.response?.data?.message || err.message || 'Lỗi khi ghi nhận mã sản phẩm');
      setNotice('');
    } finally {
      lockedRef.current = false;
      setBusy(false);
    }
  };

  // Switch handler called by camera scanner
  scanHandlerRef.current = (code) => {
    if (lockedRef.current || !selectedSession) return;
    const now = Date.now();
    if (lastSeenRef.current.code === code && now - lastSeenRef.current.at < 2500) {
      return; // prevent rapid duplicate reading
    }
    lastSeenRef.current = { code, at: now };

    if (!verifiedLocation) {
      handleVerifyShelf(code);
    } else {
      handleSubmitProductBarcode(code);
    }
  };

  // Handle form submission for barcode gun / manual typing
  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    if (!verifiedLocation) {
      handleVerifyShelf(manualCode.trim());
    } else {
      handleSubmitProductBarcode(manualCode.trim());
    }
  };

  // Clear current shelf to scan another shelf
  const handleSwitchShelf = () => {
    if (window.confirm('Chuyển sang quét kệ khác? Dữ liệu đã quét trên kệ hiện tại đã được hệ thống lưu trữ.')) {
      setVerifiedLocation(null);
      setManualCode('');
      setNotice('Đã chuyển kệ. Vui lòng quét mã vạch của kệ tiếp theo (Bước 1).');
      setError('');
      setTimeout(() => manualInputRef.current?.focus(), 200);
    }
  };

  // Open modal to manually adjust quantity for a record
  const handleOpenEditQty = (rec) => {
    setEditingRecord(rec);
    setEditQtyValue(String(rec.actualScannedQty ?? 0));
  };

  // Save adjusted quantity
  const handleSaveEditQty = async () => {
    if (!editingRecord) return;
    const val = Number(editQtyValue);
    if (Number.isNaN(val) || val < 0) {
      alert('Vui lòng nhập số lượng hợp lệ (>= 0)');
      return;
    }
    setBusy(true);
    try {
      const res = await garmentTechnicalService.stocktake.updateRecordQty(editingRecord._id, {
        actualScannedQty: val,
      });
      const updated = res.data?.data || res.data;
      setSessionRecords((prev) =>
        prev.map((r) => (r._id === updated._id ? updated : r))
      );
      setEditingRecord(null);
      setNotice(`Đã cập nhật số lượng mã ${updated.barcode} thành ${val}.`);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Không thể cập nhật số lượng');
    } finally {
      setBusy(false);
    }
  };

  // Submit complete stocktake to warehouse manager
  const handleCompleteStocktake = async () => {
    if (!selectedSession) return;
    setBusy(true);
    try {
      const res = await garmentTechnicalService.stocktake.completeSession(selectedSession._id);
      const data = res.data?.data || res.data;
      stopCamera();
      setShowSubmitModal(false);
      alert(
        `Đã hoàn thành kiểm kê thành công!\nTổng số mặt hàng dự kiến: ${data.summary?.totalItemsExpected || 0}\nSố mặt hàng có chênh lệch: ${data.summary?.totalDiscrepancies || 0}\nKết quả đã được gửi cho Quản lý kho xem xét.`
      );
      setActiveTab('SESSIONS');
      setSelectedSession(null);
      setVerifiedLocation(null);
      loadSessions();
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Không thể gửi kết quả kiểm kê');
    } finally {
      setBusy(false);
    }
  };

  // Helper to format item display title
  const getItemName = (record) => {
    if (!record) return 'Mặt hàng';
    if (record.skuId) {
      const sku = record.skuId;
      return `${sku.productName || sku.skuCode} (${[sku.color, sku.size].filter(Boolean).join(' · ') || sku.skuCode})`;
    }
    if (record.rawMaterialId) {
      const mat = record.rawMaterialId;
      return `${mat.materialName || mat.materialCode} (${mat.color || ''} · ${mat.unit || ''})`;
    }
    if (record.fabricRollId) {
      const roll = record.fabricRollId;
      return `Cuộn vải ${roll.rollBarcode} (${roll.currentLengthMeters || 0}m)`;
    }
    return record.barcode || 'Sản phẩm chưa gán thông tin';
  };

  // Filter sessions
  const filteredSessions = sessions.filter((s) => {
    const matchStatus = statusFilter === 'ALL' || s.status === statusFilter;
    const matchSearch =
      !searchTerm ||
      (s.sessionCode && s.sessionCode.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (s.name && s.name.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchStatus && matchSearch;
  });

  // Calculate shelf stats
  const shelfTotalExpected = sessionRecords.reduce((sum, r) => sum + (r.systemSnapshotQty || 0), 0);
  const shelfTotalScanned = sessionRecords.reduce((sum, r) => sum + (r.actualScannedQty || 0), 0);
  const shelfVarianceCount = sessionRecords.filter((r) => r.varianceQty !== 0).length;

  return (
    <div className="ara-page" style={{ padding: '1.5rem', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Toast Notifications */}
      {notice && (
        <div className="putaway-toast" style={{ background: '#006c4a', color: '#FFFFFF', zIndex: 9999 }}>
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice('')}>×</button>
        </div>
      )}
      {error && (
        <div className="putaway-toast putaway-toast-error" style={{ background: '#a31d1d', color: '#FFFFFF', zIndex: 9999 }}>
          <span>{error}</span>
          <button type="button" onClick={() => setError('')}>×</button>
        </div>
      )}

      {/* VIEW 1: SESSIONS LIST */}
      {activeTab === 'SESSIONS' && (
        <div>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--ara-gold)', fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                <ScanBarcode size={18} /> Phân hệ Kỹ thuật may · Kiểm kê kho
              </div>
              <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--ara-noir)', margin: '0.25rem 0' }}>
                Lệnh kiểm kê từ Quản lý kho
              </h1>
              <p style={{ color: 'var(--ara-text-muted)', fontSize: '0.9rem', margin: 0 }}>
                Tiếp nhận yêu cầu kiểm kê, quét barcode kệ kho và đếm số lượng thực tế tại vị trí chỉ định.
              </p>
            </div>
            <button
              onClick={loadSessions}
              className="btn-ara-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.1rem' }}
              disabled={loading}
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              <span>Làm mới danh sách</span>
            </button>
          </div>

          {/* Filter Bar */}
          <div style={{
            background: 'var(--ara-bg-surface)',
            border: '1px solid var(--ara-border)',
            borderRadius: 'var(--radius-md)',
            padding: '1rem',
            marginBottom: '1.5rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
          }}>
            {/* Status Tabs */}
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {[
                ['ALL', 'Tất cả'],
                ['WAITING', 'Chờ kiểm kê'],
                ['FROZEN_COUNTING', 'Đang kiểm kê'],
                ['VARIANCE_REVIEW', 'Chờ duyệt chênh lệch'],
                ['APPROVED_COMPLETED', 'Đã duyệt hoàn thành'],
              ].map(([val, labelText]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setStatusFilter(val)}
                  style={{
                    padding: '0.45rem 0.85rem',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    border: '1px solid',
                    borderColor: statusFilter === val ? 'var(--ara-gold)' : 'var(--ara-border)',
                    background: statusFilter === val ? 'var(--ara-gold)' : '#FFFFFF',
                    color: statusFilter === val ? '#FFFFFF' : 'var(--ara-text)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                >
                  {labelText}
                </button>
              ))}
            </div>

            {/* Search Box */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#FFFFFF', border: '1px solid var(--ara-border)', borderRadius: 'var(--radius-sm)', padding: '0.4rem 0.8rem', minWidth: '280px' }}>
              <Search size={16} color="var(--ara-text-muted)" />
              <input
                type="text"
                placeholder="Tìm theo mã đợt hoặc tên kiểm kê..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ border: 'none', outline: 'none', width: '100%', fontSize: '0.88rem' }}
              />
            </div>
          </div>

          {/* Sessions Table */}
          <div style={{ background: '#FFFFFF', border: '1px solid var(--ara-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden', boxShadow: 'var(--ara-shadow-sm)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ background: 'var(--ara-bg-surface)', borderBottom: '1px solid var(--ara-border)', color: 'var(--ara-text-muted)', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <th style={{ padding: '0.85rem 1rem' }}>Mã lệnh & Tên</th>
                  <th style={{ padding: '0.85rem 1rem' }}>Loại kho & Phạm vi</th>
                  <th style={{ padding: '0.85rem 1rem' }}>Lịch & Hạn chót</th>
                  <th style={{ padding: '0.85rem 1rem' }}>Quản lý phụ trách</th>
                  <th style={{ padding: '0.85rem 1rem' }}>Trạng thái</th>
                  <th style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filteredSessions.length > 0 ? (
                  filteredSessions.map((s) => {
                    const isClosed = ['APPROVED_COMPLETED', 'CANCELLED'].includes(s.status);
                    const isReview = s.status === 'VARIANCE_REVIEW';
                    const isDoing = s.status === 'FROZEN_COUNTING';
                    const isWait = s.status === 'WAITING';

                    return (
                      <tr key={s._id} style={{ borderBottom: '1px solid var(--ara-border)' }}>
                        <td style={{ padding: '1rem' }}>
                          <div style={{ fontWeight: 700, color: 'var(--ara-noir)', fontSize: '0.95rem' }}>
                            {s.sessionCode}
                          </div>
                          <div style={{ color: 'var(--ara-text)', marginTop: '0.15rem' }}>
                            {s.name || 'Kiểm kê định kỳ'}
                          </div>
                          {s.instructions && (
                            <div style={{ fontSize: '0.78rem', color: 'var(--ara-text-muted)', fontStyle: 'italic', marginTop: '0.2rem' }}>
                              Lưu ý: {s.instructions}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '1rem' }}>
                          <span style={{
                            display: 'inline-block',
                            padding: '0.2rem 0.5rem',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            background: s.warehouseType === 'FINISHED_GOODS' ? '#e6f4ea' : '#fef7e0',
                            color: s.warehouseType === 'FINISHED_GOODS' ? '#137333' : '#b06000',
                          }}>
                            {s.warehouseType === 'FINISHED_GOODS' ? 'Kho thành phẩm' : s.warehouseType === 'RAW_MATERIAL' ? 'Kho nguyên phụ liệu' : 'Toàn bộ kho'}
                          </span>
                          <div style={{ fontSize: '0.82rem', color: 'var(--ara-text-muted)', marginTop: '0.25rem' }}>
                            Phạm vi: {s.scopeType === 'ZONE' ? `Khu ${s.zoneCode}` : s.scopeType === 'RACK' ? 'Một kệ cụ thể' : 'Toàn kho'}
                            {s.scopeLocationIds && s.scopeLocationIds.length > 0 && ` (${s.scopeLocationIds.length} vị trí)`}
                          </div>
                        </td>
                        <td style={{ padding: '1rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem' }}>
                            <Clock size={14} color="var(--ara-text-muted)" />
                            <span>{s.scheduledAt ? new Date(s.scheduledAt).toLocaleDateString('vi-VN') : '—'}</span>
                          </div>
                          <div style={{ fontSize: '0.78rem', color: '#c5221f', marginTop: '0.2rem' }}>
                            Hạn: {s.dueAt ? new Date(s.dueAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) + ' ' + new Date(s.dueAt).toLocaleDateString('vi-VN') : '—'}
                          </div>
                        </td>
                        <td style={{ padding: '1rem' }}>
                          <div style={{ fontWeight: 600, color: 'var(--ara-noir)' }}>
                            {s.createdByManagerId?.fullName || s.approverId?.fullName || 'Quản lý kho'}
                          </div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--ara-text-muted)' }}>
                            {s.createdByManagerId?.employeeCode || s.approverId?.employeeCode || ''}
                          </div>
                        </td>
                        <td style={{ padding: '1rem' }}>
                          <span style={{
                            display: 'inline-block',
                            padding: '0.3rem 0.65rem',
                            borderRadius: '999px',
                            fontSize: '0.78rem',
                            fontWeight: 700,
                            background: isDoing ? '#fff0da' : isReview ? '#e8f0fe' : isClosed ? '#e6f4ea' : '#f1f3f4',
                            color: isDoing ? '#8a5500' : isReview ? '#1a73e8' : isClosed ? '#137333' : '#5f6368',
                          }}>
                            {isDoing ? 'Đang kiểm kê' : isReview ? 'Chờ quản lý duyệt' : isClosed ? 'Đã hoàn tất' : 'Chờ kiểm kê'}
                          </span>
                        </td>
                        <td style={{ padding: '1rem', textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => openSessionCounting(s)}
                            disabled={busy}
                            className="btn-ara-primary"
                            style={{
                              padding: '0.5rem 1rem',
                              fontSize: '0.82rem',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.35rem',
                              whiteSpace: 'nowrap',
                              background: isClosed ? 'var(--ara-bg-surface)' : 'var(--ara-gold)',
                              color: isClosed ? 'var(--ara-text)' : '#FFFFFF',
                              border: isClosed ? '1px solid var(--ara-border)' : '1px solid var(--ara-gold)',
                            }}
                          >
                            <ScanBarcode size={15} />
                            <span>{isClosed ? 'Xem kết quả' : isDoing ? 'Tiếp tục kiểm' : 'Vào kiểm kê'}</span>
                            <ChevronRight size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="6" style={{ padding: '3rem', textAlign: 'center', color: 'var(--ara-text-muted)' }}>
                      <Layers size={36} style={{ margin: '0 auto 0.75rem', opacity: 0.4 }} />
                      <div>Không có đợt kiểm kê nào phù hợp với bộ lọc.</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW 2: TWO-STEP SCANNING WORKFLOW */}
      {activeTab === 'COUNTING' && selectedSession && (
        <div>
          {/* Top Bar with Session Info */}
          <div style={{
            background: '#FFFFFF',
            border: '1px solid var(--ara-border)',
            borderRadius: 'var(--radius-md)',
            padding: '1.25rem',
            marginBottom: '1.5rem',
            boxShadow: 'var(--ara-shadow-sm)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <button
                type="button"
                onClick={() => {
                  stopCamera();
                  setActiveTab('SESSIONS');
                  loadSessions();
                }}
                className="btn-ara-secondary"
                style={{ padding: '0.5rem 0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
              >
                <ArrowLeft size={16} /> Quay lại danh sách
              </button>
              <div>
                <div style={{ fontSize: '0.78rem', color: 'var(--ara-gold)', fontWeight: 700, textTransform: 'uppercase' }}>
                  Lệnh kiểm kê: {selectedSession.sessionCode}
                </div>
                <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--ara-noir)', margin: '0.15rem 0' }}>
                  {selectedSession.name || 'Kiểm kê kho'}
                </h2>
                <div style={{ fontSize: '0.85rem', color: 'var(--ara-text-muted)' }}>
                  Kho: <strong>{selectedSession.warehouseType === 'FINISHED_GOODS' ? 'Kho Thành Phẩm' : selectedSession.warehouseType === 'RAW_MATERIAL' ? 'Kho Nguyên Phụ Liệu' : 'Toàn bộ kho'}</strong> · Hạn chót: {selectedSession.dueAt ? new Date(selectedSession.dueAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) + ' ' + new Date(selectedSession.dueAt).toLocaleDateString('vi-VN') : '—'}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setShowSubmitModal(true)}
                disabled={busy}
                className="btn-ara-primary"
                style={{
                  padding: '0.65rem 1.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontSize: '0.9rem',
                  background: '#006c4a',
                  borderColor: '#006c4a',
                }}
              >
                <Send size={16} />
                <span>Hoàn thành & Gửi quản lý duyệt</span>
              </button>
            </div>
          </div>

          {/* Stepper Header (Clear 2-step visual guidance) */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '1rem',
            marginBottom: '1.5rem',
          }}>
            {/* Step 1 Pill */}
            <div style={{
              background: !verifiedLocation ? 'rgba(159, 131, 101, 0.12)' : '#e4f5ea',
              border: `2px solid ${!verifiedLocation ? 'var(--ara-gold)' : '#006c4a'}`,
              borderRadius: 'var(--radius-md)',
              padding: '1rem 1.25rem',
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
            }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: !verifiedLocation ? 'var(--ara-gold)' : '#006c4a',
                color: '#FFFFFF',
                display: 'grid',
                placeItems: 'center',
                fontWeight: 700,
                fontSize: '1.1rem',
                flexShrink: 0,
              }}>
                {verifiedLocation ? <Check size={20} /> : '1'}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: !verifiedLocation ? 'var(--ara-gold)' : '#006c4a' }}>
                  {verifiedLocation ? 'BƯỚC 1: ĐÃ XÁC NHẬN KỆ' : 'BƯỚC 1: QUÉT MÃ KỆ KHO'}
                </div>
                <div style={{ fontWeight: 700, color: 'var(--ara-noir)', fontSize: '1rem' }}>
                  {verifiedLocation ? `Kệ ${verifiedLocation.locationCode} (${verifiedLocation.zoneCode})` : 'Quét barcode hoặc QR trên kệ'}
                </div>
                {verifiedLocation && (
                  <div style={{ fontSize: '0.8rem', color: 'var(--ara-text-muted)' }}>
                    Tầng {verifiedLocation.shelfCode} · Dãy {verifiedLocation.rackCode}
                  </div>
                )}
              </div>
              {verifiedLocation && (
                <button
                  type="button"
                  onClick={handleSwitchShelf}
                  style={{
                    background: '#FFFFFF',
                    border: '1px solid var(--ara-border)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '0.4rem 0.75rem',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    color: 'var(--ara-noir)',
                    cursor: 'pointer',
                  }}
                >
                  Đổi kệ khác
                </button>
              )}
            </div>

            {/* Step 2 Pill */}
            <div style={{
              background: verifiedLocation ? 'rgba(159, 131, 101, 0.12)' : 'var(--ara-bg-surface)',
              border: `2px solid ${verifiedLocation ? 'var(--ara-gold)' : 'var(--ara-border)'}`,
              borderRadius: 'var(--radius-md)',
              padding: '1rem 1.25rem',
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
              opacity: verifiedLocation ? 1 : 0.6,
            }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: verifiedLocation ? 'var(--ara-gold)' : 'var(--ara-text-muted)',
                color: '#FFFFFF',
                display: 'grid',
                placeItems: 'center',
                fontWeight: 700,
                fontSize: '1.1rem',
                flexShrink: 0,
              }}>
                2
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: verifiedLocation ? 'var(--ara-gold)' : 'var(--ara-text-muted)' }}>
                  BƯỚC 2: QUÉT SẢN PHẨM TRÊN KỆ
                </div>
                <div style={{ fontWeight: 700, color: 'var(--ara-noir)', fontSize: '1rem' }}>
                  {verifiedLocation ? 'Đang chờ quét barcode từng mặt hàng' : 'Cần hoàn thành Bước 1 trước'}
                </div>
                {verifiedLocation && (
                  <div style={{ fontSize: '0.8rem', color: 'var(--ara-text-muted)' }}>
                    Đã đếm: {shelfTotalScanned}/{shelfTotalExpected} · Lệch: {shelfVarianceCount} mặt hàng
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Main Scanning Section: Two Columns (Camera/Input on Left, Shelf Inventory List on Right) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1.8fr)', gap: '1.5rem' }}>
            {/* Left Column: Camera + Barcode Gun Input */}
            <div>
              {/* Camera Preview Box */}
              <div className="putaway-camera" style={{ height: '260px', marginBottom: '1rem', position: 'relative' }}>
                <video ref={videoRef} muted playsInline className={cameraOn ? '' : 'hidden'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <div className="putaway-camera-top">
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <Camera size={14} /> CAMERA QUÉT MÃ VẠCH / QR
                  </span>
                  <button
                    type="button"
                    className="putaway-button"
                    onClick={cameraOn ? stopCamera : startCamera}
                    disabled={busy}
                    style={{ fontSize: '0.8rem', fontWeight: 600 }}
                  >
                    {cameraOn ? 'Tắt camera' : 'Mở camera'}
                  </button>
                </div>
                {!cameraOn && (
                  <div style={{ textAlign: 'center', color: '#FFFFFF', padding: '1rem' }}>
                    <CameraOff size={32} style={{ opacity: 0.5, margin: '0 auto 0.5rem' }} />
                    <p style={{ margin: 0, fontSize: '0.85rem' }}>Camera chưa bật · Bạn có thể dùng máy quét cầm tay hoặc nhập mã bên dưới.</p>
                  </div>
                )}
                {cameraOn && <div className="putaway-reticle" aria-hidden="true" />}
              </div>

              {/* Barcode Gun / Manual Input Box */}
              <form
                onSubmit={handleManualSubmit}
                style={{
                  background: '#FFFFFF',
                  border: '1px solid var(--ara-border)',
                  borderRadius: 'var(--radius-md)',
                  padding: '1.25rem',
                  boxShadow: 'var(--ara-shadow-sm)',
                  marginBottom: '1rem',
                }}
              >
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: 'var(--ara-noir)', marginBottom: '0.5rem' }}>
                  {!verifiedLocation ? (
                    <span style={{ color: 'var(--ara-gold)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <Layers size={16} /> BƯỚC 1: Quét hoặc nhập mã vạch KỆ KHO
                    </span>
                  ) : (
                    <span style={{ color: '#006c4a', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <ScanBarcode size={16} /> BƯỚC 2: Quét barcode SẢN PHẨM trên kệ {verifiedLocation.locationCode}
                    </span>
                  )}
                </label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    ref={manualInputRef}
                    type="text"
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                    placeholder={!verifiedLocation ? 'Quét hoặc nhập mã vạch kệ (VD: LOC-A1-01)...' : 'Quét barcode sản phẩm / cuộn vải trên kệ này...'}
                    disabled={busy}
                    autoFocus
                    style={{
                      flex: 1,
                      padding: '0.65rem 0.85rem',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--ara-border)',
                      fontSize: '0.95rem',
                      outline: 'none',
                    }}
                  />
                  <button
                    type="submit"
                    disabled={busy || !manualCode.trim()}
                    className="btn-ara-primary"
                    style={{ padding: '0.65rem 1.2rem', whiteSpace: 'nowrap' }}
                  >
                    {!verifiedLocation ? 'Xác nhận kệ' : 'Đếm +1'}
                  </button>
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--ara-text-muted)', marginTop: '0.5rem' }}>
                  💡 Gợi ý: Máy quét mã vạch cầm tay tự động gửi mã khi bấm cò quét.
                </div>
              </form>

              {/* Recent Scan History Feed */}
              <div style={{
                background: '#FFFFFF',
                border: '1px solid var(--ara-border)',
                borderRadius: 'var(--radius-md)',
                padding: '1.25rem',
                boxShadow: 'var(--ara-shadow-sm)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0, color: 'var(--ara-noir)' }}>
                    Lượt quét gần nhất
                  </h3>
                  <span style={{ fontSize: '0.78rem', color: 'var(--ara-text-muted)' }}>
                    {scanLog.length} lượt
                  </span>
                </div>
                <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {scanLog.length > 0 ? (
                    scanLog.map((log) => (
                      <div
                        key={log.id}
                        style={{
                          padding: '0.5rem 0.75rem',
                          borderRadius: 'var(--radius-sm)',
                          background: 'var(--ara-bg-surface)',
                          border: '1px solid var(--ara-border)',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          fontSize: '0.82rem',
                        }}
                      >
                        <div>
                          <strong style={{ color: 'var(--ara-noir)', fontFamily: 'monospace' }}>{log.barcode}</strong>
                          <div style={{ fontSize: '0.75rem', color: 'var(--ara-text-muted)' }}>{log.itemTitle}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{
                            padding: '0.15rem 0.45rem',
                            borderRadius: '4px',
                            fontWeight: 700,
                            fontSize: '0.75rem',
                            background: log.variance === 0 ? '#e6f4ea' : log.variance > 0 ? '#feefe3' : '#fce8e6',
                            color: log.variance === 0 ? '#137333' : log.variance > 0 ? '#b06000' : '#c5221f',
                          }}>
                            {log.variance === 0 ? 'Khớp' : log.variance > 0 ? `+${log.variance} (Thừa)` : `${log.variance} (Thiếu)`}
                          </span>
                          <div style={{ fontSize: '0.72rem', color: 'var(--ara-text-muted)', marginTop: '0.15rem' }}>
                            {new Date(log.time).toLocaleTimeString('vi-VN')}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--ara-text-muted)', fontSize: '0.85rem' }}>
                      Chưa có lượt quét nào trong phiên này.
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right Column: Inventory Items on Active Shelf */}
            <div>
              <div style={{
                background: '#FFFFFF',
                border: '1px solid var(--ara-border)',
                borderRadius: 'var(--radius-md)',
                padding: '1.25rem',
                boxShadow: 'var(--ara-shadow-sm)',
                minHeight: '520px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                  <div>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--ara-noir)', margin: 0 }}>
                      Danh mục hàng hóa trên kệ {verifiedLocation ? verifiedLocation.locationCode : '(Chưa quét kệ)'}
                    </h3>
                    <p style={{ fontSize: '0.82rem', color: 'var(--ara-text-muted)', margin: '0.2rem 0 0' }}>
                      {verifiedLocation
                        ? `Khu ${verifiedLocation.zoneCode} · Kệ ${verifiedLocation.rackCode} · Tầng ${verifiedLocation.shelfCode}`
                        : 'Vui lòng hoàn thành Bước 1 để tải danh sách hàng hóa trên kệ.'}
                    </p>
                  </div>

                  {verifiedLocation && (
                    <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.8rem' }}>
                      <span style={{ padding: '0.3rem 0.6rem', borderRadius: '4px', background: '#e8f0fe', color: '#1a73e8', fontWeight: 600 }}>
                        Dự kiến: {shelfTotalExpected}
                      </span>
                      <span style={{ padding: '0.3rem 0.6rem', borderRadius: '4px', background: '#e6f4ea', color: '#137333', fontWeight: 600 }}>
                        Đã quét: {shelfTotalScanned}
                      </span>
                      <span style={{ padding: '0.3rem 0.6rem', borderRadius: '4px', background: shelfVarianceCount ? '#fce8e6' : '#e6f4ea', color: shelfVarianceCount ? '#c5221f' : '#137333', fontWeight: 600 }}>
                        Lệch: {shelfVarianceCount}
                      </span>
                    </div>
                  )}
                </div>

                {/* Table of items on shelf */}
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
                    <thead>
                      <tr style={{ background: 'var(--ara-bg-surface)', borderBottom: '1px solid var(--ara-border)', color: 'var(--ara-text-muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                        <th style={{ padding: '0.65rem 0.75rem' }}>Mã Barcode</th>
                        <th style={{ padding: '0.65rem 0.75rem' }}>Tên mặt hàng / Quy cách</th>
                        <th style={{ padding: '0.65rem 0.75rem', textAlign: 'center' }}>Snapshot hệ thống</th>
                        <th style={{ padding: '0.65rem 0.75rem', textAlign: 'center' }}>Thực tế đã quét</th>
                        <th style={{ padding: '0.65rem 0.75rem', textAlign: 'center' }}>Chênh lệch</th>
                        <th style={{ padding: '0.65rem 0.75rem', textAlign: 'center' }}>Chỉnh sửa</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sessionRecords.length > 0 ? (
                        sessionRecords.map((r) => {
                          const isMatch = r.varianceQty === 0;
                          const isSurplus = r.varianceQty > 0;
                          const isShortage = r.varianceQty < 0;

                          return (
                            <tr key={r._id} style={{ borderBottom: '1px solid var(--ara-border)' }}>
                              <td style={{ padding: '0.75rem', fontFamily: 'monospace', fontWeight: 700, color: 'var(--ara-noir)' }}>
                                {r.barcode}
                              </td>
                              <td style={{ padding: '0.75rem' }}>
                                <div style={{ fontWeight: 600, color: 'var(--ara-noir)' }}>
                                  {getItemName(r)}
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--ara-text-muted)' }}>
                                  Loại: {r.itemType === 'SKU_BATCH' ? 'Thành phẩm' : r.itemType === 'FABRIC_ROLL' ? 'Cuộn vải' : 'Phụ liệu'}
                                </div>
                              </td>
                              <td style={{ padding: '0.75rem', textAlign: 'center', fontWeight: 600 }}>
                                {r.systemSnapshotQty}
                              </td>
                              <td style={{ padding: '0.75rem', textAlign: 'center', fontWeight: 700, color: 'var(--ara-gold)' }}>
                                {r.actualScannedQty}
                              </td>
                              <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                                <span style={{
                                  padding: '0.2rem 0.5rem',
                                  borderRadius: '999px',
                                  fontSize: '0.75rem',
                                  fontWeight: 700,
                                  background: isMatch ? '#e6f4ea' : isSurplus ? '#feefe3' : '#fce8e6',
                                  color: isMatch ? '#137333' : isSurplus ? '#b06000' : '#c5221f',
                                }}>
                                  {isMatch ? 'Khớp (0)' : isSurplus ? `+${r.varianceQty} (Thừa)` : `${r.varianceQty} (Thiếu)`}
                                </span>
                              </td>
                              <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditQty(r)}
                                  className="btn-ara-secondary"
                                  style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                                >
                                  <Edit2 size={12} /> Sửa
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan="6" style={{ padding: '3rem', textAlign: 'center', color: 'var(--ara-text-muted)' }}>
                            <Archive size={32} style={{ margin: '0 auto 0.5rem', opacity: 0.4 }} />
                            <div>{verifiedLocation ? 'Kệ này hiện chưa có sản phẩm nào được ghi nhận.' : 'Chưa quét kệ. Vui lòng quét mã vạch kệ kho tại Bước 1.'}</div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>

          {/* EDIT QUANTITY MODAL */}
          {editingRecord && (
            <div className="putaway-overlay" style={{ zIndex: 10000 }}>
              <div style={{ background: '#FFFFFF', borderRadius: 'var(--radius-md)', padding: '1.5rem', width: '400px', maxWidth: '90vw' }}>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--ara-noir)', marginTop: 0 }}>
                  Điều chỉnh số lượng kiểm kê
                </h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--ara-text-muted)' }}>
                  Mặt hàng: <strong>{getItemName(editingRecord)}</strong>
                  <br />
                  Mã barcode: <code>{editingRecord.barcode}</code>
                </p>
                <div style={{ margin: '1.25rem 0' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                    Số lượng thực tế đã quét:
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={editQtyValue}
                    onChange={(e) => setEditQtyValue(e.target.value)}
                    style={{ width: '100%', padding: '0.6rem', border: '1px solid var(--ara-border)', borderRadius: 'var(--radius-sm)', fontSize: '1rem' }}
                  />
                  <div style={{ fontSize: '0.78rem', color: 'var(--ara-text-muted)', marginTop: '0.35rem' }}>
                    Snapshot hệ thống: {editingRecord.systemSnapshotQty} · Chênh lệch mới sẽ là: {Number(editQtyValue || 0) - editingRecord.systemSnapshotQty}
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={() => setEditingRecord(null)}
                    className="btn-ara-secondary"
                    style={{ padding: '0.5rem 1rem' }}
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveEditQty}
                    className="btn-ara-primary"
                    disabled={busy}
                    style={{ padding: '0.5rem 1.25rem' }}
                  >
                    Lưu số lượng
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* SUBMIT TO MANAGER MODAL */}
          {showSubmitModal && (
            <div className="putaway-overlay" style={{ zIndex: 10000 }}>
              <div style={{ background: '#FFFFFF', borderRadius: 'var(--radius-md)', padding: '1.5rem', width: '480px', maxWidth: '90vw' }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--ara-noir)', marginTop: 0 }}>
                  Xác nhận hoàn thành & Gửi quản lý kho
                </h3>
                <p style={{ fontSize: '0.88rem', color: 'var(--ara-text-muted)' }}>
                  Bạn chuẩn bị hoàn tất phiên kiểm kê <strong>{selectedSession.sessionCode}</strong> và gửi bảng chênh lệch thực tế để Quản lý kho xem xét phê duyệt.
                </p>
                <div style={{
                  background: 'var(--ara-bg-surface)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '1rem',
                  margin: '1rem 0',
                  fontSize: '0.88rem',
                  display: 'grid',
                  gap: '0.5rem',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Tổng số mặt hàng đã đếm:</span>
                    <strong>{shelfTotalScanned}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Tổng số mặt hàng hệ thống:</span>
                    <strong>{shelfTotalExpected}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: shelfVarianceCount ? '#c5221f' : '#137333' }}>
                    <span>Số mặt hàng phát hiện sai lệch:</span>
                    <strong>{shelfVarianceCount} mặt hàng</strong>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                  <button
                    type="button"
                    onClick={() => setShowSubmitModal(false)}
                    className="btn-ara-secondary"
                    style={{ padding: '0.55rem 1.1rem' }}
                    disabled={busy}
                  >
                    Tiếp tục kiểm tra
                  </button>
                  <button
                    type="button"
                    onClick={handleCompleteStocktake}
                    className="btn-ara-primary"
                    disabled={busy}
                    style={{ padding: '0.55rem 1.25rem', background: '#006c4a', borderColor: '#006c4a' }}
                  >
                    Gửi duyệt ngay
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

