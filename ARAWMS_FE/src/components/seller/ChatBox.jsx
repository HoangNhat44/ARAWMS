/**
 * ============================================================================
 * @title        : ChatBox Component (Pancake-style Quick Tag Bar)
 * @author       : Nguyễn Quang Huy
 * @createdDate  : 2026-10-27
 * @lastModified : 2026-10-27
 * @description  : Khung chat nhắn tin trực tiếp với khách hàng Messenger (UC-72, UC-74),
 *                 tích hợp thanh nhãn màu Pancake gán tag 1 chạm (UC-73) và nút mở nhanh tạo đơn.
 * @module       : Conversational Commerce / Chat Interface
 * @layer        : Front-end
 * ============================================================================
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Send, ShoppingBag, CheckCheck, Package, MessageSquare, MessageSquareText,
  Plus, X, Settings2, Paperclip, Image as ImageIcon, FileText, Download,
} from 'lucide-react';
import { sellerService } from '../../services/sellerService';
import { API_BASE_URL } from '../../utils/constants';

/**
 * Hàm lấy URL tuyệt đối của ảnh/tệp đính kèm.
 * Nếu là URL ngoài (Facebook CDN) thì dùng trực tiếp; nếu là /uploads thì ghép origin Backend.
 */
const getMediaUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('blob:') || url.startsWith('data:')) {
    return url;
  }
  const serverOrigin = (API_BASE_URL || '').replace(/\/api\/?$/, '');
  return `${serverOrigin}${url}`;
};

/**
 * Component khung chat chính với khách hàng kèm Quick Tag Bar.
 *
 * @component
 * @param {Object} props - Thuộc tính truyền vào component.
 * @param {Object} props.conversation - Dữ liệu cuộc hội thoại đang mở.
 * @param {Function} [props.onTagAdded] - Callback thông báo khi gắn/hủy tag.
 * @param {Array<Object>} props.allTags - Danh sách tất cả thẻ tag từ DB.
 * @param {Function} [props.onTagsRefresh] - Callback làm mới danh sách thẻ tag.
 * @param {Function} [props.onOpenQuickOrder] - Callback chuyển sang tab tạo đơn nhanh.
 * @returns {JSX.Element} Khung chat hoàn chỉnh.
 */
