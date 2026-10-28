/**
 * ============================================================================
 * @title        : Chat Interface Service
 * @author       : Nguyễn Quang Huy
 * @createdDate  : 2026-10-27
 * @lastModified : 2026-10-27
 * @description  : Xử lý logic nghiệp vụ cho khung chat Messenger của Seller:
 *                 truy vấn hội thoại (UC-72), gắn/gỡ thẻ tag khách hàng (UC-73),
 *                 gửi tin nhắn qua Meta Graph API (UC-74), và ghi log kiểm toán (GBR-23).
 * @module       : Conversational Commerce / Chat Interface
 * @layer        : Service
 * ============================================================================
 */

import fs from 'fs';
import axios from 'axios';
import ChatConversation from '../../../models/ChatConversation.model.js';
import ChatMessage from '../../../models/ChatMessage.model.js';
import Customer from '../../../models/Customer.model.js';
import SystemLog from '../../../models/SystemLog.model.js';
import { ENV } from '../../../config/env.js';
import { resolveAttachmentType } from '../../../common/middlewares/chatUpload.js';

/**
 * Ghi SystemLog kiểm toán
 * @businessRule GBR-23 Ghi log kiểm toán cho dữ liệu quan trọng
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

  // Xử lý tìm kiếm tối ưu ở tầng cơ sở dữ liệu (Database-level Search)
  if (search && search.trim()) {
    const s = search.trim();
    const safeRegex = new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const matchedCustomers = await Customer.find({
      $or: [
        { fullName: safeRegex },
        { phone: safeRegex },
        { customerCode: safeRegex },
      ],
    }).select('_id').lean();
    const customerIds = matchedCustomers.map((c) => c._id);

    query.$or = [
      { customerId: { $in: customerIds } },
      { lastMessagePreview: safeRegex },
    ];
  }

  const skip = (Math.max(1, Number(page)) - 1) * Number(limit);

  // Chạy song song query dữ liệu và countDocuments để giảm 50% thời gian chờ
  const [conversationList, total] = await Promise.all([
    ChatConversation.find(query)
      .populate('customerId', 'customerCode fullName phone email tags addresses totalOrders totalSpent facebookPsid')
      .populate('assignedSellerId', 'employeeCode fullName email')
      .sort({ lastMessageAt: -1, _id: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    ChatConversation.countDocuments(query),
  ]);

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

  const [messages, total] = await Promise.all([
    ChatMessage.find({ conversationId })
      .populate('senderSellerId', 'employeeCode fullName')
      .populate('referencedSkuId', 'skuCode styleName color size retailPrice onHandQty reservedQty')
      .sort({ sentAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    ChatMessage.countDocuments({ conversationId }),
  ]);

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

  const pageToken = ENV.FB.getPageToken(conversation.pageId);

  if (customer && customer.facebookPsid && pageToken) {
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
          params: { access_token: pageToken },
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

/**
 * Gửi ảnh / tệp đính kèm cho khách hàng qua Messenger Send API và lưu vào DB.
 * Mỗi tệp được tải trực tiếp lên Meta bằng multipart `filedata` nên không yêu cầu
 * máy chủ có URL công khai (hoạt động cả khi chạy localhost).
 *
 * @async
 * @function sendCustomerAttachments
 * @param {string} conversationId - ID cuộc hội thoại.
 * @param {Array<Object>} files - Danh sách tệp từ Multer (req.files).
 * @param {string} [messageText] - Chú thích văn bản gửi kèm (tuỳ chọn).
 * @param {Object} user - Seller thực hiện (req.user).
 * @param {Object} [req] - Express Request để ghi log.
 * @returns {Promise<Object>} Document ChatMessage vừa tạo.
 * @throws {Error} Nếu hội thoại không tồn tại, không có tệp, hoặc Seller không được phân công.
 * @businessRule GBR-23 Ghi SystemLog cho thao tác gửi tệp đến khách hàng.
 */
