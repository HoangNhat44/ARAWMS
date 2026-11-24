import { useEffect, useState } from 'react';
import { formatNumber } from '../../utils/warehouseFormat';
import { productService } from '../../services/productService';
import { materialInboundService } from '../../services/materialInboundService';
import { MATERIAL_UNIT_OPTIONS } from '../../utils/materialUnits';

/** Quantities may be fractional (meters, kilograms). */
const number = (value) => formatNumber(value, { maximumFractionDigits: 3 });
const unitName = Object.fromEntries(MATERIAL_UNIT_OPTIONS.map(({ value, shortLabel }) => [value, shortLabel]));
const dateTime = (value) => (value ? new Date(value).toLocaleString('vi-VN') : '—');
const receiptStatusNames = { DRAFT: 'Nháp', WAITING_QC: 'Chờ kiểm tra', READY_TO_CONFIRM: 'Chờ xác nhận nhập kho',
  COMPLETED: 'Đã xác nhận nhập kho' };
const qualityNames = { ACCEPTED: 'Đạt', REJECTED: 'Không đạt' };

/** "Kệ A01 · Kệ áo — Tầng 2 — Ô 3 (A01-2-3)", omitting parts the bin does not have. */
const locationText = (location) => {
  if (!location) return '—';
  const rack = location.rackCode
    ? `Kệ ${location.rackCode}${location.rackName && location.rackName !== location.rackCode ? ` · ${location.rackName}` : ''}`
    : '';
  const parts = [rack, location.floorNo != null ? `Tầng ${location.floorNo}` : '', location.binNo != null ? `Ô ${location.binNo}` : '']
    .filter(Boolean);
  return parts.length ? `${parts.join(' — ')} (${location.locationCode})` : location.locationCode || '—';
};

/** Loads the locations the manager chose for this request (finished-goods allocation or material receipts). */
function usePlacements(request, inbound, finished) {
  const [state, setState] = useState({ loading: false, error: '', data: null });
  const requestId = finished ? request?.receiptId : request?._id;
  useEffect(() => {
    if (!inbound || !requestId || (!finished && request?.legacyCompleted)) {
      setState({ loading: false, error: '', data: null });
      return undefined;
    }
    let live = true;
    setState({ loading: true, error: '', data: null });
    const load = finished ? productService.receiptDetail(requestId)
      : materialInboundService.technicianRequestPlacements(requestId);
    load.then((response) => { if (live) setState({ loading: false, error: '', data: response.data }); })
      .catch((failure) => { if (live) setState({ loading: false, error: failure.message, data: null }); });
    return () => { live = false; };
  }, [inbound, finished, requestId, request?.legacyCompleted]);
  return state;
}

/** Finished goods: every bin the manager chose for each SKU with its putaway progress. */
function FinishedPlacements({ detail, skuCodes }) {
  const rows = detail.progress.flatMap((item) => item.rows.map((row) => ({ ...row, skuId: item.skuId })));
  const unallocated = detail.progress.filter((item) => item.unallocated > 0);
  return <>
    <p>Phiếu nhập {detail.document?.documentCode || '—'}</p>
    {rows.length > 0 && <div className="product-table-scroll"><table className="product-table">
      <thead><tr><th>SKU</th><th>Vị trí đã chọn</th><th>Phân bổ</th><th>Đã xếp</th><th>Chờ xếp</th></tr></thead>
      <tbody>{rows.map((row, index) => <tr key={`${row.allocationCode}-${row.skuId}-${index}`}>
        <td>{skuCodes.get(row.skuId) || row.skuId}</td>
        <td>{locationText(row.location)}</td>
        <td>{row.allocated}</td><td>{row.placed}</td><td>{row.pending}</td>
      </tr>)}</tbody></table></div>}
    {!rows.length && <p>Quản lý kho chưa phân bổ vị trí cho phiếu này.</p>}
    {unallocated.map((item) => <p key={`un-${item.skuId}`}>
      {skuCodes.get(item.skuId) || item.skuId}: còn {item.unallocated} chiếc chưa phân bổ vị trí.</p>)}
  </>;
}

