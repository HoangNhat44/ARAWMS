import React, { useState, useEffect } from 'react';
import { ShoppingBag, RotateCcw, ChevronRight, CheckCircle2, Clock, Truck, XCircle } from 'lucide-react';
import { sellerService } from '../../services/sellerService';

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
          <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
            <CheckCircle2 size={11} /> Đã giao thành công
          </span>
        );
      case 'CONFIRMED_RESERVED':
        return (
          <span className="flex items-center gap-1 text-[11px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
            <Clock size={11} /> Đã giữ chỗ kho
          </span>
        );
      case 'PENDING':
        return (
          <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
            <Clock size={11} /> Chờ xác nhận
          </span>
        );
      case 'HANDED_OVER_CARRIER':
        return (
          <span className="flex items-center gap-1 text-[11px] font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full">
            <Truck size={11} /> Đang giao hàng
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="flex items-center gap-1 text-[11px] font-semibold text-red-700 bg-red-50 px-2 py-0.5 rounded-full">
            <XCircle size={11} /> Đã hủy
          </span>
        );
      default:
        return (
          <span className="text-[11px] font-semibold text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="flex flex-col h-full bg-white overflow-y-auto p-3 space-y-3">
      {loading && <div className="text-center text-xs text-gray-400 py-6">Đang tải lịch sử mua hàng...</div>}
      {error && <div className="text-xs text-red-600 bg-red-50 p-2.5 rounded-lg">{error}</div>}

      {!loading && orders.length === 0 && (
        <div className="flex flex-col items-center justify-center py-10 text-gray-400 text-xs text-center">
          <ShoppingBag size={32} className="mb-2 text-gray-300" />
          Khách hàng chưa có đơn hàng nào
        </div>
      )}

      {!loading &&
        orders.map((order) => (
          <div
            key={order._id}
            className="p-3 bg-gray-50 border border-gray-100 rounded-xl space-y-2 hover:border-indigo-200 transition"
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                {order.orderCode}
              </span>
              {getOrderStatusBadge(order.status)}
            </div>

            <div className="text-xs text-gray-500">
              Ngày đặt: {new Date(order.createdAt).toLocaleDateString('vi-VN')}
            </div>

            {/* Item list snapshot */}
            <div className="space-y-1 pt-1 border-t border-gray-200/50">
              {order.items?.map((it, idx) => (
                <div key={idx} className="flex justify-between text-xs text-gray-700">
                  <span className="line-clamp-1">
                    {it.orderedQty}x {it.skuCode}
                  </span>
                  <span className="font-medium shrink-0">
                    {(it.orderedQty * it.unitSalePrice).toLocaleString('vi-VN')} đ
                  </span>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-gray-200/60 text-xs">
              <div>
                <span className="text-gray-400 text-[11px]">Tổng đơn: </span>
                <strong className="text-gray-900 font-bold">
                  {(order.financialSummary?.totalOrderAmount || 0).toLocaleString('vi-VN')} đ
                </strong>
              </div>

              {/* UC-82: Trigger RMA button nếu đơn đã giao */}
              {onRequestRma && ['DELIVERED', 'HANDED_OVER_CARRIER', 'PACKED'].includes(order.status) && (
                <button
                  type="button"
                  onClick={() => onRequestRma(order)}
                  className="flex items-center gap-1 text-[11px] font-semibold text-amber-700 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 px-2 py-1 rounded-lg transition"
                >
                  <RotateCcw size={11} /> Đổi / Trả (RMA)
                </button>
              )}
            </div>
          </div>
        ))}
    </div>
  );
};

export default CustomerOrderHistory;
