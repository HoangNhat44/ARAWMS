/**
 * ============================================================================
 * @title        : Customer Order History Component
 * @author       : Nguyễn Quang Huy
 * @createdDate  : 2026-10-27
 * @lastModified : 2026-11-14
 * @description  : Hiển thị danh sách lịch sử mua hàng của khách hàng (UC-76),
 *                 hỗ trợ mở popup chi tiết đơn (UC-80) và kích hoạt yêu cầu đổi trả RMA (UC-82).
 *                 (Refactor 2026-10-28: giao diện chỉ dùng Bootstrap / React-Bootstrap.)
 * @module       : Order Fulfillment / Direct Order Management
 * @layer        : Front-end
 * ============================================================================
 */

import React, { useState, useEffect } from 'react';
import { Card, Button, Alert, Stack } from 'react-bootstrap';
import { sellerService } from '../../services/sellerService';
import { SkeletonOrderHistoryCard } from '../common/Skeleton';
import { Icon, EmptyState, formatVnd, ORDER_STATUS_CLASS } from './SellerUi';

/**
 * Nhãn + icon hiển thị cho từng trạng thái đơn trong lịch sử mua hàng (100% thuần tiếng Việt).
 * @constant {Object<string,{label:string, icon:string}>}
 */
const HISTORY_STATUS_META = {
  PENDING: { label: 'Chờ xác nhận', icon: 'clock' },
  CONFIRMED_RESERVED: { label: 'Đã xác nhận, đã giữ hàng', icon: 'clock' },
  PICKING: { label: 'Đang soạn hàng', icon: 'box-seam' },
  PACKED: { label: 'Đã đóng hàng, chờ bàn giao', icon: 'archive' },
  HANDED_OVER_CARRIER: { label: 'Đã bàn giao cho bên vận chuyển', icon: 'truck' },
  CARRIER_PICKED_UP: { label: 'Đã lấy hàng', icon: 'truck' },
  DELIVERED: { label: 'Đã giao thành công', icon: 'check-circle' },
  COMPLETED: { label: 'Hoàn thành (Bán tại quầy)', icon: 'check-circle-fill' },
  EXCHANGE_REQUESTED: { label: 'Đang đổi hàng', icon: 'arrow-repeat' },
  RETURN_REQUESTED: { label: 'Khách yêu cầu trả hàng', icon: 'arrow-counterclockwise' },
  CANCELLED: { label: 'Đã hủy', icon: 'x-circle' },
  RETURNED: { label: 'Đã hoàn về kho', icon: 'box-arrow-in-down-left' },
};

/**
 * Component danh sách lịch sử đơn hàng của khách hàng trong phân hệ bán hàng Seller.
 *
 * @component
 * @param {Object} props - Thuộc tính truyền vào component.
 * @param {string} props.customerId - ID của khách hàng đang được chọn.
 * @param {Function} [props.onRequestRma] - Callback mở modal tạo yêu cầu đổi/trả RMA.
 * @param {Function} [props.onViewDetail] - Callback mở modal chi tiết đơn hàng (OrderDetailModal).
 * @returns {JSX.Element} Danh sách thẻ lịch sử đơn hàng.
 */
