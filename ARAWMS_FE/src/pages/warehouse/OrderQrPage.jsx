/*
 * File: OrderQrPage.jsx
 * Author: Duy Anh
 * Date: 2026-10-19
 * Description: Lists real sales orders and prints their packing QR labels.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Code128Reader } from '@zxing/library';
import { Link } from 'react-router-dom';
import { orderQrService } from '../../services/orderQrService';
import '../../styles/orderQr.css';
import '../../styles/orderQrModal.css';
import { useAuth } from '../../hooks/useAuth';
import { formatOrderMoney as formatMoney } from '../../utils/warehouseFormat';

const panel = {
  background: '#fff', border: '1px solid var(--ara-border)', borderRadius: 'var(--radius-md)',
  padding: '1.5rem', boxShadow: 'var(--ara-shadow-sm)',
};

const statusNames = { PENDING: 'Chờ chốt', CONFIRMED: 'Đã chốt', CONFIRMED_RESERVED: 'Đã giữ hàng',
  PICKING: 'Đang soạn hàng', PACKED: 'Sẵn sàng vận chuyển', HANDED_OVER_CARRIER: 'Đã bàn giao vận chuyển',
  DELIVERED: 'Đã giao', CANCELLED: 'Đã hủy', RETURN_REQUESTED: 'Yêu cầu trả hàng', RETURNED: 'Đã hoàn về kho', RETURN_COMPLETED: 'Hoàn thành công' };
const packedStatuses = new Set(['PACKED', 'HANDED_OVER_CARRIER', 'DELIVERED', 'RETURN_REQUESTED', 'RETURNED', 'RETURN_COMPLETED']);
const statusLabel = (status) => statusNames[status] || status;
const unplacedStockMessage = 'Hàng của SKU còn trong kho nhưng chưa đủ chiếc ở vị trí có thể soạn. Hãy xếp hàng vào kệ, rồi chốt đơn và tạo QR lại.';

const paymentMethodNames = { COD: 'Thu tiền khi giao (COD)', BANK_TRANSFER: 'Đã chuyển khoản', CASH: 'Tiền mặt', POS_CARD: 'Thẻ' };
const formatNumber = (value) => (value == null ? '—' : `${new Intl.NumberFormat('vi-VN').format(value)} đ`);
const labelTime = (value) => (value ? new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)) : null);
const labelDate = (value) => (value ? new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value)) : null);

/** Code 128-B barcode drawn as SVG bars (quiet zone included); the label prints the text separately. */
function Code128Barcode({ value }) {
  if (!value || !/^[\x20-\x7E]{1,40}$/.test(value)) return null;
  const patterns = Code128Reader.CODE_PATTERNS;
  const codes = [104, ...Array.from(value, (char) => char.charCodeAt(0) - 32)];
  // Code 128 weights each data symbol by its one-based position after the start code.
  const checksum = codes.reduce((sum, code, index) => sum + (index === 0 ? code : code * index), 0) % 103;
  codes.push(checksum, 106);
  const quiet = 10;
  let x = quiet;
  const bars = [];
  codes.flatMap((code) => Array.from(patterns[code])).forEach((run, index) => {
    if (index % 2 === 0) bars.push(<rect key={index} x={x} y="0" width={run} height="1" />);
    x += run;
  });
  return <svg className="order-label-barcode" viewBox={`0 0 ${x + quiet} 1`} preserveAspectRatio="none"
    role="img" aria-label={`Mã vạch ${value}`}><g fill="#000">{bars}</g></svg>;
}

/** Sender / recipient box: "Bên gửi" or "Bên nhận", then name - phone and the full address. */
function LabelParty({ title, party }) {
  return <section className="order-label-box order-label-party">
    <span className="order-label-party-title">{title}</span>
    <strong>{party ? [party.name || '—', party.phone].filter(Boolean).join(' - ') : '—'}</strong>
    {party?.address && <p>{party.address}</p>}
  </section>;
}

