/**
 * ============================================================================
 * @title        : Technical Inbound Page
 * @author       : AraWMS Team
 * @createdDate  : 2026-11-11
 * @lastModified : 2026-11-11
 * @description  : Trang quản lý "Lệnh nhập từ kỹ thuật" dành cho Quản lý kho (Warehouse Manager).
 *                 Tiếp nhận, kiểm tra và phê duyệt các lệnh nhập kho gửi từ bộ phận Kỹ thuật may:
 *                 - Phiếu KCS thành phẩm may mới / gia công.
 *                 - Phiếu KCS hàng hoàn/trả đạt tiêu chuẩn.
 *                 - Lệnh nhập nguyên phụ liệu thừa / cuộn dở từ xưởng cắt.
 *                 Hỗ trợ chọn vị trí kệ (Putaway) hoặc nhập kho trực tiếp.
 * @module       : Warehouse / Technical Inbound
 * @layer        : Front-end (Page)
 * ============================================================================
 */

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, ArrowDownToLine, CheckCircle2, AlertTriangle } from 'lucide-react';
import { productService } from '../services/productService';
import { materialInboundService } from '../services/materialInboundService';
import { useAuth } from '../hooks/useAuth';
import UnifiedTechnicalInboundList from '../components/UnifiedTechnicalInboundList';
import WarehouseRequestDialog from '../components/WarehouseRequestDialog';
import BulkStockForm from '../components/BulkStockForm';
import DirectMaterialReceiptModal from '../components/DirectMaterialReceiptModal';
import '../styles/finishedGoods.css';

