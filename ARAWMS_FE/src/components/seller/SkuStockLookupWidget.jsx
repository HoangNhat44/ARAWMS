/**
 * ============================================================================
 * @title        : SKU Stock Lookup Widget (UC-77)
 * @author       : Nguyễn Quang Huy
 * @createdDate  : 2026-10-27
 * @lastModified : 2026-10-28
 * @description  : Tra cứu tồn kho khả dụng realtime theo SKU, gửi SKU vào chat hoặc thêm vào đơn.
 *                 (Refactor 2026-10-28: giao diện chỉ dùng Bootstrap / React-Bootstrap.)
 * @module       : Conversational Commerce / Inventory Widget
 * @layer        : Front-end
 * ============================================================================
 */

import React, { useState, useEffect } from 'react';
import { Form, InputGroup, Card, Badge, Button, Alert, Stack } from 'react-bootstrap';
import { sellerService } from '../../services/sellerService';
import { SkeletonSkuCard } from '../common/Skeleton';
import { Icon, formatVnd } from './SellerUi';

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
        <span className="ara-badge ara-badge-cancelled d-inline-flex align-items-center gap-1">
          <Icon name="x-circle" /> Hết hàng (0)
        </span>
      );
    }
    if (sku.availableQty <= 10) {
      return (
        <span className="ara-badge ara-badge-pending d-inline-flex align-items-center gap-1">
          <Icon name="exclamation-triangle" /> Sắp hết ({sku.availableQty})
        </span>
      );
    }
    return (
      <span className="ara-badge ara-badge-delivered d-inline-flex align-items-center gap-1">
        <Icon name="box-seam" /> Khả dụng ({sku.availableQty})
      </span>
    );
  };

  return (
    <div className="d-flex flex-column h-100">
      {/* Search Header */}
      <Form onSubmit={handleSearch} className="mb-3">
        <InputGroup>
          <InputGroup.Text style={{ backgroundColor: 'var(--wms-bg-subtle, #F3EDE4)', borderColor: 'var(--wms-border, #C8B9A6)', color: 'var(--wms-text-secondary, #574F46)' }}>
            <Icon name="search" />
          </InputGroup.Text>
          <Form.Control
            placeholder="Tìm theo mã SKU, tên mẫu, màu, size..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ borderColor: 'var(--wms-border, #C8B9A6)' }}
          />
        </InputGroup>
      </Form>

      {/* Content List */}
      <Stack gap={2} className="flex-grow-1 overflow-auto">
        {loading && [1, 2, 3].map((i) => <SkeletonSkuCard key={i} />)}

        {error && <Alert variant="danger" className="py-2 small">{error}</Alert>}

        {!loading && skus.length === 0 && (
          <div className="text-center py-5 small" style={{ color: 'var(--wms-text-secondary, #574F46)' }}>
            Không tìm thấy sản phẩm phù hợp
          </div>
        )}

        {!loading &&
          skus.map((sku) => (
            <Card
              key={sku.skuId}
              className="shadow-sm small"
              style={{
                border: '1px solid var(--wms-border, #C8B9A6)',
                borderRadius: '6px',
                backgroundColor: 'var(--wms-bg-surface, #FFFFFF)'
              }}
            >
              <Card.Body className="pb-2">
                <div className="d-flex align-items-start justify-content-between gap-2">
                  <div>
                    <Card.Title as="h6" className="fw-bold mb-1" style={{ color: 'var(--wms-primary, #141210)' }}>
                      {sku.styleName}
                    </Card.Title>
                    <Stack direction="horizontal" gap={2} style={{ color: 'var(--wms-text-secondary, #574F46)' }}>
                      <span className="font-monospace fw-semibold px-2 py-0 rounded" style={{ backgroundColor: 'var(--wms-primary-subtle, #EFE6DA)', color: 'var(--wms-accent-deep, #6E5233)', border: '1px solid var(--wms-border, #C8B9A6)', fontSize: '0.75rem' }}>
                        {sku.skuCode}
                      </span>
                      <span>Màu: <strong style={{ color: 'var(--wms-primary, #141210)' }}>{sku.color}</strong></span>
                      <span>Size: <strong style={{ color: 'var(--wms-accent, #8A6A46)' }}>{sku.size}</strong></span>
                    </Stack>
                  </div>
                  {getStatusBadge(sku)}
                </div>
              </Card.Body>

              {/* Price & Quantity Breakdown */}
              <Card.Footer
                className="d-flex align-items-center justify-content-between"
                style={{
                  backgroundColor: 'var(--wms-bg-subtle, #F3EDE4)',
                  borderTop: '1px solid var(--wms-border, #C8B9A6)',
                  padding: '8px 12px'
                }}
              >
                <div>
                  <span style={{ color: 'var(--wms-text-secondary, #574F46)' }}>Giá bán: </span>
                  <span className="fw-bold" style={{ color: 'var(--wms-accent, #8A6A46)', fontSize: '0.95rem' }}>
                    {formatVnd(sku.retailPrice)}
                  </span>
                </div>
                <Stack direction="horizontal" gap={1}>
                  <Button
                    size="sm"
                    className="btn-wms-default"
                    onClick={() => onAttachSku && onAttachSku(sku)}
                    title="Gửi đính kèm vào khung Chat"
                  >
                    <Icon name="send" className="me-1" />Chat
                  </Button>
                  <Button
                    size="sm"
                    className="btn-wms-primary"
                    disabled={sku.availableQty <= 0}
                    onClick={() => onAddToOrder && onAddToOrder(sku)}
                    title="Thêm vào đơn hàng nhanh"
                  >
                    <Icon name="bag-plus" className="me-1" />Lên đơn
                  </Button>
                </Stack>
              </Card.Footer>
            </Card>
          ))}
      </Stack>
    </div>
  );
};

export default SkuStockLookupWidget;
