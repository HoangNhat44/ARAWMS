import { useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';

/** Lists technician material requests and warehouse-created finished-goods issues together. */
export default function WarehouseOutboundList({ materialRequests, finishedDocuments, loading, error,
  onRefresh, onOpen }) {
  const [warehouse, setWarehouse] = useState('');
  const [completion, setCompletion] = useState('');
  const [page, setPage] = useState(1);
  const records = useMemo(() => [
    ...materialRequests.filter((item) => item.ticketType === 'OUTBOUND_FOR_CUTTING')
      .map((item) => ({ ...item, id: String(item._id), code: item.ticketCode,
        warehouse: 'RAW_MATERIAL', completed: item.status === 'COMPLETED' })),
    ...finishedDocuments.map((item) => ({ ...item, warehouse: 'FINISHED_GOODS', completed: true })),
  ].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)),
  [materialRequests, finishedDocuments]);
  const filtered = records.filter((item) => (!warehouse || item.warehouse === warehouse) &&
    (!completion || item.completed === (completion === 'completed')));
  const pages = Math.max(1, Math.ceil(filtered.length / 20));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * 20, currentPage * 20);
  return <section className="fg-records" aria-label="Lệnh xuất từ kỹ thuật và kho thành phẩm">
    <div className="fg-records-head"><div><h2>Lệnh xuất</h2>
      <p>Yêu cầu nguyên phụ liệu cho sản xuất và phiếu xuất thành phẩm do kho tạo.</p></div>
      <button className="btn-ara-secondary" type="button" disabled={loading} onClick={onRefresh}>
        <RefreshCw size={17} /> Làm mới</button></div>
    <div className="fg-request-filters">
      <label>Loại lệnh<select value={warehouse} onChange={(event) => { setWarehouse(event.target.value); setPage(1); }}>
        <option value="">Cả hai kho</option><option value="RAW_MATERIAL">Xuất nguyên phụ liệu cho sản xuất</option>
        <option value="FINISHED_GOODS">Xuất kho thành phẩm</option>
      </select></label>
      <label>Tiến độ<select value={completion} onChange={(event) => { setCompletion(event.target.value); setPage(1); }}>
        <option value="">Tất cả trạng thái</option><option value="completed">Đã hoàn thành</option>
        <option value="incomplete">Chưa hoàn thành</option>
      </select></label><span>{filtered.length} / {records.length} lệnh</span>
    </div>
    {error && <p className="finished-goods-message error" role="alert">{error}</p>}
    {loading && !records.length && <p className="fg-empty">Đang tải lệnh xuất...</p>}
    {!loading && !records.length && <p className="fg-empty">Chưa có lệnh xuất phù hợp.</p>}
    {visible.length > 0 && <div className="product-table-scroll"><table className="product-table fg-request-table">
      <thead><tr><th>Mã lệnh / phiếu</th><th>Loại</th><th>Mục đích / người nhận</th>
        <th>Số dòng</th><th>Ngày tạo</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
      <tbody>{visible.map((item) => <tr key={`${item.warehouse}:${item.id}`}>
        <td><strong>{item.code}</strong></td>
        <td>{item.warehouse === 'RAW_MATERIAL' ? 'Nguyên phụ liệu cho sản xuất' : 'Thành phẩm'}</td>
        <td>{item.purpose || item.recipient || '—'}</td>
        <td>{item.lines?.length || item.items?.length || 0}</td>
        <td>{item.createdAt ? new Date(item.createdAt).toLocaleString('vi-VN') : '—'}</td>
        <td>{item.status === 'COMPLETED' ? 'Đã hoàn thành' : item.status || '—'}</td>
        <td><button className="btn-ara-secondary" type="button" onClick={() => onOpen(item)}>
          Xem lệnh xuất</button></td>
      </tr>)}</tbody></table></div>}
    {pages > 1 && <div className="fg-request-pagination"><span>Trang {currentPage}/{pages}</span>
      <button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Trước</button>
      <button type="button" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>Sau</button>
    </div>}
  </section>;
}
