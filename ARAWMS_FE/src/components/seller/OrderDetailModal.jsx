/**
 * ============================================================================
 * @title        : Order Detail Modal (Pancake-style)
 * @author       : Nguyễn Quang Huy
 * @createdDate  : 2026-10-27
 * @lastModified : 2026-10-29
 * @description  : Modal xem chi tiết đơn hàng, chỉnh sửa sản phẩm/số lượng khi PENDING,
 *                 khóa cứng khi đã chốt đơn, gửi phiếu xác nhận tự động, giả lập Sandbox
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
  { value: 'CONFIRMED_RESERVED',  label: 'Đã giữ chỗ kho' },
  { value: 'PICKING',             label: 'Đang lấy hàng' },
  { value: 'PACKED',              label: 'Đã đóng gói' },
  { value: 'HANDED_OVER_CARRIER', label: 'Đang giao hàng' },
  { value: 'DELIVERED',           label: 'Đã giao hàng' },
  { value: 'COMPLETED',           label: 'Hoàn thành / POS' },
  { value: 'CANCELLED',           label: 'Đã hủy đơn' },
  { value: 'RETURNED',            label: 'Đã trả hàng' },
];

/** Tiêu đề nhỏ cho từng khối thông tin trong modal. */
const SectionTitle = ({ icon, children, right }) => (
  <Card.Header className="bg-white d-flex align-items-center justify-content-between small fw-bold text-uppercase text-warning-emphasis">
    <span className="d-flex align-items-center gap-2"><Icon name={icon} /> {children}</span>
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
    }
  }, [order, isOpen]);

  if (!isOpen || !order) return null;

  const currentStatusObj = ORDER_STATUSES.find((s) => s.value === status) || { value: status, label: status };
  const isPending = status === 'PENDING';
  const isCancelable = ['PENDING', 'CONFIRMED_RESERVED', 'PICKING'].includes(status);

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
        showSuccess('Đã xác nhận chốt đơn và kích hoạt giữ chỗ tồn kho thành công! [BR: GBR-07]', 'Chốt đơn thành công');
      }
    } catch (err) {
      showError(err.message || 'Lỗi khi xác nhận đơn hàng', 'Thất bại');
    } finally {
      setActionLoading(false);
    }
  };

  /**
   * Sandbox Simulator: Giả lập khách nhắn "OK chốt đơn" (Phase 3)
   */
  const handleSimulateCustomerConfirm = async () => {
    try {
      setActionLoading(true);
      const orderId = order._id || order.id;
      const res = await sellerService.simulateCustomerConfirm(orderId);
      if (res.success) {
        setStatus('CONFIRMED_RESERVED');
        const updated = res.order || { ...order, status: 'CONFIRMED_RESERVED' };
        if (onStatusUpdated) onStatusUpdated(updated);
        showSuccess('🤖 [Sandbox] Giả lập khách gửi tin nhắn: "OK chốt đơn" -> Đơn đã được tự động xác nhận và giữ chỗ kho!', 'Simulator thành công');
      }
    } catch (err) {
      showError(err.message || 'Lỗi giả lập xác nhận', 'Sandbox Error');
    } finally {
      setActionLoading(false);
    }
  };

  /**
   * Thực hiện gọi API cập nhật trạng thái
   */
  const executeStatusUpdate = async (newStatus, extraPayload = {}) => {
    try {
      setUpdating(true);
      setError('');
      const payload = { status: newStatus, ...extraPayload };

      const res = await sellerService.updateOrderStatus(order._id || order.id, payload);
      if (res.success) {
        setStatus(newStatus);
        const updated = res.data || { ...order, status: newStatus, ...extraPayload };
        if (onStatusUpdated) onStatusUpdated(updated);
        const targetObj = ORDER_STATUSES.find((s) => s.value === newStatus);
        showSuccess(`Đã chuyển trạng thái đơn hàng sang "${targetObj?.label || newStatus}"`, 'Cập nhật đơn hàng');
      }
    } catch (err) {
      const msg = err.message || 'Lỗi cập nhật trạng thái';
      setError(msg);
      showError(msg, 'Lỗi cập nhật');
    } finally {
      setUpdating(false);
    }
  };

  /**
   * Cập nhật trạng thái đơn hàng theo ma trận chuyển trạng thái hợp lệ.
   */
  const handleUpdateStatus = async (newStatus) => {
    if (newStatus === status) return;

    // [BR: GBR-13] Bàn giao vận chuyển yêu cầu mã vận đơn
    if (newStatus === 'HANDED_OVER_CARRIER') {
      const existingWaybill = order.warehouseFulfillment?.waybillCode;
      if (!existingWaybill) {
        setPromptDialog({
          isOpen: true,
          title: 'Bàn Giao Vận Chuyển',
          label: 'Nhập mã vận đơn bưu tá bàn giao:',
          value: `GHN_${order.orderCode || Date.now()}`,
          targetStatus: 'HANDED_OVER_CARRIER',
          field: 'waybillCode',
        });
        return;
      }
      return executeStatusUpdate(newStatus, { waybillCode: existingWaybill });
    }

    // [BR: GBR-08] Hủy đơn yêu cầu lý do
    if (newStatus === 'CANCELLED') {
      if (!isCancelable) {
        showError(`Không thể hủy đơn hàng ở trạng thái "${currentStatusObj.label}". Chỉ được phép hủy trước khi đóng gói.`, 'Bị chặn bởi nghiệp vụ');
        return;
      }
      setPromptDialog({
        isOpen: true,
        title: 'Hủy Đơn Hàng & Giải Phóng Tồn Kho',
        label: 'Vui lòng nhập lý do hủy đơn hàng (bắt buộc):',
        value: 'Khách đổi ý hủy đơn',
        targetStatus: 'CANCELLED',
        field: 'cancelReason',
      });
      return;
    }

    return executeStatusUpdate(newStatus);
  };

  const handleConfirmPrompt = (e) => {
    e.preventDefault();
    if (!promptDialog.value.trim()) return;
    const { targetStatus, field, value } = promptDialog;
    setPromptDialog({ ...promptDialog, isOpen: false });
    executeStatusUpdate(targetStatus, { [field]: value.trim() });
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return `${d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} - ${d.toLocaleDateString('vi-VN')}`;
  };

  return (
    <>
      <Modal show={isOpen} onHide={onClose} centered size="lg" fullscreen="sm-down" scrollable>
        {/* Header */}
        <Modal.Header closeButton closeVariant="white" className="bg-dark text-white">
          <Stack direction="horizontal" gap={3}>
            <Icon name="bag" className="fs-4 text-warning" />
            <div>
              <Stack direction="horizontal" gap={2} className="align-items-center">
                <Modal.Title as="span" className="font-monospace fw-bold fs-5">
                  #{order.orderCode || order._id?.slice(-6)}
                </Modal.Title>
                <Badge pill bg={ORDER_STATUS_VARIANT[status] || 'secondary'}>
                  {currentStatusObj.label || status}
                </Badge>
                {order.orderType === 'POS_DIRECT' && (
                  <Badge bg="success" className="d-flex align-items-center gap-1">
                    <Icon name="shop" /> Bán tại quầy POS
                  </Badge>
                )}
              </Stack>
              {order.createdAt && (
                <div className="small text-white-50 d-flex align-items-center gap-1 mt-1">
                  <Icon name="calendar3" /> Đặt lúc: {formatDate(order.createdAt)}
                  {order.confirmedAt && (
                    <span className="ms-2 text-warning">
                      • Chốt lúc: {formatDate(order.confirmedAt)}
                    </span>
                  )}
                </div>
              )}
            </div>
          </Stack>
        </Modal.Header>

        {/* Body */}
        <Modal.Body className="bg-body-tertiary d-flex flex-column gap-3">
          {error && <Alert variant="danger" className="py-2 small mb-0">{error}</Alert>}

          {/* Thanh công cụ xác nhận hai chiều & Sandbox dành cho đơn PENDING */}
          {isPending && (
            <Card className="border-warning bg-warning bg-opacity-10 shadow-sm">
              <Card.Body className="py-2 px-3">
                <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
                  <div className="small">
                    <strong className="text-warning-emphasis d-flex align-items-center gap-1">
                      <Icon name="chat-dots" /> Luồng Xác Nhận Hai Chiều (4.4.2):
                    </strong>
                    <span className="text-secondary">
                      Gửi phiếu hóa đơn vào Messenger để khách phản hồi "OK" hoặc xác nhận tại đây.
                    </span>
                  </div>
                  <Stack direction="horizontal" gap={2} className="flex-wrap">
                    <Button
                      size="sm"
                      variant="outline-dark"
                      className="d-flex align-items-center gap-1"
                      disabled={actionLoading}
                      onClick={handleSendConfirmationReceipt}
                      title="Gửi bảng tóm tắt đơn hàng kèm nút xác nhận vào khung chat Messenger của khách"
                    >
                      <Icon name="send" /> Gửi phiếu vào Chat
                    </Button>
                    <Button
                      size="sm"
                      variant="warning"
                      className="fw-bold d-flex align-items-center gap-1"
                      disabled={actionLoading}
                      onClick={handleManualConfirm}
                    >
                      <Icon name="check-circle" /> Khách đã xác nhận (Chốt đơn)
                    </Button>
                    <Button
                      size="sm"
                      variant="outline-primary"
                      className="d-flex align-items-center gap-1"
                      disabled={actionLoading}
                      onClick={handleSimulateCustomerConfirm}
                      title="Giả lập khách hàng nhắn 'OK chốt đơn' để test tự động giữ chỗ kho"
                    >
                      <Icon name="robot" /> Giả lập khách nhắn "OK"
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
                    <span>Tiền hàng ({items.length} món)</span>
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
                    <span>{order.paymentMethod === 'BANK_TRANSFER' ? 'Tổng thanh toán (Đã CK):' : 'Tổng thu hộ (COD):'}</span>
                    <span className="fs-5 text-warning-emphasis">{formatVnd(currentTotal)}</span>
                  </div>
                </Card.Body>
              </Card>
            </Col>
          </Row>

          {/* Khối 2: Danh sách sản phẩm & Cho phép sửa sản phẩm khi PENDING (Phase 1) */}
          <Card className="shadow-sm">
            <SectionTitle
              icon="box-seam"
              right={
                isPending ? (
                  <Badge bg="warning" text="dark" className="d-flex align-items-center gap-1">
                    <Icon name="pencil" /> Cho phép sửa số lượng / mẫu (PENDING)
                  </Badge>
                ) : (
                  <Badge bg="secondary" className="d-flex align-items-center gap-1">
                    <Icon name="lock-fill" /> Đã chốt đơn - Khóa sửa sản phẩm
                  </Badge>
                )
              }
            >
              Danh Sách Kiện Hàng ({items.length})
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

          {/* Khối 3: Cập nhật trạng thái đơn (Pancake Flow) */}
          <Card className="shadow-sm">
            <SectionTitle icon="truck" right={updating && <Spinner animation="border" size="sm" />}>
              Chuyển Đổi Trạng Thái Đơn Hàng (Pancake Flow)
            </SectionTitle>
            <Card.Body className="d-flex flex-wrap gap-2">
              {ORDER_STATUSES.map((s) => {
                const isCurrent = status === s.value;
                const variant = ORDER_STATUS_VARIANT[s.value] || 'secondary';
                // Kiểm tra nếu là nút CANCELLED nhưng đơn không được phép hủy thì disable
                const isCancelBtn = s.value === 'CANCELLED';
                const isBtnDisabled = updating || (isCancelBtn && !isCancelable);

                return (
                  <Button
                    key={s.value}
                    size="sm"
                    className="rounded-pill d-flex align-items-center gap-1"
                    variant={isCurrent ? variant : `outline-${variant}`}
                    onClick={() => handleUpdateStatus(s.value)}
                    disabled={isBtnDisabled}
                    title={
                      isCancelBtn && !isCancelable
                        ? 'Chỉ được phép hủy đơn trước khi đóng gói'
                        : `Chuyển trạng thái sang "${s.label}"`
                    }
                  >
                    {isCurrent && <Icon name="check-circle-fill" />}
                    {s.label}
                  </Button>
                );
              })}
            </Card.Body>
          </Card>
        </Modal.Body>

        {/* Footer */}
        <Modal.Footer className="justify-content-between">
          <div className="text-secondary small">
            Mã giao dịch: <span className="font-monospace text-body">{order._id}</span>
          </div>
          <Stack direction="horizontal" gap={2}>
            <Button variant="outline-secondary" size="sm" onClick={onClose}>
              Đóng
            </Button>
            {/* [BR: GBR-14] Cho phép tạo yêu cầu RMA nếu đơn đã hoàn thành hoặc đã giao */}
            {onOpenRma && ['DELIVERED', 'COMPLETED'].includes(status) && (
              <Button
                variant="warning"
                size="sm"
                className="fw-bold d-flex align-items-center gap-1"
                onClick={() => { onClose(); onOpenRma(order); }}
              >
                <Icon name="arrow-counterclockwise" /> Tạo Đổi / Trả Hàng (RMA)
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
