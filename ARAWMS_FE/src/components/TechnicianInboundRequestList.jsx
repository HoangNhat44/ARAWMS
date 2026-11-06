/* Lists Garment Technician requests and the receipts belonging to each request. */
import { useCallback, useEffect, useState } from 'react';
import { materialInboundService as api } from '../services/materialInboundService';
import { getDirectLocalDrafts } from './DirectMaterialReceiptModal';

const statusName = { WAITING_RECEIPT: 'Chờ nhập', PARTIALLY_RECEIVED: 'Đã nhập một phần',
  DISCREPANCY_REPORTED: 'Đã báo sai lệch',
  DRAFT: 'Bản nháp', WAITING_QC: 'Chờ kiểm tra', READY_TO_CONFIRM: 'Chờ xác nhận',
  COMPLETED: 'Đã hoàn thiện', CANCELLED: 'Đã hủy' };
const amount = (value) => Number(value || 0).toLocaleString('vi-VN', { maximumFractionDigits: 3 });

export default function TechnicianInboundRequestList({ onReceive, onOpenReceipt, user, refreshKey }) {
  const [requests, setRequests] = useState([]);
  const [allReceipts, setAllReceipts] = useState([]);
  const [expandedId, setExpandedId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setBusy(true); setError('');
    try {
      const requestResult = await api.technicianRequests();
      const foundReceipts = [];
      for (let page = 1; ; page += 1) {
        const batch = (await api.receipts({ page })).data.receipts;
        foundReceipts.push(...batch);
        if (batch.length < 100) break;
      }
      setRequests(requestResult.data.requests);
      setAllReceipts(foundReceipts);
    }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { load(); }, [load, refreshKey]);
  useEffect(() => {
    window.addEventListener('arawms-material-request-realtime', load);
    return () => window.removeEventListener('arawms-material-request-realtime', load);
  }, [load]);
  const localDrafts = getDirectLocalDrafts(user);
  const receipts = allReceipts.filter((receipt) => String(receipt.inboundRequestId || '') === expandedId);
  return <section className="material-plan-page" aria-label="Yêu cầu nhập của kỹ thuật viên may">
    <header className="material-plan-hero"><div><h1>Yêu cầu nhập nguyên phụ liệu</h1>
      <p>Chọn yêu cầu của kỹ thuật viên may để nhận hàng từ nhà cung cấp. Yêu cầu hoàn tất khi nhận đủ số lượng đạt.</p></div>
      <button type="button" onClick={load} disabled={busy}>Làm mới</button></header>
    {error && <p className="material-plan-error" role="alert">{error}</p>}
    <section className="material-plan-card material-receipt-list">
      <h2>Danh sách yêu cầu</h2>
      <div className="material-plan-table-wrap"><table><thead><tr><th>Mã yêu cầu</th><th>Kỹ thuật viên</th>
        <th>Nguyên phụ liệu cần nhận</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>
        {requests.map((request) => {
          const drafts = localDrafts.filter((draft) => String(draft.form.inboundRequestId) === String(request._id) &&
            !receipts.some((receipt) => receipt.draftKey === draft.form.draftKey));
          return <tr key={request._id}>
            <td><strong>{request.ticketCode}</strong>{request.legacyCompleted && <div><small>Phiếu lịch sử</small></div>}</td>
            <td>{request.requestedByTechnicianId?.fullName || (request.legacyCompleted ? 'Chưa lưu người yêu cầu' : '—')}</td>
            <td>{request.requestLines.map((line) => <div key={line.clientLineId || line.rawMaterialId?._id || String(line.rawMaterialId)}>
              {line.rawMaterialId?.materialName || 'Vật tư không còn trong danh mục'} · {line.supplierNameSnapshot || line.supplierId?.supplierName || 'Chưa rõ nhà cung cấp'}: đã nhận {amount(line.receivedQty)} / {amount(line.acceptedQty ?? line.requestedQty)} {line.rawMaterialId?.unit || ''}
            </div>)}</td>
            <td>{statusName[request.status] || request.status}</td>
            <td>{request.ticketType === 'INBOUND_FROM_PLAN' &&
              ['DRAFT', 'WAITING_QC', 'READY_TO_CONFIRM', 'PARTIALLY_RECEIVED'].includes(request.status) &&
              <button type="button" className="primary" onClick={() => onReceive(request)}>Nhập kho mới</button>}
              {request.ticketType === 'INBOUND_FROM_PLAN' &&
                ['COMPLETED', 'CANCELLED'].includes(request.status) &&
                <button type="button" onClick={() => {
                  const linked = allReceipts.find((receipt) => String(receipt.inboundRequestId || '') === String(request._id));
                  onOpenReceipt(linked ? { kind: 'receipt', id: linked._id } : { kind: 'legacy', id: request._id });
                }}>Xem phiếu nhập</button>}
              {!request.legacyCompleted && ['WAITING_RECEIPT', 'PARTIALLY_RECEIVED'].includes(request.status) &&
              <button type="button" onClick={() => onReceive(request)}>Nhập kho theo yêu cầu</button>}
              {!request.legacyCompleted && request.status === 'COMPLETED' &&
                <button type="button" onClick={() => {
                  const linked = allReceipts.find((receipt) => String(receipt.inboundRequestId || '') === String(request._id));
                  if (linked) onOpenReceipt({ kind: 'receipt', id: linked._id });
                  else setExpandedId((current) => current === request._id ? '' : request._id);
                }}>Xem phiếu nhập</button>}
              {(request.ticketType === 'INBOUND_FROM_REMNANT' || !request.legacyCompleted && request.status === 'CANCELLED') &&
                <button type="button" onClick={() => setExpandedId((current) => current === request._id ? '' : request._id)}>
                  {expandedId === request._id ? 'Ẩn chi tiết' : 'Xem chi tiết'}
                </button>}
              {!request.legacyCompleted && <button type="button" onClick={() => setExpandedId((current) => current === request._id ? '' : request._id)}>
                {expandedId === request._id ? 'Ẩn phiếu nhập' : 'Xem phiếu nhập'}</button>}
              {expandedId === request._id && <div>
                {receipts.map((receipt) => <div key={receipt._id}>
                  <button type="button" onClick={() => onOpenReceipt({ kind: 'receipt', id: receipt._id })}>
                    {receipt.ticketCode} · {receipt.status === 'COMPLETED' ? 'Đã xác nhận' : 'Đang nhập'}
                  </button>
                </div>)}
                {drafts.map((draft) => <div key={draft.form.draftKey}>
                  <button type="button" onClick={() => onOpenReceipt({ kind: 'local', id: draft.form.draftKey })}>
                    Nháp trên thiết bị · {new Date(draft.savedAt).toLocaleString('vi-VN')}
                  </button>
                </div>)}
                {!receipts.length && !drafts.length && <small>Chưa có phiếu nhập.</small>}
              </div>}</td>
          </tr>;
        })}</tbody></table></div>
      {!busy && !requests.length && !error && <p>Chưa có yêu cầu nhập kho từ kỹ thuật viên may.</p>}
    </section>
    <section className="material-plan-card material-receipt-list">
      <h2>Phiếu nhập nguyên phụ liệu</h2>
      <div className="material-plan-table-wrap"><table><thead><tr><th>Mã phiếu</th>
        <th>Nguyên phụ liệu</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>
        {allReceipts.map((receipt) => <tr key={receipt._id}>
          <td><strong>{receipt.ticketCode}</strong></td>
          <td>{receipt.receiptLines?.map((line, index) => <div key={line.clientLineId || index}>
            {line.rawMaterialId?.materialName || 'Vật tư không còn trong danh mục'}: {amount(line.acceptedQty)} {line.rawMaterialId?.unit || ''}
          </div>)}</td>
          <td>{statusName[receipt.status] || receipt.status}</td>
          <td><button type="button" onClick={() => onOpenReceipt({ kind: 'receipt', id: receipt._id })}>
            {receipt.status === 'COMPLETED' || receipt.status === 'CANCELLED' ? 'Xem phiếu' : 'Kiểm tra / tiếp tục nhập'}
          </button></td>
        </tr>)}</tbody></table></div>
      {!busy && !allReceipts.length && !error && <p>Chưa có phiếu nhập nguyên phụ liệu.</p>}
    </section>
  </section>;
}
