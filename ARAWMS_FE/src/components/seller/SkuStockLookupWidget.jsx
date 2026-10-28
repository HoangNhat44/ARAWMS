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
      return <Badge bg="danger-subtle" text="danger-emphasis"><Icon name="x-circle" /> Hết hàng (0)</Badge>;
    }
    if (sku.availableQty <= 10) {
      return <Badge bg="warning-subtle" text="warning-emphasis"><Icon name="exclamation-triangle" /> Sắp hết ({sku.availableQty})</Badge>;
    }
    return <Badge bg="success-subtle" text="success-emphasis"><Icon name="box-seam" /> Khả dụng ({sku.availableQty})</Badge>;
  };

  return (
    <div className="d-flex flex-column h-100">
      {/* Search Header */}
      <Form onSubmit={handleSearch} className="mb-3">
        <InputGroup>
          <InputGroup.Text className="bg-white"><Icon name="search" /></InputGroup.Text>
          <Form.Control
            placeholder="Tìm theo mã SKU, tên mẫu, màu, size..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </InputGroup>
      </Form>

      {/* Content List */}
      <Stack gap={2} className="flex-grow-1 overflow-auto">
        {loading && [1, 2, 3].map((i) => <SkeletonSkuCard key={i} />)}

        {error && <Alert variant="danger" className="py-2 small">{error}</Alert>}

        {!loading && skus.length === 0 && (
          <div className="text-center py-5 text-secondary small">Không tìm thấy sản phẩm phù hợp</div>
        )}

        {!loading &&
          skus.map((sku) => (
            <Card key={sku.skuId} className="shadow-sm small">
              <Card.Body className="pb-2">
                <div className="d-flex align-items-start justify-content-between gap-2">
                  <div>
                    <Card.Title as="h6" className="fw-bold mb-1">{sku.styleName}</Card.Title>
                    <Stack direction="horizontal" gap={2} className="text-secondary">
                      <Badge bg="warning-subtle" text="warning-emphasis">{sku.skuCode}</Badge>
                      <span>Màu: <strong>{sku.color}</strong></span>
                      <span>Size: <strong className="text-warning-emphasis">{sku.size}</strong></span>
                    </Stack>
                  </div>
                  {getStatusBadge(sku)}
                </div>
              </Card.Body>

              {/* Price & Quantity Breakdown */}
              <Card.Footer className="bg-white d-flex align-items-center justify-content-between">
                <div>
                  <span className="text-secondary">Giá bán: </span>
                  <span className="fw-bold text-warning-emphasis">{formatVnd(sku.retailPrice)}</span>
                </div>
                <Stack direction="horizontal" gap={1}>
                  <Button
                    size="sm"
                    variant="outline-secondary"
                    onClick={() => onAttachSku && onAttachSku(sku)}
                    title="Gửi đính kèm vào khung Chat"
                  >
                    <Icon name="send" className="me-1" />Chat
                  </Button>
                  <Button
                    size="sm"
                    variant="dark"
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
