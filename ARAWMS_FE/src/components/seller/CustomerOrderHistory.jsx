/**
 * ============================================================================
 * @title        : Customer Order History Component
 * @author       : Nguyễn Quang Huy
 * @createdDate  : 2026-10-27
 * @lastModified : 2026-10-28
 * @description  : Hiển thị danh sách lịch sử mua hàng của khách hàng (UC-76),
 *                 hỗ trợ mở popup chi tiết đơn (UC-80) và kích hoạt yêu cầu đổi trả RMA (UC-82).
 *                 (Refactor 2026-10-28: giao diện chỉ dùng Bootstrap / React-Bootstrap.)
 * @module       : Order Fulfillment / Direct Order Management
 * @layer        : Front-end
 * ============================================================================
 */

import React, { useState, useEffect } from 'react';
import { Card, Badge, Button, Alert, Stack } from 'react-bootstrap';
import { sellerService } from '../../services/sellerService';
import { SkeletonOrderHistoryCard } from '../common/Skeleton';
import { Icon, EmptyState, formatVnd, ORDER_STATUS_VARIANT } from './SellerUi';

/**
 * Nhãn + icon hiển thị cho từng trạng thái đơn trong lịch sử mua hàng.
 * @constant {Object<string,{label:string, icon:string}>}
 */
const HISTORY_STATUS_META = {
  DELIVERED: { label: 'Đã giao thành công', icon: 'check-circle' },
  CONFIRMED_RESERVED: { label: 'Đã giữ chỗ kho', icon: 'clock' },
  PENDING: { label: 'Chờ xác nhận', icon: 'clock' },
  HANDED_OVER_CARRIER: { label: 'Đang giao hàng', icon: 'truck' },
  CANCELLED: { label: 'Đã hủy', icon: 'x-circle' },
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
    const meta = HISTORY_STATUS_META[status];
    const variant = ORDER_STATUS_VARIANT[status] || 'secondary';
    return (
      <Badge bg={`${variant}-subtle`} text={`${variant}-emphasis`} className="d-inline-flex align-items-center gap-1">
        {meta && <Icon name={meta.icon} />} {meta ? meta.label : status}
      </Badge>
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
          <Card key={ord._id || ord.id} className="shadow-sm">
            <Card.Body className="pb-2">
              <div className="d-flex align-items-center justify-content-between mb-2">
                <span className="font-monospace fw-bold">{ord.orderCode}</span>
                {getOrderStatusBadge(ord.status)}
              </div>

              {/* Items summary */}
              <div className="text-secondary">
                {ord.items?.map((it, idx) => (
                  <div key={idx} className="d-flex justify-content-between">
                    <span><strong>{it.orderedQty}x</strong> {it.skuCode}</span>
                    <span>{formatVnd(it.subtotalAmount)}</span>
                  </div>
                ))}
              </div>
            </Card.Body>

            {/* Total and Action */}
            <Card.Footer className="bg-white d-flex align-items-center justify-content-between">
              <div>
                <span className="text-secondary">Tổng: </span>
                <span className="fw-bold text-warning-emphasis">{formatVnd(ord.financialSummary?.totalOrderAmount)}</span>
              </div>
              <Stack direction="horizontal" gap={1}>
                {/* Xem chi tiết và đổi trạng thái */}
                {onViewDetail && (
                  <Button size="sm" variant="outline-secondary" onClick={() => onViewDetail(ord)}>
                    <Icon name="eye" className="me-1" />Chi tiết
                  </Button>
                )}
                {/* RMA Button (UC-82) */}
                {['DELIVERED', 'COMPLETED', 'CONFIRMED_RESERVED'].includes(ord.status) && (
                  <Button size="sm" variant="outline-warning" onClick={() => onRequestRma && onRequestRma(ord)}>
                    <Icon name="arrow-counterclockwise" className="me-1" />Đổi/Trả
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
