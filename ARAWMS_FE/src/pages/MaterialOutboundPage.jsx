/*
 * File: MaterialOutboundPage.jsx
 * Description: Raw material outbound workflow: Garment Technician request -> Warehouse Manager approves & assigns
 *              -> Warehouse Staff scans barcodes & records actual picked quantities -> Handover confirmation & atomic inventory deduction.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Package,
  Layers,
  CheckCircle2,
  AlertTriangle,
  Clock,
  UserCheck,
  Camera,
  Search,
  RefreshCw,
  Eye,
  X,
  Printer,
  ChevronRight,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';
import { materialOutboundService as api } from '../services/materialOutboundService';
import { MATERIAL_UNIT_OPTIONS } from '../utils/materialUnits';
import '../styles/materialOutbound.css';

const formatDate = (value) => (value ? new Date(value).toLocaleDateString('vi-VN') : '—');
const formatDateTime = (value) => (value ? new Date(value).toLocaleString('vi-VN') : '—');
const display = (value) => Number(value || 0).toLocaleString('vi-VN', { maximumFractionDigits: 3 });
const units = Object.fromEntries(MATERIAL_UNIT_OPTIONS.map(({ value, shortLabel }) => [value, shortLabel]));
const id = (value) => String(value?._id || value?.id || value || '');
const sum = (list) => Math.round(list.reduce((total, entry) => total + Number(entry.quantity || 0), 0) * 1000) / 1000;
const errorMessage = (error) => error?.response?.data?.message || error?.message || 'Không thể thực hiện thao tác.';

const playScanSound = (isSuccess) => {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (isSuccess) {
      // Crisp confirmation tone
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(1320, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.22);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.22);
    } else {
      // Low buzz error tone
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, ctx.currentTime);
      osc.frequency.setValueAtTime(150, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.38);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.38);
    }
  } catch {
    // AudioContext blocked or unsupported
  }
};

export const resolveRackName = (rackName, rackCode, line, locCode) => {
  const cleanName = String(rackName || '').trim();
  const cleanCode = String(rackCode || '').trim().toUpperCase();
  const cleanLoc = String(locCode || '').trim().toUpperCase();

  // If rackName is already a valid descriptive name (not equal to raw code)
  if (
    cleanName &&
    cleanName.toUpperCase() !== cleanCode &&
    cleanName.toUpperCase() !== cleanLoc &&
    cleanName.toUpperCase() !== `KỆ ${cleanCode}` &&
    cleanName.toUpperCase() !== `KE ${cleanCode}` &&
    !/^([A-Z0-9_-]+)$/.test(cleanName)
  ) {
    if (/^(vải|hộp|phụ liệu|chỉ|cuộn)/i.test(cleanName)) {
      return `Kệ ${cleanName.toLowerCase()}`;
    }
    return cleanName.startsWith('Kệ ') || cleanName.startsWith('kệ ') ? cleanName : `Kệ ${cleanName}`;
  }

  // Location code / rack code hints
  if (cleanLoc.includes('VAI') || cleanCode.includes('VAI')) return 'Kệ vải';
  if (cleanLoc.includes('HOP') || cleanCode.includes('HOP') || cleanCode.includes('PK')) return 'Kệ hộp';

  // Material type / unit hints
  const matType = line?.materialType;
  const unit = String(line?.unit || '').toUpperCase();
  const matName = String(line?.materialName || '').toLowerCase();

  if (matType === 'FABRIC' || unit === 'METER' || matName.includes('vải')) {
    return 'Kệ vải';
  }

  if (
    matType === 'AUXILIARY' ||
    ['SPOOL', 'PIECE', 'SET', 'BOX', 'BAG', 'CONE', 'KG'].includes(unit) ||
    matName.includes('cúc') ||
    matName.includes('chỉ') ||
    matName.includes('khóa') ||
    matName.includes('nút') ||
    matName.includes('chun') ||
    matName.includes('mác') ||
    matName.includes('nhãn')
  ) {
    return 'Kệ hộp';
  }

  return unit === 'METER' ? 'Kệ vải' : 'Kệ hộp';
};

export const formatSourceLocation = (source, line) => {
  const locCode = source?.locationCode || 'Kho NPL';
  const rack = resolveRackName(source?.rackName, source?.rackCode, line || source, locCode);
  const locationText = `${locCode}, ${rack}`;
  const matName = line?.materialName || source?.materialName || 'Nguyên phụ liệu';
  const qtyVal = display(source?.quantity != null ? source.quantity : source?.available);
  const unitStr = units[line?.unit] || line?.unit || '';
  const qtyText = unitStr ? `${qtyVal} ${unitStr}` : qtyVal;
  return {
    locationCode: locCode,
    rackName: rack,
    locationText,
    matName,
    qtyText,
    fullText: `${locationText}: ${matName} (${qtyText})`,
  };
};

export default function MaterialOutboundPage() {
  const [activeTab, setActiveTab] = useState('REQUESTS'); // 'REQUESTS' | 'STAFF_TASKS' | 'HISTORY'
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // Data lists
  const [requests, setRequests] = useState([]);
  const [staffTasks, setStaffTasks] = useState([]);
  const [historyTickets, setHistoryTickets] = useState([]);
  const [staffUsers, setStaffUsers] = useState([]);
  const [options, setOptions] = useState({ warehouses: [], locations: [], materials: [], sources: [] });

  // Filters
  const [filters, setFilters] = useState({ search: '', status: '', department: '' });

  // 1. Manager Approval State & Modal
  const [approvingRequest, setApprovingRequest] = useState(null);
  const [approvalLines, setApprovalLines] = useState([]);
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [sourceModalLineIndex, setSourceModalLineIndex] = useState(null);

  // 2. Staff Picking Task State & Modal
  const [pickingTask, setPickingTask] = useState(null);
  const [activeLineIndex, setActiveLineIndex] = useState(0);
  const [scannedBarcode, setScannedBarcode] = useState('');
  const [scanNotice, setScanNotice] = useState(null); // { type: 'error' | 'success', message: string, scannedCode: string }
  const barcodeInputRef = useRef(null);
  const [cameraActive, setCameraActive] = useState(false);
  const cameraRef = useRef(null);
  const videoRef = useRef(null);

  // Scan Quantity Prompt Modal
  const [scanPrompt, setScanPrompt] = useState(null); // { scanId, barcode, kind, objectId, locationId, locationCode, available, lineIndex, pickedQuantity }

  // Discrepancy / Shortage Report Modal
  const [shortageModalOpen, setShortageModalOpen] = useState(false);
  const [shortageReason, setShortageReason] = useState('');

  // Handover Confirmation Modal
  const [handoverModalOpen, setHandoverModalOpen] = useState(false);
  const [handoverRecipient, setHandoverRecipient] = useState('');
  const [handoverName, setHandoverName] = useState('');
  const [handoverReviewed, setHandoverReviewed] = useState(false);

  // Detail Modal (for viewing completed or in-progress tickets)
  const [viewingTicket, setViewingTicket] = useState(null);

  // Load all required data
  const refreshAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [reqRes, taskRes, histRes, staffRes, optRes] = await Promise.all([
        api.listRequests(),
        api.staffTasks(),
        api.list({ status: 'COMPLETED' }),
        api.staffUsers().catch(() => ({ data: [] })),
        api.options().catch(() => ({ data: { warehouses: [], locations: [], materials: [], sources: [] } })),
      ]);
      setRequests(reqRes.data || []);
      setStaffTasks(taskRes.data || []);
      setHistoryTickets(histRes.data || []);
      setStaffUsers(staffRes.data || []);
      setOptions(optRes.data || { warehouses: [], locations: [], materials: [], sources: [] });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshAll();
    const handleRealtime = () => {
      refreshAll();
    };
    window.addEventListener('arawms-material-outbound-realtime', handleRealtime);
    const interval = setInterval(() => {
      refreshAll();
    }, 10000);
    return () => {
      window.removeEventListener('arawms-material-outbound-realtime', handleRealtime);
      clearInterval(interval);
    };
  }, [refreshAll]);

  useEffect(() => {
    return () => {
      cameraRef.current?.stop?.();
    };
  }, []);

  // Filter requests
  const filteredRequests = useMemo(() => {
    return requests.filter((item) => {
      const text = `${item.ticketCode} ${item.recipient} ${item.department} ${(item.lines || [])
        .map((l) => `${l.materialCode} ${l.materialName}`)
        .join(' ')}`.toLocaleLowerCase('vi');
      return (
        (!filters.search || text.includes(filters.search.toLocaleLowerCase('vi'))) &&
        (!filters.status || item.status === filters.status) &&
        (!filters.department || item.department === filters.department)
      );
    });
  }, [requests, filters]);

  // Filter tasks
  const filteredTasks = useMemo(() => {
    return staffTasks.filter((item) => {
      const text = `${item.ticketCode} ${item.recipient} ${item.department} ${item.assignedStaffName}`.toLocaleLowerCase('vi');
      return (
        (!filters.search || text.includes(filters.search.toLocaleLowerCase('vi'))) &&
        (!filters.status || item.status === filters.status)
      );
    });
  }, [staffTasks, filters]);

  // Filter history
  const filteredHistory = useMemo(() => {
    return historyTickets.filter((item) => {
      const text = `${item.ticketCode} ${item.recipient} ${item.department} ${(item.lines || [])
        .map((l) => `${l.materialCode} ${l.materialName}`)
        .join(' ')}`.toLocaleLowerCase('vi');
      return (!filters.search || text.includes(filters.search.toLocaleLowerCase('vi')));
    });
  }, [historyTickets, filters]);

  // ==========================================
  // 1. Quản lý kho duyệt yêu cầu và giao việc
  // ==========================================
  const openApprovalModal = async (ticket) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const detailRes = await api.requestDetail(ticket._id);
      const ticketData = detailRes.data;
      setApprovingRequest(ticketData);
      setSelectedStaffId(ticketData.assignedStaffId?._id || ticketData.assignedStaffId || staffUsers[0]?._id || '');

      setApprovalLines(
        (ticketData.lines || []).map((line) => {
          const reqVal = Number(line.requestedQuantity || 0);
          const qtyVal = Number(line.quantity || 0);
          const reqQty = reqVal > 0 ? reqVal : (qtyVal > 0 ? qtyVal : 0);
          const issQty = Number(line.issuedQuantity || 0);
          const remQty = Math.max(0, reqQty - issQty);
          return {
            rawMaterialId: line.rawMaterialId,
            materialCode: line.materialCode,
            materialName: line.materialName,
            color: line.color,
            unit: line.unit,
            specification: line.specification,
            materialAvailable: line.materialAvailable,
            requestedQuantity: reqQty,
            issuedQuantity: issQty,
            remainingQuantity: remQty,
            approvedQuantity: line.approvedQuantity && line.approvedQuantity > 0 ? line.approvedQuantity : remQty,
            hasDesignatedSources: Boolean(line.hasDesignatedSources),
            designatedSources: line.designatedSources || [],
            fifoSugggestions: line.fifoSugggestions || [],
          };
        })
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleLineApprovedQtyChange = (index, val) => {
    const updated = [...approvalLines];
    updated[index].approvedQuantity = val;
    setApprovalLines(updated);
  };

  const handleToggleDesignated = (index, checked) => {
    const updated = [...approvalLines];
    updated[index].hasDesignatedSources = checked;
    if (!checked) {
      updated[index].designatedSources = [];
    }
    setApprovalLines(updated);
  };

  const handleApplyFifoToLine = (index) => {
    const updated = [...approvalLines];
    const line = updated[index];
    let remaining = Number(line.approvedQuantity);
    const selected = [];

    for (const source of line.fifoSugggestions || []) {
      const amount = Math.min(remaining, Number(source.available));
      if (amount > 0) {
        selected.push({
          kind: source.kind,
          objectId: source.objectId,
          barcode: source.barcode,
          locationId: source.locationId,
          locationCode: source.locationCode,
          rackName: source.rackName || resolveRackName(source.rackName, source.rackCode, line, source.locationCode),
          rackCode: source.rackCode || '',
          materialName: source.materialName || line.materialName || '',
          inboundTicketId: source.inboundTicketId,
          quantity: amount,
        });
        remaining = Math.round((remaining - amount) * 1000) / 1000;
      }
      if (remaining <= 0) break;
    }

    line.designatedSources = selected;
    line.hasDesignatedSources = true;
    setApprovalLines(updated);
    setMessage(`Đã áp dụng ${selected.length} nguồn theo thứ tự FIFO.`);
  };

  const submitApproveAndAssign = async () => {
    if (!selectedStaffId) {
      setError('Vui lòng chọn nhân viên kho thực hiện');
      return;
    }

    for (const line of approvalLines) {
      const qty = Number(line.approvedQuantity);
      if (!Number.isFinite(qty) || qty <= 0) {
        setError(`Số lượng duyệt cấp cho ${line.materialName} phải lớn hơn 0`);
        return;
      }
      if (qty > line.remainingQuantity) {
        setError(`Số lượng duyệt cấp (${qty}) vượt quá số lượng còn phải cấp (${line.remainingQuantity}) của ${line.materialName}`);
        return;
      }
    }

    setBusy(true);
    setError('');
    try {
      const payload = {
        assignedStaffId: selectedStaffId,
        lines: approvalLines.map((l) => ({
          rawMaterialId: l.rawMaterialId,
          materialCode: l.materialCode,
          approvedQuantity: Number(l.approvedQuantity),
          hasDesignatedSources: Boolean(l.hasDesignatedSources),
          designatedSources: l.hasDesignatedSources
            ? (l.designatedSources || []).map((s) => ({
                kind: s.kind || 'LOT',
                objectId: s.objectId,
                barcode: s.barcode,
                locationId: s.locationId,
                locationCode: s.locationCode,
                rackName: s.rackName,
                rackCode: s.rackCode,
                materialName: s.materialName,
                inboundTicketId: s.inboundTicketId || undefined,
                quantity: Number(s.quantity),
              }))
            : [],
        })),
      };

      await api.approveAndAssign(approvingRequest._id, payload);
      setMessage('Đã duyệt và giao việc cho nhân viên kho. Yêu cầu chuyển sang Chờ lấy hàng.');
      setApprovingRequest(null);
      refreshAll();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  // ==========================================
  // 2. Nhân viên kho xem việc & Bắt đầu lấy hàng
  // ==========================================
  const startOrContinuePicking = async (task) => {
    setBusy(true);
    setError('');
    setMessage('');
    setScanNotice(null);
    setScannedBarcode('');
    try {
      let taskData;
      if (task.status === 'WAITING_PICKING') {
        const startRes = await api.startPicking(task._id);
        taskData = startRes.data;
      } else {
        const detailRes = await api.requestDetail(task._id);
        taskData = detailRes.data;
      }

      setPickingTask(taskData);
      setActiveLineIndex(0);
      setHandoverRecipient(taskData.recipient || '');
      setHandoverName(taskData.recipient || '');
      setTimeout(() => barcodeInputRef.current?.focus(), 100);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  // Camera integration for barcode scanning
  const startCamera = async () => {
    setScanNotice(null);
    setError('');

    if (!navigator.mediaDevices?.getUserMedia) {
      const msg = 'Trình duyệt không hỗ trợ camera hoặc trang chưa được cấp quyền (cần localhost hoặc HTTPS).';
      setError(msg);
      setScanNotice({ type: 'error', message: msg, scannedCode: '' });
      playScanSound(false);
      return;
    }

    try {
      setCameraActive(true);
      const { BrowserMultiFormatReader, BarcodeFormat } = await import('@zxing/browser');
      const reader = new BrowserMultiFormatReader();
      reader.possibleFormats = [
        BarcodeFormat.CODE_128,
        BarcodeFormat.QR_CODE,
        BarcodeFormat.CODE_39,
        BarcodeFormat.EAN_13,
        BarcodeFormat.UPC_A,
      ];

      // Stop previous instance if any
      stopCamera();
      setCameraActive(true);

      // Brief pause to ensure the video element DOM is ready
      await new Promise((resolve) => setTimeout(resolve, 80));

      const videoElement = videoRef.current;
      if (!videoElement) {
        throw new Error('Không tìm thấy phần tử hiển thị video camera.');
      }

      const controls = await reader.decodeFromConstraints(
        {
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        },
        videoElement,
        (result) => {
          if (result && result.getText()) {
            const code = result.getText().trim();
            if (code) {
              stopCamera();
              handleScanBarcode(code);
            }
          }
        }
      );

      cameraRef.current = controls;
    } catch (failure) {
      stopCamera();
      const msg = `Không mở được camera: ${errorMessage(failure)}`;
      setError(msg);
      setScanNotice({
        type: 'error',
        message: msg,
        scannedCode: '',
      });
      playScanSound(false);
    }
  };

  const stopCamera = () => {
    try {
      if (cameraRef.current) {
        cameraRef.current.stop();
        cameraRef.current = null;
      }
      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject.getTracks().forEach((track) => track.stop());
        videoRef.current.srcObject = null;
      }
    } catch {
      // ignore
    }
    setCameraActive(false);
  };

  // Perform Barcode Scan
  const handleScanBarcode = async (barcodeToScan = scannedBarcode) => {
    const code = String(barcodeToScan || '').trim().toUpperCase();
    if (!code) {
      const msg = 'Vui lòng quét hoặc nhập mã barcode';
      setError(msg);
      playScanSound(false);
      barcodeInputRef.current?.focus();
      setTimeout(() => setError((prev) => (prev === msg ? '' : prev)), 4000);
      return;
    }
    if (!pickingTask) return;

    setBusy(true);
    setError('');
    setMessage('');
    try {
      const res = await api.scanBarcode(pickingTask._id, {
        lineIndex: activeLineIndex,
        barcode: code,
      });

      const scanResult = res.data;
      const currentLine = pickingTask?.lines?.[activeLineIndex] || {};
      const stillNeeded = currentLine.stillNeededToPick || 0;

      playScanSound(true);

      if (scanResult.alreadyRecorded) {
        // Re-scanning recorded barcode: open prompt to view or edit quantity; do NOT auto-increment!
        setScanPrompt({
          scanId: scanResult.scanId,
          barcode: scanResult.barcode,
          kind: scanResult.kind,
          objectId: scanResult.objectId,
          locationId: scanResult.locationId,
          locationCode: scanResult.locationCode,
          available: scanResult.available,
          existingQuantity: scanResult.existingQuantity,
          lineIndex: activeLineIndex,
          pickedQuantity: String(scanResult.existingQuantity),
          isEdit: true,
        });
      } else {
        // Genuine new scan: prompt for actual picked quantity
        const defaultQty = Math.min(stillNeeded, scanResult.available);
        setScanPrompt({
          scanId: scanResult.scanId,
          barcode: scanResult.barcode,
          kind: scanResult.kind,
          objectId: scanResult.objectId,
          locationId: scanResult.locationId,
          locationCode: scanResult.locationCode,
          available: scanResult.available,
          lineIndex: activeLineIndex,
          pickedQuantity: String(defaultQty > 0 ? defaultQty : ''),
          isEdit: false,
        });
      }

      setScannedBarcode('');
    } catch (err) {
      const msg = errorMessage(err);
      setError(msg);
      playScanSound(false);
      setTimeout(() => {
        barcodeInputRef.current?.focus();
        barcodeInputRef.current?.select();
      }, 60);
      setTimeout(() => {
        setError((prev) => (prev === msg ? '' : prev));
      }, 4000);
    } finally {
      setBusy(false);
    }
  };

  // Submit actual picked quantity from prompt
  const submitPickedQuantity = async () => {
    if (!scanPrompt) return;
    const qty = Number(scanPrompt.pickedQuantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      setError('Số lượng thực lấy phải lớn hơn 0');
      return;
    }
    if (qty > scanPrompt.available) {
      setError(`Số lượng thực lấy (${qty}) không được vượt quá tồn khả dụng (${scanPrompt.available}) của nguồn`);
      return;
    }

    setBusy(true);
    setError('');
    try {
      const res = await (api.recordPickedQuantity || api.recordQuantity)(pickingTask._id, {
        lineIndex: scanPrompt.lineIndex,
        scanId: scanPrompt.scanId,
        barcode: scanPrompt.barcode,
        pickedQuantity: qty,
        locationId: scanPrompt.locationId,
      });

      const promptCode = scanPrompt.barcode;
      const unitStr = units[res.data?.lines?.[scanPrompt.lineIndex]?.unit] || '';
      setPickingTask(res.data);
      setMessage(`Đã ghi nhận ${qty} ${unitStr} từ barcode ${promptCode}`);
      setScanPrompt(null);
      setScanNotice({
        type: 'success',
        message: `Đã ghi nhận ${qty} ${unitStr} từ tem ${promptCode}`,
        scannedCode: promptCode,
      });
      playScanSound(true);
      setTimeout(() => {
        barcodeInputRef.current?.focus();
      }, 80);
      refreshAll();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  // Remove a picked source
  const handleRemoveSource = async (lineIdx, source) => {
    if (!window.confirm(`Xóa nguồn ${source.barcode} (${source.locationCode || 'kệ'}) và bỏ số lượng khỏi tiến độ lấy hàng?`)) return;

    setBusy(true);
    setError('');
    try {
      const res = await api.removeSource(pickingTask._id, {
        lineIndex: lineIdx,
        scanId: source.scanId,
        barcode: source.barcode,
        locationId: source.locationId,
      });
      setPickingTask(res.data);
      setMessage(`Đã xóa lượt quét của nguồn ${source.barcode}`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  // Report Shortage / Discrepancy
  const submitShortageReport = async () => {
    if (!shortageReason.trim()) {
      setError('Vui lòng nêu rõ lý do thiếu hàng hoặc sai lệch tem barcode');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const res = await api.reportShortage(pickingTask._id, {
        lineIndex: activeLineIndex,
        reason: shortageReason.trim(),
      });
      setPickingTask(res.data);
      setShortageModalOpen(false);
      setShortageReason('');
      setMessage('Đã gửi báo thiếu / sai lệch. Yêu cầu chuyển sang Chờ xử lý sai lệch.');
      refreshAll();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  // Pause Picking Task
  const handlePausePicking = async () => {
    setBusy(true);
    setError('');
    try {
      await api.pause(pickingTask._id);
      setMessage('Đã tạm dừng và lưu tiến độ lấy hàng trên máy chủ.');
      setPickingTask(null);
      stopCamera();
      refreshAll();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  // Confirm Handover and Commit Outbound
  const submitConfirmHandover = async () => {
    if (!handoverReviewed) {
      setError('Vui lòng đánh dấu xác nhận đã bàn giao hàng thực tế');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const res = await api.confirmHandover(pickingTask._id, {
        recipient: handoverRecipient.trim(),
        handoverName: handoverName.trim(),
      });

      setMessage('Đã xác nhận bàn giao và xuất kho thành công. Tồn kho đã được cập nhật.');
      setHandoverModalOpen(false);
      setPickingTask(null);
      stopCamera();
      refreshAll();
      setActiveTab('HISTORY');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  // Manager: Resolve Shortage
  const handleResolveShortage = async (ticket, lineIdx, action) => {
    setBusy(true);
    setError('');
    try {
      await api.resolveShortage(ticket._id, {
        lineIndex: lineIdx,
        action,
      });
      setMessage('Đã cập nhật duyệt xuất thiếu cho dòng yêu cầu.');
      refreshAll();
      if (approvingRequest) {
        const detailRes = await api.requestDetail(ticket._id);
        setApprovingRequest(detailRes.data);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  // Check if all lines are ready for handover
  const isReadyForHandover = useMemo(() => {
    if (!pickingTask) return false;
    const lines = pickingTask.lines || [];
    if (lines.length === 0) return false;

    // Must not have unapproved shortages
    const hasUnapprovedShortage = lines.some((l) => l.shortageReport?.reported && !l.shortageReport?.approvedByManagerId);
    if (hasUnapprovedShortage) return false;

    // Every line must have pickedTotal equal to approvedQuantity (or >= approvedQuantity)
    return lines.every((line) => {
      const approved = Number(line.approvedQuantity || line.quantity || 0);
      const picked = Number(line.pickedTotal || 0);
      return (line.pickedSources || []).length > 0 && Math.abs(picked - approved) < 0.0001;
    });
  }, [pickingTask]);

  return (
    <div className="material-outbound-page">
      <div className="mo-breadcrumb">
        <Link to="/">Trang chủ</Link> / Kho nguyên phụ liệu / Xuất kho
      </div>

      <header className="mo-hero">
        <div>
          <h1>Xuất nguyên phụ liệu</h1>
          <p>Quy trình xuất kho: Garment gửi yêu cầu → Quản lý duyệt & giao việc → Nhân viên quét barcode → Bàn giao & trừ tồn.</p>
        </div>
        <div className="mo-actions">
          <button onClick={refreshAll} disabled={loading} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <RefreshCw size={16} className={loading ? 'spin' : ''} />
            Làm mới
          </button>
        </div>
      </header>

      {/* Toast Pop-up thông báo đơn giản */}
      {error && (
        <div
          role="alert"
          style={{
            position: 'fixed',
            top: 24,
            right: 24,
            zIndex: 10000,
            background: '#c5221f',
            color: '#FFFFFF',
            padding: '12px 18px',
            borderRadius: 8,
            boxShadow: '0 8px 28px rgba(0,0,0,0.25)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: 14,
            fontWeight: 500,
            maxWidth: 'min(460px, calc(100vw - 32px))',
            animation: 'moScanShake 0.35s ease-in-out',
          }}
        >
          <AlertCircle size={20} color="#fff" style={{ flexShrink: 0 }} />
          <span style={{ flex: 1 }}>{error}</span>
          <button
            type="button"
            onClick={() => setError('')}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#fff',
              fontSize: 20,
              cursor: 'pointer',
              padding: '0 4px',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
      )}

      {message && (
        <div
          role="status"
          style={{
            position: 'fixed',
            top: 24,
            right: 24,
            zIndex: 10000,
            background: '#137333',
            color: '#FFFFFF',
            padding: '12px 18px',
            borderRadius: 8,
            boxShadow: '0 8px 28px rgba(0,0,0,0.25)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: 14,
            fontWeight: 500,
            maxWidth: 'min(460px, calc(100vw - 32px))',
          }}
        >
          <CheckCircle2 size={20} color="#fff" style={{ flexShrink: 0 }} />
          <span style={{ flex: 1 }}>{message}</span>
          <button
            type="button"
            onClick={() => setMessage('')}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#fff',
              fontSize: 20,
              cursor: 'pointer',
              padding: '0 4px',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <nav className="mo-nav-tabs">
        <button
          className={`mo-tab-btn ${activeTab === 'REQUESTS' ? 'active' : ''}`}
          onClick={() => { setActiveTab('REQUESTS'); setError(''); setMessage(''); }}
        >
          <Layers size={17} style={{ verticalAlign: 'middle', marginRight: 6 }} />
          Duyệt & giao việc (Quản lý kho)
          <span className="mo-tab-count">{requests.filter((r) => ['WAITING_SCAN', 'WAITING_DISCREPANCY'].includes(r.status)).length}</span>
        </button>
        <button
          className={`mo-tab-btn ${activeTab === 'STAFF_TASKS' ? 'active' : ''}`}
          onClick={() => { setActiveTab('STAFF_TASKS'); setError(''); setMessage(''); }}
        >
          <Package size={17} style={{ verticalAlign: 'middle', marginRight: 6 }} />
          Yêu cầu xuất cần thực hiện (Nhân viên kho)
          <span className="mo-tab-count">{staffTasks.filter((t) => ['WAITING_PICKING', 'PICKING', 'WAITING_DISCREPANCY'].includes(t.status)).length}</span>
        </button>
        <button
          className={`mo-tab-btn ${activeTab === 'HISTORY' ? 'active' : ''}`}
          onClick={() => { setActiveTab('HISTORY'); setError(''); setMessage(''); }}
        >
          <Clock size={17} style={{ verticalAlign: 'middle', marginRight: 6 }} />
          Lịch sử phiếu xuất
          <span className="mo-tab-count">{historyTickets.length}</span>
        </button>
      </nav>

      {/* Filters bar */}
      <section className="mo-card mo-filters">
        <input
          aria-label="Tìm kiếm"
          placeholder="Tìm mã phiếu, người nhận, nguyên phụ liệu…"
          value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value })}
        />
        <select
          value={filters.status}
          onChange={(e) => setFilters({ ...filters, status: e.target.value })}
        >
          <option value="">Tất cả trạng thái</option>
          <option value="WAITING_SCAN">Chờ duyệt & giao việc</option>
          <option value="WAITING_PICKING">Chờ lấy hàng</option>
          <option value="PICKING">Đang xuất kho</option>
          <option value="WAITING_DISCREPANCY">Chờ xử lý sai lệch</option>
          <option value="COMPLETED">Hoàn thành</option>
        </select>
        <button onClick={() => setFilters({ search: '', status: '', department: '' })}>
          Xóa bộ lọc
        </button>
      </section>

      {/* ========================================================= */}
      {/* TAB 1: Quản lý kho duyệt yêu cầu và giao việc */}
      {/* ========================================================= */}
      {activeTab === 'REQUESTS' && (
        <section className="mo-card mo-list">
          <h2>Danh sách yêu cầu xuất kho từ Garment Technician</h2>
          {filteredRequests.length ? (
            <div className="mo-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Mã yêu cầu</th>
                    <th>Ngày yêu cầu</th>
                    <th>Bộ phận</th>
                    <th>Người gửi / Người nhận</th>
                    <th>Nguyên phụ liệu</th>
                    <th>Nhân viên thực hiện</th>
                    <th>Trạng thái</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRequests.map((item) => (
                    <tr key={item._id}>
                      <td><strong>{item.ticketCode}</strong></td>
                      <td>{formatDate(item.createdAt || item.issueDate)}</td>
                      <td>{item.department || 'XƯỞNG MAY'}</td>
                      <td>{item.recipient}</td>
                      <td>
                        {item.lines?.[0]?.materialName || '—'}
                        {(item.lines?.length || 0) > 1 && ` (+${item.lines.length - 1} mặt hàng)`}
                      </td>
                      <td>{item.assignedStaffName || '—'}</td>
                      <td>
                        <span className={`mo-status ${item.status?.toLowerCase()}`}>
                          {item.status === 'WAITING_SCAN' && 'Chờ duyệt & giao việc'}
                          {item.status === 'WAITING_PICKING' && 'Đã giao việc · Chờ lấy hàng'}
                          {item.status === 'PICKING' && 'Đang xuất kho'}
                          {item.status === 'WAITING_DISCREPANCY' && 'Chờ xử lý sai lệch'}
                          {item.status === 'COMPLETED' && 'Hoàn thành'}
                          {!['WAITING_SCAN', 'WAITING_PICKING', 'PICKING', 'WAITING_DISCREPANCY', 'COMPLETED'].includes(item.status) && item.status}
                        </span>
                      </td>
                      <td>
                        {['WAITING_SCAN', 'DRAFT', 'WAITING_DISCREPANCY'].includes(item.status) ? (
                          <button className="primary" onClick={() => openApprovalModal(item)}>
                            {item.status === 'WAITING_DISCREPANCY' ? 'Xử lý sai lệch' : 'Duyệt & giao việc'}
                          </button>
                        ) : (
                          <button onClick={async () => {
                            const res = await api.requestDetail(item._id);
                            setViewingTicket(res.data);
                          }}>
                            Xem chi tiết
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="mo-empty">Không có yêu cầu xuất kho nào.</div>
          )}
        </section>
      )}

      {/* ========================================================= */}
      {/* TAB 2: Yêu cầu xuất cần thực hiện (Nhân viên kho) */}
      {/* ========================================================= */}
      {activeTab === 'STAFF_TASKS' && (
        <section className="mo-card mo-list">
          <h2>Yêu cầu xuất cần thực hiện</h2>
          {filteredTasks.length ? (
            <div className="mo-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Mã yêu cầu</th>
                    <th>Bộ phận nhận</th>
                    <th>Người nhận</th>
                    <th>Thời điểm giao việc</th>
                    <th>Nhân viên được giao</th>
                    <th>Số dòng cần lấy</th>
                    <th>Trạng thái</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTasks.map((task) => (
                    <tr key={task._id}>
                      <td><strong>{task.ticketCode}</strong></td>
                      <td>{task.department}</td>
                      <td>{task.recipient}</td>
                      <td>{formatDateTime(task.assignedAt)}</td>
                      <td>{task.assignedStaffName}</td>
                      <td>{task.linesCount} dòng</td>
                      <td>
                        <span className={`mo-status ${task.status?.toLowerCase()}`}>
                          {task.status === 'WAITING_PICKING' && 'Chờ lấy hàng'}
                          {task.status === 'PICKING' && 'Đang xuất kho'}
                          {task.status === 'WAITING_DISCREPANCY' && 'Chờ xử lý sai lệch'}
                          {task.status === 'COMPLETED' && 'Hoàn thành'}
                        </span>
                      </td>
                      <td>
                        {task.status === 'WAITING_PICKING' && (
                          <button className="primary" onClick={() => startOrContinuePicking(task)}>
                            Bắt đầu lấy hàng
                          </button>
                        )}
                        {['PICKING', 'WAITING_DISCREPANCY'].includes(task.status) && (
                          <button className="primary" onClick={() => startOrContinuePicking(task)}>
                            Tiếp tục lấy hàng
                          </button>
                        )}
                        {task.status === 'COMPLETED' && (
                          <button onClick={async () => {
                            const res = await api.requestDetail(task._id);
                            setViewingTicket(res.data);
                          }}>
                            Xem chi tiết
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="mo-empty">Không có công việc xuất kho nào cần thực hiện.</div>
          )}
        </section>
      )}

      {/* ========================================================= */}
      {/* TAB 3: Lịch sử phiếu xuất kho */}
      {/* ========================================================= */}
      {activeTab === 'HISTORY' && (
        <section className="mo-card mo-list">
          <h2>Lịch sử phiếu xuất nguyên phụ liệu</h2>
          {filteredHistory.length ? (
            <div className="mo-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Mã phiếu</th>
                    <th>Ngày xuất</th>
                    <th>Bộ phận nhận</th>
                    <th>Người nhận</th>
                    <th>Mặt hàng</th>
                    <th>Người xác nhận</th>
                    <th>Trạng thái</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHistory.map((item) => (
                    <tr key={item._id}>
                      <td><strong>{item.ticketCode}</strong></td>
                      <td>{formatDate(item.confirmedAt || item.issueDate)}</td>
                      <td>{item.department}</td>
                      <td>{item.recipient}</td>
                      <td>
                        {item.lines?.[0]?.materialName || '—'}
                        {(item.lines?.length || 0) > 1 && ` (+${item.lines.length - 1} mặt hàng)`}
                      </td>
                      <td>{item.confirmedByUserId?.fullName || '—'}</td>
                      <td><span className="mo-status completed">Hoàn thành</span></td>
                      <td>
                        <button onClick={async () => {
                          const res = await api.requestDetail(item._id);
                          setViewingTicket(res.data);
                        }}>
                          Xem phiếu
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="mo-empty">Chưa có lịch sử phiếu xuất nguyên phụ liệu nào.</div>
          )}
        </section>
      )}

      {/* ========================================================= */}
      {/* MODAL 1: Quản lý kho duyệt yêu cầu và giao việc */}
      {/* ========================================================= */}
      {approvingRequest && (
        <div className="mo-overlay top" role="presentation">
          <div className="mo-modal" role="dialog" aria-modal="true">
            <header className="mo-modal-head">
              <div>
                <h2>Duyệt và giao việc xuất kho</h2>
                <span>Yêu cầu: <strong>{approvingRequest.ticketCode}</strong> · Bộ phận: <strong>{approvingRequest.department}</strong></span>
              </div>
              <button onClick={() => setApprovingRequest(null)}>×</button>
            </header>

            <div className="mo-modal-body">
              <p>Hệ thống tự động lấy thông tin từ yêu cầu của Kỹ thuật viên May. Chọn số lượng duyệt cấp lần này, giao nhân viên và tùy chọn chỉ định nguồn.</p>
              {error && <p role="alert" className="mo-error">{error}</p>}
              {message && <p className="mo-success">{message}</p>}

              {/* General Info */}
              <section className="mo-card">
                <h3>Thông tin yêu cầu</h3>
                <div className="mo-grid">
                  <div><strong>Mã yêu cầu:</strong> {approvingRequest.ticketCode}</div>
                  <div><strong>Bộ phận nhận:</strong> {approvingRequest.department}</div>
                  <div><strong>Người nhận / KCS:</strong> {approvingRequest.recipient}</div>
                  <div><strong>Mục đích:</strong> {approvingRequest.purpose || 'Cắt may sản xuất'}</div>
                  <div className="wide">
                    <label>
                      <strong>Giao cho nhân viên kho thực hiện *</strong>
                      <select
                        value={selectedStaffId}
                        onChange={(e) => setSelectedStaffId(e.target.value)}
                        style={{ marginTop: 6 }}
                      >
                        <option value="">-- Chọn nhân viên kho --</option>
                        {staffUsers.map((u) => (
                          <option key={u._id} value={u._id}>
                            {u.fullName} ({u.employeeCode}) - {u.roleCode}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>
              </section>

              {/* Lines approval table */}
              <section className="mo-card">
                <h3>Danh sách nguyên phụ liệu cần cấp</h3>
                <div className="mo-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Nguyên phụ liệu</th>
                        <th>Quy cách / Màu</th>
                        <th>ĐVT</th>
                        <th>Yêu cầu</th>
                        <th>Đã xuất</th>
                        <th>Còn phải cấp</th>
                        <th>Số lượng duyệt cấp lần này *</th>
                        <th>Phân bổ nguồn (Tùy chọn)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {approvalLines.map((line, index) => (
                        <tr key={id(line.rawMaterialId)}>
                          <td><strong>{line.materialName}</strong><small>{line.materialCode}</small></td>
                          <td>{line.specification || line.color || '—'}</td>
                          <td>{units[line.unit] || line.unit}</td>
                          <td>{display(line.requestedQuantity)}</td>
                          <td>{display(line.issuedQuantity)}</td>
                          <td><strong>{display(line.remainingQuantity)}</strong></td>
                          <td>
                            <input
                              type="number"
                              min="0.001"
                              max={line.remainingQuantity}
                              step="0.001"
                              value={line.approvedQuantity}
                              onChange={(e) => handleLineApprovedQtyChange(index, e.target.value)}
                              style={{ width: 110 }}
                            />
                          </td>
                          <td>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', marginBottom: 4 }}>
                              <input
                                type="checkbox"
                                checked={line.hasDesignatedSources}
                                onChange={(e) => handleToggleDesignated(index, e.target.checked)}
                              />
                              Chỉ định cây/lô cụ thể
                            </label>
                            {line.hasDesignatedSources && (
                              <div style={{ marginTop: 4 }}>
                                <button
                                  type="button"
                                  onClick={() => handleApplyFifoToLine(index)}
                                  style={{ padding: '4px 8px', fontSize: 12, marginRight: 6 }}
                                >
                                  Gợi ý FIFO ({line.fifoSugggestions?.length || 0})
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setSourceModalLineIndex(index)}
                                  style={{ padding: '4px 8px', fontSize: 12 }}
                                >
                                  Chọn nguồn ({line.designatedSources?.length || 0})
                                </button>
                                {line.designatedSources?.length > 0 && (
                                  <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    {line.designatedSources.map((s) => {
                                      const info = formatSourceLocation(s, line);
                                      return (
                                        <div
                                          key={`${s.barcode}-${s.locationId}`}
                                          style={{
                                            fontSize: 13,
                                            lineHeight: 1.4,
                                            padding: '4px 8px',
                                            background: '#fdfaf5',
                                            border: '1px solid #ebd9c8',
                                            borderRadius: 6,
                                            color: '#2a2521',
                                          }}
                                        >
                                          <strong>{info.locationText}</strong>: {info.matName} (<strong>{info.qtyText}</strong>)
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            )}
                            {!line.hasDesignatedSources && (
                              <small style={{ color: '#68727d' }}>Quét tự do cây/lô đúng mã & quy cách</small>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>

            <footer className="mo-modal-foot">
              <button onClick={() => setApprovingRequest(null)}>Đóng</button>
              <button className="primary" disabled={busy} onClick={submitApproveAndAssign}>
                {busy ? 'Đang xử lý…' : 'Duyệt và giao việc'}
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: Chỉ định nguồn (Cây vải / Lô phụ liệu) */}
      {/* ========================================================= */}
      {sourceModalLineIndex !== null && approvalLines[sourceModalLineIndex] && (
        <div className="mo-overlay top" role="presentation">
          <div className="mo-source-modal" role="dialog" aria-modal="true" style={{ maxWidth: 850 }}>
            <header>
              <h2>Chỉ định nguồn cụ thể · {approvalLines[sourceModalLineIndex].materialName}</h2>
              <button onClick={() => setSourceModalLineIndex(null)}>×</button>
            </header>
            <p>
              Số lượng duyệt cấp lần này: <strong>{display(approvalLines[sourceModalLineIndex].approvedQuantity)} {units[approvalLines[sourceModalLineIndex].unit] || approvalLines[sourceModalLineIndex].unit}</strong>.
              Chọn cây vải / lô phụ liệu và nhập số lượng cần lấy từ từng nguồn để chỉ định.
            </p>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '12px 0' }}>
              <button
                type="button"
                className="primary"
                onClick={() => handleApplyFifoToLine(sourceModalLineIndex)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                Tự động áp dụng gợi ý FIFO ({approvalLines[sourceModalLineIndex].fifoSugggestions?.length || 0} nguồn khả dụng)
              </button>
              <button
                type="button"
                onClick={() => {
                  const updated = [...approvalLines];
                  updated[sourceModalLineIndex].designatedSources = [];
                  updated[sourceModalLineIndex].hasDesignatedSources = false;
                  setApprovalLines(updated);
                }}
              >
                Xóa tất cả nguồn chỉ định
              </button>
            </div>

            <div className="mo-source-list" style={{ maxHeight: '52vh', overflowY: 'auto' }}>
              {(approvalLines[sourceModalLineIndex].fifoSugggestions || []).length > 0 ? (
                <table>
                  <thead>
                    <tr>
                      <th>Barcode</th>
                      <th>Loại</th>
                      <th>Vị trí kệ</th>
                      <th>Tồn khả dụng</th>
                      <th>Lượng chỉ định lấy</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(approvalLines[sourceModalLineIndex].fifoSugggestions || []).map((source) => {
                      const currentVal = approvalLines[sourceModalLineIndex].designatedSources.find(
                        (d) => (String(d.objectId) === String(source.objectId) || d.barcode === source.barcode) &&
                               String(d.locationId) === String(source.locationId)
                      )?.quantity ?? '';

                      return (
                        <tr key={`${source.objectId || source.barcode}-${source.locationId}`}>
                          <td><code>{source.barcode}</code></td>
                          <td>{source.kind === 'ROLL' ? 'Cây vải' : 'Lô phụ liệu'}</td>
                          <td>
                            <strong>{source.locationCode}</strong>
                            <div style={{ fontSize: 12, color: '#68727d' }}>
                              {resolveRackName(source.rackName, source.rackCode, approvalLines[sourceModalLineIndex], source.locationCode)}
                            </div>
                          </td>
                          <td>{display(source.available)} {units[approvalLines[sourceModalLineIndex].unit] || approvalLines[sourceModalLineIndex].unit}</td>
                          <td>
                            <input
                              type="number"
                              min="0"
                              max={source.available}
                              step="0.001"
                              placeholder="0"
                              value={currentVal}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                const updated = [...approvalLines];
                                const line = updated[sourceModalLineIndex];
                                let designated = [...line.designatedSources];
                                const existingIdx = designated.findIndex(
                                  (d) => (String(d.objectId) === String(source.objectId) || d.barcode === source.barcode) &&
                                         String(d.locationId) === String(source.locationId)
                                );

                                if (val > 0) {
                                  const item = {
                                    kind: source.kind,
                                    objectId: source.objectId,
                                    barcode: source.barcode,
                                    locationId: source.locationId,
                                    locationCode: source.locationCode,
                                    rackName: source.rackName || resolveRackName(source.rackName, source.rackCode, line, source.locationCode),
                                    rackCode: source.rackCode || '',
                                    materialName: source.materialName || line.materialName || '',
                                    inboundTicketId: source.inboundTicketId,
                                    quantity: val,
                                  };
                                  if (existingIdx >= 0) designated[existingIdx] = item;
                                  else designated.push(item);
                                } else {
                                  if (existingIdx >= 0) designated.splice(existingIdx, 1);
                                }
                                line.designatedSources = designated;
                                line.hasDesignatedSources = designated.length > 0;
                                setApprovalLines(updated);
                              }}
                              style={{ width: 110 }}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="mo-empty" style={{ padding: 24 }}>
                  Chưa có cây/lô nào khả dụng cho nguyên phụ liệu này trong kho. Nhân viên có thể quét tự do khi có hàng.
                </div>
              )}
            </div>

            <footer>
              <div>
                Đã chọn: <strong>{display(sum(approvalLines[sourceModalLineIndex].designatedSources))}</strong> / {display(approvalLines[sourceModalLineIndex].approvedQuantity)} {units[approvalLines[sourceModalLineIndex].unit]}
              </div>
              <div>
                <button className="primary" onClick={() => setSourceModalLineIndex(null)}>
                  Xong & Lưu lựa chọn
                </button>
              </div>
            </footer>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL / VIEW 2: Nhân viên kho quét barcode & lấy hàng */}
      {/* ========================================================= */}
      {pickingTask && (
        <div className="mo-overlay top" role="presentation">
          <div className="mo-modal" role="dialog" aria-modal="true" style={{ maxWidth: 1350 }}>
            <header className="mo-modal-head">
              <div>
                <h2>Lấy hàng và quét barcode xuất kho</h2>
                <span>Yêu cầu: <strong>{pickingTask.ticketCode}</strong> · Trạng thái: <strong className={`mo-status ${pickingTask.status?.toLowerCase()}`}>
                  {pickingTask.status === 'WAITING_PICKING' && 'Chờ lấy hàng'}
                  {pickingTask.status === 'PICKING' && 'Đang xuất kho'}
                  {pickingTask.status === 'WAITING_DISCREPANCY' && 'Chờ xử lý sai lệch'}
                  {pickingTask.status === 'COMPLETED' && 'Hoàn thành'}
                  {!['WAITING_PICKING', 'PICKING', 'WAITING_DISCREPANCY', 'COMPLETED'].includes(pickingTask.status) && pickingTask.status}
                </strong></span>
              </div>
              <button onClick={() => { setPickingTask(null); stopCamera(); }}>×</button>
            </header>

            <div className="mo-modal-body">
              {error && <p role="alert" className="mo-error">{error}</p>}
              {message && <p className="mo-success">{message}</p>}

              {/* Task general info */}
              <section className="mo-card" style={{ padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                  <div><strong>Bộ phận nhận:</strong> {pickingTask.department}</div>
                  <div><strong>Người nhận:</strong> {pickingTask.recipient}</div>
                  <div><strong>Người giao việc:</strong> {pickingTask.assignedStaffName || 'Quản lý kho'}</div>
                  <div><strong>Thời điểm:</strong> {formatDateTime(pickingTask.assignedAt)}</div>
                </div>
              </section>

              {/* Line items progress */}
              <section className="mo-card">
                <h3>Các dòng nguyên phụ liệu cần lấy</h3>
                <div className="mo-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>STT</th>
                        <th>Nguyên phụ liệu</th>
                        <th>Cần lấy lần này</th>
                        <th>Nguồn & Vị trí lấy</th>
                        <th>Đã ghi nhận</th>
                        <th>Còn phải lấy</th>
                        <th>Nguồn đã quét thực tế</th>
                        <th>Chọn quét</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(pickingTask.lines || []).map((line, idx) => (
                        <tr
                          key={id(line.rawMaterialId)}
                          style={{ background: activeLineIndex === idx ? '#fdfaf5' : 'transparent' }}
                        >
                          <td>{idx + 1}</td>
                          <td>
                            <strong>{line.materialName}</strong>
                            <small>{line.materialCode} · {line.specification || line.color || '—'}</small>
                          </td>
                          <td><strong>{display(line.approvedQuantity)}</strong> {units[line.unit] || line.unit}</td>
                          <td>
                            {line.hasDesignatedSources && line.designatedSources?.length > 0 ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <small style={{ color: '#b06000', fontWeight: 600 }}>Chỉ định bắt buộc:</small>
                                {line.designatedSources.map((ds) => {
                                  const info = formatSourceLocation(ds, line);
                                  return (
                                    <div key={`${ds.barcode}-${ds.locationId}`} style={{ fontSize: 13, lineHeight: 1.4 }}>
                                      • <strong>{info.locationText}</strong>: {info.matName} ({info.qtyText})
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <small style={{ color: '#2b7042', fontWeight: 600 }}>Gợi ý FIFO:</small>
                                {(line.fifoSugggestions || []).slice(0, 3).map((fs) => {
                                  const info = formatSourceLocation(fs, line);
                                  return (
                                    <div key={`${fs.barcode}-${fs.locationId}`} style={{ fontSize: 13, lineHeight: 1.4 }}>
                                      • <strong>{info.locationText}</strong>: {info.matName} ({info.qtyText})
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </td>
                          <td><strong style={{ color: '#2b7042' }}>{display(line.pickedTotal)}</strong> {units[line.unit]}</td>
                          <td>
                            <strong style={{ color: line.stillNeededToPick > 0 ? '#b06000' : '#2b7042' }}>
                              {display(line.stillNeededToPick)} {units[line.unit]}
                            </strong>
                          </td>
                          <td>
                            {(line.pickedSources || []).length > 0 ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {line.pickedSources.map((ps) => {
                                  const info = formatSourceLocation(ps, line);
                                  return (
                                    <span
                                      key={`${ps.barcode}-${ps.locationId || ''}-${ps.scanId || ''}`}
                                      className="mo-pill"
                                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                                    >
                                      <span><strong>{info.locationText}</strong>: {info.matName} ({info.qtyText})</span>
                                      <button
                                        type="button"
                                        className="mo-pill-remove"
                                        title="Xóa nguồn này"
                                        onClick={() => handleRemoveSource(idx, ps)}
                                      >
                                        ×
                                      </button>
                                    </span>
                                  );
                                })}
                              </div>
                            ) : (
                              <small style={{ color: '#999' }}>Chưa có lượt quét nào</small>
                            )}
                          </td>
                          <td>
                            <button
                              className={activeLineIndex === idx ? 'primary' : ''}
                              onClick={() => {
                                setActiveLineIndex(idx);
                                setError('');
                                setMessage('');
                                setScanNotice(null);
                                setTimeout(() => barcodeInputRef.current?.focus(), 50);
                              }}
                            >
                              {activeLineIndex === idx ? 'Đang quét' : 'Chọn quét'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* Barcode Scanner Box */}
              <section className="mo-card mo-scan-box">
                <div style={{ marginBottom: 12 }}>
                  <h3 style={{ margin: 0, fontSize: 18 }}>
                    Quét barcode cho dòng: <strong>{pickingTask.lines[activeLineIndex]?.materialName}</strong>
                  </h3>
                  <small>Cần lấy: {display(pickingTask.lines[activeLineIndex]?.approvedQuantity)} · Còn thiếu: {display(pickingTask.lines[activeLineIndex]?.stillNeededToPick)} {units[pickingTask.lines[activeLineIndex]?.unit]}</small>
                </div>

                {/* Standard Warehouse Camera (Identical to WarehousePutawayPage & MaterialPutawayPanel) */}
                <div className="putaway-camera">
                  <video ref={videoRef} muted playsInline autoPlay className={cameraActive ? '' : 'hidden'} />
                  <div className="putaway-camera-top">
                    <span>CAMERA QUÉT MÃ</span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={cameraActive ? stopCamera : startCamera}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                      <Camera size={14} />
                      {cameraActive ? 'Tắt camera' : 'Mở camera'}
                    </button>
                  </div>
                  <div className="putaway-reticle" aria-hidden="true" />
                  <p>
                    {cameraActive
                      ? 'Hướng camera vào tem barcode cây vải hoặc lô phụ liệu.'
                      : 'Camera chưa mở · Có thể dùng máy quét cầm tay hoặc bấm Mở camera bên trên.'}
                  </p>
                </div>

                <div className="mo-scan-input-row">
                  <input
                    ref={barcodeInputRef}
                    placeholder="Quét mã barcode tem cây vải hoặc lô phụ liệu…"
                    value={scannedBarcode}
                    onChange={(e) => {
                      setScannedBarcode(e.target.value);
                      if (scanNotice) setScanNotice(null);
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && handleScanBarcode()}
                    style={{
                      flex: 1,
                      borderColor: scanNotice?.type === 'error' ? '#cf1322' : undefined,
                      borderWidth: scanNotice?.type === 'error' ? 2 : 1,
                      boxShadow: scanNotice?.type === 'error' ? '0 0 0 3px rgba(207, 19, 34, 0.15)' : undefined,
                    }}
                  />
                  <button className="primary" disabled={busy} onClick={() => handleScanBarcode()}>
                    Xác nhận mã quét
                  </button>
                </div>
                <small style={{ display: 'block', marginTop: 8, color: '#776e63' }}>
                  * Bắt buộc quét barcode thực tế. Không cho phép gõ chọn thủ công. Nếu tem rách hoặc lỗi máy quét, hãy bấm "Báo thiếu / sai lệch".
                </small>
              </section>
            </div>

            <footer className="mo-modal-foot">
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" onClick={() => setShortageModalOpen(true)}>
                  Báo thiếu / sai lệch
                </button>
                <button type="button" onClick={handlePausePicking}>
                  Tạm dừng (Lưu tiến độ)
                </button>
              </div>

              <div>
                <button onClick={() => { setPickingTask(null); stopCamera(); }}>Đóng</button>
                <button
                  className="primary"
                  disabled={!isReadyForHandover || busy}
                  onClick={() => setHandoverModalOpen(true)}
                >
                  Xác nhận bàn giao và xuất kho
                </button>
              </div>
            </footer>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* PROMPT MODAL: Nhập số lượng thực lấy sau khi quét barcode */}
      {/* ========================================================= */}
      {scanPrompt && (
        <div className="mo-overlay top" role="presentation">
          <div className="mo-prompt-card" role="dialog" aria-modal="true">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <CheckCircle2 color="#2b7042" size={24} />
              Xác nhận số lượng thực lấy
            </h3>
            {error && (
              <p role="alert" className="mo-error" style={{ margin: '8px 0 12px', padding: '8px 12px', fontSize: 13 }}>
                {error}
              </p>
            )}
            <p>
              Barcode: <strong>{scanPrompt.barcode}</strong> ({scanPrompt.kind === 'ROLL' ? 'Cây vải' : 'Lô phụ liệu'})<br />
              Vị trí: <strong>{formatSourceLocation(scanPrompt, pickingTask?.lines?.[scanPrompt.lineIndex]).locationText}</strong> · Khả dụng: <strong>{display(scanPrompt.available)}</strong>
            </p>

            <label style={{ display: 'grid', gap: 6 }}>
              <span>Nhập số lượng thực lấy từ cây/lô này:</span>
              <input
                type="number"
                min="0.001"
                max={scanPrompt.available}
                step="0.001"
                autoFocus
                value={scanPrompt.pickedQuantity}
                onChange={(e) => setScanPrompt({ ...scanPrompt, pickedQuantity: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && submitPickedQuantity()}
              />
            </label>

            <div className="mo-prompt-actions">
              <button onClick={() => setScanPrompt(null)}>Hủy bỏ</button>
              <button className="primary" disabled={busy} onClick={submitPickedQuantity}>
                Lưu số lượng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: Báo thiếu / sai lệch */}
      {/* ========================================================= */}
      {shortageModalOpen && (
        <div className="mo-overlay top" role="presentation">
          <div className="mo-prompt-card" role="dialog" aria-modal="true">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#c5221f' }}>
              <AlertTriangle color="#c5221f" size={24} />
              Báo thiếu / sai lệch tem hàng
            </h3>
            <p>Nêu rõ lý do thiếu hàng, cây vải hỏng tem hoặc không đủ số lượng để Quản lý kho xem xét duyệt lại:</p>

            <textarea
              rows={4}
              placeholder="Nhập lý do thiếu / sai lệch…"
              value={shortageReason}
              onChange={(e) => setShortageReason(e.target.value)}
              style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #d8c9b7' }}
            />

            <div className="mo-prompt-actions">
              <button onClick={() => setShortageModalOpen(false)}>Hủy</button>
              <button className="primary" disabled={busy} onClick={submitShortageReport}>
                Gửi báo cáo sai lệch
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: Xác nhận bàn giao và xuất kho */}
      {/* ========================================================= */}
      {handoverModalOpen && pickingTask && (
        <div className="mo-overlay top" role="presentation">
          <div className="mo-modal" role="dialog" aria-modal="true" style={{ maxWidth: 850 }}>
            <header className="mo-modal-head">
              <h2>Xác nhận bàn giao và xuất kho</h2>
              <button onClick={() => setHandoverModalOpen(false)}>×</button>
            </header>

            <div className="mo-modal-body">
              <p>Kiểm tra kỹ thông tin người nhận và danh sách các cây/lô đã quét thực tế trước khi xuất kho chính thức.</p>

              <section className="mo-card">
                <h3>Thông tin bàn giao</h3>
                <div className="mo-grid">
                  <label>
                    Bộ phận nhận
                    <input disabled value={pickingTask.department} />
                  </label>
                  <label>
                    Người nhận thực tế *
                    <input
                      value={handoverRecipient}
                      onChange={(e) => setHandoverRecipient(e.target.value)}
                    />
                  </label>
                </div>
              </section>

              <section className="mo-card">
                <h3>Danh sách cây/lô xuất kho thực tế</h3>
                <div className="mo-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Mặt hàng</th>
                        <th>Mã Barcode</th>
                        <th>Vị trí kệ</th>
                        <th>Số lượng xuất</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(pickingTask.lines || []).flatMap((line) =>
                        (line.pickedSources || []).map((source) => (
                          <tr key={`${line.rawMaterialId}-${source.barcode}-${source.locationId || ''}-${source.scanId || ''}`}>
                            <td><strong>{line.materialName}</strong></td>
                            <td><code>{source.barcode}</code></td>
                            <td>
                              <strong>{source.locationCode}</strong>
                              <div style={{ fontSize: 12, color: '#68727d' }}>
                                {resolveRackName(source.rackName, source.rackCode, line, source.locationCode)}
                              </div>
                            </td>
                            <td><strong>{display(source.quantity)} {units[line.unit]}</strong></td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={handoverReviewed}
                  onChange={(e) => setHandoverReviewed(e.target.checked)}
                />
                Tôi đã kiểm tra đối chiếu đầy đủ hàng thực lấy, người nhận và tem barcode hợp lệ.
              </label>
            </div>

            <footer className="mo-modal-foot">
              <button onClick={() => setHandoverModalOpen(false)}>Quay lại kiểm tra</button>
              <button
                className="primary"
                disabled={!handoverReviewed || busy}
                onClick={submitConfirmHandover}
              >
                {busy ? 'Đang cập nhật tồn…' : 'Xác nhận xuất kho và cập nhật tồn kho'}
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: Xem chi tiết phiếu xuất (Chế độ xem / In ấn) */}
      {/* ========================================================= */}
      {viewingTicket && (
        <div className="mo-overlay top" role="presentation">
          <div className="mo-modal" role="dialog" aria-modal="true" style={{ maxWidth: 980 }}>
            <header className="mo-modal-head">
              <div>
                <h2>Chi tiết phiếu xuất kho · {viewingTicket.ticketCode}</h2>
                <span className={`mo-status ${viewingTicket.status?.toLowerCase()}`}>
                  {viewingTicket.status === 'COMPLETED' ? 'Đã xuất' : viewingTicket.status}
                </span>
              </div>
              <button onClick={() => setViewingTicket(null)}>×</button>
            </header>

            <div className="mo-modal-body">
              <section className="mo-card">
                <div className="mo-grid">
                  <div><strong>Mã phiếu:</strong> {viewingTicket.ticketCode}</div>
                  <div><strong>Bộ phận nhận:</strong> {viewingTicket.department}</div>
                  <div><strong>Người nhận:</strong> {viewingTicket.recipient}</div>
                  <div><strong>Ngày xuất:</strong> {formatDateTime(viewingTicket.confirmedAt || viewingTicket.issueDate)}</div>
                  <div><strong>Nhân viên thực hiện:</strong> {viewingTicket.assignedStaffName || viewingTicket.assignedStaffId?.fullName || '—'}</div>
                  <div><strong>Người xác nhận:</strong> {viewingTicket.confirmedByUserId?.fullName || '—'}</div>
                </div>
              </section>

              <section className="mo-card">
                <h3>Các mặt hàng và nguồn xuất</h3>
                <div className="mo-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Nguyên phụ liệu</th>
                        <th>Quy cách / Màu</th>
                        <th>ĐVT</th>
                        <th>Số lượng xuất</th>
                        <th>Chi tiết nguồn barcode</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(viewingTicket.lines || []).map((line) => (
                        <tr key={id(line.rawMaterialId)}>
                          <td><strong>{line.materialName}</strong><small>{line.materialCode}</small></td>
                          <td>{line.specification || line.color || '—'}</td>
                          <td>{units[line.unit] || line.unit}</td>
                          <td><strong>{display(line.quantity || line.issuedQuantity)}</strong></td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {(line.sources || line.pickedSources || []).map((s) => {
                                const info = formatSourceLocation(s, line);
                                return (
                                  <div
                                    key={`${s.barcode}-${s.locationId || ''}-${s.scanId || ''}`}
                                    style={{
                                      fontSize: 13,
                                      lineHeight: 1.4,
                                      padding: '3px 8px',
                                      background: '#fdfaf5',
                                      border: '1px solid #ebd9c8',
                                      borderRadius: 6,
                                      color: '#2a2521',
                                    }}
                                  >
                                    <strong>{info.locationText}</strong>: {info.matName} (<strong>{info.qtyText}</strong>)
                                  </div>
                                );
                              })}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>

            <footer className="mo-modal-foot">
              <button onClick={() => setViewingTicket(null)}>Đóng</button>
              <button className="primary" onClick={() => window.print()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Printer size={16} />
                In phiếu xuất
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
