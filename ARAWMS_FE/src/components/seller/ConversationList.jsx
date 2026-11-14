/**
 * ============================================================================
 * @title        : Conversation List Component (Pancake-style)
 * @author       : Nguyễn Quang Huy
 * @createdDate  : 2026-10-27
 * @lastModified : 2026-11-14
 * @description  : Danh sách cuộc hội thoại khách hàng Messenger của Seller (UC-72),
 *                 tích hợp thanh lọc thẻ tag nhanh (Pancake Quick Tag Filter) và tìm kiếm khách hàng.
 *                 (Refactor 2026-10-28: giao diện chỉ dùng Bootstrap / React-Bootstrap.)
 * @module       : Conversational Commerce / Chat Interface
 * @layer        : Front-end
 * ============================================================================
 */

import React, { useState } from 'react';
import { Form, InputGroup, ListGroup, Badge, Button } from 'react-bootstrap';
import { SkeletonConversationItem } from '../common/Skeleton';
import { Icon, Avatar, EmptyState } from './SellerUi';

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
    <div className="d-flex flex-column h-100 bg-white" style={{ minHeight: 0 }}>
      {/* Search Header */}
      <div className="p-2 border-bottom flex-shrink-0" style={{ borderColor: 'var(--wms-border, #C8B9A6)', backgroundColor: '#FFFFFF' }}>
        <InputGroup size="sm" className="ara-search-capsule">
          <InputGroup.Text><Icon name="search" /></InputGroup.Text>
          <Form.Control
            placeholder="Tìm hội thoại, SĐT..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </InputGroup>
      </div>

      {/* Quick Tag Pills Bar - Horizontal scrollable single clean row */}
      <div
        className="d-flex align-items-center gap-1.5 px-2 py-2 border-bottom flex-shrink-0 overflow-x-auto text-nowrap"
        style={{
          borderColor: 'var(--wms-border, #C8B9A6)',
          backgroundColor: 'var(--wms-bg-subtle, #F3EDE4)',
          scrollbarWidth: 'none',
        }}
      >
        <button
          type="button"
          className={`ara-status-pill-btn ${!activeFilterTag ? 'active' : ''}`}
          onClick={() => onTagFilter && onTagFilter('')}
        >
          <span>Tất cả ({conversations.length})</span>
        </button>
        {allTags.map((tag) => {
          const isActive = activeFilterTag === tag.name;
          return (
            <button
              key={tag._id || tag.name}
              type="button"
              className={`ara-status-pill-btn ${isActive ? 'active' : ''}`}
              onClick={() => onTagFilter && onTagFilter(isActive ? '' : tag.name)}
            >
              <span>{tag.name}</span>
            </button>
          );
        })}
      </div>

      {/* Conversation Stream List */}
      <div className="flex-grow-1 overflow-auto" style={{ minHeight: 0 }}>
        {loading ? (
          [1, 2, 3, 4, 5].map((i) => <SkeletonConversationItem key={i} />)
        ) : filteredConversations.length === 0 ? (
          <EmptyState icon="chat-square" title="Chưa có hội thoại nào">
            Tin nhắn Messenger của khách sẽ hiển thị tại đây
          </EmptyState>
        ) : (
          <ListGroup variant="flush">
            {filteredConversations.map((conv) => {
              const customer = conv.customerId;
              const isSelected = selectedId === conv._id;

              return (
                <ListGroup.Item
                  key={conv._id}
                  action
                  active={isSelected}
                  onClick={() => onSelect(conv)}
                  className="d-flex gap-2.5 py-3 px-3"
                  style={{
                    backgroundColor: isSelected ? 'var(--wms-primary-subtle, #EFE6DA)' : 'transparent',
                    borderLeft: isSelected ? '3px solid var(--wms-accent, #8A6A46)' : '3px solid transparent',
                    color: 'var(--wms-text-primary, #141210)',
                    borderColor: 'var(--wms-border, #C8B9A6)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {/* Avatar Icon */}
                  <div className="position-relative">
                    <Avatar name={customer?.fullName} size={40} />
                    {conv.unreadCount > 0 && !isSelected && (
                      <span
                        className="position-absolute top-0 start-100 translate-middle badge rounded-pill"
                        style={{ backgroundColor: 'var(--wms-error, #BA1A1A)', color: '#FFFFFF', fontSize: '10px' }}
                      >
                        {conv.unreadCount}
                      </span>
                    )}
                  </div>

                  {/* Conversation Details */}
                  <div className="flex-grow-1 overflow-hidden">
                    <div className="d-flex align-items-center justify-content-between mb-1">
                      <div className="d-flex align-items-center gap-1.5 overflow-hidden me-1">
                        <span className="fw-bold text-truncate small" style={{ color: 'var(--wms-text-primary, #141210)' }}>
                          {customer?.fullName || 'Khách chưa đặt tên'}
                        </span>
                        {customer?.tier && (
                          <span className="ara-vip-badge" style={{ fontSize: '9.5px', padding: '1px 6px' }}>{customer.tier}</span>
                        )}
                      </div>
                      <span className="small flex-shrink-0 ms-1 tabular-nums" style={{ color: 'var(--wms-text-light, #786E63)', fontSize: '11px' }}>
                        {conv.lastMessageAt
                          ? new Date(conv.lastMessageAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
                          : ''}
                      </span>
                    </div>

                    {/* Phone / Subtitle info */}
                    {customer?.phone && (
                      <div className="small text-truncate mb-0.5 tabular-nums" style={{ color: 'var(--wms-text-light, #786E63)', fontSize: '11px' }}>
                        {customer.phone}
                      </div>
                    )}

                    {/* Last Message Preview */}
                    <p className="small mb-1 text-truncate" style={{ color: 'var(--wms-secondary, #574F46)', fontSize: '12px' }}>
                      {conv.lastMessagePreview || 'Bắt đầu cuộc trò chuyện...'}
                    </p>

                    {/* Tags */}
                    {conv.tags && conv.tags.length > 0 && (
                      <div className="d-flex flex-wrap gap-1">
                        {conv.tags.slice(0, 2).map((tg, idx) => (
                          <span
                            key={idx}
                            className="badge rounded-pill px-2 py-0.5"
                            style={{
                              backgroundColor: '#FFFBEB',
                              color: '#D97706',
                              border: '1px solid #FDE68A',
                              fontSize: '10px',
                              fontWeight: 600,
                            }}
                          >
                            {tg}
                          </span>
                        ))}
                        {conv.tags.length > 2 && (
                          <span
                            className="badge rounded-pill px-1.5 py-0.5"
                            style={{
                              backgroundColor: 'var(--wms-primary-subtle, #EFE6DA)',
                              color: 'var(--wms-text-secondary, #574F46)',
                              border: '1px solid var(--wms-border, #C8B9A6)',
                              fontSize: '10px',
                              fontWeight: 600,
                            }}
                          >
                            +{conv.tags.length - 2}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </ListGroup.Item>
              );
            })}
          </ListGroup>
        )}
      </div>
    </div>
  );
};

export default ConversationList;
