/**
 * ============================================================================
 * @title        : Seller Chat & Messaging Utilities
 * @author       : Nguyễn Quang Huy & AraStore Frontend Team
 * @createdDate  : 2026-11-12
 * @description  : Các hàm tiện ích thuần (pure functions) xử lý dữ liệu chat,
 *                 làm sạch tin nhắn, định dạng media, phân loại phiếu đơn hàng
 *                 và tìm kiếm/lọc hội thoại của Seller.
 * @module       : Conversational Commerce / Seller Chat Utilities
 * @layer        : Front-end Utilities
 * ============================================================================
 */

import { API_BASE_URL } from './constants.js';

/**
 * Lấy URL tuyệt đối của ảnh hoặc tệp đính kèm trong tin nhắn chat.
 * - Giữ nguyên URL ngoài (Facebook CDN, Cloudinary, blob, data).
 * - Ghép origin Backend nếu là đường dẫn nội bộ dạng /uploads.
 *
 * @param {string} url - Đường dẫn tệp đính kèm.
 * @param {string} [baseUrl] - Base URL API (mặc định lấy từ constants).
 * @returns {string} URL tuyệt đối để hiển thị trên trình duyệt.
 */
export const getMediaUrl = (url, baseUrl = API_BASE_URL) => {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('blob:') || url.startsWith('data:')) {
    return url;
  }
  const serverOrigin = (baseUrl || '').replace(/\/api\/?$/, '');
  return `${serverOrigin}${url}`;
};

/**
 * Làm sạch nội dung tin nhắn chat hiển thị:
 * - Loại bỏ các mã trạng thái kỹ thuật tiếng Anh trong ngoặc: (ready_to_pick), (picking), etc.
 * - Loại bỏ các thẻ kỹ thuật trong ngoặc: (GHN), (COD), (TMĐT).
 *
 * @param {string} rawText - Chuỗi tin nhắn gốc từ API / Webhook.
 * @returns {string} Chuỗi tin nhắn đã được làm sạch để hiển thị cho người dùng.
 */
export const cleanChatMessageText = (rawText) => {
  if (!rawText) return '';
  let str = String(rawText);
  str = str.replace(
    /\s*\((ready_to_pick|picking|money_collect_picking|picked|storing|transporting|sorting|delivering|money_collect_delivering|delivered|delivery_fail|waiting_to_return|return|returned|cancel|exception|GHN|COD|TMĐT)\)/gi,
    ''
  );
  str = str.replace(/\s*\(GHN\)/gi, '');
  str = str.replace(/\s*\(COD\)/gi, '');
  return str;
};

/**
 * Phân loại tin nhắn thông báo đơn hàng để hiển thị Rich Interactive Card:
 * - 'CONFIRM_SUCCESS': Xác nhận chốt đơn thành công
 * - 'CONFIRM_REQUEST': Phiếu yêu cầu xác nhận đơn hàng gửi khách
 * - 'PACKING_NOTICE': Thông báo kiện hàng đã được đóng gói
 * - 'STANDARD': Tin nhắn trò chuyện văn bản thông thường
 *
 * @param {string} text - Nội dung tin nhắn.
 * @returns {'CONFIRM_SUCCESS' | 'CONFIRM_REQUEST' | 'PACKING_NOTICE' | 'STANDARD'}
 */
export const classifyOrderReceiptMessage = (text) => {
  if (!text || typeof text !== 'string') return 'STANDARD';
  if (text.includes('XÁC NHẬN CHỐT ĐƠN THÀNH CÔNG')) return 'CONFIRM_SUCCESS';
  if (text.includes('THÔNG TIN XÁC NHẬN ĐƠN HÀNG') || text.includes('PHIẾU XÁC NHẬN')) return 'CONFIRM_REQUEST';
  if (text.includes('ĐÃ ĐƯỢC ĐÓNG GÓI XONG')) return 'PACKING_NOTICE';
  return 'STANDARD';
};

