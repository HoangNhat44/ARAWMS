/*
 * File: MaterialReceiptList.jsx
 * Description: Presents persisted supplier receipts using the inbound screen's reference layout.
 */
import { Link } from 'react-router-dom';
import { CirclePlus, RefreshCw } from 'lucide-react';

// Show the viewer's calendar date; receipts are stored at Vietnam midnight, which is the previous UTC day.
const dateLabel = (value) => value && !Number.isNaN(new Date(value).getTime())
  ? new Date(value).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
const priceLabel = (value) => Number(value || 0).toLocaleString('vi-VN', { maximumFractionDigits: 2 }) + ' ₫';
const statuses = { DRAFT: 'Nháp', WAITING_QC: 'Chờ kiểm tra', READY_TO_CONFIRM: 'Sẵn sàng xác nhận',
  COMPLETED: 'Đã xác nhận', CANCELLED: 'Đã hủy' };

/** Values come from saved receipt-line prices; older receipts without a snapshot show no invented total. */
const receiptValue = (item) => {
  const lines = item.receiptLines || [];
  if (!lines.length || lines.some((line) => line.unitCost == null)) return '—';
  return priceLabel(lines.reduce((sum, line) => sum + Number(line.acceptedQty || 0) * Number(line.unitCost), 0));
};

export default function MaterialReceiptList({ receipts, options, filters, onFilter, onReset, onRefresh,
  onCreate, onOpen, page, onPage, busy, error, notice }) {
  const pageCount = Math.max(1, Math.ceil(receipts.length / 10));
  const visiblePage = Math.min(page, pageCount);
  const visible = receipts.slice((visiblePage - 1) * 10, visiblePage * 10);
  return <div className="material-reference-list">
    <header className="material-reference-heading">
      <div><nav aria-label="Đường dẫn"><Link to="/">Trang chủ</Link> / Nguyên phụ liệu / Nhập kho</nav>
        <h1>Nhập nguyên phụ liệu</h1>
        <p>Theo dõi số lượng, đơn giá và giá trị theo từng lần nhận hàng.</p></div>
      <div className="material-reference-actions">
        <button type="button" className="material-ref-button" disabled={busy} onClick={onRefresh}>
          <RefreshCw size={16} /> Làm mới</button>
        <button type="button" className="material-ref-button primary" disabled={busy} onClick={onCreate}>
          <CirclePlus size={17} /> Tạo phiếu nhập</button>
      </div>
    </header>
    {error && <p className="material-message error" role="alert">{error}</p>}
    {notice && <p className="material-message success" role="status">{notice}</p>}
    <section className="material-reference-card" aria-label="Danh sách phiếu nhập">
      <div className="material-reference-filters">
        <input aria-label="Tìm phiếu hoặc nguyên phụ liệu" value={filters.code}
          onChange={(event) => onFilter({ code: event.target.value })}
          placeholder="Tìm mã phiếu, mã hoặc tên nguyên phụ liệu…" />
        <select aria-label="Nhà cung cấp" value={filters.supplierId} onChange={(event) => onFilter({ supplierId: event.target.value })}>
          <option value="">Tất cả nhà cung cấp</option>
          {options.suppliers.map((item) => <option key={item._id} value={item._id}>{item.supplierName}</option>)}
        </select>
        <label>Từ ngày<input type="date" value={filters.from} max={filters.to || undefined}
          onChange={(event) => onFilter({ from: event.target.value })} /></label>
        <label>Đến ngày<input type="date" value={filters.to} min={filters.from || undefined}
          onChange={(event) => onFilter({ to: event.target.value })} /></label>
        <select aria-label="Trạng thái" value={filters.status} onChange={(event) => onFilter({ status: event.target.value })}>
          <option value="">Tất cả trạng thái</option>
          {Object.entries(statuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
        <button type="button" className="material-ref-button" onClick={onReset}>Xóa bộ lọc</button>
      </div>
      <div className="material-table-wrap"><table className="material-reference-table">
        <thead><tr><th>Mã phiếu</th><th>Ngày nhận</th><th>Nhà cung cấp</th>
          <th>Nguyên phụ liệu</th><th className="right">Giá trị nhập kho</th><th>Trạng thái</th>
          <th>Người tạo</th><th>Thao tác</th></tr></thead>
        <tbody>{visible.map((item) => {
          const names = (item.receiptLines || []).map((line) => line.rawMaterialId?.materialName ||
            options.materials.find((material) => String(material._id) === String(line.rawMaterialId))?.materialName).filter(Boolean);
          return <tr key={item._id}>
            <td><strong>{item.ticketCode}</strong></td>
            <td>{dateLabel(item.receivedAt)}</td>
            <td>{item.supplierId?.supplierName || '—'}<small>{item.supplierId?.supplierCode}</small></td>
            <td>{names[0] || 'Chưa thêm nguyên phụ liệu'}{names.length > 1 && <small>+{names.length - 1} dòng nhập</small>}</td>
            <td className="right"><strong>{receiptValue(item)}</strong>{item.status !== 'COMPLETED' && <small>Tạm tính</small>}</td>
            <td><span className={'material-ref-status status-' + item.status?.toLowerCase()}>{statuses[item.status] || item.status}</span></td>
            <td>{item.createdByManagerId?.fullName || '—'}</td>
            <td><button type="button" className="material-ref-button small" disabled={busy} onClick={() => onOpen(item._id)}>
              {['DRAFT', 'WAITING_QC', 'READY_TO_CONFIRM'].includes(item.status) ? 'Tiếp tục lập' : 'Xem phiếu'}</button></td>
          </tr>;
        })}</tbody>
      </table></div>
      {!receipts.length && <p className="material-reference-empty">Không có phiếu phù hợp.</p>}
      <div className="material-reference-pagination"><span>Hiển thị {visible.length}/{receipts.length} phiếu</span>
        {pageCount > 1 && <div>{Array.from({ length: pageCount }, (_, index) => index + 1).map((number) =>
          <button type="button" key={number} className={number === visiblePage ? 'active' : ''}
            onClick={() => onPage(number)} aria-label={'Trang ' + number}>{number}</button>)}</div>}
      </div>
    </section>
  </div>;
}
