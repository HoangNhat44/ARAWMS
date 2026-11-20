/*
 * File: FinishedGoodsProductPage.jsx
 * Author: Duy Anh
 * Date: 2026-11-18
 * Description: Product detail opened from "Chi tiết" in the finished-goods stock table.
 * Uses the same page frame as the finished-goods page. Shows product information (editable by the
 * warehouse manager), units on shelves and inbound receipts confirmed by the warehouse manager,
 * with printable barcodes in both lists.
 */
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Box, ChevronDown, ChevronRight, Pencil, Printer, RefreshCw } from 'lucide-react';
import { productService } from '../../services/productService';
import { useAuth } from '../../hooks/useAuth';
import { queueCatalogChange, syncCatalogChanges, getPendingCatalogChanges } from '../../services/offlineCatalogSync';
import { PRODUCT_CODE_HINT, isValidProductCode, normalizeProductCode } from '../../utils/productCode';
import { printProductLabels } from '../../utils/productLabelPrint';
import '../../styles/finishedGoods.css';
import '../../styles/finishedGoodsProduct.css';
import { formatNumber as number, formatVnd as money } from '../../utils/warehouseFormat';

const dateTime = (value) => (value ? new Date(value).toLocaleString('vi-VN') : '—');
const REQUEST_SOURCE = { INBOUND_FROM_SEWING: 'Hàng may từ xưởng', INBOUND_FROM_RETURN: 'Hàng hoàn đạt KCS' };
const UNIT_STATUS = {
  ON_SHELF: (unit) => `Trên kệ ${unit.locationCode}`,
  UNPLACED: () => 'Chờ xếp kệ',
  PACKED: (unit) => `Đã đóng đơn${unit.orderCode ? ` ${unit.orderCode}` : ''}`,
  DEFECT_PENDING: () => 'Hàng lỗi · chờ nhập kho lỗi',
  DEFECTIVE: () => 'Trong kho hàng lỗi',
  DEFECT_OUT: () => 'Đã xuất khỏi kho hàng lỗi',
  STOCKTAKE_WRITE_OFF: () => 'Loại khỏi kho khi kiểm kê',
};
/** Units no longer in sellable stock: packed into an order, or defective. */
const NOT_IN_STOCK = new Set(['PACKED', 'DEFECT_PENDING', 'DEFECTIVE', 'DEFECT_OUT', 'STOCKTAKE_WRITE_OFF']);
const MAX_LABELS_PER_PRINT = 500;
const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'FREESIZE'];
const catalogFrom = (product) => ({ productName: product.productName, productCode: product.productCode,
  category: product.category, basePrice: String(product.basePrice ?? ''), description: product.description || '' });
const isCodeLocked = (product) => Boolean(product?.codeLockedAt || product?.isActive);

/** Prints labels rendered by the server; the tab opens synchronously so it is not blocked as a popup. */
async function printLabels(productId, barcodes) {
  if (!barcodes.length) return;
  if (barcodes.length > MAX_LABELS_PER_PRINT) throw new Error(`Mỗi lần in tối đa ${MAX_LABELS_PER_PRINT} tem.`);
  const tab = window.open('', '_blank');
  if (!tab) throw new Error('Trình duyệt đang chặn cửa sổ in tem');
  tab.document.write('<p style="font-family:Arial">Đang chuẩn bị tem...</p>');
  try {
    const response = await productService.productLabels(productId, barcodes);
    printProductLabels(response.data.labels, tab);
  } catch (error) { tab.close(); throw error; }
}

