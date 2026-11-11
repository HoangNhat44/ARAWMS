/**
 * ============================================================================
 * @title        : Technical Outbound Page (Lệnh Xuất Thành Phẩm)
 * @author       : AraWMS Team
 * @createdDate  : 2026-11-11
 * @lastModified : 2026-11-11
 * @description  : Trang quản lý "Lệnh xuất thành phẩm" dành cho Quản lý kho:
 *                 - Chuyên biệt quản lý các chứng từ xuất kho thành phẩm (không trùng với Xuất NPL).
 *                 - Xuất kho thành phẩm kiểm mẫu, trả hàng, hoặc xuất kho hàng loạt.
 *                 - Tra cứu số chứng từ, người nhận / mục đích, số lượng sản phẩm và trạng thái.
 * @module       : Warehouse / Technical Finished Goods Outbound
 * @layer        : Front-end (Page)
 * ============================================================================
 */

import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  RefreshCw,
  ArrowUpFromLine,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Search,
  Shirt,
  Layers,
} from 'lucide-react';
import { productService } from '../services/productService';
import { useAuth } from '../hooks/useAuth';
import WarehouseRequestDialog from '../components/WarehouseRequestDialog';
import '../styles/finishedGoods.css';

export default function TechnicalOutboundPage() {
  const { user } = useAuth();
  const ownerId = user?.id || user?._id;

  const [finishedDocuments, setFinishedDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [outboundDetail, setOutboundDetail] = useState(null);

  // Bộ lọc & Tìm kiếm
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const pageSize = 15;

  // Tải danh sách chứng từ xuất kho thành phẩm
  const loadOutbound = async () => {
    if (!navigator.onLine) return;
    setLoading(true);
    setError('');
    try {
      const res = await productService.outboundDocuments();
      setFinishedDocuments(res.data?.documents || []);
    } catch (err) {
      setError(err.message || 'Không thể tải danh sách lệnh xuất thành phẩm');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOutbound();
  }, [ownerId]);

  // Lọc và tìm kiếm
  const filteredDocuments = useMemo(() => {
    return finishedDocuments.filter((item) => {
      if (statusFilter !== 'ALL') {
        const isCompleted = item.status === 'COMPLETED' || true;
        if (statusFilter === 'COMPLETED' && !isCompleted) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchCode = item.code?.toLowerCase().includes(q) || item.documentCode?.toLowerCase().includes(q);
        const matchPurpose = item.purpose?.toLowerCase().includes(q) || item.recipient?.toLowerCase().includes(q);
        const matchNote = item.note?.toLowerCase().includes(q);
        if (!matchCode && !matchPurpose && !matchNote) return false;
      }

      return true;
    });
  }, [finishedDocuments, statusFilter, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredDocuments.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visibleDocuments = filteredDocuments.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <main className="finished-goods-page" style={{ padding: '1.5rem', maxWidth: '1440px', margin: '0 auto' }}>
      {/* Breadcrumb */}
      <nav className="product-breadcrumb" aria-label="Đường dẫn" style={{ marginBottom: '1rem' }}>
        <Link to="/">Trang chủ</Link>
        <span>/</span>
        <Link to="/warehouse/finished-goods">Kho thành phẩm</Link>
        <span>/</span>
        <strong>Lệnh xuất thành phẩm</strong>
      </nav>

      {/* Page Header */}
      <div className="product-page-head finished-goods-hero" style={{ marginBottom: '1.5rem' }}>
        <div className="finished-goods-intro">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              color: 'var(--ara-gold)',
              fontSize: '0.8rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '0.25rem',
            }}
          >
            <Shirt size={15} /> KHO THÀNH PHẨM / CHỨNG TỪ XUẤT KHO
          </div>
          <h1 style={{ margin: '0 0 0.5rem 0', fontSize: '1.75rem', fontWeight: 800 }}>
            Lệnh xuất thành phẩm
          </h1>
          <p style={{ margin: 0, color: '#6B7280', fontSize: '0.92rem' }}>
            Quản lý và tra cứu các phiếu xuất kho thành phẩm kiểm mẫu, xuất chuyển giao hoặc xuất kho hàng loạt
            phục vụ bán hàng và kinh doanh.
          </p>
        </div>

        <div className="finished-goods-main-actions">
          <button
            className="btn-ara-secondary"
            type="button"
            disabled={loading}
            onClick={loadOutbound}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Làm mới danh sách
          </button>
        </div>
      </div>

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

      {/* Bảng danh sách & Bộ lọc */}
      <div
        style={{
          background: '#FFFFFF',
          borderRadius: '12px',
          border: '1px solid var(--ara-border)',
          boxShadow: 'var(--ara-shadow-sm)',
          overflow: 'hidden',
        }}
      >
        {/* Bộ lọc thanh công cụ */}
        <div
          style={{
            padding: '1rem 1.25rem',
            borderBottom: '1px solid var(--ara-border)',
            background: '#FAFAFA',
            display: 'flex',
            gap: '0.75rem',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ position: 'relative', minWidth: '280px', flex: 1, maxWidth: '420px' }}>
            <Search
              size={16}
              style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#9CA3AF',
              }}
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Tìm theo số chứng từ, người nhận, mục đích xuất..."
              style={{
                width: '100%',
                padding: '0.55rem 0.85rem 0.55rem 2.3rem',
                borderRadius: '8px',
                border: '1px solid #D1D5DB',
                fontSize: '0.88rem',
                outline: 'none',
              }}
            />
          </div>

          <div style={{ fontSize: '0.85rem', color: '#6B7280', fontWeight: 600 }}>
            {filteredDocuments.length} / {finishedDocuments.length} phiếu xuất
          </div>
        </div>

        {/* Bảng dữ liệu phiếu xuất thành phẩm */}
        {loading && visibleDocuments.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#6B7280' }}>
            <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 0.5rem auto' }} />
            <div>Đang tải danh sách phiếu xuất thành phẩm...</div>
          </div>
        ) : visibleDocuments.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#6B7280' }}>
            <Shirt size={32} style={{ margin: '0 auto 0.5rem auto', opacity: 0.4 }} />
            <div>Không có phiếu xuất kho thành phẩm nào phù hợp.</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
              <thead>
                <tr style={{ background: '#F9FAFB', borderBottom: '1px solid var(--ara-border)', color: '#4B5563' }}>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left' }}>Số chứng từ</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left' }}>Loại kho</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left' }}>Mục đích / Người nhận</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Số dòng</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Tổng xuất</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left' }}>Ngày xuất</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Trạng thái</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {visibleDocuments.map((item) => (
                  <tr key={item.id || item.code} style={{ borderBottom: '1px solid #F3F4F6' }}>
                    <td style={{ padding: '0.85rem 1rem', fontWeight: 700, fontFamily: 'monospace' }}>
                      {item.code || item.documentCode}
                    </td>

                    <td style={{ padding: '0.85rem 1rem' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          padding: '0.25rem 0.6rem',
                          borderRadius: '6px',
                          background: '#EFF6FF',
                          color: '#1E40AF',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          border: '1px solid #BFDBFE',
                        }}
                      >
                        <Shirt size={12} /> Kho thành phẩm
                      </span>
                    </td>

                    <td style={{ padding: '0.85rem 1rem', color: '#374151' }}>
                      {item.purpose || item.recipient || 'Xuất kho thành phẩm'}
                    </td>

                    <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                      {item.lines?.length || item.items?.length || item.lineCount || 0}
                    </td>

                    <td style={{ padding: '0.85rem 1rem', textAlign: 'center', fontWeight: 700 }}>
                      {Number(item.totalQuantity || item.quantity || 0).toLocaleString()}
                    </td>

                    <td style={{ padding: '0.85rem 1rem', fontSize: '0.82rem', color: '#6B7280' }}>
                      {item.createdAt ? new Date(item.createdAt).toLocaleString('vi-VN') : '—'}
                    </td>

                    <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          padding: '0.25rem 0.6rem',
                          borderRadius: '6px',
                          background: '#ECFDF5',
                          color: '#065F46',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          border: '1px solid #A7F3D0',
                        }}
                      >
                        <CheckCircle2 size={12} /> Đã hoàn thành
                      </span>
                    </td>

                    <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() =>
                          setOutboundDetail({
                            ...item,
                            warehouse: 'FINISHED_GOODS',
                          })
                        }
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                          padding: '0.45rem 0.85rem',
                          borderRadius: '6px',
                          background: '#F3F4F6',
                          color: '#374151',
                          border: '1px solid #E5E7EB',
                          fontSize: '0.82rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        Xem chi tiết
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Phân trang */}
        {totalPages > 1 && (
          <div
            style={{
              padding: '0.85rem 1.25rem',
              borderTop: '1px solid var(--ara-border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '0.85rem',
              color: '#4B5563',
            }}
          >
            <span>
              Trang {currentPage} / {totalPages} (Tổng số {filteredDocuments.length} phiếu)
            </span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                disabled={currentPage === 1}
                onClick={() => setPage(currentPage - 1)}
                style={{
                  padding: '0.4rem 0.8rem',
                  borderRadius: '6px',
                  border: '1px solid #D1D5DB',
                  background: '#FFFFFF',
                  cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                  opacity: currentPage === 1 ? 0.5 : 1,
                }}
              >
                Trước
              </button>
              <button
                type="button"
                disabled={currentPage === totalPages}
                onClick={() => setPage(currentPage + 1)}
                style={{
                  padding: '0.4rem 0.8rem',
                  borderRadius: '6px',
                  border: '1px solid #D1D5DB',
                  background: '#FFFFFF',
                  cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                  opacity: currentPage === totalPages ? 0.5 : 1,
                }}
              >
                Sau
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Dialog xem chi tiết phiếu xuất */}
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
