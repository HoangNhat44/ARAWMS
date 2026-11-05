import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { stocktakeService as api } from '../services/stocktakeService';
import '../styles/stocktake.css';

const itemTypeForWarehouse = (warehouseType) => warehouseType === 'FINISHED_GOODS' ? 'SKU' : 'RAW_MATERIAL';
const localDate = () => new Date().toLocaleDateString('sv-SE');
const empty = (warehouseType = '') => ({ name: '', warehouseType, scopeType: '', zoneCode: '', rackId: '',
  itemType: itemTypeForWarehouse(warehouseType), itemId: '', recurrence: 'ONCE', weekday: 1,
  monthDay: 1, monthEnd: false, quarterMonth: 1, startDate: localDate(),
  startTime: '09:00', endDate: '', durationHours: 2, inspectorId: '', approverId: '', hideSystemQty: true, instructions: '' });
const scopeTypeLabel = { WAREHOUSE: 'Toàn kho', ZONE: 'Khu', RACK: 'Kệ', ITEM: 'Mặt hàng' };
const recurrenceLabel = { ONCE: 'Một lần', WEEKLY: 'Hằng tuần', MONTHLY: 'Hằng tháng', QUARTERLY: 'Mỗi quý' };
const statusLabel = { WAITING: 'Chờ thực hiện', FROZEN_COUNTING: 'Đang kiểm', VARIANCE_REVIEW: 'Chờ duyệt', APPROVED_COMPLETED: 'Đã kết thúc', CANCELLED: 'Đã hủy' };
const weekdays = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];
const niceDate = (value) => value ? new Date(value).toLocaleString('vi-VN') : '—';

