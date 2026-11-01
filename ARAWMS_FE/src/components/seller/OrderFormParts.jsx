/**
 * ============================================================================
 * @title        : Order Form Parts (Enterprise UI Design)
 * @author       : AraStore UI/UX Team
 * @description  : Các khối giao diện dùng chung cho QuickOrderModal và QuickOrderPanel,
 *                 tuân thủ nghiêm ngặt UIDesign.md về màu sắc, border và typography.
 * @module       : Order Fulfillment / Direct Order Management
 * @layer        : Front-end
 * ============================================================================
 */

import React, { useEffect, useRef } from 'react';
import { Form, InputGroup, ListGroup, Button, Spinner, Row, Col, Stack } from 'react-bootstrap';
import { Icon, SkuThumb, StockBadge, formatVnd } from './SellerUi';

/** Lấy số lượng khả dụng của SKU từ các tên trường khác nhau của API. */
export const getAvailQty = (sku) => sku.availableQty ?? sku.availableStock ?? 0;

/** Lấy ID của SKU từ các tên trường khác nhau của API. */
export const getSkuId = (sku) => sku.skuId || sku._id;

/**
 * Kiểm tra tính hợp lệ của số điện thoại Việt Nam (10 chữ số, đầu số 03, 05, 07, 08, 09)
 * @param {string} phone
 * @returns {boolean}
 */
export const isValidVnPhone = (phone) => {
  if (!phone) return false;
  return /^(0[35789])[0-9]{8}$/.test(String(phone).trim());
};

/**
 * Form thông tin người nhận hàng.
 * @param {Object} props
 * @param {{name:string, phone:string, address:string}} props.recipient - Dữ liệu người nhận.
 * @param {Function} props.onChange - Callback nhận object recipient mới.
 */
export const RecipientFields = ({ recipient, onChange }) => {
  const handlePhoneChange = (e) => {
    const cleaned = e.target.value.replace(/\D/g, '').slice(0, 10);
    onChange({ ...recipient, phone: cleaned });
  };

  const isPhoneInvalid = Boolean(recipient.phone && !isValidVnPhone(recipient.phone));
  const isPhoneValid = Boolean(recipient.phone && isValidVnPhone(recipient.phone));

  return (
    <div className="d-flex flex-column gap-2">
      <Row className="g-2">
        <Col xs={12} sm={6}>
          <Form.Group controlId="order-recipient-name">
            <Form.Label className="small fw-semibold mb-1" style={{ fontSize: '12px', color: 'var(--wms-text-primary, #141210)' }}>
              Họ và tên
            </Form.Label>
            <Form.Control
              size="sm"
              placeholder="Nhập tên người nhận"
              style={{ borderColor: 'var(--wms-border, #C8B9A6)' }}
              value={recipient.name || ''}
              onChange={(e) => onChange({ ...recipient, name: e.target.value })}
            />
          </Form.Group>
        </Col>
        <Col xs={12} sm={6}>
          <Form.Group controlId="order-recipient-phone">
            <Form.Label className="small fw-semibold mb-1" style={{ fontSize: '12px', color: 'var(--wms-text-primary, #141210)' }}>
              Số điện thoại <span style={{ color: 'var(--wms-error, #A62626)' }}>*</span>
            </Form.Label>
            <Form.Control
              size="sm"
              placeholder="09xx xxx xxx"
              style={{ borderColor: 'var(--wms-border, #C8B9A6)' }}
              value={recipient.phone || ''}
              onChange={handlePhoneChange}
              isInvalid={isPhoneInvalid}
              isValid={isPhoneValid}
              maxLength={10}
              required
            />
            <Form.Control.Feedback type="invalid" className="small" style={{ fontSize: '10.5px' }}>
              10 số (đầu 03, 05, 07, 08, 09)
            </Form.Control.Feedback>
          </Form.Group>
        </Col>
      </Row>
      <Form.Group controlId="order-recipient-address">
        <Form.Label className="small fw-semibold mb-1" style={{ fontSize: '12px', color: 'var(--wms-text-primary, #141210)' }}>
          Địa chỉ giao hàng
        </Form.Label>
        <Form.Control
          size="sm"
          placeholder="Số nhà, tên đường, phường/xã, quận/huyện..."
          style={{ borderColor: 'var(--wms-border, #C8B9A6)' }}
          value={recipient.address || ''}
          onChange={(e) => onChange({ ...recipient, address: e.target.value })}
        />
      </Form.Group>
    </div>
  );
};

/**
 * Ô tìm kiếm SKU kèm dropdown gợi ý (tồn kho realtime).
 */
