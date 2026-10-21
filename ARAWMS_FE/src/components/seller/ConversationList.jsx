import React, { useState } from 'react';
import { Search, MessageSquare, Tag, Check, Filter } from 'lucide-react';

const ConversationList = ({ conversations, selectedId, onSelect, onTagFilter, activeFilterTag }) => {
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
    <div className="flex flex-col h-full bg-white border-r border-gray-200">
      {/* Search & Filter Header */}
      <div className="p-3 border-b border-gray-100 space-y-2">
        <div className="relative">
          <input
            type="text"
            placeholder="Tìm theo tên, SĐT, mã khách..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
          />
          <Search className="absolute left-3 top-2.5 text-gray-400" size={15} />
        </div>

        {/* Quick Tag Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          <button
            type="button"
            onClick={() => onTagFilter && onTagFilter('')}
            className={`px-2.5 py-1 rounded-full whitespace-nowrap text-[11px] font-medium transition ${
              !activeFilterTag ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Tất cả ({conversations.length})
          </button>
          {['VIP', 'Chờ chốt', 'Đã chốt đơn', 'Cần tư vấn size'].map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onTagFilter && onTagFilter(t === activeFilterTag ? '' : t)}
              className={`px-2.5 py-1 rounded-full whitespace-nowrap text-[11px] font-medium transition ${
                activeFilterTag === t
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Conversations Stream */}
      <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
        {filteredConversations.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-xs">
            <MessageSquare size={32} className="mx-auto mb-2 text-gray-300" />
            Không có cuộc hội thoại nào
          </div>
        ) : (
          filteredConversations.map((conv) => {
            const customer = conv.customerId;
            const isSelected = selectedId === conv._id;

            return (
              <div
                key={conv._id}
                onClick={() => onSelect(conv)}
                className={`p-3.5 flex items-start gap-3 cursor-pointer transition relative hover:bg-gray-50/80 ${
                  isSelected ? 'bg-indigo-50/70 border-r-4 border-indigo-600' : ''
                }`}
              >
                {/* Avatar */}
                <div className="relative shrink-0">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-700 text-white flex items-center justify-center font-bold text-sm shadow-2xs">
                    {customer?.fullName ? customer.fullName.charAt(0).toUpperCase() : 'K'}
                  </div>
                  {conv.unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-white">
                      {conv.unreadCount}
                    </span>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <h4 className="font-semibold text-gray-900 text-xs truncate">
                      {customer?.fullName || 'Khách chưa đặt tên'}
                    </h4>
                    <span className="text-[10px] text-gray-400 shrink-0 font-mono">
                      {conv.lastMessageAt ? new Date(conv.lastMessageAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : ''}
                    </span>
                  </div>

                  <p className="text-[11px] text-gray-500 truncate mb-1.5">
                    {conv.lastMessagePreview || 'Chưa có tin nhắn'}
                  </p>

                  <div className="flex items-center gap-1 flex-wrap">
                    {conv.tags?.map((t) => (
                      <span
                        key={t}
                        className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded font-medium"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
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
