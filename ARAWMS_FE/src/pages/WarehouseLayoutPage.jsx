/*
 * File: WarehouseLayoutPage.jsx
 * Author: Duy Anh
 * Date: 2026-10-27
 * Description: Lists racks by warehouse area and shows current stock or configuration in the side panel. Managers can inspect unit barcodes and pending putaway per bin.
 */
import { useEffect, useRef, useState } from 'react';
import { warehouseLayoutService as api } from '../services/warehouseLayoutService';
import WarehouseRackContents from '../components/WarehouseRackContents';
import '../styles/warehouseLayout.css';

const id = (value) => String(value?._id || value?.id || value || '');
const defaultZones = [
  { code: 'A', name: 'Kho nguyên phụ liệu', type: 'WORK', status: 'ACTIVE' },
  { code: 'B', name: 'Kho thành phẩm', type: 'STORAGE', status: 'ACTIVE' },
];
const emptyRack = { code: '', name: '', zoneCode: 'B', floors: 3, binsPerFloor: 1,
  capacityPerBin: 0, capacityUnit: 'PIECE', status: 'ACTIVE' };
const rawUnits = [
  { value: 'METER', label: 'Mét' }, { value: 'KG', label: 'Kg' },
  { value: 'PIECE', label: 'Chiếc' }, { value: 'SPOOL', label: 'Cuộn' },
  { value: 'BOX', label: 'Hộp' },
];
const errorText = (error) => error.response?.data?.message || error.message;
const rackFields = (rack) => ({
  code: rack.code, name: rack.name, zoneCode: rack.zoneCode, floors: rack.floors,
  binsPerFloor: rack.binsPerFloor, status: rack.status,
});
const validRack = (rack) => /^[A-Z0-9_-]+$/.test(String(rack.code || '').trim().toUpperCase()) &&
  String(rack.name || '').trim() && Number.isInteger(Number(rack.floors)) &&
  Number(rack.floors) >= 1 && Number(rack.floors) <= 12 &&
  Number.isInteger(Number(rack.binsPerFloor)) && Number(rack.binsPerFloor) >= 1 &&
  Number(rack.binsPerFloor) <= 20 && Number(rack.floors) * Number(rack.binsPerFloor) <= 120 &&
  (!rack.capacityPerBin || (rack.zoneCode === 'A'
    ? Number.isFinite(Number(rack.capacityPerBin)) && Number(rack.capacityPerBin) <= 100000000
    : Number.isSafeInteger(Number(rack.capacityPerBin)))) && Number(rack.capacityPerBin || 0) >= 0;

