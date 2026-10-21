import React, { useState, useEffect, useRef } from 'react';
import { Send, ShoppingBag, Tag, CheckCheck, Package, Sparkles, MessageSquare } from 'lucide-react';
import { sellerService } from '../../services/sellerService';
import { SkeletonMessage } from '../common/Skeleton';

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
      <div className="d-flex flex-column align-items-center justify-content-center h-100 p-5 text-center bg-light text-muted">
        <div
          className="d-flex align-items-center justify-content-center rounded-circle mb-3"
          style={{ width: '64px', height: '64px', background: 'var(--ara-bg-surface, #FAF7F2)', border: '1px solid var(--ara-gold, #9F8365)' }}
        >
          <Sparkles size={28} color="var(--ara-gold, #9F8365)" />
        </div>
        <h4 className="fw-bold text-dark mb-1" style={{ fontFamily: 'var(--font-serif)' }}>
          Không Gian Tư Vấn Khách Hàng (UC-72/74)
        </h4>
        <p className="text-secondary small mb-0" style={{ maxWidth: '320px' }}>
          Vui lòng chọn một cuộc trò chuyện từ danh sách bên trái để tiếp nhận tư vấn và lên đơn hàng.
        </p>
      </div>
    );
  }

  const customer = conversation.customerId;

  return (
    <div className="d-flex flex-column h-100 position-relative">
      {/* Chat Top Header */}
      <div className="ara-chat-header">
        <div className="d-flex align-items-center gap-3">
          <div className="ara-avatar">
            {customer?.fullName ? customer.fullName.charAt(0).toUpperCase() : 'K'}
          </div>
          <div>
            <div className="d-flex align-items-center gap-2">
              <h5 className="fw-bold mb-0 text-dark" style={{ fontSize: '0.95rem' }}>
                {customer?.fullName || 'Khách hàng'}
              </h5>
              <span className="badge-ara-info">Facebook Messenger</span>
            </div>
            <div className="d-flex align-items-center gap-2 text-muted" style={{ fontSize: '0.75rem', marginTop: '2px' }}>
              <span>Mã: <strong className="text-dark">{customer?.customerCode || 'N/A'}</strong></span>
              {customer?.phone && <span>• SĐT: <strong className="text-dark">{customer.phone}</strong></span>}
            </div>
          </div>
        </div>

        <div className="d-flex align-items-center gap-2">
          {/* Tag conversation */}
          <div className="position-relative">
            <button
              type="button"
              onClick={() => setShowTagPopup(!showTagPopup)}
              className="btn btn-sm btn-outline-secondary d-flex align-items-center gap-1"
              style={{ fontSize: '0.78rem', borderRadius: 'var(--radius-sm, 6px)' }}
            >
              <Tag size={13} />
              <span>Gắn thẻ</span>
            </button>

            {showTagPopup && (
              <form
                onSubmit={handleAddTag}
                className="position-absolute end-0 mt-1 p-2 bg-white rounded shadow-lg border"
                style={{ width: '200px', zIndex: 100 }}
              >
                <input
                  type="text"
                  placeholder="Tên thẻ (VD: VIP, Chờ size)..."
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  className="form-control form-control-sm mb-2"
                  autoFocus
                />
                <button
                  type="submit"
                  className="btn btn-sm btn-dark w-100"
                  style={{ background: 'var(--ara-noir, #1C1A17)', fontSize: '0.75rem' }}
                >
                  Xác nhận thêm
                </button>
              </form>
            )}
          </div>

          {/* Quick Order Button */}
          {onOpenQuickOrder && (
            <button
              type="button"
              onClick={onOpenQuickOrder}
              className="btn-ara-primary d-flex align-items-center gap-1"
              style={{ padding: '0.45rem 0.85rem', fontSize: '0.78rem' }}
            >
              <ShoppingBag size={14} />
              <span>Tạo đơn nhanh (UC-78)</span>
            </button>
          )}
        </div>
      </div>

      {/* Messages Stream */}
      <div className="ara-chat-messages-container">
        {loading ? (
          <>
            <SkeletonMessage align="left" />
            <SkeletonMessage align="right" />
            <SkeletonMessage align="left" />
            <SkeletonMessage align="right" />
            <SkeletonMessage align="left" />
          </>
        ) : messages.length === 0 ? (
          <div className="text-center py-5 text-muted small">
            <MessageSquare size={32} className="mb-2" style={{ color: 'var(--ara-gold)', opacity: 0.5 }} />
            <div>Chưa có tin nhắn trong hội thoại này</div>
          </div>
        ) : (
          messages.map((m) => {
            const isSeller = m.senderType === 'SELLER';

            return (
              <div
                key={m._id}
                className={`ara-msg-wrapper ${isSeller ? 'ara-msg-outbound' : 'ara-msg-inbound'}`}
              >
                {!isSeller && (
                  <div className="ara-avatar" style={{ width: '32px', height: '32px', fontSize: '0.75rem' }}>
                    {customer?.fullName ? customer.fullName.charAt(0).toUpperCase() : 'K'}
                  </div>
                )}

                <div className="ara-msg-bubble">
                  {/* Referenced SKU Card */}
                  {m.referencedSkuId && (
                    <div className="ara-msg-sku-card">
                      <Package size={22} color="var(--ara-gold)" className="flex-shrink-0" />
                      <div>
                        <div className="fw-bold" style={{ fontSize: '0.82rem' }}>
                          {m.referencedSkuId.styleName || m.referencedSkuId.skuCode}
                        </div>
                        <div className="text-secondary small">
                          Màu: {m.referencedSkuId.color} | Size: <strong>{m.referencedSkuId.size}</strong> |{' '}
                          <span style={{ color: 'var(--ara-gold-hover)', fontWeight: 700 }}>
                            {m.referencedSkuId.retailPrice?.toLocaleString('vi-VN')} đ
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Text content */}
                  {m.messageText && (
                    <div style={{ whiteSpace: 'pre-wrap' }}>{m.messageText}</div>
                  )}

                  {/* Timestamp */}
                  <div
                    className={`ara-msg-time d-flex align-items-center gap-1 ${
                      isSeller ? 'justify-content-end text-light' : 'text-muted'
                    }`}
                  >
                    <span>
                      {new Date(m.sentAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {isSeller && <CheckCheck size={13} color="var(--ara-gold-light)" />}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Dock */}
      <div className="ara-chat-input-bar">
        {/* Attached SKU preview pill */}
        {attachedSku && (
          <div className="ara-attached-sku-banner">
            <div className="d-flex align-items-center gap-2">
              <Package size={15} color="var(--ara-gold-hover)" />
              <span>
                Đang đính kèm: <strong>{attachedSku.styleName}</strong> ({attachedSku.skuCode} - Size {attachedSku.size})
              </span>
            </div>
            <button
              type="button"
              onClick={onClearAttachedSku}
              className="btn btn-sm btn-link text-danger p-0 text-decoration-none fw-bold"
            >
              ✕ Hủy
            </button>
          </div>
        )}

        <form onSubmit={handleSendMessage} className="ara-chat-form">
          <div className="ara-chat-input-row">
            <textarea
              placeholder="Nhập nội dung tư vấn gửi cho khách hàng..."
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage(e);
                }
              }}
              rows={3}
            />
            <button
              type="submit"
              disabled={(!text.trim() && !attachedSku) || sending}
              className="ara-chat-send-btn"
              title="Gửi tin nhắn (Enter)"
            >
              {sending ? (
                <span className="spinner-border spinner-border-sm" role="status" style={{ width: '16px', height: '16px' }} />
              ) : (
                <Send size={18} />
              )}
            </button>
          </div>
          <div className="ara-send-hint">
            Enter để gửi · Shift+Enter xuống dòng
          </div>
        </form>
      </div>
    </div>
  );
};

export default ChatBox;
