
/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Chức năng: OWNER-EXT-02..05; GBR-05/06/11/12/19 - Giao diện cấu hình Owner.
 */
import { WmsButton, WmsField, WmsInput, WmsTextArea, WmsSelect } from '../../components/ui/WmsControls';
import { useState } from 'react';
import { Grid, Tabs } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useOwnerQuery } from '../../hooks/useOwnerQuery';
import { useOwnerResource } from '../../hooks/useOwnerResource';
import { ownerService } from '../../services/ownerService';
import { ResourceState, Notice, Table, Pagination, Modal, quantity, labels } from './OwnerUI';
const sections = { api: 'Kết nối dịch vụ', fabric: 'Ngưỡng vải dư', inventory: 'Ngưỡng tồn kho', returns: 'Chính sách đổi trả' };
export default function SystemSettingsPage({ section = 'api' }) {
  const resource = useOwnerResource('system-settings'); const [success, setSuccess] = useState(''); const navigate = useNavigate();
  const screens = Grid.useBreakpoint();
  const paths = { api: 'integrations', fabric: 'fabric', inventory: 'inventory', returns: 'returns' };
  return <><header className="owner-page-heading"><div><p className="owner-eyebrow">Quản trị hệ thống</p><h1>{sections[section]}</h1><p>Cấu hình được chia thành từng trang để tránh lưu nhầm nhóm thông tin.</p></div><WmsButton onClick={resource.reload}>Tải lại cấu hình</WmsButton></header>
    {screens.md ? <Tabs activeKey={section} items={Object.entries(sections).map(([key, label]) => ({ key, label }))} onChange={(key) => navigate(`/owner/settings/${paths[key]}`)} aria-label="Nhóm cấu hình vận hành" />
      : <div className="owner-filters"><WmsField>Nhóm cấu hình<WmsSelect value={section} onChange={(event) => navigate(`/owner/settings/${paths[event.target.value]}`)}>{Object.entries(sections).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</WmsSelect></WmsField></div>}
    <Notice success={success} /><ResourceState resource={resource}>{resource.data && <SettingsForm key={`${section}-${resource.data.revision}`} section={section} data={resource.data} onDone={(message) => { setSuccess(message); resource.reload(); }} />}</ResourceState>
    {section === 'inventory' && <InventoryThresholds />}</>;
}

function SettingsForm({ section, data, onDone }) {
  // Mỗi nhóm có bản nháp riêng; khóa API luôn là ô trống, không nạp khóa đã lưu xuống FE.
  const initial = section === 'api' ? { ...data.integrations, ghnToken: '', facebookVerifyToken: '', facebookPageAccessToken: '' }
    : section === 'fabric' ? { defaultFabricLeftoverThresholdMeters: data.defaultFabricLeftoverThresholdMeters }
      : section === 'inventory' ? { defaultFifoAgingAlertDays: data.defaultFifoAgingAlertDays, minorStocktakeVarianceLimitQty: data.minorStocktakeVarianceLimitQty, minorStocktakeVarianceLimitValue: data.minorStocktakeVarianceLimitValue }
        : { returnSurchargePercent: 10, returnPolicyNotes: data.returnPolicyNotes };
  const [form, setForm] = useState(initial); const [resetKeys, setResetKeys] = useState({}); const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  const numeric = (key, title, min, max, step = '1') => <WmsField key={key}>{title}<WmsInput type="number" required min={min} max={max} step={step} disabled={saving} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} /></WmsField>;
  const submit = async (event) => {
    event.preventDefault(); setError('');
    const body = { expectedVersion: data.revision };
    // Chỉ gửi trường của nhóm đang sửa, không gửi các cờ trạng thái do BE trả về.
    const numericFields = ['ghnShopId', 'defaultFabricLeftoverThresholdMeters', 'defaultFifoAgingAlertDays', 'minorStocktakeVarianceLimitQty', 'minorStocktakeVarianceLimitValue'];
    for (const [key, value] of Object.entries(form)) {
      if (key.endsWith('Configured')) continue;
      if (['ghnToken', 'facebookVerifyToken', 'facebookPageAccessToken'].includes(key)) { if (resetKeys[key]) body[key] = null; else if (value) body[key] = value; }
      else body[key] = numericFields.includes(key) ? Number(value) : value;
    }
    if (Object.values(body).some((value) => typeof value === 'number' && !Number.isFinite(value))) { setError('Cần nhập số hợp lệ.'); return; }
    if (body.returnPolicyNotes?.length > 2000) { setError('Nội dung chính sách tối đa 2000 ký tự.'); return; }
    setSaving(true);
    try { const response = await ownerService.saveSettings(section, body); onDone(response.message); }
    catch (err) { setError(err.message); } finally { setSaving(false); }
  };
  return <form className="owner-form owner-settings" onSubmit={submit}><h2>{sections[section]}</h2><Notice error={error} />
    {section === 'api' && <>
      <WmsField className="owner-checkbox"><WmsInput type="checkbox" checked={form.ghnEnabled} disabled={saving} onChange={(e) => setForm({ ...form, ghnEnabled: e.target.checked })} />Bật kết nối Giao Hàng Nhanh</WmsField>
      {numeric('ghnShopId', 'Mã cửa hàng Giao Hàng Nhanh', 1, 2147483647)}
      <WmsField>Mã trang Facebook<WmsInput maxLength={40} pattern="[0-9]*" disabled={saving} value={form.facebookPageId} onChange={(e) => setForm({ ...form, facebookPageId: e.target.value })} /></WmsField>
      {[["ghnToken", 'Khóa kết nối Giao Hàng Nhanh'], ['facebookVerifyToken', 'Mã xác minh Facebook'], ['facebookPageAccessToken', 'Khóa truy cập trang Facebook']].map(([key, title]) => <div key={key}><WmsField>{title} · {data.integrations[`${key}Configured`] ? 'Đã cấu hình' : 'Chưa cấu hình'}<WmsInput type="password" autoComplete="new-password" maxLength={4096} disabled={saving || resetKeys[key]} value={form[key]} placeholder="Để trống để giữ khóa cũ" onChange={(e) => setForm({ ...form, [key]: e.target.value })} /></WmsField>
        <WmsField className="owner-checkbox"><WmsInput type="checkbox" checked={Boolean(resetKeys[key])} disabled={saving} onChange={(e) => setResetKeys({ ...resetKeys, [key]: e.target.checked })} />Bỏ khóa đã lưu trong cơ sở dữ liệu, dùng khóa môi trường nếu có</WmsField></div>)}
      <p className="owner-method">Cài đặt Giao Hàng Nhanh mới được dùng cho yêu cầu tiếp theo. Bỏ khóa đã lưu không xóa khóa đã cấu hình trên máy chủ.</p></>}
    {section === 'fabric' && <>{numeric('defaultFabricLeftoverThresholdMeters', 'Chiều dài tối thiểu thu hồi (mét)', 0.01, 10000, '0.01')}<p>Vải dư từ ngưỡng này trở lên phải thu hồi với mã cuộn mới; dưới ngưỡng được phân loại phế liệu. Mặc định 2 mét.</p></>}
    {section === 'inventory' && <><div className="owner-form-grid">{numeric('defaultFifoAgingAlertDays', 'Ngày cảnh báo tồn lâu mặc định', 1, 3650)}{numeric('minorStocktakeVarianceLimitQty', 'Giới hạn chênh lệch nhỏ theo số lượng', 0, 1e9, 'any')}{numeric('minorStocktakeVarianceLimitValue', 'Giới hạn chênh lệch nhỏ theo giá trị (đồng)', 0, 1e12, 'any')}</div><p>Vượt một trong hai ngưỡng hoặc có kế hoạch xử lý hàng tồn lâu thì phải chuyển chủ cửa hàng duyệt. Ngưỡng an toàn của từng mặt hàng được sửa ở bảng bên dưới.</p></>}
    {section === 'returns' && <><p>Lỗi khách chịu phụ phí 10% giá trị hàng và phí vận chuyển nếu có. Lỗi sản xuất/giao sai hoàn 100% giá trị hàng, không khấu trừ phụ phí hoặc phí vận chuyển.</p>
      <WmsField>Phụ phí lỗi khách (%)<WmsInput readOnly type="number" value={10} /></WmsField><WmsField>Nội dung bổ sung chính sách<WmsTextArea maxLength={2000} disabled={saving} value={form.returnPolicyNotes} onChange={(e) => setForm({ ...form, returnPolicyNotes: e.target.value })} /></WmsField></>}
    <WmsButton className="btn-ara-primary" disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu nhóm cấu hình'}</WmsButton></form>;
}

