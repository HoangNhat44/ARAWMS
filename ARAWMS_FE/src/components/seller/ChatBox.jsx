/**
 * ============================================================================
 * @title        : ChatBox Component (Pancake-style Quick Tag Bar)
 * @author       : Nguyễn Quang Huy
 * @createdDate  : 2026-10-27
 * @lastModified : 2026-11-14
 * @description  : Khung chat nhắn tin trực tiếp với khách hàng Messenger (UC-72, UC-74),
 *                 tích hợp thanh nhãn màu gán tag 1 chạm (UC-73) và nút mở nhanh tạo đơn.
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
import { getSocket } from '../../services/socketService';
import { API_BASE_URL } from '../../utils/constants';
import { useToast } from '../../context/ToastContext';
import { Icon, Avatar, EmptyState, formatVnd } from './SellerUi';

import { getMediaUrl, cleanChatMessageText, classifyOrderReceiptMessage, parseOrderReceiptDetails } from '../../utils/sellerChatUtils';
export { getMediaUrl, cleanChatMessageText };

/**
 * Component hiển thị thông báo chốt đơn / phiếu xác nhận theo dạng thẻ tương tác (Rich Interactive Receipt Card)
 * chuẩn AraWMS Haute Logistics (khớp hoàn hảo mẫu thiết kế trong ảnh thực tế).
 */
