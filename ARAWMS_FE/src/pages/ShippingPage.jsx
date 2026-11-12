import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, CheckCircle, PackageCheck, RefreshCw, ScanLine, Truck } from 'lucide-react';
import { shippingService } from '../services/shippingService';

const money = (value) => `${new Intl.NumberFormat('vi-VN').format(Number(value || 0))} ₫`;
const dateTime = (value) => (value ? new Date(value).toLocaleString('vi-VN', {
  hour: '2-digit', minute: '2-digit', second: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric',
}) : '—');

const shell = { maxWidth: 1480, margin: '0 auto', padding: '1.25rem', color: 'var(--ara-text, #24303d)' };
const card = { background: '#fff', border: '1px solid var(--ara-border, #e3e7eb)', borderRadius: 12, padding: '1rem', marginBottom: '1rem' };
const input = { width: '100%', boxSizing: 'border-box', padding: '.65rem', border: '1px solid #ccd3da', borderRadius: 7 };
const tabButton = (active) => ({
  padding: '.6rem 1rem', border: 'none', borderBottom: `3px solid ${active ? '#9f8365' : 'transparent'}`,
  background: 'transparent', fontWeight: active ? 700 : 500, color: active ? '#24303d' : '#66717c', cursor: 'pointer',
});
const th = { textAlign: 'left', padding: '.6rem .5rem', borderBottom: '1px solid #e3e7eb', color: '#66717c', fontWeight: 600, whiteSpace: 'nowrap' };
const td = { padding: '.6rem .5rem', borderBottom: '1px solid #f0f2f4', verticalAlign: 'top' };

const scanErrorMessage = (err) => err?.response?.data?.message || err?.message || 'Không bàn giao được đơn.';

function OrderTable({ orders, handedOver }) {
  if (!orders.length) {
    return <p style={{ color: '#66717c', padding: '1rem 0' }}>{handedOver ? 'Chưa có đơn nào được bàn giao.' : 'Không còn đơn đã đóng nào chờ bàn giao.'}</p>;
  }
  return <div style={{ overflowX: 'auto' }}>
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.92rem' }}>
      <thead><tr>
        <th style={th}>Mã đơn</th><th style={th}>Người nhận</th><th style={th}>Sản phẩm</th><th style={th}>COD</th>
        <th style={th}>Đóng hàng lúc</th>
        {handedOver && <th style={th}>Bàn giao lúc</th>}
        {handedOver && <th style={th}>Người bàn giao</th>}
      </tr></thead>
      <tbody>{orders.map((order) => <tr key={order.id}>
        <td style={td}><strong>{order.orderCode}</strong></td>
        <td style={td}>{order.recipient?.name || 'Thiếu tên'}<div style={{ color: '#66717c' }}>{order.recipient?.phone || ''}</div></td>
        <td style={td}>{order.items.map((item) => `${item.skuCode} × ${item.quantity}`).join(', ')}</td>
        <td style={td}>{money(order.codAmount)}</td>
        <td style={td}>{dateTime(order.packedAt)}</td>
        {handedOver && <td style={{ ...td, color: '#18794e', fontWeight: 600 }}>{dateTime(order.handedOverAt)}</td>}
        {handedOver && <td style={td}>{order.handedOverByName || '—'}</td>}
      </tr>)}</tbody>
    </table>
  </div>;
}