/**
 * Trích xuất thông tin trọng yếu từ mẫu tin nhắn xác nhận đơn hàng:
 * Trích xuất mã đơn hàng (ORD-xxxxx), mã vận đơn (GHN-xxxxx), và tổng thu hộ COD.
 *
 * @param {string} text - Nội dung tin nhắn biên nhận.
 * @returns {{ orderCode: string|null, waybillCode: string|null, codAmount: string|null }}
 */
export const parseOrderReceiptDetails = (text) => {
  if (!text) return { orderCode: null, waybillCode: null, codAmount: null };

  const cleaned = cleanChatMessageText(text);

  const orderMatch = cleaned.match(/Mã đơn hàng:\s*([A-Z0-9_-]+)/i);
  const waybillMatch = cleaned.match(/Mã vận đơn:\s*([A-Z0-9_-]+)/i);
  const codMatch = cleaned.match(/(?:TỔNG THU HỘ|Tổng thanh toán|TỔNG TIỀN):\s*([0-9.,]+(?:\s*đ|\s*VND)?)/i);

  return {
    orderCode: orderMatch ? orderMatch[1].trim() : null,
    waybillCode: waybillMatch ? waybillMatch[1].trim() : null,
    codAmount: codMatch ? codMatch[1].trim() : null,
  };
};

/**
 * Định dạng tiền tệ VND chuẩn giao diện Seller AraStore.
 *
 * @param {number|string} n - Số tiền.
 * @returns {string} Ví dụ: "150.000 đ"
 */
export const formatVnd = (n) => `${Number(n || 0).toLocaleString('vi-VN')} đ`;

/**
 * Xác thực payload tin nhắn gửi đi của Seller:
 * Đảm bảo tin nhắn có nội dung văn bản (không toàn khoảng trắng) hoặc có ít nhất 1 tệp đính kèm hợp lệ.
 *
 * @param {{ text?: string, attachments?: Array<{ url: string, type?: string }> }} payload
 * @returns {{ isValid: boolean, error?: string }}
 */
export const validateOutgoingMessage = (payload = {}) => {
  const text = (payload.text || '').trim();
  const attachments = Array.isArray(payload.attachments) ? payload.attachments : [];

  if (!text && attachments.length === 0) {
    return { isValid: false, error: 'Tin nhắn không được để trống khi không có tệp đính kèm.' };
  }

  if (text.length > 2000) {
    return { isValid: false, error: 'Nội dung tin nhắn không được vượt quá 2000 ký tự.' };
  }

  for (const att of attachments) {
    if (!att.url || typeof att.url !== 'string') {
      return { isValid: false, error: 'Tệp đính kèm không hợp lệ: thiếu đường dẫn URL.' };
    }
  }

  return { isValid: true };
};

/**
 * Lọc và tìm kiếm danh sách cuộc hội thoại của Seller trên client.
 *
 * @param {Array<Object>} conversations - Danh sách cuộc hội thoại.
 * @param {{ search?: string, tag?: string, status?: string }} filters
 * @returns {Array<Object>}
 */
export const filterConversations = (conversations = [], filters = {}) => {
  if (!Array.isArray(conversations)) return [];
  const { search = '', tag = '', status = '' } = filters;

  const searchKeyword = search.trim().toLowerCase();

  return conversations.filter((conv) => {
    // 1. Lọc theo tag
    if (tag && (!Array.isArray(conv.tags) || !conv.tags.includes(tag))) {
      return false;
    }

    // 2. Lọc theo trạng thái
    if (status && conv.status !== status) {
      return false;
    }

    // 3. Tìm kiếm theo tên khách, SĐT, hoặc nội dung tin nhắn cuối
    if (searchKeyword) {
      const customerName = (conv.customerId?.fullName || conv.customerName || '').toLowerCase();
      const customerPhone = (conv.customerId?.phone || conv.customerPhone || '').toLowerCase();
      const lastMessage = (conv.lastMessageText || conv.lastMessage?.text || '').toLowerCase();

      const matched =
        customerName.includes(searchKeyword) ||
        customerPhone.includes(searchKeyword) ||
        lastMessage.includes(searchKeyword);

      if (!matched) return false;
    }

    return true;
  });
};

