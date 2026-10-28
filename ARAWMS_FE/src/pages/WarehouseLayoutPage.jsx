/*
 * File: WarehouseLayoutPage.jsx
 * Author: Duy Anh
 * Date: 2026-10-27
 * Description: Lists racks by warehouse area and shows current stock or configuration in the side panel. Managers can inspect unit barcodes and pending putaway per bin.
 */
import { useEffect, useState } from 'react';
import { warehouseLayoutService as api } from '../services/warehouseLayoutService';
import WarehouseRackContents from '../components/WarehouseRackContents';
import '../styles/warehouseLayout.css';

const id = (value) => String(value?._id || value?.id || value || '');
const defaultZones = [
  { code: 'A', name: 'Kho nguyên phụ liệu', type: 'WORK', status: 'ACTIVE' },
  { code: 'B', name: 'Kho thành phẩm', type: 'STORAGE', status: 'ACTIVE' },
];
const emptyRack = { code: '', name: '', zoneCode: 'B', floors: 3, binsPerFloor: 1,
  capacityUnit: 'PIECE', status: 'ACTIVE' };
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
  Number(rack.binsPerFloor) <= 20 && Number(rack.floors) * Number(rack.binsPerFloor) <= 120;

export default function WarehouseLayoutPage() {
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
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [panelTab, setPanelTab] = useState('contents');

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
    const selected = nextRacks.find((rack) => id(rack.id) === selectRackId);
    if (selected) {
      setSelectedRackId(selectRackId);
      setRackForm(rackFields(selected));
      setBinForms(nextBins.filter((bin) => id(bin.rackId) === selectRackId));
      setOpenFloor(1);
      setPanelTab(next.active?.racks?.some((rack) => id(rack.id) === selectRackId)
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
  };
  const startAdding = (zoneCode) => {
    setAdding(true);
    setSelectedRackId('');
    setRackForm({ ...emptyRack, zoneCode });
    setBinForms([]);
    setPanelTab('config');
    setError('');
    setMessage('');
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
          binsPerFloor: Number(rackForm.binsPerFloor),
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

  const printBin = async (bin) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) { setError('Trình duyệt đã chặn cửa sổ in.'); return; }
    printWindow.document.write('<p>Đang chuẩn bị tem vị trí...</p>');
    try {
      const [label, image] = await Promise.all([api.label(id(bin.id)), api.labelImage(id(bin.id))]);
      await api.printIntent(id(bin.id));
      const imageUrl = URL.createObjectURL(image.data);
      const code = label.data.bin.locationCode;
      printWindow.document.open();
      printWindow.document.write(`<!doctype html><html><head><title>Tem vị trí kho</title>
        <style>body{font-family:Arial,sans-serif;text-align:center;padding:24px}
        img{width:320px;max-width:100%}strong{display:block;font-size:24px;margin:16px}
        @media print{button{display:none}}</style></head><body>
        <button onclick="window.print()">In tem</button><strong>${code}</strong>
        <img src="${imageUrl}" alt="Barcode ${code}"><p>${label.data.bin.barcode}</p></body></html>`);
      printWindow.document.close();
      printWindow.onload = () => printWindow.print();
      printWindow.onafterprint = () => URL.revokeObjectURL(imageUrl);
    } catch (err) { printWindow.close(); setError(errorText(err)); }
  };

  const canEdit = capabilities['warehouse.layout.edit'] !== false &&
    capabilities['warehouse.layout.publish'] !== false;
  const canPrint = capabilities['warehouse.location.barcode.print'] !== false;
  const activeRackIds = new Set((layout?.active?.racks || []).map((rack) => id(rack.id)));
  const activeBinIds = new Set((layout?.active?.bins || []).map((bin) => id(bin.id)));
  const zoneB = zones.find((zone) => zone.code === 'B') || defaultZones[1];
  const aRacks = racks.filter((rack) => rack.zoneCode === 'A');
  const bRacks = racks.filter((rack) => rack.zoneCode === 'B');
  const rackButton = (rack) => <button key={id(rack.id)} type="button"
    className={`layout-rack-card ${selectedRackId === id(rack.id) ? 'selected' : ''}`}
    onClick={() => selectRack(rack)} aria-pressed={selectedRackId === id(rack.id)}
    aria-label={`Kệ ${rack.zoneCode}-${rack.code}, ${rack.name}, ${rack.floors} tầng, ${rack.binsPerFloor} ô mỗi tầng`}>
    <strong>{rack.zoneCode}-{rack.code}</strong>
    <span className="layout-rack-name">{rack.name}</span>
    <small>{rack.floors} tầng · {rack.binsPerFloor} ô/tầng</small>
  </button>;

  return <main className="warehouse-layout-page">
    <header className="layout-header"><div><small>QUẢN LÝ KHO</small><h1>Cấu hình vị trí kho</h1>
      <p>Chọn kệ trong từng khu để xem và chỉnh cấu hình vị trí.</p></div></header>
    {error && <div className="layout-alert" role="alert">{error}</div>}
    {message && <div className="layout-message" role="status">{message}</div>}
    <div className={`layout-workspace ${panelTab === 'contents' ? 'has-contents' : ''}`}>
      <section className="layout-map-card" aria-label="Danh sách kệ theo khu">
        <div className="layout-map-title"><h2>Kệ theo khu vực</h2></div>
        <div className="layout-zones">
          <section className="layout-zone-card layout-area-a" aria-label="Khu A — kho nguyên phụ liệu">
            <div className="layout-area-heading"><div><strong>Khu A</strong>
              <span>Kho nguyên phụ liệu</span></div>
              {canEdit && <button type="button" onClick={() => startAdding('A')}>+ Thêm kệ</button>}
            </div>
            <div className="layout-rack-grid">{aRacks.map(rackButton)}
              {!aRacks.length && <p className="layout-zone-empty">Chưa có kệ trong khu A.</p>}
            </div>
          </section>
          <section className="layout-zone-card layout-area-b" aria-label="Khu B — kho thành phẩm">
            <div className="layout-area-heading"><div><strong>Khu B</strong>
              <span>{zoneB.name}</span></div>
              {canEdit && <button type="button" onClick={() => startAdding('B')}>+ Thêm kệ</button>}
            </div>
            <div className="layout-rack-grid">{bRacks.map(rackButton)}
              {!bRacks.length && <p className="layout-zone-empty">Chưa có kệ trong khu B.</p>}
            </div>
          </section>
        </div>
      </section>
      <aside className="layout-config-panel">
        {!adding && !selectedRackId && <div className="layout-panel-empty">
          Chọn một kệ trong khu A hoặc B để xem và cấu hình.</div>}
        {(adding || selectedRackId) && <>
          <div className="layout-panel-heading"><div><small>{adding ? 'THÊM KỆ' : 'CẤU HÌNH KỆ'}</small>
            <h2>{adding ? `Kệ mới tại khu ${rackForm.zoneCode}` : `Kệ ${rackForm.zoneCode}-${rackForm.code}`}</h2></div>
            <button type="button" onClick={cancel} aria-label="Đóng panel">×</button></div>
          {!adding && activeRackIds.has(selectedRackId) && <div className="layout-panel-tabs">
            <button type="button" className={panelTab === 'contents' ? 'active' : ''}
              onClick={() => setPanelTab('contents')}>Hàng trong kệ</button>
            <button type="button" className={panelTab === 'config' ? 'active' : ''}
              onClick={() => setPanelTab('config')}>Cấu hình</button></div>}
          {!adding && panelTab === 'contents' && activeRackIds.has(selectedRackId) &&
            <WarehouseRackContents key={selectedRackId} rackId={selectedRackId} />}
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
            {adding && rackForm.zoneCode === 'A' && <label>Đơn vị sức chứa của ô
              <select value={rackForm.capacityUnit} disabled={busy}
                onChange={(event) => setRackForm({ ...rackForm, capacityUnit: event.target.value })}>
                {rawUnits.map((unit) => <option key={unit.value} value={unit.value}>{unit.label}</option>)}
              </select></label>}
            <label>Trạng thái<select value={rackForm.status} disabled={adding || !canEdit || busy}
              onChange={(event) => setRackForm({ ...rackForm, status: event.target.value })}>
              <option value="ACTIVE">Hoạt động</option><option value="INACTIVE">Ngừng dùng</option>
            </select></label>
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
                          <button type="button" onClick={() => printBin(bin)}>Xem / in barcode</button>}</div>
                    </div>)}
                  {!binForms.some((bin) => bin.floorNo === floor &&
                    bin.binNo <= Number(rackForm.binsPerFloor)) &&
                    <p>Ô mới sẽ được tạo khi lưu kệ.</p>}
                </div>}
              </div>)}
          </div>}
          {canEdit && <div className="layout-panel-actions"><button type="button" onClick={cancel}
            disabled={busy}>Hủy</button><button type="button" className="primary" onClick={save}
              disabled={busy}>{busy ? 'Đang lưu...' : 'Lưu thay đổi'}</button></div>}
          </>}
        </>}
      </aside>
    </div>
  </main>;
}
