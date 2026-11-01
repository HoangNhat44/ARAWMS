/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Chức năng: Thành phần Ant Design dùng chung cho tất cả màn hình Owner.
 */
import { Children, Fragment, isValidElement, useState } from 'react';
import { Alert, Button, Card, Empty, Grid, Modal as AntModal, Pagination as AntPagination, Skeleton, Statistic, Table as AntTable, Tag } from 'antd';
import { AlertCircle, CheckCircle2, Clock3, Info } from 'lucide-react';
import { WmsButton, WmsInput, WmsField } from '../../components/ui/WmsControls';
import { dateRangeError } from '../../utils/ownerValidation';

// Số chưa có khác số 0; mọi trang dùng cùng định dạng VND và giờ Việt Nam.
export const money = (value) => Number.isFinite(value) ? new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value) : 'Chưa có';
export const quantity = (value) => Number.isFinite(value) ? new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 }).format(value) : 'Chưa có';
export const datetime = (value) => value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' }) : '—';
export const labels = {
  ACTIVE: 'Đang hoạt động', LOCKED: 'Đã khóa', INACTIVE: 'Ngừng hoạt động', OWNER: 'Owner',
  VARIANCE_REVIEW: 'Chờ duyệt kiểm kê', APPROVED_PENDING_ADJUSTMENT: 'Đã duyệt, chờ điều chỉnh', APPROVED_COMPLETED: 'Kiểm kê hoàn tất',
  WAREHOUSE_MANAGER: 'Quản lý kho', GARMENT_TECHNICIAN: 'Kỹ thuật may', WAREHOUSE_STAFF: 'Nhân viên kho', SELLER: 'Bán hàng', ACCOUNTANT: 'Kế toán',
  DRAFT: 'Bản nháp', SUBMITTED: 'Đã gửi', REVIEWED: 'Đã xem', IN_PROGRESS: 'Đang thực hiện', COMPLETED: 'Hoàn tất', CANCELLED: 'Đã hủy',
  PLANNED: 'Đã lập kế hoạch', RELEASED: 'Đã phát hành', MATERIAL_SHORTAGE: 'Thiếu vật tư',
  IN_DEVELOPMENT: 'Đang phát triển', SAMPLE_READY: 'Mẫu đã sẵn sàng', UNDER_REVIEW: 'Đang xem xét', APPROVED: 'Đã duyệt', REJECTED: 'Từ chối',
  CASH_IN: 'Thu', CASH_OUT: 'Chi', NOT_STARTED: 'Chưa bắt đầu', DONE: 'Hoàn tất', BLOCKED: 'Đang bị chặn',
  RAW_MATERIAL: 'Nguyên vật liệu', FINISHED_GOODS: 'Thành phẩm', DEFECT_QUARANTINE: 'Hàng cách ly',
  METER: 'Mét', KG: 'Kg', PIECE: 'Cái', SPOOL: 'Cuộn', BOX: 'Hộp',
  SUPPLIER_DEPOSIT: 'Đặt cọc nhà cung cấp', SUPPLIER_INSTALLMENT: 'Thanh toán nhà cung cấp', CARRIER_COD_PAYOUT: 'Nhận tiền COD',
  CUSTOMER_RETURN_REFUND: 'Hoàn tiền khách', SURCHARGE_REVENUE: 'Thu phụ phí', CARRIER_DISPUTE_COMPENSATION: 'Bồi thường vận chuyển', OPERATIONAL_EXPENSE: 'Chi phí vận hành',
  CUTTING: 'Cắt', SEWING: 'May', FINISHING: 'Hoàn thiện', QC: 'Kiểm định chất lượng', PACKING: 'Đóng gói',
  DAILY_OPERATIONS: 'Vận hành hằng ngày', WEEKLY: 'Báo cáo tuần', MONTHLY: 'Báo cáo tháng', PRODUCTION: 'Sản xuất', INVENTORY: 'Tồn kho', SALES: 'Bán hàng', EXCEPTION: 'Bất thường',
};

// Trạng thái luôn có chữ và biểu tượng; cùng một trạng thái luôn dùng cùng màu.
export function Status({ value }) {
  const kind = ['ACTIVE', 'COMPLETED', 'APPROVED', 'REVIEWED', 'APPROVED_COMPLETED', 'DONE'].includes(value) ? 'success'
    : ['LOCKED', 'REJECTED', 'BLOCKED', 'MATERIAL_SHORTAGE'].includes(value) ? 'error'
      : ['DRAFT', 'PLANNED', 'SUBMITTED', 'VARIANCE_REVIEW', 'UNDER_REVIEW', 'APPROVED_PENDING_ADJUSTMENT'].includes(value) ? 'warning'
        : ['INACTIVE', 'CANCELLED', 'NOT_STARTED'].includes(value) ? 'neutral' : 'info';
  const Icon = kind === 'success' ? CheckCircle2 : kind === 'error' ? AlertCircle : kind === 'warning' ? Clock3 : Info;
  return <Tag className={`owner-status owner-status-${kind}`} icon={<Icon size={14} aria-hidden="true" />}>{labels[value] || value || 'Chưa cập nhật'}</Tag>;
}
export const Notice = ({ error, success }) => <>{error && <Alert type="error" showIcon title={error} role="alert" />}{success && <Alert type="success" showIcon title={success} role="status" />}</>;

