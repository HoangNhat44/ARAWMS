/**
 * ============================================================================
 * @title        : Notification Template Service
 * @author       : Nguyễn Quang Huy
 * @createdDate  : 2026-10-29
 * @lastModified : 2026-11-14
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
import { getGhnStatusLabel } from '../../ghn/ghn.service.js';

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
      const sizeStr = it.size ? ` - Size: ${it.size}` : '';
      const colorStr = it.color ? ` - Màu: ${it.color}` : '';
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
    `TỔNG THU HỘ: ${formatMoney(financial.expectedCodAmount || financial.totalOrderAmount)}\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `👉 Quý khách vui lòng kiểm tra thông tin trên. Nếu đã chính xác, hãy phản hồi "OK" hoặc "XÁC NHẬN" tại đây để AraStore tiến hành đóng gói và giao ngay cho bạn nhé! ❤️`
  );
};

/**
 * Tạo mẫu tin nhắn thông báo đã chốt đơn thành công
 * @param {Object} order - Bản ghi SalesOrder
 * @param {string} [waybillCode] - Mã vận đơn GHN nếu đã tạo
 * @returns {string}
 */
export const buildOrderConfirmedSuccessText = (order, waybillCode) => {
  const code = waybillCode || order?.warehouseFulfillment?.waybillCode || '';
  const cod = formatMoney(order?.financialSummary?.expectedCodAmount || order?.financialSummary?.totalOrderAmount || 0);
  return (
    `🎉 XÁC NHẬN CHỐT ĐƠN THÀNH CÔNG!\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `Mã đơn hàng: #${order.orderCode}\n` +
    (code ? `Mã vận đơn GHN: ${code}\n` : '') +
    `Tổng thu hộ: ${cod}\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `AraStore đã xác nhận chốt đơn #${order.orderCode} và giữ hàng trong kho cho quý khách.\n` +
    `Đơn hàng đã được chuyển sang bộ phận kho để chuẩn bị và đóng gói cẩn thận. Cảm ơn quý khách đã tin chọn AraStore! 🌸`
  );
};

/**
 * Tạo mẫu tin nhắn hỏi xác nhận lại khách hàng trước khi hủy đơn
 * @param {Object} order - Bản ghi SalesOrder
 * @param {string} [reason] - Lý do dự kiến hủy
 * @returns {string}
 */
export const buildOrderCancelInquiryText = (order, reason = '') => {
  const cod = formatMoney(order?.financialSummary?.expectedCodAmount || order?.financialSummary?.totalOrderAmount || 0);
  return (
    `❓ XÁC NHẬN TRƯỚC KHI HỦY ĐƠN HÀNG\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `Mã đơn hàng: #${order.orderCode}\n` +
    `Tổng tiền: ${cod}\n` +
    (reason ? `Lý do dự kiến: ${reason}\n` : '') +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `Quý khách có chắc chắn muốn HỦY đơn hàng #${order.orderCode} không ạ? Vui lòng phản hồi xác nhận hoặc chọn nút bên dưới để AraStore hỗ trợ ngay nhé!`
  );
};

/**
 * Tạo mẫu tin nhắn thông báo đơn hàng đã được hủy
 * @param {Object} order - Bản ghi SalesOrder
 * @param {string} [cancelReason] - Lý do hủy đơn
 * @returns {string}
 */
export const buildOrderCancelledText = (order, cancelReason = '') => {
  const code = order?.warehouseFulfillment?.waybillCode || '';
  const cod = formatMoney(order?.financialSummary?.expectedCodAmount || order?.financialSummary?.totalOrderAmount || 0);
  return (
    `❌ THÔNG BÁO HỦY ĐƠN HÀNG #${order.orderCode}\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `Mã đơn hàng: #${order.orderCode}\n` +
    (code ? `Mã vận đơn GHN: ${code}\n` : '') +
    `Tổng tiền: ${cod}\n` +
    `Trạng thái: Đã hủy\n` +
    (cancelReason ? `Lý do: ${cancelReason}\n` : '') +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `Đơn hàng #${order.orderCode} của quý khách đã được hủy thành công. Nếu cần đặt lại hoặc đổi sản phẩm khác, quý khách cứ nhắn cho AraStore nhé!`
  );
};

/**
 * Tạo mẫu tin nhắn thông báo đóng gói xong kèm mã vận đơn
 * @param {Object} order - Bản ghi SalesOrder
 * @param {string} [waybillCode] - Mã vận đơn
 * @returns {string}
 */
