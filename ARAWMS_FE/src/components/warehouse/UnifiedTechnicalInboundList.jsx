import { useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';

const pageSize = 20;
const materialStatus = {
  WAITING_RECEIPT: 'Chờ nhập', PARTIALLY_RECEIVED: 'Đã nhập một phần',
  DISCREPANCY_REPORTED: 'Đã báo sai lệch', DRAFT: 'Bản nháp',
  WAITING_QC: 'Chờ kiểm tra', READY_TO_CONFIRM: 'Chờ xác nhận',
  COMPLETED: 'Đã hoàn thành', CANCELLED: 'Đã hủy',
};
const quantity = (value) => Number(value || 0).toLocaleString('vi-VN', { maximumFractionDigits: 3 });

/** Combines the two technician request queues for lookup without changing their receiving workflows. */
export default function UnifiedTechnicalInboundList({ finishedRequests, materialRequests, loading, error,
  onRefresh, onOpen }) {
  const [warehouse, setWarehouse] = useState('');
  const [completion, setCompletion] = useState('');
  const [page, setPage] = useState(1);
  const requests = useMemo(() => [
    ...finishedRequests.map((request) => ({ ...request, warehouse: 'FINISHED_GOODS',
      completed: request.status === 'COMPLETED' || Boolean(request.receiptId),
      date: request.createdAt })),
    ...materialRequests.map((request) => ({ ...request, id: String(request._id),
      code: request.ticketCode, warehouse: 'RAW_MATERIAL',
      completed: request.status === 'COMPLETED', date: request.createdAt || request.requestedAt })),
  ].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0) ||
    a.code.localeCompare(b.code, 'vi')), [finishedRequests, materialRequests]);
  const filtered = requests.filter((request) => (!warehouse || request.warehouse === warehouse) &&
    (!completion || (completion === 'completed') === request.completed));
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const changeWarehouse = (value) => { setWarehouse(value); setPage(1); };
  const changeCompletion = (value) => { setCompletion(value); setPage(1); };

  return <section className="fg-records" aria-label="Lệnh nhập từ kỹ thuật của hai kho">
    <div className="fg-records-head"><div><h2>Lệnh nhập từ kỹ thuật</h2>
      <p>Lệnh nhập thành phẩm và nguyên phụ liệu, mới nhất trước. Chọn một lệnh để kiểm nhận hoặc xem lịch sử.</p></div>
      <button className="btn-ara-secondary" type="button" onClick={onRefresh} disabled={loading}>
        <RefreshCw size={17} /> Làm mới</button></div>
    <div className="fg-request-filters">
      <label>Loại lệnh<select value={warehouse} onChange={(event) => changeWarehouse(event.target.value)}>
        <option value="">Cả hai kho</option><option value="FINISHED_GOODS">Nhập kho thành phẩm</option>
        <option value="RAW_MATERIAL">Nhập kho nguyên liệu</option>
      </select></label>
      <label>Tiến độ<select value={completion} onChange={(event) => changeCompletion(event.target.value)}>
        <option value="">Tất cả trạng thái</option><option value="completed">Đã hoàn thành</option>
        <option value="incomplete">Chưa hoàn thành</option>
      </select></label>
      <span>{filtered.length} / {requests.length} lệnh</span>
    </div>
    {error && <p className="finished-goods-message error" role="alert">{error}</p>}
    {loading && !requests.length && <p className="fg-empty">Đang tải lệnh nhập...</p>}
    {!loading && !visible.length && <p className="fg-empty">Không có lệnh nhập phù hợp.</p>}
    {visible.length > 0 && <div className="product-table-scroll"><table className="product-table fg-request-table">
      <thead><tr><th>Mã lệnh</th><th>Loại lệnh</th><th>Kỹ thuật viên</th><th>SKU / vật tư cần nhận</th>
        <th>Ngày gửi</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
      <tbody>{visible.map((request) => <tr key={`${request.warehouse}:${request.id}`}>
        <td><strong>{request.code}</strong></td>
        <td>{request.warehouse === 'FINISHED_GOODS' ? 'Kho thành phẩm' : 'Kho nguyên liệu'}</td>
        <td>{request.warehouse === 'FINISHED_GOODS' ? request.technician || '—' :
          request.requestedByTechnicianId?.fullName || '—'}</td>
        <td>{request.warehouse === 'FINISHED_GOODS' ? request.lines.map((line) =>
          <div key={line.skuId}>{line.skuCode}: {quantity(line.expectedQty)} đạt KCS</div>) :
          request.requestLines?.map((line, index) => <div key={line.clientLineId || index}>
            {line.rawMaterialId?.materialCode || line.rawMaterialId?.materialName || 'Vật tư không còn trong danh mục'}:
            {' '}{quantity(line.receivedQty)} / {quantity(line.acceptedQty ?? line.requestedQty)} {line.rawMaterialId?.unit || ''}
          </div>)}</td>
        <td>{request.date ? new Date(request.date).toLocaleString('vi-VN') : '—'}</td>
        <td>{request.warehouse === 'FINISHED_GOODS'
          ? request.receiptId ? `Đã nhập · ${request.receiptCode}` :
            request.status === 'READY_TO_CONFIRM' ? 'Chờ kiểm nhận' :
              request.status === 'COMPLETED' ? 'Đã hoàn thành' : request.status
          : materialStatus[request.status] || request.status}</td>
        <td><button className="btn-ara-secondary" type="button" onClick={() => onOpen(request)}>
          Xem lệnh nhập</button></td>
      </tr>)}</tbody></table></div>}
    {pages > 1 && <div className="fg-request-pagination">
      <span>Trang {currentPage}/{pages}</span>
      <button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Trước</button>
      <button type="button" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>Sau</button>
    </div>}
  </section>;
}
