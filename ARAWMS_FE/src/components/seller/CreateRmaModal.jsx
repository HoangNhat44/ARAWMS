/**
 * ============================================================================
 * @title        : Create RMA Modal (UC-82)
 * @author       : Nguyễn Quang Huy
 * @createdDate  : 2026-10-27
 * @lastModified : 2026-10-28
 * @description  : Modal tạo yêu cầu đổi / trả hàng bán lẻ (RMA) từ một đơn hàng gốc.
 *                 (Refactor 2026-10-28: giao diện chỉ dùng Bootstrap / React-Bootstrap.)
 * @module       : Order Fulfillment / Returns
 * @layer        : Front-end
 * ============================================================================
 */

import React, { useState } from 'react';
import { Modal, Form, Card, Alert, Button, ButtonGroup, ToggleButton, ListGroup, Spinner } from 'react-bootstrap';
import { sellerService } from '../../services/sellerService';
import { Icon, formatVnd } from './SellerUi';

const RETURN_TYPES = [
  { value: 'RETURN_FOR_REFUND', label: 'Trả Hàng Hoàn Tiền' },
  { value: 'EXCHANGE_PRODUCT', label: 'Đổi Sản Phẩm Khác' },
];

const CreateRmaModal = ({ isOpen, onClose, order, onRmaCreated }) => {
  const [returnType, setReturnType] = useState('RETURN_FOR_REFUND');
  const [returnWaybillCode, setReturnWaybillCode] = useState('');
  const [reasonDescription, setReasonDescription] = useState('');
  const [selectedItems, setSelectedItems] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successRma, setSuccessRma] = useState(null);

  if (!isOpen || !order) return null;

  const handleQtyChange = (skuId, val) => {
    setSelectedItems({
      ...selectedItems,
      [skuId]: Math.max(0, Number(val)),
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const returnItems = [];
    for (const item of order.items || []) {
      const qty = selectedItems[item.skuId] || 0;
      if (qty > 0) {
        returnItems.push({
          skuId: item.skuId,
          skuBarcode: item.skuBarcode,
          returnedQty: qty,
          condition: 'GOOD_INTACT',
          disposition: 'RESTOCK_SALEABLE',
        });
      }
    }

    if (returnItems.length === 0) {
      setError('Vui lòng chọn số lượng ít nhất một sản phẩm cần hoàn/đổi');
      return;
    }

    try {
      setLoading(true);
      setError('');

      const res = await sellerService.createReturnRequest({
        originalOrderId: order?._id || order?.id,
        returnType,
        returnWaybillCode,
        reasonDescription,
        returnItems,
      });

      if (res.success) {
        setSuccessRma(res.data);
        if (onRmaCreated) onRmaCreated(res.data);
      }
    } catch (err) {
      setError(err.message || 'Lỗi khi tạo yêu cầu RMA');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal show={isOpen} onHide={onClose} centered size="lg" scrollable>
      <Modal.Header closeButton className="bg-warning-subtle">
        <Modal.Title as="h5" className="d-flex align-items-center gap-2">
          <Icon name="arrow-counterclockwise" className="text-warning-emphasis" />
          Tạo Yêu Cầu Đổi / Trả Hàng (UC-82 RMA)
        </Modal.Title>
      </Modal.Header>

      <Modal.Body className="bg-body-tertiary">
        {error && <Alert variant="danger" className="py-2 small">{error}</Alert>}

        {successRma ? (
          <div className="text-center py-4">
            <Icon name="check-circle-fill" className="text-success display-4 d-block mb-3" />
            <h4 className="fw-bold">Đã Tạo Phiếu RMA Thành Công!</h4>
            <p className="text-secondary small">
              Mã RMA: <strong className="font-monospace text-body fs-6">{successRma.rmaCode}</strong>
            </p>
            <Alert variant="light" className="text-start small border">
              <Alert.Heading as="div" className="fw-bold fs-6 d-flex align-items-center gap-1">
                <Icon name="info-circle" className="text-warning-emphasis" /> Lưu ý quy trình hoàn trả:
              </Alert.Heading>
              Phiếu RMA đang ở trạng thái <strong>REQUESTED</strong>. Nhân viên kho sẽ quét mã vận đơn hoàn và kiểm đếm trước khi tái nhập kho hoàn tất.
            </Alert>
            <Button variant="dark" onClick={onClose}>Đóng cửa sổ</Button>
          </div>
        ) : (
          <Form id="rma-form" onSubmit={handleSubmit} className="d-flex flex-column gap-3 small">
            {/* Original Order Info */}
            <Card body>
              <div className="d-flex justify-content-between mb-1">
                <span className="text-secondary">Đơn hàng gốc:</span>
                <span className="font-monospace fw-bold">{order.orderCode}</span>
              </div>
              <div className="d-flex justify-content-between">
                <span className="text-secondary">Người nhận:</span>
                <span className="fw-semibold">{order.shippingRecipient?.name} ({order.shippingRecipient?.phone})</span>
              </div>
            </Card>

            {/* Return Type Selection */}
            <Card body>
              <Form.Label className="fw-bold">Loại yêu cầu</Form.Label>
              <ButtonGroup className="w-100">
                {RETURN_TYPES.map((t) => (
                  <ToggleButton
                    key={t.value}
                    id={`rma-type-${t.value}`}
                    type="radio"
                    size="sm"
                    name="rma-return-type"
                    value={t.value}
                    variant={returnType === t.value ? 'dark' : 'outline-secondary'}
                    checked={returnType === t.value}
                    onChange={(e) => setReturnType(e.currentTarget.value)}
                  >
                    {t.label}
                  </ToggleButton>
                ))}
              </ButtonGroup>
            </Card>

            {/* Select Return Items */}
            <Card>
              <Card.Header className="bg-white fw-bold">Chọn sản phẩm cần đổi/trả</Card.Header>
              <ListGroup variant="flush" className="overflow-auto" style={{ maxHeight: 180 }}>
                {order.items?.map((it, idx) => (
                  <ListGroup.Item key={idx} className="d-flex align-items-center justify-content-between gap-2">
                    <div>
                      <div className="fw-bold">{it.skuCode}</div>
                      <div className="text-secondary">
                        Đã mua: <strong>{it.orderedQty}</strong> cái | Đơn giá: {formatVnd(it.unitSalePrice)}
                      </div>
                    </div>
                    <div className="d-flex align-items-center gap-2">
                      <span className="text-secondary">Số lượng hoàn:</span>
                      <Form.Control
                        type="number"
                        size="sm"
                        min="0"
                        max={it.orderedQty}
                        value={selectedItems[it.skuId] || 0}
                        onChange={(e) => handleQtyChange(it.skuId, e.target.value)}
                        className="text-center"
                        style={{ width: 64 }}
                      />
                    </div>
                  </ListGroup.Item>
                ))}
              </ListGroup>
            </Card>

            {/* Reason & Waybill */}
            <Card body>
              <Form.Group className="mb-2" controlId="rma-waybill">
                <Form.Label className="fw-bold">Mã vận đơn chiều gửi về (Return Waybill Code)</Form.Label>
                <Form.Control
                  size="sm"
                  placeholder="VD: GHN-RETURN-102938..."
                  value={returnWaybillCode}
                  onChange={(e) => setReturnWaybillCode(e.target.value)}
                />
              </Form.Group>
              <Form.Group controlId="rma-reason">
                <Form.Label className="fw-bold">Lý do đổi trả của khách hàng</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={2}
                  size="sm"
                  placeholder="VD: Khách mặc không vừa size L, muốn đổi sang size XL hoặc áo bị sút chỉ..."
                  value={reasonDescription}
                  onChange={(e) => setReasonDescription(e.target.value)}
                  required
                />
              </Form.Group>
            </Card>
          </Form>
        )}
      </Modal.Body>

      {!successRma && (
        <Modal.Footer>
          <Button size="sm" variant="outline-secondary" onClick={onClose}>Hủy bỏ</Button>
          <Button size="sm" variant="dark" type="submit" form="rma-form" disabled={loading}>
            {loading ? <><Spinner animation="border" size="sm" className="me-1" />Đang tạo...</> : 'Tạo Phiếu RMA'}
          </Button>
        </Modal.Footer>
      )}
    </Modal>
  );
};

export default CreateRmaModal;