export const buildPackingCompletedText = (order, waybillCode) => {
  const code = waybillCode || order?.warehouseFulfillment?.waybillCode || 'Đang cập nhật';
  const cod = formatMoney(order?.financialSummary?.expectedCodAmount || order?.financialSummary?.totalOrderAmount || 0);
  return (
    `📦 ĐƠN HÀNG #${order.orderCode} ĐÃ ĐƯỢC ĐÓNG GÓI XONG!\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `Mã đơn hàng: #${order.orderCode}\n` +
    `Mã vận đơn GHN: ${code}\n` +
    `Tổng thu hộ: ${cod}\n` +
    `Đơn vị vận chuyển: Giao Hàng Nhanh\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `Kiện hàng của bạn đã được đóng gói cẩn thận và đang chờ bàn giao cho bưu tá. Thời gian giao hàng dự kiến từ 2-3 ngày làm việc.\n` +
    `Quý khách vui lòng chú ý điện thoại để bưu tá liên hệ giao hàng nhé!`
  );
};

/**
 * Tạo mẫu tin nhắn tự động gửi cho khách hàng theo từng trạng thái Realtime của Giao Hàng Nhanh (GHN)
 * @param {Object} order - Bản ghi SalesOrder
 * @param {string} ghnStatus - Trạng thái từ GHN (ready_to_pick, picking, storing, delivering, delivered, cancel, return, returned...)
 * @param {string} [waybillCode] - Mã vận đơn GHN
 * @returns {string}
 */
export const buildGhnStatusUpdateText = (order, ghnStatus, waybillCode) => {
  const code = waybillCode || order?.warehouseFulfillment?.waybillCode || 'Đang cập nhật';
  const normalized = String(ghnStatus || '').toLowerCase().trim();
  const cod = formatMoney(order?.financialSummary?.expectedCodAmount || order?.financialSummary?.totalOrderAmount || 0);

  switch (normalized) {
    case 'ready_to_pick':
      return (
        `🚚 ĐÃ TẠO VẬN ĐƠN GIAO HÀNG NHANH\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `Mã đơn hàng: #${order.orderCode}\n` +
        `Mã vận đơn GHN: ${code}\n` +
        `Trạng thái: Chờ lấy hàng\n` +
        `Tổng thu hộ: ${cod}\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `Đơn hàng của quý khách đã được đẩy lên hệ thống GHN và cấp mã vận đơn tự động. AraStore đang chuẩn bị bàn giao kiện hàng cho bưu tá!`
      );

    case 'picking':
    case 'money_collect_picking':
      return (
        `📦 BƯU TÁ GHN ĐANG ĐẾN KHO LẤY HÀNG\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `Mã đơn hàng: #${order.orderCode}\n` +
        `Mã vận đơn GHN: ${code}\n` +
        `Trạng thái: Đang lấy hàng\n` +
        `Bưu tá Giao Hàng Nhanh đang tiếp nhận kiện hàng của bạn tại kho AraStore.`
      );

    case 'picked':
      return (
        `📦 BƯU TÁ GHN ĐÃ LẤY HÀNG\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `Mã đơn hàng: #${order.orderCode}\n` +
        `Mã vận đơn GHN: ${code}\n` +
        `Trạng thái: Đã lấy hàng\n` +
        `Kiện hàng đã được bàn giao cho GHN và sẽ sớm được chuyển đến quý khách.`
      );

    case 'storing':
    case 'transporting':
    case 'sorting':
    case 'delivering':
    case 'money_collect_delivering':
      return (
        `🛵 ĐƠN HÀNG ĐANG ĐƯỢC GIAO ĐẾN BẠN\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `Mã đơn hàng: #${order.orderCode}\n` +
        `Mã vận đơn GHN: ${code}\n` +
        `Trạng thái: Đang giao hàng\n` +
        `Số tiền cần thanh toán: ${cod}\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `📞 Quý khách vui lòng chú ý điện thoại để nhận cuộc gọi từ bưu tá GHN nhé!`
      );

    case 'delivered':
      return (
        `✅ ĐƠN HÀNG #${order.orderCode} ĐÃ GIAO THÀNH CÔNG!\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `Mã vận đơn GHN: ${code}\n` +
        `Trạng thái: Đã giao thành công\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `Cảm ơn quý khách đã tin tưởng và mua sắm tại AraStore! Nếu cần hỗ trợ đổi size hoặc phản hồi về sản phẩm, quý khách cứ nhắn tin tại đây nhé ❤️`
      );

    case 'delivery_fail':
      return (
        `⚠️ GIAO HÀNG CHƯA THÀNH CÔNG - ĐƠN #${order.orderCode}\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `Mã vận đơn GHN: ${code}\n` +
        `Trạng thái: Giao hàng thất bại\n` +
        `Bưu tá GHN chưa liên hệ được với quý khách. Quý khách vui lòng kiểm tra điện thoại hoặc phản hồi lại để AraStore hỗ trợ hẹn lịch giao lại nhé!`
      );

    case 'waiting_to_return':
    case 'return':
    case 'return_transporting':
    case 'return_sorting':
    case 'returning':
    case 'returned':
      return (
        `↩️ THÔNG BÁO CHUYỂN HOÀN ĐƠN HÀNG #${order.orderCode}\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `Mã vận đơn GHN: ${code}\n` +
        `Trạng thái: ${normalized === 'returned' ? 'Đã hoàn về kho' : 'Đang hoàn hàng'}\n` +
        `Nếu quý khách cần hỗ trợ gửi lại đơn hàng, vui lòng nhắn tin cho AraStore nhé!`
      );

    case 'cancel':
      return (
        `❌ THÔNG BÁO HỦY ĐƠN HÀNG #${order.orderCode}\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `Mã vận đơn GHN: ${code}\n` +
        `Trạng thái: Đã hủy\n` +
        `Đơn hàng của quý khách đã được hủy trên hệ thống vận chuyển. Hẹn gặp lại quý khách ở đơn hàng tiếp theo!`
      );

    default:
      return (
        `🔔 CẬP NHẬT TRẠNG THÁI VẬN ĐƠN #${order.orderCode}\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `Mã vận đơn GHN: ${code}\n` +
        `Trạng thái mới nhất: ${getGhnStatusLabel(normalized)}\n` +
        `AraStore sẽ tiếp tục cập nhật hành trình đơn hàng tới quý khách!`
      );
  }
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
    const cleanMessageText = String(messageText || '')
      .replace(/\s*\((ready_to_pick|picking|money_collect_picking|picked|storing|transporting|sorting|delivering|money_collect_delivering|delivered|delivery_fail|waiting_to_return|return|returned|cancel|exception|GHN|COD|TMĐT)\)/gi, '')
      .replace(/\s*\(GHN\)/gi, '')
      .replace(/\s*\(COD\)/gi, '');

    let convId = conversationId || order.conversationId;

    // Nếu đơn hàng chưa lưu conversationId, thử tìm cuộc hội thoại gần nhất của khách
    if (!convId && order.customerId) {
      const activeConv = await ChatConversation.findOne({ customerId: order.customerId })
        .sort({ updatedAt: -1 });
      if (activeConv) convId = activeConv._id;
    }

    if (!convId) {
      // Đơn hàng không có kênh Chat Facebook (đơn từ Shopee, TikTok, Excel, POS...) -> bỏ qua tự nhiên, không cần cảnh báo
      return null;
    }

    const conversation = await ChatConversation.findById(convId).populate('customerId');
    if (!conversation) return null;

    // [DEDUPLICATION / CHỐNG LẶP TIN NHẮN TỰ ĐỘNG]
    // Nếu trong vòng 45 giây gần nhất, hội thoại này đã có 1 tin nhắn tự động giống hệt nội dung
    const recentDuplicate = await ChatMessage.findOne({
      conversationId: convId,
      messageText: cleanMessageText,
      sentAt: { $gte: new Date(Date.now() - 45000) },
    });
    if (recentDuplicate) {
      console.log(`🛡️ [Deduplication] Bỏ qua gửi tin tự động trùng lặp cho đơn ${order?.orderCode}: "${cleanMessageText.slice(0, 50)}..."`);
      return recentDuplicate;
    }

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
            text: cleanMessageText,
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
            ...(notificationType === 'CANCEL_INQUIRY' && {
              quick_replies: [
                {
                  content_type: 'text',
                  title: '❌ Xác nhận hủy đơn',
                  payload: `CANCEL_ORDER_${order._id}`,
                },
                {
                  content_type: 'text',
                  title: '✅ Giữ lại đơn hàng',
                  payload: `KEEP_ORDER_${order._id}`,
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
              text: cleanMessageText,
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
      messageText: cleanMessageText,
      deliveryStatus,
      deliveryError,
      sentAt: new Date(),
    });

    conversation.lastMessagePreview = cleanMessageText.slice(0, 100) + '...';
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
  buildOrderCancelInquiryText,
  buildOrderCancelledText,
  buildPackingCompletedText,
  buildGhnStatusUpdateText,
  sendOrderNotificationToChat,
};
