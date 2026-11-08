import { useEffect, useState } from 'react';
import { garmentTechnicalService } from '../services/garmentTechnicalService';
import { materialInboundService } from '../services/materialInboundService';

const amount = (value) => Number(value || 0).toLocaleString('vi-VN', { maximumFractionDigits: 3 });
const id = (value) => String(value?._id || value?.id || value || '');
const statuses = {
  WAITING_WAREHOUSE_CONFIRMATION: 'Chờ kho xác nhận',
  DISCREPANCY_REPORTED: 'Đã báo sai lệch',
  WAITING_PUTAWAY_SCAN: 'Chờ xếp kệ', RESTOCKED: 'Đã xếp kệ',
  SCRAPPED_BELOW_THRESHOLD: 'Phế liệu dưới ngưỡng',
  REJECTED: 'Đã từ chối', CANCELLED: 'Đã hủy',
  PENDING_RECEIPT_TICKET: 'Phiếu cũ đang chờ xử lý',
};

/** Manager confirms the original issue and physical handover before stock is credited. */
export default function RemnantReturnReview({ locations = [] }) {
  const [requests, setRequests] = useState([]);
  const [selected, setSelected] = useState(null);
  const [barcode, setBarcode] = useState('');
  const [length, setLength] = useState('');
  const [locationId, setLocationId] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const load = async () => {
    try { setRequests((await garmentTechnicalService.remnant.getReturnRequests()).data || []); }
    catch (failure) { setError(failure.response?.data?.message || failure.message); }
  };
  useEffect(() => { load(); }, []);
  const open = (request) => {
    setSelected(request); setBarcode(''); setLength(String(request.measuredRemnantLengthMeters));
    setLocationId(''); setReason(''); setError(''); setNotice('');
  };
  const act = async (action) => {
    setBusy(true); setError(''); setNotice('');
    try {
      if (action === 'confirm') {
        const response = await garmentTechnicalService.remnant.confirmReturnRequest(id(selected), {
          barcode, lengthMeters: Number(length), locationId: locationId || undefined,
        });
        setNotice(`Đã xác nhận phiếu ${response.data.receiptCode || ''}; hàng chờ quét kệ.`);
      } else if (action === 'discrepancy') {
        await garmentTechnicalService.remnant.reportReturnDiscrepancy(id(selected), reason);
        setNotice('Đã báo sai lệch cho kỹ thuật viên. Tồn kho chưa thay đổi.');
      } else {
        await garmentTechnicalService.remnant.closeReturnRequest(id(selected), 'REJECTED');
        setNotice('Đã từ chối yêu cầu; số mét chờ được giải phóng.');
      }
      await load(); setSelected(null);
    } catch (failure) { setError(failure.response?.data?.message || failure.message); }
    finally { setBusy(false); }
  };
  const printLabels = async () => {
    const tab = window.open('', '_blank');
    try {
      const receiptId = id(selected.generatedInboundTicketId);
      const response = await materialInboundService.labels(receiptId);
      const { printMaterialLabels } = await import('../utils/materialLabelPrint');
      printMaterialLabels(response.data.labels || [], tab);
    } catch (failure) { tab?.close(); setError(failure.response?.data?.message || failure.message); }
  };
  const rawLocations = locations.filter((item) => item.warehouseType === 'RAW_MATERIAL' &&
    item.status === 'ACTIVE' && !item.isFrozenForStocktake);
  return <section className="wms-card" aria-label="Yêu cầu nhập lại vải thừa" style={{ marginBottom: 24 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
      <div><h2>Yêu cầu nhập lại vải thừa</h2><p>Đối chiếu cây gốc và số mét bàn giao trước khi xác nhận tồn.</p></div>
      <button type="button" className="wms-btn wms-btn-secondary" onClick={load}>Làm mới</button>
    </div>
    {notice && <p role="status">{notice}</p>}
    {error && <p role="alert" style={{ color: '#a62626' }}>{error}</p>}
    <div style={{ overflowX: 'auto' }}><table className="wms-table" style={{ width: '100%' }}><thead><tr>
      <th>Yêu cầu</th><th>Cây gốc</th><th>Phiếu xuất</th><th>Vải trả</th><th>Trạng thái</th><th /></tr></thead>
      <tbody>{requests.map((request) => <tr key={id(request)}>
        <td>{request.requestCode}</td><td>{request.originalRollId?.rollBarcode || request.sourceBarcode}</td>
        <td>{request.outboundTicketId?.ticketCode || request.outboundTicketCodeSnapshot || id(request.outboundTicketId)}</td>
        <td>{amount(request.measuredRemnantLengthMeters)} m · {request.returnKind === 'SEPARATE_PIECES' ?
          `${request.pieces?.length || 0} khúc rời` : 'Cây gốc'}</td>
        <td>{statuses[request.status] || request.status}</td>
        <td><button type="button" className="wms-btn wms-btn-sm wms-btn-secondary" onClick={() => open(request)}>Xem</button></td>
      </tr>)}</tbody></table></div>
    {!requests.length && <p>Chưa có yêu cầu nhập lại vải thừa.</p>}
    {selected && <div style={{ position: 'fixed', inset: 0, zIndex: 1500, background: '#211b1699',
      display: 'grid', placeItems: 'center', padding: 16, overflowY: 'auto' }}><section role="dialog" aria-modal="true"
      aria-label={`Yêu cầu trả vải ${selected.requestCode}`} style={{ maxWidth: 700, width: '100%',
        maxHeight: 'calc(100dvh - 32px)', overflowY: 'auto', padding: 24, borderRadius: 12, background: '#fff' }}>
      <h2>{selected.requestCode} · {statuses[selected.status] || selected.status}</h2>
      <p><strong>Cây gốc:</strong> {selected.originalRollId?.rollBarcode || selected.sourceBarcode} ·
        {' '}{selected.rawMaterialId?.materialCode} {selected.rawMaterialId?.materialName}</p>
      <p><strong>Nhà cung cấp:</strong> {selected.originalRollId?.supplierId?.supplierName ||
        selected.originalRollId?.supplierNameSnapshot || 'Chưa lưu'} ·
        {' '}<strong>Lô nhập gốc:</strong> {selected.originalRollId?.inboundTicketId?.ticketCode ||
          selected.originalRollId?.supplierLotCode || 'Chưa lưu'}</p>
      <p><strong>Phiếu xuất:</strong> {selected.outboundTicketId?.ticketCode || selected.outboundTicketCodeSnapshot || id(selected.outboundTicketId)} ·
        {' '}Dòng {Number(selected.outboundLineIndex) + 1} · Cây {Number(selected.outboundSourceIndex) + 1} ·
        {' '}Đã xuất {amount(selected.issuedLengthMeters)} m</p>
      <p><strong>Kỹ thuật viên:</strong> {selected.technicianId?.fullName || '—'} ·
        {' '}<strong>Đề nghị trả:</strong> {amount(selected.measuredRemnantLengthMeters)} m ·
        {' '}<strong>Ngưỡng:</strong> {amount(selected.appliedThresholdMeters)} m</p>
      <p><strong>Loại:</strong> {selected.returnKind === 'SEPARATE_PIECES'
        ? `Khúc rời: ${(selected.pieces || []).map((item) => `${amount(item.lengthMeters)} m`).join(', ')}`
        : 'Phần dư trên cây gốc, giữ barcode cũ'}</p>
      {selected.conditionNote && <p><strong>Tình trạng:</strong> {selected.conditionNote}</p>}
      {selected.discrepancyReason && <p role="status"><strong>Sai lệch cần xử lý:</strong> {selected.discrepancyReason}</p>}
      {selected.generatedInboundTicketId && <p><strong>Phiếu nhập:</strong> {selected.generatedInboundTicketId.ticketCode}</p>}
      {selected.generatedInboundTicketId && <button type="button" onClick={printLabels}>
        In tem {selected.returnKind === 'SEPARATE_PIECES' ? 'khúc vải' : 'cây gốc'}</button>}
      {selected.status === 'WAITING_WAREHOUSE_CONFIRMATION' && <div style={{ display: 'grid', gap: 12 }}>
        <label>Quét barcode cây gốc<input value={barcode} onChange={(event) => setBarcode(event.target.value.toUpperCase())}
          placeholder={selected.sourceBarcode} /></label>
        <label>Số mét thực nhận<input type="number" min="0" step="0.001" value={length}
          onChange={(event) => setLength(event.target.value)} /></label>
        <label>Vị trí nhận (nếu cần)<select value={locationId} onChange={(event) => setLocationId(event.target.value)}>
          <option value="">Vị trí hiện có / khu nhận mặc định</option>
          {rawLocations.map((item) => <option key={id(item)} value={id(item)}>{item.locationCode} · {item.rackName || item.rackCode || ''}</option>)}
        </select></label>
        <label>Lý do sai lệch<input value={reason} onChange={(event) => setReason(event.target.value)}
          placeholder="Barcode hoặc số mét không khớp" /></label>
      </div>}
      {error && <p role="alert" style={{ color: '#a62626' }}>{error}</p>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
        <button type="button" disabled={busy} onClick={() => setSelected(null)}>Đóng</button>
        {selected.status === 'WAITING_WAREHOUSE_CONFIRMATION' && <>
          <button type="button" disabled={busy || !reason.trim()} onClick={() => act('discrepancy')}>Báo sai lệch</button>
          <button type="button" disabled={busy || !barcode.trim()} onClick={() => act('confirm')}>Xác nhận nhập lại</button>
        </>}
        {['WAITING_WAREHOUSE_CONFIRMATION', 'DISCREPANCY_REPORTED'].includes(selected.status) &&
          <button type="button" disabled={busy} onClick={() => act('reject')}>Từ chối</button>}
      </div>
    </section></div>}
  </section>;
}
