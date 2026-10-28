/**
 * ============================================================================
 * @title        : Seller Chat Workspace Page (Bootstrap / React-Bootstrap)
 * @author       : Nguyễn Quang Huy
 * @createdDate  : 2026-10-27
 * @lastModified : 2026-10-28
 * @description  : Màn hình bán hàng đa kênh 3 cột co giãn linh hoạt (Resizable 3-Pane)
 *                 theo chuẩn trải nghiệm Pancake, bao gồm Danh sách hội thoại (Pane 1),
 *                 Khung chat kèm Quick Tag Bar (Pane 2) và Bảng tác nghiệp tạo đơn/CRM (Pane 3).
 *                 (Refactor 2026-10-28: giao diện chỉ dùng Bootstrap / React-Bootstrap + Splitter kéo chuột.)
 * @module       : Conversational Commerce / Seller Chat Workspace
 * @layer        : Front-end
 * ============================================================================
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Nav, Button, Badge, Stack } from 'react-bootstrap';
import ConversationList from '../../components/seller/ConversationList';
import ChatBox from '../../components/seller/ChatBox';
import CustomerProfilePanel from '../../components/seller/CustomerProfilePanel';
import CustomerOrderHistory from '../../components/seller/CustomerOrderHistory';
import QuickOrderPanel from '../../components/seller/QuickOrderPanel';
import QuickOrderModal from '../../components/seller/QuickOrderModal';
import CreateRmaModal from '../../components/seller/CreateRmaModal';
import OrderDetailModal from '../../components/seller/OrderDetailModal';
import { sellerService } from '../../services/sellerService';
import { useToast } from '../../context/ToastContext';
import { Icon } from '../../components/seller/SellerUi';

/**
 * Trang chính Không gian làm việc bán hàng (Seller Chat Workspace) của Seller.
 *
 * @component
 * @returns {JSX.Element} Toàn bộ giao diện 3-pane bán hàng phong cách Pancake.
 */