const ChatBox = ({
  conversation,
  onTagAdded,
  allTags = [],
  onTagsRefresh,
  onOpenQuickOrder,
}) => {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [showNewTagForm, setShowNewTagForm] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#8B5CF6');
  const [creatingTag, setCreatingTag] = useState(false);
  
  // Tệp đính kèm người bán chọn gửi
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [previewImage, setPreviewImage] = useState(null); // Modal phóng to ảnh
  
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  const activeTags = conversation?.tags || [];

  useEffect(() => {
    if (conversation?._id) fetchMessages(conversation._id);
  }, [conversation?._id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchMessages = async (convId) => {
    try {
      setLoading(true);
      const res = await sellerService.getConversationMessages(convId, { limit: 50 });
      if (res.success) setMessages(res.data.items || []);
    } catch (err) {
      console.warn('Lỗi tải tin nhắn:', err.message);
    } finally {
      setLoading(false);
    }
  };

  /** Xử lý chọn tệp từ máy tính */
  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    if (selectedFiles.length + files.length > 5) {
      alert('Chỉ được chọn tối đa 5 tệp mỗi lần');
      return;
    }
    // Giới hạn 25MB mỗi tệp
    for (const f of files) {
      if (f.size > 25 * 1024 * 1024) {
        alert(`Tệp "${f.name}" vượt quá dung lượng 25MB cho phép`);
        return;
      }
    }
    setSelectedFiles((prev) => [...prev, ...files]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeSelectedFile = (idx) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  /** Gửi tin nhắn văn bản hoặc tệp đính kèm */
  const handleSendMessage = async (e) => {
    if (e) e.preventDefault();
    if ((!text.trim() && selectedFiles.length === 0) || sending || !conversation?._id) return;
    
    try {
      setSending(true);

      // Nếu có chọn tệp -> Gửi qua API upload tệp đính kèm (UC-74)
      if (selectedFiles.length > 0) {
        const formData = new FormData();
        selectedFiles.forEach((file) => formData.append('files', file));
        if (text.trim()) formData.append('messageText', text.trim());

        const res = await sellerService.sendAttachments(conversation._id, formData);
        if (res.success) {
          setMessages((prev) => [...prev, res.data]);
          setText('');
          setSelectedFiles([]);
        }
      } else {
        // Chỉ gửi tin nhắn văn bản thuần túy
        const res = await sellerService.sendMessage(conversation._id, { messageText: text.trim() });
        if (res.success) {
          setMessages((prev) => [...prev, res.data]);
          setText('');
        }
      }
    } catch (err) {
      alert(`Lỗi gửi tin nhắn: ${err.message}`);
    } finally {
      setSending(false);
    }
  };

  /** Toggle tag: gắn nếu chưa có, hủy nếu đã có */
  const handleToggleTag = async (tagName) => {
    if (!conversation?._id) return;
    try {
      const isActive = activeTags.includes(tagName);
      let res;
      if (isActive) {
        res = await sellerService.removeTag(conversation._id, tagName);
      } else {
        res = await sellerService.addTag(conversation._id, tagName);
      }
      if (res.success && onTagAdded) onTagAdded(res.data);
    } catch (err) {
      console.warn('Tag toggle error:', err.message);
    }
  };

  /** Tạo tag tuỳ chỉnh mới */
  const handleCreateTag = async (e) => {
    e.preventDefault();
    if (!newTagName.trim()) return;
    try {
      setCreatingTag(true);
      const res = await sellerService.createCustomTag({ name: newTagName.trim(), color: newTagColor });
      if (res.success) {
        if (onTagsRefresh) await onTagsRefresh();
        setNewTagName('');
        setShowNewTagForm(false);
        // Auto-gắn tag vừa tạo vào cuộc hội thoại
        if (conversation?._id) {
          const tagRes = await sellerService.addTag(conversation._id, newTagName.trim());
          if (tagRes.success && onTagAdded) onTagAdded(tagRes.data);
        }
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setCreatingTag(false);
    }
  };

  if (!conversation) {
    return (
      <div className="d-flex flex-column align-items-center justify-content-center h-100 p-5 text-center text-muted" style={{ background: '#FAF9F6' }}>
        <div
          className="d-flex align-items-center justify-content-center mb-3"
          style={{
            width: '60px',
            height: '60px',
            background: '#FFFFFF',
            border: '1px solid #E5E7EB',
            borderRadius: '14px',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
          }}
        >
          <MessageSquareText size={30} color="#4B5563" />
        </div>
        <h4 className="fw-bold text-dark mb-2" style={{ fontSize: '1.1rem', letterSpacing: '-0.01em' }}>
          Hộp Thoại Tư Vấn Bán Hàng
        </h4>
        <p className="text-secondary small mb-4" style={{ maxWidth: '360px', lineHeight: 1.5 }}>
          Vui lòng chọn một khách hàng từ danh sách bên trái để xem nội dung tin nhắn, kiểm tra tồn kho và hỗ trợ lên đơn.
        </p>

        {/* Hướng dẫn tác vụ nhanh thực tế cho Seller */}
        <div className="d-flex flex-column gap-2" style={{ maxWidth: '340px', width: '100%', textAlign: 'left' }}>
          <div className="d-flex align-items-center gap-2 p-2 rounded" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', fontSize: '0.78rem', color: '#374151' }}>
            <span style={{ fontSize: '1rem' }}>💬</span>
            <span>Đồng bộ tin nhắn Facebook Messenger</span>
          </div>
          <div className="d-flex align-items-center gap-2 p-2 rounded" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', fontSize: '0.78rem', color: '#374151' }}>
            <span style={{ fontSize: '1rem' }}>⚡</span>
            <span>Tra cứu tồn kho khả dụng & Tạo đơn nhanh</span>
          </div>
          <div className="d-flex align-items-center gap-2 p-2 rounded" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', fontSize: '0.78rem', color: '#374151' }}>
            <span style={{ fontSize: '1rem' }}>🏷️</span>
            <span>Gắn thẻ phân loại khách hàng đa kênh</span>
          </div>
        </div>
      </div>
    );
  }

  const customer = conversation.customerId;

  return (
    <div className="d-flex flex-column h-100 position-relative">
      {/* ===== Chat Top Header ===== */}
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

        {/* Quick Order Button */}
        {onOpenQuickOrder && (
          <button
            type="button"
            onClick={onOpenQuickOrder}
            className="btn-ara-primary d-flex align-items-center gap-1"
            style={{ padding: '0.45rem 0.85rem', fontSize: '0.78rem' }}
          >
            <ShoppingBag size={14} />
            <span>Tạo đơn nhanh</span>
          </button>
        )}
      </div>

      {/* ===== Pancake-style Quick Tag Bar ===== */}
      <div className="ara-quick-tag-bar">
        <div className="ara-quick-tag-scroll">
          {allTags.map((tag) => {
            const isActive = activeTags.includes(tag.name);
            return (
              <button
                key={tag._id}
                type="button"
                className={`ara-quick-tag-pill ${isActive ? 'active' : ''}`}
                style={isActive
                  ? { background: tag.color, color: tag.textColor || '#fff', borderColor: tag.color }
                  : { borderColor: tag.color, color: tag.color }
                }
                onClick={() => handleToggleTag(tag.name)}
                title={isActive ? `Bỏ thẻ "${tag.name}"` : `Gắn thẻ "${tag.name}"`}
              >
                {isActive && <span style={{ marginRight: 3 }}>✓</span>}
                {tag.name}
              </button>
            );
          })}

          {/* Nút tạo tag mới */}
          <button
            type="button"
            className="ara-quick-tag-add-btn"
            onClick={() => setShowNewTagForm(!showNewTagForm)}
            title="Tạo thẻ mới"
          >
            <Plus size={12} />
          </button>
        </div>

        {/* Form tạo tag mới (inline dropdown) */}
        {showNewTagForm && (
          <form onSubmit={handleCreateTag} className="ara-new-tag-form">
            <input
              type="text"
              placeholder="Tên thẻ mới..."
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              className="ara-new-tag-input"
              autoFocus
              maxLength={30}
            />
            <input
              type="color"
              value={newTagColor}
              onChange={(e) => setNewTagColor(e.target.value)}
              className="ara-new-tag-color"
              title="Chọn màu thẻ"
            />
            <button type="submit" disabled={creatingTag || !newTagName.trim()} className="ara-new-tag-submit">
              {creatingTag ? '...' : 'Tạo'}
            </button>
            <button type="button" onClick={() => setShowNewTagForm(false)} className="ara-new-tag-cancel">
              <X size={12} />
            </button>
          </form>
        )}
      </div>

      {/* ===== Messages Stream ===== */}
      <div className="ara-chat-messages-container">
        {loading ? (
          <div className="d-flex flex-column align-items-center justify-content-center h-100 py-5 text-muted">
            <div className="spinner-border text-secondary mb-2" role="status" style={{ width: '1.6rem', height: '1.6rem', borderWidth: '2px' }}>
              <span className="visually-hidden">Đang tải...</span>
            </div>
            <span style={{ fontSize: '0.82rem', color: '#6B7280' }}>Đang tải nội dung tin nhắn...</span>
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-5 text-muted small">
            <MessageSquare size={32} className="mb-2" style={{ color: 'var(--ara-gold)', opacity: 0.5 }} />
            <div>Chưa có tin nhắn trong hội thoại này</div>
          </div>
        ) : (
          messages.map((m) => {
            const isSeller = m.senderType === 'SELLER';
            return (
              <div key={m._id} className={`ara-msg-wrapper ${isSeller ? 'ara-msg-outbound' : 'ara-msg-inbound'}`}>
                {!isSeller && (
                  <div className="ara-avatar" style={{ width: '32px', height: '32px', fontSize: '0.75rem' }}>
                    {customer?.fullName ? customer.fullName.charAt(0).toUpperCase() : 'K'}
                  </div>
                )}
                <div className="ara-msg-bubble">
                  {/* Hiển thị sản phẩm đính kèm nếu có */}
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

                  {/* Hiển thị ảnh / video / tệp đính kèm của khách hàng hoặc người bán */}
                  {m.attachments && m.attachments.length > 0 && (
                    <div className="ara-msg-attachments">
                      {m.attachments.map((att, idx) => {
                        const fullUrl = getMediaUrl(att.url);
                        if (att.type === 'image') {
                          return (
                            <div
                              key={idx}
                              className="ara-msg-img-box"
                              onClick={() => setPreviewImage(fullUrl)}
                              title="Bấm để xem ảnh phóng to"
                            >
                              <img
                                src={fullUrl}
                                alt={att.name || 'Ảnh đính kèm'}
                                loading="lazy"
                                onError={(e) => {
                                  // Fallback nếu ảnh không tải được
                                  e.target.style.display = 'none';
                                }}
                              />
                            </div>
                          );
                        }
                        if (att.type === 'video') {
                          return <video key={idx} controls src={fullUrl} className="ara-msg-media" />;
                        }
                        if (att.type === 'audio') {
                          return <audio key={idx} controls src={fullUrl} className="ara-msg-audio" />;
                        }
                        return (
                          <a
                            key={idx}
                            href={fullUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="ara-msg-file-card"
                            download={att.name || 'file'}
                          >
                            <FileText size={18} className="flex-shrink-0" />
                            <div className="ara-msg-file-meta">
                              <span className="ara-msg-file-name">{att.name || 'Tệp đính kèm'}</span>
                              {att.size && <span className="ara-msg-file-size">{(att.size / 1024).toFixed(1)} KB</span>}
                            </div>
                            <Download size={14} className="flex-shrink-0" />
                          </a>
                        );
                      })}
                    </div>
                  )}

                  {/* Nội dung tin nhắn văn bản */}
                  {m.messageText && <div style={{ whiteSpace: 'pre-wrap' }}>{m.messageText}</div>}
                  
                  <div className={`ara-msg-time d-flex align-items-center gap-1 ${isSeller ? 'justify-content-end text-light' : 'text-muted'}`}>
                    <span>{new Date(m.sentAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>
                    {isSeller && <CheckCheck size={13} color="var(--ara-gold-light)" />}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* ===== Input Dock with File Attachment Tray ===== */}
      <div className="ara-chat-input-bar">
        {/* Khay preview tệp đính kèm người bán đã chọn */}
        {selectedFiles.length > 0 && (
          <div className="ara-chat-files-tray">
            {selectedFiles.map((file, idx) => (
              <div key={idx} className="ara-chat-file-chip">
                {file.type.startsWith('image/') ? (
                  <img src={URL.createObjectURL(file)} alt={file.name} className="ara-chat-chip-thumb" />
                ) : (
                  <FileText size={14} color="var(--ara-gold)" />
                )}
                <span className="ara-chat-chip-name">{file.name}</span>
                <button
                  type="button"
                  onClick={() => removeSelectedFile(idx)}
                  className="ara-chat-chip-remove"
                  title="Xóa tệp"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleSendMessage} className="ara-chat-form">
          <div className="ara-chat-input-row">
            {/* Input chọn file ẩn */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.zip"
              style={{ display: 'none' }}
              onChange={handleFileSelect}
            />

            {/* Nút đính kèm ảnh & file */}
            <button
              type="button"
              className="ara-chat-attach-btn"
              onClick={() => fileInputRef.current?.click()}
              title="Gửi ảnh hoặc tệp cho khách (tối đa 5 tệp x 25MB)"
            >
              <Paperclip size={18} />
            </button>

            <textarea
              placeholder={selectedFiles.length > 0 ? "Nhập chú thích gửi kèm tệp..." : "Nhập nội dung tư vấn gửi cho khách hàng..."}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage(e);
                }
              }}
              rows={2}
            />
            
            <button
              type="submit"
              disabled={(!text.trim() && selectedFiles.length === 0) || sending}
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
          <div className="ara-send-hint">Enter để gửi · Shift+Enter xuống dòng · Có thể gửi ảnh & tệp trực tiếp cho khách</div>
        </form>
      </div>

      {/* ===== Lightbox phóng to ảnh ===== */}
      {previewImage && (
        <div className="ara-img-lightbox-overlay" onClick={() => setPreviewImage(null)}>
          <div className="ara-img-lightbox-content" onClick={(e) => e.stopPropagation()}>
            <img src={previewImage} alt="Ảnh phóng to" />
            <button type="button" className="ara-lightbox-close" onClick={() => setPreviewImage(null)}>
              <X size={20} />
            </button>
            <a href={previewImage} target="_blank" rel="noreferrer" className="ara-lightbox-download" download>
              <Download size={14} /> Mở ảnh gốc
            </a>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatBox;
