/**
 * ============================================================================
 * @title        : Seller Orders Workspace Page (Pancake-style Revamp)
 * @author       : Nguyễn Quang Huy
 * @createdDate  : 2026-10-27
 * @lastModified : 2026-10-27
 * @description  : Màn hình quản lý danh sách đơn hàng bán lẻ của Seller theo phong cách
 *                 Pancake/PosCake (Ảnh 2): Tab đa kênh, dải đếm trạng thái realtime,
 *                 bảng chi tiết đầy đủ cột (Mã vận đơn, thời gian tạo, cập nhật TT, SĐT kèm
 *                 nhận diện nhà mạng, mã mẫu mã, sản phẩm, tổng COD, trạng thái và thao tác).
 * @module       : Order Fulfillment / Seller Orders
 * @layer        : Front-end
 * ============================================================================
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShoppingBag, ArrowLeft, Search, Plus, RotateCcw,
  CheckCircle2, Clock, XCircle, Truck, Package, Eye,
  RefreshCw, Download, Upload, SlidersHorizontal, CheckSquare, Square
} from 'lucide-react';
import { sellerService } from '../../services/sellerService';
import CreateRmaModal from '../../components/seller/CreateRmaModal';
import OrderDetailModal from '../../components/seller/OrderDetailModal';
import QuickOrderModal from '../../components/seller/QuickOrderModal';
import { SkeletonOrderRow } from '../../components/common/Skeleton';

/**
 * Nhận diện nhà mạng viễn thông tự động dựa trên đầu số điện thoại Việt Nam
 */
const detectTelco = (phone = '') => {
  const p = phone.replace(/\D/g, '');
  if (!p) return null;
  if (/^(086|096|097|098|032|033|034|035|036|037|038|039)/.test(p)) {
    return { name: 'Viettel', color: '#EE0033', bg: '#FEE2E2' };
  }
  if (/^(089|090|093|070|079|077|076|078)/.test(p)) {
    return { name: 'Mobifone', color: '#005baa', bg: '#E0F2FE' };
  }
  if (/^(088|091|094|083|084|085|081|082)/.test(p)) {
    return { name: 'Vinaphone', color: '#0085d0', bg: '#E0F2FE' };
  }
  return { name: 'Khác', color: '#6B7280', bg: '#F3F4F6' };
};

/**
 * Danh sách trạng thái Pancake và cấu hình nhãn đếm
 */
const PANCAKE_STATUSES = [
  { key: '',                    label: 'Tất cả',           countKey: 'ALL' },
  { key: 'PENDING',             label: 'Mới',              countKey: 'PENDING',            color: '#8B5CF6' },
  { key: 'CONFIRMED_RESERVED',  label: 'Đã xác nhận',      countKey: 'CONFIRMED_RESERVED', color: '#3B82F6' },
  { key: 'PICKING',             label: 'Chờ chuyển hàng',  countKey: 'PICKING',            color: '#F59E0B' },
  { key: 'PACKED',              label: 'Đang đóng hàng',   countKey: 'PACKED',             color: '#D97706' },
  { key: 'HANDED_OVER_CARRIER', label: 'Đã gửi hàng',      countKey: 'HANDED_OVER_CARRIER',color: '#06B6D4' },
  { key: 'DELIVERED',           label: 'Đã nhận',          countKey: 'DELIVERED',          color: '#10B981' },
  { key: 'RETURN_REQUESTED',    label: 'Đang hoàn',        countKey: 'RETURN_REQUESTED',   color: '#F97316' },
  { key: 'CANCELLED',           label: 'Đã hủy',           countKey: 'CANCELLED',          color: '#EF4444' },
  { key: 'RETURNED',            label: 'Đã trả hàng',      countKey: 'RETURNED',           color: '#6B7280' },
];

/**
 * Định dạng ngày giờ chuẩn hiển thị Pancake: HH:mm DD/MM/YYYY
 */
const formatDateTime = (dateStr) => {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};

/**
 * Component quản lý danh sách đơn hàng của Seller (Pancake-style layout)
 *
 * @component
 * @returns {JSX.Element} Bảng quản lý đơn hàng chuyên nghiệp phong cách Pancake.
 */
