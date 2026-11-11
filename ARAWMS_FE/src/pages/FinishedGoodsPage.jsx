/**
 * ============================================================================
 * @title        : Finished Goods Page (Kho Thành Phẩm - Tồn Kho Theo SKU)
 * @author       : AraWMS Team
 * @createdDate  : 2026-10-22
 * @lastModified : 2026-11-11
 * @description  : Quản lý tồn kho thành phẩm theo SKU, lượng khả dụng trên kệ,
 *                 tạo yêu cầu xuất kho hàng loạt và cấu hình thông số sản phẩm.
 *                 (Các mục Lệnh nhập từ kỹ thuật, Lệnh xuất từ kỹ thuật, Tiến độ nhập kho
 *                 đã được tách thành các trang độc lập trên Sidebar menu).
 * @module       : Warehouse / Finished Goods
 * @layer        : Front-end (Page)
 * ============================================================================
 */

import { useEffect, useState } from 'react';
import { Link, useLocation, useSearchParams, useNavigate } from 'react-router-dom';
import { ArrowRightLeft, CirclePlus, RefreshCw } from 'lucide-react';
import { productService } from '../services/productService';
import { useAuth } from '../hooks/useAuth';
import { getPendingCatalogChanges, subscribeCatalogChanges } from '../services/offlineCatalogSync';
import { finishedGoodsOffline } from '../services/offlineFinishedGoods';
import BulkStockForm from '../components/BulkStockForm';
import FinishedGoodsOverview from '../components/FinishedGoodsOverview';
import '../styles/finishedGoods.css';

const panel = {
  background: '#fff',
  border: '1px solid var(--ara-border)',
  borderRadius: 'var(--radius-md)',
  padding: '1.25rem',
  boxShadow: 'var(--ara-shadow-sm)',
};
const input = {
  width: '100%',
  padding: '.65rem',
  border: '1px solid var(--ara-border)',
  borderRadius: 8,
  font: 'inherit',
};
const money = (value) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(
    Number(value) || 0
  );

