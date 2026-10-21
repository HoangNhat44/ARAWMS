import React, { useState } from 'react';
import { X, RotateCcw, CheckCircle2, AlertCircle } from 'lucide-react';
import { sellerService } from '../../services/sellerService';

const CreateRmaModal = ({ isOpen, onClose, order, onRmaCreated }) => {
  const [returnType, setReturnType] = useState('RETURN_FOR_REFUND');
  const [returnWaybillCode, setReturnWaybillCode] = useState('');
  const [reasonDescription, setReasonDescription] = useState('');
  const [selectedItems, setSelectedItems] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successRma, setSuccessRma] = useState(null);

  if (!isOpen || !order) return null;

  const handleQtyChange = (skuId, val) => {
    setSelectedItems({
      ...selectedItems,
      [skuId]: Math.max(0, Number(val)),
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const returnItems = [];
    for (const item of order.items || []) {
      const qty = selectedItems[item.skuId] || 0;
      if (qty > 0) {
        returnItems.push({
          skuId: item.skuId,
          skuBarcode: item.skuBarcode,
          returnedQty: qty,
          condition: 'GOOD_INTACT',
          disposition: 'RESTOCK_SALEABLE',
        });
      }
    }

    if (returnItems.length === 0) {
      setError('Vui lòng chọn số lượng ít nhất một sản phẩm cần hoàn/đổi');
      return;
    }

    try {
      setLoading(true);
      setError('');

      const res = await sellerService.createReturnRequest({
        originalOrderId: order._id,
        returnType,
        returnWaybillCode,
        reasonDescription,
        returnItems,
      });

      if (res.success) {
        setSuccessRma(res.data);
        if (onRmaCreated) onRmaCreated(res.data);
      }
    } catch (err) {
      setError(err.message || 'Lỗi khi tạo yêu cầu RMA');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-amber-600 to-amber-700 text-white">
          <div className="flex items-center gap-2">
            <RotateCcw size={18} />
            <h3 className="font-bold text-base">Tạo Phiếu Yêu Cầu Đổi / Trả (UC-82 RMA)</h3>
          </div>
          <button type="button" onClick={onClose} className="p-1 hover:bg-white/20 rounded-lg transition">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {error && <div className="p-2.5 bg-red-50 text-red-600 rounded-lg">{error}</div>}

          {successRma ? (
            <div className="py-8 text-center space-y-3">
              <CheckCircle2 size={54} className="text-emerald-500 mx-auto" />
              <h4 className="font-bold text-gray-900 text-base">Đã tạo phiếu RMA thành công!</h4>
              <p className="text-gray-500">
                Mã RMA: <strong className="font-mono text-amber-700 text-sm">{successRma.rmaCode}</strong>
              </p>
              <div className="p-3 bg-amber-50 text-amber-800 rounded-xl text-left space-y-1">
                <div className="font-semibold flex items-center gap-1">
                  <AlertCircle size={14} /> Lưu ý nghiệp vụ:
                </div>
                <div>Phiếu RMA đang ở trạng thái <strong>REQUESTED</strong>.</div>
                <div>Nhân viên kho sẽ quét kiện hoàn và kiểm đếm trước khi tái nhập kho.</div>
              </div>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-2 bg-amber-600 text-white font-semibold rounded-lg hover:bg-amber-700"
                >
                  Đóng
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="p-2.5 bg-gray-50 rounded-xl border border-gray-200">
                <span className="text-gray-500">Đơn hàng gốc: </span>
                <strong className="font-mono text-gray-900">{order.orderCode}</strong>
              </div>

              <div>
                <label className="block text-gray-700 font-semibold mb-1">Loại yêu cầu</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setReturnType('RETURN_FOR_REFUND')}
                    className={`py-2 px-3 rounded-xl border text-center font-medium transition ${
                      returnType === 'RETURN_FOR_REFUND'
                        ? 'border-amber-600 bg-amber-50 text-amber-800 font-bold'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    Trả hàng & Hoàn tiền
                  </button>
                  <button
                    type="button"
                    onClick={() => setReturnType('EXCHANGE_PRODUCT')}
                    className={`py-2 px-3 rounded-xl border text-center font-medium transition ${
                      returnType === 'EXCHANGE_PRODUCT'
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-800 font-bold'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    Đổi hàng (Đổi size/mẫu)
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-gray-700 font-semibold mb-1">Mã vận đơn chiều hoàn (nếu có)</label>
                <input
                  type="text"
                  placeholder="VD: GHN_RET_12345"
                  value={returnWaybillCode}
                  onChange={(e) => setReturnWaybillCode(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-gray-700 font-semibold mb-1">Lý do đổi / trả</label>
                <textarea
                  rows={2}
                  placeholder="Khách mặc chật size, muốn đổi sang size lớn hơn..."
                  value={reasonDescription}
                  onChange={(e) => setReasonDescription(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-gray-700 font-semibold mb-1">Chọn sản phẩm cần đổi/trả</label>
                <div className="space-y-2 border border-gray-100 rounded-xl p-2 bg-gray-50 max-h-40 overflow-y-auto">
                  {order.items?.map((it, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 bg-white rounded-lg border">
                      <div className="flex-1">
                        <div className="font-semibold">{it.skuCode}</div>
                        <div className="text-[11px] text-gray-400">Đã mua: {it.orderedQty} chiếc</div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-gray-500 text-[11px]">Số lượng trả:</span>
                        <input
                          type="number"
                          min="0"
                          max={it.orderedQty}
                          value={selectedItems[it.skuId] || 0}
                          onChange={(e) => handleQtyChange(it.skuId, e.target.value)}
                          className="w-16 px-2 py-1 border rounded text-center font-bold"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 border rounded-xl text-gray-600 hover:bg-gray-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 bg-amber-600 text-white rounded-xl font-semibold hover:bg-amber-700 disabled:opacity-50"
                >
                  {loading ? 'Đang tạo...' : 'Tạo Phiếu RMA (REQUESTED)'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default CreateRmaModal;
