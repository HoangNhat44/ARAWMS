import axios from 'axios';
import ChatConversation from '../../../models/ChatConversation.model.js';
import ChatMessage from '../../../models/ChatMessage.model.js';
import SystemLog from '../../../models/SystemLog.model.js';
import { ENV } from '../../../config/env.js';

/**
 * Ghi SystemLog kiểm toán
 */
const recordSystemLog = async ({ actor, majorFeature, subFeature, action, targetCollection, targetId, beforeSnapshot, afterSnapshot, req }) => {
  try {
    await SystemLog.create({
      actorId: actor?._id,
      actorRole: actor?.roleCode || 'SELLER',
      majorFeature: majorFeature || 'Conversational Commerce',
      subFeature: subFeature || 'Chat Interface',
      action,
      targetCollection,
      targetId,
      beforeSnapshot,
      afterSnapshot,
      ipAddress: req?.ip || '127.0.0.1',
      userAgent: req?.headers?.['user-agent'] || 'System',
    });
  } catch (err) {
    console.error('❌ Lỗi ghi SystemLog Chat Interface:', err.message);
  }
};

/**
 * UC-72: Xem danh sách hội thoại tập trung (View Messenger Conversations)
 */
export const getConversations = async (filters, user) => {
  const { status, tag, search, page = 1, limit = 20 } = filters;
  const query = {};

  if (user.roleCode === 'SELLER') {
    if (filters.viewAll !== 'true') {
      query.assignedSellerId = user._id;
    }
  } else if (filters.assignedSellerId) {
    query.assignedSellerId = filters.assignedSellerId;
  }

  if (status) query.status = status;
  if (tag) query.tags = tag;

  const skip = (Math.max(1, Number(page)) - 1) * Number(limit);

  let conversationList = await ChatConversation.find(query)
    .populate('customerId', 'customerCode fullName phone email tags addresses totalOrders totalSpent facebookPsid')
    .populate('assignedSellerId', 'employeeCode fullName email')
    .sort({ lastMessageAt: -1, updatedAt: -1 })
    .skip(skip)
    .limit(Number(limit))
    .lean();

  if (search && search.trim()) {
    const s = search.trim().toLowerCase();
    conversationList = conversationList.filter((conv) => {
      const cust = conv.customerId;
      if (!cust) return false;
      return (
        (cust.fullName && cust.fullName.toLowerCase().includes(s)) ||
        (cust.phone && cust.phone.includes(s)) ||
        (cust.customerCode && cust.customerCode.toLowerCase().includes(s)) ||
        (conv.lastMessagePreview && conv.lastMessagePreview.toLowerCase().includes(s))
      );
    });
  }

  const total = await ChatConversation.countDocuments(query);

  return {
    items: conversationList,
    pagination: {
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / Number(limit)),
    },
  };
};

/**
 * UC-72: Lấy chi tiết một cuộc hội thoại
 */
export const getConversationById = async (conversationId, user) => {
  const conversation = await ChatConversation.findById(conversationId)
    .populate('customerId')
    .populate('assignedSellerId', 'employeeCode fullName email')
    .lean();

  if (!conversation) {
    throw new Error('Cuộc hội thoại không tồn tại');
  }

  if (user.roleCode === 'SELLER' && String(conversation.assignedSellerId?._id) === String(user._id)) {
    await ChatConversation.findByIdAndUpdate(conversationId, { unreadCount: 0 });
    conversation.unreadCount = 0;
  }

  return conversation;
};

/**
 * UC-72: Lấy danh sách tin nhắn của cuộc hội thoại
 */
export const getConversationMessages = async (conversationId, { page = 1, limit = 50 }) => {
  const skip = (Math.max(1, Number(page)) - 1) * Number(limit);

  const messages = await ChatMessage.find({ conversationId })
    .populate('senderSellerId', 'employeeCode fullName')
    .populate('referencedSkuId', 'skuCode styleName color size retailPrice onHandQty reservedQty')
    .sort({ sentAt: -1 })
    .skip(skip)
    .limit(Number(limit))
    .lean();

  const total = await ChatMessage.countDocuments({ conversationId });

  return {
    items: messages.reverse(),
    pagination: {
      total,
      page: Number(page),
      limit: Number(limit),
    },
  };
};

