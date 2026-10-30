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
import { Nav, Button, Badge, Stack, Offcanvas } from 'react-bootstrap';
import ConversationList from '../../components/seller/ConversationList';
import ChatBox from '../../components/seller/ChatBox';
import CustomerProfilePanel from '../../components/seller/CustomerProfilePanel';
import CustomerOrderHistory from '../../components/seller/CustomerOrderHistory';
import QuickOrderPanel from '../../components/seller/QuickOrderPanel';
import QuickOrderModal from '../../components/seller/QuickOrderModal';
import CreateRmaModal from '../../components/seller/CreateRmaModal';
import OrderDetailModal from '../../components/seller/OrderDetailModal';
import { sellerService } from '../../services/sellerService';
import { getSocket } from '../../services/socketService';
import { useToast } from '../../context/ToastContext';
import { Icon } from '../../components/seller/SellerUi';

// Bộ đệm in-memory lưu trữ danh sách hội thoại để chuyển trang tức thì (0ms) thay vì chờ tải lại từ đầu
let memoryConversations = [];
let memorySelectedConv = null;
let memoryTags = [];
let memoryFetchTime = 0;

/**
 * Trang chính Không gian làm việc bán hàng (Seller Chat Workspace) của Seller.
 *
 * @component
 * @returns {JSX.Element} Toàn bộ giao diện 3-pane bán hàng phong cách Pancake.
 */
