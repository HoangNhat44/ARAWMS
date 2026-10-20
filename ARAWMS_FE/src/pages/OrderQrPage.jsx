import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { orderQrService } from '../services/orderQrService';

const panel = {
  background: '#fff', border: '1px solid var(--ara-border)', borderRadius: 'var(--radius-md)',
  padding: '1.5rem', boxShadow: 'var(--ara-shadow-sm)',
};

const formatMoney = (value) => value == null ? '—' : `${new Intl.NumberFormat('vi-VN').format(value)} đ`;
const formatDate = (value) => value ? new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'short', timeStyle: 'short',
}).format(new Date(value)) : '—';

function LabelField({ label, value }) {
  if (value == null || value === '') return null;
  return <div className="order-label-field"><span>{label}</span><strong>{value}</strong></div>;
}

function OrderLabel({ card }) {
  const { order } = card;
  if (!order) return null;
  const shipping = order.shipping;
  const amounts = order.amounts;
  return <article className="order-print-label">
    <header className="order-label-header">
      <div><h2>TEM ĐƠN HÀNG</h2><strong className="order-label-code">{order.orderCode}</strong>
        {order.demoOnly && <span>ĐƠN MẪU</span>}</div>
      <img src={card.image} alt={`QR đơn ${order.orderCode}`} />
    </header>
    <div className="order-label-fields">
      <LabelField label="Trạng thái" value={order.status} />
      <LabelField label="Kênh bán" value={order.channel} />
      <LabelField label="Mã đơn sàn" value={order.externalOrderNo} />
      <LabelField label="Ngày tạo" value={order.createdAt && formatDate(order.createdAt)} />
      <LabelField label="Ngày chốt" value={order.confirmedAt && formatDate(order.confirmedAt)} />
    </div>
    {order.customer && <section className="order-label-section">
      <h3>Khách hàng</h3>
      <div className="order-label-fields">
        <LabelField label="Mã khách" value={order.customer.code} />
        <LabelField label="Tên" value={order.customer.name} />
        <LabelField label="Điện thoại" value={order.customer.phone} />
      </div>
    </section>}
    {order.recipient && <section className="order-label-section">
      <h3>Người nhận</h3>
      <div className="order-label-fields">
        <LabelField label="Tên" value={order.recipient.name} />
        <LabelField label="Điện thoại" value={order.recipient.phone} />
        <LabelField label="Địa chỉ" value={order.recipient.address} />
      </div>
    </section>}
    {shipping && <section className="order-label-section">
      <h3>Vận chuyển</h3>
      <div className="order-label-fields">
        <LabelField label="Đơn vị" value={shipping.carrierName} />
        <LabelField label="Mã vận chuyển" value={shipping.carrierCode} />
        <LabelField label="Phí khách trả" value={shipping.feeCustomer != null && formatMoney(shipping.feeCustomer)} />
      </div>
    </section>}
    <section className="order-label-section">
      <h3>Sản phẩm ({order.items.reduce((sum, item) => sum + item.quantity, 0)})</h3>
      <table className="order-label-items"><thead><tr><th>Sản phẩm / SKU</th><th>SL</th><th>Đơn giá</th><th>Thành tiền</th></tr></thead>
        <tbody>{order.items.map((item, index) => <tr key={`${item.skuId || item.skuCode}-${index}`}>
          <td><strong>{[item.name, item.color, item.size].filter(Boolean).join(' · ') || item.skuCode || item.skuId}</strong><br />
            <small>SKU: {item.skuCode || item.skuId || '—'}</small>
            {item.discountAmount > 0 && <small>Giảm dòng: {formatMoney(item.discountAmount)}</small>}
          </td><td>{item.quantity}</td><td>{formatMoney(item.unitPrice)}</td><td>{formatMoney(item.lineTotal)}</td>
        </tr>)}</tbody>
      </table>
    </section>
    {(order.paymentMethod || order.paymentStatus || amounts) && <section className="order-label-section">
      <h3>Thanh toán</h3>
      <div className="order-label-fields">
        <LabelField label="Hình thức" value={order.paymentMethod} />
        <LabelField label="Trạng thái" value={order.paymentStatus} />
        <LabelField label="Tiền hàng" value={amounts?.subtotal != null && formatMoney(amounts.subtotal)} />
        <LabelField label="Giảm giá" value={amounts?.discount != null && formatMoney(amounts.discount)} />
        <LabelField label="Tổng thanh toán" value={amounts?.total != null && formatMoney(amounts.total)} />
        <LabelField label="Tiền thu hộ (COD)" value={amounts?.codAmount != null && formatMoney(amounts.codAmount)} />
      </div>
    </section>}
    {order.note && <section className="order-label-section"><h3>Ghi chú</h3><p>{order.note}</p></section>}
  </article>;
}

