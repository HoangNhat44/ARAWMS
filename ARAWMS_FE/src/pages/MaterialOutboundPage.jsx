/*
 * File: MaterialOutboundPage.jsx
 * Description: Lists raw-material issues and guides source picking, physical checks, and confirmation.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { materialOutboundService as api } from '../services/materialOutboundService';
import { MATERIAL_UNIT_OPTIONS, isFractionalMaterialUnit } from '../utils/materialUnits';
import '../styles/materialOutbound.css';

const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const formatDate = (value) => value ? new Date(value).toLocaleDateString('vi-VN') : '—';
const display = (value) => Number(value || 0).toLocaleString('vi-VN', { maximumFractionDigits: 3 });
const units = Object.fromEntries(MATERIAL_UNIT_OPTIONS.map(({ value, shortLabel }) => [value, shortLabel]));
const id = (value) => String(value || '');
const ticketId = (value) => value?._id || value?.id;
const sum = (list) => Math.round(list.reduce((total, entry) => total + Number(entry.quantity || 0), 0) * 1000) / 1000;
const draftSignature = (value) => JSON.stringify({ warehouseCode: value?.warehouseCode, issueDate: value?.issueDate?.slice(0, 10),
  department: value?.department, recipient: value?.recipient, purpose: value?.purpose,
  lines: value?.lines?.map((line) => ({ rawMaterialId: id(line.rawMaterialId), quantity: Number(line.quantity),
    sources: line.sources.map((source) => ({ objectId: id(source.objectId), locationId: id(source.locationId),
      quantity: Number(source.quantity) })) })) });
const blank = (warehouseCode = '') => ({ warehouseCode, issueDate: today(), department: '', recipient: '', purpose: '', lines: [] });
const errorMessage = (error) => error?.message || 'Không thể thực hiện thao tác.';
const testUser = { _id: '507f1f77bcf86cd799439011', roles: ['OWNER', 'ADMIN'] };

/** The server remains authoritative: only an unsent form is stored locally for reconnect. */
export default function MaterialOutboundPage() {
  const user = testUser;
  const localKey = `arawms-material-outbound-local-draft:${id(user?.id || user?._id)}`;
  const [options, setOptions] = useState({ warehouses: [], locations: [], materials: [], sources: [] });
  const [tickets, setTickets] = useState([]);
  const [filters, setFilters] = useState({ search: '', from: '', to: '', department: '', status: '' });
  const [page, setPage] = useState(1);
  const [ticket, setTicket] = useState(null);
  const [form, setForm] = useState(null);
  const [sourceLine, setSourceLine] = useState(null);
  const [sourceDraft, setSourceDraft] = useState([]);
  const [sourceSearch, setSourceSearch] = useState('');
  const [sourceLocation, setSourceLocation] = useState('');
  const [materialSearch, setMaterialSearch] = useState('');
  const [barcode, setBarcode] = useState('');
  const [scanLocationId, setScanLocationId] = useState('');
  const [checkedQuantity, setCheckedQuantity] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [hasLocalDraft, setHasLocalDraft] = useState(false);
  const cameraRef = useRef(null);
  const videoRef = useRef(null);

  const refresh = useCallback(async () => {
    const [choices, list] = await Promise.all([api.options(), api.list({})]);
    setOptions(choices.data);
    setTickets(list.data);
  }, []);
  useEffect(() => { refresh().catch((failure) => setError(errorMessage(failure))); }, [refresh]);
  useEffect(() => { setHasLocalDraft(Boolean(user && localStorage.getItem(localKey))); }, [localKey, user]);
  useEffect(() => () => { cameraRef.current?.stop?.(); }, []);

  const filtered = useMemo(() => tickets.filter((item) => {
    const text = `${item.ticketCode} ${item.recipient} ${item.lines.map((line) => `${line.materialCode} ${line.materialName}`).join(' ')}`.toLocaleLowerCase('vi');
    return (!filters.search || text.includes(filters.search.toLocaleLowerCase('vi'))) &&
      (!filters.status || item.status === filters.status) && (!filters.department || item.department === filters.department) &&
      (!filters.from || item.issueDate?.slice(0, 10) >= filters.from) && (!filters.to || item.issueDate?.slice(0, 10) <= filters.to);
  }), [tickets, filters]);
  const shown = filtered.slice((page - 1) * 10, page * 10);
  const sourcesForLine = (line) => options.sources.filter((source) => id(source.rawMaterialId) === id(line.rawMaterialId) &&
    options.locations.some((location) => id(location._id) === id(source.locationId) && location.zoneCode === form?.warehouseCode));
  const selectedCount = form?.lines.reduce((total, line) => total + line.sources.length, 0) || 0;
  const checkedCount = form?.lines.reduce((total, line) => total + line.sources.filter((source) => source.checkedAt).length, 0) || 0;
  const totals = useMemo(() => (form?.lines || []).reduce((result, line) => {
    result[line.unit] = (result[line.unit] || 0) + Number(line.quantity || 0);
    return result;
  }, {}), [form]);
  const editable = form && (!ticket || ticket.status === 'DRAFT');
  const pendingChanges = editable && (!ticket || draftSignature(form) !== draftSignature(ticket));
  const scanMatches = (form?.lines || []).flatMap((line) => line.sources)
    .filter((source) => source.barcode.toUpperCase() === barcode.trim().toUpperCase() && barcode.trim());
  const complete = editable && form.lines.length > 0 && form.department.trim() && form.recipient.trim() && form.purpose.trim() &&
    !pendingChanges &&
    form.lines.every((line) => Number(line.quantity) > 0 && Math.abs(sum(line.sources) - Number(line.quantity)) < .0001 &&
      line.sources.length > 0 && line.sources.every((source) => source.checkedAt));

  function openNew() {
    setTicket(null); setForm(blank(options.warehouses[0] || '')); setReviewed(false); setError(''); setMessage('');
  }
  async function openTicket(item) {
    try {
      const result = await api.detail(item._id);
      setTicket(result.data); setForm({ ...result.data, issueDate: result.data.issueDate.slice(0, 10) });
      setReviewed(false); setError(''); setMessage('');
    } catch (failure) { setError(errorMessage(failure)); }
  }
  function updateLine(index, patch) {
    setForm((current) => ({ ...current, lines: current.lines.map((line, position) => position === index ? { ...line, ...patch,
      sources: patch.quantity !== undefined ? line.sources.map((source) => ({ ...source, checkedAt: null,
        checkedByUserId: null, checkedQuantity: null })) : patch.sources ?? line.sources } : line) }));
    setReviewed(false);
  }
  function addMaterial(material) {
    const existing = form.lines.findIndex((line) => id(line.rawMaterialId) === id(material._id));
    if (existing >= 0) { document.getElementById(`outbound-line-${existing}`)?.scrollIntoView({ block: 'center' }); return; }
    setForm((current) => ({ ...current, lines: [...current.lines, { rawMaterialId: material._id,
      materialCode: material.materialCode, materialName: material.materialName, color: material.color,
      unit: material.unit, quantity: '', sources: [] }] }));
    setMaterialSearch('');
  }
  function openSource(index) {
    setSourceLine(index); setSourceDraft(form.lines[index].sources.map((source) => ({ ...source })));
    setSourceSearch(''); setSourceLocation('');
  }
  function assignSource(source, value) {
    setSourceDraft((current) => {
      const without = current.filter((entry) => !(id(entry.objectId) === id(source.objectId) && id(entry.locationId) === id(source.locationId)));
      const numeric = Number(value);
      return numeric > 0 ? [...without, { kind: source.kind, objectId: source.objectId, barcode: source.barcode,
        locationId: source.locationId, locationCode: source.locationCode, inboundTicketId: source.inboundTicketId,
        quantity: value, checkedAt: null }].sort((a, b) => a.barcode.localeCompare(b.barcode)) : without;
    });
  }
  function applyFifo() {
    const line = form.lines[sourceLine];
    let remaining = Number(line.quantity);
    const selected = [];
    for (const source of sourcesForLine(line)) {
      const amount = Math.min(remaining, Number(source.available));
      if (amount > 0) selected.push({ kind: source.kind, objectId: source.objectId, barcode: source.barcode,
        locationId: source.locationId, locationCode: source.locationCode, inboundTicketId: source.inboundTicketId,
        quantity: amount, checkedAt: null });
      remaining = Math.round((remaining - amount) * 1000) / 1000;
      if (remaining <= 0) break;
    }
    setSourceDraft(selected);
  }
  function saveSources() {
    const line = form.lines[sourceLine];
    const available = new Map(sourcesForLine(line).map((source) => [`${id(source.objectId)}:${id(source.locationId)}`, Number(source.available)]));
    const scale = ['METER', 'KG'].includes(line.unit) ? 1000 : 1;
    if (sourceDraft.some((source) => !Number.isFinite(Number(source.quantity)) || Number(source.quantity) <= 0 ||
      Number(source.quantity) > (available.get(`${id(source.objectId)}:${id(source.locationId)}`) || 0) ||
      Math.abs(Number(source.quantity) * scale - Math.round(Number(source.quantity) * scale)) > .000001)) {
      setError('Lượng lấy phải dương, không vượt tồn nguồn và đúng đơn vị quản lý.'); return;
    }
    if (Math.abs(sum(sourceDraft) - Number(line.quantity)) >= .0001) {
      setError('Tổng lượng lấy phải bằng số lượng cần xuất.'); return;
    }
    const old = new Map(line.sources.map((source) => [`${id(source.objectId)}:${id(source.locationId)}:${source.quantity}`, source]));
    updateLine(sourceLine, { sources: sourceDraft.map((source) => {
      const same = old.get(`${id(source.objectId)}:${id(source.locationId)}:${source.quantity}`);
      return same || source;
    }) });
    setSourceLine(null); setError('');
  }
  async function saveDraft(close = false) {
    if (!form) return;
    setBusy(true); setError('');
    try {
      const payload = { ...form, version: ticket?.version };
      const result = ticket ? await api.update(ticketId(ticket), payload) : await api.create(payload);
      setTicket(result.data); setForm({ ...result.data, issueDate: result.data.issueDate.slice(0, 10) });
      localStorage.removeItem(localKey);
      setHasLocalDraft(false);
      setMessage('Đã lưu bản nháp. Tồn kho chưa giảm.');
      refresh().catch(() => setMessage('Đã lưu nháp. Danh sách sẽ cập nhật khi kết nối ổn định.'));
      if (close) setForm(null);
    } catch (failure) {
      setError(errorMessage(failure));
      if (!failure.status && user) { localStorage.setItem(localKey, JSON.stringify(form)); setHasLocalDraft(true);
        setMessage('Đã lưu tạm trên thiết bị. Cần lưu lên máy chủ khi có mạng.'); }
    } finally { setBusy(false); }
  }
  async function verifyBarcode(value = barcode) {
    if (!ticket || ticket.status !== 'DRAFT') { setError('Hãy lưu bản nháp lên máy chủ trước khi kiểm tra.'); return; }
    if (!value.trim()) return;
    if (pendingChanges) {
      setError('Phiếu đã đổi. Hãy lưu bản nháp trước khi kiểm tra.'); return;
    }
    const matching = form.lines.flatMap((line) => line.sources).filter((source) => source.barcode.toUpperCase() === value.trim().toUpperCase());
    if (matching.length > 1 && !scanLocationId) { setError('Chọn đúng vị trí lấy của lô trước khi kiểm tra.'); return; }
    setBusy(true); setError('');
    try {
      const result = await api.check(ticketId(ticket), { barcode: value, quantity: checkedQuantity,
        locationId: scanLocationId || matching[0]?.locationId });
      setTicket(result.data); setForm({ ...result.data, issueDate: result.data.issueDate.slice(0, 10) });
      setMessage(`Đã kiểm tra ${value.trim()}.`); setBarcode(''); setCheckedQuantity(''); setScanLocationId('');
    } catch (failure) { setError(errorMessage(failure)); }
    finally { setBusy(false); }
  }
  async function startCamera() {
    try {
      const { BrowserMultiFormatReader } = await import('@zxing/browser');
      const reader = new BrowserMultiFormatReader();
      cameraRef.current = await reader.decodeFromVideoDevice(undefined, videoRef.current, (result) => {
        if (result) { setBarcode(result.getText()); cameraRef.current?.stop(); cameraRef.current = null; }
      });
    } catch (failure) { setError(`Không mở được camera: ${errorMessage(failure)}`); }
  }
  async function confirmIssue() {
    setBusy(true); setError('');
    try {
      const key = sessionStorage.getItem(`material-confirm-${ticketId(ticket)}`) || crypto.randomUUID();
      sessionStorage.setItem(`material-confirm-${ticketId(ticket)}`, key);
      const result = await api.confirm(ticketId(ticket), { confirmationKey: key, version: ticket.version, reviewed: true });
      setTicket(result.data); setForm({ ...result.data, issueDate: result.data.issueDate.slice(0, 10) });
      setConfirmOpen(false); setMessage('Đã xác nhận xuất kho và ghi giảm tồn.');
      refresh().catch(() => setMessage('Đã xác nhận xuất kho. Danh sách sẽ cập nhật khi kết nối ổn định.'));
    } catch (failure) { setError(errorMessage(failure)); setConfirmOpen(false); }
    finally { setBusy(false); }
  }
  async function cancelDraft() {
    if (!window.confirm('Hủy bản nháp này? Tồn kho chưa bị ảnh hưởng.')) return;
    setBusy(true);
    try { await api.cancel(ticketId(ticket)); setForm(null); setTicket(null);
      refresh().catch(() => setMessage('Đã hủy bản nháp. Danh sách sẽ cập nhật khi kết nối ổn định.')); }
    catch (failure) { setError(errorMessage(failure)); }
    finally { setBusy(false); }
  }
  function closeForm() {
    cameraRef.current?.stop?.(); cameraRef.current = null;
    if (editable && !window.confirm('Đóng form? Thay đổi chưa lưu sẽ bị bỏ.')) return;
    setForm(null); setTicket(null); setSourceLine(null);
  }
  function printTicket() { window.print(); }

  return <div className="material-outbound-page">
    <div className="mo-breadcrumb"><Link to="/">Trang chủ</Link> / Nguyên phụ liệu / Xuất kho</div>
    <header className="mo-hero"><div><h1>Xuất nguyên phụ liệu</h1><p>Lập phiếu và theo dõi nguyên phụ liệu bàn giao cho bộ phận sử dụng.</p></div>
      <div className="mo-actions"><span>Kho nguyên phụ liệu</span><button onClick={() => refresh().catch((failure) => setError(errorMessage(failure)))}>Làm mới</button>
        {hasLocalDraft && <button onClick={async () => { try { const saved = JSON.parse(localStorage.getItem(localKey));
          if (ticketId(saved)) { const result = await api.detail(ticketId(saved)); setTicket(result.data); }
          else setTicket(null);
          setForm(saved); setError(''); setMessage('Bản nháp trên thiết bị chưa được máy chủ xác nhận. Hãy lưu lại và kiểm tra tồn.'); }
          catch (failure) { setError(errorMessage(failure)); } }}>Mở nháp trên thiết bị</button>}
        <button className="primary" onClick={openNew}>+ Tạo phiếu xuất</button></div></header>
    {error && <p role="alert" className="mo-error">{error}</p>}{message && <p className="mo-success">{message}</p>}
    <section className="mo-card mo-filters"><input aria-label="Tìm phiếu xuất" placeholder="Tìm mã phiếu, nguyên phụ liệu hoặc người nhận…" value={filters.search}
      onChange={(event) => { setFilters({ ...filters, search: event.target.value }); setPage(1); }} />
      <label>Từ ngày<input type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} /></label>
      <label>Đến ngày<input type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} /></label>
      <select aria-label="Bộ phận nhận" value={filters.department} onChange={(event) => setFilters({ ...filters, department: event.target.value })}><option value="">Tất cả bộ phận</option>
        {[...new Set(tickets.map((item) => item.department))].map((name) => <option key={name}>{name}</option>)}</select>
      <select aria-label="Trạng thái" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option value="">Tất cả trạng thái</option>
        <option value="DRAFT">Nháp</option><option value="COMPLETED">Đã xác nhận</option><option value="CANCELLED">Đã hủy</option></select>
      <button onClick={() => { setFilters({ search: '', from: '', to: '', department: '', status: '' }); setPage(1); }}>Xóa bộ lọc</button></section>
    <section className="mo-card mo-list"><h2>Danh sách phiếu xuất</h2>{shown.length ? <><div className="mo-table-wrap"><table><thead><tr>
      <th>Mã phiếu</th><th>Ngày xuất</th><th>Bộ phận nhận</th><th>Người nhận</th><th>Nguyên phụ liệu</th><th>Số mặt hàng</th><th>Trạng thái</th><th>Người lập</th><th>Thao tác</th>
    </tr></thead><tbody>{shown.map((item) => <tr key={item._id}><td>{item.ticketCode}</td><td>{formatDate(item.issueDate)}</td>
      <td>{item.department}</td><td>{item.recipient}</td><td>{item.lines[0]?.materialName || '—'}{item.lines.length > 1 && ` +${item.lines.length - 1} mặt hàng`}</td>
      <td>{item.lines.length}</td><td><span className={`mo-status ${item.status.toLowerCase()}`}>{item.status === 'DRAFT' ? 'Nháp · Chưa giảm tồn' : item.status === 'COMPLETED' ? 'Đã xác nhận' : 'Đã hủy'}</span></td>
      <td>{item.createdByUserId?.fullName || '—'}</td><td><button onClick={() => openTicket(item)}>{item.status === 'DRAFT' ? 'Tiếp tục lập' : 'Xem phiếu'}</button></td></tr>)}</tbody></table></div>
      <div className="mo-pagination"><span>{filtered.length} kết quả</span><button disabled={page === 1} onClick={() => setPage(page - 1)}>Trước</button>
        <span>{page}/{Math.ceil(filtered.length / 10)}</span><button disabled={page * 10 >= filtered.length} onClick={() => setPage(page + 1)}>Sau</button></div></>
      : <div className="mo-empty">Chưa có phiếu xuất nguyên phụ liệu.<button className="primary" onClick={openNew}>Tạo phiếu xuất</button></div>}</section>

    {form && <div className="mo-overlay" role="presentation"><div className="mo-modal" role="dialog" aria-modal="true" aria-label="Xuất nguyên phụ liệu">
      <header className="mo-modal-head"><div><h2>Xuất nguyên phụ liệu</h2><span>{ticket?.ticketCode || 'Phiếu mới'} · {ticket?.status === 'COMPLETED' ? 'Đã xác nhận' : ticket?.status === 'CANCELLED' ? 'Đã hủy' : 'Bản nháp'}</span></div>
        <button aria-label="Đóng" onClick={closeForm}>×</button></header>
      <div className="mo-modal-body"><p>Nhập lượng cần dùng, chọn cây/lô và kiểm tra hàng thực lấy trước khi xuất.</p>
        {error && <p role="alert" className="mo-error">{error}</p>}{message && <p className="mo-success">{message}</p>}
        <section className="mo-card"><h3>Thông tin bàn giao</h3><div className="mo-grid">
          <label>Kho xuất<select disabled={!editable} value={form.warehouseCode} onChange={(event) => setForm({ ...form, warehouseCode: event.target.value,
            lines: form.lines.map((line) => ({ ...line, sources: [] })) })}>{options.warehouses.map((code) => <option key={code}>{code}</option>)}</select></label>
          <label>Ngày xuất<input disabled={!editable || ![user?.roleCode, ...(user?.roles || [])].some((role) =>
            ['OWNER', 'ADMIN', 'WAREHOUSE_MANAGER'].includes(role))} type="date" value={form.issueDate} onChange={(event) => setForm({ ...form, issueDate: event.target.value })} /></label>
          <label>Bộ phận nhận *<input disabled={!editable} list="mo-departments" placeholder="Xưởng cắt, xưởng may…" value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} />
            <datalist id="mo-departments"><option value="Xưởng cắt"/><option value="Xưởng may"/></datalist></label>
          <label>Người nhận *<input disabled={!editable} value={form.recipient} onChange={(event) => setForm({ ...form, recipient: event.target.value })} /></label>
          <label className="wide">Mục đích sử dụng *<input disabled={!editable} placeholder="Cắt áo sơ mi đợt 01" value={form.purpose} onChange={(event) => setForm({ ...form, purpose: event.target.value })} /></label>
        </div></section>
        <section className="mo-card"><h3>Nguyên phụ liệu cần xuất</h3>{editable && <><input placeholder="Tìm mã, tên, màu hoặc quy cách nguyên phụ liệu…" value={materialSearch} onChange={(event) => setMaterialSearch(event.target.value)} />
          {materialSearch && <div className="mo-results">{options.materials.filter((material) => `${material.materialCode} ${material.materialName} ${material.color || ''} ${material.widthCm || ''}`.toLocaleLowerCase('vi').includes(materialSearch.toLocaleLowerCase('vi')) &&
            sourcesForLine({ rawMaterialId: material._id }).length > 0).slice(0, 10).map((material) => <button key={material._id} onClick={() => addMaterial(material)}>
              {material.materialCode} · {material.materialName} · {material.color || '—'} · {units[material.unit]} · khả dụng {display(material.available)}</button>)}</div>}</>}
          <div className="mo-table-wrap"><table><thead><tr><th>Nguyên phụ liệu</th><th>ĐVT</th><th>Khả dụng</th><th>Số lượng xuất</th><th>Nguồn lấy hàng</th>{editable && <th>Thao tác</th>}</tr></thead>
            <tbody>{form.lines.map((line, index) => { const material = options.materials.find((item) => id(item._id) === id(line.rawMaterialId));
              return <tr id={`outbound-line-${index}`} key={id(line.rawMaterialId)}><td><strong>{line.materialName}</strong><small>{line.materialCode} · {line.color || '—'}</small></td>
                <td>{units[line.unit] || line.unit}</td><td>{display(material?.available)}</td><td><input disabled={!editable} type="number" min="0" step={isFractionalMaterialUnit(line.unit) ? '.001' : '1'} value={line.quantity}
                  onChange={(event) => updateLine(index, { quantity: event.target.value })} /></td><td>{display(sum(line.sources))}/{display(line.quantity)} {units[line.unit]} · {line.sources.length} cây/lô
                  {Math.abs(sum(line.sources) - Number(line.quantity)) >= .0001 && <small>Cần kiểm tra lại nguồn lấy</small>}
                  {editable && <button onClick={() => openSource(index)}>Chọn cây/lô</button>}</td>
                {editable && <td><button onClick={() => { if (window.confirm('Bỏ mặt hàng cùng nguồn lấy và kết quả kiểm tra?'))
                  setForm({ ...form, lines: form.lines.filter((_, position) => position !== index) }); }}>Xóa</button></td>}</tr>; })}</tbody></table></div>
        </section>
        <section className="mo-card"><h3>Kiểm tra hàng thực lấy</h3>{editable && <div className="mo-scan"><video ref={videoRef} muted playsInline />
          <button onClick={() => cameraRef.current ? (cameraRef.current.stop(), cameraRef.current = null) : startCamera()}>{cameraRef.current ? 'Tắt camera' : 'Mở camera'}</button>
          <input placeholder="Quét barcode cây/lô đã lấy…" value={barcode} onChange={(event) => setBarcode(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && verifyBarcode()} />
          {scanMatches.length > 1 && <select aria-label="Vị trí lấy của lô" value={scanLocationId} onChange={(event) => setScanLocationId(event.target.value)}>
            <option value="">Chọn vị trí lấy</option>{scanMatches.map((source) => <option key={id(source.locationId)} value={id(source.locationId)}>{source.locationCode}</option>)}</select>}
          <input type="number" min="0" placeholder="Lượng đã lấy" aria-label="Lượng thực lấy" value={checkedQuantity} onChange={(event) => setCheckedQuantity(event.target.value)} />
          <button disabled={busy} onClick={() => verifyBarcode()}>Đã lấy đúng lượng · Kiểm tra</button></div>}
          <div className="mo-table-wrap"><table><thead><tr><th>Nguồn</th><th>Vị trí lấy</th><th>Cần lấy</th><th>Trạng thái</th></tr></thead><tbody>
            {form.lines.flatMap((line) => line.sources.map((source) => <tr key={`${source.barcode}-${source.locationId}`}><td>{source.barcode}</td><td>{source.locationCode}</td>
              <td>{display(source.quantity)} {units[line.unit]}</td><td>{source.checkedAt ? 'Đã kiểm tra' : 'Chưa kiểm tra'}</td></tr>))}</tbody></table></div>
        </section>
        <section className="mo-card mo-summary"><h3>Tổng kết</h3><span>{form.lines.length} mặt hàng · {selectedCount} cây/lô · Đã kiểm tra {checkedCount}/{selectedCount}</span>
          <p>{Object.entries(totals).map(([unit, amount]) => `${display(amount)} ${units[unit]}`).join(' · ') || 'Chưa có số lượng'}</p>
          {ticket?.status === 'COMPLETED' && <p>Người xác nhận: {ticket.confirmedByUserId?.fullName || '—'} · {formatDate(ticket.confirmedAt)}</p>}</section>
      </div><footer className="mo-modal-foot"><label><input type="checkbox" disabled={!editable} checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} />
        Tôi đã kiểm tra nguồn lấy, số lượng và người nhận hàng.</label><div><button onClick={closeForm}>Đóng</button>
        {editable && <><button disabled={busy} onClick={() => saveDraft()}>Lưu nháp</button>{ticket?.status === 'DRAFT' && <button disabled={busy} onClick={cancelDraft}>Hủy bản nháp</button>}
          <button className="primary" disabled={busy || !ticket || !complete || !reviewed} onClick={() => setConfirmOpen(true)}>Xác nhận xuất kho</button></>}
        {ticket?.status === 'COMPLETED' && <button className="primary" onClick={printTicket}>In phiếu xuất</button>}</div></footer>
    </div></div>}

    {sourceLine !== null && form && <div className="mo-overlay top"><div className="mo-source-modal" role="dialog" aria-modal="true" aria-label="Chọn cây lô">
      <header><h2>Chọn cây/lô · {form.lines[sourceLine].materialName}</h2><button aria-label="Đóng" onClick={() => setSourceLine(null)}>×</button></header>
      <p>Cần xuất {display(form.lines[sourceLine].quantity)} {units[form.lines[sourceLine].unit]}. Ưu tiên nguồn nhập trước còn khả dụng.</p>
      {error && <p role="alert" className="mo-error">{error}</p>}
      <div className="mo-source-tools"><input placeholder="Tìm barcode cây/lô" value={sourceSearch} onChange={(event) => setSourceSearch(event.target.value)} />
        <select value={sourceLocation} onChange={(event) => setSourceLocation(event.target.value)}><option value="">Tất cả vị trí</option>
          {options.locations.filter((location) => location.zoneCode === form.warehouseCode).map((location) => <option key={location._id} value={location._id}>{location.locationCode}</option>)}</select>
        <button onClick={applyFifo}>Áp dụng gợi ý FIFO</button></div>
      <div className="mo-source-list"><table><thead><tr><th>Cây/lô · barcode</th><th>Ngày nhập</th><th>Vị trí</th><th>Khả dụng</th><th>Lượng lấy</th></tr></thead><tbody>
        {sourcesForLine(form.lines[sourceLine]).filter((source) => (!sourceSearch || source.barcode.toLowerCase().includes(sourceSearch.toLowerCase())) &&
          (!sourceLocation || id(source.locationId) === sourceLocation)).map((source) => <tr key={`${source.objectId}-${source.locationId}`}>
            <td>{source.barcode}<small>Phiếu nhập: {id(source.inboundTicketId)}</small></td><td>{formatDate(source.fifoInboundTimestamp)}</td><td>{source.locationCode}</td>
            <td>{display(source.available)} {units[form.lines[sourceLine].unit]}</td><td><input type="number" min="0" max={source.available}
              step={isFractionalMaterialUnit(form.lines[sourceLine].unit) ? '.001' : '1'} value={sourceDraft.find((entry) => id(entry.objectId) === id(source.objectId) && id(entry.locationId) === id(source.locationId))?.quantity || ''}
              onChange={(event) => assignSource(source, event.target.value)} /></td></tr>)}</tbody></table></div>
      <footer><span>Đã chọn {display(sum(sourceDraft))}/{display(form.lines[sourceLine].quantity)} {units[form.lines[sourceLine].unit]}</span>
        <button onClick={() => setSourceLine(null)}>Hủy</button><button className="primary" onClick={saveSources}>Lưu lựa chọn</button></footer>
    </div></div>}
    {confirmOpen && <div className="mo-overlay top"><div className="mo-confirm" role="dialog" aria-modal="true" aria-label="Xác nhận xuất kho">
      <h2>Xác nhận xuất nguyên phụ liệu?</h2><p>{form.warehouseCode} · {formatDate(form.issueDate)} · {form.department} · {form.recipient}</p>
      <p>{form.purpose}</p><p>{form.lines.length} mặt hàng · {selectedCount} cây/lô · {Object.entries(totals).map(([unit, amount]) => `${display(amount)} ${units[unit]}`).join(' · ')}</p>
      <p>Xác nhận sẽ ghi giảm tồn đúng các cây/lô đã chọn. Số lượng phải khớp với hàng bàn giao thực tế.</p>
      <div><button disabled={busy} onClick={() => setConfirmOpen(false)}>Quay lại kiểm tra</button><button className="primary" disabled={busy} onClick={confirmIssue}>{busy ? 'Đang xác nhận…' : 'Xác nhận xuất kho'}</button></div>
    </div></div>}
  </div>;
}