/** Raw materials: each receipt from the request with planned bin, quality and putaway result of every roll/lot. */
function MaterialPlacements({ data }) {
  if (!data.receipts?.length) return <p>Chưa có phiếu nhập nào được lập từ yêu cầu này, nên chưa có vị trí được chọn.</p>;
  return data.receipts.map((receipt) => <div key={receipt.id} style={{ marginTop: '.75rem' }}>
    <p><strong>Phiếu {receipt.ticketCode}</strong> · {receiptStatusNames[receipt.status] || receipt.status}
      {' · '}Lập bởi {receipt.preparedBy || '—'} lúc {dateTime(receipt.createdAt)}
      {receipt.confirmedAt ? ` · Xác nhận bởi ${receipt.confirmedBy || '—'} lúc ${dateTime(receipt.confirmedAt)}` : ''}</p>
    <p>Ngày nhận: {receipt.receivedAt ? new Date(receipt.receivedAt).toLocaleDateString('vi-VN') : '—'}
      {receipt.receivingLocation ? ` · Kho nhận: ${locationText(receipt.receivingLocation)}` : ''}
      {receipt.note ? ` · Ghi chú: ${receipt.note}` : ''}</p>
    <div className="product-table-scroll"><table className="product-table">
      <thead><tr><th>Vật tư</th><th>Cây / lô</th><th>Số lượng</th><th>Chất lượng</th><th>Vị trí dự kiến</th><th>Barcode</th><th>Xếp hàng</th></tr></thead>
      <tbody>{receipt.lines.flatMap((line, lineIndex) => line.objects.map((object, objectIndex) =>
        <tr key={`${lineIndex}-${objectIndex}`}>
          <td>{objectIndex === 0 ? <>{line.materialCode || '—'} · {line.materialName || '—'}{line.color ? ` · ${line.color}` : ''}
            {line.supplierName && <><br /><small>NCC: {line.supplierName}</small></>}</> : ''}</td>
          <td>{object.label}{object.sourceCode ? ` (${object.sourceCode})` : ''}</td>
          <td>{number(object.quantity)} {unitName[object.unit] || object.unit || ''}
            {object.weightKg ? <><br /><small>{number(object.weightKg)} kg</small></> : null}</td>
          <td>{qualityNames[object.quality] || '—'}{object.defectReason ? <><br /><small>{object.defectReason}</small></> : null}</td>
          <td>{object.plannedLocations.length ? object.plannedLocations.map((location, index) =>
            <div key={index}>{locationText(location)}{object.plannedLocations.length > 1 ? ` · ${number(location.quantity)}` : ''}</div>)
            : 'Chưa chọn'}</td>
          <td>{object.stock?.barcode || '—'}</td>
          <td>{!object.stock ? (receipt.status === 'COMPLETED' ? '—' : 'Chưa nhập kho')
            : object.stock.putawayComplete
              ? `Đã xếp${object.stock.actualLocationCodes.length ? ` · ${object.stock.actualLocationCodes.join(', ')}` : ''}`
              : 'Chờ xếp'}</td>
        </tr>))}</tbody></table></div>
    {!receipt.lines.some((line) => line.objects.length) && <p>Phiếu chưa có cây/lô nào.</p>}
  </div>);
}

/** Shows the source request on the warehouse page before opening an editable receipt. */
export default function WarehouseRequestDialog({ request, kind, onClose, onReceive }) {
  const inbound = kind === 'IN';
  const finished = request?.warehouse === 'FINISHED_GOODS';
  const placements = usePlacements(request, inbound, finished);
  if (!request) return null;
  const code = request.code || request.ticketCode;
  const lines = inbound
    ? finished ? request.lines.map((line) => ({ code: line.skuCode, name: line.productName,
      quantity: line.expectedQty, unit: 'chiếc', detail: `${line.color || ''} ${line.size || ''}`.trim() }))
      : (request.requestLines || []).map((line) => ({
        code: line.rawMaterialId?.materialCode || '—',
        name: line.rawMaterialId?.materialName || 'Vật tư không còn trong danh mục',
        quantity: line.acceptedQty ?? line.requestedQty,
        unit: unitName[line.rawMaterialId?.unit] || line.rawMaterialId?.unit || '',
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
  const skuCodes = new Map((request.lines || []).map((line) => [String(line.skuId), line.skuCode]));
  const showPlacements = inbound && (finished ? Boolean(request.receiptId) : !request.legacyCompleted);

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
      {showPlacements && <section style={{ marginTop: '1rem' }}>
        <h3 style={{ margin: '0 0 .4rem' }}>Vị trí quản lý kho đã chọn và tiến độ xếp hàng</h3>
        {placements.loading && <p role="status">Đang tải vị trí đã phân bổ…</p>}
        {placements.error && <p role="alert">Không tải được vị trí đã phân bổ: {placements.error}</p>}
        {placements.data && (finished
          ? <FinishedPlacements detail={placements.data} skuCodes={skuCodes} />
          : <MaterialPlacements data={placements.data} />)}
      </section>}
    </div>
    <footer><button className="btn-ara-secondary" type="button" onClick={onClose}>Đóng</button>
      {canReceive && <button className="btn-ara-primary" type="button" onClick={() => onReceive(request)}>
        Kiểm nhận và nhập kho</button>}</footer>
  </section></div>;
}