/**
 * UC-73: Gắn thẻ (tags) phân loại nội dung hội thoại (Tag Customer Chat)
 */
export const addConversationTag = async (conversationId, tagsToAdd, user, req) => {
  const tags = Array.isArray(tagsToAdd) ? tagsToAdd : [tagsToAdd];

  const conversation = await ChatConversation.findByIdAndUpdate(
    conversationId,
    { $addToSet: { tags: { $each: tags } } },
    { new: true }
  );

  if (!conversation) throw new Error('Cuộc hội thoại không tồn tại');

  await recordSystemLog({
    actor: user,
    majorFeature: 'Conversational Commerce',
    subFeature: 'Chat Interface',
    action: 'TAG_CONVERSATION',
    targetCollection: 'ChatConversation',
    targetId: conversation._id,
    afterSnapshot: { tags: conversation.tags },
    req,
  });

  return conversation;
};

/**
 * UC-73: Gỡ thẻ hội thoại
 */
export const removeConversationTag = async (conversationId, tagToRemove, user, req) => {
  const conversation = await ChatConversation.findByIdAndUpdate(
    conversationId,
    { $pull: { tags: tagToRemove } },
    { new: true }
  );

  if (!conversation) throw new Error('Cuộc hội thoại không tồn tại');

  await recordSystemLog({
    actor: user,
    majorFeature: 'Conversational Commerce',
    subFeature: 'Chat Interface',
    action: 'UNTAG_CONVERSATION',
    targetCollection: 'ChatConversation',
    targetId: conversation._id,
    afterSnapshot: { tags: conversation.tags },
    req,
  });

  return conversation;
};

/**
 * UC-74: Gửi tin nhắn phản hồi trực tiếp cho khách qua Messenger API & Lưu DB (Message Customer)
 */
export const sendCustomerMessage = async (conversationId, { messageText, attachments = [], referencedSkuId }, user, req) => {
  const conversation = await ChatConversation.findById(conversationId).populate('customerId');
  if (!conversation) {
    throw new Error('Cuộc hội thoại không tồn tại');
  }

  if (user.roleCode === 'SELLER' && String(conversation.assignedSellerId) !== String(user._id)) {
    throw new Error('Bạn không được phân bổ phụ trách cuộc hội thoại này');
  }

  const customer = conversation.customerId;
  let fbMessageId = null;

  if (customer && customer.facebookPsid && ENV.FB.PAGE_ACCESS_TOKEN) {
    try {
      const fbPayload = {
        recipient: { id: customer.facebookPsid },
        message: {},
      };

      if (messageText) fbPayload.message.text = messageText;

      if (attachments && attachments.length > 0) {
        fbPayload.message.attachment = {
          type: attachments[0].type || 'image',
          payload: { url: attachments[0].url, is_reusable: true },
        };
      }

      const fbResponse = await axios.post(
        'https://graph.facebook.com/v19.0/me/messages',
        fbPayload,
        {
          params: { access_token: ENV.FB.PAGE_ACCESS_TOKEN },
          timeout: 10000,
        }
      );

      if (fbResponse.data && fbResponse.data.message_id) {
        fbMessageId = fbResponse.data.message_id;
      }
    } catch (fbErr) {
      console.warn('⚠️ [Facebook Send API Warning]:', fbErr.response?.data?.error?.message || fbErr.message);
    }
  }

  const newMessage = await ChatMessage.create({
    conversationId: conversation._id,
    fbMessageId: fbMessageId || `mock_msg_${Date.now()}`,
    senderType: 'SELLER',
    senderSellerId: user._id,
    messageText,
    attachments,
    referencedSkuId: referencedSkuId || null,
    sentAt: new Date(),
  });

  conversation.lastMessagePreview = messageText || (attachments.length > 0 ? `[${attachments[0].type}]` : 'Tin nhắn');
  conversation.lastMessageAt = new Date();
  await conversation.save();

  return newMessage;
};

export default {
  getConversations,
  getConversationById,
  getConversationMessages,
  addConversationTag,
  removeConversationTag,
  sendCustomerMessage,
};
