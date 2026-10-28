/**
 * ============================================================================
 * @title        : ChatBox Component (Pancake-style Quick Tag Bar)
 * @author       : Nguyễn Quang Huy
 * @createdDate  : 2026-10-27
 * @lastModified : 2026-10-28
 * @description  : Khung chat nhắn tin trực tiếp với khách hàng Messenger (UC-72, UC-74),
 *                 tích hợp thanh nhãn màu Pancake gán tag 1 chạm (UC-73) và nút mở nhanh tạo đơn.
 *                 (Refactor 2026-10-28: giao diện chỉ dùng Bootstrap / React-Bootstrap.)
 * @module       : Conversational Commerce / Chat Interface
 * @layer        : Front-end
 * ============================================================================
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Button, Badge, Form, InputGroup, Spinner, Stack, Image, Modal, Popover, OverlayTrigger,
  CloseButton, ListGroup, Card,
} from 'react-bootstrap';
import { sellerService } from '../../services/sellerService';
import { API_BASE_URL } from '../../utils/constants';
import { useToast } from '../../context/ToastContext';
import { Icon, Avatar, EmptyState, formatVnd } from './SellerUi';

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
  const { showWarning, showError, showSuccess } = useToast();
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
      showWarning('Chỉ được chọn tối đa 5 tệp mỗi lần', 'Giới hạn tệp');
      return;
    }
    // Giới hạn 25MB mỗi tệp
    for (const f of files) {
      if (f.size > 25 * 1024 * 1024) {
        showWarning(`Tệp "${f.name}" vượt quá dung lượng 25MB cho phép`, 'Dung lượng tệp');
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
      showError(`Lỗi gửi tin nhắn: ${err.message}`, 'Lỗi gửi tin');
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
        showSuccess(`Đã tạo thẻ "${newTagName.trim()}"`, 'Tạo thẻ');
        // Auto-gắn tag vừa tạo vào cuộc hội thoại
        if (conversation?._id) {
          const tagRes = await sellerService.addTag(conversation._id, newTagName.trim());
          if (tagRes.success && onTagAdded) onTagAdded(tagRes.data);
        }
      }
    } catch (err) {
      showError(err.message, 'Lỗi tạo thẻ');
    } finally {
      setCreatingTag(false);
    }
  };

  if (!conversation) {
    return (
      <div className="d-flex flex-column align-items-center justify-content-center h-100 p-5 text-center bg-body-tertiary">
        <Icon name="chat-square-text" className="display-6 text-secondary mb-3" />
        <h4 className="fw-bold fs-5 mb-2">Hộp Thoại Tư Vấn Bán Hàng</h4>
        <p className="text-secondary small mb-4" style={{ maxWidth: 360 }}>
          Vui lòng chọn một khách hàng từ danh sách bên trái để xem nội dung tin nhắn, kiểm tra tồn kho và hỗ trợ lên đơn.
        </p>

        {/* Hướng dẫn tác vụ nhanh thực tế cho Seller */}
        <ListGroup className="w-100 text-start small" style={{ maxWidth: 340 }}>
          <ListGroup.Item><Icon name="messenger" className="me-2 text-primary" />Đồng bộ tin nhắn Facebook Messenger</ListGroup.Item>
          <ListGroup.Item><Icon name="lightning-charge" className="me-2 text-warning" />Tra cứu tồn kho khả dụng &amp; Tạo đơn nhanh</ListGroup.Item>
          <ListGroup.Item><Icon name="tags" className="me-2 text-success" />Gắn thẻ phân loại khách hàng đa kênh</ListGroup.Item>
        </ListGroup>
      </div>
    );
  }

  const customer = conversation.customerId;

  /** Popover tạo tag mới (thay cho form inline tự định vị). */
  const newTagPopover = (
    <Popover id="chat-new-tag-popover">
      <Popover.Header as="div" className="small fw-bold">Tạo thẻ mới</Popover.Header>
      <Popover.Body>
        <Form onSubmit={handleCreateTag}>
          <InputGroup size="sm">
            <Form.Control
              placeholder="Tên thẻ mới..."
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              autoFocus
              maxLength={30}
            />
            <Form.Control
              type="color"
              value={newTagColor}
              onChange={(e) => setNewTagColor(e.target.value)}
              title="Chọn màu thẻ"
              className="form-control-color flex-grow-0"
            />
            <Button type="submit" variant="dark" disabled={creatingTag || !newTagName.trim()}>
              {creatingTag ? <Spinner animation="border" size="sm" /> : 'Tạo'}
            </Button>
          </InputGroup>
        </Form>
      </Popover.Body>
    </Popover>
  );

  return (
    <div className="d-flex flex-column h-100 position-relative">
      {/* ===== Chat Top Header ===== */}
      <div className="d-flex align-items-center justify-content-between gap-2 px-3 py-2 border-bottom bg-white">
        <Stack direction="horizontal" gap={3}>
          <Avatar name={customer?.fullName} size={40} />
          <div>
            <Stack direction="horizontal" gap={2}>
              <h5 className="fw-bold mb-0 fs-6">{customer?.fullName || 'Khách hàng'}</h5>
              <Badge bg="primary-subtle" text="primary-emphasis">Facebook Messenger</Badge>
            </Stack>
            <div className="text-secondary small">
              Mã: <strong className="text-body">{customer?.customerCode || 'N/A'}</strong>
              {customer?.phone && <> • SĐT: <strong className="text-body">{customer.phone}</strong></>}
            </div>
          </div>
        </Stack>

        {/* Quick Order Button */}
        {onOpenQuickOrder && (
          <Button size="sm" variant="dark" onClick={onOpenQuickOrder} className="d-flex align-items-center gap-1 text-nowrap">
            <Icon name="bag-plus" /> Tạo đơn nhanh
          </Button>
        )}
      </div>

      {/* ===== Pancake-style Quick Tag Bar ===== */}
      <div className="d-flex align-items-center gap-1 px-3 py-2 border-bottom bg-white overflow-x-auto">
        {allTags.map((tag) => {
          const isActive = activeTags.includes(tag.name);
          return (
            <Button
              key={tag._id}
              size="sm"
              variant="light"
              className="rounded-pill py-0 px-2 text-nowrap small border"
              // Màu thẻ do người dùng cấu hình trong DB nên bắt buộc truyền qua style
              style={isActive
                ? { background: tag.color, color: tag.textColor || '#fff', borderColor: tag.color }
                : { borderColor: tag.color, color: tag.color, background: 'transparent' }}
              onClick={() => handleToggleTag(tag.name)}
              title={isActive ? `Bỏ thẻ "${tag.name}"` : `Gắn thẻ "${tag.name}"`}
            >
              {isActive && <Icon name="check2" className="me-1" />}
              {tag.name}
            </Button>
          );
        })}

        {/* Nút tạo tag mới */}
        <OverlayTrigger
          trigger="click"
          placement="bottom-end"
          rootClose
          show={showNewTagForm}
          onToggle={setShowNewTagForm}
          overlay={newTagPopover}
        >
          <Button size="sm" variant="outline-secondary" className="rounded-pill py-0 px-2" title="Tạo thẻ mới">
            <Icon name="plus-lg" />
          </Button>
        </OverlayTrigger>
      </div>

      {/* ===== Messages Stream ===== */}
      <div className="flex-grow-1 overflow-auto p-3 bg-body-tertiary">
        {loading ? (
          <div className="d-flex flex-column align-items-center justify-content-center h-100 py-5 text-secondary">
            <Spinner animation="border" variant="secondary" className="mb-2" />
            <span className="small">Đang tải nội dung tin nhắn...</span>
          </div>
        ) : messages.length === 0 ? (
          <EmptyState icon="chat-square" title="Chưa có tin nhắn trong hội thoại này" />
        ) : (
          messages.map((m) => {
            const isSeller = m.senderType === 'SELLER';
            return (
              <div key={m._id} className={`d-flex align-items-end gap-2 mb-3 ${isSeller ? 'justify-content-end' : ''}`}>
                {!isSeller && <Avatar name={customer?.fullName} size={32} />}
                <div
                  className={`px-3 py-2 rounded-4 shadow-sm small ${isSeller ? 'bg-dark text-white' : 'bg-white border'}`}
                  style={{ maxWidth: '75%' }}
                >
                  {/* Hiển thị sản phẩm đính kèm nếu có */}
                  {m.referencedSkuId && (
                    <Card body className="mb-2 text-body">
                      <Stack direction="horizontal" gap={2}>
                        <Icon name="box-seam" className="fs-4 text-warning-emphasis" />
                        <div>
                          <div className="fw-bold">{m.referencedSkuId.styleName || m.referencedSkuId.skuCode}</div>
                          <div className="text-secondary small">
                            Màu: {m.referencedSkuId.color} | Size: <strong>{m.referencedSkuId.size}</strong> |{' '}
                            <span className="fw-bold text-warning-emphasis">{formatVnd(m.referencedSkuId.retailPrice)}</span>
                          </div>
                        </div>
                      </Stack>
                    </Card>
                  )}

                  {/* Hiển thị ảnh / video / tệp đính kèm của khách hàng hoặc người bán */}
                  {m.attachments && m.attachments.length > 0 && (
                    <div className="d-flex flex-wrap gap-2 mb-1">
                      {m.attachments.map((att, idx) => {
                        const fullUrl = getMediaUrl(att.url);
                        if (att.type === 'image') {
                          return (
                            <Image
                              key={idx}
                              src={fullUrl}
                              alt={att.name || 'Ảnh đính kèm'}
                              loading="lazy"
                              thumbnail
                              role="button"
                              title="Bấm để xem ảnh phóng to"
                              className="object-fit-cover"
                              style={{ maxWidth: 220, maxHeight: 220 }}
                              onClick={() => setPreviewImage(fullUrl)}
                              onError={(e) => {
                                // Fallback nếu ảnh không tải được
                                e.target.style.display = 'none';
                              }}
                            />
                          );
                        }
                        if (att.type === 'video') {
                          return <video key={idx} controls src={fullUrl} className="rounded w-100" style={{ maxWidth: 280 }} />;
                        }
                        if (att.type === 'audio') {
                          return <audio key={idx} controls src={fullUrl} className="w-100" />;
                        }
                        return (
                          <a
                            key={idx}
                            href={fullUrl}
                            target="_blank"
                            rel="noreferrer"
                            download={att.name || 'file'}
                            className="d-flex align-items-center gap-2 p-2 rounded border bg-body text-body text-decoration-none"
                          >
                            <Icon name="file-earmark-text" className="fs-5" />
                            <div className="text-truncate" style={{ maxWidth: 180 }}>
                              <div className="text-truncate fw-semibold">{att.name || 'Tệp đính kèm'}</div>
                              {att.size && <div className="text-secondary small">{(att.size / 1024).toFixed(1)} KB</div>}
                            </div>
                            <Icon name="download" />
                          </a>
                        );
                      })}
                    </div>
                  )}

                  {/* Nội dung tin nhắn văn bản */}
                  {m.messageText && <div style={{ whiteSpace: 'pre-wrap' }}>{m.messageText}</div>}

                  <div className={`d-flex align-items-center gap-1 mt-1 small ${isSeller ? 'justify-content-end text-white-50' : 'text-secondary'}`}>
                    <span>{new Date(m.sentAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>
                    {isSeller && <Icon name="check2-all" className="text-warning" />}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* ===== Input Dock with File Attachment Tray ===== */}
      <div className="border-top bg-white p-2">
        {/* Khay preview tệp đính kèm người bán đã chọn */}
        {selectedFiles.length > 0 && (
          <div className="d-flex flex-wrap gap-2 mb-2">
            {selectedFiles.map((file, idx) => (
              <div key={idx} className="d-flex align-items-center gap-1 border rounded-pill ps-1 pe-2 py-1 bg-body-tertiary small">
                {file.type.startsWith('image/') ? (
                  <Image src={URL.createObjectURL(file)} alt={file.name} roundedCircle className="object-fit-cover" style={{ width: 22, height: 22 }} />
                ) : (
                  <Icon name="file-earmark-text" className="text-warning-emphasis" />
                )}
                <span className="text-truncate" style={{ maxWidth: 140 }}>{file.name}</span>
                <CloseButton style={{ fontSize: '0.6rem' }} onClick={() => removeSelectedFile(idx)} title="Xóa tệp" />
              </div>
            ))}
          </div>
        )}

        <Form onSubmit={handleSendMessage}>
          {/* Input chọn file ẩn */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.zip"
            className="d-none"
            onChange={handleFileSelect}
          />

          <InputGroup>
            {/* Nút đính kèm ảnh & file */}
            <Button
              variant="outline-secondary"
              onClick={() => fileInputRef.current?.click()}
              title="Gửi ảnh hoặc tệp cho khách (tối đa 5 tệp x 25MB)"
            >
              <Icon name="paperclip" />
            </Button>

            <Form.Control
              as="textarea"
              rows={2}
              className="shadow-none"
              style={{ resize: 'none' }}
              placeholder={selectedFiles.length > 0 ? 'Nhập chú thích gửi kèm tệp...' : 'Nhập nội dung tư vấn gửi cho khách hàng...'}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage(e);
                }
              }}
            />

            <Button
              type="submit"
              variant="dark"
              disabled={(!text.trim() && selectedFiles.length === 0) || sending}
              title="Gửi tin nhắn (Enter)"
            >
              {sending ? <Spinner animation="border" size="sm" /> : <Icon name="send-fill" />}
            </Button>
          </InputGroup>
          <Form.Text className="d-block mt-1">
            Enter để gửi · Shift+Enter xuống dòng · Có thể gửi ảnh &amp; tệp trực tiếp cho khách
          </Form.Text>
        </Form>
      </div>

      {/* ===== Lightbox phóng to ảnh ===== */}
      <Modal show={!!previewImage} onHide={() => setPreviewImage(null)} size="xl" centered contentClassName="bg-transparent border-0">
        <Modal.Body className="text-center p-0 position-relative">
          <Image src={previewImage || ''} alt="Ảnh phóng to" fluid rounded style={{ maxHeight: '85vh' }} />
          <CloseButton variant="white" className="position-absolute top-0 end-0 m-2" onClick={() => setPreviewImage(null)} />
          <div className="mt-2">
            <Button as="a" href={previewImage || ''} target="_blank" rel="noreferrer" download size="sm" variant="light">
              <Icon name="download" className="me-1" /> Mở ảnh gốc
            </Button>
          </div>
        </Modal.Body>
      </Modal>
    </div>
  );
};

export default ChatBox;
