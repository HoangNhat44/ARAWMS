/*
 * File: SupplierInboundPage.jsx
 * Author: Duy Anh
 * Date: 2026-10-27
 * Description: Receives actual supplier deliveries through inspection, physical roll or lot declaration, location allocation, confirmation, labels, and putaway.
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { materialInboundService as api } from '../services/materialInboundService';
import '../styles/materialInbound.css';

const steps = ['Giao hàng', 'Nguyên phụ liệu và kiểm nhận', 'Chi tiết cây/lô', 'Vị trí kho', 'Xác nhận và in tem'];
const field = { width: '100%', padding: '.65rem .75rem', border: '1px solid var(--ara-border)', borderRadius: 8,
  background: '#fff', color: 'var(--ara-noir)', font: 'inherit' };
const fieldset = { display: 'grid', gap: '.35rem', minWidth: 0 };
const number = (value) => Number(value) || 0;
const amount = (value) => Number(number(value).toFixed(3)).toLocaleString('vi-VN');
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const blankForm = () => ({ supplierId: '', supplierDeliveryCode: '', replacementForTicketId: '', receivedAt: today(), handoverName: '',
  receivingLocationId: '', receiptNote: '', receiptLines: [] });
const blankLine = (rawMaterialId) => ({ rawMaterialId, supplierDeclaredQty: '', actualQty: 0, acceptedQty: 0,
  rejectedQty: 0, pendingQty: 0, defectReason: '', qualityInspectionRef: '', inspectionConclusion: '',
  inspectionNote: '', rolls: [], lots: [] });
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

/** Keeps location selection in zone, rack, shelf order and separates accepted from defective areas. */
function LocationPicker({ locations, quality, unit, value, onChange }) {
  const allowed = locations.filter((item) => item.warehouseType ===
    (quality === 'REJECTED' ? 'DEFECT_QUARANTINE' : 'RAW_MATERIAL') &&
    (!item.capacityUnit || item.capacityUnit === unit));
  const selected = allowed.find((item) => String(item._id) === String(value));
  const [zone, setZone] = useState('');
  const [rack, setRack] = useState('');
  const currentZone = selected?.zoneCode || zone;
  const currentRack = selected?.rackCode || rack;
  const zones = [...new Set(allowed.map((item) => item.zoneCode))];
  const racks = [...new Set(allowed.filter((item) => item.zoneCode === currentZone).map((item) => item.rackCode))];
  const shelves = allowed.filter((item) => item.zoneCode === currentZone && item.rackCode === currentRack);
  return <div className="material-location-picker">
    <select aria-label="Khu" style={field} value={currentZone} onChange={(event) => { setZone(event.target.value); setRack(''); onChange(''); }}>
      <option value="">Chọn khu</option>{zones.map((item) => <option key={item}>{item}</option>)}
    </select>
    <select aria-label="Giá" style={field} value={currentRack} onChange={(event) => { setRack(event.target.value); onChange(''); }}>
      <option value="">Chọn giá</option>{racks.map((item) => <option key={item}>{item}</option>)}
    </select>
    <select aria-label="Kệ" style={field} value={value || ''} onChange={(event) => onChange(event.target.value)}>
      <option value="">Chọn kệ</option>{shelves.map((item) => <option key={item._id} value={item._id}>{item.shelfCode} · {item.locationCode} · còn {amount(number(item.maxCapacity) - number(item.currentOccupancy))} {item.capacityUnit || unit}</option>)}
    </select>
  </div>;
}