/** Printable 60 × 95 mm shipping label laid out like the carrier sticker: sender, recipient, waybill barcode,
 * order code and QR with time and amount to collect, delivery area, customer note, item table and signature.
 * Only fields ARAWMS has at print time are shown; missing optional values are omitted. */
function OrderLabel({ card }) {
  const { order } = card;
  if (!order) return null;
  const shipping = order.shipping;
  const amounts = order.amounts;
  const printedAt = order.confirmedAt || order.createdAt;
  const barcodeValue = shipping?.waybillCode || order.orderCode;
  // Shipper thu đúng cod_amount đã gửi GHN; đơn tại quầy thì in tổng đơn.
  const collectAmount = shipping ? amounts?.codAmount : amounts?.total;
  const lineTotal = (item) => item.lineTotal ?? (item.unitPrice != null ? Number(item.unitPrice) * Number(item.quantity || 0) : null);
  return <article className="order-print-label">
    <LabelParty title="Bên gửi" party={order.sender} />
    <LabelParty title="Bên nhận" party={order.recipient} />
    <div className="order-label-main">
      <div className="order-label-main-left">
        <Code128Barcode value={barcodeValue} />
        <span className="order-label-barcode-text">{barcodeValue}</span>
        {shipping && !shipping.waybillCode && <span className="order-label-muted">Chưa có vận đơn {shipping.carrierName}</span>}
        {shipping?.waybillCode && <span className="order-label-carrier">{shipping.carrierName}</span>}
        <strong className="order-label-code">{order.orderCode}</strong>
        {order.externalOrderNo && <span className="order-label-muted">Mã sàn: {order.externalOrderNo}</span>}
        <span className="order-label-payment">{paymentMethodNames[order.paymentMethod] || order.paymentMethod}</span>
      </div>
      <div className="order-label-main-right">
        {card.image ? <img src={card.image} alt={`QR đơn ${order.orderCode}`} />
          : <div className="order-label-noqr">Chưa cấp QR</div>}
        {printedAt && <span>{labelTime(printedAt)}</span>}
        {printedAt && <span>{labelDate(printedAt)}</span>}
        {collectAmount != null && <strong className="order-label-amount">{formatMoney(collectAmount)}</strong>}
      </div>
    </div>
    {order.recipient?.area && <p className="order-label-area">{order.recipient.area}</p>}
    <section className="order-label-box order-label-table-box">
      <div className="order-label-note">
        <span className="order-label-note-title">Ghi chú khách hàng</span>
        {order.note && <p>{order.note}</p>}
        {shipping?.requiredNote && <p>{shipping.requiredNote}</p>}
        <p>CÓ VẤN ĐỀ GÌ GỌI SHOP. CẢM ƠN SHIPPER NHIỀU Ạ</p>
      </div>
      <table className="order-label-items"><thead><tr><th>STT</th><th>Mã mẫu</th><th>SL</th><th>Đơn giá</th><th>Chiết khấu</th><th>Thành tiền</th></tr></thead>
        <tbody>{order.items.map((item, index) => <tr key={`${item.skuId || item.skuCode}-${index}`}>
          <td>{index + 1}</td>
          <td>{item.skuCode || item.skuId || '—'}</td>
          <td>{item.quantity}</td>
          <td>{formatNumber(item.unitPrice)}</td>
          <td>{formatNumber(item.discountAmount ?? 0)}</td>
          <td>{formatNumber(lineTotal(item))}</td>
        </tr>)}</tbody>
      </table>
      <footer className="order-label-confirm">
        <span>Kí tên</span><span>Xác nhận hàng nguyên vẹn</span><span>1/1</span>
      </footer>
    </section>
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
    // Strictly newest to oldest by creation time; the "Sẵn sàng đóng" badge marks packable orders.
    const time = (order) => new Date(order.createdAt || 0).getTime() || 0;
    return orders.filter((order) => {
      const isPacked = packedStatuses.has(order.status);
      if (packingFilter === 'packed' && !isPacked) return false;
      if (packingFilter === 'unpacked' && isPacked) return false;
      return !term || [order.orderCode, order.id, order.recipientName, order.status, statusLabel(order.status)]
        .some((value) => String(value || '').toLocaleLowerCase().includes(term));
    }).sort((a, b) => time(b) - time(a));
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

  /** Queues the order label without issuing a QR (orders that cannot get a QR right now). */
  const queueOrderForPrinting = () => {
    if (!activeOrder) return;
    // Carry the QR shown in the dialog so the printed label includes it.
    const card = detailQr && detailQr.id === activeOrder.id
      ? detailQr
      : { id: activeOrder.id, orderCode: activeOrder.orderCode, order: activeOrder, image: null };
    setQrCards((current) => ({ ...current, [card.id]: card.image ? card : current[card.id] || card }));
    setDetailMessage(`Đã thêm tem ${activeOrder.orderCode} vào danh sách in ở cuối trang.`);
  };

  /** Shows the order label (with its QR) in the open dialog and adds it to the print list. */
  const showLabelInDetail = (order, qrValue, qrImageUrl, text) => {
    const card = createQrPrintCard(order, qrValue, qrImageUrl);
    setDetailQr(card);
    setQrCards((current) => ({ ...current, [card.id]: card }));
    setDetailMessage(text);
  };

  /** Opens the browser print dialog after the detail dialog has closed.
   * The body class switches print output to the 60 × 95 mm label sheet only. */
  const printLabels = () => setTimeout(() => {
    document.body.classList.add('printing-order-labels');
    const cleanup = () => {
      document.body.classList.remove('printing-order-labels');
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    window.print();
  }, 0);

  const runDetailAction = async (action) => {
    setBusy(true); setDetailActionError(''); setDetailMessage('');
    try { await action(); await refreshOrders(); }
    catch (err) { setDetailActionError(err.code === 'INSUFFICIENT_BATCH_STOCK' ? unplacedStockMessage : err.message); }
    finally { setBusy(false); }
  };

  /** Issues or retrieves the order QR and builds its full shipping label. */
  const issueLabelForActiveOrder = () => runDetailAction(async () => {
    const response = await orderQrService.getOrderQr(activeOrder.id);
    showLabelInDetail(response.data.order, response.data.qrValue, response.data.qrImageUrl,
      `Đã tạo / lấy tem đơn ${activeOrder.orderCode} và thêm vào danh sách in.`);
  });

  /** Issues labels (QR + order details) in batches of 100 and preserves per-order failures. */
  const issueLabelsForSelectedOrders = async () => {
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
      setMessage(`Đã tạo / lấy ${successful.length} tem trên ${results.length} đơn đã chọn. Tem nằm trong danh sách in ở cuối trang.`);
      const failed = results.filter((result) => result.error);
      if (failed.length) setError(`Chưa tạo được tem: ${failed.map((result) => `${result.orderCode || result.id} (${result.error})`).join(', ')}`);
      await refreshOrders();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  /** Confirms the active order after stock reservation, then prepares its QR card. */
  const confirmActiveOrder = () => runDetailAction(async () => {
    const response = await orderQrService.confirmOrder(activeOrder.id);
    setActiveOrder(response.data.order);
    if (response.data.qrValue) {
      showLabelInDetail(response.data.order, response.data.qrValue, response.data.qrImageUrl,
        `Đã chốt đơn ${activeOrder.orderCode}, tạo tem và thêm vào danh sách in.`);
    } else setDetailMessage(`Đã chốt đơn ${activeOrder.orderCode}.`);
  });

  /** Revokes the QR on the printed label and builds a replacement label. */
  const replaceActiveOrderLabel = () => {
    if (!window.confirm('QR trên tem cũ sẽ ngừng hoạt động. Tạo tem mới cho đơn này?')) return;
    runDetailAction(async () => {
      const response = await orderQrService.replaceOrderQr(activeOrder.id);
      showLabelInDetail(response.data.order, response.data.qrValue, response.data.qrImageUrl,
        `Đã thu hồi tem cũ và tạo tem mới cho ${activeOrder.orderCode}. Hãy in lại tem.`);
    });
  };

  return (
    <main className="order-qr-page">
      <p className="order-qr-crumb"><Link to="/">Trang chủ</Link><span>/</span>Đơn hàng và tem</p>
      <header className="order-qr-heading"><div><p className="order-qr-eyebrow">QUẢN LÝ ĐƠN HÀNG</p><h1>{canConfirm ? 'Chốt đơn và tạo tem đơn hàng' : 'Xem đơn, tạo và in tem đơn hàng'}</h1><p>Kiểm tra đơn hàng, chốt nội dung và in tem đơn hàng (kèm QR) để dán lên kiện.</p></div><div className="order-qr-actions"><span className="order-qr-warehouse">Kho Tổng TP.HCM</span></div></header>
      <p className="order-qr-description">Chọn đơn để xem chi tiết và tạo tem. Có thể chọn nhiều đơn đủ điều kiện để tạo tem hàng loạt rồi in một lần.</p>
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
          {canIssue && <button className="btn-ara-primary" type="button" disabled={busy || selectedIds.length === 0} onClick={issueLabelsForSelectedOrders}>
            Tạo / lấy tem hàng loạt ({selectedIds.length})
          </button>}
        </div>
        {loading ? <p>Đang tải đơn hàng...</p> : <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 650 }}>
            <thead><tr style={{ textAlign: 'left', borderBottom: '1px solid var(--ara-border)' }}>
              {canIssue && <th style={{ padding: '.7rem' }}><input type="checkbox" aria-label="Chọn tất cả đơn có thể tạo tem đang hiển thị"
                checked={allVisibleSelected} disabled={!eligibleVisibleIds.length || busy}
                onChange={() => setSelectedIds((current) => allVisibleSelected
                  ? current.filter((id) => !eligibleVisibleIds.includes(id))
                  : [...new Set([...current, ...eligibleVisibleIds])])} /></th>}
              <th>Mã đơn</th><th>Người nhận</th><th>Số món</th><th>Trạng thái</th><th>Tem</th><th></th>
            </tr></thead>
            <tbody>{filteredOrders.map((order) => <tr key={order.id} style={{ borderBottom: '1px solid var(--ara-border)' }}>
              {canIssue && <td style={{ padding: '.7rem' }}><input type="checkbox" aria-label={`Chọn đơn ${order.orderCode}`}
                checked={selectedIds.includes(order.id)} disabled={!order.canIssueQr || busy}
                onChange={() => setSelectedIds((current) => current.includes(order.id)
                  ? current.filter((id) => id !== order.id) : [...current, order.id])} /></td>}
              <td>{order.orderCode}</td>
              <td>{order.recipientName || '—'}</td><td>{order.itemCount}</td><td>{statusLabel(order.status)}{order.canPack && <><br /><small style={{ color: 'var(--ara-success)', fontWeight: 600 }}>Sẵn sàng đóng</small></>}</td>
              <td>{order.hasQr ? 'Đã tạo' : 'Chưa tạo'}</td>
              <td><button className="btn-ara-secondary" type="button" disabled={busy} onClick={(event) => selectOrderById(order.id, event)}>Xem đơn</button></td>
            </tr>)}</tbody>
          </table>
          {!filteredOrders.length && <p style={{ padding: '1rem 0' }}>Không có đơn hàng phù hợp.</p>}
        </div>}
        <small>Đơn chờ chốt cần được chốt trước khi tạo tem. Đơn đã đóng xong hiển thị “Sẵn sàng vận chuyển”.</small>
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
              {detailQr?.id === activeOrder.id && <section className="order-detail-label-preview">
                <div className="order-detail-label-head">
                  <h3>Tem đơn {activeOrder.orderCode}</h3>
                  <small>QR trên tem dùng để quét ở màn Đóng hàng; chỉ nhân viên đã đăng nhập mới xem được đơn.</small>
                  <div className="order-detail-label-actions">
                    <button className="btn-ara-primary" type="button" onClick={() => { closeOrderDetail(); printLabels(); }}>In tem ({cards.length})</button>
                    {detailQr.image && <a href={detailQr.image} download={`QR-${activeOrder.orderCode}.svg`}>Tải ảnh QR</a>}
                  </div>
                </div>
                <div className="order-label-screen"><OrderLabel card={detailQr} /></div>
              </section>}
              <section className="order-detail-recipient"><h3>Thông tin người nhận</h3><dl><div><dt>Người nhận</dt><dd>{activeOrder.recipient?.name || activeOrder.recipientName || '—'}</dd></div><div><dt>Điện thoại</dt><dd>{activeOrder.recipient?.phone || '—'}</dd></div><div><dt>Địa chỉ</dt><dd>{activeOrder.recipient?.address || '—'}</dd></div></dl>{activeOrder.note && <p className="order-detail-note"><strong>Ghi chú:</strong> {activeOrder.note}</p>}{activeOrder.packagingVideoUrl && <p className="order-detail-note"><strong>Video đóng hàng:</strong> <a href={activeOrder.packagingVideoUrl} target="_blank" rel="noreferrer">Mở video</a></p>}</section>
              <section className="order-detail-products"><h3>Sản phẩm ({activeOrder.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)} chiếc)</h3><div className="order-detail-table-wrap"><table><thead><tr><th>Sản phẩm</th><th>Màu</th><th>Size</th><th>SKU</th><th>Số lượng</th></tr></thead><tbody>{activeOrder.items.map((item, index) => <tr key={`${item.skuId || item.skuCode}-${index}`}><td>{item.name || '—'}</td><td>{item.color || '—'}</td><td>{item.size || '—'}</td><td>{item.skuCode || item.skuId || '—'}</td><td>{item.quantity}</td></tr>)}</tbody></table></div></section>
              <p className="order-detail-hint">Barcode từng món được nhân viên kho gắn sau khi quét QR đơn.</p>
            </>}
          </div>
          <footer className="order-detail-footer"><button className="btn-ara-secondary" type="button" onClick={closeOrderDetail}>Đóng</button><div className="order-detail-actions">{activeOrder && !activeCanIssue && activeOrder.status !== 'PENDING' && <button className="btn-ara-secondary" type="button" disabled={busy} onClick={queueOrderForPrinting}>Thêm tem vào danh sách in</button>}{canConfirm && activeOrder?.status === 'PENDING' && <button className="btn-ara-primary" type="button" disabled={busy} onClick={confirmActiveOrder}>Chốt đơn và tạo tem</button>}{canIssue && activeCanIssue && <><button className="btn-ara-primary" type="button" disabled={busy} onClick={issueLabelForActiveOrder}>Tạo / lấy tem đơn này</button><button className="btn-ara-secondary" type="button" disabled={busy} onClick={replaceActiveOrderLabel}>Thu hồi và tạo tem mới</button></>}</div></footer>
        </section>
      </div>}
      {cards.length > 0 && <section className="packing-qr-print" style={panel}>
        <div className="qr-gallery-toolbar" style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <h2>Tem chờ in ({cards.length})</h2>
          <button className="btn-ara-primary" type="button" onClick={printLabels}>In {cards.length} tem</button>
          <button className="btn-ara-secondary" type="button" onClick={() => {
            if (window.confirm('Bỏ tất cả tem khỏi danh sách in?')) setQrCards({});
          }}>Xóa danh sách in</button>
        </div>
        <div className="order-print-labels">{cards.map((card) => <div className="order-label-slot" key={card.id}>
          <button className="order-label-remove" type="button" aria-label={`Bỏ tem ${card.orderCode} khỏi danh sách in`}
            onClick={() => setQrCards((current) => { const next = { ...current }; delete next[card.id]; return next; })}>×</button>
          <OrderLabel card={card} />
        </div>)}</div>
      </section>}
      {cards.length > 0 && createPortal(<div className="order-label-print-root" aria-hidden="true">
        {cards.map((card) => <div className="order-label-page" key={card.id}><OrderLabel card={card} /></div>)}
      </div>, document.body)}
    </main>
  );
}
