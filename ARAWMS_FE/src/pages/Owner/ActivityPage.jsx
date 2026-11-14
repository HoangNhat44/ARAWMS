/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Chức năng: UC-10, UC-11 - Tìm nhật ký và truy vết lịch sử theo đối tượng/người thực hiện.
 */
import { WmsField, WmsInput, WmsButton } from '../../components/ui/WmsControls';
import { useState } from 'react';
import { useOwnerQuery } from '../../hooks/useOwnerQuery';
import { useOwnerResource } from '../../hooks/useOwnerResource';
import { dateRangeError } from '../../utils/ownerValidation';
import { Table, ResourceState, Pagination, Notice, Modal, datetime, labels } from './OwnerUI';
import { businessLabel, permissionLabel } from '../../utils/businessLabels';
const initial = { search: '', from: '', to: '', targetCode: '', targetId: '', actorId: '', action: '' };
export default function ActivityPage() {
  // UC-10/11: Tách bộ lọc đang nhập và bộ lọc đã áp dụng để không gọi API sau mỗi ký tự.
  const [filters, setFilters] = useOwnerQuery({ ...initial, page: 1, trace: '' }); const { trace: applied, ...query } = filters;
  const setQuery = (next) => setFilters({ ...next, trace: applied });
  const [draft, setDraft] = useState(() => Object.fromEntries(Object.keys(initial).map((key) => [key, filters[key]]))); const [trace, setTrace] = useState(applied === '1');
  const appliedTrace = applied === '1'; const [error, setError] = useState(''); const [selected, setSelected] = useState(null);
  // Chế độ truy vết dùng API yêu cầu khóa đối tượng; xem nhật ký thông thường dùng API danh sách.
  const resource = useOwnerResource(appliedTrace ? 'activity/trace' : 'activity', query);
  // Chỉ áp dụng khi đủ mốc ngày, ID đúng định dạng và có đối tượng cần truy vết.
  const submit = (event) => {
    event.preventDefault(); setError('');
    if ((draft.from || draft.to) && dateRangeError(draft)) { setError(dateRangeError(draft)); return; }
    if (trace && !draft.targetCode.trim() && !draft.targetId.trim() && !draft.actorId.trim()) { setError('Truy vết cần mã nghiệp vụ, Mã định danh đối tượng hoặc Mã định danh người thực hiện.'); return; }
    for (const key of ['targetId', 'actorId']) if (draft[key] && !/^[a-f0-9]{24}$/i.test(draft[key].trim())) { setError('Mã định danh phải có 24 ký tự, gồm số và chữ a–f.'); return; }
    setFilters({ ...Object.fromEntries(Object.entries(draft).map(([key, value]) => [key, value.trim()]).filter(([, value]) => value)), page: 1, trace: trace ? '1' : '' });
  };
  return <><header className="owner-page-heading"><div><h1>Nhật ký hoạt động</h1><p>Xem hoạt động đã ghi nhận, người thực hiện và đối tượng chịu thay đổi.</p></div></header>
    <h2>Lịch sử hệ thống</h2>
    <form className="owner-filters" onSubmit={submit}>{[['search', 'Từ khóa'], ['targetCode', 'Mã nghiệp vụ'], ['targetId', 'Mã định danh đối tượng'], ['actorId', 'Mã định danh người thực hiện'], ['action', 'Hành động chính xác'], ['from', 'Từ ngày'], ['to', 'Đến ngày']].map(([key, label]) =>
      <WmsField key={key}>{label}<WmsInput type={['from', 'to'].includes(key) ? 'date' : 'text'} maxLength={100} value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} /></WmsField>)}
      <WmsField className="owner-checkbox"><WmsInput type="checkbox" checked={trace} onChange={(e) => setTrace(e.target.checked)} />Truy vết theo đối tượng</WmsField><WmsButton className="btn-ara-primary">Áp dụng</WmsButton>
      <WmsButton type="button" onClick={() => { setDraft(initial); setFilters({ page: 1 }); setTrace(false); setError(''); }}>Xóa bộ lọc</WmsButton></form>
    <Notice error={error} /><ResourceState resource={resource}>{resource.data && <><Table paginated={false} headings={['Thời gian', 'Người thực hiện', 'Chức năng', 'Hành động', 'Đối tượng', 'Chi tiết']} empty={!resource.data.items.length}>
      {resource.data.items.map((log) => <tr key={log.id}><td>{datetime(log.createdAt)}</td><td>{log.actor?.fullName || 'Hệ thống'}<small>{log.actor?.employeeCode} · {labels[log.actorRole] || 'Chưa cập nhật'}</small></td><td>{businessLabel(log.majorFeature)}<small>{businessLabel(log.subFeature)}</small></td>
        <td>{businessLabel(log.action)}</td><td>{log.targetCode || log.targetId || '—'}</td><td><WmsButton onClick={() => setSelected(log)}>Xem</WmsButton></td></tr>)}
    </Table><Pagination data={resource.data} onPage={(page) => setQuery({ ...query, page })} /></>}</ResourceState>
    {selected && <Modal title="Chi tiết hoạt động" onClose={() => setSelected(null)}><dl className="owner-detail"><dt>Hành động</dt><dd>{businessLabel(selected.action)}</dd><dt>Đối tượng</dt><dd>{businessLabel(selected.targetCollection)} / {selected.targetCode || selected.targetId}</dd><dt>Địa chỉ mạng</dt><dd>{selected.ipAddress || '—'}</dd></dl>
      <h3>Trước thay đổi</h3><AuditValues value={selected.beforeSnapshot} /><h3>Sau thay đổi</h3><AuditValues value={selected.afterSnapshot} />
      {selected.targetId && <WmsButton onClick={() => { setDraft({ ...initial, targetId: selected.targetId }); setTrace(true); setFilters({ targetId: selected.targetId, page: 1, trace: '1' }); setSelected(null); }}>Truy vết toàn bộ đối tượng này</WmsButton>}</Modal>}
  </>;
}

