/**
 * ============================================================================
 * @title        : Chat Routing Service
 * @author       : Nguyễn Quang Huy
 * @createdDate  : 2026-10-27
 * @lastModified : 2026-10-27
 * @description  : Thuật toán tự động phân bổ phiên chat từ khách hàng mới tới Seller
 *                 đang trực tuyến và có tải công việc thấp nhất (UC-69, Chat Routing).
 * @module       : Conversational Commerce / Chat Routing
 * @layer        : Service
 * ============================================================================
 */

import axios from 'axios';
import Customer from '../../../models/Customer.model.js';
import ChatConversation from '../../../models/ChatConversation.model.js';
import ChatMessage from '../../../models/ChatMessage.model.js';
import User from '../../../models/User.model.js';
import CounterSequence from '../../../models/CounterSequence.model.js';
import { ENV } from '../../../config/env.js';

/**
 * Lấy thông tin họ tên công khai từ Facebook Graph API theo PSID
 */
const fetchFacebookProfile = async (psid) => {
  try {
    const token = ENV.FB.PAGE_ACCESS_TOKEN;
    if (!token) return null;

    const response = await axios.get(`https://graph.facebook.com/v19.0/${psid}`, {
      params: {
        fields: 'first_name,last_name,profile_pic',
        access_token: token,
      },
      timeout: 5000,
    });

    if (response.data) {
      const { first_name, last_name } = response.data;
      const fullName = [last_name, first_name].filter(Boolean).join(' ').trim();
      return fullName || null;
    }
  } catch (error) {
    console.warn(`[Facebook API] Không thể lấy profile cho PSID ${psid}:`, error.response?.data?.error?.message || error.message);
  }
  return null;
};

/**
 * Thuật toán phân bổ Seller thông minh (Least-Busy Routing)
 * 1. Ưu tiên Seller đang Online (isOnlineForChat = true) và có ít chat nhất (activeChatCount thấp nhất)
 * 2. Nếu không có ai online, chọn Seller đang ACTIVE bất kỳ có activeChatCount thấp nhất
 */
export const findBestAvailableSeller = async () => {
  // 1. Tìm Seller đang trực online
  let candidates = await User.find({
    roleCode: 'SELLER',
    status: 'ACTIVE',
    isOnlineForChat: true,
  })
    .sort({ activeChatCount: 1, updatedAt: 1 })
    .limit(1);

  // 2. Nếu không có Seller nào online, phân bổ cho Seller active bất kỳ
  if (!candidates || candidates.length === 0) {
    candidates = await User.find({
      roleCode: 'SELLER',
      status: 'ACTIVE',
    })
      .sort({ activeChatCount: 1, updatedAt: 1 })
      .limit(1);
  }

  return candidates.length > 0 ? candidates[0] : null;
};

/**
 * Xử lý sự kiện tin nhắn đến từ Facebook Webhook (UC-69)
 */
export const processInboundWebhookMessage = async (messagingEvent) => {
  const senderPsid = messagingEvent.sender?.id;
  const recipientPageId = messagingEvent.recipient?.id;
  const messageData = messagingEvent.message;

  if (!senderPsid || !messageData) {
    return null;
  }

  // Bỏ qua tin nhắn dạng echo do chính page gửi đi
  if (messageData.is_echo) {
    return null;
  }

  const messageText = messageData.text || '';
  const attachments = (messageData.attachments || []).map((att) => ({
    type: att.type,
    url: att.payload?.url || '',
  }));
  const fbMessageId = messageData.mid;
  const sentAt = messagingEvent.timestamp ? new Date(messagingEvent.timestamp) : new Date();

  // 1. Tìm hoặc tạo Customer theo facebookPsid
  let customer = await Customer.findOne({ facebookPsid: senderPsid });
  if (!customer) {
    const fbName = await fetchFacebookProfile(senderPsid);
    const customerCode = await CounterSequence.getNextSequence('CUSTOMER_CODE', 'CUST', 5);

    customer = await Customer.create({
      customerCode,
      facebookPsid: senderPsid,
      fullName: fbName || `Khách Facebook ${senderPsid.slice(-4)}`,
      tags: ['Khách mới Facebook'],
    });
    console.log(`✨ [UC-69] Đã tạo hồ sơ khách hàng mới: ${customer.customerCode} (${customer.fullName})`);
  }

  // 2. Tìm hoặc tạo ChatConversation
  const fbConversationId = `fb_conv_${senderPsid}`;
  let conversation = await ChatConversation.findOne({
    $or: [{ fbConversationId }, { customerId: customer._id, status: { $ne: 'RESOLVED' } }],
  });

  let assignedSeller = null;

  if (conversation && conversation.assignedSellerId) {
    assignedSeller = await User.findById(conversation.assignedSellerId);
  }

  // Nếu cuộc hội thoại chưa có Seller hoặc tạo mới: Kích hoạt thuật toán phân bổ (UC-69)
  if (!assignedSeller) {
    assignedSeller = await findBestAvailableSeller();
    if (assignedSeller) {
      await User.findByIdAndUpdate(assignedSeller._id, { $inc: { activeChatCount: 1 } });
      console.log(`🎯 [UC-69] Tự động phân bổ khách ${customer.fullName} cho Seller: ${assignedSeller.fullName} (${assignedSeller.employeeCode})`);
    }
  }

  const preview = messageText || (attachments.length > 0 ? `[${attachments[0].type}]` : 'Tin nhắn mới');

  if (!conversation) {
    conversation = await ChatConversation.create({
      fbConversationId,
      customerId: customer._id,
      assignedSellerId: assignedSeller ? assignedSeller._id : null,
      status: 'ACTIVE',
      lastMessagePreview: preview,
      lastMessageAt: sentAt,
      unreadCount: 1,
      tags: ['Facebook'],
    });
  } else {
    conversation.lastMessagePreview = preview;
    conversation.lastMessageAt = sentAt;
    conversation.unreadCount = (conversation.unreadCount || 0) + 1;
    if (assignedSeller && !conversation.assignedSellerId) {
      conversation.assignedSellerId = assignedSeller._id;
    }
    conversation.status = 'ACTIVE';
    await conversation.save();
  }

  // 3. Lưu bản ghi ChatMessage
  const chatMessage = await ChatMessage.create({
    conversationId: conversation._id,
    fbMessageId,
    senderType: 'CUSTOMER',
    messageText,
    attachments,
    sentAt,
  });

  return {
    customer,
    conversation,
    message: chatMessage,
    assignedSeller,
  };
};

export default {
  processInboundWebhookMessage,
  findBestAvailableSeller,
};