const CustomerOrderHistory = ({ customerId, onRequestRma, onViewDetail }) => {
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
    const meta = HISTORY_STATUS_META[status] || {
      label: status === 'COMPLETED' ? 'Hoàn thành' :
             status === 'RETURN_REQUESTED' ? 'Đang hoàn hàng' :
             status === 'EXCHANGE_REQUESTED' ? 'Đang đổi hàng' :
             status === 'DELIVERED' ? 'Đã giao thành công' :
             status === 'HANDED_OVER_CARRIER' ? 'Đang giao hàng' :
             status === 'CANCELLED' ? 'Đã hủy' :
             status === 'RETURNED' ? 'Đã hoàn về kho' :
             status === 'PACKED' ? 'Đã lấy hàng' :
             status === 'PICKING' ? 'Đang lấy hàng' :
             status === 'CONFIRMED_RESERVED' ? 'Chờ lấy hàng' :
             status === 'PENDING' ? 'Mới' : (status || 'Mới'),
      icon: 'clock',
    };
    const badgeClass = ORDER_STATUS_CLASS[status] || 'ara-badge-secondary';
    return (
      <span className={`ara-badge ${badgeClass} d-inline-flex align-items-center gap-1`}>
        {meta.icon && <Icon name={meta.icon} />} {meta.label}
      </span>
    );
  };

  return (
    <Stack gap={2} className="h-100 overflow-auto small">
      {loading && (
        <Stack gap={2}>
          <SkeletonOrderHistoryCard />
          <SkeletonOrderHistoryCard />
          <SkeletonOrderHistoryCard />
        </Stack>
      )}

      {error && <Alert variant="danger" className="py-2">{error}</Alert>}

      {!loading && orders.length === 0 && (
        <EmptyState icon="bag" title="Khách hàng chưa có đơn hàng nào" />
      )}

      {!loading &&
        orders.map((ord) => (
          <Card
            key={ord._id || ord.id}
            className="shadow-sm bg-white"
            style={{
              border: '1px solid var(--wms-border, #C8B9A6)',
              borderRadius: '8px',
            }}
          >
            <Card.Body className="p-3">
              <div className="d-flex align-items-center justify-content-between mb-2">
                <span className="font-monospace fw-bold tabular-nums" style={{ color: 'var(--wms-text-primary, #141210)' }}>
                  {ord.orderCode}
                </span>
                {getOrderStatusBadge(ord.status)}
              </div>

              {/* Items summary */}
              <div style={{ color: 'var(--wms-secondary, #574F46)' }}>
                {ord.items?.map((it, idx) => (
                  <div key={idx} className="d-flex justify-content-between py-0.5">
                    <span><strong style={{ color: 'var(--wms-text-primary, #141210)' }}>{it.orderedQty}x</strong> {it.skuCode}</span>
                    <span className="fw-medium tabular-nums">{formatVnd(it.subtotalAmount)}</span>
                  </div>
                ))}
              </div>
            </Card.Body>

            {/* Total and Action */}
            <Card.Footer
              className="d-flex align-items-center justify-content-between bg-white"
              style={{
                borderTop: '1px solid var(--wms-border, #C8B9A6)',
                padding: '10px 14px'
              }}
            >
              <div>
                <span style={{ color: 'var(--wms-text-secondary, #574F46)', fontSize: '11.5px' }}>Tổng: </span>
                <span className="fw-bold tabular-nums" style={{ color: 'var(--wms-accent, #8A6A46)', fontSize: '0.95rem' }}>
                  {formatVnd(ord.financialSummary?.totalOrderAmount)}
                </span>
              </div>
              <Stack direction="horizontal" gap={1.5}>
                {/* Xem chi tiết và đổi trạng thái */}
                {onViewDetail && (
                  <Button size="sm" className="btn-wms-default rounded-pill px-2.5 py-0.5" style={{ fontSize: '11.5px' }} onClick={() => onViewDetail(ord)}>
                    <Icon name="eye" className="me-1" />Chi tiết
                  </Button>
                )}
                {/* RMA Button (UC-82) */}
                {['DELIVERED', 'COMPLETED'].includes(ord.status) && (
                  <Button size="sm" className="btn-wms-default rounded-pill px-2.5 py-0.5" style={{ fontSize: '11.5px' }} onClick={() => onRequestRma && onRequestRma(ord)}>
                    <Icon name="arrow-counterclockwise" className="me-1" />Đổi / Trả
                  </Button>
                )}
              </Stack>
            </Card.Footer>
          </Card>
        ))}
    </Stack>
  );
};

export default CustomerOrderHistory;
