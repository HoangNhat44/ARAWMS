/**
 * ============================================================================
 * @title        : Technical Inbound Page (Lệnh Nhập Thành Phẩm Từ Kỹ Thuật)
 * @author       : AraWMS Team
 * @createdDate  : 2026-11-11
 * @lastModified : 2026-11-11
 * @description  : Trang quản lý "Lệnh nhập thành phẩm từ kỹ thuật" cho Quản lý kho:
 *                 - Chỉ quản lý các lệnh nhập của KHO THÀNH PHẨM (không trùng với Kho NPL).
 *                 - Phiếu KCS thành phẩm may mới / xưởng may gia công (INBOUND_FROM_SEWING).
 *                 - Phiếu KCS hàng hoàn/trả đạt tiêu chuẩn gửi nhập kho (INBOUND_FROM_RETURN).
 *                 - Hỗ trợ kiểm nhận, chọn vị trí kệ (Putaway) và xác nhận nhập kho thành phẩm.
 * @module       : Warehouse / Technical Finished Goods Inbound
 * @layer        : Front-end (Page)
 * ============================================================================
 */

import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  RefreshCw,
  ArrowDownToLine,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Search,
  Filter,
  Shirt,
  RotateCcw,
  Package,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { productService } from '../services/productService';
import { useAuth } from '../hooks/useAuth';
import BulkStockForm from '../components/BulkStockForm';
import WarehouseRequestDialog from '../components/WarehouseRequestDialog';
import '../styles/finishedGoods.css';

