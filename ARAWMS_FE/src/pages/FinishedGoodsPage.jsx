/*
 * File: FinishedGoodsPage.jsx
 * Author: Duy Anh
 * Date: 2026-10-22
 * Description: Displays stock, cached documents, local drafts, barcode labels, and receiving actions.
 */
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowUpRight, ArrowRightLeft, CirclePlus, RefreshCw } from 'lucide-react';
import { productService } from '../services/productService';
// import { useAuth } from '../hooks/useAuth';
import { getPendingCatalogChanges, subscribeCatalogChanges } from '../services/offlineCatalogSync';
import { finishedGoodsOffline } from '../services/offlineFinishedGoods';
import { printProductLabels } from '../utils/productLabelPrint';
import BulkStockForm from '../components/BulkStockForm';
import PendingReceiptAllocation from '../components/PendingReceiptAllocation';
import FinishedGoodsOverview from '../components/FinishedGoodsOverview';
import '../styles/finishedGoods.css';

// Mock user for testing (NO AUTH REQUIRED)
const mockUser = { _id: '507f1f77bcf86cd799439011', id: '507f1f77bcf86cd799439011', username: 'test', fullName: 'Test User', roles: ['OWNER', 'WAREHOUSE_MANAGER'] };

const panel = { background: '#fff', border: '1px solid var(--ara-border)', borderRadius: 'var(--radius-md)', padding: '1.25rem', boxShadow: 'var(--ara-shadow-sm)' };
const input = { width: '100%', padding: '.65rem', border: '1px solid var(--ara-border)', borderRadius: 8, font: 'inherit' };
const money = (value) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(Number(value) || 0);

/** Displays finished-goods stock and the receive or dispatch workflow.
 * Uses account-scoped cached data for offline viewing while keeping local work separate from server stock. */
