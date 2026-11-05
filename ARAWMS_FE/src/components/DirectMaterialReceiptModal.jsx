/*
 * File: DirectMaterialReceiptModal.jsx
 * Description: Receives direct purchases into the existing raw-material receipt, stock, label, and putaway flow.
 */
import { useEffect, useRef, useState } from 'react';
import { materialInboundService as api } from '../services/materialInboundService';

const field = { width: '100%', padding: '10px', border: '1px solid #ded0bf', borderRadius: 8, background: '#fff' };
const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 14 };
const id = (value) => String(value?._id || value?.id || value || '');
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const qty = (value) => Number(value || 0);
const round = (value) => Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;
const money = (value) => Number(value || 0).toLocaleString('vi-VN', { maximumFractionDigits: 2 }) + ' ₫';
const unitName = { METER: 'm', KG: 'kg', PIECE: 'chiếc', SPOOL: 'cuộn', BOX: 'hộp' };
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
  const [receipt, setReceipt] = useState(null);
  const [savedMaterials, setSavedMaterials] = useState([]);
  const [labels, setLabels] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [materialSearch, setMaterialSearch] = useState('');
  const [newMaterialOpen, setNewMaterialOpen] = useState(false);
  const [newMaterial, setNewMaterial] = useState({ materialCode: '', materialName: '', materialType: 'AUXILIARY',
    category: 'BUTTON', unit: 'PIECE', unitCost: 0, color: '', widthCm: '' });
  const [putaway, setPutaway] = useState({ objectBarcode: '', locationBarcode: '', quantity: '' });
  const confirmationKey = useRef(crypto.randomUUID());
  const putawayKey = useRef(crypto.randomUUID());
  const busyRef = useRef(false);
  const savedSignature = useRef(JSON.stringify(form));
  const materials = new Map([...options.materials, ...savedMaterials].map((item) => [id(item), item]));
  const locked = receipt?.status === 'COMPLETED' || receipt?.status === 'CANCELLED';
  const receiving = options.locations.find((item) => id(item) === form.receivingLocationId);
  const acceptedBins = options.locations.filter((item) => item.warehouseType === 'RAW_MATERIAL' &&
    item.layoutBin && item.zoneCode === 'A');
  const rejectedBins = options.locations.filter((item) => item.warehouseType === 'DEFECT_QUARANTINE');
  const totals = new Map();
  for (const line of form.receiptLines) {
    const unit = materials.get(id(line.rawMaterialId))?.unit;
    if (unit) totals.set(unit, round((totals.get(unit) || 0) + qty(line.acceptedQty)));
  }
  const totalMoney = form.receiptLines.reduce((sum, line) => sum + qty(line.acceptedQty) * qty(line.unitCost), 0);

  useEffect(() => {
    if (target.kind !== 'new' || form.receivingLocationId) return;
    const initial = blankForm(user, options.locations).receivingLocationId;
    if (initial) setForm((current) => { const next = { ...current, receivingLocationId: initial };
      if (savedSignature.current === JSON.stringify(current)) savedSignature.current = JSON.stringify(next);
      return next; });
  }, [target.kind, options.locations, form.receivingLocationId]);

  useEffect(() => {
    if (target.kind === 'new') return;
    const load = async () => {
      try {
        let saved;
        if (target.kind === 'local') {
          saved = getDirectLocalDrafts(user).find((item) => item.form.draftKey === target.id);
          if (!saved) throw new Error('Không tìm thấy nháp trên thiết bị.');
          setForm(saved.form); setReceipt(saved.receipt || null);
          confirmationKey.current = saved.confirmationKey || crypto.randomUUID();
          savedSignature.current = JSON.stringify(saved.form);
        } else {
          const response = (await api.receipt(target.id)).data;
          saved = response.receipt;
          setSavedMaterials(response.materials || []);
          setReceipt(saved);
          const restored = { receiptSource: 'DIRECT', draftKey: saved.draftKey,
            supplierId: id(saved.supplierId), purchaseSourceName: saved.purchaseSourceName || '',
            purchasedByName: saved.purchasedByName || user?.fullName || '',
            receivedAt: saved.receivedAt?.slice(0, 10) || today(),
            receivingLocationId: id(saved.receivingLocationId), receiptNote: saved.receiptNote || '',
            receiptLines: saved.receiptLines || [] };
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
    if (!form.purchaseSourceName.trim() || !form.purchasedByName.trim())
      throw new Error('Cần nhập nơi mua và người mua.');
    if (!form.receiptLines.length || form.receiptLines.some((line) => !qty(line.actualQty)))
      throw new Error('Mỗi dòng cần có số lượng thực nhận lớn hơn 0.');
    for (const line of form.receiptLines) {
      const material = materials.get(id(line.rawMaterialId));
      const cost = Number(line.unitCost);
      if (line.unitCost === '' || !Number.isFinite(cost) || cost < 0 || cost > 1e12 ||
        Math.abs(cost * 100 - Math.round(cost * 100)) > 0.000001)
        throw new Error('Cần đơn giá mua hợp lệ cho từng dòng.');
      if (cost === 0 && (line.zeroCostReason || '').trim().length < 2)
        throw new Error('Đơn giá 0 cần ghi lý do.');
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

  return <div className="material-reference-overlay material-direct-overlay" role="dialog" aria-modal="true" aria-label="Nhập nguyên phụ liệu ngoài kế hoạch">
    <div className="material-reference-sheet">
      <div className="material-reference-sheet-head"><div><h2>{receipt?.ticketCode || 'Nhập nguyên phụ liệu ngoài kế hoạch'}</h2>
        <p>Ghi nhận lần mua trực tiếp; tồn kho chỉ tăng sau khi xác nhận.</p></div>
        <button type="button" className="material-reference-close" aria-label="Đóng" onClick={close}>×</button></div>
      <div className="material-reference-sheet-content material-editor">
        {error && <p className="material-message error" role="alert">{error}</p>}
        {notice && <p className="material-message success" role="status">{notice}</p>}
        <section className="material-card"><h3>1. Thông tin nhận hàng</h3><div style={grid}>
          <label>Kho nhận<select style={field} value={form.receivingLocationId} disabled={locked} onChange={(event) => change({ receivingLocationId: event.target.value })}>
            <option value="">Chọn kho nhận</option>{options.locations.filter((item) => item.warehouseType === 'RAW_MATERIAL' && item.layoutBin && item.zoneCode === 'A')
              .map((item) => <option key={id(item)} value={id(item)}>{item.zoneCode} · {item.locationCode}</option>)}</select></label>
          <label>Ngày nhận<input style={field} type="date" max={today()} value={form.receivedAt} disabled={locked}
            onChange={(event) => change({ receivedAt: event.target.value })} /></label>
          <label>Nơi mua / Nhà cung cấp<input style={field} list="direct-supplier-options" value={form.purchaseSourceName} disabled={locked}
            placeholder="Chọn nhà cung cấp hoặc nhập tên cửa hàng" onChange={(event) => {
              const value = event.target.value; const supplier = options.suppliers.find((item) => item.supplierName === value);
              change({ purchaseSourceName: value, supplierId: supplier ? id(supplier) : '' }); }} />
            <datalist id="direct-supplier-options">{options.suppliers.map((item) =>
              <option key={id(item)} value={item.supplierName} />)}</datalist></label>
          <label>Người mua<input style={field} value={form.purchasedByName} disabled={locked}
            onChange={(event) => change({ purchasedByName: event.target.value })} /></label>
          <label>Ghi chú<input style={field} value={form.receiptNote || ''} disabled={locked}
            onChange={(event) => change({ receiptNote: event.target.value })} /></label>
        </div></section>
        <section className="material-card"><h3>2. Nguyên phụ liệu thực nhận</h3>
          {!locked && <div className="material-reference-add-controls"><label>Tìm mã hoặc tên nguyên phụ liệu…
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
              {(newMaterial.materialType === 'FABRIC' ? ['FABRIC_ROLL'] : ['BUTTON', 'THREAD', 'ZIPPER', 'CARE_LABEL', 'PACKAGING_BAG']).map((value) => <option key={value}>{value}</option>)}</select></label>
            <label>Đơn vị<select style={field} value={newMaterial.unit} onChange={(event) => setNewMaterial({ ...newMaterial, unit: event.target.value })}>
              {(newMaterial.materialType === 'FABRIC' ? ['METER'] : ['KG', 'PIECE', 'SPOOL', 'BOX']).map((value) => <option key={value}>{value}</option>)}</select></label>
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
                {!locked && <button type="button" className="btn-ara-secondary" onClick={() => {
                  if ((qty(line.actualQty) || line.unitCost !== '') && !window.confirm(`Xóa dòng ${material.materialName} đã nhập dữ liệu?`)) return;
                  change({ receiptLines: form.receiptLines.filter((_, row) => row !== index) });
                }}>Xóa dòng</button>}</div>
              <div className="material-reference-line-summary">
                {fabric ? <div><span>Thực nhận</span><strong>{qty(line.actualQty)} m</strong></div> :
                  <label>Thực nhận ({unitName[material.unit]})<input style={field} type="number" min="0" disabled={locked}
                    step={['METER', 'KG'].includes(material.unit) ? '.001' : '1'} value={line.actualQty}
                    onChange={(event) => changeLine(index, { actualQty: event.target.value })} /></label>}
                {fabric ? <div><span>Không đạt</span><strong>{qty(line.rejectedQty)} m</strong></div> :
                  <label>Không đạt<input style={field} type="number" min="0" disabled={locked}
                    step={['METER', 'KG'].includes(material.unit) ? '.001' : '1'} value={line.rejectedQty}
                    onChange={(event) => changeLine(index, { rejectedQty: event.target.value })} /></label>}
                <div><span>Nhập kho</span><strong className="material-reference-accepted">{qty(line.acceptedQty)} {unitName[material.unit]}</strong></div>
                <label>Đơn giá mua (₫/{unitName[material.unit]})<input style={field} type="number" min="0" step=".01" disabled={locked}
                  value={line.unitCost ?? ''} onChange={(event) => changeLine(index, { unitCost: event.target.value })} /></label>
                <div><span>Thành tiền</span><strong>{money(qty(line.acceptedQty) * qty(line.unitCost))}</strong></div>
              </div>
              {line.unitCost !== '' && Number(line.unitCost) === 0 && <label>Lý do đơn giá 0<input style={field} disabled={locked}
                value={line.zeroCostReason || ''} onChange={(event) => changeLine(index, { zeroCostReason: event.target.value })} /></label>}
              {fabric ? <><p className="material-reference-detail-heading">Chi tiết cây vải</p>
                {line.rolls.map((roll, rollIndex) => <div key={roll.clientLineId} style={grid}>
                  <label>Cây {rollIndex + 1} · chiều dài (m)<input style={field} type="number" min="0" step=".001" disabled={locked}
                    value={roll.lengthMeters ?? ''} onChange={(event) => changeRoll(index, rollIndex, { lengthMeters: event.target.value })} /></label>
                  <label>Kết quả<select style={field} value={roll.quality || ''} disabled={locked} onChange={(event) =>
                    changeRoll(index, rollIndex, { quality: event.target.value, locationId: '' })}>
                    <option value="">Chưa kiểm tra</option><option value="ACCEPTED">Đạt</option><option value="REJECTED">Không đạt</option></select></label>
                  <label>Vị trí dự kiến<select style={field} value={id(roll.locationId)} disabled={locked} onChange={(event) => changeRoll(index, rollIndex, { locationId: event.target.value })}>
                    <option value="">Chọn ô</option>{(roll.quality === 'REJECTED' ? eligibleQuarantine : eligibleBins).map((item) =>
                      <option key={id(item)} value={id(item)}>{item.locationCode}</option>)}</select></label>
                  {material.requiresWeightKg && <label>Cân nặng (kg)<input style={field} type="number" min="0" step=".001" disabled={locked}
                    value={roll.weightKg ?? ''} onChange={(event) => changeRoll(index, rollIndex, { weightKg: event.target.value })} /></label>}
                  {roll.quality === 'REJECTED' && <label>Lý do không đạt<input style={field} disabled={locked}
                    value={roll.defectReason || ''} onChange={(event) => changeRoll(index, rollIndex, { defectReason: event.target.value })} /></label>}
                  {!locked && line.rolls.length > 1 && <button type="button" onClick={() => {
                    if (window.confirm(`Xóa cây ${rollIndex + 1}?`)) changeLine(index, { rolls: line.rolls.filter((_, row) => row !== rollIndex) });
                  }}>Xóa cây</button>}
                </div>)}
                {!locked && <button type="button" className="btn-ara-secondary" onClick={() => changeLine(index, { rolls: [...line.rolls,
                  { clientLineId: crypto.randomUUID(), widthCm: material.widthCm || '', lengthMeters: '', quality: '', locationId: '' }] })}>+ Thêm cây vải</button>}
              </> : <><label>Vị trí dự kiến trong Khu {receiving?.zoneCode || 'A'}<select style={field} disabled={locked}
                value={id(line.lots.find((lot) => lot.quality === 'ACCEPTED')?.allocations?.[0]?.locationId)}
                onChange={(event) => changeLine(index, { lots: line.lots.map((lot) => lot.quality === 'ACCEPTED'
                  ? { ...lot, allocations: [{ locationId: event.target.value, quantity: lot.countedQty }] } : lot) })}>
                <option value="">Chọn ô lưu trữ</option>{eligibleBins.map((item) => <option key={id(item)} value={id(item)}>{item.locationCode}</option>)}</select></label>
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
          <div className="material-reference-money"><p className="total">Tổng tiền phần nhập kho <strong>{money(totalMoney)}</strong></p></div></section>
        {locked && receipt?.status === 'COMPLETED' && <section className="material-card"><h3>In tem và xếp hàng</h3>
          <p>{labels.length} tem cây/lô. Phụ liệu nhỏ dùng một tem cho mỗi lô, không in tem từng chiếc.</p>
          <div className="material-table-wrap"><table className="material-inline-table"><thead><tr><th>Barcode</th><th>Số lượng</th><th>Trạng thái</th></tr></thead><tbody>
            {labels.map((label) => <tr key={label.barcode}><td>{label.barcode}</td><td>{label.quantity} {label.unit}</td><td>{label.putawayComplete ? 'Đã cất' : 'Chờ cất'}</td></tr>)}</tbody></table></div>
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
      </div>
      <div className="material-actions"><span className="material-ref-status">{statusName[receipt?.status] || 'Chưa lưu'}</span>
        <button type="button" className="btn-ara-secondary" onClick={close}>Đóng</button>
        {!locked && <><button type="button" className="btn-ara-secondary" disabled={busy}
          onClick={() => run(async () => { const saved = await saveDraft();
            if (saved) setNotice('Đã lưu nháp trên máy chủ. Chưa tăng tồn kho.'); })}>Lưu nháp</button>
          <button type="button" className="btn-ara-primary" disabled={busy} onClick={confirm}>Xác nhận nhập kho</button></>}
      </div>
    </div>
  </div>;
}
