/**
 * ============================================================================
 * @title        : Marketplace Order Import Modal (Mentor Feedback 4.3.3)
 * @author       : AraStore Frontend Team
 * @createdDate  : 2026-11-02
 * @description  : Modal Import đơn hàng Shopee, TikTok Shop và File Excel:
 *                 - Hỗ trợ đa kênh: Nhiều Facebook Page, Nhiều TikTok Shop, Shopee Mall.
 *                 - Tải file Excel mẫu chuẩn.
 *                 - Seller tải file -> Hệ thống Preview, đối chiếu SKU và tồn khả dụng.
 *                 - Thực hiện "Xử lý đơn" -> Chuyển sang hàng đợi Kho duyệt lại.
 * ============================================================================
 */

import React, { useState, useEffect } from 'react';
import {
  Modal, Form, Card, Alert, Button, Badge, Spinner, Table, Row, Col, Stack,
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
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [error, setError] = useState('');
  const [successInfo, setSuccessInfo] = useState(null);

  // Tải danh sách cấu hình đa kênh từ Backend
  useEffect(() => {
    if (isOpen) {
      loadChannels();
      setPreviewData(null);
      setError('');
      setSuccessInfo(null);
      setFile(null);
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

  // Tải file template
  const handleDownloadTemplate = async () => {
    try {
      setDownloadingTemplate(true);
      const res = await sellerService.downloadExcelTemplate(selectedChannel);
      const blob = new Blob([res.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `ARA_Template_${selectedChannel}_Orders.xlsx`;
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
                    <option value="SHOPEE">Shopee</option>
                    <option value="TIKTOK">TikTok Shop</option>
                    <option value="FACEBOOK">Facebook Fanpages</option>
                    <option value="EXCEL_IMPORT">File Excel Nội Bộ</option>
                  </Form.Select>
                </Col>

                <Col md={5}>
                  <Form.Label className="small text-muted mb-1">Cửa hàng / Trang cụ thể</Form.Label>
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
                    onClick={handleDownloadTemplate}
                    disabled={downloadingTemplate}
                    title="Tải file Excel mẫu để điền đơn"
                  >
                    {downloadingTemplate ? (
                      <Spinner animation="border" size="sm" />
                    ) : (
                      <><Icon name="file-earmark-arrow-down" /> Tải file mẫu</>
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
              <Card className="border shadow-sm bg-white overflow-hidden">
                <Card.Header className="py-2 bg-light d-flex justify-content-between align-items-center">
                  <div className="d-flex align-items-center gap-2">
                    <span className="fw-bold text-dark">Kết quả phân tích:</span>
                    <Badge bg="primary">Tổng {previewData.totalParsedOrders} đơn</Badge>
                    <Badge bg="success">{previewData.validOrdersCount} đơn hợp lệ</Badge>
                    {previewData.invalidOrdersCount > 0 && (
                      <Badge bg="danger">{previewData.invalidOrdersCount} đơn có lỗi/cảnh báo</Badge>
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

                <div className="table-responsive" style={{ maxHeight: 340 }}>
                  <Table size="sm" hover className="mb-0 align-middle small">
                    <thead className="table-light text-nowrap sticky-top">
                      <tr>
                        <th>STT</th>
                        <th>Mã đơn sàn</th>
                        <th>Khách hàng & SĐT</th>
                        <th>Địa chỉ</th>
                        <th>Chi tiết SKU</th>
                        <th>Tổng tiền</th>
                        <th>Mã vận đơn</th>
                        <th>Trạng thái hợp lệ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewData.orders?.map((ord, idx) => (
                        <tr key={idx} className={!ord.isValid ? 'table-danger' : ''}>
                          <td>{idx + 1}</td>
                          <td className="font-monospace fw-bold">{ord.externalOrderCode}</td>
                          <td>
                            <div className="fw-semibold">{ord.customerName}</div>
                            <div className="text-muted">{ord.phone}</div>
                          </td>
                          <td className="text-truncate" style={{ maxWidth: 180 }} title={ord.address}>
                            {ord.address}
                          </td>
                          <td>
                            {ord.items?.map((it, i) => (
                              <div key={i} className="d-flex align-items-center gap-1">
                                <span className={`font-monospace fw-semibold ${!it.isValidSku ? 'text-danger' : ''}`}>
                                  {it.skuCode}
                                </span>
                                <span>x{it.quantity}</span>
                                {it.isValidSku ? (
                                  <span className="text-muted" style={{ fontSize: '0.72rem' }}>
                                    (Tồn: {it.availableQty})
                                  </span>
                                ) : (
                                  <Badge bg="danger" style={{ fontSize: '0.65rem' }}>Sai SKU</Badge>
                                )}
                              </div>
                            ))}
                          </td>
                          <td className="fw-bold">{formatVnd(ord.totalAmount)}</td>
                          <td className="font-monospace text-muted">{ord.trackingCode || '-'}</td>
                          <td>
                            {ord.isValid ? (
                              <Badge bg="success">Hợp lệ</Badge>
                            ) : (
                              <div>
                                <Badge bg="danger" className="mb-1">Lỗi kiểm tra</Badge>
                                <div className="text-danger" style={{ fontSize: '0.72rem' }}>
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
  );
};

export default MarketplaceOrderImportModal;
