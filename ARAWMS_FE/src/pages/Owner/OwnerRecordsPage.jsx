// Nguyễn Ngọc Huy-HE171157, 2-11-2026: Phản hồi 8 - Thống nhất nhãn hiển thị bằng tiếng Việt phổ thông.
/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Chức năng: UC-18 - Xem và xác nhận báo cáo định kỳ của quản lý kho.
 */
import { WmsField, WmsInput, WmsSelect, WmsButton, WmsTextArea, WmsLinkButton } from '../../components/ui/WmsControls';
import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useOwnerQuery } from '../../hooks/useOwnerQuery';
import { useOwnerResource } from '../../hooks/useOwnerResource';
import { ownerService } from '../../services/ownerService';
import { ResourceState, Table, Pagination, Notice, Status, labels, datetime } from './OwnerUI';
import WarehouseReportView, { isWarehouseReportContent } from '../../components/reports/WarehouseReportView';
// UC-18: Cấu hình API, tiêu đề và trạng thái của danh sách báo cáo quản lý kho.
export const recordConfig = {
  reports: { resource: 'manager-reports', title: 'Báo cáo từ quản lý kho', feature: 'Tài chính điều hành', statuses: ['SUBMITTED', 'REVIEWED'] },
};
export default function OwnerRecordsPage({ mode }) {
  // Danh sách chỉ tải thông tin tóm tắt; trang riêng tải nội dung chi tiết khi mở bản ghi.
  const c = recordConfig[mode]; const [query, setQuery] = useOwnerQuery({ page: 1, search: '', status: '' }); const location = useLocation();
  const [search, setSearch] = useState(query.search);
  const resource = useOwnerResource(c.resource, query);
  return <><header className="owner-page-heading"><div><p className="owner-eyebrow">{c.feature}</p><h1>{c.title}</h1><p>Chỉ hiển thị báo cáo đã được quản lý kho gửi.</p></div></header>
    <form className="owner-filters" onSubmit={(e) => { e.preventDefault(); setQuery({ ...query, search: search.trim(), page: 1 }); }}>
      <WmsField>Tìm theo mã hoặc tên<WmsInput maxLength={100} value={search} onChange={(e) => setSearch(e.target.value)} /></WmsField><WmsField>Trạng thái<WmsSelect value={query.status} onChange={(e) => setQuery({ ...query, status: e.target.value, page: 1 })}><option value="">Tất cả</option>{c.statuses.map((status) => <option key={status} value={status}>{labels[status] || status}</option>)}</WmsSelect></WmsField><WmsButton>Tìm kiếm</WmsButton></form>
    <ResourceState resource={resource}>{resource.data && <><Table paginated={false} headings={['Mã', 'Tên / tiêu đề', 'Trạng thái', 'Đã gửi', 'Chi tiết']} empty={!resource.data.items.length}>
      {resource.data.items.map((row) => <tr key={row.id}><td>{row.code}</td><td>{row.title || row.name}</td><td><Status value={row.status} /></td><td>{datetime(row.submittedAt)}</td><td><WmsLinkButton to={`${location.pathname}/${row.id}`} state={{ from: location.pathname + location.search }} aria-label={`Xem chi tiết ${row.code}`}>Xem chi tiết</WmsLinkButton></td></tr>)}
    </Table><Pagination data={resource.data} onPage={(page) => setQuery({ ...query, page })} /></>}</ResourceState>
    {/* Chi tiết là trang riêng; URL danh sách giữ nguyên bộ lọc khi người dùng quay lại. */}
  </>;
}
// Gọi đúng API chi tiết theo chế độ và chặn hiển thị kết quả tải đã bị hủy.
export function RecordDetail({ resourceName, id, mode, setBusy, onDone }) {
  const resource = useOwnerResource(`${resourceName}/${id}`);
  return <ResourceState resource={resource}>{resource.data && <ManagerDetail data={resource.data} setBusy={setBusy} onDone={onDone} />}</ResourceState>;
}
// UC-18: Cho xem nội dung báo cáo dạng văn bản; không chạy HTML từ nội dung/tệp gửi lên.
function ManagerDetail({ data, setBusy, onDone }) {
  const [comment, setComment] = useState(''); const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  // Xác nhận đã xem là yêu cầu lưu riêng; lỗi từ BE giữ form mở để Owner xử lý lại.
  const review = async (event) => { event.preventDefault(); setError(''); setSaving(true); setBusy(true);
    try { const response = await ownerService.reviewReport(data.id, comment); onDone(response.message); }
    catch (err) { setError(err.message); } finally { setSaving(false); setBusy(false); } };
  return <div className="owner-detail-body"><h2>{data.code} · {data.title}</h2><p><Status value={data.status} /> · {labels[data.reportType] || data.reportType}</p><p>Người gửi: {data.submittedBy?.fullName || 'Chưa có'} · {datetime(data.submittedAt)}</p>
    {isWarehouseReportContent(data.content)
      // Warehouse statistics report: periodEnd is stored exclusive, so the last day is shown.
      ? <><p>Kỳ báo cáo: {new Date(data.periodStart).toLocaleDateString('vi-VN')} – {new Date(new Date(data.periodEnd) - 1).toLocaleDateString('vi-VN')}</p>
        <p>{data.summary}</p><WarehouseReportView content={data.content} /></>
      : <><p>Kỳ báo cáo: {datetime(data.periodStart)} – {datetime(data.periodEnd)}</p><p>{data.summary}</p><pre className="owner-json">{typeof data.content === 'string' ? data.content : JSON.stringify(data.content ?? {}, null, 2)}</pre></>}
    {data.fileUrl && <a href={data.fileUrl} target="_blank" rel="noopener noreferrer">Mở tệp đính kèm</a>}
    {data.status === 'SUBMITTED' ? <form className="owner-form" onSubmit={review}><Notice error={error} /><WmsField>Ghi chú khi xem<WmsTextArea maxLength={2000} value={comment} disabled={saving} onChange={(e) => setComment(e.target.value)} /></WmsField><WmsButton className="btn-ara-primary" disabled={saving}>{saving ? 'Đang lưu…' : 'Xác nhận đã xem báo cáo'}</WmsButton></form>
      : <p>Đã xem bởi {data.reviewedBy?.fullName || 'Chủ cửa hàng'} · {datetime(data.reviewedAt)}<br />{data.ownerComment}</p>}</div>;
}