function OrderDetail({ order }) {
  if (!order) return null;
  return (
    <section style={panel}>
      <h2>Đơn {order.orderCode}</h2>
      <p>Trạng thái: {order.status} · Người nhận: {order.recipientName || 'Chưa có'}</p>
      {order.recipient && <p>Điện thoại: {order.recipient.phone}<br />Địa chỉ: {order.recipient.address}</p>}
      <ul style={{ margin: '1rem 0 0 1.25rem' }}>
        {order.items.map((item, index) => (
          <li key={`${item.skuId || item.skuCode}-${index}`}>
            {[item.name, item.color, item.size].filter(Boolean).join(' · ') || item.skuCode || item.skuId}
            {' · '}SKU {item.skuCode || item.skuId} · Số lượng {item.quantity}
          </li>
        ))}
      </ul>
      {order.note && <p style={{ marginTop: '1rem' }}>Ghi chú: {order.note}</p>}
      <p style={{ marginTop: '1rem', color: 'var(--ara-text-muted)' }}>
        Barcode từng món sẽ được nhân viên kho gắn sau khi quét QR đơn.
      </p>
    </section>
  );
}

export default function OrderQrPage() {
  const [orders, setOrders] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [activeOrder, setActiveOrder] = useState(null);
  const [search, setSearch] = useState('');
  const [qrCards, setQrCards] = useState({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const refreshOrders = async () => {
    const response = await orderQrService.list();
    setOrders(response.data.orders);
  };

  useEffect(() => {
    let live = true;
    orderQrService.list().then((response) => {
      if (live) setOrders(response.data.orders);
    }).catch((err) => {
      if (live) setError(err.message);
    }).finally(() => {
      if (live) setLoading(false);
    });
    return () => { live = false; };
  }, []);

  const filteredOrders = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    if (!term) return orders;
    return orders.filter((order) => [order.orderCode, order.id, order.recipientName, order.status]
      .some((value) => String(value || '').toLocaleLowerCase().includes(term)));
  }, [orders, search]);
  const eligibleVisibleIds = filteredOrders.filter((order) => order.canIssueQr).map((order) => order.id);
  const allVisibleSelected = eligibleVisibleIds.length > 0 && eligibleVisibleIds.every((id) => selectedIds.includes(id));
  const cards = Object.values(qrCards);

  const chooseOrder = async (id) => {
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await orderQrService.lookup(id);
      setActiveOrder(response.data.order);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  const addQrCard = async (order, qrValue) => ({
    id: order.id, orderCode: order.orderCode, order, qrValue,
    image: await QRCode.toDataURL(qrValue, { errorCorrectionLevel: 'M', width: 320, margin: 3 }),
  });

  const issueOne = async () => {
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await orderQrService.issue(activeOrder.id);
      const card = await addQrCard(response.data.order, response.data.qrValue);
      setQrCards((current) => ({ ...current, [card.id]: card }));
      setMessage(`Đã tạo / lấy QR cho ${activeOrder.orderCode}.`);
      await refreshOrders();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  const issueSelected = async () => {
    if (!selectedIds.length) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const results = [];
      for (let start = 0; start < selectedIds.length; start += 100) {
        const response = await orderQrService.issueBulk(selectedIds.slice(start, start + 100));
        results.push(...response.data.results);
      }
      const successful = results.filter((result) => result.qrValue);
      const generated = await Promise.all(successful.map((result) =>
        addQrCard(result.order, result.qrValue)));
      setQrCards((current) => Object.assign({}, current,
        ...generated.map((card) => ({ [card.id]: card }))));
      setSelectedIds(results.filter((result) => result.error).map((result) => result.id));
      setMessage(`Đã tạo / lấy ${successful.length} QR trên ${results.length} đơn đã chọn.`);
      const failed = results.filter((result) => result.error);
      if (failed.length) setError(`Chưa cấp được QR: ${failed.map((result) => `${result.orderCode || result.id} (${result.error})`).join(', ')}`);
      await refreshOrders();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  const confirm = async () => {
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await orderQrService.confirm(activeOrder.id);
      setActiveOrder(response.data.order);
      if (response.data.qrValue) {
        const card = await addQrCard(response.data.order, response.data.qrValue);
        setQrCards((current) => ({ ...current, [card.id]: card }));
      }
      setMessage(`Đã chốt đơn ${activeOrder.orderCode} và cấp QR.`);
      await refreshOrders();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  const replace = async () => {
    if (!window.confirm('QR cũ sẽ ngừng hoạt động. Cấp QR mới cho đơn này?')) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await orderQrService.replace(activeOrder.id);
      const card = await addQrCard(response.data.order, response.data.qrValue);
      setQrCards((current) => ({ ...current, [card.id]: card }));
      setMessage(`Đã thay QR của ${activeOrder.orderCode}.`);
      await refreshOrders();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ width: 'min(100%, 1100px)', margin: '2rem auto', padding: '0 1rem', display: 'grid', gap: '1rem' }}>
      <h1>Chốt đơn và cấp QR</h1>
      <p>Chọn một đơn để xem chi tiết và cấp QR, hoặc chọn nhiều đơn đã chốt để cấp QR hàng loạt. QR đã cấp sẽ được lấy lại, không tạo mã khác.</p>
      {error && <div role="alert" style={{ ...panel, color: 'var(--ara-error)', overflowWrap: 'anywhere' }}>{error}</div>}
      {message && <div role="status" style={panel}>{message}</div>}
      <section style={panel}>
        <h2>Danh sách đơn hàng ({orders.length})</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.75rem', margin: '1rem 0' }}>
          <input aria-label="Tìm đơn hàng" value={search} onChange={(event) => setSearch(event.target.value)}
            placeholder="Tìm theo mã đơn, ID, người nhận hoặc trạng thái" style={{ flex: '1 1 300px', padding: '.7rem', border: '1px solid var(--ara-border)', borderRadius: 6 }} />
          <button className="btn-ara-secondary" type="button" disabled={busy || loading} onClick={async () => {
            setBusy(true); setError('');
            try { await refreshOrders(); } catch (err) { setError(err.message); }
            finally { setBusy(false); }
          }}>Tải lại danh sách</button>
          <button className="btn-ara-primary" type="button" disabled={busy || selectedIds.length === 0} onClick={issueSelected}>
            Tạo / lấy QR hàng loạt ({selectedIds.length})
          </button>
        </div>
        {loading ? <p>Đang tải đơn hàng...</p> : <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 650 }}>
            <thead><tr style={{ textAlign: 'left', borderBottom: '1px solid var(--ara-border)' }}>
              <th style={{ padding: '.7rem' }}><input type="checkbox" aria-label="Chọn tất cả đơn có thể cấp QR đang hiển thị"
                checked={allVisibleSelected} disabled={!eligibleVisibleIds.length || busy}
                onChange={() => setSelectedIds((current) => allVisibleSelected
                  ? current.filter((id) => !eligibleVisibleIds.includes(id))
                  : [...new Set([...current, ...eligibleVisibleIds])])} /></th>
              <th>Mã đơn</th><th>Người nhận</th><th>Số món</th><th>Trạng thái</th><th>QR</th><th></th>
            </tr></thead>
            <tbody>{filteredOrders.map((order) => <tr key={order.id} style={{ borderBottom: '1px solid var(--ara-border)' }}>
              <td style={{ padding: '.7rem' }}><input type="checkbox" aria-label={`Chọn đơn ${order.orderCode}`}
                checked={selectedIds.includes(order.id)} disabled={!order.canIssueQr || busy}
                onChange={() => setSelectedIds((current) => current.includes(order.id)
                  ? current.filter((id) => id !== order.id) : [...current, order.id])} /></td>
              <td>{order.orderCode}{order.demoOnly ? ' (mẫu)' : ''}</td>
              <td>{order.recipientName || '—'}</td><td>{order.itemCount}</td><td>{order.status}</td>
              <td>{order.hasQr ? 'Đã cấp' : 'Chưa cấp'}</td>
              <td><button className="btn-ara-secondary" type="button" disabled={busy} onClick={() => chooseOrder(order.id)}>Xem đơn</button></td>
            </tr>)}</tbody>
          </table>
          {!filteredOrders.length && <p style={{ padding: '1rem 0' }}>Không có đơn hàng phù hợp.</p>}
        </div>}
        <small>Đơn PENDING cần chốt trước khi cấp QR. Danh sách chỉ gồm đơn mà tài khoản có quyền cấp QR và đơn mẫu.</small>
      </section>
      <OrderDetail order={activeOrder} />
      {activeOrder?.demoOnly && <p style={{ color: 'var(--ara-gold-hover)' }}>Đây là dữ liệu mẫu từ file JSON; QR demo được lưu riêng và không tạo đơn bán hàng trong MongoDB.</p>}
      {activeOrder && <section style={panel}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.75rem' }}>
          {!activeOrder.demoOnly && activeOrder.status === 'PENDING' && <button className="btn-ara-primary" type="button" disabled={busy} onClick={confirm}>Chốt đơn và tạo QR</button>}
          {(activeOrder.demoOnly || ['CONFIRMED', 'PICKING'].includes(activeOrder.status)) && <>
            <button className="btn-ara-primary" type="button" disabled={busy} onClick={issueOne}>Tạo / lấy QR đơn này</button>
            <button className="btn-ara-secondary" type="button" disabled={busy} onClick={replace}>Thu hồi và cấp QR mới</button>
          </>}
        </div>
      </section>}
      {cards.length > 0 && <section className="packing-qr-print" style={panel}>
        <div className="qr-gallery-toolbar" style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <h2>Mã QR đã tạo ({cards.length})</h2>
          <button className="btn-ara-secondary" type="button" onClick={() => window.print()}>In tem các đơn đang hiển thị</button>
          <button className="btn-ara-secondary" type="button" onClick={() => setQrCards({})}>Xóa khỏi màn hình</button>
        </div>
        <div className="qr-gallery" style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginTop: '1rem' }}>
          {cards.map((card) => <article className="qr-gallery-card" key={card.id} style={{ border: '1px solid var(--ara-border)', padding: '1rem', display: 'grid', justifyItems: 'center', gap: '.5rem' }}>
            <strong>{card.orderCode}</strong>
            <img src={card.image} alt={`QR đơn ${card.orderCode}`} width="240" height="240" />
            <small>Chỉ nhân viên đã đăng nhập mới xem được đơn.</small>
          </article>)}
        </div>
        <div className="order-print-labels">{cards.map((card) => <OrderLabel key={card.id} card={card} />)}</div>
      </section>}
    </div>
  );
}