// OWNER-EXT-04: Bảng ngưỡng riêng của từng mặt hàng, tách khỏi cấu hình mặc định của hệ thống.
function InventoryThresholds() {
  const [options, setOptions] = useOwnerQuery({ type: 'materials', page: 1, search: '' }); const { type, ...query } = options;
  const setQuery = (next) => setOptions({ ...next, type }); const [search, setSearch] = useState(query.search);
  const [selected, setSelected] = useState(null); const [busy, setBusy] = useState(false); const [success, setSuccess] = useState('');
  const resource = useOwnerResource(`system-settings/inventory-items/${type}`, query);
  return <><h2>Ngưỡng riêng từng mặt hàng</h2><Notice success={success} /><form className="owner-filters" onSubmit={(e) => { e.preventDefault(); setQuery({ page: 1, search: search.trim() }); }}>
    <WmsField>Nhóm hàng<WmsSelect value={type} onChange={(e) => { setOptions({ type: e.target.value, page: 1, search: '' }); setSearch(''); }}><option value="materials">Nguyên liệu</option><option value="skus">Thành phẩm</option></WmsSelect></WmsField><WmsField>Mã hoặc tên<WmsInput maxLength={100} value={search} onChange={(e) => setSearch(e.target.value)} /></WmsField><WmsButton>Tìm kiếm</WmsButton></form>
    <ResourceState resource={resource}>{resource.data && <><Table headings={['Mặt hàng', 'Đơn vị', 'Khả dụng', 'Ngưỡng an toàn', 'Ngày tồn lâu', 'Thao tác']} empty={!resource.data.items.length}>{resource.data.items.map((row) => <tr key={row.id}><td>{row.code}<small>{row.name}</small></td><td>{labels[row.unit] || row.unit}</td><td>{quantity(row.availableQty)}</td><td>{quantity(row.safetyStockThreshold)}</td><td>{row.fifoAgingThresholdDays}</td><td><WmsButton onClick={() => setSelected(row)}>Sửa ngưỡng</WmsButton></td></tr>)}</Table><Pagination data={resource.data} onPage={(page) => setQuery({ ...query, page })} /></>}</ResourceState>
    {selected && <Modal title={`Ngưỡng ${selected.code}`} busy={busy} onClose={() => setSelected(null)}><ThresholdForm type={type} item={selected} setBusy={setBusy} onDone={(message) => { setSuccess(message); setSelected(null); resource.reload(); }} /></Modal>}</>;
}
// GBR-05: Kiểm tra ngưỡng không âm và ngày nguyên trước khi gửi cùng phiên bản mặt hàng.
function ThresholdForm({ type, item, setBusy, onDone }) {
  const [threshold, setThreshold] = useState(item.safetyStockThreshold); const [days, setDays] = useState(item.fifoAgingThresholdDays); const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  const submit = async (event) => {
    event.preventDefault(); setError(''); const safetyStockThreshold = Number(threshold); const fifoAgingThresholdDays = Number(days);
    if (threshold === '' || days === '' || !Number.isFinite(safetyStockThreshold) || safetyStockThreshold < 0 || safetyStockThreshold > 1e9 || !Number.isInteger(fifoAgingThresholdDays) || fifoAgingThresholdDays < 1 || fifoAgingThresholdDays > 3650) { setError('Ngưỡng phải từ 0 đến 1 tỷ; ngày tồn lâu là số nguyên từ 1 đến 3650.'); return; }
    setSaving(true); setBusy(true);
    try { const response = await ownerService.saveThreshold(type, item.id, { expectedVersion: item.version, safetyStockThreshold, fifoAgingThresholdDays }); onDone(response.message); }
    catch (err) { setError(err.message); } finally { setSaving(false); setBusy(false); }
  };
  return <form className="owner-form" onSubmit={submit}><Notice error={error} /><WmsField>Tồn an toàn ({item.unit})<WmsInput type="number" required min="0" max="1000000000" step="any" disabled={saving} value={threshold} onChange={(e) => setThreshold(e.target.value)} /></WmsField><WmsField>Ngày cảnh báo tồn lâu<WmsInput type="number" required min="1" max="3650" step="1" disabled={saving} value={days} onChange={(e) => setDays(e.target.value)} /></WmsField><p>Cảnh báo khi tồn khả dụng nhỏ hơn ngưỡng. Cảnh báo sẽ được đánh giá lại sau khi lưu.</p><WmsButton className="btn-ara-primary" disabled={saving}>{saving ? 'Đang lưu…' : 'Xác nhận lưu ngưỡng'}</WmsButton></form>;
}
