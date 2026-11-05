import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle, Printer, RefreshCw, ScanBarcode, Trash2, Truck } from 'lucide-react';
import { shippingService } from '../services/shippingService';

const money = (value) => `${new Intl.NumberFormat('vi-VN').format(Number(value || 0))} ₫`;
const shell = { maxWidth: 1480, margin: '0 auto', padding: '1.25rem', color: 'var(--ara-text, #24303d)' };
const card = { background: '#fff', border: '1px solid var(--ara-border, #e3e7eb)', borderRadius: 12, padding: '1rem', marginBottom: '1rem' };
const field = { display: 'grid', gap: '.35rem', minWidth: 0 };
const input = { width: '100%', boxSizing: 'border-box', padding: '.65rem', border: '1px solid #ccd3da', borderRadius: 7 };

const initialPayload = (order) => ({
  address: order.recipient?.address || '', wardName: '', provinceName: '', weight: 1000,
  length: 20, width: 15, height: 10, serviceTypeId: 2, paymentTypeId: 2,
  codAmount: order.codAmount ?? 0,
  declaredValue: order.items.reduce((sum, item) => sum + (Number(item.unitSalePrice) || 0) * item.quantity, 0),
  requiredNote: 'KHONGCHOXEMHANG', note: '',
});

const shipmentStatusLabel = (status) => ({
  WAITING_FOR_PICKUP: 'Chờ GHN lấy hàng', PICKUP_IN_PROGRESS: 'GHN đang đến lấy', IN_TRANSIT: 'Đang vận chuyển',
  OUT_FOR_DELIVERY: 'Đang giao', DELIVERED: 'Giao thành công', DELIVERY_FAILED: 'Giao không thành công',
  RETURNING: 'Đang hoàn', RETURNED_TO_SENDER: 'GHN đã trả hàng', CANCELLED: 'Đã hủy vận đơn', EXCEPTION: 'Cần xử lý',
}[status] || status || 'Chưa có trạng thái');