/** One screen serves the searchable receipt list and the five direct receiving steps. */
export default function SupplierInboundPage() {
  const { user } = useAuth();
  const [options, setOptions] = useState({ suppliers: [], materials: [], locations: [] });
  const [receipts, setReceipts] = useState([]);
  const [filters, setFilters] = useState({ code: '', supplierId: '', from: '', to: '', status: '', locationId: '' });
  const [view, setView] = useState('list');
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(blankForm);
  const [receipt, setReceipt] = useState(null);
  const [labels, setLabels] = useState([]);
  const [barcodeReady, setBarcodeReady] = useState(0);
  const [barcodePollTick, setBarcodePollTick] = useState(0);
  const [selectedLabels, setSelectedLabels] = useState([]);
  const [materialSearch, setMaterialSearch] = useState('');
  const [materialChoice, setMaterialChoice] = useState('');
  const [deliveryMatches, setDeliveryMatches] = useState([]);
  const [showMaterialForm, setShowMaterialForm] = useState(false);
  const [newMaterial, setNewMaterial] = useState({ materialCode: '', materialName: '', materialType: 'FABRIC',
    category: 'FABRIC_ROLL', unit: 'METER', color: '', widthCm: '', unitCost: 0 });
  const [showLocationForm, setShowLocationForm] = useState(false);
  const [newLocation, setNewLocation] = useState({ locationCode: '', warehouseType: 'RAW_MATERIAL',
    zoneCode: '', rackCode: '', shelfCode: '', maxCapacity: 1000, capacityUnit: 'METER' });
  const [putaway, setPutaway] = useState({ objectBarcode: '', locationBarcode: '', quantity: '' });
  const [supplierReturn, setSupplierReturn] = useState({ objectBarcode: '', reason: '', handoverName: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const confirmationKey = useRef(crypto.randomUUID());
  const putawayKey = useRef(crypto.randomUUID());
  const barcodePollCount = useRef(0);
  const materials = new Map(options.materials.map((item) => [String(item._id), item]));
  const locked = ['COMPLETED', 'CANCELLED'].includes(receipt?.status);
  const receiptId = receipt?._id || receipt?.id;

  const loadOptions = async () => setOptions((await api.options()).data);
  const loadReceipts = async (criteria = filters) => setReceipts((await api.receipts(criteria)).data.receipts);
  const loadLabels = async (id) => {
    const data = (await api.labels(id)).data;
    setLabels(data.labels);
    setBarcodeReady(data.ready);
    setBarcodePollTick((current) => current + 1);
  };

  useEffect(() => {
    loadInitialData(String(user?._id || user?.id || '')).then(([choices, listing]) => {
      setOptions(choices.data); setReceipts(listing.data.receipts);
    }).catch((failure) => setError(failure.message));
  }, [user?._id, user?.id]);

  useEffect(() => {
    if (receipt?.status !== 'COMPLETED' || !labels.length || barcodeReady >= labels.length || barcodePollCount.current >= 12) return undefined;
    const timer = window.setTimeout(() => {
      barcodePollCount.current += 1;
      loadLabels(receipt._id || receipt.id).catch((failure) => setError(failure.message));
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [receipt?._id, receipt?.id, receipt?.status, barcodeReady, labels.length, barcodePollTick]);

  const startReceipt = () => {
    setForm(blankForm()); setReceipt(null); setLabels([]); setBarcodeReady(0); setSelectedLabels([]); setDeliveryMatches([]);
    setStep(0); setView('editor'); setError(''); setNotice(''); confirmationKey.current = crypto.randomUUID();
  };

  const openReceipt = async (id) => {
    setBusy(true); setError('');
    try {
      const data = (await api.receipt(id)).data;
      const saved = data.receipt;
      setOptions((current) => ({ ...current, materials: [...current.materials,
        ...data.materials.filter((item) => !current.materials.some((known) => String(known._id) === String(item._id)))] }));
      setReceipt(saved);
      setForm({ supplierId: String(saved.supplierId), supplierDeliveryCode: saved.supplierDeliveryCode || '',
        replacementForTicketId: String(saved.replacementForTicketId || ''),
        receivedAt: saved.receivedAt?.slice(0, 10) || today(), handoverName: saved.handoverName || '',
        receivingLocationId: String(saved.receivingLocationId || ''), receiptNote: saved.receiptNote || '',
        receiptLines: saved.receiptLines || [] });
      barcodePollCount.current = 0;
      if (saved.status === 'COMPLETED') await loadLabels(id);
      else { setLabels([]); setBarcodeReady(0); }
      setSelectedLabels([]); setStep(saved.status === 'COMPLETED' ? 4 : 0); setView('editor');
      confirmationKey.current = crypto.randomUUID();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };

  const saveDraft = async () => {
    const result = receipt ? await api.update(receiptId, { ...form, expectedVersion: receipt.receiptVersion })
      : await api.create(form);
    setReceipt(result.data.receipt);
    setForm((current) => ({ ...current, receiptLines: result.data.receipt.receiptLines }));
    await loadReceipts();
    return result.data.receipt;
  };

  const run = async (task) => {
    setBusy(true); setError(''); setNotice('');
    try { await task(); } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };

  const checkDeliveryCode = async () => {
    if (!form.supplierId || !form.supplierDeliveryCode.trim()) { setDeliveryMatches([]); return; }
    try { setDeliveryMatches((await api.deliveryMatches(form.supplierId, form.supplierDeliveryCode, receiptId)).data.matches); }
    catch (failure) { setError(failure.message); }
  };

  const changeLine = (index, patch) => setForm((current) => ({ ...current, receiptLines: current.receiptLines.map((line, row) => {
    if (row !== index) return line;
    const next = { ...line, ...patch };
    if (['actualQty', 'acceptedQty', 'rejectedQty'].some((key) => key in patch))
      next.pendingQty = Math.max(0, number(next.actualQty) - number(next.acceptedQty) - number(next.rejectedQty));
    return next;
  }) }));
  const changeObject = (lineIndex, kind, objectIndex, patch) => setForm((current) => ({ ...current,
    receiptLines: current.receiptLines.map((line, index) => index === lineIndex ? { ...line,
      [kind]: line[kind].map((object, row) => row === objectIndex ? { ...object, ...patch } : object) } : line) }));
  const addObject = (index, material) => {
    const kind = material.materialType === 'FABRIC' ? 'rolls' : 'lots';
    const object = kind === 'rolls' ? { clientLineId: crypto.randomUUID(), supplierRollCode: '', lotCode: '',
      widthCm: material.widthCm || '', lengthMeters: '', weightKg: '', quality: 'ACCEPTED', defectReason: '', locationId: '' }
      : { clientLineId: crypto.randomUUID(), supplierLotCode: '', packageUnit: '', packageCount: '', unitsPerPackage: '',
        countedQty: '', quality: 'ACCEPTED', defectReason: '', allocations: [{ locationId: '', quantity: '' }] };
    changeLine(index, { [kind]: [...form.receiptLines[index][kind], object] });
  };

  const importRolls = async (lineIndex, file) => {
    if (!file) return;
    await run(async () => {
      const result = (await api.previewRolls(file)).data;
      if (result.errors.length) throw new Error(result.errors.map((item) => `Dòng ${item.row}: ${item.message}`).join('; '));
      changeLine(lineIndex, { rolls: [...form.receiptLines[lineIndex].rolls, ...result.rolls] });
      setNotice(`Đã đọc ${result.rolls.length} cây. Hãy lưu nháp để giữ dữ liệu.`);
    });
  };

  return <main className="material-inbound-page">
    <p className="product-muted"><Link to="/">Kho nguyên phụ liệu</Link> / Phiếu nhập / {view === 'list' ? 'Danh sách' : 'Chi tiết'}</p>
    <div className="material-inbound-heading"><div><h1>Nhập nguyên phụ liệu</h1><p>Nhận hàng thực tế do nhà cung cấp giao.</p></div>
      {view === 'editor' && <span className="product-badge active">{statusText(receipt?.status)}</span>}</div>
    {error && <p className="material-message error" role="alert">{error}</p>}
    {notice && <p className="material-message success" role="status">{notice}</p>}

    {view === 'list' ? <section className="material-card"><div className="material-line-heading"><h2>Danh sách phiếu nhập</h2>
      <button type="button" className="btn-ara-primary" onClick={startReceipt}>+ Tạo phiếu nhập</button></div>
      <div className="material-grid">
        <label style={fieldset}>Mã phiếu<input style={field} value={filters.code} onChange={(event) => setFilters({ ...filters, code: event.target.value })} /></label>
        <label style={fieldset}>Nhà cung cấp<select style={field} value={filters.supplierId} onChange={(event) => setFilters({ ...filters, supplierId: event.target.value })}><option value="">Tất cả</option>{options.suppliers.map((item) => <option key={item._id} value={item._id}>{item.supplierName}</option>)}</select></label>
        <label style={fieldset}>Từ ngày<input type="date" style={field} value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} /></label>
        <label style={fieldset}>Đến ngày<input type="date" style={field} value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} /></label>
        <label style={fieldset}>Trạng thái<select style={field} value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option value="">Tất cả</option>{['DRAFT', 'WAITING_QC', 'READY_TO_CONFIRM', 'COMPLETED', 'CANCELLED'].map((item) => <option key={item} value={item}>{statusText(item)}</option>)}</select></label>
        <label style={fieldset}>Kho nhận<select style={field} value={filters.locationId} onChange={(event) => setFilters({ ...filters, locationId: event.target.value })}><option value="">Tất cả</option>{options.locations.filter((item) => item.warehouseType === 'RAW_MATERIAL').map((item) => <option key={item._id} value={item._id}>{item.locationCode}</option>)}</select></label>
      </div><button type="button" className="btn-ara-secondary" disabled={busy} onClick={() => run(() => loadReceipts(filters))}>Lọc phiếu</button>
      <div className="material-table-wrap"><table><thead><tr><th>Mã phiếu</th><th>Ngày nhận</th><th>NCC</th><th>Chứng từ</th><th>Kho nhận</th><th>Người tạo</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{receipts.map((item) => <tr key={item._id}>
        <td>{item.ticketCode}</td><td>{item.receivedAt?.slice(0, 10)}</td><td>{item.supplierId?.supplierName}</td>
        <td>{item.supplierDeliveryCode || '—'}</td><td>{item.receivingLocationId?.locationCode}</td>
        <td>{item.createdByManagerId?.fullName || '—'}</td><td>{statusText(item.status)}</td>
        <td><button type="button" className="btn-ara-secondary" disabled={busy} onClick={() => openReceipt(item._id)}>{item.status === 'COMPLETED' ? 'Xem / in tem' : 'Mở phiếu'}</button></td>
      </tr>)}</tbody></table>{!receipts.length && <p>Chưa có phiếu nhập phù hợp.</p>}</div>
    </section> : <>
      <div className="material-steps">{steps.map((label, index) => <button type="button" key={label} className={step === index ? 'current' : ''}
        disabled={busy || index > step || (index > 0 && !receipt)} onClick={() => setStep(index)}><strong>{index + 1}</strong>{label}</button>)}</div>
      <fieldset disabled={busy || (locked && step !== 4)} className="material-editor">
        {step === 0 && <section className="material-card"><h2>1. Thông tin giao hàng</h2><div className="material-grid">
          <label style={fieldset}>Mã phiếu<input style={field} readOnly value={receipt?.ticketCode || 'Tạo khi lưu nháp'} /></label>
          <label style={fieldset}>Loại phiếu<input style={field} readOnly value="Nhập nguyên phụ liệu từ nhà cung cấp" /></label>
          <label style={fieldset}>Nhà cung cấp *<select style={field} value={form.supplierId} onChange={(event) => { setForm({ ...form, supplierId: event.target.value }); setDeliveryMatches([]); }}><option value="">Chọn NCC</option>{options.suppliers.map((item) => <option key={item._id} value={item._id}>{item.supplierCode} · {item.supplierName}</option>)}</select></label>
          <label style={fieldset}>Mã chứng từ giao<input style={field} value={form.supplierDeliveryCode} onChange={(event) => setForm({ ...form, supplierDeliveryCode: event.target.value })} onBlur={checkDeliveryCode} /></label>
          <label style={fieldset}>Phiếu trả gốc nếu là hàng đổi<select style={field} value={form.replacementForTicketId} onChange={(event) => setForm({ ...form, replacementForTicketId: event.target.value })}><option value="">Không phải hàng đổi</option>{receipts.filter((item) => String(item.supplierId?._id || item.supplierId) === form.supplierId && item.supplierReturns?.some((entry) => entry.status === 'RETURNED')).map((item) => <option key={item._id} value={item._id}>{item.ticketCode}</option>)}</select></label>
          <label style={fieldset}>Ngày nhận *<input type="date" max={today()} style={field} value={form.receivedAt} onChange={(event) => setForm({ ...form, receivedAt: event.target.value })} /></label>
          <label style={fieldset}>Kho nhận *<select style={field} value={form.receivingLocationId} onChange={(event) => setForm({ ...form, receivingLocationId: event.target.value })}><option value="">Chọn vị trí kho nguyên phụ liệu</option>{options.locations.filter((item) => item.warehouseType === 'RAW_MATERIAL').map((item) => <option key={item._id} value={item._id}>{item.locationCode}</option>)}</select></label>
          <label style={fieldset}>Người giao *<input style={field} value={form.handoverName} onChange={(event) => setForm({ ...form, handoverName: event.target.value })} /></label>
          <label style={fieldset}>Người nhận<input style={field} readOnly value={user?.fullName || ''} /></label>
          <label style={fieldset}>Ghi chú<input style={field} maxLength={500} value={form.receiptNote} onChange={(event) => setForm({ ...form, receiptNote: event.target.value })} /></label>
        </div>{deliveryMatches.length > 0 && <p className="material-message error">Chứng từ này đã xuất hiện trên {deliveryMatches.map((item) => item.ticketCode).join(', ')}. Hãy đối chiếu trước khi tiếp tục.</p>}
          <div><strong>Tệp đính kèm</strong><p className="product-muted">Lưu nháp trước khi tải phiếu giao, ảnh hoặc biên bản (PDF/JPEG/PNG/WebP, tối đa 5 MB).</p>
            {receipt && <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) run(async () => { const updated = (await api.uploadAttachment(receiptId, file)).data.receipt; setReceipt(updated); setNotice('Đã đính kèm chứng từ.'); }); }} />}
            {(receipt?.receiptAttachments || []).map((item) => <p key={item.publicId}><a href={item.url} target="_blank" rel="noreferrer">{item.fileName}</a></p>)}
          </div></section>}

        {step === 1 && <section className="material-card"><h2>2. Nguyên phụ liệu và kiểm nhận</h2><p className="product-muted">Chọn từ danh mục. Thực nhận = đạt + không đạt + chờ kiểm tra.</p>
          <div className="material-grid"><label style={fieldset}>Tìm nguyên phụ liệu<input style={field} value={materialSearch} onChange={(event) => setMaterialSearch(event.target.value)} placeholder="Mã, tên, màu, quy cách" /></label>
            <label style={fieldset}>Nguyên phụ liệu<select style={field} value={materialChoice} onChange={(event) => setMaterialChoice(event.target.value)}><option value="">Chọn nguyên phụ liệu</option>{options.materials.filter((item) => !form.receiptLines.some((line) => String(line.rawMaterialId) === String(item._id)) &&
              `${item.materialCode} ${item.materialName} ${item.color || ''} ${item.widthCm || ''} ${item.category}`.toLowerCase().includes(materialSearch.toLowerCase())).map((item) =>
              <option key={item._id} value={item._id}>{item.materialCode} · {item.materialName} · {item.color || '—'} {item.widthCm ? `· ${item.widthCm} cm` : ''} · {item.unit}</option>)}</select></label></div>
          <div className="material-import-controls"><button type="button" className="btn-ara-secondary" disabled={!materialChoice} onClick={() => { setForm({ ...form, receiptLines: [...form.receiptLines, blankLine(materialChoice)] }); setMaterialChoice(''); }}>+ Thêm nguyên phụ liệu</button>
            <button type="button" className="btn-ara-secondary" onClick={() => setShowMaterialForm(!showMaterialForm)}>Tạo nguyên phụ liệu mới</button></div>
          {showMaterialForm && <div className="material-line"><h3>Tạo danh mục nguyên phụ liệu</h3><div className="material-grid">
            {[['materialCode', 'Mã'], ['materialName', 'Tên'], ['color', 'Màu'], ['widthCm', 'Khổ (cm)'], ['unitCost', 'Đơn giá']].map(([key, label]) => <label key={key} style={fieldset}>{label}<input style={field} type={['widthCm', 'unitCost'].includes(key) ? 'number' : 'text'} value={newMaterial[key]} onChange={(event) => setNewMaterial({ ...newMaterial, [key]: event.target.value })} /></label>)}
            <label style={fieldset}>Loại<select style={field} value={newMaterial.materialType} onChange={(event) => setNewMaterial({ ...newMaterial, materialType: event.target.value, category: event.target.value === 'FABRIC' ? 'FABRIC_ROLL' : 'BUTTON', unit: event.target.value === 'FABRIC' ? 'METER' : 'PIECE' })}><option value="FABRIC">Vải</option><option value="AUXILIARY">Phụ liệu</option></select></label>
            <label style={fieldset}>Danh mục<select style={field} value={newMaterial.category} onChange={(event) => setNewMaterial({ ...newMaterial, category: event.target.value })}>{(newMaterial.materialType === 'FABRIC' ? ['FABRIC_ROLL'] : ['BUTTON', 'THREAD', 'ZIPPER', 'CARE_LABEL', 'PACKAGING_BAG']).map((item) => <option key={item}>{item}</option>)}</select></label>
            <label style={fieldset}>Đơn vị tồn<select style={field} value={newMaterial.unit} onChange={(event) => setNewMaterial({ ...newMaterial, unit: event.target.value })}>{(newMaterial.materialType === 'FABRIC' ? ['METER'] : ['KG', 'PIECE', 'SPOOL', 'BOX']).map((item) => <option key={item}>{item}</option>)}</select></label>
          </div><button type="button" className="btn-ara-primary" onClick={() => run(async () => { const created = (await api.createMaterial(newMaterial)).data.material; await loadOptions(); setMaterialChoice(created._id); setShowMaterialForm(false); setNotice('Đã tạo danh mục. Hãy thêm nguyên phụ liệu vào phiếu.'); })}>Lưu danh mục</button></div>}
          {form.receiptLines.map((line, index) => { const material = materials.get(String(line.rawMaterialId)); if (!material) return null;
            const diff = line.supplierDeclaredQty === '' || line.supplierDeclaredQty == null ? null : number(line.actualQty) - number(line.supplierDeclaredQty);
            return <div className="material-line" key={line.rawMaterialId}><div className="material-line-heading"><h3>{material.materialCode} · {material.materialName} <small>({material.color || '—'}, {material.unit})</small></h3><button type="button" className="btn-ara-secondary" onClick={() => setForm({ ...form, receiptLines: form.receiptLines.filter((_, row) => row !== index) })}>Xóa dòng</button></div>
              <div className="material-grid">{[['supplierDeclaredQty', 'NCC báo giao'], ['actualQty', 'Thực nhận'], ['acceptedQty', 'Đạt'], ['rejectedQty', 'Không đạt']].map(([key, label]) => <label style={fieldset} key={key}>{label}<input type="number" min="0" step={['METER', 'KG'].includes(material.unit) ? '.001' : '1'} style={field} value={line[key] ?? ''} onChange={(event) => changeLine(index, { [key]: event.target.value })} /></label>)}
                <label style={fieldset}>Chờ kiểm tra<input style={field} readOnly value={line.pendingQty} /></label><label style={fieldset}>Chênh lệch<input style={field} readOnly value={diff == null ? 'Không có số NCC báo giao' : amount(diff)} /></label>
                <label style={fieldset}>Kết luận kiểm tra<input style={field} value={line.inspectionConclusion || ''} onChange={(event) => changeLine(index, { inspectionConclusion: event.target.value })} /></label>
                <label style={fieldset}>Người kiểm tra<input style={field} readOnly value={line.inspectedByUserId?.fullName || user?.fullName || ''} /></label>
                <label style={fieldset}>Thời gian kiểm tra<input style={field} readOnly value={line.inspectedAt ? new Date(line.inspectedAt).toLocaleString('vi-VN') : 'Ghi khi lưu kết quả'} /></label>
                <label style={fieldset}>Tham chiếu KCS<input style={field} value={line.qualityInspectionRef || ''} onChange={(event) => changeLine(index, { qualityInspectionRef: event.target.value })} /></label>
                <label style={fieldset}>Lý do không đạt<input style={field} value={line.defectReason || ''} onChange={(event) => changeLine(index, { defectReason: event.target.value })} /></label>
                <label style={fieldset}>Ghi chú kiểm tra<input style={field} value={line.inspectionNote || ''} onChange={(event) => changeLine(index, { inspectionNote: event.target.value })} /></label>
              </div><p className="product-muted">{diff == null ? 'Chưa có số NCC báo giao' : diff < 0 ? `Thiếu giao ${amount(-diff)} ${material.unit}` : diff > 0 ? `Thừa giao ${amount(diff)} ${material.unit}` : 'Giao đúng số lượng'} · Không đạt {amount(line.rejectedQty)} {material.unit}</p>
            </div>; })}
        </section>}

        {step === 2 && <section className="material-card"><h2>3. Chi tiết cây vải / lô phụ liệu</h2><p className="product-muted">Mỗi cây/lô có mã dòng ổn định. Barcode nội bộ tạo khi xác nhận phiếu.</p>
          {form.receiptLines.map((line, lineIndex) => { const material = materials.get(String(line.rawMaterialId)); if (!material) return null;
            const fabric = material.materialType === 'FABRIC'; const kind = fabric ? 'rolls' : 'lots';
            return <div className="material-line" key={line.rawMaterialId}><div className="material-line-heading"><h3>{material.materialCode} · {material.materialName}</h3><button type="button" className="btn-ara-secondary" onClick={() => addObject(lineIndex, material)}>+ Thêm {fabric ? 'cây' : 'lô'}</button></div>
              {fabric && <div className="material-import-controls"><button type="button" className="btn-ara-secondary" onClick={() => run(async () => { const blob = await api.rollTemplate(); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'fabric-roll-import.xlsx'; a.click(); URL.revokeObjectURL(url); })}>Tải Excel mẫu</button><label>Nhập cây từ Excel <input type="file" accept=".xlsx" onChange={(event) => { importRolls(lineIndex, event.target.files?.[0]); event.target.value = ''; }} /></label></div>}
              {line[kind].map((object, objectIndex) => <div className="material-object" key={object.clientLineId}><div className="material-line-heading"><strong>{fabric ? 'Cây' : 'Lô'} #{objectIndex + 1} · Barcode sẽ tạo khi xác nhận</strong><button type="button" className="btn-ara-secondary" onClick={() => changeLine(lineIndex, { [kind]: line[kind].filter((_, row) => row !== objectIndex) })}>Xóa</button></div>
                <div className="material-grid"><label style={fieldset}>Mã {fabric ? 'cây' : 'lô'} NCC<input style={field} value={fabric ? object.supplierRollCode || '' : object.supplierLotCode || ''} onChange={(event) => changeObject(lineIndex, kind, objectIndex, { [fabric ? 'supplierRollCode' : 'supplierLotCode']: event.target.value })} /></label>
                  {fabric ? <><label style={fieldset}>Lô nhuộm<input style={field} value={object.lotCode || ''} onChange={(event) => changeObject(lineIndex, kind, objectIndex, { lotCode: event.target.value })} /></label><label style={fieldset}>Màu<input style={field} readOnly value={material.color || ''} /></label><label style={fieldset}>Khổ (cm)<input type="number" min=".001" step=".001" style={field} value={object.widthCm || ''} onChange={(event) => changeObject(lineIndex, kind, objectIndex, { widthCm: event.target.value })} /></label><label style={fieldset}>Chiều dài (m)<input type="number" min=".001" step=".001" style={field} value={object.lengthMeters || ''} onChange={(event) => changeObject(lineIndex, kind, objectIndex, { lengthMeters: event.target.value })} /></label><label style={fieldset}>Cân nặng (kg)<input type="number" min="0" step=".001" style={field} value={object.weightKg || ''} onChange={(event) => changeObject(lineIndex, kind, objectIndex, { weightKg: event.target.value })} /></label></>
                    : <><label style={fieldset}>Đơn vị bao gói<input style={field} value={object.packageUnit || ''} onChange={(event) => changeObject(lineIndex, kind, objectIndex, { packageUnit: event.target.value })} /></label><label style={fieldset}>Số bao gói<input type="number" min="0" step="1" style={field} value={object.packageCount || ''} onChange={(event) => changeObject(lineIndex, kind, objectIndex, { packageCount: event.target.value })} /></label><label style={fieldset}>Số đơn vị / bao<input type="number" min="0" step={['METER', 'KG'].includes(material.unit) ? '.001' : '1'} style={field} value={object.unitsPerPackage || ''} onChange={(event) => changeObject(lineIndex, kind, objectIndex, { unitsPerPackage: event.target.value })} /></label><label style={fieldset}>Số quy đổi<input style={field} readOnly value={amount(number(object.packageCount) * number(object.unitsPerPackage))} /></label><label style={fieldset}>Số thực kiểm<input type="number" min="0" step={['METER', 'KG'].includes(material.unit) ? '.001' : '1'} style={field} value={object.countedQty || ''} onChange={(event) => changeObject(lineIndex, kind, objectIndex, { countedQty: event.target.value })} /></label></>}
                  <label style={fieldset}>Kết quả<select style={field} value={object.quality || 'ACCEPTED'} onChange={(event) => changeObject(lineIndex, kind, objectIndex, { quality: event.target.value, locationId: '', allocations: fabric ? undefined : [{ locationId: '', quantity: '' }] })}><option value="ACCEPTED">Đạt</option><option value="REJECTED">Không đạt</option></select></label>
                  {object.quality === 'REJECTED' && <label style={fieldset}>Lý do không đạt<input style={field} value={object.defectReason || ''} onChange={(event) => changeObject(lineIndex, kind, objectIndex, { defectReason: event.target.value })} /></label>}</div>
              </div>)}<p className="product-muted">{line[kind].length} {fabric ? 'cây' : 'lô'} · Tổng {amount(line[kind].reduce((sum, item) => sum + number(fabric ? item.lengthMeters : item.countedQty), 0))} {material.unit} · Đạt {amount(line[kind].filter((item) => item.quality === 'ACCEPTED').reduce((sum, item) => sum + number(fabric ? item.lengthMeters : item.countedQty), 0))} · Không đạt {amount(line[kind].filter((item) => item.quality === 'REJECTED').reduce((sum, item) => sum + number(fabric ? item.lengthMeters : item.countedQty), 0))}</p>
              {(() => { const codes = line[kind].map((item) => String(fabric ? item.supplierRollCode || '' : item.supplierLotCode || '').trim().toUpperCase()).filter(Boolean);
                return new Set(codes).size < codes.length && <p className="material-message error">Có mã {fabric ? 'cây' : 'lô'} NCC trùng trong dòng này. Hãy đối chiếu trước khi xác nhận.</p>; })()}
            </div>; })}</section>}

        {step === 3 && <section className="material-card"><h2>4. Phân bổ vị trí</h2><p className="product-muted">Hàng đạt vào kệ nguyên phụ liệu; hàng không đạt vào khu cách ly. Tổng phân bổ của lô phải khớp số thực kiểm.</p>
          {form.receiptLines.map((line, lineIndex) => { const material = materials.get(String(line.rawMaterialId)); if (!material) return null;
            const fabric = material.materialType === 'FABRIC'; const kind = fabric ? 'rolls' : 'lots';
            return <div className="material-line" key={line.rawMaterialId}><h3>{material.materialCode} · {material.materialName}</h3>{line[kind].map((object, objectIndex) => <div className="material-object" key={object.clientLineId}><strong>{fabric ? 'Cây' : 'Lô'} #{objectIndex + 1} · {object.quality === 'REJECTED' ? 'Không đạt' : 'Đạt'}</strong>
              {fabric ? <LocationPicker locations={options.locations} quality={object.quality} unit={material.unit} value={object.locationId} onChange={(value) => changeObject(lineIndex, kind, objectIndex, { locationId: value })} />
                : <div>{(object.allocations || []).map((allocation, allocationIndex) => <div className="material-allocation" key={allocationIndex}><LocationPicker locations={options.locations} quality={object.quality} unit={material.unit} value={allocation.locationId} onChange={(value) => changeObject(lineIndex, kind, objectIndex, { allocations: object.allocations.map((item, row) => row === allocationIndex ? { ...item, locationId: value } : item) })} /><input aria-label="Số lượng phân bổ" type="number" min="0" step={['METER', 'KG'].includes(material.unit) ? '.001' : '1'} style={field} value={allocation.quantity} onChange={(event) => changeObject(lineIndex, kind, objectIndex, { allocations: object.allocations.map((item, row) => row === allocationIndex ? { ...item, quantity: event.target.value } : item) })} /><button type="button" className="btn-ara-secondary" onClick={() => changeObject(lineIndex, kind, objectIndex, { allocations: object.allocations.filter((_, row) => row !== allocationIndex) })}>Xóa</button></div>)}<button type="button" className="btn-ara-secondary" onClick={() => changeObject(lineIndex, kind, objectIndex, { allocations: [...(object.allocations || []), { locationId: '', quantity: '' }] })}>+ Chia thêm kệ</button></div>}
            </div>)}</div>; })}
          <button type="button" className="btn-ara-secondary" onClick={() => setShowLocationForm(!showLocationForm)}>+ Tạo vị trí kho</button>
          {showLocationForm && <div className="material-line"><h3>Tạo vị trí</h3><div className="material-grid">{['locationCode', 'zoneCode', 'rackCode', 'shelfCode'].map((key) => <label style={fieldset} key={key}>{key}<input style={field} value={newLocation[key]} onChange={(event) => setNewLocation({ ...newLocation, [key]: event.target.value.toUpperCase() })} /></label>)}
            <label style={fieldset}>Loại khu<select style={field} value={newLocation.warehouseType} onChange={(event) => setNewLocation({ ...newLocation, warehouseType: event.target.value })}><option value="RAW_MATERIAL">Hàng đạt</option><option value="DEFECT_QUARANTINE">Cách ly</option></select></label><label style={fieldset}>Sức chứa<input type="number" min="1" style={field} value={newLocation.maxCapacity} onChange={(event) => setNewLocation({ ...newLocation, maxCapacity: event.target.value })} /></label><label style={fieldset}>Đơn vị<select style={field} value={newLocation.capacityUnit} onChange={(event) => setNewLocation({ ...newLocation, capacityUnit: event.target.value })}>{['METER', 'KG', 'PIECE', 'SPOOL', 'BOX'].map((item) => <option key={item}>{item}</option>)}</select></label>
          </div><button type="button" className="btn-ara-primary" onClick={() => run(async () => { const created = (await api.createLocation(newLocation)).data.location; await loadOptions(); setShowLocationForm(false); setNotice(`Đã tạo vị trí ${created.locationCode}.`); })}>Lưu vị trí</button></div>}
        </section>}

        {step === 4 && <section className="material-card"><h2>5. Tổng kết và xác nhận</h2><div className="material-grid"><p><strong>Phiếu:</strong> {receipt?.ticketCode}</p><p><strong>NCC:</strong> {options.suppliers.find((item) => String(item._id) === form.supplierId)?.supplierName}</p><p><strong>Chứng từ:</strong> {form.supplierDeliveryCode || '—'}</p><p><strong>Ngày nhận:</strong> {form.receivedAt}</p><p><strong>Người giao:</strong> {form.handoverName}</p><p><strong>Người nhận:</strong> {user?.fullName}</p><p><strong>Kho:</strong> {options.locations.find((item) => String(item._id) === form.receivingLocationId)?.locationCode}</p><p><strong>Tệp đính kèm:</strong> {receipt?.receiptAttachments?.length || 0}</p></div>
          <div className="material-table-wrap"><table><thead><tr><th>Nguyên phụ liệu</th><th>ĐVT</th><th>NCC báo</th><th>Thực nhận</th><th>Đạt</th><th>Không đạt</th><th>Chờ</th><th>Chênh lệch</th><th>Cây/lô</th><th>Kiểm tra</th></tr></thead><tbody>{form.receiptLines.map((line) => { const material = materials.get(String(line.rawMaterialId)); const diff = line.supplierDeclaredQty === '' || line.supplierDeclaredQty == null ? null : number(line.actualQty) - number(line.supplierDeclaredQty);
            return <tr key={line.rawMaterialId}><td>{material?.materialCode} · {material?.materialName}</td><td>{material?.unit}</td><td>{line.supplierDeclaredQty === '' || line.supplierDeclaredQty == null ? '—' : amount(line.supplierDeclaredQty)}</td><td>{amount(line.actualQty)}</td><td>{amount(line.acceptedQty)}</td><td>{amount(line.rejectedQty)}</td><td>{amount(line.pendingQty)}</td><td>{diff == null ? '—' : amount(diff)}</td><td>{line.rolls.length + line.lots.length}</td><td>{line.inspectionConclusion || line.qualityInspectionRef || '—'}</td></tr>; })}</tbody></table></div>
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
      <div className="material-actions"><button type="button" className="btn-ara-secondary" disabled={busy} onClick={() => { setView('list'); loadReceipts().catch((failure) => setError(failure.message)); }}>Danh sách phiếu</button>
        {!locked && <><button type="button" className="btn-ara-secondary" disabled={busy || !receipt} onClick={() => run(async () => { if (!window.confirm('Hủy phiếu nháp này?')) return; await api.cancel(receiptId, { expectedVersion: receipt.receiptVersion }); setView('list'); await loadReceipts(); })}>Hủy phiếu</button>
          <button type="button" className="btn-ara-secondary" disabled={busy} onClick={() => run(async () => { await saveDraft(); setNotice('Đã lưu nháp.'); })}>Lưu nháp</button>
          <button type="button" className="btn-ara-secondary" disabled={busy || step === 0} onClick={() => setStep(step - 1)}>Quay lại</button>
          {step < 4 ? <button type="button" className="btn-ara-primary" disabled={busy} onClick={() => run(async () => { await saveDraft(); setStep(step + 1); })}>Tiếp tục</button>
            : <button type="button" className="btn-ara-primary" disabled={busy || !receipt} onClick={() => run(async () => { if (!window.confirm('Xác nhận nhập phiếu này? Hệ thống sẽ tạo barcode, ghi nhận tồn và lịch sử giao dịch.')) return;
              const confirmed = (await api.confirm(receiptId, { expectedVersion: receipt.receiptVersion, idempotencyKey: confirmationKey.current })).data.receipt;
              setReceipt(confirmed); barcodePollCount.current = 0; await loadLabels(receiptId); setNotice('Đã xác nhận nhập kho. Hàng đạt chờ quét cất vào kệ.'); })}>Xác nhận nhập kho</button>}
        </>}
      </div>
    </>}
  </main>;
}
