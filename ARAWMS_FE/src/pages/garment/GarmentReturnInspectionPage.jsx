/**
 * ============================================================================
 * @title        : Garment Return Inspection Page
 * @author       : AraWMS Team
 * @createdDate  : 2026-11-11
 * @lastModified : 2026-11-11
 * @description  : Giao diện Kiểm tra hàng hoàn/trả cho Nhân viên Kỹ thuật (Garment Technician):
 *                 - Hỗ trợ Camera tràn viền (Full-width Viewfinder) với khung focus quét mã QR/Barcode trực tiếp (@zxing/browser).
 *                 - Danh sách gợi ý đơn hàng gần đây để chọn nhanh khi kiểm thử hoặc mã vạch mờ.
 *                 - Quét mã đơn hàng / mã vận đơn GHN / mã RMA / QR Token (PACK:v1:...).
 *                 - Ghi lại quá trình kiểm tra KCS, tình trạng sản phẩm, video khui kiện.
 *                 - Nếu ĐẠT: Chuyển đơn thành Hoàn thành công (RETURNED), thêm vào danh sách chờ nhập kho.
 *                 - Nếu KHÔNG ĐẠT: Bắt buộc lưu video gắn với đơn & lý do không đạt.
 *                 - Hiển thị kết quả kiểm tra bên dưới với bộ lọc Đạt / Không đạt và tạo phiếu yêu cầu nhập kho hàng hoàn.
 * @module       : Garment Technical / Return Inspection
 * @layer        : Front-end (Page)
 * ============================================================================
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  ExternalLink,
  Package,
  Layers,
  ArrowRight,
  ShieldCheck,
  ShieldAlert,
  FileText,
  Clock,
  User,
  Phone,
  MapPin,
  Check,
  X,
  RefreshCw,
  Plus,
  Eye,
  Info,
  Calendar,
  Truck,
  Box,
  Sparkles,
} from 'lucide-react';
import garmentTechnicalService from '../../services/garmentTechnicalService';

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
    // Ignore audio play errors in browser
  }
}

// Danh mục tình trạng hàng trả về thực tế
const ITEM_CONDITIONS = [
  { value: 'GOOD_INTACT', label: 'Nguyên vẹn, nguyên tem mác (Tốt)', isDefect: false },
  { value: 'MISSING_TAG', label: 'Mất tem mác / Rách bao bì', isDefect: true },
  { value: 'DIRTY_OR_DAMAGED', label: 'Bẩn, ố màu hoặc rách vải', isDefect: true },
  { value: 'DEFECTIVE_SEWING', label: 'Lỗi đường may, bung chỉ', isDefect: true },
  { value: 'WRONG_ITEM', label: 'Sai sản phẩm / Sai màu / Sai mẫu', isDefect: true },
  { value: 'USED', label: 'Đã qua sử dụng / Có mùi lạ', isDefect: true },
];

export default function GarmentReturnInspectionPage() {
  // Input ref để auto-focus
  const scanInputRef = useRef(null);

  // Camera Scanner Refs & State
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const streamRef = useRef(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [cameraDevices, setCameraDevices] = useState([]);
  const [activeDeviceIndex, setActiveDeviceIndex] = useState(0);

  // State: Tìm kiếm / Quét đơn hàng
  const [scanCode, setScanCode] = useState('');
  const [searchingOrder, setSearchingOrder] = useState(false);
  const [scannedOrderData, setScannedOrderData] = useState(null); // { order, rma, existingInspections }

  // State: Đơn hàng gợi ý kiểm tra nhanh
  const [recentOrders, setRecentOrders] = useState([]);
  const [loadingRecentOrders, setLoadingRecentOrders] = useState(false);

  // State: Form kiểm tra KCS
  const [inspectionItems, setInspectionItems] = useState([]);
  const [overallResult, setOverallResult] = useState('PASSED'); // 'PASSED' | 'FAILED'
  const [qcNote, setQcNote] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [submittingInspection, setSubmittingInspection] = useState(false);

  // State: Lịch sử & Kết quả kiểm tra bên dưới
  const [inspections, setInspections] = useState([]);
  const [loadingInspections, setLoadingInspections] = useState(false);
  const [stats, setStats] = useState({
    totalCount: 0,
    passedCount: 0,
    failedCount: 0,
    pendingInboundCount: 0,
  });

  // State: Bộ lọc bảng kết quả
  const [resultFilter, setResultFilter] = useState('ALL'); // 'ALL' | 'PASSED' | 'FAILED'
  const [onlyPendingInbound, setOnlyPendingInbound] = useState(false);
  const [tableSearch, setTableSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // State: Checkbox chọn nhiều đơn đạt để yêu cầu nhập kho
  const [selectedInspectionIds, setSelectedInspectionIds] = useState([]);
  const [requestingInbound, setRequestingInbound] = useState(false);

  // State: Xem chi tiết biên bản kiểm tra (Modal)
  const [viewingInspection, setViewingInspection] = useState(null);

  // Notification Toast / Alert Banner
  const [alertBanner, setAlertBanner] = useState(null);
  const showAlert = (type, message) => {
    setAlertBanner({ type, message });
    setTimeout(() => setAlertBanner(null), 6000);
  };

  // 1. Tải danh sách kết quả kiểm tra
  const fetchInspections = async () => {
    setLoadingInspections(true);
    try {
      const res = await garmentTechnicalService.returnInspection.getInspections({
        result: resultFilter === 'ALL' ? undefined : resultFilter,
        inboundStatus: onlyPendingInbound ? 'PENDING' : undefined,
        search: tableSearch.trim() || undefined,
        page,
        limit: 20,
      });

      if (res?.data) {
        setInspections(res.data.inspections || []);
        if (res.data.stats) setStats(res.data.stats);
        if (res.data.pagination) setTotalPages(res.data.pagination.totalPages || 1);
      }
    } catch (err) {
      console.error('Lỗi tải danh sách kiểm tra hàng hoàn:', err);
      showAlert('error', err.message || 'Không thể tải lịch sử kiểm tra');
    } finally {
      setLoadingInspections(false);
    }
  };

  // 2. Tải danh sách đơn hàng gần đây để gợi ý chọn nhanh
  const fetchRecentOrders = async () => {
    setLoadingRecentOrders(true);
    try {
      const res = await garmentTechnicalService.returnInspection.getRecentOrders();
      if (res?.data) {
        setRecentOrders(res.data || []);
      }
    } catch (err) {
      console.error('Lỗi tải danh sách đơn gợi ý:', err);
    } finally {
      setLoadingRecentOrders(false);
    }
  };

  useEffect(() => {
    fetchInspections();
    fetchRecentOrders();
    // Auto focus vào ô quét khi vào trang
    setTimeout(() => {
      scanInputRef.current?.focus();
    }, 400);
  }, []);

  useEffect(() => {
    fetchInspections();
  }, [resultFilter, onlyPendingInbound, page]);

  // 3. Camera Scanner Controls (@zxing/browser)
  const startCamera = async (targetIndex = null) => {
    // Nếu đang bật và không phải lệnh chuyển cam thì bỏ qua
    if (cameraActive && targetIndex === null) return;
    setCameraError('');

    if (!navigator.mediaDevices?.getUserMedia) {
      const msg = 'Trình duyệt yêu cầu kết nối an toàn (HTTPS hoặc localhost) để mở Camera.';
      setCameraError(msg);
      showAlert('error', msg);
      return;
    }

    try {
      // Dừng session cũ nếu đang chạy
      if (controlsRef.current) {
        try {
          controlsRef.current.stop();
        } catch (e) {
          // ignore
        }
        controlsRef.current = null;
      }
      if (streamRef.current) {
        try {
          streamRef.current.getTracks().forEach((track) => track.stop());
        } catch (e) {
          // ignore
        }
        streamRef.current = null;
      }

      // Bật hiển thị container trước để phần tử video hiển thị
      setCameraActive(true);

      // Đảm bảo DOM sẵn sàng
      await new Promise((resolve) => setTimeout(resolve, 80));

      const videoElement = videoRef.current;
      if (!videoElement) {
        throw new Error('Không tìm thấy phần tử hiển thị video.');
      }

      // Liệt kê các camera có trên thiết bị để hỗ trợ đổi cam nếu có > 1 cam
      let devices = [];
      try {
        const allDevices = await navigator.mediaDevices.enumerateDevices();
        devices = allDevices.filter((d) => d.kind === 'videoinput');
        setCameraDevices(devices);
      } catch (enumErr) {
        console.warn('Lỗi enumerateDevices:', enumErr);
      }

      const devIndex = targetIndex !== null ? targetIndex : activeDeviceIndex;
      const targetDevice = devices[devIndex];

      // Lấy stream trực tiếp từ getUserMedia
      let stream;
      if (targetDevice?.deviceId) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              deviceId: { exact: targetDevice.deviceId },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            },
            audio: false,
          });
        } catch (specErr) {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { deviceId: { exact: targetDevice.deviceId } },
            audio: false,
          });
        }
      } else {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            },
            audio: false,
          });
        } catch (constraintErr) {
          // Fallback cho webcam laptop/máy bàn không có environment facingMode
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        }
      }

      streamRef.current = stream;

      // Gắn stream trực tiếp vào video element và chạy
      videoElement.srcObject = stream;
      videoElement.setAttribute('playsinline', 'true');
      videoElement.setAttribute('autoplay', 'true');
      videoElement.muted = true;
      try {
        await videoElement.play();
      } catch (playErr) {
        console.warn('Auto play video warning:', playErr);
      }

      // Kích hoạt thư viện giải mã Barcode / QR (@zxing/browser)
      const { BarcodeFormat, BrowserMultiFormatReader } = await import('@zxing/browser');
      const reader = new BrowserMultiFormatReader();
      reader.possibleFormats = [
        BarcodeFormat.QR_CODE,
        BarcodeFormat.CODE_128,
        BarcodeFormat.CODE_39,
        BarcodeFormat.EAN_13,
        BarcodeFormat.UPC_A,
      ];

      const controls = await reader.decodeFromStream(stream, videoElement, (result) => {
        if (result) {
          const text = result.getText();
          if (text && text.trim()) {
            playBeep(true);
            setScanCode(text.trim());
            stopCamera();
            handleLookupOrder(null, text.trim());
          }
        }
      });

      controlsRef.current = controls;
    } catch (err) {
      console.error('Lỗi khởi động camera:', err);
      stopCamera();
      const msg = `Không thể mở Camera: ${err.message || 'Vui lòng cho phép quyền truy cập Camera trên trình duyệt.'}`;
      setCameraError(msg);
      showAlert('error', msg);
    }
  };

  const switchCamera = async () => {
    if (cameraDevices.length <= 1) return;
    const nextIndex = (activeDeviceIndex + 1) % cameraDevices.length;
    setActiveDeviceIndex(nextIndex);
    await startCamera(nextIndex);
  };

  const stopCamera = () => {
    if (controlsRef.current) {
      try {
        controlsRef.current.stop();
      } catch (e) {
        // ignore
      }
      controlsRef.current = null;
    }
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach((track) => track.stop());
      } catch (e) {
        // ignore
      }
      streamRef.current = null;
    }
    if (videoRef.current) {
      if (videoRef.current.srcObject) {
        try {
          videoRef.current.srcObject.getTracks().forEach((track) => track.stop());
        } catch (e) {
          // ignore
        }
        videoRef.current.srcObject = null;
      }
    }
    setCameraActive(false);
  };

  // Dọn dẹp camera khi unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  // 4. Tra cứu / Quét đơn hàng
  const handleLookupOrder = async (e, directCode = null) => {
    if (e && e.preventDefault) e.preventDefault();
    const code = String(directCode !== null ? directCode : scanCode).trim();
    if (!code) {
      showAlert('warning', 'Vui lòng nhập hoặc quét mã đơn hàng / mã vận đơn');
      scanInputRef.current?.focus();
      return;
    }

    setSearchingOrder(true);
    try {
      const res = await garmentTechnicalService.returnInspection.lookupOrder(code);
      if (res?.data?.order) {
        playBeep(true);
        const orderData = res.data;
        setScannedOrderData(orderData);
        setScanCode(orderData.order.orderCode || code);

        // Khởi tạo danh sách sản phẩm cần kiểm tra dựa trên đơn hàng
        const orderItems = orderData.order.items || [];
        const initItems = orderItems.map((item) => ({
          skuId: item.skuId?._id || item.skuId,
          skuCode: item.skuCode || item.skuId?.skuCode || '',
          skuBarcode: item.skuBarcode || item.skuId?.skuBarcode || item.skuCode,
          productName: item.productName || item.skuId?.styleName || 'Sản phẩm',
          color: item.color || item.skuId?.color || '',
          size: item.size || item.skuId?.size || '',
          quantity: item.orderedQty || 1,
          condition: 'GOOD_INTACT',
          passed: true,
          note: '',
        }));

        setInspectionItems(initItems);
        setOverallResult('PASSED');
        setQcNote('');
        setRejectReason('');
        setVideoUrl('');

        showAlert('success', `Đã tìm thấy đơn hàng "${orderData.order.orderCode}"`);
      } else {
        playBeep(false);
        showAlert('error', 'Không tìm thấy thông tin đơn hàng');
      }
    } catch (err) {
      playBeep(false);
      showAlert(
        'error',
        err.message || `Không tìm thấy đơn hàng phù hợp với mã: "${code}". Bạn có thể chọn nhanh từ danh sách đơn gợi ý bên dưới.`
      );
      setScannedOrderData(null);
    } finally {
      setSearchingOrder(false);
    }
  };

  // Đổi tình trạng từng sản phẩm
  const handleItemConditionChange = (index, condition) => {
    setInspectionItems((prev) => {
      const next = [...prev];
      const isDefect = ITEM_CONDITIONS.find((c) => c.value === condition)?.isDefect || false;
      next[index] = {
        ...next[index],
        condition,
        passed: !isDefect,
      };

      // Nếu có sản phẩm lỗi, tự động gợi ý chọn Không đạt
      const hasAnyDefect = next.some((item) => item.passed === false);
      if (hasAnyDefect) {
        setOverallResult('FAILED');
      }

      return next;
    });
  };

  // Đổi ghi chú từng sản phẩm
  const handleItemNoteChange = (index, note) => {
    setInspectionItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], note };
      return next;
    });
  };

  // Đổi trạng thái đạt/không đạt của từng sản phẩm
  const handleItemPassedToggle = (index) => {
    setInspectionItems((prev) => {
      const next = [...prev];
      const newPassed = !next[index].passed;
      next[index] = { ...next[index], passed: newPassed };

      const hasAnyFailed = next.some((item) => !item.passed);
      if (hasAnyFailed) {
        setOverallResult('FAILED');
      } else {
        setOverallResult('PASSED');
      }
      return next;
    });
  };

  // 5. Gửi kết quả kiểm tra
  const handleSubmitInspection = async () => {
    if (!scannedOrderData?.order) return;

    if (overallResult === 'FAILED') {
      if (!videoUrl.trim()) {
        showAlert('error', 'Bắt buộc phải đính kèm đường dẫn video quay quá trình khui/kiểm hàng khi kết luận KHÔNG ĐẠT');
        return;
      }
      if (!rejectReason.trim()) {
        showAlert('error', 'Vui lòng nhập lý do từ chối / hàng không đạt tiêu chuẩn');
        return;
      }
    }

    setSubmittingInspection(true);
    try {
      const payload = {
        orderId: scannedOrderData.order._id,
        items: inspectionItems,
        inspectionResult: overallResult,
        qcNote: qcNote.trim(),
        rejectReason: overallResult === 'FAILED' ? rejectReason.trim() : '',
        videoUrl: videoUrl.trim(),
        returnWaybillCode: scannedOrderData.rma?.returnWaybillCode || '',
      };

      const res = await garmentTechnicalService.returnInspection.submitInspection(payload);
      playBeep(true);

      showAlert(
        'success',
        overallResult === 'PASSED'
          ? `Biên bản ${res?.data?.inspectionCode || ''}: Đơn hàng đã được ghi nhận ĐẠT (Hoàn thành công) và đưa vào danh sách chờ nhập kho hoàn!`
          : `Biên bản ${res?.data?.inspectionCode || ''}: Đã ghi nhận KHÔNG ĐẠT và lưu video bằng chứng gắn với đơn hàng.`
      );

      // Reset form sau khi gửi
      setScannedOrderData(null);
      setScanCode('');
      setInspectionItems([]);
      setQcNote('');
      setRejectReason('');
      setVideoUrl('');

      // Refresh kết quả bảng dưới & danh sách gợi ý
      fetchInspections();
      fetchRecentOrders();
      scanInputRef.current?.focus();
    } catch (err) {
      playBeep(false);
      console.error('Lỗi gửi kết quả kiểm tra:', err);
      showAlert('error', err.message || 'Lỗi khi lưu kết quả kiểm tra');
    } finally {
      setSubmittingInspection(false);
    }
  };

  // 6. Chọn / Bỏ chọn các đơn ĐẠT để yêu cầu nhập kho hoàn
  const eligibleInspections = useMemo(() => {
    return inspections.filter((i) => i.inspectionResult === 'PASSED' && !i.inboundRequested);
  }, [inspections]);

  const handleToggleSelectAllEligible = () => {
    if (selectedInspectionIds.length === eligibleInspections.length) {
      setSelectedInspectionIds([]);
    } else {
      setSelectedInspectionIds(eligibleInspections.map((i) => i._id));
    }
  };

  const handleToggleSelectInspection = (id) => {
    setSelectedInspectionIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // 7. Tạo phiếu yêu cầu nhập kho hoàn (FinishedGoodsTicket)
  const handleRequestInbound = async (ids = selectedInspectionIds) => {
    const targetIds = Array.isArray(ids) ? ids : [ids];
    if (targetIds.length === 0) {
      showAlert('warning', 'Vui lòng chọn ít nhất một biên bản kiểm tra đạt để yêu cầu nhập kho');
      return;
    }

    if (!window.confirm(`Xác nhận gửi yêu cầu nhập kho hoàn cho ${targetIds.length} đơn hàng đã kiểm định ĐẠT?`)) {
      return;
    }

    setRequestingInbound(true);
    try {
      const res = await garmentTechnicalService.returnInspection.requestInboundTicket({
        inspectionIds: targetIds,
      });
      playBeep(true);

      showAlert(
        'success',
        `Đã tạo phiếu nhập kho hàng hoàn ${res?.data?.ticket?.ticketCode || ''} (${res?.data?.totalQty || 0} sản phẩm) gửi Quản lý kho!`
      );

      setSelectedInspectionIds([]);
      fetchInspections();
    } catch (err) {
      playBeep(false);
      console.error('Lỗi tạo phiếu nhập kho hoàn:', err);
      showAlert('error', err.message || 'Không thể tạo phiếu yêu cầu nhập kho hoàn');
    } finally {
      setRequestingInbound(false);
    }
  };

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1440px', margin: '0 auto' }}>
      {/* CSS Animation cho tia laser và nháy đèn camera */}
      <style>{`
        @keyframes laserMove {
          0% { top: 6%; opacity: 0.7; }
          50% { top: 92%; opacity: 1; }
          100% { top: 6%; opacity: 0.7; }
        }
        @keyframes pulseDot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.35; transform: scale(0.8); }
        }
      `}</style>

      {/* Toast Alert Banner */}
      {alertBanner && (
        <div
          style={{
            position: 'fixed',
            top: '80px',
            right: '24px',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '1rem 1.25rem',
            borderRadius: '8px',
            background:
              alertBanner.type === 'success'
                ? '#ECFDF5'
                : alertBanner.type === 'warning'
                ? '#FFFBEB'
                : '#FEF2F2',
            color:
              alertBanner.type === 'success'
                ? '#065F46'
                : alertBanner.type === 'warning'
                ? '#92400E'
                : '#991B1B',
            border: `1px solid ${
              alertBanner.type === 'success'
                ? '#A7F3D0'
                : alertBanner.type === 'warning'
                ? '#FDE68A'
                : '#FECACA'
            }`,
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
            maxWidth: '460px',
            animation: 'fadeIn 0.2s ease-out',
          }}
        >
          {alertBanner.type === 'success' && <CheckCircle2 size={20} />}
          {alertBanner.type === 'warning' && <AlertTriangle size={20} />}
          {alertBanner.type === 'error' && <XCircle size={20} />}
          <div style={{ fontSize: '0.9rem', fontWeight: 500, flex: 1 }}>{alertBanner.message}</div>
          <button
            onClick={() => setAlertBanner(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0 }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Page Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '1.5rem',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              color: 'var(--ara-gold)',
              fontSize: '0.8rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '0.25rem',
            }}
          >
            <RotateCcw size={15} /> Phân Hệ Kỹ Thuật May / KCS Hàng Hoàn
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--ara-noir)', margin: 0 }}>
            Kiểm tra hàng hoàn/trả
          </h1>
          <p style={{ margin: '0.25rem 0 0 0', color: '#6B7280', fontSize: '0.9rem' }}>
            Hỗ trợ máy quét mã vạch hoặc Camera quét trực tiếp. Ghi lại quá trình kiểm tra thực tế, lưu video khui kiện & yêu cầu nhập kho hoàn.
          </p>
        </div>

        <button
          onClick={() => {
            fetchInspections();
            fetchRecentOrders();
          }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.6rem 1rem',
            background: '#FFFFFF',
            border: '1px solid var(--ara-border)',
            borderRadius: '8px',
            fontSize: '0.85rem',
            fontWeight: 600,
            color: '#374151',
            cursor: 'pointer',
            boxShadow: 'var(--ara-shadow-sm)',
          }}
        >
          <RefreshCw size={15} className={loadingInspections ? 'animate-spin' : ''} /> Làm mới dữ liệu
        </button>
      </div>

      {/* KPI Stats Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '1rem',
          marginBottom: '1.75rem',
        }}
      >
        <div
          style={{
            background: '#FFFFFF',
            borderRadius: '12px',
            padding: '1.25rem',
            border: '1px solid var(--ara-border)',
            boxShadow: 'var(--ara-shadow-sm)',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
          }}
        >
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '10px',
              background: '#F3F4F6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#374151',
            }}
          >
            <FileText size={22} />
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: '#6B7280', fontWeight: 600 }}>TỔNG ĐƠN ĐÃ KIỂM TRA</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#111827' }}>
              {stats.totalCount || 0}
            </div>
          </div>
        </div>

        <div
          style={{
            background: '#FFFFFF',
            borderRadius: '12px',
            padding: '1.25rem',
            border: '1px solid #A7F3D0',
            boxShadow: 'var(--ara-shadow-sm)',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
          }}
        >
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '10px',
              background: '#ECFDF5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#059669',
            }}
          >
            <CheckCircle2 size={22} />
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: '#059669', fontWeight: 600 }}>ĐẠT (HOÀN THÀNH CÔNG)</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#065F46' }}>
              {stats.passedCount || 0}
            </div>
          </div>
        </div>

        <div
          style={{
            background: '#FFFFFF',
            borderRadius: '12px',
            padding: '1.25rem',
            border: '1px solid #FECACA',
            boxShadow: 'var(--ara-shadow-sm)',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
          }}
        >
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '10px',
              background: '#FEF2F2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#DC2626',
            }}
          >
            <XCircle size={22} />
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: '#DC2626', fontWeight: 600 }}>KHÔNG ĐẠT (TỪ CHỐI HOÀN)</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#991B1B' }}>
              {stats.failedCount || 0}
            </div>
          </div>
        </div>

        <div
          style={{
            background: '#FFFFFF',
            borderRadius: '12px',
            padding: '1.25rem',
            border: '1px solid #FDE68A',
            boxShadow: 'var(--ara-shadow-sm)',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
          }}
        >
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '10px',
              background: '#FFFBEB',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#D97706',
            }}
          >
            <Package size={22} />
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: '#D97706', fontWeight: 600 }}>CHỜ NHẬP KHO HOÀN</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#92400E' }}>
              {stats.pendingInboundCount || 0}
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 1: KHUNG QUÉT / TRA CỨU ĐƠN HÀNG & CAMERA SCANNER TRÀN VIỀN */}
      <div
        style={{
          background: '#FFFFFF',
          borderRadius: '14px',
          padding: '1.5rem',
          border: '1px solid var(--ara-border)',
          boxShadow: 'var(--ara-shadow-sm)',
          marginBottom: '2rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'rgba(212, 175, 55, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--ara-gold)',
              }}
            >
              <ScanLine size={18} />
            </div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: '#111827' }}>
              Bước 1: Quét hoặc tra cứu đơn hàng hoàn/trả
            </h2>
          </div>

          {/* Nút Bật / Tắt Camera Quét mã */}
          <button
            type="button"
            onClick={cameraActive ? stopCamera : startCamera}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.55rem 1.1rem',
              borderRadius: '8px',
              border: cameraActive ? '1px solid #DC2626' : '1px solid var(--ara-border)',
              background: cameraActive ? '#FEF2F2' : '#F9FAFB',
              color: cameraActive ? '#DC2626' : '#374151',
              fontSize: '0.88rem',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              boxShadow: 'var(--ara-shadow-sm)',
            }}
          >
            {cameraActive ? (
              <>
                <CameraOff size={16} /> Tắt Camera
              </>
            ) : (
              <>
                <Camera size={16} color="var(--ara-gold)" /> Mở Camera quét mã QR / Barcode
              </>
            )}
          </button>
        </div>

        {/* Báo lỗi Camera nếu có */}
        {cameraError && (
          <div
            style={{
              marginBottom: '1rem',
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              background: '#FEF2F2',
              color: '#991B1B',
              border: '1px solid #FECACA',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <AlertTriangle size={16} />
            <div>{cameraError}</div>
          </div>
        )}

        {/* Khung Camera Viewfinder TRÀN VIỀN (Luôn mount trong DOM để videoRef không bị null) */}
        <div
          style={{
            display: cameraActive ? 'block' : 'none',
            position: 'relative',
            width: '100%',
            height: '380px',
            borderRadius: '12px',
            overflow: 'hidden',
            background: '#0B0F19',
            marginBottom: '1.25rem',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)',
          }}
        >
          {/* Video Camera tràn rộng toàn bộ chiều ngang */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
              background: '#000000',
            }}
          />

          {/* Lớp phủ hướng dẫn quét (Target overlay focus) */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
            }}
          >
            {/* Khung Focus quét mã ở chính giữa */}
            <div
              style={{
                position: 'relative',
                width: '320px',
                maxWidth: '85%',
                height: '200px',
                borderRadius: '16px',
                border: '2px solid rgba(16, 185, 129, 0.95)',
                boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.42), 0 0 20px rgba(16, 185, 129, 0.3)',
              }}
            >
              {/* 4 góc viền nhấn (Corner brackets) */}
              <span style={{ position: 'absolute', top: '-3px', left: '-3px', width: '22px', height: '22px', borderTop: '4px solid #10B981', borderLeft: '4px solid #10B981', borderTopLeftRadius: '16px' }} />
              <span style={{ position: 'absolute', top: '-3px', right: '-3px', width: '22px', height: '22px', borderTop: '4px solid #10B981', borderRight: '4px solid #10B981', borderTopRightRadius: '16px' }} />
              <span style={{ position: 'absolute', bottom: '-3px', left: '-3px', width: '22px', height: '22px', borderBottom: '4px solid #10B981', borderLeft: '4px solid #10B981', borderBottomLeftRadius: '16px' }} />
              <span style={{ position: 'absolute', bottom: '-3px', right: '-3px', width: '22px', height: '22px', borderBottom: '4px solid #10B981', borderRight: '4px solid #10B981', borderBottomRightRadius: '16px' }} />

              {/* Tia laser quét di chuyển lên xuống */}
              <div
                style={{
                  position: 'absolute',
                  left: '8px',
                  right: '8px',
                  height: '3px',
                  background: 'linear-gradient(90deg, transparent, #34D399, #10B981, #34D399, transparent)',
                  boxShadow: '0 0 10px #10B981',
                  borderRadius: '2px',
                  animation: 'laserMove 2s ease-in-out infinite',
                }}
              />
            </div>

            {/* Hướng dẫn dưới khung focus */}
            <div
              style={{
                position: 'absolute',
                bottom: '22px',
                background: 'rgba(0, 0, 0, 0.75)',
                backdropFilter: 'blur(6px)',
                color: '#FFFFFF',
                padding: '0.45rem 1.25rem',
                borderRadius: '30px',
                fontSize: '0.85rem',
                fontWeight: 600,
                border: '1px solid rgba(255, 255, 255, 0.2)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <ScanLine size={16} color="#34D399" /> Đưa mã QR hoặc Barcode trên kiện hàng hoàn vào giữa khung để tự động nhận diện
            </div>
          </div>

          {/* Thanh trạng thái phía trên camera */}
          <div
            style={{
              position: 'absolute',
              top: '14px',
              left: '16px',
              right: '16px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              pointerEvents: 'auto',
              zIndex: 10,
            }}
          >
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                background: 'rgba(0, 0, 0, 0.65)',
                backdropFilter: 'blur(4px)',
                color: '#FFFFFF',
                padding: '0.35rem 0.85rem',
                borderRadius: '20px',
                fontSize: '0.78rem',
                fontWeight: 700,
                border: '1px solid rgba(255, 255, 255, 0.15)',
              }}
            >
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: '#10B981',
                  animation: 'pulseDot 1.5s infinite',
                }}
              />
              CAMERA ĐANG HOẠT ĐỘNG
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {cameraDevices.length > 1 && (
                <button
                  type="button"
                  onClick={switchCamera}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    padding: '0.45rem 0.85rem',
                    borderRadius: '8px',
                    border: '1px solid rgba(255, 255, 255, 0.25)',
                    background: 'rgba(0, 0, 0, 0.65)',
                    backdropFilter: 'blur(4px)',
                    color: '#FFFFFF',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                  title="Chuyển đổi giữa các camera"
                >
                  <RefreshCw size={14} /> Đổi Cam ({activeDeviceIndex + 1}/{cameraDevices.length})
                </button>
              )}

              <button
                type="button"
                onClick={stopCamera}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.45rem 0.9rem',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'rgba(220, 38, 38, 0.9)',
                  color: '#FFFFFF',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 2px 6px rgba(0, 0, 0, 0.3)',
                }}
              >
                <CameraOff size={15} /> Tắt Camera
              </button>
            </div>
          </div>
        </div>

        {/* Ô nhập mã thủ công hoặc nhận từ máy quét cầm tay */}
        <form onSubmit={handleLookupOrder} style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '320px' }}>
            <Search
              size={18}
              style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }}
            />
            <input
              ref={scanInputRef}
              type="text"
              value={scanCode}
              onChange={(e) => setScanCode(e.target.value)}
              placeholder="Quét mã QR (PACK:v1:...), mã đơn hàng (DH-...), mã GHN, mã RMA..."
              style={{
                width: '100%',
                padding: '0.8rem 1rem 0.8rem 2.75rem',
                borderRadius: '8px',
                border: '1.5px solid #D1D5DB',
                fontSize: '0.95rem',
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'border-color 0.2s',
              }}
              onFocus={(e) => (e.target.style.borderColor = 'var(--ara-gold)')}
              onBlur={(e) => (e.target.style.borderColor = '#D1D5DB')}
            />
          </div>

          <button
            type="submit"
            disabled={searchingOrder}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.8rem 1.5rem',
              background: 'var(--ara-gold)',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '8px',
              fontSize: '0.95rem',
              fontWeight: 700,
              cursor: searchingOrder ? 'not-allowed' : 'pointer',
              opacity: searchingOrder ? 0.7 : 1,
              boxShadow: 'var(--ara-shadow-sm)',
            }}
          >
            {searchingOrder ? (
              <>
                <RefreshCw size={17} className="animate-spin" /> Đang tra cứu...
              </>
            ) : (
              <>
                <ScanLine size={17} /> Quét / Tìm đơn
              </>
            )}
          </button>

          {scannedOrderData && (
            <button
              type="button"
              onClick={() => {
                setScannedOrderData(null);
                setScanCode('');
                setInspectionItems([]);
                scanInputRef.current?.focus();
              }}
              style={{
                padding: '0.8rem 1.25rem',
                background: '#F3F4F6',
                color: '#4B5563',
                border: '1px solid #E5E7EB',
                borderRadius: '8px',
                fontSize: '0.9rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Hủy / Đóng quét đơn
            </button>
          )}
        </form>

        {/* GỢI Ý CHỌN NHANH ĐƠN HÀNG GẦN ĐÂY ĐỂ KIỂM THỬ HOẶC KHI MÃ VẠCH MỜ */}
        {!scannedOrderData && recentOrders.length > 0 && (
          <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid #F3F4F6' }}>
            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#4B5563', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Sparkles size={14} color="var(--ara-gold)" /> Đơn hàng gần đây trong hệ thống (Bấm để chọn & kiểm tra ngay):
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {recentOrders.map((ord) => {
                const isReturn = ord.status === 'RETURN_REQUESTED' || ord.status === 'EXCHANGE_REQUESTED';
                return (
                  <button
                    key={ord._id}
                    type="button"
                    onClick={() => {
                      setScanCode(ord.orderCode);
                      handleLookupOrder(null, ord.orderCode);
                    }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.45rem',
                      padding: '0.4rem 0.75rem',
                      borderRadius: '8px',
                      border: isReturn ? '1px solid #FCD34D' : '1px solid #E5E7EB',
                      background: isReturn ? '#FEF3C7' : '#F9FAFB',
                      color: isReturn ? '#92400E' : '#374151',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-1px)')}
                    onMouseLeave={(e) => (e.currentTarget.style.transform = 'none')}
                  >
                    <span style={{ fontWeight: 800, fontFamily: 'monospace' }}>{ord.orderCode}</span>
                    <span style={{ color: '#6B7280', fontSize: '0.78rem' }}>({ord.customerId?.fullName || 'Khách lẻ'})</span>
                    <span
                      style={{
                        fontSize: '0.7rem',
                        padding: '0.1rem 0.35rem',
                        borderRadius: '4px',
                        background: '#FFFFFF',
                        border: '1px solid rgba(0,0,0,0.1)',
                      }}
                    >
                      {ord.status}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* SECTION 2: GHI LẠI QUÁ TRÌNH KIỂM TRA (HIỂN THỊ KHI ĐÃ QUÉT ĐƯỢC ĐƠN) */}
        {scannedOrderData && (
          <div
            style={{
              marginTop: '1.5rem',
              paddingTop: '1.5rem',
              borderTop: '1px dashed var(--ara-border)',
              animation: 'fadeIn 0.25s ease',
            }}
          >
            {/* Cảnh báo nếu đơn đã từng kiểm tra */}
            {scannedOrderData.existingInspections && scannedOrderData.existingInspections.length > 0 && (
              <div
                style={{
                  background: '#FEF3C7',
                  border: '1px solid #F59E0B',
                  borderRadius: '8px',
                  padding: '0.85rem 1rem',
                  marginBottom: '1.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  color: '#92400E',
                  fontSize: '0.88rem',
                }}
              >
                <AlertTriangle size={18} />
                <div>
                  <strong>Chú ý:</strong> Đơn hàng này đã có{' '}
                  <strong>{scannedOrderData.existingInspections.length}</strong> biên bản kiểm tra trước đó (Gần nhất:{' '}
                  {scannedOrderData.existingInspections[0].inspectionCode} -{' '}
                  {scannedOrderData.existingInspections[0].inspectionResult === 'PASSED' ? 'ĐẠT' : 'KHÔNG ĐẠT'}). Bạn có thể kiểm tra lại kiện mới nếu khách gửi bù.
                </div>
              </div>
            )}

            {/* Thông tin đơn hàng tóm tắt */}
            <div
              style={{
                background: 'var(--ara-bg)',
                borderRadius: '10px',
                padding: '1.25rem',
                marginBottom: '1.5rem',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '1rem',
                border: '1px solid #E5E7EB',
              }}
            >
              <div>
                <div style={{ fontSize: '0.75rem', color: '#6B7280', textTransform: 'uppercase', fontWeight: 600 }}>
                  MÃ ĐƠN HÀNG
                </div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--ara-noir)', marginTop: '2px' }}>
                  {scannedOrderData.order.orderCode}
                </div>
                {scannedOrderData.order.warehouseFulfillment?.waybillCode && (
                  <div style={{ fontSize: '0.8rem', color: '#4B5563', marginTop: '2px' }}>
                    Vận đơn GHN: <strong>{scannedOrderData.order.warehouseFulfillment.waybillCode}</strong>
                  </div>
                )}
              </div>

              <div>
                <div style={{ fontSize: '0.75rem', color: '#6B7280', textTransform: 'uppercase', fontWeight: 600 }}>
                  KHÁCH HÀNG & LIÊN HỆ
                </div>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#111827', marginTop: '2px' }}>
                  {scannedOrderData.order.shippingRecipient?.name || scannedOrderData.order.customerId?.fullName || 'Khách vãng lai'}
                </div>
                <div style={{ fontSize: '0.82rem', color: '#4B5563', marginTop: '2px' }}>
                  SĐT: {scannedOrderData.order.shippingRecipient?.phone || scannedOrderData.order.customerId?.phone || 'Chưa có'}
                </div>
              </div>

              <div>
                <div style={{ fontSize: '0.75rem', color: '#6B7280', textTransform: 'uppercase', fontWeight: 600 }}>
                  TRẠNG THÁI HIỆN TẠI
                </div>
                <div style={{ marginTop: '4px' }}>
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '0.2rem 0.6rem',
                      borderRadius: '6px',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      background: '#E0E7FF',
                      color: '#3730A3',
                    }}
                  >
                    {scannedOrderData.order.status || 'PENDING'}
                  </span>
                </div>
                {scannedOrderData.rma && (
                  <div style={{ fontSize: '0.8rem', color: '#B45309', marginTop: '4px' }}>
                    Yêu cầu RMA: <strong>{scannedOrderData.rma.rmaCode}</strong> ({scannedOrderData.rma.returnType === 'EXCHANGE_PRODUCT' ? 'Đổi hàng' : 'Hoàn tiền'})
                  </div>
                )}
              </div>

              <div>
                <div style={{ fontSize: '0.75rem', color: '#6B7280', textTransform: 'uppercase', fontWeight: 600 }}>
                  GIÁ TRỊ ĐƠN HÀNG
                </div>
                <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#059669', marginTop: '2px' }}>
                  {Number(scannedOrderData.order.financialSummary?.totalOrderAmount || 0).toLocaleString('vi-VN')} đ
                </div>
                <div style={{ fontSize: '0.8rem', color: '#6B7280' }}>
                  Kênh: {scannedOrderData.order.salesChannel || scannedOrderData.order.channel || 'DIRECT'}
                </div>
              </div>
            </div>

            {/* Bảng danh sách sản phẩm trong kiện */}
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: '#111827' }}>
                  Danh sách sản phẩm trong kiện hàng hoàn ({inspectionItems.length} SKU)
                </h3>
                <span style={{ fontSize: '0.82rem', color: '#6B7280' }}>
                  Kiểm tra tem mác, đường may, vết bẩn và xác nhận tình trạng thực tế
                </span>
              </div>

              <div style={{ border: '1px solid var(--ara-border)', borderRadius: '8px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
                  <thead>
                    <tr style={{ background: '#F9FAFB', borderBottom: '1px solid var(--ara-border)', color: '#4B5563' }}>
                      <th style={{ padding: '0.75rem 1rem', width: '40px' }}>#</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Sản phẩm / SKU</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Màu / Size</th>
                      <th style={{ padding: '0.75rem 1rem', width: '80px', textAlign: 'center' }}>SL hoàn</th>
                      <th style={{ padding: '0.75rem 1rem', minWidth: '220px' }}>Tình trạng thực tế</th>
                      <th style={{ padding: '0.75rem 1rem', width: '110px', textAlign: 'center' }}>KCS Đạt?</th>
                      <th style={{ padding: '0.75rem 1rem', minWidth: '180px' }}>Ghi chú riêng</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inspectionItems.map((item, idx) => (
                      <tr
                        key={idx}
                        style={{
                          borderBottom: idx < inspectionItems.length - 1 ? '1px solid #F3F4F6' : 'none',
                          background: item.passed ? '#FFFFFF' : '#FEF2F2',
                        }}
                      >
                        <td style={{ padding: '0.85rem 1rem', color: '#9CA3AF' }}>{idx + 1}</td>
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <div style={{ fontWeight: 700, color: '#111827' }}>{item.productName}</div>
                          <div style={{ fontSize: '0.8rem', color: '#6B7280' }}>
                            Mã SKU: <span style={{ fontFamily: 'monospace' }}>{item.skuCode}</span> | Barcode:{' '}
                            <span style={{ fontFamily: 'monospace' }}>{item.skuBarcode}</span>
                          </div>
                        </td>
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <span style={{ fontWeight: 600 }}>{item.color || '-'}</span> /{' '}
                          <span style={{ fontWeight: 600 }}>{item.size || '-'}</span>
                        </td>
                        <td style={{ padding: '0.85rem 1rem', textAlign: 'center', fontWeight: 800 }}>
                          {item.quantity}
                        </td>
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <select
                            value={item.condition}
                            onChange={(e) => handleItemConditionChange(idx, e.target.value)}
                            style={{
                              width: '100%',
                              padding: '0.45rem 0.6rem',
                              borderRadius: '6px',
                              border: '1px solid #D1D5DB',
                              fontSize: '0.85rem',
                              background: '#FFFFFF',
                            }}
                          >
                            {ITEM_CONDITIONS.map((c) => (
                              <option key={c.value} value={c.value}>
                                {c.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => handleItemPassedToggle(idx)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.3rem',
                              padding: '0.35rem 0.75rem',
                              borderRadius: '20px',
                              border: 'none',
                              fontSize: '0.78rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                              background: item.passed ? '#D1FAE5' : '#FEE2E2',
                              color: item.passed ? '#065F46' : '#991B1B',
                            }}
                          >
                            {item.passed ? <Check size={13} /> : <X size={13} />}
                            {item.passed ? 'ĐẠT' : 'LỖI'}
                          </button>
                        </td>
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <input
                            type="text"
                            value={item.note || ''}
                            onChange={(e) => handleItemNoteChange(idx, e.target.value)}
                            placeholder="Ghi chú lỗi chi tiết..."
                            style={{
                              width: '100%',
                              padding: '0.4rem 0.6rem',
                              borderRadius: '6px',
                              border: '1px solid #E5E7EB',
                              fontSize: '0.83rem',
                              boxSizing: 'border-box',
                            }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Form chi tiết biên bản kiểm tra KCS */}
            <div
              style={{
                background: '#F9FAFB',
                borderRadius: '12px',
                padding: '1.25rem',
                border: '1px solid #E5E7EB',
                marginBottom: '1.5rem',
              }}
            >
              <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 1rem 0', color: '#111827' }}>
                Bước 2: Ghi nhận biên bản kiểm tra thực tế & Video khui kiện
              </h3>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
                {/* Cột trái: Đánh giá & Video */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.88rem', fontWeight: 700, color: '#374151', marginBottom: '0.5rem' }}>
                    Kết luận kiểm tra KCS: <span style={{ color: '#DC2626' }}>*</span>
                  </label>
                  <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.25rem' }}>
                    <label
                      style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.6rem',
                        padding: '0.85rem 1rem',
                        borderRadius: '10px',
                        border: overallResult === 'PASSED' ? '2px solid #059669' : '1px solid #D1D5DB',
                        background: overallResult === 'PASSED' ? '#ECFDF5' : '#FFFFFF',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <input
                        type="radio"
                        name="overallResult"
                        value="PASSED"
                        checked={overallResult === 'PASSED'}
                        onChange={() => setOverallResult('PASSED')}
                        style={{ accentColor: '#059669', width: '17px', height: '17px' }}
                      />
                      <div>
                        <div style={{ fontWeight: 700, color: '#065F46', fontSize: '0.95rem' }}>ĐẠT TIÊU CHUẨN</div>
                        <div style={{ fontSize: '0.78rem', color: '#047857' }}>
                          Hoàn thành công & chờ tạo phiếu nhập kho
                        </div>
                      </div>
                    </label>

                    <label
                      style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.6rem',
                        padding: '0.85rem 1rem',
                        borderRadius: '10px',
                        border: overallResult === 'FAILED' ? '2px solid #DC2626' : '1px solid #D1D5DB',
                        background: overallResult === 'FAILED' ? '#FEF2F2' : '#FFFFFF',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <input
                        type="radio"
                        name="overallResult"
                        value="FAILED"
                        checked={overallResult === 'FAILED'}
                        onChange={() => setOverallResult('FAILED')}
                        style={{ accentColor: '#DC2626', width: '17px', height: '17px' }}
                      />
                      <div>
                        <div style={{ fontWeight: 700, color: '#991B1B', fontSize: '0.95rem' }}>KHÔNG ĐẠT (LỖI)</div>
                        <div style={{ fontSize: '0.78rem', color: '#B91C1C' }}>
                          Từ chối hoàn & lưu video chứng cứ
                        </div>
                      </div>
                    </label>
                  </div>

                  {/* Video URL */}
                  <div style={{ marginBottom: '1rem' }}>
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: '0.88rem',
                        fontWeight: 700,
                        color: '#374151',
                        marginBottom: '0.4rem',
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                        <Video size={16} /> Link Video quay quá trình kiểm tra / khui kiện:
                        {overallResult === 'FAILED' && <span style={{ color: '#DC2626' }}>* (Bắt buộc)</span>}
                      </span>
                      {videoUrl && (
                        <a
                          href={videoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            fontSize: '0.8rem',
                            color: '#2563EB',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            textDecoration: 'none',
                          }}
                        >
                          Mở xem video <ExternalLink size={13} />
                        </a>
                      )}
                    </label>
                    <input
                      type="url"
                      value={videoUrl}
                      onChange={(e) => setVideoUrl(e.target.value)}
                      placeholder="Dán link video unboxing / khui kiện (Google Drive, YouTube, Cloudinary, MP4...)"
                      style={{
                        width: '100%',
                        padding: '0.65rem 0.85rem',
                        borderRadius: '8px',
                        border: overallResult === 'FAILED' && !videoUrl.trim() ? '1.5px solid #DC2626' : '1px solid #D1D5DB',
                        fontSize: '0.88rem',
                        boxSizing: 'border-box',
                        background: '#FFFFFF',
                      }}
                    />
                    <div style={{ fontSize: '0.78rem', color: '#6B7280', marginTop: '0.25rem' }}>
                      Video khui kiện được lưu trữ gắn liền với đơn hàng làm căn cứ đối soát bồi hoàn hoặc giải quyết khiếu nại.
                    </div>
                  </div>

                  {/* Lý do từ chối (bắt buộc khi FAILED) */}
                  {overallResult === 'FAILED' && (
                    <div>
                      <label style={{ display: 'block', fontSize: '0.88rem', fontWeight: 700, color: '#991B1B', marginBottom: '0.4rem' }}>
                        Lý do không đạt / từ chối nhận hoàn: <span style={{ color: '#DC2626' }}>*</span>
                      </label>
                      <textarea
                        rows={2}
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="Mô tả cụ thể lỗi: Hàng bị rách nát, dơ bẩn nặng, thiếu tem mác, không đúng sản phẩm của Ara..."
                        style={{
                          width: '100%',
                          padding: '0.6rem 0.8rem',
                          borderRadius: '8px',
                          border: '1.5px solid #DC2626',
                          fontSize: '0.88rem',
                          boxSizing: 'border-box',
                          background: '#FFFFFF',
                        }}
                      />
                    </div>
                  )}
                </div>

                {/* Cột phải: Ghi chú KCS */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.88rem', fontWeight: 700, color: '#374151', marginBottom: '0.4rem' }}>
                    Ghi chú chi tiết quá trình kiểm tra (QC Note):
                  </label>
                  <textarea
                    rows={overallResult === 'FAILED' ? 7 : 5}
                    value={qcNote}
                    onChange={(e) => setQcNote(e.target.value)}
                    placeholder="Ghi nhận tình trạng đóng gói bên ngoài của bưu kiện khi nhận từ bưu tá, niêm phong băng dính, số lượng sản phẩm bên trong..."
                    style={{
                      width: '100%',
                      padding: '0.65rem 0.85rem',
                      borderRadius: '8px',
                      border: '1px solid #D1D5DB',
                      fontSize: '0.88rem',
                      boxSizing: 'border-box',
                      background: '#FFFFFF',
                      resize: 'vertical',
                    }}
                  />

                  <div
                    style={{
                      marginTop: '0.75rem',
                      padding: '0.75rem',
                      borderRadius: '8px',
                      background: '#EFF6FF',
                      border: '1px solid #BFDBFE',
                      fontSize: '0.8rem',
                      color: '#1E40AF',
                      display: 'flex',
                      gap: '0.5rem',
                    }}
                  >
                    <Info size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                    <div>
                      {overallResult === 'PASSED'
                        ? 'Khi nhấn Lưu: Đơn hàng sẽ được chuyển thành "Hoàn thành công" (RETURNED) và sẵn sàng đưa vào danh sách để gửi lệnh nhập kho cho Quản lý kho.'
                        : 'Khi nhấn Lưu: Hệ thống sẽ gắn link video và ghi nhận trạng thái từ chối nhận hoàn vào lịch sử đơn hàng để bộ phận CSKH xử lý với khách.'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Nút lưu kết quả kiểm tra */}
              <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => {
                    setScannedOrderData(null);
                    scanInputRef.current?.focus();
                  }}
                  style={{
                    padding: '0.75rem 1.25rem',
                    borderRadius: '8px',
                    border: '1px solid #D1D5DB',
                    background: '#FFFFFF',
                    color: '#374151',
                    fontSize: '0.9rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Hủy thao tác
                </button>

                <button
                  type="button"
                  disabled={submittingInspection}
                  onClick={handleSubmitInspection}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.75rem 1.75rem',
                    borderRadius: '8px',
                    border: 'none',
                    background: overallResult === 'PASSED' ? '#059669' : '#DC2626',
                    color: '#FFFFFF',
                    fontSize: '0.95rem',
                    fontWeight: 700,
                    cursor: submittingInspection ? 'not-allowed' : 'pointer',
                    opacity: submittingInspection ? 0.7 : 1,
                    boxShadow: 'var(--ara-shadow-sm)',
                  }}
                >
                  {submittingInspection ? (
                    <>
                      <RefreshCw size={17} className="animate-spin" /> Đang lưu kết quả...
                    </>
                  ) : overallResult === 'PASSED' ? (
                    <>
                      <CheckCircle2 size={18} /> Xác nhận ĐẠT & Hoàn thành công
                    </>
                  ) : (
                    <>
                      <XCircle size={18} /> Xác nhận KHÔNG ĐẠT & Lưu video
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* SECTION 3: DANH SÁCH KẾT QUẢ KIỂM TRA BÊN DƯỚI (FILTER ĐẠT / KHÔNG ĐẠT & YÊU CẦU NHẬP KHO) */}
      <div
        style={{
          background: '#FFFFFF',
          borderRadius: '14px',
          padding: '1.5rem',
          border: '1px solid var(--ara-border)',
          boxShadow: 'var(--ara-shadow-sm)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1.25rem',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0, color: '#111827' }}>
              Kết quả & Lịch sử kiểm tra hàng hoàn/trả
            </h2>
            <div style={{ fontSize: '0.85rem', color: '#6B7280', marginTop: '2px' }}>
              Danh sách các đơn hàng đã được KCS kiểm định. Chọn các đơn ĐẠT để gửi phiếu yêu cầu nhập kho hoàn.
            </div>
          </div>

          {/* Action: Yêu cầu nhập kho hoàn cho các đơn đã chọn */}
          <button
            type="button"
            disabled={requestingInbound || selectedInspectionIds.length === 0}
            onClick={() => handleRequestInbound()}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.75rem 1.4rem',
              borderRadius: '8px',
              border: 'none',
              background: selectedInspectionIds.length > 0 ? 'var(--ara-noir)' : '#E5E7EB',
              color: selectedInspectionIds.length > 0 ? '#FFFFFF' : '#9CA3AF',
              fontSize: '0.9rem',
              fontWeight: 700,
              cursor: selectedInspectionIds.length > 0 && !requestingInbound ? 'pointer' : 'not-allowed',
              boxShadow: selectedInspectionIds.length > 0 ? 'var(--ara-shadow-sm)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            {requestingInbound ? (
              <>
                <RefreshCw size={16} className="animate-spin" /> Đang tạo phiếu...
              </>
            ) : (
              <>
                <Package size={17} /> Yêu cầu nhập kho hàng hoàn ({selectedInspectionIds.length})
              </>
            )}
          </button>
        </div>

        {/* Filter Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            marginBottom: '1.25rem',
            flexWrap: 'wrap',
            background: 'var(--ara-bg)',
            padding: '0.85rem 1rem',
            borderRadius: '10px',
          }}
        >
          {/* Tabs Filter theo kết quả: Tất cả / Đạt / Không đạt */}
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#4B5563', marginRight: '0.25rem' }}>
              Bộ lọc:
            </span>
            <button
              type="button"
              onClick={() => {
                setResultFilter('ALL');
                setPage(1);
              }}
              style={{
                padding: '0.45rem 0.9rem',
                borderRadius: '6px',
                border: 'none',
                fontSize: '0.85rem',
                fontWeight: 700,
                cursor: 'pointer',
                background: resultFilter === 'ALL' ? '#FFFFFF' : 'transparent',
                color: resultFilter === 'ALL' ? 'var(--ara-noir)' : '#6B7280',
                boxShadow: resultFilter === 'ALL' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              }}
            >
              Tất cả ({stats.totalCount || 0})
            </button>

            <button
              type="button"
              onClick={() => {
                setResultFilter('PASSED');
                setPage(1);
              }}
              style={{
                padding: '0.45rem 0.9rem',
                borderRadius: '6px',
                border: 'none',
                fontSize: '0.85rem',
                fontWeight: 700,
                cursor: 'pointer',
                background: resultFilter === 'PASSED' ? '#ECFDF5' : 'transparent',
                color: resultFilter === 'PASSED' ? '#065F46' : '#6B7280',
                boxShadow: resultFilter === 'PASSED' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              }}
            >
              <CheckCircle2 size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: '-2px' }} />
              Đạt ({stats.passedCount || 0})
            </button>

            <button
              type="button"
              onClick={() => {
                setResultFilter('FAILED');
                setPage(1);
              }}
              style={{
                padding: '0.45rem 0.9rem',
                borderRadius: '6px',
                border: 'none',
                fontSize: '0.85rem',
                fontWeight: 700,
                cursor: 'pointer',
                background: resultFilter === 'FAILED' ? '#FEF2F2' : 'transparent',
                color: resultFilter === 'FAILED' ? '#991B1B' : '#6B7280',
                boxShadow: resultFilter === 'FAILED' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              }}
            >
              <XCircle size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: '-2px' }} />
              Không đạt ({stats.failedCount || 0})
            </button>

            {/* Checkbox lọc chỉ đơn Đạt chờ nhập kho */}
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                marginLeft: '0.75rem',
                fontSize: '0.85rem',
                fontWeight: 600,
                color: '#92400E',
                cursor: 'pointer',
                background: onlyPendingInbound ? '#FEF3C7' : 'transparent',
                padding: '0.4rem 0.6rem',
                borderRadius: '6px',
              }}
            >
              <input
                type="checkbox"
                checked={onlyPendingInbound}
                onChange={(e) => {
                  setOnlyPendingInbound(e.target.checked);
                  setPage(1);
                }}
                style={{ accentColor: '#D97706' }}
              />
              Chỉ hiện đơn chờ nhập kho ({stats.pendingInboundCount || 0})
            </label>
          </div>

          {/* Search Table */}
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <div style={{ position: 'relative', width: '260px' }}>
              <Search
                size={16}
                style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }}
              />
              <input
                type="text"
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setPage(1);
                    fetchInspections();
                  }
                }}
                placeholder="Tìm mã KTH, đơn hàng, SĐT..."
                style={{
                  width: '100%',
                  padding: '0.45rem 0.65rem 0.45rem 2rem',
                  borderRadius: '6px',
                  border: '1px solid #D1D5DB',
                  fontSize: '0.85rem',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <button
              type="button"
              onClick={() => {
                setPage(1);
                fetchInspections();
              }}
              style={{
                padding: '0.45rem 0.75rem',
                background: '#FFFFFF',
                border: '1px solid #D1D5DB',
                borderRadius: '6px',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Lọc
            </button>
          </div>
        </div>

        {/* Bảng dữ liệu kết quả kiểm tra */}
        <div style={{ border: '1px solid var(--ara-border)', borderRadius: '10px', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.87rem' }}>
            <thead>
              <tr style={{ background: '#F9FAFB', borderBottom: '1px solid var(--ara-border)', color: '#4B5563' }}>
                <th style={{ padding: '0.75rem 1rem', width: '40px', textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={
                      eligibleInspections.length > 0 &&
                      selectedInspectionIds.length === eligibleInspections.length
                    }
                    onChange={handleToggleSelectAllEligible}
                    disabled={eligibleInspections.length === 0}
                    title="Chọn tất cả đơn Đạt chờ nhập kho"
                    style={{ cursor: eligibleInspections.length > 0 ? 'pointer' : 'not-allowed' }}
                  />
                </th>
                <th style={{ padding: '0.75rem 1rem' }}>Mã kiểm định</th>
                <th style={{ padding: '0.75rem 1rem' }}>Đơn hàng / Vận đơn</th>
                <th style={{ padding: '0.75rem 1rem' }}>Khách hàng</th>
                <th style={{ padding: '0.75rem 1rem' }}>Sản phẩm kiểm tra</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Kết quả</th>
                <th style={{ padding: '0.75rem 1rem' }}>Video & Ghi chú</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Trạng thái nhập kho</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loadingInspections ? (
                <tr>
                  <td colSpan={9} style={{ padding: '3rem', textAlign: 'center', color: '#9CA3AF' }}>
                    <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 0.5rem auto' }} />
                    <div>Đang tải danh sách kết quả kiểm tra...</div>
                  </td>
                </tr>
              ) : inspections.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ padding: '3rem', textAlign: 'center', color: '#9CA3AF' }}>
                    <Package size={36} style={{ margin: '0 auto 0.5rem auto', opacity: 0.5 }} />
                    <div style={{ fontWeight: 600, color: '#4B5563' }}>Chưa có kết quả kiểm tra phù hợp</div>
                    <div style={{ fontSize: '0.82rem' }}>Hãy quét đơn hàng hoàn ở khung phía trên để bắt đầu kiểm tra KCS</div>
                  </td>
                </tr>
              ) : (
                inspections.map((insp) => {
                  const isPassed = insp.inspectionResult === 'PASSED';
                  const isEligibleForInbound = isPassed && !insp.inboundRequested;
                  const isSelected = selectedInspectionIds.includes(insp._id);

                  return (
                    <tr
                      key={insp._id}
                      style={{
                        borderBottom: '1px solid #F3F4F6',
                        background: isSelected ? '#EFF6FF' : '#FFFFFF',
                        transition: 'background 0.15s ease',
                      }}
                    >
                      {/* Checkbox */}
                      <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={!isEligibleForInbound}
                          onChange={() => handleToggleSelectInspection(insp._id)}
                          style={{ cursor: isEligibleForInbound ? 'pointer' : 'not-allowed' }}
                        />
                      </td>

                      {/* Mã KTH */}
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <div style={{ fontWeight: 800, color: 'var(--ara-noir)', fontFamily: 'monospace' }}>
                          {insp.inspectionCode}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#6B7280', marginTop: '2px' }}>
                          {new Date(insp.inspectedAt || insp.createdAt).toLocaleString('vi-VN', {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })}
                        </div>
                      </td>

                      {/* Mã đơn hàng / Vận đơn */}
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <div style={{ fontWeight: 700, color: '#1E3A8A' }}>{insp.orderCode}</div>
                        {insp.waybillCode && (
                          <div style={{ fontSize: '0.78rem', color: '#4B5563' }}>
                            Vận đơn: <span style={{ fontFamily: 'monospace' }}>{insp.waybillCode}</span>
                          </div>
                        )}
                        {insp.rmaCode && (
                          <div style={{ fontSize: '0.75rem', color: '#B45309' }}>
                            RMA: {insp.rmaCode}
                          </div>
                        )}
                      </td>

                      {/* Khách hàng */}
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <div style={{ fontWeight: 600, color: '#111827' }}>
                          {insp.customerName || 'Khách vãng lai'}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: '#6B7280' }}>
                          {insp.customerPhone || '-'}
                        </div>
                      </td>

                      {/* Sản phẩm */}
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#111827' }}>
                          {insp.items?.length || 0} sản phẩm (Tổng SL:{' '}
                          {insp.items?.reduce((acc, it) => acc + (Number(it.quantity) || 0), 0) || 0})
                        </div>
                        <div
                          style={{
                            fontSize: '0.75rem',
                            color: '#6B7280',
                            maxWidth: '220px',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {insp.items?.map((it) => `${it.productName} (${it.quantity})`).join(', ')}
                        </div>
                      </td>

                      {/* Kết quả */}
                      <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                        {isPassed ? (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                              padding: '0.25rem 0.65rem',
                              borderRadius: '20px',
                              fontSize: '0.78rem',
                              fontWeight: 800,
                              background: '#ECFDF5',
                              color: '#065F46',
                              border: '1px solid #A7F3D0',
                            }}
                          >
                            <CheckCircle2 size={13} /> ĐẠT
                          </span>
                        ) : (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                              padding: '0.25rem 0.65rem',
                              borderRadius: '20px',
                              fontSize: '0.78rem',
                              fontWeight: 800,
                              background: '#FEF2F2',
                              color: '#991B1B',
                              border: '1px solid #FECACA',
                            }}
                          >
                            <XCircle size={13} /> KHÔNG ĐẠT
                          </span>
                        )}
                      </td>

                      {/* Video & Ghi chú */}
                      <td style={{ padding: '0.85rem 1rem' }}>
                        {insp.videoUrl ? (
                          <a
                            href={insp.videoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.3rem',
                              fontSize: '0.78rem',
                              color: '#2563EB',
                              fontWeight: 600,
                              textDecoration: 'none',
                              marginBottom: '2px',
                            }}
                          >
                            <Video size={13} /> Xem video khui kiện <ExternalLink size={11} />
                          </a>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: '#9CA3AF' }}>Không có video</span>
                        )}

                        <div
                          style={{
                            fontSize: '0.76rem',
                            color: isPassed ? '#4B5563' : '#DC2626',
                            maxWidth: '200px',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                          title={insp.rejectReason || insp.qcNote || ''}
                        >
                          {insp.rejectReason ? `Lý do: ${insp.rejectReason}` : insp.qcNote || '-'}
                        </div>
                      </td>

                      {/* Trạng thái nhập kho hoàn */}
                      <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                        {isPassed ? (
                          insp.inboundRequested ? (
                            <div>
                              <span
                                style={{
                                  display: 'inline-block',
                                  padding: '0.2rem 0.6rem',
                                  borderRadius: '6px',
                                  fontSize: '0.75rem',
                                  fontWeight: 700,
                                  background: '#EFF6FF',
                                  color: '#1E40AF',
                                  border: '1px solid #BFDBFE',
                                }}
                              >
                                Đã tạo phiếu {insp.inboundTicketId?.ticketCode || 'nhập kho'}
                              </span>
                            </div>
                          ) : (
                            <div>
                              <span
                                style={{
                                  display: 'inline-block',
                                  padding: '0.2rem 0.6rem',
                                  borderRadius: '6px',
                                  fontSize: '0.75rem',
                                  fontWeight: 700,
                                  background: '#FFFBEB',
                                  color: '#B45309',
                                  border: '1px solid #FDE68A',
                                  marginBottom: '3px',
                                }}
                              >
                                Chờ nhập kho
                              </span>
                              <div>
                                <button
                                  type="button"
                                  disabled={requestingInbound}
                                  onClick={() => handleRequestInbound([insp._id])}
                                  style={{
                                    fontSize: '0.72rem',
                                    fontWeight: 700,
                                    color: '#059669',
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    textDecoration: 'underline',
                                    padding: 0,
                                  }}
                                >
                                  + Nhập kho ngay
                                </button>
                              </div>
                            </div>
                          )
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: '#9CA3AF' }}>Không nhập kho</span>
                        )}
                      </td>

                      {/* Thao tác */}
                      <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                        <button
                          type="button"
                          onClick={() => setViewingInspection(insp)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            padding: '0.4rem 0.75rem',
                            background: '#FFFFFF',
                            border: '1px solid #D1D5DB',
                            borderRadius: '6px',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            color: '#374151',
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

        {/* Phân trang */}
        {totalPages > 1 && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              alignItems: 'center',
              gap: '0.5rem',
              marginTop: '1.25rem',
            }}
          >
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              style={{
                padding: '0.4rem 0.8rem',
                borderRadius: '6px',
                border: '1px solid #D1D5DB',
                background: page <= 1 ? '#F3F4F6' : '#FFFFFF',
                cursor: page <= 1 ? 'not-allowed' : 'pointer',
                fontSize: '0.82rem',
              }}
            >
              Trang trước
            </button>
            <span style={{ fontSize: '0.85rem', color: '#4B5563' }}>
              Trang {page} / {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              style={{
                padding: '0.4rem 0.8rem',
                borderRadius: '6px',
                border: '1px solid #D1D5DB',
                background: page >= totalPages ? '#F3F4F6' : '#FFFFFF',
                cursor: page >= totalPages ? 'not-allowed' : 'pointer',
                fontSize: '0.82rem',
              }}
            >
              Trang sau
            </button>
          </div>
        )}
      </div>

      {/* MODAL XEM CHI TIẾT BIÊN BẢN KIỂM TRA */}
      {viewingInspection && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '1.5rem',
          }}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '16px',
              maxWidth: '750px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
              padding: '1.75rem',
            }}
          >
            {/* Header Modal */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '1px solid var(--ara-border)',
                paddingBottom: '1rem',
                marginBottom: '1.25rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '10px',
                    background: viewingInspection.inspectionResult === 'PASSED' ? '#ECFDF5' : '#FEF2F2',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: viewingInspection.inspectionResult === 'PASSED' ? '#059669' : '#DC2626',
                  }}
                >
                  {viewingInspection.inspectionResult === 'PASSED' ? (
                    <CheckCircle2 size={24} />
                  ) : (
                    <XCircle size={24} />
                  )}
                </div>
                <div>
                  <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0, color: '#111827' }}>
                    Biên bản KCS hàng hoàn: {viewingInspection.inspectionCode}
                  </h3>
                  <div style={{ fontSize: '0.82rem', color: '#6B7280' }}>
                    Ngày kiểm:{' '}
                    {new Date(viewingInspection.inspectedAt || viewingInspection.createdAt).toLocaleString('vi-VN')} |
                    KCS: {viewingInspection.inspectedByTechId?.fullName || 'Kỹ thuật viên'}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setViewingInspection(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: 0 }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Thông tin đơn */}
            <div
              style={{
                background: 'var(--ara-bg)',
                borderRadius: '10px',
                padding: '1rem',
                marginBottom: '1.25rem',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '0.75rem',
                fontSize: '0.85rem',
              }}
            >
              <div>
                <span style={{ color: '#6B7280' }}>Mã đơn hàng:</span>{' '}
                <strong>{viewingInspection.orderCode}</strong>
              </div>
              <div>
                <span style={{ color: '#6B7280' }}>Mã vận đơn:</span>{' '}
                <strong>{viewingInspection.waybillCode || '-'}</strong>
              </div>
              <div>
                <span style={{ color: '#6B7280' }}>Khách hàng:</span>{' '}
                <strong>{viewingInspection.customerName || '-'}</strong> ({viewingInspection.customerPhone || '-'})
              </div>
              <div>
                <span style={{ color: '#6B7280' }}>Kết luận:</span>{' '}
                <strong
                  style={{
                    color: viewingInspection.inspectionResult === 'PASSED' ? '#059669' : '#DC2626',
                  }}
                >
                  {viewingInspection.inspectionResult === 'PASSED'
                    ? 'ĐẠT (Hoàn thành công)'
                    : 'KHÔNG ĐẠT (Từ chối hoàn)'}
                </strong>
              </div>
            </div>

            {/* Video bằng chứng */}
            {viewingInspection.videoUrl && (
              <div
                style={{
                  background: '#EFF6FF',
                  borderRadius: '10px',
                  padding: '1rem',
                  marginBottom: '1.25rem',
                  border: '1px solid #BFDBFE',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <Video size={20} color="#2563EB" />
                  <div>
                    <div style={{ fontWeight: 700, color: '#1E40AF', fontSize: '0.9rem' }}>
                      Video ghi lại quá trình khui/kiểm hàng
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#3B82F6', wordBreak: 'break-all' }}>
                      {viewingInspection.videoUrl}
                    </div>
                  </div>
                </div>
                <a
                  href={viewingInspection.videoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                    padding: '0.45rem 0.85rem',
                    background: '#2563EB',
                    color: '#FFFFFF',
                    borderRadius: '6px',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    textDecoration: 'none',
                    flexShrink: 0,
                  }}
                >
                  Mở xem video <ExternalLink size={13} />
                </a>
              </div>
            )}

            {/* Lý do từ chối nếu có */}
            {viewingInspection.rejectReason && (
              <div
                style={{
                  background: '#FEF2F2',
                  borderRadius: '10px',
                  padding: '1rem',
                  marginBottom: '1.25rem',
                  border: '1px solid #FECACA',
                  color: '#991B1B',
                  fontSize: '0.88rem',
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>Lý do từ chối nhận hoàn:</div>
                <div>{viewingInspection.rejectReason}</div>
              </div>
            )}

            {/* Ghi chú KCS */}
            {viewingInspection.qcNote && (
              <div style={{ marginBottom: '1.25rem', fontSize: '0.88rem' }}>
                <div style={{ fontWeight: 700, color: '#374151', marginBottom: '0.25rem' }}>Ghi chú KCS:</div>
                <div
                  style={{
                    padding: '0.75rem',
                    background: '#F9FAFB',
                    borderRadius: '8px',
                    border: '1px solid #E5E7EB',
                    color: '#4B5563',
                  }}
                >
                  {viewingInspection.qcNote}
                </div>
              </div>
            )}

            {/* Danh sách sản phẩm kiểm tra */}
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ fontWeight: 700, color: '#111827', marginBottom: '0.5rem', fontSize: '0.95rem' }}>
                Chi tiết sản phẩm đã kiểm định ({viewingInspection.items?.length || 0} SKU):
              </div>
              <div style={{ border: '1px solid var(--ara-border)', borderRadius: '8px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: '#F9FAFB', borderBottom: '1px solid var(--ara-border)', color: '#4B5563' }}>
                      <th style={{ padding: '0.6rem 0.8rem' }}>Sản phẩm / SKU</th>
                      <th style={{ padding: '0.6rem 0.8rem' }}>Màu / Size</th>
                      <th style={{ padding: '0.6rem 0.8rem', textAlign: 'center' }}>SL</th>
                      <th style={{ padding: '0.6rem 0.8rem' }}>Tình trạng</th>
                      <th style={{ padding: '0.6rem 0.8rem', textAlign: 'center' }}>Đánh giá</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewingInspection.items?.map((it, idx) => {
                      const conditionLabel =
                        ITEM_CONDITIONS.find((c) => c.value === it.condition)?.label || it.condition;
                      return (
                        <tr key={idx} style={{ borderBottom: '1px solid #F3F4F6' }}>
                          <td style={{ padding: '0.6rem 0.8rem' }}>
                            <div style={{ fontWeight: 600 }}>{it.productName}</div>
                            <div style={{ fontSize: '0.75rem', color: '#6B7280', fontFamily: 'monospace' }}>
                              {it.skuCode}
                            </div>
                          </td>
                          <td style={{ padding: '0.6rem 0.8rem' }}>
                            {it.color || '-'} / {it.size || '-'}
                          </td>
                          <td style={{ padding: '0.6rem 0.8rem', textAlign: 'center', fontWeight: 700 }}>
                            {it.quantity}
                          </td>
                          <td style={{ padding: '0.6rem 0.8rem', fontSize: '0.8rem', color: '#4B5563' }}>
                            {conditionLabel}
                            {it.note && <div style={{ color: '#DC2626', fontSize: '0.75rem' }}>*{it.note}</div>}
                          </td>
                          <td style={{ padding: '0.6rem 0.8rem', textAlign: 'center' }}>
                            {it.passed !== false ? (
                              <span style={{ color: '#059669', fontWeight: 700 }}>Đạt</span>
                            ) : (
                              <span style={{ color: '#DC2626', fontWeight: 700 }}>Lỗi</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Trạng thái nhập kho */}
            {viewingInspection.inboundTicketId && (
              <div
                style={{
                  background: '#ECFDF5',
                  borderRadius: '10px',
                  padding: '1rem',
                  border: '1px solid #A7F3D0',
                  color: '#065F46',
                  fontSize: '0.85rem',
                  marginBottom: '1rem',
                }}
              >
                <strong>Đã tạo phiếu yêu cầu nhập kho hoàn:</strong>{' '}
                {viewingInspection.inboundTicketId.ticketCode || 'Phiếu nhập kho'} (Trạng thái:{' '}
                {viewingInspection.inboundTicketId.status || 'READY_TO_CONFIRM'})
              </div>
            )}

            {/* Modal Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setViewingInspection(null)}
                style={{
                  padding: '0.6rem 1.25rem',
                  borderRadius: '8px',
                  border: '1px solid #D1D5DB',
                  background: '#FFFFFF',
                  color: '#374151',
                  fontWeight: 600,
                  fontSize: '0.88rem',
                  cursor: 'pointer',
                }}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
