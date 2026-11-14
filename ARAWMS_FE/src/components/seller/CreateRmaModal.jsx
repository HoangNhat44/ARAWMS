/**
 * ============================================================================
 * @title        : Advanced RMA Create Modal (Mentor Feedback 4.3.2)
 * @author       : AraStore Frontend Team
 * @createdDate  : 2026-10-27
 * @lastModified : 2026-11-14
 * @description  : Modal Đổi & Trả Hàng (RMA) hoàn thiện:
 *                 1. Cho phép Seller tự tìm kiếm & chọn đơn hàng cũ (theo Mã đơn / SĐT / Tên).
 *                 2. Chọn từng sản phẩm cụ thể cần đổi hoặc trả (Partial Return / Exchange).
 *                 3. Hoàn thiện hoàn tiền (Thông tin STK ngân hàng, lý do trả, mã vận đơn chiều về).
 *                 4. Xử lý đổi hàng: Tra cứu tồn kho SKU mới thay thế & tính chênh lệch tiền bù/hoàn.
 *                 5. Thống nhất trạng thái đơn sau đổi trả và tự động gửi thông báo Realtime cho Kho.
 * ============================================================================
 */

import React, { useState, useEffect } from 'react';
import {
  Modal, Form, Card, Alert, Button, ButtonGroup, ListGroup,
  Spinner, Row, Col, InputGroup, Badge, Table,
} from 'react-bootstrap';
import { sellerService } from '../../services/sellerService';
import { Icon, formatVnd } from './SellerUi';

/**
 * Lấy ID SKU dạng chuỗi từ dòng sản phẩm của đơn hàng.
 * API danh sách đơn populate items.skuId thành object nên phải lấy _id,
 * nếu không key bị trùng "[object Object]" và gửi lên server lỗi ObjectId.
 */
const STATUS_LABELS = {
  DRAFT: 'Bản nháp',
  PENDING: 'Chờ xác nhận',
  CONFIRMED_RESERVED: 'Đã xác nhận, đã giữ hàng',
  PICKING: 'Đang soạn hàng',
  PACKED: 'Đã đóng hàng, chờ bàn giao',
  HANDED_OVER_CARRIER: 'Đã bàn giao cho bên vận chuyển',
  CARRIER_PICKED_UP: 'Đã lấy hàng',
  DELIVERED: 'Đã giao thành công',
  COMPLETED: 'Hoàn thành (Bán tại quầy)',
  CANCELLED: 'Đã hủy',
  RETURN_REQUESTED: 'Khách yêu cầu trả hàng',
  EXCHANGE_REQUESTED: 'Đang đổi hàng',
  RETURNED: 'Đã hoàn về kho',
};

const skuKeyOf = (it) => String(it?.skuId?._id || it?.skuId || '');

const RETURN_TYPES = [
  { value: 'RETURN_FOR_REFUND', label: 'Trả Hàng Hoàn Tiền' },
  { value: 'EXCHANGE_PRODUCT', label: 'Đổi Sản Phẩm Mới' },
];

const COMMON_REASONS = [
  'Khách mặc không vừa size',
  'Sản phẩm bị lỗi vải, sút chỉ, đứt nút',
  'Giao nhầm màu, nhầm mã sản phẩm',
  'Khách không ưng phom dáng',
  'Hàng bị hư hỏng trong quá trình vận chuyển',
  'Khách đổi ý sang mẫu khác',
];

