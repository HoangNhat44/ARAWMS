import React, { useState, useEffect } from 'react';
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-indigo-600 to-indigo-700 text-white">
          <div className="flex items-center gap-2">
            <ShoppingBag size={20} />
            <h3 className="font-bold text-base">Tạo Đơn Hàng Nhanh (UC-78 / UC-79)</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 hover:bg-white/20 rounded-lg transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {error && <div className="p-2.5 bg-red-50 text-red-600 rounded-lg">{error}</div>}

          {successOrder ? (
            <div className="py-8 text-center space-y-3">
              <CheckCircle2 size={54} className="text-emerald-500 mx-auto" />
              <h4 className="font-bold text-gray-900 text-base">Tạo đơn hàng thành công!</h4>
              <p className="text-gray-500">
                Mã đơn hàng: <strong className="font-mono text-indigo-600 text-sm">{successOrder.orderCode}</strong>
              </p>
              <div className="inline-block px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full font-semibold">
                Trạng thái: {successOrder.status}
              </div>
              <div className="pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition"
                >
                  Đóng cửa sổ
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Recipient details */}
              <div className="space-y-2.5 p-3 bg-gray-50 rounded-xl border border-gray-100">
                <h4 className="font-bold text-gray-900">Thông tin người nhận</h4>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Họ tên người nhận"
                    value={recipient.name}
                    onChange={(e) => setRecipient({ ...recipient, name: e.target.value })}
                    className="px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg focus:outline-none"
                  />
                  <input
                    type="text"
                    placeholder="Số điện thoại"
                    value={recipient.phone}
                    onChange={(e) => setRecipient({ ...recipient, phone: e.target.value })}
                    className="px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg focus:outline-none"
                  />
                </div>
                <input
                  type="text"
                  placeholder="Địa chỉ nhận hàng chi tiết"
                  value={recipient.address}
                  onChange={(e) => setRecipient({ ...recipient, address: e.target.value })}
                  className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg focus:outline-none"
                />
              </div>

              {/* Items List */}
              <div className="space-y-2">
                <div className="flex justify-between items-center font-bold text-gray-900">
                  <span>Sản phẩm trong đơn ({items.length})</span>
                </div>

                {items.length === 0 ? (
                  <div className="text-center text-gray-400 py-4 border border-dashed rounded-lg">
                    Chưa có sản phẩm nào. Hãy bấm "Thêm vào đơn" ở tab Tra cứu tồn kho.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {items.map((it, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 bg-white border border-gray-200 rounded-xl flex items-center justify-between gap-2 shadow-2xs"
                      >
                        <div className="flex-1">
                          <div className="font-semibold text-gray-900">{it.styleName || it.skuCode}</div>
                          <div className="text-[11px] text-gray-500">
                            {it.skuCode} | Màu: {it.color} | Size: {it.size}
                          </div>
                          <div className="text-indigo-600 font-bold mt-0.5">
                            {Number(it.unitSalePrice).toLocaleString('vi-VN')} đ
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => updateQuantity(idx, -1)}
                            className="w-6 h-6 rounded bg-gray-100 hover:bg-gray-200 flex items-center justify-center font-bold"
                          >
                            -
                          </button>
                          <span className="w-6 text-center font-semibold">{it.orderedQty}</span>
                          <button
                            type="button"
                            onClick={() => updateQuantity(idx, 1)}
                            className="w-6 h-6 rounded bg-gray-100 hover:bg-gray-200 flex items-center justify-center font-bold"
                          >
                            +
                          </button>
                          <button
                            type="button"
                            onClick={() => removeItem(idx)}
                            className="p-1 text-gray-400 hover:text-red-500 ml-1"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Financial summary */}
              <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 space-y-2 text-xs">
                <div className="flex justify-between text-gray-600">
                  <span>Tiền hàng:</span>
                  <span className="font-semibold">{itemsSubtotal.toLocaleString('vi-VN')} đ</span>
                </div>
                <div className="flex justify-between items-center text-gray-600">
                  <span>Phí vận chuyển:</span>
                  <input
                    type="number"
                    value={shippingFee}
                    onChange={(e) => setShippingFee(e.target.value)}
                    className="w-24 px-2 py-0.5 bg-white border rounded text-right"
                  />
                </div>
                <div className="flex justify-between items-center text-gray-600">
                  <span>Chiết khấu / Giảm giá:</span>
                  <input
                    type="number"
                    value={discountAmount}
                    onChange={(e) => setDiscountAmount(e.target.value)}
                    className="w-24 px-2 py-0.5 bg-white border rounded text-right"
                  />
                </div>
                <div className="flex justify-between pt-2 border-t font-bold text-gray-900 text-sm">
                  <span>Tổng thanh toán (COD):</span>
                  <span className="text-indigo-600">{totalAmount.toLocaleString('vi-VN')} đ</span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer Actions */}
        {!successOrder && (
          <div className="p-4 border-t border-gray-100 flex items-center justify-end gap-2 bg-gray-50">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border rounded-xl text-gray-600 hover:bg-white text-xs font-semibold"
            >
              Hủy bỏ
            </button>
            <button
              type="button"
              disabled={loading || items.length === 0}
              onClick={() => handleCreateOrder(false)}
              className="px-4 py-2 bg-white border border-indigo-600 text-indigo-600 rounded-xl hover:bg-indigo-50 text-xs font-semibold disabled:opacity-50"
            >
              Lưu Đơn (PENDING)
            </button>
            <button
              type="button"
              disabled={loading || items.length === 0}
              onClick={() => handleCreateOrder(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 text-xs font-semibold disabled:opacity-50 shadow-sm"
            >
              <ShieldCheck size={14} /> Xác Nhận & Giữ Chỗ Kho (UC-79)
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default QuickOrderModal;
