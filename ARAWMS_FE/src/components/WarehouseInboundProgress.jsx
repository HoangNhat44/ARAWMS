import { useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';

const amount = (value) => Number(value || 0).toLocaleString('vi-VN', { maximumFractionDigits: 3 });
const sum = (rows, key) => rows.reduce((total, row) => total + Number(row[key] || 0), 0);

/** Combines request history with confirmed receipt scans; missing historical links stay unknown. */
export default function WarehouseInboundProgress({ finishedRequests, materialRequests, receipts,
  loading, error, onRefresh, onOpenRequest }) {
  const [warehouse, setWarehouse] = useState('');
  const [show, setShow] = useState('');
  const [page, setPage] = useState(1);
  const rows = useMemo(() => {
    const receiptByRequest = new Map();
    for (const receipt of receipts) if (receipt.sourceRequestId) {
      const key = `${receipt.warehouse}:${receipt.sourceRequestId}`;
      receiptByRequest.set(key, [...(receiptByRequest.get(key) || []), receipt]);
    }
    const requests = [
      ...finishedRequests.map((request) => ({ ...request, warehouse: 'FINISHED_GOODS',
        id: request.id, code: request.code })),
      ...materialRequests.map((request) => ({ ...request, warehouse: 'RAW_MATERIAL',
        id: String(request._id), code: request.ticketCode })),
    ];
    const linked = requests.map((request) => {
      const matched = receiptByRequest.get(`${request.warehouse}:${request.id}`) || [];
      return { id: request.id, warehouse: request.warehouse, code: request.code,
        createdAt: request.createdAt, request, receiptCodes: matched.map((item) => item.code),
        lines: matched.flatMap((item) => item.lines), status: request.status };
    });
    const requestIds = new Set(requests.map((item) => `${item.warehouse}:${item.id}`));
    const direct = receipts.filter((receipt) => !receipt.sourceRequestId ||
      !requestIds.has(`${receipt.warehouse}:${receipt.sourceRequestId}`))
      .filter((receipt) => !requestIds.has(`${receipt.warehouse}:${receipt.id}`))
      .map((receipt) => ({ ...receipt, receiptCodes: [receipt.code],
        status: 'COMPLETED', request: null }));
    return [...linked, ...direct].sort((a, b) =>
      new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }, [finishedRequests, materialRequests, receipts]);
  const filtered = rows.filter((row) => (!warehouse || row.warehouse === warehouse) &&
    (!show || (show === 'remaining' ? row.lines.some((line) => line.remaining > 0) ||
      !row.receiptCodes.length : row.receiptCodes.length > 0 &&
      row.lines.length > 0 && row.lines.every((line) => line.remaining === 0))));
  const pages = Math.max(1, Math.ceil(filtered.length / 20));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * 20, currentPage * 20);
  return <section className="fg-records" aria-label="Tiến độ nhập và xếp kệ hai kho">
    <div className="fg-records-head"><div><h2>Tiến độ nhập kho</h2>
      <p>Số đã xếp tính từ xác nhận quét kệ; lệnh lịch sử chưa có phiếu liên kết được ghi rõ là chưa có dữ liệu.</p></div>
      <button type="button" className="btn-ara-secondary" disabled={loading} onClick={onRefresh}>
        <RefreshCw size={17} /> Làm mới</button></div>
    <div className="fg-request-filters"><label>Kho<select value={warehouse} onChange={(event) => {
      setWarehouse(event.target.value); setPage(1);
    }}><option value="">Cả hai kho</option><option value="FINISHED_GOODS">Thành phẩm</option>
      <option value="RAW_MATERIAL">Nguyên phụ liệu</option></select></label>
      <label>Tiến độ<select value={show} onChange={(event) => { setShow(event.target.value); setPage(1); }}>
        <option value="">Tất cả</option><option value="remaining">Còn chờ xếp / chưa có phiếu</option>
        <option value="placed">Đã xếp đủ</option></select></label>
      <span>{filtered.length} / {rows.length} lệnh, phiếu</span></div>
    {error && <p className="finished-goods-message error" role="alert">{error}</p>}
    {loading && !rows.length && <p className="fg-empty">Đang tải tiến độ xếp kệ...</p>}
    {!loading && !visible.length && <p className="fg-empty">Không có tiến độ phù hợp.</p>}
    {visible.map((row) => {
      const accepted = sum(row.lines, 'accepted');
      const placed = sum(row.lines, 'placed');
      const remaining = sum(row.lines, 'remaining');
      return <article className="fg-progress-card" key={`${row.warehouse}:${row.id}`}>
        <header><div><small>{row.warehouse === 'FINISHED_GOODS' ? 'THÀNH PHẨM' : 'NGUYÊN PHỤ LIỆU'}</small>
          <h3>{row.code}</h3><p>{row.receiptCodes.length ? `Phiếu: ${row.receiptCodes.join(', ')}` :
            row.status === 'COMPLETED' ? 'Lệnh lịch sử chưa có phiếu nhập liên kết' : 'Chưa có phiếu nhập xác nhận'}</p></div>
          {row.request && <button className="btn-ara-secondary" type="button" onClick={() =>
            onOpenRequest(row.request)}>Xem lệnh</button>}</header>
        {row.receiptCodes.length > 0 && !row.lines.length && <p>Phiếu cũ chưa lưu đủ dòng để xác định số đã xếp kệ.</p>}
        {row.receiptCodes.length > 0 && row.lines.length > 0 && <>
          {row.warehouse === 'FINISHED_GOODS' && <strong className="fg-progress-total">
            Đã xếp {amount(placed)} / {amount(accepted)} chiếc · Còn {amount(remaining)} chiếc
          </strong>}
          <div className="fg-progress-lines">{row.lines.map((line, index) =>
            <div key={`${line.code}-${index}`} className={line.remaining > 0 ? 'pending' : ''}>
              <span><strong>{line.code}</strong>{line.name ? ` · ${line.name}` : ''}</span>
              <span>Đã xếp {amount(line.placed)} / {amount(line.accepted)} {line.unit === 'PIECE' ? 'chiếc' : line.unit}
                {' · '}Còn {amount(line.remaining)} {line.unit === 'PIECE' ? 'chiếc' : line.unit}</span>
            </div>)}</div>
          {row.lines.some((line) => line.remaining > 0) && <p className="fg-progress-pending">
            Chưa xếp: {row.lines.filter((line) => line.remaining > 0)
              .map((line) => `${line.code} (${amount(line.remaining)} ${line.unit === 'PIECE' ? 'chiếc' : line.unit})`).join(', ')}
          </p>}
        </>}
      </article>;
    })}
    {pages > 1 && <div className="fg-request-pagination"><span>Trang {currentPage}/{pages}</span>
      <button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Trước</button>
      <button type="button" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>Sau</button>
    </div>}
  </section>;
}