const SellerChatPage = () => {
  const { showSuccess } = useToast();
  // Khởi tạo ngay từ cache bộ nhớ nếu đã từng tải trước đó trong phiên làm việc
  const [conversations, setConversations] = useState(memoryConversations);
  const [selectedConversation, setSelectedConversation] = useState(memorySelectedConv || memoryConversations[0] || null);
  const [loading, setLoading] = useState(memoryConversations.length === 0);
  const [activeTab, setActiveTab] = useState('order'); // 'crm' | 'order' | 'history'
  const [activeFilterTag, setActiveFilterTag] = useState('');
  const [allTags, setAllTags] = useState(memoryTags);

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

  // Responsive viewport states (International standard: Mobile < 768, Tablet 768-1199, Desktop >= 1200)
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1280);
  const [mobileView, setMobileView] = useState('list'); // 'list' | 'chat'
  const [pane3Visible, setPane3Visible] = useState(true); // Desktop toggle
  const [offcanvasOpen, setOffcanvasOpen] = useState(false); // Tablet & Mobile drawer

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isMobile = windowWidth < 768;
  const isTablet = windowWidth >= 768 && windowWidth < 1200;
  const isDesktop = windowWidth >= 1200;

  // Toggle right panel (CRM / Quick Order / History)
  const handleToggleRightPanel = () => {
    if (isDesktop) {
      setPane3Visible((prev) => !prev);
    } else {
      setOffcanvasOpen((prev) => !prev);
    }
  };

  // Đồng bộ lựa chọn vào bộ đệm bộ nhớ và đánh dấu ĐÃ ĐỌC (xóa ngay badge đỏ tức thì)
  const handleSelectConversation = (conv) => {
    if (!conv) return;
    const updatedConv = { ...conv, unreadCount: 0 };
    memorySelectedConv = updatedConv;
    setSelectedConversation(updatedConv);
    setMobileView('chat'); // Tự động trượt sang màn hình chat trên mobile

    // Cập nhật ngay trong danh sách hội thoại: đưa unreadCount về 0 tức thì (0ms)
    setConversations((prev) =>
      prev.map((c) => (c._id === conv._id ? { ...c, unreadCount: 0 } : c))
    );

    // Gọi API đánh dấu đã đọc
    sellerService.markConversationAsRead(conv._id).catch(() => {});
  };

  useEffect(() => {
    fetchAllData();

    // Kết nối Socket.io và tham gia phòng Seller Workspace
    const socket = getSocket();
    socket.emit('join_seller_workspace');

    // Lắng nghe sự kiện hội thoại được cập nhật (tin nhắn mới từ khách hoặc phản hồi từ Seller)
    const handleConversationUpdated = (updatedConv) => {
      if (!updatedConv?._id) return;

      setConversations((prev) => {
        const isCurrentSelected = memorySelectedConv?._id === updatedConv._id;

        // Nếu là hội thoại người bán đang mở xem, giữ unreadCount = 0
        const convToSave = isCurrentSelected ? { ...updatedConv, unreadCount: 0 } : updatedConv;

        const filtered = prev.filter((c) => c._id !== updatedConv._id);
        const newList = [convToSave, ...filtered];
        memoryConversations = newList;
        return newList;
      });

      // Nếu đúng hội thoại đang mở thì cập nhật cả pane chat
      if (memorySelectedConv?._id === updatedConv._id) {
        setSelectedConversation((prev) => ({
          ...prev,
          ...updatedConv,
          unreadCount: 0,
        }));
      }
    };

    // Lắng nghe sự kiện hội thoại đã đọc từ Seller
    const handleConversationRead = ({ conversationId }) => {
      if (!conversationId) return;
      setConversations((prev) =>
        prev.map((c) => (c._id === conversationId ? { ...c, unreadCount: 0 } : c))
      );
    };

    socket.on('conversation_updated', handleConversationUpdated);
    socket.on('conversation_read', handleConversationRead);

    // Đồng bộ nền dự phòng (45s một lần phòng khi ngắt kết nối mạng)
    const interval = setInterval(() => {
      fetchAllData(true);
    }, 45000);

    return () => {
      socket.off('conversation_updated', handleConversationUpdated);
      socket.off('conversation_read', handleConversationRead);
      clearInterval(interval);
    };
  }, []);

  /**
   * Tải song song danh sách hội thoại và danh sách thẻ tags (Parallel Promise execution)
   * Áp dụng Stale-While-Revalidate: Hiển thị ngay từ memory cache, cập nhật ngầm.
   */
  const fetchAllData = async (isSilent = false) => {
    try {
      if (!isSilent && memoryConversations.length === 0) setLoading(true);

      const [convRes, tagRes] = await Promise.all([
        sellerService.getConversations({ limit: 30 }),
        sellerService.getTagList().catch(() => ({ success: false, data: [] })),
      ]);

      if (convRes.success) {
        let items = convRes.data.items || [];

        // Đảm bảo hội thoại người bán đang xem không bị nhảy lại số chưa đọc
        items = items.map((c) => {
          if (memorySelectedConv?._id === c._id) {
            return { ...c, unreadCount: 0 };
          }
          return c;
        });

        memoryConversations = items;
        setConversations(items);

        // Giữ nguyên hội thoại đang chọn hoặc gán cuộc hội thoại đầu tiên
        if (items.length > 0) {
          const currentId = memorySelectedConv?._id;
          const matched = items.find((c) => c._id === currentId);
          const nextSelected = matched || items[0];
          memorySelectedConv = nextSelected;
          if (!memorySelectedConv || !currentId) {
            setSelectedConversation(nextSelected);
          }
        }
      }

      if (tagRes.success) {
        const tags = tagRes.data || [];
        memoryTags = tags;
        setAllTags(tags);
      }
    } catch (err) {
      console.warn('Lỗi tải dữ liệu chat workspace:', err.message);
    } finally {
      if (!isSilent) setLoading(false);
    }
  };

  const handleTagAdded = (updatedConv) => {
    if (!updatedConv?._id) return;
    memorySelectedConv = updatedConv;
    setSelectedConversation(updatedConv);
    setConversations((prev) => {
      const nextList = prev.map((c) => (c._id === updatedConv._id ? { ...c, ...updatedConv } : c));
      memoryConversations = nextList;
      return nextList;
    });
  };

  const handleCustomerUpdated = (updatedCustomer) => {
    if (!updatedCustomer?._id) return;

    // Cập nhật selectedConversation và lọc bỏ những tag đã xóa khỏi hồ sơ
    setSelectedConversation((prev) => {
      if (!prev) return prev;
      const updatedTags = (prev.tags || []).filter((t) => {
        if (['Facebook', prev.pageName, 'AraStore', 'Learnmate'].includes(t)) return true;
        return updatedCustomer.tags ? updatedCustomer.tags.includes(t) : true;
      });
      const nextConv = { ...prev, customerId: updatedCustomer, tags: updatedTags };
      memorySelectedConv = nextConv;
      return nextConv;
    });

    // Cập nhật ngay trong danh sách hội thoại bên trái (0ms)
    setConversations((prev) => {
      const nextList = prev.map((c) => {
        const isMatched = (c.customerId?._id === updatedCustomer._id) || (c._id === memorySelectedConv?._id);
        if (isMatched) {
          const updatedTags = (c.tags || []).filter((t) => {
            if (['Facebook', c.pageName, 'AraStore', 'Learnmate'].includes(t)) return true;
            return updatedCustomer.tags ? updatedCustomer.tags.includes(t) : true;
          });
          return { ...c, customerId: updatedCustomer, tags: updatedTags };
        }
        return c;
      });
      memoryConversations = nextList;
      return nextList;
    });

    // Đồng bộ lại ngầm từ server
    fetchAllData(true);
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
        const newW = Math.max(220, Math.min(450, startWRef.current + delta));
        setPane1W(newW);
      } else {
        const newW = Math.max(300, Math.min(650, startWRef.current - delta));
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

  const renderPane3Content = () => (
    <div className="d-flex flex-column h-100 bg-white">
      {/* Tab Nav - Dùng ara-workspace-nav chuẩn luxury workspace */}
      <Nav className="ara-workspace-nav flex-shrink-0" activeKey={activeTab}>
        {TABS.map((tab) => (
          <Nav.Item key={tab.id} className="flex-fill">
            <Nav.Link
              eventKey={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="d-flex align-items-center justify-content-center gap-1"
            >
              <Icon name={tab.icon} />
              <span>{tab.label}</span>
            </Nav.Link>
          </Nav.Item>
        ))}
      </Nav>

      {/* Tab Content */}
      <div className="flex-grow-1 overflow-auto p-2 p-md-3 bg-white">
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
  );

  return (
    <div
      ref={containerRef}
      className="d-flex flex-column"
      style={{ height: 'calc(100dvh - 70px)', minHeight: 480, overflow: 'hidden', backgroundColor: '#FAF7F2' }}
    >
      {/* ===== Header Bar (Atelier Noir & Champagne Gold) ===== */}
      <div className="ara-seller-header px-3 py-2 d-flex align-items-center justify-content-between flex-shrink-0">
        <Stack direction="horizontal" gap={2} className="align-items-center">
          <span className="fw-bold fs-6 text-white" style={{ letterSpacing: '0.02em' }}>
            Hội Thoại & Bán Hàng
          </span>
        </Stack>

        <Stack direction="horizontal" gap={2}>
          <Button
            size="sm"
            className="btn-ara-header-gold d-flex align-items-center gap-1"
            onClick={() => {
              setActiveTab('order');
              setQuickOrderModalOpen(true);
            }}
          >
            <Icon name="plus-lg" /> <span className="d-none d-sm-inline">Tạo đơn nhanh</span><span className="d-sm-none">Tạo đơn</span>
          </Button>
          <Button
            size="sm"
            className="btn-ara-header-ghost d-flex align-items-center gap-1"
            onClick={() => fetchAllData()}
            title="Đồng bộ hội thoại"
          >
            <Icon name="arrow-clockwise" /> <span className="d-none d-sm-inline">Đồng bộ</span>
          </Button>
        </Stack>
      </div>

      {/* ===== Responsive Workspace Layout Container ===== */}
      <div className="d-flex flex-grow-1 overflow-hidden p-1 p-md-2 gap-0" style={{ backgroundColor: '#FAF7F2' }}>
        <div
          className="d-flex flex-grow-1 border rounded-3 bg-white shadow-sm overflow-hidden"
          style={{ borderColor: '#E3D9CD' }}
        >
          {/* ===== PANE 1: Conversation List ===== */}
          {(!isMobile || mobileView === 'list') && (
            <div
              className={`d-flex flex-column h-100 overflow-hidden bg-white ${isMobile ? 'w-100' : ''}`}
              style={!isMobile ? { width: isTablet ? 280 : pane1W, minWidth: 220, maxWidth: 420, flexShrink: 0 } : {}}
            >
              <ConversationList
                conversations={conversations}
                selectedId={selectedConversation?._id}
                onSelect={handleSelectConversation}
                onTagFilter={setActiveFilterTag}
                activeFilterTag={activeFilterTag}
                loading={loading}
                allTags={allTags}
              />
            </div>
          )}

          {/* Splitter Left (Desktop Only) */}
          {isDesktop && (
            <div
              className="ara-pane-splitter border-start border-end"
              onMouseDown={(e) => startDrag('left', e)}
              title="Kéo để thay đổi chiều rộng"
            />
          )}

          {/* ===== PANE 2: Chat Window ===== */}
          {(!isMobile || mobileView === 'chat') && (
            <div className="d-flex flex-column h-100 flex-grow-1" style={{ minWidth: 0 }}>
              <ChatBox
                conversation={selectedConversation}
                onTagAdded={handleTagAdded}
                allTags={allTags}
                onTagsRefresh={fetchAllData}
                onOpenQuickOrder={() => {
                  setActiveTab('order');
                  if (!isDesktop) setOffcanvasOpen(true);
                  else setPane3Visible(true);
                }}
                onBackToList={() => setMobileView('list')}
                onToggleRightPanel={handleToggleRightPanel}
                isRightPanelOpen={isDesktop ? pane3Visible : offcanvasOpen}
              />
            </div>
          )}

          {/* Splitter Right (Desktop Only when pane3 is visible) */}
          {isDesktop && pane3Visible && (
            <div
              className="ara-pane-splitter border-start border-end"
              onMouseDown={(e) => startDrag('right', e)}
              title="Kéo để thay đổi chiều rộng"
            />
          )}

          {/* ===== PANE 3: Widget Panel (Desktop Inline Only) ===== */}
          {isDesktop && pane3Visible && (
            <div
              className="d-flex flex-column h-100 bg-white"
              style={{ width: pane3W, minWidth: 300, maxWidth: 650, flexShrink: 0 }}
            >
              {renderPane3Content()}
            </div>
          )}
        </div>
      </div>

      {/* ===== Offcanvas Drawer for Tablet & Mobile (Pane 3: CRM / Quick Order / History) ===== */}
      <Offcanvas
        show={offcanvasOpen && !isDesktop}
        onHide={() => setOffcanvasOpen(false)}
        placement="end"
        className="ara-seller-offcanvas"
        style={{ width: isMobile ? '100%' : 420, maxWidth: '100vw' }}
      >
        <Offcanvas.Header closeButton className="py-2 px-3">
          <Offcanvas.Title className="fs-6 fw-bold text-white d-flex align-items-center gap-2">
            <Icon name="person-badge" />
            <span>Tác Nghiệp Bán Hàng</span>
            {selectedConversation?.customerId?.fullName && (
              <Badge bg="warning" text="dark" pill className="small text-truncate" style={{ maxWidth: 160 }}>
                {selectedConversation.customerId.fullName}
              </Badge>
            )}
          </Offcanvas.Title>
        </Offcanvas.Header>
        <Offcanvas.Body className="p-0 h-100 overflow-hidden">
          {renderPane3Content()}
        </Offcanvas.Body>
      </Offcanvas>

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