export default function TechnicalInboundPage() {
  const { user } = useAuth();
  const ownerId = user?.id || user?._id;

  const [technicalRequests, setTechnicalRequests] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Bộ lọc & Tìm kiếm
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL'); // 'ALL' | 'INBOUND_FROM_SEWING' | 'INBOUND_FROM_RETURN'
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'READY_TO_CONFIRM' | 'COMPLETED'
  const [page, setPage] = useState(1);
  const pageSize = 15;

  // Dialog & Form states
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [bulkDirection, setBulkDirection] = useState('');
  const [inboundDetail, setInboundDetail] = useState(null);

  // Tải danh mục sản phẩm (phục vụ chọn kệ kho thành phẩm)
  const loadProducts = async () => {
    if (!navigator.onLine) return;
    try {
      const response = await productService.list();
      setProducts(response.data?.products || []);
    } catch (err) {
      console.warn('Lỗi tải danh mục sản phẩm:', err);
    }
  };

  // Tải danh sách lệnh nhập thành phẩm từ kỹ thuật
  const loadRequests = async () => {
    if (!navigator.onLine) return;
    setLoading(true);
    setError('');
    try {
      const res = await productService.technicalRequests();
      setTechnicalRequests(res.data?.requests || []);
    } catch (err) {
      setError(err.message || 'Không thể tải danh sách lệnh nhập thành phẩm');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
    loadProducts();
  }, [ownerId]);

  // Lọc và tìm kiếm danh sách lệnh nhập
  const filteredRequests = useMemo(() => {
    return technicalRequests.filter((item) => {
      // Lọc theo loại lệnh
      if (typeFilter !== 'ALL') {
        const itemType = item.ticketType || (item.code?.startsWith('PNHH') ? 'INBOUND_FROM_RETURN' : 'INBOUND_FROM_SEWING');
        if (itemType !== typeFilter) return false;
      }

      // Lọc theo trạng thái
      if (statusFilter !== 'ALL') {
        if (statusFilter === 'READY_TO_CONFIRM') {
          if (item.status !== 'READY_TO_CONFIRM' || item.receiptId) return false;
        } else if (statusFilter === 'COMPLETED') {
          if (item.status !== 'COMPLETED' && !item.receiptId) return false;
        }
      }

      // Tìm kiếm từ khóa
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchCode = item.code?.toLowerCase().includes(q);
        const matchTech = item.technician?.toLowerCase().includes(q);
        const matchLines = item.lines?.some(
          (l) =>
            l.skuCode?.toLowerCase().includes(q) ||
            l.productName?.toLowerCase().includes(q) ||
            l.productCode?.toLowerCase().includes(q)
        );
        const matchQc = item.qcNote?.toLowerCase().includes(q);
        if (!matchCode && !matchTech && !matchLines && !matchQc) return false;
      }

      return true;
    });
  }, [technicalRequests, typeFilter, statusFilter, searchQuery]);

  // Phân trang
  const totalPages = Math.max(1, Math.ceil(filteredRequests.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visibleRequests = filteredRequests.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Thống kê KPI
  const pendingCount = technicalRequests.filter((item) => item.status === 'READY_TO_CONFIRM' && !item.receiptId).length;
  const completedCount = technicalRequests.filter((item) => item.status === 'COMPLETED' || item.receiptId).length;
  const returnCount = technicalRequests.filter(
    (item) => item.ticketType === 'INBOUND_FROM_RETURN' || item.code?.startsWith('PNHH')
  ).length;

  // Bắt đầu kiểm nhận & chọn kệ
  const handleStartReceiving = (request) => {
    setInboundDetail(null);
    setSelectedRequest({
      ...request,
      warehouse: 'FINISHED_GOODS',
    });
    setBulkDirection('IN');
    setError('');
    setNotice('');
  };

  return (
    <main className="finished-goods-page" style={{ padding: '1.5rem', maxWidth: '1440px', margin: '0 auto' }}>
      {/* Breadcrumb */}
      <nav className="product-breadcrumb" aria-label="Đường dẫn" style={{ marginBottom: '1rem' }}>
        <Link to="/">Trang chủ</Link>
        <span>/</span>
        <Link to="/warehouse/finished-goods">Kho thành phẩm</Link>
        <span>/</span>
        <strong>Lệnh nhập thành phẩm từ kỹ thuật</strong>
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
            <Shirt size={15} /> KHO THÀNH PHẨM / TIẾP NHẬN TỪ KỸ THUẬT
          </div>
          <h1 style={{ margin: '0 0 0.5rem 0', fontSize: '1.75rem', fontWeight: 800 }}>
            Lệnh nhập thành phẩm từ kỹ thuật
          </h1>
          <p style={{ margin: 0, color: '#6B7280', fontSize: '0.92rem' }}>
            Tiếp nhận và kiểm nhận các lô thành phẩm may mới từ xưởng gia công (PKCS) hoặc hàng hoàn/trả đạt chuẩn KCS
            (PNHH) để phân bổ vào các ô kệ kho thành phẩm.
          </p>
        </div>

        <div className="finished-goods-main-actions">
          <button
            className="btn-ara-secondary"
            type="button"
            disabled={loading}
            onClick={loadRequests}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Làm mới danh sách
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        <div
          style={{
            background: '#FFFFFF',
            borderRadius: '10px',
            padding: '1rem 1.25rem',
            border: '1px solid var(--ara-border)',
            boxShadow: 'var(--ara-shadow-sm)',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
          }}
        >
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '8px',
              background: '#F3F4F6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#374151',
            }}
          >
            <Layers size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.78rem', color: '#6B7280', fontWeight: 600 }}>TỔNG LỆNH THÀNH PHẨM</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#111827' }}>
              {technicalRequests.length}
            </div>
          </div>
        </div>

        <div
          style={{
            background: '#FFFFFF',
            borderRadius: '10px',
            padding: '1rem 1.25rem',
            border: '1px solid #FDE68A',
            boxShadow: 'var(--ara-shadow-sm)',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
          }}
        >
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '8px',
              background: '#FFFBEB',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#D97706',
            }}
          >
            <Clock size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.78rem', color: '#B45309', fontWeight: 600 }}>CHỜ KIỂM NHẬN & VÀO KỆ</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#92400E' }}>{pendingCount}</div>
          </div>
        </div>

        <div
          style={{
            background: '#FFFFFF',
            borderRadius: '10px',
            padding: '1rem 1.25rem',
            border: '1px solid #A7F3D0',
            boxShadow: 'var(--ara-shadow-sm)',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
          }}
        >
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '8px',
              background: '#ECFDF5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#059669',
            }}
          >
            <CheckCircle2 size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.78rem', color: '#059669', fontWeight: 600 }}>ĐÃ HOÀN TẤT NHẬP KHO</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#065F46' }}>{completedCount}</div>
          </div>
        </div>

        <div
          style={{
            background: '#FFFFFF',
            borderRadius: '10px',
            padding: '1rem 1.25rem',
            border: '1px solid #E5E7EB',
            boxShadow: 'var(--ara-shadow-sm)',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
          }}
        >
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '8px',
              background: '#F9FAFB',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--ara-gold)',
            }}
          >
            <RotateCcw size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.78rem', color: '#6B7280', fontWeight: 600 }}>NHẬP HÀNG HOÀN/TRẢ</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#111827' }}>{returnCount}</div>
          </div>
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
          {/* Ô tìm kiếm */}
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
              placeholder="Tìm theo mã lệnh, SKU, tên sản phẩm, kỹ thuật viên..."
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

          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Lọc loại lệnh */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
              <span style={{ color: '#6B7280', fontWeight: 600 }}>Nguồn:</span>
              <select
                value={typeFilter}
                onChange={(e) => {
                  setTypeFilter(e.target.value);
                  setPage(1);
                }}
                style={{
                  padding: '0.5rem 0.75rem',
                  borderRadius: '6px',
                  border: '1px solid #D1D5DB',
                  background: '#FFFFFF',
                  fontSize: '0.85rem',
                }}
              >
                <option value="ALL">Tất cả nguồn thành phẩm</option>
                <option value="INBOUND_FROM_SEWING">May mới xưởng KCS (PKCS)</option>
                <option value="INBOUND_FROM_RETURN">Hàng hoàn/trả đạt KCS (PNHH)</option>
              </select>
            </div>

            {/* Lọc trạng thái */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
              <span style={{ color: '#6B7280', fontWeight: 600 }}>Trạng thái:</span>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                style={{
                  padding: '0.5rem 0.75rem',
                  borderRadius: '6px',
                  border: '1px solid #D1D5DB',
                  background: '#FFFFFF',
                  fontSize: '0.85rem',
                }}
              >
                <option value="ALL">Tất cả trạng thái</option>
                <option value="READY_TO_CONFIRM">Chờ kiểm nhận & vào kệ</option>
                <option value="COMPLETED">Đã hoàn thành nhập kho</option>
              </select>
            </div>
          </div>
        </div>

        {/* Bảng dữ liệu lệnh nhập thành phẩm */}
        {loading && visibleRequests.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#6B7280' }}>
            <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 0.5rem auto' }} />
            <div>Đang tải danh sách lệnh nhập thành phẩm...</div>
          </div>
        ) : visibleRequests.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#6B7280' }}>
            <Shirt size={32} style={{ margin: '0 auto 0.5rem auto', opacity: 0.4 }} />
            <div>Không có lệnh nhập thành phẩm nào phù hợp.</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
              <thead>
                <tr style={{ background: '#F9FAFB', borderBottom: '1px solid var(--ara-border)', color: '#4B5563' }}>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left' }}>Mã lệnh</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left' }}>Nguồn nhập</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left' }}>Kỹ thuật viên KCS</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left' }}>Chi tiết SKU cần nhận</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Tổng đạt</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left' }}>Thời gian gửi</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Trạng thái</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {visibleRequests.map((request) => {
                  const isReturn =
                    request.ticketType === 'INBOUND_FROM_RETURN' || request.code?.startsWith('PNHH');
                  const isPending = request.status === 'READY_TO_CONFIRM' && !request.receiptId;

                  return (
                    <tr
                      key={request.id}
                      style={{
                        borderBottom: '1px solid #F3F4F6',
                        background: isPending ? '#FFFDF8' : '#FFFFFF',
                      }}
                    >
                      <td style={{ padding: '0.85rem 1rem', fontWeight: 700, fontFamily: 'monospace' }}>
                        {request.code}
                      </td>

                      <td style={{ padding: '0.85rem 1rem' }}>
                        {isReturn ? (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.35rem',
                              padding: '0.25rem 0.6rem',
                              borderRadius: '6px',
                              background: '#FEF3C7',
                              color: '#92400E',
                              fontSize: '0.78rem',
                              fontWeight: 700,
                              border: '1px solid #FDE68A',
                            }}
                          >
                            <RotateCcw size={12} /> Hàng hoàn/trả
                          </span>
                        ) : (
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
                            <Shirt size={12} /> May mới gia công
                          </span>
                        )}
                      </td>

                      <td style={{ padding: '0.85rem 1rem', color: '#374151', fontWeight: 600 }}>
                        {request.technician || '—'}
                      </td>

                      <td style={{ padding: '0.85rem 1rem' }}>
                        <div style={{ display: 'grid', gap: '0.25rem' }}>
                          {request.lines?.map((line, idx) => (
                            <div key={line.skuId || idx} style={{ fontSize: '0.82rem' }}>
                              <span style={{ fontWeight: 700, fontFamily: 'monospace', color: '#111827' }}>
                                {line.skuCode}
                              </span>
                              {line.productName && <span style={{ color: '#4B5563' }}> ({line.productName})</span>}:{' '}
                              <strong style={{ color: '#059669' }}>{Number(line.expectedQty || 0).toLocaleString()}</strong> cái
                            </div>
                          ))}
                        </div>
                      </td>

                      <td style={{ padding: '0.85rem 1rem', textAlign: 'center', fontWeight: 800, fontSize: '0.95rem' }}>
                        {Number(request.passedQty || request.totalBatchQty || 0).toLocaleString()}
                      </td>

                      <td style={{ padding: '0.85rem 1rem', fontSize: '0.82rem', color: '#6B7280' }}>
                        {request.createdAt ? new Date(request.createdAt).toLocaleString('vi-VN') : '—'}
                      </td>

                      <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                        {isPending ? (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.35rem',
                              padding: '0.25rem 0.6rem',
                              borderRadius: '6px',
                              background: '#FEF0C7',
                              color: '#9A5B06',
                              fontSize: '0.78rem',
                              fontWeight: 700,
                              border: '1px solid #F5B95F',
                            }}
                          >
                            <Clock size={12} /> Chờ kiểm nhận
                          </span>
                        ) : (
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
                            <CheckCircle2 size={12} /> Đã nhập kho
                          </span>
                        )}
                      </td>

                      <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                        {isPending ? (
                          <button
                            type="button"
                            onClick={() => handleStartReceiving(request)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.4rem',
                              padding: '0.45rem 0.85rem',
                              borderRadius: '6px',
                              background: 'var(--ara-gold)',
                              color: '#FFFFFF',
                              border: 'none',
                              fontSize: '0.82rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                              boxShadow: 'var(--ara-shadow-sm)',
                            }}
                          >
                            <ArrowDownToLine size={14} /> Kiểm nhận & Chọn kệ
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              setInboundDetail({
                                ...request,
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
                        )}
                      </td>
                    </tr>
                  );
                })}
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
              Trang {currentPage} / {totalPages} (Tổng số {filteredRequests.length} lệnh)
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

      {/* Dialog chi tiết lệnh yêu cầu nhập kho */}
      {inboundDetail && (
        <WarehouseRequestDialog
          request={inboundDetail}
          kind="IN"
          onClose={() => setInboundDetail(null)}
          onReceive={handleStartReceiving}
        />
      )}

      {/* Form kiểm nhận và phân bổ kệ kho thành phẩm */}
      {bulkDirection === 'IN' && (
        <div className="fg-request-overlay">
          <div className="fg-bulk-dialog">
            <BulkStockForm
              key={`IN:${selectedRequest?.id || ''}`}
              direction="IN"
              products={products}
              ownerId={ownerId}
              sourceTicket={selectedRequest}
              initialSkuIds={[]}
              initialProductId=""
              onCancel={() => setBulkDirection('')}
              onQueued={(msg) => {
                setBulkDirection('');
                setNotice(msg);
              }}
              onDone={async (document) => {
                setBulkDirection('');
                setNotice(
                  `Đã lưu phiếu nhập thành phẩm ${document.documentCode}: ${document.lineCount} dòng, tổng ${document.totalQuantity} sản phẩm.`
                );
                await loadRequests();
              }}
            />
          </div>
        </div>
      )}
    </main>
  );
}
