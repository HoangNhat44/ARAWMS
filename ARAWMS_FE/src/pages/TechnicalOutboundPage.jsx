/**
 * ============================================================================
 * @title        : Technical Outbound Page
 * @author       : AraWMS Team
 * @createdDate  : 2026-11-11
 * @lastModified : 2026-11-11
 * @description  : Trang quản lý "Lệnh xuất từ kỹ thuật" dành cho Quản lý kho (Warehouse Manager).
 *                 Theo dõi, phê duyệt và xử lý các yêu cầu xuất kho gửi từ bộ phận Kỹ thuật may:
 *                 - Yêu cầu cấp phát nguyên phụ liệu phục vụ sản xuất / mẫu thử.
 *                 - Lệnh xuất kho thành phẩm kiểm mẫu hoặc chuyển giao.
 * @module       : Warehouse / Technical Outbound
 * @layer        : Front-end (Page)
 * ============================================================================
 */

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, ArrowUpRight, CheckCircle2, AlertTriangle } from 'lucide-react';
import { garmentTechnicalService } from '../services/garmentTechnicalService';
import { productService } from '../services/productService';
import { useAuth } from '../hooks/useAuth';
import WarehouseOutboundList from '../components/WarehouseOutboundList';
import WarehouseRequestDialog from '../components/WarehouseRequestDialog';
import '../styles/finishedGoods.css';

export default function TechnicalOutboundPage() {
  const { user } = useAuth();
  const ownerId = user?.id || user?._id;

  const [outboundMaterialRequests, setOutboundMaterialRequests] = useState([]);
  const [outboundFinishedDocuments, setOutboundFinishedDocuments] = useState([]);
  const [outboundLoading, setOutboundLoading] = useState(false);
  const [outboundError, setOutboundError] = useState('');
  const [outboundDetail, setOutboundDetail] = useState(null);
  const [notice, setNotice] = useState('');

  // Tải danh sách yêu cầu xuất kho từ kỹ thuật (nguyên phụ liệu & thành phẩm)
  const loadOutbound = async () => {
    if (!navigator.onLine) return;
    setOutboundLoading(true);
    setOutboundError('');
    try {
      const [material, finished] = await Promise.allSettled([
        garmentTechnicalService.remnant.getOutboundRequests(),
        productService.outboundDocuments(),
      ]);

      if (material.status === 'fulfilled') {
        setOutboundMaterialRequests(material.value.data || []);
      }
      if (finished.status === 'fulfilled') {
        setOutboundFinishedDocuments(finished.value.data?.documents || []);
      }

      const errors = [material, finished]
        .filter((res) => res.status === 'rejected')
        .map((res) => res.reason?.message || 'Lỗi tải dữ liệu');
      if (errors.length > 0) {
        setOutboundError(errors.join(' · '));
      }
    } catch (err) {
      setOutboundError(err.message || 'Không thể tải danh sách lệnh xuất từ kỹ thuật');
    } finally {
      setOutboundLoading(false);
    }
  };

  useEffect(() => {
    loadOutbound();
  }, [ownerId]);

  return (
    <main className="finished-goods-page">
      {/* Breadcrumb */}
      <nav className="product-breadcrumb" aria-label="Đường dẫn">
        <Link to="/">Trang chủ</Link>
        <span>/</span>
        <Link to="/warehouse/finished-goods">Quản lý kho</Link>
        <span>/</span>
        <strong>Lệnh xuất từ kỹ thuật</strong>
      </nav>

      {/* Page Header */}
      <div className="product-page-head finished-goods-hero">
        <div className="finished-goods-intro">
          <p className="product-eyebrow">VẬN HÀNH KHO / CẤP PHÁT CHO KỸ THUẬT</p>
          <h1>Lệnh xuất từ kỹ thuật</h1>
          <p>
            Theo dõi và xử lý các yêu cầu xuất nguyên phụ liệu (vải, phụ liệu, chỉ may) và thành phẩm
            được tạo từ bộ phận Kỹ thuật may hoặc xưởng cắt.
          </p>
        </div>
        <div className="finished-goods-main-actions">
          <button
            className="btn-ara-secondary"
            type="button"
            disabled={outboundLoading}
            onClick={loadOutbound}
          >
            <RefreshCw size={17} className={outboundLoading ? 'animate-spin' : ''} />
            Làm mới danh sách
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

      {/* Danh sách lệnh xuất từ kỹ thuật */}
      <WarehouseOutboundList
        materialRequests={outboundMaterialRequests}
        finishedDocuments={outboundFinishedDocuments}
        loading={outboundLoading}
        error={outboundError}
        onRefresh={loadOutbound}
        onOpen={setOutboundDetail}
      />

      {/* Dialog chi tiết phiếu xuất */}
      {outboundDetail && (
        <WarehouseRequestDialog
          request={outboundDetail}
          kind="OUT"
          onClose={() => setOutboundDetail(null)}
        />
      )}
    </main>
  );
}