function ShipmentForm({ order, onClose, onCreated }) {
  const [form, setForm] = useState(() => initialPayload(order));
  const [provinces, setProvinces] = useState([]);
  const [wards, setWards] = useState([]);
  const [provinceId, setProvinceId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  useEffect(() => {
    shippingService.getProvinces().then(({ data }) => setProvinces(data.provinces || []))
      .catch((err) => setError(err.message || 'Không tải được danh mục tỉnh GHN.'));
  }, []);
  useEffect(() => {
    if (!provinceId) { setWards([]); set('provinceName', ''); set('wardName', ''); return; }
    setWards([]); set('wardName', '');
    shippingService.getWards(provinceId).then(({ data }) => setWards(data.wards || []))
      .catch((err) => setError(err.message || 'Không tải được danh mục phường GHN.'));
    const selectedProvince = provinces.find((province) => String(province.id) === String(provinceId));
    set('provinceName', selectedProvince?.name || '');
  }, [provinceId, provinces]);
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const { data } = await shippingService.createShipment(order.id, form);
      onCreated(data.shipment);
    } catch (err) { setError(err.message || 'Không tạo được vận đơn.'); }
    finally { setBusy(false); }
  };
  return <form onSubmit={submit} style={{ ...card, borderColor: '#9f8365', background: '#fffdf9' }}>
    <h3 style={{ marginTop: 0 }}>Tạo vận đơn · {order.orderCode}</h3>
    <p style={{ color: '#66717c' }}>Thông tin người nhận được lấy từ đơn. Xác nhận địa chỉ theo danh mục GHN trước khi tạo.</p>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '.8rem' }}>
      <label style={field}>Người nhận<input style={input} value={order.recipient?.name || ''} readOnly /></label>
      <label style={field}>Điện thoại<input style={input} value={order.recipient?.phone || ''} readOnly /></label>
      <label style={field}>Địa chỉ<input required style={input} value={form.address} onChange={(e) => set('address', e.target.value)} /></label>
      <label style={field}>Tỉnh / thành theo GHN<select required style={input} value={provinceId} onChange={(e) => setProvinceId(e.target.value)}><option value="">Chọn tỉnh / thành</option>{provinces.map((province) => <option key={province.id} value={province.id}>{province.name}</option>)}</select></label>
      <label style={field}>Phường / xã theo GHN<select required style={input} value={form.wardName} onChange={(e) => set('wardName', e.target.value)} disabled={!provinceId}><option value="">Chọn phường / xã</option>{wards.map((ward) => <option key={ward.id} value={ward.name}>{ward.name}</option>)}</select></label>
      <label style={field}>Khối lượng (gram)<input required type="number" min="1" style={input} value={form.weight} onChange={(e) => set('weight', e.target.value)} /></label>
      <label style={field}>Dài (cm)<input required type="number" min="1" style={input} value={form.length} onChange={(e) => set('length', e.target.value)} /></label>
      <label style={field}>Rộng (cm)<input required type="number" min="1" style={input} value={form.width} onChange={(e) => set('width', e.target.value)} /></label>
      <label style={field}>Cao (cm)<input required type="number" min="1" style={input} value={form.height} onChange={(e) => set('height', e.target.value)} /></label>
      <label style={field}>Dịch vụ<select style={input} value={form.serviceTypeId} onChange={(e) => set('serviceTypeId', e.target.value)}><option value="2">Gói dưới 20 kg</option><option value="5">Hàng nặng / nhiều kiện</option></select></label>
      <label style={field}>Bên trả phí<select style={input} value={form.paymentTypeId} onChange={(e) => set('paymentTypeId', e.target.value)}><option value="1">Người gửi</option><option value="2">Người nhận</option></select></label>
      <label style={field}>COD còn phải thu (₫)<input required type="number" min="0" style={input} value={form.codAmount} onChange={(e) => set('codAmount', e.target.value)} /></label>
      <label style={field}>Giá trị khai báo (₫)<input required type="number" min="0" style={input} value={form.declaredValue} onChange={(e) => set('declaredValue', e.target.value)} /></label>
      <label style={field}>Chính sách xem hàng<select style={input} value={form.requiredNote} onChange={(e) => set('requiredNote', e.target.value)}><option value="KHONGCHOXEMHANG">Không cho xem hàng</option><option value="CHOXEMHANGKHONGTHU">Cho xem, không thử</option><option value="CHOTHUHANG">Cho thử hàng</option></select></label>
      <label style={field}>Ghi chú<textarea style={input} rows="2" value={form.note} onChange={(e) => set('note', e.target.value)} /></label>
    </div>
    {error && <p role="alert" style={{ color: '#b42318' }}>{error}</p>}
    <div style={{ display: 'flex', gap: '.6rem', justifyContent: 'flex-end', marginTop: '1rem' }}><button type="button" onClick={onClose}>Đóng</button><button disabled={busy} type="submit">{busy ? 'Đang gửi GHN…' : 'Tạo vận đơn GHN'}</button></div>
  </form>;
}

