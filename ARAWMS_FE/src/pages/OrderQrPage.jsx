/*
 * File: OrderQrPage.jsx
 * Author: Duy Anh
 * Date: 2026-10-19
 * Description: Lists real sales orders and prints their packing QR labels.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { orderQrService } from '../services/orderQrService';
import '../styles/orderQr.css';
import '../styles/orderQrModal.css';
import { useAuth } from '../hooks/useAuth';

const panel = {
  background: '#fff', border: '1px solid var(--ara-border)', borderRadius: 'var(--radius-md)',
  padding: '1.5rem', boxShadow: 'var(--ara-shadow-sm)',
};

const formatMoney = (value) => value == null ? '—' : `${new Intl.NumberFormat('vi-VN').format(value)} đ`;
const formatDate = (value) => value ? new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'short', timeStyle: 'short',
}).format(new Date(value)) : '—';
const statusNames = { PENDING: 'Chờ chốt', CONFIRMED: 'Đã chốt', CONFIRMED_RESERVED: 'Đã giữ hàng',
  PICKING: 'Đang soạn hàng', PACKED: 'Sẵn sàng vận chuyển', HANDED_OVER_CARRIER: 'Đã bàn giao vận chuyển',
  DELIVERED: 'Đã giao', CANCELLED: 'Đã hủy', RETURN_REQUESTED: 'Yêu cầu trả hàng', RETURNED: 'Đã trả hàng' };
const packedStatuses = new Set(['PACKED', 'HANDED_OVER_CARRIER', 'DELIVERED', 'RETURN_REQUESTED', 'RETURNED']);
const statusLabel = (status) => statusNames[status] || status;
const unplacedStockMessage = 'Hàng của SKU còn trong kho nhưng chưa đủ chiếc ở vị trí có thể soạn. Hãy xếp hàng vào kệ, rồi chốt đơn và tạo QR lại.';

function LabelField({ label, value }) {
  if (value == null || value === '') return null;
  return <div className="order-label-field"><span>{label}</span><strong>{value}</strong></div>;
}

/** Formats a printable packing label from order details and its QR image.
 * Omits fields that the selected order has not populated. */
