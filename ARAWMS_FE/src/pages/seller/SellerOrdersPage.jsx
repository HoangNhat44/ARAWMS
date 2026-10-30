/**
 * ============================================================================
 * @title        : Seller Orders Workspace Page (Bootstrap / React-Bootstrap)
 * @author       : Nguyễn Quang Huy
 * @createdDate  : 2026-10-27
 * @lastModified : 2026-10-28
 * @description  : Màn hình quản lý danh sách đơn hàng bán lẻ của Seller: Tab đa kênh, dải đếm trạng thái realtime,
 *                 bảng chi tiết đầy đủ cột với React-Bootstrap Table, Form và Icons.
 *                 (Refactor 2026-10-28: giao diện chỉ dùng Bootstrap / React-Bootstrap.)
 * @module       : Order Fulfillment / Seller Orders
 * @layer        : Front-end
 * ============================================================================
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container, Row, Col, Table, Badge, Button, ButtonGroup, Form,
  InputGroup, Stack, Card, Alert, Spinner,
} from 'react-bootstrap';
import { sellerService } from '../../services/sellerService';
import { useToast } from '../../context/ToastContext';
import CreateRmaModal from '../../components/seller/CreateRmaModal';
import OrderDetailModal from '../../components/seller/OrderDetailModal';
import QuickOrderModal from '../../components/seller/QuickOrderModal';
import { SkeletonOrderRow } from '../../components/common/Skeleton';
import { Icon, Avatar, formatVnd, ORDER_STATUS_VARIANT, ORDER_STATUS_CLASS, EmptyState } from '../../components/seller/SellerUi';

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
  { key: 'PENDING',             label: 'Mới',              countKey: 'PENDING' },
  { key: 'CONFIRMED_RESERVED',  label: 'Đã xác nhận',      countKey: 'CONFIRMED_RESERVED' },
  { key: 'PICKING',             label: 'Chờ chuyển hàng',  countKey: 'PICKING' },
  { key: 'PACKED',              label: 'Đang đóng hàng',   countKey: 'PACKED' },
  { key: 'HANDED_OVER_CARRIER', label: 'Đã gửi hàng',      countKey: 'HANDED_OVER_CARRIER' },
  { key: 'DELIVERED',           label: 'Đã nhận',          countKey: 'DELIVERED' },
  { key: 'COMPLETED',           label: 'Hoàn thành / POS', countKey: 'COMPLETED' },
  { key: 'RETURN_REQUESTED',    label: 'Đang hoàn',        countKey: 'RETURN_REQUESTED' },
  { key: 'CANCELLED',           label: 'Đã hủy',           countKey: 'CANCELLED' },
  { key: 'RETURNED',            label: 'Đã trả hàng',      countKey: 'RETURNED' },
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
 * Hiển thị ngày giờ 2 dòng thanh thoát trong bảng (chuẩn Shopify Polaris / Stripe)
 */
const renderDateTimeCell = (dateStr) => {
  if (!dateStr) return <span className="text-muted opacity-50">-</span>;
  const d = new Date(dateStr);
  const pad = (n) => String(n).padStart(2, '0');
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const date = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  return (
    <div className="d-flex flex-column lh-sm">
      <span className="fw-semibold text-dark" style={{ fontSize: '0.82rem' }}>{time}</span>
      <span className="text-secondary" style={{ fontSize: '0.72rem' }}>{date}</span>
    </div>
  );
};

/**
 * Component quản lý danh sách đơn hàng của Seller (Luxury Enterprise & Pancake-style layout)
 *
 * @component
 * @returns {JSX.Element} Bảng quản lý đơn hàng chuyên nghiệp chuẩn ARA Luxury.
 */