/** Product detail for the finished-goods warehouse. Staff can view and print; managers can also edit. */
export default function FinishedGoodsProductPage({ isStaffMode = false }) {
  const { productId } = useParams();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const ownerId = user?.id || user?._id;
  const canEdit = !isStaffMode;
  const backPath = isStaffMode ? '/warehouse/staff/finished-goods' : '/warehouse/finished-goods';
  const highlightedSkuId = searchParams.get('sku');

  const [detail, setDetail] = useState(null);
  const [shelf, setShelf] = useState({ items: [], total: 0 });
  const [receipts, setReceipts] = useState({ receipts: [], total: 0, page: 1, pageSize: 10 });
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadDetail = useCallback(() => productService.detail(productId).then((response) => setDetail(response.data)), [productId]);
  const loadShelf = useCallback(() => productService.shelfStock(productId).then((response) => setShelf(response.data)), [productId]);
  const loadReceipts = useCallback((page = 1) => productService.productReceipts(productId, { page })
    .then((response) => setReceipts(response.data)), [productId]);
  const loadAll = useCallback(() => {
    setLoading(true); setError('');
    return Promise.all([loadDetail(), loadShelf(), loadReceipts(1)])
      .catch((requestError) => setError(requestError.message))
      .finally(() => setLoading(false));
  }, [loadDetail, loadShelf, loadReceipts]);

  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(''), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const print = async (barcodes) => {
    setPrinting(true); setError('');
    try { await printLabels(productId, barcodes); } catch (requestError) { setError(requestError.message); }
    finally { setPrinting(false); }
  };

  const product = detail?.product;
  const totals = useMemo(() => (detail?.skus || []).reduce((sum, sku) => ({
    onHand: sum.onHand + sku.onHandQty, reserved: sum.reserved + sku.reservedQty, pickable: sum.pickable + sku.pickableQty,
  }), { onHand: 0, reserved: 0, pickable: 0 }), [detail]);
  const receiptPages = Math.max(1, Math.ceil(receipts.total / receipts.pageSize));

  return <main className="finished-goods-page fg-product-page" style={{ padding: '1.5rem', maxWidth: '1440px', margin: '0 auto' }}>
    <nav className="product-breadcrumb" aria-label="Đường dẫn">
      <Link to="/">Trang chủ</Link>
      <span>/</span>
      {isStaffMode && <><Link to="/warehouse/putaway">Nhân viên kho</Link><span>/</span></>}
      <Link to={backPath}>Kho thành phẩm</Link>
      <span>/</span>
      <strong>{product?.productName || 'Chi tiết sản phẩm'}</strong>
    </nav>

    <div className="product-page-head finished-goods-hero">
      <div className="finished-goods-intro">
        <p className="product-eyebrow">CHI TIẾT SẢN PHẨM</p>
        <h1>{product?.productName || 'Chi tiết sản phẩm'}</h1>
        <p>{product ? `${product.productCode} · ${product.category}` : 'Thông tin sản phẩm, hàng trên kệ và phiếu nhập kho đã xác nhận.'}</p>
      </div>
      <div className="finished-goods-main-actions">
        <Link to={backPath} className="btn-ara-secondary"><ArrowLeft size={17} /> Về kho thành phẩm</Link>
        <button className="btn-ara-secondary" type="button" disabled={loading} onClick={loadAll}>
          <RefreshCw size={17} className={loading ? 'animate-spin' : ''} /> Làm mới
        </button>
        {canEdit && product && !editing && <button className="btn-ara-primary" type="button" onClick={() => setEditing(true)}>
          <Pencil size={17} /> Chỉnh sửa
        </button>}
      </div>
    </div>

    {error && <p className="finished-goods-message error" role="alert">{error}</p>}
    {notice && <p className="finished-goods-message success" role="status">{notice}</p>}

    {!detail ? <p className="fg-empty">{loading ? 'Đang tải chi tiết sản phẩm...' : 'Không tìm thấy sản phẩm.'}</p> : <>
      <section className="fg-metrics" aria-label="Tổng quan tồn kho sản phẩm">
        <div className="fg-metric"><span>Tồn thực tế</span><strong>{number(totals.onHand)}</strong><small>Tạm giữ {number(totals.reserved)} chiếc cho đơn</small></div>
        <div className="fg-metric fg-metric-available"><span>Đang trên kệ</span><strong>{number(shelf.total)}</strong><small>Khả dụng để soạn {number(totals.pickable)} chiếc</small></div>
        <div className="fg-metric fg-metric-pending"><span>Phiếu nhập đã xác nhận</span><strong>{number(receipts.total)}</strong><small>Phiếu nhập kho có sản phẩm này</small></div>
      </section>

      <ProductInfo detail={detail} editing={editing} setEditing={setEditing} ownerId={ownerId}
        highlightedSkuId={highlightedSkuId} onError={setError}
        onSaved={async (text) => { await loadDetail(); setNotice(text); }} />

      <section className="fg-stock-card fg-product-section" aria-labelledby="fg-shelf-title">
        <div className="fg-stock-heading">
          <div><h2 id="fg-shelf-title">Hàng đang trên kệ</h2>
            <p>{number(shelf.total)} chiếc · bấm vào một dòng để xem barcode và in tem</p></div>
          <div className="fg-stock-tools">
            <button type="button" disabled={!shelf.total || printing}
              onClick={() => print(shelf.items.flatMap((item) => item.barcodes))}>
              <Printer size={16} /> In tất cả tem trên kệ
            </button>
          </div>
        </div>
        {shelf.items.length === 0 ? <p className="fg-empty">Chưa có chiếc nào của sản phẩm này trên kệ.</p> : <div className="fg-table-scroll">
          <table className="fg-detail-table">
            <thead><tr><th aria-label="Mở dòng" /><th>SKU</th><th>Màu / Size</th><th>Kệ</th><th className="fg-number">Số lượng</th></tr></thead>
            <tbody>{shelf.items.map((item) => <ExpandableRow key={`${item.skuId}:${item.locationId}:${item.quantity}`} colSpan={5}
              highlight={item.skuId === highlightedSkuId}
              cells={<><td><strong>{item.skuCode}</strong></td><td>{item.color} / {item.size}</td>
                <td>{item.locationCode}</td><td className="fg-number">{number(item.quantity)}</td></>}
              loadUnits={async () => item.barcodes.map((barcode) => ({ barcode, status: 'ON_SHELF', locationCode: item.locationCode,
                skuCode: item.skuCode, color: item.color, size: item.size }))}
              onPrint={print} printing={printing} onError={setError} />)}</tbody>
          </table>
        </div>}
      </section>

      <section className="fg-stock-card fg-product-section" aria-labelledby="fg-receipt-title">
        <div className="fg-stock-heading">
          <div><h2 id="fg-receipt-title">Phiếu nhập kho đã xác nhận</h2>
            <p>{number(receipts.total)} phiếu · bấm vào một phiếu để xem barcode của sản phẩm này và in tem</p></div>
        </div>
        {receipts.receipts.length === 0 ? <p className="fg-empty">Chưa có phiếu nhập kho nào được xác nhận cho sản phẩm này.</p> : <div className="fg-table-scroll">
          <table className="fg-detail-table">
            <thead><tr><th aria-label="Mở phiếu" /><th>Mã phiếu</th><th>Lệnh nhập</th><th>Nguồn</th><th>Ngày xác nhận</th><th>Người xác nhận</th><th className="fg-number">Số lượng</th></tr></thead>
            <tbody>{receipts.receipts.map((receipt) => <ExpandableRow key={receipt.id} colSpan={7}
              cells={<><td><strong>{receipt.documentCode}</strong></td><td>{receipt.requestCode || '—'}</td>
                <td>{REQUEST_SOURCE[receipt.requestType] || '—'}</td><td>{dateTime(receipt.confirmedAt)}</td>
                <td>{receipt.confirmedBy || '—'}</td><td className="fg-number">{number(receipt.quantity)}</td></>}
              loadUnits={async () => (await productService.productReceiptUnits(productId, receipt.id)).data.units || []}
              onPrint={print} printing={printing} onError={setError} />)}</tbody>
          </table>
        </div>}
        {receiptPages > 1 && <div className="fg-pagination"><span>Trang {receipts.page}/{receiptPages}</span><div>
          <button type="button" disabled={receipts.page <= 1} onClick={() => loadReceipts(receipts.page - 1).catch((e) => setError(e.message))}>Trước</button>
          <button type="button" disabled={receipts.page >= receiptPages} onClick={() => loadReceipts(receipts.page + 1).catch((e) => setError(e.message))}>Sau</button>
        </div></div>}
      </section>
    </>}
  </main>;
}

