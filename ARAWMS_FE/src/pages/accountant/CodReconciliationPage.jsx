import React, { useEffect, useState, useMemo } from 'react';
import {
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Search,
  Truck,
  DollarSign,
  ShieldAlert,
  Send,
  X,
  Sparkles,
  FileText,
  Building2,
  AlertCircle,
  HelpCircle,
  MessageSquare,
  Eye,
} from 'lucide-react';
import accountantProcurementApi from '../../services/accountantProcurementApi.js';

const formatVnd = (val) => `${Number(val || 0).toLocaleString('vi-VN')} ₫`;

const RECON_STATUS_MAP = {
  UNRECONCILED: {
    label: 'Chưa đối soát',
    cls: 'wms-status-pending',
    icon: Clock,
  },
  MATCHED: {
    label: 'Khớp 100%',
    cls: 'wms-status-completed',
    icon: CheckCircle2,
  },
  RED_FLAG_DISCREPANCY: {
    label: 'Cờ đỏ sai lệch',
    cls: 'wms-status-rejected',
    icon: ShieldAlert,
  },
  DISPUTING: {
    label: 'Đang khiếu nại',
    cls: 'wms-status-processing',
    icon: AlertTriangle,
  },
  RESOLVED: {
    label: 'Đã giải quyết',
    cls: 'wms-status-available',
    icon: CheckCircle2,
  },
};

