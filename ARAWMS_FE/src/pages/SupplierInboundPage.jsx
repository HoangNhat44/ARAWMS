/*
 * File: SupplierInboundPage.jsx
 * Author: Duy Anh
 * Date: 2026-10-27
 * Description: Receives actual supplier deliveries through inspection, physical roll or lot declaration, location allocation, confirmation, labels, and putaway.
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import MaterialDeliveryPlanList from '../components/MaterialDeliveryPlanList';
import DirectMaterialReceiptModal from '../components/DirectMaterialReceiptModal';
import { useAuth } from '../hooks/useAuth';
import { materialInboundService as api } from '../services/materialInboundService';
import '../styles/materialInbound.css';
import '../styles/materialInboundReference.css';

// Mock user for testing (NO AUTH REQUIRED)
const mockUser = { _id: '507f1f77bcf86cd799439011', username: 'test', fullName: 'Test User', roles: ['OWNER', 'WAREHOUSE_MANAGER'] };
const offlineKey = (planId, batchId) => `arawms-material-receipt-draft:${mockUser._id}:${planId}:${batchId}`;
const optionCacheKey = `arawms-material-receipt-options:${mockUser._id}`;

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
const receivingWarehouses = (locations) => [...new Map(locations.filter((item) =>
  item.warehouseType === 'RAW_MATERIAL' && item.layoutBin === true)
  .map((item) => [item.zoneCode || item.locationCode, item])).values()];
const blankForm = () => ({ inboundPlanId: '', deliveryBatchId: '', draftKey: crypto.randomUUID(),
  supplierId: '', receivedAt: '', receivingLocationId: '', receiptLines: [] });
const blankLine = (material) => ({ rawMaterialId: String(material._id), unitCost: '', zeroCostReason: '', actualQty: 0, acceptedQty: 0,
  rejectedQty: 0, pendingQty: 0, defectReason: '', inspectionConclusion: '',
  rolls: material.materialType === 'FABRIC' ? [{ clientLineId: crypto.randomUUID(),
    widthCm: material.widthCm || '', lengthMeters: '', quality: '', locationId: '' }] : [], lots: [] });
const ensurePlannedFabricRow = (line, material) => material?.materialType === 'FABRIC' && !line.rolls?.length
  ? { ...line, rolls: blankLine(material).rolls } : line;
const statusText = (status) => ({ DRAFT: 'Nháp', WAITING_QC: 'Chờ kiểm tra', READY_TO_CONFIRM: 'Sẵn sàng xác nhận',
  COMPLETED: 'Đã xác nhận', CANCELLED: 'Đã hủy' })[status] || 'Chưa lưu';
/** Shows only usable bins and keeps defective stock in its quarantine area. */
function LocationPicker({ locations, quality, unit, value, onChange }) {
  const allowed = locations.filter((item) => item.warehouseType ===
    (quality === 'REJECTED' ? 'DEFECT_QUARANTINE' : 'RAW_MATERIAL') &&
    (quality === 'REJECTED' || item.layoutBin === true) &&
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
  const { user: signedInUser } = useAuth();
  const user = signedInUser || mockUser;
  const loading = false;
  const [options, setOptions] = useState({ suppliers: [], materials: [], locations: [] });
  const [view, setView] = useState('list');
  const [directTarget, setDirectTarget] = useState(null);
  const [directRefreshKey, setDirectRefreshKey] = useState(0);
  const [reviewed, setReviewed] = useState(false);
  const [form, setForm] = useState(blankForm);
  const [dateText, setDateText] = useState('');
  const [receipt, setReceipt] = useState(null);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [labels, setLabels] = useState([]);
  const [barcodeReady, setBarcodeReady] = useState(0);
  const [barcodePollTick, setBarcodePollTick] = useState(0);
  const [selectedLabels, setSelectedLabels] = useState([]);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [putaway, setPutaway] = useState({ objectBarcode: '', locationBarcode: '', quantity: '' });
  const [supplierReturn, setSupplierReturn] = useState({ objectBarcode: '', reason: '', handoverName: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [attemptedConfirm, setAttemptedConfirm] = useState(false);
  const confirmationKey = useRef(crypto.randomUUID());
  const lastSavedForm = useRef(null);
  const pendingConfirmation = useRef(null);
  const savedFormSignature = useRef('');
  const putawayKey = useRef(crypto.randomUUID());
  const barcodePollCount = useRef(0);
  const materials = new Map(options.materials.map((item) => [String(item._id), item]));
  for (const batch of selectedPlan?.batches || []) for (const line of batch.lines) {
    if (line.material) materials.set(String(line.rawMaterialId),
      { ...line.material, _id: line.rawMaterialId });
  }
  const locked = ['COMPLETED', 'CANCELLED'].includes(receipt?.status);
  const plannedReceipt = Boolean(form.inboundPlanId && form.deliveryBatchId);
  const receiptId = receipt?._id || receipt?.id;
  useEffect(() => { setReviewed(false); }, [form]);

  const loadLabels = async (id) => {
    const data = (await api.labels(id)).data;
    setLabels(data.labels);
    setBarcodeReady(data.ready);
    setBarcodePollTick((current) => current + 1);
  };

  useEffect(() => {
    if (loading || !user) return;
    api.options().then((choices) => {
      setOptions(choices.data);
      localStorage.setItem(optionCacheKey, JSON.stringify(choices.data));
      const receiving = receivingWarehouses(choices.data.locations);
      if (receiving.length === 1) setForm((current) => current.receivingLocationId ? current :
        { ...current, receivingLocationId: String(receiving[0]._id) });
    }).catch((failure) => { try { const cached = JSON.parse(localStorage.getItem(optionCacheKey) || 'null');
      if (cached) { setOptions(cached); setNotice('Đang dùng danh mục đã lưu trên thiết bị; cần mạng để xác nhận nhập kho.'); }
      else setError(failure.message); } catch { setError(failure.message); } });
  }, [loading, user?._id, user?.id]);

  useEffect(() => {
    if (receipt?.status !== 'COMPLETED' || !labels.length || barcodeReady >= labels.length || barcodePollCount.current >= 12) return undefined;
    const timer = window.setTimeout(() => {
      barcodePollCount.current += 1;
      loadLabels(receipt._id || receipt.id).catch((failure) => setError(failure.message));
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [receipt?._id, receipt?.id, receipt?.status, barcodeReady, labels.length, barcodePollTick]);

  const startReceipt = (plan, batch) => {
    if (view === 'editor' && !locked && JSON.stringify(form) !== savedFormSignature.current &&
      !window.confirm('Phiếu có thay đổi chưa lưu. Chuyển sang đợt giao khác?')) return;
    const configuredLocations = receivingWarehouses(options.locations);
    const activePlan = plan.needsSetup && configuredLocations.length === 1 ? { ...plan,
      warehouse: configuredLocations[0], batches: plan.batches.map((entry) =>
        ({ ...entry, id: entry.id || plan.id })) } : plan;
    const activeBatch = activePlan.batches.find((entry) =>
      entry.id === (batch.id || (plan.needsSetup ? plan.id : ''))) || batch;
    const plannedLines = activeBatch.lines.map((line) => { const material = options.materials.find((item) =>
      String(item._id) === String(line.rawMaterialId)) || { ...line.material, _id: line.rawMaterialId };
      return { ...blankLine(material), deliveryBatchItemId: line.id }; });
    let nextForm = { ...blankForm(), inboundPlanId: activePlan.id, deliveryBatchId: activeBatch.id,
      supplierId: String(activePlan.supplier?._id || ''), receivingLocationId: String(activePlan.warehouse?._id || ''),
      receiptLines: plannedLines };
    let localReceipt = null;
    let localOperation = null;
    try { const local = JSON.parse(localStorage.getItem(offlineKey(activePlan.id, activeBatch.id)) ||
      localStorage.getItem(offlineKey(activePlan.id, activePlan.id)) || 'null');
      if (local?.form) { nextForm = { ...local.form, inboundPlanId: activePlan.id, deliveryBatchId: activeBatch.id,
        supplierId: String(activePlan.supplier?._id || ''), receivingLocationId: String(activePlan.warehouse?._id || ''),
        receiptLines: plannedLines.map((line) => ensurePlannedFabricRow({ ...line,
          ...(local.form.receiptLines || []).find((saved) => String(saved.rawMaterialId) === String(line.rawMaterialId)),
          rawMaterialId: line.rawMaterialId, deliveryBatchItemId: line.deliveryBatchItemId },
        options.materials.find((item) => String(item._id) === String(line.rawMaterialId)) ||
          activeBatch.lines.find((item) => String(item.rawMaterialId) === String(line.rawMaterialId))?.material)) };
        localReceipt = local.receipt; localOperation = local; } } catch { /* Ignore a damaged local draft. */ }
    setSelectedPlan(activePlan);
    setForm(nextForm); savedFormSignature.current = JSON.stringify(nextForm);
    setReceipt(localReceipt); setLabels([]); setBarcodeReady(0); setSelectedLabels([]);
    setDateText(displayDate(nextForm.receivedAt)); setSupplierSearch(supplierLabel(plan.supplier || { supplierCode: '', supplierName: '' }));
    setView('editor'); setError(''); setNotice(''); setAttemptedConfirm(false); setReviewed(false);
    confirmationKey.current = localOperation?.confirmationKey || crypto.randomUUID();
    lastSavedForm.current = localOperation?.pendingConfirmation ? nextForm : null;
    if (localReceipt || localStorage.getItem(offlineKey(activePlan.id, activeBatch.id))) setNotice('Đã mở nháp trên thiết bị. Cần lưu lại và kiểm tra lượng còn thiếu khi có mạng.');
    pendingConfirmation.current = localOperation?.pendingConfirmation || null;
  };

  const openReceipt = async (id) => {
    setBusy(true); setError('');
    try {
      const data = (await api.receipt(id)).data;
      const saved = data.receipt;
      const linkedPlan = saved.inboundPlanId ? (await api.plan(saved.inboundPlanId)).data.plan : null;
      setSelectedPlan(linkedPlan);
      setOptions((current) => ({ ...current, materials: [...current.materials,
        ...data.materials.filter((item) => !current.materials.some((known) => String(known._id) === String(item._id)))] }));
      setReceipt(saved);
      const availableMaterials = [...options.materials, ...data.materials];
      const nextForm = { inboundPlanId: String(saved.inboundPlanId || ''), deliveryBatchId: String(saved.deliveryBatchId || ''),
        draftKey: saved.draftKey || crypto.randomUUID(),
        supplierId: String(saved.supplierId), supplierDeliveryCode: saved.supplierDeliveryCode || '',
        handoverName: saved.handoverName || '', receiptNote: saved.receiptNote || '',
        replacementForTicketId: saved.replacementForTicketId || '',
        receivedAt: saved.receivedAt?.slice(0, 10) || today(),
        receivingLocationId: String(saved.receivingLocationId || ''),
        receiptLines: (saved.receiptLines || []).map((line) => ensurePlannedFabricRow({ ...line,
          unitCost: line.unitCost ?? '' }, saved.deliveryBatchId ? availableMaterials.find((item) =>
          String(item._id) === String(line.rawMaterialId)) : null)) };
      setForm(nextForm); savedFormSignature.current = JSON.stringify(nextForm);
      setDateText(displayDate(saved.receivedAt?.slice(0, 10) || today()));
      setSupplierSearch(supplierLabel(options.suppliers.find((item) => String(item._id) === String(saved.supplierId)) ||
        { supplierCode: '', supplierName: '' }));
      barcodePollCount.current = 0;
      if (saved.status === 'COMPLETED') await loadLabels(id);
      else { setLabels([]); setBarcodeReady(0); }
      setSelectedLabels([]); setView(saved.deliveryBatchId ? 'editor' : 'legacy-editor');
      setAttemptedConfirm(false); setReviewed(false);
      confirmationKey.current = crypto.randomUUID();
      lastSavedForm.current = null;
      pendingConfirmation.current = null;
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };

  const saveDraft = async () => {
    let draftForm = form;
    try {
      if (selectedPlan?.needsSetup) {
        const configuredLocations = receivingWarehouses(options.locations);
        if (configuredLocations.length !== 1) throw new Error('Kế hoạch cũ cần một vị trí nhận duy nhất trong sơ đồ kho đang công bố.');
        const oldBatch = selectedPlan.batches.find((item) => item.id === form.deliveryBatchId);
        let updated;
        try { updated = (await api.setupLegacyPlan(selectedPlan.id, {
          version: selectedPlan.version, warehouseLocationId: configuredLocations[0]._id,
          expectedStart: oldBatch.expectedStart.slice(0, 10),
          expectedEnd: oldBatch.expectedEnd.slice(0, 10),
        })).data.plan; }
        catch (failure) {
          if (!['PLAN_ALREADY_SETUP', 'VERSION_CONFLICT'].includes(failure.code) && failure.status) throw failure;
          updated = (await api.plan(selectedPlan.id)).data.plan;
          if (updated.needsSetup) throw failure;
        }
        const newBatch = updated.batches[0];
        draftForm = { ...form, deliveryBatchId: newBatch.id,
          receivingLocationId: String(updated.warehouse._id),
          receiptLines: form.receiptLines.map((line) => ({ ...line,
            deliveryBatchItemId: newBatch.lines.find((item) =>
              String(item.rawMaterialId) === String(line.rawMaterialId))?.id })) };
        setSelectedPlan(updated); setForm(draftForm);
        localStorage.removeItem(offlineKey(form.inboundPlanId, form.deliveryBatchId));
      }
      let result;
      if (receipt) result = await api.update(receiptId, { ...draftForm, expectedVersion: receipt.receiptVersion });
      else {
        try { result = await api.create(draftForm); }
        catch (failure) {
          if (failure.code !== 'DRAFT_KEY_REUSED') throw failure;
          const recovered = (await api.receiptByDraftKey(draftForm.draftKey)).data.receipt;
          if (!['DRAFT', 'WAITING_QC', 'READY_TO_CONFIRM'].includes(recovered.status))
            throw new Error('Phiếu đã được xử lý trên máy chủ. Mở lại từ lịch sử của đợt giao.');
          result = await api.update(recovered._id, { ...draftForm, expectedVersion: recovered.receiptVersion });
        }
      }
      setReceipt(result.data.receipt);
      const savedForm = { ...draftForm, receiptLines: result.data.receipt.receiptLines };
      setForm(savedForm); lastSavedForm.current = savedForm;
      savedFormSignature.current = JSON.stringify(savedForm);
      localStorage.removeItem(offlineKey(draftForm.inboundPlanId, draftForm.deliveryBatchId));
      return result.data.receipt;
    } catch (failure) {
      if (!failure.status) { localStorage.setItem(offlineKey(draftForm.inboundPlanId, draftForm.deliveryBatchId),
        JSON.stringify({ form: draftForm, receipt, confirmationKey: confirmationKey.current,
          pendingConfirmation: pendingConfirmation.current }));
        savedFormSignature.current = JSON.stringify(draftForm);
        setNotice('Đã lưu nháp trên thiết bị. Chưa ghi vào máy chủ hoặc tăng tồn kho.');
        return null; }
      throw failure;
    }
  };

  const run = async (task) => {
    setBusy(true); setError(''); setNotice('');
    try { await task(); } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  const closeEditor = () => {
    if (!locked && JSON.stringify(form) !== savedFormSignature.current &&
      !window.confirm('Phiếu có thay đổi chưa lưu. Đóng phiếu?')) return false;
    setView('list');
    return true;
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
  if (!form.supplierId) headerIssues.push('Kế hoạch chưa có nhà cung cấp hợp lệ.');
  if (!form.inboundPlanId || !form.deliveryBatchId) headerIssues.push('Chọn đúng kế hoạch và đợt giao trước khi nhận hàng.');
  if (!parseDate(dateText) || parseDate(dateText) > today()) headerIssues.push('Nhập ngày nhận hợp lệ theo dạng dd/mm/yyyy.');
  if (!form.receivingLocationId) headerIssues.push('Kế hoạch chưa có vị trí nhận hợp lệ.');
  if (!form.receiptLines.some((line) => number(line.actualQty) > 0))
    headerIssues.push('Thêm ít nhất một nguyên phụ liệu và nhập số thực nhận lớn hơn 0.');
  for (const line of form.receiptLines) {
    const material = materials.get(String(line.rawMaterialId));
    if (!material) continue;
    const issues = [];
    const objects = material.materialType === 'FABRIC' ? line.rolls : line.lots;
    if (!number(line.actualQty) && !objects.length) continue;
    const planned = selectedPlan?.batches.find((batch) => batch.id === form.deliveryBatchId)?.lines
      .find((item) => String(item.rawMaterialId) === String(line.rawMaterialId));
    if (planned && number(line.acceptedQty) > number(planned.remainingQty))
      issues.push('Lượng đạt vượt phần còn thiếu của đợt giao.');
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
    if (confirmationIssues.length || !reviewed) return;
    run(async () => {
    let request = pendingConfirmation.current;
    let saved = receipt;
    if (!request || request.formSignature !== JSON.stringify(form)) {
      saved = await saveDraft();
      if (!saved) throw new Error('Chưa có kết nối máy chủ. Phiếu chỉ được lưu trên thiết bị và chưa thể xác nhận nhập kho.');
      if (saved.status !== 'READY_TO_CONFIRM') throw new Error('Phiếu chưa đủ điều kiện xác nhận. Hãy kiểm tra từng dòng.');
      request = { id: saved._id || saved.id, version: saved.receiptVersion,
        formSignature: JSON.stringify(lastSavedForm.current || { ...form, receiptLines: saved.receiptLines }) };
      pendingConfirmation.current = request;
    }
    if (!saved) saved = (await api.receipt(request.id)).data.receipt;
    const confirmationForm = lastSavedForm.current || form;
    try {
      localStorage.setItem(offlineKey(confirmationForm.inboundPlanId, confirmationForm.deliveryBatchId), JSON.stringify({ form: {
        ...confirmationForm, receiptLines: saved.receiptLines },
        receipt: saved, confirmationKey: confirmationKey.current, pendingConfirmation: request }));
      const confirmed = (await api.confirm(request.id, {
        expectedVersion: request.version, idempotencyKey: confirmationKey.current,
      })).data.receipt;
      pendingConfirmation.current = null;
      setReceipt(confirmed); barcodePollCount.current = 0;
      localStorage.removeItem(offlineKey(confirmationForm.inboundPlanId, confirmationForm.deliveryBatchId));
      await loadLabels(confirmed._id || confirmed.id);
      setNotice('Đã xác nhận nhập kho. In tem và quét cất hàng đạt vào vị trí.');
    } catch (error) {
      // Show detailed error message from server
      const serverMessage = error.response?.data?.error?.message || error.response?.data?.message || error.message;
      throw new Error(`Không thể xác nhận: ${serverMessage}`);
    }
    });
  };

  if (loading) return <p className="material-message">Đang tải tài khoản…</p>;
  if (!user) return <p className="material-message">Vui lòng <Link to="/login">đăng nhập</Link> để nhập nguyên phụ liệu.</p>;
  const editor = <div className="material-reference-overlay" role="group" aria-labelledby="material-receipt-title">
      <div className="material-reference-sheet">
      <div className="material-reference-sheet-head"><div className="material-inbound-heading"><div><h2 id="material-receipt-title">{receipt?.ticketCode || 'Nhập nguyên phụ liệu'}</h2><p>Nhập số lượng và vị trí dự kiến của lần nhận hàng này.</p></div>
        <span className="material-ref-status">{statusText(receipt?.status)}</span></div>
        <button type="button" className="material-reference-close" aria-label="Đóng phiếu" onClick={closeEditor}>×</button></div>
      <div className="material-reference-sheet-content">
      {error && <p className="material-message error" role="alert">{error}</p>}
      {notice && <p className="material-message success" role="status">{notice}</p>}
      <fieldset disabled={busy} className="material-editor">
        {!locked && <>
          <section className="material-card">
            <h3>1. Thông tin nhận hàng</h3>
            <div className="material-grid">
              <label style={fieldset}>Kế hoạch<input style={field} readOnly value={selectedPlan?.planCode || '—'} /></label>
              <label style={fieldset}>Đợt giao<input style={field} readOnly value={selectedPlan?.batches.find((batch) => batch.id === form.deliveryBatchId)?.batchCode || '—'} /></label>
              <label style={fieldset}>Nhà cung cấp<input style={field} readOnly value={selectedPlan?.supplier ?
                supplierLabel(selectedPlan.supplier) : supplierSearch} /></label>
              <label style={fieldset}>Vị trí nhận<input style={field} readOnly value={selectedPlan?.warehouse ?
                `${selectedPlan.warehouse.zoneCode} · ${selectedPlan.warehouse.locationCode}` : '—'} /></label>
              <label style={fieldset}>Dự kiến nhận<input style={field} readOnly value={(() => { const batch = selectedPlan?.batches.find((item) => item.id === form.deliveryBatchId);
                return batch ? `${displayDate(batch.expectedStart.slice(0, 10))} – ${displayDate(batch.expectedEnd.slice(0, 10))}` : '—'; })()} /></label>
              <label style={fieldset}>Ngày hàng thực tế về *
                <input style={field} type="date" max={today()} value={form.receivedAt}
                  onChange={(event) => { const value = event.target.value; setDateText(displayDate(value));
                    setForm((current) => ({ ...current, receivedAt: value })); }} />
              </label>
              <label style={fieldset}>Mã chứng từ giao của NCC<input style={field} maxLength={80}
                value={form.supplierDeliveryCode || ''} onChange={(event) => setForm((current) =>
                  ({ ...current, supplierDeliveryCode: event.target.value }))} /></label>
              <label style={fieldset}>Người giao<input style={field} maxLength={120}
                value={form.handoverName || ''} onChange={(event) => setForm((current) =>
                  ({ ...current, handoverName: event.target.value }))} /></label>
              <label style={fieldset}>Ghi chú nhận hàng<input style={field} maxLength={500}
                value={form.receiptNote || ''} onChange={(event) => setForm((current) =>
                  ({ ...current, receiptNote: event.target.value }))} /></label>
            </div>
            {selectedPlan && <p className="product-muted">{(() => { const batch = selectedPlan.batches.find((item) => item.id === form.deliveryBatchId);
              if (!batch || !form.receivedAt) return '';
              const actual = Date.parse(form.receivedAt); const start = Date.parse(batch.expectedStart.slice(0, 10));
              const end = Date.parse(batch.expectedEnd.slice(0, 10));
              return actual < start ? `Nhận sớm ${Math.round((start - actual) / 86400000)} ngày` :
                actual > end ? `Nhận trễ ${Math.round((actual - end) / 86400000)} ngày` : 'Đúng hạn'; })()}</p>}
          </section>
          <section className="material-card">
            <h3>2. Nguyên phụ liệu thực nhận</h3>
            {!form.receiptLines.length && <p className="product-muted">Đợt giao chưa có nguyên phụ liệu.</p>}
            {form.receiptLines.map((line, index) => { const material = materials.get(String(line.rawMaterialId));
              if (!material) return null;
              const fabric = material.materialType === 'FABRIC';
              const simple = line.lots.every((item) => item.clientLineId?.startsWith('AUTO-'));
              const lineIssues = issuesByLine.get(String(line.rawMaterialId)) || [];
              return <div className="material-line material-entry" key={line.rawMaterialId}>
                <div className="material-line-heading"><div><h3>{material.materialName}{material.color ? ' · ' + material.color : ''}</h3>
                  <small>{material.materialCode} · {fabric && material.widthCm ? 'Khổ ' + amount(number(material.widthCm) / 100) + ' m · ' : ''}{unitNames[material.unit]}</small></div>
                  <span className="product-muted">Theo kế hoạch</span></div>
                <p className="product-muted">Còn cần nhập đạt: {amount(selectedPlan?.batches.find((batch) => batch.id === form.deliveryBatchId)?.lines
                  .find((item) => String(item.rawMaterialId) === String(line.rawMaterialId))?.remainingQty)} {unitShort[material.unit]}</p>
                <div className="material-reference-line-summary">
                  <div><span>Thực nhận</span><strong>{amount(line.actualQty)} {unitShort[material.unit]}</strong></div>
                  <div><span>Không đạt</span><strong>{amount(line.rejectedQty)} {unitShort[material.unit]}</strong></div>
                  <div><span>Nhập kho</span><strong className="material-reference-accepted">{amount(line.acceptedQty)} {unitShort[material.unit]}</strong></div>
                </div>
                <p className="material-reference-detail-heading">Vị trí / Chi tiết kiểm nhận</p>
                {fabric ? <>
                  <div className="material-table-wrap"><table className="material-inline-table"><thead><tr>
                    <th>Nguyên vật liệu</th><th>Chiều dài nhận (m)</th><th>Kết quả kiểm tra</th><th>Vị trí cất</th>
                    {(!plannedReceipt || line.rolls.length > 1) && <th>Thao tác</th>}
                  </tr></thead><tbody>{line.rolls.map((roll, objectIndex) => <tr key={roll.clientLineId}>
                    <td>{material.materialName}{material.color ? ` · ${material.color}` : ''}
                      {line.rolls.length > 1 ? ` · cây ${objectIndex + 1}` : ''}</td>
                    <td><input type="number" min="0" step=".001" style={field} value={roll.lengthMeters ?? ''}
                      aria-label={`${material.materialName} · chiều dài nhận cây ${objectIndex + 1}`}
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
                    {(!plannedReceipt || line.rolls.length > 1) && <td><button type="button" className="btn-ara-secondary"
                      onClick={() => {
                        if (window.confirm(`Xóa cây ${objectIndex + 1} khỏi phiếu nhập?`)) {
                          changeLine(index, { rolls: line.rolls.filter((_, row) => row !== objectIndex) });
                        }
                      }}>Xóa</button></td>}
                  </tr>)}</tbody></table></div>
                  {line.rolls.map((roll, objectIndex) => material.requiresWeightKg && <label key={roll.clientLineId}
                    style={fieldset}>Cân nặng cây {objectIndex + 1} (kg)
                    <input type="number" min="0" step=".001" style={field} value={roll.weightKg ?? ''}
                      onChange={(event) => changeObject(index, 'rolls', objectIndex, { weightKg: event.target.value })} /></label>)}
                  <div className="material-import-controls">
                    {!plannedReceipt && <button type="button" className="btn-ara-secondary" onClick={() => addObject(index, material)}>+ Thêm cây</button>}
                    <button type="button" className="btn-ara-secondary"
                      onClick={() => changeLine(index, { rolls: line.rolls.map((roll) =>
                        ({ ...roll, quality: 'ACCEPTED', defectReason: '', locationId: roll.quality === 'REJECTED' ? '' : roll.locationId })) })}>
                      {plannedReceipt ? 'Đánh dấu đạt' : 'Tất cả cây đều đạt'}</button>
                  </div>
                  <p><strong>{!plannedReceipt && `${line.rolls.length} cây · `}Tổng nhận: {amount(line.actualQty)} m · Đạt: {amount(line.acceptedQty)} m · Không đạt: {amount(line.rejectedQty)} m</strong></p>
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
                        onClick={() => {
                          if (window.confirm(`Xóa lô ${objectIndex + 1} khỏi phiếu nhập?`)) {
                            changeLine(index, { lots: line.lots.filter((_, row) => row !== objectIndex) });
                          }
                        }}>Xóa lô</button></div>
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
                          onClick={() => {
                            if (window.confirm('Xóa vị trí phân bổ này khỏi lô?')) {
                              changeObject(index, 'lots', objectIndex,
                                { allocations: lot.allocations.filter((_, row) => row !== allocationIndex) });
                            }
                          }}>Xóa vị trí</button>
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
          <section className="material-reference-summary">
            <div><h3>Tóm tắt nhập kho</h3>
              <p>{[...totalsByUnit].map(([unit, total]) => `${amount(total.accepted)} ${unitShort[unit]}`).join(' · ') || 'Chưa có nguyên phụ liệu'}</p>
              </div>
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
      </div>
      {!locked && <div className="material-actions">
        <label className="material-reference-reviewed"><input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} />
          Tôi đã kiểm tra số lượng và phần không đạt.</label>
        {attemptedConfirm && !reviewed && <span className="material-reference-review-error">Hãy kiểm tra và đánh dấu trước khi xác nhận.</span>}
        <button type="button" className="btn-ara-secondary" onClick={closeEditor}>Đóng</button>
        <button type="button" className="btn-ara-secondary" disabled={busy}
          onClick={() => run(async () => { const saved = await saveDraft();
            setNotice(saved ? 'Đã lưu nháp trên máy chủ. Chưa cộng tiến độ.' :
              'Đã lưu nháp trên thiết bị. Cần mạng để lưu lên máy chủ và xác nhận.'); })}>Lưu nháp</button>
        <button type="button" className="btn-ara-primary" disabled={busy}
          onClick={confirmReceipt}>Xác nhận nhập kho</button>
      </div>}
      </div></div>;
  return <main className="material-inbound-page material-receipt-list-page">
    <MaterialDeliveryPlanList options={options} onReceive={startReceipt} onOpenReceipt={openReceipt}
      receiptEditor={view === 'editor' ? editor : null} onCloseReceipt={closeEditor}
      receiptRefreshKey={receipt?.status === 'COMPLETED' ? receipt.confirmedAt || receiptId : ''}
      preparedPlan={selectedPlan} activeBatchId={form.deliveryBatchId} user={user}
      directRefreshKey={directRefreshKey}
      onDirectCreate={() => setDirectTarget({ kind: 'new', id: crypto.randomUUID() })}
      onDirectOpen={setDirectTarget}
      onMaterialCreated={(material) => setOptions((current) => ({ ...current,
        materials: [...current.materials, { ...material, _id: material._id || material.id }] }))} />
    {view === 'legacy-editor' && editor}
    {directTarget && <DirectMaterialReceiptModal key={`${directTarget.kind}:${directTarget.id}`}
      target={directTarget} options={options} user={user} onClose={() => setDirectTarget(null)}
      onChanged={() => setDirectRefreshKey((value) => value + 1)}
      onMaterialCreated={(material) => setOptions((current) => ({ ...current,
        materials: [...current.materials, { ...material, _id: material._id || material.id }] }))} />}
  </main>;
}