export default function StocktakePage() {
  const { user } = useAuth();
  const roles = [user?.roleCode, ...(user?.roles || [])];
  // Unauthenticated local URL testing uses the matching backend test manager identity.
  const canManageStocktake = (import.meta.env.DEV && !user) || roles.some((role) => ['OWNER', 'WAREHOUSE_MANAGER'].includes(role));
  const [data, setData] = useState({ sessions: [], schedules: [] });
  const [options, setOptions] = useState({ warehouses: [], locations: [], inspectors: [], approvers: [], materials: [], skus: [], racks: [] });
  const [tab, setTab] = useState('sessions');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const [list, choices] = await Promise.all([api.list(), api.options()]);
    setData(list.data); setOptions(choices.data);
  }, []);
  useEffect(() => { load().catch((e) => setError(e.message)); }, [load]);
  const zones = [...new Set(options.locations.filter((x) => x.warehouseType === form.warehouseType).map((x) => x.zoneCode).filter(Boolean))];
  const racks = options.racks.filter((rack) => rack.warehouseType === form.warehouseType);
  const items = form.warehouseType === 'RAW_MATERIAL' ? options.materials : options.skus;
  const scopeName = (value) => {
    if (value.scopeType === 'ZONE') return `Khu ${value.zoneCode || ''}`;
    if (value.scopeType === 'RACK') {
      const rack = options.racks.find((x) => String(x.id) === String(value.rackId));
      return rack ? `Khu ${rack.zoneCode} · Kệ ${rack.code}` : value.rackCode || scopeTypeLabel.RACK;
    }
    if (value.scopeType === 'ITEM') {
      const source = value.itemType === 'SKU' ? options.skus : options.materials;
      const item = source.find((x) => String(x._id) === String(value.itemId));
      return item ? `${item.materialCode || item.skuCode} · ${item.materialName || item.productName}` : scopeTypeLabel.ITEM;
    }
    return value.scopeType === 'ZONE' ? `Khu ${value.zoneCode || 'chưa chọn'}`
      : value.scopeType === 'WAREHOUSE' ? scopeTypeLabel.WAREHOUSE : 'Chọn phạm vi';
  };
  const warehouseLabel = (warehouseType) => warehouseType === 'ALL' ? 'Nguyên phụ liệu + thành phẩm'
    : warehouseType === 'RAW_MATERIAL' ? 'Kho nguyên phụ liệu' : warehouseType === 'FINISHED_GOODS' ? 'Kho thành phẩm' : 'Chưa chọn kho';
  async function submit(event) {
    event.preventDefault(); setError('');
    if (form.startDate < localDate()) { setError('Ngày bắt đầu không được ở trong quá khứ.'); return; }
    if (form.endDate && form.endDate < form.startDate) { setError('Ngày kết thúc phải từ ngày bắt đầu trở đi.'); return; }
    setBusy(true);
    try { await api.create({ ...form, rackCode: racks.find((x) => String(x.id) === String(form.rackId))?.code });
      setOpen(false); setForm(empty()); await load(); setTab(form.recurrence === 'ONCE' ? 'sessions' : 'schedules');
      setNotice(form.recurrence === 'ONCE' ? 'Đã phát lệnh kiểm kê.' : 'Đã tạo lịch định kỳ.'); }
    catch (e) { setError(e.response?.data?.message || e.message); }
    finally { setBusy(false); }
  }
  async function openCreate() {
    setBusy(true); setError('');
    try {
      const latest = await api.options();
      setOptions(latest.data);
      setForm({ ...empty(),
        inspectorId: latest.data.inspectors.length === 1 ? latest.data.inspectors[0]._id : '' });
      setOpen(true);
    } catch (e) { setError(e.response?.data?.message || e.message); }
    finally { setBusy(false); }
  }
  async function toggle(schedule) {
    setBusy(true);
    try { await api.setScheduleStatus(schedule._id, { status: schedule.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE', version: schedule.version });
      await load(); setNotice(schedule.status === 'ACTIVE' ? 'Đã tạm dừng lịch; phiên đã phát vẫn được giữ.' : 'Đã tiếp tục lịch.'); }
    catch (e) { setError(e.response?.data?.message || e.message); }
    finally { setBusy(false); }
  }
  const sessions = useMemo(() => data.sessions, [data.sessions]);
  return <main className="stocktake-page">
    <header className="stocktake-hero"><div><nav><Link to="/">Trang chủ</Link> / Kiểm kê kho</nav><h1>Kiểm kê kho</h1>
      <p>Lập lịch, giao việc và xem xét kết quả kiểm kê.</p></div><div className="stocktake-actions"><span>Kho nguyên phụ liệu và thành phẩm</span>
        <button onClick={() => load().catch((e) => setError(e.message))}>Làm mới</button>{canManageStocktake && <button className="primary" disabled={busy} onClick={openCreate}>Tạo lệnh kiểm kê</button>}</div></header>
    {error && <p className="stocktake-error" role="alert">{error}</p>}{notice && <p className="stocktake-notice">{notice}</p>}
    <nav className="stocktake-tabs"><button className={tab === 'sessions' ? 'active' : ''} onClick={() => setTab('sessions')}>Phiên kiểm kê</button>
      <button className={tab === 'schedules' ? 'active' : ''} onClick={() => setTab('schedules')}>Lịch định kỳ</button>
      <button className={tab === 'reports' ? 'active' : ''} onClick={() => setTab('reports')}>Báo cáo</button></nav>
    <section className="stocktake-card"><div className="stocktake-table"><table><thead><tr>{tab === 'schedules' ? <><th>Lịch</th><th>Phạm vi</th><th>Lặp</th><th>Người kiểm</th><th>Người duyệt</th><th>Trạng thái</th><th></th></> :
      <><th>Phiên</th><th>Phạm vi</th><th>Thời gian</th><th>Người kiểm</th><th>Tiến độ</th><th>Trạng thái</th><th>Khóa</th></>}</tr></thead><tbody>
      {tab === 'schedules' ? data.schedules.map((schedule) => <tr key={schedule._id}><td><strong>{schedule.name}</strong><small>{warehouseLabel(schedule.warehouseType)}</small></td>
        <td>{scopeName(schedule)}</td><td>{recurrenceLabel[schedule.recurrence]}{schedule.recurrence === 'WEEKLY' ? ` · ${weekdays[schedule.weekday]}` : schedule.recurrence === 'MONTHLY' ? ` · ${schedule.monthEnd ? 'Cuối tháng' : `Ngày ${schedule.monthDay}`}` : schedule.recurrence === 'QUARTERLY' ? ` · Tháng ${schedule.quarterMonth} của quý` : ''}<small>{schedule.startTime}</small></td>
        <td>{schedule.inspectorId?.fullName || '—'}</td><td>{schedule.approverId?.fullName || '—'}</td><td>{schedule.status === 'ACTIVE' ? 'Đang chạy' : schedule.status === 'PAUSED' ? 'Đã tạm dừng' : 'Đã hủy'}</td>
        <td>{canManageStocktake && schedule.status !== 'CANCELLED' && <button disabled={busy} onClick={() => toggle(schedule)}>{schedule.status === 'ACTIVE' ? 'Tạm dừng' : 'Tiếp tục'}</button>}</td></tr>) : (tab === 'reports' ? sessions.filter((x) => x.status !== 'FROZEN_COUNTING') : sessions).map((session) => <tr key={session._id}>
        <td><strong>{session.sessionCode}</strong><small>{session.name}</small></td><td>{scopeName(session)}</td><td>{niceDate(session.scheduledAt)}<small>Hạn {niceDate(session.dueAt)}</small></td>
        <td>{session.inspectorId?.fullName || '—'}</td><td>0/{session.totalItemsExpected || '—'}</td><td>{statusLabel[session.status] || session.status}</td><td>{session.status === 'FROZEN_COUNTING' ? 'Chưa khóa' : 'Đang khóa'}</td></tr>)}
      </tbody></table></div>{(tab === 'schedules' ? !data.schedules.length : !(tab === 'reports' ? sessions.some((x) => !['WAITING', 'FROZEN_COUNTING'].includes(x.status)) : sessions.length)) && <p className="stocktake-empty">Chưa có dữ liệu.</p>}</section>
    {open && <div className="stocktake-overlay"><form className="stocktake-modal" onSubmit={submit}>
      <header><div><h2>Tạo lệnh kiểm kê</h2><p>Chọn phạm vi, thời gian và người phụ trách.</p></div><button type="button" aria-label="Đóng" onClick={() => setOpen(false)}>×</button></header>
      <div className="stocktake-form-body"><section className="stocktake-card"><label className="wide">Tên lệnh *<input required minLength="2" maxLength="160" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        <label className="wide">Phạm vi kiểm kê *<select required value={form.scopeType} onChange={(e) => { const scopeType = e.target.value; setForm({ ...form, scopeType, warehouseType: scopeType === 'WAREHOUSE' ? 'ALL' : '', itemType: '', zoneCode: '', rackId: '', itemId: '' }); }}><option value="">Chọn chính xác phạm vi</option><option value="WAREHOUSE">Toàn kho (nguyên phụ liệu + thành phẩm)</option><option value="ZONE">Một khu</option><option value="RACK">Một kệ</option></select></label>
        {['ZONE', 'RACK', 'ITEM'].includes(form.scopeType) && <label>Loại kho *<select required value={form.warehouseType} onChange={(e) => setForm({ ...form, warehouseType: e.target.value, itemType: itemTypeForWarehouse(e.target.value), zoneCode: '', rackId: '', itemId: '' })}><option value="">Chọn kho nguyên phụ liệu hoặc thành phẩm</option>{options.warehouses.map((warehouse) => <option key={warehouse.code} value={warehouse.code}>{warehouse.name}</option>)}</select></label>}
        {form.scopeType === 'ZONE' && <label>Khu *<select required value={form.zoneCode} onChange={(e) => setForm({ ...form, zoneCode: e.target.value })}><option value="">Chọn khu</option>{zones.map((zone) => <option key={zone}>{zone}</option>)}</select></label>}
        {form.scopeType === 'RACK' && <label>Kệ *<select required value={form.rackId} onChange={(e) => { const rack = racks.find((item) => String(item.id) === e.target.value); setForm({ ...form, rackId: e.target.value, zoneCode: rack?.zoneCode || '' }); }}><option value="">Chọn kệ</option>{racks.map((rack) => <option key={String(rack.id)} value={String(rack.id)}>{rack.zoneCode} · {rack.code} · {rack.floors} tầng × {rack.binsPerFloor} ô</option>)}</select></label>}
        {form.scopeType === 'ITEM' && <label>Mặt hàng *<select required value={form.itemId} onChange={(e) => setForm({ ...form, itemId: e.target.value })}><option value="">Chọn mặt hàng</option>{items.map((item) => <option key={item._id} value={item._id}>{item.materialCode || item.skuCode} · {item.materialName || item.productName}</option>)}</select></label>}
        <label>Thời gian *<select value={form.recurrence} onChange={(e) => setForm({ ...form, recurrence: e.target.value })}><option value="ONCE">Một lần</option><option value="WEEKLY">Hằng tuần</option><option value="MONTHLY">Hằng tháng</option><option value="QUARTERLY">Mỗi quý</option></select></label>
        {form.recurrence === 'WEEKLY' && <label>Thứ *<select value={form.weekday} onChange={(e) => setForm({ ...form, weekday: Number(e.target.value) })}>{weekdays.map((day, i) => <option key={day} value={i}>{day}</option>)}</select></label>}
        {form.recurrence === 'MONTHLY' && <><label>Ngày trong tháng<input type="number" min="1" max="31" value={form.monthDay} onChange={(e) => setForm({ ...form, monthDay: Number(e.target.value), monthEnd: false })} /></label><label className="check"><input type="checkbox" checked={form.monthEnd} onChange={(e) => setForm({ ...form, monthEnd: e.target.checked })} />Ngày cuối tháng nếu ngày đã chọn không tồn tại</label></>}
        {form.recurrence === 'QUARTERLY' && <label>Tháng trong quý<select value={form.quarterMonth} onChange={(e) => setForm({ ...form, quarterMonth: Number(e.target.value) })}><option value="1">Tháng đầu quý</option><option value="2">Tháng giữa quý</option><option value="3">Tháng cuối quý</option></select></label>}
        <label>Ngày bắt đầu áp dụng *<input required type="date" min={localDate()} value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value, endDate: e.target.value && form.endDate < e.target.value ? '' : form.endDate })} /></label>
        {form.recurrence !== 'ONCE' && <label>Ngày kết thúc<input type="date" min={form.startDate || localDate()} value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></label>}
        <label>Giờ bắt đầu *<input required type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} /></label>
        <label>Hạn hoàn thành (giờ)<input type="number" min="1" max="72" value={form.durationHours} onChange={(e) => setForm({ ...form, durationHours: Number(e.target.value) })} /></label>
        <label>Người kiểm kê (Kỹ thuật xưởng) *<select required value={form.inspectorId} onChange={(e) => setForm({ ...form, inspectorId: e.target.value })}><option value="">Chọn nhân viên kỹ thuật xưởng</option>{options.inspectors.map((person) => <option key={person._id} value={person._id}>{person.employeeCode} · {person.fullName}</option>)}</select></label>
        <label>Người duyệt (Quản lý kho/Owner) *<select required value={form.approverId} onChange={(e) => setForm({ ...form, approverId: e.target.value })}><option value="">Chọn quản lý kho hoặc Owner</option>{options.approvers.map((person) => <option key={person._id} value={person._id}>{person.employeeCode} · {person.fullName} · {person.roleCode === 'OWNER' ? 'Owner' : 'Quản lý kho'}</option>)}</select></label>
        <label className="wide">Hướng dẫn<textarea maxLength="1000" value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} /></label>
        <label className="check wide"><input type="checkbox" checked={form.hideSystemQty} onChange={(e) => setForm({ ...form, hideSystemQty: e.target.checked })} />Ẩn số tồn hệ thống với người kiểm</label>
        <p className="wide">{scopeName(form)} · {warehouseLabel(form.warehouseType)} · {recurrenceLabel[form.recurrence]} · {form.startDate} {form.startTime} · {form.durationHours} giờ</p>
      </section></div><footer><button type="button" onClick={() => setOpen(false)}>Đóng</button><button className="primary" disabled={busy}>{busy ? 'Đang lưu…' : form.recurrence === 'ONCE' ? 'Phát lệnh' : 'Tạo lịch định kỳ'}</button></footer>
    </form></div>}
  </main>;
}
