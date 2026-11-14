/**
 * ============================================================================
 * @title        : Seller Orders Workspace Page (Bootstrap / React-Bootstrap)
 * @author       : Nguyễn Quang Huy
 * @createdDate  : 2026-10-27
 * @lastModified : 2026-11-14
 * @description  : Màn hình quản lý danh sách đơn hàng bán lẻ của Seller: Tab đa kênh, dải đếm trạng thái realtime,
 *                 bảng chi tiết đầy đủ cột với React-Bootstrap Table, Form và Icons.
 *                 (Refactor 2026-10-28: giao diện chỉ dùng Bootstrap / React-Bootstrap.)
 * @module       : Order Fulfillment / Seller Orders
 * @layer        : Front-end
 * ============================================================================
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Container, Row, Col, Table, Badge, Button, ButtonGroup, Form,
  InputGroup, Stack, Card, Alert, Spinner, Pagination,
} from 'react-bootstrap';
import { sellerService } from '../../services/sellerService';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../hooks/useAuth';
import CreateRmaModal from '../../components/seller/CreateRmaModal';
import OrderDetailModal from '../../components/seller/OrderDetailModal';
import QuickOrderModal from '../../components/seller/QuickOrderModal';
import MarketplaceOrderImportModal from '../../components/seller/MarketplaceOrderImportModal';
import { SkeletonOrderRow } from '../../components/common/Skeleton';
import { Icon, Avatar, formatVnd, ORDER_STATUS_VARIANT, ORDER_STATUS_CLASS, EmptyState } from '../../components/seller/SellerUi';

/**
 * Nhận diện nhà mạng viễn thông tự động dựa trên đầu số điện thoại Việt Nam
 */
const detectTelco = (phone = '') => {
  const p = String(phone).replace(/\D/g, '');
  if (!p || p.length < 9) return null;
  if (/^(086|096|097|098|032|033|034|035|036|037|038|039)/.test(p)) {
    return { name: 'Viettel', color: '#EE0033', bg: '#FEE2E2' };
  }
  if (/^(089|090|093|070|079|077|076|078)/.test(p)) {
    return { name: 'Mobifone', color: '#005baa', bg: '#E0F2FE' };
  }
  if (/^(088|091|094|083|084|085|081|082)/.test(p)) {
    return { name: 'Vinaphone', color: '#0085d0', bg: '#E0F2FE' };
  }
  return null;
};

/**
 * Danh sách trạng thái Pancake và cấu hình nhãn đếm
 */
