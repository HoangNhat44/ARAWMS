/**
 * ============================================================================
 * @title        : Conversation List Component (Pancake-style)
 * @author       : Nguyễn Quang Huy
 * @createdDate  : 2026-10-27
 * @lastModified : 2026-10-28
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
    <div className="d-flex flex-column h-100 bg-white">
      {/* Search Header */}
      <div className="p-2 border-bottom">
        <InputGroup size="sm">
          <InputGroup.Text className="bg-white"><Icon name="search" className="text-warning-emphasis" /></InputGroup.Text>
          <Form.Control
            placeholder="Tìm theo tên, SĐT, mã khách..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </InputGroup>
      </div>

      {/* Quick Tag Pills Bar - dùng allTags từ DB */}
      <div className="d-flex flex-wrap gap-1 p-2 border-bottom">
        <Button
          size="sm"
          className="rounded-pill py-0 px-2"
          variant={!activeFilterTag ? 'dark' : 'outline-secondary'}
          onClick={() => onTagFilter && onTagFilter('')}
        >
          Tất cả ({conversations.length})
        </Button>
        {allTags.slice(0, 6).map((tag) => {
          const isActive = activeFilterTag === tag.name;
          return (
            <Button
              key={tag._id || tag.name}
              size="sm"
              variant="light"
              className="rounded-pill py-0 px-2 border"
              // Màu thẻ do người dùng cấu hình trong DB nên bắt buộc truyền qua style
              style={isActive
                ? { background: tag.color, borderColor: tag.color, color: tag.textColor || '#fff' }
                : { borderColor: tag.color, color: tag.color, background: 'transparent' }}
              onClick={() => onTagFilter && onTagFilter(isActive ? '' : tag.name)}
            >
              {tag.name}
            </Button>
          );
        })}
      </div>

      {/* Conversation Stream List */}
      <div className="flex-grow-1 overflow-auto">
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
                  className={`d-flex gap-2 py-3 ${isSelected ? 'bg-body-secondary text-body border-start border-4 border-dark' : ''}`}
                >
                  {/* Avatar Icon */}
                  <div className="position-relative">
                    <Avatar name={customer?.fullName} size={42} />
                    {conv.unreadCount > 0 && (
                      <Badge pill bg="danger" className="position-absolute top-0 start-100 translate-middle border border-white">
                        {conv.unreadCount}
                      </Badge>
                    )}
                  </div>

                  {/* Conversation Details */}
                  <div className="flex-grow-1 overflow-hidden">
                    <div className="d-flex align-items-center justify-content-between mb-1">
                      <span className="fw-bold text-truncate small">{customer?.fullName || 'Khách chưa đặt tên'}</span>
                      <span className="text-secondary small flex-shrink-0 ms-2">
                        {conv.lastMessageAt
                          ? new Date(conv.lastMessageAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
                          : ''}
                      </span>
                    </div>

                    {/* Last Message Preview */}
                    <p className="text-secondary small mb-1 text-truncate">
                      {conv.lastMessagePreview || 'Bắt đầu cuộc trò chuyện...'}
                    </p>

                    {/* Tags */}
                    {conv.tags && conv.tags.length > 0 && (
                      <div className="d-flex flex-wrap gap-1">
                        {conv.tags.slice(0, 2).map((tg, idx) => (
                          <Badge key={idx} bg="warning-subtle" text="warning-emphasis">{tg}</Badge>
                        ))}
                        {conv.tags.length > 2 && (
                          <Badge bg="warning-subtle" text="warning-emphasis">+{conv.tags.length - 2}</Badge>
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
