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
import { Table, ResourceState, Pagination, Notice, Modal, datetime } from './OwnerUI';
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
    if (trace && !draft.targetCode.trim() && !draft.targetId.trim() && !draft.actorId.trim()) { setError('Truy vết cần mã nghiệp vụ, ID đối tượng hoặc ID người thực hiện.'); return; }
    for (const key of ['targetId', 'actorId']) if (draft[key] && !/^[a-f0-9]{24}$/i.test(draft[key].trim())) { setError('ID phải gồm 24 ký tự hex.'); return; }
    setFilters({ ...Object.fromEntries(Object.entries(draft).map(([key, value]) => [key, value.trim()]).filter(([, value]) => value)), page: 1, trace: trace ? '1' : '' });
  };
  return <><header className="owner-page-heading"><div><p className="owner-eyebrow">Quản lý người dùng</p><h1>Nhật ký và truy vết</h1><p>Xem hoạt động đã ghi nhận, người thực hiện và đối tượng chịu thay đổi.</p></div></header>
    <form className="owner-filters" onSubmit={submit}>{[['search', 'Từ khóa'], ['targetCode', 'Mã nghiệp vụ'], ['targetId', 'ID đối tượng'], ['actorId', 'ID người thực hiện'], ['action', 'Hành động chính xác'], ['from', 'Từ ngày'], ['to', 'Đến ngày']].map(([key, label]) =>
      <WmsField key={key}>{label}<WmsInput type={['from', 'to'].includes(key) ? 'date' : 'text'} maxLength={100} value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} /></WmsField>)}
      <WmsField className="owner-checkbox"><WmsInput type="checkbox" checked={trace} onChange={(e) => setTrace(e.target.checked)} />Truy vết theo đối tượng</WmsField><WmsButton className="btn-ara-primary">Áp dụng</WmsButton>
      <WmsButton type="button" onClick={() => { setDraft(initial); setFilters({ page: 1 }); setTrace(false); setError(''); }}>Xóa bộ lọc</WmsButton></form>
    <Notice error={error} /><ResourceState resource={resource}>{resource.data && <><Table headings={['Thời gian', 'Người thực hiện', 'Chức năng', 'Hành động', 'Đối tượng', 'Chi tiết']} empty={!resource.data.items.length}>
      {resource.data.items.map((log) => <tr key={log.id}><td>{datetime(log.createdAt)}</td><td>{log.actor?.fullName || 'Hệ thống'}<small>{log.actor?.employeeCode} · {log.actorRole}</small></td><td>{log.majorFeature}<small>{log.subFeature}</small></td>
        <td>{log.action}</td><td>{log.targetCode || log.targetId || '—'}</td><td><WmsButton onClick={() => setSelected(log)}>Xem</WmsButton></td></tr>)}
    </Table><Pagination data={resource.data} onPage={(page) => setQuery({ ...query, page })} /></>}</ResourceState>
    {selected && <Modal title="Chi tiết hoạt động" onClose={() => setSelected(null)}><dl className="owner-detail"><dt>Hành động</dt><dd>{selected.action}</dd><dt>Đối tượng</dt><dd>{selected.targetCollection} / {selected.targetCode || selected.targetId}</dd><dt>Địa chỉ IP</dt><dd>{selected.ipAddress || '—'}</dd></dl>
      <h3>Trước thay đổi</h3><pre className="owner-json">{JSON.stringify(selected.beforeSnapshot ?? null, null, 2)}</pre><h3>Sau thay đổi</h3><pre className="owner-json">{JSON.stringify(selected.afterSnapshot ?? null, null, 2)}</pre>
      {selected.targetId && <WmsButton onClick={() => { setDraft({ ...initial, targetId: selected.targetId }); setTrace(true); setFilters({ targetId: selected.targetId, page: 1, trace: '1' }); setSelected(null); }}>Truy vết toàn bộ đối tượng này</WmsButton>}</Modal>}
  </>;
}
