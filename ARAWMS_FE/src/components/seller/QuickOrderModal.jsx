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
import { Modal, Card, Alert, Button, Badge, Spinner } from 'react-bootstrap';
import { sellerService } from '../../services/sellerService';
import { Icon } from './SellerUi';
import {
  RecipientFields, SkuSearchBox, SelectedItemsList, AvailableSkuList, PaymentSummary,
  getAvailQty, getSkuId,
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
   * Tạo đơn hàng bán lẻ mới (UC-78) và tùy chọn kích hoạt giữ chỗ kho (UC-79, [BR: GBR-10])
   */
  const handleCreateOrder = async (confirmReserve = false) => {
    const customerId = customer?._id || customer?.id;
    if (!customerId) {
      setError('Thiếu thông tin khách hàng. Vui lòng chọn khách hàng hợp lệ trước khi tạo đơn.');
      return;
    }
    if (items.length === 0) {
      setError('Vui lòng chọn ít nhất một sản phẩm vào đơn hàng.');
      return;
    }
    if (!recipient.phone || !recipient.phone.trim()) {
      setError('Vui lòng nhập số điện thoại người nhận hàng.');
      return;
    }

    try {
      setLoading(true);
      setError('');

      const orderPayload = {
        customerId,
        conversationId,
        shippingRecipient: recipient,
        items: items.map((it) => ({
          skuId: it.skuId,
          orderedQty: it.orderedQty,
          unitSalePrice: it.unitSalePrice,
        })),
        financialSummary: {
          shippingFee: Number(shippingFee),
          discountAmount: Number(discountAmount),
        },
      };

      // 1. Tạo đơn PENDING (UC-78)
      const res = await sellerService.createDirectOrder(orderPayload);
      if (res.success) {
        let createdOrder = res.data;

        // 2. Kích hoạt giữ chỗ kho (+Reserved) nếu chọn Xác nhận (UC-79, [BR: GBR-10])
        if (confirmReserve) {
          const orderId = createdOrder?._id || createdOrder?.id;
          if (orderId) {
            const confirmRes = await sellerService.confirmOrderReserve(orderId);
            if (confirmRes.success) {
              createdOrder = confirmRes.data;
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
    <Modal show={isOpen} onHide={onClose} centered size="lg" backdrop="static" scrollable>
      {/* Header */}
      <Modal.Header closeButton>
        <Modal.Title as="h5" className="d-flex align-items-center gap-2">
          <Icon name="bag-plus" className="text-warning-emphasis" />
          Tạo Đơn Hàng Nhanh (Pancake POS)
        </Modal.Title>
      </Modal.Header>

      {/* Body */}
      <Modal.Body className="bg-body-tertiary">
        {error && <Alert variant="danger" className="py-2 small">{error}</Alert>}

        {successOrder ? (
          <div className="text-center py-5">
            <Icon name="check-circle-fill" className="text-success display-4 d-block mb-3" />
            <h4 className="fw-bold">Tạo Đơn Hàng Thành Công!</h4>
            <p className="text-secondary small">
              Mã đơn hàng: <strong className="font-monospace text-body fs-6">{successOrder.orderCode}</strong>
            </p>
            <Badge bg="success" className="fs-6 mb-4">Trạng thái: {successOrder.status}</Badge>
            <div>
              <Button variant="dark" onClick={onClose}>Đóng cửa sổ</Button>
            </div>
          </div>
        ) : (
          <div className="d-flex flex-column gap-3">
            {/* Thông tin người nhận hàng */}
            <Card>
              <Card.Body>
                <Card.Title as="h6" className="d-flex align-items-center gap-2">
                  <Icon name="person" /> Thông tin người nhận hàng
                </Card.Title>
                <RecipientFields recipient={recipient} onChange={setRecipient} />
              </Card.Body>
            </Card>

            {/* Tìm kiếm & Chọn sản phẩm */}
            <Card>
              <Card.Body>
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <Card.Title as="h6" className="d-flex align-items-center gap-2 mb-0">
                    <Icon name="box-seam" /> Chọn sản phẩm ({items.length} món đã chọn)
                  </Card.Title>
                  <Badge bg="light" text="secondary" className="border">
                    {availableSkus.length} sản phẩm có sẵn
                  </Badge>
                </div>

                <SkuSearchBox
                  query={searchQuery}
                  onQueryChange={handleSearch}
                  searching={searching}
                  show={showDropdown}
                  onShowChange={setShowDropdown}
                  list={dropdownList}
                  header={searchQuery.trim()
                    ? `KẾT QUẢ TÌM KIẾM (${searchResults.length})`
                    : `SẢN PHẨM CÓ SẴN TRONG KHO (${availableSkus.length})`}
                  onPick={addItem}
                />

                {/* Danh sách sản phẩm ĐÃ CHỌN */}
                {items.length > 0 ? (
                  <SelectedItemsList items={items} onQty={updateQuantity} onRemove={removeItem} maxHeight={180} />
                ) : (
                  /* Gợi ý sản phẩm khi chưa có sản phẩm nào được chọn */
                  <div className="mt-2">
                    <div className="text-secondary fw-bold small text-uppercase mb-2">
                      Sản phẩm có sẵn trong kho (Bấm "+ Thêm" để đưa vào đơn):
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
            <Card body>
              <PaymentSummary
                subtotal={itemsSubtotal}
                shippingFee={shippingFee}
                onShippingFeeChange={setShippingFee}
                discountAmount={discountAmount}
                onDiscountChange={setDiscountAmount}
                total={totalAmount}
              />
            </Card>
          </div>
        )}
      </Modal.Body>

      {/* Footer */}
      {!successOrder && (
        <Modal.Footer>
          <Button size="sm" variant="outline-secondary" onClick={onClose}>
            Hủy bỏ
          </Button>
          <Button
            size="sm"
            variant="outline-dark"
            disabled={loading || items.length === 0}
            onClick={() => handleCreateOrder(false)}
          >
            Lưu Đơn (PENDING)
          </Button>
          <Button
            size="sm"
            variant="dark"
            disabled={loading || items.length === 0}
            onClick={() => handleCreateOrder(true)}
            className="d-flex align-items-center gap-2"
          >
            {loading ? <Spinner animation="border" size="sm" /> : <Icon name="shield-check" />}
            Xác Nhận & Giữ Chỗ Kho (UC-79)
          </Button>
        </Modal.Footer>
      )}
    </Modal>
  );
};

export default QuickOrderModal;
