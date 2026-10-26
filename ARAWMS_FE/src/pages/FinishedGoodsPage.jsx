/*
 * File: FinishedGoodsPage.jsx
 * Author: Duy Anh
 * Date: 2026-10-22
 * Description: Displays finished goods stock and receiving actions.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { productService } from '../services/productService';
import BulkStockForm from '../components/BulkStockForm';

const panel = { background: '#fff', border: '1px solid var(--ara-border)', borderRadius: 'var(--radius-md)', padding: '1.25rem', boxShadow: 'var(--ara-shadow-sm)' };
const input = { width: '100%', padding: '.65rem', border: '1px solid var(--ara-border)', borderRadius: 8, font: 'inherit' };

export default function FinishedGoodsPage() {
  const location = useLocation();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [movement, setMovement] = useState(null);
  const [quantity, setQuantity] = useState('');
  const [skuId, setSkuId] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [bulkDirection, setBulkDirection] = useState(location.state?.receiveSkuIds?.length ? 'IN' : '');
  const [handoffSkuIds, setHandoffSkuIds] = useState(location.state?.receiveSkuIds || []);
  const [initialProductId, setInitialProductId] = useState('');
  const [recentDocuments, setRecentDocuments] = useState([]);

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
  useEffect(() => { loadProducts(); loadRecentStockDocuments(); }, []);

  /** Opens a printable page for the individual barcodes issued by a receipt. */
  const printDocumentBarcodes = async (document) => {
    try {
      const tab = window.open('', '_blank');
      if (!tab) throw new Error('Trình duyệt đang chặn cửa sổ in tem');
      const { printBarcodes } = await import('../utils/barcodePrint');
      printBarcodes(document.items.flatMap((item) => item.barcodes), tab);
    } catch (printError) { setError(printError.message); }
  };

  const visible = useMemo(() => products.filter((item) =>
    `${item.productCode} ${item.productName} ${item.sampleCode} ${item.category}`.toLocaleLowerCase('vi-VN').includes(search.toLocaleLowerCase('vi-VN'))
  ), [products, search]);

  /** Opens an individual stock movement with SKU selection when needed. */
  const openStockMovementForm = (product, direction) => {
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

  return <main className="product-workspace">
    <nav className="product-breadcrumb" aria-label="Đường dẫn"><span>Kho thành phẩm</span><span>/</span><strong>Danh mục và nhập xuất</strong></nav>
    <div className="product-page-head">
      <div><p className="product-eyebrow">QUẢN LÝ KHO · THÀNH PHẨM</p><h1>Kho thành phẩm</h1><p>Quản lý mẫu, biến thể và kiểm nhận từng đợt hàng từ xưởng.</p></div>
      <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
        <Link to="/warehouse/products/new" state={{ mode: 'existing' }} className="btn-ara-secondary">Nhập từ xưởng</Link>
        <button className="btn-ara-secondary" type="button" onClick={() => { setHandoffSkuIds([]); setInitialProductId(''); setBulkDirection('OUT'); setMovement(null); setError(''); setNotice(''); }}>Xuất kho hàng loạt</button>
        <Link to="/warehouse/products/new" className="btn-ara-gold">+ Cấu hình sản phẩm</Link>
      </div>
    </div>

    {bulkDirection === 'IN' && <ol className="product-steps" aria-label="Tiến trình nhập kho"><li><span>01</span>Cấu hình sản phẩm</li><li className="current"><span>02</span>Kiểm nhận</li><li><span>03</span>Xác nhận nhập kho</li></ol>}
    {bulkDirection && <BulkStockForm key={`${bulkDirection}:${initialProductId}:${handoffSkuIds.join(',')}`} direction={bulkDirection} products={products} initialSkuIds={handoffSkuIds} initialProductId={initialProductId} onCancel={() => setBulkDirection('')} onDone={async (document) => {
      setBulkDirection('');
      setHandoffSkuIds([]);
      setNotice(`Đã lưu phiếu ${document.documentCode}: ${document.lineCount} dòng, tổng ${document.totalQuantity} sản phẩm.`);
      setRecentDocuments((current) => [{ ...document, createdAt: new Date().toISOString(), items: document.items || [] }, ...current]);
      await loadProducts();
      await loadRecentStockDocuments();
    }} />}

    <section className="product-card">
      <div className="product-card-head"><div><h2>Danh mục sản phẩm</h2></div><p>{visible.length} sản phẩm</p></div>
      <label style={{ display: 'block', maxWidth: 360, marginBottom: '1rem' }}>Tìm sản phẩm
        <input style={{ ...input, marginTop: '.35rem' }} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Mã, tên, mã mẫu hoặc danh mục" />
      </label>
      {error && <p role="alert" style={{ color: '#a32121', marginBottom: '1rem' }}>{error}</p>}
      {notice && <p role="status" style={{ color: 'var(--ara-success)', marginBottom: '1rem' }}>{notice}</p>}
      {loading ? <p>Đang tải sản phẩm...</p> : visible.length === 0 ? <p>Chưa có sản phẩm phù hợp.</p> :
        <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 780 }}>
          <thead><tr>{['Ảnh', 'Mã sản phẩm', 'Tên / mã mẫu', 'Danh mục', 'Trạng thái', 'Tồn kho', 'Đã giữ', 'Thao tác'].map((heading) =>
            <th key={heading} style={{ textAlign: 'left', padding: '.75rem', borderBottom: '1px solid var(--ara-border)' }}>{heading}</th>)}</tr></thead>
          <tbody>{visible.map((product) => <tr key={product.id}>
            <td style={{ padding: '.75rem', borderBottom: '1px solid var(--ara-border)' }}>{product.thumbnailUrl ? <img src={product.thumbnailUrl} alt={product.productName} style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 6 }} /> : '—'}</td>
            <td style={{ padding: '.75rem', borderBottom: '1px solid var(--ara-border)' }}><strong>{product.productCode}</strong></td>
            <td style={{ padding: '.75rem', borderBottom: '1px solid var(--ara-border)' }}>{product.productName}<br /><small>{product.sampleCode || 'Chưa có mã mẫu'}</small>{product.skus.length > 0 && <div style={{ marginTop: '.3rem' }}>{product.skus.map((sku) => <small key={sku.id} style={{ display: 'block' }}>{sku.skuCode} · {sku.color} / {sku.size}: {sku.onHandQty}</small>)}</div>}</td>
            <td style={{ padding: '.75rem', borderBottom: '1px solid var(--ara-border)' }}>{product.category}</td>
            <td style={{ padding: '.75rem', borderBottom: '1px solid var(--ara-border)' }}><span className={`product-badge ${product.isActive ? 'active' : ''}`}>{product.isActive ? 'Đang sử dụng' : 'Nháp'}</span></td>
            <td style={{ padding: '.75rem', borderBottom: '1px solid var(--ara-border)' }}><strong>{product.onHandQty}</strong></td>
            <td style={{ padding: '.75rem', borderBottom: '1px solid var(--ara-border)' }}>{product.reservedQty}</td>
            <td style={{ padding: '.75rem', borderBottom: '1px solid var(--ara-border)' }}><div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
              <Link className="btn-ara-secondary" to={`/warehouse/products/${product.id}/edit`}>Cấu hình / nhập</Link>
              <button type="button" className="btn-ara-secondary" disabled={!product.isActive || product.onHandQty - product.reservedQty <= 0} onClick={() => { setBulkDirection(''); openStockMovementForm(product, 'OUT'); }}>Xuất kho</button>
            </div></td>
          </tr>)}</tbody>
        </table></div>}
    </section>

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
          <td>{document.direction === 'IN' && document.totalQuantity > 0 && <button className="btn-ara-secondary" type="button" onClick={() => printDocumentBarcodes(document)}>In tem barcode</button>}</td>
        </tr>)}</tbody>
      </table></div>
    </section>}

    {movement && <section style={{ ...panel, marginTop: '1rem', maxWidth: 560 }}>
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
