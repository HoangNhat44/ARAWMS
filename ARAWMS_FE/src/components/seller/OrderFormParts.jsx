/**
 * ============================================================================
 * @title        : Order Form Parts (AraWMS Haute Logistics Design System)
 * @author       : AraStore Haute Logistics UI/UX Team
 * @description  : Các khối giao diện dùng chung cho QuickOrderModal và QuickOrderPanel,
 *                 tuân thủ nghiêm ngặt bảng thiết kế AraWMS Haute Logistics.
 *                 - Form fields: 40-44px height, 8px radius, crisp #E5E7EB borders
 *                 - Product rows: Sku thumbnail, size, color, green stock count, pill stepper
 *                 - Payment summary: High-contrast tabular numbers, editorial total COD
 * @module       : Order Fulfillment / Direct Order Management
 * @layer        : Front-end
 * ============================================================================
 */

import React, { useEffect, useRef, useState } from 'react';
import { Form, InputGroup, ListGroup, Button, Spinner, Row, Col, Stack, Modal } from 'react-bootstrap';
import { Icon, SkuThumb, StockBadge, formatVnd } from './SellerUi';

/** Lấy số lượng khả dụng của SKU từ các tên trường khác nhau của API. */
export const getAvailQty = (sku) => sku.availableQty ?? sku.availableStock ?? 0;

/** Lấy ID của SKU từ các tên trường khác nhau của API. */
export const getSkuId = (sku) => sku.skuId || sku._id;

/**
 * Lọc danh sách SKU theo trạng thái tồn kho khả dụng (`ALL` | `IN_STOCK` | `OUT_OF_STOCK`).
 * [BR: GBR-10] Dựa trên tồn khả dụng thực tế `availableQty = Math.max(0, onHandQty - reservedQty)`.
 * @param {Array<Object>} skus - Danh sách SKU gốc.
 * @param {'ALL'|'IN_STOCK'|'OUT_OF_STOCK'} stockFilter - Bộ lọc trạng thái tồn.
 * @returns {Array<Object>} Danh sách SKU đã lọc.
 */
export const filterSkusByStock = (skus = [], stockFilter = 'ALL') => {
  if (stockFilter === 'IN_STOCK') {
    return skus.filter((sku) => getAvailQty(sku) > 0);
  }
  if (stockFilter === 'OUT_OF_STOCK') {
    return skus.filter((sku) => getAvailQty(sku) <= 0);
  }
  return skus;
};

/**
 * Lấy danh sách URL ảnh duy nhất của sản phẩm (ảnh đại diện + ảnh phụ nếu có).
 * @param {Object|null} sku
 * @returns {string[]}
 */
export const getSkuImageList = (sku) => {
  if (!sku) return [];
  const raw = [sku.thumbnailUrl, ...(Array.isArray(sku.additionalImageUrls) ? sku.additionalImageUrls : [])]
    .filter((url) => typeof url === 'string' && url.trim().length > 0);
  return [...new Set(raw)];
};

/**
 * Thanh nút lọc tồn kho cho Seller: Tất cả / Còn hàng / Hết hàng.
 */
