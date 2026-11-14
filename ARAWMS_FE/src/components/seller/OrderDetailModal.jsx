/**
 * ============================================================================
 * @title        : Order Detail Modal (Pancake-style)
 * @author       : Nguyễn Quang Huy
 * @createdDate  : 2026-10-27
 * @lastModified : 2026-11-14
 * @description  : Modal xem chi tiết đơn hàng, chỉnh sửa sản phẩm/số lượng khi PENDING,
 *                 khóa cứng khi đã chốt đơn, gửi phiếu xác nhận tự động
 *                 và kiểm soát điều kiện hủy đơn kèm lý do bắt buộc.
 * @module       : Order Fulfillment / Direct Order Management
 * @layer        : Front-end
 * ============================================================================
 */

import React, { useState, useEffect } from 'react';
import { Modal, Badge, Row, Col, Card, Alert, Button, ListGroup, Spinner, Stack, Form, ButtonGroup } from 'react-bootstrap';
import { sellerService } from '../../services/sellerService';
import { useToast } from '../../context/ToastContext';
import { Icon, formatVnd, ORDER_STATUS_VARIANT } from './SellerUi';

/**
 * Danh sách trạng thái đơn hàng bán lẻ chuẩn Database (khớp SalesOrder.model & enums.js)
 * @constant {Array<Object>}
 */
const ORDER_STATUSES = [
  { value: 'PENDING',             label: 'Chờ xác nhận' },
  { value: 'CONFIRMED_RESERVED',  label: 'Đã xác nhận, đã giữ hàng' },
  { value: 'PICKING',             label: 'Đang soạn hàng' },
  { value: 'PACKED',              label: 'Đã đóng hàng, chờ bàn giao' },
  { value: 'HANDED_OVER_CARRIER', label: 'Đã bàn giao cho bên vận chuyển' },
  { value: 'CARRIER_PICKED_UP',   label: 'Đã lấy hàng' },
  { value: 'DELIVERED',           label: 'Đã giao thành công' },
  { value: 'COMPLETED',           label: 'Hoàn thành (Bán tại quầy)' },
  { value: 'RETURN_REQUESTED',    label: 'Khách yêu cầu trả hàng' },
  { value: 'EXCHANGE_REQUESTED',  label: 'Đang đổi hàng' },
  { value: 'RETURNED',            label: 'Đã hoàn về kho' },
  { value: 'CANCELLED',           label: 'Đã hủy' },
];

/** Tiêu đề nhỏ cho từng khối thông tin trong modal. */
const SectionTitle = ({ icon, children, right }) => (
  <Card.Header
    className="d-flex align-items-center justify-content-between small fw-bold text-uppercase"
    style={{
      backgroundColor: 'var(--wms-bg-subtle, #F3EDE4)',
      color: 'var(--wms-text-primary, #141210)',
      borderBottom: '1px solid var(--wms-border, #C8B9A6)',
      letterSpacing: '0.03em',
    }}
  >
    <span className="d-flex align-items-center gap-2">
      <Icon name={icon} style={{ color: 'var(--wms-accent, #8A6A46)' }} /> {children}
    </span>
    {right}
  </Card.Header>
);

/**
 * Modal hiển thị toàn diện thông tin đơn hàng, thay đổi trạng thái và tạo yêu cầu RMA.
 *
 * @component
 * @param {Object} props - Thuộc tính truyền vào component.
 * @param {boolean} props.isOpen - Cờ kiểm soát hiển thị modal.
 * @param {Object} props.order - Dữ liệu chi tiết đơn hàng từ API.
 * @param {Function} props.onClose - Callback đóng modal.
 * @param {Function} [props.onStatusUpdated] - Callback khi trạng thái đơn được cập nhật.
 * @param {Function} [props.onOpenRma] - Callback mở modal tạo yêu cầu đổi trả (RMA).
 * @returns {JSX.Element|null} Modal chi tiết đơn hàng.
 */
