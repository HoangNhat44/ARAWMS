/**
 * ============================================================================
 * @title        : Quick Order Inline Panel (Pancake-style)
 * @author       : Nguyễn Quang Huy
 * @createdDate  : 2026-10-27
 * @lastModified : 2026-10-28
 * @description  : Panel tạo đơn hàng bán lẻ nhanh tích hợp tại Pane tác nghiệp phải theo phong cách Pancake.
 *                 Hỗ trợ tìm kiếm tồn kho khả dụng thời gian thực (UC-77), điền thông tin người nhận,
 *                 tính toán tổng tiền và tạo/xác nhận giữ chỗ đơn hàng (UC-78, UC-79).
 *                 (Refactor 2026-10-28: giao diện chỉ dùng Bootstrap / React-Bootstrap.)
 * @module       : Order Fulfillment / Direct Order Management
 * @layer        : Front-end
 * ============================================================================
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, Alert, Button, Badge, Spinner, ButtonGroup, ToggleButton, Stack } from 'react-bootstrap';
import { sellerService } from '../../services/sellerService';
import { Icon } from './SellerUi';
import {
  RecipientFields, SkuSearchBox, SelectedItemsList, AvailableSkuList, PaymentSummary,
  getAvailQty, getSkuId,
} from './OrderFormParts';

const PAYMENT_METHODS = [
  { value: 'COD', label: 'COD', icon: 'cash' },
  { value: 'BANK_TRANSFER', label: 'Chuyển khoản', icon: 'bank' },
];

// Module-level cache để tái sử dụng danh sách SKU gợi ý giữa các lần đổi trang / tab (TTL: 60s)
let globalCachedSkus = null;
let globalCachedTime = 0;

/**
 * Component Panel tạo đơn nhanh cho Seller, tích hợp kiểm tra tồn kho realtime và giữ chỗ kho.
 *
 * @component
 * @param {Object} props - Thuộc tính truyền vào component.
 * @param {Object} props.customer - Hồ sơ khách hàng hiện tại (Customer profile).
 * @param {string} [props.conversationId] - MongoDB ObjectId của phiên chat hội thoại.
 * @param {Function} [props.onOrderCreated] - Callback kích hoạt khi đơn hàng được tạo thành công.
 * @returns {JSX.Element} Bảng điều khiển tạo đơn hàng nhanh.
 */