const CodReconciliationPage = () => {
  const [orders, setOrders] = useState([]);
  const [summary, setSummary] = useState({
    totalOrders: 0,
    totalExpectedCod: 0,
    reconciledCount: 0,
    unreconciledCount: 0,
    redFlagCount: 0,
  });

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [feedback, setFeedback] = useState(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [shippingStatusFilter, setShippingStatusFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState('NEWEST'); // 'NEWEST' | 'OLDEST' | 'AMOUNT_DESC'
  const [activeTab, setActiveTab] = useState('ORDERS_LIST'); // ORDERS_LIST | RED_FLAGS

  // Modal Xử lý khiếu nại Dispute
  const [disputeItem, setDisputeItem] = useState(null);
  const [disputeNote, setDisputeNote] = useState('');
  const [submittingDispute, setSubmittingDispute] = useState(false);

  // Trạng thái đang nhận phản hồi tra soát từ GHN
  const [receivingFeedbackId, setReceivingFeedbackId] = useState(null);

  // Modal Xem chi tiết phản hồi từ GHN
  const [selectedFeedbackItem, setSelectedFeedbackItem] = useState(null);

  // Modal Xác nhận đã xử lý sai lệch (Custom Note)
  const [resolveModalItem, setResolveModalItem] = useState(null);
  const [resolveReason, setResolveReason] = useState('');
  const [resolvedFaultParty, setResolvedFaultParty] = useState('ARA_STORE'); // ARA_STORE | CARRIER_GHN
  const [submittingResolve, setSubmittingResolve] = useState(false);

  // Danh sách Red Flags
  const [redFlagsList, setRedFlagsList] = useState([]);

  // Danh sách đơn hàng sắp xếp theo thứ tự (mặc định Mới nhất -> Cũ nhất)
  const sortedOrders = useMemo(() => {
    return [...orders].sort((a, b) => {
      if (sortBy === 'OLDEST') {
        return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
      }
      if (sortBy === 'AMOUNT_DESC') {
        return Number(b.financialSummary?.expectedCodAmount || 0) - Number(a.financialSummary?.expectedCodAmount || 0);
      }
      // NEWEST: Mới nhất trước (Mới → Cũ)
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });
  }, [orders, sortBy]);

  // Danh sách cờ đỏ lệch COD sắp xếp theo thứ tự (mặc định Mới nhất -> Cũ nhất)
  const sortedRedFlags = useMemo(() => {
    return [...redFlagsList].sort((a, b) => {
      if (sortBy === 'OLDEST') {
        return new Date(a.discrepancyFlaggedAt || a.createdAt || 0) - new Date(b.discrepancyFlaggedAt || b.createdAt || 0);
      }
      if (sortBy === 'AMOUNT_DESC') {
        return Math.abs(Number(b.varianceAmount || b.discrepancyAmount || 0)) - Math.abs(Number(a.varianceAmount || a.discrepancyAmount || 0));
      }
      // NEWEST: Mới nhất trước (Mới → Cũ)
      return new Date(b.discrepancyFlaggedAt || b.createdAt || 0) - new Date(a.discrepancyFlaggedAt || a.createdAt || 0);
    });
  }, [redFlagsList, sortBy]);

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await accountantProcurementApi.getCodOrders({
        status: statusFilter,
        shippingStatus: shippingStatusFilter,
        search: searchQuery,
      });

      if (res) {
        setOrders(res.orders || []);
        setSummary(res.summary || {});
      }

      const flags = await accountantProcurementApi.getCodRedFlags();
      setRedFlagsList(flags || []);
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err.response?.data?.message || 'Không thể tải danh sách đơn hàng đối soát COD.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [statusFilter, shippingStatusFilter]);

  // Debounced Search
  useEffect(() => {
    const timer = setTimeout(() => {
      loadData();
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Nút 1: Thực thi Đối soát Tự động qua API GHN
  const handleSyncGhn = async () => {
    try {
      setSyncing(true);
      setFeedback(null);
      const res = await accountantProcurementApi.syncGhnCod({});
      setFeedback({
        type: 'success',
        text: res.message || 'Đối soát tự động qua API GHN thành công!',
      });
      await loadData();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err.response?.data?.message || 'Lỗi khi đồng bộ đối soát với cổng GHN.',
      });
    } finally {
      setSyncing(false);
    }
  };

  // Nút 2: Khởi tạo 5 đơn hàng mẫu (4 đơn tiền mặt + 1 chuyển khoản) để kiểm chứng
  const handleSeedSample = async () => {
    try {
      setSeeding(true);
      setFeedback(null);
      const res = await accountantProcurementApi.seedSampleCodOrders();
      setFeedback({
        type: 'success',
        text: res.message,
      });
      await loadData();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err.response?.data?.message || 'Không thể khởi tạo đơn mẫu.',
      });
    } finally {
      setSeeding(false);
    }
  };

  // Gửi khiếu nại hãng vận chuyển
  const handleSendDispute = async (e) => {
    e.preventDefault();
    if (!disputeItem || !disputeNote.trim()) return;

    try {
      setSubmittingDispute(true);
      await accountantProcurementApi.resolveCodDispute(disputeItem._id, {
        redFlagStatus: 'ESCALATED_TO_DISPUTE',
        investigationNote: disputeNote,
      });

      setFeedback({
        type: 'success',
        text: `Đã lập biên bản khiếu nại đơn vận [${disputeItem.waybillCode}] thành công!`,
      });
      setDisputeItem(null);
      setDisputeNote('');
      await loadData();
    } catch (err) {
      alert(err.response?.data?.message || 'Không thể gửi khiếu nại.');
    } finally {
      setSubmittingDispute(false);
    }
  };

  // Nhận phản hồi kết luận tra soát chính thức từ Bưu cục GHN
  const handleReceiveGhnFeedback = async (item) => {
    if (!item) return;

    try {
      setReceivingFeedbackId(item._id);
      await accountantProcurementApi.simulateGhnDisputeFeedback(item._id);

      setFeedback({
        type: 'success',
        text: `Đã tiếp nhận văn bản kết luận tra soát chính thức từ Bưu cục GHN cho đơn [${item.orderCode}]!`,
      });
      await loadData();
    } catch (err) {
      alert(err.response?.data?.message || 'Không thể lấy phản hồi từ GHN.');
    } finally {
      setReceivingFeedbackId(null);
    }
  };

  // Mở modal nhập lý do và chọn nguyên nhân sai lệch
  const handleOpenResolveModal = (item) => {
    setResolveModalItem(item);

    // Ưu tiên chọn nguồn gốc sai lệch theo đề xuất kết quả phản hồi của GHN
    let initialParty = 'ARA_STORE';
    if (item.carrierProposedFaultParty && item.carrierProposedFaultParty !== 'NONE') {
      initialParty = item.carrierProposedFaultParty;
    } else if (item.resolvedFaultParty && item.resolvedFaultParty !== 'NONE') {
      initialParty = item.resolvedFaultParty;
    }
    setResolvedFaultParty(initialParty);

    if (item.redFlagStatus === 'RESOLVED_ADJUSTED' && item.investigationNote) {
      setResolveReason(item.investigationNote);
    } else if (item.carrierProposedFaultParty === 'CARRIER_GHN') {
      setResolveReason(
        'Bưu cục GHN xác nhận bưu tá thu thiếu tiền của khách, GHN chấp thuận bồi hoàn chênh lệch vào kỳ thanh toán COD kế tiếp.'
      );
    } else if (item.carrierProposedFaultParty === 'ARA_STORE') {
      setResolveReason(
        'Shop xác nhận có thỏa thuận giảm giá/chiết khấu trực tiếp cho khách, hạch toán công nợ theo số tiền GHN thực thu.'
      );
    } else {
      setResolveReason('');
    }
  };

  // Xác nhận lưu lý do và phương án hạch toán công nợ
  const handleConfirmResolveSubmit = async (e) => {
    e.preventDefault();
    if (!resolveModalItem) return;
    if (!resolvedFaultParty) {
      alert('Vui lòng chọn nguồn gốc sai lệch (Lệch do ARA Store hoặc do GHN).');
      return;
    }
    if (!resolveReason.trim()) {
      alert('Vui lòng nhập lý do / phương án xử lý chi tiết.');
      return;
    }

    try {
      setSubmittingResolve(true);
      await accountantProcurementApi.resolveCodDispute(resolveModalItem._id, {
        redFlagStatus: 'RESOLVED_ADJUSTED',
        resolvedFaultParty,
        investigationNote: resolveReason.trim(),
      });

      const partyLabel =
        resolvedFaultParty === 'ARA_STORE'
          ? 'Lệch do ARA Store (Công nợ tính theo GHN)'
          : 'Lệch do GHN (Công nợ tính theo ARA)';

      setFeedback({
        type: 'success',
        text: `Đã xử lý xong sai lệch cho đơn [${resolveModalItem.orderCode}] — ${partyLabel}!`,
      });
      setResolveModalItem(null);
      setResolveReason('');
      await loadData();
    } catch (err) {
      alert(err.response?.data?.message || 'Không thể cập nhật trạng thái.');
    } finally {
      setSubmittingResolve(false);
    }
  };

  return (
    <div>
      {/* 1. PAGE HEADER ĐỒNG BỘ WMS */}
      <section className="wms-page-header">
        <div>
          <h1 className="wms-page-title">
            Đối soát COD Tự động qua API Vận chuyển (GHN)
          </h1>
          <p className="wms-page-subtitle">
            Chuẩn nghiệp vụ WMS & Kế toán: Hệ thống tự động lọc các đơn hàng tiền mặt (COD) đã hoàn tất chu trình giao vận (Giao thành công hoặc Chuyển hoàn/Hủy). Tự động loại trừ đơn chuyển khoản trước và các đơn đang trên đường giao (chờ giao xong mới tới kỳ đối soát).
          </p>
        </div>

        <div className="wms-row-actions">
          <button
            type="button"
            className="wms-btn wms-btn-default"
            onClick={handleSeedSample}
            disabled={seeding || syncing}
            title="Tạo nhanh 6 đơn mẫu (3 đơn giao thành công, 1 đơn hoàn hàng, 1 đơn chuyển khoản, 1 đơn đang giao) để kiểm chứng tự động hóa"
          >
            <Sparkles size={16} />
            {seeding ? 'Đang tạo mẫu...' : 'Tạo 6 đơn test mẫu'}
          </button>

          <button
            type="button"
            className="wms-btn wms-btn-primary"
            onClick={handleSyncGhn}
            disabled={syncing || seeding}
          >
            <RefreshCw size={16} className={syncing ? 'wms-spin' : ''} />
            {syncing ? 'Đang gọi API GHN đối soát...' : 'Thực thi Đối soát Tự động (API GHN)'}
          </button>
        </div>
      </section>

      {/* 2. FEEDBACK BANNER ĐỒNG BỘ */}
      {feedback && (
        <div className={`wms-feedback-banner ${feedback.type}`} role="alert">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {feedback.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
            <span>{feedback.text}</span>
          </div>
          <button
            type="button"
            className="wms-btn wms-btn-default wms-btn-sm"
            onClick={() => setFeedback(null)}
          >
            Đóng
          </button>
        </div>
      )}

      {/* 3. KPI SUMMARY STRIP CHUẨN KẾ TOÁN */}
      <section className="wms-kpi-strip" aria-label="Thống kê đối soát COD">
        <div className="wms-kpi-card">
          <span className="wms-kpi-label">Tổng tiền COD Dự kiến</span>
          <span className="wms-kpi-value">{formatVnd(summary.totalExpectedCod)}</span>
          <span className="wms-kpi-meta">Áp dụng cho {summary.totalOrders} đơn hàng tiền mặt</span>
        </div>

        <div className="wms-kpi-card">
          <span className="wms-kpi-label">Đơn Khớp tiền 100%</span>
          <span className="wms-kpi-value" style={{ color: 'var(--wms-success)' }}>
            {summary.reconciledCount} đơn
          </span>
          <span className="wms-kpi-meta">Số tiền thực thu khớp đúng từng đồng</span>
        </div>

        <div className="wms-kpi-card">
          <span className="wms-kpi-label">Cờ đỏ Sai lệch (Red Flags)</span>
          <span className="wms-kpi-value" style={{ color: 'var(--wms-danger)' }}>
            {summary.redFlagCount} đơn
          </span>
          <span className="wms-kpi-meta">Lệch tiền thu hộ hoặc sự cố giao vận</span>
        </div>

        <div className="wms-kpi-card">
          <span className="wms-kpi-label">Chờ đối soát / Đang giao</span>
          <span className="wms-kpi-value" style={{ color: 'var(--wms-secondary)' }}>
            {summary.unreconciledCount} đơn
          </span>
          <span className="wms-kpi-meta">Đơn đang giao hoặc chưa chốt kỳ</span>
        </div>
      </section>

      {/* 4. TABS BAR CHUẨN WMS */}
      <div className="wms-tabs-bar" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'ORDERS_LIST'}
          className={`wms-tab-btn ${activeTab === 'ORDERS_LIST' ? 'active' : ''}`}
          onClick={() => setActiveTab('ORDERS_LIST')}
        >
          <FileText size={16} />
          <span>Đơn hàng Bàn giao Vận chuyển ({orders.length})</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'RED_FLAGS'}
          className={`wms-tab-btn ${activeTab === 'RED_FLAGS' ? 'active' : ''}`}
          onClick={() => setActiveTab('RED_FLAGS')}
        >
          <ShieldAlert size={16} />
          <span>
            Cảnh báo Cờ đỏ lệch COD ({redFlagsList.length})
          </span>
        </button>
      </div>

      {/* 5. FILTER BAR KẾ TOÁN CHUẨN */}
      {activeTab === 'ORDERS_LIST' && (
        <section className="wms-filter-bar" aria-label="Bộ lọc đối soát">
          <div className="wms-filter-group">
            <div className="wms-filter-field search-wide">
              <label htmlFor="cod-search" className="wms-label">
                Tìm kiếm Đơn hàng / Mã vận đơn
              </label>
              <input
                id="cod-search"
                type="search"
                className="wms-input"
                placeholder="Nhập mã đơn hàng, mã vận đơn GHN, tên khách hàng, SĐT..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="wms-filter-field">
              <label htmlFor="cod-shipping-status-filter" className="wms-label">
                Trạng thái giao vận (GHN)
              </label>
              <select
                id="cod-shipping-status-filter"
                className="wms-select"
                value={shippingStatusFilter}
                onChange={(e) => setShippingStatusFilter(e.target.value)}
              >
                <option value="ALL">Tất cả trạng thái xuất kho</option>
                <option value="DELIVERED">Giao thành công (Sẵn sàng đối soát)</option>
                <option value="RETURNED">Đã chuyển hoàn (Kiểm tra hàng hoàn)</option>
                <option value="HANDED_OVER_CARRIER">Đang giao hàng (Chờ giao xong)</option>
              </select>
            </div>

            <div className="wms-filter-field">
              <label htmlFor="cod-status-filter" className="wms-label">
                Trạng thái đối soát COD
              </label>
              <select
                id="cod-status-filter"
                className="wms-select"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="ALL">Tất cả trạng thái đối soát</option>
                <option value="UNRECONCILED">Chưa đối soát</option>
                <option value="MATCHED">Khớp tiền 100%</option>
                <option value="RED_FLAG_DISCREPANCY">Cờ đỏ sai lệch</option>
                <option value="RESOLVED">Đã giải quyết</option>
              </select>
            </div>

            <div className="wms-filter-field">
              <label htmlFor="cod-sort-filter" className="wms-label">
                Thứ tự sắp xếp
              </label>
              <select
                id="cod-sort-filter"
                className="wms-select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
              >
                <option value="NEWEST">Mới nhất trước (Mới → Cũ)</option>
                <option value="OLDEST">Cũ nhất trước (Cũ → Mới)</option>
                <option value="AMOUNT_DESC">Tiền COD giảm dần (Cao → Thấp)</option>
              </select>
            </div>
          </div>

          <div className="wms-row-actions">
            <button
              type="button"
              className="wms-btn wms-btn-default"
              onClick={loadData}
              disabled={loading}
            >
              <RefreshCw size={15} className={loading ? 'wms-spin' : ''} />
              <span>Tải lại</span>
            </button>
          </div>
        </section>
      )}

      {/* ========================================================================= */}
      {/* TAB 1: TẤT CẢ ĐƠN HÀNG TIỀN MẶT BÀN GIAO VẬN CHUYỂN                       */}
      {/* ========================================================================= */}
      {activeTab === 'ORDERS_LIST' && (
        <div className="wms-table-card">
          <div style={{ padding: '12px 18px', backgroundColor: 'var(--wms-bg-subtle)', borderBottom: '1px solid var(--wms-border)', fontSize: '12.5px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Truck size={16} color="var(--wms-accent-hover)" />
            <span style={{ color: 'var(--wms-secondary)' }}>
              Phạm vi đối soát: Chỉ hiển thị các đơn hàng <strong>Tiền mặt (COD) đã xuất kho và bàn giao cho đơn vị vận chuyển</strong> (có mã vận đơn GHN). Tự động loại trừ các đơn nội bộ trong kho (chờ xử lý, đang nhặt hàng, đã hủy trong kho) và đơn chuyển khoản trước.
            </span>
          </div>

          <div className="wms-table-scroll">
            <table className="wms-table">
              <thead>
                <tr>
                  <th style={{ width: '130px' }}>Mã đơn hàng</th>
                  <th style={{ width: '150px' }}>Mã vận đơn GHN</th>
                  <th>Người nhận & Địa chỉ giao hàng</th>
                  <th className="wms-td-number" style={{ width: '140px' }}>Tiền COD Dự kiến</th>
                  <th style={{ width: '130px', textAlign: 'center' }}>Trạng thái giao</th>
                  <th style={{ width: '150px', textAlign: 'center' }}>Đối soát COD</th>
                 
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: '36px' }}>
                      <RefreshCw size={24} className="wms-spin" style={{ margin: '0 auto 8px' }} />
                      <div>Đang tải dữ liệu đơn hàng tiền mặt...</div>
                    </td>
                  </tr>
                ) : sortedOrders.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: '36px', color: 'var(--wms-secondary)' }}>
                      Không tìm thấy đơn hàng tiền mặt nào phù hợp bộ lọc.
                    </td>
                  </tr>
                ) : (
                  sortedOrders.map((o) => {
                    const statusObj = RECON_STATUS_MAP[o.codReconciliationStatus] || RECON_STATUS_MAP.UNRECONCILED;
                    const StatusIcon = statusObj.icon;
                    const waybill = o.warehouseFulfillment?.waybillCode;

                    return (
                      <tr key={o._id}>
                        <td>
                          <span className="wms-code-pill">{o.orderCode}</span>
                          <div className="wms-helper-text" style={{ marginTop: '2px' }}>
                            {new Date(o.createdAt).toLocaleDateString('vi-VN')}
                          </div>
                        </td>

                        <td>
                          {waybill ? (
                            <span style={{ fontWeight: 700, color: 'var(--wms-accent-hover)' }}>{waybill}</span>
                          ) : (
                            <span style={{ color: 'var(--wms-secondary)' }}>Chưa cấp mã</span>
                          )}
                          <div className="wms-helper-text">Giao Hàng Nhanh</div>
                        </td>

                        <td>
                          <div style={{ fontWeight: 600, color: 'var(--wms-text-primary)' }}>
                            {o.shippingRecipient?.name || 'Khách lẻ'}
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--wms-secondary)', marginTop: '2px' }}>
                            {o.shippingRecipient?.phone} • {o.shippingRecipient?.address}
                          </div>
                        </td>

                        <td className="wms-td-number" style={{ color: 'var(--wms-text-primary)', fontSize: '13.5px' }}>
                          {formatVnd(o.financialSummary?.expectedCodAmount)}
                        </td>

                        <td style={{ textAlign: 'center' }}>
                          {o.status === 'DELIVERED' ? (
                            <div>
                              <span className="wms-status-badge wms-status-completed">Giao thành công</span>
                              <div className="wms-helper-text" style={{ fontSize: '11px', marginTop: '2px', color: 'var(--wms-success)' }}>
                                Đủ điều kiện đối soát
                              </div>
                            </div>
                          ) : o.status === 'RETURNED' || o.status === 'CANCELLED' ? (
                            <div>
                              <span className="wms-status-badge wms-status-rejected">
                                {o.status === 'RETURNED' ? 'Đã chuyển hoàn' : 'Đã hủy đơn'}
                              </span>
                              <div className="wms-helper-text" style={{ fontSize: '11px', marginTop: '2px', color: 'var(--wms-danger)' }}>
                                Kiểm tra hàng hoàn
                              </div>
                            </div>
                          ) : (
                            <div>
                              <span className="wms-status-badge wms-status-processing">
                                {o.status === 'HANDED_OVER_CARRIER' ? 'Đang giao hàng' : o.status}
                              </span>
                              <div className="wms-helper-text" style={{ fontSize: '11px', marginTop: '2px', color: 'var(--wms-secondary)' }}>
                                Chờ giao hoàn tất
                              </div>
                            </div>
                          )}
                        </td>

                        <td style={{ textAlign: 'center' }}>
                          {o.status === 'HANDED_OVER_CARRIER' && o.codReconciliationStatus === 'UNRECONCILED' ? (
                            <span className="wms-status-badge wms-status-pending">
                              <Clock size={12} />
                              Chờ giao xong
                            </span>
                          ) : (
                            <span className={`wms-status-badge ${statusObj.cls}`}>
                              <StatusIcon size={12} />
                              {statusObj.label}
                            </span>
                          )}
                        </td>

                        
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: CẢNH BÁO CỜ ĐỎ LỆCH COD (RED FLAGS DISCREPANCIES)                  */}
      {/* ========================================================================= */}
      {activeTab === 'RED_FLAGS' && (
        <div className="wms-table-card">
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--wms-border)', backgroundColor: 'var(--wms-danger-bg)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--wms-danger)', fontWeight: 700, fontSize: '15px' }}>
              <ShieldAlert size={18} />
              <span>Danh sách các đơn hàng phát hiện sai lệch tiền COD (Cần xử lý khiếu nại)</span>
            </div>
            <p style={{ margin: '4px 0 0 0', fontSize: '12.5px', color: 'var(--wms-text-body)' }}>
              Hệ thống tự động so khớp tiền COD trên đơn hàng ARAWMS so với số tiền GHN báo thu thực tế. Kế toán cần lập biên bản khiếu nại hãng vận chuyển hoặc đối chiếu hàng hoàn để bảo vệ dòng tiền.
            </p>
          </div>

          <div className="wms-table-scroll">
            <table className="wms-table">
              <thead>
                <tr>
                  <th style={{ width: '120px' }}>Mã đơn</th>
                  <th style={{ width: '130px' }}>Mã vận đơn</th>
                  <th className="wms-td-number" style={{ width: '130px' }}>Tiền Dự kiến</th>
                  <th className="wms-td-number" style={{ width: '130px' }}>GHN Báo thu</th>
                  <th className="wms-td-number" style={{ width: '130px' }}>Chênh lệch</th>
                  <th>Lý do & Ghi chú sai lệch</th>
                  <th style={{ width: '140px', textAlign: 'center' }}>Tiến độ khiếu nại</th>
                  <th style={{ width: '160px', textAlign: 'center' }}>Hành động</th>
                </tr>
              </thead>
              <tbody>
                {sortedRedFlags.length === 0 ? (
                  <tr>
                    <td colSpan="8" style={{ textAlign: 'center', padding: '36px', color: 'var(--wms-success)' }}>
                      <CheckCircle2 size={30} style={{ margin: '0 auto 8px', color: 'var(--wms-success)' }} />
                      <div style={{ fontWeight: 600 }}>Hiện tại không có đơn hàng nào bị cờ đỏ lệch COD!</div>
                    </td>
                  </tr>
                ) : (
                  sortedRedFlags.map((item) => {
                    const isDisputing = item.redFlagStatus === 'ESCALATED_TO_DISPUTE';
                    const isFeedbackReceived = item.redFlagStatus === 'CARRIER_FEEDBACK_RECEIVED';
                    const isResolved = item.redFlagStatus === 'RESOLVED_ADJUSTED';

                    return (
                      <tr key={item._id} style={item.varianceAmount !== 0 ? { backgroundColor: '#FFF5F5' } : {}}>
                        <td><span className="wms-code-pill">{item.orderCode}</span></td>
                        <td><span style={{ fontWeight: 700, color: 'var(--wms-accent-hover)' }}>{item.waybillCode}</span></td>
                        <td className="wms-td-number">{formatVnd(item.systemExpectedCod)}</td>
                        <td className="wms-td-number" style={{ color: 'var(--wms-success)' }}>{formatVnd(item.carrierReportedCod)}</td>
                        <td className="wms-td-number" style={{ color: 'var(--wms-danger)', fontWeight: 700 }}>
                          {item.varianceAmount > 0 ? `+${formatVnd(item.varianceAmount)}` : formatVnd(item.varianceAmount)}
                        </td>
                        <td>
                          {/* 1. Nút nhấn xem chi tiết phản hồi GHN nếu có */}
                          {item.carrierDisputeFeedback && (
                            <div style={{ marginBottom: isResolved ? '6px' : '0' }}>
                              <button
                                type="button"
                                className="wms-btn wms-btn-xs"
                                style={{
                                  backgroundColor: '#FAF5FF',
                                  color: '#7E22CE',
                                  border: '1px solid #D8B4FE',
                                  fontWeight: 600,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  padding: '3px 8px',
                                  borderRadius: '6px',
                                  cursor: 'pointer',
                                }}
                                onClick={() => setSelectedFeedbackItem(item)}
                                title="Nhấn để xem toàn văn phản hồi giải trình từ bưu cục GHN"
                              >
                                <Eye size={12} />
                                <span>Xem phản hồi GHN</span>
                              </button>
                              {item.carrierProposedFaultParty && item.carrierProposedFaultParty !== 'NONE' && !isResolved && (
                                <div style={{ fontSize: '11px', color: '#64748B', marginTop: '3px' }}>
                                  Đề xuất: <strong style={{ color: item.carrierProposedFaultParty === 'CARRIER_GHN' ? '#DC2626' : '#0284C7' }}>
                                    {item.carrierProposedFaultParty === 'CARRIER_GHN' ? 'Lệch do GHN' : 'Lệch do Shop'}
                                  </strong>
                                </div>
                              )}
                            </div>
                          )}

                          {/* 2. Nếu đã hoàn tất xử lý */}
                          {isResolved && (
                            <div>
                              {item.resolvedFaultParty && item.resolvedFaultParty !== 'NONE' && (
                                <div style={{ marginBottom: '3px' }}>
                                  <span
                                    style={{
                                      fontSize: '11px',
                                      fontWeight: 700,
                                      padding: '2px 7px',
                                      borderRadius: '4px',
                                      backgroundColor: item.resolvedFaultParty === 'ARA_STORE' ? '#F0F9FF' : '#FEF2F2',
                                      color: item.resolvedFaultParty === 'ARA_STORE' ? '#0284C7' : '#DC2626',
                                      border: item.resolvedFaultParty === 'ARA_STORE' ? '1px solid #BAE6FD' : '1px solid #FECACA',
                                    }}
                                  >
                                    {item.resolvedFaultParty === 'ARA_STORE' ? 'Lệch do ARA (Công nợ theo GHN)' : 'Lệch do GHN (Công nợ theo ARA)'}
                                  </span>
                                </div>
                              )}
                              <div style={{ color: 'var(--wms-text-primary)', fontWeight: 600, fontSize: '12px' }}>
                                {item.investigationNote || 'Đã ghi nhận phương án giải quyết'}
                              </div>
                            </div>
                          )}

                          {/* 3. Nếu chưa có phản hồi GHN và chưa xử lý */}
                          {!item.carrierDisputeFeedback && !isResolved && (
                            <div style={{ color: 'var(--wms-secondary)', fontStyle: 'italic', fontWeight: 500, fontSize: '12px' }}>
                              {isDisputing ? 'Đang chờ GHN tra soát...' : 'Chưa ghi nhận lý do sai lệch'}
                            </div>
                          )}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {isResolved ? (
                            <span className="wms-status-badge wms-status-completed">Đã xử lý xong</span>
                          ) : isFeedbackReceived ? (
                            <div>
                              <span
                                className="wms-status-badge"
                                style={{
                                  backgroundColor: '#FAF5FF',
                                  color: '#7E22CE',
                                  border: '1px solid #D8B4FE',
                                  fontWeight: 700,
                                }}
                              >
                                <MessageSquare size={12} /> GHN đã phản hồi
                              </span>
                              <div className="wms-helper-text" style={{ fontSize: '11px', marginTop: '2px', color: '#7E22CE' }}>
                                Chờ kế toán chốt
                              </div>
                            </div>
                          ) : isDisputing ? (
                            <div>
                              <span className="wms-status-badge wms-status-processing">Đã gửi khiếu nại</span>
                              <div className="wms-helper-text" style={{ fontSize: '11px', marginTop: '2px', color: 'var(--wms-accent-hover)' }}>
                                Chờ GHN trả lời
                              </div>
                            </div>
                          ) : (
                            <span className="wms-status-badge wms-status-rejected">Chờ xử lý</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {!isResolved && (
                            <div className="wms-row-actions" style={{ justifyContent: 'center', gap: '6px', flexWrap: 'wrap' }}>
                              {!isDisputing && !isFeedbackReceived && (
                                <button
                                  type="button"
                                  className="wms-btn wms-btn-danger wms-btn-sm"
                                  onClick={() => {
                                    setDisputeItem(item);
                                    setDisputeNote(`Khiếu nại sai lệch tiền thu hộ COD đơn ${item.orderCode} - Mã vận đơn ${item.waybillCode}.`);
                                  }}
                                >
                                  Khiếu nại
                                </button>
                              )}

                              {isDisputing && (
                                <button
                                  type="button"
                                  className="wms-btn wms-btn-sm"
                                  style={{
                                    backgroundColor: '#FAF5FF',
                                    color: '#7E22CE',
                                    border: '1px solid #D8B4FE',
                                    fontWeight: 600,
                                  }}
                                  disabled={receivingFeedbackId === item._id}
                                  onClick={() => handleReceiveGhnFeedback(item)}
                                  title="Nhận văn bản kết luận tra soát thực địa từ Bưu cục Giao Hàng Nhanh"
                                >
                                  <Truck size={13} className={receivingFeedbackId === item._id ? 'wms-spin' : ''} />
                                  <span>{receivingFeedbackId === item._id ? 'Đang nhận...' : 'Nhận phản hồi GHN'}</span>
                                </button>
                              )}

                              <button
                                type="button"
                                className="wms-btn wms-btn-primary wms-btn-sm"
                                onClick={() => handleOpenResolveModal(item)}
                                title="Xác định nguyên nhân sai lệch và chốt phương án tính công nợ"
                              >
                                Xử lý
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 6. MODAL KHIẾU NẠI HÃNG VẬN CHUYỂN CHUẨN WMS MODAL */}
      {disputeItem && (
        <div className="wms-modal-backdrop" role="dialog" aria-modal="true">
          <div className="wms-modal-dialog" style={{ maxWidth: '520px' }}>
            <div className="wms-modal-header">
              <h3 className="wms-modal-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <ShieldAlert size={18} color="var(--wms-danger)" />
                <span>Lập Khiếu nại Sai lệch COD tới Giao Hàng Nhanh</span>
              </h3>
              <button
                type="button"
                className="wms-btn wms-btn-default wms-btn-sm"
                onClick={() => setDisputeItem(null)}
              >
                <X size={14} />
              </button>
            </div>

            <form onSubmit={handleSendDispute}>
              <div className="wms-modal-body">
                <div style={{ backgroundColor: 'var(--wms-bg-subtle)', border: '1px solid var(--wms-border)', padding: '12px 14px', borderRadius: 'var(--wms-radius-md)', marginBottom: '14px', fontSize: '13px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ color: 'var(--wms-secondary)' }}>Mã đơn hàng:</span>
                    <strong>{disputeItem.orderCode}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ color: 'var(--wms-secondary)' }}>Mã vận đơn GHN:</span>
                    <strong style={{ color: 'var(--wms-accent-hover)' }}>{disputeItem.waybillCode}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ color: 'var(--wms-secondary)' }}>Tiền COD dự kiến:</span>
                    <strong>{formatVnd(disputeItem.systemExpectedCod)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ color: 'var(--wms-secondary)' }}>Tiền GHN báo thu:</span>
                    <strong style={{ color: 'var(--wms-success)' }}>{formatVnd(disputeItem.carrierReportedCod)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed var(--wms-border-strong)', paddingTop: '6px', marginTop: '6px' }}>
                    <span style={{ color: 'var(--wms-danger)', fontWeight: 600 }}>Chênh lệch cần đòi:</span>
                    <strong style={{ color: 'var(--wms-danger)', fontSize: '14px' }}>{formatVnd(Math.abs(disputeItem.varianceAmount))}</strong>
                  </div>
                </div>

                <div className="wms-field">
                  <label htmlFor="dispute-content" className="wms-label">
                    Nội dung khiếu nại & Yêu cầu giải trình <span className="wms-required">*</span>
                  </label>
                  <textarea
                    id="dispute-content"
                    className="wms-textarea"
                    rows="4"
                    value={disputeNote}
                    onChange={(e) => setDisputeNote(e.target.value)}
                    required
                    placeholder="Nhập nội dung tranh chấp gửi tới bộ phận đối soát của GHN..."
                  />
                </div>
              </div>

              <div className="wms-modal-footer">
                <button
                  type="button"
                  className="wms-btn wms-btn-default"
                  onClick={() => setDisputeItem(null)}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="wms-btn wms-btn-danger"
                  disabled={submittingDispute}
                >
                  <Send size={15} />
                  <span>{submittingDispute ? 'Đang gửi...' : 'Gửi Khiếu nại Hãng vận chuyển'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7. MODAL XỬ LÝ SAI LỆCH COD & CHỌN BÊN CHỊU TRÁCH NHIỆM CÔNG NỢ */}
      {resolveModalItem && (
        <div className="wms-modal-backdrop" role="dialog" aria-modal="true">
          <div className="wms-modal-dialog" style={{ maxWidth: '560px' }}>
            <div className="wms-modal-header">
              <h3 className="wms-modal-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CheckCircle2 size={18} color="var(--wms-success)" />
                <span>Xử Lý Sai Lệch Tiền COD: {resolveModalItem.orderCode}</span>
              </h3>
              <button
                type="button"
                className="wms-btn wms-btn-default wms-btn-sm"
                onClick={() => setResolveModalItem(null)}
              >
                <X size={14} />
              </button>
            </div>

            <form onSubmit={handleConfirmResolveSubmit}>
              <div className="wms-modal-body">
                {/* Thông tin đối chiếu đơn */}
                <div style={{ backgroundColor: 'var(--wms-bg-subtle)', border: '1px solid var(--wms-border)', padding: '12px 14px', borderRadius: 'var(--wms-radius-md)', marginBottom: '14px', fontSize: '13px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ color: 'var(--wms-secondary)' }}>Mã đơn hàng:</span>
                    <strong>{resolveModalItem.orderCode}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ color: 'var(--wms-secondary)' }}>Mã vận đơn GHN:</span>
                    <strong style={{ color: 'var(--wms-accent-hover)' }}>{resolveModalItem.waybillCode}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ color: 'var(--wms-secondary)' }}>Tiền COD dự kiến (Bên ARA):</span>
                    <strong>{formatVnd(resolveModalItem.systemExpectedCod)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ color: 'var(--wms-secondary)' }}>Tiền GHN báo thu (Bên Vận chuyển):</span>
                    <strong style={{ color: 'var(--wms-success)' }}>{formatVnd(resolveModalItem.carrierReportedCod)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed var(--wms-border-strong)', paddingTop: '6px', marginTop: '6px' }}>
                    <span style={{ color: 'var(--wms-danger)', fontWeight: 600 }}>Chênh lệch sai lệch:</span>
                    <strong style={{ color: 'var(--wms-danger)', fontSize: '14px' }}>{formatVnd(Math.abs(resolveModalItem.varianceAmount))}</strong>
                  </div>
                </div>

                {/* HIỂN THỊ KẾT QUẢ ĐIỀU TRA TỪ GHN NẾU ĐÃ CÓ */}
                {resolveModalItem.carrierDisputeFeedback && (
                  <div
                    style={{
                      backgroundColor: '#FAF5FF',
                      border: '1px solid #D8B4FE',
                      borderRadius: '8px',
                      padding: '12px 14px',
                      marginBottom: '14px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#7E22CE', fontWeight: 700, fontSize: '13px' }}>
                        <Truck size={15} />
                        <span>Phản Hồi Giải Trình Từ Bưu Cục GHN:</span>
                      </div>
                      {resolveModalItem.carrierDisputeFeedbackAt && (
                        <span style={{ fontSize: '11px', color: '#9333EA' }}>
                          {new Date(resolveModalItem.carrierDisputeFeedbackAt).toLocaleString('vi-VN')}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '12.5px', color: '#4C1D95', lineHeight: '1.5' }}>
                      {resolveModalItem.carrierDisputeFeedback}
                    </div>
                    {resolveModalItem.carrierProposedFaultParty && resolveModalItem.carrierProposedFaultParty !== 'NONE' && (
                      <div style={{ marginTop: '8px', paddingTop: '6px', borderTop: '1px dashed #E9D5FF', fontSize: '11.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ color: '#6B21A8' }}>Gợi ý hướng xử lý:</span>
                        <strong style={{ color: resolveModalItem.carrierProposedFaultParty === 'CARRIER_GHN' ? '#DC2626' : '#0284C7' }}>
                          {resolveModalItem.carrierProposedFaultParty === 'CARRIER_GHN'
                            ? 'Lệch do GHN (GHN bồi hoàn đủ)'
                            : 'Lệch do ARA Store (Shop tự chịu)'}
                        </strong>
                      </div>
                    )}
                  </div>
                )}

                {/* 2 OPTIONS CHỌN BÊN CHỊU TRÁCH NHIỆM SAI LỆCH */}
                <div className="wms-field" style={{ marginBottom: '14px' }}>
                  <label className="wms-label" style={{ fontWeight: 700, marginBottom: '6px', display: 'block' }}>
                    Xác định nguyên nhân sai lệch & Cơ chế tính công nợ <span className="wms-required">*</span>
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    {/* Option 1: Lệch do ARA Store */}
                    <label
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        padding: '12px',
                        borderRadius: '8px',
                        border: resolvedFaultParty === 'ARA_STORE' ? '2px solid #0284C7' : '1px solid var(--wms-border)',
                        backgroundColor: resolvedFaultParty === 'ARA_STORE' ? '#F0F9FF' : '#FFFFFF',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease-in-out',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                          type="radio"
                          name="faultPartyOption"
                          value="ARA_STORE"
                          checked={resolvedFaultParty === 'ARA_STORE'}
                          onChange={() => setResolvedFaultParty('ARA_STORE')}
                        />
                        <strong style={{ fontSize: '13px', color: resolvedFaultParty === 'ARA_STORE' ? '#0284C7' : 'var(--wms-text-primary)' }}>
                          Lệch COD do ARA Store
                        </strong>
                      </div>
                      <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '6px', lineHeight: '1.4' }}>
                        👉 Tiền công nợ COD sẽ <strong>tính theo bên Vận chuyển (GHN)</strong> ({formatVnd(resolveModalItem.carrierReportedCod)}). Shop tự chịu khoản lệch.
                      </div>
                    </label>

                    {/* Option 2: Lệch do GHN */}
                    <label
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        padding: '12px',
                        borderRadius: '8px',
                        border: resolvedFaultParty === 'CARRIER_GHN' ? '2px solid #DC2626' : '1px solid var(--wms-border)',
                        backgroundColor: resolvedFaultParty === 'CARRIER_GHN' ? '#FEF2F2' : '#FFFFFF',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease-in-out',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                          type="radio"
                          name="faultPartyOption"
                          value="CARRIER_GHN"
                          checked={resolvedFaultParty === 'CARRIER_GHN'}
                          onChange={() => setResolvedFaultParty('CARRIER_GHN')}
                        />
                        <strong style={{ fontSize: '13px', color: resolvedFaultParty === 'CARRIER_GHN' ? '#DC2626' : 'var(--wms-text-primary)' }}>
                          Lệch COD do GHN
                        </strong>
                      </div>
                      <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '6px', lineHeight: '1.4' }}>
                        👉 Tiền công nợ COD sẽ <strong>tính theo bên ARA</strong> ({formatVnd(resolveModalItem.systemExpectedCod)}). GHN/shipper phải bồi hoàn đủ.
                      </div>
                    </label>
                  </div>

                  {/* Hộp Preview số tiền công nợ sau xử lý */}
                  <div
                    style={{
                      marginTop: '10px',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      background: resolvedFaultParty === 'ARA_STORE' ? '#F0F9FF' : '#FEF2F2',
                      border: resolvedFaultParty === 'ARA_STORE' ? '1px solid #BAE6FD' : '1px solid #FECACA',
                      fontSize: '12px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span style={{ color: 'var(--wms-text-secondary)' }}>Tiền COD ghi nhận vào công nợ GHN:</span>
                    <strong style={{ color: resolvedFaultParty === 'ARA_STORE' ? '#0284C7' : '#DC2626', fontSize: '13.5px' }}>
                      {resolvedFaultParty === 'ARA_STORE'
                        ? formatVnd(resolveModalItem.carrierReportedCod)
                        : formatVnd(resolveModalItem.systemExpectedCod)}
                    </strong>
                  </div>
                </div>

                <div className="wms-field">
                  <label htmlFor="resolve-reason-input" className="wms-label">
                    Lý do & Ghi chú phương án giải quyết <span className="wms-required">*</span>
                  </label>
                  <textarea
                    id="resolve-reason-input"
                    className="wms-textarea"
                    rows="3"
                    value={resolveReason}
                    onChange={(e) => setResolveReason(e.target.value)}
                    required
                    placeholder={
                      resolvedFaultParty === 'ARA_STORE'
                        ? 'VD: Shop báo giá nhầm / Đồng ý chiết khấu cho khách / Gửi thiếu quà tặng nên bớt tiền...'
                        : 'VD: Shipper thu thiếu tiền tại nhà khách / Làm rách bọc hàng / GHN xác nhận bồi hoàn đủ...'
                    }
                  />
                  <span className="wms-helper-text" style={{ marginTop: '4px' }}>
                    Nội dung này sẽ được lưu vào lịch sử đối soát và hiển thị trực tiếp tại cột "Lý do & Ghi chú sai lệch".
                  </span>
                </div>
              </div>

              <div className="wms-modal-footer">
                <button
                  type="button"
                  className="wms-btn wms-btn-default"
                  onClick={() => setResolveModalItem(null)}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="wms-btn wms-btn-primary"
                  disabled={submittingResolve}
                >
                  <CheckCircle2 size={15} />
                  <span>{submittingResolve ? 'Đang lưu...' : 'Lưu & Hoàn tất xử lý'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 8. MODAL CHI TIẾT PHẢN HỒI TỪ GIAO HÀNG NHANH */}
      {selectedFeedbackItem && (
        <div
          className="wms-modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={() => setSelectedFeedbackItem(null)}
          style={{ zIndex: 1050 }}
        >
          <div
            className="wms-modal-dialog"
            style={{ maxWidth: '560px', width: '92%' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="wms-modal-header" style={{ padding: '16px 20px', borderBottom: '1px solid var(--wms-border)' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Truck size={20} color="#7E22CE" />
                  <h3 className="wms-modal-title" style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: '#7E22CE' }}>
                    Chi Tiết Phản Hồi Từ Giao Hàng Nhanh
                  </h3>
                </div>
                <div className="wms-helper-text" style={{ fontSize: '12px', marginTop: '3px' }}>
                  Đơn hàng: <span className="wms-code-pill" style={{ fontWeight: 700 }}>{selectedFeedbackItem.orderCode}</span> • Mã vận đơn: <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--wms-accent-hover)' }}>{selectedFeedbackItem.waybillCode}</span>
                </div>
              </div>
              <button
                type="button"
                className="wms-btn wms-btn-default wms-btn-xs"
                onClick={() => setSelectedFeedbackItem(null)}
                style={{ borderRadius: '50%', width: '28px', height: '28px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <X size={15} />
              </button>
            </div>

            <div className="wms-modal-body" style={{ padding: '16px 20px', maxHeight: '420px', overflowY: 'auto' }}>
              {/* Tóm tắt số tiền */}
              <div
                style={{
                  backgroundColor: 'var(--wms-bg-subtle)',
                  border: '1px solid var(--wms-border)',
                  padding: '12px 14px',
                  borderRadius: 'var(--wms-radius-md)',
                  marginBottom: '14px',
                  fontSize: '13px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ color: 'var(--wms-secondary)' }}>Tiền COD dự kiến (Bên ARA):</span>
                  <strong>{formatVnd(selectedFeedbackItem.systemExpectedCod)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ color: 'var(--wms-secondary)' }}>Tiền GHN báo thu:</span>
                  <strong style={{ color: 'var(--wms-success)' }}>{formatVnd(selectedFeedbackItem.carrierReportedCod)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed var(--wms-border-strong)', paddingTop: '6px', marginTop: '6px' }}>
                  <span style={{ color: 'var(--wms-danger)', fontWeight: 600 }}>Chênh lệch đối soát:</span>
                  <strong style={{ color: 'var(--wms-danger)', fontSize: '13.5px' }}>
                    {formatVnd(Math.abs(selectedFeedbackItem.varianceAmount))}
                  </strong>
                </div>
              </div>

              {/* Văn bản giải trình từ GHN */}
              <div
                style={{
                  backgroundColor: '#FAF5FF',
                  border: '1px solid #D8B4FE',
                  borderRadius: '8px',
                  padding: '14px',
                  marginBottom: '14px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#7E22CE', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <MessageSquare size={14} /> Văn bản kết luận từ CSKH / Bưu cục GHN:
                  </span>
                  {selectedFeedbackItem.carrierDisputeFeedbackAt && (
                    <span style={{ fontSize: '11px', color: '#9333EA', fontWeight: 500 }}>
                      {new Date(selectedFeedbackItem.carrierDisputeFeedbackAt).toLocaleString('vi-VN')}
                    </span>
                  )}
                </div>
                <div
                  style={{
                    fontSize: '13px',
                    color: '#334155',
                    lineHeight: '1.6',
                    backgroundColor: '#FFFFFF',
                    padding: '12px',
                    borderRadius: '6px',
                    border: '1px solid #E9D5FF',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {selectedFeedbackItem.carrierDisputeFeedback}
                </div>

                {selectedFeedbackItem.carrierProposedFaultParty && selectedFeedbackItem.carrierProposedFaultParty !== 'NONE' && (
                  <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px dashed #D8B4FE', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ color: '#6B21A8', fontWeight: 600 }}>Đề xuất trách nhiệm:</span>
                    <strong style={{ color: selectedFeedbackItem.carrierProposedFaultParty === 'CARRIER_GHN' ? '#DC2626' : '#0284C7' }}>
                      {selectedFeedbackItem.carrierProposedFaultParty === 'CARRIER_GHN'
                        ? 'Lệch do GHN (GHN chấp thuận bồi hoàn)'
                        : 'Lệch do ARA Store (Shop tự chịu)'}
                    </strong>
                  </div>
                )}
              </div>

              {/* Nếu đã xử lý xong */}
              {selectedFeedbackItem.redFlagStatus === 'RESOLVED_ADJUSTED' && (
                <div
                  style={{
                    backgroundColor: '#F0FDF4',
                    border: '1px solid #BBF7D0',
                    borderRadius: '8px',
                    padding: '12px 14px',
                    fontSize: '12.5px',
                  }}
                >
                  <div style={{ fontWeight: 700, color: '#166534', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <CheckCircle2 size={14} /> Kế toán đã chốt xử lý:
                  </div>
                  <div>
                    Bên chịu trách nhiệm: <strong style={{ color: selectedFeedbackItem.resolvedFaultParty === 'ARA_STORE' ? '#0284C7' : '#DC2626' }}>
                      {selectedFeedbackItem.resolvedFaultParty === 'ARA_STORE' ? 'Lệch do ARA Store' : 'Lệch do GHN'}
                    </strong>
                  </div>
                  {selectedFeedbackItem.investigationNote && (
                    <div style={{ marginTop: '4px', color: '#374151' }}>
                      Ghi chú: {selectedFeedbackItem.investigationNote}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="wms-modal-footer" style={{ padding: '12px 20px', borderTop: '1px solid var(--wms-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                type="button"
                className="wms-btn wms-btn-default wms-btn-sm"
                onClick={() => setSelectedFeedbackItem(null)}
              >
                Đóng
              </button>

              {selectedFeedbackItem.redFlagStatus !== 'RESOLVED_ADJUSTED' && (
                <button
                  type="button"
                  className="wms-btn wms-btn-primary wms-btn-sm"
                  onClick={() => {
                    const itemToResolve = selectedFeedbackItem;
                    setSelectedFeedbackItem(null);
                    handleOpenResolveModal(itemToResolve);
                  }}
                >
                  <CheckCircle2 size={14} />
                  <span>Tiến hành xử lý</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CodReconciliationPage;