// Không nhầm lỗi kết nối với dữ liệu trống; luôn có nút thử lại khi tải lỗi.
export function ResourceState({ resource, children }) {
  if (resource.loading) return <Card className="owner-loading"><div role="status" aria-live="polite"><span className="wms-sr-only">Đang tải dữ liệu…</span><Skeleton active={false} title paragraph={{ rows: 4 }} /></div></Card>;
  if (resource.error) return <Alert type="error" showIcon title="Không tải được dữ liệu" description={resource.error} role="alert" action={<Button onClick={resource.reload}>Thử lại</Button>} />;
  return children;
}
export function Pagination({ data, onPage }) {
  const screens = Grid.useBreakpoint();
  if (!data) return null;
  return <div className="owner-pagination"><span aria-live="polite">{quantity(data.total)} bản ghi</span><AntPagination current={data.page} pageSize={data.limit} total={data.total}
    showSizeChanger={false} simple={!screens.sm} showLessItems onChange={onPage} aria-label="Phân trang danh sách" /></div>;
}

// Chỉ dùng hộp thoại cho xác nhận/chỉnh sửa ngắn; nghiệp vụ dài được tách thành trang.
export function Modal({ title, children, onClose, busy = false }) {
  return <AntModal open title={title} footer={null} onCancel={() => { if (!busy) onClose(); }} keyboard={!busy} maskClosable={!busy} closable={!busy}
    width="min(760px, calc(100vw - 32px))" className="owner-modal" destroyOnHidden styles={{ body: { maxHeight: 'calc(100dvh - 184px)', overflowY: 'auto', overflowX: 'hidden' } }}>{children}</AntModal>;
}
export function DateFilter({ value, onChange }) {
  const [draft, setDraft] = useState(value); const [error, setError] = useState('');
  return <form className="owner-filters" onSubmit={(event) => { event.preventDefault(); const message = dateRangeError(draft); setError(message); if (!message) onChange(draft); }}>
    <WmsField>Từ ngày<WmsInput type="date" required value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} /></WmsField>
    <WmsField>Đến ngày<WmsInput type="date" required value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} /></WmsField>
    <WmsButton className="btn-ara-primary" type="submit">Xem báo cáo</WmsButton><Notice error={error} /></form>;
}

// Chuyển các dòng JSX sẵn có thành dữ liệu bảng Ant Design, giữ nguyên nút và handler nghiệp vụ.
const flatten = (nodes) => Children.toArray(nodes).flatMap((node) => isValidElement(node) && node.type === Fragment ? flatten(node.props.children) : [node]);
const numeric = (heading) => /(số lượng|số đơn|số chứng từ|giá|tiền|doanh thu|chi phí|lợi nhuận|tồn|giữ chỗ|cách ly|khả dụng|thực đếm|chênh lệch|hao hụt|ngưỡng|đầu vào|đầu ra|hoàn thành|tỷ lệ|kế hoạch|định mức|tiêu hao)/i.test(heading);
export function Table({ headings, children, empty = false, mobileCards = true, caption }) {
  const screens = Grid.useBreakpoint();
  const rows = empty ? [] : flatten(children).filter(isValidElement).map((row, index) => ({ key: row.key || index, cells: flatten(row.props.children).filter(isValidElement), className: row.props.className }));
  const columns = headings.map((heading, index) => ({ title: heading, key: `${heading}-${index}`, align: numeric(heading) ? 'right' : 'left',
    render: (_, record) => record.cells[index]?.props.children,
    onCell: (record) => ({ className: record.cells[index]?.props.className, style: record.cells[index]?.props.style }),
  }));
  // Điện thoại dùng thẻ có nhãn từng giá trị; màn hình lớn giữ bảng để so sánh nhiều dòng.
  if (screens.sm === false && mobileCards) return <div className="owner-data-cards" aria-label={caption || 'Danh sách dữ liệu'}>
    {!rows.length ? <Card><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có dữ liệu phù hợp." /></Card> : rows.map((row) => <Card key={row.key} size="small" className={row.className}>
      <dl className="owner-record-card">{headings.map((heading, index) => <div key={index} className={index === 0 || /thao tác|chi tiết/i.test(heading) ? 'owner-record-card-wide' : ''}>
        <dt>{heading}</dt><dd className={row.cells[index]?.props.className}>{row.cells[index]?.props.children ?? '—'}</dd></div>)}</dl></Card>)}
  </div>;
  return <div className="owner-table-region" role="region" aria-label={caption || 'Bảng dữ liệu'} tabIndex={0}>
    <AntTable className="owner-table" columns={columns} dataSource={rows} pagination={false} size="middle" rowClassName={(row) => row.className || ''}
      scroll={{ x: 'max-content' }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có dữ liệu phù hợp." /> }} /></div>;
}
export const Metric = ({ label, value, note }) => <Card className="owner-metric"><Statistic title={label} value={value} />{note && <p className="owner-method">{note}</p>}</Card>;