export const StockFilterBar = ({ value = 'ALL', onChange, totalCount = 0, inStockCount = 0, outOfStockCount = 0 }) => {
  const options = [
    {
      key: 'ALL',
      label: 'Tất cả',
      count: totalCount,
      icon: 'grid',
      activeStyle: { backgroundColor: 'var(--wms-accent, #8A6A46)', color: '#FFFFFF', borderColor: 'var(--wms-accent, #8A6A46)' },
    },
    {
      key: 'IN_STOCK',
      label: 'Còn hàng',
      count: inStockCount,
      icon: 'check-circle',
      activeStyle: { backgroundColor: '#006C4A', color: '#FFFFFF', borderColor: '#006C4A' },
    },
    {
      key: 'OUT_OF_STOCK',
      label: 'Hết hàng',
      count: outOfStockCount,
      icon: 'x-circle',
      activeStyle: { backgroundColor: '#514536', color: '#FFFFFF', borderColor: '#514536' },
    },
  ];

  return (
    <div className="d-flex flex-wrap align-items-center gap-1.5 mb-2" role="group" aria-label="Lọc sản phẩm theo trạng thái tồn kho">
      {options.map((opt) => {
        const isActive = value === opt.key;
        return (
          <button
            key={opt.key}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(opt.key)}
            className="btn btn-sm rounded-pill d-inline-flex align-items-center gap-1 fw-semibold px-2.5 py-1"
            style={{
              fontSize: '11.5px',
              lineHeight: 1.2,
              transition: 'all 0.15s ease',
              ...(isActive
                ? opt.activeStyle
                : {
                    backgroundColor: '#FFFFFF',
                    color: 'var(--wms-text-secondary, #514536)',
                    borderColor: 'var(--wms-border, #C8B9A6)',
                  }),
            }}
          >
            <Icon name={opt.icon} />
            <span>{opt.label}</span>
            <span
              className="rounded-pill px-1.5 tabular-nums"
              style={{
                fontSize: '10.5px',
                backgroundColor: isActive ? 'rgba(255, 255, 255, 0.22)' : 'var(--wms-bg-subtle, #F3EDE4)',
                color: isActive ? '#FFFFFF' : 'var(--wms-text-primary, #141210)',
              }}
            >
              {opt.count}
            </span>
          </button>
        );
      })}
    </div>
  );
};

/**
 * Modal phóng to xem ảnh chi tiết sản phẩm khi Seller bấm vào ảnh thu nhỏ.
 */
