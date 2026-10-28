/**
 * ============================================================================
 * @title        : Order Form Parts (Bootstrap / React-Bootstrap)
 * @author       : Nguyễn Quang Huy
 * @createdDate  : 2026-10-28
 * @lastModified : 2026-10-28
 * @description  : Các khối giao diện dùng chung cho QuickOrderModal và QuickOrderPanel:
 *                 form người nhận, ô tra cứu tồn kho realtime (UC-77) kèm dropdown gợi ý,
 *                 danh sách SKU đã chọn, danh sách SKU có sẵn trong kho và khối thanh toán.
 *                 Chỉ chứa phần trình bày; toàn bộ state/nghiệp vụ vẫn nằm ở component cha.
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
 * Form thông tin người nhận hàng.
 * @param {Object} props
 * @param {{name:string, phone:string, address:string}} props.recipient - Dữ liệu người nhận.
 * @param {Function} props.onChange - Callback nhận object recipient mới.
 */
export const RecipientFields = ({ recipient, onChange }) => (
  <>
    <Row className="g-2 mb-2">
      <Col xs={12} sm={6}>
        <Form.Control
          size="sm"
          placeholder="Họ và tên người nhận"
          value={recipient.name}
          onChange={(e) => onChange({ ...recipient, name: e.target.value })}
        />
      </Col>
      <Col xs={12} sm={6}>
        <Form.Control
          size="sm"
          placeholder="Số điện thoại *"
          value={recipient.phone}
          onChange={(e) => onChange({ ...recipient, phone: e.target.value })}
          required
        />
      </Col>
    </Row>
    <Form.Control
      size="sm"
      placeholder="Địa chỉ giao hàng (Số nhà, đường, phường, quận...)"
      value={recipient.address}
      onChange={(e) => onChange({ ...recipient, address: e.target.value })}
    />
  </>
);

/**
 * Ô tìm kiếm SKU kèm dropdown gợi ý (tồn kho realtime).
 * Tự đóng dropdown khi click ra ngoài vùng tìm kiếm.
 *
 * @param {Object} props
 * @param {string} props.query - Từ khóa hiện tại.
 * @param {Function} props.onQueryChange - Callback khi đổi từ khóa.
 * @param {boolean} props.searching - Đang gọi API tìm kiếm.
 * @param {boolean} props.show - Có hiển thị dropdown hay không.
 * @param {Function} props.onShowChange - Callback bật/tắt dropdown.
 * @param {Array<Object>} props.list - Danh sách SKU hiển thị trong dropdown.
 * @param {string} props.header - Tiêu đề nhóm trong dropdown.
 * @param {Function} props.onPick - Callback khi chọn một SKU.
 */
