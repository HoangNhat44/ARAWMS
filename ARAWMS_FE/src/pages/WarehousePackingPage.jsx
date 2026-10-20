import { useEffect, useRef, useState } from 'react';
import { orderQrService } from '../services/orderQrService';

const panel = { background: '#fff', border: '1px solid var(--ara-border)', borderRadius: 10, padding: '1.5rem' };
const inputStyle = { flex: '1 1 240px', padding: '0.7rem', border: '1px solid var(--ara-border)', borderRadius: 6 };
const formatMoney = (value) => value == null ? '—' : `${new Intl.NumberFormat('vi-VN').format(value)} đ`;
const formatDate = (value) => value ? new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'short', timeStyle: 'short',
}).format(new Date(value)) : '—';
function Detail({ label, value }) {
  if (value == null || value === '') return null;
  return <div><span style={{ color: 'var(--ara-text-muted)' }}>{label}: </span><strong>{value}</strong></div>;
}
const randomId = (prefix) => {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return `${prefix}_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
};
const reasons = {
  BARCODE_NOT_FOUND: 'Barcode chưa có trong danh mục vật phẩm.',
  UNIT_UNAVAILABLE: 'Vật phẩm không sẵn sàng hoặc không dùng mã Code 128.',
  BARCODE_ALREADY_SCANNED: 'Vật phẩm này đã được quét trong đơn.',
  BARCODE_ALREADY_ASSIGNED: 'Vật phẩm đã được gắn với đơn này.',
  BARCODE_ASSIGNED_OTHER_ORDER: 'Vật phẩm đã gắn với đơn khác.',
  ITEM_NOT_IN_ORDER: 'Biến thể/SKU này không nằm trong đơn.',
  QTY_EXCEEDED: 'Đơn đã đủ số lượng của biến thể này.',
  ORDER_LOCKED: 'Đơn đang được xử lý ở bàn kho khác.',
  STATION_BUSY: 'Bàn này đang giữ một đơn khác. Hãy tạm dừng đơn hiện tại trước.',
  LEASE_EXPIRED: 'Phiên tại bàn đã hết hạn. Quét lại QR để tiếp tục.',
  ORDER_CHANGED: 'Nội dung đơn đã thay đổi. Cần đối soát lại trước khi quét tiếp.',
  SCAN_CLOSED: 'Đơn đã đủ hàng; không nhận thêm barcode.',
};

const stationId = (() => {
  const saved = sessionStorage.getItem('arawms_packing_station_id');
  if (saved) return saved;
  const id = randomId('station');
  sessionStorage.setItem('arawms_packing_station_id', id);
  return id;
})();

export default function WarehousePackingPage() {
  const [qrInput, setQrInput] = useState('');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [order, setOrder] = useState(null);
  const [session, setSession] = useState(null);
  const [message, setMessage] = useState('');
  const [scanNotice, setScanNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [decodingImage, setDecodingImage] = useState(false);
  const [cameraMode, setCameraMode] = useState(null);
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const cameraRequestRef = useRef(0);
  const pendingScanRef = useRef(null);
  const sessionRef = useRef(null);
  const busyRef = useRef(false);
  const lastCameraValueRef = useRef({ value: '', at: 0 });
  const noticeTimerRef = useRef(null);

  const showScanNotice = (value) => {
    clearTimeout(noticeTimerRef.current);
    setScanNotice(value);
    noticeTimerRef.current = setTimeout(() => setScanNotice(''), 3000);
  };

  const stopCamera = () => {
    cameraRequestRef.current += 1;
    controlsRef.current?.stop();
    controlsRef.current = null;
    setCameraMode(null);
  };

  useEffect(() => () => {
    cameraRequestRef.current += 1;
    controlsRef.current?.stop();
    clearTimeout(noticeTimerRef.current);
  }, []);

  useEffect(() => {
    if (!session) return undefined;
    const timer = setInterval(async () => {
      try {
        const response = await orderQrService.heartbeat(session.id, stationId, session.leaseVersion);
        if (!busyRef.current) {
          sessionRef.current = response.data.session;
          setSession(response.data.session);
        }
      } catch (err) {
        setError(`Phiên soạn hàng cần mở lại: ${err.message}`);
        stopCamera();
        sessionRef.current = null;
        setSession(null);
      }
    }, 60_000);
    return () => clearInterval(timer);
  }, [session?.id, session?.leaseVersion]);

  const openOrder = async (value) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await orderQrService.prepare(value.trim(), stationId);
      setOrder(response.data.order);
      sessionRef.current = response.data.session;
      setSession(response.data.session);
      setQrInput(value.trim());
      setBarcodeInput('');
      showScanNotice(`✓ Đã quét QR đơn ${response.data.order.orderCode}`);
    } catch (err) { setError(reasons[err.code] || err.message); }
    finally { busyRef.current = false; setBusy(false); }
  };

  const scanBarcode = async (value) => {
    const activeSession = sessionRef.current;
    if (!activeSession || busyRef.current) return;
    busyRef.current = true;
    const barcode = value.trim();
    const clientEventId = pendingScanRef.current?.barcode === barcode
      ? pendingScanRef.current.id : randomId('event');
    pendingScanRef.current = { barcode, id: clientEventId };
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await orderQrService.scan(activeSession.id, {
        stationId, leaseVersion: activeSession.leaseVersion, clientEventId, barcode,
      });
      sessionRef.current = response.data.session;
      setSession(response.data.session);
      setBarcodeInput('');
      pendingScanRef.current = null;
      if (response.data.result === 'ACCEPTED') {
        showScanNotice(`✓ Đã quét barcode ${barcode}`);
      } else {
        setMessage(reasons[response.data.reason] || response.data.reason);
      }
    } catch (err) { setError(reasons[err.code] || err.message); }
    finally { busyRef.current = false; setBusy(false); }
  };

  const pauseOrder = async () => {
    if (!session) return;
    setBusy(true); setError('');
    try {
      await orderQrService.release(session.id, stationId, session.leaseVersion);
      stopCamera();
      sessionRef.current = null;
      setSession(null); setOrder(null); setQrInput(''); setBarcodeInput('');
      setMessage('Đã tạm dừng tại bàn. Quét lại QR này để tiếp tục hoặc mở đơn khác.');
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  const startCamera = async () => {
    setError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Camera cần HTTPS hoặc localhost và quyền truy cập thiết bị.');
      return;
    }
    if (cameraMode) return;
    const requestId = ++cameraRequestRef.current;
    setCameraMode('ACTIVE');
    try {
      const { BarcodeFormat, BrowserMultiFormatReader } = await import('@zxing/browser');
      if (requestId !== cameraRequestRef.current) return;
      const reader = new BrowserMultiFormatReader();
      reader.possibleFormats = [BarcodeFormat.QR_CODE, BarcodeFormat.CODE_128];
      const controls = await reader.decodeFromConstraints(
        { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false },
        videoRef.current,
        (result) => {
          if (!result || requestId !== cameraRequestRef.current) return;
          const value = result.getText();
          if (busyRef.current) return;
          const now = Date.now();
          if (lastCameraValueRef.current.value === value && now - lastCameraValueRef.current.at < 2000) return;
          lastCameraValueRef.current = { value, at: now };
          if (!sessionRef.current && value.startsWith('PACK:v1:')) openOrder(value);
          else if (sessionRef.current?.state === 'SCANNING' && !value.startsWith('PACK:v1:')) scanBarcode(value);
        }
      );
      if (requestId !== cameraRequestRef.current) controls.stop();
      else controlsRef.current = controls;
    } catch (err) {
      if (requestId !== cameraRequestRef.current) return;
      stopCamera();
      setError(`Không mở được camera: ${err.message}`);
    }
  };

  const scanBarcodeImage = async (file) => {
    if (!file || !session || busy || decodingImage) return;
    setDecodingImage(true); setError(''); setMessage('');
    const url = URL.createObjectURL(file);
    try {
      const { BarcodeFormat, BrowserMultiFormatReader } = await import('@zxing/browser');
      const reader = new BrowserMultiFormatReader();
      reader.possibleFormats = [BarcodeFormat.CODE_128];
      const result = await reader.decodeFromImageUrl(url);
      await scanBarcode(result.getText());
    } catch (err) {
      setError(`Không đọc được barcode trong ảnh: ${err.message}`);
    } finally {
      URL.revokeObjectURL(url);
      setDecodingImage(false);
    }
  };

  return (
    <div style={{ width: 'min(100%, 950px)', margin: '2rem auto', padding: '0 1rem', display: 'grid', gap: '1rem' }}>
      <h1>Bàn đóng hàng</h1>
      <p>Mở camera một lần: quét QR để mở đơn, sau đó đưa từng barcode sản phẩm vào cùng khung hình để đối soát.</p>
      {scanNotice && <div role="status" className="packing-scan-notice">{scanNotice}</div>}
      {error && <div role="alert" style={{ ...panel, color: 'var(--ara-error)' }}>{error}</div>}
      {message && <div role="status" style={{ ...panel, color: 'var(--ara-success)' }}>{message}</div>}
      <section style={panel}>
        <h2>1. Camera quét QR và barcode</h2>
        <p>{session ? 'Đang quét barcode sản phẩm cho đơn đang mở.' : 'Đưa QR đơn hàng vào khung hình.'}</p>
        <button className="btn-ara-secondary" type="button" onClick={() => cameraMode ? stopCamera() : startCamera()}>
          {cameraMode ? 'Tắt camera' : 'Mở camera quét mã'}
        </button>
        <video ref={videoRef} playsInline muted style={{ display: cameraMode ? 'block' : 'none', width: '100%', maxWidth: 720, marginTop: '1rem', borderRadius: 8 }} />
        <h3 style={{ marginTop: '1rem' }}>Nhập hoặc dùng máy quét QR</h3>
        <form onSubmit={(event) => { event.preventDefault(); openOrder(qrInput); }} style={{ display: 'flex', flexWrap: 'wrap', gap: '.75rem', marginTop: '1rem' }}>
          <input aria-label="QR đơn hàng" value={qrInput} onChange={(event) => setQrInput(event.target.value)} style={inputStyle} required placeholder="PACK:v1:..." />
          <button className="btn-ara-primary" type="submit" disabled={busy}>Mở đơn</button>
        </form>
      </section>
      {order && <section style={panel}>
        <h2>2. Chi tiết đơn {order.orderCode}</h2>
        {order.demoOnly && <p style={{ color: 'var(--ara-gold-hover)' }}>Đơn mẫu: file JSON không có tên, số điện thoại hoặc địa chỉ khách.</p>}
        <div className="packing-detail-grid">
          <Detail label="Mã đơn" value={order.orderCode} />
          <Detail label="Trạng thái" value={order.status} />
          <Detail label="Kênh bán" value={order.channel} />
          <Detail label="Mã đơn sàn" value={order.externalOrderNo} />
          <Detail label="Ngày tạo" value={order.createdAt && formatDate(order.createdAt)} />
          <Detail label="Ngày chốt" value={order.confirmedAt && formatDate(order.confirmedAt)} />
          <Detail label="Trạng thái đóng hàng" value={order.packingStatus} />
        </div>
        {order.customer && <><h3>Khách hàng</h3><div className="packing-detail-grid">
          <Detail label="Mã khách" value={order.customer.code} />
          <Detail label="Tên" value={order.customer.name} />
          <Detail label="Điện thoại" value={order.customer.phone} />
        </div></>}
        {order.recipient && <><h3>Người nhận</h3><div className="packing-detail-grid">
          <Detail label="Tên" value={order.recipient.name} />
          <Detail label="Điện thoại" value={order.recipient.phone} />
          <Detail label="Địa chỉ" value={order.recipient.address} />
        </div></>}
        {order.shipping && <><h3>Vận chuyển</h3><div className="packing-detail-grid">
          <Detail label="Đơn vị" value={order.shipping.carrierName} />
          <Detail label="Mã vận chuyển" value={order.shipping.carrierCode} />
          <Detail label="Phí khách trả" value={order.shipping.feeCustomer != null && formatMoney(order.shipping.feeCustomer)} />
        </div></>}
        {(order.paymentMethod || order.paymentStatus || order.amounts) && <><h3>Thanh toán</h3><div className="packing-detail-grid">
          <Detail label="Phương thức" value={order.paymentMethod} />
          <Detail label="Trạng thái" value={order.paymentStatus} />
          <Detail label="Tiền hàng" value={order.amounts?.subtotal != null && formatMoney(order.amounts.subtotal)} />
          <Detail label="Giảm giá" value={order.amounts?.discount != null && formatMoney(order.amounts.discount)} />
          <Detail label="Tổng tiền" value={order.amounts?.total != null && formatMoney(order.amounts.total)} />
          <Detail label="Tiền thu hộ" value={order.amounts?.codAmount != null && formatMoney(order.amounts.codAmount)} />
        </div></>}
        {order.note && <p><strong>Ghi chú:</strong> {order.note}</p>}
        <h3>Danh sách sản phẩm ({order.items.reduce((sum, item) => sum + item.quantity, 0)} món)</h3>
        <div className="packing-products-scroll">
          <table className="packing-products-table">
            <thead><tr><th>STT</th><th>Mã mẫu</th><th>Số lượng</th><th>Chiết khấu</th><th>Thành tiền</th></tr></thead>
            <tbody>{session?.items.map((item, index) => {
              const detail = order.items[index];
              return <tr key={item.lineKey}>
                <td>{index + 1}</td>
                <td><strong>{detail?.skuCode || item.skuCode}</strong><small>{[detail?.name || item.name, detail?.color, detail?.size].filter(Boolean).join(' · ')}</small></td>
                <td><strong>{item.scanned}/{item.quantity}</strong><div className="packing-product-checks" aria-label={`Đã quét ${item.scanned} trên ${item.quantity} món`}>
                  {Array.from({ length: item.quantity }, (_, unitIndex) => <span key={unitIndex}
                    className={unitIndex < item.scanned ? 'packing-product-check checked' : 'packing-product-check'}
                    aria-label={`Món ${unitIndex + 1}: ${unitIndex < item.scanned ? 'đã quét' : 'chưa quét'}`}>
                    {unitIndex < item.scanned ? '✓' : '○'}
                  </span>)}
                </div></td>
                <td>{formatMoney(detail?.discountAmount)}</td>
                <td>{formatMoney(detail?.lineTotal)}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>
      </section>}
      {session && <section style={panel}>
        <h2>3. Đối soát barcode sản phẩm</h2>
        <p>Phiên: {session.state === 'READY_TO_RECORD' ? 'Đã đủ hàng' : 'Đang đối soát'}.</p>
        {session.state === 'SCANNING' && <>
          <form onSubmit={(event) => { event.preventDefault(); scanBarcode(barcodeInput); }} style={{ display: 'flex', flexWrap: 'wrap', gap: '.75rem', margin: '1rem 0' }}>
            <input aria-label="Barcode sản phẩm" value={barcodeInput} onChange={(event) => setBarcodeInput(event.target.value)} style={inputStyle} required placeholder="Quét Code 128 trên từng món" />
            <button className="btn-ara-primary" type="submit" disabled={busy}>Gắn sản phẩm với đơn</button>
          </form>
          <p style={{ marginTop: '1rem' }}>Đưa barcode từng món vào khung camera ở trên, dùng máy quét hoặc chọn ảnh barcode để thử trên cùng thiết bị.</p>
          <label style={{ display: 'block', marginTop: '.5rem' }}>Chọn ảnh barcode để quét
            <input type="file" accept="image/svg+xml,image/png,image/jpeg,image/webp" disabled={busy || decodingImage} onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              scanBarcodeImage(file);
            }} style={{ display: 'block', marginTop: '.4rem' }} />
          </label>
        </>}
        {session.state === 'READY_TO_RECORD' && <p style={{ marginTop: '1rem', color: 'var(--ara-success)' }}>
          Đã quét đủ sản phẩm. Bước tiếp theo là quay video đóng hàng và niêm phong; chức năng quay sẽ được triển khai riêng.
        </p>}
        {!!session.scannedBarcodes.length && <p style={{ marginTop: '1rem', overflowWrap: 'anywhere' }}>Đã gắn: {session.scannedBarcodes.join(', ')}</p>}
        <button type="button" className="btn-ara-secondary" disabled={busy} onClick={pauseOrder} style={{ marginTop: '1rem' }}>Tạm dừng tại bàn</button>
      </section>}
    </div>
  );
}