export default function WarehouseLayoutPage() {
  const detailRef = useRef(null);
  const [layout, setLayout] = useState(null);
  const [zones, setZones] = useState(defaultZones);
  const [racks, setRacks] = useState([]);
  const [bins, setBins] = useState([]);
  const [locations, setLocations] = useState([]);
  const [capabilities, setCapabilities] = useState({});
  const [selectedRackId, setSelectedRackId] = useState('');
  const [adding, setAdding] = useState(false);
  const [rackForm, setRackForm] = useState(emptyRack);
  const [binForms, setBinForms] = useState([]);
  const [openFloor, setOpenFloor] = useState(1);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [panelTab, setPanelTab] = useState('contents');
  const [search, setSearch] = useState({ A: '', B: '' });
  const [statusFilter, setStatusFilter] = useState({ A: '', B: '' });
  const [showLabels, setShowLabels] = useState(false);
  const [selectedLabels, setSelectedLabels] = useState([]);

  const notify = (text, type = 'success') => setToast({ text, type, key: Date.now() });
  const setError = (text) => { if (text) notify(text, 'error'); };
  const setMessage = (text) => { if (text) notify(text); };
  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const confirmAction = async () => {
    if (!confirmation || confirmBusy) return;
    setConfirmBusy(true);
    try { await confirmation.run(); }
    catch (err) { setError(errorText(err)); }
    finally { setConfirmBusy(false); setConfirmation(null); }
  };
  const confirmDiscard = () => setConfirmation({
    title: 'Bỏ thay đổi chưa lưu',
    message: 'Đóng phần chi tiết và bỏ các thay đổi chưa lưu?',
    label: 'Xác nhận bỏ thay đổi', run: cancel,
  });

  const load = async (selectRackId = '') => {
    const layoutResponse = await api.layout();
    const next = layoutResponse.data.layout;
    const snapshot = next.draft || (next.activeVersion ? next.active : null);
    const nextRacks = snapshot?.racks || [];
    const nextBins = snapshot?.bins || [];
    setLayout(next);
    setZones(snapshot?.zones?.length ? snapshot.zones : defaultZones);
    setRacks(nextRacks);
    setBins(nextBins);
    setLocations(layoutResponse.data.locations || []);
    setCapabilities(layoutResponse.data.capabilities || {});
    const selected = nextRacks.find((rack) => id(rack.id) === selectRackId) ||
      (!selectRackId ? nextRacks.find((rack) => rack.zoneCode === 'B') : null);
    if (selected) {
      const nextSelectedId = id(selected.id);
      setSelectedRackId(nextSelectedId);
      setRackForm(rackFields(selected));
      setBinForms(nextBins.filter((bin) => id(bin.rackId) === nextSelectedId));
      setOpenFloor(1);
      setPanelTab(next.active?.racks?.some((rack) => id(rack.id) === nextSelectedId)
        ? 'contents' : 'config');
    } else {
      setSelectedRackId('');
      setRackForm(emptyRack);
      setBinForms([]);
    }
    setAdding(false);
  };

  useEffect(() => { load().catch((err) => setError(errorText(err))); }, []);

  const selectRack = (rack) => {
    setAdding(false);
    setSelectedRackId(id(rack.id));
    setRackForm(rackFields(rack));
    setBinForms(bins.filter((bin) => id(bin.rackId) === id(rack.id)));
    setOpenFloor(1);
    setPanelTab(layout?.active?.racks?.some((item) => id(item.id) === id(rack.id))
      ? 'contents' : 'config');
    setError('');
    setMessage('');
    requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const startAdding = (zoneCode) => {
    setAdding(true);
    setSelectedRackId('');
    setRackForm({ ...emptyRack, zoneCode });
    setBinForms([]);
    setPanelTab('config');
    setError('');
    setMessage('');
    requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const cancel = () => {
    setAdding(false);
    setSelectedRackId('');
    setRackForm({ ...emptyRack });
    setBinForms([]);
    setError('');
    setMessage('');
  };
  const editBin = (binId, change) => setBinForms((current) =>
    current.map((bin) => id(bin.id) === binId ? { ...bin, ...change } : bin));

  const save = async () => {
    if (!validRack(rackForm)) {
      setError('Mã, tên, số tầng hoặc số ô của kệ không hợp lệ.'); return;
    }
    const rackCode = String(rackForm.code).trim().toUpperCase();
    if (adding && racks.some((rack) => rack.zoneCode === rackForm.zoneCode && rack.code === rackCode)) {
      setError(`Mã kệ ${rackForm.zoneCode}-${rackCode} đã tồn tại.`); return;
    }
    for (const bin of binForms) {
      const location = locations.find((item) => id(item) === id(bin.id));
      const minimum = Number(location?.currentOccupancy || 0) +
        Number(location?.plannedReservedQty || 0);
      const validCapacity = rackForm.zoneCode === 'A'
        ? Number.isFinite(Number(bin.capacity)) && Number(bin.capacity) <= 100000000
        : Number.isSafeInteger(Number(bin.capacity));
      if (!validCapacity || Number(bin.capacity) < minimum) {
        setError(`Ô ${bin.locationCode} cần sức chứa tối thiểu ${minimum}.`); return;
      }
    }
    setBusy(true); setError(''); setMessage('');
    try {
      let current = (await api.openDraft()).data.layout;
      // A saved form must not apply over another manager's newer draft or published layout.
      if (current.activeVersion !== layout?.activeVersion ||
          (layout?.draft && current.draftVersion !== layout.draftVersion) ||
          current.draftBaseVersion !== current.activeVersion) {
        throw new Error('Sơ đồ đã thay đổi. Hãy tải lại trang trước khi lưu.');
      }
      if (!current.draft.zones.length) {
        current = (await api.saveDraft({ version: current.draftVersion, zones: defaultZones })).data.layout;
      }
      let savedRackId = selectedRackId;
      if (adding) {
        if (current.draft.racks.some((rack) => rack.zoneCode === rackForm.zoneCode && rack.code === rackCode)) {
          throw new Error(`Mã kệ ${rackForm.zoneCode}-${rackCode} đã tồn tại.`);
        }
        current = (await api.addRack({ version: current.draftVersion, zoneCode: rackForm.zoneCode,
          code: rackCode, name: rackForm.name.trim(), floors: Number(rackForm.floors),
          binsPerFloor: Number(rackForm.binsPerFloor), capacityPerBin: Number(rackForm.capacityPerBin || 0),
          ...(rackForm.zoneCode === 'A' ? { capacityUnit: rackForm.capacityUnit } : {}) })).data.layout;
        savedRackId = id(current.draft.racks.find((rack) =>
          rack.zoneCode === rackForm.zoneCode && rack.code === rackCode)?.id);
      } else {
        const stored = current.draft.racks.find((rack) => id(rack.id) === selectedRackId);
        if (!stored) throw new Error('Kệ đã thay đổi. Hãy tải lại trang.');
        if (stored.floors !== Number(rackForm.floors) ||
          stored.binsPerFloor !== Number(rackForm.binsPerFloor)) {
          current = (await api.resizeRack(selectedRackId, { version: current.draftVersion,
            floors: Number(rackForm.floors), binsPerFloor: Number(rackForm.binsPerFloor) })).data.layout;
        }
        const storedBins = new Map(current.draft.bins.map((bin) => [id(bin.id), bin]));
        const changes = binForms.filter((bin) => {
          const storedBin = storedBins.get(id(bin.id));
          return storedBin && (storedBin.capacity !== Number(bin.capacity) ||
            (rackForm.zoneCode === 'A' && (storedBin.capacityUnit || 'PIECE') !== bin.capacityUnit) ||
            storedBin.status !== bin.status);
        }).map((bin) => ({ id: bin.id, capacity: Number(bin.capacity),
          ...(rackForm.zoneCode === 'A' ? { capacityUnit: bin.capacityUnit || 'PIECE' } : {}),
          status: bin.status }));
        const rackChanges = stored.name !== rackForm.name.trim() || stored.status !== rackForm.status
          ? [{ id: selectedRackId, name: rackForm.name.trim(), status: rackForm.status }] : [];
        if (rackChanges.length || changes.length) current = (await api.saveDraft({
          version: current.draftVersion, racks: rackChanges, bins: changes,
        })).data.layout;
      }
      const check = await api.validate();
      if (check.data.errors.length) throw new Error(check.data.errors.join('; '));
      await api.publish(current.draftVersion);
      const wasAdding = adding;
      await load(savedRackId);
      setMessage(wasAdding ? 'Đã thêm và lưu kệ vào sơ đồ kho.' : 'Đã lưu cấu hình kệ và ô.');
    } catch (err) { setError(errorText(err)); }
    finally { setBusy(false); }
  };

  const removeRack = async () => {
    if (!selectedRackId || busy) return;
    setBusy(true);
    try {
      let current = (await api.openDraft()).data.layout;
      if (current.activeVersion !== layout?.activeVersion ||
          (layout?.draft && current.draftVersion !== layout.draftVersion) ||
          current.draftBaseVersion !== current.activeVersion) {
        throw new Error('Sơ đồ đã thay đổi. Hãy tải lại trang trước khi xóa kệ.');
      }
      current = (await api.removeRack(selectedRackId, current.draftVersion)).data.layout;
      const check = await api.validate();
      if (check.data.errors.length) throw new Error(check.data.errors.join('; '));
      await api.publish(current.draftVersion);
      await load();
      setMessage(`Đã xóa kệ ${rackForm.zoneCode}-${rackForm.code} khỏi sơ đồ kho.`);
    } catch (err) {
      setError(errorText(err));
      await load(selectedRackId).catch((loadError) => setError(errorText(loadError)));
    } finally { setBusy(false); }
  };

  const printBin = async (bin) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) { setError('Trình duyệt đã chặn cửa sổ in.'); return; }
    printWindow.document.write('<p>Đang chuẩn bị tem vị trí...</p>');
    try {
      const [label, qrImage] = await Promise.all([api.label(id(bin.id)), api.labelQrImage(id(bin.id))]);
      // The shared API client already unwraps Axios responses; the image is a Blob.
      if (!(qrImage instanceof Blob)) throw new Error('Không tải được ảnh QR vị trí.');
      const imageUrl = URL.createObjectURL(qrImage);
      try {
        await api.printIntent(id(bin.id));
        const code = label.data.bin.locationCode;
        printWindow.document.open();
        printWindow.document.write(`<!doctype html><html><head><title>Tem QR vị trí kho</title>
          <style>body{font-family:Arial,sans-serif;text-align:center;padding:24px}
          img{display:block;width:70mm;max-width:100%;height:auto;margin:16px auto;image-rendering:pixelated}
          strong{display:block;font-size:24px;margin:16px}
          @media print{button{display:none}}</style></head><body>
          <button onclick="window.print()">In tem</button><strong>${code}</strong>
          <img src="${imageUrl}" alt="QR ${code}">
          <p>${label.data.bin.barcode}</p></body></html>`);
        printWindow.document.close();
        printWindow.onload = () => printWindow.print();
        printWindow.onafterprint = () => URL.revokeObjectURL(imageUrl);
      } catch (error) {
        URL.revokeObjectURL(imageUrl);
        throw error;
      }
    } catch (err) { printWindow.close(); setError(errorText(err)); }
  };

  const printSelectedLabels = async () => {
    if (!selectedLabels.length) { setError('Hãy chọn ít nhất một ô để in tem.'); return; }
    const printWindow = window.open('', '_blank');
    if (!printWindow) { setError('Trình duyệt đã chặn cửa sổ in.'); return; }
    printWindow.document.write('<p>Đang chuẩn bị tem vị trí...</p>');
    setBusy(true); setError('');
    const imageUrls = [];
    try {
      const labels = [];
      for (const binId of selectedLabels) {
        const [label, image] = await Promise.all([api.label(binId), api.labelQrImage(binId)]);
        if (!(image instanceof Blob)) throw new Error('Không tải được ảnh QR vị trí.');
        const imageUrl = URL.createObjectURL(image);
        imageUrls.push(imageUrl);
        await api.printIntent(binId);
        labels.push({ ...label.data.bin, imageUrl });
      }
      const escape = (value) => String(value || '').replace(/[&<>"']/g, (char) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
      printWindow.document.open();
      printWindow.document.write(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Tem vị trí kho</title><style>
        body{font-family:Arial,sans-serif;padding:20px}button{margin-bottom:16px}.labels{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}
        article{border:1px solid #bbb;padding:15px;text-align:center;break-inside:avoid}strong{display:block;font-size:20px}
        img{display:block;width:55mm;max-width:100%;margin:12px auto}@media print{button{display:none}}
        </style></head><body><button onclick="window.print()">In tem</button><div class="labels">${labels.map((label) =>
        `<article><strong>${escape(label.locationCode)}</strong><img src="${label.imageUrl}" alt="QR ${escape(label.locationCode)}"><code>${escape(label.barcode)}</code></article>`).join('')}</div></body></html>`);
      printWindow.document.close();
      printWindow.onload = () => printWindow.print();
      printWindow.onafterprint = () => imageUrls.forEach(URL.revokeObjectURL);
      setShowLabels(false);
    } catch (err) {
      printWindow.close();
      imageUrls.forEach(URL.revokeObjectURL);
      setError(errorText(err));
    } finally { setBusy(false); }
  };

  const canEdit = capabilities['warehouse.layout.edit'] !== false &&
    capabilities['warehouse.layout.publish'] !== false;
  const canPrint = capabilities['warehouse.location.barcode.print'] !== false;
  const activeRackIds = new Set((layout?.active?.racks || []).map((rack) => id(rack.id)));
  const activeBinIds = new Set((layout?.active?.bins || []).map((bin) => id(bin.id)));
  const zoneB = zones.find((zone) => zone.code === 'B') || defaultZones[1];
  const aRacks = racks.filter((rack) => rack.zoneCode === 'A');
  const bRacks = racks.filter((rack) => rack.zoneCode === 'B');
  const liveLocations = new Map(locations.map((location) => [id(location), location]));
  const rackMetrics = (rack) => {
    const rackBins = bins.filter((bin) => id(bin.rackId) === id(rack.id));
    const actual = rackBins.reduce((total, bin) => total + Number(liveLocations.get(id(bin.id))?.currentOccupancy || 0), 0);
    const reserved = rackBins.reduce((total, bin) => total + Number(liveLocations.get(id(bin.id))?.plannedReservedQty || 0), 0);
    const occupied = rackBins.filter((bin) => Number(liveLocations.get(id(bin.id))?.currentOccupancy || 0) > 0).length;
    const capacity = rackBins.reduce((total, bin) => total + Number(bin.capacity || 0), 0);
    return { rackBins, actual, reserved, occupied, capacity,
      percent: rack.zoneCode === 'A' ? (rackBins.length ? Math.round(occupied / rackBins.length * 100) : 0)
        : (capacity ? Math.round((actual + reserved) / capacity * 100) : 0) };
  };
  const visibleRacks = (zoneRacks, zoneCode) => zoneRacks.filter((rack) =>
    `${zoneCode}-${rack.code} ${rack.name}`.toLocaleLowerCase('vi').includes(search[zoneCode].toLocaleLowerCase('vi')) &&
    (!statusFilter[zoneCode] || rack.status === statusFilter[zoneCode]));
  const rackButton = (rack) => {
    const metrics = rackMetrics(rack);
    return <button key={id(rack.id)} type="button"
    className={`layout-rack-card ${selectedRackId === id(rack.id) ? 'selected' : ''}`}
    onClick={() => selectRack(rack)} aria-pressed={selectedRackId === id(rack.id)}
    aria-label={`Kệ ${rack.zoneCode}-${rack.code}, ${rack.name}, ${rack.floors} tầng, ${rack.binsPerFloor} ô mỗi tầng`}>
    <span className="layout-rack-top"><strong>{rack.zoneCode}-{rack.code}</strong><em>{rack.status === 'ACTIVE' ? 'Hoạt động' : 'Ngừng dùng'}</em></span>
    <span className="layout-rack-name">{rack.name}</span>
    <small>{rack.floors} tầng · {metrics.rackBins.length} ô</small>
    <span className="layout-rack-stats"><span>{rack.zoneCode === 'A'
      ? `${metrics.occupied}/${metrics.rackBins.length} ô có hàng`
      : `${metrics.actual} chiếc · ${metrics.reserved} chờ xếp`}</span><span>{metrics.percent}%</span></span>
    <span className="layout-progress"><span style={{ width: `${Math.min(metrics.percent, 100)}%` }} /></span>
  </button>;
  };

  return <main className="warehouse-layout-page">
    <header className="layout-header"><div><small>HỆ THỐNG VẬN HÀNH KHO</small><h1>Cấu hình vị trí kho</h1>
      <p>Quản lý kệ, tầng và ô lưu trữ trong kho.</p></div>
      <div className="layout-header-actions"><button type="button" onClick={() => window.location.reload()} disabled={busy}>↻ Làm mới</button>
        {canPrint && <button type="button" className="primary" onClick={() => {
          setSelectedLabels((layout?.active?.bins || []).map((bin) => id(bin.id)));
          setShowLabels(true);
        }}>▣ In tem vị trí</button>}</div></header>
    <div className="layout-workspace">
      <section className="layout-map-card" aria-label="Danh sách kệ theo khu">
        <div className="layout-zones">
          <section className="layout-zone-card layout-area-a" aria-label="Khu A — kho nguyên phụ liệu">
            <div className="layout-area-heading"><div><strong><i />Khu A — Kho nguyên phụ liệu <small>{aRacks.length} kệ</small></strong></div>
              {canEdit && <button type="button" onClick={() => startAdding('A')}>+ Thêm kệ</button>}
            </div>
            <div className="layout-zone-toolbar"><input aria-label="Tìm kệ khu A" placeholder="Tìm mã hoặc tên kệ A..." value={search.A}
              onChange={(event) => setSearch({ ...search, A: event.target.value })} />
              <select aria-label="Lọc trạng thái khu A" value={statusFilter.A} onChange={(event) => setStatusFilter({ ...statusFilter, A: event.target.value })}>
                <option value="">Tất cả trạng thái</option><option value="ACTIVE">Hoạt động</option><option value="INACTIVE">Ngừng dùng</option></select></div>
            <div className="layout-rack-grid">{visibleRacks(aRacks, 'A').map(rackButton)}
              {!visibleRacks(aRacks, 'A').length && <p className="layout-zone-empty">Không tìm thấy kệ phù hợp.</p>}
            </div>
            <div className="layout-zone-summary">Hiển thị {visibleRacks(aRacks, 'A').length}/{aRacks.length} kệ · Nguyên phụ liệu theo đơn vị từng ô</div>
          </section>
          <section className="layout-zone-card layout-area-b" aria-label="Khu B — kho thành phẩm">
            <div className="layout-area-heading"><div><strong><i />Khu B — {zoneB.name} <small>{bRacks.length} kệ</small></strong></div>
              {canEdit && <button type="button" onClick={() => startAdding('B')}>+ Thêm kệ</button>}
            </div>
            <div className="layout-zone-toolbar"><input aria-label="Tìm kệ khu B" placeholder="Tìm mã hoặc tên kệ B..." value={search.B}
              onChange={(event) => setSearch({ ...search, B: event.target.value })} />
              <select aria-label="Lọc trạng thái khu B" value={statusFilter.B} onChange={(event) => setStatusFilter({ ...statusFilter, B: event.target.value })}>
                <option value="">Tất cả trạng thái</option><option value="ACTIVE">Hoạt động</option><option value="INACTIVE">Ngừng dùng</option></select></div>
            <div className="layout-rack-grid">{visibleRacks(bRacks, 'B').map(rackButton)}
              {!visibleRacks(bRacks, 'B').length && <p className="layout-zone-empty">Không tìm thấy kệ phù hợp.</p>}
            </div>
            <div className="layout-zone-summary">Hiển thị {visibleRacks(bRacks, 'B').length}/{bRacks.length} kệ · {bRacks.reduce((total, rack) => total + rackMetrics(rack).actual, 0)} chiếc thực tế</div>
          </section>
        </div>
      </section>
      <section className="layout-config-panel" aria-label="Chi tiết kệ" ref={detailRef}>
        {!adding && !selectedRackId && <div className="layout-panel-empty">
          Chọn một kệ trong khu A hoặc B để xem và cấu hình.</div>}
        {(adding || selectedRackId) && <>
          <div className="layout-panel-heading"><div><small>{adding ? 'THÊM KỆ' : 'CẤU HÌNH KỆ'}</small>
            <h2>{adding ? `Kệ mới tại khu ${rackForm.zoneCode}` : `${rackForm.zoneCode}-${rackForm.code} · ${rackForm.name}`}</h2>
            <p>Khu {rackForm.zoneCode} — {rackForm.zoneCode === 'A' ? 'Kho nguyên phụ liệu' : 'Kho thành phẩm'}</p></div>
            <div className="layout-detail-actions">
              {!adding && canPrint && activeRackIds.has(selectedRackId) && <button type="button" onClick={() => {
                setSelectedLabels((layout?.active?.bins || []).filter((bin) => id(bin.rackId) === selectedRackId).map((bin) => id(bin.id)));
                setShowLabels(true);
              }}>In tem kệ</button>}
              <button type="button" onClick={confirmDiscard} aria-label="Đóng chi tiết kệ">Thu gọn</button></div></div>
          {!adding && activeRackIds.has(selectedRackId) && <div className="layout-panel-tabs">
            <button type="button" className={panelTab === 'contents' ? 'active' : ''}
              onClick={() => setPanelTab('contents')}>Hàng trong kệ</button>
            <button type="button" className={panelTab === 'config' ? 'active' : ''}
              onClick={() => setPanelTab('config')}>Cấu hình</button></div>}
          {!adding && panelTab === 'contents' && activeRackIds.has(selectedRackId) &&
            <WarehouseRackContents key={selectedRackId} rackId={selectedRackId}
              notify={notify} requestConfirm={setConfirmation} />}
          {(adding || panelTab === 'config' || !activeRackIds.has(selectedRackId)) && <>
          <div className="layout-panel-fields">
            <label>Mã kệ<input value={rackForm.code} disabled={!adding || busy}
              onChange={(event) => setRackForm({ ...rackForm, code: event.target.value.toUpperCase() })} /></label>
            <label>Tên kệ<input value={rackForm.name} disabled={!canEdit || busy}
              onChange={(event) => setRackForm({ ...rackForm, name: event.target.value })} /></label>
            <label>Khu vực<input value={rackForm.zoneCode === 'A'
              ? 'A · Kho nguyên phụ liệu' : 'B · Kho thành phẩm'} disabled /></label>
            <div className="layout-field-row">
              <label>Số tầng<input type="number" min="1" max="12" value={rackForm.floors}
                disabled={!canEdit || busy} onChange={(event) => setRackForm({
                  ...rackForm, floors: Number(event.target.value) })} /></label>
              <label>Ô mỗi tầng<input type="number" min="1" max="20" value={rackForm.binsPerFloor}
                disabled={!canEdit || busy} onChange={(event) => setRackForm({
                  ...rackForm, binsPerFloor: Number(event.target.value) })} /></label></div>
            {adding && <label>Sức chứa mỗi ô {rackForm.zoneCode === 'B' ? '(chiếc)' : ''}
              <input type="number" min="0" max={rackForm.zoneCode === 'A' ? '100000000' : undefined}
                step={rackForm.zoneCode === 'A' ? 'any' : '1'} value={rackForm.capacityPerBin}
                disabled={!canEdit || busy} onChange={(event) => setRackForm({ ...rackForm, capacityPerBin: event.target.value })} />
              <small>Tổng sức chứa kệ: {Number(rackForm.floors || 0) * Number(rackForm.binsPerFloor || 0) * Number(rackForm.capacityPerBin || 0)} {rackForm.zoneCode === 'B' ? 'chiếc' : rawUnits.find((unit) => unit.value === rackForm.capacityUnit)?.label}</small>
            </label>}
            {adding && rackForm.zoneCode === 'A' && <label>Đơn vị sức chứa của ô
              <select value={rackForm.capacityUnit} disabled={busy}
                onChange={(event) => setRackForm({ ...rackForm, capacityUnit: event.target.value })}>
                {rawUnits.map((unit) => <option key={unit.value} value={unit.value}>{unit.label}</option>)}
              </select></label>}
            <label>Trạng thái<select value={rackForm.status} disabled={adding || !canEdit || busy}
              onChange={(event) => setRackForm({ ...rackForm, status: event.target.value })}>
              <option value="ACTIVE">Hoạt động</option><option value="INACTIVE">Ngừng dùng</option>
            </select></label>
            {!adding && rackForm.status === 'INACTIVE' && <p className="layout-rack-status-note">
              Chỉ ngừng dùng khi kệ đã hết hàng và không còn hàng chờ xếp. Hãy chuyển hàng sang kệ khác trước khi lưu.
              Trạng thái riêng của từng ô được giữ để dùng lại khi mở kệ.
            </p>}
          </div>
          {!adding && <div className="layout-floor-list"><h3>Tầng và ô</h3>
            {Array.from({ length: Number(rackForm.floors) || 0 }, (_, index) => index + 1).map((floor) =>
              <div key={floor} className="layout-floor-section">
                <button type="button" className="layout-floor-toggle"
                  onClick={() => setOpenFloor(openFloor === floor ? 0 : floor)}>
                  Tầng {floor}<span>{openFloor === floor ? '−' : '+'}</span></button>
                {openFloor === floor && <div className="layout-floor-bins">
                  {binForms.filter((bin) => bin.floorNo === floor &&
                    bin.binNo <= Number(rackForm.binsPerFloor)).map((bin) =>
                    <div key={id(bin.id)} className="layout-bin-editor">
                      <strong>Ô {bin.binNo} · {bin.locationCode}</strong>
                      <label>Sức chứa {rackForm.zoneCode === 'B' ? '(chiếc)' : ''}
                        <input type="number" min="0" step={rackForm.zoneCode === 'A' ? 'any' : '1'} value={bin.capacity}
                        disabled={!canEdit || busy} onChange={(event) => editBin(id(bin.id),
                          { capacity: Number(event.target.value) })} /></label>
                      {rackForm.zoneCode === 'A' && <label>Đơn vị sức chứa
                        <select value={bin.capacityUnit || 'PIECE'} disabled={!canEdit || busy}
                          onChange={(event) => editBin(id(bin.id), { capacityUnit: event.target.value })}>
                          {rawUnits.map((unit) => <option key={unit.value} value={unit.value}>{unit.label}</option>)}
                        </select></label>}
                      <label>Trạng thái ô<select value={bin.status} disabled={!canEdit || busy}
                        onChange={(event) => editBin(id(bin.id), { status: event.target.value })}>
                        <option value="ACTIVE">Hoạt động</option><option value="LOCKED">Tạm khóa</option>
                        <option value="INACTIVE">Ngừng dùng</option></select></label>
                      <div className="layout-bin-barcode"><code>{bin.barcode}</code>
                        {canPrint && activeBinIds.has(id(bin.id)) &&
                          <button type="button" onClick={() => printBin(bin)}>Xem / in QR ô kệ</button>}</div>
                    </div>)}
                  {!binForms.some((bin) => bin.floorNo === floor &&
                    bin.binNo <= Number(rackForm.binsPerFloor)) &&
                    <p>Ô mới sẽ được tạo khi lưu kệ.</p>}
                </div>}
              </div>)}
          </div>}
          {canEdit && <div className="layout-panel-actions">
            {!adding && <button type="button" className="danger" disabled={busy} onClick={() => setConfirmation({
              title: 'Xác nhận xóa kệ',
              message: `Xóa kệ ${rackForm.zoneCode}-${rackForm.code} và toàn bộ ô của kệ khỏi sơ đồ kho? Chỉ thực hiện khi đã chuyển hết hàng và xử lý hàng chờ xếp.`,
              label: 'Xác nhận xóa kệ', tone: 'danger', run: removeRack,
            })}>Xóa kệ</button>}
            <button type="button" onClick={confirmDiscard}
            disabled={busy}>Hủy</button><button type="button" className="primary" onClick={() => setConfirmation({
              title: adding ? 'Xác nhận thêm kệ' : 'Xác nhận lưu thay đổi',
              message: adding ? `Thêm kệ ${rackForm.zoneCode}-${rackForm.code || 'mới'} và áp dụng vào sơ đồ kho?`
                : `Lưu thay đổi của kệ ${rackForm.zoneCode}-${rackForm.code} và áp dụng vào sơ đồ kho?`,
              label: adding ? 'Xác nhận thêm kệ' : 'Xác nhận lưu', run: save,
            })}
              disabled={busy}>{busy ? 'Đang lưu...' : 'Lưu thay đổi'}</button></div>}
          </>}
        </>}
      </section>
    </div>
    {showLabels && <div className="layout-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowLabels(false); }}>
      <div className="layout-label-modal" role="dialog" aria-modal="true" aria-labelledby="layout-label-title">
        <div className="layout-modal-heading"><div><small>TEM VỊ TRÍ KHO</small><h2 id="layout-label-title">In tem vị trí</h2></div>
          <button type="button" onClick={() => setShowLabels(false)} aria-label="Đóng">×</button></div>
        <p>Chọn ô cần in. Mã vị trí và QR được lấy từ cấu hình kho đã công bố.</p>
        <label className="layout-select-all"><input type="checkbox" checked={selectedLabels.length === (layout?.active?.bins || []).length && selectedLabels.length > 0}
          onChange={(event) => setSelectedLabels(event.target.checked ? (layout?.active?.bins || []).map((bin) => id(bin.id)) : [])} /> Chọn tất cả ô</label>
        <div className="layout-label-list">{(layout?.active?.bins || []).map((bin) => <label key={id(bin.id)}>
          <input type="checkbox" checked={selectedLabels.includes(id(bin.id))} onChange={(event) => setSelectedLabels((current) =>
            event.target.checked ? [...current, id(bin.id)] : current.filter((value) => value !== id(bin.id)))} />
          <span>{bin.locationCode}</span></label>)}</div>
        {!(layout?.active?.bins || []).length && <p>Chưa có ô được công bố để in tem.</p>}
        <div className="layout-modal-actions"><button type="button" onClick={() => setShowLabels(false)}>Đóng</button>
          <button type="button" className="primary" disabled={busy || !selectedLabels.length} onClick={printSelectedLabels}>
            {busy ? 'Đang chuẩn bị...' : `In ${selectedLabels.length} tem đã chọn`}</button></div>
      </div></div>}
    {confirmation && <div className="layout-modal-backdrop">
      <div className="layout-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="layout-confirm-title">
        <h2 id="layout-confirm-title">{confirmation.title}</h2><p>{confirmation.message}</p>
        <div className="layout-modal-actions"><button type="button" disabled={confirmBusy} onClick={() => setConfirmation(null)}>Hủy</button>
          <button type="button" className={confirmation.tone === 'danger' ? 'danger' : 'primary'} disabled={confirmBusy} onClick={confirmAction}>
            {confirmBusy ? 'Đang thực hiện...' : confirmation.label}</button></div>
      </div></div>}
    {toast && <div key={toast.key} className={`layout-toast ${toast.type === 'error' ? 'error' : 'success'}`}
      role={toast.type === 'error' ? 'alert' : 'status'}>{toast.text}
      <button type="button" onClick={() => setToast(null)} aria-label="Đóng thông báo">×</button></div>}
  </main>;
}