export const SkuSearchBox = ({ query, onQueryChange, searching, show, onShowChange, list, header, onPick }) => {
  const wrapRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) onShowChange(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onShowChange]);

  return (
    <div className="position-relative mb-2" ref={wrapRef}>
      <InputGroup size="sm">
        <InputGroup.Text style={{ backgroundColor: '#FFFFFF', borderColor: 'var(--wms-border, #C8B9A6)', color: 'var(--wms-secondary, #574F46)' }}>
          <Icon name="search" />
        </InputGroup.Text>
        <Form.Control
          placeholder="Tìm sản phẩm theo tên, mã SKU... (bấm để xem danh sách có sẵn)"
          style={{ borderColor: 'var(--wms-border, #C8B9A6)' }}
          value={query}
          onFocus={() => onShowChange(true)}
          onChange={(e) => onQueryChange(e.target.value)}
        />
        {searching && (
          <InputGroup.Text style={{ backgroundColor: '#FFFFFF', borderColor: 'var(--wms-border, #C8B9A6)' }}>
            <Spinner animation="border" size="sm" />
          </InputGroup.Text>
        )}
      </InputGroup>

      {show && list.length > 0 && (
        <ListGroup
          className="position-absolute w-100 shadow mt-1 overflow-auto"
          style={{ zIndex: 1060, maxHeight: 240, border: '1px solid var(--wms-border, #C8B9A6)' }}
        >
          <ListGroup.Item className="small fw-bold py-1" style={{ backgroundColor: 'var(--wms-bg-subtle, #F3EDE4)', color: 'var(--wms-text-primary, #141210)', borderColor: 'var(--wms-border, #C8B9A6)' }}>
            {header}
          </ListGroup.Item>
          {list.map((sku) => (
            <ListGroup.Item
              key={getSkuId(sku)}
              action
              onClick={() => onPick(sku)}
              className="d-flex align-items-center justify-content-between gap-2 py-2"
              style={{ borderColor: 'var(--wms-border, #C8B9A6)' }}
            >
              <div className="d-flex align-items-center gap-2 text-truncate">
                <SkuThumb src={sku.thumbnailUrl} alt={sku.productName || sku.styleName} size={32} />
                <div className="text-truncate">
                  <div className="fw-semibold small text-truncate" style={{ color: 'var(--wms-text-primary, #141210)' }}>
                    {sku.productName || sku.styleName || sku.skuCode}
                  </div>
                  <div className="small text-truncate" style={{ color: 'var(--wms-secondary, #574F46)' }}>
                    {sku.skuCode} · {sku.color} · Size <strong>{sku.size}</strong>
                  </div>
                </div>
              </div>
              <div className="text-end flex-shrink-0">
                <div className="fw-bold small" style={{ color: 'var(--wms-text-primary, #141210)' }}>{formatVnd(sku.retailPrice)}</div>
                <StockBadge qty={getAvailQty(sku)} />
              </div>
            </ListGroup.Item>
          ))}
        </ListGroup>
      )}
    </div>
  );
};

/**
 * Danh sách SKU đã được thêm vào đơn.
 */
export const SelectedItemsList = ({ items, onQty, onRemove, maxHeight = 180 }) => (
  <ListGroup className="mb-3 overflow-auto" style={{ maxHeight, border: '1px solid var(--wms-border, #C8B9A6)', borderRadius: '6px' }}>
    {items.map((it) => (
      <ListGroup.Item key={it.skuId} className="d-flex align-items-center gap-2" style={{ backgroundColor: 'var(--wms-bg-subtle, #F3EDE4)', borderColor: 'var(--wms-border, #C8B9A6)' }}>
        <SkuThumb src={it.thumbnailUrl} alt={it.styleName} size={34} />
        <div className="flex-grow-1 text-truncate small">
          <div className="fw-semibold text-truncate" style={{ color: 'var(--wms-text-primary, #141210)' }}>{it.styleName || it.skuCode}</div>
          <div className="text-truncate" style={{ color: 'var(--wms-secondary, #574F46)' }}>
            {it.skuCode} · {it.color} · Size <strong>{it.size}</strong>
          </div>
          <div className="fw-bold" style={{ color: 'var(--wms-text-primary, #141210)' }}>{formatVnd(it.unitSalePrice)}</div>
        </div>
        <Stack direction="horizontal" gap={1} className="flex-shrink-0">
          <Button size="sm" className="btn-wms-default py-0 px-2" onClick={() => onQty(it.skuId, -1)}>
            <Icon name="dash" />
          </Button>
          <span className="fw-bold small px-1" style={{ color: 'var(--wms-text-primary, #141210)' }}>{it.orderedQty}</span>
          <Button size="sm" className="btn-wms-default py-0 px-2" onClick={() => onQty(it.skuId, 1)}>
            <Icon name="plus" />
          </Button>
          <Button size="sm" variant="link" className="p-1" style={{ color: 'var(--wms-error, #A62626)' }} title="Xóa sản phẩm" onClick={() => onRemove(it.skuId)}>
            <Icon name="trash" />
          </Button>
        </Stack>
      </ListGroup.Item>
    ))}
  </ListGroup>
);