export default function ShippingPage() {
  const [readyOrders, setReadyOrders] = useState([]);
  const [handedOrders, setHandedOrders] = useState([]);
  const [tab, setTab] = useState('ready');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(null);
  const [manualCode, setManualCode] = useState('');
  const [cameraOn, setCameraOn] = useState(false);
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const cameraRequestRef = useRef(0);
  const scanningRef = useRef(false);
  const lastScanRef = useRef({ value: '', at: 0 });

  const reload = useCallback(async () => {
    setBusy(true); setError('');
    try {
      const [ready, handed] = await Promise.all([shippingService.getHandoverReady(), shippingService.getHandedOver()]);
      setReadyOrders(ready.data.orders || []);
      setHandedOrders(handed.data.orders || []);
    } catch (err) { setError(scanErrorMessage(err) || 'Không tải được danh sách bàn giao.'); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const submitCode = useCallback(async (rawValue) => {
    const value = String(rawValue || '').trim();
    if (!value || scanningRef.current) return;
    scanningRef.current = true;
    try {
      const { data } = await shippingService.scanOrderHandover(value);
      const order = data.order;
      // Chuyển đơn từ danh sách chờ sang danh sách đã bàn giao ngay, không chờ tải lại.
      setReadyOrders((list) => list.filter((item) => String(item.id) !== String(order.id)));
      setHandedOrders((list) => [order, ...list.filter((item) => String(item.id) !== String(order.id))]);
      setNotice({ ok: true, text: `Đã bàn giao đơn ${order.orderCode} lúc ${dateTime(order.handedOverAt)}.` });
    } catch (err) {
      setNotice({ ok: false, text: scanErrorMessage(err) });
    } finally {
      scanningRef.current = false;
    }
  }, []);

  const stopCamera = useCallback(() => {
    cameraRequestRef.current += 1;
    controlsRef.current?.stop();
    controlsRef.current = null;
    setCameraOn(false);
  }, []);
  useEffect(() => () => { cameraRequestRef.current += 1; controlsRef.current?.stop(); }, []);

  const startCamera = async () => {
    setError('');
    if (!navigator.mediaDevices?.getUserMedia) { setError('Camera cần HTTPS hoặc localhost và quyền truy cập thiết bị.'); return; }
    if (cameraOn) return;
    const requestId = ++cameraRequestRef.current;
    setCameraOn(true);
    try {
      const { BarcodeFormat, BrowserMultiFormatReader } = await import('@zxing/browser');
      if (requestId !== cameraRequestRef.current) return;
      const reader = new BrowserMultiFormatReader();
      reader.possibleFormats = [BarcodeFormat.QR_CODE, BarcodeFormat.CODE_128];
      const controls = await reader.decodeFromConstraints(
        { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
        videoRef.current,
        (result) => {
          if (!result || requestId !== cameraRequestRef.current) return;
          const value = result.getText();
          const now = Date.now();
          // Bỏ qua cùng một mã bị đọc lặp liên tục khi QR vẫn nằm trước camera.
          if (lastScanRef.current.value === value && now - lastScanRef.current.at < 3000) return;
          lastScanRef.current = { value, at: now };
          submitCode(value);
        },
      );
      if (requestId !== cameraRequestRef.current) controls.stop();
      else controlsRef.current = controls;
    } catch (err) {
      if (requestId !== cameraRequestRef.current) return;
      stopCamera();
      setError(`Không mở được camera: ${err.message}`);
    }
  };

  const submitManual = async (event) => {
    event.preventDefault();
    const value = manualCode;
    setManualCode('');
    await submitCode(value);
  };

  return <main style={shell}>
    <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
      <div>
        <h1 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '.55rem' }}><Truck /> Vận chuyển &amp; bàn giao</h1>
        <p style={{ marginBottom: 0, color: '#66717c' }}>Quét QR đơn hàng đã đóng để bàn giao cho đơn vị vận chuyển.</p>
      </div>
      <button onClick={reload} disabled={busy} style={{ padding: '.65rem .9rem' }}><RefreshCw size={16} /> Làm mới</button>
    </header>
    {error && <div role="alert" style={{ ...card, color: '#b42318' }}>{error}</div>}

    <section style={card}>
      <h2 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: '.5rem' }}><ScanLine size={20} /> Quét đơn bàn giao</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', alignItems: 'start' }}>
        <div>
          <div style={{ position: 'relative', background: '#111', borderRadius: 10, overflow: 'hidden', aspectRatio: '4 / 3', display: 'grid', placeItems: 'center' }}>
            <video ref={videoRef} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', display: cameraOn ? 'block' : 'none' }} />
            {!cameraOn && <div style={{ color: '#cfd5db', textAlign: 'center', padding: '1rem' }}><Camera size={36} /><p>Bật camera để quét QR trên đơn hàng.</p></div>}
          </div>
          <div style={{ display: 'flex', gap: '.6rem', marginTop: '.7rem' }}>
            {cameraOn
              ? <button onClick={stopCamera}><CameraOff size={16} /> Tắt camera</button>
              : <button onClick={startCamera}><Camera size={16} /> Bật camera</button>}
          </div>
        </div>
        <div>
          <form onSubmit={submitManual} style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
            <input aria-label="Mã đơn hoặc QR đơn" placeholder="Dùng máy quét cầm tay hoặc nhập mã đơn" value={manualCode}
              onChange={(e) => setManualCode(e.target.value)} style={{ ...input, flex: '1 1 220px' }} />
            <button type="submit"><PackageCheck size={16} /> Bàn giao</button>
          </form>
          {notice && <div role="status" style={{
            marginTop: '.8rem', padding: '.75rem', borderRadius: 8,
            background: notice.ok ? '#e9f7ef' : '#fdecea', color: notice.ok ? '#18794e' : '#b42318',
            display: 'flex', alignItems: 'center', gap: '.5rem',
          }}>{notice.ok && <CheckCircle size={18} />}{notice.text}</div>}
          <p style={{ color: '#66717c', fontSize: '.9rem' }}>
            Mỗi lần quét thành công, đơn chuyển sang trạng thái <strong>Đã bàn giao cho đơn vị vận chuyển</strong>,
            được ghi thời gian bàn giao và chuyển sang tab "Đã bàn giao".
          </p>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <div><div style={{ fontSize: '1.6rem', fontWeight: 700 }}>{readyOrders.length}</div><small style={{ color: '#66717c' }}>Đơn chờ bàn giao</small></div>
            <div><div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#18794e' }}>{handedOrders.length}</div><small style={{ color: '#66717c' }}>Đơn đã bàn giao</small></div>
          </div>
        </div>
      </div>
    </section>

    <section style={card}>
      <div role="tablist" style={{ display: 'flex', gap: '.25rem', borderBottom: '1px solid #e3e7eb', marginBottom: '.5rem' }}>
        <button role="tab" aria-selected={tab === 'ready'} style={tabButton(tab === 'ready')} onClick={() => setTab('ready')}>Đơn có thể bàn giao ({readyOrders.length})</button>
        <button role="tab" aria-selected={tab === 'handed'} style={tabButton(tab === 'handed')} onClick={() => setTab('handed')}>Đơn đã bàn giao ({handedOrders.length})</button>
      </div>
      {tab === 'ready' ? <OrderTable orders={readyOrders} /> : <OrderTable orders={handedOrders} handedOver />}
    </section>
  </main>;
}
