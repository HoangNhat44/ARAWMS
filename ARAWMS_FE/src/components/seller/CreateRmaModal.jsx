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
    <Modal show={isOpen} onHide={onClose} centered size="lg" fullscreen="sm-down" scrollable>
      <Modal.Header closeButton style={{ backgroundColor: 'var(--wms-bg-subtle, #F3EDE4)', borderBottom: '1px solid var(--wms-border, #C8B9A6)' }}>
        <Modal.Title as="h5" className="d-flex align-items-center gap-2 fw-bold" style={{ color: 'var(--wms-primary, #141210)' }}>
          <Icon name="arrow-counterclockwise" style={{ color: 'var(--wms-accent, #8A6A46)' }} />
          Tạo Yêu Cầu Đổi / Trả Hàng (UC-82 RMA)
        </Modal.Title>
      </Modal.Header>

      <Modal.Body style={{ backgroundColor: 'var(--wms-bg-app, #E8DFD3)' }}>
        {error && <Alert variant="danger" className="py-2 small">{error}</Alert>}

        {successRma ? (
          <div className="text-center py-4">
            <Icon name="check-circle-fill" style={{ color: 'var(--wms-success, #1E6B47)' }} className="display-4 d-block mb-3" />
            <h4 className="fw-bold" style={{ color: 'var(--wms-primary, #141210)' }}>Đã Tạo Phiếu RMA Thành Công!</h4>
            <p className="small" style={{ color: 'var(--wms-text-secondary, #574F46)' }}>
              Mã RMA: <strong className="font-monospace fs-6" style={{ color: 'var(--wms-primary, #141210)' }}>{successRma.rmaCode}</strong>
            </p>
            <Alert variant="light" className="text-start small" style={{ border: '1px solid var(--wms-border, #C8B9A6)', backgroundColor: 'var(--wms-bg-surface, #FFFFFF)' }}>
              <Alert.Heading as="div" className="fw-bold fs-6 d-flex align-items-center gap-1" style={{ color: 'var(--wms-accent, #8A6A46)' }}>
                <Icon name="info-circle" /> Lưu ý quy trình hoàn trả:
              </Alert.Heading>
              Phiếu RMA đang ở trạng thái <strong>REQUESTED</strong>. Nhân viên kho sẽ quét mã vận đơn hoàn và kiểm đếm trước khi tái nhập kho hoàn tất.
            </Alert>
            <Button className="btn-wms-primary" onClick={onClose}>Đóng cửa sổ</Button>
          </div>
        ) : (
          <Form id="rma-form" onSubmit={handleSubmit} className="d-flex flex-column gap-3 small">
            {/* Original Order Info */}
            <Card body style={{ border: '1px solid var(--wms-border, #C8B9A6)', borderRadius: '6px', backgroundColor: 'var(--wms-bg-surface, #FFFFFF)' }}>
              <div className="d-flex justify-content-between mb-1">
                <span style={{ color: 'var(--wms-text-secondary, #574F46)' }}>Đơn hàng gốc:</span>
                <span className="font-monospace fw-bold" style={{ color: 'var(--wms-primary, #141210)' }}>{order.orderCode}</span>
              </div>
              <div className="d-flex justify-content-between">
                <span style={{ color: 'var(--wms-text-secondary, #574F46)' }}>Người nhận:</span>
                <span className="fw-semibold" style={{ color: 'var(--wms-primary, #141210)' }}>{order.shippingRecipient?.name} ({order.shippingRecipient?.phone})</span>
              </div>
            </Card>

            {/* Return Type Selection */}
            <Card body style={{ border: '1px solid var(--wms-border, #C8B9A6)', borderRadius: '6px', backgroundColor: 'var(--wms-bg-surface, #FFFFFF)' }}>
              <Form.Label className="fw-bold mb-2" style={{ color: 'var(--wms-primary, #141210)' }}>Loại yêu cầu</Form.Label>
              <ButtonGroup className="w-100">
                {RETURN_TYPES.map((t) => (
                  <Button
                    key={t.value}
                    size="sm"
                    className={returnType === t.value ? 'btn-wms-primary' : 'btn-wms-default'}
                    onClick={() => setReturnType(t.value)}
                  >
                    {t.label}
                  </Button>
                ))}
              </ButtonGroup>
            </Card>

            {/* Select Return Items */}
            <Card style={{ border: '1px solid var(--wms-border, #C8B9A6)', borderRadius: '6px', backgroundColor: 'var(--wms-bg-surface, #FFFFFF)', overflow: 'hidden' }}>
              <Card.Header className="fw-bold" style={{ backgroundColor: 'var(--wms-bg-subtle, #F3EDE4)', borderBottom: '1px solid var(--wms-border, #C8B9A6)', color: 'var(--wms-primary, #141210)' }}>
                Chọn sản phẩm cần đổi/trả
              </Card.Header>
              <ListGroup variant="flush" className="overflow-auto" style={{ maxHeight: 180 }}>
                {order.items?.map((it, idx) => (
                  <ListGroup.Item key={idx} className="d-flex align-items-center justify-content-between gap-2" style={{ borderColor: 'var(--wms-border, #C8B9A6)' }}>
                    <div>
                      <div className="fw-bold" style={{ color: 'var(--wms-primary, #141210)' }}>{it.skuCode}</div>
                      <div style={{ color: 'var(--wms-text-secondary, #574F46)' }}>
                        Đã mua: <strong>{it.orderedQty}</strong> cái | Đơn giá: {formatVnd(it.unitSalePrice)}
                      </div>
                    </div>
                    <div className="d-flex align-items-center gap-2">
                      <span style={{ color: 'var(--wms-text-secondary, #574F46)' }}>Số lượng hoàn:</span>
                      <Form.Control
                        type="number"
                        size="sm"
                        min="0"
                        max={it.orderedQty}
                        value={selectedItems[it.skuId] || 0}
                        onChange={(e) => handleQtyChange(it.skuId, e.target.value)}
                        className="text-center"
                        style={{ width: 64, borderColor: 'var(--wms-border, #C8B9A6)' }}
                      />
                    </div>
                  </ListGroup.Item>
                ))}
              </ListGroup>
            </Card>

            {/* Reason & Waybill */}
            <Card body style={{ border: '1px solid var(--wms-border, #C8B9A6)', borderRadius: '6px', backgroundColor: 'var(--wms-bg-surface, #FFFFFF)' }}>
              <Form.Group className="mb-2" controlId="rma-waybill">
                <Form.Label className="fw-bold" style={{ color: 'var(--wms-primary, #141210)' }}>Mã vận đơn chiều gửi về (Return Waybill Code)</Form.Label>
                <Form.Control
                  size="sm"
                  placeholder="VD: GHN-RETURN-102938..."
                  value={returnWaybillCode}
                  onChange={(e) => setReturnWaybillCode(e.target.value)}
                  style={{ borderColor: 'var(--wms-border, #C8B9A6)' }}
                />
              </Form.Group>
              <Form.Group controlId="rma-reason">
                <Form.Label className="fw-bold" style={{ color: 'var(--wms-primary, #141210)' }}>Lý do đổi trả của khách hàng</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={2}
                  size="sm"
                  placeholder="VD: Khách mặc không vừa size L, muốn đổi sang size XL hoặc áo bị sút chỉ..."
                  value={reasonDescription}
                  onChange={(e) => setReasonDescription(e.target.value)}
                  style={{ borderColor: 'var(--wms-border, #C8B9A6)' }}
                  required
                />
              </Form.Group>
            </Card>
          </Form>
        )}
      </Modal.Body>

      {!successRma && (
        <Modal.Footer style={{ backgroundColor: 'var(--wms-bg-subtle, #F3EDE4)', borderTop: '1px solid var(--wms-border, #C8B9A6)' }}>
          <Button size="sm" className="btn-wms-default" onClick={onClose}>Hủy bỏ</Button>
          <Button size="sm" className="btn-wms-primary" type="submit" form="rma-form" disabled={loading}>
            {loading ? <><Spinner animation="border" size="sm" className="me-1" />Đang tạo...</> : 'Tạo Phiếu RMA'}
          </Button>
        </Modal.Footer>
      )}
    </Modal>
  );
};

export default CreateRmaModal;
