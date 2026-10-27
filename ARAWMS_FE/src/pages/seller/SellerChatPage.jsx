/**
 * ============================================================================
 * @title        : Seller Chat Workspace Page (Pancake-style Revamp)
 * @author       : Nguyễn Quang Huy
 * @createdDate  : 2026-10-27
 * @lastModified : 2026-10-27
 * @description  : Màn hình bán hàng đa kênh 3 cột co giãn linh hoạt (Resizable 3-Pane)
 *                 theo chuẩn trải nghiệm Pancake, bao gồm Danh sách hội thoại (Pane 1),
 *                 Khung chat kèm Quick Tag Bar (Pane 2) và Bảng tác nghiệp tạo đơn/CRM (Pane 3).
 * @module       : Conversational Commerce / Seller Chat Workspace
 * @layer        : Front-end
 * ============================================================================
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { User, ShoppingBag, History, PlusCircle, Settings2 } from 'lucide-react';
import ConversationList from '../../components/seller/ConversationList';
import ChatBox from '../../components/seller/ChatBox';
import CustomerProfilePanel from '../../components/seller/CustomerProfilePanel';
import CustomerOrderHistory from '../../components/seller/CustomerOrderHistory';
import QuickOrderPanel from '../../components/seller/QuickOrderPanel';
import QuickOrderModal from '../../components/seller/QuickOrderModal';
import CreateRmaModal from '../../components/seller/CreateRmaModal';
import OrderDetailModal from '../../components/seller/OrderDetailModal';
import { sellerService } from '../../services/sellerService';

/**
 * Trang chính Không gian làm việc bán hàng (Seller Chat Workspace) của Seller.
 *
 * @component
 * @returns {JSX.Element} Toàn bộ giao diện 3-pane bán hàng phong cách Pancake.
 */
const SellerChatPage = () => {
  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('order'); // 'crm' | 'order' | 'history'
  const [activeFilterTag, setActiveFilterTag] = useState('');
  const [allTags, setAllTags] = useState([]);

  // Resizable pane widths (px)
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
      const containerW = containerRef.current?.offsetWidth || 1200;
      if (draggingRef.current === 'left') {
        const newW = Math.max(240, Math.min(420, startWRef.current + delta));
        setPane1W(newW);
      } else {
        const newW = Math.max(320, Math.min(560, startWRef.current - delta));
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
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  const TABS = [
    { id: 'crm',     icon: <User size={13} />,        label: 'Hồ sơ' },
    { id: 'order',   icon: <ShoppingBag size={13} />, label: 'Tạo đơn' },
    { id: 'history', icon: <History size={13} />,     label: 'Đơn cũ' },
  ];

  return (
    <div className="ara-seller-page" ref={containerRef}>
      <div className="ara-seller-workspace-body" style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>

        {/* ===== PANE 1: Conversation List ===== */}
        <div className="ara-seller-pane-conversations" style={{ width: pane1W, minWidth: 220, maxWidth: 420, flexShrink: 0 }}>
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
          className="ara-pane-splitter"
          onMouseDown={(e) => startDrag('left', e)}
          title="Kéo để thay đổi chiều rộng"
        />

        {/* ===== PANE 2: Chat Window ===== */}
        <div className="ara-seller-pane-chat" style={{ flex: 1, minWidth: 0 }}>
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
          className="ara-pane-splitter"
          onMouseDown={(e) => startDrag('right', e)}
          title="Kéo để thay đổi chiều rộng"
        />

        {/* ===== PANE 3: Widget Panel ===== */}
        <div className="ara-seller-pane-widgets" style={{ width: pane3W, minWidth: 320, maxWidth: 560, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
          {/* Tab Nav */}
          <div className="ara-widget-nav-tabs">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`ara-widget-tab-btn ${activeTab === tab.id ? 'active' : ''}`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="ara-widget-tab-content" style={{ flex: 1, overflowY: 'auto' }}>
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
        onRmaCreated={() => alert('Phiếu RMA đã được tạo thành công!')}
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