export const SkuSearchBox = ({ query, onQueryChange, searching, show, onShowChange, list, header, onPick }) => {
  const wrapRef = useRef(null);

  // Đóng dropdown khi click bên ngoài
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
        <InputGroup.Text className="bg-white"><Icon name="search" /></InputGroup.Text>
        <Form.Control
          placeholder="Tìm sản phẩm theo tên, mã SKU... (bấm để xem danh sách có sẵn)"
          value={query}
          onFocus={() => onShowChange(true)}
          onChange={(e) => onQueryChange(e.target.value)}
        />
        {searching && (
          <InputGroup.Text className="bg-white"><Spinner animation="border" size="sm" /></InputGroup.Text>
        )}
      </InputGroup>

      {show && list.length > 0 && (
        <ListGroup
          className="position-absolute w-100 shadow mt-1 overflow-auto"
          style={{ zIndex: 1060, maxHeight: 240 }}
        >
          <ListGroup.Item className="bg-body-tertiary small fw-bold text-secondary py-1">{header}</ListGroup.Item>
          {list.map((sku) => (
            <ListGroup.Item
              key={getSkuId(sku)}
              action
              onClick={() => onPick(sku)}
              className="d-flex align-items-center justify-content-between gap-2 py-2"
            >
              <div className="d-flex align-items-center gap-2 text-truncate">
                <SkuThumb src={sku.thumbnailUrl} alt={sku.productName || sku.styleName} size={32} />
                <div className="text-truncate">
                  <div className="fw-semibold small text-truncate">{sku.productName || sku.styleName || sku.skuCode}</div>
                  <div className="text-secondary small text-truncate">
                    {sku.skuCode} · {sku.color} · Size <strong>{sku.size}</strong>
                  </div>
                </div>
              </div>
              <div className="text-end flex-shrink-0">
                <div className="fw-bold small">{formatVnd(sku.retailPrice)}</div>
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
 * @param {Object} props
 * @param {Array<Object>} props.items - Các dòng sản phẩm của đơn.
 * @param {Function} props.onQty - Callback (skuId, delta) thay đổi số lượng.
 * @param {Function} props.onRemove - Callback (skuId) xóa sản phẩm.
 * @param {string|number} [props.maxHeight=180] - Chiều cao tối đa vùng cuộn.
 */
export const SelectedItemsList = ({ items, onQty, onRemove, maxHeight = 180 }) => (
  <ListGroup className="mb-3 overflow-auto" style={{ maxHeight }}>
    {items.map((it) => (
      <ListGroup.Item key={it.skuId} className="d-flex align-items-center gap-2 bg-body-tertiary">
        <SkuThumb src={it.thumbnailUrl} alt={it.styleName} size={34} />
        <div className="flex-grow-1 text-truncate small">
          <div className="fw-semibold text-truncate">{it.styleName || it.skuCode}</div>
          <div className="text-secondary text-truncate">
            {it.skuCode} · {it.color} · Size <strong>{it.size}</strong>
          </div>
          <div className="fw-bold text-warning-emphasis">{formatVnd(it.unitSalePrice)}</div>
        </div>
        <Stack direction="horizontal" gap={1} className="flex-shrink-0">
          <Button size="sm" variant="outline-secondary" className="py-0 px-2" onClick={() => onQty(it.skuId, -1)}>
            <Icon name="dash" />
          </Button>
          <span className="fw-bold small px-1">{it.orderedQty}</span>
          <Button size="sm" variant="outline-secondary" className="py-0 px-2" onClick={() => onQty(it.skuId, 1)}>
            <Icon name="plus" />
          </Button>
          <Button size="sm" variant="link" className="text-danger p-1" title="Xóa sản phẩm" onClick={() => onRemove(it.skuId)}>
            <Icon name="trash" />
          </Button>
        </Stack>
      </ListGroup.Item>
    ))}
  </ListGroup>
);

/**
 * Danh sách SKU có sẵn trong kho kèm nút "+ Thêm".
 * @param {Object} props
 * @param {Array<Object>} props.skus - Danh sách SKU có sẵn.
 * @param {boolean} props.loading - Đang tải danh sách.
 * @param {number} [props.limit=10] - Số SKU tối đa hiển thị.
 * @param {Array<Object>} [props.selectedItems=[]] - Các dòng đã chọn (để đánh dấu).
 * @param {Function} props.onAdd - Callback thêm SKU vào đơn.
 * @param {string|number} [props.maxHeight=240] - Chiều cao tối đa vùng cuộn.
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
      <div className="text-center py-3 text-secondary small border rounded bg-body-tertiary">
        Chưa có sản phẩm nào trong kho dữ liệu
      </div>
    );
  }
  return (
    <ListGroup className="overflow-auto" style={{ maxHeight }}>
      {skus.slice(0, limit).map((sku) => {
        const isSelected = selectedItems.some((it) => it.skuId === getSkuId(sku));
        return (
          <ListGroup.Item
            key={getSkuId(sku)}
            className={`d-flex align-items-center justify-content-between gap-2 ${isSelected ? 'border-warning' : ''}`}
          >
            <div className="d-flex align-items-center gap-2 text-truncate small">
              <SkuThumb src={sku.thumbnailUrl} alt={sku.productName || sku.styleName} size={34} />
              <div className="text-truncate">
                <div className="fw-semibold text-truncate" title={sku.productName || sku.styleName}>
                  {sku.productName || sku.styleName || sku.skuCode}
                </div>
                <div className="text-secondary text-truncate">
                  {sku.skuCode} · {sku.color} · Size <strong>{sku.size}</strong>
                </div>
                <Stack direction="horizontal" gap={2}>
                  <span className="fw-bold text-warning-emphasis">{formatVnd(sku.retailPrice)}</span>
                  <StockBadge qty={getAvailQty(sku)} />
                </Stack>
              </div>
            </div>
            <Button
              size="sm"
              variant={isSelected ? 'outline-secondary' : 'dark'}
              className="flex-shrink-0 text-nowrap"
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
 * @param {Object} props
 * @param {number} props.subtotal - Tổng tiền hàng.
 * @param {number|string} props.shippingFee - Phí vận chuyển.
 * @param {Function} props.onShippingFeeChange - Callback đổi phí vận chuyển.
 * @param {number|string} props.discountAmount - Giảm giá.
 * @param {Function} props.onDiscountChange - Callback đổi giảm giá.
 * @param {number} props.total - Tổng thanh toán.
 * @param {string} [props.totalLabel] - Nhãn dòng tổng.
 */
export const PaymentSummary = ({
  subtotal, shippingFee, onShippingFeeChange, discountAmount, onDiscountChange, total,
  totalLabel = 'Tổng thanh toán (COD)',
}) => (
  <div className="small">
    <div className="d-flex justify-content-between text-secondary mb-2">
      <span>Tiền hàng</span>
      <span className="fw-semibold text-body">{formatVnd(subtotal)}</span>
    </div>
    <div className="d-flex justify-content-between align-items-center text-secondary mb-2">
      <span>Phí vận chuyển</span>
      <Form.Control
        type="number" size="sm" className="text-end" style={{ width: 120 }}
        value={shippingFee} onChange={(e) => onShippingFeeChange(e.target.value)}
      />
    </div>
    <div className="d-flex justify-content-between align-items-center text-secondary mb-2">
      <span>Chiết khấu / Giảm giá</span>
      <Form.Control
        type="number" size="sm" className="text-end" style={{ width: 120 }}
        value={discountAmount} onChange={(e) => onDiscountChange(e.target.value)}
      />
    </div>
    <div className="d-flex justify-content-between pt-2 border-top fw-bold fs-6">
      <span>{totalLabel}</span>
      <span className="text-warning-emphasis">{formatVnd(total)}</span>
    </div>
  </div>
);
