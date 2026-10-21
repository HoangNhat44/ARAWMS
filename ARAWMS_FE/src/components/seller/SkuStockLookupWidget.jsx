import React, { useState, useEffect } from 'react';
import { Search, PackageCheck, AlertTriangle, XCircle, Send, PlusCircle } from 'lucide-react';
import { sellerService } from '../../services/sellerService';

const SkuStockLookupWidget = ({ onAttachSku, onAddToOrder }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [skus, setSkus] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchStock = async (query = '') => {
    try {
      setLoading(true);
      setError('');
      const res = await sellerService.lookupRealtimeStock(query);
      if (res.success) {
        setSkus(res.data || []);
      }
    } catch (err) {
      setError(err.message || 'Lỗi tra cứu tồn kho');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStock();
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    fetchStock(searchTerm);
  };

  const getStatusBadge = (sku) => {
    if (sku.availableQty <= 0) {
      return (
        <span className="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
          <XCircle size={12} /> Hết hàng (0)
        </span>
      );
    }
    if (sku.availableQty <= 10) {
      return (
        <span className="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
          <AlertTriangle size={12} /> Sắp hết ({sku.availableQty})
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
        <PackageCheck size={12} /> Khả dụng ({sku.availableQty})
      </span>
    );
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Search Header */}
      <div className="p-3 border-b border-gray-100">
        <form onSubmit={handleSearch} className="relative">
          <input
            type="text"
            placeholder="Tìm theo mã SKU, tên mẫu, màu, size..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
          />
          <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
        </form>
      </div>

      {/* Content List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {loading && <div className="text-center text-sm text-gray-500 py-6">Đang tra cứu dữ liệu kho...</div>}
        {error && <div className="text-xs text-red-600 bg-red-50 p-2.5 rounded-lg">{error}</div>}

        {!loading && skus.length === 0 && (
          <div className="text-center text-sm text-gray-400 py-8">Không tìm thấy sản phẩm phù hợp</div>
        )}

        {!loading &&
          skus.map((sku) => (
            <div
              key={sku.skuId}
              className="p-3 bg-gray-50 hover:bg-indigo-50/40 rounded-xl border border-gray-100 transition-all shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h4 className="font-semibold text-gray-900 text-sm">{sku.styleName}</h4>
                  <div className="flex items-center gap-2 mt-1 text-xs text-gray-600">
                    <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-gray-200 text-gray-700 font-medium">
                      {sku.skuCode}
                    </span>
                    <span>Màu: <strong>{sku.color}</strong></span>
                    <span>Size: <strong className="text-indigo-600 font-bold">{sku.size}</strong></span>
                  </div>
                </div>
                {getStatusBadge(sku)}
              </div>

              <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-gray-200/60 text-xs">
                <div>
                  <span className="text-gray-500">Giá bán: </span>
                  <strong className="text-indigo-600 text-sm">
                    {sku.retailPrice.toLocaleString('vi-VN')} đ
                  </strong>
                  <div className="text-[11px] text-gray-400">
                    Vật lý: {sku.onHandQty} | Giữ chỗ: {sku.reservedQty}
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  {onAttachSku && (
                    <button
                      type="button"
                      title="Gửi gợi ý vào khung chat"
                      onClick={() => onAttachSku(sku)}
                      className="p-1.5 text-gray-600 hover:text-indigo-600 hover:bg-white rounded-lg border border-gray-200 shadow-sm transition"
                    >
                      <Send size={14} />
                    </button>
                  )}
                  {onAddToOrder && (
                    <button
                      type="button"
                      disabled={sku.availableQty <= 0}
                      onClick={() => onAddToOrder(sku)}
                      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition ${
                        sku.availableQty > 0
                          ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm'
                          : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      }`}
                    >
                      <PlusCircle size={13} /> Thêm vào đơn
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
};

export default SkuStockLookupWidget;
