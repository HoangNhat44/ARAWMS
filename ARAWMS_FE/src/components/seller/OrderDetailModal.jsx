/**
 * ============================================================================
 * @title        : Order Detail Modal (Pancake-style)
 * @author       : Nguyễn Quang Huy
 * @createdDate  : 2026-10-27
 * @lastModified : 2026-10-28
 * @description  : Modal xem chi tiết đơn hàng, cập nhật trạng thái đơn (UC-80, UC-81)
 *                 và kích hoạt quy trình đổi trả hàng bán lẻ RMA (UC-82).
 *                 (Không dùng window.prompt / alert của trình duyệt; dùng Modal & Toast của web.)
 * @module       : Order Fulfillment / Direct Order Management
 * @layer        : Front-end
 * ============================================================================
 */

import React, { useState } from 'react';
import { Modal, Badge, Row, Col, Card, Alert, Button, ListGroup, Spinner, Stack, Form } from 'react-bootstrap';
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
  { value: 'PACKED',              label: 'Đã đóng gói' },
  { value: 'HANDED_OVER_CARRIER', label: 'Đang giao hàng' },
  { value: 'DELIVERED',           label: 'Đã giao hàng' },
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
  const { showSuccess, showError } = useToast();
  const [status, setStatus] = useState(order?.status || 'PENDING');
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState('');

  // Dialog nhập thông tin trong web (thay thế window.prompt)
  const [promptDialog, setPromptDialog] = useState({
    isOpen: false,
    title: '',
    label: '',
    value: '',
    targetStatus: null,
    field: '',
  });

  if (!isOpen || !order) return null;

  const currentStatusObj = ORDER_STATUSES.find((s) => s.value === status) || { value: status, label: status };

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
   * [BR: GBR-10] Chuyển sang CONFIRMED_RESERVED sẽ tự động kích hoạt giữ chỗ kho.
   * [BR: GBR-11] Nếu chuyển sang CANCELLED, BE tự động hoàn trả tồn giữ chỗ về tồn khả dụng.
   * [BR: GBR-13] Chuyển sang HANDED_OVER_CARRIER yêu cầu có mã vận đơn (Waybill code).
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

    // [BR: GBR-11] Hủy đơn yêu cầu lý do
    if (newStatus === 'CANCELLED') {
      setPromptDialog({
        isOpen: true,
        title: 'Hủy Đơn Hàng',
        label: 'Nhập lý do hủy đơn hàng:',
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

  const items = order.items || [];
  const financial = order.financialSummary || {};
  const recipient = order.shippingRecipient || {};

  // Tính đúng tổng COD từ expectedCodAmount hoặc totalOrderAmount
  const totalCodAmount = financial.expectedCodAmount ?? financial.totalOrderAmount ?? financial.totalAmountDue ?? financial.grandTotal ?? 0;

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return `${d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} - ${d.toLocaleDateString('vi-VN')}`;
  };

  return (
    <>
      <Modal show={isOpen} onHide={onClose} centered size="lg" scrollable>
        {/* Header tối chuẩn Atelier */}
        <Modal.Header closeButton closeVariant="white" className="bg-dark text-white">
          <Stack direction="horizontal" gap={3}>
            <Icon name="bag" className="fs-4 text-warning" />
            <div>
              <Stack direction="horizontal" gap={2}>
                <Modal.Title as="span" className="font-monospace fw-bold fs-5">
                  #{order.orderCode || order._id?.slice(-6)}
                </Modal.Title>
                <Badge pill bg={ORDER_STATUS_VARIANT[status] || 'secondary'}>
                  {currentStatusObj.label || status}
                </Badge>
              </Stack>
              {order.createdAt && (
                <div className="small text-white-50 d-flex align-items-center gap-1">
                  <Icon name="calendar3" /> Đặt lúc: {formatDate(order.createdAt)}
                </div>
              )}
            </div>
          </Stack>
        </Modal.Header>

        {/* Body: chia 2 cột rõ ràng */}
        <Modal.Body className="bg-body-tertiary d-flex flex-column gap-3">
          {error && <Alert variant="danger" className="py-2 small mb-0">{error}</Alert>}

          {/* Khối 1: Thông tin người nhận & Thanh toán COD */}
          <Row className="g-3">
            {/* Cột trái: Người nhận */}
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
                </Card.Body>
              </Card>
            </Col>

            {/* Cột phải: Tài chính & Tiền COD */}
            <Col md={6}>
              <Card className="h-100 shadow-sm">
                <SectionTitle icon="cash-coin">Tóm Tắt Thanh Toán</SectionTitle>
                <Card.Body className="small">
                  <div className="d-flex justify-content-between text-secondary mb-1">
                    <span>Tiền hàng ({items.length} món)</span>
                    <span className="fw-semibold text-body">{formatVnd(financial.itemsSubtotal)}</span>
                  </div>
                  <div className="d-flex justify-content-between text-secondary mb-1">
                    <span>Phí giao hàng</span>
                    <span className="fw-semibold text-body">{formatVnd(financial.shippingFee)}</span>
                  </div>
                  {financial.discountAmount > 0 && (
                    <div className="d-flex justify-content-between text-success mb-1">
                      <span>Khuyến mãi / Giảm giá</span>
                      <span className="fw-semibold">-{formatVnd(financial.discountAmount)}</span>
                    </div>
                  )}
                  <div className="d-flex justify-content-between align-items-center pt-2 mt-2 border-top fw-bold">
                    <span>Tổng thu hộ (COD):</span>
                    <span className="fs-5 text-warning-emphasis">{formatVnd(totalCodAmount)}</span>
                  </div>
                </Card.Body>
              </Card>
            </Col>
          </Row>

          {/* Khối 2: Danh sách sản phẩm chi tiết */}
          <Card className="shadow-sm">
            <SectionTitle
              icon="box-seam"
              right={<span className="fw-normal text-secondary text-capitalize">Bán buôn &amp; bán lẻ tại quầy</span>}
            >
              Danh Sách Kiện Hàng ({items.length})
            </SectionTitle>
            <ListGroup variant="flush">
              {items.map((it, idx) => {
                const sku = it.skuId || it;
                const unitPrice = Number(it.unitSalePrice || it.finalPrice || 0);
                const subtotal = (it.orderedQty || 1) * unitPrice;

                return (
                  <ListGroup.Item key={idx} className="d-flex align-items-center justify-content-between gap-3">
                    <div className="d-flex align-items-center gap-3 text-truncate">
                      <Badge bg="light" text="secondary" className="border fs-6">{idx + 1}</Badge>
                      <div className="text-truncate">
                        <div className="fw-bold text-truncate">{sku.styleName || sku.skuCode || it.skuCode}</div>
                        <div className="small text-secondary">
                          <span className="font-monospace">{sku.skuCode || it.skuCode}</span>
                          {' · '}Size: <strong className="text-body">{sku.size || it.size || 'F'}</strong>
                          {sku.color && <>{' · '}Màu: <strong className="text-body">{sku.color}</strong></>}
                        </div>
                      </div>
                    </div>
                    <div className="text-end flex-shrink-0">
                      <div className="fw-bold text-warning-emphasis">{formatVnd(subtotal)}</div>
                      <div className="small text-secondary">
                        {formatVnd(unitPrice)} × <strong>{it.orderedQty}</strong>
                      </div>
                    </div>
                  </ListGroup.Item>
                );
              })}
            </ListGroup>
          </Card>

          {/* Khối 3: Cập nhật trạng thái đơn (Pancake Flow) */}
          <Card className="shadow-sm">
            <SectionTitle icon="truck" right={updating && <Spinner animation="border" size="sm" />}>
              Chuyển Đổi Trạng Thái Đơn Hàng (Pancake)
            </SectionTitle>
            <Card.Body className="d-flex flex-wrap gap-2">
              {ORDER_STATUSES.map((s) => {
                const isCurrent = status === s.value;
                const variant = ORDER_STATUS_VARIANT[s.value] || 'secondary';
                return (
                  <Button
                    key={s.value}
                    size="sm"
                    className="rounded-pill d-flex align-items-center gap-1"
                    variant={isCurrent ? variant : `outline-${variant}`}
                    onClick={() => handleUpdateStatus(s.value)}
                    disabled={updating}
                    title={`Chuyển trạng thái sang "${s.label}"`}
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
            Mã giao dịch nội bộ: <span className="font-monospace text-body">{order._id}</span>
          </div>
          <Stack direction="horizontal" gap={2}>
            <Button variant="outline-secondary" size="sm" onClick={onClose}>
              Đóng
            </Button>
            {/* [BR: GBR-14] [BR: GBR-15] Cho phép tạo yêu cầu đổi/trả RMA nếu đơn hàng hợp lệ */}
            {onOpenRma && !['CANCELLED', 'RETURNED'].includes(status) && (
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
