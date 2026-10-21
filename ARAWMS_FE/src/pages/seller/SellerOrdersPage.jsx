import React, { useState, useEffect } from 'react';
import { ShoppingBag, ArrowLeft, ShieldCheck, XCircle, Clock, Truck, CheckCircle2, Search } from 'lucide-react';
import { sellerService } from '../../services/sellerService';
import { useNavigate } from 'react-router-dom';

const SellerOrdersPage = () => {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

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
    if (!window.confirm('Bạn có chắc chắn muốn xác nhận đơn và giữ chỗ tồn kho cho đơn hàng này?')) return;
    try {
      setActionLoading(true);
      const res = await sellerService.confirmOrderReserve(orderId);
      if (res.success) {
        alert('Xác nhận đơn và giữ chỗ kho thành công!');
        fetchOrders();
      }
    } catch (err) {
      alert(`Lỗi: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelOrder = async (orderId) => {
    const reason = window.prompt('Nhập lý do hủy đơn hàng:');
    if (!reason) return;

    try {
      setActionLoading(true);
      const res = await sellerService.cancelOrder(orderId, reason);
      if (res.success) {
        alert('Hủy đơn hàng thành công! Đã giải phóng số lượng tồn kho giữ chỗ.');
        fetchOrders();
      }
    } catch (err) {
      alert(`Lỗi: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'CONFIRMED_RESERVED':
        return <span className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full font-semibold text-xs">Đã Giữ Chỗ Kho</span>;
      case 'PENDING':
        return <span className="px-2.5 py-1 bg-amber-50 text-amber-700 rounded-full font-semibold text-xs">Chờ Xác Nhận</span>;
      case 'PACKED':
        return <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-full font-semibold text-xs">Đã Đóng Gói</span>;
      case 'DELIVERED':
        return <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full font-semibold text-xs">Đã Giao Hàng</span>;
      case 'CANCELLED':
        return <span className="px-2.5 py-1 bg-red-50 text-red-700 rounded-full font-semibold text-xs">Đã Hủy</span>;
      default:
        return <span className="px-2.5 py-1 bg-gray-100 text-gray-700 rounded-full font-semibold text-xs">{status}</span>;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Header */}
      <header className="h-14 bg-white border-b border-gray-200 px-6 flex items-center justify-between shadow-2xs">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/seller/chat')}
            className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 hover:text-indigo-600 px-2.5 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition"
          >
            <ArrowLeft size={14} /> Quay lại Chat Workspace
          </button>
          <div className="h-5 w-px bg-gray-200" />
          <h2 className="font-bold text-gray-900 text-base flex items-center gap-2">
            <ShoppingBag size={18} className="text-indigo-600" />
            Quản Lý Đơn Hàng Bán Lẻ (UC-78 - UC-81)
          </h2>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-6xl w-full mx-auto p-6 space-y-4">
        {/* Filters */}
        <div className="bg-white p-4 rounded-2xl border border-gray-200/80 shadow-2xs flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            {['', 'PENDING', 'CONFIRMED_RESERVED', 'PACKED', 'DELIVERED', 'CANCELLED'].map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                  statusFilter === st
                    ? 'bg-indigo-600 text-white shadow-2xs'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {st === '' ? 'Tất cả' : st}
              </button>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              fetchOrders();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              placeholder="Tìm theo mã đơn, người nhận..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="px-3 py-1.5 border rounded-lg focus:outline-none w-56 text-xs"
            />
            <button
              type="submit"
              className="px-3 py-1.5 bg-gray-900 text-white rounded-lg font-medium hover:bg-black"
            >
              Tìm
            </button>
          </form>
        </div>

        {/* Orders Table */}
        <div className="bg-white rounded-2xl border border-gray-200/80 shadow-2xs overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Mã đơn</th>
                <th className="py-3 px-4">Khách & Người nhận</th>
                <th className="py-3 px-4">Sản phẩm</th>
                <th className="py-3 px-4">Tổng tiền (COD)</th>
                <th className="py-3 px-4">Trạng thái</th>
                <th className="py-3 px-4 text-right">Thao tác Seller</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan="6" className="text-center py-10 text-gray-400">
                    Đang tải danh sách đơn hàng...
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan="6" className="text-center py-10 text-gray-400">
                    Không tìm thấy đơn hàng nào
                  </td>
                </tr>
              ) : (
                orders.map((ord) => (
                  <tr key={ord._id} className="hover:bg-gray-50/60 transition">
                    <td className="py-3.5 px-4 font-mono font-bold text-indigo-600">
                      {ord.orderCode}
                      <div className="text-[10px] text-gray-400 font-sans font-normal mt-0.5">
                        {new Date(ord.createdAt).toLocaleDateString('vi-VN')}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-gray-900">{ord.shippingRecipient?.name || 'N/A'}</div>
                      <div className="text-gray-500 text-[11px]">{ord.shippingRecipient?.phone}</div>
                      <div className="text-gray-400 text-[11px] line-clamp-1">{ord.shippingRecipient?.address}</div>
                    </td>

                    <td className="py-3.5 px-4 space-y-1">
                      {ord.items?.map((it, idx) => (
                        <div key={idx} className="text-gray-700">
                          <strong>{it.orderedQty}x</strong> {it.skuCode}
                        </div>
                      ))}
                    </td>

                    <td className="py-3.5 px-4 font-bold text-gray-900">
                      {(ord.financialSummary?.totalOrderAmount || 0).toLocaleString('vi-VN')} đ
                    </td>

                    <td className="py-3.5 px-4">{getStatusBadge(ord.status)}</td>

                    <td className="py-3.5 px-4 text-right space-x-1.5">
                      {ord.status === 'PENDING' && (
                        <button
                          type="button"
                          disabled={actionLoading}
                          onClick={() => handleConfirmReserve(ord._id)}
                          className="px-2.5 py-1.5 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition"
                        >
                          Xác nhận & Giữ chỗ (UC-79)
                        </button>
                      )}

                      {!['PACKED', 'HANDED_OVER_CARRIER', 'DELIVERED', 'CANCELLED'].includes(ord.status) && (
                        <button
                          type="button"
                          disabled={actionLoading}
                          onClick={() => handleCancelOrder(ord._id)}
                          className="px-2.5 py-1.5 bg-red-50 text-red-600 border border-red-200 rounded-lg font-semibold hover:bg-red-100 transition"
                        >
                          Hủy đơn (UC-81)
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
};

export default SellerOrdersPage;
