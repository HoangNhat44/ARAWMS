/*
 * File: DirectMaterialReceiptModal.jsx
 * Description: Receives direct purchases and technician-request deliveries through the shared stock, label, and putaway flow.
 */
import { useEffect, useRef, useState } from 'react';
import { materialInboundService as api } from '../services/materialInboundService';
import { MATERIAL_UNIT_OPTIONS, isFractionalMaterialUnit } from '../utils/materialUnits';

const field = { width: '100%', padding: '10px', border: '1px solid #ded0bf', borderRadius: 8, background: '#fff' };
const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 14 };
const id = (value) => String(value?._id || value?.id || value || '');
/** Formats a stored timestamp as the viewer's calendar date (YYYY-MM-DD), not the UTC date. */
const localDate = (value) => {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? ''
    : new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const today = () => localDate();
const qty = (value) => Number(value || 0);
const round = (value) => Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;
const withReceiptObjects = (lines = []) => lines.map((line) => ({ ...line,
  rolls: Array.isArray(line.rolls) ? line.rolls : [],
  lots: Array.isArray(line.lots) ? line.lots.map((lot) => ({ ...lot,
    allocations: Array.isArray(lot.allocations) ? lot.allocations : [] })) : [] }));
const unitName = Object.fromEntries(MATERIAL_UNIT_OPTIONS.map(({ value, shortLabel }) => [value, shortLabel]));
const rackOptionGroups = (locations) => {
  const groups = new Map();
  for (const location of locations) {
    const key = `${location.zoneCode}:${location.rackCode || ''}`;
    if (!groups.has(key)) groups.set(key, { rackCode: location.rackCode || '—',
      rackName: location.rackName || location.rackCode || 'Chưa đặt tên', locations: [] });
    groups.get(key).locations.push(location);
  }
  return [...groups.values()].sort((a, b) => a.rackCode.localeCompare(b.rackCode, 'vi'));
};
const rackBinOptionLabel = (location) =>
  `Kệ ${location.rackCode || '—'} · ${location.rackName || location.rackCode || 'Chưa đặt tên'} — Ô ${location.locationCode || location.displayName || '—'}`;
const statusName = { DRAFT: 'Nháp', WAITING_QC: 'Chờ kiểm tra', READY_TO_CONFIRM: 'Sẵn sàng xác nhận', COMPLETED: 'Đã xác nhận' };
const storageKey = (user) => `arawms-material-direct-drafts:${id(user)}`;

export function getDirectLocalDrafts(user) {
  try { return JSON.parse(localStorage.getItem(storageKey(user)) || '[]'); } catch { return []; }
}
function keepLocalDraft(user, entry) {
  const drafts = getDirectLocalDrafts(user).filter((item) => item.form.draftKey !== entry.form.draftKey);
  localStorage.setItem(storageKey(user), JSON.stringify([entry, ...drafts]));
}
function removeLocalDraft(user, key) {
  localStorage.setItem(storageKey(user), JSON.stringify(getDirectLocalDrafts(user)
    .filter((item) => item.form.draftKey !== key)));
}
const blankForm = (user, locations) => {
  const available = locations.filter((item) => item.warehouseType === 'RAW_MATERIAL' && item.layoutBin && item.zoneCode === 'A');
  const preferred = available.find((item) => id(item) === id(user?.currentWarehouseId || user?.warehouseId)) || available[0];
  return { receiptSource: 'DIRECT', draftKey: crypto.randomUUID(), receivedAt: today(),
    receivingLocationId: id(preferred), supplierId: '', purchaseSourceName: '',
    purchasedByName: user?.fullName || '', receiptNote: '', receiptLines: [] };
};
const blankLine = (material) => ({ clientLineId: crypto.randomUUID(), rawMaterialId: id(material),
  unitCost: '', actualQty: 0, rejectedQty: 0, acceptedQty: 0, pendingQty: 0, defectReason: '',
  inspectionConclusion: '', rolls: material.materialType === 'FABRIC' ? [{ clientLineId: crypto.randomUUID(),
    widthCm: material.widthCm || '', lengthMeters: '', quality: '', locationId: '' }] : [], lots: [] });

/** Builds a warehouse allocation row from the technician-approved request snapshot. */
function requestReceiptLine(source, index) {
  const material = source.rawMaterialId;
  const acceptedQty = qty(source.acceptedQty ?? source.requestedQty);
  const sourceKey = String(source.clientLineId || `request-line-${index}`);
  const fabric = material?.materialType === 'FABRIC';
  const rolls = fabric ? (source.rolls?.length ? source.rolls : [{
    clientLineId: `${sourceKey}-roll-1`, widthCm: material.widthCm || '', lengthMeters: acceptedQty,
  }]).map((roll) => ({ ...roll, clientLineId: roll.clientLineId || crypto.randomUUID(),
    quality: 'ACCEPTED', defectReason: '', locationId: id(roll.locationId) })) : [];
  const lots = fabric ? [] : (source.lots?.length ? source.lots : [{
    clientLineId: `${sourceKey}-lot-1`, countedQty: acceptedQty,
    allocations: [{ locationId: '', quantity: acceptedQty }],
  }]).map((lot) => ({ ...lot, clientLineId: lot.clientLineId || crypto.randomUUID(),
    countedQty: Number(lot.countedQty ?? acceptedQty), quality: 'ACCEPTED', defectReason: '',
    allocations: (lot.allocations?.length ? lot.allocations : [{ quantity: lot.countedQty ?? acceptedQty }])
      .map((allocation) => ({ ...allocation, locationId: id(allocation.locationId) })) }));
  return { clientLineId: sourceKey, requestLineId: sourceKey, rawMaterialId: id(material),
    supplierId: id(source.supplierId), supplierNameSnapshot: source.supplierNameSnapshot || source.supplierId?.supplierName || '',
    unitCost: source.unitCost ?? '', actualQty: acceptedQty, acceptedQty, rejectedQty: 0, pendingQty: 0,
    inspectionConclusion: source.inspectionConclusion || 'Đã kiểm tra',
    qualityInspectionRef: source.inspectionRef || '', inspectedAt: source.inspectedAt,
    inspectedByUserId: id(source.inspectedByUserId), rolls, lots };
}

/** Each accessory line creates at most one barcode per quality lot, never one barcode per piece. */
function updateLine(line, patch, material) {
  const next = { ...line, ...patch };
  if (material?.materialType === 'FABRIC') {
    const rolls = next.rolls || [];
    next.actualQty = round(rolls.reduce((sum, roll) => sum + qty(roll.lengthMeters), 0));
    next.acceptedQty = round(rolls.filter((roll) => roll.quality === 'ACCEPTED')
      .reduce((sum, roll) => sum + qty(roll.lengthMeters), 0));
    next.rejectedQty = round(rolls.filter((roll) => roll.quality === 'REJECTED')
      .reduce((sum, roll) => sum + qty(roll.lengthMeters), 0));
    next.pendingQty = round(next.actualQty - next.acceptedQty - next.rejectedQty);
    next.inspectionConclusion = next.actualQty && !next.pendingQty ? 'Đã kiểm tra' : '';
    next.defectReason = rolls.find((roll) => roll.quality === 'REJECTED')?.defectReason || '';
  } else {
    next.acceptedQty = round(Math.max(0, qty(next.actualQty) - qty(next.rejectedQty)));
    next.pendingQty = 0;
    next.inspectionConclusion = next.actualQty ? 'Đã kiểm tra' : '';
    next.lots = ['ACCEPTED', 'REJECTED'].flatMap((quality) => {
      const amount = quality === 'ACCEPTED' ? next.acceptedQty : next.rejectedQty;
      if (!amount) return [];
      const previous = (next.lots || []).find((lot) => lot.quality === quality);
      return [{ clientLineId: previous?.clientLineId || crypto.randomUUID(), countedQty: amount, quality,
        defectReason: quality === 'REJECTED' ? next.defectReason : '',
        allocations: [{ locationId: previous?.allocations?.[0]?.locationId || '', quantity: amount }] }];
    });
  }
  return next;
}

export default function DirectMaterialReceiptModal({ target, options, user, onClose, onChanged, onMaterialCreated }) {
  const [form, setForm] = useState(() => blankForm(user, options.locations));
  const [inboundRequest, setInboundRequest] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [savedMaterials, setSavedMaterials] = useState([]);
  const [labels, setLabels] = useState([]);
  const [detailLabel, setDetailLabel] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [discrepancyReason, setDiscrepancyReason] = useState('');
  const [notice, setNotice] = useState('');
  const [materialSearch, setMaterialSearch] = useState('');
  const [newMaterialOpen, setNewMaterialOpen] = useState(false);
  const [newMaterial, setNewMaterial] = useState({ materialCode: '', materialName: '', materialType: 'AUXILIARY',
    category: 'BUTTON', unit: 'PIECE', unitCost: 0, color: '', widthCm: '' });
  const [putaway, setPutaway] = useState({ objectBarcode: '', locationBarcode: '', quantity: '' });
  const [availableLocations, setAvailableLocations] = useState(options.locations);
  const [locationOpen, setLocationOpen] = useState(false);
  const [newLocation, setNewLocation] = useState({ locationCode: '', rackCode: '', shelfCode: '',
    maxCapacity: '', capacityUnit: '' });
  const confirmationKey = useRef(crypto.randomUUID());
  const putawayKey = useRef(crypto.randomUUID());
  const busyRef = useRef(false);
  const savedSignature = useRef(JSON.stringify(form));
  const materials = new Map([...options.materials, ...savedMaterials].map((item) => [id(item), item]));
  const locked = receipt?.status === 'COMPLETED' || receipt?.status === 'CANCELLED';
  const requestMode = Boolean(form.inboundRequestId);
  const receiving = availableLocations.find((item) => id(item) === form.receivingLocationId);
  const acceptedBins = availableLocations.filter((item) => item.warehouseType === 'RAW_MATERIAL' &&
    item.layoutBin && item.zoneCode === 'A' && item.rackCode && item.rackActive !== false);
  const acceptedRackGroups = rackOptionGroups(acceptedBins);
  const rejectedBins = availableLocations.filter((item) => item.warehouseType === 'DEFECT_QUARANTINE');
  const totals = new Map();
  for (const line of form.receiptLines) {
    const unit = materials.get(id(line.rawMaterialId))?.unit;
    if (unit) totals.set(unit, round((totals.get(unit) || 0) + qty(line.acceptedQty)));
  }

  useEffect(() => {
    setAvailableLocations((current) => [...new Map([...current, ...options.locations]
      .map((item) => [id(item), item])).values()]);
  }, [options.locations]);

  useEffect(() => {
    let active = true;
    api.options().then((result) => {
      if (!active) return;
      const latestLocations = result.data?.locations || [];
      setAvailableLocations((current) => [...new Map([...current, ...latestLocations]
        .map((item) => [id(item), item])).values()]);
    }).catch((failure) => { if (active) setError(failure.message); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (target.kind !== 'request' || form.receivingLocationId || !form.receiptLines.length) return;
    const unit = materials.get(id(form.receiptLines[0].rawMaterialId))?.unit;
    const bin = acceptedBins.find((item) => !item.capacityUnit || item.capacityUnit === unit);
    if (bin) setForm((current) => ({ ...current, receivingLocationId: id(bin) }));
  }, [target.kind, form.receivingLocationId, form.receiptLines, availableLocations, options.materials]);

  useEffect(() => {
    if (target.kind !== 'new' || form.receivingLocationId) return;
    const initial = blankForm(user, options.locations).receivingLocationId;
    if (initial) setForm((current) => { const next = { ...current, receivingLocationId: initial };
      if (savedSignature.current === JSON.stringify(current)) savedSignature.current = JSON.stringify(next);
      return next; });
  }, [target.kind, options.locations, form.receivingLocationId]);

  useEffect(() => {
    if (target.kind === 'new') return;
    if (target.kind === 'request') {
      let active = true;
      const openRequest = async () => {
        const request = target.request;
        setInboundRequest(request);
        const linked = (await api.receipts({ inboundRequestId: id(request), page: 1 })).data.receipts || [];
        const savedSummary = linked.find((item) => !['COMPLETED', 'CANCELLED'].includes(item.status));
        const savedDetails = savedSummary ? (await api.receipt(id(savedSummary))).data : null;
        const saved = savedDetails?.receipt;
        const local = getDirectLocalDrafts(user).find((item) => id(item.form.inboundRequestId) === id(request));
        const requestLines = request.requestLines.filter((line) => qty(line.remainingQty ?? line.acceptedQty ?? line.requestedQty) > 0 && line.rawMaterialId)
          .map((line, index) => requestReceiptLine(line, index));
        const matchingUnits = request.requestLines.map((line) => line.rawMaterialId?.unit).filter(Boolean);
        const requestedBin = options.locations.find((item) => id(item) === id(request.receivingLocationId) &&
          item.warehouseType === 'RAW_MATERIAL');
        const suggestedBin = requestedBin || options.locations.find((item) =>
          item.warehouseType === 'RAW_MATERIAL' && (item.layoutBin && item.zoneCode === 'A' || request.ticketType === 'INBOUND_REQUEST') &&
          (request.ticketType === 'INBOUND_REQUEST' || !item.capacityUnit || matchingUnits.every((unit) => unit === item.capacityUnit)));
        const supplierIds = [...new Set(request.requestLines.map((line) => id(line.supplierId)).filter(Boolean))];
        const sourceValues = { supplierId: supplierIds.length === 1 ? supplierIds[0] : '',
          purchaseSourceName: supplierIds.length === 1 ? request.requestLines.find((line) => id(line.supplierId) === supplierIds[0])?.supplierId?.supplierName || '' : '',
          receivingLocationId: id(suggestedBin), receivedAt: today() };
        let next;
        let linkedReceipt = saved || null;
        if (saved) {
          setReceipt(saved);
          setSavedMaterials(savedDetails.materials || []);
          next = { receiptSource: 'DIRECT', draftKey: saved.draftKey, inboundRequestId: id(request),
            supplierId: id(saved.supplierId), purchaseSourceName: saved.purchaseSourceName || '',
            purchasedByName: saved.purchasedByName || user?.fullName || '',
            receivedAt: (saved.receivedAt && localDate(saved.receivedAt)) || today(),
            receivingLocationId: id(saved.receivingLocationId), receiptNote: saved.receiptNote || '',
            receiptLines: withReceiptObjects(saved.receiptLines || []) };
          if (saved.status === 'COMPLETED') setLabels((await api.labels(id(saved))).data.labels || []);
        } else {
          next = local?.form ? { ...local.form,
            receiptLines: withReceiptObjects(local.form.receiptLines?.length ? local.form.receiptLines : requestLines) } :
            { ...blankForm(user, options.locations), ...sourceValues, inboundRequestId: id(request),
              receiptLines: requestLines };
          linkedReceipt = local?.receipt || null;
          if (local?.confirmationKey) confirmationKey.current = local.confirmationKey;
          setReceipt(linkedReceipt);
        }
        if (!active) return;
        setForm(next); savedSignature.current = JSON.stringify(next);
      };
      openRequest().catch((failure) => { if (active) setError(failure.message); });
      return () => { active = false; };
    }
    const load = async () => {
      try {
        let saved;
        if (target.kind === 'local') {
          saved = getDirectLocalDrafts(user).find((item) => item.form.draftKey === target.id);
          if (!saved) throw new Error('Không tìm thấy nháp trên thiết bị.');
          setForm({ ...saved.form, receiptLines: withReceiptObjects(saved.form.receiptLines || []) });
          setReceipt(saved.receipt || null);
          if (saved.form.inboundRequestId) api.technicianRequests().then((result) =>
            setInboundRequest(result.data.requests.find((item) => id(item) === id(saved.form.inboundRequestId)) || null))
            .catch(() => {});
          confirmationKey.current = saved.confirmationKey || crypto.randomUUID();
          savedSignature.current = JSON.stringify({ ...saved.form,
            receiptLines: withReceiptObjects(saved.form.receiptLines || []) });
        } else {
          const response = (await api.receipt(target.id)).data;
          saved = response.receipt;
          setSavedMaterials(response.materials || []);
          setReceipt(saved);
          if (saved.inboundRequestId) api.technicianRequests().then((result) =>
            setInboundRequest(result.data.requests.find((item) => id(item) === id(saved.inboundRequestId)) || null))
            .catch(() => {});
          const restored = { receiptSource: 'DIRECT', draftKey: saved.draftKey,
            inboundRequestId: id(saved.inboundRequestId) || undefined,
            supplierId: id(saved.supplierId), purchaseSourceName: saved.purchaseSourceName || '',
            purchasedByName: saved.purchasedByName || user?.fullName || '',
            receivedAt: (saved.receivedAt && localDate(saved.receivedAt)) || today(),
            receivingLocationId: id(saved.receivingLocationId), receiptNote: saved.receiptNote || '',
            receiptLines: withReceiptObjects(saved.receiptLines || []) };
          setForm(restored); savedSignature.current = JSON.stringify(restored);
          if (saved.status === 'COMPLETED') setLabels((await api.labels(target.id)).data.labels);
        }
      } catch (failure) { setError(failure.message); }
    };
    load();
  }, [target.kind, target.id]);

  const change = (patch) => setForm((current) => ({ ...current, ...patch }));
  const changeLine = (index, patch) => setForm((current) => ({ ...current,
    receiptLines: current.receiptLines.map((line, row) => row === index
      ? updateLine(line, patch, materials.get(id(line.rawMaterialId))) : line) }));
  // Older drafts and plan tickets saved rolls without a width; fill it from the material catalog when known.
  useEffect(() => {
    if (locked || !form.receiptLines?.length) return;
    let filled = false;
    const receiptLines = form.receiptLines.map((line) => {
      const width = Number(materials.get(id(line.rawMaterialId))?.widthCm) || 0;
      if (!width || !line.rolls?.some((roll) => !(Number(roll.widthCm) > 0))) return line;
      filled = true;
      return { ...line, rolls: line.rolls.map((roll) => Number(roll.widthCm) > 0 ? roll : { ...roll, widthCm: width }) };
    });
    if (filled) setForm((current) => ({ ...current, receiptLines }));
  }, [form.receiptLines, options.materials, savedMaterials, locked]);
  const changeRoll = (lineIndex, rollIndex, patch) => {
    const line = form.receiptLines[lineIndex];
    changeLine(lineIndex, { rolls: line.rolls.map((roll, row) => row === rollIndex ? { ...roll, ...patch } : roll) });
  };
  const addMaterial = (material) => {
    change({ receiptLines: [...form.receiptLines, blankLine(material)] });
    setMaterialSearch('');
  };
  const saveLocal = (currentForm = form, currentReceipt = receipt) => {
    keepLocalDraft(user, { form: currentForm, receipt: currentReceipt,
      confirmationKey: confirmationKey.current, savedAt: new Date().toISOString() });
    savedSignature.current = JSON.stringify(currentForm);
    onChanged();
  };
  const saveDraft = async () => {
    try {
      let saved;
      if (receipt) saved = (await api.update(id(receipt), { ...form,
        expectedVersion: receipt.receiptVersion })).data.receipt;
      else {
        try { saved = (await api.create(form)).data.receipt; }
        catch (failure) {
          if (failure.code !== 'DRAFT_KEY_REUSED') throw failure;
          const recovered = (await api.receiptByDraftKey(form.draftKey)).data.receipt;
          if (recovered.status === 'COMPLETED') { setReceipt(recovered); return recovered; }
          saved = (await api.update(id(recovered), { ...form,
            expectedVersion: recovered.receiptVersion })).data.receipt;
        }
      }
      setReceipt(saved);
      savedSignature.current = JSON.stringify(form);
      removeLocalDraft(user, form.draftKey);
      onChanged();
      return saved;
    } catch (failure) {
      if (failure.status || failure.response?.status) throw failure;
      saveLocal();
      setNotice('Đã lưu nháp trên thiết bị. Cần kết nối để lưu lên máy chủ và xác nhận.');
      return null;
    }
  };
  const run = async (task) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(''); setNotice('');
    try { await task(); } catch (failure) { setError(failure.message); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const close = () => {
    if (!locked && JSON.stringify(form) !== savedSignature.current &&
      !window.confirm('Phiếu có dữ liệu chưa lưu. Đóng phiếu?')) return;
    onClose();
  };
  const confirm = () => run(async () => {
    if (!requestMode && !form.purchaseSourceName.trim()) throw new Error('Cần nhập tên nhà cung cấp.');
    if (!form.receiptLines.length || form.receiptLines.some((line) => !qty(line.actualQty)))
      throw new Error('Mỗi dòng cần có số lượng thực nhận lớn hơn 0.');
    for (const line of form.receiptLines) {
      const material = materials.get(id(line.rawMaterialId));
      if (material?.materialType === 'FABRIC' && line.rolls?.some((roll) => !(Number(roll.widthCm) > 0)))
        throw new Error(`Cần nhập khổ vải (cm) cho từng cây vải của ${material.materialName || 'vật tư'}.`);
      if (material?.materialType === 'FABRIC' && material.requiresWeightKg && line.rolls?.some((roll) => !(Number(roll.weightKg) > 0)))
        throw new Error(`Cần nhập cân nặng (kg) cho từng cây vải của ${material.materialName || 'vật tư'}.`);
      if (requestMode) {
        const objects = material?.materialType === 'FABRIC' ? line.rolls : line.lots;
        if (!objects?.length || objects.some((item) => material.materialType === 'FABRIC'
          ? !item.locationId : !item.allocations?.length || item.allocations.some((allocation) => !allocation.locationId)))
          throw new Error('Cần chọn vị trí cho từng cây vải hoặc lô nguyên phụ liệu.');
        continue;
      }
      if (qty(line.rejectedQty) > qty(line.actualQty)) throw new Error('Số không đạt vượt số thực nhận.');
      if (qty(line.rejectedQty) && !line.defectReason?.trim()) throw new Error('Hàng không đạt cần ghi lý do.');
      const objects = material?.materialType === 'FABRIC' ? line.rolls : line.lots;
      if (!objects?.length || objects.some((item) => material.materialType === 'FABRIC'
        ? !qty(item.lengthMeters) || !item.quality || item.quality === 'ACCEPTED' && !item.locationId ||
          item.quality === 'REJECTED' && (!item.locationId || !item.defectReason)
        : !qty(item.countedQty) || item.allocations.some((allocation) => !allocation.locationId)))
        throw new Error('Cần kiểm tra số lượng và chọn vị trí dự kiến cho từng cây hoặc lô.');
    }
    saveLocal();
    const saved = await saveDraft();
    if (!saved) throw new Error('Chưa có kết nối máy chủ. Nháp vẫn được lưu trên thiết bị.');
    if (saved.status === 'COMPLETED') { setLabels((await api.labels(id(saved))).data.labels); return; }
    if (saved.status !== 'READY_TO_CONFIRM') throw new Error('Phiếu chưa đủ điều kiện xác nhận.');
    const confirmed = (await api.confirm(id(saved), { expectedVersion: saved.receiptVersion,
      idempotencyKey: confirmationKey.current })).data.receipt;
    setReceipt(confirmed);
    setLabels((await api.labels(id(confirmed))).data.labels);
    removeLocalDraft(user, form.draftKey); onChanged();
    setNotice('Đã xác nhận nhập kho. In tem và quét cất hàng vào vị trí dự kiến.');
  });

  return <div className="material-reference-overlay material-direct-overlay" role="dialog" aria-modal="true" aria-label={requestMode ? 'Nhập nguyên phụ liệu theo yêu cầu' : 'Nhập nguyên phụ liệu ngoài kế hoạch'}>
    <div className="material-reference-sheet">
      <div className="material-reference-sheet-head"><div><h2>{requestMode ? `Yêu cầu ${inboundRequest?.ticketCode || ''} · Phiếu ${receipt?.ticketCode || 'chưa cấp'}` : receipt?.ticketCode || 'Nhập nguyên phụ liệu ngoài kế hoạch'}</h2>
        <p>{requestMode ? 'Chỉ nhận các vật tư thuộc yêu cầu; trạng thái yêu cầu tính theo số lượng đạt đã xác nhận.' : 'Ghi nhận lần mua trực tiếp; tồn kho chỉ tăng sau khi xác nhận.'}</p></div>
        <button type="button" className="material-reference-close" aria-label="Đóng" onClick={close}>×</button></div>
      <div className="material-reference-sheet-content material-editor">
        {error && <p className="material-message error" role="alert">{error}</p>}
        {notice && <p className="material-message success" role="status">{notice}</p>}
        <section className="material-card"><h3>1. {requestMode ? 'Thông tin yêu cầu đã kiểm tra' : 'Thông tin nhận hàng'}</h3>
          {requestMode && <div style={grid}><div><span>Mã yêu cầu</span><strong>{inboundRequest?.ticketCode || '—'}</strong></div>
            <div><span>Người gửi</span><strong>{inboundRequest?.requestedByTechnicianId?.fullName || '—'}</strong></div>
            <div><span>Ngày gửi</span><strong>{inboundRequest?.requestedAt ? new Date(inboundRequest.requestedAt).toLocaleString('vi-VN') : '—'}</strong></div>
            <div><span>Ngày kiểm tra</span><strong>{inboundRequest?.inspectionCompletedAt ? new Date(inboundRequest.inspectionCompletedAt).toLocaleString('vi-VN') : '—'}</strong></div>
          </div>}
          <div style={grid}>
          {requestMode ? <div><span>Kho nhận</span><strong>Kho nguyên vật liệu</strong></div> : <label>Kho nhận<select style={field} value={form.receivingLocationId} disabled={locked} onChange={(event) => change({ receivingLocationId: event.target.value })}>
            <option value="">Chọn kho nhận</option>{acceptedRackGroups.map((group) => <optgroup key={`${group.rackCode}:${group.rackName}`}
              label={`Kệ ${group.rackCode} · ${group.rackName}`}>{group.locations.map((item) =>
                <option key={id(item)} value={id(item)}>{rackBinOptionLabel(item)}</option>)}</optgroup>)}</select></label>}
          <label>Ngày nhận<input style={field} type="date" max={today()} value={form.receivedAt} disabled={locked}
            onChange={(event) => change({ receivedAt: event.target.value })} /></label>
          {!requestMode && <label>Tên nhà cung cấp<input style={field} list="direct-supplier-options" value={form.purchaseSourceName} disabled={locked}
            placeholder="Chọn nhà cung cấp hoặc nhập tên" onChange={(event) => {
              const value = event.target.value; const supplier = options.suppliers.find((item) => item.supplierName === value);
              change({ purchaseSourceName: value, supplierId: supplier ? id(supplier) : '' }); }} />
            <datalist id="direct-supplier-options">{options.suppliers.map((item) =>
              <option key={id(item)} value={item.supplierName} />)}</datalist></label>}
          <label>Ghi chú<input style={field} value={form.receiptNote || ''} disabled={locked}
            onChange={(event) => change({ receiptNote: event.target.value })} /></label>
        </div>
          {!requestMode && !locked && <><button type="button" className="btn-ara-secondary" onClick={() => {
            setNewLocation((current) => ({ ...current,
              capacityUnit: current.capacityUnit || materials.get(id(form.receiptLines[0]?.rawMaterialId))?.unit || 'PIECE' }));
            setLocationOpen((current) => !current);
          }}>{locationOpen ? 'Ẩn tạo vị trí' : 'Thêm vị trí Khu A'}</button>
            {requestMode && form.receiptLines.some((line) => !acceptedBins.some((bin) =>
              !bin.capacityUnit || bin.capacityUnit === materials.get(id(line.rawMaterialId))?.unit)) &&
              <p>Chưa có ô kho nguyên phụ liệu phù hợp đơn vị vật tư. Hãy chọn hoặc thêm vị trí trước khi nhập kho.</p>}
            {locationOpen && <div style={grid}>
              {[['locationCode', 'Mã vị trí'], ['rackCode', 'Mã kệ'], ['shelfCode', 'Mã ô'],
                ['maxCapacity', 'Sức chứa']].map(([key, label]) => <label key={key}>{label}
                <input style={field} value={newLocation[key]} onChange={(event) =>
                  setNewLocation((current) => ({ ...current, [key]: event.target.value }))} /></label>)}
              <label>Đơn vị sức chứa<select style={field} value={newLocation.capacityUnit} onChange={(event) =>
                setNewLocation((current) => ({ ...current, capacityUnit: event.target.value }))}>
                {MATERIAL_UNIT_OPTIONS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
              </select></label>
              <button type="button" className="btn-ara-primary" disabled={busy} onClick={() => run(async () => {
                const location = (await api.createLocation({ ...newLocation, warehouseType: 'RAW_MATERIAL',
                  zoneCode: 'A' })).data.location;
                setAvailableLocations((current) => [...current, location]);
                change({ receivingLocationId: id(location) }); setLocationOpen(false);
                setNotice(`Đã tạo vị trí ${location.locationCode}. Chọn vị trí này cho cây/lô vật tư.`);
              })}>Lưu vị trí</button>
            </div>}</>}
        </section>
        <section className="material-card"><h3>2. Nguyên phụ liệu thực nhận</h3>
          {requestMode && !locked && inboundRequest && <div className="material-reference-add-controls">
            <p>Chọn vật tư có trong lần giao này. Phần chưa giao vẫn nằm trong yêu cầu.</p>
            {inboundRequest.requestLines.filter((item) => qty(item.remainingQty) > 0 && item.rawMaterialId &&
              !form.receiptLines.some((line) => id(line.rawMaterialId) === id(item.rawMaterialId)))
              .map((item) => <button type="button" className="btn-ara-secondary"
                key={id(item.rawMaterialId)} onClick={() => addMaterial(item.rawMaterialId)}>
                + {item.rawMaterialId.materialName} · còn {qty(item.remainingQty)} {unitName[item.rawMaterialId.unit] || item.rawMaterialId.unit}
              </button>)}
          </div>}
          {!locked && !requestMode && <div className="material-reference-add-controls"><label>Tìm mã hoặc tên nguyên phụ liệu…
            <input style={field} list="direct-material-options" value={materialSearch} onChange={(event) => {
              const value = event.target.value; setMaterialSearch(value);
              const material = options.materials.find((item) => `${item.materialCode} · ${item.materialName}` === value);
              if (material) addMaterial(material); }} />
            <datalist id="direct-material-options">{options.materials.map((item) =>
              <option key={id(item)} value={`${item.materialCode} · ${item.materialName}`} />)}</datalist></label>
            <button type="button" className="btn-ara-secondary" onClick={() => setNewMaterialOpen((value) => !value)}>Tạo nguyên phụ liệu mới</button></div>}
          {newMaterialOpen && !locked && <div className="material-line" style={grid}>
            {['materialCode', 'materialName', 'color', 'widthCm'].map((key) => <label key={key}>{({ materialCode: 'Mã', materialName: 'Tên', color: 'Màu', widthCm: 'Khổ vải (cm)' })[key]}
              <input style={field} value={newMaterial[key]} onChange={(event) => setNewMaterial({ ...newMaterial, [key]: event.target.value })} /></label>)}
            <label>Loại<select style={field} value={newMaterial.materialType} onChange={(event) => setNewMaterial({ ...newMaterial,
              materialType: event.target.value, category: event.target.value === 'FABRIC' ? 'FABRIC_ROLL' : 'BUTTON',
              unit: event.target.value === 'FABRIC' ? 'METER' : 'PIECE' })}><option value="AUXILIARY">Phụ liệu</option><option value="FABRIC">Vải</option></select></label>
            <label>Danh mục<select style={field} value={newMaterial.category} onChange={(event) => setNewMaterial({ ...newMaterial, category: event.target.value })}>
              {(newMaterial.materialType === 'FABRIC' ? ['FABRIC_ROLL'] :
                ['BUTTON', 'THREAD', 'ZIPPER', 'CARE_LABEL', 'PACKAGING_BAG', 'NEEDLE', 'CHALK', 'MARKER', 'ACCESSORY', 'OTHER'])
                .map((value) => <option key={value}>{value}</option>)}</select></label>
            <label>Đơn vị<select style={field} value={newMaterial.unit} onChange={(event) => setNewMaterial({ ...newMaterial, unit: event.target.value })}>
              {MATERIAL_UNIT_OPTIONS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}</select></label>
            <button type="button" className="btn-ara-primary" onClick={() => run(async () => {
              const material = (await api.createMaterial(newMaterial)).data.material;
              onMaterialCreated(material); addMaterial(material); setNewMaterialOpen(false);
            })}>Lưu và thêm</button></div>}
          {form.receiptLines.map((line, index) => { const material = materials.get(id(line.rawMaterialId));
            if (!material) return null;
            const fabric = material.materialType === 'FABRIC';
            const eligibleBins = acceptedBins.filter((item) => !item.capacityUnit || item.capacityUnit === material.unit);
            const eligibleQuarantine = rejectedBins.filter((item) => !item.capacityUnit || item.capacityUnit === material.unit);
            return <div className="material-line material-entry" key={line.clientLineId}>
              <div className="material-line-heading"><div><h3>{material.materialName}{material.color ? ` · ${material.color}` : ''}</h3>
                <small>{material.materialCode} · {material.widthCm ? `${material.widthCm} cm · ` : ''}{unitName[material.unit] || material.unit}</small></div>
                {!locked && !requestMode && <button type="button" className="btn-ara-secondary" onClick={() => {
                  if (qty(line.actualQty) && !window.confirm(`Xóa dòng ${material.materialName} đã nhập dữ liệu?`)) return;
                  change({ receiptLines: form.receiptLines.filter((_, row) => row !== index) });
                }}>{requestMode ? 'Bỏ khỏi lần nhận' : 'Xóa dòng'}</button>}</div>
              <div className="material-reference-line-summary">
              {requestMode && <><div><span>Nhà cung cấp</span><strong>{line.supplierNameSnapshot || 'Chưa xác định'}</strong></div>
                <div><span>Đơn giá</span><strong>{line.unitCost === '' || line.unitCost == null ? 'Chưa có dữ liệu' : Number(line.unitCost).toLocaleString('vi-VN')}</strong></div>
                <div><span>Ngày kiểm tra</span><strong>{line.inspectedAt ? new Date(line.inspectedAt).toLocaleDateString('vi-VN') : '—'}</strong></div></>}
              {requestMode ? <div><span>Số lượng đạt</span><strong>{qty(line.acceptedQty)} {unitName[material.unit]}</strong></div> : fabric ? <div><span>Thực nhận</span><strong>{qty(line.actualQty)} {unitName[material.unit] || material.unit}</strong></div> :
                  <label>Thực nhận ({unitName[material.unit]})<input style={field} type="number" min="0" disabled={locked}
                    step={isFractionalMaterialUnit(material.unit) ? '.001' : '1'} value={line.actualQty}
                    onChange={(event) => changeLine(index, { actualQty: event.target.value })} /></label>}
              {!requestMode && (fabric ? <div><span>Không đạt</span><strong>{qty(line.rejectedQty)} m</strong></div> :
                  <label>Không đạt<input style={field} type="number" min="0" disabled={locked}
                    step={isFractionalMaterialUnit(material.unit) ? '.001' : '1'} value={line.rejectedQty}
                    onChange={(event) => changeLine(index, { rejectedQty: event.target.value })} /></label>)}
                <div><span>Nhập kho</span><strong className="material-reference-accepted">{qty(line.acceptedQty)} {unitName[material.unit]}</strong></div>
              </div>
              {fabric ? <><p className="material-reference-detail-heading">Chi tiết cây vải</p>
                {line.rolls.map((roll, rollIndex) => <div key={roll.clientLineId} style={grid}>
                  {requestMode && <small>Cây {roll.supplierRollCode || roll.lotCode || rollIndex + 1} · {roll.lengthMeters} m</small>}
                  <label>Cây {rollIndex + 1} · chiều dài (m)<input style={field} type="number" min="0" step=".001" disabled={locked || requestMode}
                    value={roll.lengthMeters ?? ''} onChange={(event) => changeRoll(index, rollIndex, { lengthMeters: event.target.value })} /></label>
                  <label>Khổ vải (cm)<input style={field} type="number" min="0" step=".1" disabled={locked}
                    value={Number(roll.widthCm) > 0 ? roll.widthCm : ''} placeholder="Bắt buộc"
                    onChange={(event) => changeRoll(index, rollIndex, { widthCm: event.target.value })} /></label>
                  {!requestMode && <label>Kết quả<select style={field} value={roll.quality || ''} disabled={locked} onChange={(event) =>
                    changeRoll(index, rollIndex, { quality: event.target.value, locationId: '' })}>
                    <option value="">Chưa kiểm tra</option><option value="ACCEPTED">Đạt</option><option value="REJECTED">Không đạt</option></select></label>}
                  <label>Vị trí dự kiến<select style={field} value={id(roll.locationId)} disabled={locked} onChange={(event) => changeRoll(index, rollIndex, { locationId: event.target.value })}>
                    <option value="">Chọn ô</option>{rackOptionGroups(roll.quality === 'REJECTED' ? eligibleQuarantine : eligibleBins)
                      .map((group) => <optgroup key={`${group.rackCode}:${group.rackName}`} label={`Kệ ${group.rackCode} · ${group.rackName}`}>
                        {group.locations.map((item) => <option key={id(item)} value={id(item)}>{rackBinOptionLabel(item)}</option>)}
                      </optgroup>)}</select></label>
                  {material.requiresWeightKg && <label>Cân nặng (kg)<input style={field} type="number" min="0" step=".001" disabled={locked}
                    value={roll.weightKg ?? ''} onChange={(event) => changeRoll(index, rollIndex, { weightKg: event.target.value })} /></label>}
                  {roll.quality === 'REJECTED' && <label>Lý do không đạt<input style={field} disabled={locked}
                    value={roll.defectReason || ''} onChange={(event) => changeRoll(index, rollIndex, { defectReason: event.target.value })} /></label>}
                  {!locked && !requestMode && line.rolls.length > 1 && <button type="button" onClick={() => {
                    if (window.confirm(`Xóa cây ${rollIndex + 1}?`)) changeLine(index, { rolls: line.rolls.filter((_, row) => row !== rollIndex) });
                  }}>Xóa cây</button>}
                </div>)}
                {!locked && !requestMode && <button type="button" className="btn-ara-secondary" onClick={() => changeLine(index, { rolls: [...line.rolls,
                  { clientLineId: crypto.randomUUID(), widthCm: material.widthCm || '', lengthMeters: '', quality: '', locationId: '' }] })}>+ Thêm cây vải</button>}
              </> : <>{line.lots.filter((lot) => requestMode || lot.quality === 'ACCEPTED').map((lot, lotIndex) => <label key={lot.clientLineId}>
                {requestMode ? `Vị trí dự kiến · lô ${lot.supplierLotCode || lotIndex + 1} · ${lot.countedQty} ${unitName[material.unit]}` : `Vị trí dự kiến trong Khu ${receiving?.zoneCode || 'A'}`}<select style={field} disabled={locked}
                value={id(lot.allocations?.[0]?.locationId)} onChange={(event) => changeLine(index, { lots: line.lots.map((item) => item.clientLineId === lot.clientLineId
                  ? { ...item, allocations: [{ locationId: event.target.value, quantity: item.countedQty }] } : item) })}>
                <option value="">Chọn ô lưu trữ</option>{rackOptionGroups(eligibleBins).map((group) =>
                  <optgroup key={`${group.rackCode}:${group.rackName}`} label={`Kệ ${group.rackCode} · ${group.rackName}`}>
                    {group.locations.map((item) => <option key={id(item)} value={id(item)}>{rackBinOptionLabel(item)}</option>)}
                  </optgroup>)}</select></label>)}
                {qty(line.rejectedQty) > 0 && <><label>Lý do không đạt<input style={field} disabled={locked} value={line.defectReason || ''}
                  onChange={(event) => changeLine(index, { defectReason: event.target.value })} /></label>
                  <label>Ô cách ly<select style={field} disabled={locked}
                    value={id(line.lots.find((lot) => lot.quality === 'REJECTED')?.allocations?.[0]?.locationId)}
                    onChange={(event) => changeLine(index, { lots: line.lots.map((lot) => lot.quality === 'REJECTED'
                      ? { ...lot, allocations: [{ locationId: event.target.value, quantity: lot.countedQty }] } : lot) })}>
                    <option value="">Chọn ô cách ly</option>{eligibleQuarantine.map((item) => <option key={id(item)} value={id(item)}>{item.locationCode}</option>)}</select></label></>}
              </>}
            </div>; })}
        </section>
        <section className="material-reference-summary"><div><h3>3. Tóm tắt nhập kho</h3>
          <p>{new Set(form.receiptLines.map((line) => id(line.rawMaterialId))).size} loại nguyên phụ liệu · {form.receiptLines.length} dòng nhập</p>
          <p>{[...totals].map(([unit, amount]) => `${amount} ${unitName[unit] || unit}`).join(' · ') || 'Chưa có hàng nhập kho'}</p></div>
        </section>
        {locked && receipt?.status === 'COMPLETED' && <section className="material-card"><h3>In tem và xếp hàng</h3>
          <p>{labels.length} nguồn nhập đã có barcode. Phụ liệu nhỏ dùng một barcode cho mỗi lô; vải dùng barcode riêng cho từng cây.</p>
          <div className="material-table-wrap"><table className="material-inline-table"><thead><tr><th>Nguyên phụ liệu</th><th>Nhà cung cấp</th><th>Lô / cây vải</th><th>Barcode</th><th>Nhập</th><th>Còn lại</th><th>Trạng thái</th><th>Đơn giá</th><th>Thao tác</th></tr></thead><tbody>
            {labels.map((label) => <tr key={label.barcode}><td>{label.materialName}{label.color ? ` · ${label.color}` : ''}<small>{label.materialCode}{label.widthCm ? ` · ${label.widthCm} cm` : ''}</small></td>
              <td>{label.supplierName}</td><td>{label.lotOrRollCode || '—'}</td><td><code>{label.barcode}</code><small>Phiếu {label.receiptCode}</small></td>
              <td>{label.quantity} {label.unit}</td><td>{label.remainingQuantity} {label.unit}</td>
              <td>{label.quality === 'REJECTED' ? 'Cách ly' : label.putawayComplete ? 'Đã xếp kho' : 'Chờ xếp kho'}</td>
              <td>{label.unitCost == null ? 'Chưa có dữ liệu' : `${Number(label.unitCost).toLocaleString('vi-VN')} / ${label.unit}`}</td>
              <td><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}><button type="button" className="btn-ara-secondary"
                onClick={() => setDetailLabel(label)}>Xem chi tiết</button><button type="button" className="btn-ara-secondary" onClick={async () => { const tab = window.open('', '_blank');
                try { const { printMaterialLabels } = await import('../utils/materialLabelPrint'); printMaterialLabels([label], tab); }
                catch (failure) { tab?.close(); setError(failure.message); } }}>In tem</button></div></td></tr>)}</tbody></table></div>
          {detailLabel && <div className="material-reference-summary" role="dialog" aria-label="Chi tiết barcode nguồn nhập">
            <div><h4>Chi tiết nguồn nhập · {detailLabel.barcode}</h4><p>{detailLabel.materialCode} · {detailLabel.materialName}
              {detailLabel.color ? ` · ${detailLabel.color}` : ''}{detailLabel.widthCm ? ` · khổ ${detailLabel.widthCm} cm` : ''}</p>
              <p>Nhà cung cấp: {detailLabel.supplierName} · Phiếu nhập: {detailLabel.receiptCode}</p>
              <p>Lô / cây: {detailLabel.lotOrRollCode || '—'} · Ngày nhận: {(detailLabel.receivedAt && localDate(detailLabel.receivedAt)) || '—'}</p>
              <p>Đơn giá: {detailLabel.unitCost == null ? 'Chưa có dữ liệu' : `${Number(detailLabel.unitCost).toLocaleString('vi-VN')} / ${detailLabel.unit}`} · Nhập ban đầu: {detailLabel.quantity} {detailLabel.unit} · Còn lại: {detailLabel.remainingQuantity} {detailLabel.unit}</p>
              <p>Trạng thái nguồn: {detailLabel.stockStatus} · Chất lượng: {detailLabel.quality === 'REJECTED' ? 'Không đạt / cách ly' : 'Đạt'}</p>
              <p>Vị trí dự kiến: {detailLabel.plannedLocationCodes?.join(', ') || '—'} · Vị trí thực tế: {detailLabel.actualLocationCodes?.join(', ') || 'Chưa xếp kho'}</p></div>
            <button type="button" className="btn-ara-secondary" onClick={() => setDetailLabel(null)}>Đóng chi tiết</button>
          </div>}
          <button type="button" className="btn-ara-primary" onClick={async () => { const tab = window.open('', '_blank');
            try { const { printMaterialLabels } = await import('../utils/materialLabelPrint'); printMaterialLabels(labels, tab); }
            catch (failure) { tab?.close(); setError(failure.message); } }}>In tem</button>
          <div style={grid}><label>Barcode cây/lô<input style={field} value={putaway.objectBarcode}
            onChange={(event) => { setPutaway({ ...putaway, objectBarcode: event.target.value.toUpperCase() }); putawayKey.current = crypto.randomUUID(); }} /></label>
            <label>Barcode vị trí<input style={field} value={putaway.locationBarcode}
              onChange={(event) => { setPutaway({ ...putaway, locationBarcode: event.target.value.toUpperCase() }); putawayKey.current = crypto.randomUUID(); }} /></label>
            <label>Số lượng nếu chia lô<input style={field} type="number" min="0" value={putaway.quantity}
              onChange={(event) => { setPutaway({ ...putaway, quantity: event.target.value }); putawayKey.current = crypto.randomUUID(); }} /></label></div>
          <button type="button" className="btn-ara-primary" disabled={busy || !putaway.objectBarcode || !putaway.locationBarcode}
            onClick={() => run(async () => { await api.putaway(id(receipt), { ...putaway,
              quantity: putaway.quantity === '' ? undefined : Number(putaway.quantity), idempotencyKey: putawayKey.current });
              setLabels((await api.labels(id(receipt))).data.labels); setPutaway({ objectBarcode: '', locationBarcode: '', quantity: '' });
              putawayKey.current = crypto.randomUUID(); setNotice('Đã xác nhận cất hàng.'); })}>Xác nhận cất hàng</button>
        </section>}
        {requestMode && !locked && <section className="material-card"><h3>Báo sai lệch bàn giao</h3>
          <p>Nếu số lượng hoặc nguồn hàng thực tế không khớp yêu cầu, gửi lại người lập xử lý. Không sửa kết quả kiểm tra tại kho.</p>
          <label>Mô tả sai lệch<textarea style={field} rows="3" value={discrepancyReason}
            onChange={(event) => setDiscrepancyReason(event.target.value)} /></label>
          <button type="button" className="btn-ara-secondary" disabled={busy || discrepancyReason.trim().length < 3}
            onClick={() => run(async () => { await api.reportTechnicianRequestDiscrepancy(id(inboundRequest), {
              reason: discrepancyReason.trim(), receiptId: id(receipt) || undefined,
              expectedRequestVersion: inboundRequest.requestVersion || 0 });
              setNotice('Đã gửi sai lệch cho người lập yêu cầu.'); onChanged(); })}>Báo sai lệch</button>
        </section>}
      </div>
      <div className="material-actions"><span className="material-ref-status">{statusName[receipt?.status] || 'Chưa lưu'}</span>
        <button type="button" className="btn-ara-secondary" onClick={close}>Đóng</button>
        {!locked && <><button type="button" className="btn-ara-secondary" disabled={busy}
          onClick={() => run(async () => { const saved = await saveDraft();
            if (saved) setNotice(requestMode ? 'Đã lưu nháp phân bổ. Chưa tăng tồn kho.' : 'Đã lưu nháp trên máy chủ. Chưa tăng tồn kho.'); })}>{requestMode ? 'Lưu nháp phân bổ' : 'Lưu nháp'}</button>
          <button type="button" className="btn-ara-primary" disabled={busy} onClick={confirm}>Xác nhận nhập kho</button></>}
      </div>
    </div>
  </div>;
}