export const ProductImagePreviewModal = ({ sku, onHide, onAdd }) => {
  const images = getSkuImageList(sku);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setActiveIndex(0);
  }, [sku?.skuId, sku?._id, sku?.thumbnailUrl]);

  const currentSrc = images[activeIndex] || images[0] || '';
  const productTitle = sku?.productName || sku?.styleName || sku?.skuCode || 'Ảnh sản phẩm';
  const availQty = sku ? getAvailQty(sku) : 0;
  const price = sku?.retailPrice ?? sku?.unitSalePrice ?? 0;

  return (
    <Modal show={Boolean(sku && currentSrc)} onHide={onHide} centered size="md">
      <Modal.Header closeButton className="py-2.5 px-3" style={{ borderColor: 'var(--wms-border, #C8B9A6)' }}>
        <Modal.Title as="h6" className="fw-bold text-truncate mb-0 pe-2" style={{ color: 'var(--wms-text-primary, #141210)', fontSize: '0.95rem' }}>
          {productTitle}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body className="p-3" style={{ backgroundColor: '#FAF7F2' }}>
        <div
          className="position-relative d-flex align-items-center justify-content-center rounded-3 overflow-hidden bg-white mb-3"
          style={{ minHeight: 280, maxHeight: '60vh', border: '1px solid var(--wms-border, #C8B9A6)' }}
        >
          {currentSrc && (
            <img
              src={currentSrc}
              alt={productTitle}
              className="img-fluid"
              style={{ maxHeight: '60vh', width: '100%', objectFit: 'contain' }}
            />
          )}
          {images.length > 1 && (
            <>
              <button
                type="button"
                aria-label="Ảnh trước"
                className="btn btn-sm btn-light rounded-circle shadow position-absolute top-50 start-0 translate-middle-y ms-2 d-flex align-items-center justify-content-center"
                style={{ width: 32, height: 32 }}
                onClick={() => setActiveIndex((prev) => (prev - 1 + images.length) % images.length)}
              >
                <Icon name="chevron-left" />
              </button>
              <button
                type="button"
                aria-label="Ảnh tiếp theo"
                className="btn btn-sm btn-light rounded-circle shadow position-absolute top-50 end-0 translate-middle-y me-2 d-flex align-items-center justify-content-center"
                style={{ width: 32, height: 32 }}
                onClick={() => setActiveIndex((prev) => (prev + 1) % images.length)}
              >
                <Icon name="chevron-right" />
              </button>
            </>
          )}
        </div>

        {images.length > 1 && (
          <div className="d-flex align-items-center justify-content-center gap-2 mb-3 flex-wrap">
            {images.map((imgUrl, idx) => (
              <button
                key={imgUrl}
                type="button"
                onClick={() => setActiveIndex(idx)}
                aria-label={`Xem ảnh ${idx + 1}`}
                className="p-0 bg-white rounded overflow-hidden"
                style={{
                  width: 48,
                  height: 48,
                  border: idx === activeIndex ? '2px solid var(--wms-accent, #8A6A46)' : '1px solid var(--wms-border, #C8B9A6)',
                }}
              >
                <img src={imgUrl} alt={`${productTitle} ${idx + 1}`} className="w-100 h-100 object-fit-cover d-block" />
              </button>
            ))}
          </div>
        )}

        {sku && (
          <div className="bg-white rounded-3 p-2.5 d-flex align-items-center justify-content-between gap-2 flex-wrap" style={{ border: '1px solid var(--wms-border, #C8B9A6)' }}>
            <div className="small">
              <div className="fw-semibold" style={{ color: 'var(--wms-text-secondary, #574F46)', fontSize: '12px' }}>
                {sku.skuCode}
                {sku.color ? ` · ${sku.color}` : ''}
                {sku.size ? ` · Size ${sku.size}` : ''}
              </div>
              <div className="fw-bold tabular-nums mt-0.5" style={{ color: 'var(--wms-accent, #8A6A46)', fontSize: '0.95rem' }}>
                {formatVnd(price)}
              </div>
            </div>
            <StockBadge qty={availQty} />
          </div>
        )}
      </Modal.Body>
      <Modal.Footer className="py-2 px-3 d-flex justify-content-between" style={{ borderColor: 'var(--wms-border, #C8B9A6)' }}>
        <Button as="a" href={currentSrc} target="_blank" rel="noreferrer" size="sm" className="btn-wms-default">
          <Icon name="box-arrow-up-right" className="me-1" /> Mở ảnh gốc
        </Button>
        <div className="d-flex gap-2">
          {typeof onAdd === 'function' && sku && (
            <Button
              size="sm"
              className="btn-wms-accent"
              onClick={() => onAdd(sku)}
            >
              <Icon name="plus-lg" className="me-1" /> Thêm vào đơn
            </Button>
          )}
          <Button size="sm" className="btn-wms-default" onClick={onHide}>
            Đóng
          </Button>
        </div>
      </Modal.Footer>
    </Modal>
  );
};

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
 * @param {{name:string, phone:string, address:string, notes:string}} props.recipient - Dữ liệu người nhận.
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
            <Form.Label className="small fw-semibold mb-1" style={{ fontSize: '12px', color: 'var(--wms-text-primary, #1C1B1B)' }}>
              Họ và tên <span style={{ color: 'var(--wms-error, #BA1A1A)' }}>*</span>
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
              Số điện thoại <span style={{ color: 'var(--wms-error, #BA1A1A)' }}>*</span>
            </Form.Label>
            <Form.Control
              size="sm"
              placeholder="09xx xxx xxx"
              className="tabular-nums"
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
          Địa chỉ giao hàng chi tiết <span style={{ color: 'var(--wms-error, #BA1A1A)' }}>*</span>
        </Form.Label>
        <Form.Control
          size="sm"
          placeholder="Số nhà, tên đường, phường/xã, quận/huyện..."
          style={{ borderColor: 'var(--wms-border, #C8B9A6)' }}
          value={recipient.address || ''}
          onChange={(e) => onChange({ ...recipient, address: e.target.value })}
        />
      </Form.Group>
      <Form.Group controlId="order-recipient-notes">
        <Form.Label className="small fw-semibold mb-1" style={{ fontSize: '12px', color: 'var(--wms-text-primary, #141210)' }}>
          Ghi chú giao hàng
        </Form.Label>
        <Form.Control
          size="sm"
          placeholder="Giao giờ hành chính, gọi trước 15p..."
          style={{ borderColor: 'var(--wms-border, #C8B9A6)' }}
          value={recipient.notes || ''}
          onChange={(e) => onChange({ ...recipient, notes: e.target.value })}
        />
      </Form.Group>
    </div>
  );
};

