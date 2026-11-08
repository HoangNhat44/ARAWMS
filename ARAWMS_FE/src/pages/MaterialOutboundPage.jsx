/*
 * File: MaterialOutboundPage.jsx
 * Description: Raw material outbound workflow: Garment Technician request -> Warehouse Manager approves & assigns
 *              -> Warehouse Staff scans barcodes & records actual picked quantities -> Handover confirmation & atomic inventory deduction.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { productService } from '../services/productService';
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
  Shirt,
  Trash2,
  Barcode,
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

export default function MaterialOutboundPage({ isStaffMode = false }) {
  const location = useLocation();
  const isStaff = isStaffMode || location.pathname.includes('/staff');
  const [activeTab, setActiveTab] = useState(isStaff ? 'STAFF_TASKS' : 'REQUESTS');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // Data lists
  const [requests, setRequests] = useState([]);
  const [staffTasks, setStaffTasks] = useState([]);
  const [finishedOutboundDocs, setFinishedOutboundDocs] = useState([]);
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

  // 3. Staff Finished Goods Outbound Picking State & Modal
  const [fgPickingDoc, setFgPickingDoc] = useState(null);
  const [fgDetailDoc, setFgDetailDoc] = useState(null);
  const [fgScannedBarcode, setFgScannedBarcode] = useState('');
  const [fgScanNotice, setFgScanNotice] = useState(null); // { type: 'error' | 'success', message: string, scannedCode: string }
  const [fgCameraActive, setFgCameraActive] = useState(false);
  const [fgBusy, setFgBusy] = useState(false);
  const [fgFilterStatus, setFgFilterStatus] = useState('ALL');
  const fgCameraRef = useRef(null);
  const fgVideoRef = useRef(null);
  const fgBarcodeInputRef = useRef(null);

  // Sync tab with role mode
  useEffect(() => {
    if (isStaff && activeTab === 'REQUESTS') {
      setActiveTab('STAFF_TASKS');
    } else if (!isStaff && ['STAFF_TASKS', 'FINISHED_OUTBOUND'].includes(activeTab)) {
      setActiveTab('REQUESTS');
    }
  }, [isStaff]);

  // Load all required data
  const refreshAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [reqRes, taskRes, histRes, staffRes, optRes, fgOutRes] = await Promise.all([
        api.listRequests(),
        api.staffTasks(),
        api.list({ status: 'COMPLETED' }),
        api.staffUsers().catch(() => ({ data: [] })),
        api.options().catch(() => ({ data: { warehouses: [], locations: [], materials: [], sources: [] } })),
        productService.outboundDocuments().catch(() => ({ data: { documents: [] } })),
      ]);
      setRequests(reqRes.data || []);
      setStaffTasks(taskRes.data || []);
      setHistoryTickets(histRes.data || []);
      setStaffUsers(staffRes.data || []);
      setOptions(optRes.data || { warehouses: [], locations: [], materials: [], sources: [] });
      setFinishedOutboundDocs(fgOutRes.data?.documents || []);
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
    window.addEventListener('arawms-finished-goods-realtime', handleRealtime);
    window.addEventListener('arawms-finished-goods-synced', handleRealtime);
    const interval = setInterval(() => {
      refreshAll();
    }, 10000);
    return () => {
      window.removeEventListener('arawms-material-outbound-realtime', handleRealtime);
      window.removeEventListener('arawms-finished-goods-realtime', handleRealtime);
      window.removeEventListener('arawms-finished-goods-synced', handleRealtime);
      clearInterval(interval);
    };
  }, [refreshAll]);

  useEffect(() => {
    return () => {
      cameraRef.current?.stop?.();
      fgCameraRef.current?.stop?.();
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

  // Filter finished goods outbound documents
  const filteredFinishedOutboundDocs = useMemo(() => {
    return finishedOutboundDocs.filter((doc) => {
      const docStatus = doc.status || 'WAITING_PICKING';
      if (fgFilterStatus !== 'ALL' && docStatus !== fgFilterStatus) return false;
      if (!filters.search) return true;
      const q = filters.search.toLowerCase();
      const code = (doc.documentCode || doc.code || '').toLowerCase();
      const recipient = (doc.recipient || doc.purpose || '').toLowerCase();
      const itemsMatch = (doc.items || []).some((it) =>
        (it.productName || '').toLowerCase().includes(q) || (it.skuCode || '').toLowerCase().includes(q)
      );
      return code.includes(q) || recipient.includes(q) || itemsMatch;
    });
  }, [finishedOutboundDocs, fgFilterStatus, filters.search]);

  // List of all scanned items in the active picking session
  const fgAllScannedList = useMemo(() => {
    if (!fgPickingDoc) return [];
    const list = [];
    for (const item of fgPickingDoc.items || []) {
      for (const bc of item.scannedBarcodes || []) {
        list.push({
          barcode: bc,
          skuCode: item.skuCode,
          skuId: item.skuId,
          productName: item.productName,
        });
      }
    }
    return list.reverse();
  }, [fgPickingDoc]);

  const stopFgCamera = () => {
    try {
      if (fgCameraRef.current) {
        fgCameraRef.current.stop();
        fgCameraRef.current = null;
      }
      if (fgVideoRef.current?.srcObject) {
        fgVideoRef.current.srcObject.getTracks().forEach((track) => track.stop());
        fgVideoRef.current.srcObject = null;
      }
    } catch {
      // ignore
    }
    setFgCameraActive(false);
  };

  const startFgCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      const msg = 'Trình duyệt không hỗ trợ camera hoặc chưa cấp quyền (cần HTTPS/localhost).';
      setError(msg);
      setFgScanNotice({ type: 'error', message: msg, scannedCode: '' });
      playScanSound(false);
      return;
    }
    try {
      stopFgCamera();
      setFgCameraActive(true);
      await new Promise((resolve) => setTimeout(resolve, 80));
      const videoElement = fgVideoRef.current;
      if (!videoElement) {
        throw new Error('Không tìm thấy phần tử hiển thị video camera.');
      }
      const { BrowserMultiFormatReader, BarcodeFormat } = await import('@zxing/browser');
      const reader = new BrowserMultiFormatReader();
      reader.possibleFormats = [
        BarcodeFormat.CODE_128,
        BarcodeFormat.QR_CODE,
        BarcodeFormat.CODE_39,
        BarcodeFormat.EAN_13,
        BarcodeFormat.UPC_A,
      ];
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
              stopFgCamera();
              handleFgScanBarcode(code);
            }
          }
        }
      );
      fgCameraRef.current = controls;
    } catch (failure) {
      stopFgCamera();
      const msg = `Không mở được camera: ${errorMessage(failure)}`;
      setError(msg);
      setFgScanNotice({ type: 'error', message: msg, scannedCode: '' });
      playScanSound(false);
    }
  };

  const handleFgScanBarcode = async (barcodeToScan = fgScannedBarcode) => {
    const code = String(barcodeToScan || '').trim().toUpperCase();
    if (!code) {
      const msg = 'Vui lòng quét hoặc nhập mã barcode';
      setFgScanNotice({ type: 'error', message: msg, scannedCode: '' });
      playScanSound(false);
      fgBarcodeInputRef.current?.focus();
      return;
    }
    if (!fgPickingDoc) return;
    setFgBusy(true);
    setFgScanNotice(null);
    try {
      const res = await productService.scanOutboundBarcode(fgPickingDoc.id, code);
      const updatedDoc = res.data.document;
      setFgPickingDoc(updatedDoc);
      setFinishedOutboundDocs((prev) =>
        prev.map((d) => (d.id === updatedDoc.id ? updatedDoc : d))
      );
      setFgScannedBarcode('');
      setFgScanNotice({
        type: 'success',
        message: res.data.message || `✓ Đã quét: ${code}`,
        scannedCode: code,
      });
      playScanSound(true);
      setTimeout(() => {
        fgBarcodeInputRef.current?.focus();
      }, 50);
    } catch (err) {
      const msg = errorMessage(err);
      setFgScanNotice({
        type: 'error',
        message: msg,
        scannedCode: code,
      });
      playScanSound(false);
      setFgScannedBarcode('');
      setTimeout(() => {
        fgBarcodeInputRef.current?.focus();
      }, 50);
    } finally {
      setFgBusy(false);
    }
  };

  const handleFgRemoveScan = async (barcode, skuId) => {
    if (!fgPickingDoc) return;
    setFgBusy(true);
    try {
      const res = await productService.removeOutboundScan(fgPickingDoc.id, barcode, skuId);
      const updatedDoc = res.data.document;
      setFgPickingDoc(updatedDoc);
      setFinishedOutboundDocs((prev) =>
        prev.map((d) => (d.id === updatedDoc.id ? updatedDoc : d))
      );
      setFgScanNotice({
        type: 'success',
        message: `Đã hủy mã ${barcode || 'vừa quét'}`,
        scannedCode: barcode || '',
      });
      playScanSound(true);
    } catch (err) {
      setFgScanNotice({
        type: 'error',
        message: errorMessage(err),
        scannedCode: barcode || '',
      });
      playScanSound(false);
    } finally {
      setFgBusy(false);
    }
  };

  const handleFgConfirmOutbound = async () => {
    if (!fgPickingDoc) return;
    const totalScanned = fgPickingDoc.totalScannedQty || 0;
    const totalQty = fgPickingDoc.totalQuantity || 0;
    if (totalScanned === 0) {
      alert('Chưa có sản phẩm nào được quét. Vui lòng quét mã sản phẩm trước khi xuất kho!');
      return;
    }
    if (totalScanned < totalQty) {
      const proceed = window.confirm(
        `Yêu cầu xuất ${totalQty} sản phẩm, hiện mới quét được ${totalScanned} sản phẩm.\nBạn có chắc chắn muốn xác nhận xuất kho phần đã quét không?`
      );
      if (!proceed) return;
    }

    setFgBusy(true);
    try {
      const res = await productService.confirmOutboundDispatch(fgPickingDoc.id);
      stopFgCamera();
      setFgPickingDoc(null);
      playScanSound(true);
      setMessage(res.data.message || `Đã xuất kho thành công ${totalScanned} sản phẩm!`);
      await refreshAll();
    } catch (err) {
      setError(errorMessage(err));
      playScanSound(false);
    } finally {
      setFgBusy(false);
    }
  };

  const openFgPickingModal = (doc) => {
    setFgPickingDoc(doc);
    setFgScanNotice(null);
    setFgScannedBarcode('');
    setTimeout(() => {
      fgBarcodeInputRef.current?.focus();
    }, 100);
  };

  return (
    <div className="material-outbound-page">
      <div className="mo-breadcrumb">
        <Link to="/">Trang chủ</Link> /{' '}
        {isStaff ? (
          <>
            <Link to="/warehouse/putaway">Nhân viên kho</Link> / Lệnh xuất nguyên phụ liệu & thành phẩm
          </>
        ) : (
          <>
            <Link to="/warehouse/raw-materials/inbound">Quản lý kho</Link> / Xuất nguyên phụ liệu
          </>
        )}
      </div>

      <header className="mo-hero">
        <div>
          <h1>{isStaff ? 'Lệnh xuất nguyên phụ liệu & thành phẩm' : 'Xuất nguyên phụ liệu'}</h1>
          <p>
            {isStaff
              ? 'Lấy hàng theo nguồn chỉ định FIFO, quét barcode cây vải/lô phụ liệu và xuất kho bàn giao cho xưởng may.'
              : 'Duyệt cấp yêu cầu xuất từ Kỹ thuật viên may, phân bổ nguồn tồn theo FIFO và giao việc cho nhân viên kho.'}
          </p>
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
        {!isStaff && (
          <button
            className={`mo-tab-btn ${activeTab === 'REQUESTS' ? 'active' : ''}`}
            onClick={() => { setActiveTab('REQUESTS'); setError(''); setMessage(''); }}
          >
            <Layers size={17} style={{ verticalAlign: 'middle', marginRight: 6 }} />
            Duyệt & giao việc (Quản lý kho)
            <span className="mo-tab-count">{requests.filter((r) => ['WAITING_SCAN', 'WAITING_DISCREPANCY'].includes(r.status)).length}</span>
          </button>
        )}
        {isStaff && (
          <>
            <button
              className={`mo-tab-btn ${activeTab === 'STAFF_TASKS' ? 'active' : ''}`}
              onClick={() => { setActiveTab('STAFF_TASKS'); setError(''); setMessage(''); }}
            >
              <Package size={17} style={{ verticalAlign: 'middle', marginRight: 6 }} />
              Nguyên phụ liệu cần lấy hàng
              <span className="mo-tab-count">{staffTasks.filter((t) => ['WAITING_PICKING', 'PICKING', 'WAITING_DISCREPANCY'].includes(t.status)).length}</span>
            </button>
            <button
              className={`mo-tab-btn ${activeTab === 'FINISHED_OUTBOUND' ? 'active' : ''}`}
              onClick={() => { setActiveTab('FINISHED_OUTBOUND'); setError(''); setMessage(''); }}
            >
              <Shirt size={17} style={{ verticalAlign: 'middle', marginRight: 6 }} />
              Lệnh xuất thành phẩm
              <span className="mo-tab-count">{finishedOutboundDocs.length}</span>
            </button>
          </>
        )}
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
      {/* TAB 2.5: Lệnh xuất thành phẩm (Nhân viên kho) */}
      {/* ========================================================= */}
      {activeTab === 'FINISHED_OUTBOUND' && (
        <section className="mo-card mo-list">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h2 style={{ margin: 0 }}>Lệnh xuất kho thành phẩm</h2>
              <p style={{ margin: '4px 0 0 0', color: 'var(--ara-text-muted)', fontSize: 13 }}>
                Danh sách yêu cầu xuất kho từ Quản lý. Nhân viên kho tiến hành lấy hàng, quét mã barcode và xuất kho.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button onClick={refreshAll} disabled={loading} className="btn-ara-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <RefreshCw size={14} className={loading ? 'spin' : ''} />
                Làm mới
              </button>
            </div>
          </div>

          {/* Status Filter Tabs for Finished Goods */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            {[
              { id: 'ALL', label: 'Tất cả', count: finishedOutboundDocs.length },
              { id: 'WAITING_PICKING', label: 'Chờ lấy hàng & quét mã', count: finishedOutboundDocs.filter(d => (d.status || 'WAITING_PICKING') === 'WAITING_PICKING').length },
              { id: 'PICKING', label: 'Đang quét mã', count: finishedOutboundDocs.filter(d => d.status === 'PICKING').length },
              { id: 'COMPLETED', label: 'Đã xuất kho', count: finishedOutboundDocs.filter(d => d.status === 'COMPLETED').length },
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFgFilterStatus(tab.id)}
                className={`btn-ara-secondary ${fgFilterStatus === tab.id ? 'active' : ''}`}
                style={{
                  fontSize: 13,
                  padding: '6px 14px',
                  borderRadius: 20,
                  background: fgFilterStatus === tab.id ? '#2b2520' : '#f5f0ea',
                  color: fgFilterStatus === tab.id ? '#ffffff' : '#2b2520',
                  border: '1px solid ' + (fgFilterStatus === tab.id ? '#2b2520' : '#e4d9cd'),
                  fontWeight: fgFilterStatus === tab.id ? 600 : 500,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <span>{tab.label}</span>
                <span style={{
                  background: fgFilterStatus === tab.id ? 'rgba(255,255,255,0.25)' : '#e2d5c5',
                  padding: '1px 7px',
                  borderRadius: 10,
                  fontSize: 11
                }}>{tab.count}</span>
              </button>
            ))}
          </div>

          {filteredFinishedOutboundDocs.length ? (
            <div className="mo-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Mã yêu cầu xuất</th>
                    <th>Mục đích / Người nhận</th>
                    <th>Mặt hàng & Chi tiết</th>
                    <th style={{ minWidth: 160 }}>Tiến độ quét mã</th>
                    <th>Ngày lập</th>
                    <th>Trạng thái</th>
                    <th style={{ textAlign: 'right' }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFinishedOutboundDocs.map((doc) => {
                    const status = doc.status || 'WAITING_PICKING';
                    const totalQty = doc.totalQuantity || 0;
                    const scannedQty = doc.totalScannedQty || 0;
                    const pct = totalQty > 0 ? Math.min(100, Math.round((scannedQty / totalQty) * 100)) : 0;
                    const isCompleted = status === 'COMPLETED';
                    const isPicking = status === 'PICKING';

                    return (
                      <tr key={doc.id || doc._id}>
                        <td>
                          <strong>{doc.documentCode || doc.code}</strong>
                          {doc.note && <div style={{ fontSize: 12, color: '#766a5e', marginTop: 2 }}>{doc.note}</div>}
                        </td>
                        <td>{doc.recipient || doc.purpose || 'Xuất kho thành phẩm'}</td>
                        <td>
                          <div><strong>{doc.items?.length || doc.lines?.length || 0}</strong> mặt hàng · <strong>{totalQty}</strong> chiếc</div>
                          <div style={{ fontSize: 12, color: '#766a5e', marginTop: 2 }}>
                            {(doc.items || doc.lines || []).slice(0, 2).map(it => it.skuCode || it.code || it.productName || it.name).join(', ')}
                            {(doc.items || doc.lines || []).length > 2 && '...'}
                          </div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                            <span><strong>{scannedQty}</strong> / {totalQty}</span>
                            <span style={{ fontWeight: 600, color: isCompleted ? '#286f3a' : pct > 0 ? '#b8621b' : '#766a5e' }}>{pct}%</span>
                          </div>
                          <div style={{ width: '100%', height: 6, background: '#ede6dd', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{
                              width: `${pct}%`,
                              height: '100%',
                              background: isCompleted ? '#286f3a' : '#c27e28',
                              transition: 'width 0.2s ease'
                            }} />
                          </div>
                        </td>
                        <td>{doc.createdAt ? new Date(doc.createdAt).toLocaleString('vi-VN') : '—'}</td>
                        <td>
                          {isCompleted && (
                            <span className="mo-status-pill status-completed">
                              <CheckCircle2 size={12} /> Đã xuất kho
                            </span>
                          )}
                          {isPicking && (
                            <span className="mo-status-pill status-in-progress" style={{ background: '#eef4ff', color: '#1a56db', border: '1px solid #c3d9ff' }}>
                              <Package size={12} /> Đang quét ({scannedQty}/{totalQty})
                            </span>
                          )}
                          {status === 'WAITING_PICKING' && (
                            <span className="mo-status-pill status-assigned">
                              <Clock size={12} /> Chờ lấy & quét mã
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {!isCompleted ? (
                            <button
                              onClick={() => openFgPickingModal(doc)}
                              className="primary"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}
                            >
                              <Camera size={14} />
                              {isPicking ? 'Tiếp tục quét' : 'Lấy hàng & Quét'}
                            </button>
                          ) : (
                            <button
                              onClick={() => setFgDetailDoc(doc)}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}
                            >
                              <Eye size={14} />
                              Chi tiết
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="mo-empty">Không có lệnh xuất thành phẩm nào phù hợp bộ lọc.</div>
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

      {/* ========================================================= */}
      {/* MODAL: Trạm lấy hàng & Quét mã xuất kho thành phẩm */}
      {/* ========================================================= */}
      {fgPickingDoc && (
        <div className="mo-overlay top" role="dialog" aria-modal="true">
          <div className="mo-modal" style={{ maxWidth: 1100 }}>
            <header className="mo-modal-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h2 style={{ display: 'flex', alignItems: 'center', gap: 10, margin: 0, fontSize: 22 }}>
                  <Package size={22} color="#8c591c" />
                  <span>Lấy hàng & Quét mã xuất kho thành phẩm</span>
                  <span style={{ fontSize: 15, background: '#eee5da', padding: '2px 10px', borderRadius: 6, color: '#2b2520' }}>
                    {fgPickingDoc.documentCode || fgPickingDoc.code}
                  </span>
                </h2>
                <div style={{ marginTop: 4, color: '#766a5e', fontSize: 13 }}>
                  Người nhận: <strong>{fgPickingDoc.recipient || '—'}</strong>
                  {fgPickingDoc.note ? ` · Ghi chú: ${fgPickingDoc.note}` : ''}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  stopFgCamera();
                  setFgPickingDoc(null);
                }}
                style={{ background: 'transparent', border: 'none', fontSize: 24, cursor: 'pointer', color: '#766a5e' }}
              >
                ×
              </button>
            </header>

            <div className="mo-modal-body" style={{ maxHeight: '72vh', overflowY: 'auto', padding: 20 }}>
              {/* Progress Banner */}
              {(() => {
                const totalScanned = fgPickingDoc.totalScannedQty || 0;
                const totalQty = fgPickingDoc.totalQuantity || 0;
                const pct = totalQty > 0 ? Math.min(100, Math.round((totalScanned / totalQty) * 100)) : 0;
                const isAllDone = totalQty > 0 && totalScanned >= totalQty;

                return (
                  <div style={{
                    background: isAllDone ? '#e9f6e9' : '#f8f3ec',
                    border: '1px solid ' + (isAllDone ? '#b7e4be' : '#e7dccc'),
                    padding: '14px 18px',
                    borderRadius: 10,
                    marginBottom: 16
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontWeight: 600, fontSize: 15, color: '#2b2520' }}>
                        Tiến độ lấy hàng & quét mã xuất kho:
                      </span>
                      <span style={{ fontWeight: 700, fontSize: 16, color: isAllDone ? '#286f3a' : '#8c591c' }}>
                        Đã quét {totalScanned} / {totalQty} chiếc ({pct}%)
                      </span>
                    </div>
                    <div style={{ width: '100%', height: 10, background: '#dfd2c4', borderRadius: 5, overflow: 'hidden' }}>
                      <div style={{
                        width: `${pct}%`,
                        height: '100%',
                        background: isAllDone ? '#286f3a' : '#c27e28',
                        transition: 'width 0.25s ease'
                      }} />
                    </div>
                    {isAllDone && (
                      <div style={{ marginTop: 8, color: '#286f3a', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <CheckCircle2 size={16} /> Đã quét đủ 100% số lượng theo yêu cầu. Hãy kiểm tra lại và bấm "Xác nhận xuất kho" bên dưới.
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Main Content: 2-Columns */}
              <div className="mo-grid" style={{ gap: 20 }}>
                {/* Column 1: Danh sách mặt hàng cần lấy */}
                <div>
                  <h3 style={{ margin: '0 0 12px', fontSize: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Shirt size={18} color="#8c591c" />
                    Danh sách sản phẩm cần xuất ({fgPickingDoc.items?.length || 0})
                  </h3>
                  <div style={{ display: 'grid', gap: 12 }}>
                    {(fgPickingDoc.items || []).map((item, idx) => {
                      const isLineDone = (item.scannedQty || 0) >= item.quantity;
                      return (
                        <div
                          key={item.skuId || idx}
                          style={{
                            padding: '12px 14px',
                            borderRadius: 10,
                            background: isLineDone ? '#fbfdfb' : '#ffffff',
                            border: '1px solid ' + (isLineDone ? '#c3e6cb' : '#e4d9cd'),
                            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: 12
                          }}
                        >
                          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                            {item.thumbnailUrl && (
                              <img
                                src={item.thumbnailUrl}
                                alt=""
                                style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6, border: '1px solid #ebd9c8' }}
                              />
                            )}
                            <div>
                              <div style={{ fontWeight: 600, fontSize: 14 }}>{item.productName || item.productCode}</div>
                              <div style={{ fontSize: 12, color: '#685e54', marginTop: 2 }}>
                                SKU: <strong>{item.skuCode}</strong>
                                {item.color ? ` · Màu: ${item.color}` : ''}
                                {item.size ? ` · Size: ${item.size}` : ''}
                              </div>
                              <div style={{ fontSize: 12, color: '#8c591c', marginTop: 3 }}>
                                📍 Vị trí kệ: {item.location ? `Kệ ${item.location.rackCode || ''} · Tầng ${item.location.floorNo || 1} · Ô ${item.location.binNo || 1} (${item.location.locationCode || ''})` : 'Khu vực thành phẩm'}
                              </div>
                            </div>
                          </div>

                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 700 }}>
                              <span style={{ color: isLineDone ? '#286f3a' : '#b8621b' }}>{item.scannedQty || 0}</span>
                              <span style={{ color: '#766a5e' }}> / {item.quantity}</span>
                            </div>
                            <div style={{ marginTop: 4 }}>
                              {isLineDone ? (
                                <span style={{ background: '#e9f6e9', color: '#286f3a', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                  <CheckCircle2 size={12} /> Đã đủ
                                </span>
                              ) : (
                                <span style={{ background: '#fff4e5', color: '#b8621b', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>
                                  Thiếu {item.quantity - (item.scannedQty || 0)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Column 2: Trạm quét mã (Camera + Barcode input + Lịch sử) */}
                <div>
                  <h3 style={{ margin: '0 0 12px', fontSize: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Barcode size={18} color="#8c591c" />
                    Trạm quét mã vạch
                  </h3>

                  {/* Scan Notice */}
                  {fgScanNotice && (
                    <div
                      style={{
                        padding: '10px 14px',
                        borderRadius: 8,
                        background: fgScanNotice.type === 'success' ? '#e9f6e9' : '#fff0ed',
                        color: fgScanNotice.type === 'success' ? '#286f3a' : '#a52e20',
                        border: '1px solid ' + (fgScanNotice.type === 'success' ? '#b7e4be' : '#f5c6cb'),
                        marginBottom: 12,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        fontWeight: 600,
                        fontSize: 13
                      }}
                    >
                      {fgScanNotice.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                      <span style={{ flex: 1 }}>{fgScanNotice.message}</span>
                      <button
                        type="button"
                        onClick={() => setFgScanNotice(null)}
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 16, lineHeight: 1 }}
                      >
                        ×
                      </button>
                    </div>
                  )}

                  {/* Camera Component */}
                  <div className="putaway-camera" style={{ height: fgCameraActive ? 220 : 120 }}>
                    <video ref={fgVideoRef} playsInline autoPlay muted className={fgCameraActive ? '' : 'hidden'} />
                    <div className="putaway-camera-top">
                      <span>{fgCameraActive ? 'CAMERA QUÉT BARCODE' : 'CAMERA ĐANG TẮT'}</span>
                      <button type="button" onClick={fgCameraActive ? stopFgCamera : startFgCamera}>
                        <Camera size={14} /> {fgCameraActive ? 'Tắt camera' : 'Mở camera quét'}
                      </button>
                    </div>
                    {fgCameraActive && <div className="putaway-reticle" />}
                    <p>{fgCameraActive ? 'Đưa mã vạch của sản phẩm (tem ARA... hoặc tem SKU) vào khung' : 'Bấm Mở camera để quét trực tiếp hoặc dùng súng quét mã bên dưới'}</p>
                  </div>

                  {/* Barcode input form */}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleFgScanBarcode();
                    }}
                    style={{ display: 'flex', gap: 8, marginTop: 12 }}
                  >
                    <input
                      ref={fgBarcodeInputRef}
                      type="text"
                      value={fgScannedBarcode}
                      onChange={(e) => setFgScannedBarcode(e.target.value)}
                      placeholder="Quét hoặc nhập mã barcode (ARA... hoặc SKU)..."
                      disabled={fgBusy}
                      autoFocus
                      style={{
                        flex: 1,
                        padding: '10px 14px',
                        border: '1px solid #d4c7b8',
                        borderRadius: 8,
                        fontSize: 14,
                        fontFamily: 'inherit'
                      }}
                    />
                    <button
                      type="submit"
                      disabled={fgBusy || !fgScannedBarcode.trim()}
                      className="primary"
                      style={{ padding: '0 18px', whiteSpace: 'nowrap', fontSize: 13 }}
                    >
                      Xác nhận
                    </button>
                  </form>
                  <p style={{ margin: '6px 0 16px', fontSize: 12, color: '#766a5e' }}>
                    Có thể dùng máy quét barcode cầm tay bắn trực tiếp vào ô trên.
                  </p>

                  {/* Lịch sử mã vừa quét */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#2b2520' }}>
                        Mã đã quét ({fgAllScannedList.length} chiếc):
                      </span>
                    </div>
                    <div style={{
                      maxHeight: 140,
                      overflowY: 'auto',
                      border: '1px solid #e4d9cd',
                      borderRadius: 8,
                      background: '#fff'
                    }}>
                      {fgAllScannedList.length ? (
                        fgAllScannedList.map(({ barcode, skuCode, skuId }, idx) => (
                          <div
                            key={`${barcode}-${idx}`}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              padding: '6px 12px',
                              borderBottom: '1px solid #f4eee7',
                              fontSize: 13
                            }}
                          >
                            <div>
                              <strong style={{ fontFamily: 'monospace' }}>{barcode}</strong>
                              {skuCode && <span style={{ marginLeft: 8, color: '#766a5e', fontSize: 12 }}>({skuCode})</span>}
                            </div>
                            <button
                              type="button"
                              title="Hủy mã này"
                              onClick={() => handleFgRemoveScan(barcode, skuId)}
                              disabled={fgBusy}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#a52e20',
                                cursor: 'pointer',
                                padding: '2px 6px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4,
                                fontSize: 12
                              }}
                            >
                              <X size={14} /> Gỡ
                            </button>
                          </div>
                        ))
                      ) : (
                        <div style={{ padding: '14px', textAlign: 'center', color: '#9b9186', fontSize: 13 }}>
                          Chưa có mã nào được quét.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <footer className="mo-modal-foot" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px' }}>
              <button
                type="button"
                className="btn-ara-secondary"
                onClick={() => {
                  stopFgCamera();
                  setFgPickingDoc(null);
                }}
              >
                Lưu tạm & Đóng
              </button>
              <button
                type="button"
                className="primary"
                disabled={fgBusy || (fgPickingDoc.totalScannedQty || 0) === 0}
                onClick={handleFgConfirmOutbound}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 22px',
                  fontWeight: 600,
                  fontSize: 14,
                  background: (fgPickingDoc.totalScannedQty || 0) >= (fgPickingDoc.totalQuantity || 0) ? '#286f3a' : undefined,
                  borderColor: (fgPickingDoc.totalScannedQty || 0) >= (fgPickingDoc.totalQuantity || 0) ? '#286f3a' : undefined
                }}
              >
                <CheckCircle2 size={16} />
                Xác nhận xuất kho ({fgPickingDoc.totalScannedQty || 0}/{fgPickingDoc.totalQuantity || 0})
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: Xem chi tiết phiếu xuất thành phẩm đã hoàn tất */}
      {/* ========================================================= */}
      {fgDetailDoc && (
        <div className="mo-overlay top" role="dialog" aria-modal="true">
          <div className="mo-modal" style={{ maxWidth: 800 }}>
            <header className="mo-modal-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 20 }}>Chi tiết phiếu xuất kho thành phẩm</h2>
                <span style={{ fontSize: 13, color: '#766a5e' }}>{fgDetailDoc.documentCode || fgDetailDoc.code}</span>
              </div>
              <button type="button" onClick={() => setFgDetailDoc(null)} style={{ background: 'transparent', border: 'none', fontSize: 24, cursor: 'pointer' }}>
                ×
              </button>
            </header>

            <div className="mo-modal-body" style={{ maxHeight: '70vh', overflowY: 'auto', padding: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
                <div style={{ background: '#fff', padding: 12, borderRadius: 8, border: '1px solid #ebd9c8' }}>
                  <div style={{ fontSize: 12, color: '#766a5e' }}>Người nhận / Mục đích</div>
                  <div style={{ fontWeight: 600, marginTop: 4 }}>{fgDetailDoc.recipient || '—'}</div>
                </div>
                <div style={{ background: '#fff', padding: 12, borderRadius: 8, border: '1px solid #ebd9c8' }}>
                  <div style={{ fontSize: 12, color: '#766a5e' }}>Tổng số lượng</div>
                  <div style={{ fontWeight: 600, marginTop: 4 }}>{fgDetailDoc.totalQuantity} chiếc</div>
                </div>
                <div style={{ background: '#fff', padding: 12, borderRadius: 8, border: '1px solid #ebd9c8' }}>
                  <div style={{ fontSize: 12, color: '#766a5e' }}>Ngày tạo</div>
                  <div style={{ fontWeight: 600, marginTop: 4 }}>{fgDetailDoc.createdAt ? new Date(fgDetailDoc.createdAt).toLocaleString('vi-VN') : '—'}</div>
                </div>
              </div>

              {fgDetailDoc.note && (
                <div style={{ background: '#fff', padding: 12, borderRadius: 8, border: '1px solid #ebd9c8', marginBottom: 16, fontSize: 13 }}>
                  <strong>Ghi chú:</strong> {fgDetailDoc.note}
                </div>
              )}

              <h4 style={{ margin: '0 0 10px' }}>Danh sách sản phẩm xuất kho</h4>
              <div className="mo-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Sản phẩm</th>
                      <th>SKU</th>
                      <th>Số lượng</th>
                      <th>Mã tem barcode đã xuất</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(fgDetailDoc.items || fgDetailDoc.lines || []).map((line, idx) => (
                      <tr key={idx}>
                        <td><strong>{line.productName || line.name || line.code}</strong></td>
                        <td>{line.skuCode || line.code}</td>
                        <td>{line.quantity} chiếc</td>
                        <td>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxHeight: 80, overflowY: 'auto' }}>
                            {(line.scannedBarcodes || []).length ? (
                              line.scannedBarcodes.map((bc, bIdx) => (
                                <span key={bIdx} style={{ fontSize: 11, background: '#f5efe6', padding: '1px 6px', borderRadius: 4, fontFamily: 'monospace' }}>
                                  {bc}
                                </span>
                              ))
                            ) : (
                              <span style={{ color: '#9b9186', fontSize: 12 }}>—</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <footer className="mo-modal-foot">
              <button onClick={() => setFgDetailDoc(null)}>Đóng</button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
