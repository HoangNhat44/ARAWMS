import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { productService } from '../services/productService';

const sizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'FREESIZE'];
const blank = { productName: '', sampleCode: '', category: '', description: '', basePrice: '' };
const variantKey = (color, size) => `${color.trim().toLocaleLowerCase('vi-VN')}:${size}`;

export default function ProductConfigurationPage() {
  const { id: routeId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const requestId = useRef(crypto.randomUUID());
  const draftRef = useRef(null);
  const [mode, setMode] = useState(routeId || location.state?.mode === 'existing' ? 'existing' : 'new');
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  const [skuSearch, setSkuSearch] = useState('');
  const [showVariantPanel, setShowVariantPanel] = useState(false);
  const [showCombinations, setShowCombinations] = useState(false);
  const [bulkPrice, setBulkPrice] = useState('');
  const [showFieldErrors, setShowFieldErrors] = useState(false);
  const [catalog, setCatalog] = useState(blank);
  const [colors, setColors] = useState('');
  const [selectedSizes, setSelectedSizes] = useState([]);
  const [excluded, setExcluded] = useState([]);
  const [prices, setPrices] = useState({});
  const [files, setFiles] = useState({ image: null, video: null, additional: [] });
  const [pendingMedia, setPendingMedia] = useState([]);
  const [selected, setSelected] = useState(null);
  const [selectedSkuIds, setSelectedSkuIds] = useState([]);
  const [skuPrices, setSkuPrices] = useState({});
  const [editingCatalog, setEditingCatalog] = useState(false);
  const [newVariant, setNewVariant] = useState({ color: '', size: 'M', retailPrice: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    productService.list().then((response) => setProducts(response.data.products)).catch((requestError) => setError(requestError.message));
  }, []);
  useEffect(() => {
    if (!routeId) return;
    productService.getConfiguration(routeId).then((response) => {
      setSelected(response.data);
      setSkuPrices(Object.fromEntries(response.data.skus.map((sku) => [sku.id || sku._id, String(sku.retailPrice)])));
      const product = response.data.product;
      setCatalog({ productName: product.productName, sampleCode: product.sampleCode || '', category: product.category,
        description: product.description || '', basePrice: String(product.basePrice) });
    }).catch((requestError) => setError(requestError.message));
  }, [routeId]);

  const colorList = useMemo(() => [...new Set(colors.split(/[\n,]+/).map((value) => value.trim()).filter(Boolean))], [colors]);
  const combinations = useMemo(() => colorList.flatMap((color) => selectedSizes.map((size) => ({ color, size, key: variantKey(color, size) }))), [colorList, selectedSizes]);
  const candidates = useMemo(() => products.filter((product) =>
    `${product.productCode} ${product.productName} ${product.skus.map((sku) => sku.skuCode).join(' ')}`.toLocaleLowerCase('vi-VN').includes(search.toLocaleLowerCase('vi-VN'))
  ), [products, search]);
  const filteredSkus = useMemo(() => (selected?.skus || []).filter((sku) =>
    `${sku.skuCode} ${sku.color} ${sku.size}`.toLocaleLowerCase('vi-VN').includes(skuSearch.toLocaleLowerCase('vi-VN'))
  ), [selected, skuSearch]);
  const selectableSkuIds = filteredSkus.filter((sku) => sku.isActive && selected?.product.isActive).map((sku) => sku.id || sku._id);
  const activeCombinations = combinations.filter((item) => !excluded.includes(item.key));
  const matchingVariant = selected?.skus.find((sku) => variantKey(sku.color, sku.size) === variantKey(newVariant.color, newVariant.size));

  const loadSelected = async (id) => {
    setBusy(true); setError('');
    try {
      const response = await productService.getConfiguration(id);
      setSelected(response.data);
      setSkuPrices(Object.fromEntries(response.data.skus.map((sku) => [sku.id || sku._id, String(sku.retailPrice)])));
      setSelectedSkuIds([]);
      setEditingCatalog(false);
      setShowVariantPanel(false);
      setShowFieldErrors(false);
      const product = response.data.product;
      setCatalog({ productName: product.productName, sampleCode: product.sampleCode || '', category: product.category,
        description: product.description || '', basePrice: String(product.basePrice) });
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  };

  const uploadFiles = async (productId, media) => {
    const failed = [];
    for (const item of media) {
      try {
        if (item.kind === 'additional') await productService.uploadAdditionalImage(productId, item.file);
        else await productService.upload(productId, item.kind, item.file);
      } catch (requestError) {
        failed.push(item);
        setError((previous) => [previous, `${item.file.name}: ${requestError.message}`].filter(Boolean).join(' '));
      }
    }
    setPendingMedia(failed);
    return failed;
  };

  const saveNew = async (status) => {
    if (busy) return;
    const variants = combinations.filter((item) => !excluded.includes(item.key)).map((item) => ({
      color: item.color, size: item.size, retailPrice: prices[item.key] === undefined || prices[item.key] === '' ? Number(catalog.basePrice) : Number(prices[item.key]),
    }));
    if (!catalog.productName.trim() || !catalog.category.trim() || !catalog.sampleCode.trim() || catalog.basePrice === '' || variants.length === 0) {
      setShowFieldErrors(true);
      setError('Nhập đủ thông tin sản phẩm và chọn ít nhất một tổ hợp màu–size.'); return;
    }
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await productService.configure({ ...catalog, basePrice: Number(catalog.basePrice), status, requestId: requestId.current, variants });
      const product = response.data.product;
      const media = [files.image && { kind: 'image', file: files.image }, files.video && { kind: 'video', file: files.video },
        ...files.additional.map((file) => ({ kind: 'additional', file }))].filter(Boolean);
      const failed = await uploadFiles(product.id || product._id, media);
      setFiles({ image: null, video: null, additional: [] });
      await loadSelected(product.id || product._id);
      productService.list().then((result) => setProducts(result.data.products)).catch(() => {});
      if (status === 'ACTIVE') setSelectedSkuIds(response.data.skus.map((sku) => sku.id || sku._id));
      setMode('existing');
      draftRef.current = null;
      setMessage(failed.length ? 'Đã lưu cấu hình; một số tệp chưa tải lên, có thể thử lại.' : status === 'DRAFT' ? `Đã lưu nháp ${product.productCode}. Có thể kích hoạt sản phẩm khi sẵn sàng nhập kho.` : `Đã lưu ${product.productCode} với ${response.data.skus.length} SKU. Chọn SKU để chuyển sang kiểm nhận.`);
      if (status === 'ACTIVE' && !failed.length) navigate('/warehouse/finished-goods', { state: { receiveSkuIds: response.data.skus.map((sku) => sku.id || sku._id) } });
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  };

  const saveCatalog = async (status) => {
    if (!selected || busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      await productService.updateConfiguration(selected.product.id || selected.product._id, { ...catalog, basePrice: Number(catalog.basePrice), status });
      const media = [files.image && { kind: 'image', file: files.image }, files.video && { kind: 'video', file: files.video },
        ...files.additional.map((file) => ({ kind: 'additional', file }))].filter(Boolean);
      const failed = await uploadFiles(selected.product.id || selected.product._id, media);
      setFiles({ image: null, video: null, additional: [] });
      const previouslySelected = selectedSkuIds;
      await loadSelected(selected.product.id || selected.product._id);
      setSelectedSkuIds(previouslySelected);
      setMessage(failed.length ? 'Đã lưu thông tin; một số tệp chưa tải lên.' : 'Đã cập nhật thông tin sản phẩm.');
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  };

  const addVariant = async () => {
    if (!selected || busy) return;
    setBusy(true); setError('');
    try {
      const response = await productService.addVariants(selected.product.id || selected.product._id, [{
        color: newVariant.color, size: newVariant.size,
        retailPrice: newVariant.retailPrice === '' ? undefined : Number(newVariant.retailPrice),
      }]);
      const previouslySelected = selectedSkuIds;
      await loadSelected(selected.product.id || selected.product._id);
      setSelectedSkuIds([...previouslySelected, ...response.data.skus.map((sku) => sku.id || sku._id)]);
      setNewVariant({ color: '', size: 'M', retailPrice: '' });
      setShowVariantPanel(false);
      setMessage('Đã thêm biến thể mới vào sản phẩm.');
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  };

  const startNew = () => {
    requestId.current = crypto.randomUUID();
    draftRef.current = null;
    setMode('new'); setSelected(null); setSelectedSkuIds([]);
    setCatalog(blank); setColors(''); setSelectedSizes([]); setExcluded([]); setPrices({});
    setFiles({ image: null, video: null, additional: [] }); setPendingMedia([]);
    setError(''); setMessage(''); setShowCombinations(false); setShowFieldErrors(false);
  };

  const saveSkuPrice = async (sku) => {
    const skuId = sku.id || sku._id;
    if (!selected || busy) return;
    setBusy(true); setError('');
    try {
      const response = await productService.updateSkuPrice(selected.product.id || selected.product._id, skuId, Number(skuPrices[skuId]));
      setSelected((current) => ({ ...current, skus: current.skus.map((item) => (item.id || item._id) === skuId ? response.data.sku : item) }));
      setMessage(`Đã cập nhật giá ${sku.skuCode}.`);
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  };

  const switchMode = (nextMode) => {
    if (nextMode === mode) return;
    if (mode === 'new' && (catalog.productName || catalog.sampleCode || colors || selectedSizes.length || files.image || files.additional.length) &&
      !window.confirm('Dữ liệu cấu hình mới chưa lưu. Chuyển chế độ? Dữ liệu sẽ được giữ để bạn quay lại.')) return;
    if (mode === 'new') draftRef.current = { catalog, colors, selectedSizes, excluded, prices, files, showCombinations, requestId: requestId.current };
    if (nextMode === 'new') {
      if (draftRef.current) {
        const draft = draftRef.current;
        setCatalog(draft.catalog); setColors(draft.colors); setSelectedSizes(draft.selectedSizes);
        setExcluded(draft.excluded); setPrices(draft.prices); setFiles(draft.files);
        setShowCombinations(draft.showCombinations); requestId.current = draft.requestId;
      } else startNew();
    }
    setMode(nextMode);
    setError('');
  };

  const catalogFields = <div className="product-fields">
    <label className="product-field product-field-wide">Tên sản phẩm <b>*</b><input value={catalog.productName} maxLength={200} placeholder="Ví dụ: Áo thun cổ tròn basic" onChange={(event) => setCatalog({ ...catalog, productName: event.target.value })} />{showFieldErrors && !catalog.productName.trim() && <small className="product-field-error">Vui lòng nhập tên sản phẩm.</small>}</label>
    <label className="product-field">Mã mẫu <b>*</b><input value={catalog.sampleCode} maxLength={64} placeholder="Ví dụ: AT-001" onChange={(event) => setCatalog({ ...catalog, sampleCode: event.target.value.toUpperCase() })} />{showFieldErrors && !/^[A-Z0-9_-]{2,64}$/.test(catalog.sampleCode.trim()) && <small className="product-field-error">Mã mẫu cần 2–64 ký tự chữ, số, _ hoặc -.</small>}</label>
    <label className="product-field">Danh mục <b>*</b><input list="product-categories" value={catalog.category} maxLength={100} placeholder="Chọn hoặc nhập danh mục" onChange={(event) => setCatalog({ ...catalog, category: event.target.value })} /><datalist id="product-categories">{[...new Set(products.map((item) => item.category).filter(Boolean))].map((category) => <option key={category} value={category} />)}</datalist>{showFieldErrors && !catalog.category.trim() && <small className="product-field-error">Vui lòng chọn danh mục.</small>}</label>
    <label className="product-field">Giá bán cơ bản (₫) <b>*</b><input type="number" min="0" step="1" value={catalog.basePrice} placeholder="0" onChange={(event) => setCatalog({ ...catalog, basePrice: event.target.value })} />{showFieldErrors && (catalog.basePrice === '' || Number(catalog.basePrice) < 0) && <small className="product-field-error">Nhập giá bán từ 0 ₫.</small>}</label>
    <label className="product-field product-field-wide">Mô tả<textarea rows={3} maxLength={2000} value={catalog.description} placeholder="Thông tin nhận diện sản phẩm" onChange={(event) => setCatalog({ ...catalog, description: event.target.value })} /></label>
  </div>;
  const mediaFields = <div className="product-media-fields">
    <label className="product-upload">Ảnh đại diện<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setFiles((current) => ({ ...current, image: event.target.files?.[0] || null }))} /></label>
    {files.image && <span className="product-file-name">{files.image.name} <button type="button" onClick={() => setFiles((current) => ({ ...current, image: null }))}>Bỏ chọn</button></span>}
    <label className="product-upload">Ảnh bổ sung<input type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={(event) => setFiles((current) => ({ ...current, additional: [...(event.target.files || [])] }))} /></label>
    {files.additional.length > 0 && <span className="product-file-name">Đã chọn {files.additional.length} ảnh <button type="button" onClick={() => setFiles((current) => ({ ...current, additional: [] }))}>Bỏ chọn</button></span>}
    <label className="product-upload">Video sản phẩm<input type="file" accept="video/mp4,video/webm" onChange={(event) => setFiles((current) => ({ ...current, video: event.target.files?.[0] || null }))} /></label>
    <small>Ảnh JPG, PNG, WebP tối đa 10 MB. Video MP4, WebM tối đa 100 MB. Tệp được tải lên sau khi lưu sản phẩm.</small>
  </div>;

  return <main className="product-workspace">
    <nav className="product-breadcrumb" aria-label="Đường dẫn"><Link to="/warehouse/finished-goods">Kho thành phẩm</Link><span>/</span><span>Nhập từ xưởng</span><span>/</span><strong>Cấu hình sản phẩm</strong></nav>
    <header className="product-page-head"><div><p className="product-eyebrow">QUẢN LÝ KHO · NHẬP TỪ XƯỞNG</p><h1>Cấu hình sản phẩm</h1><p>Chọn mẫu và biến thể sản phẩm để tiếp tục kiểm nhận hàng từ xưởng.</p></div></header>
    <ol className="product-steps" aria-label="Tiến trình nhập kho"><li className="current"><span>01</span>Cấu hình sản phẩm</li><li><span>02</span>Kiểm nhận</li><li><span>03</span>Xác nhận nhập kho</li></ol>
    <div className="product-mode-grid">
      <button type="button" className={`product-mode ${mode === 'new' ? 'active' : ''}`} aria-pressed={mode === 'new'} onClick={() => switchMode('new')}><span className="product-mode-icon">＋</span><span><strong>Tạo sản phẩm mới</strong><small>Mẫu sản phẩm chưa có trong danh mục</small></span><span className="product-mode-check">✓</span></button>
      <button type="button" className={`product-mode ${mode === 'existing' ? 'active' : ''}`} aria-pressed={mode === 'existing'} onClick={() => switchMode('existing')}><span className="product-mode-icon">▤</span><span><strong>Sản phẩm hiện có</strong><small>Nhập thêm hàng cho mẫu đã được lưu</small></span><span className="product-mode-check">✓</span></button>
    </div>
    {error && <p className="ara-alert ara-alert-error" role="alert">{error}</p>}
    {message && <p className="ara-alert ara-alert-success" role="status">{message}</p>}
    {pendingMedia.length > 0 && selected && <button className="btn-ara-secondary" type="button" disabled={busy} onClick={() => uploadFiles(selected.product.id || selected.product._id, pendingMedia)}>Thử tải lại {pendingMedia.length} tệp</button>}

    {mode === 'new' ? <div className="product-layout">
      <div className="product-main-column">
        <section className="product-card"><div className="product-card-head"><div><span className="product-section-number">01</span><h2>Thông tin chung</h2></div><p>Nhận diện mẫu sản phẩm trong danh mục.</p></div>{catalogFields}<div className="product-readonly"><span>Mã sản phẩm</span><strong>Tự động tạo khi lưu</strong></div></section>
        <section className="product-card"><div className="product-card-head"><div><span className="product-section-number">02</span><h2>Màu sắc và kích cỡ</h2></div><p>Tạo các tổ hợp thực tế của mẫu.</p></div>
          <label className="product-field">Màu sắc <b>*</b><textarea rows={2} value={colors} onChange={(event) => setColors(event.target.value)} placeholder="Nhập màu, ngăn cách bằng dấu phẩy. Ví dụ: Trắng, Đen" />{showFieldErrors && !colorList.length && <small className="product-field-error">Nhập ít nhất một màu.</small>}</label>
          <div className="product-chips">{colorList.map((color) => <span className="product-chip" key={color}>{color}</span>)}</div>
          <span className="product-field-label">Kích cỡ <b>*</b></span><div className="product-size-list">{sizes.map((size) => <label className={`product-size ${selectedSizes.includes(size) ? 'active' : ''}`} key={size}><input type="checkbox" checked={selectedSizes.includes(size)} onChange={(event) => setSelectedSizes((current) => event.target.checked ? [...current, size] : current.filter((item) => item !== size))} />{size}</label>)}</div>{showFieldErrors && !selectedSizes.length && <small className="product-field-error">Chọn ít nhất một kích cỡ.</small>}
          <button type="button" className="btn-ara-secondary" disabled={!combinations.length} onClick={() => setShowCombinations(true)}>Tạo danh sách biến thể ({combinations.length})</button>
          {showCombinations && <div className="product-variant-block"><div className="product-variant-toolbar"><strong>Danh sách biến thể đề xuất</strong><div className="product-apply-price"><input aria-label="Giá áp dụng cho tất cả" type="number" min="0" value={bulkPrice} placeholder="Giá cho tất cả (₫)" onChange={(event) => setBulkPrice(event.target.value)} /><button type="button" className="btn-ara-secondary" disabled={bulkPrice === ''} onClick={() => setPrices((current) => ({ ...current, ...Object.fromEntries(combinations.map((item) => [item.key, bulkPrice])) }))}>Áp dụng</button></div></div>
            <div className="product-table-scroll"><table className="product-table"><thead><tr><th>Sử dụng</th><th>Màu</th><th>Size</th><th>Mã SKU</th><th>Giá bán (₫)</th></tr></thead><tbody>{combinations.map((item) => <tr key={item.key}><td><input type="checkbox" aria-label={`Sử dụng ${item.color} ${item.size}`} checked={!excluded.includes(item.key)} onChange={(event) => setExcluded((current) => event.target.checked ? current.filter((key) => key !== item.key) : [...current, item.key])} /></td><td>{item.color}</td><td>{item.size}</td><td className="product-muted">Tự động tạo</td><td><input type="number" min="0" step="1" aria-label={`Giá ${item.color} ${item.size}`} placeholder={catalog.basePrice || 'Giá cơ bản'} value={prices[item.key] ?? ''} onChange={(event) => setPrices((current) => ({ ...current, [item.key]: event.target.value }))} /></td></tr>)}</tbody></table></div><p className="product-count">Đã chọn {activeCombinations.length} biến thể</p>{showFieldErrors && !activeCombinations.length && <small className="product-field-error">Chọn ít nhất một biến thể để lưu.</small>}
          </div>}
        </section>
      </div>
      <aside className="product-side-column"><section className="product-card"><div className="product-card-head"><h2>Hình ảnh sản phẩm</h2></div><div className="product-image-placeholder">{files.image ? <span>{files.image.name}</span> : <span>Ảnh đại diện<br /><small>Chưa chọn ảnh</small></span>}</div>{mediaFields}</section><section className="product-card product-summary"><h2>Tóm tắt cấu hình</h2><dl><div><dt>Sản phẩm</dt><dd>{catalog.productName || 'Chưa nhập tên'}</dd></div><div><dt>Biến thể đã chọn</dt><dd>{activeCombinations.length}</dd></div><div><dt>Trạng thái</dt><dd>Chưa lưu</dd></div></dl><p>Barcode riêng từng chiếc được tạo sau khi xác nhận số lượng đạt nhập kho.</p></section></aside>
      <div className="product-action-bar"><span>{busy ? 'Đang lưu cấu hình...' : 'Cấu hình chưa được lưu'}</span><div><Link className="btn-ara-secondary" to="/warehouse/finished-goods">Hủy</Link><button className="btn-ara-secondary" disabled={busy} type="button" onClick={() => saveNew('DRAFT')}>Lưu nháp</button><button className="btn-ara-gold" disabled={busy} type="button" onClick={() => saveNew('ACTIVE')}>Lưu và tiếp tục kiểm nhận →</button></div></div>
    </div> : !selected ? <section className="product-card product-search-card"><div className="product-card-head"><div><span className="product-section-number">01</span><h2>Tìm sản phẩm</h2></div><p>Chọn mẫu đã lưu để nhập thêm hàng.</p></div><input className="product-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm theo tên sản phẩm, mã sản phẩm hoặc mã SKU…" />
      <div className="product-result-list">{candidates.length ? candidates.map((product) => <button type="button" className="product-result" key={product.id} disabled={busy} onClick={() => loadSelected(product.id)}><span className="product-result-image">{product.thumbnailUrl ? <img src={product.thumbnailUrl} alt="" /> : 'ARA'}</span><span><strong>{product.productName}</strong><small>{product.productCode} · {product.category} · {product.skus.length} SKU</small></span><span className={`product-badge ${product.isActive ? 'active' : ''}`}>{product.isActive ? 'Đang sử dụng' : 'Nháp'}</span><span className="product-result-action">Chọn sản phẩm →</span></button>) : <div className="product-empty"><strong>Không tìm thấy sản phẩm</strong><p>Thử từ khóa khác hoặc tạo mẫu mới.</p><button type="button" className="btn-ara-secondary" onClick={startNew}>Tạo sản phẩm mới</button></div>}</div>
    </section> : <div className="product-layout">
      <div className="product-main-column"><section className="product-card product-identity"><span className="product-result-image">{selected.product.thumbnailUrl ? <img src={selected.product.thumbnailUrl} alt="" /> : 'ARA'}</span><div><small>{selected.product.productCode} · {selected.product.category}</small><h2>{selected.product.productName}</h2><span className={`product-badge ${selected.product.isActive ? 'active' : ''}`}>{selected.product.isActive ? 'Đang sử dụng' : 'Nháp'}</span></div><button type="button" className="btn-ara-secondary" onClick={() => { setSelected(null); setSelectedSkuIds([]); }}>Chọn sản phẩm khác</button></section>
        <section className="product-card"><div className="product-card-head"><div><span className="product-section-number">02</span><h2>Chọn biến thể được xưởng giao</h2></div><button type="button" className="btn-ara-secondary" onClick={() => setShowVariantPanel(true)}>+ Thêm biến thể</button></div><p className="product-muted">Chỉ chọn SKU có trong đợt giao này. Số lượng được kiểm nhận ở bước tiếp theo.</p><input className="product-search" value={skuSearch} onChange={(event) => setSkuSearch(event.target.value)} placeholder="Tìm mã SKU, màu hoặc size…" />
          <div className="product-table-scroll"><table className="product-table product-sku-table"><thead><tr><th><input type="checkbox" aria-label="Chọn tất cả SKU đang lọc" disabled={!selectableSkuIds.length} checked={selectableSkuIds.length > 0 && selectableSkuIds.every((id) => selectedSkuIds.includes(id))} onChange={(event) => setSelectedSkuIds((current) => event.target.checked ? [...new Set([...current, ...selectableSkuIds])] : current.filter((id) => !selectableSkuIds.includes(id)))} /></th><th>Mã SKU</th><th>Màu</th><th>Size</th><th>Trạng thái</th></tr></thead><tbody>{filteredSkus.map((sku) => <tr key={sku.id || sku._id}><td><input type="checkbox" aria-label={`Chọn ${sku.skuCode}`} disabled={!sku.isActive || !selected.product.isActive} checked={selectedSkuIds.includes(sku.id || sku._id)} onChange={(event) => setSelectedSkuIds((current) => event.target.checked ? [...current, sku.id || sku._id] : current.filter((id) => id !== (sku.id || sku._id)))} /></td><td data-label="Mã SKU"><strong>{sku.skuCode}</strong></td><td data-label="Màu">{sku.color}</td><td data-label="Size">{sku.size}</td><td data-label="Trạng thái"><span className={`product-badge ${sku.isActive ? 'active' : ''}`}>{sku.isActive ? 'Đang sử dụng' : 'Ngừng sử dụng'}</span></td></tr>)}</tbody></table>{!filteredSkus.length && <p className="product-empty">Không có SKU phù hợp.</p>}</div><p className="product-count">Đã chọn {selectedSkuIds.length} biến thể</p>
        </section>
        <section className="product-card"><div className="product-card-head"><h2>Chỉnh sửa sản phẩm</h2><button type="button" className="btn-ara-secondary" onClick={() => setEditingCatalog((current) => !current)}>{editingCatalog ? 'Đóng chỉnh sửa' : 'Chỉnh sửa thông tin'}</button></div>{editingCatalog && <div>{catalogFields}{mediaFields}<div className="product-inline-actions"><button type="button" className="btn-ara-secondary" disabled={busy} onClick={() => saveCatalog('DRAFT')}>Lưu nháp</button><button type="button" className="btn-ara-gold" disabled={busy} onClick={() => saveCatalog('ACTIVE')}>Lưu thay đổi</button></div><h3>Giá từng SKU</h3><div className="product-price-list">{selected.skus.map((sku) => <div key={sku.id || sku._id}><span>{sku.skuCode} · {sku.color} / {sku.size}</span><input aria-label={`Giá ${sku.skuCode}`} type="number" min="0" value={skuPrices[sku.id || sku._id] ?? ''} onChange={(event) => setSkuPrices((current) => ({ ...current, [sku.id || sku._id]: event.target.value }))} /><button className="btn-ara-secondary" type="button" disabled={busy || skuPrices[sku.id || sku._id] === ''} onClick={() => saveSkuPrice(sku)}>Lưu giá</button></div>)}</div></div>}</section>
      </div>
      <aside className="product-side-column"><section className="product-card product-summary"><h2>Đợt kiểm nhận này</h2><p><strong>{selected.product.productName}</strong></p>{selectedSkuIds.length ? <ul>{selected.skus.filter((sku) => selectedSkuIds.includes(sku.id || sku._id)).map((sku) => <li key={sku.id || sku._id}>{sku.color} / {sku.size}<small>{sku.skuCode}</small></li>)}</ul> : <p>Chưa chọn biến thể.</p>}<p>Nhập số lượng thực nhận, đạt và trả sửa ở bước tiếp theo.</p></section></aside>
      <div className="product-action-bar"><span>{selectedSkuIds.length} biến thể đã chọn</span><div><button className="btn-ara-secondary" type="button" onClick={() => setSelected(null)}>Quay lại</button><button className="btn-ara-gold" type="button" disabled={busy || !selected.product.isActive || selectedSkuIds.length === 0} onClick={() => navigate('/warehouse/finished-goods', { state: { receiveSkuIds: selectedSkuIds } })}>Sử dụng {selectedSkuIds.length} SKU và tiếp tục →</button></div></div>
    </div>}
    {showVariantPanel && selected && <div className="product-drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowVariantPanel(false); }}><aside className="product-drawer" aria-label="Thêm biến thể"><div className="product-card-head"><h2>Thêm biến thể</h2><button type="button" className="product-close" onClick={() => setShowVariantPanel(false)} aria-label="Đóng">×</button></div><p className="product-muted">{selected.product.productCode} · {selected.product.productName}</p><label className="product-field">Màu sắc <b>*</b><input value={newVariant.color} onChange={(event) => setNewVariant({ ...newVariant, color: event.target.value })} placeholder="Ví dụ: Trắng" /></label><label className="product-field">Kích cỡ<select value={newVariant.size} onChange={(event) => setNewVariant({ ...newVariant, size: event.target.value })}>{sizes.map((size) => <option key={size}>{size}</option>)}</select></label><label className="product-field">Giá bán (₫)<input type="number" min="0" value={newVariant.retailPrice} onChange={(event) => setNewVariant({ ...newVariant, retailPrice: event.target.value })} placeholder={String(selected.product.basePrice)} /></label><div className="product-readonly"><span>Mã SKU</span><strong>Tự động tạo khi lưu</strong></div>{matchingVariant && <p className="ara-alert ara-alert-error">Tổ hợp đã tồn tại: {matchingVariant.skuCode}. Hãy chọn SKU này trong danh sách.</p>}<button className="btn-ara-gold" type="button" disabled={busy || !newVariant.color.trim() || Boolean(matchingVariant)} onClick={addVariant}>Thêm và chọn biến thể</button></aside></div>}
  </main>;
}
