/*
 * File: SupplierInboundPage.jsx
 * Author: Duy Anh
 * Date: 2026-10-27
 * Description: Receives actual supplier deliveries through inspection, physical roll or lot declaration, location allocation, confirmation, labels, and putaway.
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Archive, CirclePlus, ClipboardList, Download, Filter, MoreVertical, PackageCheck, Search, Tag } from 'lucide-react';
// import { useAuth } from '../hooks/useAuth';
import { materialInboundService as api } from '../services/materialInbound Service';
import '../styles/materialInbound.css';

// Mock user for testing without authentication
const mockUser = {
  _id: '507f1f77bcf86cd799439011',
  username: 'test',
  fullName: 'Test User',
  roles: ['OWNER', 'WAREHOUSE_MANAGER'],
};

const field = { width: '100%', padding: '.65rem .75rem', border: '1px solid var(--ara-border)', borderRadius: 8,
  background: '#fff', color: 'var(--ara-noir)', font: 'inherit' };
const fieldset = { display: 'grid', gap: '.35rem', minWidth: 0 };
const number = (value) => Number(value) || 0;
const round = (value) => Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;
const amount = (value) => Number(number(value).toFixed(3)).toLocaleString('vi-VN');
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const displayDate = (iso) => iso?.split('-').reverse().join('/') || '';
const parseDate = (value) => {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) return '';
  const iso = `${match[3]}-${match[2]}-${match[1]}`;
  const date = new Date(`${iso}T12:00:00`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : '';
};
const unitNames = { METER: 'mét', KG: 'kg', PIECE: 'chiếc', SPOOL: 'cuộn', BOX: 'hộp' };
const unitShort = { METER: 'm', KG: 'kg', PIECE: 'chiếc', SPOOL: 'cuộn', BOX: 'hộp' };
const validQuantity = (value, unit) => Number.isFinite(Number(value)) && Number(value) >= 0 &&
  (['METER', 'KG'].includes(unit) ? Math.abs(Number(value) * 1000 - Math.round(Number(value) * 1000)) < 0.000001 : Number.isInteger(Number(value)));
const supplierLabel = (item) => `${item.supplierCode} · ${item.supplierName}`;
const materialLabel = (item) => `${item.materialCode} · ${item.materialName}${item.color ? ` · ${item.color}` : ''}`;
const receivingWarehouses = (locations) => [...new Map(locations.filter((item) => item.warehouseType === 'RAW_MATERIAL')
  .map((item) => [item.zoneCode || item.locationCode, item])).values()];
const blankForm = () => ({ supplierId: '', receivedAt: today(), receivingLocationId: '', receiptLines: [] });
const blankLine = (material) => ({ rawMaterialId: String(material._id), actualQty: 0, acceptedQty: 0,
  rejectedQty: 0, pendingQty: 0, defectReason: '', inspectionConclusion: '',
  rolls: material.materialType === 'FABRIC' ? [{ clientLineId: crypto.randomUUID(),
    widthCm: material.widthCm || '', lengthMeters: '', quality: '', locationId: '' }] : [], lots: [] });
const statusText = (status) => ({ DRAFT: 'Nháp', WAITING_QC: 'Chờ kiểm tra', READY_TO_CONFIRM: 'Sẵn sàng xác nhận',
  COMPLETED: 'Đã xác nhận', CANCELLED: 'Đã hủy' })[status] || 'Chưa lưu';
let initialRequests;
const loadInitialData = (userId) => {
  if (!initialRequests || initialRequests.userId !== userId) {
    const promise = Promise.all([api.options(), api.receipts()]);
    initialRequests = { userId, promise };
    promise.finally(() => { if (initialRequests?.promise === promise) initialRequests = null; }).catch(() => {});
  }
  return initialRequests.promise;
};

/** Shows only usable bins and keeps defective stock in its quarantine area. */
function LocationPicker({ locations, quality, unit, value, onChange }) {
  const allowed = locations.filter((item) => item.warehouseType ===
    (quality === 'REJECTED' ? 'DEFECT_QUARANTINE' : 'RAW_MATERIAL') &&
    (!item.capacityUnit || item.capacityUnit === unit) &&
    (number(item.maxCapacity) > number(item.currentOccupancy) + number(item.plannedReservedQty) ||
      String(item._id) === String(value)));
  return <div className="material-location-picker">
    <select aria-label="Vị trí chứa" style={field} value={value || ''} onChange={(event) => onChange(event.target.value)}>
      <option value="">Chọn vị trí {quality === 'REJECTED' ? 'cách ly' : 'chứa'}</option>{allowed.map((item) =>
        <option key={item._id} value={item._id}>{item.layoutBin ? `Khu ${item.zoneCode} · Kệ ${item.rackCode} · Tầng ${item.floorNo} · Ô ${item.binNo}` : item.locationCode} · còn {amount(number(item.maxCapacity) - number(item.currentOccupancy) - number(item.plannedReservedQty))} {unitShort[item.capacityUnit || unit]}</option>)}
    </select>
  </div>;
}

