import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowDownToLine, Box, Filter, Search } from 'lucide-react';
import { formatNumber as number } from '../../utils/warehouseFormat';


/** Shows server-confirmed SKU totals. "Chi tiết" opens the product detail page.
 * Receipt progress covers recent documents; it must not be used to infer SKU availability. */
export default function FinishedGoodsOverview({
  products,
  recentDocuments,
  loading,
  onIssue,
  canIssue = true,
  canConfigure = true,
  detailBasePath = '/warehouse/finished-goods',
}) {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [availability, setAvailability] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);
  const categories = useMemo(() => [...new Set(products.map((product) => product.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi')), [products]);
  const rows = useMemo(() => products.flatMap((product) => product.skus?.length
    ? product.skus.map((sku) => ({ product, sku })) : [{ product, sku: null }]), [products]);
  const filtered = rows.filter(({ product, sku }) => {
    const query = search.trim().toLocaleLowerCase('vi');
    // TODO(xóa sampleCode): product.sampleCode only matters for legacy products before the migration.
    const text = [product.productCode, product.productName, product.sampleCode, product.category, sku?.skuCode, sku?.color, sku?.size].join(' ').toLocaleLowerCase('vi');
    const available = sku ? Number(sku.pickableQty ?? 0) : 0;
    const matchesAvailability = !availability || (availability === 'available' ? available > 0 : available === 0);
    return (!query || text.includes(query)) && (!category || product.category === category) && matchesAvailability;
  });
  const pageSize = 8;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const total = products.reduce((sum, product) => sum + Number(product.onHandQty || 0), 0);
  const reserved = products.reduce((sum, product) => sum + Number(product.reservedQty || 0), 0);
  const available = rows.reduce((sum, { sku }) => sum + Number(sku?.pickableQty || 0), 0);
  const pendingRecent = recentDocuments.filter((document) => document.direction === 'IN')
    .reduce((sum, document) => sum + Number(document.pending || 0), 0);
  const recentInbound = recentDocuments.filter((document) => document.direction === 'IN');

  const openDetail = (product, sku) => navigate(`${detailBasePath}/${product.id}${sku ? `?sku=${sku.id}` : ''}`);
  const exportCsv = () => {
    const cells = (values) => values.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',');
    const header = ['Mã sản phẩm', 'Tên sản phẩm', 'Mã SKU', 'Màu', 'Size', 'Danh mục', 'Tồn thực tế', 'Tạm giữ', 'Khả dụng'];
    const body = filtered.map(({ product, sku }) => [product.productCode, product.productName, sku?.skuCode, sku?.color, sku?.size, product.category, sku?.onHandQty || 0, sku?.reservedQty || 0, Number(sku?.pickableQty || 0)]);
    const url = URL.createObjectURL(new Blob(['\uFEFF' + [header, ...body].map(cells).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = 'ton-kho-thanh-pham-theo-sku.csv'; anchor.click();
    URL.revokeObjectURL(url);
  };

  return <>
    <section className="fg-metrics" aria-label="Tổng quan tồn kho thành phẩm">
      <div className="fg-metric"><span>Tồn thực tế</span><strong>{number(total)}</strong><small>Chiếc đã xác nhận nhập kho</small></div>
      <div className="fg-metric fg-metric-available"><span>Khả dụng trên kệ</span><strong>{number(available)}</strong><small>Hàng ở vị trí có thể soạn, trừ lượng đã giữ</small></div>
      <div className="fg-metric fg-metric-pending"><span>Chờ xếp vào kệ</span><strong>{number(pendingRecent)}</strong><small>Trong {recentInbound.length} phiếu nhập gần đây</small></div>
    </section>
    <p className="fg-stock-note">Hàng không đạt không tăng tồn. Hàng đạt cần phân bổ đủ Kệ → Tầng → Ô trước khi xác nhận nhập; vị trí từng chiếc được tra cứu ở chức năng xếp kệ.</p>
    <section className="fg-stock-workspace" aria-label="Tồn kho theo SKU">
      <div className="fg-stock-card">
        <div className="fg-stock-heading"><div><h2>Tồn kho theo SKU</h2><p>{filtered.length} SKU và sản phẩm phù hợp</p></div><div className="fg-stock-tools"><button type="button" onClick={() => setFiltersOpen((value) => !value)} aria-expanded={filtersOpen}><Filter size={17} /> Bộ lọc</button><button type="button" onClick={exportCsv} disabled={!filtered.length || loading} title="Tải tệp CSV mở bằng Excel"><ArrowDownToLine size={17} /> Xuất CSV</button></div></div>
        <label className="fg-search"><Search size={19} /><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Tìm tên sản phẩm, mã mẫu hoặc SKU" aria-label="Tìm tồn kho theo SKU" /></label>
        {filtersOpen && <div className="fg-filters"><label>Danh mục<select value={category} onChange={(event) => { setCategory(event.target.value); setPage(1); }}><option value="">Tất cả danh mục</option>{categories.map((name) => <option key={name} value={name}>{name}</option>)}</select></label><label>Khả dụng<select value={availability} onChange={(event) => { setAvailability(event.target.value); setPage(1); }}><option value="">Tất cả</option><option value="available">Còn khả dụng</option><option value="empty">Hết khả dụng</option></select></label><button type="button" onClick={() => { setSearch(''); setCategory(''); setAvailability(''); setPage(1); }}>Xóa bộ lọc</button></div>}
        {loading ? <p className="fg-empty">Đang tải tồn kho...</p> : filtered.length === 0 ? <p className="fg-empty">Không có SKU phù hợp. {canConfigure && <Link to="/warehouse/products/new">Cấu hình sản phẩm</Link>}</p> : <div className="fg-table-scroll"><table className="fg-stock-table"><thead><tr><th>Sản phẩm / SKU</th><th>Tồn thực tế</th><th>Tạm giữ</th><th>Khả dụng</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{visible.map(({ product, sku }) => {
          const availableQty = sku ? Number(sku.pickableQty || 0) : 0;
          return <tr key={`${product.id}:${sku?.id || 'no-sku'}`}>
            <td data-label="Sản phẩm / SKU"><div className="fg-product-cell">{product.thumbnailUrl ? <img src={product.thumbnailUrl} alt="" /> : <span className="fg-product-placeholder"><Box size={20} /></span>}<div><strong>{product.productName}</strong><small>{product.productCode} · {sku ? `${sku.skuCode} · ${sku.color || '—'} / ${sku.size || '—'}` : 'Chưa có SKU'}</small></div></div></td>
            <td data-label="Tồn thực tế" className="fg-number">{number(sku?.onHandQty)}</td><td data-label="Tạm giữ" className="fg-number">{number(sku?.reservedQty)}</td><td data-label="Khả dụng" className="fg-number fg-available-number">{number(availableQty)}</td>
            <td data-label="Trạng thái"><span className={`fg-status ${!product.isActive || !sku?.isActive ? 'muted' : availableQty ? 'ready' : 'empty'}`}>{!sku ? 'Chưa có SKU' : !product.isActive || !sku.isActive ? 'Ngừng sử dụng' : availableQty ? 'Còn hàng' : 'Hết khả dụng'}</span></td>
            <td data-label="Thao tác"><div className="fg-row-actions"><button type="button" onClick={() => openDetail(product, sku)}>Chi tiết</button>{canIssue && sku && <button type="button" disabled={!product.isActive || !sku.isActive || availableQty === 0} onClick={() => onIssue(product, sku)}>Xuất kho</button>}</div></td>
          </tr>;
        })}</tbody></table></div>}
        <div className="fg-pagination"><span>Hiển thị {visible.length ? (currentPage - 1) * pageSize + 1 : 0}–{Math.min(currentPage * pageSize, filtered.length)} / {filtered.length} dòng</span>{pageCount > 1 && <div><button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Trước</button><span>Trang {currentPage}/{pageCount}</span><button type="button" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Sau</button></div>}</div>
      </div>
    </section>
  </>;
}
