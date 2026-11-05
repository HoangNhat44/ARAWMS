/**
 * ============================================================================
 * @title        : Marketplace Order Import Modal (Mentor Feedback 4.3.3)
 * @author       : AraStore Frontend Team
 * @createdDate  : 2026-11-02
 * @description  : Modal Import đơn hàng Shopee, TikTok Shop và File Excel:
 *                 - Hỗ trợ đa kênh: Nhiều Facebook Page, Nhiều TikTok Shop, Shopee Mall.
 *                 - Tải file Excel mẫu chuẩn (Hỗ trợ định dạng xuất đơn Shopee/TikTok 14 cột & ARA 9 cột).
 *                 - Tự động nhận diện tiêu đề cột (Flexible Header Auto-Detection).
 *                 - Ghép SKU thông minh và cho phép Seller ghép thủ công trực tiếp nếu SKU chưa có sẵn.
 *                 - Thực hiện "Xử lý đơn" -> Chuyển sang hàng đợi Kho duyệt lại.
 * ============================================================================
 */

import React, { useState, useEffect } from 'react';
import {
  Modal, Form, Card, Alert, Button, Badge, Spinner, Table, Row, Col, Stack, InputGroup,
} from 'react-bootstrap';
import { sellerService } from '../../services/sellerService';
import { Icon, formatVnd } from './SellerUi';

