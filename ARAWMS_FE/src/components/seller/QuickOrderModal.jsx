/**
 * ============================================================================
 * @title        : Quick Order Modal Component (UC-78 & UC-79)
 * @author       : Nguyễn Quang Huy
 * @createdDate  : 2026-10-27
 * @lastModified : 2026-10-28
 * @description  : Modal tạo đơn hàng bán lẻ nhanh hiển thị nổi bật trên màn hình
 *                 khi Seller bấm nút "Tạo đơn nhanh" tại khung chat.
 *                 Tự động tải danh sách sản phẩm có sẵn trong kho, hỗ trợ tìm kiếm tồn kho
 *                 khả dụng thời gian thực (UC-77), điền thông tin người nhận và kích hoạt
 *                 giữ chỗ kho (+Reserved) nguyên tử (UC-79, [BR: GBR-10]).
 *                 (Refactor 2026-10-28: giao diện chỉ dùng Bootstrap / React-Bootstrap.)
 * @module       : Order Fulfillment / Direct Order Management
 * @layer        : Front-end
 * ============================================================================
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Modal, Card, Alert, Button, Badge, Spinner, ButtonGroup, ToggleButton } from 'react-bootstrap';
import { sellerService } from '../../services/sellerService';
import { Icon } from './SellerUi';
import {
  RecipientFields, SkuSearchBox, SelectedItemsList, AvailableSkuList, PaymentSummary,
  getAvailQty, getSkuId, isValidVnPhone,
} from './OrderFormParts';

/**
 * Component Modal Tạo Đơn Hàng Nhanh cho Seller.
 *
 * @component
 * @param {Object} props - Thuộc tính truyền vào.
 * @param {boolean} props.isOpen - Trạng thái hiển thị modal.
 * @param {Function} props.onClose - Hàm đóng modal.
 * @param {Object} [props.customer] - Thông tin khách hàng hiện tại.
 * @param {string} [props.conversationId] - ID phiên chat hiện tại.
 * @param {Array<Object>} [props.initialItems] - Danh sách sản phẩm khởi tạo nếu có.
 * @param {Function} [props.onOrderCreated] - Callback kích hoạt sau khi tạo đơn thành công.
 * @returns {JSX.Element} Modal tạo đơn nhanh hoàn chỉnh.
 */
const EMPTY_ITEMS = [];

