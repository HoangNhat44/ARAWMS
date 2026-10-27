/**
 * ============================================================================
 * @title        : Quick Order Inline Panel (Pancake-style)
 * @author       : Nguyễn Quang Huy
 * @createdDate  : 2026-10-27
 * @lastModified : 2026-10-27
 * @description  : Panel tạo đơn hàng bán lẻ nhanh tích hợp tại Pane tác nghiệp phải theo phong cách Pancake.
 *                 Hỗ trợ tìm kiếm tồn kho khả dụng thời gian thực (UC-77), điền thông tin người nhận,
 *                 tính toán tổng tiền và tạo/xác nhận giữ chỗ đơn hàng (UC-78, UC-79).
 * @module       : Order Fulfillment / Direct Order Management
 * @layer        : Front-end
 * ============================================================================
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Search, Plus, Minus, Trash2, ShoppingBag, ShieldCheck,
  CheckCircle2, Package, ChevronDown, User, Phone, MapPin, X
} from 'lucide-react';
import { sellerService } from '../../services/sellerService';

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
  const [defaultSkus, setDefaultSkus] = useState([]);
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
  const searchRef = useRef(null);
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

  // 2. Tự động tải danh sách sản phẩm có sẵn trong kho ngay khi mở bảng tạo đơn
  useEffect(() => {
    fetchAvailableSkus();
  }, []);

  const fetchAvailableSkus = async () => {
    try {
      setLoadingDefaultSkus(true);
      const res = await sellerService.lookupRealtimeStock('');
      if (res.success) {
        const items = Array.isArray(res.data) ? res.data : (res.data?.items || []);
        setDefaultSkus(items);
      }
    } catch (err) {
      console.warn('Lỗi tải danh sách sản phẩm:', err.message);
      setDefaultSkus([]);
    } finally {
      setLoadingDefaultSkus(false);
    }
  };

  // 3. Đóng dropdown khi click bên ngoài
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
      <div className="qop-success">
        <CheckCircle2 size={44} className="qop-success-icon" />
        <div className="qop-success-title">Tạo đơn thành công!</div>
        <div className="qop-success-code">{successOrder.orderCode}</div>
        <span className={`qop-status-badge qop-status-${(successOrder.status || '').toLowerCase()}`}>
          {successOrder.status}
        </span>
        <button className="qop-btn qop-btn-primary qop-success-close" onClick={resetForm}>
          Tạo đơn mới
        </button>
      </div>
    );
  }

  return (
    <div className="d-flex flex-column gap-2.5 w-100" style={{ overflowX: 'hidden' }}>
      {/* Thông tin người nhận */}
      <div className="card border rounded-3 p-3 bg-white shadow-sm">
        <div className="fw-bold text-dark text-uppercase small mb-2 d-flex align-items-center gap-1.5" style={{ fontSize: '0.76rem', letterSpacing: '0.04em' }}>
          <User size={13} color="var(--ara-gold, #9F8365)" /> Người nhận
        </div>
        <div className="row g-2 mb-2">
          <div className="col-12 col-sm-6">
            <input
              className="form-control form-control-sm"
              placeholder="Họ và tên"
              value={recipient.name}
              onChange={(e) => setRecipient({ ...recipient, name: e.target.value })}
            />
          </div>
          <div className="col-12 col-sm-6">
            <input
              className="form-control form-control-sm"
              placeholder="Số điện thoại *"
              value={recipient.phone}
              onChange={(e) => setRecipient({ ...recipient, phone: e.target.value })}
            />
          </div>
        </div>
        <input
          className="form-control form-control-sm"
          placeholder="Địa chỉ giao hàng (Số nhà, đường, phường, quận...)"
          value={recipient.address}
          onChange={(e) => setRecipient({ ...recipient, address: e.target.value })}
        />
      </div>

      {/* Tìm kiếm sản phẩm */}
      <div className="card border rounded-3 p-3 bg-white shadow-sm position-relative" ref={searchRef}>
        <div className="fw-bold text-dark text-uppercase small mb-2 d-flex align-items-center justify-content-between" style={{ fontSize: '0.76rem', letterSpacing: '0.04em' }}>
          <span className="d-flex align-items-center gap-1.5">
            <Package size={13} color="var(--ara-gold, #9F8365)" /> Sản phẩm ({items.length})
          </span>
          <span className="badge bg-light text-secondary border fw-normal" style={{ fontSize: '0.68rem' }}>
            {defaultSkus.length} mẫu có sẵn
          </span>
        </div>

        {/* Ô tìm kiếm */}
        <div className="position-relative mb-2">
          <Search size={14} className="position-absolute" style={{ left: 10, top: 9, color: '#9CA3AF' }} />
          <input
            className="form-control form-control-sm ps-4"
            placeholder="Tìm SP theo tên, mã SKU... (bấm để xem danh sách)"
            value={searchQuery}
            onFocus={() => setShowDropdown(true)}
            onChange={(e) => handleSearch(e.target.value)}
          />
          {searching && (
            <div className="position-absolute" style={{ right: 10, top: 7 }}>
              <div className="spinner-border spinner-border-sm text-secondary" role="status" />
            </div>
          )}
        </div>

        {/* Dropdown kết quả (hiển thị khi gõ tìm kiếm hoặc khi focus) */}
        {showDropdown && (searchQuery.trim() ? searchResults : defaultSkus).length > 0 && (
          <div
            className="position-absolute bg-white border rounded shadow-lg"
            style={{ top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 1050, maxHeight: '220px', overflowY: 'auto', overflowX: 'hidden' }}
          >
            <div className="p-1 px-2 text-muted fw-bold small bg-light border-bottom" style={{ fontSize: '0.7rem' }}>
              {searchQuery.trim() ? `KẾT QUẢ TÌM KIẾM (${searchResults.length})` : `SẢN PHẨM CÓ SẴN (${defaultSkus.length})`}
            </div>
            {(searchQuery.trim() ? searchResults : defaultSkus).map((sku) => {
              const avail = sku.availableQty ?? sku.availableStock ?? 0;
              const inStock = avail > 0;
              return (
                <div
                  key={sku.skuId || sku._id}
                  className="p-2 border-bottom d-flex align-items-center justify-content-between gap-2"
                  style={{ cursor: 'pointer', transition: 'background 0.15s' }}
                  onClick={() => addItem(sku)}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#FAF7F2')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#FFFFFF')}
                >
                  <div className="d-flex align-items-center gap-2 min-w-0 flex-grow-1">
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
                        style={{ width: '32px', height: '32px', background: '#F3F4F6' }}
                      >
                        <Package size={14} />
                      </div>
                    )}
                    <div className="min-w-0 flex-grow-1">
                      <div className="fw-bold text-dark text-truncate" style={{ fontSize: '0.78rem', lineHeight: 1.35 }}>
                        {sku.productName || sku.styleName || sku.skuCode}
                      </div>
                      <div className="text-muted text-truncate" style={{ fontSize: '0.7rem', lineHeight: 1.3 }}>
                        {sku.skuCode} · {sku.color} · Size <strong>{sku.size}</strong>
                      </div>
                    </div>
                  </div>
                  <div className="text-end flex-shrink-0">
                    <div className="fw-bold text-dark" style={{ fontSize: '0.76rem' }}>
                      {Number(sku.retailPrice || 0).toLocaleString('vi-VN')}đ
                    </div>
                    <span className={`badge ${inStock ? 'bg-success-subtle text-success' : 'bg-secondary-subtle text-muted'}`} style={{ fontSize: '0.62rem', padding: '2px 5px' }}>
                      {inStock ? `Còn ${avail}` : 'Hết hàng'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Danh sách sản phẩm đã thêm vào đơn */}
        {items.length > 0 && (
          <div className="d-flex flex-column gap-1.5 mt-2 mb-3">
            <div className="text-muted fw-bold mb-1" style={{ fontSize: '0.72rem', textTransform: 'uppercase' }}>
              Đã chọn vào đơn ({items.length} món)
            </div>
            {items.map((it) => (
              <div key={it.skuId} className="p-2 bg-light rounded border d-flex align-items-center justify-content-between gap-2">
                <div className="flex-grow-1 min-w-0">
                  <div className="fw-bold text-dark text-truncate" style={{ fontSize: '0.78rem', lineHeight: 1.35 }}>
                    {it.styleName || it.skuCode}
                  </div>
                  <div className="text-muted text-truncate" style={{ fontSize: '0.7rem', lineHeight: 1.3 }}>
                    {it.skuCode} · {it.color} · Size <strong>{it.size}</strong>
                  </div>
                  <div className="fw-bold" style={{ color: 'var(--ara-gold-hover, #846B50)', fontSize: '0.76rem' }}>
                    {Number(it.unitSalePrice).toLocaleString('vi-VN')}đ
                  </div>
                </div>
                <div className="d-flex align-items-center gap-1.5 flex-shrink-0">
                  <button type="button" className="btn btn-sm btn-outline-secondary px-1.5 py-0 fw-bold" onClick={() => updateQty(it.skuId, -1)}><Minus size={11} /></button>
                  <span className="px-1 fw-bold" style={{ fontSize: '0.78rem' }}>{it.orderedQty}</span>
                  <button type="button" className="btn btn-sm btn-outline-secondary px-1.5 py-0 fw-bold" onClick={() => updateQty(it.skuId, 1)}><Plus size={11} /></button>
                  <button type="button" className="btn btn-sm btn-link text-danger p-0 ms-1" onClick={() => removeItem(it.skuId)}><Trash2 size={13} /></button>
                </div>
                <div className="fw-bold text-end flex-shrink-0" style={{ fontSize: '0.78rem', minWidth: '65px' }}>
                  {(it.orderedQty * it.unitSalePrice).toLocaleString('vi-VN')}đ
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Khối gợi ý sản phẩm có sẵn trong kho */}
        <div className="mt-2">
          <div className="d-flex align-items-center justify-content-between mb-2">
            <span className="text-muted fw-bold" style={{ fontSize: '0.72rem', textTransform: 'uppercase' }}>
              📦 Sản phẩm có sẵn trong kho ({defaultSkus.length})
            </span>
          </div>

          {loadingDefaultSkus ? (
            <div className="text-center py-3 text-muted small">
              <div className="spinner-border spinner-border-sm me-1" role="status" />
              Đang tải danh sách tồn kho...
            </div>
          ) : defaultSkus.length === 0 ? (
            <div className="text-center py-3 text-muted small border rounded bg-light">
              Chưa có sản phẩm nào trong kho dữ liệu
            </div>
          ) : (
            <div className="d-flex flex-column gap-1.5" style={{ maxHeight: '240px', overflowY: 'auto', overflowX: 'hidden' }}>
              {defaultSkus.slice(0, 10).map((sku) => {
                const isSelected = items.some((it) => it.skuId === (sku.skuId || sku._id));
                const avail = sku.availableQty ?? sku.availableStock ?? 0;
                const inStock = avail > 0;
                return (
                  <div
                    key={sku.skuId || sku._id}
                    className="p-2 bg-white rounded-2 border d-flex align-items-center justify-content-between gap-2"
                    style={{
                      fontSize: '0.76rem',
                      borderColor: isSelected ? 'var(--ara-gold, #9F8365)' : '#E5E7EB',
                      lineHeight: 1.35,
                    }}
                  >
                    <div className="d-flex align-items-center gap-2 flex-grow-1 min-w-0 pe-1">
                      {sku.thumbnailUrl ? (
                        <img
                          src={sku.thumbnailUrl}
                          alt={sku.productName || sku.styleName}
                          className="rounded border flex-shrink-0"
                          style={{ width: '34px', height: '34px', objectFit: 'cover' }}
                        />
                      ) : (
                        <div
                          className="rounded border flex-shrink-0 d-flex align-items-center justify-content-center text-muted"
                          style={{ width: '34px', height: '34px', background: '#EAE3D8' }}
                        >
                          <Package size={14} />
                        </div>
                      )}
                      <div className="min-w-0 flex-grow-1">
                        <div className="fw-bold text-dark text-truncate" title={sku.productName || sku.styleName} style={{ fontSize: '0.8rem', lineHeight: 1.35, marginBottom: '1px' }}>
                          {sku.productName || sku.styleName || sku.skuCode}
                        </div>
                        <div className="text-muted text-truncate" style={{ fontSize: '0.7rem', lineHeight: 1.3, marginBottom: '2px' }}>
                          {sku.skuCode} · {sku.color} · Size <strong>{sku.size}</strong>
                        </div>
                        <div className="d-flex align-items-center gap-1.5 flex-wrap">
                          <span className="fw-bold" style={{ color: 'var(--ara-gold-hover, #7A5C3A)', fontSize: '0.76rem' }}>
                            {Number(sku.retailPrice || 0).toLocaleString('vi-VN')}đ
                          </span>
                          <span className={`badge ${inStock ? 'bg-success-subtle text-success' : 'bg-secondary-subtle text-muted'}`} style={{ fontSize: '0.62rem', padding: '2px 5px' }}>
                            {inStock ? `Còn ${avail}` : 'Hết hàng'}
                          </span>
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => addItem(sku)}
                      className={`btn btn-sm ${isSelected ? 'btn-outline-secondary' : 'btn-dark'} py-1 px-2.5 flex-shrink-0`}
                      style={{ fontSize: '0.72rem', whiteSpace: 'nowrap' }}
                    >
                      + Thêm
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Thanh toán */}
      <div className="card border rounded-3 p-3 bg-white shadow-sm">
        <div className="fw-bold text-dark text-uppercase small mb-2 d-flex align-items-center gap-1.5" style={{ fontSize: '0.78rem' }}>
          <ShoppingBag size={14} /> Thanh toán
        </div>
        <div className="d-flex gap-2 mb-2.5">
          {['COD', 'BANK_TRANSFER'].map((m) => (
            <button
              key={m}
              type="button"
              className={`btn btn-sm flex-fill py-1.5 ${paymentMethod === m ? 'btn-dark' : 'btn-outline-secondary'}`}
              style={{ fontSize: '0.78rem', fontWeight: 600 }}
              onClick={() => setPaymentMethod(m)}
            >
              {m === 'COD' ? '💵 COD' : '🏦 Chuyển khoản'}
            </button>
          ))}
        </div>
        <div className="d-flex justify-content-between align-items-center text-muted mb-1.5" style={{ fontSize: '0.8rem' }}>
          <span>Tiền hàng</span>
          <span className="fw-semibold text-dark">{subtotal.toLocaleString('vi-VN')}đ</span>
        </div>
        <div className="d-flex justify-content-between align-items-center text-muted mb-1.5" style={{ fontSize: '0.8rem' }}>
          <span>Phí vận chuyển</span>
          <input
            type="number"
            className="form-control form-control-sm text-end"
            style={{ width: '110px' }}
            value={shippingFee}
            onChange={(e) => setShippingFee(e.target.value)}
          />
        </div>
        <div className="d-flex justify-content-between align-items-center text-muted mb-2" style={{ fontSize: '0.8rem' }}>
          <span>Giảm giá</span>
          <input
            type="number"
            className="form-control form-control-sm text-end"
            style={{ width: '110px' }}
            value={discountAmount}
            onChange={(e) => setDiscountAmount(e.target.value)}
          />
        </div>
        <div className="d-flex justify-content-between align-items-center pt-2 mt-2 border-top fw-bold text-dark" style={{ fontSize: '0.9rem' }}>
          <span>Tổng COD</span>
          <span style={{ color: 'var(--ara-gold-hover, #846B50)', fontSize: '1rem' }}>{total.toLocaleString('vi-VN')}đ</span>
        </div>
      </div>

      {/* Lỗi */}
      {error && <div className="alert alert-danger py-2 px-3 small mb-2">{error}</div>}

      {/* Actions */}
      <div className="d-flex gap-2 mt-1">
        <button
          type="button"
          disabled={loading || items.length === 0}
          onClick={() => handleCreate(false)}
          className="btn btn-sm btn-outline-secondary w-50 py-2 fw-semibold"
          style={{ fontSize: '0.8rem' }}
        >
          Lưu Đơn
        </button>
        <button
          type="button"
          disabled={loading || items.length === 0}
          onClick={() => handleCreate(true)}
          className="btn btn-sm btn-dark w-50 py-2 d-flex align-items-center justify-content-center gap-1.5 fw-semibold"
          style={{ fontSize: '0.8rem', background: 'var(--ara-noir, #1C1A17)', borderColor: 'var(--ara-noir, #1C1A17)' }}
        >
          {loading ? (
            <div className="spinner-border spinner-border-sm text-white" role="status" />
          ) : (
            <ShieldCheck size={14} />
          )}
          <span>Xác Nhận & Giữ Chỗ</span>
        </button>
      </div>
    </div>
  );
};

export default QuickOrderPanel;