const QuickOrderPanel = ({ customer, conversationId, onOrderCreated }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [defaultSkus, setDefaultSkus] = useState(globalCachedSkus || []);
  const [loadingDefaultSkus, setLoadingDefaultSkus] = useState(false);
  const [searching, setSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [items, setItems] = useState([]);
  const [recipient, setRecipient] = useState({ name: '', phone: '', address: '' });
  const [shippingFee, setShippingFee] = useState(30000);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('COD');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successOrder, setSuccessOrder] = useState(null);
  const debounceRef = useRef(null);

  // 1. Tự động đồng bộ thông tin người nhận từ hồ sơ khách hàng
  useEffect(() => {
    if (customer) {
      setRecipient({
        name: customer.fullName || '',
        phone: customer.phone || '',
        address: customer.addresses?.[0]?.fullAddress || '',
      });
    }
  }, [customer?._id]);

  // 2. Tự động tải danh sách sản phẩm có sẵn trong kho ngay khi mở bảng tạo đơn (ưu tiên cache 60s)
  useEffect(() => {
    fetchAvailableSkus();
  }, []);

  const fetchAvailableSkus = async (force = false) => {
    const now = Date.now();
    if (!force && globalCachedSkus && now - globalCachedTime < 60000) {
      setDefaultSkus(globalCachedSkus);
      return;
    }
    try {
      setLoadingDefaultSkus(true);
      const res = await sellerService.lookupRealtimeStock('');
      if (res.success) {
        const items = Array.isArray(res.data) ? res.data : (res.data?.items || []);
        globalCachedSkus = items;
        globalCachedTime = Date.now();
        setDefaultSkus(items);
      }
    } catch (err) {
      console.warn('Lỗi tải danh sách sản phẩm:', err.message);
      if (!globalCachedSkus) setDefaultSkus([]);
    } finally {
      setLoadingDefaultSkus(false);
    }
  };

  // 3. Đóng dropdown khi click bên ngoài: xử lý bên trong <SkuSearchBox />

  /**
   * Tra cứu tồn kho khả dụng thời gian thực dựa trên từ khóa tìm kiếm (Tên/Mã SKU).
   * Áp dụng Debounce 300ms để tối ưu hóa tần suất gọi API.
   * [BR: GBR-08] Hiển thị cảnh báo và số lượng khả dụng thực tế của từng SKU.
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
        // [BR: GBR-08] Gọi API kiểm tra tồn kho khả dụng thực tế
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
   * Thêm sản phẩm vào danh sách đơn hàng.
   * [BR: GBR-03] Định danh SKU chính xác theo ID và mã SKU.
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
    setSearchResults([]);
  };

  const updateQty = (skuId, delta) => {
    setItems(items.map((it) =>
      it.skuId === skuId ? { ...it, orderedQty: Math.max(1, it.orderedQty + delta) } : it
    ));
  };

  const removeItem = (skuId) => setItems(items.filter((it) => it.skuId !== skuId));

  const subtotal = items.reduce((s, it) => s + it.orderedQty * it.unitSalePrice, 0);
  const total = Math.max(0, subtotal + Number(shippingFee || 0) - Number(discountAmount || 0));

  const resetForm = () => {
    setItems([]);
    setSuccessOrder(null);
    setError('');
    setShippingFee(30000);
    setDiscountAmount(0);
    if (customer) setRecipient({
      name: customer.fullName || '',
      phone: customer.phone || '',
      address: customer.addresses?.[0]?.fullAddress || '',
    });
  };

  /**
   * Thực thi tạo đơn hàng bán lẻ trực tiếp (Direct Retail Order).
   * @param {boolean} confirmReserve - Nếu true, kích hoạt giữ chỗ kho ngay sau khi tạo đơn.
   * [BR: GBR-10] Chuyển số lượng SKU từ tồn khả dụng sang tồn giữ chỗ kho khi xác nhận đơn.
   */
  const handleCreate = async (confirmReserve = false) => {
    if (!customer?._id) { setError('Vui lòng chọn khách hàng'); return; }
    if (items.length === 0) { setError('Vui lòng thêm ít nhất 1 sản phẩm'); return; }
    if (!recipient.phone) { setError('Vui lòng nhập SĐT người nhận'); return; }
    try {
      setLoading(true); setError('');
      // 1. Chuẩn bị payload tạo đơn hàng
      const payload = {
        customerId: customer._id,
        conversationId,
        shippingRecipient: recipient,
        paymentMethod,
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

      // 2. Gọi API tạo đơn bán lẻ (UC-78)
      const res = await sellerService.createDirectOrder(payload);
      if (res.success) {
        let order = res.data;
        // 3. [BR: GBR-10] Tự động kích hoạt giữ chỗ tồn kho nếu chọn 'Tạo & Giữ chỗ kho' (UC-79)
        if (confirmReserve) {
          const orderId = order?._id || order?.id;
          if (orderId) {
            const confirmRes = await sellerService.confirmOrderReserve(orderId);
            if (confirmRes.success) order = confirmRes.data;
          }
        }
        globalCachedSkus = null; // Xóa cache để lượt sau lấy số lượng tồn mới nhất
        setSuccessOrder(order);
        if (onOrderCreated) onOrderCreated(order);
      }
    } catch (err) {
      setError(err.message || 'Lỗi khi tạo đơn');
    } finally {
      setLoading(false);
    }
  };

  if (successOrder) {
    return (
      <div className="text-center py-5">
        <Icon name="check-circle-fill" className="text-success display-5 d-block mb-2" />
        <div className="fw-bold fs-5">Tạo đơn thành công!</div>
        <div className="font-monospace text-secondary mb-2">{successOrder.orderCode}</div>
        <Badge bg="success" className="mb-3">{successOrder.status}</Badge>
        <div>
          <Button variant="dark" size="sm" onClick={resetForm}>Tạo đơn mới</Button>
        </div>
      </div>
    );
  }

  const dropdownList = searchQuery.trim() ? searchResults : defaultSkus;

  return (
    <Stack gap={3} className="w-100 overflow-x-hidden">
      {/* Thông tin người nhận */}
      <Card className="shadow-sm">
        <Card.Body>
          <Card.Title as="div" className="small fw-bold text-uppercase d-flex align-items-center gap-2">
            <Icon name="person" className="text-warning-emphasis" /> Người nhận
          </Card.Title>
          <RecipientFields recipient={recipient} onChange={setRecipient} />
        </Card.Body>
      </Card>

      {/* Tìm kiếm sản phẩm */}
      <Card className="shadow-sm">
        <Card.Body>
          <div className="d-flex align-items-center justify-content-between mb-2">
            <Card.Title as="div" className="small fw-bold text-uppercase d-flex align-items-center gap-2 mb-0">
              <Icon name="box-seam" className="text-warning-emphasis" /> Sản phẩm ({items.length})
            </Card.Title>
            <Badge bg="light" text="secondary" className="border fw-normal">{defaultSkus.length} mẫu có sẵn</Badge>
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
              : `SẢN PHẨM CÓ SẴN (${defaultSkus.length})`}
            onPick={addItem}
          />

          {/* Danh sách sản phẩm đã thêm vào đơn */}
          {items.length > 0 && (
            <>
              <div className="text-secondary fw-bold small text-uppercase mt-2 mb-1">
                Đã chọn vào đơn ({items.length} món)
              </div>
              <SelectedItemsList items={items} onQty={updateQty} onRemove={removeItem} maxHeight="none" />
            </>
          )}

          {/* Khối gợi ý sản phẩm có sẵn trong kho */}
          <div className="text-secondary fw-bold small text-uppercase mt-2 mb-2">
            Sản phẩm có sẵn trong kho ({defaultSkus.length})
          </div>
          <AvailableSkuList
            skus={defaultSkus}
            loading={loadingDefaultSkus}
            limit={10}
            selectedItems={items}
            onAdd={addItem}
            maxHeight={240}
          />
        </Card.Body>
      </Card>

      {/* Thanh toán */}
      <Card className="shadow-sm">
        <Card.Body>
          <Card.Title as="div" className="small fw-bold text-uppercase d-flex align-items-center gap-2">
            <Icon name="wallet2" /> Thanh toán
          </Card.Title>
          <ButtonGroup className="w-100 mb-3">
            {PAYMENT_METHODS.map((m) => (
              <ToggleButton
                key={m.value}
                id={`qop-pay-${m.value}`}
                type="radio"
                size="sm"
                name="qop-payment-method"
                value={m.value}
                variant={paymentMethod === m.value ? 'dark' : 'outline-secondary'}
                checked={paymentMethod === m.value}
                onChange={(e) => setPaymentMethod(e.currentTarget.value)}
              >
                <Icon name={m.icon} className="me-1" />{m.label}
              </ToggleButton>
            ))}
          </ButtonGroup>
          <PaymentSummary
            subtotal={subtotal}
            shippingFee={shippingFee}
            onShippingFeeChange={setShippingFee}
            discountAmount={discountAmount}
            onDiscountChange={setDiscountAmount}
            total={total}
            totalLabel="Tổng COD"
          />
        </Card.Body>
      </Card>

      {/* Lỗi */}
      {error && <Alert variant="danger" className="py-2 small mb-0">{error}</Alert>}

      {/* Actions */}
      <Stack direction="horizontal" gap={2}>
        <Button
          size="sm"
          variant="outline-secondary"
          className="w-50 py-2 fw-semibold"
          disabled={loading || items.length === 0}
          onClick={() => handleCreate(false)}
        >
          Lưu Đơn
        </Button>
        <Button
          size="sm"
          variant="dark"
          className="w-50 py-2 fw-semibold d-flex align-items-center justify-content-center gap-2"
          disabled={loading || items.length === 0}
          onClick={() => handleCreate(true)}
        >
          {loading ? <Spinner animation="border" size="sm" /> : <Icon name="shield-check" />}
          Xác Nhận & Giữ Chỗ
        </Button>
      </Stack>
    </Stack>
  );
};

export default QuickOrderPanel;