export default function FinishedGoodsPage({ isStaffMode = false }) {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const isStaff = isStaffMode || location.pathname.includes('/staff');
  const { user } = useAuth();
  const ownerId = user?.id || user?._id;

  const [localCatalog, setLocalCatalog] = useState([]);
  const [products, setProducts] = useState([]);
  const [cacheTime, setCacheTime] = useState(null);
  const [pendingConfirmations, setPendingConfirmations] = useState([]);
  const [savedDrafts, setSavedDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Form xuất kho nhanh cho 1 SKU
  const [movement, setMovement] = useState(null);
  const [quantity, setQuantity] = useState('');
  const [skuId, setSkuId] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  // Form xuất kho hàng loạt
  const [bulkDirection, setBulkDirection] = useState('');
  const [handoffSkuIds, setHandoffSkuIds] = useState([]);
  const [initialProductId, setInitialProductId] = useState('');
  const [recentDocuments, setRecentDocuments] = useState([]);

  const movementSku = movement?.product.skus.find((sku) => String(sku.id) === String(skuId));
  const movementUnitCogs = Number(movementSku?.unitCogs || 0);
  const outboundValue = movementUnitCogs * (Number(quantity) || 0);

  // Điều hướng tương thích ngược nếu người dùng truy cập link cũ có ?tab=
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'requests') {
      navigate('/warehouse/technical-inbound', { replace: true });
    } else if (tab === 'outbound') {
      navigate('/warehouse/technical-outbound', { replace: true });
    } else if (tab === 'progress') {
      navigate(isStaff ? '/warehouse/staff/inbound-progress' : '/warehouse/inbound-progress', { replace: true });
    }
  }, [searchParams, isStaff, navigate]);

  // Tải danh sách sản phẩm và tồn kho theo SKU
  const loadProducts = async () => {
    if (ownerId) {
      const cached = await finishedGoodsOffline.getCached(ownerId, 'products', 'list').catch(() => null);
      if (cached) {
        setProducts(cached.value);
        setCacheTime(cached.updatedAt);
        setLoading(false);
      }
    }
    if (!navigator.onLine) {
      setLoading(false);
      return;
    }
    try {
      const response = await productService.list();
      setProducts(response.data?.products || []);
      if (ownerId) {
        const snapshot = await finishedGoodsOffline.cache(ownerId, 'products', 'list', response.data?.products || []);
        setCacheTime(snapshot.updatedAt);
      }
      setError('');
    } catch (requestError) {
      const snapshot = ownerId && (await finishedGoodsOffline.getCached(ownerId, 'products', 'list').catch(() => null));
      if (snapshot) {
        setProducts(snapshot.value);
        setCacheTime(snapshot.updatedAt);
      } else {
        setError(requestError.message);
      }
    } finally {
      setLoading(false);
    }
  };

  // Tải chứng từ kho gần đây
  const loadRecentStockDocuments = async () => {
    if (ownerId) {
      const cached = await finishedGoodsOffline.getCached(ownerId, 'documents', 'recent').catch(() => null);
      if (cached) setRecentDocuments(cached.value);
    }
    if (!navigator.onLine) return;
    try {
      const response = await productService.recentDocuments();
      setRecentDocuments(response.data?.documents || []);
      if (ownerId) {
        await finishedGoodsOffline.cache(ownerId, 'documents', 'recent', response.data?.documents || []);
      }
    } catch (requestError) {
      const snapshot =
        ownerId && (await finishedGoodsOffline.getCached(ownerId, 'documents', 'recent').catch(() => null));
      if (snapshot) setRecentDocuments(snapshot.value);
      else setError(requestError.message);
    }
  };

  useEffect(() => {
    setProducts([]);
    setRecentDocuments([]);
    setCacheTime(null);
    if (ownerId) {
      loadProducts();
      loadRecentStockDocuments();
    }
  }, [ownerId]);

  useEffect(() => {
    if (!ownerId) {
      setPendingConfirmations([]);
      return undefined;
    }
    const refresh = () =>
      finishedGoodsOffline
        .confirmations(ownerId)
        .then((items) =>
          setPendingConfirmations(items.filter((item) => !['DONE', 'SUPERSEDED'].includes(item.status)))
        )
        .catch(() => {});
    refresh();
    const unsubscribe = finishedGoodsOffline.subscribe(refresh);
    window.addEventListener('arawms-finished-goods-synced', refresh);
    return () => {
      unsubscribe();
      window.removeEventListener('arawms-finished-goods-synced', refresh);
    };
  }, [ownerId]);

  useEffect(() => {
    if (!ownerId) {
      setSavedDrafts({});
      return undefined;
    }
    const refresh = () =>
      Promise.all(['IN', 'OUT'].map((direction) => finishedGoodsOffline.getDraft(ownerId, direction)))
        .then(([inbound, outbound]) => setSavedDrafts({ IN: inbound, OUT: outbound }))
        .catch(() => {});
    refresh();
    return finishedGoodsOffline.subscribe(refresh);
  }, [ownerId]);

  useEffect(() => {
    const refresh = (event) => {
      if (String(event.detail?.ownerId) === String(ownerId)) {
        loadProducts();
        loadRecentStockDocuments();
      }
    };
    window.addEventListener('arawms-finished-goods-synced', refresh);
    return () => window.removeEventListener('arawms-finished-goods-synced', refresh);
  }, [ownerId]);

  useEffect(() => {
    const refreshStock = (event) => {
      if (event.detail?.warehouseType === 'FINISHED_GOODS') {
        loadProducts();
        loadRecentStockDocuments();
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

  useEffect(() => {
    const refresh = (event) => {
      if (String(event.detail?.ownerId) === String(ownerId)) loadProducts();
    };
    window.addEventListener('arawms-catalog-synced', refresh);
    return () => window.removeEventListener('arawms-catalog-synced', refresh);
  }, [ownerId]);

  useEffect(() => {
    if (!ownerId) {
      setLocalCatalog([]);
      return undefined;
    }
    const refresh = () =>
      getPendingCatalogChanges(ownerId)
        .then((items) =>
          setLocalCatalog(
            items.filter(
              (item) =>
                ['CREATE', 'IMPORT_PRODUCT'].includes(item.operationType) &&
                !['DONE', 'DISCARDED', 'SUPERSEDED'].includes(item.status)
            )
          )
        )
        .catch(() => setLocalCatalog([]));
    refresh();
    return subscribeCatalogChanges(refresh);
  }, [ownerId]);

  const openStockMovementForm = (product, direction, selectedSkuId = '') => {
    setMovement({ product, direction });
    setSkuId(selectedSkuId || (product.skus.length === 1 ? product.skus[0].id : ''));
    setQuantity('');
    setNote('');
    setError('');
    setNotice('');
  };

  const submitStockMovement = async (event) => {
    event.preventDefault();
    if (saving || !movement) return;
    if (movement.product.skus.length > 1 && !skuId) {
      setError('Vui lòng chọn SKU.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await productService.moveStock(movement.product.id, {
        direction: movement.direction,
        quantity: Number(quantity),
        skuId: skuId || undefined,
        note,
      });
      setNotice(
        `Đã ${movement.direction === 'IN' ? 'nhập' : 'xuất'} ${quantity} sản phẩm ${movement.product.productCode}.`
      );
      setMovement(null);
      await loadProducts();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="finished-goods-page">
      {/* Breadcrumb */}
      <nav className="product-breadcrumb" aria-label="Đường dẫn">
        <Link to="/">Trang chủ</Link>
        <span>/</span>
        {isStaff ? (
          <>
            <Link to="/warehouse/putaway">Nhân viên kho</Link>
            <span>/</span>
            <strong>Kho thành phẩm (Tồn kho theo SKU)</strong>
          </>
        ) : (
          <strong>Kho thành phẩm (Tồn kho theo SKU)</strong>
        )}
      </nav>

      {/* Hero Header */}
      <div className="product-page-head finished-goods-hero">
        <div className="finished-goods-intro">
          <p className="product-eyebrow">
            {isStaff ? 'VẬN HÀNH KHO THÀNH PHẨM' : 'QUẢN LÝ KHO THÀNH PHẨM'}
          </p>
          <h1>Kho thành phẩm</h1>
          <p>
            {isStaff
              ? 'Theo dõi tồn kho theo SKU, lượng khả dụng trên kệ và tra cứu vị trí cất hàng.'
              : 'Theo dõi tồn theo SKU, lượng tạm giữ, xuất kho thành phẩm và cấu hình sản phẩm.'}
          </p>
        </div>
        <div className="finished-goods-main-actions">
          <button
            className="btn-ara-secondary"
            type="button"
            disabled={loading}
            onClick={() => {
              loadProducts();
              loadRecentStockDocuments();
            }}
          >
            <RefreshCw size={17} className={loading ? 'animate-spin' : ''} />
            Làm mới
          </button>
          {!isStaff && (
            <>
              <button
                className="btn-ara-secondary"
                type="button"
                onClick={() => {
                  setHandoffSkuIds([]);
                  setInitialProductId('');
                  setBulkDirection('OUT');
                  setMovement(null);
                  setError('');
                  setNotice('');
                }}
              >
                <ArrowRightLeft size={17} />
                Tạo yêu cầu xuất kho hàng loạt
              </button>
              <Link to="/warehouse/products/new" className="btn-ara-primary">
                <CirclePlus size={18} />
                Cấu hình sản phẩm
              </Link>
            </>
          )}
        </div>
      </div>

      {error && (
        <p className="finished-goods-message error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="finished-goods-message success" role="status">
          {notice}
        </p>
      )}

      {/* Phiếu nháp lưu offline */}
      {!isStaff && bulkDirection !== 'IN' && savedDrafts.OUT && (
        <section style={panel} aria-label="Phiếu đang lưu trên thiết bị">
          <h2>Phiếu đang lưu trên thiết bị</h2>
          {['OUT']
            .filter((direction) => savedDrafts[direction])
            .map((direction) => (
              <button
                key={direction}
                className="btn-ara-secondary"
                type="button"
                style={{ marginRight: '.5rem' }}
                onClick={() => {
                  setBulkDirection(direction);
                  setInitialProductId('');
                  setHandoffSkuIds([]);
                }}
              >
                Mở nháp {direction === 'IN' ? 'nhập' : 'xuất'} · {savedDrafts[direction].documentCode || 'Chưa có mã'}
              </button>
            ))}
        </section>
      )}

      {bulkDirection !== 'IN' && cacheTime && (
        <p role="status">
          Dữ liệu tồn tải lần cuối lúc {new Date(cacheTime).toLocaleString('vi-VN')}. Kiểm tra lại trước khi xác nhận
          xuất kho.
        </p>
      )}
      {!navigator.onLine && (
        <p role="status">
          Mất kết nối — bản nháp đang mở có thể lưu trên thiết bị; cần kết nối để xác nhận phiếu kho.
        </p>
      )}

      {/* Dữ liệu chờ đồng bộ */}
      {pendingConfirmations.length > 0 && (
        <section style={panel} aria-label="Dữ liệu kho chờ đồng bộ">
          <h2>Dữ liệu chờ đồng bộ</h2>
          {pendingConfirmations.map((item) => (
            <p key={item.operationId}>
              {item.payload.documentCode} ·{' '}
              {item.status === 'REVIEW'
                ? 'Cần kiểm tra'
                : item.status === 'SYNCING'
                ? 'Đang gửi lên máy chủ'
                : 'Chưa được máy chủ xác nhận'}
              {item.lastError && ` · ${item.lastError}`}
            </p>
          ))}
        </section>
      )}

      {/* Dialog xuất kho hàng loạt */}
      {bulkDirection && (
        <div className="fg-request-overlay">
          <div className="fg-bulk-dialog">
            <BulkStockForm
              key={`${bulkDirection}:${initialProductId}`}
              direction={bulkDirection}
              products={products}
              ownerId={ownerId}
              initialSkuIds={handoffSkuIds}
              initialProductId={initialProductId}
              onCancel={() => setBulkDirection('')}
              onQueued={(msg) => {
                setBulkDirection('');
                setNotice(msg);
              }}
              onDone={async (document) => {
                setBulkDirection('');
                setHandoffSkuIds([]);
                setNotice(
                  `Đã tạo yêu cầu xuất kho hàng loạt ${document.documentCode} (${document.totalQuantity} sản phẩm). Yêu cầu đã được chuyển đến Nhân viên kho để lấy hàng và quét mã.`
                );
                setRecentDocuments((current) => [
                  { ...document, createdAt: new Date().toISOString(), items: document.items || [] },
                  ...current,
                ]);
                await loadProducts();
                await loadRecentStockDocuments();
              }}
            />
          </div>
        </div>
      )}

      {/* Sản phẩm trên thiết bị chờ đồng bộ */}
      {!isStaff && localCatalog.length > 0 && (
        <section className="finished-goods-catalog" aria-label="Sản phẩm trên thiết bị chờ đồng bộ">
          <h2>Sản phẩm trên thiết bị</h2>
          <p>Các sản phẩm này chưa được dùng để nhập, xuất kho hoặc chốt đơn.</p>
          <div className="product-table-scroll">
            <table className="product-table">
              <thead>
                <tr>
                  <th>Tên sản phẩm</th>
                  <th>Mã</th>
                  <th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {localCatalog.map((item) => (
                  <tr key={item.operationId}>
                    <td>{item.payload.productName}</td>
                    <td>{item.payload.productCode || 'Cấp khi đồng bộ'}</td>
                    <td>
                      {item.status === 'REVIEW'
                        ? 'Cần kiểm tra'
                        : item.status === 'SYNCING'
                        ? 'Đang đồng bộ'
                        : 'Chờ đồng bộ'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Link to="/warehouse/products/new">Xem dữ liệu chờ đồng bộ</Link>
        </section>
      )}

      {/* CHỈ GIỮ LẠI TỒN KHO THEO SKU */}
      <FinishedGoodsOverview
        products={products}
        recentDocuments={recentDocuments}
        ownerId={ownerId}
        loading={loading}
        canIssue={!isStaff}
        canConfigure={!isStaff}
        onIssue={(product, sku) => {
          if (isStaff) return;
          setBulkDirection('');
          openStockMovementForm(product, 'OUT', sku.id);
        }}
        onError={setError}
      />

      {/* Drawer xuất kho cho từng SKU */}
      {movement && (
        <div className="fg-movement-backdrop">
          <section
            className="fg-movement-drawer"
            role="dialog"
            aria-modal="true"
            aria-label={`${movement.direction === 'IN' ? 'Nhập kho' : 'Xuất kho'} ${movement.product.productCode}`}
          >
            <header className="fg-movement-head">
              <div>
                <span>{movement.direction === 'IN' ? 'NHẬP KHO' : 'XUẤT KHO'}</span>
                <h2>
                  {movement.direction === 'IN' ? 'Nhập kho' : 'Xuất kho'} · {movement.product.productCode}
                </h2>
                <p>{movement.product.productName}</p>
              </div>
              <button
                type="button"
                aria-label="Đóng bảng xuất kho"
                onClick={() => {
                  if (!window.confirm('Hủy thao tác nhập hoặc xuất kho đang thực hiện?')) return;
                  setMovement(null);
                  setError('');
                }}
              >
                ×
              </button>
            </header>
            <form className="fg-movement-form" onSubmit={submitStockMovement}>
              {movement.product.skus.length > 0 ? (
                <label>
                  SKU
                  <select
                    style={input}
                    required
                    value={skuId}
                    onChange={(event) => setSkuId(event.target.value)}
                  >
                    {movement.product.skus.length > 1 && <option value="">Chọn SKU</option>}
                    {movement.product.skus.map((sku) => (
                      <option key={sku.id} value={sku.id}>
                        {sku.skuCode} · {sku.color} / {sku.size} · khả dụng {sku.availableQty}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <p>Chưa có SKU. Lần nhập đầu sẽ tạo SKU mặc định (FREESIZE).</p>
              )}
              <label>
                Số lượng *
                <input
                  style={input}
                  type="number"
                  min="1"
                  max="100000"
                  step="1"
                  required
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                />
              </label>
              {movement.direction === 'OUT' && (
                <div className="fg-movement-value" aria-live="polite">
                  <div>
                    <span>Giá vốn / đơn vị</span>
                    <strong>{money(movementUnitCogs)}</strong>
                  </div>
                  <div>
                    <span>Giá trị xuất kho</span>
                    <strong>{money(outboundValue)}</strong>
                  </div>
                  <small>
                    Tạm tính theo giá vốn của SKU và số lượng xuất. Sổ giao dịch lưu ảnh chụp giá vốn tại thời điểm xác nhận.
                  </small>
                </div>
              )}
              <label>
                Ghi chú
                <input
                  style={input}
                  maxLength={500}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Lý do nhập/xuất"
                />
              </label>
              {error && (
                <p role="alert" style={{ color: '#a32121' }}>
                  {error}
                </p>
              )}
              <footer>
                <button className="btn-ara-primary" disabled={saving} type="submit">
                  {saving ? 'Đang lưu...' : 'Xác nhận'}
                </button>
                <button
                  className="btn-ara-secondary"
                  disabled={saving}
                  type="button"
                  onClick={() => {
                    if (!window.confirm('Hủy thao tác nhập hoặc xuất kho đang thực hiện?')) return;
                    setMovement(null);
                    setError('');
                  }}
                >
                  Hủy
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