const OrderReceiptCard = ({ text, isSeller }) => {
  const isConfirmSuccess = text.includes('XÁC NHẬN CHỐT ĐƠN THÀNH CÔNG') || text.includes('ĐÃ TẠO VẬN ĐƠN');
  const isConfirmationRequest = text.includes('THÔNG TIN XÁC NHẬN ĐƠN HÀNG') || text.includes('PHIẾU XÁC NHẬN');
  const isPackingNotice = text.includes('ĐÃ ĐƯỢC ĐÓNG GÓI XONG');

  if (!isConfirmSuccess && !isConfirmationRequest && !isPackingNotice) {
    return <div style={{ whiteSpace: 'pre-wrap' }}>{cleanChatMessageText(text)}</div>;
  }

  const details = parseOrderReceiptDetails(text);
  const orderCode = details.orderCode
    ? (details.orderCode.startsWith('#') ? details.orderCode : `#${details.orderCode}`)
    : '-';
  const waybillCode = details.waybillCode || '-';
  const codAmount = details.codAmount || '-';

  const title = isPackingNotice
    ? 'ĐÃ ĐÓNG GÓI XONG KIỆN HÀNG'
    : isConfirmationRequest
    ? 'PHIẾU XÁC NHẬN ĐƠN HÀNG'
    : 'ĐÃ TẠO VẬN ĐƠN GIAO HÀNG NHANH';

  const badgeText = isPackingNotice ? 'ĐÃ ĐÓNG GÓI' : isConfirmationRequest ? 'CHỜ XÁC NHẬN' : 'CHỜ LẤY HÀNG';

  return (
    <div className="ara-order-receipt-card text-start my-1 shadow-sm">
      {/* Header */}
      <div className="receipt-header">
        <div className="d-flex align-items-center gap-2">
          <Icon name="truck" className="fs-5" style={{ color: 'var(--wms-primary, #8A6A46)' }} />
          <span className="fw-bold small" style={{ color: 'var(--wms-text-primary, #141210)', letterSpacing: '0.01em' }}>
            {title}
          </span>
        </div>
        <span
          className="badge rounded-pill px-2.5 py-1"
          style={{
            backgroundColor: isConfirmationRequest ? '#FFFBEB' : '#ECFDF5',
            color: isConfirmationRequest ? '#D97706' : '#006C4A',
            border: `1px solid ${isConfirmationRequest ? '#FDE68A' : '#A7F3D0'}`,
            fontSize: '11px',
            fontWeight: 600,
          }}
        >
          {badgeText}
        </span>
      </div>

      {/* 4-Box Key Metrics Grid */}
      <div className="receipt-metrics-grid">
        <div>
          <div className="metric-label">MÃ ĐƠN HÀNG</div>
          <div className="metric-value">{orderCode}</div>
        </div>
        <div>
          <div className="metric-label">MÃ VẬN ĐƠN GHN</div>
          <div className="metric-value font-monospace">{waybillCode}</div>
        </div>
        <div>
          <div className="metric-label">DỊCH VỤ CHUYỂN PHÁT</div>
          <div className="metric-value" style={{ fontSize: '12.5px', fontWeight: 500 }}>GHN Tiết kiệm (Dưới 1kg)</div>
        </div>
        <div>
          <div className="metric-label">TỔNG THU HỘ (COD)</div>
          <div className="metric-value cod-highlight">{codAmount}</div>
        </div>
      </div>

      {/* Note description */}
      <div className="small lh-sm mb-2" style={{ color: 'var(--wms-text-secondary, #514536)', fontSize: '12px' }}>
        Đơn hàng của quý khách đã được đẩy lên hệ thống GHN và có mã vận đơn tự động. AraStore đang đóng gói và chờ shipper bàn giao kiện hàng cho bưu tá.
      </div>

      {/* Footer line */}
      <div className="d-flex align-items-center justify-content-between pt-2 border-top small" style={{ borderColor: 'var(--wms-border-subtle, #F0EDED)', fontSize: '11px', color: 'var(--wms-text-light, #837564)' }}>
        <span>Hệ thống WMS</span>
        <span className="d-flex align-items-center gap-1">
          <Icon name="link-45deg" /> Tự động liên kết đơn
        </span>
      </div>
    </div>
  );
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
 * @param {Function} [props.onBackToList] - Callback quay về danh sách hội thoại trên mobile.
 * @param {Function} [props.onToggleRightPanel] - Callback mở/đóng bảng tác nghiệp bên phải.
 * @param {boolean} [props.isRightPanelOpen] - Trạng thái bảng tác nghiệp đang mở.
 * @returns {JSX.Element} Khung chat hoàn chỉnh.
 */
const ChatBox = ({
  conversation,
  onTagAdded,
  allTags = [],
  onTagsRefresh,
  onOpenQuickOrder,
  onBackToList,
  isLeftPanelOpen = true,
  onToggleRightPanel,
  isRightPanelOpen = false,
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
    if (!conversation?._id) return;

    fetchMessages(conversation._id);

    // Kết nối Socket.io và tham gia phòng hội thoại
    const socket = getSocket();
    const convId = conversation._id;
    socket.emit('join_conversation', convId);

    const handleNewMessage = (newMsg) => {
      if (!newMsg || String(newMsg.conversationId) !== String(convId)) return;
      setMessages((prev) => {
        // Tránh trùng lặp tin nhắn nếu đã có trong mảng
        const exists = prev.some(
          (m) => (m._id && m._id === newMsg._id) || (m.fbMessageId && m.fbMessageId === newMsg.fbMessageId)
        );
        if (exists) return prev;
        return [...prev, newMsg];
      });
    };

    socket.on('new_message', handleNewMessage);

    return () => {
      socket.emit('leave_conversation', convId);
      socket.off('new_message', handleNewMessage);
    };
  }, [conversation?._id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchMessages = async (convId, isSilent = false) => {
    try {
      if (!isSilent) setLoading(true);
      const res = await sellerService.getConversationMessages(convId, { limit: 50 });
      if (res.success) {
        const newItems = res.data.items || [];
        setMessages((prev) => {
          if (newItems.length !== prev.length || (newItems.length > 0 && newItems[newItems.length - 1]?._id !== prev[prev.length - 1]?._id)) {
            return newItems;
          }
          return prev;
        });
      }
    } catch (err) {
      console.warn('Lỗi tải tin nhắn:', err.message);
    } finally {
      if (!isSilent) setLoading(false);
    }
  };

  /** Xử lý chọn tệp từ máy tính - Cache Blob URL để tránh leak bộ nhớ */
  const handleFileSelect = (e) => {
    const rawFiles = Array.from(e.target.files || []);
    if (!rawFiles.length) return;
    if (selectedFiles.length + rawFiles.length > 5) {
      showWarning('Chỉ được chọn tối đa 5 tệp mỗi lần', 'Giới hạn tệp');
      return;
    }
    // Giới hạn 25MB mỗi tệp
    for (const f of rawFiles) {
      if (f.size > 25 * 1024 * 1024) {
        showWarning(`Tệp "${f.name}" vượt quá dung lượng 25MB cho phép`, 'Dung lượng tệp');
        return;
      }
    }
    const newItems = rawFiles.map((file) => ({
      file,
      previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
    }));
    setSelectedFiles((prev) => [...prev, ...newItems]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeSelectedFile = (idx) => {
    setSelectedFiles((prev) => {
      const target = prev[idx];
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((_, i) => i !== idx);
    });
  };

  // Dọn dẹp Blob URL khi unmount
  useEffect(() => {
    return () => {
      selectedFiles.forEach((item) => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
    };
  }, [selectedFiles]);

  /** Gửi tin nhắn văn bản hoặc tệp đính kèm */
  const handleSendMessage = async (e) => {
    if (e) e.preventDefault();
    if ((!text.trim() && selectedFiles.length === 0) || sending || !conversation?._id) return;

    try {
      setSending(true);

      // Nếu có chọn tệp -> Gửi qua API upload tệp đính kèm (UC-74)
      if (selectedFiles.length > 0) {
        const formData = new FormData();
        selectedFiles.forEach((item) => formData.append('files', item.file));
        if (text.trim()) formData.append('messageText', text.trim());

        const res = await sellerService.sendAttachments(conversation._id, formData);
        if (res.success) {
          setMessages((prev) => [...prev, res.data]);
          setText('');
          selectedFiles.forEach((item) => {
            if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
          });
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
    <div className="d-flex flex-column h-100 position-relative" style={{ minHeight: 0 }}>
      {/* ===== Chat Top Header ===== */}
      {/* ===== Chat Header (Standardized Haute Surface) ===== */}
      <div
        className="d-flex align-items-center justify-content-between gap-1 gap-sm-2 px-3 py-2 border-bottom flex-shrink-0 bg-white"
        style={{ borderColor: 'var(--wms-border, #C8B9A6)', minHeight: '52px' }}
      >
        <Stack direction="horizontal" gap={2} className="align-items-center overflow-hidden flex-grow-1">
          {/* Nút ẩn/hiện danh sách hội thoại (mobile quay lại danh sách, desktop đóng/mở pane trái) */}
          {onBackToList && (
            <Button
              size="sm"
              variant="light"
              className="border me-1 px-2 py-1 rounded d-flex align-items-center gap-1 text-secondary btn-wms-default flex-shrink-0"
              onClick={onBackToList}
              title={isLeftPanelOpen ? 'Ẩn danh sách hội thoại' : 'Hiện danh sách hội thoại'}
            >
              <Icon name={isLeftPanelOpen ? 'chevron-left' : 'chevron-right'} />
            </Button>
          )}

          <Avatar name={customer?.fullName} size={38} />
          <div className="overflow-hidden flex-grow-1" style={{ minWidth: 0 }}>
            <div className="d-flex align-items-center gap-1.5 text-truncate">
              <span className="fw-bold text-truncate" style={{ fontSize: '0.92rem', color: 'var(--wms-text-primary, #141210)' }}>
                {customer?.fullName || 'Khách hàng'}
              </span>
              {customer?.tier && (
                <span className="ara-vip-badge">{customer.tier}</span>
              )}
            </div>
            <div className="small text-truncate d-flex align-items-center gap-1.5" style={{ fontSize: '11px', color: 'var(--wms-text-secondary, #574F46)' }}>
              {customer?.customerCode && <span>{customer.customerCode}</span>}
              {customer?.customerCode && customer?.phone && <span>•</span>}
              {customer?.phone && <span className="tabular-nums">{customer.phone}</span>}
            </div>
          </div>
        </Stack>

        {/* Action Buttons: Toggle Right Panel (Chốt đơn) */}
        <div className="flex-shrink-0 d-flex align-items-center gap-2 ms-1">
          {onToggleRightPanel && (
            <Button
              size="sm"
              className="d-flex align-items-center gap-1.5 text-nowrap px-3 py-1 btn-wms-default rounded-pill"
              onClick={onToggleRightPanel}
              title={isRightPanelOpen ? 'Ẩn bảng chốt đơn' : 'Hiện bảng chốt đơn'}
              style={{ fontSize: '0.78rem' }}
            >
              <Icon name="layout-sidebar-reverse" />
              <span>{isRightPanelOpen ? 'Ẩn chốt đơn' : 'Chốt đơn'}</span>
            </Button>
          )}
        </div>
      </div>

      {/* ===== Pancake-style Quick Tag Bar ===== */}
      <div
        className="d-flex flex-wrap align-items-center flex-shrink-0 bg-white"
        style={{
          borderBottom: '1px solid var(--wms-border, #C8B9A6)',
          padding: '6px 14px',
          gap: '6px',
          maxHeight: '68px',
          overflowY: 'auto',
        }}
      >
        <span className="small fw-bold me-1" style={{ fontSize: '11px', color: 'var(--wms-text-secondary, #574F46)', letterSpacing: '0.04em' }}>
          THẺ:
        </span>
        {allTags.map((tag) => {
          const isActive = activeTags.includes(tag.name);
          return (
            <button
              key={tag._id}
              type="button"
              className={`ara-chat-quick-tag ${isActive ? 'active' : ''}`}
              style={isActive
                ? {
                    background: 'var(--wms-primary-subtle, #EFE6DA)',
                    color: 'var(--wms-accent-hover, #6E5233)',
                    borderColor: 'var(--wms-accent, #8A6A46)',
                  }
                : {
                    borderColor: 'var(--wms-border, #C8B9A6)',
                    color: 'var(--wms-text-secondary, #574F46)',
                    background: '#FFFFFF',
                  }}
              onClick={() => handleToggleTag(tag.name)}
              title={isActive ? `Bỏ thẻ "${tag.name}"` : `Gắn thẻ "${tag.name}"`}
            >
              {isActive && <Icon name="check2" className="me-0.5" />}
              {tag.name}
            </button>
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
          <button
            type="button"
            className="ara-chat-quick-tag"
            style={{
              borderColor: 'var(--wms-border, #C8B9A6)',
              borderStyle: 'dashed',
              backgroundColor: '#FFFFFF',
              color: 'var(--wms-text-secondary, #574F46)',
            }}
            title="Tạo thẻ mới"
          >
            <Icon name="plus-lg" className="me-0.5" />
            <span>Thêm thẻ</span>
          </button>
        </OverlayTrigger>
      </div>

      {/* ===== Messages Stream ===== */}
      <div className="flex-grow-1 overflow-auto p-3 ara-chat-stream-bg" style={{ minHeight: 0 }}>
        {loading ? (
          <div className="d-flex flex-column align-items-center justify-content-center h-100 py-5 text-secondary">
            <Spinner animation="border" variant="secondary" className="mb-2" />
            <span className="small">Đang tải nội dung tin nhắn...</span>
          </div>
        ) : messages.length === 0 ? (
          <EmptyState icon="chat-square" title="Chưa có tin nhắn trong hội thoại này" />
        ) : (
          messages.map((m, idx) => {
            const isSeller = m.senderType === 'SELLER';
            const prevMsg = messages[idx - 1];
            const nextMsg = messages[idx + 1];

            // Gom cụm tin nhắn liên tiếp cùng người gửi trong vòng 2 phút
            const sameSenderAsPrev = prevMsg && prevMsg.senderType === m.senderType;
            const timeDiffPrev = prevMsg ? (new Date(m.sentAt) - new Date(prevMsg.sentAt)) : Infinity;
            const isFirstInCluster = !sameSenderAsPrev || timeDiffPrev > 120000;

            const sameSenderAsNext = nextMsg && nextMsg.senderType === m.senderType;
            const timeDiffNext = nextMsg ? (new Date(nextMsg.sentAt) - new Date(m.sentAt)) : Infinity;
            const isLastInCluster = !sameSenderAsNext || timeDiffNext > 120000;

            const isOrderCard = m.messageText && (
              m.messageText.includes('XÁC NHẬN CHỐT ĐƠN THÀNH CÔNG') ||
              m.messageText.includes('THÔNG TIN XÁC NHẬN ĐƠN HÀNG') ||
              m.messageText.includes('PHIẾU XÁC NHẬN') ||
              m.messageText.includes('ĐÃ ĐƯỢC ĐÓNG GÓI XONG') ||
              m.messageText.includes('ĐÃ TẠO VẬN ĐƠN')
            );

            // Khoảng cách: 4px nếu cùng cụm, 14px nếu khác cụm (chuẩn UX Messenger/Slack)
            const gapClass = isLastInCluster ? 'mb-3' : 'mb-1';

            return (
              <div
                key={m._id}
                className={`d-flex align-items-end gap-2 ${gapClass} ${isSeller ? 'justify-content-end' : ''}`}
              >
                {/* Avatar khách: Chỉ hiển thị ở tin nhắn cuối cùng trong cụm để tránh lặp vô nghĩa */}
                {!isSeller && (
                  <div style={{ width: 32, flexShrink: 0 }}>
                    {isLastInCluster ? (
                      <Avatar name={customer?.fullName} size={32} />
                    ) : (
                      <div style={{ width: 32, height: 32 }} />
                    )}
                  </div>
                )}

                {/* Nếu là tin nhắn xác nhận / thông báo đơn hàng: Hiển thị thẻ Rich Card */}
                {isOrderCard ? (
                  <div>
                    <OrderReceiptCard text={m.messageText} isSeller={isSeller} />
                    {isLastInCluster && (
                      <div className={`d-flex align-items-center gap-1 mt-1 small ${isSeller ? 'justify-content-end text-secondary' : 'text-secondary'}`} style={{ fontSize: '11px' }}>
                        <span className="tabular-nums">{new Date(m.sentAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>
                        {isSeller && (
                          m.deliveryStatus === 'FAILED_24H_EXPIRED' ? (
                            <span
                              className="badge bg-warning-subtle text-warning-emphasis border border-warning px-1 py-0"
                              style={{ fontSize: '10px' }}
                              title="Facebook chặn gửi qua Messenger do đã quá 24h kể từ lần nhắn gần nhất của khách. Hãy nhờ khách gửi 1 tin nhắn để mở lại luồng!"
                            >
                              ⚠️ Chưa tới Messenger (quá 24h)
                            </span>
                          ) : (
                            <Icon name="check2-all" className="text-success" />
                          )
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className={isSeller ? 'chat-bubble-seller' : 'chat-bubble-customer'}>
                    {/* Hiển thị sản phẩm đính kèm nếu có */}
                    {m.referencedSkuId && (
                      <Card body className="mb-2 text-body border bg-white" style={{ borderColor: 'var(--wms-border, #C8B9A6)' }}>
                        <Stack direction="horizontal" gap={2}>
                          <Icon name="box-seam" className="fs-4" style={{ color: 'var(--wms-accent, #8A6A46)' }} />
                          <div>
                            <div className="fw-bold" style={{ color: 'var(--wms-text-primary, #141210)' }}>{m.referencedSkuId.styleName || m.referencedSkuId.skuCode}</div>
                            <div className="text-secondary small">
                              Màu: {m.referencedSkuId.color} | Size: <strong>{m.referencedSkuId.size}</strong> |{' '}
                              <span className="fw-bold tabular-nums" style={{ color: 'var(--wms-accent, #8A6A46)' }}>{formatVnd(m.referencedSkuId.retailPrice)}</span>
                            </div>
                          </div>
                        </Stack>
                      </Card>
                    )}

                    {/* Hiển thị ảnh / video / tệp đính kèm */}
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
                                onError={(e) => { e.target.style.display = 'none'; }}
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
                    {m.messageText && <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{cleanChatMessageText(m.messageText)}</div>}

                    {/* Thời gian gửi: Chỉ hiện ở cuối cụm hoặc trên hover */}
                    {isLastInCluster && (
                      <div className={`d-flex align-items-center gap-1 mt-1 small ${isSeller ? 'justify-content-end text-white-50' : 'text-secondary'}`} style={{ fontSize: '11px' }}>
                        <span>{new Date(m.sentAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>
                        {isSeller && (
                          m.deliveryStatus === 'FAILED_24H_EXPIRED' ? (
                            <span
                              className="badge bg-warning text-dark px-1 py-0"
                              style={{ fontSize: '10px' }}
                              title="Facebook chặn gửi qua Messenger do đã quá 24h kể từ lần nhắn gần nhất của khách."
                            >
                              ⚠️ Quá 24h
                            </span>
                          ) : (
                            <Icon name="check2-all" className="text-warning" />
                          )
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* ===== Input Dock with File Attachment Tray ===== */}
      <div className="border-top bg-white p-2.5" style={{ borderColor: 'var(--wms-border, #C8B9A6)' }}>
        {/* Khay preview tệp đính kèm người bán đã chọn */}
        {selectedFiles.length > 0 && (
          <div className="d-flex flex-wrap gap-2 mb-2">
            {selectedFiles.map((item, idx) => (
              <div key={idx} className="d-flex align-items-center gap-1 border rounded ps-1 pe-2 py-1 small" style={{ backgroundColor: 'var(--wms-bg-subtle, #F3EDE4)', borderColor: 'var(--wms-border, #C8B9A6)' }}>
                {item.previewUrl ? (
                  <Image src={item.previewUrl} alt={item.file.name} roundedCircle className="object-fit-cover" style={{ width: 22, height: 22 }} />
                ) : (
                  <Icon name="file-earmark-text" style={{ color: 'var(--wms-accent, #8A6A46)' }} />
                )}
                <span className="text-truncate" style={{ maxWidth: 140 }}>{item.file.name}</span>
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
              className="btn-wms-default"
              onClick={() => fileInputRef.current?.click()}
              title="Gửi ảnh hoặc tệp cho khách (tối đa 5 tệp x 25MB)"
            >
              <Icon name="paperclip" />
            </Button>

            <Form.Control
              as="textarea"
              rows={2}
              className="shadow-none"
              style={{ resize: 'none', borderColor: 'var(--wms-border, #C8B9A6)', fontSize: '0.86rem' }}
              placeholder={selectedFiles.length > 0 ? 'Nhập chú thích gửi kèm tệp...' : 'Nhập nội dung tư vấn cho khách hàng... (Enter để gửi · Shift+Enter xuống dòng)'}
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
              className="btn-wms-accent px-3"
              disabled={(!text.trim() && selectedFiles.length === 0) || sending}
              title="Gửi tin nhắn (Enter)"
            >
              {sending ? <Spinner animation="border" size="sm" /> : <Icon name="send-fill" />}
            </Button>
          </InputGroup>
          <Form.Text className="d-block mt-1 text-muted" style={{ fontSize: '11px' }}>
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