/**
 * Danh sách SKU có sẵn trong kho kèm nút "+ Thêm".
 */
export const AvailableSkuList = ({ skus, loading, limit = 10, selectedItems = [], onAdd, maxHeight = 240 }) => {
  if (loading) {
    return (
      <div className="text-center py-3 text-secondary small">
        <Spinner animation="border" size="sm" className="me-1" /> Đang tải danh sách hàng có sẵn...
      </div>
    );
  }
  if (skus.length === 0) {
    return (
      <div className="text-center py-3 text-secondary small border rounded" style={{ backgroundColor: 'var(--wms-bg-subtle, #F3EDE4)', borderColor: 'var(--wms-border, #C8B9A6)' }}>
        Chưa có sản phẩm nào trong kho dữ liệu
      </div>
    );
  }
  return (
    <ListGroup className="overflow-auto" style={{ maxHeight, border: '1px solid var(--wms-border, #C8B9A6)', borderRadius: '6px' }}>
      {skus.slice(0, limit).map((sku) => {
        const isSelected = selectedItems.some((it) => it.skuId === getSkuId(sku));
        return (
          <ListGroup.Item
            key={getSkuId(sku)}
            className="d-flex align-items-center justify-content-between gap-2"
            style={{
              backgroundColor: isSelected ? 'var(--wms-primary-subtle, #EFE6DA)' : '#FFFFFF',
              borderColor: 'var(--wms-border, #C8B9A6)',
            }}
          >
            <div className="d-flex align-items-center gap-2 text-truncate small">
              <SkuThumb src={sku.thumbnailUrl} alt={sku.productName || sku.styleName} size={34} />
              <div className="text-truncate">
                <div className="fw-semibold text-truncate" title={sku.productName || sku.styleName} style={{ color: 'var(--wms-text-primary, #141210)' }}>
                  {sku.productName || sku.styleName || sku.skuCode}
                </div>
                <div className="text-truncate" style={{ color: 'var(--wms-secondary, #574F46)' }}>
                  {sku.skuCode} · {sku.color} · Size <strong>{sku.size}</strong>
                </div>
                <Stack direction="horizontal" gap={2}>
                  <span className="fw-bold" style={{ color: 'var(--wms-text-primary, #141210)' }}>{formatVnd(sku.retailPrice)}</span>
                  <StockBadge qty={getAvailQty(sku)} />
                </Stack>
              </div>
            </div>
            <Button
              size="sm"
              className={isSelected ? 'btn-wms-default flex-shrink-0 text-nowrap' : 'btn-wms-primary flex-shrink-0 text-nowrap'}
              onClick={() => onAdd(sku)}
            >
              <Icon name="plus-lg" /> Thêm
            </Button>
          </ListGroup.Item>
        );
      })}
    </ListGroup>
  );
};

/**
 * Khối tóm tắt thanh toán: tiền hàng, phí ship, giảm giá, tổng COD.
 */
export const PaymentSummary = ({
  subtotal, shippingFee, onShippingFeeChange, discountAmount, onDiscountChange, total,
  totalLabel = 'Tổng thanh toán (COD)',
}) => (
  <div className="small p-3 rounded" style={{ backgroundColor: 'var(--wms-bg-subtle, #F3EDE4)', border: '1px solid var(--wms-border, #C8B9A6)' }}>
    <div className="d-flex justify-content-between mb-2" style={{ color: 'var(--wms-secondary, #574F46)' }}>
      <span>Tiền hàng</span>
      <span className="fw-semibold" style={{ color: 'var(--wms-text-primary, #141210)' }}>{formatVnd(subtotal)}</span>
    </div>
    <div className="d-flex justify-content-between align-items-center mb-2" style={{ color: 'var(--wms-secondary, #574F46)' }}>
      <span>Phí vận chuyển</span>
      <Form.Control
        type="number" size="sm" className="text-end" style={{ width: 120, borderColor: 'var(--wms-border, #C8B9A6)' }}
        value={shippingFee} onChange={(e) => onShippingFeeChange(e.target.value)}
      />
    </div>
    <div className="d-flex justify-content-between align-items-center mb-2" style={{ color: 'var(--wms-secondary, #574F46)' }}>
      <span>Chiết khấu / Giảm giá</span>
      <Form.Control
        type="number" size="sm" className="text-end" style={{ width: 120, borderColor: 'var(--wms-border, #C8B9A6)' }}
        value={discountAmount} onChange={(e) => onDiscountChange(e.target.value)}
      />
    </div>
    <div className="d-flex justify-content-between pt-2 border-top fw-bold fs-6" style={{ borderColor: 'var(--wms-border, #C8B9A6)' }}>
      <span style={{ color: 'var(--wms-text-primary, #141210)' }}>{totalLabel}</span>
      <span style={{ color: 'var(--wms-text-primary, #141210)' }}>{formatVnd(total)}</span>
    </div>
  </div>
);