export default function TechnicalInboundPage() {
  const { user } = useAuth();
  const ownerId = user?.id || user?._id;

  const [technicalRequests, setTechnicalRequests] = useState([]);
  const [materialRequests, setMaterialRequests] = useState([]);
  const [products, setProducts] = useState([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [requestsError, setRequestsError] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  // Dialog state
  const [inboundDetail, setInboundDetail] = useState(null);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [bulkDirection, setBulkDirection] = useState('');
  const [handoffSkuIds, setHandoffSkuIds] = useState([]);
  const [initialProductId, setInitialProductId] = useState('');
  const [materialReceiptTarget, setMaterialReceiptTarget] = useState(null);
  const [materialOptions, setMaterialOptions] = useState({ suppliers: [], materials: [], locations: [] });

  // Tải danh sách sản phẩm để chọn kệ khi nhập thành phẩm
  const loadProducts = async () => {
    if (!navigator.onLine) return;
    try {
      const response = await productService.list();
      setProducts(response.data?.products || []);
    } catch (err) {
      console.warn('Lỗi tải danh mục sản phẩm:', err);
    }
  };

  // Tải danh sách lệnh nhập từ kỹ thuật (thành phẩm & nguyên phụ liệu)
  const loadTechnicalRequests = async () => {
    if (!navigator.onLine) return;
    setRequestsLoading(true);
    setRequestsError('');
    try {
      const [finished, material] = await Promise.allSettled([
        productService.technicalRequests(),
        materialInboundService.technicianRequests(),
      ]);

      if (finished.status === 'fulfilled') {
        setTechnicalRequests(finished.value.data?.requests || []);
      }
      if (material.status === 'fulfilled') {
        setMaterialRequests(material.value.data?.requests || []);
      }

      const errors = [finished, material]
        .filter((res) => res.status === 'rejected')
        .map((res) => res.reason?.message || 'Lỗi tải dữ liệu');
      if (errors.length > 0) {
        setRequestsError(errors.join(' · '));
      }
    } catch (err) {
      setRequestsError(err.message || 'Không thể tải danh sách lệnh nhập từ kỹ thuật');
    } finally {
      setRequestsLoading(false);
    }
  };

  // Bắt đầu quy trình kiểm nhận & chọn kệ
  const startReceiving = async (request) => {
    setInboundDetail(null);
    if (request.warehouse === 'FINISHED_GOODS') {
      setSelectedRequest(request);
      setBulkDirection('IN');
      setError('');
      setNotice('');
      return;
    }
    try {
      const options = await materialInboundService.options();
      setMaterialOptions(options.data || {});
      setMaterialReceiptTarget({ kind: 'request', id: request.id, request });
    } catch (failure) {
      setError(failure.message || 'Không thể mở quy trình nhập kho nguyên phụ liệu');
    }
  };

  useEffect(() => {
    loadTechnicalRequests();
    loadProducts();
  }, [ownerId]);

  // Đếm số lệnh cần xử lý
  const pendingCount =
    technicalRequests.filter((item) => item.status === 'READY_TO_CONFIRM' && !item.receiptId).length +
    materialRequests.filter((item) => !['COMPLETED', 'CANCELLED'].includes(item.status)).length;

  return (
    <main className="finished-goods-page">
      {/* Breadcrumb */}
      <nav className="product-breadcrumb" aria-label="Đường dẫn">
        <Link to="/">Trang chủ</Link>
        <span>/</span>
        <Link to="/warehouse/finished-goods">Quản lý kho</Link>
        <span>/</span>
        <strong>Lệnh nhập từ kỹ thuật</strong>
      </nav>

      {/* Page Header */}
      <div className="product-page-head finished-goods-hero">
        <div className="finished-goods-intro">
          <p className="product-eyebrow">VẬN HÀNH KHO / TIẾP NHẬN TỪ KỸ THUẬT</p>
          <h1>Lệnh nhập từ kỹ thuật</h1>
          <p>
            Tiếp nhận, kiểm tra và duyệt nhập kho các lô thành phẩm may mới, hàng hoàn/trả đạt tiêu chuẩn KCS,
            hoặc nguyên phụ liệu thừa gửi từ bộ phận Kỹ thuật may.
          </p>
        </div>
        <div className="finished-goods-main-actions">
          <button
            className="btn-ara-secondary"
            type="button"
            disabled={requestsLoading}
            onClick={loadTechnicalRequests}
          >
            <RefreshCw size={17} className={requestsLoading ? 'animate-spin' : ''} />
            Làm mới danh sách
          </button>
        </div>
      </div>

      {/* Thông báo kết quả */}
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

      {/* Danh sách lệnh nhập từ kỹ thuật (Thành phẩm & Nguyên phụ liệu) */}
      <UnifiedTechnicalInboundList
        finishedRequests={technicalRequests}
        materialRequests={materialRequests}
        loading={requestsLoading}
        error={requestsError}
        onRefresh={loadTechnicalRequests}
        onOpen={setInboundDetail}
      />

      {/* Dialog chi tiết lệnh yêu cầu nhập kho */}
      {inboundDetail && (
        <WarehouseRequestDialog
          request={inboundDetail}
          kind="IN"
          onClose={() => setInboundDetail(null)}
          onReceive={startReceiving}
        />
      )}

      {/* Form kiểm nhận và phân bổ kệ kho thành phẩm */}
      {bulkDirection === 'IN' && (
        <div className="fg-request-overlay">
          <div className="fg-bulk-dialog">
            <BulkStockForm
              key={`IN:${selectedRequest?.id || ''}:${initialProductId}`}
              direction="IN"
              products={products}
              ownerId={ownerId}
              sourceTicket={selectedRequest}
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
                  `Đã lưu phiếu nhập ${document.documentCode}: ${document.lineCount} dòng, tổng ${document.totalQuantity} sản phẩm.`
                );
                await loadTechnicalRequests();
              }}
            />
          </div>
        </div>
      )}

      {/* Modal nhập kho trực tiếp cho nguyên phụ liệu */}
      {materialReceiptTarget && (
        <DirectMaterialReceiptModal
          target={materialReceiptTarget}
          options={materialOptions}
          onClose={() => setMaterialReceiptTarget(null)}
          onSuccess={async () => {
            setMaterialReceiptTarget(null);
            setNotice('Đã xác nhận nhập kho nguyên phụ liệu thành công.');
            await loadTechnicalRequests();
          }}
        />
      )}
    </main>
  );
}
