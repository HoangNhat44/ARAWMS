// Nguyễn Ngọc Huy-HE171157, 2-11-2026: Phản hồi 8 - Thống nhất nhãn hiển thị bằng tiếng Việt phổ thông.
/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Chức năng: Thành phần Ant Design dùng chung cho tất cả màn hình Owner.
 */
import { OWNER_PAGE_SIZE } from '../../utils/constants';
import { Children, Fragment, isValidElement, useRef, useEffect, useState } from 'react';
import { Alert, Button, Card, Empty, Grid, Modal as AntModal, Pagination as AntPagination, Skeleton, Statistic, Table as AntTable, Tag } from 'antd';
import { AlertCircle, CheckCircle2, Clock3, Info } from 'lucide-react';

// Số chưa có khác số 0; mọi trang dùng cùng định dạng VND và giờ Việt Nam.
export const money = (value) => Number.isFinite(value) ? new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value) : 'Chưa có';
export const quantity = (value) => Number.isFinite(value) ? new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 }).format(value) : 'Chưa có';
export const datetime = (value) => value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' }) : '—';
export const labels = {
  DRAFT_FRAMEWORK: 'Hợp đồng nháp', PENDING_OWNER_APPROVAL: 'Chờ Owner duyệt', DEVIATION_FLAGGED: 'Hợp đồng có chênh lệch', TERMINATED: 'Đã chấm dứt', SUPERSEDED: 'Đã thay thế', ACTIVE: 'Đang hoạt động', LOCKED: 'Đã khóa', INACTIVE: 'Ngừng hoạt động', OWNER: 'Chủ cửa hàng',
  // Nguyễn Ngọc Huy-HE171157, 2-11-2026: UC-12/13/19, phản hồi 7 - Nhãn nghiệp vụ tiếng Việt phổ thông.
  SCHEDULED: 'Chờ hàng về', IN_INSPECTION: 'Đang kiểm hàng', VERIFIED_MATCHED: 'Kiểm hàng đạt', DEVIATION_REPORTED: 'Có chênh lệch', RESOLVED_SUPERSEDED: 'Đã thay kế hoạch',
  AVAILABLE: 'Còn đủ hàng', LOW_STOCK: 'Dưới mức tối thiểu', OUT_OF_STOCK: 'Hết hàng khả dụng', STANDARD: 'Định mức chuẩn',
  PENDING: 'Chờ xử lý', CONFIRMED_RESERVED: 'Đã giữ hàng', PICKING: 'Đang lấy hàng', PACKED: 'Đã đóng gói', HANDED_OVER_CARRIER: 'Đã giao vận chuyển', DELIVERED: 'Đã giao khách', RETURN_REQUESTED: 'Khách yêu cầu hoàn', RETURNED: 'Đã hoàn hàng', WAITING_SCAN: 'Chờ nhập hoặc xuất kho', WAITING_QC: 'Chờ kiểm chất lượng', QC_PASSED: 'Kiểm chất lượng đạt', QC_FAILED: 'Kiểm chất lượng không đạt',
  REQUESTED: 'Chờ nhận hàng hoàn', UNBOXED_INSPECTED: 'Đã kiểm hàng hoàn', ACCOUNTANT_APPROVED: 'Đã duyệt hoàn tiền', FROZEN_COUNTING: 'Đang kiểm đếm',
  INBOUND_PUTAWAY: 'Nhập kho', OUTBOUND_ISSUE_CUTTING: 'Xuất nguyên liệu để cắt', REMNANT_RETURN_PUTAWAY: 'Nhập vải dư', ORDER_RESERVE: 'Giữ hàng cho đơn', ORDER_CANCEL_RELEASE: 'Bỏ giữ hàng', ORDER_PACK_DEDUCT: 'Xuất hàng bán', RETURN_RESTOCK: 'Nhập lại hàng hoàn', DEFECT_DISPOSAL: 'Xử lý hàng lỗi', STOCKTAKE_ADJUSTMENT: 'Điều chỉnh sau kiểm kê',
  VARIANCE_REVIEW: 'Chờ duyệt kiểm kê', APPROVED_PENDING_ADJUSTMENT: 'Đã duyệt, chờ điều chỉnh', APPROVED_COMPLETED: 'Kiểm kê hoàn tất',
  WAREHOUSE_MANAGER: 'Quản lý kho', GARMENT_TECHNICIAN: 'Kỹ thuật may', WAREHOUSE_STAFF: 'Nhân viên kho', SELLER: 'Nhân viên bán hàng', ACCOUNTANT: 'Kế toán',
  DRAFT: 'Bản nháp', SUBMITTED: 'Đã gửi', REVIEWED: 'Đã xem', IN_PROGRESS: 'Đang thực hiện', COMPLETED: 'Hoàn tất', CANCELLED: 'Đã hủy',
  PLANNED: 'Đã lập kế hoạch', RELEASED: 'Đã phát hành', MATERIAL_SHORTAGE: 'Thiếu vật tư',
  IN_DEVELOPMENT: 'Đang phát triển', SAMPLE_READY: 'Mẫu đã sẵn sàng', UNDER_REVIEW: 'Đang xem xét', APPROVED: 'Đã duyệt', REJECTED: 'Từ chối',
  CASH_IN: 'Thu', CASH_OUT: 'Chi', NOT_STARTED: 'Chưa bắt đầu', DONE: 'Hoàn tất', BLOCKED: 'Đang tạm dừng',
  RAW_MATERIAL: 'Nguyên vật liệu', FINISHED_GOODS: 'Thành phẩm', DEFECT_QUARANTINE: 'Hàng cách ly',
  METER: 'Mét', KG: 'Kg', PIECE: 'Cái', SPOOL: 'Cuộn', BOX: 'Hộp',
  SUPPLIER_DEPOSIT: 'Đặt cọc nhà cung cấp', SUPPLIER_INSTALLMENT: 'Thanh toán nhà cung cấp', CARRIER_COD_PAYOUT: 'Nhận tiền thu hộ',
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
  return <Tag className={`owner-status owner-status-${kind}`} icon={<Icon size={14} aria-hidden="true" />}>{labels[value] || 'Chưa cập nhật'}</Tag>;
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
  return <div className="owner-pagination"><AntPagination current={data.page} pageSize={data.limit} total={data.total}
    showSizeChanger={false} simple={!screens.sm} showLessItems onChange={onPage} aria-label="Phân trang danh sách" /></div>;
}

