import React, { useState, useEffect } from 'react';
import { Modal } from 'react-bootstrap';
import { X, Plus, Trash2, ShoppingBag, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { sellerService } from '../../services/sellerService';

const QuickOrderModal = ({ isOpen, onClose, customer, conversationId, initialItems = [], onOrderCreated }) => {
  const [recipient, setRecipient] = useState({
    name: '',
    phone: '',
    address: '',
  });
  const [items, setItems] = useState([]);
  const [shippingFee, setShippingFee] = useState(30000);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successOrder, setSuccessOrder] = useState(null);

  useEffect(() => {
    if (customer) {
      setRecipient({
        name: customer.fullName || '',
        phone: customer.phone || '',
        address: customer.addresses?.[0]?.fullAddress || '',
      });
    }
    if (initialItems && initialItems.length > 0) {
      setItems(
        initialItems.map((sku) => ({
          skuId: sku.skuId || sku._id,
          skuCode: sku.skuCode,
          styleName: sku.styleName,
          size: sku.size,
          color: sku.color,
          orderedQty: 1,
          unitSalePrice: sku.retailPrice || 0,
        }))
      );
    }
    if (!isOpen) {
      setSuccessOrder(null);
      setError('');
    }
  }, [customer, initialItems, isOpen]);

  const updateQuantity = (index, delta) => {
    const updated = [...items];
    const newQty = Math.max(1, (updated[index].orderedQty || 1) + delta);
    updated[index].orderedQty = newQty;
    setItems(updated);
  };

  const removeItem = (index) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const itemsSubtotal = items.reduce((sum, it) => sum + (it.orderedQty || 1) * (it.unitSalePrice || 0), 0);
  const totalAmount = Math.max(0, itemsSubtotal + Number(shippingFee || 0) - Number(discountAmount || 0));

  // UC-78: Tạo đơn hàng PENDING
  const handleCreateOrder = async (confirmReserve = false) => {
    if (!customer?._id) {
      setError('Thiếu thông tin khách hàng');
      return;
    }
    if (items.length === 0) {
      setError('Vui lòng thêm ít nhất một sản phẩm vào đơn');
      return;
    }

    try {
      setLoading(true);
      setError('');

      const orderPayload = {
        customerId: customer._id,
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

      const res = await sellerService.createDirectOrder(orderPayload);
      if (res.success) {
        let createdOrder = res.data;

        // UC-79: Nếu chọn Xác nhận & Giữ chỗ luôn
        if (confirmReserve) {
          const confirmRes = await sellerService.confirmOrderReserve(createdOrder._id);
          if (confirmRes.success) {
            createdOrder = confirmRes.data;
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

  return (
    <Modal
      show={isOpen}
      onHide={onClose}
      centered
      size="lg"
      contentClassName="ara-modal"
    >
      {/* Header */}
      <Modal.Header closeButton className="ara-modal-header">
        <Modal.Title className="d-flex align-items-center gap-2" style={{ fontFamily: 'var(--font-serif)', fontSize: '1.25rem' }}>
          <ShoppingBag size={22} color="var(--ara-gold, #9F8365)" />
          <span>Tạo Đơn Hàng Nhanh (UC-78 / UC-79)</span>
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
            {/* Recipient Details */}
            <div className="p-3 bg-white rounded border" style={{ borderColor: 'var(--ara-border)' }}>
              <div className="fw-bold text-dark mb-2" style={{ fontSize: '0.88rem' }}>
                Thông tin người nhận hàng
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
                    placeholder="Số điện thoại"
                    value={recipient.phone}
                    onChange={(e) => setRecipient({ ...recipient, phone: e.target.value })}
                    className="form-control form-control-sm"
                  />
                </div>
              </div>
              <input
                type="text"
                placeholder="Địa chỉ giao hàng chi tiết (Số nhà, đường, phường, quận...)"
                value={recipient.address}
                onChange={(e) => setRecipient({ ...recipient, address: e.target.value })}
                className="form-control form-control-sm"
              />
            </div>

            {/* Items in Order */}
            <div className="p-3 bg-white rounded border" style={{ borderColor: 'var(--ara-border)' }}>
              <div className="d-flex justify-content-between align-items-center mb-2">
                <span className="fw-bold text-dark" style={{ fontSize: '0.88rem' }}>
                  Sản phẩm trong đơn ({items.length})
                </span>
              </div>

              {items.length === 0 ? (
                <div className="text-center py-4 text-muted border border-dashed rounded bg-light small">
                  Chưa có sản phẩm nào. Hãy bấm "Lên đơn" ở tab Tra cứu tồn kho.
                </div>
              ) : (
                <div className="d-flex flex-column gap-2" style={{ maxHeight: '180px', overflowY: 'auto' }}>
                  {items.map((it, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 bg-light rounded border d-flex align-items-center justify-content-between gap-2"
                      style={{ fontSize: '0.8rem' }}
                    >
                      <div className="flex-grow-1 min-w-0">
                        <div className="fw-bold text-dark text-truncate">{it.styleName || it.skuCode}</div>
                        <div className="text-muted small">
                          Mã: {it.skuCode} | Màu: {it.color} | Size: <strong>{it.size}</strong>
                        </div>
                        <div className="fw-bold" style={{ color: 'var(--ara-gold-hover)' }}>
                          {Number(it.unitSalePrice).toLocaleString('vi-VN')} đ
                        </div>
                      </div>

                      <div className="d-flex align-items-center gap-1.5 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => updateQuantity(idx, -1)}
                          className="btn btn-sm btn-outline-secondary px-2 py-0 fw-bold"
                        >
                          -
                        </button>
                        <span className="px-1 fw-bold">{it.orderedQty}</span>
                        <button
                          type="button"
                          onClick={() => updateQuantity(idx, 1)}
                          className="btn btn-sm btn-outline-secondary px-2 py-0 fw-bold"
                        >
                          +
                        </button>
                        <button
                          type="button"
                          onClick={() => removeItem(idx)}
                          className="btn btn-sm btn-link text-danger p-1 ms-1"
                          title="Xóa sản phẩm"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Financial Summary */}
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
                <span style={{ color: 'var(--ara-gold-hover)' }}>{totalAmount.toLocaleString('vi-VN')} đ</span>
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
