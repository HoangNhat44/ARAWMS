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
import SalesOrder from '../../../models/SalesOrder.model.js';
import orderManagementService from '../../order-fulfillment/order-management/orderManagement.service.js';
import { ENV } from '../../../config/env.js';
import { emitNewMessage, emitConversationUpdated } from '../../../config/socket.js';

/**
 * Lấy thông tin họ tên công khai từ Facebook Graph API theo PSID và pageId tương ứng
 */
const fetchFacebookProfile = async (psid, pageId) => {
  try {
    const token = ENV.FB.getPageToken(pageId);
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
    console.warn(`[Facebook API] Không thể lấy profile cho PSID ${psid} (Page: ${pageId}):`, error.response?.data?.error?.message || error.message);
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
 * Xử lý sự kiện tin nhắn đến từ Facebook Webhook (UC-69, Đa Fanpage)
 */
export const processInboundWebhookMessage = async (messagingEvent, entryPageId = null) => {
  const senderPsid = messagingEvent.sender?.id;
  const recipientPageId = entryPageId || messagingEvent.recipient?.id || ENV.FB.PAGE_ID;
  const pageName = ENV.FB.getPageName(recipientPageId);
  const messageData = messagingEvent.message || (messagingEvent.postback ? {
    text: messagingEvent.postback.title || messagingEvent.postback.payload,
    mid: `postback_${Date.now()}`,
    quick_reply: { payload: messagingEvent.postback.payload },
  } : null);

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
    const fbName = await fetchFacebookProfile(senderPsid, recipientPageId);
    const customerCode = await CounterSequence.getNextSequence('CUSTOMER_CODE', 'CUST', 5);

    customer = await Customer.create({
      customerCode,
      facebookPsid: senderPsid,
      fullName: fbName || `Khách ${pageName} ${senderPsid.slice(-4)}`,
      tags: ['Khách mới Facebook', pageName].filter(Boolean),
    });
    console.log(`✨ [UC-69] Đã tạo hồ sơ khách hàng mới: ${customer.customerCode} (${customer.fullName}) [${pageName}]`);
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
      console.log(`🎯 [UC-69] Tự động phân bổ khách ${customer.fullName} [${pageName}] cho Seller: ${assignedSeller.fullName} (${assignedSeller.employeeCode})`);
    }
  }

  const preview = messageText || (attachments.length > 0 ? `[${attachments[0].type}]` : 'Tin nhắn mới');

  if (!conversation) {
    conversation = await ChatConversation.create({
      fbConversationId,
      pageId: recipientPageId,
      pageName,
      customerId: customer._id,
      assignedSellerId: assignedSeller ? assignedSeller._id : null,
      status: 'ACTIVE',
      lastMessagePreview: preview,
      lastMessageAt: sentAt,
      unreadCount: 1,
      tags: ['Facebook', pageName].filter(Boolean),
    });
  } else {
    // Cập nhật pageId, pageName nếu hội thoại chưa có
    if (!conversation.pageId && recipientPageId) {
      conversation.pageId = recipientPageId;
      conversation.pageName = pageName;
    }
    // Gắn tag tên trang vào hội thoại nếu chưa có
    if (pageName && !conversation.tags?.includes(pageName)) {
      conversation.tags = [...(conversation.tags || []), pageName];
    }
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

  // 4. Phát sự kiện realtime qua Socket.io
  try {
    const populatedConv = await ChatConversation.findById(conversation._id).populate('customerId').lean();
    emitNewMessage(conversation._id, chatMessage);
    emitConversationUpdated(populatedConv || conversation);
  } catch (err) {
    console.warn('⚠️ Lỗi phát socket chatRouting:', err.message);
  }

  // 5. [Phase 2: Two-way Order Confirmation] Nhận diện tin nhắn xác nhận chốt đơn từ khách
  try {
    const isConfirmPayload = messagingEvent.postback?.payload?.startsWith('CONFIRM_ORDER_')
      || messageData.quick_reply?.payload?.startsWith('CONFIRM_ORDER_');

    const confirmKeywordsRegex = /\b(ok|oke|oki|okie|chốt|chot|chốt đơn|chot don|xác nhận|xac nhan|confirm|đồng ý|dong y|đúng rồi|dung roi|giao đi|giao di)\b/i;
    const isConfirmKeyword = messageText && confirmKeywordsRegex.test(messageText.trim());

    if (isConfirmPayload || isConfirmKeyword) {
      let targetOrder = null;
      if (isConfirmPayload) {
        const payloadStr = messagingEvent.postback?.payload || messageData.quick_reply?.payload;
        const targetOrderId = payloadStr.replace('CONFIRM_ORDER_', '').trim();
        targetOrder = await SalesOrder.findOne({ _id: targetOrderId, status: 'PENDING' });
      }

      if (!targetOrder) {
        // Tìm đơn hàng PENDING gần nhất của khách hàng này
        targetOrder = await SalesOrder.findOne({ customerId: customer._id, status: 'PENDING' })
          .sort({ createdAt: -1 });
      }

      if (targetOrder) {
        console.log(`🎯 [Two-way Order Confirmation] Khách hàng ${customer.fullName} đã xác nhận chốt đơn #${targetOrder.orderCode}`);
        // Tự động giữ chỗ tồn kho và chuyển trạng thái CONFIRMED_RESERVED
        await orderManagementService.confirmOrderReserve(
          targetOrder._id,
          assignedSeller || { _id: targetOrder.sellerId }
        );
      }
    }
  } catch (confirmErr) {
    console.error('⚠️ [Auto-Confirm Error]:', confirmErr.message);
  }

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