// Chỉ dùng hộp thoại cho xác nhận/chỉnh sửa ngắn; nghiệp vụ dài được tách thành trang.
export function Modal({ title, children, onClose, busy = false }) {
  return <AntModal open title={title} footer={null} onCancel={() => { if (!busy) onClose(); }} keyboard={!busy} maskClosable={!busy} closable={!busy}
    width="min(760px, calc(100vw - 32px))" className="owner-modal" destroyOnHidden styles={{ body: { maxHeight: 'calc(100dvh - 184px)', overflowY: 'auto', overflowX: 'hidden' } }}>{children}</AntModal>;
}
// Chuyển các dòng JSX sẵn có thành dữ liệu bảng Ant Design, giữ nguyên nút và handler nghiệp vụ.
const flatten = (nodes) => Children.toArray(nodes).flatMap((node) => isValidElement(node) && node.type === Fragment ? flatten(node.props.children) : [node]);
const numeric = (heading) => /(số lượng|số đơn|số chứng từ|giá|tiền|doanh thu|chi phí|lợi nhuận|tồn|giữ chỗ|cách ly|khả dụng|thực đếm|chênh lệch|hao hụt|ngưỡng|đầu vào|đầu ra|hoàn thành|tỷ lệ|kế hoạch|định mức|tiêu hao)/i.test(heading);
export function Table({ headings, children, empty = false, mobileCards = true, caption, paginated = true }) {
  const screens = Grid.useBreakpoint();
  const tableRoot = useRef(null);
  const [page, setPage] = useState(1); const pageSize = OWNER_PAGE_SIZE;
  // Nguyễn Ngọc Huy-HE171157, 2-11-2026: Phản hồi 8 - Bảng rộng cuộn được bằng bàn phím trên máy tính bảng.
  useEffect(() => { tableRoot.current?.querySelectorAll('.ant-table-content').forEach((el) => { el.tabIndex = 0; el.setAttribute('aria-label', caption || 'Cuộn ngang bảng dữ liệu'); }); });
  const rows = empty ? [] : flatten(children).filter(isValidElement).map((row, index) => ({ key: row.key || index, cells: flatten(row.props.children).filter(isValidElement), className: row.props.className }));
  // Khi bộ lọc làm giảm số dòng, kẹp trang hiện tại về trang cuối còn tồn tại để tránh bảng trống.
  const safePage = Math.min(page, Math.max(1, Math.ceil(rows.length / pageSize)));
  // Bảng tải toàn bộ dữ liệu cắt 15 dòng tại FE; paginated=false dùng cho dữ liệu đã phân trang ở BE.
  const visibleRows = paginated ? rows.slice((safePage - 1) * pageSize, safePage * pageSize) : rows;
  const pager = paginated && rows.length > 0 ? <div className="owner-pagination"><AntPagination current={safePage} pageSize={pageSize} total={rows.length} showSizeChanger={false} showLessItems onChange={setPage} /></div> : null;
  const columns = headings.map((heading, index) => ({ title: heading, key: `${heading}-${index}`, align: numeric(heading) ? 'right' : 'left',
    render: (_, record) => record.cells[index]?.props.children,
    onCell: (record) => ({ className: record.cells[index]?.props.className, style: record.cells[index]?.props.style }),
  }));
  // Điện thoại dùng thẻ có nhãn từng giá trị; màn hình lớn giữ bảng để so sánh nhiều dòng.
  if (screens.sm === false && mobileCards) return <><div className="owner-data-cards" aria-label={caption || 'Danh sách dữ liệu'}>
    {!rows.length ? <Card><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có dữ liệu phù hợp." /></Card> : visibleRows.map((row) => <Card key={row.key} size="small" className={row.className}>
      <dl className="owner-record-card">{headings.map((heading, index) => <div key={index} className={index === 0 || /thao tác|chi tiết/i.test(heading) ? 'owner-record-card-wide' : ''}>
        <dt>{heading}</dt><dd className={row.cells[index]?.props.className}>{row.cells[index]?.props.children ?? '—'}</dd></div>)}</dl></Card>)}
  </div>{pager}</>;
  return <><div ref={tableRoot} className="owner-table-region" role="region" aria-label={caption || 'Bảng dữ liệu'} tabIndex={0}>
    <AntTable className="owner-table" columns={columns} dataSource={visibleRows} pagination={false} size="middle" rowClassName={(row) => row.className || ''}
      scroll={{ x: 'max-content' }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có dữ liệu phù hợp." /> }} /></div>{pager}</>;
}
export const Metric = ({ label, value, note }) => <Card className="owner-metric"><Statistic title={label} value={value} />{note && <p className="owner-method">{note}</p>}</Card>;