/** A row that expands into its barcodes, which can be selected and printed. */
function ExpandableRow({ cells, colSpan, highlight, loadUnits, onPrint, printing, onError }) {
  const [open, setOpen] = useState(false);
  const [units, setUnits] = useState(null);
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(false);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (!next || units) return;
    setLoading(true);
    try {
      const loaded = await loadUnits();
      setUnits(loaded);
      // Units already packed into an order have left the warehouse; only units still in stock are preselected.
      setSelected(loaded.filter((unit) => !NOT_IN_STOCK.has(unit.status)).map((unit) => unit.barcode));
    } catch (requestError) { onError(requestError.message); setOpen(false); }
    finally { setLoading(false); }
  };

  const inStock = (units || []).filter((unit) => !NOT_IN_STOCK.has(unit.status));
  const allChecked = units?.length > 0 && units.every((unit) => selected.includes(unit.barcode));

  return <Fragment>
    <tr className={`fg-expand-row ${open ? 'open' : ''} ${highlight ? 'highlight' : ''}`} onClick={toggle}>
      <td><button type="button" className="fg-icon-button" aria-expanded={open} aria-label={open ? 'Thu gọn' : 'Xem barcode'}
        onClick={(event) => { event.stopPropagation(); toggle(); }}>{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</button></td>
      {cells}
    </tr>
    {open && <tr className="fg-expand-detail"><td colSpan={colSpan}>
      {loading ? <p className="fg-empty">Đang tải barcode...</p> : units && <>
        <div className="fg-unit-actions">
          <span>{units.length} barcode · {inStock.length} còn trong kho · đã chọn {selected.length}</span>
          <div className="fg-row-actions">
            {inStock.length !== units.length && <button type="button" onClick={() => setSelected(inStock.map((unit) => unit.barcode))}>Chọn hàng còn trong kho</button>}
            <button type="button" className="fg-print-button" disabled={!selected.length || printing} onClick={() => onPrint(selected)}>
              <Printer size={14} /> {printing ? 'Đang chuẩn bị...' : `In tem đã chọn (${selected.length})`}
            </button>
          </div>
        </div>
        <div className="fg-table-scroll fg-unit-scroll">
          <table className="fg-detail-table">
            <thead><tr>
              <th><input type="checkbox" aria-label="Chọn tất cả barcode" checked={allChecked}
                onChange={(event) => setSelected(event.target.checked ? units.map((unit) => unit.barcode) : [])} /></th>
              <th>Barcode</th><th>SKU</th><th>Màu / Size</th><th>Vị trí hiện tại</th><th aria-label="In" />
            </tr></thead>
            <tbody>{units.map((unit) => <tr key={unit.barcode} className={unit.status === 'PACKED' ? 'muted' : ''}>
              <td><input type="checkbox" aria-label={`Chọn ${unit.barcode}`} checked={selected.includes(unit.barcode)}
                onChange={(event) => setSelected((current) => event.target.checked
                  ? [...current, unit.barcode] : current.filter((code) => code !== unit.barcode))} /></td>
              <td><code>{unit.barcode}</code></td><td>{unit.skuCode}</td><td>{unit.color} / {unit.size}</td>
              <td><span className={`fg-unit-status ${unit.status.toLowerCase()}`}>{UNIT_STATUS[unit.status](unit)}</span></td>
              <td><button type="button" className="fg-icon-button" aria-label={`In tem ${unit.barcode}`} disabled={printing}
                onClick={() => onPrint([unit.barcode])}><Printer size={14} /></button></td>
            </tr>)}</tbody>
          </table>
        </div>
      </>}
    </td></tr>}
  </Fragment>;
}