export default function ShippingPage() {
  const [orders, setOrders] = useState([]);
  const [shipments, setShipments] = useState([]);
  const [handovers, setHandovers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [activeHandover, setActiveHandover] = useState(null);
  const [showHandoverForm, setShowHandoverForm] = useState(false);
  const [handoverForm, setHandoverForm] = useState({ senderName: '', receiverName: '', note: '' });
  const [scanCode, setScanCode] = useState('');
  const [scanNotice, setScanNotice] = useState('');
  const [handoverConfirmed, setHandoverConfirmed] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const scanRef = useRef(null);
  const reload = useCallback(async () => {
    setBusy(true); setError('');
    try {
      const [orderResponse, shipmentResponse, handoverResponse] = await Promise.all([shippingService.getOrders(), shippingService.getShipments(), shippingService.getHandovers()]);
      setOrders(orderResponse.data.orders || []); setShipments(shipmentResponse.data.shipments || []);
      setHandovers(handoverResponse.data.handovers || []);
    } catch (err) { setError(err.message || 'Không tải được danh sách vận chuyển.'); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { reload(); }, [reload]);
  const created = (shipment) => { setSelected(null); reload(); };
  const checkUnknownResult = async (order) => {
    setError('');
    try {
      await shippingService.createShipment(order.id, {});
      await reload();
    } catch (err) {
      await reload(); setError(err.message || 'Chưa xác định được kết quả GHN. Hãy kiểm tra lại sau.');
    }
  };
  const printLabel = async (shipment) => {
    try {
      const { data } = await shippingService.getPrintToken(shipment.id);
      const url = new URL(data.url); url.searchParams.set('token', data.token);
      window.open(url.toString(), '_blank', 'noopener,noreferrer');
    } catch (err) { setError(err.message || 'Không lấy được tem GHN.'); }
  };
  const draft = handovers.find((item) => item.id === activeHandover && item.status === 'DRAFT');
  const warehouseLabels = { RAW_MATERIAL: 'Kho nguyên liệu', FINISHED_GOODS: 'Kho thành phẩm', DEFECT_QUARANTINE: 'Kho cách ly lỗi' };
  const createDraft = async (event) => {
    event.preventDefault(); setError('');
    try {
      const { data } = await shippingService.createHandover(handoverForm);
      setActiveHandover(data.handover.id); setShowHandoverForm(false); setHandoverConfirmed(false); setScanNotice('Biên bản nháp đã tạo. Quét mã vận đơn GHN trên kiện.');
      await reload(); setTimeout(() => scanRef.current?.focus(), 0);
    } catch (err) { setError(err.message || 'Không tạo được biên bản bàn giao.'); }
  };
  const scanParcel = async (event) => {
    event.preventDefault(); if (!draft || !scanCode.trim()) return;
    setError(''); setScanNotice('');
    try {
      const { data } = await shippingService.scanHandoverParcel(draft.id, scanCode.trim(), handoverForm.senderName || draft.senderName);
      setScanNotice(data.duplicate ? 'Kiện này đã có trong biên bản, không cộng thêm.' : `Đã thêm vận đơn ${scanCode.trim()} vào biên bản.`);
      setScanCode(''); await reload(); scanRef.current?.focus();
    } catch (err) { setScanCode(''); await reload(); setError(err.message || 'Không ghi nhận được kiện.'); scanRef.current?.focus(); }
  };
  const removeParcel = async (waybillCode) => {
    if (!draft || !window.confirm(`Bỏ kiện ${waybillCode} khỏi biên bản nháp?`)) return;
    try { await shippingService.removeHandoverParcel(draft.id, waybillCode); await reload(); }
    catch (err) { setError(err.message || 'Không bỏ được kiện khỏi biên bản.'); }
  };
  const confirmHandover = async () => {
    if (!draft || !handoverConfirmed || !window.confirm(`Xác nhận đã bàn giao thực tế ${draft.parcels.length} kiện cho ${draft.receiverName}?`)) return;
    try {
      const { data } = await shippingService.confirmHandover(draft.id);
      setActiveHandover(null); setHandoverConfirmed(false); setScanNotice(`Đã xác nhận bàn giao · ${data.handover.reportCode}`); await reload();
    } catch (err) { setError(err.message || 'Biên bản không còn hợp lệ.'); }
  };
  return <main style={shell}>
    <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
      <div><h1 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '.55rem' }}><Truck /> Bàn giao vận chuyển</h1><p style={{ marginBottom: 0, color: '#66717c' }}>Tạo vận đơn GHN, quét mã vận đơn trên kiện và xác nhận biên bản bàn giao.</p></div>
      <button onClick={reload} disabled={busy} style={{ padding: '.65rem .9rem' }}><RefreshCw size={16} /> Làm mới</button>
    </header>
    {error && <div role="alert" style={{ ...card, color: '#b42318' }}>{error}</div>}
    {selected && <ShipmentForm key={selected.id} order={selected} onClose={() => setSelected(null)} onCreated={created} />}
    <section style={card}><h2>Chờ tạo vận đơn <small>({orders.filter((order) => !order.shipment).length})</small></h2>
      {!orders.length ? <p>Chưa có đơn đóng final đủ điều kiện vận chuyển.</p> : orders.map((order) => <article key={order.id} style={{ borderTop: '1px solid #e5e7eb', padding: '.9rem 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <div><strong>{order.orderCode}</strong><div>{order.recipient?.name || 'Thiếu tên'} · {order.recipient?.phone || 'Thiếu số điện thoại'}</div><small>{order.items.map((item) => `${item.skuCode} × ${item.quantity}`).join(' · ')} · {order.packedUnits.length} sản phẩm · COD {money(order.codAmount)}</small>
          {order.shipment && <div style={{ color: order.shipment.createStatus === 'UNKNOWN' ? '#9a6700' : '#18794e', marginTop: '.3rem' }}>{order.shipment.createStatus === 'UNKNOWN' ? 'Đang kiểm tra kết quả tạo vận đơn' : `Vận đơn ${order.shipment.waybillCode || ''} · ${shipmentStatusLabel(order.shipment.shipmentStatus)}`}</div>}</div>
        {order.shipment?.createStatus === 'CREATED' ? <button onClick={() => printLabel(order.shipment)}><Printer size={16} /> In tem</button> : order.shipment?.createStatus === 'UNKNOWN' || order.shipment?.createStatus === 'CREATING' ? <button onClick={() => checkUnknownResult(order)}>Kiểm tra kết quả GHN</button> : <button disabled={!order.recipient?.name || !order.recipient?.phone} onClick={() => setSelected(order)}>Tạo vận đơn</button>}
      </article>)}</section>
    <section style={card}><h2>Vận đơn đã tạo <small>({shipments.filter((s) => s.createStatus === 'CREATED').length})</small></h2>
      {!shipments.length ? <p>Chưa có vận đơn.</p> : shipments.map((shipment) => <article key={shipment.id} style={{ borderTop: '1px solid #e5e7eb', padding: '.8rem 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.75rem', flexWrap: 'wrap' }}><div><strong>{shipment.orderCode}</strong> · {shipment.waybillCode || shipment.clientOrderCode}<div>{shipment.createStatus === 'UNKNOWN' ? 'Đang kiểm tra kết quả tạo vận đơn' : shipmentStatusLabel(shipment.shipmentStatus)}{shipment.fee != null ? ` · Phí ${money(shipment.fee)}` : ''}</div></div>{shipment.createStatus === 'CREATED' && <button onClick={() => printLabel(shipment)}><Printer size={16} /> In tem</button>}</article>)}</section>
    <section style={card}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.75rem', flexWrap: 'wrap' }}><div><h2 style={{ marginBottom: '.2rem' }}>Quét bàn giao vận chuyển</h2><p style={{ marginTop: 0, color: '#66717c' }}>Quét mã vận đơn GHN trên kiện để ghi vào biên bản. Barcode từng sản phẩm chỉ lưu nội bộ để đối chiếu.</p></div><button onClick={() => setShowHandoverForm((value) => !value)}>Tạo biên bản bàn giao</button></header>
      {showHandoverForm && <form onSubmit={createDraft} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '.7rem', padding: '.8rem', background: '#f8f9fa', borderRadius: 8 }}>
        <p style={{ gridColumn: '1 / -1', margin: 0, color: '#66717c' }}>Kho sẽ tự xác định theo vận đơn đầu tiên được quét. Một biên bản chỉ nhận kiện cùng kho.</p>
        <label style={field}>Đơn vị vận chuyển<input style={input} readOnly value="GHN" /></label>
        <label style={field}>Người giao<input required style={input} value={handoverForm.senderName} onChange={(e) => setHandoverForm({ ...handoverForm, senderName: e.target.value })} /></label>
        <label style={field}>Người nhận phía GHN<input required style={input} value={handoverForm.receiverName} onChange={(e) => setHandoverForm({ ...handoverForm, receiverName: e.target.value })} /></label>
        <label style={field}>Ghi chú<input style={input} value={handoverForm.note} onChange={(e) => setHandoverForm({ ...handoverForm, note: e.target.value })} /></label>
        <div style={{ alignSelf: 'end' }}><button type="submit">Tạo nháp và bắt đầu quét</button></div>
      </form>}
      {scanNotice && <p role="status" style={{ color: '#18794e' }}>{scanNotice}</p>}
      {draft && <div style={{ marginTop: '1rem', border: '1px solid #d8dee5', borderRadius: 8, padding: '.9rem' }}>
        <strong>Biên bản nháp · {draft.warehouseType ? warehouseLabels[draft.warehouseType] : 'Kho tự xác định sau lượt quét đầu tiên'} · GHN</strong><div>Người giao: {draft.senderName} · Người nhận: {draft.receiverName}</div>
        <form onSubmit={scanParcel} style={{ display: 'flex', gap: '.6rem', margin: '.8rem 0', flexWrap: 'wrap' }}><input ref={scanRef} autoFocus aria-label="Quét mã vận đơn GHN" placeholder="Quét hoặc nhập mã vận đơn GHN trên kiện" value={scanCode} onChange={(e) => setScanCode(e.target.value)} style={{ ...input, flex: '1 1 320px' }} /><button type="submit"><ScanBarcode size={16} /> Ghi nhận kiện</button></form>
        <div>{draft.parcels.length ? draft.parcels.map((parcel) => <div key={parcel.waybillCode} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.5rem', borderTop: '1px solid #e5e7eb', padding: '.55rem 0' }}><span><strong>{parcel.waybillCode}</strong> · Đơn {parcel.orderCode} · {parcel.packedUnitsSnapshot.length} chiếc</span><button type="button" onClick={() => removeParcel(parcel.waybillCode)} aria-label={`Bỏ kiện ${parcel.waybillCode}`}><Trash2 size={16} /> Bỏ</button></div>) : <p>Chưa quét kiện nào vào biên bản.</p>}</div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginTop: '.8rem' }}><input type="checkbox" checked={handoverConfirmed} onChange={(e) => setHandoverConfirmed(e.target.checked)} />Tôi xác nhận các kiện trong danh sách đã thực tế được bàn giao cho người nhận phía GHN.</label>
        <button type="button" disabled={!handoverConfirmed || !draft.parcels.length} onClick={confirmHandover} style={{ marginTop: '.7rem' }}><CheckCircle size={16} /> Xác nhận bàn giao thực tế ({draft.parcels.length} kiện)</button>
      </div>}
      <h3>Biên bản bàn giao</h3>
      {!handovers.length ? <p>Chưa có biên bản.</p> : handovers.map((handover) => <article key={handover.id} style={{ borderTop: '1px solid #e5e7eb', padding: '.7rem 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.75rem', flexWrap: 'wrap' }}><div><strong>{handover.reportCode || 'Bản nháp'}</strong> · {warehouseLabels[handover.warehouseType] || handover.warehouseType}<div>{handover.carrier} · {handover.senderName} → {handover.receiverName} · {handover.parcels.length} kiện · {handover.status === 'HANDED_OVER' ? 'Đã bàn giao' : 'Nháp'}</div></div>{handover.status === 'DRAFT' && <button onClick={() => { setActiveHandover(handover.id); setShowHandoverForm(false); setHandoverConfirmed(false); setTimeout(() => scanRef.current?.focus(), 0); }}>Tiếp tục quét</button>}</article>)}
    </section>
    <p style={{ color: '#66717c', fontSize: '.9rem' }}>Tạo vận đơn và cập nhật trạng thái GHN không ghi giảm hay cộng tồn kho. Tồn đã được ghi nhận ở bước đóng hàng final.</p>
  </main>;
}