const SellerOrdersPage = () => {
  const navigate = useNavigate();
  const { showSuccess, showInfo } = useToast();

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
      if (channelFilter === 'POS') return ord.orderType === 'POS_DIRECT' || ord.channel === 'POS_OFFLINE';
      if (channelFilter === 'ONLINE') return ord.orderType !== 'POS_DIRECT' && ord.channel !== 'POS_OFFLINE';
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

  /**
   * Xuất danh sách đơn hàng ra file Excel / CSV (UTF-8 BOM chuẩn tiếng Việt)
   */
  const handleExportOrders = (orderList, customFilename) => {
    if (!orderList || orderList.length === 0) {
      showInfo('Không có đơn hàng nào để xuất file', 'Xuất file');
      return;
    }

    const quote = (val) => `"${String(val ?? '').replaceAll('"', '""')}"`;
    const headers = [
      'Mã đơn hàng',
      'Mã vận đơn',
      'Kênh bán',
      'Thời gian tạo',
      'Cập nhật lần cuối',
      'Tên khách hàng',
      'Số điện thoại',
      'Nhà mạng',
      'Địa chỉ nhận hàng',
      'Chi tiết sản phẩm (SKU - Tên - SL)',
      'Tổng tiền hàng (VNĐ)',
      'Phí vận chuyển (VNĐ)',
      'Giảm giá (VNĐ)',
      'Tổng thanh toán (VNĐ)',
      'Hình thức thanh toán',
      'Trạng thái thanh toán',
      'Trạng thái đơn hàng',
      'Ghi chú nội bộ',
    ];

    const rows = [
      headers,
      ...orderList.map((ord) => {
        const id = ord._id || ord.id;
        const code = ord.orderCode || id?.slice(-6) || '';
        const waybill = ord.warehouseFulfillment?.waybillCode || '';
        const channel = ord.orderType === 'POS_DIRECT' ? 'Bán tại quầy (POS)' : 'Online (Messenger)';
        const created = formatDateTime(ord.createdAt);
        const updated = formatDateTime(ord.updatedAt);
        const recipient = ord.shippingRecipient || {};
        const customer = ord.customerId || {};
        const custName = customer.fullName || recipient.name || 'Khách vãng lai';
        const phone = recipient.phone || customer.phone || '';
        const telco = detectTelco(phone)?.name || '';
        const address = [recipient.addressDetail, recipient.ward, recipient.district, recipient.province]
          .filter(Boolean)
          .join(', ') || '-';

        const itemsStr = (ord.items || [])
          .map((item) => {
            const sku = item.skuCode || item.skuId?.skuCode || 'SKU';
            const name = item.styleName || item.skuId?.styleName || '';
            const qty = item.orderedQty || 1;
            return `[${sku}] ${name} (x${qty})`;
          })
          .join('; ');

        const prodAmount = ord.financialSummary?.totalProductAmount || 0;
        const shippingFee = ord.financialSummary?.shippingFee || 0;
        const discount = ord.financialSummary?.discountAmount || 0;
        const totalAmount = ord.financialSummary?.totalOrderAmount || 0;
        const paymentMethod = ord.paymentMethod || 'COD';
        const paymentStatus = ord.paymentStatus === 'PAID' ? 'Đã thanh toán' : 'Chưa thanh toán';

        const stObj = PANCAKE_STATUSES.find((s) => s.key === ord.status);
        const statusLabel = stObj ? stObj.label : ord.status;
        const notes = ord.notes || '';

        return [
          code,
          waybill,
          channel,
          created,
          updated,
          custName,
          phone,
          telco,
          address,
          itemsStr,
          prodAmount,
          shippingFee,
          discount,
          totalAmount,
          paymentMethod,
          paymentStatus,
          statusLabel,
          notes,
        ];
      }),
    ];

    const csvContent = '\uFEFF' + rows.map((r) => r.map(quote).join(',')).join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const todayStr = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = customFilename || `danh-sach-don-hang-ara-${todayStr}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);

    showSuccess(`Đã xuất và tải xuống file danh sách ${orderList.length} đơn hàng!`, 'Xuất file thành công');
  };

  const renderStatusBadge = (status) => {
    const stObj = PANCAKE_STATUSES.find((s) => s.key === status);
    const label = stObj ? stObj.label : status;
    const badgeClass = ORDER_STATUS_CLASS[status] || 'ara-badge-returned';
    return (
      <span className={`ara-badge-status ${badgeClass}`}>
        {label}
      </span>
    );
  };

  return (
    <div className="d-flex flex-column h-100" style={{ backgroundColor: '#FAF7F2' }}>
      {/* ── Top Header Navigation Bar (Atelier Noir & Champagne Gold) ─── */}
      <div className="ara-seller-header px-2 px-md-3 py-2 d-flex flex-wrap align-items-center justify-content-between gap-2">
        <Stack direction="horizontal" gap={2} className="align-items-center">
          <Button
            size="sm"
            onClick={() => navigate('/seller/chat')}
            className="btn-ara-header-ghost d-flex align-items-center gap-1"
          >
            <Icon name="arrow-left" /> <span className="d-none d-sm-inline">Về Chat</span>
          </Button>
          <div className="vr opacity-25 d-none d-sm-block" style={{ height: 22, backgroundColor: '#9F8365' }} />
          <div className="d-flex align-items-center gap-2">
            <span className="fw-bold fs-6 text-white text-nowrap" style={{ letterSpacing: '0.02em' }}>
              Quản Lý Đơn Hàng
            </span>
          </div>
        </Stack>

        {/* Action Buttons Top Right: Row 1 on mobile */}
        <Stack direction="horizontal" gap={1} className="order-2 order-md-3">
          <Button
            size="sm"
            className="btn-ara-header-ghost d-flex align-items-center gap-1 px-2"
            onClick={fetchOrders}
            title="Đồng bộ danh sách đơn"
          >
            <Icon name="arrow-clockwise" /> <span className="d-none d-md-inline">Đồng bộ</span>
          </Button>
          <Button
            size="sm"
            className="btn-ara-header-ghost d-flex align-items-center gap-1 px-2"
            onClick={() => handleExportOrders(filteredOrders, `don-hang-ara-${channelFilter.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`)}
            title="Xuất file toàn bộ danh sách đơn hàng đang hiển thị"
          >
            <Icon name="download" /> <span className="d-none d-md-inline">Xuất</span><span className="d-none d-sm-inline">({filteredOrders.length})</span>
          </Button>
          <Button
            size="sm"
            className="btn-ara-header-gold d-flex align-items-center gap-1 px-2 px-sm-3"
            onClick={() => setCreateOrderModalOpen(true)}
            title="Tạo đơn hàng mới (Popup Pancake)"
          >
            <Icon name="plus-lg" /> <span className="d-none d-sm-inline">Tạo đơn</span>
          </Button>
        </Stack>

        {/* Search input: Full width on mobile (order-3), middle on desktop (order-md-2) */}
        <div className="order-3 order-md-2 flex-grow-1 w-100 w-md-auto mx-0 mx-md-2 my-1 my-md-0" style={{ maxWidth: 460 }}>
          <InputGroup size="sm" className="ara-search-capsule">
            <InputGroup.Text><Icon name="search" /></InputGroup.Text>
            <Form.Control
              placeholder="Tìm theo mã đơn, SĐT, tên khách, SKU..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') fetchOrders(); }}
            />
          </InputGroup>
        </div>
      </div>

      {/* ── Channel Tabs Bar & Sub Tabs (Segmented Control) ─── */}
      <div
        className="px-2 px-md-3 py-2 border-bottom d-flex flex-wrap align-items-center justify-content-between gap-2 overflow-x-auto"
        style={{ backgroundColor: '#FAF7F2', borderColor: '#E3D9CD' }}
      >
        <div className="ara-segmented-group text-nowrap flex-shrink-0">
          <button
            type="button"
            className={`ara-segmented-btn ${channelFilter === 'ALL' ? 'active' : ''}`}
            onClick={() => setChannelFilter('ALL')}
          >
            Tất cả kênh
          </button>
          <button
            type="button"
            className={`ara-segmented-btn ${channelFilter === 'POS' ? 'active' : ''}`}
            onClick={() => setChannelFilter('POS')}
          >
            Tại quầy (POS)
          </button>
          <button
            type="button"
            className={`ara-segmented-btn ${channelFilter === 'ONLINE' ? 'active' : ''}`}
            onClick={() => setChannelFilter('ONLINE')}
          >
            Online (Messenger)
          </button>
        </div>

        {/* Sub-tabs: Đơn hàng / Cần xử lý / Đơn đã hoàn */}
        <div className="ara-segmented-group text-nowrap flex-shrink-0">
          <button
            type="button"
            className={`ara-segmented-btn ${subTab === 'ORDERS' ? 'active' : ''}`}
            onClick={() => setSubTab('ORDERS')}
          >
            Tất cả đơn
          </button>
          <button
            type="button"
            className={`ara-segmented-btn ${subTab === 'NEED_ACTION' ? 'active' : ''}`}
            onClick={() => { setSubTab('NEED_ACTION'); setStatusFilter('PENDING'); }}
          >
            <i className="bi bi-clock-history text-warning me-1"></i>
            Cần xử lý
          </button>
          <button
            type="button"
            className={`ara-segmented-btn ${subTab === 'RETURNS' ? 'active' : ''}`}
            onClick={() => { setSubTab('RETURNS'); setStatusFilter('RETURN_REQUESTED'); }}
          >
            <i className="bi bi-arrow-counterclockwise text-danger me-1"></i>
            Đơn đã hoàn
          </button>
        </div>
      </div>

      {/* ── Pancake Status Pill Counters Bar ─── */}
      <div className="ara-status-pills-container px-3 py-2 d-flex align-items-center gap-1 overflow-x-auto">
        {PANCAKE_STATUSES.map((st) => {
          const count = statusCounts[st.countKey] !== undefined ? statusCounts[st.countKey] : 0;
          const isActive = statusFilter === st.key;
          const isZero = count === 0 && st.key !== 'ALL';
          return (
            <button
              key={st.key}
              type="button"
              className={`ara-status-pill-btn ${isActive ? 'active' : ''}`}
              style={isZero && !isActive ? { opacity: 0.55, backgroundColor: '#FAFAF8' } : {}}
              onClick={() => setStatusFilter(st.key)}
            >
              <span>{st.label}</span>
              <span
                className="ara-status-pill-count"
                style={count > 0 && !isActive ? { backgroundColor: '#E2D3C0', color: '#1C1A17' } : {}}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Main Orders Data View: Desktop/Tablet Table vs Mobile Cards Stream ─── */}
      {/* 1. Desktop & Tablet Table (>= md, >= 768px) */}
      <div className="d-none d-md-block flex-grow-1 overflow-auto bg-white">
        <Table responsive hover className="ara-seller-table align-middle mb-0 text-nowrap w-100">
          <thead className="sticky-top">
            <tr>
              <th style={{ width: 40 }} className="text-center">
                <Form.Check
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={toggleSelectAll}
                  aria-label="Chọn tất cả đơn"
                />
              </th>
              <th style={{ minWidth: 95 }}>ID</th>
              <th style={{ minWidth: 120 }}>Mã vận đơn</th>
              <th style={{ minWidth: 130 }}>Thời gian tạo</th>
              <th style={{ minWidth: 130 }}>Cập nhật TT</th>
              <th style={{ minWidth: 150 }}>Khách hàng</th>
              <th style={{ minWidth: 135 }}>SĐT</th>
              <th style={{ minWidth: 160 }}>Mã mẫu mã</th>
              <th style={{ minWidth: 190 }}>Sản phẩm</th>
              <th style={{ minWidth: 110 }} className="text-end">Tổng tiền</th>
              <th style={{ minWidth: 120 }}>Ghi chú nội bộ</th>
              <th style={{ minWidth: 125 }} className="text-center">Trạng thái</th>
              <th style={{ minWidth: 100 }} className="text-center">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [1, 2, 3, 4, 5, 6].map((i) => (
                <tr key={i}>
                  <td colSpan="13" className="py-2">
                    <SkeletonOrderRow />
                  </td>
                </tr>
              ))
            ) : filteredOrders.length === 0 ? (
              <tr>
                <td colSpan="13" className="text-center py-5">
                  <EmptyState icon="bag" title="Không tìm thấy đơn hàng nào phù hợp bộ lọc" />
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
                    className={isSelected ? 'table-active' : ''}
                    style={{ cursor: 'pointer' }}
                    onClick={() => handleOpenDetail(ord)}
                  >
                    {/* Checkbox */}
                    <td className="text-center" onClick={(e) => e.stopPropagation()}>
                      <Form.Check
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectOrder(id)}
                        aria-label={`Chọn đơn ${ord.orderCode || id}`}
                      />
                    </td>

                    {/* ID */}
                    <td>
                      <div className="ara-code-badge">
                        <Icon
                          name={ord.orderType === 'POS_DIRECT' ? 'shop' : 'facebook'}
                          style={{ color: ord.orderType === 'POS_DIRECT' ? '#7E766D' : '#1877F2' }}
                        />
                        <span>{ord.orderCode || id.slice(-6)}</span>
                      </div>
                    </td>

                    {/* Mã vận đơn */}
                    <td>
                      {waybill ? (
                        <span className="font-monospace fw-semibold" style={{ color: '#0369A1' }}>{waybill}</span>
                      ) : (
                        <span className="text-muted opacity-50">-</span>
                      )}
                    </td>

                    {/* Thời gian tạo */}
                    <td>
                      {renderDateTimeCell(ord.createdAt)}
                    </td>

                    {/* Cập nhật TT */}
                    <td>
                      {renderDateTimeCell(ord.updatedAt)}
                    </td>

                    {/* Khách hàng */}
                    <td>
                      <div className="d-flex align-items-center gap-2">
                        <Avatar name={customer.fullName || recipient.name} size={28} />
                        <span className="fw-semibold text-truncate text-dark" style={{ maxWidth: 140 }} title={customer.fullName || recipient.name}>
                          {customer.fullName || recipient.name || 'Khách vãng lai'}
                        </span>
                      </div>
                    </td>

                    {/* SĐT */}
                    <td>
                      <div className="d-flex align-items-center gap-1">
                        <span className="fw-semibold text-body" style={{ fontSize: '0.82rem' }}>
                          {recipient.phone || customer.phone || '-'}
                        </span>
                        {telco && (
                          <span
                            className="badge rounded-pill fw-normal"
                            style={{ backgroundColor: 'rgba(0,0,0,0.06)', color: '#555', fontSize: '0.65rem', padding: '1px 5px' }}
                          >
                            {telco.name}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Mã mẫu mã */}
                    <td>
                      {ord.items && ord.items.length > 0 ? (
                        <div className="d-flex align-items-center gap-1">
                          <span className="fw-semibold font-monospace" style={{ fontSize: '0.82rem', color: '#1C1A17' }}>
                            {firstItem.skuCode || firstItem.skuId?.skuCode}
                          </span>
                          <span className="text-secondary" style={{ fontSize: '0.78rem' }}>x{firstItem.orderedQty}</span>
                          {ord.items.length > 1 && (
                            <span
                              className="badge rounded-pill"
                              style={{ backgroundColor: '#EBE4DA', color: '#5A524A', fontSize: '0.67rem' }}
                            >
                              +{ord.items.length - 1}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-secondary">-</span>
                      )}
                    </td>

                    {/* Tên sản phẩm */}
                    <td>
                      {ord.items && ord.items.length > 0 ? (
                        <div className="text-truncate" style={{ maxWidth: 220, fontSize: '0.82rem' }}>
                          {firstItem.skuId?.styleName || firstItem.styleName || firstItem.skuCode}
                          {ord.items.length > 1 && ` (và ${ord.items.length - 1} món khác)`}
                        </div>
                      ) : (
                        <span className="text-secondary">Chưa có SP</span>
                      )}
                    </td>

                    {/* Tổng tiền */}
                    <td className="text-end fw-bold" style={{ color: '#9F8365', fontSize: '0.88rem' }}>
                      {formatVnd(totalAmount)}
                    </td>

                    {/* Ghi chú nội bộ */}
                    <td>
                      <div className="text-truncate text-secondary" style={{ maxWidth: 140, fontSize: '0.8rem' }}>
                        {ord.notes || (ord.financialSummary?.discountAmount > 0 ? 'Đã giảm giá' : 'Đơn COD')}
                      </div>
                    </td>

                    {/* Trạng thái */}
                    <td className="text-center">
                      {renderStatusBadge(ord.status)}
                    </td>

                    {/* Thao tác */}
                    <td className="text-center" onClick={(e) => e.stopPropagation()}>
                      <Stack direction="horizontal" gap={1} className="justify-content-center">
                        <Button
                          size="sm"
                          variant="light"
                          className="py-0 px-2 border"
                          style={{ borderColor: '#E3D9CD' }}
                          onClick={() => handleOpenDetail(ord)}
                          title="Xem chi tiết & đổi trạng thái"
                        >
                          <Icon name="eye" className="text-secondary" />
                        </Button>
                        {['DELIVERED', 'CONFIRMED_RESERVED'].includes(ord.status) && (
                          <Button
                            size="sm"
                            variant="light"
                            className="py-0 px-2 border"
                            style={{ borderColor: '#E3D9CD' }}
                            onClick={() => handleOpenRma(ord)}
                            title="Tạo yêu cầu Đổi / Trả (RMA)"
                          >
                            <Icon name="arrow-counterclockwise" className="text-warning" />
                          </Button>
                        )}
                      </Stack>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </Table>
      </div>

      {/* 2. Mobile Cards Stream (< md, < 768px) */}
      <div className="d-md-none flex-grow-1 overflow-auto p-2" style={{ backgroundColor: '#FAF7F2' }}>
        {loading ? (
          [1, 2, 3, 4].map((i) => (
            <div key={i} className="mb-2 p-3 bg-white border rounded-3 shadow-sm">
              <SkeletonOrderRow />
            </div>
          ))
        ) : filteredOrders.length === 0 ? (
          <div className="text-center py-5 bg-white rounded-3 border">
            <EmptyState icon="bag" title="Không tìm thấy đơn hàng nào phù hợp bộ lọc" />
          </div>
        ) : (
          filteredOrders.map((ord) => {
            const id = ord._id || ord.id;
            const isSelected = selectedIds.includes(id);
            const recipient = ord.shippingRecipient || {};
            const customer = ord.customerId || {};
            const custName = customer.fullName || recipient.name || 'Khách vãng lai';
            const phone = recipient.phone || customer.phone || '';
            const telco = detectTelco(phone);
            const waybill = ord.warehouseFulfillment?.waybillCode;
            const firstItem = ord.items?.[0] || {};
            const totalAmount = ord.financialSummary?.totalOrderAmount || 0;

            return (
              <div
                key={id}
                className={`ara-mobile-order-card bg-white border rounded-3 p-3 mb-2 shadow-sm ${isSelected ? 'border-primary' : ''}`}
                onClick={() => handleOpenDetail(ord)}
                style={{ cursor: 'pointer' }}
              >
                {/* Header: Checkbox, Order Code, Channel badge, Status badge */}
                <div className="d-flex align-items-center justify-content-between mb-2">
                  <div className="d-flex align-items-center gap-2">
                    <span onClick={(e) => e.stopPropagation()}>
                      <Form.Check
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectOrder(id)}
                        aria-label={`Chọn đơn ${ord.orderCode || id}`}
                      />
                    </span>
                    <span className="fw-bold text-dark fs-6 font-monospace">#{ord.orderCode || id.slice(-6)}</span>
                    <span
                      className="badge rounded-pill fw-normal"
                      style={{
                        backgroundColor: ord.orderType === 'POS_DIRECT' ? '#F3F4F6' : '#EFF6FF',
                        color: ord.orderType === 'POS_DIRECT' ? '#4B5563' : '#1D4ED8',
                        fontSize: '11px',
                      }}
                    >
                      <Icon name={ord.orderType === 'POS_DIRECT' ? 'shop' : 'facebook'} className="me-1" />
                      {ord.orderType === 'POS_DIRECT' ? 'POS' : 'Messenger'}
                    </span>
                  </div>
                  {renderStatusBadge(ord.status)}
                </div>

                {/* Customer, Phone & Telco */}
                <div className="d-flex align-items-center justify-content-between mb-2 text-secondary small">
                  <div className="d-flex align-items-center gap-2 text-truncate" style={{ maxWidth: '60%' }}>
                    <Avatar name={custName} size={24} />
                    <span className="fw-semibold text-dark text-truncate">{custName}</span>
                  </div>
                  {phone && (
                    <div className="d-flex align-items-center gap-1">
                      <span className="fw-medium text-body">{phone}</span>
                      {telco && (
                        <span
                          className="badge rounded-pill fw-normal"
                          style={{ backgroundColor: telco.bg, color: telco.color, fontSize: '10px' }}
                        >
                          {telco.name}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Product items snippet */}
                <div className="p-2 rounded mb-2 text-secondary small" style={{ backgroundColor: '#F8F6F2' }}>
                  <div className="d-flex align-items-center justify-content-between">
                    <span className="text-truncate fw-medium text-dark" style={{ maxWidth: '75%' }}>
                      {firstItem.skuId?.styleName || firstItem.styleName || firstItem.skuCode || 'Sản phẩm'}
                    </span>
                    <span className="fw-semibold text-dark">x{firstItem.orderedQty || 1}</span>
                  </div>
                  {ord.items?.length > 1 && (
                    <div className="text-muted fst-italic mt-1" style={{ fontSize: '11px' }}>
                      + và {ord.items.length - 1} sản phẩm khác
                    </div>
                  )}
                  {waybill && (
                    <div className="mt-1 font-monospace" style={{ fontSize: '11px', color: '#0369A1' }}>
                      Mã vận đơn: <strong>{waybill}</strong>
                    </div>
                  )}
                </div>

                {/* Total COD & Actions */}
                <div className="d-flex align-items-center justify-content-between pt-2 border-top">
                  <div>
                    <div className="text-secondary" style={{ fontSize: '11px' }}>Tổng tiền (COD)</div>
                    <div className="fw-bold fs-6" style={{ color: '#9F8365' }}>{formatVnd(totalAmount)}</div>
                  </div>
                  <div className="d-flex align-items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <Button
                      size="sm"
                      variant="outline-dark"
                      className="px-3 py-1"
                      onClick={() => handleOpenDetail(ord)}
                    >
                      Chi tiết
                    </Button>
                    {['DELIVERED', 'CONFIRMED_RESERVED'].includes(ord.status) && (
                      <Button
                        size="sm"
                        variant="outline-warning"
                        className="px-2 py-1"
                        onClick={() => handleOpenRma(ord)}
                        title="Đổi/Trả"
                      >
                        Đổi/Trả
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── Footer status bar ─── */}
      <div
        className="border-top px-3 py-2 small d-flex align-items-center justify-content-between"
        style={{ backgroundColor: '#FAF7F2', borderColor: '#E3D9CD', color: '#7E766D' }}
      >
        <div>
          Tổng số: <strong className="text-dark">{filteredOrders.length}</strong> đơn hàng · Đã chọn <strong className="text-dark">{selectedIds.length}</strong> đơn
        </div>
      </div>

      {/* ── Thanh thao tác nổi khi tích chọn Checkbox hàng loạt ─── */}
      {selectedIds.length > 0 && (
        <div className="ara-floating-toolbar">
          <span className="badge px-2 py-1" style={{ backgroundColor: '#9F8365', color: '#FFFFFF' }}>
            Đã chọn {selectedIds.length} đơn
          </span>
          <button
            type="button"
            className="btn btn-sm btn-light rounded-pill px-3 fw-semibold d-flex align-items-center gap-1"
            onClick={() => showInfo(`Chuẩn bị in phiếu gửi hàng loạt cho ${selectedIds.length} đơn hàng...`, 'In phiếu gửi')}
          >
            <Icon name="printer" /> In phiếu ({selectedIds.length})
          </button>
          <button
            type="button"
            className="btn btn-sm btn-light rounded-pill px-3 fw-semibold d-flex align-items-center gap-1"
            onClick={() => {
              const selectedOrders = filteredOrders.filter((o) => selectedIds.includes(o._id || o.id));
              handleExportOrders(selectedOrders, `don-hang-da-chon-ara-${new Date().toISOString().slice(0, 10)}.csv`);
              setSelectedIds([]);
            }}
          >
            <Icon name="download" /> Xuất ({selectedIds.length} đơn)
          </button>
          <button
            type="button"
            className="btn btn-sm btn-outline-light rounded-pill px-2"
            onClick={() => setSelectedIds([])}
            title="Bỏ chọn"
          >
            <Icon name="x-lg" />
          </button>
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
          showSuccess('Phiếu RMA đã được tạo thành công!', 'Tạo RMA');
          setRmaModalOpen(false);
          fetchOrders();
        }}
      />
    </div>
  );
};

export default SellerOrdersPage;