/** Product information. Edits go through the same offline catalog queue as the configuration page,
 * so version checks and pending-sync handling stay identical. */
function ProductInfo({ detail, editing, setEditing, ownerId, highlightedSkuId, onSaved, onError }) {
  const { product, skus } = detail;
  const [catalog, setCatalog] = useState(() => catalogFrom(product));
  const [prices, setPrices] = useState({});
  const [files, setFiles] = useState({ image: null, video: null, additional: [] });
  const [newVariant, setNewVariant] = useState({ color: '', size: 'M', retailPrice: '' });
  const [busy, setBusy] = useState(false);
  const codeLocked = isCodeLocked(product);

  useEffect(() => {
    setCatalog(catalogFrom(product));
    setPrices(Object.fromEntries(skus.map((sku) => [sku.id, String(sku.retailPrice ?? '')])));
  }, [product, skus]);

  const colorGroups = useMemo(() => [...skus.reduce((groups, sku) => {
    const key = sku.color.trim().toLocaleLowerCase('vi-VN');
    const group = groups.get(key) || { color: sku.color, skus: [], onHand: 0 };
    group.skus.push(sku); group.onHand += sku.onHandQty;
    return groups.set(key, group);
  }, new Map()).values()].map((group) => ({ ...group, stopped: group.skus.every((sku) => sku.discontinuedAt) })), [skus]);

  /** Queues a change locally, syncs it, and reports a conflict instead of overwriting newer data. */
  const submit = async (change, media = [], successText = 'Đã lưu thay đổi.') => {
    if (!ownerId) throw new Error('Cần đăng nhập trước khi lưu dữ liệu sản phẩm.');
    const operation = await queueCatalogChange(ownerId, change, media);
    await syncCatalogChanges(ownerId);
    const saved = (await getPendingCatalogChanges(ownerId)).find((item) => item.operationId === operation.operationId);
    if (saved?.status === 'NEEDS_ACTION') {
      throw new Error(saved.errorCode === 'VERSION_CONFLICT'
        ? 'Sản phẩm vừa được thay đổi ở nơi khác. Bấm "Làm mới" để xem bản mới; thay đổi của bạn nằm trong mục "Dữ liệu chờ đồng bộ" ở trang Cấu hình sản phẩm.'
        : `${saved.lastError}. Thay đổi nằm trong mục "Dữ liệu chờ đồng bộ" ở trang Cấu hình sản phẩm.`);
    }
    await onSaved(saved?.status === 'DONE' ? successText : 'Đã lưu trên thiết bị — sẽ đồng bộ khi có kết nối.');
  };
  const run = async (action) => {
    if (busy) return;
    setBusy(true); onError('');
    try { await action(); } catch (requestError) { onError(requestError.message); } finally { setBusy(false); }
  };
  const cancelEdit = () => {
    setEditing(false); setCatalog(catalogFrom(product)); setFiles({ image: null, video: null, additional: [] });
    setPrices(Object.fromEntries(skus.map((sku) => [sku.id, String(sku.retailPrice ?? '')])));
  };

  const saveProduct = () => run(async () => {
    const values = { ...catalog, basePrice: Number(catalog.basePrice) };
    if (!values.productName.trim() || !values.category.trim() || catalog.basePrice === '' || values.basePrice < 0)
      throw new Error('Nhập đủ tên, danh mục và giá bán cơ bản từ 0 ₫.');
    const changed = Object.fromEntries(Object.entries(values).filter(([key, value]) =>
      key === 'productCode' ? !codeLocked && value !== product.productCode : value !== (product[key] ?? '')));
    if ('productCode' in changed && !isValidProductCode(changed.productCode)) throw new Error(PRODUCT_CODE_HINT);
    const media = [files.image && { kind: 'image', file: files.image }, files.video && { kind: 'video', file: files.video },
      ...files.additional.map((file) => ({ kind: 'additional', file }))].filter(Boolean);
    if (!Object.keys(changed).length && !media.length) { await onSaved('Không có thay đổi để lưu.'); return; }
    await submit({ operationType: 'UPDATE_PRODUCT', serverEntityId: product.id, baseVersion: product.version,
      baseline: Object.fromEntries(Object.keys(changed).map((key) => [key, product[key] ?? ''])),
      payload: Object.keys(changed).length ? changed : { status: product.isActive ? 'ACTIVE' : 'DRAFT' },
      label: product.productName }, media);
    setFiles({ image: null, video: null, additional: [] });
    setEditing(false);
  });

  const saveSkuPrice = (sku) => run(async () => {
    const retailPrice = Number(prices[sku.id]);
    if (prices[sku.id] === '' || !Number.isFinite(retailPrice) || retailPrice < 0) throw new Error('Nhập giá bán từ 0 ₫.');
    if (retailPrice === sku.retailPrice) { await onSaved('Không có thay đổi giá để lưu.'); return; }
    await submit({ operationType: 'UPDATE_SKU', serverEntityId: product.id, baseVersion: sku.version,
      payload: { skuId: sku.id, retailPrice }, label: sku.skuCode }, [], `Đã lưu giá ${sku.skuCode}.`);
  });

  const setColorActive = (group, isActive) => {
    const warning = isActive ? `Bán lại màu "${group.color}"?`
      : `Ngừng bán màu "${group.color}"? Seller sẽ không bán được màu này nữa.${group.onHand ? `\nCòn tồn ${group.onHand} chiếc.` : ''}`;
    if (!window.confirm(warning)) return;
    run(() => submit({ operationType: 'SET_COLOR_ACTIVE', serverEntityId: product.id, baseVersion: product.version,
      payload: { color: group.color, isActive }, label: `${product.productName} · ${isActive ? 'Bán lại' : 'Ngừng bán'} ${group.color}` },
    [], isActive ? `Đã bán lại màu ${group.color}.` : `Đã ngừng bán màu ${group.color}.`));
  };

  const addVariant = () => run(async () => {
    if (!newVariant.color.trim()) throw new Error('Nhập màu cho biến thể mới.');
    await submit({ operationType: 'ADD_VARIANTS', serverEntityId: product.id, baseVersion: product.version,
      payload: { variants: [{ color: newVariant.color.trim(), size: newVariant.size,
        retailPrice: newVariant.retailPrice === '' ? undefined : Number(newVariant.retailPrice) }] },
      label: `${product.productName} · ${newVariant.color}/${newVariant.size}` }, [], 'Đã thêm biến thể.');
    setNewVariant({ color: '', size: 'M', retailPrice: '' });
  });

  return <section className="fg-stock-card fg-product-section" aria-labelledby="fg-info-title">
    <div className="fg-stock-heading">
      <div><h2 id="fg-info-title">Thông tin sản phẩm</h2>
        <p>{editing ? 'Đang chỉnh sửa — thay đổi được lưu qua hàng đợi đồng bộ của danh mục.' : 'Mô tả, giá và tồn kho theo biến thể.'}</p></div>
      <span className={`fg-status ${product.isActive ? 'ready' : 'muted'}`}>{product.isActive ? 'Đang bán' : product.codeLockedAt ? 'Ngừng bán' : 'Nháp (bản cũ)'}</span>
    </div>

    <div className="fg-product-overview">
      {product.thumbnailUrl ? <img src={product.thumbnailUrl} alt="" /> : <span className="fg-product-placeholder"><Box size={28} /></span>}
      {!editing ? <dl className="fg-product-facts">
        <div><dt>Mã sản phẩm</dt><dd>{product.productCode}</dd></div>
        <div><dt>Danh mục</dt><dd>{product.category}</dd></div>
        <div><dt>Giá bán cơ bản</dt><dd>{money(product.basePrice)}</dd></div>
        {product.season && <div><dt>Mùa</dt><dd>{product.season}</dd></div>}
        <div className="wide"><dt>Mô tả</dt><dd>{product.description || 'Chưa có mô tả.'}</dd></div>
      </dl> : <div className="fg-product-form">
        <label className="wide">Tên sản phẩm *<input value={catalog.productName} maxLength={200}
          onChange={(event) => setCatalog({ ...catalog, productName: event.target.value })} /></label>
        <label>Mã sản phẩm<input value={catalog.productCode} maxLength={20} disabled={codeLocked}
          onChange={(event) => setCatalog({ ...catalog, productCode: normalizeProductCode(event.target.value) })} />
          {codeLocked && <small>Mã đã khóa vì sản phẩm đã được đưa vào sử dụng.</small>}</label>
        <label>Danh mục *<input value={catalog.category} maxLength={100}
          onChange={(event) => setCatalog({ ...catalog, category: event.target.value })} /></label>
        <label>Giá bán cơ bản (₫) *<input type="number" min="0" step="1" value={catalog.basePrice}
          onChange={(event) => setCatalog({ ...catalog, basePrice: event.target.value })} /></label>
        <label className="wide">Mô tả<textarea rows={4} maxLength={2000} value={catalog.description}
          onChange={(event) => setCatalog({ ...catalog, description: event.target.value })} /></label>
        <label>Ảnh đại diện<input type="file" accept="image/jpeg,image/png,image/webp"
          onChange={(event) => setFiles((current) => ({ ...current, image: event.target.files?.[0] || null }))} /></label>
        <label>Ảnh bổ sung<input type="file" multiple accept="image/jpeg,image/png,image/webp"
          onChange={(event) => setFiles((current) => ({ ...current, additional: [...(event.target.files || [])] }))} /></label>
        <label>Video sản phẩm<input type="file" accept="video/mp4,video/webm"
          onChange={(event) => setFiles((current) => ({ ...current, video: event.target.files?.[0] || null }))} /></label>
        <small className="wide">Ảnh JPG, PNG, WebP tối đa 10 MB. Video MP4, WebM tối đa 100 MB.</small>
        <div className="wide fg-row-actions fg-form-actions">
          <button type="button" disabled={busy} onClick={cancelEdit}>Hủy</button>
          <button type="button" className="fg-print-button" disabled={busy} onClick={saveProduct}>{busy ? 'Đang lưu...' : 'Lưu thay đổi'}</button>
        </div>
      </div>}
    </div>

    <h3 className="fg-product-subtitle">Biến thể và tồn kho</h3>
    <div className="fg-table-scroll">
      <table className="fg-detail-table">
        <thead><tr><th>SKU</th><th>Màu / Size</th><th>Giá bán</th><th className="fg-number">Tồn thực tế</th>
          <th className="fg-number">Tạm giữ</th><th className="fg-number">Khả dụng</th><th>Trạng thái</th></tr></thead>
        <tbody>{skus.map((sku) => <tr key={sku.id} className={sku.id === highlightedSkuId ? 'highlight' : ''}>
          <td><strong>{sku.skuCode}</strong></td><td>{sku.color} / {sku.size}</td>
          <td>{editing ? <span className="fg-inline-price"><input type="number" min="0" aria-label={`Giá ${sku.skuCode}`}
            value={prices[sku.id] ?? ''} onChange={(event) => setPrices((current) => ({ ...current, [sku.id]: event.target.value }))} />
            <span className="fg-row-actions"><button type="button" disabled={busy} onClick={() => saveSkuPrice(sku)}>Lưu giá</button></span></span>
            : money(sku.retailPrice)}</td>
          <td className="fg-number">{number(sku.onHandQty)}</td><td className="fg-number">{number(sku.reservedQty)}</td>
          <td className="fg-number fg-available-number">{number(sku.pickableQty)}</td>
          <td><span className={`fg-status ${sku.discontinuedAt ? 'muted' : sku.isActive ? 'ready' : 'empty'}`}>
            {sku.discontinuedAt ? 'Ngừng bán' : sku.isActive ? 'Đang bán' : 'Nháp (bản cũ)'}</span></td>
        </tr>)}</tbody>
      </table>
    </div>

    {editing && <>
      <h3 className="fg-product-subtitle">Màu sắc</h3>
      <p className="fg-product-muted">Ngừng bán một màu khi không kinh doanh nữa. Hàng hoàn của màu đã ngừng vẫn nhập kho bình thường.</p>
      <div className="fg-color-list">{colorGroups.map((group) => <div key={group.color}>
        <strong>{group.color}</strong><span>{group.skus.map((sku) => sku.size).join(', ')} · tồn {group.onHand}</span>
        <span className="fg-row-actions"><button type="button" disabled={busy} onClick={() => setColorActive(group, group.stopped)}>{group.stopped ? 'Bán lại' : 'Ngừng bán'}</button></span>
      </div>)}</div>
      <h3 className="fg-product-subtitle">Thêm biến thể</h3>
      <div className="fg-add-variant">
        <label>Màu<input value={newVariant.color} placeholder="Ví dụ: Trắng"
          onChange={(event) => setNewVariant({ ...newVariant, color: event.target.value })} /></label>
        <label>Size<select value={newVariant.size} onChange={(event) => setNewVariant({ ...newVariant, size: event.target.value })}>
          {SIZES.map((size) => <option key={size}>{size}</option>)}</select></label>
        <label>Giá bán (₫)<input type="number" min="0" value={newVariant.retailPrice} placeholder={String(product.basePrice)}
          onChange={(event) => setNewVariant({ ...newVariant, retailPrice: event.target.value })} /></label>
        <span className="fg-row-actions"><button type="button" disabled={busy || !newVariant.color.trim()} onClick={addVariant}>Thêm biến thể</button></span>
      </div>
    </>}
  </section>;
}
