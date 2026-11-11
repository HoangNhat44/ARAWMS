/**
 * ============================================================================
 * @title        : Inbound Progress Page
 * @author       : AraWMS Team
 * @createdDate  : 2026-11-11
 * @lastModified : 2026-11-11
 * @description  : Trang theo dõi "Tiến độ nhập kho" dành cho Quản lý kho (Warehouse Manager).
 *                 - Bảng tổng hợp tiến độ xử lý và cất hàng từ các lệnh nhập kỹ thuật.
 *                 - Danh sách phiếu nhập thành phẩm gần đây kèm chức năng in tem Barcode.
 *                 - Tiến độ phân bổ và cất hàng theo từng Rack / Tầng / Ô kệ (Location).
 *                 - Danh sách hàng nhập chờ phân bổ vị trí lưu trữ.
 * @module       : Warehouse / Inbound Progress
 * @layer        : Front-end (Page)
 * ============================================================================
 */

import React, { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, TrendingUp, Printer, Layers, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { productService } from '../services/productService';
import { materialInboundService } from '../services/materialInboundService';
import { useAuth } from '../hooks/useAuth';
import { finishedGoodsOffline } from '../services/offlineFinishedGoods';
import { printProductLabels } from '../utils/productLabelPrint';
import WarehouseInboundProgress from '../components/WarehouseInboundProgress';
import WarehouseRequestDialog from '../components/WarehouseRequestDialog';
import PendingReceiptAllocation from '../components/PendingReceiptAllocation';
import '../styles/finishedGoods.css';

const panel = {
  background: '#fff',
  border: '1px solid var(--ara-border)',
  borderRadius: 'var(--radius-md)',
  padding: '1.25rem',
  boxShadow: 'var(--ara-shadow-sm)',
};

export default function InboundProgressPage() {
  const { user } = useAuth();
  const ownerId = user?.id || user?._id;

  const [products, setProducts] = useState([]);
  const [technicalRequests, setTechnicalRequests] = useState([]);
  const [materialRequests, setMaterialRequests] = useState([]);
  const [inboundProgress, setInboundProgress] = useState([]);
  const [recentDocuments, setRecentDocuments] = useState([]);
  const [pendingReceipts, setPendingReceipts] = useState([]);
  const [receiptDetail, setReceiptDetail] = useState(null);
  const [laterReceipt, setLaterReceipt] = useState(null);
  const [inboundDetail, setInboundDetail] = useState(null);

  const [progressLoading, setProgressLoading] = useState(false);
  const [progressError, setProgressError] = useState('');
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const barcodeRefreshCount = useRef(0);

  // Tải danh mục sản phẩm (phục vụ hiển thị mã SKU)
  const loadProducts = async () => {
    if (!navigator.onLine) return;
    try {
      const response = await productService.list();
      setProducts(response.data?.products || []);
    } catch (err) {
      console.warn('Lỗi tải danh mục sản phẩm:', err);
    }
  };

  // Tải tiến độ nhập kho
  const loadInboundProgress = async () => {
    if (!navigator.onLine) return;
    setProgressLoading(true);
    try {
      const res = await productService.inboundProgress();
      setInboundProgress(res.data?.receipts || []);
      setProgressError('');
    } catch (failure) {
      setProgressError(failure.message || 'Không thể tải tiến độ nhập kho');
    } finally {
      setProgressLoading(false);
    }
  };

  // Tải các yêu cầu nhập kỹ thuật liên quan
  const loadTechnicalRequests = async () => {
    if (!navigator.onLine) return;
    try {
      const [finished, material] = await Promise.allSettled([
        productService.technicalRequests(),
        materialInboundService.technicianRequests(),
      ]);
      if (finished.status === 'fulfilled') setTechnicalRequests(finished.value.data?.requests || []);
      if (material.status === 'fulfilled') setMaterialRequests(material.value.data?.requests || []);
    } catch (err) {
      console.warn('Lỗi tải yêu cầu kỹ thuật:', err);
    }
  };

  // Tải phiếu nhập thành phẩm gần đây
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

  // Tải danh sách phiếu chờ phân bổ vị trí
  const loadPendingReceipts = async () => {
    if (!navigator.onLine) return;
    try {
      const response = await productService.pendingReceipts();
      setPendingReceipts(response.data?.receipts || []);
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  // Mở chi tiết tiến độ cất hàng của 1 phiếu
  const showReceiptDetail = async (id) => {
    setDetailLoading(true);
    try {
      const response = await productService.receiptDetail(id);
      setReceiptDetail(response.data);
      if (ownerId) await finishedGoodsOffline.cache(ownerId, 'receipt', id, response.data);
    } catch (requestError) {
      const snapshot = ownerId && (await finishedGoodsOffline.getCached(ownerId, 'receipt', id).catch(() => null));
      if (snapshot) setReceiptDetail(snapshot.value);
      else setError(requestError.message);
    } finally {
      setDetailLoading(false);
    }
  };

  // In tem mã vạch thành phẩm
  const printDocumentBarcodes = async (document) => {
    try {
      const tab = window.open('', '_blank');
      if (!tab) throw new Error('Trình duyệt đang chặn cửa sổ in tem');
      let labels;
      try {
        const response = await productService.documentBarcodes(document.id);
        labels = response.data?.labels;
        if (ownerId) await finishedGoodsOffline.cache(ownerId, 'labels', document.id, labels);
        setRecentDocuments((current) =>
          current.map((item) => (item.id === document.id ? { ...item, barcodeImagesReady: response.data?.ready } : item))
        );
      } catch (requestError) {
        const snapshot = ownerId && (await finishedGoodsOffline.getCached(ownerId, 'labels', document.id));
        if (!snapshot) throw requestError;
        labels = snapshot.value;
      }
      printProductLabels(labels.map((item) => ({ ...item, imageUrl: navigator.onLine ? item.imageUrl : null })), tab);
    } catch (printError) {
      setError(printError.message);
    }
  };

  // Tạo lại ảnh mã vạch còn thiếu
  const retryDocumentBarcodeImages = async (document) => {
    try {
      await productService.syncDocumentBarcodes(document.id);
      setNotice(`Đang lưu ảnh mã cho phiếu ${document.documentCode}. Tem vẫn có thể in bằng mã đã cấp.`);
      window.setTimeout(loadRecentStockDocuments, 5000);
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  useEffect(() => {
    loadInboundProgress();
    loadTechnicalRequests();
    loadRecentStockDocuments();
    loadPendingReceipts();
    loadProducts();
  }, [ownerId]);

  return (
    <main className="finished-goods-page">
      {/* Breadcrumb */}
      <nav className="product-breadcrumb" aria-label="Đường dẫn">
        <Link to="/">Trang chủ</Link>
        <span>/</span>
        <Link to="/warehouse/finished-goods">Quản lý kho</Link>
        <span>/</span>
        <strong>Tiến độ nhập kho</strong>
      </nav>

      {/* Page Header */}
      <div className="product-page-head finished-goods-hero">
        <div className="finished-goods-intro">
          <p className="product-eyebrow">VẬN HÀNH KHO / THEO DÕI NHẬP & CẤT HÀNG</p>
          <h1>Tiến độ nhập kho</h1>
          <p>
            Theo dõi tiến trình kiểm nhận từ xưởng, tiến độ cất hàng (Putaway) vào từng ô kệ,
            in tem mã vạch thành phẩm và phân bổ vị trí lưu trữ.
          </p>
        </div>
        <div className="finished-goods-main-actions">
          <button
            className="btn-ara-secondary"
            type="button"
            disabled={progressLoading}
            onClick={() => {
              loadInboundProgress();
              loadTechnicalRequests();
              loadRecentStockDocuments();
              loadPendingReceipts();
            }}
          >
            <RefreshCw size={17} className={progressLoading ? 'animate-spin' : ''} />
            Làm mới tiến độ
          </button>
        </div>
      </div>

      {/* Thông báo */}
      {notice && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            padding: '0.85rem 1.25rem',
            borderRadius: '8px',
            background: '#ECFDF5',
            color: '#065F46',
            border: '1px solid #A7F3D0',
            marginBottom: '1.25rem',
            fontSize: '0.9rem',
          }}
        >
          <CheckCircle2 size={18} />
          <span>{notice}</span>
        </div>
      )}

      {error && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            padding: '0.85rem 1.25rem',
            borderRadius: '8px',
            background: '#FEF2F2',
            color: '#991B1B',
            border: '1px solid #FECACA',
            marginBottom: '1.25rem',
            fontSize: '0.9rem',
          }}
        >
          <AlertTriangle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* 1. Tổng hợp tiến độ nhập kho */}
      <WarehouseInboundProgress
        finishedRequests={technicalRequests}
        materialRequests={materialRequests}
        receipts={inboundProgress}
        loading={progressLoading}
        error={progressError}
        onRefresh={() => {
          loadTechnicalRequests();
          loadInboundProgress();
        }}
        onOpenRequest={setInboundDetail}
      />

      {/* 2. Phiếu nhập thành phẩm gần đây */}
      <div className="fg-records" style={{ marginTop: '1.5rem' }}>
        <div className="fg-records-head">
          <div>
            <h2>Phiếu nhập thành phẩm gần đây</h2>
            <p>Phiếu nhập mới nhất, kèm in tem mã vạch và chi tiết phân bổ kệ.</p>
          </div>
          <button
            className="btn-ara-secondary"
            type="button"
            onClick={() => {
              loadRecentStockDocuments();
              loadPendingReceipts();
              loadInboundProgress();
            }}
          >
            <RefreshCw size={17} /> Làm mới
          </button>
        </div>

        {!recentDocuments.some((item) => item.direction === 'IN') && (
          <p className="fg-empty">Chưa có phiếu nhập gần đây.</p>
        )}

        {recentDocuments.some((item) => item.direction === 'IN') && (
          <section
            className="fg-record-table"
            style={{ ...panel, marginTop: '0' }}
            aria-label="Danh sách phiếu nhập thành phẩm gần đây"
          >
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Số chứng từ</th>
                    <th>Loại</th>
                    <th>Số dòng</th>
                    <th>Đạt / xuất</th>
                    <th>Trả sửa</th>
                    <th>Ngày tạo</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {recentDocuments
                    .filter((item) => item.direction === 'IN')
                    .map((document) => (
                      <tr key={document.id}>
                        <td style={{ padding: '.6rem', borderBottom: '1px solid var(--ara-border)' }}>
                          {document.documentCode}
                        </td>
                        <td style={{ textAlign: 'center' }}>{document.direction === 'IN' ? 'Nhập' : 'Xuất'}</td>
                        <td style={{ textAlign: 'center' }}>{document.lineCount}</td>
                        <td style={{ textAlign: 'center' }}>{document.totalQuantity}</td>
                        <td style={{ textAlign: 'center' }}>
                          {document.direction === 'IN'
                            ? (document.items || []).reduce((sum, item) => sum + (item.repairQty || 0), 0)
                            : '—'}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {new Date(document.createdAt).toLocaleString('vi-VN')}
                        </td>
                        <td>
                          {document.direction === 'IN' && document.totalQuantity > 0 && (
                            <div style={{ display: 'grid', gap: '.35rem' }}>
                              <small>
                                Ảnh mã: {document.barcodeImagesReady || 0}/{document.totalQuantity}
                              </small>
                              <button
                                className="btn-ara-secondary"
                                type="button"
                                onClick={() => printDocumentBarcodes(document)}
                              >
                                In tem barcode
                              </button>
                              {(document.barcodeImagesReady || 0) < document.totalQuantity && (
                                <button
                                  className="btn-ara-secondary"
                                  type="button"
                                  onClick={() => retryDocumentBarcodeImages(document)}
                                >
                                  Tạo ảnh còn thiếu
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* 3. Tiến độ cất hàng theo phiếu nhập */}
        {recentDocuments.some((item) => item.direction === 'IN') && (
          <section style={{ ...panel, marginTop: '1.25rem' }}>
            <h2>Tiến độ cất hàng theo phiếu nhập</h2>
            {recentDocuments
              .filter((item) => item.direction === 'IN')
              .map((item) => (
                <div className="receiving-progress-row" key={item.id}>
                  <strong>{item.documentCode}</strong>
                  <span>
                    Chưa phân bổ {item.unallocated ?? item.totalQuantity} · Chờ xếp {item.pending || 0} · Đã xếp{' '}
                    {item.placed || 0}
                  </span>
                  <button
                    className="btn-ara-secondary"
                    type="button"
                    disabled={detailLoading}
                    onClick={() => showReceiptDetail(item.id)}
                  >
                    Chi tiết
                  </button>
                </div>
              ))}

            {detailLoading && <p role="status">Đang tải chi tiết phiếu...</p>}
            {receiptDetail && (
              <div className="receiving-progress-detail">
                <h3>{receiptDetail.document.documentCode}</h3>
                {receiptDetail.progress.map((row) => (
                  <div key={row.skuId}>
                    <strong>
                      {products.flatMap((product) => product.skus).find((sku) => sku.id === row.skuId)?.skuCode ||
                        row.skuId}
                    </strong>
                    <span>
                      {' '}
                      Chưa phân bổ {row.unallocated} · Chờ xếp {row.pending} · Đã xếp {row.placed}
                    </span>
                    {row.rows.map((place, index) => (
                      <p key={`${place.allocationCode}-${index}`}>
                        {place.location?.rackCode} → Tầng {place.location?.floorNo} → Ô {place.location?.binNo} (
                        {place.location?.locationCode}): chờ {place.pending}, đã xếp {place.placed}
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* 4. Hàng chờ phân bổ vị trí */}
        {pendingReceipts.length > 0 && (
          <section style={{ ...panel, marginTop: '1.25rem' }}>
            <h2>Hàng chờ phân bổ vị trí</h2>
            {pendingReceipts.map((item) => (
              <div className="receiving-progress-row" key={item.id}>
                <strong>{item.documentCode}</strong>
                <span>{item.unallocated} chiếc đạt chưa có ô đích</span>
                <button
                  className="btn-ara-secondary"
                  type="button"
                  onClick={() => setLaterReceipt(item)}
                >
                  Phân bổ vị trí
                </button>
              </div>
            ))}
          </section>
        )}

        {laterReceipt && (
          <PendingReceiptAllocation
            key={laterReceipt.id}
            receipt={laterReceipt}
            products={products}
            onClose={() => setLaterReceipt(null)}
            onDone={async () => {
              await loadRecentStockDocuments();
              await loadPendingReceipts();
              await showReceiptDetail(laterReceipt.id);
              setLaterReceipt(null);
            }}
          />
        )}
      </div>

      {/* Dialog chi tiết lệnh yêu cầu nhập kho */}
      {inboundDetail && (
        <WarehouseRequestDialog
          request={inboundDetail}
          kind="IN"
          onClose={() => setInboundDetail(null)}
        />
      )}
    </main>
  );
}