export const sendCustomerAttachments = async (conversationId, files = [], messageText, user, req) => {
  if (!files.length) throw new Error('Vui lòng chọn ít nhất một tệp để gửi');

  const conversation = await ChatConversation.findById(conversationId).populate('customerId');
  if (!conversation) throw new Error('Cuộc hội thoại không tồn tại');

  // 1. Seller chỉ được gửi trong hội thoại được phân công cho mình
  if (user.roleCode === 'SELLER' && String(conversation.assignedSellerId) !== String(user._id)) {
    throw new Error('Bạn không được phân bổ phụ trách cuộc hội thoại này');
  }

  const customer = conversation.customerId;
  const pageToken = ENV.FB.getPageToken(conversation.pageId);
  const canPushToFacebook = Boolean(customer?.facebookPsid && pageToken);
  const attachments = [];
  let fbMessageId = null;

  // 2. Gửi phần chú thích văn bản trước (Messenger không cho gộp text + attachment)
  if (messageText && canPushToFacebook) {
    try {
      const textRes = await axios.post(
        'https://graph.facebook.com/v19.0/me/messages',
        { recipient: { id: customer.facebookPsid }, message: { text: messageText } },
        { params: { access_token: pageToken }, timeout: 10000 }
      );
      fbMessageId = textRes.data?.message_id || null;
    } catch (fbErr) {
      console.warn('⚠️ [Facebook Send API - text]:', fbErr.response?.data?.error?.message || fbErr.message);
    }
  }

  // 3. Lưu metadata từng tệp và đẩy lên Messenger
  for (const file of files) {
    const type = resolveAttachmentType(file.mimetype);
    attachments.push({
      type,
      url: `/uploads/chat/${file.filename}`,
      // Multer giải mã tên gốc theo latin1 -> chuyển về UTF-8 để giữ tiếng Việt
      name: Buffer.from(file.originalname, 'latin1').toString('utf8'),
      mimeType: file.mimetype,
      size: file.size,
    });

    if (!canPushToFacebook) continue;
    try {
      const form = new FormData();
      form.append('recipient', JSON.stringify({ id: customer.facebookPsid }));
      form.append('message', JSON.stringify({ attachment: { type, payload: { is_reusable: true } } }));
      const buffer = await fs.promises.readFile(file.path);
      form.append('filedata', new Blob([buffer], { type: file.mimetype }), file.filename);

      const fbRes = await axios.post('https://graph.facebook.com/v19.0/me/messages', form, {
        params: { access_token: pageToken },
        timeout: 60000,
        maxBodyLength: Infinity,
      });
      fbMessageId = fbMessageId || fbRes.data?.message_id || null;
    } catch (fbErr) {
      console.warn('⚠️ [Facebook Send API - attachment]:', fbErr.response?.data?.error?.message || fbErr.message);
    }
  }

  // 4. Lưu tin nhắn vào DB và cập nhật preview hội thoại
  const newMessage = await ChatMessage.create({
    conversationId: conversation._id,
    fbMessageId: fbMessageId || `mock_msg_${Date.now()}`,
    senderType: 'SELLER',
    senderSellerId: user._id,
    messageText: messageText || undefined,
    attachments,
    sentAt: new Date(),
  });

  conversation.lastMessagePreview = messageText || (attachments[0].type === 'image' ? '[Hình ảnh]' : `[Tệp] ${attachments[0].name}`);
  conversation.lastMessageAt = new Date();
  await conversation.save();

  // 5. [BR: GBR-23] Ghi vết kiểm toán thao tác gửi tệp
  await recordSystemLog({
    actor: user,
    action: 'SEND_CHAT_ATTACHMENT',
    targetCollection: 'ChatMessage',
    targetId: newMessage._id,
    afterSnapshot: { attachments: attachments.map(({ name, type, size }) => ({ name, type, size })) },
    req,
  });

  return newMessage;
};

export default {
  getConversations,
  getConversationById,
  getConversationMessages,
  addConversationTag,
  removeConversationTag,
  sendCustomerMessage,
  sendCustomerAttachments,
};
