import React, { useState, useEffect, useRef } from 'react';
import { Send, Paperclip, ShoppingCart, Tag, CheckCheck, User, Package, Sparkles } from 'lucide-react';
import { sellerService } from '../../services/sellerService';

const ChatBox = ({
  conversation,
  attachedSku,
  onClearAttachedSku,
  onOpenQuickOrder,
  onTagAdded,
}) => {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [showTagPopup, setShowTagPopup] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (conversation?._id) {
      fetchMessages(conversation._id);
    }
  }, [conversation?._id]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchMessages = async (convId) => {
    try {
      setLoading(true);
      const res = await sellerService.getConversationMessages(convId, { limit: 50 });
      if (res.success) {
        setMessages(res.data.items || []);
      }
    } catch (err) {
      console.warn('Lỗi tải tin nhắn:', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if ((!text.trim() && !attachedSku) || sending || !conversation?._id) return;

    try {
      setSending(true);
      const payload = {
        messageText: text.trim(),
        referencedSkuId: attachedSku ? attachedSku.skuId || attachedSku._id : null,
      };

      const res = await sellerService.sendMessage(conversation._id, payload);
      if (res.success) {
        setMessages([...messages, res.data]);
        setText('');
        if (onClearAttachedSku) onClearAttachedSku();
      }
    } catch (err) {
      alert(`Lỗi gửi tin nhắn: ${err.message}`);
    } finally {
      setSending(false);
    }
  };

  const handleAddTag = async (e) => {
    e.preventDefault();
    if (!tagInput.trim() || !conversation?._id) return;

    try {
      const res = await sellerService.addTag(conversation._id, tagInput.trim());
      if (res.success) {
        if (onTagAdded) onTagAdded(res.data);
        setTagInput('');
        setShowTagPopup(false);
      }
    } catch (err) {
      alert(err.message);
    }
  };

  if (!conversation) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-gray-50/50 text-gray-400 text-sm">
        <div className="w-16 h-16 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-500 mb-3 shadow-inner">
          <Sparkles size={32} />
        </div>
        <h3 className="font-bold text-gray-700 text-base mb-1">Không gian làm việc Seller (UC-72/74)</h3>
        <p className="max-w-xs text-xs">
          Chọn một cuộc hội thoại từ danh sách bên trái để tiếp nhận tư vấn và bán hàng đa kênh.
        </p>
      </div>
    );
  }

  const customer = conversation.customerId;

  return (
    <div className="flex flex-col h-full bg-slate-50/40">
      {/* Header */}
      <div className="px-4 py-3 bg-white border-b border-gray-200 flex items-center justify-between shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-sm shadow-sm">
            {customer?.fullName ? customer.fullName.charAt(0).toUpperCase() : 'K'}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-gray-900 text-sm">{customer?.fullName || 'Khách hàng'}</h3>
              <span className="text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                Facebook Messenger
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
              <span>Mã: <strong className="font-mono text-gray-700">{customer?.customerCode || 'N/A'}</strong></span>
              {customer?.phone && <span>• SĐT: <strong>{customer.phone}</strong></span>}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Tag conversation */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowTagPopup(!showTagPopup)}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:text-indigo-600 bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-200 transition"
            >
              <Tag size={13} /> Gắn thẻ
            </button>

            {showTagPopup && (
              <form
                onSubmit={handleAddTag}
                className="absolute right-0 mt-1 w-48 p-2 bg-white rounded-xl shadow-lg border border-gray-200 z-30"
              >
                <input
                  type="text"
                  placeholder="Nhập tên tag..."
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  className="w-full px-2 py-1 text-xs border rounded-lg focus:outline-none mb-1.5"
                  autoFocus
                />
                <button
                  type="submit"
                  className="w-full py-1 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700"
                >
                  Thêm tag
                </button>
              </form>
            )}
          </div>

          {/* Quick Order Button */}
          {onOpenQuickOrder && (
            <button
              type="button"
              onClick={onOpenQuickOrder}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 shadow-sm transition"
            >
              <ShoppingCart size={14} /> Tạo đơn nhanh (UC-78)
            </button>
          )}
        </div>
      </div>

      {/* Messages Stream */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
          <div className="text-center text-xs text-gray-400 py-8">Đang tải tin nhắn...</div>
        ) : messages.length === 0 ? (
          <div className="text-center text-xs text-gray-400 py-12">Chưa có tin nhắn nào trong hội thoại này</div>
        ) : (
          messages.map((m) => {
            const isSeller = m.senderType === 'SELLER';

            return (
              <div
                key={m._id}
                className={`flex flex-col ${isSeller ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[70%] p-3 rounded-2xl text-xs shadow-2xs space-y-1.5 ${
                    isSeller
                      ? 'bg-indigo-600 text-white rounded-br-xs'
                      : 'bg-white text-gray-900 border border-gray-100 rounded-bl-xs'
                  }`}
                >
                  {/* Referenced SKU Card */}
                  {m.referencedSkuId && (
                    <div
                      className={`p-2 rounded-xl text-[11px] mb-1.5 border flex items-center gap-2 ${
                        isSeller
                          ? 'bg-indigo-700/60 border-indigo-400/40 text-white'
                          : 'bg-indigo-50 border-indigo-100 text-gray-800'
                      }`}
                    >
                      <Package size={20} className="shrink-0" />
                      <div>
                        <div className="font-bold line-clamp-1">
                          {m.referencedSkuId.styleName || m.referencedSkuId.skuCode}
                        </div>
                        <div>
                          Màu: {m.referencedSkuId.color} | Size: {m.referencedSkuId.size} |{' '}
                          {m.referencedSkuId.retailPrice?.toLocaleString('vi-VN')} đ
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Message Text */}
                  {m.messageText && <p className="whitespace-pre-wrap">{m.messageText}</p>}

                  {/* Timestamp & Status */}
                  <div
                    className={`flex items-center justify-end gap-1 text-[10px] ${
                      isSeller ? 'text-indigo-200' : 'text-gray-400'
                    }`}
                  >
                    <span>
                      {new Date(m.sentAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {isSeller && <CheckCheck size={12} />}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Dock */}
      <div className="p-3 bg-white border-t border-gray-200">
        {/* Attached SKU preview pill */}
        {attachedSku && (
          <div className="mb-2 p-2 bg-indigo-50 border border-indigo-200 rounded-xl flex items-center justify-between text-xs text-indigo-900">
            <div className="flex items-center gap-2">
              <Package size={14} className="text-indigo-600" />
              <span>
                Đang đính kèm: <strong>{attachedSku.styleName}</strong> ({attachedSku.skuCode} - Size {attachedSku.size})
              </span>
            </div>
            <button
              type="button"
              onClick={onClearAttachedSku}
              className="text-gray-400 hover:text-red-500 font-bold px-1"
            >
              ✕
            </button>
          </div>
        )}

        <form onSubmit={handleSendMessage} className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Gõ tin nhắn trả lời khách (sẽ gửi qua Messenger API)..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
          />

          <button
            type="submit"
            disabled={(!text.trim() && !attachedSku) || sending}
            className="p-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition shadow-sm"
          >
            <Send size={16} />
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChatBox;