/**
 * Ô tìm kiếm SKU kèm dropdown gợi ý (tồn kho realtime).
 */
export const SkuSearchBox = ({ query, onQueryChange, searching, show, onShowChange, list, header, onPick, onPreviewImage }) => {
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
      <InputGroup size="sm" className="ara-search-capsule">
        <InputGroup.Text style={{ backgroundColor: '#FFFFFF', borderColor: 'var(--wms-border, #C8B9A6)', color: 'var(--wms-secondary, #574F46)' }}>
          <Icon name="search" />
        </InputGroup.Text>
        <Form.Control
          placeholder="Tìm SP theo tên, SKU barcode..."
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
          className="position-absolute w-100 shadow-lg mt-1 overflow-auto rounded-3"
          style={{ zIndex: 1060, maxHeight: 240, border: '1px solid var(--wms-border, #C8B9A6)', backgroundColor: '#FFFFFF' }}
        >
          <ListGroup.Item className="small fw-bold py-1.5" style={{ backgroundColor: 'var(--wms-bg-subtle, #F3EDE4)', color: 'var(--wms-text-primary, #141210)', borderColor: 'var(--wms-border, #C8B9A6)' }}>
            {header}
          </ListGroup.Item>
          {list.map((sku) => (
            <ListGroup.Item
              key={getSkuId(sku)}
              as="div"
              className="d-flex align-items-center gap-2 py-2 px-3 bg-white"
              style={{ borderColor: 'var(--wms-border, #C8B9A6)' }}
            >
              <SkuThumb
                src={sku.thumbnailUrl}
                alt={sku.productName || sku.styleName}
                size={34}
                onClick={onPreviewImage && sku.thumbnailUrl ? () => onPreviewImage(sku) : undefined}
              />
              <button
                type="button"
                onClick={() => onPick(sku)}
                className="d-flex align-items-center justify-content-between gap-2 flex-grow-1 text-start border-0 bg-transparent p-0 text-truncate"
                style={{ cursor: 'pointer' }}
              >
                <div className="text-truncate">
                  <div className="fw-semibold small text-truncate" style={{ color: 'var(--wms-text-primary, #141210)' }}>
                    {sku.productName || sku.styleName || sku.skuCode}
                  </div>
                  <div className="small text-truncate" style={{ color: 'var(--wms-secondary, #574F46)', fontSize: '11px' }}>
                    {sku.skuCode} · {sku.color} · Size <strong>{sku.size}</strong>
                  </div>
                </div>
                <div className="text-end flex-shrink-0">
                  <div className="fw-bold small tabular-nums" style={{ color: 'var(--wms-accent, #8A6A46)' }}>{formatVnd(sku.retailPrice)}</div>
                  <StockBadge qty={getAvailQty(sku)} />
                </div>
              </button>
            </ListGroup.Item>
          ))}
        </ListGroup>
      )}
    </div>
  );
};

/**
 * Danh sách SKU đã được thêm vào đơn (Khớp hình ảnh tham khảo).
 */