const PANCAKE_STATUSES = [
  { key: '',                    label: 'Tất cả',                            countKey: 'ALL' },
  { key: 'PENDING',             label: 'Chờ xác nhận',                      countKey: 'PENDING' },
  { key: 'CONFIRMED_RESERVED',  label: 'Đã xác nhận, đã giữ hàng',          countKey: 'CONFIRMED_RESERVED' },
  { key: 'PICKING',             label: 'Đang soạn hàng',                    countKey: 'PICKING' },
  { key: 'PACKED',              label: 'Đã đóng hàng, chờ bàn giao',        countKey: 'PACKED' },
  { key: 'HANDED_OVER_CARRIER', label: 'Đã bàn giao cho bên vận chuyển',    countKey: 'HANDED_OVER_CARRIER' },
  { key: 'CARRIER_PICKED_UP',   label: 'Đã lấy hàng',                       countKey: 'CARRIER_PICKED_UP' },
  { key: 'DELIVERED',           label: 'Đã giao thành công',                countKey: 'DELIVERED' },
  { key: 'EXCHANGE_REQUESTED',  label: 'Đang đổi hàng',                     countKey: 'EXCHANGE_REQUESTED' },
  { key: 'RETURN_REQUESTED',    label: 'Khách yêu cầu trả hàng',            countKey: 'RETURN_REQUESTED' },
  { key: 'COMPLETED',           label: 'Hoàn thành (Bán tại quầy)',         countKey: 'COMPLETED' },
  { key: 'CANCELLED',           label: 'Đã hủy',                            countKey: 'CANCELLED' },
  { key: 'RETURNED',            label: 'Đã hoàn về kho',                    countKey: 'RETURNED' },
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
  const location = useLocation();
  const { user } = useAuth();
  const { showSuccess, showInfo, showWarning } = useToast();

  // State dữ liệu, bộ lọc và phân trang
  const [orders, setOrders] = useState([]);
  const [statusCounts, setStatusCounts] = useState({});
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [channelFilter, setChannelFilter] = useState('ALL'); // 'ALL' | 'SHOPEE' | 'TIKTOK' | 'FACEBOOK' | 'POS' | 'EXCEL_IMPORT'
  const [subTab, setSubTab] = useState('ORDERS'); // 'ORDERS' | 'NEED_ACTION' | 'RETURNS'
  const [search, setSearch] = useState('');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    limit: 20,
    totalPages: 1,
  });

  // Selection
  const [selectedIds, setSelectedIds] = useState([]);

  // Modals
  const [createOrderModalOpen, setCreateOrderModalOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedOrderForDetail, setSelectedOrderForDetail] = useState(null);
  const [rmaModalOpen, setRmaModalOpen] = useState(false);
  const [selectedOrderForRma, setSelectedOrderForRma] = useState(null);
  const [importModalOpen, setImportModalOpen] = useState(false);

  // Nhận diện tab từ URL query parameter (ví dụ từ Sidebar click)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tab = params.get('tab');
    if (tab === 'marketplace_import') {
      setImportModalOpen(true);
    } else if (tab === 'rma_returns') {
      setSubTab('RETURNS');
      setStatusFilter('RETURN_REQUESTED');
    }
  }, [location.search]);

  useEffect(() => {
    setCurrentPage(1);
    fetchOrders(1);
  }, [statusFilter, channelFilter, subTab, pageSize]);

  /**
   * Gọi API lấy danh sách đơn hàng kèm phân trang và tổng đếm từng trạng thái
   */
  const fetchOrders = async (targetPage = currentPage) => {
    try {
      setLoading(true);
      const res = await sellerService.getOrderList({
        status: statusFilter || undefined,
        channel: channelFilter !== 'ALL' ? channelFilter : undefined,
        search: search.trim() || undefined,
        page: targetPage,
        limit: pageSize,
      });
      if (res.success) {
        setOrders(res.data?.items || []);
        if (res.data?.statusCounts) {
          setStatusCounts(res.data.statusCounts);
        }
        if (res.data?.pagination) {
          setPagination(res.data.pagination);
          setCurrentPage(res.data.pagination.page || targetPage);
        }
      }
    } catch (err) {
      console.warn('Lỗi tải danh sách đơn:', err.message);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Chuyển trang phân trang
   */
  const handlePageChange = (newPage) => {
    const totalP = pagination.totalPages || 1;
    if (newPage < 1 || newPage > totalP || newPage === currentPage) return;
    setCurrentPage(newPage);
    fetchOrders(newPage);
  };

  /**
   * Sinh các nút số trang phân trang
   */
  const renderPaginationItems = () => {
    const totalPages = pagination.totalPages || 1;
    if (totalPages <= 1) return null;

    const items = [];
    const maxVisible = 5;
    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, startPage + maxVisible - 1);
    if (endPage - startPage < maxVisible - 1) {
      startPage = Math.max(1, endPage - maxVisible + 1);
    }

    if (startPage > 1) {
      items.push(
        <Pagination.Item key={1} active={currentPage === 1} onClick={() => handlePageChange(1)}>
          1
        </Pagination.Item>
      );
      if (startPage > 2) items.push(<Pagination.Ellipsis key="ellipsis-start" disabled />);
    }

    for (let p = startPage; p <= endPage; p++) {
      items.push(
        <Pagination.Item key={p} active={p === currentPage} onClick={() => handlePageChange(p)}>
          {p}
        </Pagination.Item>
      );
    }

    if (endPage < totalPages) {
      if (endPage < totalPages - 1) items.push(<Pagination.Ellipsis key="ellipsis-end" disabled />);
      items.push(
        <Pagination.Item key={totalPages} active={currentPage === totalPages} onClick={() => handlePageChange(totalPages)}>
          {totalPages}
        </Pagination.Item>
      );
    }

    return items;
  };

  /**
   * Lọc theo kênh (Đa kênh: Shopee, TikTok, Facebook, POS, Excel)
   */
  const filteredOrders = useMemo(() => {
    return orders.filter((ord) => {
      if (channelFilter === 'POS') {
        return ord.orderType === 'POS_DIRECT' || ord.channel === 'POS_OFFLINE';
      }
      if (channelFilter === 'SHOPEE') return ord.channel === 'SHOPEE' || ord.sourceDetails?.sourceType === 'SHOPEE_STORE';
      if (channelFilter === 'TIKTOK') return ord.channel === 'TIKTOK' || ord.sourceDetails?.sourceType === 'TIKTOK_SHOP';
      if (channelFilter === 'FACEBOOK') return ord.channel === 'FACEBOOK' || ord.channel === 'FACEBOOK_MESSENGER' || ord.sourceDetails?.sourceType === 'FANPAGE';
      if (channelFilter === 'EXCEL_IMPORT') return ord.channel === 'EXCEL_IMPORT' || ord.importStatus !== 'NONE' || ord.sourceDetails?.sourceType === 'EXCEL_CUSTOM';
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
      'Chi tiết sản phẩm',
      'Tổng tiền hàng',
      'Phí vận chuyển',
      'Giảm giá',
      'Tổng thanh toán',
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
        const channel = ord.orderType === 'POS_DIRECT' ? 'Bán tại quầy' : 'Online';
        const created = formatDateTime(ord.createdAt);
        const updated = formatDateTime(ord.updatedAt);
        const recipient = ord.shippingRecipient || {};
        const customer = ord.customerId || {};
        const custName = customer.fullName || recipient.name || 'Khách vãng lai';
        const phone = recipient.phone || customer.phone || '';
        const telco = detectTelco(phone)?.name || '';
        const address = recipient.address
          || [recipient.addressDetail, recipient.ward, recipient.district, recipient.province]
            .filter(Boolean)
            .join(', ')
          || '-';

        const itemsStr = (ord.items || [])
          .map((item) => {
            const sku = item.skuCode || item.skuId?.skuCode || 'SKU';
            const name = item.productName || item.styleName || item.skuId?.styleName || '';
            const qty = item.orderedQty || 1;
            return `[${sku}] ${name} (x${qty})`;
          })
          .join('; ');

        const prodAmount = ord.financialSummary?.itemsSubtotal ?? ord.financialSummary?.totalProductAmount ?? 0;
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
    <div className="seller-orders-workspace d-flex flex-column" style={{ minHeight: 'calc(100vh - 64px)', backgroundColor: 'var(--wms-bg-app, #E8DFD3)' }}>
      {/* ── Top Header Navigation Bar (Enterprise Solid Surface) ─── */}
      <div className="ara-seller-header px-2 px-md-3 py-2 d-flex flex-wrap align-items-center justify-content-between gap-2 flex-shrink-0" style={{ backgroundColor: 'var(--wms-bg-subtle, #F3EDE4)', borderColor: 'var(--wms-border, #C8B9A6)' }}>
        <Stack direction="horizontal" gap={2} className="align-items-center">
          <Button
            size="sm"
            onClick={() => navigate('/seller/chat')}
            className="btn-wms-default d-flex align-items-center gap-1"
          >
            <Icon name="arrow-left" /> <span className="d-none d-sm-inline">Về Chat</span>
          </Button>
          <div className="vr opacity-25 d-none d-sm-block" style={{ height: 22, backgroundColor: 'var(--wms-border, #C8B9A6)' }} />
          <div className="d-flex align-items-center gap-2">
            <span className="fw-bold fs-6 text-nowrap" style={{ color: 'var(--wms-text-primary, #141210)' }}>
              Quản lý đơn hàng
            </span>
          </div>
        </Stack>

        {/* Action Buttons Top Right */}
        <Stack direction="horizontal" gap={1.5} className="order-2 order-md-3 flex-wrap ms-auto">
          <Button
            size="sm"
            className="btn-wms-default d-flex align-items-center gap-1 px-2.5 py-1"
            onClick={() => fetchOrders(currentPage)}
            title="Đồng bộ danh sách đơn"
          >
            <Icon name="arrow-clockwise" /> <span className="d-none d-md-inline">Đồng bộ</span>
          </Button>

          <Button
            size="sm"
            className="btn-wms-default d-flex align-items-center gap-1 px-2.5 py-1"
            onClick={() => setImportModalOpen(true)}
            title="Import đơn hàng từ Shopee, TikTok Shop và File Excel"
          >
            <Icon name="cloud-arrow-up" /> <span className="d-none d-sm-inline">Import Sàn / Excel</span><span className="d-sm-none">Import</span>
          </Button>

          <Button
            size="sm"
            className="btn-wms-default d-flex align-items-center gap-1 px-2.5 py-1"
            onClick={() => { setSelectedOrderForRma(null); setRmaModalOpen(true); }}
            title="Tạo phiếu đổi trả hàng"
          >
            <Icon name="arrow-counterclockwise" /> <span className="d-none d-md-inline">Đổi / Trả</span>
          </Button>

          <Button
            size="sm"
            className="btn-wms-default d-flex align-items-center gap-1 px-2.5 py-1"
            onClick={() => handleExportOrders(filteredOrders, `don-hang-ara-${channelFilter.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`)}
            title="Xuất file toàn bộ danh sách đơn hàng đang hiển thị"
          >
            <Icon name="download" /> <span className="d-none d-md-inline">Xuất danh sách</span>
          </Button>

          <Button
            size="sm"
            className="btn-wms-accent d-flex align-items-center gap-1 px-3 py-1"
            onClick={() => setCreateOrderModalOpen(true)}
            title="Tạo đơn hàng mới"
          >
            <Icon name="plus-lg" /> <span className="d-none d-sm-inline">Tạo đơn</span>
          </Button>
        </Stack>

        {/* Search input: Full width on mobile (order-3), middle on desktop (order-md-2) */}
        <div className="order-3 order-md-2 flex-grow-1 w-100 w-md-auto mx-0 mx-md-2 my-1 my-md-0" style={{ maxWidth: 420 }}>
          <InputGroup size="sm" className="ara-search-capsule">
            <InputGroup.Text><Icon name="search" /></InputGroup.Text>
            <Form.Control
              placeholder="Tìm theo mã đơn, SĐT, tên khách, mã sàn, SKU..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setCurrentPage(1);
                  fetchOrders(1);
                }
              }}
            />
          </InputGroup>
        </div>
      </div>

      {/* ── Channel Tabs Bar & Sub Tabs ─── */}
      <div
        className="px-2 px-md-3 py-2 border-bottom d-flex align-items-center justify-content-between gap-2 overflow-x-auto flex-shrink-0 ara-channels-subtabs-bar text-nowrap"
        style={{ backgroundColor: 'var(--wms-bg-subtle, #F3EDE4)', borderColor: 'var(--wms-border, #C8B9A6)' }}
      >
        {/* Đa kênh: Tất cả / Shopee / TikTok / FB / POS / Excel */}
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
            className={`ara-segmented-btn ${channelFilter === 'SHOPEE' ? 'active' : ''}`}
            onClick={() => setChannelFilter('SHOPEE')}
          >
            <span style={{ color: '#EE4D2D', fontWeight: 700 }}>●</span> Shopee Mall
          </button>
          <button
            type="button"
            className={`ara-segmented-btn ${channelFilter === 'TIKTOK' ? 'active' : ''}`}
            onClick={() => setChannelFilter('TIKTOK')}
          >
            <span style={{ color: '#000000', fontWeight: 700 }}>●</span> TikTok Shop
          </button>
          <button
            type="button"
            className={`ara-segmented-btn ${channelFilter === 'FACEBOOK' ? 'active' : ''}`}
            onClick={() => setChannelFilter('FACEBOOK')}
          >
            <span style={{ color: '#1877F2', fontWeight: 700 }}>●</span> FB Fanpages
          </button>
          <button
            type="button"
            className={`ara-segmented-btn ${channelFilter === 'POS' ? 'active' : ''}`}
            onClick={() => setChannelFilter('POS')}
          >
            Tại quầy POS
          </button>
          <button
            type="button"
            className={`ara-segmented-btn ${channelFilter === 'EXCEL_IMPORT' ? 'active' : ''}`}
            onClick={() => setChannelFilter('EXCEL_IMPORT')}
          >
            Import Excel
          </button>
        </div>

        {/* Sub-tabs: Đơn hàng / Cần xử lý / Đơn đã hoàn (Bỏ chờ kho duyệt) */}
        <div className="ara-segmented-group text-nowrap flex-shrink-0 ms-auto">
          <button
            type="button"
            className={`ara-segmented-btn ${subTab === 'ORDERS' ? 'active' : ''}`}
            onClick={() => { setSubTab('ORDERS'); setStatusFilter(''); }}
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
            Đổi / Trả hàng
          </button>
        </div>
      </div>

      {/* ── Pancake Status Pill Counters Bar ─── */}
      <div
        className="ara-status-pills-container px-3 py-2 d-flex align-items-center gap-1 overflow-x-auto flex-shrink-0"
        style={{ backgroundColor: 'var(--wms-bg-subtle, #F3EDE4)', borderColor: 'var(--wms-border, #C8B9A6)' }}
      >
        {PANCAKE_STATUSES.map((st) => {
          const count = statusCounts[st.countKey] !== undefined ? statusCounts[st.countKey] : 0;
          const isActive = statusFilter === st.key;
          const isZero = count === 0 && st.key !== 'ALL';
          return (
            <button
              key={st.key}
              type="button"
              className={`ara-status-pill-btn ${isActive ? 'active' : ''}`}
              style={isZero && !isActive ? { opacity: 0.55, backgroundColor: '#FFFFFF' } : {}}
              onClick={() => setStatusFilter(st.key)}
            >
              <span>{st.label}</span>
              <span
                className="ara-status-pill-count"
                style={count > 0 && !isActive ? { backgroundColor: 'var(--wms-primary-subtle, #EFE6DA)', color: 'var(--wms-secondary, #574F46)' } : {}}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Main Orders Data View: Desktop/Tablet Table Card vs Mobile Cards Stream ─── */}
      {/* 1. Desktop & Tablet Table Card Container (>= md, >= 768px) */}
      <div
        className="d-none d-md-flex flex-column flex-grow-1 mx-2 mx-md-3 my-2 bg-white border rounded shadow-sm overflow-hidden"
        style={{ borderColor: 'var(--wms-border, #C8B9A6)', minHeight: 480 }}
      >
        <div className="flex-grow-1 overflow-auto ara-seller-table-scroll" style={{ minHeight: 380, maxHeight: 'calc(100vh - 280px)' }}>
          <Table hover className="ara-seller-table align-middle mb-0 text-nowrap w-100">
            <thead className="sticky-top shadow-sm" style={{ zIndex: 10 }}>
              <tr>
                <th style={{ width: 40, minWidth: 40 }} className="text-center">
                  <Form.Check
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={toggleSelectAll}
                    aria-label="Chọn tất cả đơn"
                  />
                </th>
                <th style={{ minWidth: 145 }}>Mã đơn & Kênh</th>
                <th style={{ minWidth: 95 }}>Mã vận đơn</th>
                <th style={{ minWidth: 110 }}>Thời gian</th>
                <th style={{ minWidth: 125 }}>Khách hàng</th>
                <th style={{ minWidth: 105 }}>SĐT</th>
                <th style={{ minWidth: 190 }}>Sản phẩm & Phân loại</th>
                <th style={{ minWidth: 105 }} className="text-end">Tổng tiền</th>
                <th style={{ minWidth: 110 }}>Ghi chú</th>
                <th style={{ minWidth: 145 }} className="text-center">Trạng thái</th>
                <th style={{ minWidth: 115 }} className="text-center col-sticky-end">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [1, 2, 3, 4, 5, 6].map((i) => (
                  <tr key={i}>
                    <td colSpan="11" className="py-2">
                      <SkeletonOrderRow />
                    </td>
                  </tr>
                ))
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan="11" className="text-center py-5">
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

                      {/* ID & Kênh Nguồn */}
                      <td>
                        <div className="d-flex flex-column gap-1">
                          <div className="ara-code-badge">
                            <Icon
                              name={
                                ord.channel === 'SHOPEE' ? 'bag-fill' :
                                ord.channel === 'TIKTOK' ? 'play-btn-fill' :
                                ord.orderType === 'POS_DIRECT' ? 'shop' : 'facebook'
                              }
                              style={{
                                color:
                                  ord.channel === 'SHOPEE' ? '#EE4D2D' :
                                  ord.channel === 'TIKTOK' ? '#111827' :
                                  ord.orderType === 'POS_DIRECT' ? '#7E766D' : '#1877F2',
                              }}
                            />
                            <span className="fw-bold">{ord.orderCode || id.slice(-6)}</span>
                          </div>
                          {ord.sourceDetails?.sourceName && (
                            <span className="badge rounded-pill bg-light text-secondary border text-start" style={{ fontSize: '0.67rem', whiteSpace: 'nowrap' }}>
                              {ord.sourceDetails.sourceName}
                            </span>
                          )}
                          {ord.sourceDetails?.externalOrderCode && (
                            <span className="text-primary fw-medium text-truncate" style={{ maxWidth: 145, fontSize: '0.72rem' }} title={ord.sourceDetails.externalOrderCode}>
                              Mã sàn: {ord.sourceDetails.externalOrderCode}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Mã vận đơn (Tự động lấy từ GHN API) */}
                      <td onClick={(e) => e.stopPropagation()}>
                        {waybill ? (
                          <div className="d-flex flex-column lh-sm">
                            <span className="fw-semibold text-primary font-monospace" style={{ fontSize: '0.82rem' }}>
                              {waybill}
                            </span>
                            {ord.warehouseFulfillment?.ghnStatus ? (
                              <span className="text-muted" style={{ fontSize: '0.68rem' }}>
                                GHN: {ord.warehouseFulfillment.ghnStatus}
                              </span>
                            ) : null}
                          </div>
                        ) : ord.orderType !== 'POS_DIRECT' && ord.channel !== 'POS' && ord.channel !== 'POS_OFFLINE' && !['CANCELLED', 'RETURNED'].includes(ord.status) ? (
                          <Button
                            size="sm"
                            variant="outline-primary"
                            className="py-0 px-2"
                            style={{ fontSize: '0.72rem' }}
                            onClick={async () => {
                              try {
                                const res = await sellerService.syncOrderWithGhn(id);
                                if (res?.success) {
                                  const waybill = res.data?.warehouseFulfillment?.waybillCode || '';
                                  const chatNotified = res.data?.chatNotified;
                                  const msg = chatNotified
                                    ? `Đã lấy mã vận đơn GHN: ${waybill} và đã gửi tin nhắn cho khách!`
                                    : `Đã lấy mã vận đơn GHN: ${waybill}`;
                                  showSuccess(msg, 'Đồng bộ GHN');
                                  fetchOrders(currentPage);
                                }
                              } catch (err) {
                                showWarning(err.message || 'Không lấy được mã vận đơn GHN');
                              }
                            }}
                          >
                            <Icon name="truck" className="me-1" /> Lấy mã GHN
                          </Button>
                        ) : (
                          <span className="text-muted opacity-50">-</span>
                        )}
                      </td>

                      {/* Thời gian */}
                      <td>
                        <div className="d-flex flex-column lh-sm">
                          <span className="fw-semibold text-dark" style={{ fontSize: '0.82rem' }}>
                            {formatDateTime(ord.createdAt)}
                          </span>
                          {ord.updatedAt && ord.updatedAt !== ord.createdAt && (
                            <span className="text-muted" style={{ fontSize: '0.68rem' }} title={`Cập nhật TT: ${formatDateTime(ord.updatedAt)}`}>
                              Sửa: {formatDateTime(ord.updatedAt)}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Khách hàng */}
                      <td>
                        <div className="d-flex align-items-center gap-2">
                          <Avatar name={customer.fullName || recipient.name} size={28} />
                          <span className="fw-semibold text-truncate text-dark" style={{ maxWidth: 120 }} title={customer.fullName || recipient.name}>
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

                      {/* Sản phẩm & Phân loại */}
                      <td>
                        {ord.items && ord.items.length > 0 ? (
                          <div className="d-flex flex-column gap-1" style={{ maxWidth: 210 }}>
                            <span className="fw-semibold text-dark text-truncate" style={{ fontSize: '0.82rem' }} title={firstItem.skuId?.styleName || firstItem.styleName || firstItem.skuCode}>
                              {firstItem.skuId?.styleName || firstItem.styleName || firstItem.skuCode}
                            </span>
                            <div className="d-flex align-items-center gap-1">
                              <span className="badge rounded-pill bg-light text-dark border fw-medium" style={{ fontSize: '0.72rem' }}>
                                {firstItem.skuCode || firstItem.skuId?.skuCode}
                              </span>
                              <span className="text-secondary small fw-semibold">x{firstItem.orderedQty}</span>
                              {ord.items.length > 1 && (
                                <span className="badge rounded-pill" style={{ backgroundColor: '#EBE4DA', color: '#5A524A', fontSize: '0.67rem' }}>
                                  +{ord.items.length - 1} món khác
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="text-secondary">-</span>
                        )}
                      </td>

                      {/* Tổng tiền */}
                      <td className="text-end fw-bold" style={{ color: 'var(--wms-text-primary, #141210)', fontSize: '0.88rem' }}>
                        {formatVnd(totalAmount)}
                      </td>

                      {/* Ghi chú nội bộ */}
                      <td>
                        <div className="text-truncate text-secondary" style={{ maxWidth: 110, fontSize: '0.8rem' }} title={ord.notes || ''}>
                          {ord.notes || '-'}
                        </div>
                      </td>

                      {/* Trạng thái */}
                      <td className="text-center">
                        <div className="d-flex flex-column align-items-center gap-1">
                          {renderStatusBadge(ord.status)}
                          {ord.warehouseFulfillment?.ghnStatus && (
                            <span
                              className="badge rounded-pill font-monospace border"
                              style={{
                                backgroundColor: '#EEF2FF',
                                color: '#3730A3',
                                borderColor: '#C7D2FE',
                                fontSize: '0.66rem',
                                padding: '2px 6px',
                              }}
                              title={ord.warehouseFulfillment?.ghnStatusName || ord.warehouseFulfillment?.ghnStatus}
                            >
                              GHN: {ord.warehouseFulfillment.ghnStatus}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Thao tác (Sticky End) */}
                      <td className="text-center col-sticky-end" onClick={(e) => e.stopPropagation()}>
                        <Stack direction="horizontal" gap={1} className="justify-content-center">
                          <Button
                            size="sm"
                            variant="light"
                            className="py-1 px-2 border d-flex align-items-center gap-1"
                            style={{ borderColor: 'var(--wms-border, #C8B9A6)', fontSize: '0.75rem' }}
                            onClick={() => handleOpenDetail(ord)}
                            title="Xem chi tiết đơn hàng"
                          >
                            <Icon name="eye" className="text-secondary" />
                            <span>Xem</span>
                          </Button>
                          {['DELIVERED', 'COMPLETED'].includes(ord.status) && (
                            <Button
                              size="sm"
                              variant="light"
                              className="py-1 px-2 border"
                              style={{ borderColor: 'var(--wms-border, #C8B9A6)' }}
                              onClick={() => handleOpenRma(ord)}
                              title="Tạo yêu cầu Đổi / Trả"
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

        {/* ── Desktop Card Footer: Status summary & Pagination bar ─── */}
        <div
          className="border-top px-3 py-2 small d-flex flex-wrap align-items-center justify-content-between gap-2 flex-shrink-0"
          style={{ backgroundColor: 'var(--wms-bg-subtle, #F3EDE4)', borderColor: 'var(--wms-border, #C8B9A6)', color: 'var(--wms-secondary, #574F46)' }}
        >
          <div className="d-flex align-items-center gap-2 flex-wrap">
            <div>
              Tổng số: <strong className="text-dark">{pagination.total ?? filteredOrders.length}</strong> đơn hàng · Đã chọn <strong className="text-dark">{selectedIds.length}</strong> đơn
            </div>
            <div className="vr opacity-25 d-none d-sm-block" style={{ height: 16 }} />
            <div className="d-flex align-items-center gap-1">
              <span className="text-muted d-none d-sm-inline">Hiển thị:</span>
              <Form.Select
                size="sm"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                style={{ width: 'auto', padding: '2px 24px 2px 8px', fontSize: '0.8rem', backgroundColor: '#FFFFFF', borderColor: 'var(--wms-border, #C8B9A6)' }}
              >
                <option value={10}>10 đơn/trang</option>
                <option value={20}>20 đơn/trang</option>
                <option value={50}>50 đơn/trang</option>
                <option value={100}>100 đơn/trang</option>
              </Form.Select>
            </div>
          </div>

          {/* Phân trang Bootstrap */}
          {(pagination.totalPages > 1 || pagination.total > pageSize) && (
            <div className="d-flex align-items-center gap-2 ms-auto">
              <span className="text-muted small d-none d-md-inline">
                Trang {currentPage} / {pagination.totalPages || 1}
              </span>
              <Pagination size="sm" className="mb-0 ara-pagination">
                <Pagination.First
                  disabled={currentPage <= 1 || loading}
                  onClick={() => handlePageChange(1)}
                  title="Trang đầu"
                />
                <Pagination.Prev
                  disabled={currentPage <= 1 || loading}
                  onClick={() => handlePageChange(currentPage - 1)}
                  title="Trang trước"
                />
                {renderPaginationItems()}
                <Pagination.Next
                  disabled={currentPage >= (pagination.totalPages || 1) || loading}
                  onClick={() => handlePageChange(currentPage + 1)}
                  title="Trang sau"
                />
                <Pagination.Last
                  disabled={currentPage >= (pagination.totalPages || 1) || loading}
                  onClick={() => handlePageChange(pagination.totalPages || 1)}
                  title="Trang cuối"
                />
              </Pagination>
            </div>
          )}
        </div>
      </div>

      {/* 2. Mobile Cards Stream (< md, < 768px) */}
      <div className="d-md-none flex-grow-1 overflow-auto p-2" style={{ backgroundColor: 'var(--wms-bg-app, #E8DFD3)' }}>
        {loading ? (
          [1, 2, 3, 4].map((i) => (
            <div key={i} className="mb-2 p-3 bg-white border rounded shadow-sm" style={{ borderColor: 'var(--wms-border, #C8B9A6)' }}>
              <SkeletonOrderRow />
            </div>
          ))
        ) : filteredOrders.length === 0 ? (
          <div className="text-center py-5 bg-white rounded border" style={{ borderColor: 'var(--wms-border, #C8B9A6)' }}>
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
                className={`ara-mobile-order-card bg-white border rounded p-3 mb-2 shadow-sm ${isSelected ? 'border-primary' : ''}`}
                style={{ borderColor: 'var(--wms-border, #C8B9A6)', cursor: 'pointer' }}
                onClick={() => handleOpenDetail(ord)}
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
                    <span className="fw-bold text-dark fs-6 font-monospace">#{ord.orderCode || id.slice(-8).toUpperCase()}</span>
                    <span
                      className="badge rounded-pill fw-normal"
                      style={{
                        backgroundColor:
                          ord.channel === 'SHOPEE' ? '#FFF7ED' :
                          ord.channel === 'TIKTOK' ? '#F3F4F6' :
                          ord.orderType === 'POS_DIRECT' ? '#F3EDE4' : '#EFE6DA',
                        color:
                          ord.channel === 'SHOPEE' ? '#C2410C' :
                          ord.channel === 'TIKTOK' ? '#111827' :
                          ord.orderType === 'POS_DIRECT' ? '#574F46' : '#6E5233',
                        border: '1px solid #C8B9A6',
                        fontSize: '11px',
                      }}
                    >
                      <Icon
                        name={
                          ord.channel === 'SHOPEE' ? 'bag-fill' :
                          ord.channel === 'TIKTOK' ? 'play-btn-fill' :
                          ord.orderType === 'POS_DIRECT' ? 'shop' : 'facebook'
                        }
                        className="me-1"
                      />
                      {ord.channel === 'SHOPEE' ? 'Shopee' : ord.channel === 'TIKTOK' ? 'TikTok' : ord.orderType === 'POS_DIRECT' ? 'POS' : 'Messenger'}
                    </span>
                  </div>
                  <div className="d-flex flex-column align-items-end gap-1">
                    {renderStatusBadge(ord.status)}
                  </div>
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
                <div className="p-2 rounded mb-2 text-secondary small" style={{ backgroundColor: 'var(--wms-bg-subtle, #F3EDE4)', border: '1px solid var(--wms-border, #C8B9A6)' }}>
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
                  {ord.sourceDetails?.externalOrderCode && (
                    <div className="mt-1 font-monospace text-primary" style={{ fontSize: '11px' }}>
                      Mã sàn: <strong>{ord.sourceDetails.externalOrderCode}</strong>
                    </div>
                  )}
                  {waybill && (
                    <div className="mt-1 font-monospace" style={{ fontSize: '11px', color: '#6E5233' }}>
                      Mã vận đơn: <strong>{waybill}</strong>
                    </div>
                  )}
                </div>

                {/* Total & Actions */}
                <div className="d-flex flex-wrap align-items-center justify-content-between pt-2 border-top gap-2" style={{ borderColor: 'var(--wms-border, #C8B9A6)' }}>
                  <div>
                    <div className="text-secondary" style={{ fontSize: '11px' }}>Tổng tiền</div>
                    <div className="fw-bold fs-6" style={{ color: 'var(--wms-text-primary, #141210)' }}>{formatVnd(totalAmount)}</div>
                  </div>
                  <div className="d-flex align-items-center gap-1 ms-auto" onClick={(e) => e.stopPropagation()}>
                    <Button
                      size="sm"
                      variant="outline-dark"
                      className="px-2 px-sm-3 py-1 btn-wms-default"
                      onClick={() => handleOpenDetail(ord)}
                    >
                      Chi tiết
                    </Button>
                    {['DELIVERED', 'COMPLETED'].includes(ord.status) && (
                      <Button
                        size="sm"
                        className="px-2 py-1 btn-wms-accent"
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

      {/* ── Mobile Footer status & Pagination bar (< md) ─── */}
      <div
        className="d-md-none border-top px-3 py-2 small d-flex flex-wrap align-items-center justify-content-between gap-2 flex-shrink-0"
        style={{ backgroundColor: 'var(--wms-bg-subtle, #F3EDE4)', borderColor: 'var(--wms-border, #C8B9A6)', color: 'var(--wms-secondary, #574F46)' }}
      >
        <div className="d-flex align-items-center gap-2 flex-wrap">
          <div>
            Tổng số: <strong className="text-dark">{pagination.total ?? filteredOrders.length}</strong> đơn hàng · Đã chọn <strong className="text-dark">{selectedIds.length}</strong> đơn
          </div>
          <div className="vr opacity-25 d-none d-sm-block" style={{ height: 16 }} />
          <div className="d-flex align-items-center gap-1">
            <span className="text-muted d-none d-sm-inline">Hiển thị:</span>
            <Form.Select
              size="sm"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              style={{ width: 'auto', padding: '2px 24px 2px 8px', fontSize: '0.8rem', backgroundColor: '#FFFFFF', borderColor: 'var(--wms-border, #C8B9A6)' }}
            >
              <option value={10}>10 đơn/trang</option>
              <option value={20}>20 đơn/trang</option>
              <option value={50}>50 đơn/trang</option>
              <option value={100}>100 đơn/trang</option>
            </Form.Select>
          </div>
        </div>

        {/* Phân trang Bootstrap */}
        {(pagination.totalPages > 1 || pagination.total > pageSize) && (
          <div className="d-flex align-items-center gap-2 ms-auto">
            <span className="text-muted small d-none d-md-inline">
              Trang {currentPage} / {pagination.totalPages || 1}
            </span>
            <Pagination size="sm" className="mb-0 ara-pagination">
              <Pagination.First
                disabled={currentPage <= 1 || loading}
                onClick={() => handlePageChange(1)}
                title="Trang đầu"
              />
              <Pagination.Prev
                disabled={currentPage <= 1 || loading}
                onClick={() => handlePageChange(currentPage - 1)}
                title="Trang trước"
              />
              {renderPaginationItems()}
              <Pagination.Next
                disabled={currentPage >= (pagination.totalPages || 1) || loading}
                onClick={() => handlePageChange(currentPage + 1)}
                title="Trang sau"
              />
              <Pagination.Last
                disabled={currentPage >= (pagination.totalPages || 1) || loading}
                onClick={() => handlePageChange(pagination.totalPages || 1)}
                title="Trang cuối"
              />
            </Pagination>
          </div>
        )}
      </div>

      {/* ── Thanh thao tác nổi khi tích chọn Checkbox hàng loạt ─── */}
      {selectedIds.length > 0 && (
        <div className="ara-floating-toolbar d-flex align-items-center gap-2">
          <span className="badge px-2 py-1" style={{ backgroundColor: 'var(--wms-accent, #8A6A46)', color: '#FFFFFF' }}>
            Đã chọn {selectedIds.length} đơn
          </span>
          <button
            type="button"
            className="btn btn-sm btn-light rounded-pill px-3 fw-semibold d-flex align-items-center gap-1"
            onClick={() => showInfo(`Chuẩn bị in phiếu gửi hàng loạt cho ${selectedIds.length} đơn hàng...`, 'In phiếu gửi')}
          >
            <Icon name="printer" /> In phiếu
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
            <Icon name="download" /> Xuất file đã chọn
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

      {/* ── Modal Import Đơn Hàng Shopee, TikTok & Excel (Mentor 4.3.3) ─── */}
      <MarketplaceOrderImportModal
        isOpen={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onImportSuccess={() => {
          showSuccess('Đã import đơn hàng từ sàn thành công!', 'Import TMĐT');
          setImportModalOpen(false);
          fetchOrders();
        }}
      />
    </div>
  );
};

export default SellerOrdersPage;
