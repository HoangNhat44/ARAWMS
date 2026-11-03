// Nguyễn Ngọc Huy-HE171157, 2-11-2026: Phản hồi 8 - Thống nhất nhãn hiển thị bằng tiếng Việt phổ thông.
/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Chức năng: UC-18/19/20 - Xem báo cáo quản lý kho, sản xuất theo BOM và mẫu sản phẩm mới.
 */
import { WmsField, WmsInput, WmsSelect, WmsButton, WmsTextArea, WmsLinkButton } from '../../components/ui/WmsControls';
import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useOwnerQuery } from '../../hooks/useOwnerQuery';
import { useOwnerResource } from '../../hooks/useOwnerResource';
import { ownerService } from '../../services/ownerService';
import { ResourceState, Table, Pagination, Notice, Status, labels, money, quantity, datetime } from './OwnerUI';
// UC-18/19/20: Mỗi chế độ có API, tiêu đề và trạng thái riêng; chỉ dùng chung cách tìm/xem bản ghi.
export const recordConfig = {
  reports: { resource: 'manager-reports', title: 'Báo cáo từ quản lý kho', feature: 'Tài chính điều hành', statuses: ['SUBMITTED', 'REVIEWED'] },
  production: { resource: 'production-reports', title: 'Kế hoạch sản xuất theo định mức', feature: 'Vận hành sản xuất', statuses: ['DRAFT', 'PLANNED', 'MATERIAL_SHORTAGE', 'RELEASED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] },
  samples: { resource: 'product-samples', title: 'Mẫu sản phẩm mới', feature: 'Phát triển sản phẩm', statuses: ['IN_DEVELOPMENT', 'SAMPLE_READY', 'UNDER_REVIEW', 'APPROVED', 'REJECTED'] },
};
export default function OwnerRecordsPage({ mode }) {
  // Danh sách chỉ tải thông tin tóm tắt; trang riêng tải nội dung chi tiết khi mở bản ghi.
  const c = recordConfig[mode]; const [query, setQuery] = useOwnerQuery({ page: 1, search: '', status: '' }); const location = useLocation();
  const [search, setSearch] = useState(query.search);
  const resource = useOwnerResource(c.resource, query);
  return <><header className="owner-page-heading"><div><p className="owner-eyebrow">{c.feature}</p><h1>{c.title}</h1><p>{mode === 'reports' ? 'Chỉ hiển thị báo cáo đã được quản lý kho gửi.' : 'Xem thông tin và tình trạng đã ghi nhận trong hệ thống.'}</p></div></header>
    <form className="owner-filters" onSubmit={(e) => { e.preventDefault(); setQuery({ ...query, search: search.trim(), page: 1 }); }}>
      <WmsField>Tìm theo mã hoặc tên<WmsInput maxLength={100} value={search} onChange={(e) => setSearch(e.target.value)} /></WmsField><WmsField>Trạng thái<WmsSelect value={query.status} onChange={(e) => setQuery({ ...query, status: e.target.value, page: 1 })}><option value="">Tất cả</option>{c.statuses.map((status) => <option key={status} value={status}>{labels[status] || status}</option>)}</WmsSelect></WmsField><WmsButton>Tìm kiếm</WmsButton></form>
    <ResourceState resource={resource}>{resource.data && <><Table headings={mode === 'production' ? ['Lệnh sản xuất', 'Trạng thái', 'Kế hoạch', 'Hoàn thành', 'Tỷ lệ', 'Chi tiết'] : ['Mã', 'Tên / tiêu đề', 'Trạng thái', mode === 'reports' ? 'Đã gửi' : 'Giá dự kiến', 'Chi tiết']} empty={!resource.data.items.length}>
      {resource.data.items.map((row) => <tr key={row.id}><td>{row.code}</td>{mode === 'production' ? <><td><Status value={row.status} /></td><td>{quantity(row.plannedQty)}</td><td>{quantity(row.completedQty)}</td><td>{row.completionPercent === null ? 'Chưa có kế hoạch' : `${quantity(row.completionPercent)}%`}</td></> : <><td>{row.title || row.name}</td><td><Status value={row.status} /></td><td>{mode === 'reports' ? datetime(row.submittedAt) : money(row.proposedPrice)}</td></>}<td><WmsLinkButton to={`${location.pathname}/${row.id}`} state={{ from: location.pathname + location.search }} aria-label={`Xem chi tiết ${row.code}`}>Xem chi tiết</WmsLinkButton></td></tr>)}
    </Table><Pagination data={resource.data} onPage={(page) => setQuery({ ...query, page })} /></>}</ResourceState>
    {/* Chi tiết là trang riêng; URL danh sách giữ nguyên bộ lọc khi người dùng quay lại. */}
  </>;
}
// Gọi đúng API chi tiết theo chế độ và chặn hiển thị kết quả tải đã bị hủy.
export function RecordDetail({ resourceName, id, mode, setBusy, onDone }) {
  const resource = useOwnerResource(`${resourceName}/${id}`);
  return <ResourceState resource={resource}>{resource.data && (mode === 'reports' ? <ManagerDetail data={resource.data} setBusy={setBusy} onDone={onDone} /> : mode === 'production' ? <ProductionDetail data={resource.data} /> : <SampleDetail data={resource.data} />)}</ResourceState>;
}
// UC-18: Cho xem nội dung báo cáo dạng văn bản; không chạy HTML từ nội dung/tệp gửi lên.
function ManagerDetail({ data, setBusy, onDone }) {
  const [comment, setComment] = useState(''); const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  // Xác nhận đã xem là yêu cầu lưu riêng; lỗi từ BE giữ form mở để Owner xử lý lại.
  const review = async (event) => { event.preventDefault(); setError(''); setSaving(true); setBusy(true);
    try { const response = await ownerService.reviewReport(data.id, comment); onDone(response.message); }
    catch (err) { setError(err.message); } finally { setSaving(false); setBusy(false); } };
  return <div className="owner-detail-body"><h2>{data.code} · {data.title}</h2><p><Status value={data.status} /> · {labels[data.reportType] || data.reportType}</p><p>Người gửi: {data.submittedBy?.fullName || 'Chưa có'} · {datetime(data.submittedAt)}</p>
    <p>Kỳ báo cáo: {datetime(data.periodStart)} – {datetime(data.periodEnd)}</p><p>{data.summary}</p><pre className="owner-json">{typeof data.content === 'string' ? data.content : JSON.stringify(data.content ?? {}, null, 2)}</pre>
    {data.fileUrl && <a href={data.fileUrl} target="_blank" rel="noopener noreferrer">Mở tệp đính kèm</a>}
    {data.status === 'SUBMITTED' ? <form className="owner-form" onSubmit={review}><Notice error={error} /><WmsField>Ghi chú khi xem<WmsTextArea maxLength={2000} value={comment} disabled={saving} onChange={(e) => setComment(e.target.value)} /></WmsField><WmsButton className="btn-ara-primary" disabled={saving}>{saving ? 'Đang lưu…' : 'Xác nhận đã xem báo cáo'}</WmsButton></form>
      : <p>Đã xem bởi {data.reviewedBy?.fullName || 'Chủ cửa hàng'} · {datetime(data.reviewedAt)}<br />{data.ownerComment}</p>}</div>;
}
// UC-19: Đối chiếu tiến độ, phiên bản BOM và tiêu hao; thiếu dữ liệu được báo rõ trên từng phần.
function ProductionDetail({ data }) {
  return <div className="owner-detail-body"><h2>{data.code}</h2><Status value={data.status} /><p>Kế hoạch: {datetime(data.plannedStart)} – {datetime(data.plannedEnd)}</p>
    <p>Tiến độ: {quantity(data.progress.completedQty)} / {quantity(data.progress.plannedQty)} · Hàng lỗi: {quantity(data.progress.defectiveQty)}</p>
    {data.items.map((item, index) => <section key={`${item.skuId}-${index}`}><h3>{item.skuCode || String(item.skuId)} · Kế hoạch {quantity(item.plannedQty)}</h3>
      {item.bom ? <><p>Định mức {item.bom.bomCode} · Phiên bản {item.bom.versionNo} · {labels[item.bom.status] || 'Chưa cập nhật'}</p><Table headings={['Nguyên liệu', 'Định mức mỗi sản phẩm', 'Đơn vị', 'Hao hụt', 'Kế hoạch theo định mức']} empty={!item.bom.lines.length}>
        {item.bom.lines.map((line, i) => <tr key={i}><td>{line.materialCode || String(line.materialId)}<small>{line.materialName}</small></td><td>{quantity(line.qtyPerUnit)}</td><td>{labels[line.unitCode] || line.unitCode}</td><td>{quantity((line.wastageRate || 0) * 100)}%</td><td>{quantity(line.qtyPerUnit * item.plannedQty * (1 + (line.wastageRate || 0)))}</td></tr>)}</Table></>
        : <p className="owner-warning">Chưa có định mức được liên kết hoặc định mức đã bị xóa. Không thể đối chiếu định mức.</p>}</section>)}
    <h3>Nhu cầu và sử dụng vật tư đã ghi nhận</h3><Table headings={['Vật tư', 'Đơn vị', 'Nhu cầu', 'Đã cấp', 'Hoàn trả', 'Tiêu hao', 'Chênh lệch']} empty={!data.materialRequirements.length}>
      {data.materialRequirements.map((line, index) => <tr key={index}><td>{line.materialCode || String(line.materialId)}</td><td>{labels[line.unitCode] || line.unitCode}</td><td>{quantity(line.requiredQty)}</td><td>{quantity(line.issuedQty)}</td><td>{quantity(line.returnedQty)}</td><td>{quantity(line.consumedQty)}</td><td>{typeof line.consumedQty === 'number' && typeof line.requiredQty === 'number' ? quantity(line.consumedQty - line.requiredQty) : 'Chưa có'}</td></tr>)}
    </Table><h3>Tiến độ công đoạn</h3><Table headings={['Công đoạn', 'Trạng thái', 'Đầu vào', 'Đầu ra', 'Lỗi']} empty={!data.stages.length}>{data.stages.map((stage, index) => <tr key={index}><td>{labels[stage.stage] || stage.stage}</td><td><Status value={stage.status} /></td><td>{quantity(stage.qtyIn)}</td><td>{quantity(stage.qtyOut)}</td><td>{quantity(stage.qtyDefect)}</td></tr>)}</Table></div>;
}
// UC-20: Chỉ xem mô tả, ảnh, chi phí và đánh giá đã ghi nhận; không tự duyệt mẫu khi mở.
function SampleDetail({ data }) {
  return <div className="owner-detail-body"><h2>{data.code} · {data.name}</h2><Status value={data.status} /><p>Mã sản phẩm: {data.productCode || 'Chưa có'}</p><p>{data.description || 'Chưa có mô tả.'}</p>
    <div className="owner-metrics"><div><strong>Chi phí ước tính</strong><p>{money(data.estimatedCost)}</p></div><div><strong>Giá đề xuất</strong><p>{money(data.proposedPrice)}</p></div></div>
    <div className="owner-sample-images">{data.imageUrls.map((url) => <a key={url} href={url} target="_blank" rel="noopener noreferrer"><img src={url} loading="lazy" referrerPolicy="no-referrer" alt={`Mẫu ${data.name}`} /></a>)}</div>
    {!data.imageUrls.length && <p>Chưa có ảnh mẫu.</p>}<h3>Ghi chú đánh giá đã ghi nhận</h3><p>{data.evaluationNote || 'Chưa có đánh giá.'}</p></div>;
}