const MarketplaceOrderImportModal = ({ isOpen, onClose, onImportSuccess }) => {
  const [channels, setChannels] = useState([]);
  const [selectedChannel, setSelectedChannel] = useState('SHOPEE');
  const [selectedSourceId, setSelectedSourceId] = useState('');
  const [file, setFile] = useState(null);

  const [parsing, setParsing] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [provisioning, setProvisioning] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [error, setError] = useState('');
  const [successInfo, setSuccessInfo] = useState(null);

  // Modal hỗ trợ ghép SKU kho khi sản phẩm chưa khớp tự động
  const [skuModalOpen, setSkuModalOpen] = useState(false);
  const [activeItemTarget, setActiveItemTarget] = useState(null);
  const [skuSearchQuery, setSkuSearchQuery] = useState('');
  const [skuList, setSkuList] = useState([]);
  const [searchingSku, setSearchingSku] = useState(false);
  const [applyToAllSameName, setApplyToAllSameName] = useState(true);

  // Tải danh sách cấu hình đa kênh từ Backend
  useEffect(() => {
    if (isOpen) {
      loadChannels();
      setPreviewData(null);
      setError('');
      setSuccessInfo(null);
      setFile(null);
      setSkuModalOpen(false);
      setActiveItemTarget(null);
    }
  }, [isOpen]);

  const loadChannels = async () => {
    try {
      const res = await sellerService.getMarketplaceChannels();
      if (res.success && res.data) {
        setChannels(res.data);
        const first = res.data[0];
        if (first) {
          setSelectedChannel(first.channel);
          setSelectedSourceId(first.sourceId);
        }
      }
    } catch (err) {
      console.warn('Lỗi tải danh mục kênh:', err.message);
    }
  };

  if (!isOpen) return null;

  // Lọc nguồn theo kênh đã chọn
  const availableSources = channels.filter((c) => c.channel === selectedChannel);
  const activeSourceObj = channels.find((c) => c.sourceId === selectedSourceId);

  // Tải file template (Xử lý an toàn nhị phân Blob, khắc phục hoàn toàn lỗi mở file Excel bị hỏng)
  const handleDownloadTemplate = async (templateChannel) => {
    try {
      setDownloadingTemplate(true);
      setError('');
      const channelToDownload = templateChannel || selectedChannel;
      const res = await sellerService.downloadExcelTemplate(channelToDownload);

      // Axios interceptor đã trích xuất response.data. Nếu responseType là 'blob', res là Blob chuẩn
      const blob = res instanceof Blob
        ? res
        : new Blob([res?.data || res], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          });

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `ARA_Template_${channelToDownload}_Orders.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError('Lỗi khi tải file mẫu Excel: ' + (err.message || ''));
    } finally {
      setDownloadingTemplate(false);
    }
  };

  // Preview file Excel
  const handlePreviewExcel = async () => {
    if (!file) {
      setError('Vui lòng chọn một file Excel (.xlsx) từ máy tính');
      return;
    }

    try {
      setParsing(true);
      setError('');
      setPreviewData(null);

      const formData = new FormData();
      formData.append('file', file);
      formData.append('channel', selectedChannel);
      formData.append('sourceId', selectedSourceId);

      const res = await sellerService.previewExcelImport(formData);
      if (res.success) {
        setPreviewData(res.data);
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Lỗi khi đọc file Excel');
    } finally {
      setParsing(false);
    }
  };

  // Mở modal ghép SKU cho dòng sản phẩm
  const handleOpenSkuModal = (orderIndex, itemIndex, item) => {
    const rawName = item.rawProductName || item.skuCode || '';
    setActiveItemTarget({
      orderIndex,
      itemIndex,
      rawName,
      quantity: item.quantity || 1,
    });
    setApplyToAllSameName(true);
    setSkuModalOpen(true);

    // Trích xuất từ khóa tìm kiếm (lấy từ đầu chuỗi hoặc nguyên tên)
    const firstWord = rawName.trim().split(/\s+/)[0] || '';
    const query = firstWord.length >= 2 ? firstWord : rawName.slice(0, 20);
    setSkuSearchQuery(query);
    triggerSearchSku(query);
  };

  const triggerSearchSku = async (query) => {
    try {
      setSearchingSku(true);
      const res = await sellerService.lookupRealtimeStock(query || '');
      if (res.success && res.data) {
        setSkuList(res.data);
      } else {
        setSkuList([]);
      }
    } catch (err) {
      console.warn('Lỗi tra cứu SKU:', err.message);
      setSkuList([]);
    } finally {
      setSearchingSku(false);
    }
  };

  // Khi chọn 1 SKU kho để ghép vào đơn
  const handleSelectSkuForOrder = (selectedSku) => {
    if (!activeItemTarget || !previewData || !previewData.orders) return;

    const targetRawName = activeItemTarget.rawName;
    const available = Math.max(
      0,
      selectedSku.availableQty ?? ((selectedSku.onHandQty || 0) - (selectedSku.reservedQty || 0))
    );

    const updatedOrders = previewData.orders.map((ord, ordIdx) => {
      let orderHasUpdatedItem = false;

      const newItems = ord.items.map((it, itIdx) => {
        const isCurrentTarget =
          ordIdx === activeItemTarget.orderIndex && itIdx === activeItemTarget.itemIndex;
        const isSimilar =
          applyToAllSameName &&
          targetRawName &&
          (it.rawProductName === targetRawName || it.skuCode === targetRawName);

        if (!isCurrentTarget && !isSimilar) return it;

        orderHasUpdatedItem = true;
        const sufficient = available >= (it.quantity || 1);

        return {
          ...it,
          skuId: selectedSku._id,
          skuCode: selectedSku.skuCode,
          skuBarcode: selectedSku.skuBarcode,
          productName: selectedSku.styleName || selectedSku.productName || selectedSku.skuCode,
          color: selectedSku.color,
          size: selectedSku.size,
          availableQty: available,
          isValidSku: true,
          isStockSufficient: sufficient,
          unitPrice: it.unitPrice > 0 ? it.unitPrice : (selectedSku.retailPrice || 0),
        };
      });

      if (!orderHasUpdatedItem) return ord;

      // Tính lại tính hợp lệ của đơn hàng
      const isDup = ord.warningMessage && ord.warningMessage.includes('đã được import');
      const allItemsValid = newItems.every((it) => it.isValidSku && it.isStockSufficient);
      let warningMessage = isDup ? ord.warningMessage : '';

      if (!allItemsValid && !isDup) {
        const invalidIt = newItems.find((it) => !it.isValidSku || !it.isStockSufficient);
        if (invalidIt && !invalidIt.isValidSku) {
          warningMessage = `Chưa ghép SKU cho sản phẩm: "${invalidIt.rawProductName}"`;
        } else if (invalidIt && !invalidIt.isStockSufficient) {
          warningMessage = `SKU [${invalidIt.skuCode}] không đủ tồn kho (còn ${invalidIt.availableQty}, cần ${invalidIt.quantity})`;
        }
      }

      return {
        ...ord,
        items: newItems,
        isValid: allItemsValid && !isDup,
        warningMessage,
      };
    });

    const validCount = updatedOrders.filter((o) => o.isValid).length;
    const invalidCount = updatedOrders.filter((o) => !o.isValid).length;

    setPreviewData({
      ...previewData,
      orders: updatedOrders,
      validOrdersCount: validCount,
      invalidOrdersCount: invalidCount,
    });

    setSkuModalOpen(false);
    setActiveItemTarget(null);
  };

  // Tự động tạo sản phẩm & SKU kho cho tất cả sản phẩm chưa có trong hệ thống
  const handleAutoProvisionAllMissing = async () => {
    if (!previewData || !previewData.orders) return;

    const missingMap = new Map();
    for (const ord of previewData.orders) {
      for (const it of ord.items) {
        if (!it.isValidSku) {
          const raw = it.rawProductName || it.skuCode;
          if (raw && !missingMap.has(raw)) {
            missingMap.set(raw, {
              rawProductName: raw,
              quantity: it.quantity || 1,
              unitPrice: it.unitPrice || 0,
            });
          }
        }
      }
    }

    const missingList = Array.from(missingMap.values());
    if (missingList.length === 0) return;

    try {
      setProvisioning(true);
      setError('');
      const res = await sellerService.autoProvisionSkus(missingList);
      if (res.success && res.data) {
        const createdMap = new Map();
        for (const sk of res.data) {
          if (sk.rawProductName) {
            createdMap.set(sk.rawProductName, sk);
          }
        }

        const updatedOrders = previewData.orders.map((ord) => {
          const newItems = ord.items.map((it) => {
            const raw = it.rawProductName || it.skuCode;
            const newSku = createdMap.get(raw);
            if (!newSku) return it;

            const avail = newSku.availableQty ?? 100;
            return {
              ...it,
              skuId: newSku._id,
              skuCode: newSku.skuCode,
              skuBarcode: newSku.skuBarcode,
              productName: newSku.productName || newSku.skuCode,
              color: newSku.color,
              size: newSku.size,
              availableQty: avail,
              isValidSku: true,
              isStockSufficient: avail >= it.quantity,
              unitPrice: it.unitPrice > 0 ? it.unitPrice : newSku.retailPrice,
            };
          });

          const isDup = ord.warningMessage && ord.warningMessage.includes('đã được import');
          const allItemsValid = newItems.every((it) => it.isValidSku);

          let warningMessage = isDup ? ord.warningMessage : '';
          const stockShortage = newItems.find((it) => !it.isStockSufficient);
          if (stockShortage && !isDup) {
            warningMessage = `SKU [${stockShortage.skuCode}] tồn khả dụng thấp (còn ${stockShortage.availableQty})`;
          }

          return {
            ...ord,
            items: newItems,
            isValid: !isDup && allItemsValid,
            warningMessage,
          };
        });

        const validCount = updatedOrders.filter((o) => o.isValid).length;
        const invalidCount = updatedOrders.filter((o) => !o.isValid).length;

        setPreviewData({
          ...previewData,
          orders: updatedOrders,
          validOrdersCount: validCount,
          invalidOrdersCount: invalidCount,
        });
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Lỗi khi tự động tạo SKU kho');
    } finally {
      setProvisioning(false);
    }
  };

  // Seller bấm "Xử lý đơn" (Marketplace Order Processing)
  const handleProcessOrders = async () => {
    if (!previewData || !previewData.orders) return;

    const validOrders = previewData.orders.filter((o) => o.isValid);
    if (validOrders.length === 0) {
      setError('Không có đơn hàng nào hợp lệ để xử lý');
      return;
    }

    try {
      setProcessing(true);
      setError('');

      const res = await sellerService.processImportOrders({
        channel: selectedChannel,
        sourceId: selectedSourceId,
        sourceName: activeSourceObj?.sourceName || selectedChannel,
        orders: validOrders,
      });

      if (res.success) {
        setSuccessInfo(res.data);
        if (onImportSuccess) {
          onImportSuccess(res.data);
        }
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Lỗi khi xử lý đơn hàng');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <>
      <Modal show={isOpen} onHide={onClose} centered size="xl" fullscreen="lg-down" scrollable>
        <Modal.Header closeButton style={{ backgroundColor: 'var(--wms-bg-subtle, #F3EDE4)', borderBottom: '1px solid var(--wms-border, #C8B9A6)' }}>
          <Modal.Title as="h6" className="fw-bold d-flex align-items-center gap-2 text-dark">
            <Icon name="cloud-arrow-up" style={{ color: 'var(--wms-accent, #8A6A46)' }} />
            Import & Xử Lý Đơn Hàng Sàn TMĐT (Shopee / TikTok / Excel)
          </Modal.Title>
        </Modal.Header>

        <Modal.Body style={{ backgroundColor: 'var(--wms-bg-app, #E8DFD3)', padding: '1.25rem' }}>
          {error && <Alert variant="danger" className="py-2 small">{error}</Alert>}

          {successInfo ? (
            <div className="text-center py-4 bg-white rounded p-4 border" style={{ borderColor: 'var(--wms-border, #C8B9A6)' }}>
              <Icon name="check-circle-fill" style={{ color: 'var(--wms-success, #1E6B47)' }} className="display-4 d-block mb-3" />
              <h4 className="fw-bold text-dark">Đã Xử Lý Đơn & Import Thành Công!</h4>
              <div className="text-muted mb-2">
                Mã lô import: <strong className="font-monospace text-primary">{successInfo.batchCode}</strong>
              </div>
              <p className="small mb-3">
                Tổng số đơn hàng đã nhập: <strong className="fs-6 text-success">{successInfo.totalCreated} đơn</strong>
              </p>
              <Alert variant="warning" className="small text-start border">
                <div className="fw-bold text-dark mb-1 d-flex align-items-center gap-1">
                  <Icon name="shield-exclamation" /> Quy trình vận hành Kho (Warehouse Approval):
                </div>
                Các đơn hàng vừa import đang ở trạng thái <strong>PENDING_WAREHOUSE_APPROVAL</strong>. Hệ thống đã bắn thông báo tự động cho bộ phận Kho để duyệt số lượng tồn kho khả dụng trước khi đóng hàng xuất kho.
              </Alert>
              <Button className="btn-wms-primary px-4 mt-2" onClick={onClose}>
                Hoàn Tất & Đóng
              </Button>
            </div>
          ) : (
            <div className="d-flex flex-column gap-3">
              {/* Thông tin hỗ trợ đa định dạng */}
              <Alert variant="info" className="py-2 px-3 small border mb-0 d-flex align-items-center justify-content-between flex-wrap gap-2">
                <div>
                  <Icon name="info-circle" className="me-1" />
                  <strong>Linh hoạt:</strong> Hệ thống tự động nhận diện cả <strong>File xuất đơn giao hàng từ Shopee / TikTok Shop (14 cột)</strong> và <strong>File mẫu Tiêu chuẩn ARA (9 cột)</strong>:
                </div>
                <div className="d-flex gap-2 flex-wrap">
                  <Button
                    size="sm"
                    variant="outline-danger"
                    className="py-1 px-2 small d-flex align-items-center gap-1"
                    onClick={() => handleDownloadTemplate('SHOPEE')}
                    disabled={downloadingTemplate}
                  >
                    <Icon name="file-earmark-spreadsheet" /> Mẫu Shopee (14 cột)
                  </Button>
                  <Button
                    size="sm"
                    variant="outline-dark"
                    className="py-1 px-2 small d-flex align-items-center gap-1"
                    onClick={() => handleDownloadTemplate('TIKTOK')}
                    disabled={downloadingTemplate}
                  >
                    <Icon name="file-earmark-spreadsheet" /> Mẫu TikTok Shop (14 cột)
                  </Button>
                  <Button
                    size="sm"
                    variant="outline-secondary"
                    className="py-1 px-2 small d-flex align-items-center gap-1"
                    onClick={() => handleDownloadTemplate('ARA_STANDARD')}
                    disabled={downloadingTemplate}
                  >
                    <Icon name="file-earmark-code" /> Mẫu ARA Chuẩn (9 cột)
                  </Button>
                </div>
              </Alert>

              {/* Bước 1: Chọn Kênh & Nguồn bán hàng */}
              <Card body className="border shadow-sm bg-white">
                <div className="fw-bold text-dark mb-2">
                  <Icon name="diagram-3" className="me-1" /> 1. Xác định nguồn và kênh đơn hàng (Multi-Channel):
                </div>
                <Row className="g-3">
                  <Col md={4}>
                    <Form.Label className="small text-muted mb-1">Kênh bán hàng</Form.Label>
                    <Form.Select
                      size="sm"
                      value={selectedChannel}
                      onChange={(e) => {
                        const ch = e.target.value;
                        setSelectedChannel(ch);
                        const matching = channels.find((c) => c.channel === ch);
                        if (matching) setSelectedSourceId(matching.sourceId);
                      }}
                    >
                      <option value="SHOPEE">Shopee (Mall / Flagship)</option>
                      <option value="TIKTOK">TikTok Shop</option>
                      <option value="FACEBOOK">Facebook Fanpages</option>
                      <option value="EXCEL_IMPORT">File Excel Tổng Hợp / Khác</option>
                    </Form.Select>
                  </Col>

                  <Col md={5}>
                    <Form.Label className="small text-muted mb-1">Cửa hàng / Gian hàng liên kết</Form.Label>
                    <Form.Select
                      size="sm"
                      value={selectedSourceId}
                      onChange={(e) => setSelectedSourceId(e.target.value)}
                    >
                      {availableSources.map((s) => (
                        <option key={s.sourceId} value={s.sourceId}>
                          {s.sourceName}
                        </option>
                      ))}
                    </Form.Select>
                  </Col>

                  <Col md={3} className="d-flex align-items-end">
                    <Button
                      size="sm"
                      variant="outline-dark"
                      className="w-100 d-flex align-items-center justify-content-center gap-1"
                      onClick={() => handleDownloadTemplate(selectedChannel)}
                      disabled={downloadingTemplate}
                      title={`Tải file mẫu Excel chuẩn cho kênh ${selectedChannel}`}
                    >
                      {downloadingTemplate ? (
                        <Spinner animation="border" size="sm" />
                      ) : (
                        <><Icon name="file-earmark-arrow-down" /> Tải mẫu {selectedChannel === 'TIKTOK' ? 'TikTok' : selectedChannel === 'SHOPEE' ? 'Shopee' : 'Excel'}</>
                      )}
                    </Button>
                  </Col>
                </Row>
              </Card>

              {/* Bước 2: Tải file Excel và Preview */}
              <Card body className="border shadow-sm bg-white">
                <div className="fw-bold text-dark mb-2">
                  <Icon name="file-earmark-spreadsheet" className="me-1" /> 2. Tải file Excel đơn hàng:
                </div>
                <Row className="g-2 align-items-center">
                  <Col md={9}>
                    <Form.Control
                      type="file"
                      size="sm"
                      accept=".xlsx, .xls, .csv"
                      onChange={(e) => setFile(e.target.files[0] || null)}
                    />
                  </Col>
                  <Col md={3}>
                    <Button
                      size="sm"
                      className="btn-wms-primary w-100 d-flex align-items-center justify-content-center gap-1"
                      onClick={handlePreviewExcel}
                      disabled={!file || parsing}
                    >
                      {parsing ? (
                        <><Spinner animation="border" size="sm" /> Đang đọc file...</>
                      ) : (
                        <><Icon name="eye" /> Kiểm tra dữ liệu</>
                      )}
                    </Button>
                  </Col>
                </Row>
              </Card>

              {/* Bước 3: Bảng Preview và "Xử lý đơn" */}
              {previewData && (
                <>
                  {previewData.invalidOrdersCount > 0 && (
                    <Alert variant="warning" className="d-flex align-items-center justify-content-between py-2 px-3 small border mb-0 flex-wrap gap-2">
                      <div>
                        <Icon name="exclamation-triangle-fill" className="text-warning me-2" />
                        Có <strong>{previewData.invalidOrdersCount} đơn hàng</strong> chứa sản phẩm chưa có trong danh mục kho ARAWMS (ví dụ: CV68, VE29, V134...). <strong>Bạn không cần xóa file!</strong>
                      </div>
                      <Button
                        size="sm"
                        variant="warning"
                        className="fw-bold text-dark d-flex align-items-center gap-1 shadow-sm px-3"
                        onClick={handleAutoProvisionAllMissing}
                        disabled={provisioning}
                      >
                        {provisioning ? (
                          <><Spinner animation="border" size="sm" /> Đang tạo SKU kho...</>
                        ) : (
                          <><Icon name="lightning-charge-fill" /> Tự động tạo SKU kho & Khớp tất cả</>
                        )}
                      </Button>
                    </Alert>
                  )}

                  <Card className="border shadow-sm bg-white overflow-hidden">
                  <Card.Header className="py-2 bg-light d-flex justify-content-between align-items-center">
                    <div className="d-flex align-items-center gap-2">
                      <span className="fw-bold text-dark">Kết quả phân tích:</span>
                      <Badge bg="primary">Tổng {previewData.totalParsedOrders} đơn</Badge>
                      <Badge bg="success">{previewData.validOrdersCount} đơn hợp lệ</Badge>
                      {previewData.invalidOrdersCount > 0 && (
                        <Badge bg="danger">{previewData.invalidOrdersCount} đơn cần ghép SKU / kiểm tra</Badge>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="success"
                      className="d-flex align-items-center gap-1 fw-bold px-3"
                      onClick={handleProcessOrders}
                      disabled={processing || previewData.validOrdersCount === 0}
                    >
                      {processing ? (
                        <><Spinner animation="border" size="sm" /> Đang xử lý...</>
                      ) : (
                        <><Icon name="play-circle" /> Xử Lý Đơn ({previewData.validOrdersCount} đơn hợp lệ)</>
                      )}
                    </Button>
                  </Card.Header>

                  <div className="table-responsive" style={{ maxHeight: 360 }}>
                    <Table size="sm" hover className="mb-0 align-middle small">
                      <thead className="table-light text-nowrap sticky-top">
                        <tr>
                          <th>STT</th>
                          <th>Mã đơn hàng</th>
                          <th>Khách hàng & SĐT</th>
                          <th>Địa chỉ giao hàng</th>
                          <th>Sản phẩm & SKU Kho</th>
                          <th>Tiền thu hộ (COD)</th>
                          <th>Ghi chú / Vận đơn</th>
                          <th>Trạng thái hợp lệ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewData.orders?.map((ord, idx) => (
                          <tr key={idx} className={!ord.isValid ? 'table-warning' : ''}>
                            <td>{idx + 1}</td>
                            <td className="font-monospace fw-bold text-nowrap">{ord.externalOrderCode}</td>
                            <td>
                              <div className="fw-semibold">{ord.customerName}</div>
                              <div className="text-muted">{ord.phone}</div>
                            </td>
                            <td className="text-truncate" style={{ maxWidth: 200 }} title={ord.address}>
                              {ord.address}
                            </td>
                            <td>
                              {ord.items?.map((it, i) => (
                                <div key={i} className="py-1 border-bottom border-light last:border-0">
                                  {/* Hiển thị tên sản phẩm thô từ file Excel */}
                                  {it.rawProductName && (
                                    <div className="text-dark small text-truncate" style={{ maxWidth: 260 }} title={it.rawProductName}>
                                      {it.rawProductName}
                                    </div>
                                  )}
                                  <div className="d-flex align-items-center gap-1 mt-1">
                                    {it.isValidSku ? (
                                      <>
                                        <Badge bg="success" className="font-monospace">
                                          {it.skuCode}
                                        </Badge>
                                        <span className="small text-muted">x{it.quantity}</span>
                                        <span className="text-muted" style={{ fontSize: '0.72rem' }}>
                                          (Tồn: {it.availableQty})
                                        </span>
                                        <Button
                                          variant="link"
                                          className="p-0 text-decoration-none text-muted ms-1"
                                          style={{ fontSize: '0.7rem' }}
                                          onClick={() => handleOpenSkuModal(idx, i, it)}
                                          title="Đổi sang SKU kho khác"
                                        >
                                          [Đổi]
                                        </Button>
                                      </>
                                    ) : (
                                      <>
                                        <Badge bg="danger">Chưa khớp SKU</Badge>
                                        <span className="small text-muted">x{it.quantity}</span>
                                        <Button
                                          size="sm"
                                          variant="outline-primary"
                                          className="py-0 px-2 fw-semibold"
                                          style={{ fontSize: '0.72rem', height: '22px' }}
                                          onClick={() => handleOpenSkuModal(idx, i, it)}
                                        >
                                          + Ghép SKU kho
                                        </Button>
                                      </>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </td>
                            <td className="fw-bold text-success text-nowrap">
                              {formatVnd(ord.totalAmount)}
                            </td>
                            <td className="text-truncate" style={{ maxWidth: 160 }} title={ord.notes || ord.trackingCode}>
                              {ord.trackingCode && (
                                <div className="font-monospace text-primary small">
                                  VĐ: {ord.trackingCode}
                                </div>
                              )}
                              <div className="text-muted small">{ord.notes || '-'}</div>
                            </td>
                            <td>
                              {ord.isValid ? (
                                <div>
                                  <Badge bg="success">Hợp lệ</Badge>
                                  {ord.warningMessage && (
                                    <div className="text-warning mt-1" style={{ fontSize: '0.72rem', maxWidth: 180 }}>
                                      {ord.warningMessage}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div>
                                  <Badge bg="danger" className="mb-1">Cần xử lý</Badge>
                                  <div className="text-danger" style={{ fontSize: '0.72rem', maxWidth: 180 }}>
                                    {ord.warningMessage}
                                  </div>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </div>
                </Card>
                </>
              )}
            </div>
          )}
        </Modal.Body>

        {!successInfo && (
          <Modal.Footer style={{ backgroundColor: 'var(--wms-bg-subtle, #F3EDE4)', borderTop: '1px solid var(--wms-border, #C8B9A6)' }}>
            <Button size="sm" variant="secondary" onClick={onClose}>
              Hủy bỏ
            </Button>
            {previewData && previewData.validOrdersCount > 0 && (
              <Button
                size="sm"
                variant="success"
                className="fw-bold"
                onClick={handleProcessOrders}
                disabled={processing}
              >
                {processing ? 'Đang xử lý đơn...' : `Tiến Hành Xử Lý (${previewData.validOrdersCount} đơn)`}
              </Button>
            )}
          </Modal.Footer>
        )}
      </Modal>

      {/* Modal Hỗ Trợ Ghép SKU Kho Nhanh Cho Sản Phẩm */}
      <Modal show={skuModalOpen} onHide={() => setSkuModalOpen(false)} centered size="lg">
        <Modal.Header closeButton style={{ backgroundColor: '#F3EDE4' }}>
          <Modal.Title as="h6" className="fw-bold d-flex align-items-center gap-2">
            <Icon name="link-45deg" />
            Ghép Sản Phẩm Excel Với SKU Tồn Kho ARAWMS
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="mb-3">
            <div className="small text-muted mb-1">Tên sản phẩm trong file Excel:</div>
            <div className="p-2 bg-light rounded border fw-semibold text-dark">
              {activeItemTarget?.rawName || '(Không xác định)'}
            </div>
          </div>

          <div className="mb-3">
            <Form.Label className="small fw-bold">Tìm kiếm mã SKU, Tên mẫu hoặc Barcode trong kho:</Form.Label>
            <InputGroup size="sm">
              <Form.Control
                type="text"
                placeholder="Nhập mã mẫu (VD: CV68, DAM-DA-HOI, AO-SO-MI...)"
                value={skuSearchQuery}
                onChange={(e) => setSkuSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && triggerSearchSku(skuSearchQuery)}
              />
              <Button
                variant="primary"
                onClick={() => triggerSearchSku(skuSearchQuery)}
                disabled={searchingSku}
              >
                {searchingSku ? <Spinner animation="border" size="sm" /> : <><Icon name="search" /> Tìm</>}
              </Button>
            </InputGroup>
          </div>

          <Form.Check
            type="checkbox"
            id="applyToAllSimilar"
            label="Đồng thời tự động áp dụng SKU này cho tất cả các đơn hàng có cùng tên sản phẩm này"
            checked={applyToAllSameName}
            onChange={(e) => setApplyToAllSameName(e.target.checked)}
            className="small mb-3 text-primary fw-semibold"
          />

          <div className="table-responsive border rounded" style={{ maxHeight: 260 }}>
            <Table size="sm" hover className="mb-0 small align-middle">
              <thead className="table-light sticky-top">
                <tr>
                  <th>Mã SKU</th>
                  <th>Tên mẫu mã / Sản phẩm</th>
                  <th>Màu</th>
                  <th>Size</th>
                  <th>Giá bán</th>
                  <th>Tồn khả dụng</th>
                  <th>Hành động</th>
                </tr>
              </thead>
              <tbody>
                {skuList.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-4 text-muted">
                      {searchingSku ? 'Đang tìm kiếm trong kho...' : 'Không tìm thấy SKU nào khớp với từ khóa trên.'}
                    </td>
                  </tr>
                ) : (
                  skuList.map((sku) => {
                    const available = Math.max(0, sku.availableQty ?? ((sku.onHandQty || 0) - (sku.reservedQty || 0)));
                    const isEnough = available >= (activeItemTarget?.quantity || 1);
                    return (
                      <tr key={sku._id} className={!isEnough ? 'table-secondary opacity-75' : ''}>
                        <td className="font-monospace fw-bold">{sku.skuCode}</td>
                        <td>{sku.styleName || sku.productName || sku.skuCode}</td>
                        <td>{sku.color || '-'}</td>
                        <td><Badge bg="secondary">{sku.size}</Badge></td>
                        <td>{formatVnd(sku.retailPrice || 0)}</td>
                        <td>
                          <Badge bg={available > 0 ? (isEnough ? 'success' : 'warning') : 'danger'}>
                            {available} cái
                          </Badge>
                        </td>
                        <td>
                          <Button
                            size="sm"
                            variant={isEnough ? 'outline-success' : 'outline-secondary'}
                            className="py-0 px-2 fw-semibold"
                            onClick={() => handleSelectSkuForOrder(sku)}
                          >
                            Chọn SKU này
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </Table>
          </div>
        </Modal.Body>
        <Modal.Footer style={{ backgroundColor: '#F3EDE4' }}>
          <Button size="sm" variant="secondary" onClick={() => setSkuModalOpen(false)}>
            Đóng
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
};

export default MarketplaceOrderImportModal;
