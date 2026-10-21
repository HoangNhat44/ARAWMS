import React, { useState } from 'react';
import { Search, MessageSquare } from 'lucide-react';
import { SkeletonConversationItem } from '../common/Skeleton';

const ConversationList = ({ conversations = [], selectedId, onSelect, onTagFilter, activeFilterTag, loading }) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredConversations = conversations.filter((c) => {
    const cust = c.customerId;
    const nameMatch = cust?.fullName?.toLowerCase().includes(searchTerm.toLowerCase());
    const phoneMatch = cust?.phone?.includes(searchTerm);
    const codeMatch = cust?.customerCode?.toLowerCase().includes(searchTerm.toLowerCase());
    const previewMatch = c.lastMessagePreview?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesSearch = !searchTerm || nameMatch || phoneMatch || codeMatch || previewMatch;
    const matchesTag = !activeFilterTag || (c.tags && c.tags.includes(activeFilterTag));

    return matchesSearch && matchesTag;
  });

  return (
    <div className="d-flex flex-column h-100 bg-white">
      {/* Search Header */}
      <div className="ara-conv-search-box">
        <div className="position-relative">
          <Search className="position-absolute" size={15} style={{ left: '10px', top: '10px', color: '#9F8365' }} />
          <input
            type="text"
            placeholder="Tìm theo tên, SĐT, mã khách..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="form-control ara-input-search w-100"
          />
        </div>
      </div>

      {/* Quick Tag Pills Bar */}
      <div className="ara-tag-pills-bar">
        <button
          type="button"
          onClick={() => onTagFilter && onTagFilter('')}
          className={`ara-tag-pill ${!activeFilterTag ? 'active' : ''}`}
        >
          Tất cả ({conversations.length})
        </button>
        {['VIP', 'Chờ chốt', 'Đã chốt đơn', 'Cần tư vấn size'].map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onTagFilter && onTagFilter(t === activeFilterTag ? '' : t)}
            className={`ara-tag-pill ${activeFilterTag === t ? 'active' : ''}`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Conversation Stream List */}
      <div className="flex-grow-1 overflow-auto">
        {loading ? (
          <div>
            {[1, 2, 3, 4, 5].map((i) => <SkeletonConversationItem key={i} />)}
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="text-center py-5 px-3 text-muted" style={{ fontSize: '0.85rem' }}>
            <MessageSquare size={32} className="mb-2" style={{ color: 'var(--ara-gold, #9F8365)', opacity: 0.5 }} />
            <div className="fw-semibold text-dark">Chưa có hội thoại nào</div>
            <div className="small text-secondary">Tin nhắn Messenger của khách sẽ hiển thị tại đây</div>
          </div>
        ) : (
          filteredConversations.map((conv) => {
            const customer = conv.customerId;
            const isSelected = selectedId === conv._id;

            return (
              <div
                key={conv._id}
                onClick={() => onSelect(conv)}
                className={`ara-conv-item ${isSelected ? 'active' : ''}`}
              >
                {/* Avatar Icon */}
                <div className="position-relative">
                  <div className="ara-avatar">
                    {customer?.fullName ? customer.fullName.charAt(0).toUpperCase() : 'K'}
                  </div>
                  {conv.unreadCount > 0 && (
                    <span
                      className="position-absolute badge rounded-pill bg-danger border border-white"
                      style={{ top: '-4px', right: '-4px', fontSize: '0.65rem' }}
                    >
                      {conv.unreadCount}
                    </span>
                  )}
                </div>

                {/* Conversation Details */}
                <div className="flex-grow-1 min-w-0" style={{ overflow: 'hidden' }}>
                  <div className="d-flex align-items-center justify-content-between mb-1">
                    <span className="fw-bold text-dark text-truncate" style={{ fontSize: '0.88rem', maxWidth: '160px' }}>
                      {customer?.fullName || 'Khách chưa đặt tên'}
                    </span>
                    <span className="text-muted" style={{ fontSize: '0.7rem' }}>
                      {conv.lastMessageAt
                        ? new Date(conv.lastMessageAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
                        : ''}
                    </span>
                  </div>

                  {/* Last Message Preview */}
                  <p
                    className="text-secondary mb-1 text-truncate"
                    style={{ fontSize: '0.78rem', lineHeight: '1.3' }}
                  >
                    {conv.lastMessagePreview || 'Bắt đầu cuộc trò chuyện...'}
                  </p>

                  {/* Tags */}
                  {conv.tags && conv.tags.length > 0 && (
                    <div className="d-flex flex-wrap gap-1 mt-1">
                      {conv.tags.slice(0, 2).map((tg, idx) => (
                        <span key={idx} className="badge-ara-gold">
                          {tg}
                        </span>
                      ))}
                      {conv.tags.length > 2 && (
                        <span className="badge-ara-gold">+{conv.tags.length - 2}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default ConversationList;
