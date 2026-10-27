/**
 * ============================================================================
 * @title        : Seller Orders Page Component
 * @author       : Nguyễn Quang Huy
 * @createdDate  : 2026-10-27
 * @lastModified : 2026-10-27
 * @description  : Màn hình quản lý danh sách đơn hàng bán lẻ của Seller. Cho phép
 *                 xác nhận giữ chỗ kho (GBR-10), hủy đơn giải phóng tồn kho (GBR-11)
 *                 và khởi tạo yêu cầu đổi/trả RMA (UC-82, UC-83).
 * @module       : Order Fulfillment / Seller Orders
 * @layer        : Front-end
 * ============================================================================
 */

import React, { useState, useEffect } from 'react';
import { Table } from 'react-bootstrap';
import {
  ShoppingBag, ArrowLeft, ShieldCheck, XCircle,
  Search, Clock, CheckCircle2, RotateCcw, SlidersHorizontal
} from 'lucide-react';
import { sellerService } from '../../services/sellerService';
import { useNavigate } from 'react-router-dom';
import CreateRmaModal from '../../components/seller/CreateRmaModal';
import { SkeletonOrderRow } from '../../components/common/Skeleton';

const STATUS_OPTIONS = [
  { id: '', label: 'Tất cả' },
  { id: 'PENDING', label: '⏳ Chờ xác nhận' },
  { id: 'CONFIRMED_RESERVED', label: '🔒 Đã giữ chỗ kho' },
  { id: 'PACKED', label: '📦 Đã đóng gói' },
  { id: 'DELIVERED', label: '✅ Đã giao hàng' },
  { id: 'CANCELLED', label: '❌ Đã hủy' },
];

/**
 * Component quản lý danh sách đơn hàng của Seller
 * @component
 */
