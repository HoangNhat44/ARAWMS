/*
 * File: ProductConfigurationPage.jsx
 * Author: Duy Anh
 * Date: 2026-10-22
 * Description: Creates products manually or from Excel and edits existing product details.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { productService } from '../services/productService';
// import { useAuth } from '../hooks/useAuth';
import { offlineCatalogStore } from '../services/offlineCatalogStore';
import { previewProductWorkbook } from '../services/offlineProductWorkbook';
import { queueCatalogChange, syncCatalogChanges, getPendingCatalogChanges,
  retryCatalogChange, subscribeCatalogChanges, resolveCatalogOperation } from '../services/offlineCatalogSync';
import '../styles/productConfiguration.css';

// Mock user for testing (NO AUTH REQUIRED)
const mockUser = { _id: '507f1f77bcf86cd799439011', id: '507f1f77bcf86cd799439011', username: 'test', fullName: 'Test User', roles: ['OWNER', 'WAREHOUSE_MANAGER'] };

const sizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'FREESIZE'];
const blank = { productName: '', sampleCode: '', category: '', description: '', basePrice: '' };
const variantKey = (color, size) => `${color.trim().toLocaleLowerCase('vi-VN')}:${size}`;

/** Creates or edits a product and its size variants, including Excel import.
 * Carries selected SKUs into the finished-goods receiving step. */
