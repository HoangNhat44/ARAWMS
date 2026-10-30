/**
 * ============================================================================
 * @title        : Notification Template Service
 * @author       : Nguyễn Quang Huy
 * @createdDate  : 2026-10-29
 * @lastModified : 2026-10-29
 * @description  : Định dạng và phát các tin nhắn thông báo tự động (Receipt confirmation,
 *                 Post-purchase Waybill notifications) cho khách hàng qua Facebook Messenger
 *                 Send API (sử dụng MESSAGE_TAG: POST_PURCHASE_UPDATE tuân thủ chính sách 24h)
 *                 kết hợp Socket.io realtime cho Seller UI.
 * @module       : Conversational Commerce / Chat Interface
 * @layer        : Service
 * ============================================================================
 */

import axios from 'axios';
import ChatConversation from '../../../models/ChatConversation.model.js';
import ChatMessage from '../../../models/ChatMessage.model.js';
import Customer from '../../../models/Customer.model.js';
import { ENV } from '../../../config/env.js';
import { emitNewMessage, emitConversationUpdated } from '../../../config/socket.js';

/**
 * Định dạng tiền tệ VND
 */
const formatMoney = (n) => `${Number(n || 0).toLocaleString('vi-VN')} đ`;

/**
 * Tạo mẫu tin nhắn văn bản tóm tắt đơn hàng yêu cầu khách hàng xác nhận
 * @param {Object} order - Bản ghi SalesOrder
 * @returns {string}
 */
export const buildOrderConfirmationText = (order) => {
  const recipient = order.shippingRecipient || {};
  const financial = order.financialSummary || {};
  const items = order.items || [];

  const itemsListStr = items
    .map((it, idx) => {
      const name = it.productName || it.skuCode;
      const sizeStr = it.size ? ` (Size: ${it.size})` : '';
      const colorStr = it.color ? ` (Màu: ${it.color})` : '';
      return `${idx + 1}. ${name}${colorStr}${sizeStr}\n   SL: ${it.orderedQty} × ${formatMoney(it.unitSalePrice)} = ${formatMoney(it.orderedQty * it.unitSalePrice)}`;
    })
    .join('\n');

  return (
    `📋 THÔNG TIN XÁC NHẬN ĐƠN HÀNG - ARASTORE\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `Mã đơn hàng: #${order.orderCode}\n` +
    `Người nhận: ${recipient.name || 'Quý khách'}\n` +
    `Số điện thoại: ${recipient.phone || 'Chưa cung cấp'}\n` +
    `Địa chỉ: ${recipient.address || 'Giao tại quầy'}\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `SẢN PHẨM ĐÃ CHỌN:\n` +
    `${itemsListStr}\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `Tạm tính: ${formatMoney(financial.itemsSubtotal)}\n` +
    `Phí vận chuyển: ${formatMoney(financial.shippingFee)}\n` +
    (financial.discountAmount > 0 ? `Giảm giá: -${formatMoney(financial.discountAmount)}\n` : '') +
    `TỔNG THU HỘ (COD): ${formatMoney(financial.expectedCodAmount || financial.totalOrderAmount)}\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `👉 Quý khách vui lòng kiểm tra thông tin trên. Nếu đã chính xác, hãy phản hồi "OK" hoặc "XÁC NHẬN" tại đây để AraStore tiến hành đóng gói và giao ngay cho bạn nhé! ❤️`
  );
};

/**
 * Tạo mẫu tin nhắn thông báo đã chốt đơn thành công
 * @param {Object} order - Bản ghi SalesOrder
 * @returns {string}
 */
export const buildOrderConfirmedSuccessText = (order) => {
  return (
    `🎉 XÁC NHẬN CHỐT ĐƠN THÀNH CÔNG!\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `AraStore đã nhận được xác nhận chốt đơn #${order.orderCode} từ quý khách.\n` +
    `Đơn hàng đã được chuyển sang bộ phận kho để chuẩn bị và đóng gói cẩn thận.\n` +
    `Chúng tôi sẽ gửi thông báo kèm mã vận đơn ngay khi kiện hàng được bàn giao cho đơn vị vận chuyển. Cảm ơn quý khách đã tin chọn AraStore! 🌸`
  );
};

/**
 * Tạo mẫu tin nhắn thông báo đóng gói xong kèm mã vận đơn
 * @param {Object} order - Bản ghi SalesOrder
 * @param {string} waybillCode - Mã vận đơn
 * @returns {string}
 */
