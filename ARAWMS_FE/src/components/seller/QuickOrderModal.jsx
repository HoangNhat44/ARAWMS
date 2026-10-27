/**
 * ============================================================================
 * @title        : Quick Order Modal Component (UC-78 & UC-79)
 * @author       : Nguyễn Quang Huy
 * @createdDate  : 2026-10-27
 * @lastModified : 2026-10-27
 * @description  : Modal tạo đơn hàng bán lẻ nhanh hiển thị nổi bật trên màn hình
 *                 khi Seller bấm nút "Tạo đơn nhanh" tại khung chat.
 *                 Tự động tải danh sách sản phẩm có sẵn trong kho, hỗ trợ tìm kiếm tồn kho
 *                 khả dụng thời gian thực (UC-77), điền thông tin người nhận và kích hoạt
 *                 giữ chỗ kho (+Reserved) nguyên tử (UC-79, [BR: GBR-10]).
 * @module       : Order Fulfillment / Direct Order Management
 * @layer        : Front-end
 * ============================================================================
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Modal } from 'react-bootstrap';
import {
  X, Plus, Minus, Trash2, ShoppingBag, ShieldCheck,
  CheckCircle2, Search, Package, User, Phone, MapPin
} from 'lucide-react';
import { sellerService } from '../../services/sellerService';

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

  const searchRef = useRef(null);
  const debounceRef = useRef(null);
  const customerId = customer?._id || customer?.id;

  // 1. Tải danh sách sản phẩm có sẵn trong kho khi mở Modal
  const fetchAvailableProducts = useCallback(async () => {
    try {
      setLoadingSkus(true);
      const res = await sellerService.lookupRealtimeStock('');
      if (res.success) {
        const items = Array.isArray(res.data) ? res.data : (res.data?.items || []);
        setAvailableSkus(items);
      }
    } catch {
      setAvailableSkus([]);
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

  // 3. Đóng dropdown khi click ra ngoài
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
    const existing = items.find((it) => it.skuId === (sku.skuId || sku._id));
    const avail = sku.availableQty ?? sku.availableStock ?? 0;
    if (existing) {
      setItems(items.map((it) =>
        it.skuId === existing.skuId ? { ...it, orderedQty: it.orderedQty + 1 } : it
      ));
    } else {
      setItems([...items, {
        skuId: sku.skuId || sku._id,
        skuCode: sku.skuCode,
        styleName: sku.productName || sku.styleName,
        size: sku.size,
        color: sku.color,
        thumbnailUrl: sku.thumbnailUrl || '',
        availableStock: avail,
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
    <Modal
      show={isOpen}
      onHide={onClose}
      centered
      size="lg"
      contentClassName="ara-modal"
      backdrop="static"
    >
      {/* Header */}
      <Modal.Header closeButton className="ara-modal-header">
        <Modal.Title className="d-flex align-items-center gap-2" style={{ fontFamily: 'var(--font-serif)', fontSize: '1.25rem' }}>
          <ShoppingBag size={22} color="var(--ara-gold, #9F8365)" />
          <span>Tạo Đơn Hàng Nhanh (Pancake POS)</span>
        </Modal.Title>
      </Modal.Header>

      {/* Body */}
      <Modal.Body className="p-4" style={{ backgroundColor: '#FAF7F2' }}>
        {error && <div className="alert alert-danger py-2 px-3 small mb-3">{error}</div>}

        {successOrder ? (
          <div className="text-center py-5">
            <CheckCircle2 size={56} color="var(--ara-success, #2E7D59)" className="mb-3" />
            <h4 className="fw-bold text-dark" style={{ fontFamily: 'var(--font-serif)' }}>
              Tạo Đơn Hàng Thành Công!
            </h4>
            <p className="text-secondary small">
              Mã đơn hàng: <strong className="font-monospace text-dark fs-6">{successOrder.orderCode}</strong>
            </p>
            <div className="mb-4">
              <span className="badge-ara-success fs-6 px-3 py-1">
                Trạng thái: {successOrder.status}
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="btn-ara-primary px-4 py-2"
            >
              <span>Đóng cửa sổ</span>
            </button>
          </div>
        ) : (
          <div className="d-flex flex-column gap-3" style={{ fontSize: '0.82rem' }}>
            {/* Thông tin người nhận hàng */}
            <div className="p-3 bg-white rounded border" style={{ borderColor: 'var(--ara-border)' }}>
              <div className="fw-bold text-dark mb-2 d-flex align-items-center gap-1.5" style={{ fontSize: '0.86rem' }}>
                <User size={14} /> Thông tin người nhận hàng
              </div>
              <div className="row g-2 mb-2">
                <div className="col-md-6">
                  <input
                    type="text"
                    placeholder="Họ tên người nhận"
                    value={recipient.name}
                    onChange={(e) => setRecipient({ ...recipient, name: e.target.value })}
                    className="form-control form-control-sm"
                  />
                </div>
                <div className="col-md-6">
                  <input
                    type="text"
                    placeholder="Số điện thoại *"
                    value={recipient.phone}
                    onChange={(e) => setRecipient({ ...recipient, phone: e.target.value })}
                    className="form-control form-control-sm"
                    required
                  />
                </div>
              </div>
              <input
                type="text"
                placeholder="Địa chỉ giao hàng (Số nhà, đường, phường, quận...)"
                value={recipient.address}
                onChange={(e) => setRecipient({ ...recipient, address: e.target.value })}
                className="form-control form-control-sm"
              />
            </div>

            {/* Tìm kiếm & Chọn sản phẩm */}
            <div className="p-3 bg-white rounded border" style={{ borderColor: 'var(--ara-border)' }} ref={searchRef}>
              <div className="d-flex justify-content-between align-items-center mb-2">
                <span className="fw-bold text-dark d-flex align-items-center gap-1.5" style={{ fontSize: '0.86rem' }}>
                  <Package size={14} /> Chọn sản phẩm ({items.length} món đã chọn)
                </span>
                <span className="badge bg-light text-secondary border" style={{ fontSize: '0.7rem' }}>
                  {availableSkus.length} sản phẩm có sẵn
                </span>
              </div>

              {/* Ô tìm kiếm */}
              <div className="position-relative mb-2">
                <Search size={14} className="position-absolute" style={{ left: 10, top: 9, color: '#9CA3AF' }} />
                <input
                  type="text"
                  placeholder="Tìm sản phẩm theo tên, mã SKU... (bấm để xem danh sách có sẵn)"
                  value={searchQuery}
                  onFocus={() => setShowDropdown(true)}
                  onChange={(e) => handleSearch(e.target.value)}
                  className="form-control form-control-sm ps-4"
                />
                {searching && (
                  <div className="position-absolute" style={{ right: 10, top: 7 }}>
                    <div className="spinner-border spinner-border-sm text-secondary" role="status" />
                  </div>
                )}

                {/* Dropdown gợi ý */}
                {showDropdown && dropdownList.length > 0 && (
                  <div
                    className="position-absolute w-100 bg-white border rounded shadow-lg"
                    style={{ top: 'calc(100% + 4px)', zIndex: 1050, maxHeight: '220px', overflowY: 'auto' }}
                  >
                    <div className="p-1 px-2 text-muted fw-bold small bg-light border-bottom">
                      {searchQuery.trim() ? `KẾT QUẢ TÌM KIẾM (${searchResults.length})` : `SẢN PHẨM CÓ SẴN TRONG KHO (${availableSkus.length})`}
                    </div>
                    {dropdownList.map((sku) => {
                      const avail = sku.availableQty ?? sku.availableStock ?? 0;
                      const inStock = avail > 0;
                      return (
                        <div
                          key={sku.skuId || sku._id}
                          className="p-2 border-bottom d-flex align-items-center justify-content-between gap-2"
                          style={{ cursor: 'pointer', transition: 'background 0.15s' }}
                          onClick={() => addItem(sku)}
                          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#F9FAFB')}
                          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#FFFFFF')}
                        >
                          <div className="d-flex align-items-center gap-2 min-w-0">
                            {sku.thumbnailUrl ? (
                              <img
                                src={sku.thumbnailUrl}
                                alt={sku.productName || sku.styleName}
                                className="rounded border flex-shrink-0"
                                style={{ width: '36px', height: '36px', objectFit: 'cover' }}
                              />
                            ) : (
                              <div
                                className="rounded border flex-shrink-0 d-flex align-items-center justify-content-center text-muted"
                                style={{ width: '36px', height: '36px', background: '#F3F4F6' }}
                              >
                                <Package size={16} />
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="fw-bold text-dark text-truncate">{sku.productName || sku.styleName || sku.skuCode}</div>
                              <div className="text-muted small">
                                {sku.skuCode} · {sku.color} · Size <strong>{sku.size}</strong>
                              </div>
                            </div>
                          </div>
                          <div className="text-end flex-shrink-0">
                            <div className="fw-bold text-dark">{Number(sku.retailPrice || 0).toLocaleString('vi-VN')} đ</div>
                            <span className={`badge ${inStock ? 'bg-success-subtle text-success' : 'bg-secondary-subtle text-muted'}`} style={{ fontSize: '0.65rem' }}>
                              {inStock ? `Còn ${avail}` : 'Hết hàng'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Danh sách sản phẩm ĐÃ CHỌN */}
              {items.length > 0 ? (
                <div className="d-flex flex-column gap-2 mb-3" style={{ maxHeight: '160px', overflowY: 'auto' }}>
                  {items.map((it) => (
                    <div
                      key={it.skuId}
                      className="p-2 bg-light rounded border d-flex align-items-center justify-content-between gap-2"
                    >
                      <div className="d-flex align-items-center gap-2 flex-grow-1 min-w-0">
                        {it.thumbnailUrl ? (
                          <img
                            src={it.thumbnailUrl}
                            alt={it.styleName}
                            className="rounded border flex-shrink-0"
                            style={{ width: '34px', height: '34px', objectFit: 'cover' }}
                          />
                        ) : (
                          <div
                            className="rounded border flex-shrink-0 d-flex align-items-center justify-content-center text-muted"
                            style={{ width: '34px', height: '34px', background: '#FFFFFF' }}
                          >
                            <Package size={15} />
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="fw-bold text-dark text-truncate">{it.styleName || it.skuCode}</div>
                          <div className="text-muted small">
                            Mã: {it.skuCode} | Màu: {it.color} | Size: <strong>{it.size}</strong>
                          </div>
                          <div className="fw-bold" style={{ color: 'var(--ara-gold-hover, #846B50)' }}>
                            {Number(it.unitSalePrice).toLocaleString('vi-VN')} đ
                          </div>
                        </div>
                      </div>

                      <div className="d-flex align-items-center gap-1.5 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => updateQuantity(it.skuId, -1)}
                          className="btn btn-sm btn-outline-secondary px-2 py-0 fw-bold"
                        >
                          -
                        </button>
                        <span className="px-1.5 fw-bold">{it.orderedQty}</span>
                        <button
                          type="button"
                          onClick={() => updateQuantity(it.skuId, 1)}
                          className="btn btn-sm btn-outline-secondary px-2 py-0 fw-bold"
                        >
                          +
                        </button>
                        <button
                          type="button"
                          onClick={() => removeItem(it.skuId)}
                          className="btn btn-sm btn-link text-danger p-1 ms-1"
                          title="Xóa sản phẩm"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                /* Gợi ý sản phẩm khi chưa có sản phẩm nào được chọn */
                <div className="mt-2">
                  <div className="text-muted fw-bold mb-1.5" style={{ fontSize: '0.72rem', textTransform: 'uppercase' }}>
                    📦 Sản phẩm có sẵn trong kho (Bấm "+ Thêm" để đưa vào đơn):
                  </div>
                  {loadingSkus ? (
                    <div className="text-center py-3 text-muted small">
                      <div className="spinner-border spinner-border-sm me-1" role="status" />
                      Đang tải danh sách hàng có sẵn...
                    </div>
                  ) : availableSkus.length === 0 ? (
                    <div className="text-center py-3 text-muted small border rounded bg-light">
                      Chưa có sản phẩm nào trong kho dữ liệu
                    </div>
                  ) : (
                    <div className="d-flex flex-column gap-1.5" style={{ maxHeight: '180px', overflowY: 'auto' }}>
                      {availableSkus.slice(0, 8).map((sku) => {
                        const avail = sku.availableQty ?? sku.availableStock ?? 0;
                        const inStock = avail > 0;
                        return (
                          <div
                            key={sku.skuId || sku._id}
                            className="p-2 bg-light rounded border d-flex align-items-center justify-content-between gap-2"
                            style={{ fontSize: '0.78rem' }}
                          >
                            <div className="d-flex align-items-center gap-2 min-w-0 flex-grow-1 pe-2">
                              {sku.thumbnailUrl ? (
                                <img
                                  src={sku.thumbnailUrl}
                                  alt={sku.productName || sku.styleName}
                                  className="rounded border flex-shrink-0"
                                  style={{ width: '32px', height: '32px', objectFit: 'cover' }}
                                />
                              ) : (
                                <div
                                  className="rounded border flex-shrink-0 d-flex align-items-center justify-content-center text-muted"
                                  style={{ width: '32px', height: '32px', background: '#EAE3D8' }}
                                >
                                  <Package size={14} />
                                </div>
                              )}
                              <div className="min-w-0">
                                <div className="fw-bold text-dark text-truncate">{sku.productName || sku.styleName || sku.skuCode}</div>
                                <div className="text-muted small">
                                  {sku.skuCode} · {sku.color} · Size <strong>{sku.size}</strong> · {Number(sku.retailPrice || 0).toLocaleString('vi-VN')}đ
                                </div>
                              </div>
                            </div>
                            <div className="d-flex align-items-center gap-2 flex-shrink-0">
                              <span className={`badge ${inStock ? 'bg-success-subtle text-success' : 'bg-secondary-subtle text-muted'}`} style={{ fontSize: '0.65rem' }}>
                                {inStock ? `Còn ${avail}` : 'Hết hàng'}
                              </span>
                              <button
                                type="button"
                                onClick={() => addItem(sku)}
                                className="btn btn-sm btn-ara-primary py-0.5 px-2"
                                style={{ fontSize: '0.74rem' }}
                              >
                                + Thêm
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Chi tiết thanh toán */}
            <div className="p-3 bg-white rounded border" style={{ borderColor: 'var(--ara-border)' }}>
              <div className="d-flex justify-content-between text-muted mb-1.5">
                <span>Tiền hàng:</span>
                <span className="fw-semibold text-dark">{itemsSubtotal.toLocaleString('vi-VN')} đ</span>
              </div>
              <div className="d-flex justify-content-between align-items-center text-muted mb-1.5">
                <span>Phí vận chuyển:</span>
                <input
                  type="number"
                  value={shippingFee}
                  onChange={(e) => setShippingFee(e.target.value)}
                  className="form-control form-control-sm text-end"
                  style={{ width: '120px' }}
                />
              </div>
              <div className="d-flex justify-content-between align-items-center text-muted mb-2">
                <span>Chiết khấu / Giảm giá:</span>
                <input
                  type="number"
                  value={discountAmount}
                  onChange={(e) => setDiscountAmount(e.target.value)}
                  className="form-control form-control-sm text-end"
                  style={{ width: '120px' }}
                />
              </div>
              <div className="d-flex justify-content-between pt-2 border-top fw-bold text-dark fs-6">
                <span>Tổng thanh toán (COD):</span>
                <span style={{ color: 'var(--ara-gold-hover, #846B50)' }}>{totalAmount.toLocaleString('vi-VN')} đ</span>
              </div>
            </div>
          </div>
        )}
      </Modal.Body>

      {/* Footer */}
      {!successOrder && (
        <Modal.Footer className="bg-white border-top p-3 justify-content-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="btn btn-sm btn-outline-secondary px-3 py-2"
          >
            Hủy bỏ
          </button>
          <button
            type="button"
            disabled={loading || items.length === 0}
            onClick={() => handleCreateOrder(false)}
            className="btn btn-sm btn-outline-dark px-3 py-2"
            style={{ borderRadius: 'var(--radius-sm, 6px)' }}
          >
            Lưu Đơn (PENDING)
          </button>
          <button
            type="button"
            disabled={loading || items.length === 0}
            onClick={() => handleCreateOrder(true)}
            className="btn-ara-primary px-3 py-2 d-flex align-items-center gap-1.5"
            style={{ fontSize: '0.82rem' }}
          >
            <ShieldCheck size={16} />
            <span>Xác Nhận & Giữ Chỗ Kho (UC-79)</span>
          </button>
        </Modal.Footer>
      )}
    </Modal>
  );
};

export default QuickOrderModal;