export const SelectedItemsList = ({ items, onQty, onRemove, maxHeight = 240, onPreviewImage }) => (
  <ListGroup className="mb-3 overflow-auto" style={{ maxHeight, border: '1px solid var(--wms-border, #C8B9A6)', borderRadius: '8px' }}>
    {items.map((it) => (
      <ListGroup.Item key={it.skuId} className="d-flex align-items-center gap-2.5 py-2.5 px-3 bg-white" style={{ borderColor: 'var(--wms-border, #C8B9A6)' }}>
        <SkuThumb
          src={it.thumbnailUrl}
          alt={it.styleName}
          size={42}
          onClick={onPreviewImage && it.thumbnailUrl ? () => onPreviewImage(it) : undefined}
        />
        <div className="flex-grow-1 text-truncate small">
          <div className="fw-bold text-truncate" style={{ color: 'var(--wms-text-primary, #141210)', fontSize: '0.84rem' }}>
            {it.styleName || it.productName || it.skuCode}
          </div>
          <div className="text-truncate" style={{ color: 'var(--wms-secondary, #574F46)', fontSize: '0.78rem' }}>
            {it.skuCode} · Size <strong>{it.size}</strong> · {it.color}
          </div>
          <div className="d-flex align-items-center gap-2 mt-0.5">
            <span className="fw-bold tabular-nums" style={{ color: 'var(--wms-text-primary, #141210)' }}>{formatVnd(it.unitSalePrice)}</span>
            {it.availableQty !== undefined && (
              <span className="small fw-semibold" style={{ fontSize: '11px', color: 'var(--wms-success, #1E6B47)' }}>
                · Còn {it.availableQty}
              </span>
            )}
          </div>
        </div>
        <Stack direction="horizontal" gap={1} className="flex-shrink-0 align-items-center">
          <Button size="sm" className="btn-wms-default py-0 px-2 rounded-circle" style={{ width: 26, height: 26 }} onClick={() => onQty(it.skuId, -1)}>
            <Icon name="dash" />
          </Button>
          <span className="fw-bold small px-1.5 tabular-nums" style={{ color: 'var(--wms-text-primary, #141210)', minWidth: 20, textAlign: 'center' }}>
            {it.orderedQty}
          </span>
          <Button size="sm" className="btn-wms-default py-0 px-2 rounded-circle" style={{ width: 26, height: 26 }} onClick={() => onQty(it.skuId, 1)}>
            <Icon name="plus" />
          </Button>
          <Button size="sm" variant="link" className="p-1 ms-1 text-danger" title="Xóa sản phẩm" onClick={() => onRemove(it.skuId)}>
            <Icon name="trash" />
          </Button>
        </Stack>
      </ListGroup.Item>
    ))}
  </ListGroup>
);

/**
 * Danh sách SKU trong kho kèm nút "+ Thêm" và xem ảnh phóng to khi bấm vào thumbnail.
 */
