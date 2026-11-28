/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157 | Ngày: 30-10-2026 | OWNER-EXT-06; [BR: GBR-21]/[BR: GBR-22]/[BR: GBR-27]
 * ====================================================================================================================================
 * [BẢNG TRA CỨU NGUỒN GỐC SỐ LIỆU, BỘ LỌC & TRẠNG THÁI - KIỂM KÊ & DUYỆT CHÊNH LỆCH KHO (OWNER)]
 * ====================================================================================================================================
 * | STT | Mục trên UI (Bộ lọc / Status / KPI) | Hàm FE & Trường hiển thị                       | API, Hàm BE & Nguồn DB (Collection.field)                          | Nghiệp vụ / Công thức / Điều kiện                 |
 * |-----|-------------------------------------|------------------------------------------------|--------------------------------------------------------------------|---------------------------------------------------|
 * | 1   | Bộ lọc Mã phiên / Loại kho / Status | query.{search,warehouseType,status,page}       | GET /api/owner/stock-adjustments -> stockAdjustment.service.js     | Lọc stocktake_sessions theo mã, kho NL/TP, status |
 * | 2   | Status: FROZEN_COUNTING             | Status(row.status) = 'Đang kiểm đếm'           | stocktake_sessions.status                                          | [BR: GBR-27] Khóa xuất/nhập kho, chưa thể duyệt   |
 * | 3   | Status: VARIANCE_REVIEW             | Status(row.status) = 'Chờ duyệt'               | stocktake_sessions.status                                          | [BR: GBR-22] Chờ Owner duyệt khi lệch lớn/tồn lâu |
 * | 4   | Status: APPROVED_PENDING_ADJUSTMENT | Status(row.status) = 'Đã duyệt, chờ điều chỉnh'| ownerService.approveStocktake() -> stocktake_sessions              | Owner đã duyệt; chờ Manager chạy phiếu điều chỉnh |
 * | 5   | Status: APPROVED_COMPLETED          | Status(row.status) = 'Đã hoàn tất'             | stocktake_sessions.status                                          | [BR: GBR-21] Chỉ đóng khi xử lý xong mọi chênh    |
 * | 6   | KPI: Tổng chênh lệch & Giá trị lệch | summary.{absoluteQuantity, absoluteValue}      | stockAdjustment.validation.js:varianceSummary (stocktake_records)  | var=actual-snapshot; Σ|var| & Σ(|var|*unitCost)   |
 * ====================================================================================================================================
 */