function OrderLabel({ card }) {
  const { order } = card;
  if (!order) return null;
  const shipping = order.shipping;
  const amounts = order.amounts;
  return <article className="order-print-label">
    <header className="order-label-header">
      <div><h2>TEM ĐƠN HÀNG</h2><strong className="order-label-code">{order.orderCode}</strong>
        </div>
      {card.image && <img src={card.image} alt={`QR đơn ${order.orderCode}`} />}
    </header>
    <div className="order-label-fields">
      <LabelField label="Trạng thái" value={statusLabel(order.status)} />
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

/** Lists accessible orders and manages their packing QR labels.
 * Keeps search, selection, printing, and QR issuance in one page workflow. */
export default function OrderQrPage() {
  const { user } = useAuth();
  const canIssue = ['OWNER', 'SELLER', 'WAREHOUSE_STAFF'].includes(user?.roleCode);
  const canConfirm = ['OWNER', 'SELLER'].includes(user?.roleCode);
  const [orders, setOrders] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [activeOrder, setActiveOrder] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const dialogRef = useRef(null);
  const triggerRef = useRef(null);
  const scrollYRef = useRef(0);
  const detailRequestRef = useRef(0);
  const [search, setSearch] = useState('');
  const [packingFilter, setPackingFilter] = useState('all');
  const [qrCards, setQrCards] = useState({});
  // QR of the order open in the detail dialog; single-order actions show it there instead of the bottom gallery.
  const [detailQr, setDetailQr] = useState(null);
  const [detailMessage, setDetailMessage] = useState('');
  const [detailActionError, setDetailActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  /** Reloads visible orders after confirmation or QR changes. */
  const refreshOrders = async () => {
    const response = await orderQrService.listOrdersForQr();
    setOrders(response.data.orders);
  };

  useEffect(() => {
    let live = true;
    orderQrService.listOrdersForQr().then((response) => {
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
    // Packable orders first, then other unpacked orders, then packed; server order (newest first) is kept within each group.
    const rank = (order) => order.canPack ? 0 : packedStatuses.has(order.status) ? 2 : 1;
    return orders.filter((order) => {
      const isPacked = packedStatuses.has(order.status);
      if (packingFilter === 'packed' && !isPacked) return false;
      if (packingFilter === 'unpacked' && isPacked) return false;
      return !term || [order.orderCode, order.id, order.recipientName, order.status, statusLabel(order.status)]
        .some((value) => String(value || '').toLocaleLowerCase().includes(term));
    }).sort((a, b) => rank(a) - rank(b));
  }, [orders, search, packingFilter]);
  const eligibleVisibleIds = filteredOrders.filter((order) => order.canIssueQr).map((order) => order.id);
  const allVisibleSelected = eligibleVisibleIds.length > 0 && eligibleVisibleIds.every((id) => selectedIds.includes(id));
  const cards = Object.values(qrCards);
  const activeCanIssue = orders.some((item) => item.id === activeOrder?.id && item.canIssueQr);

  const closeOrderDetail = () => setDetailOpen(false);

  useEffect(() => {
    if (!detailOpen) return undefined;
    scrollYRef.current = window.scrollY;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusables = () => [...(dialogRef.current?.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])') || [])];
    const onKeyDown = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); closeOrderDetail(); return; }
      if (event.key !== 'Tab') return;
      const nodes = focusables();
      if (!nodes.length) { event.preventDefault(); dialogRef.current?.focus(); return; }
      const first = nodes[0]; const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    requestAnimationFrame(() => (dialogRef.current?.querySelector('.order-detail-close') || dialogRef.current)?.focus());
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      window.scrollTo(0, scrollYRef.current);
      requestAnimationFrame(() => triggerRef.current?.focus());
    };
  }, [detailOpen]);

  /** Loads the selected order while preserving access checks on the server. */
  const selectOrderById = async (id, event) => {
    const requestNumber = ++detailRequestRef.current;
    triggerRef.current = event?.currentTarget || document.activeElement;
    setDetailOpen(true); setDetailLoading(true); setDetailError(''); setActiveOrder(null);
    setDetailQr(null); setDetailMessage(''); setDetailActionError('');
    try {
      const response = await orderQrService.lookupOrderByCode(id);
      if (requestNumber === detailRequestRef.current) setActiveOrder(response.data.order);
    } catch (err) { if (requestNumber === detailRequestRef.current) setDetailError(err.message); }
    finally { if (requestNumber === detailRequestRef.current) setDetailLoading(false); }
  };

  /** Builds a printable card from the order and its issued QR value. */
  const createQrPrintCard = (order, qrValue, qrImageUrl) => ({
    id: order.id, orderCode: order.orderCode, order, qrValue,
    image: qrImageUrl,
  });

  /** Queues the selected order details for printing without issuing a QR. */
  const queueOrderForPrinting = () => {
    if (!activeOrder) return;
    // Carry the QR shown in the dialog so the printed label includes it.
    const card = detailQr && detailQr.id === activeOrder.id
      ? detailQr
      : { id: activeOrder.id, orderCode: activeOrder.orderCode, order: activeOrder, image: null };
    setQrCards((current) => ({ ...current, [card.id]: card.image ? card : current[card.id] || card }));
    setDetailMessage(`Đã thêm ${activeOrder.orderCode} vào danh sách in ở cuối trang.`);
  };

  /** Shows a single-order QR inside the open detail dialog. */
  const showQrInDetail = (order, qrValue, qrImageUrl, text) => {
    const card = createQrPrintCard(order, qrValue, qrImageUrl);
    setDetailQr(card);
    // Keep an already-queued print card in sync with the new QR (e.g. after replacing it).
    setQrCards((current) => (current[card.id] ? { ...current, [card.id]: card } : current));
    setDetailMessage(text);
  };

  const runDetailAction = async (action) => {
    setBusy(true); setDetailActionError(''); setDetailMessage('');
    try { await action(); await refreshOrders(); }
    catch (err) { setDetailActionError(err.code === 'INSUFFICIENT_BATCH_STOCK' ? unplacedStockMessage : err.message); }
    finally { setBusy(false); }
  };

  /** Issues or retrieves the selected order's current QR value. */
  const issueQrForActiveOrder = () => runDetailAction(async () => {
    const response = await orderQrService.getOrderQr(activeOrder.id);
    showQrInDetail(response.data.order, response.data.qrValue, response.data.qrImageUrl,
      `Đã tạo / lấy QR cho ${activeOrder.orderCode}.`);
  });

  /** Issues QR values in batches of 100 and preserves per-order failures. */
  const issueQrForSelectedOrders = async () => {
    if (!selectedIds.length) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const results = [];
      for (let start = 0; start < selectedIds.length; start += 100) {
        const response = await orderQrService.issueQrForOrders(selectedIds.slice(start, start + 100));
        results.push(...response.data.results);
      }
      const successful = results.filter((result) => result.qrValue);
      const generated = successful.map((result) =>
        createQrPrintCard(result.order, result.qrValue, result.qrImageUrl));
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

  /** Confirms the active order after stock reservation, then prepares its QR card. */
  const confirmActiveOrder = () => runDetailAction(async () => {
    const response = await orderQrService.confirmOrder(activeOrder.id);
    setActiveOrder(response.data.order);
    if (response.data.qrValue) {
      showQrInDetail(response.data.order, response.data.qrValue, response.data.qrImageUrl,
        `Đã chốt đơn ${activeOrder.orderCode} và cấp QR.`);
    } else setDetailMessage(`Đã chốt đơn ${activeOrder.orderCode}.`);
  });

  /** Revokes the active order's printed QR and prepares its replacement. */
  const replaceActiveOrderQr = () => {
    if (!window.confirm('QR cũ sẽ ngừng hoạt động. Cấp QR mới cho đơn này?')) return;
    runDetailAction(async () => {
      const response = await orderQrService.replaceOrderQr(activeOrder.id);
      showQrInDetail(response.data.order, response.data.qrValue, response.data.qrImageUrl,
        `Đã thu hồi QR cũ và cấp QR mới cho ${activeOrder.orderCode}.`);
    });
  };

  return (
    <main className="order-qr-page">
      <p className="order-qr-crumb"><Link to="/">Trang chủ</Link><span>/</span>Đơn hàng và QR</p>
      <header className="order-qr-heading"><div><p className="order-qr-eyebrow">QUẢN LÝ ĐƠN HÀNG</p><h1>{canConfirm ? 'Chốt đơn và cấp QR' : 'Xem, in đơn hàng và tạo QR'}</h1><p>Kiểm tra đơn hàng, chốt nội dung và in tem QR phục vụ đóng hàng.</p></div><div className="order-qr-actions"><span className="order-qr-warehouse">Kho Tổng TP.HCM</span></div></header>
      <p className="order-qr-description">Chọn đơn để xem chi tiết, in tem hoặc tạo QR. Có thể chọn nhiều đơn đủ điều kiện để tạo QR hàng loạt.</p>
      {error && <div role="alert" style={{ ...panel, color: 'var(--ara-error)', overflowWrap: 'anywhere' }}>
        {error}{error === unplacedStockMessage && <p style={{ margin: '.75rem 0 0' }}>
          <Link to="/warehouse/putaway">Mở danh sách hàng chờ xếp →</Link>
        </p>}
      </div>}
      {message && <div role="status" style={panel}>{message}</div>}
      <section className="order-qr-card">
        <h2>Danh sách đơn hàng <small>({filteredOrders.length}/{orders.length})</small></h2>
        <div className="order-qr-filters">
          <input aria-label="Tìm đơn hàng" value={search} onChange={(event) => setSearch(event.target.value)}
            placeholder="Tìm theo mã đơn, ID, người nhận hoặc trạng thái" style={{ flex: '1 1 300px', padding: '.7rem', border: '1px solid var(--ara-border)', borderRadius: 6 }} />
          <select aria-label="Lọc theo trạng thái đóng hàng" value={packingFilter} onChange={(event) => {
            setPackingFilter(event.target.value);
            setSelectedIds([]);
          }}
            style={{ padding: '.7rem', border: '1px solid var(--ara-border)', borderRadius: 6 }}>
            <option value="all">Tất cả đơn hàng</option>
            <option value="packed">Đã đóng hàng</option>
            <option value="unpacked">Chưa đóng hàng</option>
          </select>
          <button className="btn-ara-secondary" type="button" disabled={busy || loading} onClick={async () => {
            setBusy(true); setError('');
            try { await refreshOrders(); } catch (err) { setError(err.message); }
            finally { setBusy(false); }
          }}>Tải lại danh sách</button>
          {canIssue && <button className="btn-ara-primary" type="button" disabled={busy || selectedIds.length === 0} onClick={issueQrForSelectedOrders}>
            Tạo / lấy QR hàng loạt ({selectedIds.length})
          </button>}
        </div>
        {loading ? <p>Đang tải đơn hàng...</p> : <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 650 }}>
            <thead><tr style={{ textAlign: 'left', borderBottom: '1px solid var(--ara-border)' }}>
              {canIssue && <th style={{ padding: '.7rem' }}><input type="checkbox" aria-label="Chọn tất cả đơn có thể cấp QR đang hiển thị"
                checked={allVisibleSelected} disabled={!eligibleVisibleIds.length || busy}
                onChange={() => setSelectedIds((current) => allVisibleSelected
                  ? current.filter((id) => !eligibleVisibleIds.includes(id))
                  : [...new Set([...current, ...eligibleVisibleIds])])} /></th>}
              <th>Mã đơn</th><th>Người nhận</th><th>Số món</th><th>Trạng thái</th><th>QR</th><th></th>
            </tr></thead>
            <tbody>{filteredOrders.map((order) => <tr key={order.id} style={{ borderBottom: '1px solid var(--ara-border)' }}>
              {canIssue && <td style={{ padding: '.7rem' }}><input type="checkbox" aria-label={`Chọn đơn ${order.orderCode}`}
                checked={selectedIds.includes(order.id)} disabled={!order.canIssueQr || busy}
                onChange={() => setSelectedIds((current) => current.includes(order.id)
                  ? current.filter((id) => id !== order.id) : [...current, order.id])} /></td>}
              <td>{order.orderCode}</td>
              <td>{order.recipientName || '—'}</td><td>{order.itemCount}</td><td>{statusLabel(order.status)}{order.canPack && <><br /><small style={{ color: 'var(--ara-success)', fontWeight: 600 }}>Sẵn sàng đóng</small></>}</td>
              <td>{order.hasQr ? 'Đã cấp' : 'Chưa cấp'}</td>
              <td><button className="btn-ara-secondary" type="button" disabled={busy} onClick={(event) => selectOrderById(order.id, event)}>Xem đơn</button></td>
            </tr>)}</tbody>
          </table>
          {!filteredOrders.length && <p style={{ padding: '1rem 0' }}>Không có đơn hàng phù hợp.</p>}
        </div>}
        <small>Đơn chờ chốt cần được chốt trước khi cấp QR. Đơn đã đóng xong hiển thị “Sẵn sàng vận chuyển”.</small>
      </section>
      {detailOpen && <div className="order-detail-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeOrderDetail(); }}>
        <section className="order-detail-modal" role="dialog" aria-modal="true" aria-labelledby="order-detail-title" tabIndex={-1} ref={dialogRef}>
          <header className="order-detail-header"><div><h2 id="order-detail-title">Chi tiết đơn {activeOrder ? `#${activeOrder.orderCode}` : ''}</h2>{activeOrder && <span className={`order-detail-status status-${activeOrder.status.toLowerCase()}`}>{statusLabel(activeOrder.status)}</span>}</div><button className="order-detail-close" type="button" aria-label="Đóng chi tiết đơn" onClick={closeOrderDetail}>×</button></header>
          <div className="order-detail-body" aria-live="polite">
            {detailLoading && <p className="order-detail-state">Đang tải chi tiết đơn hàng…</p>}
            {!detailLoading && detailError && <p className="order-detail-error" role="alert">{detailError}</p>}
            {!detailLoading && activeOrder && <>
              {detailActionError && <div role="alert" className="order-detail-error" style={{ overflowWrap: 'anywhere' }}>
                {detailActionError}{detailActionError === unplacedStockMessage && <> <Link to="/warehouse/putaway">Mở danh sách hàng chờ xếp →</Link></>}
              </div>}
              {detailMessage && <p role="status" style={{ margin: '0 0 .75rem', color: 'var(--ara-success, #18794e)', fontWeight: 600 }}>{detailMessage}</p>}
              {detailQr?.id === activeOrder.id && <section className="order-detail-qr" style={{
                display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap',
                border: '1px solid var(--ara-border)', borderRadius: 8, padding: '1rem', marginBottom: '1rem',
              }}>
                {detailQr.image
                  ? <img src={detailQr.image} alt={`QR đơn ${activeOrder.orderCode}`} width="200" height="200" style={{ background: '#fff' }} />
                  : <p>Chưa có ảnh QR.</p>}
                <div style={{ display: 'grid', gap: '.4rem' }}>
                  <h3 style={{ margin: 0 }}>QR đơn {activeOrder.orderCode}</h3>
                  <small style={{ color: 'var(--ara-text-secondary, #66717c)' }}>Quét QR này ở màn Đóng hàng. Chỉ nhân viên đã đăng nhập mới xem được đơn.</small>
                  {detailQr.image && <a href={detailQr.image} target="_blank" rel="noreferrer">Mở ảnh QR</a>}
                </div>
              </section>}
              <section className="order-detail-recipient"><h3>Thông tin người nhận</h3><dl><div><dt>Người nhận</dt><dd>{activeOrder.recipient?.name || activeOrder.recipientName || '—'}</dd></div><div><dt>Điện thoại</dt><dd>{activeOrder.recipient?.phone || '—'}</dd></div><div><dt>Địa chỉ</dt><dd>{activeOrder.recipient?.address || '—'}</dd></div></dl>{activeOrder.note && <p className="order-detail-note"><strong>Ghi chú:</strong> {activeOrder.note}</p>}{activeOrder.packagingVideoUrl && <p className="order-detail-note"><strong>Video đóng hàng:</strong> <a href={activeOrder.packagingVideoUrl} target="_blank" rel="noreferrer">Mở video</a></p>}</section>
              <section className="order-detail-products"><h3>Sản phẩm ({activeOrder.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)} chiếc)</h3><div className="order-detail-table-wrap"><table><thead><tr><th>Sản phẩm</th><th>Màu</th><th>Size</th><th>SKU</th><th>Số lượng</th></tr></thead><tbody>{activeOrder.items.map((item, index) => <tr key={`${item.skuId || item.skuCode}-${index}`}><td>{item.name || '—'}</td><td>{item.color || '—'}</td><td>{item.size || '—'}</td><td>{item.skuCode || item.skuId || '—'}</td><td>{item.quantity}</td></tr>)}</tbody></table></div></section>
              <p className="order-detail-hint">Barcode từng món được nhân viên kho gắn sau khi quét QR đơn.</p>
            </>}
          </div>
          <footer className="order-detail-footer"><button className="btn-ara-secondary" type="button" onClick={closeOrderDetail}>Đóng</button><div className="order-detail-actions">{activeOrder && <button className="btn-ara-secondary" type="button" disabled={busy} onClick={queueOrderForPrinting}>Thêm đơn vào danh sách in</button>}{canConfirm && activeOrder?.status === 'PENDING' && <button className="btn-ara-primary" type="button" disabled={busy} onClick={confirmActiveOrder}>Chốt đơn và tạo QR</button>}{canIssue && activeCanIssue && <><button className="btn-ara-primary" type="button" disabled={busy} onClick={issueQrForActiveOrder}>Tạo / lấy QR đơn này</button><button className="btn-ara-secondary" type="button" disabled={busy} onClick={replaceActiveOrderQr}>Thu hồi và cấp QR mới</button></>}</div></footer>
        </section>
      </div>}
      {cards.length > 0 && <section className="packing-qr-print" style={panel}>
        <div className="qr-gallery-toolbar" style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <h2>Đơn chờ in ({cards.length})</h2>
          <button className="btn-ara-secondary" type="button" onClick={() => window.print()}>In tem các đơn đang hiển thị</button>
          <button className="btn-ara-secondary" type="button" onClick={() => {
            if (window.confirm('Xóa các thẻ QR đang hiển thị khỏi màn hình?')) setQrCards({});
          }}>Xóa khỏi màn hình</button>
        </div>
        <div className="qr-gallery" style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginTop: '1rem' }}>
          {cards.map((card) => <article className="qr-gallery-card" key={card.id} style={{ border: '1px solid var(--ara-border)', padding: '1rem', display: 'grid', justifyItems: 'center', gap: '.5rem' }}>
            <strong>{card.orderCode}</strong>
            {card.image && <img src={card.image} alt={`QR đơn ${card.orderCode}`} width="240" height="240" />}
            <small>{card.image ? 'Chỉ nhân viên đã đăng nhập mới xem được đơn.' : 'Tem đơn hàng không có mã QR.'}</small>
          </article>)}
        </div>
        <div className="order-print-labels">{cards.map((card) => <OrderLabel key={card.id} card={card} />)}</div>
      </section>}
    </main>
  );
}
