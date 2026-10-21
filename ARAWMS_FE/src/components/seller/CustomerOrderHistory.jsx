import React, { useState, useEffect } from 'react';
import { ShoppingBag, RotateCcw, CheckCircle2, Clock, Truck, XCircle } from 'lucide-react';
import { sellerService } from '../../services/sellerService';
import { SkeletonOrderHistoryCard } from '../common/Skeleton';

const CustomerOrderHistory = ({ customerId, onRequestRma }) => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (customerId) {
      fetchOrderHistory();
    }
  }, [customerId]);

  const fetchOrderHistory = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await sellerService.getCustomerPurchaseHistory(customerId);
      if (res.success) {
        setOrders(res.data || []);
      }
    } catch (err) {
      setError(err.message || 'Lỗi tải lịch sử đơn hàng');
    } finally {
      setLoading(false);
    }
  };

  const getOrderStatusBadge = (status) => {
    switch (status) {
      case 'DELIVERED':
        return (
          <span className="badge-ara-success d-inline-flex align-items-center gap-1">
            <CheckCircle2 size={11} /> Đã giao thành công
          </span>
        );
      case 'CONFIRMED_RESERVED':
        return (
          <span className="badge-ara-info d-inline-flex align-items-center gap-1">
            <Clock size={11} /> Đã giữ chỗ kho
          </span>
        );
      case 'PENDING':
        return (
          <span className="badge-ara-warning d-inline-flex align-items-center gap-1">
            <Clock size={11} /> Chờ xác nhận
          </span>
        );
      case 'HANDED_OVER_CARRIER':
        return (
          <span className="badge-ara-info d-inline-flex align-items-center gap-1">
            <Truck size={11} /> Đang giao hàng
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="badge-ara-danger d-inline-flex align-items-center gap-1">
            <XCircle size={11} /> Đã hủy
          </span>
        );
      default:
        return (
          <span className="badge-ara-gold">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="d-flex flex-column h-100 overflow-auto d-flex flex-column gap-2.5">
      {loading && (
        <div className="d-flex flex-column gap-2">
          <SkeletonOrderHistoryCard />
          <SkeletonOrderHistoryCard />
          <SkeletonOrderHistoryCard />
        </div>
      )}

      {error && <div className="alert alert-danger py-2 px-3 small">{error}</div>}

      {!loading && orders.length === 0 && (
        <div className="text-center py-5 text-muted small">
          <ShoppingBag size={32} className="mb-2" style={{ color: 'var(--ara-gold)', opacity: 0.5 }} />
          <div>Khách hàng chưa có đơn hàng nào</div>
        </div>
      )}

      {!loading &&
        orders.map((ord) => (
          <div
            key={ord._id}
            className="p-3 bg-white rounded border shadow-sm"
            style={{ borderColor: 'var(--ara-border, #E3D9CD)' }}
          >
            <div className="d-flex align-items-center justify-content-between mb-2">
              <span className="font-monospace fw-bold" style={{ color: 'var(--ara-noir)', fontSize: '0.85rem' }}>
                {ord.orderCode}
              </span>
              {getOrderStatusBadge(ord.status)}
            </div>

            {/* Items summary */}
            <div className="mb-2 text-secondary" style={{ fontSize: '0.78rem' }}>
              {ord.items?.map((it, idx) => (
                <div key={idx} className="d-flex justify-content-between py-0.5">
                  <span>
                    <strong>{it.orderedQty}x</strong> {it.skuCode}
                  </span>
                  <span>{(it.subtotalAmount || 0).toLocaleString('vi-VN')} đ</span>
                </div>
              ))}
            </div>

            {/* Total and Action */}
            <div className="d-flex align-items-center justify-content-between pt-2 border-top" style={{ fontSize: '0.78rem' }}>
              <div>
                <span className="text-muted small">Tổng: </span>
                <span className="fw-bold" style={{ color: 'var(--ara-gold-hover)', fontSize: '0.88rem' }}>
                  {(ord.financialSummary?.totalOrderAmount || 0).toLocaleString('vi-VN')} đ
                </span>
              </div>

              {/* RMA Button (UC-82) */}
              {['DELIVERED', 'COMPLETED', 'CONFIRMED_RESERVED'].includes(ord.status) && (
                <button
                  type="button"
                  onClick={() => onRequestRma && onRequestRma(ord)}
                  className="btn btn-sm btn-outline-warning text-dark d-flex align-items-center gap-1"
                  style={{ fontSize: '0.72rem', padding: '0.25rem 0.55rem', borderColor: '#FCDFA6' }}
                >
                  <RotateCcw size={12} color="#A36800" />
                  <span>Đổi/Trả (RMA)</span>
                </button>
              )}
            </div>
          </div>
        ))}
    </div>
  );
};

export default CustomerOrderHistory;