export const AvailableSkuList = ({
  skus,
  loading,
  limit = null,
  selectedItems = [],
  onAdd,
  onPreviewImage,
  maxHeight = 240,
  emptyText = 'Chưa có sản phẩm nào trong kho dữ liệu',
}) => {
  if (loading) {
    return (
      <div className="text-center py-3 text-secondary small">
        <Spinner animation="border" size="sm" className="me-1" /> Đang tải danh sách hàng có sẵn...
      </div>
    );
  }
  if (skus.length === 0) {
    return (
      <div className="text-center py-3 text-secondary small border rounded-3 bg-white" style={{ borderColor: 'var(--wms-border, #C8B9A6)' }}>
        {emptyText}
      </div>
    );
  }
  const visibleSkus = typeof limit === 'number' ? skus.slice(0, limit) : skus;
  return (
    <ListGroup className="overflow-auto" style={{ maxHeight, border: '1px solid var(--wms-border, #C8B9A6)', borderRadius: '8px' }}>
      {visibleSkus.map((sku) => {
        const isSelected = selectedItems.some((it) => it.skuId === getSkuId(sku));
        return (
          <ListGroup.Item
            key={getSkuId(sku)}
            className="d-flex align-items-center justify-content-between gap-2 py-2 px-3"
            style={{
              backgroundColor: isSelected ? '#FFFBEB' : '#FFFFFF',
              borderColor: 'var(--wms-border, #C8B9A6)',
            }}
          >
            <div className="d-flex align-items-center gap-2 text-truncate small">
              <SkuThumb
                src={sku.thumbnailUrl}
                alt={sku.productName || sku.styleName}
                size={36}
                onClick={onPreviewImage && sku.thumbnailUrl ? () => onPreviewImage(sku) : undefined}
              />
              <div className="text-truncate">
                <div className="fw-semibold text-truncate" title={sku.productName || sku.styleName} style={{ color: 'var(--wms-text-primary, #141210)' }}>
                  {sku.productName || sku.styleName || sku.skuCode}
                </div>
                <div className="text-truncate" style={{ color: 'var(--wms-secondary, #574F46)', fontSize: '11px' }}>
                  {sku.skuCode} · {sku.color} · Size <strong>{sku.size}</strong>
                </div>
                <Stack direction="horizontal" gap={2}>
                  <span className="fw-bold tabular-nums" style={{ color: 'var(--wms-accent, #8A6A46)' }}>{formatVnd(sku.retailPrice)}</span>
                  <StockBadge qty={getAvailQty(sku)} />
                </Stack>
              </div>
            </div>
            <Button
              size="sm"
              className={isSelected ? 'btn-wms-default flex-shrink-0 text-nowrap rounded px-2.5' : 'btn-wms-accent flex-shrink-0 text-nowrap rounded px-2.5'}
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
 * Khối tóm tắt thanh toán chuẩn AraWMS Haute Logistics (Khớp hình ảnh tham khảo).
 */
export const PaymentSummary = ({
  subtotal, shippingFee, onShippingFeeChange, discountAmount, onDiscountChange, total,
  totalLabel = 'Tổng COD', itemCount = 0,
}) => (
  <div className="small p-3 rounded-3 bg-white" style={{ border: '1px solid var(--wms-border, #C8B9A6)' }}>
    <div className="d-flex justify-content-between mb-2" style={{ color: 'var(--wms-secondary, #574F46)' }}>
      <span>Tiền hàng {itemCount > 0 ? `(${itemCount} SP)` : ''}</span>
      <span className="fw-semibold tabular-nums" style={{ color: 'var(--wms-text-primary, #141210)' }}>{formatVnd(subtotal)}</span>
    </div>
    <div className="d-flex justify-content-between align-items-center mb-2" style={{ color: 'var(--wms-secondary, #574F46)' }}>
      <div className="d-flex align-items-center gap-1">
        <span>Phí GHN</span>
        {shippingFee === 0 && (
          <span className="badge rounded-pill" style={{ backgroundColor: '#ECFDF5', color: '#006C4A', border: '1px solid #A7F3D0', fontSize: '10px' }}>
            Miễn phí
          </span>
        )}
      </div>
      <Form.Control
        type="number" size="sm" className="text-end tabular-nums" style={{ width: 110, borderColor: 'var(--wms-border, #C8B9A6)', borderRadius: '6px' }}
        value={shippingFee} onChange={(e) => onShippingFeeChange(e.target.value)}
      />
    </div>
    <div className="d-flex justify-content-between align-items-center mb-2" style={{ color: 'var(--wms-secondary, #574F46)' }}>
      <span>Chiết khấu / Giảm giá</span>
      <Form.Control
        type="number" size="sm" className="text-end tabular-nums" style={{ width: 110, borderColor: 'var(--wms-border, #C8B9A6)', borderRadius: '6px' }}
        value={discountAmount} onChange={(e) => onDiscountChange(e.target.value)}
      />
    </div>
    <div className="d-flex justify-content-between align-items-center pt-2.5 border-top" style={{ borderColor: 'var(--wms-border, #C8B9A6)' }}>
      <span className="fw-bold fs-6" style={{ color: 'var(--wms-text-primary, #141210)' }}>{totalLabel}:</span>
      <span className="fw-bold fs-5 tabular-nums" style={{ color: 'var(--wms-accent, #8A6A46)' }}>
        {formatVnd(total)}
      </span>
    </div>
  </div>
);