// Nguyễn Ngọc Huy-HE171157, 2-11-2026: UC-10/11 - Hiển thị lịch sử bằng nhãn nghiệp vụ thay cho cấu trúc dữ liệu kỹ thuật.
function AuditValues({ value }) {
  const fields = { status: 'Trạng thái', fullName: 'Họ tên', email: 'Thư điện tử', phone: 'Điện thoại', roleCode: 'Vai trò', employeeCode: 'Mã nhân viên', managementVersion: 'Lần cập nhật', permissionOverrides: 'Quyền được cấp riêng', code: 'Quyền', granted: 'Được cấp', reason: 'Lý do', totalPaidAmount: 'Đã thanh toán', voucherId: 'Mã phiếu chi', note: 'Ghi chú', plannedQty: 'Số lượng kế hoạch', completedQty: 'Số lượng hoàn thành', items: 'Sản phẩm', materialRequirements: 'Nhu cầu nguyên liệu', requiredQty: 'Số lượng cần', materialId: 'Mã nguyên liệu', by: 'Người thực hiện', at: 'Thời gian' };
  if (value == null) return <p>Chưa có thông tin.</p>;
  if (Array.isArray(value)) return <ul>{value.map((v, i) => <li key={i}><AuditValues value={v} /></li>)}</ul>;
  if (typeof value === 'object') return <dl className="owner-detail">{Object.entries(value).map(([key, v]) => <div key={key}><dt>{fields[key] || 'Thông tin bổ sung'}</dt><dd><AuditValues value={v} /></dd></div>)}</dl>;
  if (typeof value === 'boolean') return <span>{value ? 'Có' : 'Không'}</span>;
  const text = String(value); return <span>{labels[text] || (text.includes('|') ? permissionLabel(text) : text)}</span>;
}