export default function ProductConfigurationPage() {
  const { id: routeId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  // const { user, loading: authLoading } = useAuth();
  const user = mockUser;
  const authLoading = false;
  const ownerId = user?.id || user?._id;
  const requestId = useRef(crypto.randomUUID());
  const draftRef = useRef(null);
  const previousOwnerId = useRef(null);
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
  const [selected, setSelected] = useState(null);
  const [selectedSkuIds, setSelectedSkuIds] = useState([]);
  const [skuEdits, setSkuEdits] = useState({});
  const [editingCatalog, setEditingCatalog] = useState(false);
  const [newVariant, setNewVariant] = useState({ color: '', size: 'M', retailPrice: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [importFile, setImportFile] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const imagePreview = useMemo(() => files.image ? URL.createObjectURL(files.image) : null, [files.image]);
  useEffect(() => () => { if (imagePreview) URL.revokeObjectURL(imagePreview); }, [imagePreview]);
  const [pendingChanges, setPendingChanges] = useState([]);
  const [showPending, setShowPending] = useState(false);
  const [pendingTab, setPendingTab] = useState('waiting');
  const [draftReady, setDraftReady] = useState(false);
  const [draftNotice, setDraftNotice] = useState('');
  const [conflictView, setConflictView] = useState(null);
  const [resolvingOperationId, setResolvingOperationId] = useState(null);
  const draftKey = routeId ? `product:${routeId}` : mode === 'new' ? 'new-product' : selected?.product?.id ? `product:${selected.product.id}` : null;

  useEffect(() => {
    if (previousOwnerId.current && previousOwnerId.current !== ownerId) {
      setPendingChanges([]); setProducts([]); setSelected(null); setCatalog(blank);
      setFiles({ image: null, video: null, additional: [] }); setSkuEdits({});
    }
    previousOwnerId.current = ownerId || null;
  }, [ownerId]);

  useEffect(() => {
    if (!authLoading && !ownerId) navigate('/login', { replace: true });
  }, [authLoading, ownerId, navigate]);

  useEffect(() => {
    if (!ownerId) return undefined;
    const refresh = () => getPendingCatalogChanges(ownerId).then(setPendingChanges).catch((err) => setError(err.message));
    const run = () => syncCatalogChanges(ownerId).then(refresh).catch((err) => setError(err.message));
    refresh(); run();
    const unsubscribe = subscribeCatalogChanges(refresh);
    const onVisible = () => { if (document.visibilityState === 'visible') run(); };
    window.addEventListener('online', run); window.addEventListener('focus', run);
    document.addEventListener('visibilitychange', onVisible);
    return () => { unsubscribe(); window.removeEventListener('online', run); window.removeEventListener('focus', run);
      document.removeEventListener('visibilitychange', onVisible); };
  }, [ownerId]);
  useEffect(() => {
    if (!ownerId) return undefined;
    const refresh = (event) => {
      if (String(event.detail?.ownerId) === String(ownerId)) productService.list()
        .then((response) => setProducts(response.data.products)).catch(() => {});
    };
    window.addEventListener('arawms-catalog-synced', refresh);
    return () => window.removeEventListener('arawms-catalog-synced', refresh);
  }, [ownerId]);
  useEffect(() => {
    if (!ownerId) return undefined;
    const refresh = (event) => {
      const productId = String(event.detail?.productId || '');
      productService.list().then((response) => setProducts(response.data.products)).catch(() => {});
      if (!productId || String(selected?.product?.id || selected?.product?._id) !== productId) return;
      const hasLocalEdits = catalog.description !== (selected.product.description || '');
      if (hasLocalEdits) return;
      productService.getConfiguration(productId).then((response) => {
        setSelected(response.data);
        setCatalog((current) => ({ ...current, description: response.data.product.description || '' }));
      }).catch(() => {});
    };
    window.addEventListener('arawms-product-description-realtime', refresh);
    return () => window.removeEventListener('arawms-product-description-realtime', refresh);
  }, [ownerId, selected?.product?.id, selected?.product?._id, catalog.description]);

  useEffect(() => {
    if (!ownerId || !draftKey || (draftKey.startsWith('product:') && !selected)) return undefined;
    let active = true;
    setDraftReady(false);
    offlineCatalogStore.get('drafts', ownerId, draftKey).then((draft) => {
      if (!active) return;
      if (draft && window.confirm('Có bản nháp trên thiết bị. Tiếp tục bản nháp? Chọn Hủy để bỏ bản nháp.')) {
        setCatalog(draft.catalog); setColors(draft.colors || ''); setSelectedSizes(draft.selectedSizes || []);
        setExcluded(draft.excluded || []); setPrices(draft.prices || {});
        setFiles(draft.files || { image: null, video: null, additional: [] });
        if (draft.skuEdits) setSkuEdits(draft.skuEdits);
        setShowCombinations(Boolean(draft.showCombinations)); requestId.current = draft.requestId || crypto.randomUUID();
        setDraftNotice('Đã khôi phục bản nháp trên thiết bị.');
      } else if (draft) setDraftNotice('Bản nháp trên thiết bị vẫn được giữ lại.');
      setDraftReady(true);
    }).catch((err) => { setError(err.message); setDraftReady(true); });
    return () => { active = false; };
  }, [ownerId, draftKey, selected?.product?.id]);

  useEffect(() => {
    if (!ownerId || !draftReady || !draftKey) return undefined;
    if (mode === 'new' && !catalog.productName && !catalog.sampleCode && !colors && !selectedSizes.length &&
        !files.image && !files.additional.length && !files.video) return undefined;
    const timer = window.setTimeout(() => {
      offlineCatalogStore.put('drafts', ownerId, draftKey, { catalog, colors, selectedSizes, excluded,
        prices, files, skuEdits, showCombinations, requestId: requestId.current }).then(() =>
        setDraftNotice('Bản nháp trên máy đã được lưu.')).catch((err) => setError(err.message));
    }, 800);
    return () => window.clearTimeout(timer);
  }, [ownerId, draftReady, draftKey, mode, catalog, colors, selectedSizes, excluded, prices, files, skuEdits, showCombinations]);

  useEffect(() => {
    if (!message) return undefined;
    const timer = window.setTimeout(() => setMessage(''), 4000);
    return () => window.clearTimeout(timer);
  }, [message]);

  // Load available products so the existing-product picker can search them.
  useEffect(() => {
    if (!ownerId) return;
    productService.list().then(async (response) => {
      setProducts(response.data.products);
      await offlineCatalogStore.put('catalog', ownerId, 'products', response.data.products);
    }).catch(async () => {
      try { setProducts(await offlineCatalogStore.get('catalog', ownerId, 'products') || []); }
      catch (error) { setError(error.message); }
    });
  }, [ownerId]);
  // Restore the product selected by a direct edit URL.
  useEffect(() => {
    if (!routeId || !ownerId) return;
    productService.getConfiguration(routeId).then((response) => {
      offlineCatalogStore.put('catalog', ownerId, `product:${routeId}`, response.data).catch((error) => setError(error.message));
      setSelected(response.data);
      setSkuEdits(Object.fromEntries(response.data.skus.map((sku) => [sku.id || sku._id,
        { color: sku.color, size: sku.size, retailPrice: String(sku.retailPrice) }])));
      const product = response.data.product;
      setCatalog({ productName: product.productName, sampleCode: product.sampleCode || '', category: product.category,
        description: product.description || '', basePrice: String(product.basePrice) });
    }).catch(async () => {
      try {
        const cached = await offlineCatalogStore.get('catalog', ownerId, `product:${routeId}`);
        if (!cached) throw new Error('Sản phẩm này chưa được tải đầy đủ trên thiết bị.');
        setSelected(cached);
        setSkuEdits(Object.fromEntries(cached.skus.map((sku) => [sku.id || sku._id,
          { color: sku.color, size: sku.size, retailPrice: String(sku.retailPrice) }])));
        setCatalog({ productName: cached.product.productName, sampleCode: cached.product.sampleCode || '',
          category: cached.product.category, description: cached.product.description || '', basePrice: String(cached.product.basePrice) });
      } catch (error) { setError(error.message); }
    });
  }, [routeId, ownerId]);

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
  const activeOperations = pendingChanges.filter((item) => ['QUEUED', 'SYNCING', 'RETRY_WAIT', 'AUTH_REQUIRED'].includes(item.status));
  const actionOperations = pendingChanges.filter((item) => item.status === 'NEEDS_ACTION');
  const groupedCount = (items) => new Set(items.map((item) => item.serverEntityId || item.localEntityId || item.operationId)).size;
  const groupRows = (items) => [...items.reduce((groups, item) => {
    const key = item.serverEntityId || item.localEntityId || item.operationId;
    const group = groups.get(key) || [];
    group.push(item); groups.set(key, group); return groups;
  }, new Map()).values()].map((operations) => ({
    ...operations.slice().sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt))[0], operationCount: operations.length,
  }));
  const activeGroupRows = groupRows(activeOperations);
  const actionGroupRows = groupRows(actionOperations);
  const matchingVariant = selected?.skus.find((sku) => variantKey(sku.color, sku.size) === variantKey(newVariant.color, newVariant.size));

  /** Loads a product and its SKUs for editing or receiving selection. */
  const loadProductConfiguration = async (id) => {
    setBusy(true); setError('');
    try {
      let response;
      try {
        response = await productService.getConfiguration(id);
        await offlineCatalogStore.put('catalog', ownerId, `product:${id}`, response.data);
      } catch (requestError) {
        const cached = await offlineCatalogStore.get('catalog', ownerId, `product:${id}`);
        if (!cached) throw new Error('Sản phẩm này chưa được tải đầy đủ trên thiết bị.');
        response = { data: cached };
      }
      setSelected(response.data);
      setSkuEdits(Object.fromEntries(response.data.skus.map((sku) => [sku.id || sku._id,
        { color: sku.color, size: sku.size, retailPrice: String(sku.retailPrice) }])));
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

  /** The IndexedDB commit precedes sync; a lost response keeps the same immutable operation ID. */
  const submitCatalogChange = async (change, media = []) => {
    if (!ownerId) throw new Error('Cần đăng nhập trước khi lưu dữ liệu sản phẩm.');
    const operation = await queueCatalogChange(ownerId, change, media);
    await syncCatalogChanges(ownerId);
    let saved = (await getPendingCatalogChanges(ownerId)).find((item) => item.operationId === operation.operationId);
    if (saved?.status === 'NEEDS_ACTION') {
      setPendingTab('action'); setShowPending(true);
      throw new Error(saved.errorCode === 'VERSION_CONFLICT'
        ? 'Sản phẩm đã có thay đổi trên hệ thống. Cần kiểm tra trước khi lưu.'
        : `${saved.lastError}. Dữ liệu vẫn được giữ trong mục Cần xử lý.`);
    }
    if (resolvingOperationId) {
      const all = await getPendingCatalogChanges(ownerId);
      const original = all.find((item) => item.operationId === resolvingOperationId);
      for (const related of all.filter((item) => item.status === 'NEEDS_ACTION' && item.serverEntityId === original?.serverEntityId)) {
        await resolveCatalogOperation(ownerId, related, 'SUPERSEDED', { supersededBy: operation.operationId });
      }
      setResolvingOperationId(null);
      setConflictView(null);
      await syncCatalogChanges(ownerId);
      saved = (await getPendingCatalogChanges(ownerId)).find((item) => item.operationId === operation.operationId);
    }
    setMessage(saved?.status === 'DONE' ? 'Đã đồng bộ.' : 'Đã lưu trên thiết bị — sẽ đồng bộ khi kết nối trở lại.');
    return saved;
  };

  const inspectConflict = async (operation) => {
    try {
      const response = operation.serverEntityId ? await productService.getConfiguration(operation.serverEntityId) : null;
      setConflictView({ operation, current: response?.data || null, selections: {} });
    } catch (error) { setError(error.message); }
  };

  const useCurrentCatalog = async () => {
    const { operation, current } = conflictView;
    if (!window.confirm('Bỏ các thay đổi cục bộ của thao tác này? Dữ liệu trên hệ thống sẽ được giữ nguyên.')) return;
    await resolveCatalogOperation(ownerId, operation, 'DISCARDED');
    const related = (await getPendingCatalogChanges(ownerId)).filter((item) => item.status === 'NEEDS_ACTION' && item.serverEntityId === operation.serverEntityId);
    for (const item of related) await resolveCatalogOperation(ownerId, item, 'DISCARDED');
    if (current) await loadProductConfiguration(operation.serverEntityId);
    setConflictView(null);
  };

  const editConflictingChange = async () => {
    const { operation, current } = conflictView;
    const selectedPayload = Object.fromEntries(Object.entries(operation.payload).filter(([key]) => conflictView.selections?.[key] !== 'current'));
    if (!current) {
      setMode('new'); setSelected(null);
      setCatalog({ ...blank, ...selectedPayload, basePrice: String(selectedPayload.basePrice ?? '') });
      setColors((selectedPayload.variants || []).map((item) => item.color).join(', '));
      setSelectedSizes([...new Set((selectedPayload.variants || []).map((item) => item.size))]);
    } else {
      await loadProductConfiguration(operation.serverEntityId);
      if (operation.operationType === 'UPDATE_PRODUCT') {
        setCatalog((value) => ({ ...value, ...selectedPayload,
          basePrice: String(selectedPayload.basePrice ?? value.basePrice) }));
        setEditingCatalog(true);
      } else if (['UPDATE_SKU_PRICE', 'UPDATE_SKU'].includes(operation.operationType)) {
        setSkuEdits((value) => ({ ...value, [operation.payload.skuId]: { ...value[operation.payload.skuId],
          ...selectedPayload, retailPrice: selectedPayload.retailPrice == null
            ? value[operation.payload.skuId]?.retailPrice : String(selectedPayload.retailPrice) } }));
        setEditingCatalog(true);
      } else if (operation.operationType === 'ADD_VARIANTS') {
        const variant = selectedPayload.variants[0];
        setNewVariant({ color: variant.color, size: variant.size, retailPrice: String(variant.retailPrice ?? '') });
        setShowVariantPanel(true);
      }
    }
    setResolvingOperationId(operation.operationId);
    setConflictView(null);
  };

  /** Creates a product and its color and size SKUs before uploading media. */
  const createProductConfiguration = async (status) => {
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
      const media = [files.image && { kind: 'image', file: files.image }, files.video && { kind: 'video', file: files.video },
        ...files.additional.map((file) => ({ kind: 'additional', file }))].filter(Boolean);
      const saved = await submitCatalogChange({ operationType: 'CREATE', localEntityId: requestId.current,
        payload: { ...catalog, basePrice: Number(catalog.basePrice), status, variants }, label: catalog.productName }, media);
      await offlineCatalogStore.remove('drafts', ownerId, 'new-product');
      if (saved?.status === 'DONE') {
        const product = saved.serverResult.product;
        const productId = product.id || product._id;
        await loadProductConfiguration(productId);
        productService.list().then((result) => setProducts(result.data.products)).catch(() => {});
        if (status === 'ACTIVE') setSelectedSkuIds(saved.serverResult.skus.map((sku) => sku.id || sku._id));
        setMode('existing');
        if (status === 'ACTIVE') navigate('/warehouse/finished-goods', {
          state: { configuredSkuIds: saved.serverResult.skus.map((sku) => sku.id || sku._id) } });
      } else {
        startNewProduct();
        setMessage('Đã lưu trên thiết bị — sẽ đồng bộ khi kết nối trở lại.');
      }
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  };

  /** Saves an existing product's details and any new media. */
  const updateProductCatalog = async (status) => {
    if (!selected || busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const changed = Object.fromEntries(Object.entries({ ...catalog, basePrice: Number(catalog.basePrice), status }).filter(([key, value]) => {
        if (key === 'status') return value !== (selected.product.isActive ? 'ACTIVE' : 'DRAFT');
        if (key === 'sampleCode') return String(value || '').trim() !== String(selected.product.sampleCode || '').trim();
        return value !== selected.product[key];
      }));
      if (!Object.keys(changed).length && !files.image && !files.video && !files.additional.length) {
        setMessage('Không có thay đổi để lưu.'); return;
      }
      const media = [files.image && { kind: 'image', file: files.image }, files.video && { kind: 'video', file: files.video },
        ...files.additional.map((file) => ({ kind: 'additional', file }))].filter(Boolean);
      const baseline = Object.fromEntries(Object.keys(changed).map((key) => [key, selected.product[key] ?? (key === 'status' ? (selected.product.isActive ? 'ACTIVE' : 'DRAFT') : '')]));
      const saved = await submitCatalogChange({ operationType: 'UPDATE_PRODUCT', baseline,
        serverEntityId: selected.product.id || selected.product._id, baseVersion: selected.product.version ?? 0,
        payload: Object.keys(changed).length ? changed : { status: selected.product.isActive ? 'ACTIVE' : 'DRAFT' },
        label: selected.product.productName }, media);
      await offlineCatalogStore.remove('drafts', ownerId, `product:${selected.product.id || selected.product._id}`);
      if (saved?.status === 'DONE') {
        const previouslySelected = selectedSkuIds;
        await loadProductConfiguration(selected.product.id || selected.product._id);
        setSelectedSkuIds(previouslySelected);
        setFiles({ image: null, video: null, additional: [] });
      }
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  };

  /** Adds new color and size variants and selects a newly created SKU. */
  const addProductVariant = async () => {
    if (!selected || busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const variant = {
        color: newVariant.color, size: newVariant.size,
        retailPrice: newVariant.retailPrice === '' ? undefined : Number(newVariant.retailPrice),
      };
      const saved = await submitCatalogChange({ operationType: 'ADD_VARIANTS',
        serverEntityId: selected.product.id || selected.product._id, baseVersion: selected.product.version ?? 0,
        payload: { variants: [variant] }, label: `${selected.product.productName} · ${variant.color}/${variant.size}` });
      if (saved?.status === 'DONE') {
        const previouslySelected = selectedSkuIds;
        await loadProductConfiguration(selected.product.id || selected.product._id);
        setSelectedSkuIds([...previouslySelected, ...saved.serverResult.skus.map((sku) => sku.id || sku._id)]);
      }
      setNewVariant({ color: '', size: 'M', retailPrice: '' }); setShowVariantPanel(false);
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  };

  /** Resets the form and starts a new product creation request. */
  const startNewProduct = () => {
    requestId.current = crypto.randomUUID();
    draftRef.current = null;
    setMode('new'); setSelected(null); setSelectedSkuIds([]);
    setCatalog(blank); setColors(''); setSelectedSizes([]); setExcluded([]); setPrices({});
    setFiles({ image: null, video: null, additional: [] });
    setError(''); setMessage(''); setShowCombinations(false); setShowFieldErrors(false);
  };

  /** Keeps the reviewed workbook separate from the write request. */
  const previewExcelImport = async () => {
    if (!importFile || busy) return;
    setBusy(true); setError(''); setMessage(''); setImportPreview(null);
    try {
      const preview = await previewProductWorkbook(importFile, products.map((item) => item.category).filter(Boolean));
      setImportPreview(preview);
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  };

  /** Refreshes the catalog after the server commits the import. */
  const submitExcelImport = async () => {
    if (!importFile || !importPreview || !importPreview.products.length || busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const digest = await crypto.subtle.digest('SHA-256', await importFile.arrayBuffer());
      const fileHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
      for (const issue of importPreview.errors) {
        const operationId = `${fileHash.slice(0, 32)}_row_${issue.row}`;
        await offlineCatalogStore.put('operations', ownerId, operationId, {
          operationId, operationType: 'IMPORT_ROW_ERROR', ownerUserId: String(ownerId),
          localEntityId: operationId, payload: { fileName: importFile.name, row: issue.row },
          label: `${importFile.name} · dòng ${issue.row}`, status: 'REVIEW',
          retryCount: 0, lastError: issue.message, createdAt: Date.now(), updatedAt: Date.now(),
        });
      }
      for (const product of importPreview.products) {
        const operationId = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
          new TextEncoder().encode(`${fileHash}:${product.productCode}`))), (byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, 40);
        await queueCatalogChange(ownerId, { operationId, operationType: 'IMPORT_PRODUCT',
          localEntityId: operationId, payload: product, label: `${product.productCode} · dòng ${product.rows.join(', ')}` });
      }
      await syncCatalogChanges(ownerId);
      const result = await productService.list().catch(() => null);
      if (result) setProducts(result.data.products);
      setImportFile(null);
      setMessage(`Đã lưu ${importPreview.productCount} sản phẩm trên thiết bị. Kết quả từng dòng nằm trong mục dữ liệu chờ đồng bộ.`);
    } catch (requestError) {
      setError(requestError.message);
      // Preserve the reviewed rows and file when local persistence fails.
    } finally { setBusy(false); }
  };

  /** Updates a downloaded SKU while preserving its server-generated code and stock identity. */
  const updateSkuDetails = async (sku) => {
    const skuId = sku.id || sku._id;
    if (!selected || busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const edit = skuEdits[skuId];
      const changed = Object.fromEntries(['color', 'size', 'retailPrice'].filter((key) =>
        (key === 'retailPrice' ? Number(edit[key]) : edit[key]) !== sku[key]).map((key) =>
        [key, key === 'retailPrice' ? Number(edit[key]) : edit[key]]));
      if (!Object.keys(changed).length) { setMessage('Không có thay đổi SKU để lưu.'); return; }
      const saved = await submitCatalogChange({ operationType: 'UPDATE_SKU',
        serverEntityId: selected.product.id || selected.product._id, baseVersion: sku.version ?? 0,
        payload: { skuId, ...changed }, label: sku.skuCode });
      if (saved?.status === 'DONE') setSelected((current) => ({ ...current,
        skus: current.skus.map((item) => (item.id || item._id) === skuId ? saved.serverResult.sku : item) }));
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  };

  /** Switches between new and existing products while retaining the unsaved draft. */
  const switchProductMode = (nextMode) => {
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
      } else startNewProduct();
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
    {imagePreview && <img src={imagePreview} alt="Ảnh sản phẩm sẽ tải lên" style={{ maxWidth: 180, maxHeight: 180, objectFit: 'contain' }} />}
    <label className="product-upload">Ảnh bổ sung<input type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={(event) => setFiles((current) => ({ ...current, additional: [...(event.target.files || [])] }))} /></label>
    {files.additional.length > 0 && <span className="product-file-name">Đã chọn {files.additional.length} ảnh <button type="button" onClick={() => setFiles((current) => ({ ...current, additional: [] }))}>Bỏ chọn</button></span>}
    <label className="product-upload">Video sản phẩm<input type="file" accept="video/mp4,video/webm" onChange={(event) => setFiles((current) => ({ ...current, video: event.target.files?.[0] || null }))} /></label>
    <small>Ảnh JPG, PNG, WebP tối đa 10 MB. Video MP4, WebM tối đa 100 MB. Tệp được tải lên sau khi lưu sản phẩm.</small>
  </div>;

  // Toggle body class for selection mode
  useEffect(() => {
    if (selected && mode === 'existing') {
      document.body.classList.add('has-selection');
    } else {
      document.body.classList.remove('has-selection');
    }
    return () => document.body.classList.remove('has-selection');
  }, [selected, mode]);

  return <main className="ara-page">
    <nav className="ara-breadcrumb" aria-label="Đường dẫn">
      <Link to="/">Trang chủ</Link>
      <span className="ara-breadcrumb-separator">/</span>
      <Link to="/warehouse/finished-goods">Kho thành phẩm</Link>
      <span className="ara-breadcrumb-separator">/</span>
      <span>Cấu hình sản phẩm</span>
    </nav>

    <header className="ara-page-header">
      <p className="ara-eyebrow">QUẢN LÝ KHO · NHẬP TỪ XƯỞNG</p>
      <h1>Cấu hình sản phẩm</h1>
      <p className="ara-subtitle">Chọn mẫu và biến thể sản phẩm để tiếp tục kiểm nhận hàng từ xưởng.</p>
    </header>

    <ol className="ara-stepper" aria-label="Tiến trình nhập kho">
      <li className="ara-step-current"><span className="ara-step-number">01</span><span className="ara-step-label">Cấu hình sản phẩm</span></li>
      <li><span className="ara-step-number">02</span><span className="ara-step-label">Kiểm nhận</span></li>
      <li><span className="ara-step-number">03</span><span className="ara-step-label">Xác nhận nhập kho</span></li>
    </ol>

    {!selected && <>
      <div className="ara-mode-cards">
        <button type="button" className={`ara-mode-card ${mode === 'new' ? 'is-active' : ''}`} aria-pressed={mode === 'new'} onClick={() => switchProductMode('new')}>
          <span className="ara-mode-icon">＋</span>
          <div className="ara-mode-content">
            <strong className="ara-mode-title">Tạo sản phẩm mới</strong>
            <small className="ara-mode-desc">Mẫu sản phẩm chưa có trong danh mục</small>
          </div>
          <span className="ara-mode-check">✓</span>
        </button>
        <button type="button" className={`ara-mode-card ${mode === 'existing' ? 'is-active' : ''}`} aria-pressed={mode === 'existing'} onClick={() => switchProductMode('existing')}>
          <span className="ara-mode-icon">▤</span>
          <div className="ara-mode-content">
            <strong className="ara-mode-title">Sản phẩm hiện có</strong>
            <small className="ara-mode-desc">Nhập thêm hàng cho mẫu đã được lưu</small>
          </div>
          <span className="ara-mode-check">✓</span>
        </button>
      </div>
    </> }
    {error && <div className="ara-alert ara-alert-error" role="alert">{error}</div>}
    {message && <div className="ara-alert ara-alert-success" role="status">{message}</div>}
    {draftNotice && <div className="ara-alert ara-alert-info">{draftNotice}</div>}

    {mode === 'new' && <>
      <section className="product-card product-excel-import">
        <div className="product-card-head"><div><h2>Import sản phẩm từ Excel</h2><p>Dùng file .xlsx để thêm nhiều sản phẩm và biến thể.</p></div></div>
        <label className="product-upload">File Excel (.xlsx)<input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy} onChange={(event) => { setImportFile(event.target.files?.[0] || null); setImportPreview(null); setError(''); }} /></label>
        <p className="product-muted">Số lượng trong file không được ghi vào tồn kho. Hàng được kiểm nhận ở bước tiếp theo.</p>
        <div className="product-inline-actions"><button className="ara-btn ara-btn-secondary" type="button" disabled={!importFile || busy} onClick={previewExcelImport}>Kiểm tra file</button><button className="ara-btn ara-btn-gold" type="button" disabled={!importPreview?.products?.length || busy} onClick={submitExcelImport}>Import {importPreview?.productCount || 0} sản phẩm</button></div>
        {importPreview && <div className="product-import-preview"><p><strong>{importPreview.productCount} sản phẩm · {importPreview.variantCount} biến thể</strong></p>{importPreview.errors.length > 0 && <div className="ara-alert ara-alert-error" role="alert"><strong>{importPreview.errors.length} dòng cần sửa:</strong><ul>{importPreview.errors.slice(0, 20).map((item, index) => <li key={`${item.row}-${index}`}>Dòng {item.row}: {item.message}</li>)}</ul></div>}<div className="product-table-scroll"><table className="product-table"><thead><tr><th>Mã sản phẩm</th><th>Tên sản phẩm</th><th>Biến thể</th></tr></thead><tbody>{importPreview.products.map((product) => <tr key={product.productCode}><td>{product.productCode}</td><td>{product.productName}</td><td>{product.variants?.length || product.sizes?.length || 0}</td></tr>)}</tbody></table></div></div>}
      </section>
      <div className="product-layout">
        <div className="product-main-column">
          <section className="product-card"><div className="product-card-head"><div><h2>Thông tin chung</h2><p>Nhận diện mẫu sản phẩm trong danh mục.</p></div></div>{catalogFields}<div className="product-readonly"><span>Mã sản phẩm</span><strong>Tự động tạo khi lưu</strong></div></section>
          <section className="product-card"><div className="product-card-head"><div><h2>Màu sắc và kích cỡ</h2><p>Chọn các tổ hợp thực tế của mẫu.</p></div></div><label className="product-field">Màu sắc <b>*</b><textarea rows={2} value={colors} onChange={(event) => setColors(event.target.value)} placeholder="Ví dụ: Trắng, Đen" />{showFieldErrors && !colorList.length && <small className="product-field-error">Nhập ít nhất một màu.</small>}</label><div className="product-chips">{colorList.map((color) => <span className="product-chip" key={color}>{color}</span>)}</div><span className="product-field-label">Kích cỡ <b>*</b></span><div className="product-size-list">{sizes.map((size) => <label className={`product-size ${selectedSizes.includes(size) ? 'active' : ''}`} key={size}><input type="checkbox" checked={selectedSizes.includes(size)} onChange={(event) => setSelectedSizes((current) => event.target.checked ? [...current, size] : current.filter((item) => item !== size))} />{size}</label>)}</div>{showFieldErrors && !selectedSizes.length && <small className="product-field-error">Chọn ít nhất một kích cỡ.</small>}<button className="ara-btn ara-btn-secondary" type="button" disabled={!combinations.length} onClick={() => setShowCombinations(true)}>Tạo danh sách biến thể ({combinations.length})</button>
            {showCombinations && <div className="product-variant-block"><div className="product-variant-toolbar"><strong>Danh sách biến thể</strong><div className="product-apply-price"><input aria-label="Giá áp dụng cho tất cả" type="number" min="0" value={bulkPrice} placeholder="Giá cho tất cả (₫)" onChange={(event) => setBulkPrice(event.target.value)} /><button className="ara-btn ara-btn-secondary" type="button" disabled={bulkPrice === ''} onClick={() => setPrices((current) => ({ ...current, ...Object.fromEntries(combinations.map((item) => [item.key, bulkPrice])) }))}>Áp dụng</button></div></div><div className="product-table-scroll"><table className="product-table"><thead><tr><th>Sử dụng</th><th>Màu</th><th>Size</th><th>Mã SKU</th><th>Giá bán (₫)</th></tr></thead><tbody>{combinations.map((item) => <tr key={item.key}><td><input type="checkbox" aria-label={`Sử dụng ${item.color} ${item.size}`} checked={!excluded.includes(item.key)} onChange={(event) => setExcluded((current) => event.target.checked ? current.filter((key) => key !== item.key) : [...current, item.key])} /></td><td>{item.color}</td><td>{item.size}</td><td>Tự động tạo</td><td><input type="number" min="0" step="1" aria-label={`Giá ${item.color} ${item.size}`} placeholder={catalog.basePrice || 'Giá cơ bản'} value={prices[item.key] ?? ''} onChange={(event) => setPrices((current) => ({ ...current, [item.key]: event.target.value }))} /></td></tr>)}</tbody></table></div><p className="product-count">Đã chọn {activeCombinations.length} biến thể</p>{showFieldErrors && !activeCombinations.length && <small className="product-field-error">Chọn ít nhất một biến thể.</small>}</div>}
          </section>
        </div>
        <aside className="product-side-column"><section className="product-card"><h2>Hình ảnh sản phẩm</h2><div className="product-image-placeholder">{imagePreview ? <img src={imagePreview} alt="Ảnh sản phẩm sẽ tải lên" /> : <span>Chưa chọn ảnh đại diện</span>}</div>{mediaFields}</section><section className="product-card product-summary"><h2>Tóm tắt cấu hình</h2><dl><div><dt>Sản phẩm</dt><dd>{catalog.productName || 'Chưa nhập tên'}</dd></div><div><dt>Biến thể đã chọn</dt><dd>{activeCombinations.length}</dd></div></dl><p>Barcode từng chiếc được tạo sau khi xác nhận nhập kho.</p></section></aside>
        <div className="product-action-bar"><span>{busy ? 'Đang lưu cấu hình...' : 'Cấu hình chưa được lưu'}</span><div><Link className="ara-btn ara-btn-secondary" to="/warehouse/finished-goods">Hủy</Link><button className="ara-btn ara-btn-secondary" type="button" disabled={busy} onClick={() => createProductConfiguration('DRAFT')}>Lưu nháp</button><button className="ara-btn ara-btn-gold" type="button" disabled={busy} onClick={() => createProductConfiguration('ACTIVE')}>Lưu và tiếp tục kiểm nhận →</button></div></div>
      </div>
    </>}

    {mode === 'existing' && !selected && <div className="ara-search-section">
      <div className="ara-searchbox">
        <svg className="ara-searchbox-icon" width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="8.5" cy="8.5" r="5.75" stroke="currentColor" strokeWidth="1.5"/><path d="M12.5 12.5L16.5 16.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
        <input className="ara-searchbox-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm theo tên sản phẩm, mã sản phẩm hoặc mã SKU…" />
      </div>

      <p className="ara-results-caption">{candidates.length > 0 ? `Tìm thấy ${candidates.length} sản phẩm` : 'Không tìm thấy sản phẩm'}</p>

      <div className="ara-product-list">
        {candidates.length > 0 ? candidates.map((product) => <button type="button" className="ara-product-item" key={product.id} disabled={busy} onClick={() => loadProductConfiguration(product.id)}>
          <div className="ara-product-image">{product.thumbnailUrl ? <img src={product.thumbnailUrl} alt="" /> : <span className="ara-product-placeholder">ARA</span>}</div>
          <div className="ara-product-info">
            <strong className="ara-product-name">{product.productName}</strong>
            <small className="ara-product-meta">{product.productCode} · {product.category} · {product.skus.length} SKU</small>
          </div>
          <span className={`ara-badge ${product.isActive ? 'ara-badge-active' : 'ara-badge-draft'}`}>{product.isActive ? 'Đang sử dụng' : 'Nháp'}</span>
          <span className="ara-product-action">Chọn →</span>
        </button>) : <div className="ara-empty-state">
          <strong>Không tìm thấy sản phẩm</strong>
          <p>Thử từ khóa khác hoặc tạo mẫu mới.</p>
          <button type="button" className="ara-btn ara-btn-secondary" onClick={startNewProduct}>Tạo sản phẩm mới</button>
        </div>}
      </div>
    </div>}
    <div className="catalog-sync-indicator" aria-live="polite">
      {activeOperations.length > 0 || actionOperations.length > 0 ? <button type="button" className="ara-btn ara-btn-secondary" onClick={() => setShowPending(true)}>
        {actionOperations.length ? `Có ${groupedCount(actionOperations)} mục cần xử lý` : activeOperations.some((item) => item.status === 'SYNCING') ? 'Đang đồng bộ…' : `Chờ đồng bộ ${groupedCount(activeOperations)}`}
      </button> : draftNotice ? <span>Đã lưu bản nháp trên thiết bị</span> : message ? <span>{message}</span> : null}
    </div>
    {showPending && <div className="catalog-sync-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowPending(false); }}>
      <section className="catalog-sync-panel" role="dialog" aria-modal="true" aria-label="Dữ liệu cần đồng bộ">
        <header><h2>Dữ liệu cần đồng bộ</h2><button className="ara-modal-close" type="button" aria-label="Đóng" onClick={() => setShowPending(false)}>×</button></header>
        <div className="catalog-sync-tabs"><button type="button" onClick={() => setPendingTab('waiting')} aria-pressed={pendingTab === 'waiting'}>Đang chờ ({groupedCount(activeOperations)})</button><button type="button" onClick={() => setPendingTab('action')} aria-pressed={pendingTab === 'action'}>Cần xử lý ({groupedCount(actionOperations)})</button></div>
        {(pendingTab === 'waiting' ? activeGroupRows : actionGroupRows).map((item) => <article className="catalog-sync-item" key={item.serverEntityId || item.localEntityId || item.operationId}>
          <strong>{item.label}</strong><span>{({ CREATE: 'Tạo sản phẩm', UPDATE_PRODUCT: 'Sửa sản phẩm', ADD_VARIANTS: 'Thêm SKU', UPDATE_SKU_PRICE: 'Sửa giá SKU', UPDATE_SKU: 'Sửa SKU', IMPORT_PRODUCT: 'Import Excel' })[item.operationType] || item.operationType}{item.operationCount > 1 ? ` · ${item.operationCount} thao tác` : ''}</span>
          <small>{new Date(item.updatedAt || item.createdAt).toLocaleString('vi-VN')} · {({ QUEUED: 'Chờ đồng bộ', SYNCING: 'Đang gửi', RETRY_WAIT: 'Lỗi tạm thời', AUTH_REQUIRED: 'Đăng nhập để đồng bộ', NEEDS_ACTION: 'Cần xử lý' })[item.status]}</small>
          {item.status === 'NEEDS_ACTION' && <p>{item.errorCode === 'VERSION_CONFLICT' ? 'Sản phẩm đã có thay đổi trên hệ thống. Cần kiểm tra trước khi lưu.' : item.errorCode === 'PRODUCT_NOT_FOUND' ? 'Sản phẩm không còn tồn tại trên hệ thống.' : item.errorCode === 'DUPLICATE_SAMPLE_CODE' ? 'Mã sản phẩm đã tồn tại.' : item.lastError}</p>}
          {item.errorCode && <details><summary>Chi tiết lỗi</summary><code>{item.errorCode}: {item.lastError}</code></details>}
          {item.status === 'RETRY_WAIT' && <button type="button" className="ara-btn ara-btn-secondary" onClick={() => retryCatalogChange(ownerId, item)}>Thử lại</button>}
          {item.status === 'NEEDS_ACTION' && <button type="button" className="ara-btn ara-btn-gold" onClick={() => inspectConflict(item)}>{item.errorCode === 'VERSION_CONFLICT' ? 'Kiểm tra thay đổi' : 'Mở và sửa'}</button>}
          {item.status === 'NEEDS_ACTION' && <button type="button" className="ara-btn ara-btn-secondary" onClick={async () => {
            if (!window.confirm('Bỏ thay đổi trên thiết bị? Dữ liệu đã lưu trên hệ thống sẽ không bị xóa.')) return;
            for (const related of pendingChanges.filter((entry) => entry.status === 'NEEDS_ACTION' &&
              (entry.serverEntityId || entry.localEntityId || entry.operationId) === (item.serverEntityId || item.localEntityId || item.operationId))) {
              await resolveCatalogOperation(ownerId, related, 'DISCARDED');
            }
            setPendingChanges(await getPendingCatalogChanges(ownerId));
          }}>Bỏ thay đổi trên thiết bị</button>}
        </article>)}
        <details className="catalog-sync-history"><summary>Lịch sử hoàn tất ({pendingChanges.filter((item) => ['DONE', 'DISCARDED', 'SUPERSEDED'].includes(item.status)).length})</summary>
          {pendingChanges.filter((item) => ['DONE', 'DISCARDED', 'SUPERSEDED'].includes(item.status)).slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 20).map((item) => <p key={item.operationId}>{item.label} · {item.status === 'DONE' ? 'Đã đồng bộ' : item.status === 'DISCARDED' ? 'Đã bỏ thay đổi' : 'Đã được thay thế'}</p>)}
        </details>
        {conflictView && <div className="catalog-conflict" role="dialog" aria-modal="true" aria-label="Kiểm tra thay đổi sản phẩm"><h3>Sản phẩm đã có thay đổi trên hệ thống. Cần kiểm tra trước khi lưu.</h3>
          <div className="ara-table-wrapper"><table className="ara-variant-table"><thead><tr><th>Trường</th><th>Khi bắt đầu sửa</th><th>Thay đổi của tôi</th><th>Hiện tại</th><th>Giữ</th></tr></thead><tbody>
            {Object.entries(conflictView.operation.payload).filter(([key]) => key !== 'variants' && key !== 'rows').map(([key, value]) => { const currentValue = conflictView.current?.product?.[key] ?? ''; return <tr key={key}><td>{key}</td><td>{String(conflictView.operation.baseline?.[key] ?? '—')}</td><td>{String(value)}</td><td>{String(currentValue)}</td><td><select aria-label={`Giữ giá trị ${key}`} value={conflictView.selections?.[key] || 'mine'} onChange={(event) => setConflictView((state) => ({ ...state, selections: { ...state.selections, [key]: event.target.value } }))}><option value="mine">Thay đổi của tôi</option><option value="current">Bản hệ thống</option></select></td></tr>; })}
          </tbody></table></div>
          <button className="ara-btn ara-btn-secondary" type="button" onClick={() => useCurrentCatalog().catch((failure) => setError(failure.message))}>Dùng bản trên hệ thống</button>
          <button className="ara-btn ara-btn-gold" type="button" onClick={() => editConflictingChange().catch((failure) => setError(failure.message))}>Chọn nội dung cần giữ</button>
          <button className="ara-btn ara-btn-secondary" type="button" onClick={() => setConflictView(null)}>Để xử lý sau</button>
        </div>}
      </section>
    </div>}
    {mode === 'existing' && selected && <>
      <div className="ara-chosen-product">
        <div className="ara-chosen-product-image">{selected.product.thumbnailUrl ? <img src={selected.product.thumbnailUrl} alt="" /> : <span className="ara-chosen-product-placeholder">ARA</span>}</div>
        <div className="ara-chosen-product-info">
          <p className="ara-chosen-product-code">{selected.product.productCode} · {selected.product.category}</p>
          <h2 className="ara-chosen-product-name">{selected.product.productName}</h2>
          <span className={`ara-badge ${selected.product.isActive ? 'ara-badge-active' : 'ara-badge-draft'}`}>{selected.product.isActive ? 'Đang sử dụng' : 'Nháp'}</span>
        </div>
        <div className="ara-chosen-product-actions">
          <button type="button" className="ara-btn ara-btn-secondary" onClick={() => setShowVariantPanel(true)}>+ Thêm biến thể</button>
          <button type="button" className="ara-btn ara-btn-ghost" onClick={() => { setSelected(null); setSelectedSkuIds([]); }}>Chọn sản phẩm khác</button>
        </div>
      </div>

      <section className="product-card"><div className="product-card-head"><h2>Chỉnh sửa sản phẩm</h2><button className="ara-btn ara-btn-secondary" type="button" onClick={() => setEditingCatalog((value) => !value)}>{editingCatalog ? 'Đóng chỉnh sửa' : 'Chỉnh sửa thông tin'}</button></div>{editingCatalog && <>{catalogFields}{mediaFields}<div className="product-inline-actions"><button className="ara-btn ara-btn-secondary" type="button" disabled={busy} onClick={() => updateProductCatalog('DRAFT')}>Lưu nháp</button><button className="ara-btn ara-btn-gold" type="button" disabled={busy} onClick={() => updateProductCatalog('ACTIVE')}>Lưu thay đổi</button></div><h3>Thông tin từng SKU</h3><div className="product-price-list">{selected.skus.map((sku) => { const skuId = sku.id || sku._id; return <div key={skuId}><strong>{sku.skuCode}</strong><input aria-label={`Màu ${sku.skuCode}`} value={skuEdits[skuId]?.color ?? ''} onChange={(event) => setSkuEdits((current) => ({ ...current, [skuId]: { ...current[skuId], color: event.target.value } }))} /><select aria-label={`Size ${sku.skuCode}`} value={skuEdits[skuId]?.size ?? sku.size} onChange={(event) => setSkuEdits((current) => ({ ...current, [skuId]: { ...current[skuId], size: event.target.value } }))}>{sizes.map((size) => <option key={size}>{size}</option>)}</select><input aria-label={`Giá ${sku.skuCode}`} type="number" min="0" value={skuEdits[skuId]?.retailPrice ?? ''} onChange={(event) => setSkuEdits((current) => ({ ...current, [skuId]: { ...current[skuId], retailPrice: event.target.value } }))} /><button className="ara-btn ara-btn-secondary" type="button" disabled={busy} onClick={() => updateSkuDetails(sku)}>Lưu SKU</button></div>; })}</div></>}</section>

      <div className="ara-searchbox">
        <svg className="ara-searchbox-icon" width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="8.5" cy="8.5" r="5.75" stroke="currentColor" strokeWidth="1.5"/><path d="M12.5 12.5L16.5 16.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
        <input className="ara-searchbox-input" value={skuSearch} onChange={(event) => setSkuSearch(event.target.value)} placeholder="Tìm mã SKU, màu hoặc size…" />
      </div>

      <p className="ara-table-note">Chỉ chọn SKU có trong đợt giao này. Số lượng được kiểm nhận ở bước tiếp theo.</p>

      <div className="ara-table-wrapper">
        <table className="ara-variant-table">
          <thead>
            <tr>
              <th className="ara-th-check">
                <input type="checkbox" aria-label="Chọn tất cả SKU đang lọc" disabled={!selectableSkuIds.length} checked={selectableSkuIds.length > 0 && selectableSkuIds.every((id) => selectedSkuIds.includes(id))} onChange={(event) => setSelectedSkuIds((current) => event.target.checked ? [...new Set([...current, ...selectableSkuIds])] : current.filter((id) => !selectableSkuIds.includes(id)))} />
              </th>
              <th>Mã SKU</th>
              <th>Màu</th>
              <th>Size</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {filteredSkus.length > 0 ? filteredSkus.map((sku) => <tr key={sku.id || sku._id} className={selectedSkuIds.includes(sku.id || sku._id) ? 'is-selected' : ''}>
              <td className="ara-td-check">
                <input type="checkbox" aria-label={`Chọn ${sku.skuCode}`} disabled={!sku.isActive || !selected.product.isActive} checked={selectedSkuIds.includes(sku.id || sku._id)} onChange={(event) => setSelectedSkuIds((current) => event.target.checked ? [...current, sku.id || sku._id] : current.filter((id) => id !== (sku.id || sku._id)))} />
              </td>
              <td><strong className="ara-sku-code">{sku.skuCode}</strong></td>
              <td>{sku.color}</td>
              <td>{sku.size}</td>
              <td><span className={`ara-badge ${sku.isActive ? 'ara-badge-active' : 'ara-badge-inactive'}`}>{sku.isActive ? 'Đang sử dụng' : 'Ngừng'}</span></td>
            </tr>) : <tr><td colSpan="5" className="ara-empty-row">Không có SKU phù hợp.</td></tr>}
          </tbody>
        </table>
      </div>

      <aside className="ara-summary-sidebar">
        <h3 className="ara-summary-title">Đợt kiểm nhận này</h3>
        <p className="ara-summary-product-name"><strong>{selected.product.productName}</strong></p>
        {selectedSkuIds.length > 0 ? <ul className="ara-summary-list">
          {selected.skus.filter((sku) => selectedSkuIds.includes(sku.id || sku._id)).map((sku) => <li key={sku.id || sku._id}>
            <span className="ara-summary-variant">{sku.color} / {sku.size}</span>
            <small className="ara-summary-sku-code">{sku.skuCode}</small>
          </li>)}
        </ul> : <p className="ara-summary-empty">Chưa chọn biến thể.</p>}
        <p className="ara-summary-note">Nhập số lượng thực nhận, đạt và trả sửa ở bước tiếp theo.</p>
      </aside>

      <div className="ara-bottom-bar">
        <span className="ara-bottom-bar-label">{selectedSkuIds.length} biến thể đã chọn</span>
        <div className="ara-bottom-bar-actions">
          <button className="ara-btn ara-btn-secondary" type="button" onClick={() => setSelected(null)}>Quay lại</button>
          <button className="ara-btn ara-btn-gold" type="button" disabled={busy || !selected.product.isActive || selectedSkuIds.length === 0} onClick={() => navigate('/warehouse/finished-goods')}>Xem kho thành phẩm →</button>
        </div>
      </div>
    </>}

    {showVariantPanel && selected && <div className="ara-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowVariantPanel(false); }}>
      <aside className="ara-modal-panel" aria-label="Thêm biến thể">
        <div className="ara-modal-header">
          <h2>Thêm biến thể</h2>
          <button type="button" className="ara-modal-close" onClick={() => setShowVariantPanel(false)} aria-label="Đóng">×</button>
        </div>
        <p className="ara-modal-subtitle">{selected.product.productCode} · {selected.product.productName}</p>
        <div className="ara-modal-body">
          <label className="ara-field">
            <span className="ara-field-label">Màu sắc <b>*</b></span>
            <input className="ara-field-input" value={newVariant.color} onChange={(event) => setNewVariant({ ...newVariant, color: event.target.value })} placeholder="Ví dụ: Trắng" />
          </label>
          <label className="ara-field">
            <span className="ara-field-label">Kích cỡ</span>
            <select className="ara-field-input" value={newVariant.size} onChange={(event) => setNewVariant({ ...newVariant, size: event.target.value })}>{sizes.map((size) => <option key={size}>{size}</option>)}</select>
          </label>
          <label className="ara-field">
            <span className="ara-field-label">Giá bán (₫)</span>
            <input className="ara-field-input" type="number" min="0" value={newVariant.retailPrice} onChange={(event) => setNewVariant({ ...newVariant, retailPrice: event.target.value })} placeholder={String(selected.product.basePrice)} />
          </label>
          <div className="ara-field-readonly">
            <span>Mã SKU</span>
            <strong>Tự động tạo khi lưu</strong>
          </div>
          {matchingVariant && <div className="ara-alert ara-alert-error">Tổ hợp đã tồn tại: {matchingVariant.skuCode}. Hãy chọn SKU này trong danh sách.</div>}
        </div>
        <div className="ara-modal-footer">
          <button className="ara-btn ara-btn-gold" type="button" disabled={busy || !newVariant.color.trim() || Boolean(matchingVariant)} onClick={addProductVariant}>Thêm và chọn biến thể</button>
        </div>
      </aside>
    </div>}

    <footer className="ara-footer">
      <p className="ara-footer-text">© 2026 ARAWMS — Hệ thống quản lý kho xưởng may</p>
    </footer>
  </main>;
}
