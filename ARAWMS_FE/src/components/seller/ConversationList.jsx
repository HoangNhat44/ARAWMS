/**
 * ============================================================================
 * @title        : Conversation List Component (Pancake-style)
 * @author       : Nguyễn Quang Huy
 * @createdDate  : 2026-10-27
 * @lastModified : 2026-10-27
 * @description  : Danh sách cuộc hội thoại khách hàng Messenger của Seller (UC-72),
 *                 tích hợp thanh lọc thẻ tag nhanh (Pancake Quick Tag Filter) và tìm kiếm khách hàng.
 * @module       : Conversational Commerce / Chat Interface
 * @layer        : Front-end
 * ============================================================================
 */

import React, { useState } from 'react';
import { Search, MessageSquare } from 'lucide-react';
import { SkeletonConversationItem } from '../common/Skeleton';

/**
 * Component hiển thị danh sách hội thoại khách hàng kèm bộ lọc nhãn màu.
 *
 * @component
 * @param {Object} props - Thuộc tính truyền vào component.
 * @param {Array<Object>} props.conversations - Danh sách các cuộc hội thoại.
 * @param {string} props.selectedId - ID cuộc hội thoại đang được kích hoạt.
 * @param {Function} props.onSelect - Callback khi chọn một cuộc hội thoại.
 * @param {Function} props.onTagFilter - Callback kích hoạt lọc theo thẻ tag.
 * @param {string} props.activeFilterTag - Tên thẻ tag đang được chọn lọc.
 * @param {boolean} props.loading - Trạng thái đang tải dữ liệu.
 * @param {Array<Object>} props.allTags - Danh sách thẻ phân loại từ DB.
 * @returns {JSX.Element} Giao diện danh sách hội thoại.
 */
const ConversationList = ({ conversations = [], selectedId, onSelect, onTagFilter, activeFilterTag, loading, allTags = [] }) => {
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

      {/* Quick Tag Pills Bar - dùng allTags từ DB */}
      <div className="ara-tag-pills-bar">
        <button
          type="button"
          onClick={() => onTagFilter && onTagFilter('')}
          className={`ara-tag-pill ${!activeFilterTag ? 'active' : ''}`}
        >
          Tất cả ({conversations.length})
        </button>
        {allTags.slice(0, 6).map((tag) => (
          <button
            key={tag._id || tag.name}
            type="button"
            onClick={() => onTagFilter && onTagFilter(tag.name === activeFilterTag ? '' : tag.name)}
            className={`ara-tag-pill ${activeFilterTag === tag.name ? 'active' : ''}`}
            style={activeFilterTag === tag.name
              ? { background: tag.color, borderColor: tag.color, color: tag.textColor || '#fff' }
              : { borderColor: tag.color, color: tag.color }
            }
          >
            {tag.name}
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
