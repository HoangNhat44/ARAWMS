/**
 * ============================================================================
 * @title        : Seller Customers Management Page (CRM)
 * @author       : Nguyễn Quang Huy
 * @description  : Trang Quản lý khách hàng dành cho Seller nằm dưới mục Quản lý đơn hàng
 *                 trên sidebar: tra cứu danh sách khách hàng, lọc theo tag/kênh, thêm khách mới,
 *                 xem/chỉnh sửa hồ sơ CRM và lịch sử đơn hàng/tương tác.
 * @module       : Conversational Commerce / CRM Profile
 * @layer        : Front-end Page
 * ============================================================================
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Row,
  Col,
  Card,
  Table,
  Button,
  Form,
  InputGroup,
  Spinner,
  Modal,
  Offcanvas,
  Nav,
  Stack,
  Alert,
  Pagination,
} from 'react-bootstrap';
import { sellerService } from '../../services/sellerService';
import { useToast } from '../../context/ToastContext';
import { Icon, Avatar, EmptyState, formatVnd } from '../../components/seller/SellerUi';
import { WmsSelect } from '../../components/ui/WmsControls';
import CustomerProfilePanel from '../../components/seller/CustomerProfilePanel';
import CustomerOrderHistory from '../../components/seller/CustomerOrderHistory';
import OrderDetailModal from '../../components/seller/OrderDetailModal';
import CreateRmaModal from '../../components/seller/CreateRmaModal';

const QUICK_TAG_OPTIONS = ['Khách mới', 'Khách cũ', 'Khách VIP', 'Cần tư vấn'];
const PAGE_SIZE = 10;

const SellerCustomersPage = () => {
  const navigate = useNavigate();
  const { showSuccess, showError } = useToast();

  const [customers, setCustomers] = useState([]);
  const [summary, setSummary] = useState({
    totalCustomers: 0,
    messengerLinkedCount: 0,
    vipCount: 0,
    totalRevenue: 0,
  });
  const [availableTags, setAvailableTags] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: PAGE_SIZE, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [channelFilter, setChannelFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [page, setPage] = useState(1);

  // Detail Drawer
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [drawerTab, setDrawerTab] = useState('profile');
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

  // Order Detail & RMA Modals from Customer History
  const [orderDetailOpen, setOrderDetailOpen] = useState(false);
  const [selectedOrderDetail, setSelectedOrderDetail] = useState(null);
  const [rmaModalOpen, setRmaModalOpen] = useState(false);
  const [selectedOrderForRma, setSelectedOrderForRma] = useState(null);

  // Create Customer Modal
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [newForm, setNewForm] = useState({
    fullName: '',
    phone: '',
    email: '',
    address: '',
    tags: ['Khách mới'],
  });

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => {
      setSearchQuery(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const fetchCustomers = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await sellerService.getCustomers({
        search: searchQuery || undefined,
        channel: channelFilter || undefined,
        tag: tagFilter || undefined,
        sortBy,
        sortDir: sortBy === 'fullName' ? 'asc' : 'desc',
        page,
        limit: PAGE_SIZE,
      });
      if (res.success && res.data) {
        setCustomers(res.data.items || []);
        setPagination(res.data.pagination || { total: 0, page: 1, limit: PAGE_SIZE, totalPages: 1 });
        if (res.data.summary) setSummary(res.data.summary);
        if (Array.isArray(res.data.availableTags)) setAvailableTags(res.data.availableTags);
      }
    } catch (err) {
      setError(err.message || 'Không thể tải danh sách khách hàng');
    } finally {
      setLoading(false);
    }
  }, [searchQuery, channelFilter, tagFilter, sortBy, page]);

  useEffect(() => {
    void fetchCustomers();
  }, [fetchCustomers]);

  const handleToggleCreateTag = (tag) => {
    setNewForm((prev) => {
      const exists = prev.tags.includes(tag);
      let next;
      if (exists) {
        next = prev.tags.filter((t) => t !== tag);
      } else if (tag === 'Khách mới') {
        next = [...prev.tags.filter((t) => t !== 'Khách cũ'), 'Khách mới'];
      } else if (tag === 'Khách cũ') {
        next = [...prev.tags.filter((t) => t !== 'Khách mới'), 'Khách cũ'];
      } else {
        next = [...prev.tags, tag];
      }
      return { ...prev, tags: next };
    });
  };

  const handleCreateCustomer = async (e) => {
    e.preventDefault();
    if (!newForm.fullName.trim()) {
      setCreateError('Vui lòng nhập họ tên khách hàng.');
      return;
    }
    try {
      setCreating(true);
      setCreateError('');
      const payload = {
        fullName: newForm.fullName.trim(),
        phone: newForm.phone.trim() || undefined,
        email: newForm.email.trim() || undefined,
        tags: newForm.tags.length > 0 ? newForm.tags : ['Khách mới'],
        addresses: newForm.address.trim()
          ? [
              {
                recipientName: newForm.fullName.trim(),
                phone: newForm.phone.trim(),
                fullAddress: newForm.address.trim(),
                isDefault: true,
              },
            ]
          : [],
      };
      const res = await sellerService.createCustomer(payload);
      if (res.success) {
        showSuccess(`Đã tạo hồ sơ khách hàng ${res.data?.fullName || ''}!`, 'Thêm khách hàng');
        setCreateOpen(false);
        setNewForm({ fullName: '', phone: '', email: '', address: '', tags: ['Khách mới'] });
        void fetchCustomers();
      }
    } catch (err) {
      setCreateError(err.message || 'Không thể tạo hồ sơ khách hàng');
    } finally {
      setCreating(false);
    }
  };

  const handleCustomerUpdated = (updatedCust) => {
    if (!updatedCust) return;
    setSelectedCustomer((prev) => (prev ? { ...prev, ...updatedCust } : updatedCust));
    setCustomers((prev) =>
      prev.map((c) => (String(c._id) === String(updatedCust._id) ? { ...c, ...updatedCust } : c))
    );
  };

  const openCustomerDrawer = (cust, initialTab = 'profile') => {
    setSelectedCustomer(cust);
    setDrawerTab(initialTab);
  };

  const mergedTagOptions = Array.from(new Set([...QUICK_TAG_OPTIONS, ...availableTags])).filter(Boolean);

  return (
    <Container fluid className="py-3 px-3 px-md-4" style={{ backgroundColor: 'var(--wms-bg-app, #E8DFD3)', minHeight: '100%' }}>
      {/* Header */}
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
        <div>
          <h4 className="fw-bold mb-0 ara-headline" style={{ color: 'var(--wms-text-primary, #141210)' }}>
            Quản Lý Khách Hàng
          </h4>
        </div>
        <Button
          size="sm"
          className="btn-wms-accent d-inline-flex align-items-center gap-1.5 px-3 py-2 fw-semibold shadow-sm"
          onClick={() => {
            setCreateError('');
            setCreateOpen(true);
          }}
        >
          <Icon name="person-plus-fill" /> Thêm khách hàng mới
        </Button>
      </div>

      {/*
       * ====================================================================================================================================
       * [BẢNG TRA CỨU NGUỒN GỐC SỐ LIỆU, BỘ LỌC & HÀM XỬ LÝ - MÀN HÌNH 1: QUẢN LÝ KHÁCH HÀNG (SELLER CRM)]
       * ====================================================================================================================================
       * | STT | Mục trên UI (KPI / Bộ lọc / Cột)  | Hàm FE & Trường hiển thị                       | API, Hàm BE & Nguồn DB (Collection.field)                          | Nghiệp vụ / Công thức / Điều kiện                 |
       * |-----|-----------------------------------|------------------------------------------------|--------------------------------------------------------------------|---------------------------------------------------|
       * | 1   | KPI: Tổng khách hàng              | fetchCustomers() -> summary.totalCustomers     | GET /api/conversations/customers -> getCustomerList() (customers)  | $sum: 1 toàn bộ khách chưa xóa (isDeleted!=true)  |
       * | 2   | KPI: Liên kết Facebook Messenger  | fetchCustomers() -> summary.messengerLinkedCount| crmProfile.service.js:getCustomerList() <- customers.facebookPsid | Đếm KH có facebookPsid khác null/rỗng             |
       * | 3   | KPI: Khách hàng VIP               | fetchCustomers() -> summary.vipCount           | crmProfile.service.js:getCustomerList() <- customers.tags          | Đếm KH có 'Khách VIP' trong mảng tags             |
       * | 4   | KPI: Tổng chi tiêu tích lũy       | formatVnd(summary.totalRevenue)                | crmProfile.service.js:getCustomerList() <- customers.totalSpent    | Σ customers.totalSpent (cộng khi tạo/trừ khi hủy) |
       * | 5   | Bộ lọc: Tìm kiếm (debounce 300ms) | searchInput -> searchQuery -> fetchCustomers() | crmProfile.service.js:getCustomerList({ search })                  | Regex $or: fullName, phone, customerCode, email   |
       * | 6   | Bộ lọc: Nguồn khách (Tất cả/FB/..)| channelFilter -> fetchCustomers({ channel })   | crmProfile.service.js:getCustomerList({ channel })                 | MESSENGER: có facebookPsid; DIRECT: không PSID    |
       * | 7   | Bộ lọc: Thẻ phân loại (Tags)      | tagFilter, mergedTagOptions <- availableTags   | crmProfile.service.js:getCustomerList() <- customers.tags + tags   | Lọc customers.tags chứa tag đã chọn               |
       * | 8   | Bộ lọc: Sắp xếp (Mới nhất/...)    | sortBy -> fetchCustomers({ sortBy, sortDir })  | crmProfile.service.js:getCustomerList() <- .sort({ [sortBy] })     | createdAt/totalSpent/totalOrders (desc), tên(asc) |
       * | 9   | Cột: Khách hàng & Badge Messenger | row.fullName, row.customerCode, row.facebookPsid| customers.{fullName, customerCode, facebookPsid}                   | Hiện badge Messenger khi có facebookPsid          |
       * | 10  | Cột: SĐT, Địa chỉ, Phân loại Tags | row.phone, row.addresses[0].fullAddress, tags  | customers.{phone, addresses, tags}                                 | Đồng bộ 2 chiều với chat_conversations.tags       |
       * | 11  | Cột: Tổng đơn & Tổng chi tiêu     | row.totalOrders, formatVnd(row.totalSpent)     | customers.{totalOrders, totalSpent} (cập nhật tại orderManagement) | +1/+totalOrderAmount khi đặt; -1/-tổng khi hủy    |
       * | 12  | Phân trang (Hiển thị X / Y KH)    | page, pagination.{total, page, totalPages}     | getCustomerList({ page, limit: 10 }) -> skip/limit + countDocuments| Phân trang server-side (10 khách/trang)           |
       * ====================================================================================================================================
       */}
      <Row className="g-3 mb-3">
        <Col xs={6} lg={3}>
          <Card className="h-100 shadow-sm bg-white" style={{ border: '1px solid var(--wms-border, #C8B9A6)' }}>
            <Card.Body className="py-3">
              <div className="small text-secondary mb-1">Tổng khách hàng</div>
              <div className="fs-4 fw-bold tabular-nums" style={{ color: 'var(--wms-text-primary, #141210)' }}>
                {summary.totalCustomers || 0}
              </div>
            </Card.Body>
          </Card>
        </Col>
        <Col xs={6} lg={3}>
          <Card className="h-100 shadow-sm bg-white" style={{ border: '1px solid var(--wms-border, #C8B9A6)' }}>
            <Card.Body className="py-3">
              <div className="small text-secondary mb-1">Liên kết Facebook Messenger</div>
              <div className="fs-4 fw-bold tabular-nums text-primary">
                {summary.messengerLinkedCount || 0}
              </div>
            </Card.Body>
          </Card>
        </Col>
        <Col xs={6} lg={3}>
          <Card className="h-100 shadow-sm bg-white" style={{ border: '1px solid var(--wms-border, #C8B9A6)' }}>
            <Card.Body className="py-3">
              <div className="small text-secondary mb-1">Khách hàng VIP</div>
              <div className="fs-4 fw-bold tabular-nums" style={{ color: '#B45309' }}>
                {summary.vipCount || 0}
              </div>
            </Card.Body>
          </Card>
        </Col>
        <Col xs={6} lg={3}>
          <Card className="h-100 shadow-sm bg-white" style={{ border: '1px solid var(--wms-border, #C8B9A6)' }}>
            <Card.Body className="py-3">
              <div className="small text-secondary mb-1">Tổng chi tiêu tích lũy</div>
              <div className="fs-4 fw-bold tabular-nums" style={{ color: 'var(--wms-accent, #8A6A46)' }}>
                {formatVnd(summary.totalRevenue || 0)}
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Filter Toolbar */}
      <Card className="mb-3 shadow-sm bg-white" style={{ border: '1px solid var(--wms-border, #C8B9A6)' }}>
        <Card.Body className="py-2.5 px-3">
          <Row className="g-2 align-items-center">
            <Col md={5}>
              <div className="position-relative">
                <InputGroup size="sm" className="ara-search-capsule" style={{ height: 36 }}>
                  <InputGroup.Text className="py-0 h-100">
                    <Icon name="search" />
                  </InputGroup.Text>
                  <Form.Control
                    className="py-0 h-100"
                    placeholder="Tìm tên, SĐT, mã KH (CUST-...), email, địa chỉ..."
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    style={{ minHeight: 0, paddingRight: searchInput ? 30 : 12 }}
                  />
                </InputGroup>
                {searchInput && (
                  <button
                    type="button"
                    className="btn btn-link position-absolute top-50 end-0 translate-middle-y text-secondary p-0 me-2 text-decoration-none d-inline-flex align-items-center justify-content-center"
                    style={{ zIndex: 5, width: 20, height: 20 }}
                    onClick={() => setSearchInput('')}
                    aria-label="Xóa từ khóa tìm kiếm"
                  >
                    <Icon name="x" />
                  </button>
                )}
              </div>
            </Col>
            <Col xs={6} md={2}>
              <WmsSelect
                size="small"
                className="ara-wms-select-sm w-100"
                style={{ width: '100%' }}
                value={channelFilter}
                onChange={(e) => {
                  setChannelFilter(e.target.value);
                  setPage(1);
                }}
                aria-label="Lọc theo nguồn khách hàng"
              >
                <option value="">Tất cả nguồn</option>
                <option value="FACEBOOK">Facebook Messenger</option>
                <option value="DIRECT">Chưa liên kết FB</option>
              </WmsSelect>
            </Col>
            <Col xs={6} md={3}>
              <WmsSelect
                size="small"
                className="ara-wms-select-sm w-100"
                style={{ width: '100%' }}
                value={tagFilter}
                onChange={(e) => {
                  setTagFilter(e.target.value);
                  setPage(1);
                }}
                aria-label="Lọc theo thẻ phân loại"
              >
                <option value="">Tất cả thẻ phân loại</option>
                {mergedTagOptions.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </WmsSelect>
            </Col>
            <Col xs={12} md={2}>
              <WmsSelect
                size="small"
                className="ara-wms-select-sm w-100"
                style={{ width: '100%' }}
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value);
                  setPage(1);
                }}
                aria-label="Sắp xếp danh sách khách hàng"
              >
                <option value="createdAt">Mới nhất</option>
                <option value="totalSpent">Chi tiêu cao nhất</option>
                <option value="totalOrders">Nhiều đơn nhất</option>
                <option value="fullName">Tên A → Z</option>
              </WmsSelect>
            </Col>
          </Row>
        </Card.Body>
      </Card>

      {error && (
        <Alert variant="danger" className="py-2 small">
          {error}
        </Alert>
      )}

      {/* Customer Table */}
      <Card className="shadow-sm bg-white" style={{ border: '1px solid var(--wms-border, #C8B9A6)' }}>
        <div className="table-responsive">
          <Table hover className="mb-0 align-middle small">
            <thead style={{ backgroundColor: 'var(--wms-bg-subtle, #F3EDE4)' }}>
              <tr>
                <th className="ps-3 py-2.5">Khách hàng</th>
                <th className="py-2.5">Số điện thoại &amp; Địa chỉ</th>
                <th className="py-2.5">Phân loại (Tags)</th>
                <th className="py-2.5 text-center">Tổng đơn</th>
                <th className="py-2.5 text-end">Tổng chi tiêu</th>
                <th className="py-2.5 pe-3 text-end">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-5">
                    <Spinner animation="border" size="sm" className="me-2" />
                    Đang tải danh sách khách hàng...
                  </td>
                </tr>
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-4">
                    <EmptyState icon="people" title="Không tìm thấy khách hàng nào phù hợp" />
                  </td>
                </tr>
              ) : (
                customers.map((c) => {
                  const defaultAddress = c.addresses?.[0]?.fullAddress || '';
                  return (
                    <tr key={c._id}>
                      <td className="ps-3 py-2.5">
                        <div className="d-flex align-items-center gap-2.5">
                          <Avatar name={c.fullName} size={36} />
                          <div>
                            <div className="fw-bold" style={{ color: 'var(--wms-text-primary, #141210)' }}>
                              {c.fullName || 'Khách hàng'}
                            </div>
                            <div className="d-flex align-items-center gap-1 flex-wrap mt-0.5">
                              <span
                                className="badge rounded-pill font-monospace"
                                style={{
                                  backgroundColor: '#FFFBEB',
                                  color: '#9A5B06',
                                  border: '1px solid #FDE68A',
                                  fontSize: '10.5px',
                                }}
                              >
                                {c.customerCode || 'CHƯA_CÓ_MÃ'}
                              </span>
                              {c.facebookPsid && (
                                <span
                                  className="badge rounded-pill"
                                  style={{
                                    backgroundColor: '#EFF6FF',
                                    color: '#1D4ED8',
                                    border: '1px solid #BFDBFE',
                                    fontSize: '10px',
                                  }}
                                >
                                  Messenger
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5" style={{ maxWidth: 280 }}>
                        <div className="fw-semibold tabular-nums">
                          {c.phone || <span className="text-muted fst-italic">Chưa có SĐT</span>}
                        </div>
                        {c.email && <div className="text-secondary" style={{ fontSize: '11.5px' }}>{c.email}</div>}
                        {defaultAddress && (
                          <div className="text-secondary text-truncate" style={{ fontSize: '11.5px' }} title={defaultAddress}>
                            <Icon name="geo-alt" className="me-1" />
                            {defaultAddress}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5" style={{ maxWidth: 220 }}>
                        <div className="d-flex flex-wrap gap-1">
                          {Array.isArray(c.tags) && c.tags.length > 0 ? (
                            c.tags.map((tag) => (
                              <span
                                key={tag}
                                className="badge rounded px-2 py-0.5"
                                style={{
                                  backgroundColor: tag === 'Khách VIP' ? '#FEF0C7' : 'var(--wms-bg-subtle, #F3EDE4)',
                                  color: tag === 'Khách VIP' ? '#9A5B06' : 'var(--wms-secondary, #574F46)',
                                  border: `1px solid ${tag === 'Khách VIP' ? '#F5B95F' : 'var(--wms-border, #C8B9A6)'}`,
                                  fontSize: '11px',
                                }}
                              >
                                {tag}
                              </span>
                            ))
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 text-center fw-bold tabular-nums">{c.totalOrders || 0}</td>
                      <td className="py-2.5 text-end fw-bold tabular-nums" style={{ color: 'var(--wms-accent, #8A6A46)' }}>
                        {formatVnd(c.totalSpent || 0)}
                      </td>
                      <td className="py-2.5 pe-3 text-end">
                        <Stack direction="horizontal" gap={1.5} className="justify-content-end">
                          <Button
                            size="sm"
                            className="btn-wms-default rounded-pill px-2.5 py-0.5"
                            style={{ fontSize: '11.5px' }}
                            onClick={() => openCustomerDrawer(c, 'profile')}
                          >
                            <Icon name="person-lines-fill" className="me-1" /> Hồ sơ
                          </Button>
                          <Button
                            size="sm"
                            className="btn-wms-default rounded-pill px-2.5 py-0.5"
                            style={{ fontSize: '11.5px' }}
                            onClick={() => openCustomerDrawer(c, 'orders')}
                          >
                            <Icon name="bag" className="me-1" /> Đơn hàng
                          </Button>
                          {c.latestConversationId && (
                            <Button
                              size="sm"
                              className="btn-wms-accent rounded-pill px-2.5 py-0.5"
                              style={{ fontSize: '11.5px' }}
                              onClick={() => navigate(`/seller/chat?conversationId=${c.latestConversationId}`)}
                              title="Mở khung chat Messenger với khách hàng này"
                            >
                              <Icon name="chat-dots" className="me-1" /> Chat
                            </Button>
                          )}
                        </Stack>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </Table>
        </div>

        {/* Pagination Footer */}
        <Card.Footer
          className="d-flex flex-wrap align-items-center justify-content-between gap-2 py-2 px-3"
          style={{ backgroundColor: 'var(--wms-bg-subtle, #F3EDE4)', borderColor: 'var(--wms-border, #C8B9A6)', color: 'var(--wms-secondary, #574F46)' }}
        >
          <div className="small">
            Hiển thị <strong className="text-dark">{customers.length}</strong> / <strong className="text-dark">{pagination.total}</strong> khách hàng
          </div>
          {pagination.total > 0 && (() => {
            const totalPages = Math.max(1, pagination.totalPages || 1);
            const maxVisible = 5;
            let startPage = Math.max(1, page - Math.floor(maxVisible / 2));
            let endPage = Math.min(totalPages, startPage + maxVisible - 1);
            if (endPage - startPage + 1 < maxVisible) {
              startPage = Math.max(1, endPage - maxVisible + 1);
            }
            const pageItems = [];
            if (startPage > 1) {
              pageItems.push(
                <Pagination.Item key={1} active={page === 1} onClick={() => setPage(1)}>1</Pagination.Item>
              );
              if (startPage > 2) pageItems.push(<Pagination.Ellipsis key="el-start" disabled />);
            }
            for (let p = startPage; p <= endPage; p++) {
              pageItems.push(
                <Pagination.Item key={p} active={p === page} onClick={() => setPage(p)}>{p}</Pagination.Item>
              );
            }
            if (endPage < totalPages) {
              if (endPage < totalPages - 1) pageItems.push(<Pagination.Ellipsis key="el-end" disabled />);
              pageItems.push(
                <Pagination.Item key={totalPages} active={page === totalPages} onClick={() => setPage(totalPages)}>{totalPages}</Pagination.Item>
              );
            }

            return (
              <div className="d-flex align-items-center gap-2 ms-auto">
                <span className="text-muted small d-none d-md-inline">
                  Trang {page} / {totalPages}
                </span>
                <Pagination size="sm" className="mb-0 ara-pagination">
                  <Pagination.First disabled={page <= 1 || loading} onClick={() => setPage(1)} title="Trang đầu" />
                  <Pagination.Prev disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))} title="Trang trước" />
                  {pageItems}
                  <Pagination.Next disabled={page >= totalPages || loading} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} title="Trang sau" />
                  <Pagination.Last disabled={page >= totalPages || loading} onClick={() => setPage(totalPages)} title="Trang cuối" />
                </Pagination>
              </div>
            );
          })()}
        </Card.Footer>
      </Card>

      {/* Customer Detail Drawer (Reuses CustomerProfilePanel & CustomerOrderHistory) */}
      <Offcanvas
        show={Boolean(selectedCustomer)}
        onHide={() => setSelectedCustomer(null)}
        placement="end"
        style={{ width: 460, maxWidth: '100vw' }}
      >
        <Offcanvas.Header closeButton style={{ backgroundColor: 'var(--wms-bg-subtle, #F3EDE4)', borderBottom: '1px solid var(--wms-border, #C8B9A6)' }}>
          <Offcanvas.Title className="fs-6 fw-bold d-flex align-items-center gap-2">
            <Icon name="person-badge" style={{ color: 'var(--wms-accent, #8A6A46)' }} />
            <span>{selectedCustomer?.fullName || 'Chi tiết khách hàng'}</span>
          </Offcanvas.Title>
        </Offcanvas.Header>
        <Offcanvas.Body className="d-flex flex-column p-0 overflow-hidden">
          <Nav className="ara-workspace-nav flex-shrink-0" activeKey={drawerTab}>
            <Nav.Item className="flex-fill">
              <Nav.Link eventKey="profile" onClick={() => setDrawerTab('profile')} className="text-center">
                <Icon name="person" className="me-1" /> Hồ sơ &amp; Tương tác
              </Nav.Link>
            </Nav.Item>
            <Nav.Item className="flex-fill">
              <Nav.Link eventKey="orders" onClick={() => setDrawerTab('orders')} className="text-center">
                <Icon name="clock-history" className="me-1" /> Đơn hàng ({selectedCustomer?.totalOrders || 0})
              </Nav.Link>
            </Nav.Item>
          </Nav>
          <div className="flex-grow-1 overflow-auto p-3">
            {drawerTab === 'profile' && selectedCustomer && (
              <CustomerProfilePanel
                customer={selectedCustomer}
                conversationId={selectedCustomer.latestConversationId}
                onCustomerUpdated={handleCustomerUpdated}
              />
            )}
            {drawerTab === 'orders' && selectedCustomer && (
              <CustomerOrderHistory
                customerId={selectedCustomer._id}
                refreshKey={historyRefreshKey}
                onViewDetail={(ord) => {
                  setSelectedOrderDetail(ord);
                  setOrderDetailOpen(true);
                }}
                onRequestRma={(ord) => {
                  setSelectedOrderForRma(ord);
                  setRmaModalOpen(true);
                }}
                onOrderConfirmed={() => {
                  setHistoryRefreshKey((k) => k + 1);
                  void fetchCustomers();
                }}
              />
            )}
          </div>
        </Offcanvas.Body>
      </Offcanvas>

      {/* Create Customer Modal */}
      <Modal show={createOpen} onHide={() => setCreateOpen(false)} centered>
        <Form onSubmit={handleCreateCustomer}>
          <Modal.Header closeButton style={{ backgroundColor: 'var(--wms-bg-subtle, #F3EDE4)', borderColor: 'var(--wms-border, #C8B9A6)' }}>
            <Modal.Title as="h6" className="fw-bold d-flex align-items-center gap-2">
              <Icon name="person-plus" style={{ color: 'var(--wms-accent, #8A6A46)' }} />
              Thêm hồ sơ khách hàng mới
            </Modal.Title>
          </Modal.Header>
          <Modal.Body className="d-flex flex-column gap-2.5 small">
            {createError && <Alert variant="danger" className="py-2 mb-1">{createError}</Alert>}
            <Form.Group>
              <Form.Label className="fw-semibold mb-1">Họ và tên <span className="text-danger">*</span></Form.Label>
              <Form.Control
                size="sm"
                value={newForm.fullName}
                onChange={(e) => setNewForm((p) => ({ ...p, fullName: e.target.value }))}
                placeholder="VD: Nguyễn Thị Minh Anh"
                required
              />
            </Form.Group>
            <Form.Group>
              <Form.Label className="fw-semibold mb-1">Số điện thoại</Form.Label>
              <Form.Control
                size="sm"
                value={newForm.phone}
                onChange={(e) => setNewForm((p) => ({ ...p, phone: e.target.value }))}
                placeholder="VD: 0912345678"
              />
            </Form.Group>
            <Form.Group>
              <Form.Label className="fw-semibold mb-1">Email</Form.Label>
              <Form.Control
                size="sm"
                type="email"
                value={newForm.email}
                onChange={(e) => setNewForm((p) => ({ ...p, email: e.target.value }))}
                placeholder="example@email.com"
              />
            </Form.Group>
            <Form.Group>
              <Form.Label className="fw-semibold mb-1">Địa chỉ nhận hàng mặc định</Form.Label>
              <Form.Control
                size="sm"
                as="textarea"
                rows={2}
                value={newForm.address}
                onChange={(e) => setNewForm((p) => ({ ...p, address: e.target.value }))}
                placeholder="Số nhà, đường, phường/xã, quận/huyện, tỉnh/TP"
              />
            </Form.Group>
            <Form.Group>
              <Form.Label className="fw-semibold mb-1">Phân loại khách hàng</Form.Label>
              <div className="d-flex flex-wrap gap-1.5">
                {QUICK_TAG_OPTIONS.map((tag) => {
                  const active = newForm.tags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => handleToggleCreateTag(tag)}
                      className="btn btn-sm py-0.5 px-2 rounded"
                      style={{
                        fontSize: '11.5px',
                        fontWeight: 600,
                        backgroundColor: active ? '#FEF0C7' : '#FFFFFF',
                        color: active ? '#9A5B06' : '#574F46',
                        border: `1px solid ${active ? '#F5B95F' : '#C8B9A6'}`,
                      }}
                    >
                      {active ? '✓ ' : '+ '}
                      {tag}
                    </button>
                  );
                })}
              </div>
            </Form.Group>
          </Modal.Body>
          <Modal.Footer className="py-2">
            <Button size="sm" variant="outline-secondary" onClick={() => setCreateOpen(false)} disabled={creating}>
              Hủy
            </Button>
            <Button size="sm" type="submit" className="btn-wms-accent" disabled={creating}>
              {creating ? <Spinner animation="border" size="sm" className="me-1" /> : <Icon name="check2" className="me-1" />}
              Lưu khách hàng
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      {/* Order Detail Modal */}
      <OrderDetailModal
        isOpen={orderDetailOpen}
        order={selectedOrderDetail}
        onClose={() => setOrderDetailOpen(false)}
        onStatusUpdated={(updatedOrder) => {
          setSelectedOrderDetail(updatedOrder);
          setHistoryRefreshKey((k) => k + 1);
          void fetchCustomers();
        }}
        onOpenRma={(ord) => {
          setSelectedOrderForRma(ord);
          setRmaModalOpen(true);
        }}
      />

      {/* RMA Modal */}
      <CreateRmaModal
        isOpen={rmaModalOpen}
        onClose={() => setRmaModalOpen(false)}
        order={selectedOrderForRma}
        onRmaCreated={() => {
          showSuccess('Phiếu Đổi / Trả hàng (RMA) đã được tạo thành công!', 'Tạo RMA');
          setHistoryRefreshKey((k) => k + 1);
        }}
      />
    </Container>
  );
};

export default SellerCustomersPage;