const OrderDetailModal = ({ isOpen, order, onClose, onStatusUpdated, onOpenRma }) => {
  const { showSuccess, showError, showInfo, showWarning } = useToast();
  const [status, setStatus] = useState(order?.status || 'PENDING');
  const [waybillCode, setWaybillCode] = useState(order?.warehouseFulfillment?.waybillCode || '');
  const [ghnStatus, setGhnStatus] = useState(order?.warehouseFulfillment?.ghnStatus || '');
  const [ghnStatusName, setGhnStatusName] = useState(order?.warehouseFulfillment?.ghnStatusName || '');
  const [syncingGhn, setSyncingGhn] = useState(false);
  const [items, setItems] = useState([]);
  const [updating, setUpdating] = useState(false);
  const [savingItems, setSavingItems] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasItemsChanged, setHasItemsChanged] = useState(false);

  // Dialog nhập thông tin trong web (thay thế window.prompt)
  const [promptDialog, setPromptDialog] = useState({
    isOpen: false,
    title: '',
    label: '',
    value: '',
    targetStatus: null,
    field: '',
  });

  useEffect(() => {
    if (order) {
      setStatus(order.status || 'PENDING');
      setWaybillCode(order.warehouseFulfillment?.waybillCode || '');
      setGhnStatus(order.warehouseFulfillment?.ghnStatus || '');
      setGhnStatusName(order.warehouseFulfillment?.ghnStatusName || '');
      setItems(
        (order.items || []).map((it) => ({
          skuId: it.skuId?._id || it.skuId,
          skuCode: it.skuCode || it.skuId?.skuCode,
          productName: it.productName || it.skuId?.styleName || it.skuCode,
          size: it.size || it.skuId?.size || 'F',
          color: it.color || it.skuId?.color || '',
          orderedQty: it.orderedQty || 1,
          unitSalePrice: Number(it.unitSalePrice || it.skuId?.retailPrice || 0),
        }))
      );
      setHasItemsChanged(false);
      setError('');

      // Tự động lấy mã vận đơn GHN hoặc đồng bộ trạng thái realtime từ GHN khi mở chi tiết đơn Online (chỉ đơn đang tiến hành)
      if (
        isOpen &&
        order.orderType !== 'POS_DIRECT' &&
        order.channel !== 'POS' &&
        order.channel !== 'POS_OFFLINE' &&
        !['DELIVERED', 'COMPLETED', 'CANCELLED', 'RETURNED'].includes(order.status)
      ) {
        const orderId = order._id || order.id;
        if (orderId) {
          sellerService
            .syncOrderWithGhn(orderId)
            .then((res) => {
              if (res?.success && res.data) {
                const updated = res.data;
                setStatus(updated.status || order.status);
                setWaybillCode(updated.warehouseFulfillment?.waybillCode || '');
                setGhnStatus(updated.warehouseFulfillment?.ghnStatus || '');
                setGhnStatusName(updated.warehouseFulfillment?.ghnStatusName || '');
                if (onStatusUpdated) onStatusUpdated(updated);
              }
            })
            .catch(() => {});
        }
      }
    }
  }, [order?._id, isOpen]);

  if (!isOpen || !order) return null;

  const currentStatusObj = ORDER_STATUSES.find((s) => s.value === status) || { value: status, label: status };
  const isPending = status === 'PENDING';
  const pickedStatuses = ['picked', 'storing', 'transporting', 'sorting', 'delivering', 'delivered', 'return', 'returned'];
  const isShipperPicked =
    pickedStatuses.includes(String(ghnStatus || '').toLowerCase()) ||
    ['PACKED', 'HANDED_OVER_CARRIER', 'CARRIER_PICKED_UP', 'DELIVERED', 'COMPLETED', 'RETURN_REQUESTED', 'EXCHANGE_REQUESTED', 'RETURNED'].includes(status);
  const isCancelable = ['PENDING', 'CONFIRMED_RESERVED', 'PICKING'].includes(status) && !isShipperPicked && status !== 'CANCELLED';

  // Tính toán tổng tiền realtime theo items hiện tại
  const financial = order.financialSummary || {};
  const currentSubtotal = items.reduce((sum, it) => sum + (it.orderedQty || 1) * (it.unitSalePrice || 0), 0);
  const shippingFee = Number(financial.shippingFee) || 0;
  const discountAmount = Number(financial.discountAmount) || 0;
  const currentTotal = currentSubtotal + shippingFee - discountAmount;
  const recipient = order.shippingRecipient || {};

  /**
   * Thay đổi số lượng sản phẩm khi đơn còn PENDING
   */
  const handleQtyChange = (idx, delta) => {
    if (!isPending) return;
    setItems((prev) => {
      const copy = [...prev];
      const newQty = Math.max(1, (copy[idx].orderedQty || 1) + delta);
      copy[idx] = { ...copy[idx], orderedQty: newQty };
      return copy;
    });
    setHasItemsChanged(true);
  };

  /**
   * Xóa một sản phẩm khỏi đơn khi còn PENDING
   */
  const handleRemoveItem = (idx) => {
    if (!isPending) return;
    if (items.length <= 1) {
      showError('Đơn hàng phải chứa ít nhất 1 sản phẩm. Nếu không muốn lấy, vui lòng hủy đơn.', 'Không thể xóa');
      return;
    }
    setItems((prev) => prev.filter((_, i) => i !== idx));
    setHasItemsChanged(true);
  };

  /**
   * Lưu thay đổi danh sách sản phẩm (Phase 1)
   */
  const handleSaveItems = async () => {
    try {
      setSavingItems(true);
      setError('');
      const orderId = order._id || order.id;
      const res = await sellerService.updateOrderItems(orderId, {
        items,
        financialSummary: { shippingFee, discountAmount },
      });
      if (res.success) {
        setHasItemsChanged(false);
        const updated = res.data;
        if (onStatusUpdated) onStatusUpdated(updated);
        showSuccess('Đã lưu thay đổi sản phẩm và tính lại tổng tiền đơn hàng thành công!', 'Cập nhật sản phẩm');
      }
    } catch (err) {
      const msg = err.message || 'Lỗi khi lưu thay đổi sản phẩm';
      setError(msg);
      showError(msg, 'Lỗi cập nhật');
    } finally {
      setSavingItems(false);
    }
  };

  /**
   * Gửi phiếu xác nhận đơn hàng vào chat (Phase 2 & 3)
   */
  const handleSendConfirmationReceipt = async () => {
    try {
      setActionLoading(true);
      const orderId = order._id || order.id;
      const res = await sellerService.sendOrderConfirmationReceipt(orderId);
      if (res.success) {
        if (res.deliveryStatus === 'FAILED_24H_EXPIRED') {
          showWarning('Đã tạo phiếu trên web, nhưng Messenger chưa nhận được do khách chưa nhắn tin trong vòng 24 giờ qua. Hãy nhờ khách gửi 1 tin nhắn vào page để mở lại kết nối!', 'Lưu ý chính sách 24h Meta');
        } else {
          showSuccess('Đã gửi phiếu xác nhận chốt đơn vào khung chat Messenger của khách!', 'Gửi phiếu thành công');
        }
      }
    } catch (err) {
      showError(err.message || 'Không thể gửi phiếu xác nhận', 'Lỗi gửi tin nhắn');
    } finally {
      setActionLoading(false);
    }
  };

  /**
   * Seller bấm xác nhận chốt đơn thủ công (Phase 2)
   */
  const handleManualConfirm = async () => {
    try {
      setActionLoading(true);
      const orderId = order._id || order.id;
      const res = await sellerService.confirmOrderReserve(orderId);
      if (res.success) {
        setStatus('CONFIRMED_RESERVED');
        const updated = res.data || { ...order, status: 'CONFIRMED_RESERVED' };
        if (onStatusUpdated) onStatusUpdated(updated);
        showSuccess('Đã xác nhận chốt đơn và kích hoạt giữ chỗ tồn kho thành công!', 'Chốt đơn thành công');
      }
    } catch (err) {
      showError(err.message || 'Lỗi khi xác nhận đơn hàng', 'Thất bại');
    } finally {
      setActionLoading(false);
    }
  };


  /**
   * Tự động lấy mã vận đơn (order_code) và đồng bộ trạng thái Realtime từ GHN API
   */
  const handleSyncGhn = async () => {
    try {
      setSyncingGhn(true);
      setError('');
      const orderId = order._id || order.id;
      const res = await sellerService.syncOrderWithGhn(orderId);
      if (res.success && res.data) {
        const updated = res.data;
        setStatus(updated.status);
        setWaybillCode(updated.warehouseFulfillment?.waybillCode || '');
        setGhnStatus(updated.warehouseFulfillment?.ghnStatus || '');
        setGhnStatusName(updated.warehouseFulfillment?.ghnStatusName || '');
        if (onStatusUpdated) onStatusUpdated(updated);
        showSuccess(
          `Đã đồng bộ từ GHN! Mã vận đơn: ${updated.warehouseFulfillment?.waybillCode || 'GHN'} — Trạng thái: ${updated.warehouseFulfillment?.ghnStatusName || updated.status}`,
          'Đồng bộ GHN Realtime'
        );
      }
    } catch (err) {
      const msg = err.message || 'Không thể đồng bộ vận đơn từ GHN';
      setError(msg);
      showError(msg, 'Lỗi GHN API');
    } finally {
      setSyncingGhn(false);
    }
  };

  /**
   * Thực hiện gọi API hủy đơn hàng chuyên biệt (UC-81: giải phóng tồn kho giữ chỗ & đồng bộ hủy GHN)
   */
  const executeCancelOrder = async (cancelReason) => {
    try {
      setUpdating(true);
      setError('');
      const res = await sellerService.cancelOrder(order._id || order.id, cancelReason);
      if (res.success) {
        const updated = res.data || { ...order, status: 'CANCELLED', cancelReason };
        setStatus(updated.status || 'CANCELLED');
        setWaybillCode(updated.warehouseFulfillment?.waybillCode || waybillCode);
        setGhnStatus(updated.warehouseFulfillment?.ghnStatus || ghnStatus);
        setGhnStatusName(updated.warehouseFulfillment?.ghnStatusName || ghnStatusName);
        if (onStatusUpdated) onStatusUpdated(updated);
        showSuccess('Đã hủy đơn hàng và giải phóng tồn kho giữ chỗ thành công!', 'Hủy đơn hàng');
      }
    } catch (err) {
      const msg = err.message || 'Lỗi hủy đơn hàng';
      setError(msg);
      showError(msg, 'Lỗi hủy đơn');
    } finally {
      setUpdating(false);
    }
  };

  /**
   * Mở hộp thoại xác nhận lý do hủy đơn hàng
   */
  const handleCancelOrder = () => {
    if (!isCancelable) {
      showError('Shipper đã lấy hàng, không thể hủy đơn hàng này.', 'Không thể hủy đơn');
      return;
    }
    setPromptDialog({
      isOpen: true,
      title: 'Hủy Đơn Hàng',
      label: 'Vui lòng nhập lý do hủy đơn hàng:',
      value: 'Khách đổi ý hủy đơn',
      targetStatus: 'CANCELLED',
      field: 'cancelReason',
    });
  };

  const handleConfirmPrompt = (e) => {
    e.preventDefault();
    if (!promptDialog.value.trim()) return;
    const { value } = promptDialog;
    setPromptDialog({ ...promptDialog, isOpen: false });
    executeCancelOrder(value.trim());
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return `${d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} - ${d.toLocaleDateString('vi-VN')}`;
  };

  return (
    <>
      <Modal show={isOpen} onHide={onClose} centered size="lg" fullscreen="md-down" scrollable>
        {/* Header */}
        <Modal.Header closeButton style={{ backgroundColor: 'var(--wms-bg-subtle, #F3EDE4)', borderColor: 'var(--wms-border, #C8B9A6)' }}>
          <Stack direction="horizontal" gap={3}>
            <Icon name="bag" className="fs-4" style={{ color: 'var(--wms-accent, #8A6A46)' }} />
            <div>
              <Stack direction="horizontal" gap={2} className="align-items-center">
                <Modal.Title as="span" className="font-monospace fw-bold fs-5 ara-headline" style={{ color: 'var(--wms-text-primary, #141210)' }}>
                  {order.orderCode
                    ? (order.orderCode.startsWith('#') ? order.orderCode : `#${order.orderCode}`)
                    : (order._id ? `#${String(order._id).slice(-8).toUpperCase()}` : 'CHI TIẾT ĐƠN HÀNG')}
                </Modal.Title>
                <span
                  className="badge rounded-pill px-2.5 py-0.5"
                  style={
                    status === 'DELIVERED' || status === 'COMPLETED'
                      ? { backgroundColor: '#ECFDF5', color: '#006C4A', border: '1px solid #A7F3D0', fontSize: '12px', fontWeight: 600 }
                      : status === 'PENDING'
                      ? { backgroundColor: '#FFFBEB', color: '#D97706', border: '1px solid #FDE68A', fontSize: '12px', fontWeight: 600 }
                      : status === 'CANCELLED'
                      ? { backgroundColor: '#FFDAD6', color: '#BA1A1A', border: '1px solid #FFB4AB', fontSize: '12px', fontWeight: 600 }
                      : { backgroundColor: 'var(--wms-primary-subtle, #EFE6DA)', color: 'var(--wms-accent-hover, #6E5233)', border: '1px solid var(--wms-accent-light, #D4B48C)', fontSize: '12px', fontWeight: 600 }
                  }
                >
                  {currentStatusObj.label || status}
                </span>
                {order.orderType === 'POS_DIRECT' && (
                  <span
                    className="badge rounded-pill px-2 py-0.5 d-flex align-items-center gap-1"
                    style={{ backgroundColor: '#ECFDF5', color: '#006C4A', border: '1px solid #A7F3D0', fontSize: '11px', fontWeight: 600 }}
                  >
                    <Icon name="shop" /> Bán tại quầy POS
                  </span>
                )}
              </Stack>
              {order.createdAt && (
                <div className="small d-flex align-items-center gap-1 mt-1 tabular-nums" style={{ color: 'var(--wms-text-secondary, #574F46)' }}>
                  <Icon name="calendar3" /> Đặt lúc: {formatDate(order.createdAt)}
                  {order.confirmedAt && (
                    <span className="ms-2" style={{ color: 'var(--wms-accent, #8A6A46)' }}>
                      • Chốt lúc: {formatDate(order.confirmedAt)}
                    </span>
                  )}
                </div>
              )}
            </div>
          </Stack>
        </Modal.Header>

        {/* Body */}
        <Modal.Body className="d-flex flex-column gap-3" style={{ backgroundColor: 'var(--wms-bg-app, #E8DFD3)' }}>
          {error && <Alert variant="danger" className="py-2 small mb-0">{error}</Alert>}

          {/* Thanh công cụ xác nhận hai chiều dành cho đơn PENDING */}
          {isPending && (
            <Card className="shadow-sm" style={{ backgroundColor: '#FEF0C7', border: '1px solid #F5B95F' }}>
              <Card.Body className="py-2 px-3">
                <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
                  <div className="small">
                    <strong className="d-flex align-items-center gap-1" style={{ color: '#9A5B06' }}>
                      <Icon name="chat-dots" /> Luồng Xác Nhận Hai Chiều:
                    </strong>
                    <span style={{ color: '#574F46' }}>
                      Gửi phiếu hóa đơn vào Messenger để khách phản hồi "OK" hoặc xác nhận tại đây.
                    </span>
                  </div>
                  <Stack direction="horizontal" gap={2} className="flex-wrap">
                    <Button
                      size="sm"
                      className="btn-wms-default d-flex align-items-center gap-1"
                      disabled={actionLoading}
                      onClick={handleSendConfirmationReceipt}
                      title="Gửi bảng tóm tắt đơn hàng kèm nút xác nhận vào khung chat Messenger của khách"
                    >
                      <Icon name="send" /> Gửi phiếu vào Chat
                    </Button>
                    <Button
                      size="sm"
                      className="btn-wms-accent d-flex align-items-center gap-1"
                      disabled={actionLoading}
                      onClick={handleManualConfirm}
                    >
                      <Icon name="check-circle" /> Khách đã xác nhận (Chốt đơn)
                    </Button>
                  </Stack>
                </div>
              </Card.Body>
            </Card>
          )}

          {/* Khối 1: Thông tin người nhận & Thanh toán COD */}
          <Row className="g-3">
            <Col md={6}>
              <Card className="h-100 shadow-sm">
                <SectionTitle icon="person">Thông Tin Người Nhận</SectionTitle>
                <Card.Body className="small">
                  <div className="fw-bold fs-6">{recipient.name || 'Khách vãng lai'}</div>
                  <div className="d-flex align-items-center gap-2 mt-1">
                    <Icon name="telephone" className="text-secondary" />
                    <span className="fw-semibold">{recipient.phone || 'Chưa có SĐT'}</span>
                  </div>
                  <div className="d-flex align-items-start gap-2 mt-1 text-secondary">
                    <Icon name="geo-alt" />
                    <span>{recipient.address || 'Chưa cung cấp địa chỉ nhận hàng'}</span>
                  </div>
                  {order.notes && (
                    <div className="mt-2 p-2 bg-light rounded text-muted small">
                      <strong>Ghi chú:</strong> {order.notes}
                    </div>
                  )}
                </Card.Body>
              </Card>
            </Col>

            <Col md={6}>
              <Card className="h-100 shadow-sm">
                <SectionTitle icon="cash-coin">Tóm Tắt Thanh Toán</SectionTitle>
                <Card.Body className="small">
                  <div className="d-flex justify-content-between text-secondary mb-1">
                    <span>Tiền hàng</span>
                    <span className="fw-semibold text-body">{formatVnd(currentSubtotal)}</span>
                  </div>
                  <div className="d-flex justify-content-between text-secondary mb-1">
                    <span>Phí giao hàng</span>
                    <span className="fw-semibold text-body">{formatVnd(shippingFee)}</span>
                  </div>
                  {discountAmount > 0 && (
                    <div className="d-flex justify-content-between text-success mb-1">
                      <span>Khuyến mãi / Giảm giá</span>
                      <span className="fw-semibold">-{formatVnd(discountAmount)}</span>
                    </div>
                  )}
                  <div className="d-flex justify-content-between align-items-center pt-2 mt-2 border-top fw-bold">
                    <span>{order.paymentMethod === 'BANK_TRANSFER' ? 'Tổng thanh toán chuyển khoản:' : 'Tổng thu hộ COD:'}</span>
                    <span className="fs-5 text-warning-emphasis">{formatVnd(currentTotal)}</span>
                  </div>
                </Card.Body>
              </Card>
            </Col>
          </Row>

          {/* Khối 2: Danh sách sản phẩm */}
          <Card className="shadow-sm">
            <SectionTitle
              icon="box-seam"
              right={
                isPending ? (
                  <Badge bg="warning" text="dark" className="d-flex align-items-center gap-1">
                    <Icon name="pencil" /> Cho phép sửa khi chờ xác nhận
                  </Badge>
                ) : (
                  <Badge bg="secondary" className="d-flex align-items-center gap-1">
                    <Icon name="lock-fill" /> Đã chốt đơn - Khóa sửa sản phẩm
                  </Badge>
                )
              }
            >
              Danh Sách Kiện Hàng
            </SectionTitle>

            <ListGroup variant="flush">
              {items.map((it, idx) => {
                const unitPrice = Number(it.unitSalePrice || 0);
                const subtotal = (it.orderedQty || 1) * unitPrice;

                return (
                  <ListGroup.Item key={idx} className="d-flex align-items-center justify-content-between gap-3">
                    <div className="d-flex align-items-center gap-3 text-truncate">
                      <Badge bg="light" text="secondary" className="border fs-6">{idx + 1}</Badge>
                      <div className="text-truncate">
                        <div className="fw-bold text-truncate">{it.productName || it.skuCode}</div>
                        <div className="small text-secondary">
                          <span className="font-monospace">{it.skuCode}</span>
                          {' · '}Size: <strong className="text-body">{it.size || 'F'}</strong>
                          {it.color && <>{' · '}Màu: <strong className="text-body">{it.color}</strong></>}
                        </div>
                      </div>
                    </div>

                    <div className="d-flex align-items-center gap-3 flex-shrink-0">
                      {/* Công cụ tăng/giảm số lượng khi đơn PENDING */}
                      {isPending ? (
                        <div className="d-flex align-items-center gap-1 bg-light p-1 rounded border">
                          <Button
                            size="sm"
                            variant="white"
                            className="btn-sm p-0 px-2 border"
                            onClick={() => handleQtyChange(idx, -1)}
                            disabled={it.orderedQty <= 1}
                          >
                            -
                          </Button>
                          <span className="px-2 fw-bold font-monospace">{it.orderedQty}</span>
                          <Button
                            size="sm"
                            variant="white"
                            className="btn-sm p-0 px-2 border"
                            onClick={() => handleQtyChange(idx, 1)}
                          >
                            +
                          </Button>
                          <Button
                            size="sm"
                            variant="outline-danger"
                            className="btn-sm p-0 px-1 ms-1 border-0"
                            onClick={() => handleRemoveItem(idx)}
                            title="Xóa món này khỏi đơn"
                          >
                            <Icon name="trash" />
                          </Button>
                        </div>
                      ) : (
                        <div className="small text-secondary">
                          SL: <strong>{it.orderedQty}</strong>
                        </div>
                      )}

                      <div className="text-end" style={{ minWidth: 100 }}>
                        <div className="fw-bold text-warning-emphasis">{formatVnd(subtotal)}</div>
                        <div className="small text-secondary">
                          {formatVnd(unitPrice)} / cái
                        </div>
                      </div>
                    </div>
                  </ListGroup.Item>
                );
              })}
            </ListGroup>

            {/* Nút lưu thay đổi sản phẩm nếu có thay đổi */}
            {isPending && hasItemsChanged && (
              <Card.Footer className="bg-light d-flex justify-content-between align-items-center py-2">
                <span className="small text-warning-emphasis fw-semibold">
                  ⚠️ Bạn đã thay đổi số lượng/sản phẩm. Vui lòng bấm lưu để đồng bộ dữ liệu.
                </span>
                <Button
                  size="sm"
                  variant="dark"
                  disabled={savingItems}
                  onClick={handleSaveItems}
                  className="d-flex align-items-center gap-1"
                >
                  {savingItems ? <Spinner animation="border" size="sm" /> : <Icon name="check2-circle" />}
                  Lưu thay đổi sản phẩm
                </Button>
              </Card.Footer>
            )}
          </Card>

          {/* Khối 3: Vận đơn & Trạng thái Realtime Giao Hàng Nhanh */}
          {order.orderType !== 'POS_DIRECT' && (
            <Card className="shadow-sm">
              <SectionTitle
                icon="truck"
                right={
                  <Button
                    size="sm"
                    variant="dark"
                    disabled={syncingGhn || updating}
                    onClick={handleSyncGhn}
                    className="d-flex align-items-center gap-1 py-0 px-2"
                  >
                    {syncingGhn ? <Spinner animation="border" size="sm" /> : <Icon name="arrow-repeat" />}
                    {waybillCode ? 'Đồng bộ từ GHN' : 'Lấy mã vận đơn từ GHN'}
                  </Button>
                }
              >
                Vận Đơn &amp; Trạng Thái Giao Hàng Nhanh
              </SectionTitle>
              <Card.Body className="d-flex flex-column gap-2 small">
                <div className="d-flex flex-wrap justify-content-between align-items-center p-2 rounded bg-light border gap-2">
                  <div>
                    <span className="text-secondary me-1">Mã vận đơn GHN tự động:</span>
                    {waybillCode ? (
                      <strong className="font-monospace fs-6 text-primary">{waybillCode}</strong>
                    ) : (
                      <span className="text-warning-emphasis fw-semibold">Đang lấy tự động từ GHN...</span>
                    )}
                  </div>
                  <div>
                    <span className="text-secondary me-1">Trạng thái GHN:</span>
                    <Badge bg="info" text="dark" className="font-monospace">
                      {ghnStatusName || ghnStatus || 'Chờ lấy hàng'}
                    </Badge>
                  </div>
                </div>

                <div className="text-muted" style={{ fontSize: '11.5px' }}>
                  <Icon name="info-circle" className="me-1" />
                  Phí vận chuyển mặc định nội bộ: <strong>30.000 đ</strong> (Shop trả cước GHN). Khi trạng thái GHN thay đổi, hệ thống tự động đồng bộ trạng thái đơn và gửi thông báo cho khách hàng qua Chat.
                </div>

                {/* Kiểm soát trạng thái đơn: Không cho đổi trạng thái tự ý, chỉ có thể hủy đơn khi shipper chưa lấy */}
                <div className="p-2 rounded border mt-1" style={{ backgroundColor: '#FAF8F5' }}>
                  <div className="fw-semibold text-dark">Thao tác đơn hàng:</div>
                  <div className="text-muted" style={{ fontSize: '11.5px' }}>
                    {status === 'CANCELLED'
                      ? `Đơn hàng đã hủy lúc: ${formatDate(order.canceledAt || order.updatedAt)}. Lý do: ${order.cancelReason || 'Không có lý do'}`
                      : isCancelable
                      ? 'Đơn chỉ được phép hủy khi shipper chưa lấy hàng (sử dụng nút "Hủy Đơn Hàng" ở góc dưới modal).'
                      : 'Shipper đã lấy hàng / đang vận chuyển nên không thể hủy đơn hàng này.'}
                  </div>
                </div>
              </Card.Body>
            </Card>
          )}

          {/* Khối 4: Lịch sử xử lý & thay đổi trạng thái đơn hàng (Audit Trail) */}
          {Array.isArray(order.statusHistory) && order.statusHistory.length > 0 && (
            <Card className="shadow-sm">
              <SectionTitle icon="clock-history">
                Lịch Sử Xử Lý &amp; Trạng Thái Đơn Hàng ({order.statusHistory.length})
              </SectionTitle>
              <Card.Body className="p-0">
                <ListGroup variant="flush">
                  {order.statusHistory.map((hist, hIdx) => {
                    const fromObj = ORDER_STATUSES.find((s) => s.value === hist.from);
                    const toObj = ORDER_STATUSES.find((s) => s.value === hist.to);
                    const fromLabel = hist.from === 'NONE' ? 'Khởi tạo đơn' : (fromObj?.label || hist.from);
                    const toLabel = toObj?.label || hist.to;
                    const actorName = hist.by?.fullName || (hist.by?.employeeCode ? `NV: ${hist.by.employeeCode}` : 'Hệ thống tự động / GHN');

                    return (
                      <ListGroup.Item
                        key={hist._id || hIdx}
                        className="py-2 px-3 small d-flex flex-wrap align-items-center justify-content-between gap-2 border-bottom"
                        style={{ backgroundColor: hIdx % 2 === 0 ? '#FFFFFF' : '#FAF8F5' }}
                      >
                        <div className="d-flex align-items-center gap-2 flex-wrap">
                          <span className="badge bg-secondary-subtle text-secondary border font-monospace" style={{ fontSize: '11px' }}>
                            {fromLabel}
                          </span>
                          <Icon name="arrow-right" className="text-secondary" />
                          <span className={`ara-badge-status ${ORDER_STATUS_CLASS[hist.to] || 'ara-badge-confirmed'}`} style={{ fontSize: '11px' }}>
                            {toLabel}
                          </span>
                          {hist.note && (
                            <span className="text-muted ms-1" style={{ fontSize: '11.5px' }}>
                              — {hist.note}
                            </span>
                          )}
                        </div>
                        <div className="d-flex align-items-center gap-2 text-secondary" style={{ fontSize: '11.5px' }}>
                          <span>
                            <Icon name="person" className="me-1" />
                            <strong>{actorName}</strong>
                          </span>
                          <span>•</span>
                          <span>
                            <Icon name="calendar3" className="me-1" />
                            {formatDate(hist.at)}
                          </span>
                        </div>
                      </ListGroup.Item>
                    );
                  })}
                </ListGroup>
              </Card.Body>
            </Card>
          )}
        </Modal.Body>

        {/* Footer */}
        <Modal.Footer className="justify-content-between" style={{ backgroundColor: 'var(--wms-bg-subtle, #F3EDE4)', borderColor: 'var(--wms-border, #C8B9A6)' }}>
          <div className="text-secondary small d-flex flex-wrap align-items-center gap-2">
            <span>
              Mã đơn hàng:{' '}
              <span className="font-monospace fw-bold text-dark">
                {order.orderCode || (order._id ? `#${String(order._id).slice(-8).toUpperCase()}` : '—')}
              </span>
            </span>
            {order.sourceDetails?.externalOrderCode && (
              <span className="badge bg-primary-subtle text-primary border border-primary-subtle font-monospace">
                Mã sàn: {order.sourceDetails.externalOrderCode}
              </span>
            )}
            {waybillCode && (
              <span className="badge bg-info-subtle text-info-emphasis border border-info-subtle font-monospace">
                Vận đơn GHN: {waybillCode}
              </span>
            )}
          </div>
          <Stack direction="horizontal" gap={2}>
            {isCancelable && (
              <Button
                size="sm"
                variant="outline-danger"
                className="d-flex align-items-center gap-1"
                disabled={updating}
                onClick={handleCancelOrder}
              >
                <Icon name="x-circle" /> Hủy Đơn Hàng
              </Button>
            )}
            <Button size="sm" className="btn-wms-default" onClick={onClose}>
              Đóng
            </Button>
            {/* Chỉ đơn giao thành công (DELIVERED hoặc COMPLETED) mới hiển thị nút Đổi / Trả */}
            {onOpenRma && ['DELIVERED', 'COMPLETED'].includes(status) && (
              <Button
                size="sm"
                className="btn-wms-accent d-flex align-items-center gap-1"
                onClick={() => { onClose(); onOpenRma(order); }}
              >
                <Icon name="arrow-counterclockwise" /> Tạo Đổi / Trả Hàng
              </Button>
            )}
          </Stack>
        </Modal.Footer>
      </Modal>

      {/* Modal Prompt thay thế window.prompt() của trình duyệt */}
      <Modal
        show={promptDialog.isOpen}
        onHide={() => setPromptDialog({ ...promptDialog, isOpen: false })}
        centered
        size="sm"
      >
        <Form onSubmit={handleConfirmPrompt}>
          <Modal.Header closeButton>
            <Modal.Title as="h6" className="fw-bold d-flex align-items-center gap-2">
              <Icon name="pencil-square" className="text-warning-emphasis" />
              {promptDialog.title}
            </Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form.Group controlId="modal-prompt-input">
              <Form.Label className="small fw-semibold">{promptDialog.label}</Form.Label>
              <Form.Control
                size="sm"
                value={promptDialog.value}
                onChange={(e) => setPromptDialog({ ...promptDialog, value: e.target.value })}
                autoFocus
                required
              />
            </Form.Group>
          </Modal.Body>
          <Modal.Footer className="py-2">
            <Button
              size="sm"
              variant="outline-secondary"
              onClick={() => setPromptDialog({ ...promptDialog, isOpen: false })}
            >
              Hủy
            </Button>
            <Button size="sm" variant="dark" type="submit">
              Xác nhận
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </>
  );
};

export default OrderDetailModal;
