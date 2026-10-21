import React, { useState, useEffect } from 'react';
import { User, PackageCheck, ShoppingBag, Clock, MessageSquare, Menu, LogOut } from 'lucide-react';
import ConversationList from '../../components/seller/ConversationList';
import ChatBox from '../../components/seller/ChatBox';
import CustomerProfilePanel from '../../components/seller/CustomerProfilePanel';
import SkuStockLookupWidget from '../../components/seller/SkuStockLookupWidget';
import CustomerOrderHistory from '../../components/seller/CustomerOrderHistory';
import QuickOrderModal from '../../components/seller/QuickOrderModal';
import CreateRmaModal from '../../components/seller/CreateRmaModal';
import { sellerService } from '../../services/sellerService';
import { useAuth } from '../../hooks/useAuth';
import { useNavigate } from 'react-router-dom';

const SellerChatPage = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('crm'); // 'crm' | 'stock' | 'history'
  const [attachedSku, setAttachedSku] = useState(null);
  const [activeFilterTag, setActiveFilterTag] = useState('');

  // Modals state
  const [quickOrderOpen, setQuickOrderOpen] = useState(false);
  const [orderModalItems, setOrderModalItems] = useState([]);
  const [rmaModalOpen, setRmaModalOpen] = useState(false);
  const [selectedOrderForRma, setSelectedOrderForRma] = useState(null);

  useEffect(() => {
    fetchConversations();
  }, []);

  const fetchConversations = async () => {
    try {
      setLoading(true);
      const res = await sellerService.getConversations({ limit: 50 });
      if (res.success) {
        const items = res.data.items || [];
        setConversations(items);
        if (items.length > 0 && !selectedConversation) {
          setSelectedConversation(items[0]);
        }
      }
    } catch (err) {
      console.warn('Lỗi tải danh sách hội thoại:', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectConversation = (conv) => {
    setSelectedConversation(conv);
  };

  const handleCustomerUpdated = (updatedCustomer) => {
    if (selectedConversation) {
      setSelectedConversation({
        ...selectedConversation,
        customerId: updatedCustomer,
      });
    }
  };

  const handleTagAdded = (updatedConv) => {
    setSelectedConversation(updatedConv);
    setConversations(
      conversations.map((c) => (c._id === updatedConv._id ? updatedConv : c))
    );
  };

  const handleAttachSku = (sku) => {
    setAttachedSku(sku);
  };

  const handleAddToOrder = (sku) => {
    setOrderModalItems([sku]);
    setQuickOrderOpen(true);
  };

  const handleOpenRma = (order) => {
    setSelectedOrderForRma(order);
    setRmaModalOpen(true);
  };

  return (
    <div className="flex flex-col h-screen bg-white text-gray-900 font-sans antialiased overflow-hidden">
      {/* Top Navbar */}
      <header className="h-13 bg-slate-900 text-white flex items-center justify-between px-4 shrink-0 shadow-md">
        <div className="flex items-center gap-3">
          <div className="font-extrabold text-base tracking-wider bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">
            ARAWMS SELLER
          </div>
          <span className="text-xs text-slate-400 border-l border-slate-700 pl-3 hidden md:inline">
            Không Gian Làm Việc Bán Hàng & CRM Hội Thoại
          </span>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-2 bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-medium text-slate-300">
              {user?.fullName || 'Seller'} ({user?.employeeCode || 'SELLER'})
            </span>
          </div>

          <button
            type="button"
            onClick={() => navigate('/seller/orders')}
            className="px-3 py-1.5 bg-indigo-600/80 hover:bg-indigo-600 text-white rounded-lg font-medium transition"
          >
            Quản Lý Đơn Hàng
          </button>

          <button
            type="button"
            onClick={logout}
            title="Đăng xuất"
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* Triple-Pane Workspace Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Pane 1: Conversations List (280px) */}
        <div className="w-80 shrink-0 border-r border-gray-200">
          <ConversationList
            conversations={conversations}
            selectedId={selectedConversation?._id}
            onSelect={handleSelectConversation}
            onTagFilter={setActiveFilterTag}
            activeFilterTag={activeFilterTag}
          />
        </div>

        {/* Pane 2: Central Chat Window (Flex-1) */}
        <div className="flex-1 flex flex-col min-w-0">
          <ChatBox
            conversation={selectedConversation}
            attachedSku={attachedSku}
            onClearAttachedSku={() => setAttachedSku(null)}
            onOpenQuickOrder={() => {
              setOrderModalItems([]);
              setQuickOrderOpen(true);
            }}
            onTagAdded={handleTagAdded}
          />
        </div>

        {/* Pane 3: Integrated Widgets & CRM Tabs (360px) */}
        <div className="w-96 shrink-0 border-l border-gray-200 flex flex-col bg-white">
          {/* Tabs Switcher */}
          <div className="flex border-b border-gray-200 bg-gray-50/80 p-1 gap-1 text-xs font-semibold shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('crm')}
              className={`flex-1 py-2 px-2 rounded-lg flex items-center justify-center gap-1.5 transition ${
                activeTab === 'crm'
                  ? 'bg-white text-indigo-600 shadow-xs'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <User size={14} /> CRM & Hồ sơ
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('stock')}
              className={`flex-1 py-2 px-2 rounded-lg flex items-center justify-center gap-1.5 transition ${
                activeTab === 'stock'
                  ? 'bg-white text-indigo-600 shadow-xs'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <PackageCheck size={14} /> Tồn kho (UC-77)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={`flex-1 py-2 px-2 rounded-lg flex items-center justify-center gap-1.5 transition ${
                activeTab === 'history'
                  ? 'bg-white text-indigo-600 shadow-xs'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <ShoppingBag size={14} /> Đơn mua (UC-76)
            </button>
          </div>

          {/* Active Tab Body */}
          <div className="flex-1 overflow-hidden">
            {activeTab === 'crm' && (
              <CustomerProfilePanel
                customer={selectedConversation?.customerId}
                conversationId={selectedConversation?._id}
                onCustomerUpdated={handleCustomerUpdated}
              />
            )}
            {activeTab === 'stock' && (
              <SkuStockLookupWidget
                onAttachSku={handleAttachSku}
                onAddToOrder={handleAddToOrder}
              />
            )}
            {activeTab === 'history' && (
              <CustomerOrderHistory
                customerId={selectedConversation?.customerId?._id}
                onRequestRma={handleOpenRma}
              />
            )}
          </div>
        </div>
      </div>

      {/* Quick Order Modal (UC-78, UC-79) */}
      <QuickOrderModal
        isOpen={quickOrderOpen}
        onClose={() => setQuickOrderOpen(false)}
        customer={selectedConversation?.customerId}
        conversationId={selectedConversation?._id}
        initialItems={orderModalItems}
        onOrderCreated={() => {
          // Re-fetch conversation details if needed
        }}
      />

      {/* Create RMA Modal (UC-82) */}
      <CreateRmaModal
        isOpen={rmaModalOpen}
        onClose={() => setRmaModalOpen(false)}
        order={selectedOrderForRma}
        onRmaCreated={() => {
          alert('Phiếu RMA đã được tạo thành công!');
        }}
      />
    </div>
  );
};

export default SellerChatPage;
