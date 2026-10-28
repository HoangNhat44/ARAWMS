/*
 * File: FinishedGoodsPage.jsx
 * Author: Duy Anh
 * Date: 2026-10-22
 * Description: Displays finished goods stock and receiving actions.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowDownToLine, ArrowUpRight, ArrowRightLeft, Box, CirclePlus, ClipboardList, Filter, LayoutGrid, MoreVertical, Search, Tag } from 'lucide-react';
import { productService } from '../services/productService';
import BulkStockForm from '../components/BulkStockForm';
import PendingReceiptAllocation from '../components/PendingReceiptAllocation';
import '../styles/finishedGoods.css';

const panel = { background: '#fff', border: '1px solid var(--ara-border)', borderRadius: 'var(--radius-md)', padding: '1.25rem', boxShadow: 'var(--ara-shadow-sm)' };
const input = { width: '100%', padding: '.65rem', border: '1px solid var(--ara-border)', borderRadius: 8, font: 'inherit' };

/** Displays finished-goods stock and the receive or dispatch workflow.
 * Coordinates product selection, stock documents, and navigation from configuration. */
export default function FinishedGoodsPage() {
  const location = useLocation();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);
  const [movement, setMovement] = useState(null);
  const [openActionId, setOpenActionId] = useState(null);
  const movementRef = useRef(null);
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

  /** Refreshes products and SKU stock totals after a movement. */
  const loadProducts = async () => {
    try {
      const response = await productService.list();
      setProducts(response.data.products);
      setError('');
    } catch (requestError) { setError(requestError.message); }
    finally { setLoading(false); }
  };
  /** Loads recent receiving documents so their physical unit labels can be reprinted. */
  const loadRecentStockDocuments = async () => {
    try { const response = await productService.recentDocuments(); setRecentDocuments(response.data.documents); }
    catch (requestError) { setError(requestError.message); }
  };
  const loadPendingReceipts = async () => {
    try { const response = await productService.pendingReceipts(); setPendingReceipts(response.data.receipts); }
    catch (requestError) { setError(requestError.message); }
  };
  const showReceiptDetail = async (id) => {
    setDetailLoading(true);
    try { const response = await productService.receiptDetail(id); setReceiptDetail(response.data); }
    catch (requestError) { setError(requestError.message); }
    finally { setDetailLoading(false); }
  };
  useEffect(() => { loadProducts(); loadRecentStockDocuments(); loadPendingReceipts(); }, []);
  useEffect(() => {
    const pending = recentDocuments.some((item) => item.direction === 'IN' && (item.barcodeImagesReady || 0) < item.totalQuantity);
    if (!pending) { barcodeRefreshCount.current = 0; return undefined; }
    if (barcodeRefreshCount.current >= 12) return undefined;
    const timer = window.setTimeout(() => { barcodeRefreshCount.current += 1; loadRecentStockDocuments(); }, 5000);
    return () => window.clearTimeout(timer);
  }, [recentDocuments]);
  useEffect(() => { if (movement) movementRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [movement]);
  useEffect(() => {
    if (!openActionId) return undefined;
    const closeActions = (event) => {
      if (event.type === 'keydown' && event.key === 'Escape') setOpenActionId(null);
      if (event.type === 'pointerdown' && !event.target.closest('.finished-goods-action-wrap')) setOpenActionId(null);
    };
    document.addEventListener('keydown', closeActions);
    document.addEventListener('pointerdown', closeActions);
    return () => { document.removeEventListener('keydown', closeActions); document.removeEventListener('pointerdown', closeActions); };
  }, [openActionId]);

  /** Opens a printable page for the individual barcodes issued by a receipt. */
  const printDocumentBarcodes = async (document) => {
    try {
      const tab = window.open('', '_blank');
      if (!tab) throw new Error('Trình duyệt đang chặn cửa sổ in tem');
      const response = await productService.documentBarcodes(document.id);
      const { printProductLabels } = await import('../utils/productLabelPrint');
      printProductLabels(response.data.labels, tab);
      setRecentDocuments((current) => current.map((item) => item.id === document.id
        ? { ...item, barcodeImagesReady: response.data.ready } : item));
    } catch (printError) { setError(printError.message); }
  };

  /** Requeues only images still missing from Cloudinary without issuing new stock barcodes. */
  const retryDocumentBarcodeImages = async (document) => {
    try {
      await productService.syncDocumentBarcodes(document.id);
      setNotice(`Đang lưu ảnh mã cho phiếu ${document.documentCode}. Tem vẫn có thể in bằng mã đã cấp.`);
      window.setTimeout(loadRecentStockDocuments, 5000);
    } catch (requestError) { setError(requestError.message); }
  };

  const categories = useMemo(() => [...new Set(products.map((item) => item.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi')), [products]);
  const visible = useMemo(() => products.filter((item) => {
    const matchesSearch = `${item.productCode} ${item.productName} ${item.sampleCode} ${item.category} ${(item.skus || []).map((sku) => sku.skuCode).join(' ')}`.toLocaleLowerCase('vi-VN').includes(search.trim().toLocaleLowerCase('vi-VN'));
    const stockStatus = !item.isActive ? 'draft' : item.onHandQty <= 0 ? 'empty' : 'active';
    return matchesSearch && (!categoryFilter || item.category === categoryFilter) && (!statusFilter || stockStatus === statusFilter);
  }), [products, search, categoryFilter, statusFilter]);
  const pageSize = 5;
  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageProducts = visible.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const totalStock = products.reduce((sum, product) => sum + (product.onHandQty || 0), 0);
  const outOfStockCount = products.filter((product) => product.isActive && product.onHandQty <= 0).length;

  /** Downloads the currently filtered catalog using values already loaded from the product API. */
  const exportProducts = () => {
    const columns = ['Mã sản phẩm', 'Tên sản phẩm', 'Mã mẫu', 'Danh mục', 'Trạng thái', 'Tồn kho', 'Đã giữ'];
    const rows = visible.map((product) => [product.productCode, product.productName, product.sampleCode, product.category, product.isActive ? 'Đang sử dụng' : 'Nháp', product.onHandQty, product.reservedQty]);
    const csv = '\uFEFF' + [columns, ...rows].map((row) => row.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'danh-muc-san-pham.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  /** Opens an individual stock movement with SKU selection when needed. */
  const openStockMovementForm = (product, direction) => {
    setOpenActionId(null);
    setMovement({ product, direction });
    setSkuId(product.skus.length === 1 ? product.skus[0].id : '');
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

  return <main className="product-workspace finished-goods-page">
    <nav className="product-breadcrumb" aria-label="Đường dẫn"><Link to="/">Trang chủ</Link><span>/</span><span>Kho thành phẩm</span><span>/</span><strong>Danh mục &amp; nhập xuất</strong></nav>
    <div className="product-page-head finished-goods-hero">
      <div className="finished-goods-intro"><p className="product-eyebrow">HỆ THỐNG VẬN HÀNH BOUTIQUE</p><h1>Kho thành phẩm</h1><p>Quản lý mẫu, biến thể và kiểm nhận từng đợt hàng từ xưởng. Theo dõi trạng thái tồn kho thực tế và lượng hàng đã được giữ cho đơn đặt trước.</p></div>
      <div className="finished-goods-main-actions">
        <Link to="/warehouse/products/new" state={{ mode: 'existing' }} className="btn-ara-secondary"><ArrowUpRight size={17} />Nhập từ xưởng</Link>
        <button className="btn-ara-secondary" type="button" onClick={() => { setHandoffSkuIds([]); setInitialProductId(''); setBulkDirection('OUT'); setMovement(null); setError(''); setNotice(''); }}><ArrowRightLeft size={17} />Xuất kho hàng loạt</button>
        <Link to="/warehouse/products/new" className="btn-ara-primary"><CirclePlus size={18} />Cấu hình sản phẩm</Link>
      </div>
    </div>

    {bulkDirection === 'IN' && <ol className="product-steps" aria-label="Tiến trình nhập kho"><li><span>01</span>Cấu hình sản phẩm</li><li className="current"><span>02</span>Kiểm nhận</li><li><span>03</span>Phân bổ vị trí</li><li><span>04</span>Xác nhận nhập kho</li></ol>}
    {bulkDirection && <BulkStockForm key={`${bulkDirection}:${initialProductId}:${handoffSkuIds.join(',')}`} direction={bulkDirection} products={products} initialSkuIds={handoffSkuIds} initialProductId={initialProductId} onCancel={() => setBulkDirection('')} onDone={async (document) => {
      setBulkDirection('');
      setHandoffSkuIds([]);
      setNotice(`Đã lưu phiếu ${document.documentCode}: ${document.lineCount} dòng, tổng ${document.totalQuantity} sản phẩm.`);
      setRecentDocuments((current) => [{ ...document, createdAt: new Date().toISOString(), items: document.items || [] }, ...current]);
      await loadProducts();
      await loadRecentStockDocuments();
      await loadPendingReceipts();
    }} />}

    <section className="finished-goods-catalog" aria-labelledby="finished-goods-title">
      <div className="finished-goods-catalog-head">
        <div><h2 id="finished-goods-title">Danh mục sản phẩm</h2><p>Hiển thị {visible.length} sản phẩm trong kho hiện tại</p></div>
        <div className="finished-goods-tools">
          <button type="button" onClick={() => setShowFilters((open) => !open)} aria-expanded={showFilters}><Filter size={17} />Lọc nâng cao</button>
          <button type="button" onClick={exportProducts} disabled={loading || visible.length === 0} title="Tải tệp CSV mở bằng Excel"><ArrowDownToLine size={17} />Xuất Excel</button>
        </div>
      </div>
      <div className="finished-goods-search-area">
        <label htmlFor="finished-goods-search">Tìm sản phẩm</label>
        <div className="finished-goods-search-box"><Search size={18} /><input id="finished-goods-search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Mã, tên, mã mẫu hoặc danh mục" /></div>
        {showFilters && <div className="finished-goods-filters">
          <label>Danh mục<select value={categoryFilter} onChange={(event) => { setCategoryFilter(event.target.value); setPage(1); }}><option value="">Tất cả danh mục</option>{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
          <label>Trạng thái<select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}><option value="">Tất cả trạng thái</option><option value="active">Đang sử dụng</option><option value="empty">Hết hàng</option><option value="draft">Nháp</option></select></label>
          <button type="button" onClick={() => { setCategoryFilter(''); setStatusFilter(''); setPage(1); }}>Xóa bộ lọc</button>
        </div>}
      </div>
      {error && <p role="alert" className="finished-goods-message error">{error}</p>}
      {notice && <p role="status" className="finished-goods-message success">{notice}</p>}
      {loading ? <p className="finished-goods-empty">Đang tải sản phẩm...</p> : visible.length === 0 ? <p className="finished-goods-empty">Chưa có sản phẩm phù hợp.</p> :
        <div className="finished-goods-table-scroll"><table className="finished-goods-table">
          <thead><tr>{['Ảnh', 'Mã sản phẩm', 'Tên / mã mẫu', 'Danh mục', 'Trạng thái', 'Tồn kho', 'Đã giữ', 'Thao tác'].map((heading) => <th key={heading} scope="col">{heading}</th>)}</tr></thead>
          <tbody>{pageProducts.map((product) => <tr key={product.id}>
            <td>{product.thumbnailUrl ? <img className="finished-goods-thumbnail" src={product.thumbnailUrl} alt={product.productName} /> : <span className="finished-goods-thumbnail finished-goods-no-image"><Box size={22} /></span>}</td>
            <td className="finished-goods-code">{product.productCode}</td>
            <td className="finished-goods-name"><strong>{product.productName}</strong><small>{(product.skus || []).length ? product.skus.map((sku) => `${sku.skuCode}: ${sku.onHandQty}`).join('  ·  ') : product.sampleCode || 'Chưa có mã mẫu'}</small></td>
            <td className="finished-goods-category"><Tag size={14} />{product.category || '—'}</td>
            <td><span className={`finished-goods-status ${!product.isActive ? 'draft' : product.onHandQty <= 0 ? 'empty' : 'active'}`}>{!product.isActive ? 'Nháp' : product.onHandQty <= 0 ? 'Hết hàng' : 'Đang sử dụng'}</span></td>
            <td className={`finished-goods-quantity ${product.onHandQty <= 0 ? 'muted' : ''}`}>{product.onHandQty}</td>
            <td className={`finished-goods-reserved ${product.reservedQty > 0 ? 'has-reserved' : ''}`}>{product.reservedQty}</td>
            <td><div className="finished-goods-row-actions"><Link to={`/warehouse/products/${product.id}/edit`}>Cấu hình / Nhập</Link><div className="finished-goods-action-wrap"><button type="button" className="finished-goods-more" aria-label={`Thao tác cho ${product.productCode}`} aria-expanded={openActionId === product.id} aria-haspopup="true" onClick={() => setOpenActionId((current) => current === product.id ? null : product.id)}><MoreVertical size={18} /></button>{openActionId === product.id && <div className="finished-goods-action-menu"><button type="button" disabled={!product.isActive || product.onHandQty - product.reservedQty <= 0} onClick={() => { setBulkDirection(''); openStockMovementForm(product, 'OUT'); }}>Xuất kho</button></div>}</div></div></td>
          </tr>)}</tbody>
        </table></div>}
      <div className="finished-goods-pagination"><span>{visible.length ? `Hiển thị ${(currentPage - 1) * pageSize + 1} - ${Math.min(currentPage * pageSize, visible.length)} trên ${visible.length} sản phẩm` : 'Hiển thị 0 sản phẩm'}</span>{pageCount > 1 && <nav aria-label="Phân trang sản phẩm">{Array.from({ length: pageCount }, (_, index) => <button key={index} type="button" className={currentPage === index + 1 ? 'current' : ''} onClick={() => setPage(index + 1)} aria-current={currentPage === index + 1 ? 'page' : undefined}>{index + 1}</button>)}</nav>}</div>
    </section>

    <div className="finished-goods-summary">
      <section><span className="finished-goods-summary-icon gold"><Box size={23} /></span><div><h3>Tổng tồn kho lý thuyết</h3><p>Toàn bộ hàng hóa hiện đang có mặt tại kho thành phẩm AraWMS.</p><strong>{totalStock.toLocaleString('vi-VN')} đơn vị</strong></div></section>
      <section><span className="finished-goods-summary-icon"><LayoutGrid size={22} /></span><div><h3>Phân bổ danh mục</h3><p>Hệ thống ghi nhận các nhóm hàng trong danh mục hiện tại.</p><strong>{categories.length.toLocaleString('vi-VN')} danh mục</strong></div></section>
      <section><span className="finished-goods-summary-icon"><ClipboardList size={22} /></span><div><h3>Sản phẩm cần nhập kho</h3><p>Sản phẩm đang sử dụng nhưng chưa có hàng trong kho.</p><strong>{outOfStockCount.toLocaleString('vi-VN')} sản phẩm</strong>{outOfStockCount > 0 && <span className="finished-goods-summary-pill">Cần xử lý</span>}</div></section>
    </div>

    {recentDocuments.length > 0 && <section style={{ ...panel, marginTop: '1rem' }}>
      <h2>Phiếu kho gần đây</h2>
      <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
        <thead><tr><th style={{ textAlign: 'left' }}>Số chứng từ</th><th>Loại</th><th>Số dòng</th><th>Đạt / xuất</th><th>Trả sửa</th><th>Ngày tạo</th><th /></tr></thead>
        <tbody>{recentDocuments.map((document) => <tr key={document.id}>
          <td style={{ padding: '.6rem', borderBottom: '1px solid var(--ara-border)' }}>{document.documentCode}</td>
          <td style={{ textAlign: 'center' }}>{document.direction === 'IN' ? 'Nhập' : 'Xuất'}</td>
          <td style={{ textAlign: 'center' }}>{document.lineCount}</td>
          <td style={{ textAlign: 'center' }}>{document.totalQuantity}</td>
          <td style={{ textAlign: 'center' }}>{document.direction === 'IN' ? document.items.reduce((sum, item) => sum + (item.repairQty || 0), 0) : '—'}</td>
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

    {movement && <section ref={movementRef} style={{ ...panel, marginTop: '1rem', maxWidth: 560 }}>
      <h2>{movement.direction === 'IN' ? 'Nhập kho' : 'Xuất kho'} · {movement.product.productCode}</h2>
      <p style={{ margin: '.5rem 0 1rem', color: 'var(--ara-text-muted)' }}>{movement.product.productName}</p>
      <form onSubmit={submitStockMovement} style={{ display: 'grid', gap: '1rem' }}>
        {movement.product.skus.length > 0 ? <label>SKU
          <select style={input} required value={skuId} onChange={(event) => setSkuId(event.target.value)}>
            {movement.product.skus.length > 1 && <option value="">Chọn SKU</option>}
            {movement.product.skus.map((sku) => <option key={sku.id} value={sku.id}>{sku.skuCode} · {sku.color} / {sku.size} · khả dụng {sku.availableQty}</option>)}
          </select>
        </label> : <p>Chưa có SKU. Lần nhập đầu sẽ tạo SKU mặc định (FREESIZE).</p>}
        <label>Số lượng *<input style={input} type="number" min="1" max="100000" step="1" required value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label>
        <label>Ghi chú<input style={input} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Lý do nhập/xuất" /></label>
        {error && <p role="alert" style={{ color: '#a32121' }}>{error}</p>}
        <div style={{ display: 'flex', gap: '.75rem' }}>
          <button className="btn-ara-primary" disabled={saving} type="submit">{saving ? 'Đang lưu...' : 'Xác nhận'}</button>
          <button className="btn-ara-secondary" disabled={saving} type="button" onClick={() => { setMovement(null); setError(''); }}>Hủy</button>
        </div>
      </form>
    </section>}
  </main>;
}