import { WmsField, WmsInput, WmsSelect, WmsButton, WmsTextArea, WmsLinkButton } from '../../components/ui/WmsControls';
import { useState } from 'react';
import { Modal as AntModal } from 'antd';
import { useLocation } from 'react-router-dom';
import { useOwnerQuery } from '../../hooks/useOwnerQuery';
import { useOwnerResource } from '../../hooks/useOwnerResource';
import { ownerService } from '../../services/ownerService';
import { ResourceState, Table, Pagination, Notice, Status, Metric, money, quantity, datetime, labels } from './OwnerUI';
export default function StockAdjustmentPage() {
  const [query, setQuery] = useOwnerQuery({ page: 1, search: '', status: '', warehouseType: '' }); const [search, setSearch] = useState(query.search); const location = useLocation();
  const resource = useOwnerResource('stock-adjustments', query);
  return <><header className="owner-page-heading"><div><p className="owner-eyebrow">Kiểm kê kho</p><h1>Báo cáo kiểm kê</h1><p>Tổng hợp kiểm kê nguyên liệu và thành phẩm; mở báo cáo để xem chi tiết và duyệt.</p></div></header>
    <form className="owner-filters" onSubmit={(e) => { e.preventDefault(); setQuery({ ...query, page: 1, search: search.trim() }); }}><WmsField>Mã phiên<WmsInput maxLength={100} value={search} onChange={(e) => setSearch(e.target.value)} /></WmsField><WmsField>Loại kho<WmsSelect value={query.warehouseType} onChange={(e) => setQuery({ ...query, page: 1, warehouseType: e.target.value })}><option value="">Tất cả kho</option><option value="RAW_MATERIAL">Nguyên liệu</option><option value="FINISHED_GOODS">Thành phẩm</option></WmsSelect></WmsField><WmsField>Trạng thái<WmsSelect value={query.status} onChange={(e) => setQuery({ ...query, page: 1, status: e.target.value })}><option value="">Tất cả trạng thái</option><option value="FROZEN_COUNTING">Đang kiểm đếm</option><option value="CANCELLED">Đã hủy</option><option value="VARIANCE_REVIEW">Chờ duyệt</option><option value="APPROVED_PENDING_ADJUSTMENT">Đã duyệt, chờ điều chỉnh</option><option value="APPROVED_COMPLETED">Đã hoàn tất</option></WmsSelect></WmsField><WmsButton>Tìm kiếm</WmsButton></form>
    <ResourceState resource={resource}>{resource.data && <><Table paginated={false} headings={['Phiên', 'Loại kho', 'Trạng thái', 'Số mặt hàng', 'Dòng chênh lệch', 'Ngày tạo', 'Chi tiết']} empty={!resource.data.items.length}>{resource.data.items.map((row) => <tr key={row.id}><td>{row.sessionCode}</td><td>{labels[row.warehouseType] || row.warehouseType}</td><td><Status value={row.status} /></td><td>{quantity(row.totalItemsExpected)}</td><td>{quantity(row.totalDiscrepancyCount)}</td><td>{datetime(row.createdAt)}</td><td><WmsLinkButton to={`/owner/stock-adjustments/${row.id}`} state={{ from: location.pathname + location.search }}>Xem báo cáo</WmsLinkButton></td></tr>)}</Table><Pagination data={resource.data} onPage={(page) => setQuery({ ...query, page })} /></>}</ResourceState></>;
}
export function StocktakeDetail({ id, setBusy, onDone }) {
  // Luôn tải báo cáo mới nhất khi mở; dấu báo cáo bảo đảm duyệt đúng dữ liệu Owner vừa xem.
  const resource = useOwnerResource(`stock-adjustments/${id}`);
  return <ResourceState resource={resource}>{resource.data && <ApprovalForm data={resource.data} setBusy={setBusy} onDone={onDone} />}</ResourceState>;
}
function ApprovalForm({ data, setBusy, onDone }) {
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState(''); const [plan, setPlan] = useState(data.stocktake.approvalInfo?.agingStockActionPlan || '');
  const [error, setError] = useState(''); const [saving, setSaving] = useState(false); const { stocktake, records, summary } = data;
  // [BR: GBR-22]: Phiên có hàng tồn lâu cũng cần Owner phê duyệt, dù chênh lệch số lượng/giá trị còn nhỏ.
  const ownerRequired = summary.requiresOwner || stocktake.approvalInfo?.approvalLevelRequired === 'MAJOR_OWNER';
  // [BR: GBR-21]: Giá trị thực đếm mặc định bằng 0 chưa chứng minh dòng đã được kiểm đếm.
  const counted = records.length > 0 && records.every((row) => row.scannedAt);
  const submit = async (event) => {
    event.preventDefault(); setError('');
    // [BR: GBR-22]: Có hàng tồn lâu thì phải nhập rõ kế hoạch Owner đã xem, không chỉ bấm duyệt trống.
    if (reason.trim().length < 10 || reason.length > 2000 || (summary.hasAging && plan.trim().length < 10) || plan.length > 2000) { setError('Lý do cần 10–2000 ký tự; kế hoạch tồn lâu cần ít nhất 10 ký tự khi bắt buộc.'); return; }
    setConfirming(true);
  };
  // Quyết định quan trọng có hộp thoại xác nhận cuối; chỉ lúc này mới gọi API duyệt.
  const approve = async () => {
    setSaving(true); setBusy(true); setError('');
    try { const response = await ownerService.approveStocktake(stocktake.id, { expectedVersion: stocktake.approvalRevision || 0, reportHash: data.reportHash, adjustmentReason: reason, agingStockActionPlan: plan }); onDone(response.message); }
    catch (err) { setError(err.message); } finally { setSaving(false); setBusy(false); }
  };
  return <div className="owner-detail-body"><h2>{stocktake.sessionCode}</h2><Status value={stocktake.status} /><div className="owner-metrics"><Metric label="Tổng chênh lệch tuyệt đối" value={quantity(summary.absoluteQuantity)} /><Metric label="Tổng giá trị chênh lệch" value={money(summary.absoluteValue)} /></div>
    <p>Ngưỡng nhỏ: số lượng {quantity(data.thresholds.quantity)} hoặc giá trị {money(data.thresholds.value)}. Hàng thừa/thiếu không bù trừ cho nhau khi xác định thẩm quyền.</p>
    {records.some((row) => row.costBasis === 'CURRENT_MASTER_COST') && <p className="owner-notice">Có dòng kiểm kê cũ chưa chốt đơn giá. Báo cáo đang dùng giá danh mục hiện tại; cần đối chiếu trước khi duyệt.</p>}
    <Table headings={['Mã hàng', 'Tồn chốt', 'Thực đếm', 'Chênh lệch', 'Đơn giá', 'Tồn lâu', 'Đã đếm']} empty={!records.length}>{records.map((row) => <tr key={row.id}><td>{row.barcode}</td><td>{quantity(row.systemSnapshotQty)}</td><td>{quantity(row.actualScannedQty)}</td><td className={row.varianceQty ? 'owner-discrepancy' : ''}>{quantity(row.varianceQty)}</td><td>{money(row.unitCost)}</td><td>{row.isAgingThresholdExceeded ? `${row.agingDaysAtCount} ngày` : 'Không'}</td><td>{row.scannedAt ? datetime(row.scannedAt) : 'Chưa đếm'}</td></tr>)}</Table>
    {stocktake.status === 'VARIANCE_REVIEW' ? <form className="owner-form" onSubmit={submit}><Notice error={error} />{!ownerRequired && <p className="owner-notice">Phiên chênh lệch nhỏ không có kế hoạch tồn lâu thuộc quản lý kho.</p>}{!counted && <p className="owner-notice">Chưa kiểm đếm đầy đủ nên chưa được duyệt.</p>}
      <WmsField>Lý do duyệt điều chỉnh<WmsTextArea required minLength={10} maxLength={2000} disabled={saving} value={reason} onChange={(e) => setReason(e.target.value)} /></WmsField>
      <WmsField>Kế hoạch xử lý hàng tồn lâu {summary.hasAging ? '(bắt buộc)' : '(nếu có)'}<WmsTextArea required={summary.hasAging} minLength={summary.hasAging ? 10 : undefined} maxLength={2000} disabled={saving} value={plan} onChange={(e) => setPlan(e.target.value)} /></WmsField>
      <p>Sau khi duyệt, quản lý kho thực hiện điều chỉnh. Phiên chỉ hoàn tất khi các điều chỉnh đã được xử lý.</p><WmsButton className="btn-ara-primary" disabled={saving || !ownerRequired || !counted}>{saving ? 'Đang duyệt…' : 'Xác nhận duyệt báo cáo'}</WmsButton></form>
      : ['FROZEN_COUNTING', 'CANCELLED'].includes(stocktake.status) ? <p>{stocktake.status === 'FROZEN_COUNTING' ? 'Phiên đang kiểm đếm. Báo cáo được cập nhật theo kết quả đã ghi nhận; chỉ có thể duyệt sau khi hoàn tất kiểm đếm và gửi duyệt.' : 'Phiên kiểm kê đã hủy.'}</p> : <p>Người duyệt: {stocktake.approvalInfo?.approvedByUserId || '—'} · {datetime(stocktake.approvalInfo?.approvedAt)}<br />Lý do: {stocktake.approvalInfo?.adjustmentReason || '—'}<br />Kế hoạch tồn lâu: {stocktake.approvalInfo?.agingStockActionPlan || 'Không có'}</p>}
      <AntModal open={confirming} title={`Duyệt phiên ${stocktake.sessionCode}?`} okText="Xác nhận duyệt" cancelText="Quay lại" confirmLoading={saving} onOk={approve}
        onCancel={() => { if (!saving) setConfirming(false); }} closable={!saving} maskClosable={!saving} keyboard={!saving}
        className="owner-modal" rootClassName="owner-modal-root">
        <p>Quyết định sẽ được ghi nhận với tài khoản Owner hiện tại. Sau khi duyệt, phiên chờ quản lý kho thực hiện điều chỉnh; tồn kho chưa thay đổi tại bước này.</p><Notice error={error} />
      </AntModal></div>;
}