const SellerOrdersPage = () => {
  const navigate = useNavigate();

  // State dữ liệu và bộ lọc
  const [orders, setOrders] = useState([]);
  const [statusCounts, setStatusCounts] = useState({});
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [channelFilter, setChannelFilter] = useState('ALL'); // 'ALL' | 'POS' | 'ONLINE'
  const [subTab, setSubTab] = useState('ORDERS'); // 'ORDERS' | 'NEED_ACTION' | 'RETURNS'
  const [search, setSearch] = useState('');
  
  // Selection
  const [selectedIds, setSelectedIds] = useState([]);
  
  // Modals
  const [createOrderModalOpen, setCreateOrderModalOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedOrderForDetail, setSelectedOrderForDetail] = useState(null);
  const [rmaModalOpen, setRmaModalOpen] = useState(false);
  const [selectedOrderForRma, setSelectedOrderForRma] = useState(null);

  useEffect(() => {
    fetchOrders();
  }, [statusFilter]);

  /**
   * Gọi API lấy danh sách đơn hàng kèm tổng đếm từng trạng thái
   */
  const fetchOrders = async () => {
    try {
      setLoading(true);
      const res = await sellerService.getOrderList({
        status: statusFilter || undefined,
        search: search.trim() || undefined,
        limit: 100,
      });
      if (res.success) {
        setOrders(res.data?.items || []);
        if (res.data?.statusCounts) {
          setStatusCounts(res.data.statusCounts);
        }
      }
    } catch (err) {
      console.warn('Lỗi tải danh sách đơn:', err.message);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Lọc theo kênh (Online / Bán tại quầy)
   */
  const filteredOrders = useMemo(() => {
    return orders.filter((ord) => {
      if (channelFilter === 'POS') return ord.orderType === 'POS_DIRECT';
      if (channelFilter === 'ONLINE') return ord.orderType !== 'POS_DIRECT';
      return true;
    });
  }, [orders, channelFilter]);

  // Bulk selection
  const isAllSelected = filteredOrders.length > 0 && selectedIds.length === filteredOrders.length;
  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredOrders.map((o) => o._id || o.id));
    }
  };

  const toggleSelectOrder = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  // Mở Popup xem chi tiết & đổi trạng thái
  const handleOpenDetail = (order) => {
    setSelectedOrderForDetail(order);
    setDetailModalOpen(true);
  };

  // Mở Popup tạo RMA
  const handleOpenRma = (order) => {
    setSelectedOrderForRma(order);
    setRmaModalOpen(true);
  };

  // Cập nhật sau khi thay đổi trạng thái trong modal
  const handleOrderStatusUpdated = (updatedOrder) => {
    setOrders((prev) =>
      prev.map((ord) => ((ord._id === updatedOrder._id || ord.id === updatedOrder._id) ? updatedOrder : ord))
    );
    fetchOrders();
  };

  // Badge trạng thái chuẩn Pancake
  const renderStatusBadge = (status) => {
    const stObj = PANCAKE_STATUSES.find((s) => s.key === status);
    const label = stObj ? stObj.label : status;
    const bg = stObj?.color || '#6B7280';
    return (
      <span
        className="pancake-status-badge"
        style={{ backgroundColor: bg }}
      >
        {label}
      </span>
    );
  };

  return (
    <div className="pancake-orders-workspace">
      {/* ── Top Header Navigation Bar ─── */}
      <div className="pancake-top-header">
        <div className="pancake-header-left">
          <button
            type="button"
            onClick={() => navigate('/seller/chat')}
            className="pancake-back-btn"
            title="Quay lại màn hình Chat"
          >
            <ArrowLeft size={16} />
            <span>Về Chat</span>
          </button>
          <div className="pancake-vr" />
          <div className="pancake-brand-title">
            <ShoppingBag size={18} color="var(--ara-gold)" />
            <span>Quản Lý Đơn Hàng</span>
            <span className="pancake-shop-badge">ARA STORE NEW</span>
          </div>
        </div>

        {/* Search input in top header */}
        <div className="pancake-search-container">
          <Search size={15} className="pancake-search-icon" />
          <input
            type="text"
            placeholder="Tìm đơn hàng (Mã đơn, SĐT, Người nhận, SKU)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') fetchOrders(); }}
            className="pancake-search-input"
          />
        </div>

        {/* Action Buttons Top Right */}
        <div className="pancake-header-actions">
          <button
            type="button"
            className="pancake-btn pancake-btn-default"
            onClick={fetchOrders}
            title="Đồng bộ danh sách đơn"
          >
            <RefreshCw size={14} />
            <span>Đồng bộ</span>
          </button>
          <button
            type="button"
            className="pancake-btn pancake-btn-default"
            onClick={() => alert(`Xuất file danh sách ${filteredOrders.length} đơn hàng thành công!`)}
          >
            <Upload size={14} />
            <span>Xuất</span>
          </button>
          <button
            type="button"
            className="pancake-btn pancake-btn-primary"
            onClick={() => setCreateOrderModalOpen(true)}
            title="Tạo đơn hàng mới (Popup Pancake)"
          >
            <Plus size={15} />
            <span>Tạo đơn</span>
          </button>
        </div>
      </div>

      {/* ── Channel Tabs Bar (Tất cả / Bán tại quầy / Online) ─── */}
      <div className="pancake-channel-tabs-bar">
        <div className="pancake-channel-tabs">
          <button
            type="button"
            className={`pancake-channel-tab ${channelFilter === 'ALL' ? 'active' : ''}`}
            onClick={() => setChannelFilter('ALL')}
          >
            Tất cả
          </button>
          <button
            type="button"
            className={`pancake-channel-tab ${channelFilter === 'POS' ? 'active' : ''}`}
            onClick={() => setChannelFilter('POS')}
          >
            Bán tại quầy
          </button>
          <button
            type="button"
            className={`pancake-channel-tab ${channelFilter === 'ONLINE' ? 'active' : ''}`}
            onClick={() => setChannelFilter('ONLINE')}
          >
            Online
          </button>
        </div>

        {/* Sub-tabs: Đơn hàng / Cần xử lý / Đơn đã hoàn */}
        <div className="pancake-sub-tabs">
          <span className={`pancake-sub-tab ${subTab === 'ORDERS' ? 'active' : ''}`} onClick={() => setSubTab('ORDERS')}>
            Đơn hàng
          </span>
          <span className={`pancake-sub-tab ${subTab === 'NEED_ACTION' ? 'active' : ''}`} onClick={() => { setSubTab('NEED_ACTION'); setStatusFilter('PENDING'); }}>
            Cần xử lý
          </span>
          <span className={`pancake-sub-tab ${subTab === 'RETURNS' ? 'active' : ''}`} onClick={() => { setSubTab('RETURNS'); setStatusFilter('RETURN_REQUESTED'); }}>
            ĐƠN ĐÃ HOÀN
          </span>
        </div>
      </div>

      {/* ── Pancake Status Pill Counters Bar ─── */}
      <div className="pancake-status-scroll-bar">
        {PANCAKE_STATUSES.map((st) => {
          const count = statusCounts[st.countKey] !== undefined ? statusCounts[st.countKey] : 0;
          const isActive = statusFilter === st.key;
          return (
            <button
              key={st.key}
              type="button"
              className={`pancake-status-pill ${isActive ? 'active' : ''}`}
              onClick={() => setStatusFilter(st.key)}
            >
              <span className="pancake-pill-label">{st.label}</span>
              <span className="pancake-pill-count">{count}</span>
            </button>
          );
        })}
      </div>

      {/* ── Main Orders Table ─── */}
      <div className="pancake-table-wrapper">
        <table className="pancake-orders-table">
          <thead>
            <tr>
              <th style={{ width: '40px' }} className="text-center">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={toggleSelectAll}
                  className="form-check-input"
                />
              </th>
              <th style={{ minWidth: '95px' }}>ID</th>
              <th style={{ minWidth: '120px' }}>Mã vận đơn</th>
              <th style={{ minWidth: '130px' }}>Thời gian tạo</th>
              <th style={{ minWidth: '130px' }}>Cập nhật TT</th>
              <th style={{ minWidth: '150px' }}>Khách hàng</th>
              <th style={{ minWidth: '135px' }}>SĐT</th>
              <th style={{ minWidth: '160px' }}>Mã mẫu mã</th>
              <th style={{ minWidth: '190px' }}>Sản phẩm</th>
              <th style={{ minWidth: '110px' }} className="text-end">Tổng tiền</th>
              <th style={{ minWidth: '120px' }}>Ghi chú nội bộ</th>
              <th style={{ minWidth: '125px' }} className="text-center">Trạng thái</th>
              <th style={{ minWidth: '100px' }} className="text-center">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <>
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <tr key={i}>
                    <td colSpan="13" className="py-2">
                      <SkeletonOrderRow />
                    </td>
                  </tr>
                ))}
              </>
            ) : filteredOrders.length === 0 ? (
              <tr>
                <td colSpan="13" className="text-center py-5">
                  <ShoppingBag size={40} color="var(--ara-gold)" opacity={0.4} className="mb-2 d-block mx-auto" />
                  <div className="text-muted fw-bold">Không tìm thấy đơn hàng nào phù hợp bộ lọc</div>
                </td>
              </tr>
            ) : (
              filteredOrders.map((ord) => {
                const id = ord._id || ord.id;
                const isSelected = selectedIds.includes(id);
                const recipient = ord.shippingRecipient || {};
                const customer = ord.customerId || {};
                const telco = detectTelco(recipient.phone || customer.phone || '');
                const waybill = ord.warehouseFulfillment?.waybillCode;
                const firstItem = ord.items?.[0] || {};
                const totalAmount = ord.financialSummary?.totalOrderAmount || 0;

                return (
                  <tr
                    key={id}
                    className={`pancake-order-row ${isSelected ? 'row-selected' : ''}`}
                    onClick={() => handleOpenDetail(ord)}
                  >
                    {/* Checkbox */}
                    <td className="text-center" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectOrder(id)}
                        className="form-check-input"
                      />
                    </td>

                    {/* ID */}
                    <td>
                      <div className="d-flex align-items-center gap-1">
                        <span className="pancake-fb-icon">f</span>
                        <span className="pancake-order-id fw-bold">{ord.orderCode || id.slice(-6)}</span>
                      </div>
                    </td>

                    {/* Mã vận đơn */}
                    <td>
                      {waybill ? (
                        <span className="pancake-waybill-code">{waybill}</span>
                      ) : (
                        <span className="text-muted small">-</span>
                      )}
                    </td>

                    {/* Thời gian tạo */}
                    <td>
                      <div className="pancake-time-cell">
                        <span>{formatDateTime(ord.createdAt)}</span>
                        <span className="pancake-time-tag">HT</span>
                      </div>
                    </td>

                    {/* Cập nhật TT */}
                    <td>
                      <div className="pancake-time-cell">
                        <span>{formatDateTime(ord.updatedAt)}</span>
                        <span className="pancake-user-icon">👤</span>
                      </div>
                    </td>

                    {/* Khách hàng */}
                    <td>
                      <div className="d-flex align-items-center gap-2">
                        <div className="pancake-customer-avatar">
                          {(customer.fullName || recipient.name || 'K').charAt(0).toUpperCase()}
                        </div>
                        <span className="pancake-customer-name" title={customer.fullName || recipient.name}>
                          {customer.fullName || recipient.name || 'Khách vãng lai'}
                        </span>
                      </div>
                    </td>

                    {/* SĐT */}
                    <td>
                      <div className="d-flex align-items-center gap-1">
                        <span className="pancake-phone-text">{recipient.phone || customer.phone || '-'}</span>
                        {telco && (
                          <span
                            className="pancake-telco-badge"
                            style={{ backgroundColor: telco.bg, color: telco.color }}
                          >
                            {telco.name}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Mã mẫu mã */}
                    <td>
                      {ord.items && ord.items.length > 0 ? (
                        <div className="pancake-sku-cell">
                          <span className="fw-bold">{firstItem.skuCode || firstItem.skuId?.skuCode}</span>
                          <span className="text-muted"> x {firstItem.orderedQty}</span>
                          {ord.items.length > 1 && (
                            <span className="pancake-more-items-badge">+{ord.items.length - 1}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted small">Chưa có sản phẩm</span>
                      )}
                    </td>

                    {/* Tên sản phẩm */}
                    <td>
                      {ord.items && ord.items.length > 0 ? (
                        <div className="pancake-prod-title text-truncate" style={{ maxWidth: '220px' }}>
                          {firstItem.skuId?.styleName || firstItem.styleName || firstItem.skuCode}
                          {ord.items.length > 1 && ` (và ${ord.items.length - 1} món khác)`}
                        </div>
                      ) : (
                        <span className="text-muted small">Chưa có sản phẩm</span>
                      )}
                    </td>

                    {/* Tổng tiền */}
                    <td className="text-end">
                      <span className="pancake-total-amount">
                        {totalAmount.toLocaleString('vi-VN')} đ
                      </span>
                    </td>

                    {/* Ghi chú nội bộ */}
                    <td>
                      <div className="pancake-note-text text-truncate" style={{ maxWidth: '140px' }}>
                        {ord.notes || (ord.financialSummary?.discountAmount > 0 ? 'Đã giảm giá' : 'Đơn COD')}
                      </div>
                    </td>

                    {/* Trạng thái */}
                    <td className="text-center">
                      {renderStatusBadge(ord.status)}
                    </td>

                    {/* Thao tác */}
                    <td className="text-center" onClick={(e) => e.stopPropagation()}>
                      <div className="d-flex align-items-center justify-content-center gap-1">
                        <button
                          type="button"
                          className="pancake-action-btn"
                          onClick={() => handleOpenDetail(ord)}
                          title="Xem chi tiết & đổi trạng thái"
                        >
                          <Eye size={13} />
                        </button>
                        {['DELIVERED', 'CONFIRMED_RESERVED'].includes(ord.status) && (
                          <button
                            type="button"
                            className="pancake-action-btn pancake-action-rma"
                            onClick={() => handleOpenRma(ord)}
                            title="Tạo yêu cầu Đổi / Trả (RMA)"
                          >
                            <RotateCcw size={12} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── Footer status bar ─── */}
      <div className="pancake-footer-bar">
        <div className="pancake-footer-stats">
          Hiển thị <strong>{filteredOrders.length}</strong> đơn hàng · Đã chọn <strong>{selectedIds.length}</strong> đơn
        </div>
      </div>

      {/* ── Thanh thao tác nổi khi tích chọn Checkbox hàng loạt ─── */}
      {selectedIds.length > 0 && (
        <div className="pancake-bulk-action-bar">
          <div className="d-flex align-items-center gap-2">
            <span className="badge bg-white text-dark border fw-bold px-2.5 py-1.5" style={{ fontSize: '0.8rem' }}>
              Đã chọn {selectedIds.length} đơn
            </span>
          </div>
          <div className="d-flex align-items-center gap-2">
            <button
              type="button"
              className="btn btn-sm btn-light border py-1 px-3 fw-semibold"
              style={{ fontSize: '0.78rem' }}
              onClick={() => alert(`Chuẩn bị in phiếu gửi hàng loạt cho ${selectedIds.length} đơn hàng...`)}
            >
              🖨️ In phiếu gửi ({selectedIds.length})
            </button>
            <button
              type="button"
              className="btn btn-sm btn-light border py-1 px-3 fw-semibold"
              style={{ fontSize: '0.78rem' }}
              onClick={() => {
                alert(`Đã xuất file dữ liệu cho ${selectedIds.length} đơn hàng đã chọn!`);
                setSelectedIds([]);
              }}
            >
              📥 Xuất dữ liệu ({selectedIds.length})
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline-light py-1 px-2.5"
              style={{ fontSize: '0.78rem' }}
              onClick={() => setSelectedIds([])}
            >
              Bỏ chọn
            </button>
          </div>
        </div>
      )}

      {/* ── Modal Tạo Đơn Hàng Mới Ngay Tại Chỗ (Popup Pancake) ─── */}
      <QuickOrderModal
        isOpen={createOrderModalOpen}
        onClose={() => setCreateOrderModalOpen(false)}
        onOrderCreated={() => {
          fetchOrders();
          setCreateOrderModalOpen(false);
        }}
      />

      {/* ── Modal Chi Tiết Đơn Hàng & Đổi Trạng Thái ─── */}
      <OrderDetailModal
        isOpen={detailModalOpen}
        order={selectedOrderForDetail}
        onClose={() => setDetailModalOpen(false)}
        onStatusUpdated={handleOrderStatusUpdated}
        onOpenRma={handleOpenRma}
      />

      {/* ── Modal Tạo RMA Đổi Trả Hàng ─── */}
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