export default function FinishedGoodsPage() {
  const location = useLocation();
  // const { user } = useAuth();
  const user = mockUser;
  const ownerId = user?.id || user?._id;
  const [localCatalog, setLocalCatalog] = useState([]);
  const [products, setProducts] = useState([]);
  const [cacheTime, setCacheTime] = useState(null);
  const [pendingConfirmations, setPendingConfirmations] = useState([]);
  const [savedDrafts, setSavedDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [activeTab, setActiveTab] = useState('stock');
  const [movement, setMovement] = useState(null);
  const [quantity, setQuantity] = useState('');
  const [skuId, setSkuId] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [bulkDirection, setBulkDirection] = useState(location.state?.receiveSkuIds?.length ? 'IN' : '');
  const [handoffSkuIds, setHandoffSkuIds] = useState(location.state?.receiveSkuIds || []);
  const [initialProductId, setInitialProductId] = useState('');
  const [recentDocuments, setRecentDocuments] = useState([]);
  const [pendingReceipts, setPendingReceipts] = useState([]);
  const [receiptDetail, setReceiptDetail] = useState(null);
  const [laterReceipt, setLaterReceipt] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const barcodeRefreshCount = useRef(0);
  const movementSku = movement?.product.skus.find((sku) => String(sku.id) === String(skuId));
  const movementUnitCogs = Number(movementSku?.unitCogs || 0);
  const outboundValue = movementUnitCogs * (Number(quantity) || 0);

  /** Shows the last downloaded SKU stock immediately, then refreshes it when reachable.
   * The capture time remains visible because cached stock is not safe for final issue decisions. */
  const loadProducts = async () => {
    if (ownerId) {
      const cached = await finishedGoodsOffline.getCached(ownerId, 'products', 'list').catch(() => null);
      if (cached) { setProducts(cached.value); setCacheTime(cached.updatedAt); setLoading(false); }
    }
    if (!navigator.onLine) { setLoading(false); return; }
    try {
      const response = await productService.list();
      setProducts(response.data.products);
      if (ownerId) { const snapshot = await finishedGoodsOffline.cache(ownerId, 'products', 'list', response.data.products);
        setCacheTime(snapshot.updatedAt); }
      setError('');
    } catch (requestError) {
      const snapshot = ownerId && await finishedGoodsOffline.getCached(ownerId, 'products', 'list').catch(() => null);
      if (snapshot) { setProducts(snapshot.value); setCacheTime(snapshot.updatedAt); }
      else setError(requestError.message);
    }
    finally { setLoading(false); }
  };
  /** Loads recent stock documents and saves the opened list for offline lookup.
   * A network failure falls back to the account's last downloaded list. */
  const loadRecentStockDocuments = async () => {
    if (ownerId) {
      const cached = await finishedGoodsOffline.getCached(ownerId, 'documents', 'recent').catch(() => null);
      if (cached) setRecentDocuments(cached.value);
    }
    if (!navigator.onLine) return;
    try { const response = await productService.recentDocuments(); setRecentDocuments(response.data.documents);
      if (ownerId) await finishedGoodsOffline.cache(ownerId, 'documents', 'recent', response.data.documents); }
    catch (requestError) {
      const snapshot = ownerId && await finishedGoodsOffline.getCached(ownerId, 'documents', 'recent').catch(() => null);
      if (snapshot) setRecentDocuments(snapshot.value);
      else setError(requestError.message);
    }
  };
  /** Refreshes server-side unallocated receipts only while connected. */
  const loadPendingReceipts = async () => {
    if (!navigator.onLine) return;
    try { const response = await productService.pendingReceipts(); setPendingReceipts(response.data.receipts); }
    catch (requestError) { setError(requestError.message); }
  };
  /** Opens a receipt detail and retains it locally for a later disconnected lookup. */
  const showReceiptDetail = async (id) => {
    setDetailLoading(true);
    try { const response = await productService.receiptDetail(id); setReceiptDetail(response.data);
      if (ownerId) await finishedGoodsOffline.cache(ownerId, 'receipt', id, response.data); }
    catch (requestError) {
      const snapshot = ownerId && await finishedGoodsOffline.getCached(ownerId, 'receipt', id).catch(() => null);
      if (snapshot) setReceiptDetail(snapshot.value);
      else setError(requestError.message);
    }
    finally { setDetailLoading(false); }
  };
  // Reset account-specific stock data when the authenticated owner changes.
  useEffect(() => {
    setProducts([]); setRecentDocuments([]); setPendingReceipts([]); setCacheTime(null);
    if (ownerId) { loadProducts(); loadRecentStockDocuments(); loadPendingReceipts(); }
  }, [ownerId]);
  // Show pending and rejected confirmations without treating them as completed documents.
  useEffect(() => {
    if (!ownerId) { setPendingConfirmations([]); return undefined; }
    const refresh = () => finishedGoodsOffline.confirmations(ownerId).then((items) =>
      setPendingConfirmations(items.filter((item) => item.status !== 'DONE'))).catch(() => {});
    refresh();
    const unsubscribe = finishedGoodsOffline.subscribe(refresh);
    window.addEventListener('arawms-finished-goods-synced', refresh);
    return () => { unsubscribe(); window.removeEventListener('arawms-finished-goods-synced', refresh); };
  }, [ownerId]);
  // Offer an explicit way to reopen either local draft after closing or reloading the page.
  useEffect(() => {
    if (!ownerId) { setSavedDrafts({}); return undefined; }
    const refresh = () => Promise.all(['IN', 'OUT'].map((direction) =>
      finishedGoodsOffline.getDraft(ownerId, direction))).then(([inbound, outbound]) =>
      setSavedDrafts({ IN: inbound, OUT: outbound })).catch(() => {});
    refresh();
    return finishedGoodsOffline.subscribe(refresh);
  }, [ownerId]);
  // Refresh stock and documents only after the backend acknowledges a queued confirmation.
  useEffect(() => {
    const refresh = (event) => { if (String(event.detail?.ownerId) === String(ownerId)) {
      loadProducts(); loadRecentStockDocuments(); loadPendingReceipts();
    } };
    window.addEventListener('arawms-finished-goods-synced', refresh);
    return () => window.removeEventListener('arawms-finished-goods-synced', refresh);
  }, [ownerId]);
  useEffect(() => {
    const refreshStock = (event) => {
      if (event.detail?.warehouseType === 'FINISHED_GOODS') {
        loadProducts(); loadRecentStockDocuments(); loadPendingReceipts();
      }
    };
    const refreshCatalog = () => loadProducts();
    window.addEventListener('arawms-finished-goods-realtime', refreshStock);
    window.addEventListener('arawms-product-description-realtime', refreshCatalog);
    return () => {
      window.removeEventListener('arawms-finished-goods-realtime', refreshStock);
      window.removeEventListener('arawms-product-description-realtime', refreshCatalog);
    };
  }, [ownerId]);
  // A synchronized SKU configuration can change the catalog used by the receipt form.
  useEffect(() => {
    const refresh = (event) => { if (String(event.detail?.ownerId) === String(ownerId)) loadProducts(); };
    window.addEventListener('arawms-catalog-synced', refresh);
    return () => window.removeEventListener('arawms-catalog-synced', refresh);
  }, [ownerId]);
  // Keep unsynchronized local catalog records visible, but exclude them from stock operations.
  useEffect(() => {
    if (!ownerId) { setLocalCatalog([]); return undefined; }
    const refresh = () => getPendingCatalogChanges(ownerId).then((items) =>
      setLocalCatalog(items.filter((item) => ['CREATE', 'IMPORT_PRODUCT'].includes(item.operationType) &&
        !['DONE', 'DISCARDED', 'SUPERSEDED'].includes(item.status)))).catch(() => setLocalCatalog([]));
    refresh();
    return subscribeCatalogChanges(refresh);
  }, [ownerId]);
  // Poll only a bounded number of times while barcode images are still being generated.
  useEffect(() => {
    const pending = recentDocuments.some((item) => item.direction === 'IN' && (item.barcodeImagesReady || 0) < item.totalQuantity);
    if (!pending) { barcodeRefreshCount.current = 0; return undefined; }
    if (barcodeRefreshCount.current >= 12) return undefined;
    const timer = window.setTimeout(() => { barcodeRefreshCount.current += 1; loadRecentStockDocuments(); }, 5000);
    return () => window.clearTimeout(timer);
  }, [recentDocuments]);

  /** Opens existing unit labels without creating new units or stock.
   * If the API is unavailable, previously downloaded label data is rendered as local Code 128. */
  const printDocumentBarcodes = async (document) => {
    try {
      const tab = window.open('', '_blank');
      if (!tab) throw new Error('Trình duyệt đang chặn cửa sổ in tem');
      let labels;
      try {
        const response = await productService.documentBarcodes(document.id);
        labels = response.data.labels;
        if (ownerId) await finishedGoodsOffline.cache(ownerId, 'labels', document.id, labels);
        setRecentDocuments((current) => current.map((item) => item.id === document.id
          ? { ...item, barcodeImagesReady: response.data.ready } : item));
      } catch (requestError) {
        const snapshot = ownerId && await finishedGoodsOffline.getCached(ownerId, 'labels', document.id);
        if (!snapshot) throw requestError;
        labels = snapshot.value;
      }
      printProductLabels(labels.map((item) => ({ ...item, imageUrl: navigator.onLine ? item.imageUrl : null })), tab);
    } catch (printError) { setError(printError.message); }
  };

  /** Requests missing barcode images for an existing receipt; it never issues new unit codes. */
  const retryDocumentBarcodeImages = async (document) => {
    try {
      await productService.syncDocumentBarcodes(document.id);
      setNotice(`Đang lưu ảnh mã cho phiếu ${document.documentCode}. Tem vẫn có thể in bằng mã đã cấp.`);
      window.setTimeout(loadRecentStockDocuments, 5000);
    } catch (requestError) { setError(requestError.message); }
  };

  /** Opens an individual stock movement with SKU selection when needed. */
  const openStockMovementForm = (product, direction, selectedSkuId = '') => {
    setMovement({ product, direction });
    setSkuId(selectedSkuId || (product.skus.length === 1 ? product.skus[0].id : ''));
    setQuantity('');
    setNote('');
    setError('');
    setNotice('');
  };

  /** Posts an individual stock movement and refreshes its product totals. */
  const submitStockMovement = async (event) => {
    event.preventDefault();
    if (saving || !movement) return;
    if (movement.product.skus.length > 1 && !skuId) { setError('Vui lòng chọn SKU.'); return; }
    setSaving(true);
    setError('');
    try {
      await productService.moveStock(movement.product.id, {
        direction: movement.direction, quantity: Number(quantity), skuId: skuId || undefined, note,
      });
      setNotice(`Đã ${movement.direction === 'IN' ? 'nhập' : 'xuất'} ${quantity} sản phẩm ${movement.product.productCode}.`);
      setMovement(null);
      await loadProducts();
    } catch (requestError) { setError(requestError.message); }
    finally { setSaving(false); }
  };

  return <main className={`finished-goods-page${bulkDirection === 'IN' ? ' receiving-mode' : ''}`}>
    <nav className="product-breadcrumb" aria-label="Đường dẫn"><Link to="/">Trang chủ</Link><span>/</span><strong>Kho thành phẩm</strong></nav>
    <div className="product-page-head finished-goods-hero">
      <div className="finished-goods-intro"><p className="product-eyebrow">QUẢN LÝ KHO THÀNH PHẨM</p><h1>Kho thành phẩm</h1><p>Theo dõi tồn theo SKU, lượng tạm giữ và tiến độ xếp kệ. Kiểm nhận hàng từ xưởng và tra cứu phiếu nhập, xuất trong cùng một màn hình.</p></div>
      <div className="finished-goods-main-actions">
        <button className="btn-ara-secondary" type="button" disabled={loading} onClick={() => { loadProducts(); loadRecentStockDocuments(); loadPendingReceipts(); }}><RefreshCw size={17} />Làm mới</button>
        <Link to="/warehouse/products/new" state={{ mode: 'existing' }} className="btn-ara-secondary"><ArrowUpRight size={17} />Nhập từ xưởng</Link>
        <button className="btn-ara-secondary" type="button" onClick={() => { setHandoffSkuIds([]); setInitialProductId(''); setBulkDirection('OUT'); setMovement(null); setError(''); setNotice(''); }}><ArrowRightLeft size={17} />Xuất kho hàng loạt</button>
        <Link to="/warehouse/products/new" className="btn-ara-primary"><CirclePlus size={18} />Cấu hình sản phẩm</Link>
      </div>
    </div>
    {bulkDirection === 'IN' && <ol className="product-steps" aria-label="Tiến trình nhập kho"><li><span>01</span>Cấu hình sản phẩm</li><li className="current"><span>02</span>Kiểm nhận</li><li><span>03</span>Phân bổ vị trí</li><li><span>04</span>Xác nhận nhập kho</li></ol>}
    {error && <p className="finished-goods-message error" role="alert">{error}</p>}
    {notice && <p className="finished-goods-message success" role="status">{notice}</p>}
    {bulkDirection !== 'IN' && (savedDrafts.IN || savedDrafts.OUT) && <section style={panel} aria-label="Phiếu đang lưu trên thiết bị">
      <h2>Phiếu đang lưu trên thiết bị</h2>
      {['IN', 'OUT'].filter((direction) => savedDrafts[direction]).map((direction) =>
        <button key={direction} className="btn-ara-secondary" type="button" style={{ marginRight: '.5rem' }}
          onClick={() => { setBulkDirection(direction); setInitialProductId(''); setHandoffSkuIds([]); }}>
          Mở nháp {direction === 'IN' ? 'nhập' : 'xuất'} · {savedDrafts[direction].documentCode || 'Chưa có mã'}
        </button>)}
    </section>}
    {bulkDirection !== 'IN' && cacheTime && <p role="status">Dữ liệu tồn tải lần cuối lúc {new Date(cacheTime).toLocaleString('vi-VN')}. Kiểm tra lại trước khi xác nhận xuất kho.</p>}
    {!navigator.onLine && <p role="status">Mất kết nối — bạn có thể tiếp tục kiểm nhận và lưu trên thiết bị. Đang tìm trong dữ liệu đã tải.</p>}
    {pendingConfirmations.length > 0 && <section style={panel} aria-label="Dữ liệu kho chờ đồng bộ">
      <h2>Dữ liệu chờ đồng bộ</h2>
      {pendingConfirmations.map((item) => <p key={item.operationId}>
        {item.payload.documentCode} · {item.status === 'REVIEW' ? 'Cần kiểm tra' : 'Chờ đối chiếu'}
        {item.lastError && ` · ${item.lastError}`}
      </p>)}
    </section>}

    {bulkDirection && <BulkStockForm key={`${bulkDirection}:${initialProductId}:${handoffSkuIds.join(',')}`} direction={bulkDirection} products={products} ownerId={ownerId} initialSkuIds={handoffSkuIds} initialProductId={initialProductId} onCancel={() => setBulkDirection('')} onQueued={(message) => { setBulkDirection(''); setNotice(message); }} onDone={async (document) => {
      setBulkDirection('');
      setHandoffSkuIds([]);
      setNotice(`Đã lưu phiếu ${document.documentCode}: ${document.lineCount} dòng, tổng ${document.totalQuantity} sản phẩm.`);
      setRecentDocuments((current) => [{ ...document, createdAt: new Date().toISOString(), items: document.items || [] }, ...current]);
      await loadProducts();
      await loadRecentStockDocuments();
      await loadPendingReceipts();
    }} />}

    {localCatalog.length > 0 && <section className="finished-goods-catalog" aria-label="Sản phẩm trên thiết bị chờ đồng bộ">
      <h2>Sản phẩm trên thiết bị</h2>
      <p>Các sản phẩm này chưa được dùng để nhập, xuất kho hoặc chốt đơn.</p>
      <div className="product-table-scroll"><table className="product-table"><thead><tr><th>Tên sản phẩm</th><th>Mã</th><th>Trạng thái</th></tr></thead><tbody>
        {localCatalog.map((item) => <tr key={item.operationId}><td>{item.payload.productName}</td>
          <td>{item.payload.productCode || 'Cấp khi đồng bộ'}</td>
          <td>{item.status === 'REVIEW' ? 'Cần kiểm tra' : item.status === 'SYNCING' ? 'Đang đồng bộ' : 'Chờ đồng bộ'}</td></tr>)}
      </tbody></table></div>
      <Link to="/warehouse/products/new">Xem dữ liệu chờ đồng bộ</Link>
    </section>}
    <div className="fg-tabs" role="tablist" aria-label="Nội dung kho thành phẩm">
      <button type="button" role="tab" aria-selected={activeTab === 'stock'} className={activeTab === 'stock' ? 'active' : ''} onClick={() => setActiveTab('stock')}>Tồn kho theo SKU</button>
      <button type="button" role="tab" aria-selected={activeTab === 'records'} className={activeTab === 'records' ? 'active' : ''} onClick={() => setActiveTab('records')}>Phiếu kho <span>{recentDocuments.length}</span></button>
    </div>
    {activeTab === 'stock' && <FinishedGoodsOverview products={products} recentDocuments={recentDocuments} ownerId={ownerId} loading={loading}
      onIssue={(product, sku) => { setBulkDirection(''); openStockMovementForm(product, 'OUT', sku.id); }} onError={setError} />}
    {activeTab === 'records' && <div className="fg-records">
      <div className="fg-records-head"><div><h2>Phiếu kho gần đây</h2><p>20 phiếu nhập, xuất gần nhất từ hệ thống</p></div><button className="btn-ara-secondary" type="button" onClick={() => { loadRecentStockDocuments(); loadPendingReceipts(); }}><RefreshCw size={17} /> Làm mới</button></div>
      {recentDocuments.length === 0 && <p className="fg-empty">Chưa có phiếu kho gần đây.</p>}
    {recentDocuments.length > 0 && <section className="fg-record-table" style={{ ...panel, marginTop: '0' }} aria-label="Danh sách phiếu kho gần đây">
      <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
        <thead><tr><th style={{ textAlign: 'left' }}>Số chứng từ</th><th>Loại</th><th>Số dòng</th><th>Đạt / xuất</th><th>Trả sửa</th><th>Ngày tạo</th><th /></tr></thead>
        <tbody>{recentDocuments.map((document) => <tr key={document.id}>
          <td style={{ padding: '.6rem', borderBottom: '1px solid var(--ara-border)' }}>{document.documentCode}</td>
          <td style={{ textAlign: 'center' }}>{document.direction === 'IN' ? 'Nhập' : 'Xuất'}</td>
          <td style={{ textAlign: 'center' }}>{document.lineCount}</td>
          <td style={{ textAlign: 'center' }}>{document.totalQuantity}</td>
          <td style={{ textAlign: 'center' }}>{document.direction === 'IN' ? (document.items || []).reduce((sum, item) => sum + (item.repairQty || 0), 0) : '—'}</td>
          <td style={{ textAlign: 'center' }}>{new Date(document.createdAt).toLocaleString('vi-VN')}</td>
          <td>{document.direction === 'IN' && document.totalQuantity > 0 && <div style={{ display: 'grid', gap: '.35rem' }}><small>Ảnh mã: {document.barcodeImagesReady || 0}/{document.totalQuantity}</small><button className="btn-ara-secondary" type="button" onClick={() => printDocumentBarcodes(document)}>In tem barcode</button>{(document.barcodeImagesReady || 0) < document.totalQuantity && <button className="btn-ara-secondary" type="button" onClick={() => retryDocumentBarcodeImages(document)}>Tạo ảnh còn thiếu</button>}</div>}</td>
        </tr>)}</tbody>
      </table></div>
    </section>}

    {recentDocuments.some((item) => item.direction === 'IN') && <section style={{ ...panel, marginTop: '1rem' }}>
      <h2>Tiến độ cất hàng theo phiếu nhập</h2>
      {recentDocuments.filter((item) => item.direction === 'IN').map((item) => <div className="receiving-progress-row" key={item.id}>
        <strong>{item.documentCode}</strong>
        <span>Chưa phân bổ {item.unallocated ?? item.totalQuantity} · Chờ xếp {item.pending || 0} · Đã xếp {item.placed || 0}</span>
        <button className="btn-ara-secondary" type="button" disabled={detailLoading} onClick={() => showReceiptDetail(item.id)}>Chi tiết</button>
      </div>)}
      {detailLoading && <p role="status">Đang tải chi tiết phiếu...</p>}
      {receiptDetail && <div className="receiving-progress-detail">
        <h3>{receiptDetail.document.documentCode}</h3>
        {receiptDetail.progress.map((row) => <div key={row.skuId}>
          <strong>{products.flatMap((product) => product.skus).find((sku) => sku.id === row.skuId)?.skuCode || row.skuId}</strong>
          <span> Chưa phân bổ {row.unallocated} · Chờ xếp {row.pending} · Đã xếp {row.placed}</span>
          {row.rows.map((place, index) => <p key={`${place.allocationCode}-${index}`}>
            {place.location?.rackCode} → Tầng {place.location?.floorNo} → Ô {place.location?.binNo} ({place.location?.locationCode}): chờ {place.pending}, đã xếp {place.placed}
          </p>)}
        </div>)}
      </div>}
    </section>}

    {pendingReceipts.length > 0 &&
      <section style={{ ...panel, marginTop: '1rem' }}>
        <h2>Hàng chờ phân bổ</h2>
        {pendingReceipts.map((item) =>
          <div className="receiving-progress-row" key={item.id}>
            <strong>{item.documentCode}</strong><span>{item.unallocated} chiếc đạt chưa có ô đích</span>
            <button className="btn-ara-secondary" type="button" onClick={() => setLaterReceipt(item)}>Phân bổ vị trí</button>
          </div>)}
      </section>}
    {laterReceipt && <PendingReceiptAllocation key={laterReceipt.id} receipt={laterReceipt} products={products}
      onClose={() => setLaterReceipt(null)} onDone={async () => {
        await loadRecentStockDocuments();
        await loadPendingReceipts();
        await showReceiptDetail(laterReceipt.id);
        setLaterReceipt(null);
      }} />}

    </div>}

    {movement && <div className="fg-movement-backdrop">
      <section className="fg-movement-drawer" role="dialog" aria-modal="true" aria-label={`${movement.direction === 'IN' ? 'Nhập kho' : 'Xuất kho'} ${movement.product.productCode}`}>
        <header className="fg-movement-head"><div><span>{movement.direction === 'IN' ? 'NHẬP KHO' : 'XUẤT KHO'}</span><h2>{movement.direction === 'IN' ? 'Nhập kho' : 'Xuất kho'} · {movement.product.productCode}</h2><p>{movement.product.productName}</p></div><button type="button" aria-label="Đóng bảng xuất kho" onClick={() => {
          if (!window.confirm('Hủy thao tác nhập hoặc xuất kho đang thực hiện?')) return;
          setMovement(null); setError('');
        }}>×</button></header>
      <form className="fg-movement-form" onSubmit={submitStockMovement}>
        {movement.product.skus.length > 0 ? <label>SKU
          <select style={input} required value={skuId} onChange={(event) => setSkuId(event.target.value)}>
            {movement.product.skus.length > 1 && <option value="">Chọn SKU</option>}
            {movement.product.skus.map((sku) => <option key={sku.id} value={sku.id}>{sku.skuCode} · {sku.color} / {sku.size} · khả dụng {sku.availableQty}</option>)}
          </select>
        </label> : <p>Chưa có SKU. Lần nhập đầu sẽ tạo SKU mặc định (FREESIZE).</p>}
        <label>Số lượng *<input style={input} type="number" min="1" max="100000" step="1" required value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label>
        {movement.direction === 'OUT' && <div className="fg-movement-value" aria-live="polite">
          <div><span>Giá vốn / đơn vị</span><strong>{money(movementUnitCogs)}</strong></div>
          <div><span>Giá trị xuất kho</span><strong>{money(outboundValue)}</strong></div>
          <small>Tạm tính theo giá vốn của SKU và số lượng xuất. Sổ giao dịch lưu ảnh chụp giá vốn tại thời điểm xác nhận.</small>
        </div>}
        <label>Ghi chú<input style={input} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Lý do nhập/xuất" /></label>
        {error && <p role="alert" style={{ color: '#a32121' }}>{error}</p>}
        <footer>
          <button className="btn-ara-primary" disabled={saving} type="submit">{saving ? 'Đang lưu...' : 'Xác nhận'}</button>
          <button className="btn-ara-secondary" disabled={saving} type="button" onClick={() => {
            if (!window.confirm('Hủy thao tác nhập hoặc xuất kho đang thực hiện?')) return;
            setMovement(null); setError('');
          }}>Hủy</button>
        </footer>
      </form>
      </section>
    </div>}
  </main>;
}
