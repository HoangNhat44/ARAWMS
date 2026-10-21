import React, { useState, useEffect } from 'react';
import { User, PackageCheck, ShoppingBag } from 'lucide-react';
import ConversationList from '../../components/seller/ConversationList';
import ChatBox from '../../components/seller/ChatBox';
import CustomerProfilePanel from '../../components/seller/CustomerProfilePanel';
import SkuStockLookupWidget from '../../components/seller/SkuStockLookupWidget';
import CustomerOrderHistory from '../../components/seller/CustomerOrderHistory';
import QuickOrderModal from '../../components/seller/QuickOrderModal';
import CreateRmaModal from '../../components/seller/CreateRmaModal';
import { sellerService } from '../../services/sellerService';

const SellerChatPage = () => {
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
    <div className="ara-seller-page">
      {/* Triple-Pane Workspace Layout (Using standard App Navbar above) */}
      <div className="ara-seller-workspace-body">
        {/* Pane 1: Conversations Stream (320px) */}
        <div className="ara-seller-pane-conversations">
          <ConversationList
            conversations={conversations}
            selectedId={selectedConversation?._id}
            onSelect={handleSelectConversation}
            onTagFilter={setActiveFilterTag}
            activeFilterTag={activeFilterTag}
            loading={loading}
          />
        </div>

        {/* Pane 2: Central Chat Window */}
        <div className="ara-seller-pane-chat">
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

        {/* Pane 3: CRM & Stock Widgets (380px) */}
        <div className="ara-seller-pane-widgets">
          {/* Tabs Navigation */}
          <div className="ara-widget-nav-tabs">
            <button
              type="button"
              onClick={() => setActiveTab('crm')}
              className={`ara-widget-tab-btn ${activeTab === 'crm' ? 'active' : ''}`}
            >
              <User size={15} />
              <span>Hồ sơ CRM</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('stock')}
              className={`ara-widget-tab-btn ${activeTab === 'stock' ? 'active' : ''}`}
            >
              <PackageCheck size={15} />
              <span>Tồn kho (UC-77)</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={`ara-widget-tab-btn ${activeTab === 'history' ? 'active' : ''}`}
            >
              <ShoppingBag size={15} />
              <span>Đơn mua (UC-76)</span>
            </button>
          </div>

          {/* Active Tab Body */}
          <div className="ara-widget-tab-content">
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