const SellerOrdersPage = () => {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [actionLoading, setActionLoading] = useState(null); // orderId or null
  const [rmaModalOpen, setRmaModalOpen] = useState(false);
  const [selectedOrderForRma, setSelectedOrderForRma] = useState(null);

  useEffect(() => {
    fetchOrders();
  }, [statusFilter]);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const res = await sellerService.getOrderList({
        status: statusFilter || undefined,
        search: search || undefined,
      });
      if (res.success) {
        setOrders(res.data.items || []);
      }
    } catch (err) {
      console.warn('Lỗi tải danh sách đơn:', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmReserve = async (orderId) => {
    if (!window.confirm('Bạn có chắc muốn xác nhận và giữ chỗ tồn kho cho đơn hàng này?')) return;
    try {
      setActionLoading(orderId);
      const res = await sellerService.confirmOrderReserve(orderId);
      if (res.success) {
        fetchOrders();
      }
    } catch (err) {
      alert(`Lỗi: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancelOrder = async (orderId) => {
    const reason = window.prompt('Nhập lý do hủy đơn hàng:');
    if (!reason) return;
    try {
      setActionLoading(orderId);
      const res = await sellerService.cancelOrder(orderId, reason);
      if (res.success) {
        fetchOrders();
      }
    } catch (err) {
      alert(`Lỗi: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleOpenRma = (order) => {
    setSelectedOrderForRma(order);
    setRmaModalOpen(true);
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'CONFIRMED_RESERVED':
        return <span className="badge-ara-info d-inline-flex align-items-center gap-1"><Clock size={11} /> Đã Giữ Chỗ Kho</span>;
      case 'PENDING':
        return <span className="badge-ara-warning d-inline-flex align-items-center gap-1"><Clock size={11} /> Chờ Xác Nhận</span>;
      case 'PACKED':
        return <span className="badge-ara-gold d-inline-flex align-items-center gap-1">📦 Đã Đóng Gói</span>;
      case 'DELIVERED':
        return <span className="badge-ara-success d-inline-flex align-items-center gap-1"><CheckCircle2 size={11} /> Đã Giao Hàng</span>;
      case 'CANCELLED':
        return <span className="badge-ara-danger d-inline-flex align-items-center gap-1"><XCircle size={11} /> Đã Hủy</span>;
      default:
        return <span className="badge-ara-gold">{status}</span>;
    }
  };

  return (
    <div className="ara-orders-root">
      {/* ── Page Title Bar ─── */}
      <div className="ara-orders-titlebar">
        <div className="d-flex align-items-center gap-3">
          <button
            type="button"
            id="btn-back-to-chat"
            onClick={() => navigate('/seller/chat')}
            className="ara-back-btn"
          >
            <ArrowLeft size={15} />
            <span>Về Chat</span>
          </button>

          <div className="vr" style={{ height: '22px', opacity: 0.3 }} />

          <div className="d-flex align-items-center gap-2">
            <ShoppingBag size={18} color="var(--ara-gold)" />
            <h1 className="ara-orders-title">
              Quản Lý Đơn Hàng Bán Lẻ
            </h1>
            <span className="badge-ara-gold" style={{ fontSize: '0.68rem' }}>Seller</span>
          </div>
        </div>

        {/* Stats row */}
        <div className="d-flex align-items-center gap-3">
          <span className="text-muted" style={{ fontSize: '0.82rem' }}>
            Hiển thị <strong className="text-dark">{orders.length}</strong> đơn hàng
          </span>
        </div>
      </div>

      {/* ── Main Container ─── */}
      <div className="ara-orders-page">
        {/* Filter Bar */}
        <div className="ara-orders-filter-bar">
          <div className="d-flex align-items-center gap-2">
            <SlidersHorizontal size={15} color="var(--ara-gold)" />
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--ara-text-muted)' }}>Lọc:</span>
            <div className="d-flex flex-wrap gap-1">
              {STATUS_OPTIONS.map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setStatusFilter(st.id)}
                  className={`ara-tag-pill ${statusFilter === st.id ? 'active' : ''}`}
                  style={{ fontSize: '0.78rem' }}
                >
                  {st.label}
                </button>
              ))}
            </div>
          </div>

          {/* Search Form */}
          <form
            onSubmit={(e) => { e.preventDefault(); fetchOrders(); }}
            className="d-flex gap-2"
          >
            <div className="position-relative">
              <Search
                className="position-absolute"
                size={14}
                style={{ left: '10px', top: '11px', color: 'var(--ara-gold)' }}
              />
              <input
                id="orders-search-input"
                type="text"
                placeholder="Tìm mã đơn, người nhận, SĐT..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="form-control ara-input-search"
                style={{ width: '260px', paddingLeft: '2.2rem' }}
              />
            </div>
            <button
              type="submit"
              id="btn-orders-search"
              className="btn-ara-primary"
              style={{ padding: '0.5rem 1rem', fontSize: '0.82rem' }}
            >
              Tìm kiếm
            </button>
          </form>
        </div>

        {/* Orders Table */}
        <div className="ara-table-card">
          <Table responsive hover className="ara-orders-table mb-0">
            <thead>
              <tr>
                <th>Mã đơn</th>
                <th>Khách hàng & Người nhận</th>
                <th>Sản phẩm</th>
                <th>Tổng thanh toán (COD)</th>
                <th>Trạng thái</th>
                <th className="text-end">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <SkeletonOrderRow key={i} />
                  ))}
                </>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan="6" className="text-center py-5">
                    <ShoppingBag size={36} style={{ color: 'var(--ara-gold)', opacity: 0.4 }} className="mb-2 d-block mx-auto" />
                    <div className="text-muted" style={{ fontSize: '0.88rem' }}>Không tìm thấy đơn hàng nào phù hợp</div>
                  </td>
                </tr>
              ) : (
                orders.map((ord) => (
                  <tr key={ord._id || ord.id}>
                    {/* Mã đơn + ngày */}
                    <td>
                      <span className="font-monospace fw-bold" style={{ color: 'var(--ara-gold-hover)', fontSize: '0.88rem' }}>
                        {ord.orderCode}
                      </span>
                      <div className="text-muted" style={{ fontSize: '0.72rem', marginTop: '2px' }}>
                        {new Date(ord.createdAt).toLocaleDateString('vi-VN')}{' '}
                        {new Date(ord.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>

                    {/* Người nhận */}
                    <td>
                      <div className="fw-bold text-dark" style={{ fontSize: '0.88rem' }}>
                        {ord.shippingRecipient?.name || 'Khách vãng lai'}
                      </div>
                      <div className="text-muted" style={{ fontSize: '0.75rem' }}>{ord.shippingRecipient?.phone}</div>
                      <div className="text-secondary text-truncate" style={{ maxWidth: '220px', fontSize: '0.73rem' }}>
                        {ord.shippingRecipient?.address}
                      </div>
                    </td>

                    {/* Sản phẩm */}
                    <td>
                      <div className="d-flex flex-column gap-1" style={{ fontSize: '0.78rem' }}>
                        {ord.items?.map((it, idx) => (
                          <div key={idx} className="text-dark">
                            <strong>{it.orderedQty}x</strong> {it.skuCode}
                          </div>
                        ))}
                      </div>
                    </td>

                    {/* Tổng tiền */}
                    <td>
                      <div className="fw-bold" style={{ color: 'var(--ara-noir)', fontSize: '0.92rem' }}>
                        {(ord.financialSummary?.totalOrderAmount || 0).toLocaleString('vi-VN')} đ
                      </div>
                    </td>

                    {/* Trạng thái */}
                    <td>{getStatusBadge(ord.status)}</td>

                    {/* Thao tác */}
                    <td className="text-end">
                      <div className="d-flex justify-content-end gap-1 flex-wrap">
                        {/* UC-79: Xác nhận giữ chỗ */}
                        {ord.status === 'PENDING' && (
                          <button
                            type="button"
                            disabled={actionLoading === (ord._id || ord.id)}
                            onClick={() => handleConfirmReserve(ord._id || ord.id)}
                            className="btn-ara-primary d-inline-flex align-items-center gap-1"
                            style={{ fontSize: '0.75rem', padding: '0.3rem 0.7rem' }}
                            title="Xác nhận đơn và giữ chỗ tồn kho (UC-79)"
                          >
                            {actionLoading === (ord._id || ord.id) ? (
                              <span className="spinner-border spinner-border-sm" role="status" style={{ width: '12px', height: '12px' }} />
                            ) : (
                              <ShieldCheck size={13} />
                            )}
                            <span>Giữ chỗ kho</span>
                          </button>
                        )}

                        {/* UC-82: Tạo RMA */}
                        {['DELIVERED', 'COMPLETED', 'CONFIRMED_RESERVED'].includes(ord.status) && (
                          <button
                            type="button"
                            onClick={() => handleOpenRma(ord)}
                            className="d-inline-flex align-items-center gap-1"
                            style={{
                              fontSize: '0.75rem',
                              padding: '0.3rem 0.65rem',
                              background: '#FEF6E6',
                              border: '1px solid #FCDFA6',
                              color: '#A36800',
                              borderRadius: 'var(--radius-sm)',
                              cursor: 'pointer',
                              fontWeight: 600,
                            }}
                            title="Tạo phiếu đổi/trả RMA (UC-82)"
                          >
                            <RotateCcw size={12} />
                            <span>Đổi/Trả</span>
                          </button>
                        )}

                        {/* UC-80: Hủy đơn */}
                        {!['PACKED', 'HANDED_OVER_CARRIER', 'DELIVERED', 'CANCELLED'].includes(ord.status) && (
                          <button
                            type="button"
                            disabled={actionLoading === (ord._id || ord.id)}
                            onClick={() => handleCancelOrder(ord._id || ord.id)}
                            className="d-inline-flex align-items-center gap-1"
                            style={{
                              fontSize: '0.75rem',
                              padding: '0.3rem 0.65rem',
                              background: '#FDF0F0',
                              border: '1px solid #F8C3C2',
                              color: '#C5221F',
                              borderRadius: 'var(--radius-sm)',
                              cursor: 'pointer',
                              fontWeight: 600,
                            }}
                            title="Hủy đơn hàng (UC-80)"
                          >
                            <XCircle size={12} />
                            <span>Hủy đơn</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </div>
      </div>

      {/* RMA Modal */}
      <CreateRmaModal
        isOpen={rmaModalOpen}
        onClose={() => setRmaModalOpen(false)}
        order={selectedOrderForRma}
        onRmaCreated={() => {
          alert('Phiếu RMA đã được tạo thành công!');
          setRmaModalOpen(false);
          fetchOrders();
        }}
      />
    </div>
  );
};

export default SellerOrdersPage;
