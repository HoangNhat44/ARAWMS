import React, { useState, useEffect } from 'react';
import { Search, PackageCheck, AlertTriangle, XCircle, Send, ShoppingBag } from 'lucide-react';
import { sellerService } from '../../services/sellerService';
import { SkeletonSkuCard } from '../common/Skeleton';

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
        <span className="badge-ara-danger d-inline-flex align-items-center gap-1">
          <XCircle size={12} /> Hết hàng (0)
        </span>
      );
    }
    if (sku.availableQty <= 10) {
      return (
        <span className="badge-ara-warning d-inline-flex align-items-center gap-1">
          <AlertTriangle size={12} /> Sắp hết ({sku.availableQty})
        </span>
      );
    }
    return (
      <span className="badge-ara-success d-inline-flex align-items-center gap-1">
        <PackageCheck size={12} /> Khả dụng ({sku.availableQty})
      </span>
    );
  };

  return (
    <div className="d-flex flex-column h-100">
      {/* Search Header */}
      <div className="mb-3">
        <form onSubmit={handleSearch} className="position-relative">
          <Search className="position-absolute" size={15} style={{ left: '10px', top: '10px', color: '#9F8365' }} />
          <input
            type="text"
            placeholder="Tìm theo mã SKU, tên mẫu, màu, size..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="form-control ara-input-search w-100"
          />
        </form>
      </div>

      {/* Content List */}
      <div className="flex-grow-1 overflow-auto d-flex flex-column gap-2.5">
        {loading && (
          <div className="d-flex flex-column gap-2">
            {[1, 2, 3].map((i) => <SkeletonSkuCard key={i} />)}
          </div>
        )}

        {error && <div className="alert alert-danger py-2 px-3 small">{error}</div>}

        {!loading && skus.length === 0 && (
          <div className="text-center py-5 text-muted small">
            Không tìm thấy sản phẩm phù hợp
          </div>
        )}

        {!loading &&
          skus.map((sku) => (
            <div
              key={sku.skuId}
              className="p-3 bg-white rounded border shadow-sm transition"
              style={{ borderColor: 'var(--ara-border, #E3D9CD)' }}
            >
              <div className="d-flex align-items-start justify-content-between gap-2 mb-2">
                <div>
                  <h6 className="fw-bold text-dark mb-1" style={{ fontSize: '0.88rem' }}>
                    {sku.styleName}
                  </h6>
                  <div className="d-flex align-items-center gap-2 text-muted" style={{ fontSize: '0.75rem' }}>
                    <span className="badge-ara-gold">{sku.skuCode}</span>
                    <span>Màu: <strong>{sku.color}</strong></span>
                    <span>Size: <strong style={{ color: 'var(--ara-gold-hover)' }}>{sku.size}</strong></span>
                  </div>
                </div>
                {getStatusBadge(sku)}
              </div>

              {/* Price & Quantity Breakdown */}
              <div className="d-flex align-items-center justify-content-between pt-2 border-top mt-2" style={{ fontSize: '0.78rem' }}>
                <div>
                  <span className="text-muted small">Giá bán: </span>
                  <span className="fw-bold" style={{ color: 'var(--ara-gold-hover)', fontSize: '0.88rem' }}>
                    {(sku.retailPrice || 0).toLocaleString('vi-VN')} đ
                  </span>
                </div>

                <div className="d-flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => onAttachSku && onAttachSku(sku)}
                    className="btn btn-sm btn-outline-secondary d-flex align-items-center gap-1"
                    style={{ fontSize: '0.72rem', padding: '0.25rem 0.55rem' }}
                    title="Gửi đính kèm vào khung Chat"
                  >
                    <Send size={12} />
                    <span>Chat</span>
                  </button>

                  <button
                    type="button"
                    disabled={sku.availableQty <= 0}
                    onClick={() => onAddToOrder && onAddToOrder(sku)}
                    className="btn-ara-primary d-flex align-items-center gap-1"
                    style={{ fontSize: '0.72rem', padding: '0.25rem 0.6rem' }}
                    title="Thêm vào đơn hàng nhanh"
                  >
                    <ShoppingBag size={12} />
                    <span>Lên đơn</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
};

export default SkuStockLookupWidget;