const QuickOrderModal = ({
  isOpen,
  onClose,
  customer,
  conversationId,
  initialItems = EMPTY_ITEMS,
  onOrderCreated,
}) => {
  const [orderChannel, setOrderChannel] = useState('ONLINE'); // 'ONLINE' | 'POS'
  const [recipient, setRecipient] = useState({ name: '', phone: '', address: '' });
  const [items, setItems] = useState([]);
  const [shippingFee, setShippingFee] = useState(30000);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successOrder, setSuccessOrder] = useState(null);

  // Tra cứu & gợi ý sản phẩm
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [availableSkus, setAvailableSkus] = useState([]);
  const [loadingSkus, setLoadingSkus] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  const debounceRef = useRef(null);
  const lastFetchRef = useRef(0);
  const cachedSkusRef = useRef([]);
  const customerId = customer?._id || customer?.id;

  // 1. Tải danh sách sản phẩm có sẵn trong kho khi mở Modal (cache 30s tránh spam network)
  const fetchAvailableProducts = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && cachedSkusRef.current.length > 0 && now - lastFetchRef.current < 30000) {
      setAvailableSkus(cachedSkusRef.current);
      return;
    }
    try {
      setLoadingSkus(true);
      const res = await sellerService.lookupRealtimeStock('');
      if (res.success) {
        const items = Array.isArray(res.data) ? res.data : (res.data?.items || []);
        cachedSkusRef.current = items;
        lastFetchRef.current = Date.now();
        setAvailableSkus(items);
      }
    } catch {
      if (cachedSkusRef.current.length === 0) setAvailableSkus([]);
    } finally {
      setLoadingSkus(false);
    }
  }, []);

  // 2. Tự động đồng bộ thông tin khách hàng và reset lỗi khi mở Modal
  useEffect(() => {
    if (isOpen) {
      if (customer) {
        setRecipient({
          name: customer.fullName || '',
          phone: customer.phone || '',
          address: customer.addresses?.[0]?.fullAddress || '',
        });
      }
      setSuccessOrder(null);
      setError('');
      fetchAvailableProducts();
    }
  }, [isOpen, customerId, fetchAvailableProducts]);

  // 3. Đồng bộ initialItems nếu có sản phẩm chỉ định trước
  useEffect(() => {
    if (isOpen && initialItems && initialItems.length > 0) {
      setItems(
        initialItems.map((sku) => ({
          skuId: sku.skuId || sku._id,
          skuCode: sku.skuCode,
          styleName: sku.productName || sku.styleName,
          size: sku.size,
          color: sku.color,
          thumbnailUrl: sku.thumbnailUrl || '',
          availableStock: sku.availableQty ?? sku.availableStock ?? 0,
          orderedQty: sku.orderedQty || 1,
          unitSalePrice: sku.retailPrice || sku.unitSalePrice || 0,
        }))
      );
    }
  }, [isOpen, initialItems?.length]);

  /**
   * Tìm kiếm sản phẩm tồn kho realtime theo debounce 300ms (UC-77)
   */
  const handleSearch = useCallback((q) => {
    setSearchQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) {
      setSearchResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        setSearching(true);
        const res = await sellerService.lookupRealtimeStock(q.trim());
        if (res.success) {
          const items = Array.isArray(res.data) ? res.data : (res.data?.items || []);
          setSearchResults(items);
          setShowDropdown(true);
        }
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  }, []);

  /**
   * Thêm sản phẩm vào danh sách đơn hàng
   */
  const addItem = (sku) => {
    const existing = items.find((it) => it.skuId === getSkuId(sku));
    if (existing) {
      setItems(items.map((it) =>
        it.skuId === existing.skuId ? { ...it, orderedQty: it.orderedQty + 1 } : it
      ));
    } else {
      setItems([...items, {
        skuId: getSkuId(sku),
        skuCode: sku.skuCode,
        styleName: sku.productName || sku.styleName,
        size: sku.size,
        color: sku.color,
        thumbnailUrl: sku.thumbnailUrl || '',
        availableStock: getAvailQty(sku),
        orderedQty: 1,
        unitSalePrice: sku.retailPrice || 0,
      }]);
    }
    setSearchQuery('');
    setShowDropdown(false);
  };

  const updateQuantity = (skuId, delta) => {
    setItems(items.map((it) =>
      it.skuId === skuId ? { ...it, orderedQty: Math.max(1, it.orderedQty + delta) } : it
    ));
  };

  const removeItem = (skuId) => {
    setItems(items.filter((it) => it.skuId !== skuId));
  };

  const itemsSubtotal = items.reduce((sum, it) => sum + (it.orderedQty || 1) * (it.unitSalePrice || 0), 0);
  const totalAmount = Math.max(0, itemsSubtotal + Number(shippingFee || 0) - Number(discountAmount || 0));

  /**
   * Tạo đơn hàng bán lẻ mới: Hỗ trợ Online (UC-78, UC-79) hoặc POS bán tại quầy lấy ngay
   * @param {boolean} sendConfirmationReceipt - Nếu true, tự động gửi Phiếu xác nhận đơn hàng vào chat cho khách
   */
  const handleCreateOrder = async (sendConfirmationReceipt = true) => {
    const customerId = customer?._id || customer?.id;

    if (items.length === 0) {
      setError('Vui lòng chọn ít nhất một sản phẩm ở mục "Chọn sản phẩm" trước khi tạo đơn.');
      return;
    }

    if (orderChannel === 'ONLINE') {
      if (!recipient.name || !recipient.name.trim()) {
        setError('Vui lòng nhập Họ và tên người nhận ở mục "Thông tin người nhận hàng".');
        return;
      }
      if (!recipient.phone || !recipient.phone.trim()) {
        setError('Vui lòng nhập Số điện thoại người nhận ở mục "Thông tin người nhận hàng".');
        return;
      }
      if (!isValidVnPhone(recipient.phone)) {
        setError('Số điện thoại không đúng định dạng. Vui lòng nhập đúng 10 chữ số (đầu số 03, 05, 07, 08, 09) ở mục "Số điện thoại".');
        return;
      }
      if (!recipient.address || !recipient.address.trim()) {
        setError('Vui lòng nhập Địa chỉ giao hàng chi tiết ở mục "Thông tin người nhận hàng".');
        return;
      }
    }

    try {
      setLoading(true);
      setError('');

      const cleanPhone = String(recipient.phone || '').replace(/\D/g, '');

      const orderPayload = {
        customerId,
        conversationId: orderChannel === 'ONLINE' ? conversationId : undefined,
        orderType: orderChannel === 'POS' ? 'POS_DIRECT' : 'ONLINE',
        channel: orderChannel === 'POS' ? 'POS' : 'FACEBOOK_MESSENGER',
        shippingRecipient: {
          name: recipient.name || (orderChannel === 'POS' ? 'Khách tại quầy AraStore' : 'Khách vãng lai'),
          phone: cleanPhone || (orderChannel === 'POS' ? '0900000000' : ''),
          address: recipient.address || (orderChannel === 'POS' ? 'Nhận trực tiếp tại quầy' : ''),
        },
        items: items.map((it) => ({
          skuId: it.skuId,
          orderedQty: it.orderedQty,
          unitSalePrice: it.unitSalePrice,
        })),
        financialSummary: {
          shippingFee: orderChannel === 'POS' ? 0 : Number(shippingFee),
          discountAmount: Number(discountAmount),
        },
      };

      let res;
      if (orderChannel === 'POS') {
        // Đơn bán tại quầy POS: Trừ tồn onHandQty trực tiếp, hoàn thành ngay lập tức
        res = await sellerService.createPosDirectOrder(orderPayload);
      } else {
        // Tạo đơn PENDING (UC-78)
        res = await sellerService.createDirectOrder(orderPayload);
      }

      if (res.success) {
        const createdOrder = res.data;

        // Nếu là đơn Online và chọn gửi phiếu: Tự động gửi Phiếu xác nhận đơn hàng vào chat
        // (Đơn vẫn giữ trạng thái PENDING chờ khách phản hồi, KHÔNG chốt sớm!)
        if (orderChannel === 'ONLINE' && sendConfirmationReceipt) {
          const orderId = createdOrder?._id || createdOrder?.id;
          if (orderId) {
            try {
              await sellerService.sendOrderConfirmationReceipt(orderId);
            } catch (notifyErr) {
              console.warn('⚠️ Không thể gửi tự động phiếu xác nhận đơn:', notifyErr.message);
            }
          }
        }

        // Xóa cache để lần mở tiếp theo lấy tồn kho mới nhất
        cachedSkusRef.current = [];
        setSuccessOrder(createdOrder);
        if (onOrderCreated) onOrderCreated(createdOrder);
      }
    } catch (err) {
      setError(err.message || 'Lỗi khi tạo đơn hàng');
    } finally {
      setLoading(false);
    }
  };

  const dropdownList = searchQuery.trim() ? searchResults : availableSkus;

  return (
    <Modal show={isOpen} onHide={onClose} centered size="lg" fullscreen="md-down" backdrop="static" scrollable>
      {/* Header */}
      <Modal.Header closeButton style={{ backgroundColor: 'var(--wms-bg-subtle, #F3EDE4)', borderColor: 'var(--wms-border, #C8B9A6)' }}>
        <Modal.Title as="h5" className="d-flex align-items-center gap-2" style={{ color: 'var(--wms-text-primary, #141210)' }}>
          <Icon name="bag-plus" style={{ color: 'var(--wms-accent, #8A6A46)' }} />
          Tạo Đơn Hàng Nhanh
        </Modal.Title>
      </Modal.Header>

      {/* Body */}
      <Modal.Body style={{ backgroundColor: 'var(--wms-bg-app, #E8DFD3)' }}>
        {error && <Alert variant="danger" className="py-2 small">{error}</Alert>}

        {successOrder ? (
          <div className="text-center py-4 bg-white rounded p-4" style={{ border: '1px solid var(--wms-border, #C8B9A6)' }}>
            <Icon name="check-circle-fill" className="display-4 d-block mb-3" style={{ color: 'var(--wms-success, #1E6B47)' }} />
            <h4 className="fw-bold" style={{ color: 'var(--wms-text-primary, #141210)' }}>Tạo Đơn Hàng Thành Công!</h4>
            <p className="small mb-2" style={{ color: 'var(--wms-secondary, #574F46)' }}>
              Mã đơn hàng: <strong className="font-monospace fs-6" style={{ color: 'var(--wms-text-primary, #141210)' }}>{successOrder.orderCode}</strong>
            </p>
            <div className="mb-3">
              <span
                className="badge rounded px-2.5 py-1"
                style={
                  successOrder.status === 'COMPLETED'
                    ? { backgroundColor: '#E3F5EC', color: '#1E6B47', border: '1px solid #86CFA8', fontSize: '13px' }
                    : { backgroundColor: '#FEF0C7', color: '#9A5B06', border: '1px solid #F5B95F', fontSize: '13px' }
                }
              >
                Trạng thái: {successOrder.status}
              </span>
            </div>
            {successOrder.status === 'PENDING' && (
              <Alert variant="info" className="small text-start mx-auto py-2 px-3 mb-3" style={{ maxWidth: 540 }}>
                <Icon name="info-circle" className="me-2 text-primary" />
                Hệ thống đã gửi <strong>Phiếu xác nhận đơn hàng</strong> vào Messenger của khách. Khi khách nhắn <em>"OK"</em> hoặc xác nhận, đơn sẽ tự động chốt và chuyển sang giữ chỗ tồn kho!
              </Alert>
            )}
            {Array.isArray(successOrder.stockWarnings) && successOrder.stockWarnings.length > 0 && (
              <Alert variant="warning" className="small text-start mx-auto py-2 px-3 mb-4" style={{ maxWidth: 540 }}>
                <div className="fw-bold mb-1"><Icon name="exclamation-triangle-fill" className="me-1" />Cảnh báo tồn kho cho Sale:</div>
                <ul className="mb-1 ps-3">
                  {successOrder.stockWarnings.map((w) => (
                    <li key={w.skuCode}>{w.message}</li>
                  ))}
                </ul>
                <div className="text-muted">Hướng dẫn: báo khách thời gian chờ hàng, giảm số lượng hoặc đổi sang SKU khác trước khi chốt đơn.</div>
              </Alert>
            )}
            <div>
              <Button className="btn-wms-primary" onClick={onClose}>Đóng cửa sổ</Button>
            </div>
          </div>
        ) : (
          <div className="d-flex flex-column gap-3">
            {/* Chuyển đổi kênh bán hàng: Online giao hàng vs Tại quầy POS */}
            <div className="bg-white p-2 rounded d-flex align-items-center justify-content-between shadow-sm" style={{ border: '1px solid var(--wms-border, #C8B9A6)' }}>
              <div className="small fw-semibold" style={{ color: 'var(--wms-text-primary, #141210)' }}>
                <Icon name="shop" className="me-1" style={{ color: 'var(--wms-accent, #8A6A46)' }} /> Kênh Bán Hàng:
              </div>
              <ButtonGroup size="sm">
                <ToggleButton
                  id="qom-mode-online"
                  type="radio"
                  variant={orderChannel === 'ONLINE' ? 'dark' : 'outline-secondary'}
                  className={`d-flex align-items-center justify-content-center py-1.5 px-3 ${orderChannel === 'ONLINE' ? 'btn-wms-primary' : 'btn-wms-default'}`}
                  name="qom-order-mode"
                  value="ONLINE"
                  checked={orderChannel === 'ONLINE'}
                  onChange={() => { setOrderChannel('ONLINE'); setShippingFee(30000); }}
                >
                  <Icon name="truck" className="me-2" /> Giao hàng tận nơi
                </ToggleButton>
                <ToggleButton
                  id="qom-mode-pos"
                  type="radio"
                  variant={orderChannel === 'POS' ? 'dark' : 'outline-secondary'}
                  className={`d-flex align-items-center justify-content-center py-1.5 px-3 ${orderChannel === 'POS' ? 'btn-wms-primary' : 'btn-wms-default'}`}
                  name="qom-order-mode"
                  value="POS"
                  checked={orderChannel === 'POS'}
                  onChange={() => { setOrderChannel('POS'); setShippingFee(0); }}
                >
                  <Icon name="shop" className="me-2" /> Bán tại quầy
                </ToggleButton>
              </ButtonGroup>
            </div>

            {/* Thông tin người nhận hàng */}
            <Card style={{ border: '1px solid var(--wms-border, #C8B9A6)' }}>
              <Card.Body>
                <Card.Title as="h6" className="d-flex align-items-center gap-2 mb-2 pb-1 border-bottom" style={{ color: 'var(--wms-text-primary, #141210)', borderColor: 'var(--wms-border, #C8B9A6)' }}>
                  <Icon name="person" style={{ color: 'var(--wms-accent, #8A6A46)' }} /> {orderChannel === 'POS' ? 'Thông tin khách mua tại quầy' : 'Thông tin người nhận hàng'}
                </Card.Title>
                <RecipientFields recipient={recipient} onChange={setRecipient} />
              </Card.Body>
            </Card>

            {/* Tìm kiếm & Chọn sản phẩm */}
            <Card style={{ border: '1px solid var(--wms-border, #C8B9A6)' }}>
              <Card.Body>
                <div className="d-flex justify-content-between align-items-center mb-2 pb-1 border-bottom" style={{ borderColor: 'var(--wms-border, #C8B9A6)' }}>
                  <Card.Title as="h6" className="d-flex align-items-center gap-2 mb-0" style={{ color: 'var(--wms-text-primary, #141210)' }}>
                    <Icon name="box-seam" style={{ color: 'var(--wms-accent, #8A6A46)' }} /> Chọn sản phẩm - {items.length} món đã chọn
                  </Card.Title>
                  <span className="badge rounded px-2 py-0.5" style={{ backgroundColor: 'var(--wms-bg-subtle, #F3EDE4)', color: 'var(--wms-secondary, #574F46)', border: '1px solid var(--wms-border, #C8B9A6)' }}>
                    {availableSkus.length} sản phẩm có sẵn
                  </span>
                </div>

                <SkuSearchBox
                  query={searchQuery}
                  onQueryChange={handleSearch}
                  searching={searching}
                  show={showDropdown}
                  onShowChange={setShowDropdown}
                  list={dropdownList}
                  header={searchQuery.trim()
                    ? `KẾT QUẢ TÌM KIẾM: ${searchResults.length}`
                    : `SẢN PHẨM CÓ SẴN TRONG KHO: ${availableSkus.length}`}
                  onPick={addItem}
                />

                {/* Danh sách sản phẩm ĐÃ CHỌN */}
                {items.length > 0 ? (
                  <SelectedItemsList items={items} onQty={updateQuantity} onRemove={removeItem} maxHeight={180} />
                ) : (
                  /* Gợi ý sản phẩm khi chưa có sản phẩm nào được chọn */
                  <div className="mt-2">
                    <div className="fw-semibold small mb-2" style={{ color: 'var(--wms-secondary, #574F46)' }}>
                      Sản phẩm có sẵn trong kho:
                    </div>
                    <AvailableSkuList
                      skus={availableSkus}
                      loading={loadingSkus}
                      limit={8}
                      onAdd={addItem}
                      maxHeight={200}
                    />
                  </div>
                )}
              </Card.Body>
            </Card>

            {/* Chi tiết thanh toán */}
            <Card body style={{ border: '1px solid var(--wms-border, #C8B9A6)' }}>
              <PaymentSummary
                subtotal={itemsSubtotal}
                shippingFee={shippingFee}
                onShippingFeeChange={setShippingFee}
                discountAmount={discountAmount}
                onDiscountChange={setDiscountAmount}
                total={totalAmount}
                totalLabel={orderChannel === 'POS' ? 'Tổng thanh toán POS' : 'Tổng COD'}
              />
            </Card>
          </div>
        )}
      </Modal.Body>

      {/* Footer */}
      {!successOrder && (
        <Modal.Footer style={{ backgroundColor: 'var(--wms-bg-subtle, #F3EDE4)', borderColor: 'var(--wms-border, #C8B9A6)' }}>
          <Button size="sm" className="btn-wms-default" onClick={onClose}>
            Hủy bỏ
          </Button>
          {orderChannel === 'POS' ? (
            <Button
              size="sm"
              disabled={loading || items.length === 0}
              onClick={() => handleCreateOrder(false)}
              className="d-flex align-items-center gap-2 fw-bold btn-wms-primary"
            >
              {loading ? <Spinner animation="border" size="sm" /> : <Icon name="cart-check-fill" />}
              Xuất Kho &amp; Thanh Toán Ngay
            </Button>
          ) : (
            <>
              <Button
                size="sm"
                className="btn-wms-default"
                disabled={loading || items.length === 0}
                onClick={() => handleCreateOrder(false)}
              >
                Lưu Đơn Nháp
              </Button>
              <Button
                size="sm"
                disabled={loading || items.length === 0}
                onClick={() => handleCreateOrder(true)}
                className="d-flex align-items-center gap-2 fw-semibold btn-wms-accent"
              >
                {loading ? <Spinner animation="border" size="sm" /> : <Icon name="send-check" />}
                Tạo Đơn &amp; Gửi Phiếu Xác Nhận
              </Button>
            </>
          )}
        </Modal.Footer>
      )}
    </Modal>
  );
};

export default QuickOrderModal;