const CreateRmaModal = ({ isOpen, onClose, order: initialOrder, onRmaCreated }) => {
  const [currentOrder, setCurrentOrder] = useState(initialOrder || null);
  const [orderSearch, setOrderSearch] = useState('');
  const [searchingOrders, setSearchingOrders] = useState(false);
  const [foundOrders, setFoundOrders] = useState([]);

  const [returnType, setReturnType] = useState('RETURN_FOR_REFUND');
  const [returnWaybillCode, setReturnWaybillCode] = useState('');
  const [reasonDescription, setReasonDescription] = useState(COMMON_REASONS[0]);
  const [selectedItems, setSelectedItems] = useState({});

  // Refund banking & Customer name (luôn viết chữ IN HOA mặc định dù không bật CapsLock)
  const [customerReturnName, setCustomerReturnName] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountHolder, setAccountHolder] = useState('');

  // Exchange items selection
  const [exchangeSearch, setExchangeSearch] = useState('');
  const [exchangeSkuResults, setExchangeSkuResults] = useState([]);
  const [searchingSkus, setSearchingSkus] = useState(false);
  const [selectedExchangeSkus, setSelectedExchangeSkus] = useState([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successResult, setSuccessResult] = useState(null);
  const [sendingRefund, setSendingRefund] = useState(false);
  const [refundSent, setRefundSent] = useState(false);

  useEffect(() => {
    if (initialOrder) {
      if (!['DELIVERED', 'COMPLETED'].includes(initialOrder.status)) {
        setError('Không thể tạo yêu cầu đổi trả cho đơn hàng này vì đơn chưa giao thành công. Chức năng đổi hoặc trả hàng chỉ có thể thực hiện khi khách hàng đã nhận được hàng để đảm bảo có sản phẩm thực tế đối chiếu.');
        setCurrentOrder(null);
        return;
      }
      setCurrentOrder(initialOrder);
      const initName = (initialOrder.shippingRecipient?.name || initialOrder.customerId?.fullName || '').toUpperCase();
      setCustomerReturnName(initName);
      setAccountHolder(initName);
      // Mặc định chọn 1 món đầu tiên
      if (initialOrder.items && initialOrder.items.length > 0) {
        setSelectedItems({ [skuKeyOf(initialOrder.items[0])]: 1 });
      }
    } else {
      setCurrentOrder(null);
      setCustomerReturnName('');
      setSelectedItems({});
    }
    setError('');
    setSuccessResult(null);
    setRefundSent(false);
  }, [initialOrder, isOpen]);

  if (!isOpen) return null;

  // Gửi yêu cầu hoàn tiền cho Kế toán duyệt lập phiếu chi
  const handleSendRefundRequest = async () => {
    const rmaId = successResult?.rma?._id;
    if (!rmaId) return;
    try {
      setSendingRefund(true);
      setError('');
      const res = await sellerService.submitRefundRequest(rmaId, { note: reasonDescription });
      if (res.success) setRefundSent(true);
    } catch (err) {
      setError(err.message || 'Không gửi được yêu cầu hoàn tiền');
    } finally {
      setSendingRefund(false);
    }
  };

  // Tìm kiếm đơn hàng cũ
  const handleSearchOldOrders = async () => {
    if (!orderSearch.trim()) return;
    try {
      setSearchingOrders(true);
      setError('');
      const res = await sellerService.getOrderList({ search: orderSearch.trim(), limit: 10 });
      if (res.success) {
        setFoundOrders(res.data?.items || []);
        if ((res.data?.items || []).length === 0) {
          setError('Không tìm thấy đơn hàng nào khớp với từ khóa tìm kiếm');
        }
      }
    } catch (err) {
      setError(err.message || 'Lỗi tra cứu đơn hàng');
    } finally {
      setSearchingOrders(false);
    }
  };

  const handleSelectOrder = (ord) => {
    if (!['DELIVERED', 'COMPLETED'].includes(ord.status)) {
      setError(`Đơn hàng ${ord.orderCode} chưa giao thành công. Chức năng đổi hoặc trả hàng chỉ có thể thực hiện khi khách hàng đã nhận được hàng để đảm bảo có sản phẩm thực tế đối chiếu.`);
      return;
    }
    setCurrentOrder(ord);
    const initName = (ord.shippingRecipient?.name || ord.customerId?.fullName || '').toUpperCase();
    setCustomerReturnName(initName);
    if (!accountHolder) setAccountHolder(initName);
    setFoundOrders([]);
    setOrderSearch('');
    if (ord.items && ord.items.length > 0) {
      setSelectedItems({ [skuKeyOf(ord.items[0])]: 1 });
    }
  };

  // Điều chỉnh số lượng đổi/trả cho từng item
  const handleQtyChange = (skuId, val, maxQty) => {
    const num = Math.max(0, Math.min(Number(val) || 0, maxQty));
    setSelectedItems((prev) => ({
      ...prev,
      [skuId]: num,
    }));
  };

  // Tính tổng tiền hàng trả lại
  const calculatedReturnedValue = (currentOrder?.items || []).reduce((sum, item) => {
    const qty = selectedItems[skuKeyOf(item)] || 0;
    return sum + qty * (Number(item.unitSalePrice) || 0);
  }, 0);

  // Phân loại lỗi theo chuẩn BR.md: GBR-12 (Lỗi cửa hàng/xưởng -> miễn 100% phí) vs GBR-11 (Lỗi khách hàng -> phụ phí 10%)
  const isStoreFault = /lỗi vải|sút chỉ|đứt nút|lỗi xưởng|nhà sản xuất|giao nhầm|sai mẫu|sai màu|nhầm màu|nhầm mã|hư hỏng/i.test(
    reasonDescription || ''
  );
  const surchargeAmount = isStoreFault ? 0 : Math.round(calculatedReturnedValue * 0.1);
  const netRefundAmount = Math.max(0, calculatedReturnedValue - surchargeAmount);

  // Tra cứu SKU mới để đổi
  const handleSearchExchangeSkus = async (query) => {
    setExchangeSearch(query);
    if (!query || query.trim().length < 2) {
      setExchangeSkuResults([]);
      return;
    }
    try {
      setSearchingSkus(true);
      const res = await sellerService.lookupRealtimeStock(query.trim());
      if (res.success) {
        setExchangeSkuResults(res.data || []);
      }
    } catch {
      setExchangeSkuResults([]);
    } finally {
      setSearchingSkus(false);
    }
  };

  const handleAddExchangeSku = (sku) => {
    const exists = selectedExchangeSkus.find((s) => s._id === sku._id);
    if (exists) {
      setSelectedExchangeSkus((prev) =>
        prev.map((s) => (s._id === sku._id ? { ...s, qty: s.qty + 1 } : s))
      );
    } else {
      setSelectedExchangeSkus((prev) => [
        ...prev,
        {
          _id: sku._id,
          skuCode: sku.skuCode,
          skuBarcode: sku.skuBarcode,
          retailPrice: sku.retailPrice || 0,
          qty: 1,
          available: (sku.onHandQty || 0) - (sku.reservedQty || 0),
        },
      ]);
    }
    setExchangeSearch('');
    setExchangeSkuResults([]);
  };

  const handleRemoveExchangeSku = (skuId) => {
    setSelectedExchangeSkus((prev) => prev.filter((s) => s._id !== skuId));
  };

  // Tổng tiền hàng đổi mới
  const calculatedExchangeValue = selectedExchangeSkus.reduce(
    (sum, s) => sum + s.qty * s.retailPrice,
    0
  );

  // Chênh lệch: Dương -> Khách bù; Âm -> Hoàn lại khách
  const priceDifference = calculatedExchangeValue - calculatedReturnedValue;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!currentOrder) {
      setError('Vui lòng chọn một đơn hàng để thực hiện đổi/trả');
      return;
    }

    const returnItems = [];
    for (const item of currentOrder.items || []) {
      const qty = selectedItems[skuKeyOf(item)] || 0;
      if (qty > 0) {
        returnItems.push({
          skuId: skuKeyOf(item),
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

    if (returnType === 'EXCHANGE_PRODUCT' && selectedExchangeSkus.length === 0) {
      setError('Khi đổi sản phẩm, vui lòng chọn ít nhất một sản phẩm mới thay thế');
      return;
    }

    try {
      setLoading(true);
      setError('');

      const payload = {
        originalOrderId: currentOrder._id || currentOrder.id,
        returnType,
        returnWaybillCode: (returnWaybillCode || '').toUpperCase().trim(),
        reasonDescription,
        faultType: isStoreFault ? 'STORE_FAULT' : 'CUSTOMER_FAULT',
        returnItems,
        refundBanking:
          returnType === 'RETURN_FOR_REFUND'
            ? {
                bankName: bankName.trim(),
                accountNumber: accountNumber.trim(),
                accountHolder: (accountHolder || customerReturnName || '').toUpperCase().trim(),
              }
            : undefined,
      };

      const res = await sellerService.createReturnRequest(payload);
      if (res.success) {
        const rmaObj = res.data;
        let createdExchangeOrder = null;

        // Nếu là đổi sản phẩm và có chọn SKU mới -> Tự động kích hoạt tạo đơn đổi mới (UC-83)
        if (returnType === 'EXCHANGE_PRODUCT' && selectedExchangeSkus.length > 0) {
          try {
            const exRes = await sellerService.createExchangeOrder(rmaObj._id, {
              newItems: selectedExchangeSkus.map((s) => ({
                skuId: s._id,
                orderedQty: s.qty,
                unitSalePrice: s.retailPrice,
              })),
              shippingRecipient: {
                ...currentOrder.shippingRecipient,
                name: (customerReturnName || currentOrder.shippingRecipient?.name || '').toUpperCase().trim(),
              },
              shippingFee: 0,
            });
            if (exRes.success) {
              createdExchangeOrder = exRes.data;
            }
          } catch (exErr) {
            console.warn('Lỗi sinh đơn đổi tự động:', exErr.message);
          }
        }

        setSuccessResult({
          rma: rmaObj,
          exchangeOrder: createdExchangeOrder,
          returnType,
        });

        if (onRmaCreated) {
          onRmaCreated(rmaObj);
        }
      }
    } catch (err) {
      setError(err.message || 'Lỗi khi tạo yêu cầu đổi/trả');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal show={isOpen} onHide={onClose} centered size="lg" fullscreen="md-down" scrollable>
      <Modal.Header closeButton style={{ backgroundColor: '#FFFFFF', borderBottom: '1px solid var(--wms-border, #C8B9A6)' }}>
        <Modal.Title as="h6" className="d-flex align-items-center gap-2 fw-bold ara-headline" style={{ color: 'var(--wms-text-primary, #141210)' }}>
          <Icon name="arrow-counterclockwise" style={{ color: 'var(--wms-accent, #8A6A46)' }} />
          Xử Lý Yêu Cầu Đổi / Trả Hàng
        </Modal.Title>
      </Modal.Header>

      <Modal.Body style={{ backgroundColor: 'var(--wms-bg-app, #E8DFD3)', padding: '1.25rem' }}>
        {error && <Alert variant="danger" className="py-2 small">{error}</Alert>}

        {successResult ? (
          <div className="text-center py-4 bg-white rounded-3 p-4 border" style={{ borderColor: 'var(--wms-border, #C8B9A6)' }}>
            <Icon name="check-circle-fill" style={{ color: 'var(--wms-success, #006C4A)' }} className="display-4 d-block mb-3" />
            <h4 className="fw-bold" style={{ color: 'var(--wms-text-primary, #141210)' }}>
              Đã Tiếp Nhận Yêu Cầu Đổi / Trả Hàng!
            </h4>
            <div className="mb-3">
              Mã phiếu: <strong className="font-monospace fs-5 text-primary">{successResult.rma?.rmaCode}</strong>
            </div>

            {successResult.exchangeOrder && (
              <Alert variant="info" className="small text-start">
                <div className="fw-bold">Đã tạo đơn hàng đổi mới thành công:</div>
                <div>Mã đơn mới: <strong className="font-monospace">{successResult.exchangeOrder.orderCode}</strong></div>
                <div>Trạng thái: <strong>{STATUS_LABELS[successResult.exchangeOrder.status] || 'Đã xác nhận'}</strong></div>
              </Alert>
            )}

            <Alert variant="light" className="text-start small border">
              <div className="fw-bold text-dark mb-1 d-flex align-items-center gap-1">
                <Icon name="broadcast-pin" /> Hệ thống đã gửi thông báo cho Kho:
              </div>
              Phiếu đổi trả đang ở trạng thái <strong>Chờ xử lý</strong>. Nhân viên Kho đã nhận được thông báo để sẵn sàng kiểm đếm nhập lại kệ khi hàng về.
            </Alert>

            {successResult.returnType === 'RETURN_FOR_REFUND' && (
              <Alert variant={refundSent ? 'success' : 'warning'} className="text-start small border">
                <div className="fw-bold text-dark mb-1 d-flex align-items-center gap-1">
                  <Icon name="cash-coin" /> Hoàn tiền cho khách:
                </div>
                {refundSent ? (
                  <>Đã gửi yêu cầu hoàn tiền cho <strong>Kế toán</strong>. Kế toán sẽ duyệt và lập phiếu chi chuyển khoản cho khách.</>
                ) : (
                  <>
                    Seller <strong>không tự hoàn tiền</strong>. Bấm nút bên dưới để gửi yêu cầu cho Kế toán duyệt và tạo phiếu chi.
                    <div className="mt-2">
                      <Button size="sm" variant="dark" disabled={sendingRefund} onClick={handleSendRefundRequest}>
                        {sendingRefund ? <Spinner size="sm" animation="border" className="me-1" /> : <Icon name="send" className="me-1" />}
                        Gửi yêu cầu hoàn tiền cho Kế toán
                      </Button>
                    </div>
                  </>
                )}
              </Alert>
            )}

            <Button className="btn-wms-primary px-4 mt-2" onClick={onClose}>
              Đóng Cửa Sổ
            </Button>
          </div>
        ) : (
          <Form id="advanced-rma-form" onSubmit={handleSubmit} className="d-flex flex-column gap-3 small">
            {/* 1. Tra cứu & Chọn đơn hàng cũ */}
            <Card body className="border shadow-sm bg-white">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <span className="fw-bold text-dark">
                  <Icon name="receipt" className="me-1" /> 1. Đơn hàng gốc cần đổi / trả:
                </span>
                {currentOrder && (
                  <Button
                    size="sm"
                    variant="link"
                    className="p-0 text-decoration-none small text-muted"
                    onClick={() => setCurrentOrder(null)}
                  >
                    Đổi đơn khác
                  </Button>
                )}
              </div>

              {currentOrder ? (
                <div className="p-2 rounded bg-light border">
                  <div className="d-flex justify-content-between align-items-center">
                    <div>
                      <span className="font-monospace fw-bold fs-6 text-dark">{currentOrder.orderCode}</span>
                      <Badge bg="secondary" className="ms-2">{STATUS_LABELS[currentOrder.status] || currentOrder.status}</Badge>
                    </div>
                    <div className="fw-semibold text-danger">
                      {formatVnd(currentOrder.financialSummary?.totalOrderAmount || 0)}
                    </div>
                  </div>
                  <div className="text-muted mt-1">
                    Khách: <strong>{currentOrder.shippingRecipient?.name}</strong> | SĐT: {currentOrder.shippingRecipient?.phone}
                  </div>
                  <div className="text-muted text-truncate">
                    Địa chỉ: {currentOrder.shippingRecipient?.address || '-'}
                  </div>
                </div>
              ) : (
                <div>
                  <InputGroup size="sm">
                    <Form.Control
                      placeholder="Nhập mã đơn hàng hoặc SĐT khách hàng cũ..."
                      value={orderSearch}
                      onChange={(e) => setOrderSearch(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSearchOldOrders(); } }}
                    />
                    <Button variant="dark" onClick={handleSearchOldOrders} disabled={searchingOrders}>
                      {searchingOrders ? <Spinner animation="border" size="sm" /> : <><Icon name="search" /> Tìm đơn</>}
                    </Button>
                  </InputGroup>

                  {foundOrders.length > 0 && (
                    <ListGroup className="mt-2" style={{ maxHeight: 180, overflowY: 'auto' }}>
                      {foundOrders.map((ord) => (
                        <ListGroup.Item
                          key={ord._id || ord.id}
                          action
                          onClick={() => handleSelectOrder(ord)}
                          className="d-flex justify-content-between align-items-center py-2"
                        >
                          <div>
                            <span className="font-monospace fw-bold">{ord.orderCode}</span>
                            <span className="text-muted ms-2">{ord.shippingRecipient?.name} - {ord.shippingRecipient?.phone}</span>
                          </div>
                          <Badge bg="primary">{STATUS_LABELS[ord.status] || ord.status}</Badge>
                        </ListGroup.Item>
                      ))}
                    </ListGroup>
                  )}
                </div>
              )}
            </Card>

            {/* 2. Loại yêu cầu: Đổi hàng hay Trả hàng */}
            {currentOrder && (
              <>
                <Card body className="border shadow-sm bg-white">
                  <div className="fw-bold mb-2 text-dark">2. Hình thức xử lý:</div>
                  <ButtonGroup className="w-100">
                    {RETURN_TYPES.map((t) => (
                      <Button
                        key={t.value}
                        size="sm"
                        className={returnType === t.value ? 'btn-wms-primary' : 'btn-wms-default'}
                        onClick={() => setReturnType(t.value)}
                      >
                        {t.label}
                      </Button>
                    ))}
                  </ButtonGroup>
                </Card>

                {/* 3. Chọn sản phẩm cụ thể cần đổi / trả */}
                <Card className="border shadow-sm bg-white overflow-hidden">
                  <Card.Header className="fw-bold py-2 bg-light d-flex justify-content-between align-items-center">
                    <span>3. Chọn sản phẩm cần {returnType === 'EXCHANGE_PRODUCT' ? 'đổi' : 'trả'} trong đơn:</span>
                    <span className="text-muted small">Khách có thể đổi 1 phần hoặc toàn bộ</span>
                  </Card.Header>
                  <ListGroup variant="flush">
                    {currentOrder.items?.map((it) => {
                      const selectedQty = selectedItems[skuKeyOf(it)] || 0;
                      const isChecked = selectedQty > 0;
                      return (
                        <ListGroup.Item key={skuKeyOf(it)} className="d-flex align-items-center justify-content-between gap-2 py-2">
                          <div className="d-flex align-items-center gap-2">
                            <Form.Check
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                handleQtyChange(skuKeyOf(it), e.target.checked ? 1 : 0, it.orderedQty);
                              }}
                            />
                            <div>
                              <div className="fw-bold text-dark">{it.skuCode}</div>
                              <div className="text-muted">
                                Đã mua: <strong>{it.orderedQty}</strong> cái | Đơn giá: {formatVnd(it.unitSalePrice)}
                              </div>
                            </div>
                          </div>

                          <div className="d-flex align-items-center gap-2">
                            <span className="text-muted">Số lượng hoàn:</span>
                            <Form.Control
                              type="number"
                              size="sm"
                              min="0"
                              max={it.orderedQty}
                              value={selectedQty}
                              onChange={(e) => handleQtyChange(skuKeyOf(it), e.target.value, it.orderedQty)}
                              className="text-center"
                              style={{ width: 60 }}
                            />
                          </div>
                        </ListGroup.Item>
                      );
                    })}
                  </ListGroup>
                  <Card.Footer className="bg-light py-2 d-flex justify-content-between align-items-center">
                    <span>Tổng giá trị hàng hoàn gửi về:</span>
                    <strong className="text-primary fs-6">{formatVnd(calculatedReturnedValue)}</strong>
                  </Card.Footer>
                </Card>

                {/* 4. Nếu là ĐỔI HÀNG: Cho phép chọn sản phẩm mới thay thế */}
                {returnType === 'EXCHANGE_PRODUCT' && (
                  <Card className="border shadow-sm bg-white">
                    <Card.Header className="fw-bold py-2 bg-light d-flex justify-content-between align-items-center">
                      <span>4. Chọn sản phẩm mới gửi cho khách:</span>
                      <Badge bg="success">Tồn kho Realtime</Badge>
                    </Card.Header>
                    <Card.Body>
                      <InputGroup size="sm" className="mb-2">
                        <Form.Control
                          placeholder="Gõ mã SKU hoặc tên sản phẩm mới..."
                          value={exchangeSearch}
                          onChange={(e) => handleSearchExchangeSkus(e.target.value)}
                        />
                        {searchingSkus && (
                          <InputGroup.Text><Spinner animation="border" size="sm" /></InputGroup.Text>
                        )}
                      </InputGroup>

                      {exchangeSkuResults.length > 0 && (
                        <ListGroup className="mb-3 border" style={{ maxHeight: 150, overflowY: 'auto' }}>
                          {exchangeSkuResults.map((sku) => {
                            const avail = (sku.onHandQty || 0) - (sku.reservedQty || 0);
                            return (
                              <ListGroup.Item
                                key={sku._id}
                                action
                                disabled={avail <= 0}
                                onClick={() => handleAddExchangeSku(sku)}
                                className="d-flex justify-content-between align-items-center py-1"
                              >
                                <div>
                                  <span className="fw-bold">{sku.skuCode}</span> - {sku.styleName || sku.productName}
                                  <span className="text-muted ms-2">{formatVnd(sku.retailPrice)}</span>
                                </div>
                                <Badge bg={avail > 0 ? 'success' : 'danger'}>
                                  {avail > 0 ? `Còn ${avail}` : 'Hết hàng'}
                                </Badge>
                              </ListGroup.Item>
                            );
                          })}
                        </ListGroup>
                      )}

                      {/* Danh sách các món mới đã chọn để gửi đổi */}
                      {selectedExchangeSkus.length > 0 ? (
                        <Table size="sm" bordered responsive className="mb-2 align-middle">
                          <thead className="table-light">
                            <tr>
                              <th>SKU mới</th>
                              <th>Đơn giá</th>
                              <th style={{ width: 80 }}>SL</th>
                              <th>Thành tiền</th>
                              <th style={{ width: 40 }} />
                            </tr>
                          </thead>
                          <tbody>
                            {selectedExchangeSkus.map((s) => (
                              <tr key={s._id}>
                                <td className="font-monospace fw-semibold">{s.skuCode}</td>
                                <td>{formatVnd(s.retailPrice)}</td>
                                <td>
                                  <Form.Control
                                    type="number"
                                    size="sm"
                                    min="1"
                                    max={s.available}
                                    value={s.qty}
                                    onChange={(e) => {
                                      const q = Math.max(1, Number(e.target.value) || 1);
                                      setSelectedExchangeSkus((prev) =>
                                        prev.map((item) => (item._id === s._id ? { ...item, qty: q } : item))
                                      );
                                    }}
                                  />
                                </td>
                                <td className="fw-bold">{formatVnd(s.qty * s.retailPrice)}</td>
                                <td>
                                  <Button
                                    size="sm"
                                    variant="link"
                                    className="text-danger p-0"
                                    onClick={() => handleRemoveExchangeSku(s._id)}
                                  >
                                    <Icon name="x-circle" />
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </Table>
                      ) : (
                        <div className="text-center py-2 text-muted fst-italic">
                          Chưa chọn sản phẩm mới. Tìm kiếm ở trên để thêm sản phẩm đổi.
                        </div>
                      )}

                      {/* Tính toán chênh lệch giá */}
                      <div className="p-2 rounded bg-light border d-flex justify-content-between align-items-center">
                        <div>
                          <div>Tổng tiền hàng mới: <strong>{formatVnd(calculatedExchangeValue)}</strong></div>
                          <div>Giá trị hàng cũ trả lại: <strong>{formatVnd(calculatedReturnedValue)}</strong></div>
                        </div>
                        <div className="text-end">
                          <div className="small text-muted">Chênh lệch tài chính:</div>
                          {priceDifference > 0 ? (
                            <span className="fw-bold text-danger fs-6">
                              Khách bù thêm: {formatVnd(priceDifference)}
                            </span>
                          ) : priceDifference < 0 ? (
                            <span className="fw-bold text-success fs-6">
                              Hoàn lại khách: {formatVnd(Math.abs(priceDifference))}
                            </span>
                          ) : (
                            <span className="fw-bold text-muted fs-6">Ngang giá</span>
                          )}
                        </div>
                      </div>
                    </Card.Body>
                  </Card>
                )}

                 {/* 5. Thông tin người đổi trả & tài khoản hoàn tiền */}
                <Card body className="border shadow-sm bg-white">
                  <div className="fw-bold mb-2 text-dark d-flex justify-content-between align-items-center">
                    <span>5. Thông tin khách hàng đổi / trả &amp; Tài khoản nhận hoàn tiền:</span>
                    <Badge bg="secondary" className="fw-normal">Tên tự động viết IN HOA</Badge>
                  </div>
                  <Row className="g-2 mb-2">
                    <Col md={12}>
                      <Form.Label className="small text-muted mb-1">
                        Họ tên người đổi / trả
                      </Form.Label>
                      <Form.Control
                        size="sm"
                        placeholder="NGUYEN VAN A..."
                        style={{ textTransform: 'uppercase', fontWeight: 600 }}
                        value={customerReturnName}
                        onChange={(e) => {
                          const upper = e.target.value.toUpperCase();
                          setCustomerReturnName(upper);
                          if (!accountHolder || accountHolder === customerReturnName) {
                            setAccountHolder(upper);
                          }
                        }}
                        required
                      />
                    </Col>
                  </Row>

                  {returnType === 'RETURN_FOR_REFUND' && (
                    <>
                      <Row className="g-2">
                        <Col md={4}>
                          <Form.Label className="small text-muted mb-1">Ngân hàng</Form.Label>
                          <Form.Control
                            size="sm"
                            placeholder="VD: Vietcombank, MB, Techcombank..."
                            value={bankName}
                            onChange={(e) => setBankName(e.target.value)}
                            required
                          />
                        </Col>
                        <Col md={4}>
                          <Form.Label className="small text-muted mb-1">Số tài khoản</Form.Label>
                          <Form.Control
                            size="sm"
                            placeholder="Số tài khoản nhận..."
                            value={accountNumber}
                            onChange={(e) => setAccountNumber(e.target.value)}
                            required
                          />
                        </Col>
                        <Col md={4}>
                          <Form.Label className="small text-muted mb-1">Tên chủ tài khoản</Form.Label>
                          <Form.Control
                            size="sm"
                            placeholder="NGUYEN VAN A..."
                            style={{ textTransform: 'uppercase', fontWeight: 600 }}
                            value={accountHolder}
                            onChange={(e) => setAccountHolder(e.target.value.toUpperCase())}
                            required
                          />
                        </Col>
                      </Row>

                      {/* Bảng tính hoàn tiền tự động */}
                      <div className="mt-2 p-2 rounded bg-light border small">
                        <div className="d-flex justify-content-between align-items-center mb-1">
                          <span className="fw-semibold text-dark">Quy tắc nghiệp vụ áp dụng:</span>
                          <Badge bg={isStoreFault ? 'success' : 'warning'} text={isStoreFault ? 'light' : 'dark'}>
                            {isStoreFault
                              ? 'Lỗi xưởng hoặc cửa hàng - Miễn phí hoàn trả'
                              : 'Lỗi khách hoặc đổi ý - Phụ phí 10%'}
                          </Badge>
                        </div>
                        <div className="d-flex justify-content-between text-muted">
                          <span>Tổng giá trị sản phẩm trả:</span>
                          <strong>{formatVnd(calculatedReturnedValue)}</strong>
                        </div>
                        <div className="d-flex justify-content-between text-muted">
                          <span>Phụ phí hoàn trả:</span>
                          <strong className={surchargeAmount > 0 ? 'text-danger' : 'text-success'}>
                            -{formatVnd(surchargeAmount)}
                          </strong>
                        </div>
                        <div className="d-flex justify-content-between border-top pt-1 mt-1 fw-bold text-dark">
                          <span>Số tiền hoàn thực nhận:</span>
                          <span className="text-primary fs-6">{formatVnd(netRefundAmount)}</span>
                        </div>
                      </div>
                    </>
                  )}
                </Card>

                {/* 6. Lý do đổi trả & Vận đơn chiều về */}
                <Card body className="border shadow-sm bg-white">
                  {returnType === 'RETURN_FOR_REFUND' && (
                    <Form.Group className="mb-2">
                      <Form.Label className="fw-bold text-dark mb-1">
                        Mã vận đơn đối chiếu gửi về
                      </Form.Label>
                      <Form.Control
                        size="sm"
                        placeholder="Nhập mã vận đơn đối chiếu gửi về..."
                        style={{ textTransform: 'uppercase' }}
                        value={returnWaybillCode}
                        onChange={(e) => setReturnWaybillCode(e.target.value.toUpperCase())}
                      />
                    </Form.Group>
                  )}

                  <Form.Group>
                    <Form.Label className="fw-bold text-dark mb-1">
                      Lý do đổi / trả hàng
                    </Form.Label>
                    <Form.Select
                      size="sm"
                      className="mb-1"
                      value={reasonDescription}
                      onChange={(e) => setReasonDescription(e.target.value)}
                    >
                      {COMMON_REASONS.map((r, i) => (
                        <option key={i} value={r}>{r}</option>
                      ))}
                      <option value="Lý do khác">Lý do khác...</option>
                    </Form.Select>
                    {reasonDescription === 'Lý do khác' && (
                      <Form.Control
                        as="textarea"
                        rows={2}
                        size="sm"
                        placeholder="Mô tả cụ thể lý do khách muốn đổi/trả..."
                        onChange={(e) => setReasonDescription(e.target.value)}
                        required
                      />
                    )}
                  </Form.Group>
                </Card>
              </>
            )}
          </Form>
        )}
      </Modal.Body>

      {!successResult && (
        <Modal.Footer style={{ backgroundColor: 'var(--wms-bg-subtle, #F3EDE4)', borderTop: '1px solid var(--wms-border, #C8B9A6)' }}>
          <Button size="sm" variant="secondary" onClick={onClose}>
            Hủy bỏ
          </Button>
          <Button
            size="sm"
            className="btn-wms-primary"
            type="submit"
            form="advanced-rma-form"
            disabled={loading || !currentOrder}
          >
            {loading ? <><Spinner animation="border" size="sm" className="me-1" />Đang xử lý...</> : 'Tạo Phiếu Đổi / Trả Hàng'}
          </Button>
        </Modal.Footer>
      )}
    </Modal>
  );
};

export default CreateRmaModal;