const SellerChatPage = () => {
  const { showSuccess } = useToast();
  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('order'); // 'crm' | 'order' | 'history'
  const [activeFilterTag, setActiveFilterTag] = useState('');
  const [allTags, setAllTags] = useState([]);

  // Resizable pane widths (px) - User explicitly chose to retain mouse-drag splitter
  const [pane1W, setPane1W] = useState(300);
  const [pane3W, setPane3W] = useState(380);
  const draggingRef = useRef(null); // 'left' | 'right'
  const startXRef = useRef(0);
  const startWRef = useRef(0);
  const containerRef = useRef(null);

  // Modals
  const [quickOrderModalOpen, setQuickOrderModalOpen] = useState(false);
  const [rmaModalOpen, setRmaModalOpen] = useState(false);
  const [selectedOrderForRma, setSelectedOrderForRma] = useState(null);
  const [orderDetailOpen, setOrderDetailOpen] = useState(false);
  const [selectedOrderDetail, setSelectedOrderDetail] = useState(null);

  useEffect(() => {
    fetchConversations();
    fetchTags();
  }, []);

  const fetchConversations = async () => {
    try {
      setLoading(true);
      const res = await sellerService.getConversations({ limit: 50 });
      if (res.success) {
        const items = res.data.items || [];
        setConversations(items);
        if (items.length > 0 && !selectedConversation) setSelectedConversation(items[0]);
      }
    } catch (err) {
      console.warn('Lỗi tải hội thoại:', err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchTags = async () => {
    try {
      const res = await sellerService.getTagList();
      if (res.success) setAllTags(res.data || []);
    } catch { /* silent */ }
  };

  const handleTagAdded = (updatedConv) => {
    setSelectedConversation(updatedConv);
    setConversations(conversations.map((c) => (c._id === updatedConv._id ? updatedConv : c)));
  };

  const handleCustomerUpdated = (updatedCustomer) => {
    if (selectedConversation) {
      setSelectedConversation({ ...selectedConversation, customerId: updatedCustomer });
    }
  };

  const handleOpenRma = (order) => {
    setSelectedOrderForRma(order);
    setRmaModalOpen(true);
  };

  const handleOpenOrderDetail = (order) => {
    setSelectedOrderDetail(order);
    setOrderDetailOpen(true);
  };

  // ===== Resizable Splitter Logic =====
  const startDrag = useCallback((side, e) => {
    draggingRef.current = side;
    startXRef.current = e.clientX;
    startWRef.current = side === 'left' ? pane1W : pane3W;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [pane1W, pane3W]);

  useEffect(() => {
    const onMove = (e) => {
      if (!draggingRef.current) return;
      const delta = e.clientX - startXRef.current;
      if (draggingRef.current === 'left') {
        const newW = Math.max(220, Math.min(420, startWRef.current + delta));
        setPane1W(newW);
      } else {
        const newW = Math.max(300, Math.min(560, startWRef.current - delta));
        setPane3W(newW);
      }
    };
    const onUp = () => {
      draggingRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  const TABS = [
    { id: 'crm',     icon: 'person',        label: 'Hồ sơ' },
    { id: 'order',   icon: 'bag-plus',      label: 'Tạo đơn' },
    { id: 'history', icon: 'clock-history', label: 'Đơn cũ' },
  ];

  return (
    <div
      ref={containerRef}
      className="d-flex flex-column bg-body-tertiary"
      style={{ height: 'calc(100vh - 75px)', minHeight: 600, overflow: 'hidden' }}
    >
      {/* ===== Header Bar ===== */}
      <div className="bg-dark text-white px-3 py-2 d-flex align-items-center justify-content-between border-bottom shadow-sm flex-shrink-0">
        <Stack direction="horizontal" gap={2} className="align-items-center">
          <Icon name="shop" className="text-warning fs-5" />
          <span className="fw-bold fs-6">ARA SELLER WORKSPACE</span>
          <Badge bg="warning" text="dark" pill className="small">PANCAKE POS</Badge>
        </Stack>

        <Stack direction="horizontal" gap={2}>
          <Button
            size="sm"
            variant="warning"
            className="fw-bold text-dark d-flex align-items-center gap-1"
            onClick={() => {
              setActiveTab('order');
              setQuickOrderModalOpen(true);
            }}
          >
            <Icon name="plus-circle" /> Tạo đơn nhanh
          </Button>
          <Button
            size="sm"
            variant="outline-light"
            onClick={fetchConversations}
            title="Đồng bộ hội thoại"
          >
            <Icon name="arrow-clockwise" />
          </Button>
        </Stack>
      </div>

      {/* ===== Triple-Pane Layout Container ===== */}
      <div className="d-flex flex-grow-1 overflow-hidden p-2 gap-0">
        <div className="d-flex flex-grow-1 border rounded-3 bg-white shadow-sm overflow-hidden">
          {/* ===== PANE 1: Conversation List ===== */}
          <div
            className="d-flex flex-column h-100 overflow-hidden bg-white"
            style={{ width: pane1W, minWidth: 220, maxWidth: 420, flexShrink: 0 }}
          >
            <ConversationList
              conversations={conversations}
              selectedId={selectedConversation?._id}
              onSelect={setSelectedConversation}
              onTagFilter={setActiveFilterTag}
              activeFilterTag={activeFilterTag}
              loading={loading}
              allTags={allTags}
            />
          </div>

          {/* Splitter Left */}
          <div
            className="ara-pane-splitter bg-body-secondary border-start border-end"
            onMouseDown={(e) => startDrag('left', e)}
            title="Kéo để thay đổi chiều rộng"
          />

          {/* ===== PANE 2: Chat Window ===== */}
          <div className="d-flex flex-column h-100 flex-grow-1" style={{ minWidth: 0 }}>
            <ChatBox
              conversation={selectedConversation}
              onTagAdded={handleTagAdded}
              allTags={allTags}
              onTagsRefresh={fetchTags}
              onOpenQuickOrder={() => {
                setActiveTab('order');
                setQuickOrderModalOpen(true);
              }}
            />
          </div>

          {/* Splitter Right */}
          <div
            className="ara-pane-splitter bg-body-secondary border-start border-end"
            onMouseDown={(e) => startDrag('right', e)}
            title="Kéo để thay đổi chiều rộng"
          />

          {/* ===== PANE 3: Widget Panel (CRM / Quick Order / Order History) ===== */}
          <div
            className="d-flex flex-column h-100 bg-white"
            style={{ width: pane3W, minWidth: 300, maxWidth: 560, flexShrink: 0 }}
          >
            {/* Tab Nav */}
            <Nav variant="tabs" className="px-2 pt-2 bg-body-tertiary flex-shrink-0" activeKey={activeTab}>
              {TABS.map((tab) => (
                <Nav.Item key={tab.id}>
                  <Nav.Link
                    eventKey={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className="d-flex align-items-center gap-1.5 py-1.5 px-3 small fw-semibold"
                  >
                    <Icon name={tab.icon} />
                    <span>{tab.label}</span>
                  </Nav.Link>
                </Nav.Item>
              ))}
            </Nav>

            {/* Tab Content */}
            <div className="flex-grow-1 overflow-auto p-3 bg-white">
              {activeTab === 'crm' && (
                <CustomerProfilePanel
                  customer={selectedConversation?.customerId}
                  conversationId={selectedConversation?._id}
                  onCustomerUpdated={handleCustomerUpdated}
                />
              )}
              {activeTab === 'order' && (
                <QuickOrderPanel
                  customer={selectedConversation?.customerId}
                  conversationId={selectedConversation?._id}
                  onOrderCreated={() => setActiveTab('history')}
                />
              )}
              {activeTab === 'history' && (
                <CustomerOrderHistory
                  customerId={selectedConversation?.customerId?._id}
                  onRequestRma={handleOpenRma}
                  onViewDetail={handleOpenOrderDetail}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Quick Order Modal Popup (Hiện ngay khi bấm Tạo đơn nhanh) */}
      <QuickOrderModal
        isOpen={quickOrderModalOpen}
        onClose={() => setQuickOrderModalOpen(false)}
        customer={selectedConversation?.customerId}
        conversationId={selectedConversation?._id}
        onOrderCreated={() => {
          setQuickOrderModalOpen(false);
          setActiveTab('history');
        }}
      />

      {/* RMA Modal */}
      <CreateRmaModal
        isOpen={rmaModalOpen}
        onClose={() => setRmaModalOpen(false)}
        order={selectedOrderForRma}
        onRmaCreated={() => showSuccess('Phiếu RMA đã được tạo thành công!', 'Tạo RMA')}
      />

      {/* Order Detail Modal */}
      <OrderDetailModal
        isOpen={orderDetailOpen}
        order={selectedOrderDetail}
        onClose={() => setOrderDetailOpen(false)}
        onStatusUpdated={(updatedOrder) => setSelectedOrderDetail(updatedOrder)}
        onOpenRma={handleOpenRma}
      />
    </div>
  );
};

export default SellerChatPage;
