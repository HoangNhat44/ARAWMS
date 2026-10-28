/**
 * ============================================================================
 * @title        : Seller Orders Workspace Page (Bootstrap / React-Bootstrap)
 * @author       : Nguyễn Quang Huy
 * @createdDate  : 2026-10-27
 * @lastModified : 2026-10-28
 * @description  : Màn hình quản lý danh sách đơn hàng bán lẻ của Seller theo phong cách
 *                 Pancake/PosCake: Tab đa kênh, dải đếm trạng thái realtime,
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
import { Icon, Avatar, formatVnd, ORDER_STATUS_VARIANT, EmptyState } from '../../components/seller/SellerUi';

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
 * Component quản lý danh sách đơn hàng của Seller (Pancake-style layout)
 *
 * @component
 * @returns {JSX.Element} Bảng quản lý đơn hàng chuyên nghiệp phong cách Pancake.
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

  const renderStatusBadge = (status) => {
    const stObj = PANCAKE_STATUSES.find((s) => s.key === status);
    const label = stObj ? stObj.label : status;
    const variant = ORDER_STATUS_VARIANT[status] || 'secondary';
    return (
      <Badge bg={`${variant}-subtle`} text={`${variant}-emphasis`} className="px-2 py-1">
        {label}
      </Badge>
    );
  };

  return (
    <div className="d-flex flex-column h-100 bg-body-tertiary">
      {/* ── Top Header Navigation Bar ─── */}
      <div className="bg-dark text-white px-3 py-2 d-flex flex-wrap align-items-center justify-content-between gap-2 shadow-sm">
        <Stack direction="horizontal" gap={3} className="align-items-center">
          <Button
            size="sm"
            variant="outline-light"
            onClick={() => navigate('/seller/chat')}
            className="d-flex align-items-center gap-1"
          >
            <Icon name="arrow-left" /> Về Chat
          </Button>
          <div className="vr bg-secondary opacity-50 d-none d-sm-block" style={{ height: 24 }} />
          <div className="d-flex align-items-center gap-2">
            <Icon name="bag" className="text-warning fs-5" />
            <span className="fw-bold fs-6">Quản Lý Đơn Hàng</span>
            <Badge bg="warning" text="dark" className="d-none d-md-inline-block">ARA STORE NEW</Badge>
          </div>
        </Stack>

        {/* Search input in top header */}
        <div className="flex-grow-1 mx-2" style={{ maxWidth: 420 }}>
          <InputGroup size="sm">
            <InputGroup.Text className="bg-white"><Icon name="search" /></InputGroup.Text>
            <Form.Control
              placeholder="Tìm đơn hàng (Mã đơn, SĐT, Người nhận, SKU)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') fetchOrders(); }}
            />
          </InputGroup>
        </div>

        {/* Action Buttons Top Right */}
        <Stack direction="horizontal" gap={2}>
          <Button size="sm" variant="outline-light" onClick={fetchOrders} title="Đồng bộ danh sách đơn">
            <Icon name="arrow-clockwise" className="me-1" /> Đồng bộ
          </Button>
          <Button
            size="sm"
            variant="outline-light"
            onClick={() => showSuccess(`Xuất file danh sách ${filteredOrders.length} đơn hàng thành công!`, 'Xuất file')}
          >
            <Icon name="download" className="me-1" /> Xuất
          </Button>
          <Button
            size="sm"
            variant="warning"
            className="fw-bold text-dark d-flex align-items-center gap-1"
            onClick={() => setCreateOrderModalOpen(true)}
            title="Tạo đơn hàng mới (Popup Pancake)"
          >
            <Icon name="plus-lg" /> Tạo đơn
          </Button>
        </Stack>
      </div>

      {/* ── Channel Tabs Bar (Tất cả / Bán tại quầy / Online) & Sub Tabs ─── */}
      <div className="bg-white px-3 py-2 border-bottom d-flex flex-wrap align-items-center justify-content-between gap-2">
        <ButtonGroup size="sm">
          <Button
            variant={channelFilter === 'ALL' ? 'dark' : 'outline-secondary'}
            onClick={() => setChannelFilter('ALL')}
          >
            Tất cả
          </Button>
          <Button
            variant={channelFilter === 'POS' ? 'dark' : 'outline-secondary'}
            onClick={() => setChannelFilter('POS')}
          >
            Bán tại quầy
          </Button>
          <Button
            variant={channelFilter === 'ONLINE' ? 'dark' : 'outline-secondary'}
            onClick={() => setChannelFilter('ONLINE')}
          >
            Online
          </Button>
        </ButtonGroup>

        {/* Sub-tabs: Đơn hàng / Cần xử lý / Đơn đã hoàn */}
        <ButtonGroup size="sm">
          <Button
            variant={subTab === 'ORDERS' ? 'primary' : 'outline-secondary'}
            onClick={() => setSubTab('ORDERS')}
          >
            Đơn hàng
          </Button>
          <Button
            variant={subTab === 'NEED_ACTION' ? 'primary' : 'outline-secondary'}
            onClick={() => { setSubTab('NEED_ACTION'); setStatusFilter('PENDING'); }}
          >
            Cần xử lý
          </Button>
          <Button
            variant={subTab === 'RETURNS' ? 'primary' : 'outline-secondary'}
            onClick={() => { setSubTab('RETURNS'); setStatusFilter('RETURN_REQUESTED'); }}
          >
            Đơn đã hoàn
          </Button>
        </ButtonGroup>
      </div>

      {/* ── Pancake Status Pill Counters Bar ─── */}
      <div className="bg-white px-3 py-2 border-bottom d-flex align-items-center gap-1 overflow-x-auto">
        {PANCAKE_STATUSES.map((st) => {
          const count = statusCounts[st.countKey] !== undefined ? statusCounts[st.countKey] : 0;
          const isActive = statusFilter === st.key;
          return (
            <Button
              key={st.key}
              size="sm"
              variant={isActive ? 'dark' : 'outline-secondary'}
              className="rounded-pill py-0 px-2 text-nowrap d-flex align-items-center gap-1"
              style={{ fontSize: '0.78rem' }}
              onClick={() => setStatusFilter(st.key)}
            >
              <span>{st.label}</span>
              <Badge pill bg={isActive ? 'light' : 'secondary'} text={isActive ? 'dark' : undefined} className="ms-1">
                {count}
              </Badge>
            </Button>
          );
        })}
      </div>

      {/* ── Main Orders Table ─── */}
      <div className="flex-grow-1 overflow-auto bg-white">
        <Table responsive hover bordered className="align-middle mb-0 small text-nowrap">
          <thead className="table-light text-secondary sticky-top">
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
                      <Stack direction="horizontal" gap={1}>
                        <Icon name="facebook" className="text-primary" />
                        <span className="font-monospace fw-bold">{ord.orderCode || id.slice(-6)}</span>
                      </Stack>
                    </td>

                    {/* Mã vận đơn */}
                    <td>
                      {waybill ? (
                        <span className="font-monospace text-primary">{waybill}</span>
                      ) : (
                        <span className="text-secondary">-</span>
                      )}
                    </td>

                    {/* Thời gian tạo */}
                    <td>
                      <div className="d-flex align-items-center gap-1">
                        <span>{formatDateTime(ord.createdAt)}</span>
                        <Badge bg="secondary-subtle" text="secondary-emphasis" style={{ fontSize: '0.65rem' }}>HT</Badge>
                      </div>
                    </td>

                    {/* Cập nhật TT */}
                    <td>
                      <div className="d-flex align-items-center gap-1 text-secondary">
                        <span>{formatDateTime(ord.updatedAt)}</span>
                        <Icon name="person" />
                      </div>
                    </td>

                    {/* Khách hàng */}
                    <td>
                      <div className="d-flex align-items-center gap-2">
                        <Avatar name={customer.fullName || recipient.name} size={28} />
                        <span className="fw-semibold text-truncate" style={{ maxWidth: 140 }} title={customer.fullName || recipient.name}>
                          {customer.fullName || recipient.name || 'Khách vãng lai'}
                        </span>
                      </div>
                    </td>

                    {/* SĐT */}
                    <td>
                      <div className="d-flex align-items-center gap-1">
                        <span>{recipient.phone || customer.phone || '-'}</span>
                        {telco && (
                          <span
                            className="badge"
                            style={{ backgroundColor: telco.bg, color: telco.color, fontSize: '0.65rem' }}
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
                          <span className="fw-bold">{firstItem.skuCode || firstItem.skuId?.skuCode}</span>
                          <span className="text-secondary"> x {firstItem.orderedQty}</span>
                          {ord.items.length > 1 && (
                            <Badge bg="secondary" pill style={{ fontSize: '0.65rem' }}>+{ord.items.length - 1}</Badge>
                          )}
                        </div>
                      ) : (
                        <span className="text-secondary">Chưa có SP</span>
                      )}
                    </td>

                    {/* Tên sản phẩm */}
                    <td>
                      {ord.items && ord.items.length > 0 ? (
                        <div className="text-truncate" style={{ maxWidth: 220 }}>
                          {firstItem.skuId?.styleName || firstItem.styleName || firstItem.skuCode}
                          {ord.items.length > 1 && ` (và ${ord.items.length - 1} món khác)`}
                        </div>
                      ) : (
                        <span className="text-secondary">Chưa có SP</span>
                      )}
                    </td>

                    {/* Tổng tiền */}
                    <td className="text-end fw-bold text-warning-emphasis">
                      {formatVnd(totalAmount)}
                    </td>

                    {/* Ghi chú nội bộ */}
                    <td>
                      <div className="text-truncate text-secondary" style={{ maxWidth: 140 }}>
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
                          variant="outline-secondary"
                          className="py-0 px-2"
                          onClick={() => handleOpenDetail(ord)}
                          title="Xem chi tiết & đổi trạng thái"
                        >
                          <Icon name="eye" />
                        </Button>
                        {['DELIVERED', 'CONFIRMED_RESERVED'].includes(ord.status) && (
                          <Button
                            size="sm"
                            variant="outline-warning"
                            className="py-0 px-2"
                            onClick={() => handleOpenRma(ord)}
                            title="Tạo yêu cầu Đổi / Trả (RMA)"
                          >
                            <Icon name="arrow-counterclockwise" />
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

      {/* ── Footer status bar ─── */}
      <div className="bg-white border-top px-3 py-2 small text-secondary d-flex align-items-center justify-content-between">
        <div>
          Hiển thị <strong>{filteredOrders.length}</strong> đơn hàng · Đã chọn <strong>{selectedIds.length}</strong> đơn
        </div>
      </div>

      {/* ── Thanh thao tác nổi khi tích chọn Checkbox hàng loạt ─── */}
      {selectedIds.length > 0 && (
        <div
          className="position-fixed bottom-0 start-50 translate-middle-x mb-3 bg-dark text-white px-3 py-2 rounded-pill shadow-lg d-flex align-items-center gap-3"
          style={{ zIndex: 1050 }}
        >
          <Badge bg="light" text="dark" className="fw-bold px-2 py-1">
            Đã chọn {selectedIds.length} đơn
          </Badge>
          <Button
            size="sm"
            variant="light"
            className="rounded-pill py-1 px-3 fw-semibold"
            onClick={() => showInfo(`Chuẩn bị in phiếu gửi hàng loạt cho ${selectedIds.length} đơn hàng...`, 'In phiếu gửi')}
          >
            <Icon name="printer" className="me-1" /> In phiếu ({selectedIds.length})
          </Button>
          <Button
            size="sm"
            variant="light"
            className="rounded-pill py-1 px-3 fw-semibold"
            onClick={() => {
              showSuccess(`Đã xuất file dữ liệu cho ${selectedIds.length} đơn hàng đã chọn!`, 'Xuất dữ liệu');
              setSelectedIds([]);
            }}
          >
            <Icon name="download" className="me-1" /> Xuất dữ liệu ({selectedIds.length})
          </Button>
          <Button
            size="sm"
            variant="outline-light"
            className="rounded-pill py-1 px-2"
            onClick={() => setSelectedIds([])}
          >
            Bỏ chọn
          </Button>
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