export const buildPackingCompletedText = (order, waybillCode) => {
  return (
    `📦 ĐƠN HÀNG #${order.orderCode} ĐÃ ĐƯỢC ĐÓNG GÓI XONG!\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `Mã vận đơn: ${waybillCode}\n` +
    `Đơn vị vận chuyển: Giao Hàng Nhanh (GHN)\n` +
    `Kiện hàng của bạn đang được bàn giao cho bưu tá. Thời gian giao hàng dự kiến từ 2-3 ngày làm việc.\n` +
    `Quý khách vui lòng chú ý điện thoại để bưu tá liên hệ giao hàng nhé!`
  );
};

/**
 * Gửi tin nhắn thông báo tự động vào hội thoại chat (Meta Graph API + DB + Socket)
 *
 * @param {Object} params
 * @param {Object} params.order - Bản ghi SalesOrder
 * @param {string} [params.conversationId] - ID hội thoại
 * @param {string} params.messageText - Nội dung tin nhắn
 * @param {string} [params.notificationType] - CONFIRM_REQUEST | CONFIRMED_SUCCESS | PACKED_WAYBILL
 * @param {string} [params.senderSellerId] - Seller phụ trách nếu có
 * @returns {Promise<Object>} Bản ghi ChatMessage đã tạo
 */
export const sendOrderNotificationToChat = async ({
  order,
  conversationId,
  messageText,
  notificationType = 'SYSTEM_NOTIFICATION',
  senderSellerId = null,
}) => {
  try {
    let convId = conversationId || order.conversationId;

    // Nếu đơn hàng chưa lưu conversationId, thử tìm cuộc hội thoại gần nhất của khách
    if (!convId && order.customerId) {
      const activeConv = await ChatConversation.findOne({ customerId: order.customerId })
        .sort({ updatedAt: -1 });
      if (activeConv) convId = activeConv._id;
    }

    if (!convId) {
      console.warn(`⚠️ Không tìm thấy conversationId cho đơn hàng #${order.orderCode}, bỏ qua gửi tin chat.`);
      return null;
    }

    const conversation = await ChatConversation.findById(convId).populate('customerId');
    if (!conversation) return null;

    const customer = conversation.customerId;
    let fbMessageId = null;
    let deliveryStatus = 'DELIVERED';
    let deliveryError = null;

    // Gửi qua Facebook Messenger Send API
    const pageToken = ENV.FB.getPageToken(conversation.pageId);
    if (customer && customer.facebookPsid && pageToken) {
      try {
        console.log(`📡 [Meta Messenger Send] Gửi tin tự động tới PSID: ${customer.facebookPsid}, Type: ${notificationType}`);

        // 1. Thử gửi chuẩn (Standard Messaging) - Hoạt động tốt nhất trong khung 24h & hỗ trợ quick_replies
        const standardPayload = {
          recipient: { id: customer.facebookPsid },
          message: {
            text: messageText,
            ...(notificationType === 'CONFIRM_REQUEST' && {
              quick_replies: [
                {
                  content_type: 'text',
                  title: '👍 OK Chốt đơn',
                  payload: `CONFIRM_ORDER_${order._id}`,
                },
                {
                  content_type: 'text',
                  title: '✏️ Cần sửa thông tin',
                  payload: `EDIT_ORDER_${order._id}`,
                },
              ],
            }),
          },
        };

        const fbRes = await axios.post(
          'https://graph.facebook.com/v19.0/me/messages',
          standardPayload,
          {
            params: { access_token: pageToken },
            timeout: 10000,
          }
        );

        if (fbRes.data?.message_id) {
          fbMessageId = fbRes.data.message_id;
          deliveryStatus = 'DELIVERED';
          deliveryError = null;
          console.log(`✅ [Meta Messenger Success] Gửi tin tự động thành công (Standard), msgId: ${fbMessageId}`);
        }
      } catch (fbErr) {
        const errData = fbErr.response?.data?.error || {};
        console.warn('⚠️ [Meta Messenger Standard Send Failed]:', errData.message || fbErr.message);

        if (errData.code === 10 || errData.error_subcode === 2018278) {
          deliveryStatus = 'FAILED_24H_EXPIRED';
          deliveryError = 'Tin nhắn gửi ngoài khoảng thời gian cho phép 24h của Meta.';
        } else {
          deliveryStatus = 'FAILED_META_ERROR';
          deliveryError = errData.message || fbErr.message;
        }

        // 2. Fallback nếu ngoài khung 24h: Thử lại với MESSAGE_TAG (chú ý: Meta cấm quick_replies khi dùng tag)
        try {
          const tagPayload = {
            recipient: { id: customer.facebookPsid },
            messaging_type: 'MESSAGE_TAG',
            tag: 'POST_PURCHASE_UPDATE',
            message: {
              text: messageText,
            },
          };

          const fbTagRes = await axios.post(
            'https://graph.facebook.com/v19.0/me/messages',
            tagPayload,
            {
              params: { access_token: pageToken },
              timeout: 10000,
            }
          );

          if (fbTagRes.data?.message_id) {
            fbMessageId = fbTagRes.data.message_id;
            deliveryStatus = 'DELIVERED';
            deliveryError = null;
            console.log(`✅ [Meta Messenger Success] Gửi tin tự động thành công (Fallback Tag), msgId: ${fbMessageId}`);
          }
        } catch (tagErr) {
          console.error('❌ [Meta Messenger Fallback Tag Failed]:', tagErr.response?.data?.error || tagErr.message);
        }
      }
    } else {
      deliveryStatus = 'NOT_CONNECTED';
      deliveryError = 'Khách hàng chưa liên kết Facebook PSID hoặc Page chưa có Access Token.';
    }

    // Tạo bản ghi ChatMessage trong cơ sở dữ liệu
    const newMsg = await ChatMessage.create({
      conversationId: conversation._id,
      fbMessageId: fbMessageId || `auto_notify_${Date.now()}`,
      senderType: 'SELLER',
      senderSellerId: senderSellerId || order.sellerId || null,
      messageText,
      deliveryStatus,
      deliveryError,
      sentAt: new Date(),
    });

    conversation.lastMessagePreview = messageText.slice(0, 100) + '...';
    conversation.lastMessageAt = new Date();
    await conversation.save();

    // Phát socket realtime cho Seller UI
    try {
      emitNewMessage(conversation._id, newMsg);
      const populated = await ChatConversation.findById(conversation._id).populate('customerId').lean();
      emitConversationUpdated(populated || conversation);
    } catch (sockErr) {
      console.warn('⚠️ Lỗi socket notification:', sockErr.message);
    }

    return newMsg;
  } catch (err) {
    console.error('❌ Lỗi sendOrderNotificationToChat:', err.message);
    return null;
  }
};

export default {
  buildOrderConfirmationText,
  buildOrderConfirmedSuccessText,
  buildPackingCompletedText,
  sendOrderNotificationToChat,
};