/** One screen keeps supplier receipt input, validation, and confirmation together. */
export default function SupplierInboundPage() {
  // const { user } = useAuth();
  const user = mockUser; // Use mock user for testing
  const [options, setOptions] = useState({ suppliers: [], materials: [], locations: [] });
  const [receipts, setReceipts] = useState([]);
  const [filters, setFilters] = useState({ code: '', supplierId: '', from: '', to: '', status: '', locationId: '' });
  const [view, setView] = useState('list');
  const [listPage, setListPage] = useState(1);
  const [showDateFilter, setShowDateFilter] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [form, setForm] = useState(blankForm);
  const [dateText, setDateText] = useState(displayDate(today()));
  const [receipt, setReceipt] = useState(null);
  const [labels, setLabels] = useState([]);
  const [barcodeReady, setBarcodeReady] = useState(0);
  const [barcodePollTick, setBarcodePollTick] = useState(0);
  const [selectedLabels, setSelectedLabels] = useState([]);
  const [materialSearch, setMaterialSearch] = useState('');
  const [supplierSearch, setSupplierSearch] = useState('');
  const [showMaterialForm, setShowMaterialForm] = useState(false);
  const [newMaterial, setNewMaterial] = useState({ materialCode: '', materialName: '', materialType: 'FABRIC',
    category: 'FABRIC_ROLL', unit: 'METER', color: '', widthCm: '', unitCost: 0, requiresWeightKg: false });
  const [putaway, setPutaway] = useState({ objectBarcode: '', locationBarcode: '', quantity: '' });
  const [supplierReturn, setSupplierReturn] = useState({ objectBarcode: '', reason: '', handoverName: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [attemptedConfirm, setAttemptedConfirm] = useState(false);
  const confirmationKey = useRef(crypto.randomUUID());
  const pendingConfirmation = useRef(null);
  const listRequestSequence = useRef(0);
  const putawayKey = useRef(crypto.randomUUID());
  const barcodePollCount = useRef(0);
  const materials = new Map(options.materials.map((item) => [String(item._id), item]));
  const locked = ['COMPLETED', 'CANCELLED'].includes(receipt?.status);
  const receiptId = receipt?._id || receipt?.id;

  const loadOptions = async () => setOptions((await api.options()).data);
  const loadReceipts = async (criteria = filters) => {
    const request = ++listRequestSequence.current;
    const listing = (await api.receipts(criteria)).data.receipts;
    if (request === listRequestSequence.current) setReceipts(listing);
  };
  const changeFilter = (patch) => { setFilters((current) => ({ ...current, ...patch })); setListPage(1); };
  const loadLabels = async (id) => {
    const data = (await api.labels(id)).data;
    setLabels(data.labels);
    setBarcodeReady(data.ready);
    setBarcodePollTick((current) => current + 1);
  };

  useEffect(() => {
    loadInitialData(String(user?._id || user?.id || '')).then(([choices, listing]) => {
      setOptions(choices.data); setReceipts(listing.data.receipts);
      const receiving = receivingWarehouses(choices.data.locations);
      if (receiving.length === 1) setForm((current) => current.receivingLocationId ? current :
        { ...current, receivingLocationId: String(receiving[0]._id) });
    }).catch((failure) => setError(failure.message));
  }, [user?._id, user?.id]);

  useEffect(() => {
    if (view !== 'list') return undefined;
    const timer = window.setTimeout(() => loadReceipts(filters).catch((failure) => setError(failure.message)), 350);
    return () => window.clearTimeout(timer);
  }, [view, filters.code, filters.supplierId, filters.status, filters.from, filters.to, filters.locationId]);

  useEffect(() => {
    if (receipt?.status !== 'COMPLETED' || !labels.length || barcodeReady >= labels.length || barcodePollCount.current >= 12) return undefined;
    const timer = window.setTimeout(() => {
      barcodePollCount.current += 1;
      loadLabels(receipt._id || receipt.id).catch((failure) => setError(failure.message));
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [receipt?._id, receipt?.id, receipt?.status, barcodeReady, labels.length, barcodePollTick]);

  const startReceipt = () => {
    const receiving = receivingWarehouses(options.locations);
    setForm({ ...blankForm(), receivingLocationId: receiving.length === 1 ? String(receiving[0]._id) : '' });
    setReceipt(null); setLabels([]); setBarcodeReady(0); setSelectedLabels([]);
    setDateText(displayDate(today())); setSupplierSearch(''); setMaterialSearch('');
    setView('editor'); setError(''); setNotice(''); setAttemptedConfirm(false); confirmationKey.current = crypto.randomUUID();
    pendingConfirmation.current = null;
  };

  const openReceipt = async (id) => {
    setBusy(true); setError('');
    try {
      const data = (await api.receipt(id)).data;
      const saved = data.receipt;
      setOptions((current) => ({ ...current, materials: [...current.materials,
        ...data.materials.filter((item) => !current.materials.some((known) => String(known._id) === String(item._id)))] }));
      setReceipt(saved);
      setForm({ supplierId: String(saved.supplierId),
        receivedAt: saved.receivedAt?.slice(0, 10) || today(),
        receivingLocationId: String(saved.receivingLocationId || ''),
        receiptLines: saved.receiptLines || [] });
      setDateText(displayDate(saved.receivedAt?.slice(0, 10) || today()));
      setSupplierSearch(supplierLabel(options.suppliers.find((item) => String(item._id) === String(saved.supplierId)) ||
        { supplierCode: '', supplierName: '' }));
      barcodePollCount.current = 0;
      if (saved.status === 'COMPLETED') await loadLabels(id);
      else { setLabels([]); setBarcodeReady(0); }
      setSelectedLabels([]); setView('editor'); setAttemptedConfirm(false);
      confirmationKey.current = crypto.randomUUID();
      pendingConfirmation.current = null;
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };

  const saveDraft = async () => {
    const result = receipt ? await api.update(receiptId, { ...form, expectedVersion: receipt.receiptVersion })
      : await api.create(form);
    setReceipt(result.data.receipt);
    setForm((current) => ({ ...current, receiptLines: result.data.receipt.receiptLines }));
    await loadReceipts().catch(() => {});
    return result.data.receipt;
  };

  const run = async (task) => {
    setBusy(true); setError(''); setNotice('');
    try { await task(); } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };

  /** Derives stock totals from physical rolls or the single accessory quantity entry. */
  const changeLine = (index, patch) => setForm((current) => ({ ...current, receiptLines: current.receiptLines.map((line, row) => {
    if (row !== index) return line;
    const next = { ...line, ...patch };
    const material = materials.get(String(next.rawMaterialId));
    const kind = material?.materialType === 'FABRIC' ? 'rolls' : 'lots';
    if (kind in patch) {
      const objects = next[kind] || [];
      const value = (item) => number(kind === 'rolls' ? item.lengthMeters : item.countedQty);
      next.actualQty = round(objects.reduce((sum, item) => sum + value(item), 0));
      next.acceptedQty = round(objects.filter((item) => item.quality === 'ACCEPTED').reduce((sum, item) => sum + value(item), 0));
      next.rejectedQty = round(objects.filter((item) => item.quality === 'REJECTED').reduce((sum, item) => sum + value(item), 0));
      next.pendingQty = round(next.actualQty - next.acceptedQty - next.rejectedQty);
      next.inspectionConclusion = next.actualQty > 0 && next.pendingQty === 0 ? 'Đã kiểm tra' : '';
      const reason = objects.find((item) => item.quality === 'REJECTED' && item.defectReason?.trim())?.defectReason;
      if (reason && !next.defectReason?.trim()) next.defectReason = reason;
    } else if (kind === 'lots' && ['actualQty', 'rejectedQty', 'inspectionConclusion', 'defectReason'].some((key) => key in patch)) {
      if (next.inspectionConclusion === 'Toàn bộ đạt') next.rejectedQty = 0;
      const accepted = round(Math.max(0, number(next.actualQty) - number(next.rejectedQty)));
      next.acceptedQty = next.inspectionConclusion ? accepted : 0;
      next.pendingQty = next.inspectionConclusion ? 0 : accepted;
      if ((next.lots || []).every((lot) => lot.clientLineId?.startsWith('AUTO-'))) {
        next.lots = ['ACCEPTED', 'REJECTED'].flatMap((quality) => {
          const quantity = quality === 'ACCEPTED' ? number(next.acceptedQty) : number(next.rejectedQty);
          if (!quantity) return [];
          const clientLineId = 'AUTO-' + next.rawMaterialId + '-' + quality;
          const previous = (line.lots || []).find((lot) => lot.clientLineId === clientLineId);
          return [{ clientLineId, supplierLotCode: previous?.supplierLotCode || '',
            ...(previous?.packageCount && previous?.unitsPerPackage ? {
              packageUnit: previous.packageUnit, packageCount: previous.packageCount,
              unitsPerPackage: previous.unitsPerPackage } : {}), countedQty: quantity, quality,
            defectReason: quality === 'REJECTED' ? next.defectReason || '' : '',
            allocations: previous?.allocations?.length > 1 ? previous.allocations : [{
              locationId: previous?.allocations?.[0]?.locationId || '', quantity }] }];
        });
      }
    }
    return next;
  }) }));
  const changeObject = (lineIndex, kind, objectIndex, patch) => changeLine(lineIndex, {
    [kind]: form.receiptLines[lineIndex][kind].map((object, row) => {
      if (row !== objectIndex) return object;
      const next = { ...object, ...patch };
      if (kind === 'lots' && 'countedQty' in patch && object.allocations?.length === 1) {
        next.allocations = [{ ...object.allocations[0], quantity: patch.countedQty }];
      }
      return next;
    }),
  });
  const addObject = (index, material) => {
    const kind = material.materialType === 'FABRIC' ? 'rolls' : 'lots';
    const line = form.receiptLines[index];
    const previous = line[kind].at(-1);
    const object = kind === 'rolls'
      ? { clientLineId: crypto.randomUUID(), supplierRollCode: '', lotCode: previous?.lotCode || '',
        widthCm: material.widthCm || previous?.widthCm || '', lengthMeters: '', quality: '',
        defectReason: '', locationId: previous?.locationId || '' }
      : { clientLineId: crypto.randomUUID(), supplierLotCode: '', countedQty: '', quality: '', defectReason: '',
        allocations: [{ locationId: '', quantity: '' }] };
    changeLine(index, { [kind]: [...line[kind], object] });
  };
  const addMaterial = (material) => {
    if (!material || form.receiptLines.some((line) => String(line.rawMaterialId) === String(material._id))) return;
    setForm((current) => ({ ...current, receiptLines: [...current.receiptLines, blankLine(material)] }));
    setMaterialSearch('');
  };
  const totalsByUnit = form.receiptLines.reduce((totals, line) => {
    const unit = materials.get(String(line.rawMaterialId))?.unit;
    if (!unit) return totals;
    const total = totals.get(unit) || { actual: 0, accepted: 0, rejected: 0 };
    total.actual = round(total.actual + number(line.actualQty));
    total.accepted = round(total.accepted + number(line.acceptedQty));
    total.rejected = round(total.rejected + number(line.rejectedQty));
    totals.set(unit, total);
    return totals;
  }, new Map());
  const headerIssues = [];
  const issuesByLine = new Map();
  if (!form.supplierId) headerIssues.push('Chọn nhà cung cấp ở phần Thông tin nhận hàng.');
  if (!parseDate(dateText) || parseDate(dateText) > today()) headerIssues.push('Nhập ngày nhận hợp lệ theo dạng dd/mm/yyyy.');
  if (!form.receivingLocationId) headerIssues.push('Chọn kho nhận ở phần Thông tin nhận hàng.');
  if (!form.receiptLines.some((line) => number(line.actualQty) > 0))
    headerIssues.push('Thêm ít nhất một nguyên phụ liệu và nhập số thực nhận lớn hơn 0.');
  for (const line of form.receiptLines) {
    const material = materials.get(String(line.rawMaterialId));
    if (!material) continue;
    const issues = [];
    const objects = material.materialType === 'FABRIC' ? line.rolls : line.lots;
    if (!validQuantity(line.actualQty, material.unit) || !validQuantity(line.rejectedQty, material.unit))
      issues.push('Số lượng không hợp lệ theo đơn vị ' + unitNames[material.unit] + '.');
    if (number(line.rejectedQty) > number(line.actualQty)) issues.push('Số không đạt vượt số thực nhận.');
    if (number(line.actualQty) > 0 && number(line.pendingQty) > 0)
      issues.push('Chọn kết quả kiểm tra cho từng cây hoặc lô.');
    if (material.materialType === 'FABRIC') {
      if (!line.rolls.length || line.rolls.some((roll) => number(roll.lengthMeters) <= 0))
        issues.push('Mỗi cây cần chiều dài nhận lớn hơn 0.');
      if (line.rolls.some((roll) => !roll.quality)) issues.push('Còn cây chưa có kết quả kiểm tra.');
      if (line.rolls.some((roll) => !number(roll.widthCm))) issues.push('Danh mục hoặc cây vải cần có khổ vải.');
      if (material.requiresWeightKg && line.rolls.some((roll) => number(roll.weightKg) <= 0))
        issues.push('Vải này bắt buộc nhập cân nặng từng cây.');
    } else {
      if (line.inspectionConclusion === 'Có hàng không đạt' && number(line.rejectedQty) <= 0)
        issues.push('Nhập số lượng không đạt lớn hơn 0.');
      if (line.lots.some((lot) => !validQuantity(lot.countedQty, material.unit) || number(lot.countedQty) <= 0))
        issues.push('Mỗi lô cần số lượng hợp lệ lớn hơn 0.');
      if (line.lots.some((lot) => !lot.quality)) issues.push('Còn lô chưa có kết quả kiểm tra.');
    }
    if (objects.some((item) => item.quality === 'REJECTED' && !item.defectReason?.trim()) ||
      number(line.rejectedQty) > 0 && !line.defectReason?.trim())
      issues.push('Hàng không đạt cần lý do.');
    const objectTotal = (quality) => round(objects.filter((item) => item.quality === quality)
      .reduce((sum, item) => sum + number(material.materialType === 'FABRIC' ? item.lengthMeters : item.countedQty), 0));
    if (objectTotal('ACCEPTED') !== round(number(line.acceptedQty)) ||
      objectTotal('REJECTED') !== round(number(line.rejectedQty)))
      issues.push('Tổng số cây/lô chưa khớp số kiểm nhận.');
    if (objects.some((item) => material.materialType === 'FABRIC' ?
      item.quality === 'REJECTED' && !item.locationId :
      item.quality === 'REJECTED' && !item.allocations?.some((allocation) => allocation.locationId) ||
      item.allocations?.some((allocation) => item.quality === 'REJECTED' && !allocation.locationId ||
        !number(allocation.quantity)) ||
      round(item.allocations.reduce((sum, allocation) => sum + number(allocation.quantity), 0)) !==
        round(number(item.countedQty))))
      issues.push('Hàng không đạt cần vị trí cách ly; số lượng chia vị trí phải khớp số nhận.');
    if (issues.length) issuesByLine.set(String(line.rawMaterialId), issues);
  }
  const confirmationIssues = [...headerIssues, ...[...issuesByLine.values()].flat()];
  const confirmReceipt = () => {
    setAttemptedConfirm(true);
    if (confirmationIssues.length) return;
    run(async () => {
    let request = pendingConfirmation.current;
    if (!request || request.formSignature !== JSON.stringify(form)) {
      const saved = await saveDraft();
      if (saved.status !== 'READY_TO_CONFIRM') throw new Error('Phiếu chưa đủ điều kiện xác nhận. Hãy kiểm tra từng dòng.');
      request = { id: saved._id || saved.id, version: saved.receiptVersion,
        formSignature: JSON.stringify({ ...form, receiptLines: saved.receiptLines }) };
      pendingConfirmation.current = request;
    }
    try {
      const confirmed = (await api.confirm(request.id, {
        expectedVersion: request.version, idempotencyKey: confirmationKey.current,
      })).data.receipt;
      pendingConfirmation.current = null;
      setReceipt(confirmed); barcodePollCount.current = 0;
      await loadLabels(confirmed._id || confirmed.id);
      setNotice('Đã xác nhận nhập kho. In tem và quét cất hàng đạt vào vị trí.');
    } catch (error) {
      // Show detailed error message from server
      const serverMessage = error.response?.data?.error?.message || error.response?.data?.message || error.message;
      throw new Error(`Không thể xác nhận: ${serverMessage}`);
    }
    });
  };

  const listPageSize = 10;
  const listPageCount = Math.max(1, Math.ceil(receipts.length / listPageSize));
  const visiblePage = Math.min(listPage, listPageCount);
  const visibleReceipts = receipts.slice((visiblePage - 1) * listPageSize, visiblePage * listPageSize);
  const completedCount = receipts.filter((item) => item.status === 'COMPLETED').length;
  const waitingCount = receipts.filter((item) => item.status === 'WAITING_QC').length;
  const receiptMaterials = (item) => (item.receiptLines || []).map((line) =>
    line.rawMaterialId?.materialName || materials.get(String(line.rawMaterialId))?.materialName).filter(Boolean);
  const exportReceipts = () => {
    const quote = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const rows = [['Mã phiếu', 'Ngày nhận', 'Nhà cung cấp', 'Kho nhận', 'Nguyên phụ liệu', 'Người nhận', 'Trạng thái'],
      ...receipts.map((item) => [item.ticketCode, displayDate(item.receivedAt?.slice(0, 10)),
        item.supplierId?.supplierName, item.receivingLocationId?.locationCode,
        receiptMaterials(item).join(', '), item.createdByManagerId?.fullName, statusText(item.status)])];
    const file = new Blob(['\uFEFF', rows.map((row) => row.map(quote).join(',')).join('\r\n')],
      { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url; link.download = 'phieu-nhap-nguyen-phu-lieu.csv'; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return <main className={'material-inbound-page' + (view === 'list' ? ' material-receipt-list-page' : '')}>
    {view === 'list' ? <>
      <nav className="material-list-breadcrumb" aria-label="Đường dẫn">
        <Link to="/">TRANG CHỦ</Link><span>/</span><span>PHIẾU NHẬP KHO</span><span>/</span><strong>NGUYÊN PHỤ LIỆU</strong>
      </nav>
      <header className="material-list-hero">
        <div className="material-list-hero-copy">
          <p className="material-list-eyebrow"><span /> HỆ THỐNG VẬN HÀNH BOUTIQUE</p>
          <h1>Phiếu nhập nguyên phụ liệu</h1>
          <p>Quản lý lịch sử nhập kho các loại vải, kaki và phụ liệu may mặc cao cấp. Theo dõi trạng thái kiểm nhận và định giá tồn kho nguyên vật liệu đầu vào.</p>
        </div>
        <div className="material-list-hero-actions">
          <button type="button" className="btn-ara-secondary" disabled={!receipts.length} onClick={exportReceipts}>
            <Download size={16} /> Xuất báo cáo
          </button>
          <button type="button" className="btn-ara-primary" onClick={startReceipt}>
            <CirclePlus size={18} /> Lập phiếu nhập
          </button>
        </div>
      </header>
      {error && <p className="material-message error" role="alert">{error}</p>}
      <section className="material-list-filter-panel" aria-label="Bộ lọc phiếu nhập">
        <label className="material-list-filter-search">TÌM KIẾM PHIẾU
          <span className="material-list-search-box"><Search size={18} />
            <input value={filters.code} onChange={(event) => changeFilter({ code: event.target.value })}
              placeholder="Mã phiếu hoặc tên nguyên liệu..." /></span>
        </label>
        <label>NHÀ CUNG CẤP
          <select value={filters.supplierId} onChange={(event) => changeFilter({ supplierId: event.target.value })}>
            <option value="">Tất cả nhà cung cấp</option>
            {options.suppliers.map((item) => <option key={item._id} value={item._id}>{item.supplierName}</option>)}
          </select>
        </label>
        <label>TRẠNG THÁI
          <select value={filters.status} onChange={(event) => changeFilter({ status: event.target.value })}>
            <option value="">Tất cả trạng thái</option>
            {['DRAFT', 'WAITING_QC', 'READY_TO_CONFIRM', 'COMPLETED', 'CANCELLED'].map((item) =>
              <option key={item} value={item}>{statusText(item)}</option>)}
          </select>
        </label>
        <button type="button" className={'material-list-date-button' + (showDateFilter ? ' active' : '')}
          onClick={() => setShowDateFilter((current) => !current)} aria-expanded={showDateFilter}>
          <Filter size={17} /> Lọc ngày
        </button>
        {showDateFilter && <div className="material-list-date-panel">
          <label>Từ ngày<input type="date" value={filters.from}
            onChange={(event) => changeFilter({ from: event.target.value })} /></label>
          <label>Đến ngày<input type="date" value={filters.to}
            onChange={(event) => changeFilter({ to: event.target.value })} /></label>
          <label>Kho nhận<select value={filters.locationId}
            onChange={(event) => changeFilter({ locationId: event.target.value })}>
            <option value="">Tất cả kho</option>
            {receivingWarehouses(options.locations).map((item) =>
              <option key={item._id} value={item._id}>Khu {item.zoneCode}</option>)}
          </select></label>
          <button type="button" onClick={() => changeFilter({ from: '', to: '', locationId: '' })}>Xóa lọc ngày</button>
        </div>}
      </section>
      <section className="material-list-table-card" aria-label="Danh sách phiếu nhập">
        <div className="material-table-wrap"><table className="material-list-table">
          <thead><tr><th>MÃ PHIẾU</th><th>NGÀY NHẬN</th><th>NHÀ CUNG CẤP</th>
            <th>NGUYÊN PHỤ LIỆU</th><th>NGƯỜI NHẬN</th><th>TRẠNG THÁI</th><th>THAO TÁC</th></tr></thead>
          <tbody>{visibleReceipts.map((item) => { const names = receiptMaterials(item);
            const ownerName = item.createdByManagerId?.fullName || '—';
            return <tr key={item._id}>
              <td className="material-list-ticket">{item.ticketCode}</td>
              <td className="material-list-date">{displayDate(item.receivedAt?.slice(0, 10))}</td>
              <td><strong>{item.supplierId?.supplierName || '—'}</strong>
                <small>{item.receivingLocationId?.locationCode || 'Chưa rõ kho nhận'}</small></td>
              <td><div className="material-list-tags">{names.slice(0, 2).map((name, index) =>
                <span key={index}>{name}</span>)}{names.length > 2 && <span>+{names.length - 2}</span>}
                {!names.length && <span>Chưa có hàng</span>}</div></td>
              <td><span className="material-list-person"><span className="material-list-avatar">
                {ownerName === '—' ? '?' : ownerName.trim().slice(0, 1).toUpperCase()}</span>{ownerName}</span></td>
              <td><span className={'material-list-status status-' + item.status?.toLowerCase()}>{statusText(item.status)}</span></td>
              <td><div className="material-list-row-actions">
                <button type="button" disabled={busy} onClick={() => openReceipt(item._id)}>Chi tiết / In</button>
                <details className="material-list-row-menu"><summary aria-label={'Thêm thao tác phiếu ' + item.ticketCode}>
                  <MoreVertical size={18} /></summary><button type="button" onClick={async () => {
                    await navigator.clipboard.writeText(item.ticketCode);
                    setNotice('Đã sao chép mã phiếu ' + item.ticketCode + '.');
                  }}>Sao chép mã phiếu</button></details>
              </div></td>
            </tr>; })}</tbody>
        </table></div>
        {!receipts.length && <p className="material-list-empty">Không có phiếu nhập phù hợp với bộ lọc.</p>}
        <footer className="material-list-pagination">
          <span>Hiển thị {visibleReceipts.length} trên tổng số {receipts.length} phiếu nhập</span>
          <div>{Array.from({ length: listPageCount }, (_, index) => index + 1).map((item) =>
            <button type="button" key={item} className={item === visiblePage ? 'current' : ''}
              onClick={() => setListPage(item)} aria-label={'Trang ' + item}>{item}</button>)}</div>
        </footer>
      </section>
      <section className="material-list-stats" aria-label="Tóm tắt danh sách">
        <article><span className="material-list-stat-icon gold"><Archive size={24} /></span>
          <div><h2>Phiếu trong danh sách</h2><p>Số phiếu phù hợp bộ lọc hiện tại.</p>
            <strong>{receipts.length} phiếu</strong></div></article>
        <article><span className="material-list-stat-icon charcoal"><PackageCheck size={24} /></span>
          <div><h2>Đã nhập kho</h2><p>Phiếu đã xác nhận, có thể in lại tem và cất hàng.</p>
            <strong>{completedCount} phiếu</strong></div></article>
        <article><span className="material-list-stat-icon muted"><ClipboardList size={24} /></span>
          <div><h2>Phiếu chờ kiểm định</h2><p>Còn cây hoặc lô chưa có kết quả kiểm tra.</p>
            <strong>{waitingCount} phiếu</strong></div></article>
      </section>
      <aside className="material-list-guide">
        <div className="material-list-guide-icon"><Tag size={27} /></div>
        <div><h2>Phân loại Nguyên phụ liệu (PNNL)</h2>
          <p>Vải được ghi theo từng cây và chiều dài mét. Phụ liệu được ghi theo chiếc, cuộn, kg hoặc hộp. Mỗi phiếu có thể chứa nhiều loại và chỉ hàng đã kiểm tra, cất đúng vị trí mới sẵn sàng sử dụng.</p>
          {showGuide && <p className="material-list-guide-steps">Chọn nhà cung cấp → thêm vật tư → nhập số lượng và kết quả kiểm tra → xác nhận phiếu → in tem và quét cất hàng.</p>}
        </div>
        <button type="button" onClick={() => setShowGuide((current) => !current)}>
          {showGuide ? 'Thu gọn hướng dẫn' : 'Hướng dẫn nhập kho'}</button>
      </aside>
      <footer className="material-list-brand">ARAWMS OPERATIONS <span>·</span> ELEGANCE IN LOGISTICS &amp; PRECISION</footer>
    </> : <>
      <p className="product-muted"><Link to="/">Kho nguyên phụ liệu</Link> / <button type="button" className="material-back-link" onClick={() => { setView('list'); loadReceipts().catch((failure) => setError(failure.message)); }}>← Danh sách phiếu</button></p>
      <div className="material-inbound-heading"><div><h1>Nhập nguyên phụ liệu</h1><p>Nhận hàng thực tế do nhà cung cấp giao.</p></div>
        <span className="product-badge active">{statusText(receipt?.status)}</span></div>
      {error && <p className="material-message error" role="alert">{error}</p>}
      {notice && <p className="material-message success" role="status">{notice}</p>}
      <fieldset disabled={busy} className="material-editor">
        {!locked && <>
          <section className="material-card">
            <h2>Thông tin nhận hàng</h2>
            <div className="material-grid">
              <label style={fieldset}>Nhà cung cấp *
                <input list="supplier-inbound-options" style={field} value={supplierSearch}
                  placeholder="Tìm mã hoặc tên nhà cung cấp"
                  onChange={(event) => { const value = event.target.value; setSupplierSearch(value);
                    const selected = options.suppliers.find((item) => supplierLabel(item) === value);
                    setForm((current) => ({ ...current, supplierId: selected ? String(selected._id) : '' })); }} />
                <datalist id="supplier-inbound-options">{options.suppliers.map((item) =>
                  <option key={item._id} value={supplierLabel(item)} />)}</datalist>
              </label>
              <label style={fieldset}>Ngày nhận *
                <input style={field} inputMode="numeric" placeholder="dd/mm/yyyy" value={dateText}
                  onChange={(event) => { const value = event.target.value; setDateText(value);
                    setForm((current) => ({ ...current, receivedAt: parseDate(value) })); }} />
              </label>
              <label style={fieldset}>Kho nhận *
                <select style={field} value={form.receivingLocationId} onChange={(event) =>
                  setForm((current) => ({ ...current, receivingLocationId: event.target.value }))}>
                  <option value="">Chọn kho nhận</option>{receivingWarehouses(options.locations).map((item) =>
                    <option key={item._id} value={item._id}>Kho nguyên phụ liệu · Khu {item.zoneCode}</option>)}
                  {form.receivingLocationId && !receivingWarehouses(options.locations).some((item) => String(item._id) === String(form.receivingLocationId)) &&
                    <option value={form.receivingLocationId}>Kho đã chọn trên phiếu</option>}
                </select>
              </label>
            </div>
          </section>
          <section className="material-card">
            <h2>Hàng nhập kho</h2>
            <label style={fieldset}>Tìm và thêm nguyên phụ liệu
              <input list="material-inbound-options" style={field} value={materialSearch}
                placeholder="Nhập mã hoặc tên, rồi chọn kết quả"
                onChange={(event) => { const value = event.target.value; setMaterialSearch(value);
                  const selected = options.materials.find((item) => materialLabel(item) === value);
                  if (selected) addMaterial(selected); }} />
              <datalist id="material-inbound-options">{options.materials.filter((item) =>
                !form.receiptLines.some((line) => String(line.rawMaterialId) === String(item._id))).map((item) =>
                <option key={item._id} value={materialLabel(item)} />)}</datalist>
            </label>
            <button type="button" className="btn-ara-secondary material-create-link"
              onClick={() => setShowMaterialForm((current) => !current)}>+ Tạo nguyên phụ liệu mới</button>
            {showMaterialForm && <div className="material-line"><div className="material-grid">
              {[['materialCode', 'Mã'], ['materialName', 'Tên'], ['color', 'Màu'], ['widthCm', 'Khổ (cm)']].map(([key, label]) =>
                <label key={key} style={fieldset}>{label}<input style={field} value={newMaterial[key]}
                  onChange={(event) => setNewMaterial({ ...newMaterial, [key]: event.target.value })} /></label>)}
              <label style={fieldset}>Loại<select style={field} value={newMaterial.materialType} onChange={(event) =>
                setNewMaterial({ ...newMaterial, materialType: event.target.value,
                  category: event.target.value === 'FABRIC' ? 'FABRIC_ROLL' : 'BUTTON',
                  unit: event.target.value === 'FABRIC' ? 'METER' : 'PIECE' })}>
                <option value="FABRIC">Vải</option><option value="AUXILIARY">Phụ liệu</option>
              </select></label>
              <label style={fieldset}>Danh mục<select style={field} value={newMaterial.category}
                onChange={(event) => setNewMaterial({ ...newMaterial, category: event.target.value })}>
                {(newMaterial.materialType === 'FABRIC' ? ['FABRIC_ROLL'] :
                  ['BUTTON', 'THREAD', 'ZIPPER', 'CARE_LABEL', 'PACKAGING_BAG']).map((item) =>
                  <option key={item}>{item}</option>)}</select></label>
              <label style={fieldset}>Đơn vị<select style={field} value={newMaterial.unit}
                onChange={(event) => setNewMaterial({ ...newMaterial, unit: event.target.value })}>
                {(newMaterial.materialType === 'FABRIC' ? ['METER'] :
                  ['KG', 'PIECE', 'SPOOL', 'BOX']).map((item) =>
                  <option key={item} value={item}>{unitNames[item]}</option>)}</select></label>
              {newMaterial.materialType === 'FABRIC' && <label><input type="checkbox"
                checked={!!newMaterial.requiresWeightKg} onChange={(event) =>
                  setNewMaterial({ ...newMaterial, requiresWeightKg: event.target.checked })} /> Bắt buộc theo dõi cân nặng từng cây</label>}
            </div><button type="button" className="btn-ara-primary" onClick={() => run(async () => {
              const created = (await api.createMaterial(newMaterial)).data.material;
              setOptions((current) => ({ ...current, materials: [...current.materials, created] }));
              addMaterial(created); setShowMaterialForm(false); setNotice('Đã tạo và thêm nguyên phụ liệu.');
            })}>Lưu và thêm vào phiếu</button></div>}
            {!form.receiptLines.length && <p className="product-muted">Chọn nguyên phụ liệu ở ô tìm kiếm để bắt đầu nhập.</p>}
            {form.receiptLines.map((line, index) => { const material = materials.get(String(line.rawMaterialId));
              if (!material) return null;
              const fabric = material.materialType === 'FABRIC';
              const simple = line.lots.every((item) => item.clientLineId?.startsWith('AUTO-'));
              const lineIssues = issuesByLine.get(String(line.rawMaterialId)) || [];
              return <div className="material-line material-entry" key={line.rawMaterialId}>
                <div className="material-line-heading"><div><h3>{material.materialName}{material.color ? ' · ' + material.color : ''}</h3>
                  <small>{material.materialCode} · {fabric && material.widthCm ? 'Khổ ' + amount(number(material.widthCm) / 100) + ' m · ' : ''}{unitNames[material.unit]}</small></div>
                  <button type="button" className="btn-ara-secondary" aria-label={'Xóa ' + material.materialName}
                    onClick={() => setForm((current) => ({ ...current,
                      receiptLines: current.receiptLines.filter((_, row) => row !== index) }))}>Xóa hàng</button></div>
                {fabric ? <>
                  <div className="material-table-wrap"><table className="material-inline-table"><thead><tr>
                    <th>Cây</th><th>Chiều dài nhận (m)</th><th>Kết quả kiểm tra</th><th>Vị trí cất</th><th>Thao tác</th>
                  </tr></thead><tbody>{line.rolls.map((roll, objectIndex) => <tr key={roll.clientLineId}>
                    <td>Cây {objectIndex + 1}</td>
                    <td><input type="number" min="0" step=".001" style={field} value={roll.lengthMeters ?? ''}
                      aria-label={'Chiều dài nhận cây ' + (objectIndex + 1)}
                      onChange={(event) => changeObject(index, 'rolls', objectIndex, { lengthMeters: event.target.value })} /></td>
                    <td><select style={field} value={roll.quality || ''} aria-label={'Kết quả cây ' + (objectIndex + 1)}
                      onChange={(event) => changeObject(index, 'rolls', objectIndex, { quality: event.target.value,
                        locationId: '' })}><option value="">Chưa kiểm tra</option><option value="ACCEPTED">Đạt</option>
                      <option value="REJECTED">Không đạt</option></select>
                      {roll.quality === 'REJECTED' && <input style={field} placeholder="Lý do không đạt"
                        aria-label={'Lý do cây ' + (objectIndex + 1)} value={roll.defectReason || ''}
                        onChange={(event) => changeObject(index, 'rolls', objectIndex,
                          { defectReason: event.target.value })} />}</td>
                    <td><LocationPicker locations={options.locations} quality={roll.quality} unit={material.unit}
                      value={roll.locationId} onChange={(value) => changeObject(index, 'rolls', objectIndex,
                        { locationId: value })} />{!roll.locationId && <small>Chưa chọn vị trí — xử lý sau</small>}</td>
                    <td><button type="button" className="btn-ara-secondary"
                      onClick={() => changeLine(index, { rolls: line.rolls.filter((_, row) => row !== objectIndex) })}>Xóa</button></td>
                  </tr>)}</tbody></table></div>
                  {line.rolls.map((roll, objectIndex) => material.requiresWeightKg && <label key={roll.clientLineId}
                    style={fieldset}>Cân nặng cây {objectIndex + 1} (kg)
                    <input type="number" min="0" step=".001" style={field} value={roll.weightKg ?? ''}
                      onChange={(event) => changeObject(index, 'rolls', objectIndex, { weightKg: event.target.value })} /></label>)}
                  <div className="material-import-controls">
                    <button type="button" className="btn-ara-secondary" onClick={() => addObject(index, material)}>+ Thêm cây</button>
                    <button type="button" className="btn-ara-secondary"
                      onClick={() => changeLine(index, { rolls: line.rolls.map((roll) =>
                        ({ ...roll, quality: 'ACCEPTED', defectReason: '', locationId: roll.quality === 'REJECTED' ? '' : roll.locationId })) })}>
                      Tất cả cây đều đạt</button>
                  </div>
                  <p><strong>{line.rolls.length} cây · Tổng nhận: {amount(line.actualQty)} m · Đạt: {amount(line.acceptedQty)} m · Không đạt: {amount(line.rejectedQty)} m</strong></p>
                  {number(line.rejectedQty) > 0 && <p className="product-muted">Cây chỉ lỗi một phần: tách và ghi nhận theo nghiệp vụ kiểm nhận/điều chỉnh; hệ thống không tự tăng chiều dài hay coi cả cây đạt.</p>}
                </> : simple ? <>
                  <div className="material-grid">
                    <label style={fieldset}>Số lượng nhận ({unitShort[material.unit]})
                      <input type="number" min="0" step={['METER', 'KG'].includes(material.unit) ? '.001' : '1'}
                        style={field} value={line.actualQty}
                        onChange={(event) => changeLine(index, { actualQty: event.target.value })} /></label>
                    <label style={fieldset}>Đơn vị<input style={field} readOnly value={unitNames[material.unit]} /></label>
                    <label style={fieldset}>Kết quả kiểm tra
                      <select style={field} value={!line.inspectionConclusion ? '' :
                        number(line.rejectedQty) > 0 || line.inspectionConclusion === 'Có hàng không đạt' ? 'REJECTED' : 'ACCEPTED'}
                        onChange={(event) => changeLine(index, { inspectionConclusion:
                          event.target.value === 'ACCEPTED' ? 'Toàn bộ đạt' :
                            event.target.value === 'REJECTED' ? 'Có hàng không đạt' : '',
                          rejectedQty: event.target.value === 'REJECTED' ? line.rejectedQty : 0 })}>
                        <option value="">Chưa kiểm tra</option><option value="ACCEPTED">Toàn bộ đạt</option>
                        <option value="REJECTED">Có hàng không đạt</option>
                      </select></label>
                    {line.inspectionConclusion === 'Có hàng không đạt' && <>
                      <label style={fieldset}>Số lượng không đạt ({unitShort[material.unit]})
                        <input type="number" min="0" max={line.actualQty}
                          step={['METER', 'KG'].includes(material.unit) ? '.001' : '1'}
                          style={field} value={line.rejectedQty}
                          onChange={(event) => changeLine(index, { rejectedQty: event.target.value })} /></label>
                      <label style={fieldset}>Lý do không đạt
                        <input style={field} value={line.defectReason || ''}
                          onChange={(event) => changeLine(index, { defectReason: event.target.value })} /></label>
                    </>}
                  </div>
                  {line.lots.map((lot, objectIndex) => <div key={lot.clientLineId} className="material-inline-location">
                    <span>{lot.quality === 'REJECTED' ? 'Hàng không đạt' : 'Hàng đạt'} · {amount(lot.countedQty)} {unitShort[material.unit]}</span>
                    <LocationPicker locations={options.locations} quality={lot.quality} unit={material.unit}
                      value={lot.allocations?.[0]?.locationId} onChange={(value) => changeObject(index, 'lots', objectIndex,
                        { allocations: [{ locationId: value, quantity: lot.countedQty }] })} />
                    {!lot.allocations?.[0]?.locationId && <small>Chưa chọn vị trí — xử lý sau</small>}
                  </div>)}
                  <p><strong>Nhận {amount(line.actualQty)} {unitShort[material.unit]} · Đạt {amount(line.acceptedQty)} · Không đạt {amount(line.rejectedQty)}</strong></p>
                  <button type="button" className="btn-ara-secondary material-create-link"
                    onClick={() => addObject(index, material)}>+ Thêm lô khi cần chia</button>
                </> : <>
                  <p className="product-muted">Nhập số lượng và kết quả từng lô. Tổng được tính từ các dòng dưới.</p>
                  {line.lots.map((lot, objectIndex) => <div key={lot.clientLineId} className="material-object">
                    <div className="material-line-heading"><strong>Lô {objectIndex + 1}</strong>
                      <button type="button" className="btn-ara-secondary"
                        onClick={() => changeLine(index, { lots: line.lots.filter((_, row) => row !== objectIndex) })}>Xóa lô</button></div>
                    <div className="material-grid">
                      <label style={fieldset}>Số lượng nhận ({unitShort[material.unit]})
                        <input type="number" min="0" step={['METER', 'KG'].includes(material.unit) ? '.001' : '1'}
                          style={field} value={lot.countedQty ?? ''}
                          onChange={(event) => changeObject(index, 'lots', objectIndex, { countedQty: event.target.value })} /></label>
                      <label style={fieldset}>Kết quả<select style={field} value={lot.quality || ''}
                        onChange={(event) => changeObject(index, 'lots', objectIndex, { quality: event.target.value,
                          allocations: [{ locationId: '', quantity: lot.countedQty }] })}>
                        <option value="">Chưa kiểm tra</option><option value="ACCEPTED">Đạt</option>
                        <option value="REJECTED">Không đạt</option></select></label>
                      {lot.quality === 'REJECTED' && <label style={fieldset}>Lý do
                        <input style={field} value={lot.defectReason || ''}
                          onChange={(event) => changeObject(index, 'lots', objectIndex,
                            { defectReason: event.target.value })} /></label>}
                    </div>
                    {(lot.allocations || []).map((allocation, allocationIndex) =>
                      <div className="material-allocation" key={allocationIndex}>
                        <LocationPicker locations={options.locations} quality={lot.quality} unit={material.unit}
                          value={allocation.locationId} onChange={(value) => changeObject(index, 'lots', objectIndex,
                            { allocations: lot.allocations.map((item, row) => row === allocationIndex ?
                              { ...item, locationId: value } : item) })} />
                        <input type="number" min="0" style={field} aria-label="Số lượng tại vị trí"
                          value={allocation.quantity ?? ''} onChange={(event) => changeObject(index, 'lots', objectIndex,
                            { allocations: lot.allocations.map((item, row) => row === allocationIndex ?
                              { ...item, quantity: event.target.value } : item) })} />
                        <button type="button" className="btn-ara-secondary"
                          onClick={() => changeObject(index, 'lots', objectIndex,
                            { allocations: lot.allocations.filter((_, row) => row !== allocationIndex) })}>Xóa vị trí</button>
                      </div>)}
                    {!lot.allocations?.some((item) => item.locationId) && <small>Chưa chọn vị trí — xử lý sau</small>}
                    <button type="button" className="btn-ara-secondary material-create-link"
                      onClick={() => changeObject(index, 'lots', objectIndex, { allocations: [...(lot.allocations || []),
                        { locationId: '', quantity: '' }] })}>+ Chia thêm vị trí</button>
                  </div>)}
                  <button type="button" className="btn-ara-secondary" onClick={() => addObject(index, material)}>+ Thêm lô</button>
                  <p><strong>Nhận {amount(line.actualQty)} {unitShort[material.unit]} · Đạt {amount(line.acceptedQty)} · Không đạt {amount(line.rejectedQty)}</strong></p>
                </>}
                {(attemptedConfirm || number(line.actualQty) > 0) && lineIssues.length > 0 && <div className="material-message error" role="alert">
                  <ul>{lineIssues.map((issue, issueIndex) => <li key={issueIndex}>{issue}</li>)}</ul></div>}
              </div>; })}
            {attemptedConfirm && headerIssues.length > 0 && <div className="material-message error" role="alert">
              <ul>{headerIssues.map((issue, index) => <li key={index}>{issue}</li>)}</ul></div>}
          </section>
        </>}
        {locked && <section className="material-card"><h2>{receipt?.status === 'COMPLETED' ? 'Phiếu đã xác nhận' : 'Phiếu đã hủy'}</h2>{receipt?.status === 'COMPLETED' && <p className="material-message success">Phiếu đã ghi nhận. In tem cho cây/lô và quét xác nhận cất hàng đạt; hàng lỗi theo dõi để xử lý hoặc trả nhà cung cấp.</p>}<div className="material-grid"><p><strong>Phiếu:</strong> {receipt?.ticketCode}</p><p><strong>NCC:</strong> {options.suppliers.find((item) => String(item._id) === form.supplierId)?.supplierName}</p><p><strong>Chứng từ:</strong> {form.supplierDeliveryCode || '—'}</p><p><strong>Ngày nhận:</strong> {displayDate(form.receivedAt)}</p><p><strong>Người giao:</strong> {form.handoverName}</p><p><strong>Người nhận:</strong> {user?.fullName}</p><p><strong>Kho:</strong> {options.locations.find((item) => String(item._id) === form.receivingLocationId)?.locationCode}</p><p><strong>Tệp đính kèm:</strong> {receipt?.receiptAttachments?.length || 0}</p></div>
          <div className="material-table-wrap"><table><thead><tr><th>Nguyên phụ liệu</th><th>ĐVT</th><th>NCC báo</th><th>Thực nhận</th><th>Đạt</th><th>Không đạt</th><th>Chờ</th><th>Chênh lệch</th><th>Cây/lô</th><th>Kiểm tra</th></tr></thead><tbody>{form.receiptLines.map((line) => { const material = materials.get(String(line.rawMaterialId)); const diff = line.supplierDeclaredQty === '' || line.supplierDeclaredQty == null ? null : number(line.actualQty) - number(line.supplierDeclaredQty);
            return <tr key={line.rawMaterialId}><td>{material?.materialCode} · {material?.materialName}</td><td>{unitNames[material?.unit] || material?.unit}</td><td>{line.supplierDeclaredQty === '' || line.supplierDeclaredQty == null ? '—' : amount(line.supplierDeclaredQty)}</td><td>{amount(line.actualQty)}</td><td>{amount(line.acceptedQty)}</td><td>{amount(line.rejectedQty)}</td><td>{amount(line.pendingQty)}</td><td>{diff == null ? '—' : amount(diff)}</td><td>{line.rolls.length + line.lots.length}</td><td>{line.inspectionConclusion || line.qualityInspectionRef || '—'}</td></tr>; })}</tbody></table></div>
          <p><strong>Barcode dự kiến:</strong> {form.receiptLines.reduce((sum, line) => sum + line.rolls.length + line.lots.length, 0)}{receipt?.status === 'COMPLETED' && <> · Ảnh mã Cloudinary: {barcodeReady}/{labels.length}</>}</p>
          <div><strong>Vị trí đã phân bổ</strong>{form.receiptLines.flatMap((line) => [...line.rolls.map((item) => ({ locationId: item.locationId, quantity: item.lengthMeters, quality: item.quality })), ...line.lots.flatMap((lot) => lot.allocations.map((item) => ({ ...item, quality: lot.quality })))]).map((item, index) => <p key={index}>{options.locations.find((location) => String(location._id) === String(item.locationId))?.locationCode || 'Chưa chọn vị trí'} · {item.quality === 'REJECTED' ? 'Cách ly' : 'Hàng đạt'} · {amount(item.quantity)}</p>)}</div>
          {receipt?.status === 'COMPLETED' && <><div className="material-table-wrap"><table><thead><tr><th>In</th><th>Barcode</th><th>Số lượng</th><th>Kết quả</th><th>Trạng thái</th></tr></thead><tbody>{labels.map((label) => <tr key={label.barcode}><td><input type="checkbox" checked={selectedLabels.includes(label.barcode)} onChange={(event) => setSelectedLabels((current) => event.target.checked ? [...current, label.barcode] : current.filter((item) => item !== label.barcode))} /></td><td>{label.barcode}</td><td>{amount(label.quantity)}</td><td>{label.quality === 'REJECTED' ? 'Không đạt' : 'Đạt'}</td><td>{label.quality === 'REJECTED' ? receipt.supplierReturns?.find((item) => item.objectBarcode === label.barcode)?.status === 'RETURNED' ? 'Đã trả NCC' : receipt.supplierReturns?.some((item) => item.objectBarcode === label.barcode) ? 'Chờ trả NCC' : 'Chờ xử lý' : label.putawayComplete ? 'Đã cất' : 'Chờ cất'}</td></tr>)}</tbody></table></div>
            <div className="material-import-controls"><button type="button" className="btn-ara-primary" onClick={async () => { const tab = window.open('', '_blank'); try { const { printMaterialLabels } = await import('../utils/materialLabelPrint'); printMaterialLabels(labels.filter((item) => !selectedLabels.length || selectedLabels.includes(item.barcode)), tab); } catch (failure) { tab?.close(); setError(failure.message); } }}>In {selectedLabels.length ? `${selectedLabels.length} tem đã chọn` : 'tất cả tem'}</button>{barcodeReady < labels.length && <button type="button" className="btn-ara-secondary" onClick={() => run(async () => { await api.syncBarcodes(receiptId); barcodePollCount.current = 0; await loadLabels(receiptId); setNotice('Đang tạo ảnh barcode còn thiếu.'); })}>Tạo ảnh mã còn thiếu</button>}</div>
            <div className="material-line"><h3>Quét cất hàng đạt</h3><div className="material-grid"><label style={fieldset}>Barcode cây/lô<input style={field} value={putaway.objectBarcode} onChange={(event) => { setPutaway({ ...putaway, objectBarcode: event.target.value.toUpperCase() }); putawayKey.current = crypto.randomUUID(); }} /></label><label style={fieldset}>Barcode vị trí<input style={field} value={putaway.locationBarcode} onChange={(event) => { setPutaway({ ...putaway, locationBarcode: event.target.value.toUpperCase() }); putawayKey.current = crypto.randomUUID(); }} /></label><label style={fieldset}>Số lượng nếu lô chia kệ<input type="number" min="0" style={field} value={putaway.quantity} onChange={(event) => { setPutaway({ ...putaway, quantity: event.target.value }); putawayKey.current = crypto.randomUUID(); }} /></label></div>
              <button type="button" className="btn-ara-primary" disabled={busy || !putaway.objectBarcode || !putaway.locationBarcode} onClick={() => run(async () => { const result = (await api.putaway(receiptId, { ...putaway, quantity: putaway.quantity === '' ? undefined : Number(putaway.quantity), idempotencyKey: putawayKey.current })).data; await loadLabels(receiptId); setPutaway({ objectBarcode: '', locationBarcode: '', quantity: '' }); putawayKey.current = crypto.randomUUID(); setNotice(`Đã cất ${amount(result.putaway.quantity)}.`); })}>Xác nhận cất hàng</button></div>
            {labels.some((item) => item.quality === 'REJECTED') && <div className="material-line"><h3>Hàng không đạt và trả NCC</h3><div className="material-grid"><label style={fieldset}>Barcode<select style={field} value={supplierReturn.objectBarcode} onChange={(event) => setSupplierReturn({ ...supplierReturn, objectBarcode: event.target.value })}><option value="">Chọn cây/lô</option>{labels.filter((item) => item.quality === 'REJECTED').map((item) => <option key={item.barcode}>{item.barcode}</option>)}</select></label><label style={fieldset}>Lý do trả<input style={field} value={supplierReturn.reason} onChange={(event) => setSupplierReturn({ ...supplierReturn, reason: event.target.value })} /></label><label style={fieldset}>Người nhận hàng trả<input style={field} value={supplierReturn.handoverName} onChange={(event) => setSupplierReturn({ ...supplierReturn, handoverName: event.target.value })} /></label></div>
              <div className="material-import-controls"><button type="button" className="btn-ara-secondary" disabled={!supplierReturn.objectBarcode || !supplierReturn.reason.trim() || receipt.supplierReturns?.some((item) => item.objectBarcode === supplierReturn.objectBarcode)} onClick={() => run(async () => { await api.requestSupplierReturn(receiptId, { objectBarcode: supplierReturn.objectBarcode, reason: supplierReturn.reason }); setReceipt((await api.receipt(receiptId)).data.receipt); setNotice('Đã tạo yêu cầu trả NCC.'); })}>Tạo yêu cầu trả</button><button type="button" className="btn-ara-primary" disabled={!supplierReturn.handoverName.trim() || !receipt.supplierReturns?.some((item) => item.objectBarcode === supplierReturn.objectBarcode && item.status === 'WAITING_RETURN')} onClick={() => run(async () => { await api.confirmSupplierReturn(receiptId, { objectBarcode: supplierReturn.objectBarcode, handoverName: supplierReturn.handoverName }); setReceipt((await api.receipt(receiptId)).data.receipt); setNotice('Đã xác nhận bàn giao hàng trả.'); })}>Xác nhận bàn giao</button></div>
              {receipt.supplierReturns?.map((item) => <p key={item.objectBarcode}>{item.objectBarcode} · {item.defectReason} · {item.status === 'RETURNED' ? 'Đã trả NCC' : 'Chờ trả NCC'}</p>)}</div>}
            <details><summary>Xem lịch sử</summary><p>Xác nhận: {receipt.confirmedAt && new Date(receipt.confirmedAt).toLocaleString('vi-VN')}</p>{receipt.putawayEvents?.map((item) => <p key={item.key}>Cất {item.barcode} · {amount(item.quantity)} · {new Date(item.at).toLocaleString('vi-VN')}</p>)}</details>
          </>}
        </section>}
      </fieldset>
      {!locked && <div className="material-actions">
        <button type="button" className="btn-ara-secondary" disabled={busy}
          onClick={() => run(async () => { await saveDraft(); setNotice('Đã lưu nháp.'); })}>Lưu nháp</button>
        <button type="button" className="btn-ara-primary" disabled={busy}
          onClick={confirmReceipt}>Xác nhận nhập kho</button>
      </div>}
    </>}
  </main>;
}
