import { useEffect, useRef, useState } from 'react';
import { garmentTechnicalService } from '../services/garmentTechnicalService';

const amount = (value) => Number(value || 0).toLocaleString('vi-VN', { maximumFractionDigits: 3 });
const inputStyle = { width: '100%', padding: '.65rem', border: '1px solid var(--ara-border)', borderRadius: 8 };
const round = (value) => Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;

/** Resolves a physical roll to an exact confirmed issue before accepting a return. */
export default function RemnantReturnEntry({ prefill, onChanged, currentUserId }) {
  const [barcode, setBarcode] = useState('');
  const [source, setSource] = useState(null);
  const [selectedKey, setSelectedKey] = useState('');
  const [returnKind, setReturnKind] = useState('ORIGINAL_ROLL');
  const [length, setLength] = useState('');
  const [pieces, setPieces] = useState(['']);
  const [conditionNote, setConditionNote] = useState('');
  const [threshold, setThreshold] = useState(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [camera, setCamera] = useState(false);
  const [issueOptions, setIssueOptions] = useState([]);
  const [myRequests, setMyRequests] = useState([]);
  const [discrepancyTicketId, setDiscrepancyTicketId] = useState('');
  const [discrepancyReason, setDiscrepancyReason] = useState('');
  const videoRef = useRef(null);
  const cameraRef = useRef(null);
  const operationKey = useRef(crypto.randomUUID());
  const loadRequests = () => garmentTechnicalService.remnant.getReturnRequests().then((result) =>
    setMyRequests((result.data || []).filter((item) =>
      String(item.technicianId?._id || item.technicianId?.id || item.technicianId) === String(currentUserId))
      .slice(0, 20))).catch(() => {});
  useEffect(() => {
    garmentTechnicalService.remnant.getThreshold().then((result) =>
      setThreshold(Number(result.data.data?.thresholdMeters ?? result.data.thresholdMeters ?? 2))).catch(() => {});
    garmentTechnicalService.remnant.getOutboundRequests().then((result) =>
      setIssueOptions((result.data || []).filter((item) => item.status === 'COMPLETED'))).catch(() => {});
  }, []);
  useEffect(() => { loadRequests(); }, [currentUserId]);
  useEffect(() => {
    if (!prefill?.barcode) return;
    setBarcode(prefill.barcode);
    find(prefill.barcode, prefill.outboundTicketId);
  }, [prefill]);
  useEffect(() => {
    if (!camera || !videoRef.current) return undefined;
    let active = true;
    import('@zxing/browser').then(async ({ BrowserMultiFormatReader }) => {
      if (!active) return;
      const reader = new BrowserMultiFormatReader();
      cameraRef.current = await reader.decodeFromVideoDevice(undefined, videoRef.current, (result) => {
        if (result && active) {
          const scanned = result.getText().toUpperCase();
          setBarcode(scanned); setCamera(false); find(scanned);
        }
      });
      if (!active) { cameraRef.current?.stop(); cameraRef.current = null; }
    }).catch((failure) => setError(failure.message));
    return () => { active = false; cameraRef.current?.stop(); cameraRef.current = null; };
  }, [camera]);
  const find = async (value = barcode, outboundTicketId) => {
    setBusy(true); setError(''); setSource(null); setSelectedKey(''); setNotice('');
    try {
      const response = await garmentTechnicalService.remnant.lookupReturnSources({
        barcode: value.trim().toUpperCase(), ...(outboundTicketId ? { outboundTicketId } : {}),
      });
      setSource(response.data);
    } catch (failure) { setError(failure.response?.data?.message || failure.message); }
    finally { setBusy(false); }
  };
  const choose = (issue) => {
    setSelectedKey(`${issue.outboundTicketId}:${issue.outboundLineIndex}:${issue.outboundSourceIndex}`);
    setLength(''); setPieces(['']); setConditionNote(''); setError(''); setNotice('');
    operationKey.current = crypto.randomUUID();
  };
  const selected = source?.issues.find((issue) =>
    `${issue.outboundTicketId}:${issue.outboundLineIndex}:${issue.outboundSourceIndex}` === selectedKey);
  const measured = Number(length);
  const qualifies = length !== '' && Number.isFinite(measured) && measured >= threshold;
  const submit = async (event) => {
    event.preventDefault();
    if (!selected) { setError('Chọn đúng lần xuất của cây vải.'); return; }
    if (length === '' || !Number.isFinite(measured) || measured < 0 || round(measured) !== measured) {
      setError('Nhập số mét hợp lệ, tối đa ba chữ số thập phân.'); return;
    }
    if (measured > selected.availableLengthMeters) {
      setError(`Chỉ còn ${amount(selected.availableLengthMeters)} m có thể trả.`); return;
    }
    setBusy(true); setError('');
    try {
      const response = await garmentTechnicalService.remnant.recordCutting({
        operationKey: operationKey.current, barcode: source.roll.barcode,
        outboundTicketId: selected.outboundTicketId,
        outboundLineIndex: selected.outboundLineIndex, outboundSourceIndex: selected.outboundSourceIndex,
        measuredRemnantLengthMeters: measured, returnKind: qualifies ? returnKind : 'ORIGINAL_ROLL',
        pieces: qualifies && returnKind === 'SEPARATE_PIECES'
          ? pieces.map((value) => ({ lengthMeters: Number(value) })) : [],
        conditionNote,
      });
      const data = response.data;
      setNotice(`${data.recovery?.requestCode || ''}: ${data.message ||
        (qualifies ? 'Chờ kho xác nhận.' : 'Đã ghi nhận phế liệu.')}`);
      operationKey.current = crypto.randomUUID();
      setSource(null); setSelectedKey(''); setLength('');
      loadRequests();
      onChanged?.();
    } catch (failure) { setError(failure.response?.data?.message || failure.message); }
    finally { setBusy(false); }
  };
  const reportUnknown = async () => {
    setBusy(true); setError('');
    try {
      const ticketId = discrepancyTicketId || prefill?.outboundTicketId;
      const response = await garmentTechnicalService.remnant.reportUnknownReturnSource(ticketId, {
        barcode, reason: discrepancyReason,
      });
      setNotice(`Đã báo sai lệch trên ${response.data.ticketCode}; kho sẽ đối chiếu nguồn.`);
      setDiscrepancyReason('');
    } catch (failure) { setError(failure.response?.data?.message || failure.message); }
    finally { setBusy(false); }
  };
  const cancel = async (request) => {
    if (!window.confirm(`Hủy yêu cầu ${request.requestCode} và giải phóng số mét đang chờ?`)) return;
    setBusy(true); setError('');
    try {
      await garmentTechnicalService.remnant.closeReturnRequest(request._id, 'CANCELLED');
      setNotice(`Đã hủy ${request.requestCode}; có thể gửi yêu cầu đúng lại.`);
      loadRequests();
      if (barcode.trim()) find(barcode);
    } catch (failure) { setError(failure.response?.data?.message || failure.message); }
    finally { setBusy(false); }
  };
  return <section style={{ padding: '1.2rem', marginBottom: '1.25rem', borderRadius: 12,
    border: '1px solid var(--ara-border)', background: '#fff' }} aria-label="Tạo yêu cầu nhập lại vải thừa">
    <h2 style={{ marginTop: 0 }}>Tạo yêu cầu nhập lại vải thừa</h2>
    <p>Quét tem cây vải gốc hoặc nhập barcode. Nếu tem hỏng, chọn cây từ chi tiết phiếu xuất; nếu không xác định được nguồn, báo sai lệch cho kho.</p>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <input aria-label="Barcode cây vải gốc" style={{ ...inputStyle, flex: '1 1 260px' }} value={barcode}
        onChange={(event) => { setBarcode(event.target.value.toUpperCase()); setSource(null); setSelectedKey(''); }}
        onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); find(); } }}
        placeholder="Quét hoặc nhập barcode cây vải" />
      <button type="button" className="btn-ara-secondary" disabled={busy || !barcode.trim()} onClick={() => find()}>Tra nguồn</button>
      <button type="button" className="btn-ara-secondary" onClick={() => setCamera((value) => !value)}>
        {camera ? 'Tắt camera' : 'Quét bằng camera'}</button>
    </div>
    {camera && <video ref={videoRef} muted playsInline style={{ width: 'min(100%, 400px)', marginTop: 12 }} />}
    {error && <p role="alert" style={{ color: '#a62626' }}>{error}</p>}
    {notice && <p role="status" style={{ color: '#006c4a' }}>{notice}</p>}
    {!source && <div style={{ display: 'grid', gap: 8, marginTop: 14, maxWidth: 650 }}>
      <strong>Không xác định được nguồn hoặc tem bị hỏng?</strong>
      <label>Phiếu xuất cần đối chiếu<select style={inputStyle} value={discrepancyTicketId}
        onChange={(event) => setDiscrepancyTicketId(event.target.value)}>
        <option value="">Chọn phiếu xuất đã xác nhận</option>
        {issueOptions.map((item) => <option key={item._id} value={item._id}>
          {item.ticketCode} · {item.purpose || 'Sản xuất'}</option>)}
      </select></label>
      <label>Mô tả sai lệch<input style={inputStyle} value={discrepancyReason}
        onChange={(event) => setDiscrepancyReason(event.target.value)}
        placeholder="Tem hỏng, không đọc được mã cây..." /></label>
      <button type="button" className="btn-ara-secondary" disabled={busy ||
        !(discrepancyTicketId || prefill?.outboundTicketId) || discrepancyReason.trim().length < 5}
        onClick={reportUnknown}>Báo sai lệch nguồn</button>
    </div>}
    {source && <div style={{ display: 'grid', gap: 14, marginTop: 16 }}>
      <div><strong>{source.roll.barcode} · {source.roll.materialCode} {source.roll.materialName}</strong>
        <p>Quy cách: {source.roll.color || '—'} · khổ {source.roll.widthCm || '—'} cm ·
          {' '}GSM {source.roll.gsm || '—'} · Nhà cung cấp: {source.roll.supplierName || 'Chưa lưu'} ·
          {' '}Lô nhập: {source.roll.supplierLotCode || source.roll.originalInboundCode || 'Chưa lưu'}</p></div>
      <div><strong>Chọn đúng lần xuất</strong><div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
        {source.issues.map((issue) => {
          const key = `${issue.outboundTicketId}:${issue.outboundLineIndex}:${issue.outboundSourceIndex}`;
          return <label key={key} style={{ padding: 10, border: '1px solid var(--ara-border)', borderRadius: 8 }}>
            <input type="radio" name="return-issue" checked={selectedKey === key} onChange={() => choose(issue)} />
            {' '}<strong>{issue.outboundTicketCode}</strong> · {issue.issueDate ? new Date(issue.issueDate).toLocaleString('vi-VN') : '—'}
            {' '}· {issue.productionOrder || 'Chưa có lệnh sản xuất'} · dòng {issue.outboundLineIndex + 1}, cây {issue.outboundSourceIndex + 1}
            <br />Đã xuất {amount(issue.issuedLengthMeters)} m · Đã nhận lại {amount(issue.returnedLengthMeters)} m
            {' '}· Chờ xử lý {amount(issue.pendingLengthMeters)} m · Còn có thể trả {amount(issue.availableLengthMeters)} m
            {issue.scrapped && <strong> · Phế liệu đã chốt</strong>}
          </label>;
        })}
      </div></div>
      {selected && <form onSubmit={submit} style={{ display: 'grid', gap: 12, maxWidth: 650 }}>
        <p style={{ margin: 0 }}>Ngưỡng thu hồi hiện tại: <strong>{amount(threshold)} m</strong>.</p>
        <label>Chiều dài vải thừa thực tế (m)<input style={inputStyle} type="number" min="0" step="0.001"
          value={length} onChange={(event) => setLength(event.target.value)} required /></label>
        {qualifies && <><label>Vải trả là
          <select style={inputStyle} value={returnKind} onChange={(event) => setReturnKind(event.target.value)}>
            <option value="ORIGINAL_ROLL">Phần dư trên cây có tem gốc</option>
            <option value="SEPARATE_PIECES">Khúc vải đã cắt rời</option>
          </select></label>
          {returnKind === 'SEPARATE_PIECES' && <div><strong>Số mét từng khúc rời</strong>
            {pieces.map((piece, index) => <div key={index} style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <input aria-label={`Khúc vải ${index + 1}`} style={inputStyle} type="number" min="0.001" step="0.001"
                value={piece} onChange={(event) => setPieces((current) => current.map((item, i) =>
                  i === index ? event.target.value : item))} />
              <button type="button" disabled={pieces.length === 1} onClick={() => setPieces((current) =>
                current.filter((_, i) => i !== index))}>Bỏ</button></div>)}
            <button type="button" onClick={() => setPieces((current) => [...current, ''])}>Thêm khúc</button>
          </div>}</>}
        <label>Ghi chú tình trạng vải<input style={inputStyle} maxLength={500} value={conditionNote}
          onChange={(event) => setConditionNote(event.target.value)} /></label>
        {!qualifies && length !== '' && <p style={{ color: '#9a5b06' }}>Dưới ngưỡng {amount(threshold)} m: ghi nhận phế liệu, không tạo yêu cầu nhập.</p>}
        <button type="submit" className="btn-ara-primary" disabled={busy || selected.availableLengthMeters <= 0}>
          {busy ? 'Đang gửi...' : qualifies ? 'Gửi yêu cầu nhập lại' : 'Chốt phế liệu'}</button>
      </form>}
    </div>}
    <div style={{ marginTop: 18 }}><strong>Yêu cầu nhập lại của tôi</strong>
      {!myRequests.length && <p>Chưa có yêu cầu.</p>}
      {myRequests.map((request) => <div key={request._id} style={{ padding: '8px 0',
        borderBottom: '1px solid var(--ara-border)', display: 'flex', flexWrap: 'wrap', gap: 8,
        justifyContent: 'space-between' }}>
        <span>{request.requestCode} · {request.sourceBarcode || request.originalRollId?.rollBarcode} ·
          {' '}{amount(request.measuredRemnantLengthMeters)} m · {request.status === 'WAITING_WAREHOUSE_CONFIRMATION'
            ? 'Chờ kho xác nhận' : request.status === 'DISCREPANCY_REPORTED'
              ? `Sai lệch: ${request.discrepancyReason || 'Cần kiểm tra'}` : request.status === 'RESTOCKED'
                ? 'Đã xếp kệ' : request.status === 'WAITING_PUTAWAY_SCAN'
                  ? 'Chờ xếp kệ' : request.status === 'SCRAPPED_BELOW_THRESHOLD'
                    ? 'Phế liệu' : request.status}</span>
        {['WAITING_WAREHOUSE_CONFIRMATION', 'DISCREPANCY_REPORTED'].includes(request.status) &&
          <button type="button" disabled={busy} onClick={() => cancel(request)}>Hủy để gửi lại</button>}
      </div>)}
    </div>
  </section>;
}
