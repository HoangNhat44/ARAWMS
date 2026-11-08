const number = (value) => Number(value || 0).toLocaleString('vi-VN', { maximumFractionDigits: 3 });

/** Shows the source request on the warehouse page before opening an editable receipt. */
export default function WarehouseRequestDialog({ request, kind, onClose, onReceive }) {
  if (!request) return null;
  const inbound = kind === 'IN';
  const finished = request.warehouse === 'FINISHED_GOODS';
  const code = request.code || request.ticketCode;
  const lines = inbound
    ? finished ? request.lines.map((line) => ({ code: line.skuCode, name: line.productName,
      quantity: line.expectedQty, unit: 'chiếc', detail: `${line.color || ''} ${line.size || ''}`.trim() }))
      : (request.requestLines || []).map((line) => ({
        code: line.rawMaterialId?.materialCode || '—',
        name: line.rawMaterialId?.materialName || 'Vật tư không còn trong danh mục',
        quantity: line.acceptedQty ?? line.requestedQty,
        unit: line.rawMaterialId?.unit || '',
        detail: `Đã nhận ${number(line.receivedQty)}`,
      }))
    : finished ? request.lines.map((line) => ({ ...line, unit: 'chiếc' }))
      : (request.lines?.length ? request.lines : request.items || []).map((line) => ({
        code: line.materialCode || line.rawMaterialId?.materialCode || line.rollBarcode || String(line.rawMaterialId || '—'),
        name: line.materialName || line.rawMaterialId?.materialName || line.rollBarcode || '',
        quantity: line.quantity ?? line.expectedQty, unit: line.unit || line.rawMaterialId?.unit || '',
        detail: `${line.rollBarcode || ''}${line.scannedQty != null ? ` · Đã quét ${number(line.scannedQty)}` : ''}`,
      }));
  const canReceive = inbound && (finished
    ? request.status === 'READY_TO_CONFIRM' && !request.receiptId
    : ['WAITING_RECEIPT', 'PARTIALLY_RECEIVED', 'DRAFT', 'WAITING_QC',
      'READY_TO_CONFIRM'].includes(request.status));

  return <div className="fg-request-overlay" role="presentation" onMouseDown={(event) => {
    if (event.target === event.currentTarget) onClose();
  }}><section className="fg-request-dialog" role="dialog" aria-modal="true"
    aria-label={`${inbound ? 'Lệnh nhập' : 'Lệnh xuất'} ${code}`}>
    <header><div><small>{finished ? 'KHO THÀNH PHẨM' : 'KHO NGUYÊN PHỤ LIỆU'}</small>
      <h2>{inbound ? 'Lệnh nhập' : 'Lệnh xuất'} · {code}</h2>
      <p>Ngày tạo: {request.createdAt ? new Date(request.createdAt).toLocaleString('vi-VN') : '—'}
        {' · '}Trạng thái: {request.status || '—'}</p></div>
      <button type="button" aria-label="Đóng chi tiết lệnh" onClick={onClose}>×</button></header>
    <div className="fg-request-dialog-body">
      {inbound && <p>Người gửi: {finished ? request.technician || 'Chưa lưu' :
        request.requestedByTechnicianId?.fullName || 'Chưa lưu'}
        {request.receiptCode ? ` · Phiếu nhập ${request.receiptCode}` : ''}</p>}
      {!inbound && <p>{request.purpose || request.note || 'Yêu cầu xuất kho'}
        {request.recipient ? ` · Người nhận: ${request.recipient}` : ''}</p>}
      {!inbound && request.sourceDiscrepancies?.some((item) => item.status === 'OPEN') &&
        <div role="alert">Sai lệch nguồn cây vải: {request.sourceDiscrepancies.filter((item) =>
          item.status === 'OPEN').map((item) => `${item.sourceBarcode || 'Tem hỏng'}: ${item.reason}`).join('; ')}</div>}
      <div className="product-table-scroll"><table className="product-table">
        <thead><tr><th>Mã</th><th>Sản phẩm / vật tư</th><th>Số lượng</th><th>Thông tin</th></tr></thead>
        <tbody>{lines.map((line, index) => <tr key={`${line.code}-${index}`}>
          <td>{line.code || '—'}</td><td>{line.name || '—'}</td>
          <td>{number(line.quantity)} {line.unit || ''}</td><td>{line.detail || '—'}</td>
        </tr>)}</tbody></table></div>
      {!lines.length && <p>Không có dòng chi tiết được lưu cho lệnh này.</p>}
    </div>
    <footer><button className="btn-ara-secondary" type="button" onClick={onClose}>Đóng</button>
      {canReceive && <button className="btn-ara-primary" type="button" onClick={() => onReceive(request)}>
        Kiểm nhận và nhập kho</button>}</footer>
  </section></div>;
}
