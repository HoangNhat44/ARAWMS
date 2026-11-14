/**
 * ghn.webhook.controller.js
 * Controller tiếp nhận và xử lý sự kiện Webhook Realtime từ Giao Hàng Nhanh (GHN)
 * Đồng bộ trạng thái SalesOrder theo trạng thái GHN và tự động bắn tin nhắn cho khách qua Chat.
 */

import SalesOrder from '../../models/SalesOrder.model.js';
import Sku from '../../models/Sku.model.js';
import InventoryTransaction from '../../models/InventoryTransaction.model.js';
import CounterSequence from '../../models/CounterSequence.model.js';
import { mapGhnStatusToOrderStatus } from './ghn.service.js';
import notificationTemplateService from '../conversational-commerce/chat-interface/notificationTemplate.service.js';
import { emitOrderStatusUpdated } from '../../config/socket.js';

// Trọng số tiến trình đơn hàng nội bộ của kho WMS (chống lùi trạng thái nội bộ)
const WMS_INTERNAL_STATUS_RANK = Object.freeze({
  PENDING: 0,
  CONFIRMED_RESERVED: 1,
  PICKING: 2,
  PACKED: 3,
  HANDED_OVER_CARRIER: 4,
  CARRIER_PICKED_UP: 5,
  DELIVERED: 6,
});

// Bộ nhớ đệm (In-memory cache) kiểm tra tính lũy kế (Idempotency)
const processedWebhookEvents = new Map();

/**
 * Đồng bộ trạng thái từ GHN vào bản ghi SalesOrder trong MongoDB,
 * xử lý nghiệp vụ tồn kho (GBR-08 nếu cancel) / đối soát COD (GBR-15, GBR-16 nếu delivered)
 * và bắn tin nhắn tự động cho khách hàng qua khung Chat.
 *
 * @param {Object} params
 * @param {Object} params.order - Bản ghi Mongoose SalesOrder
 * @param {string} params.ghnStatus - Mã trạng thái từ GHN (ready_to_pick, picking, storing, delivering, delivered, cancel, return, returned...)
 * @param {string} [params.ghnStatusName] - Tên hiển thị trạng thái GHN
 * @param {string} [params.waybillCode] - Mã vận đơn GHN
 * @param {number} [params.codAmount] - Tiền thu hộ thực tế từ GHN
 * @param {boolean} [params.sendChatNotification=true] - Có bắn tin nhắn cho khách không
 * @returns {Promise<{ order: Object, chatMessage: Object|null, statusChanged: boolean }>}
 */
export const applyGhnStatusToSalesOrder = async ({
  order,
  ghnStatus,
  waybillCode,
  codAmount,
  sendChatNotification = true,
}) => {
  if (!order) return { order: null, chatMessage: null, statusChanged: false };

  const normalizedGhnStatus = String(ghnStatus || 'ready_to_pick').toLowerCase().trim();
  const mapped = mapGhnStatusToOrderStatus(normalizedGhnStatus);
  const previousGhnStatus = order.warehouseFulfillment?.ghnStatus;
  const previousOrderStatus = order.status;

  // Đơn đã kết thúc hoặc đang được xử lý đổi/trả nội bộ: không để GHN ghi đè trạng thái
  const isLockedOrder =
    ['CANCELLED', 'RETURNED', 'EXCHANGE_REQUESTED', 'COMPLETED'].includes(previousOrderStatus) ||
    (previousOrderStatus === 'RETURN_REQUESTED' && Boolean(order.linkedReturnRequestId));
  // Chống lùi trạng thái: dữ liệu GHN cũ hơn trạng thái đã ghi nhận thì bỏ qua
  const previousRank = previousGhnStatus ? mapGhnStatusToOrderStatus(previousGhnStatus).rank : 0;
  const isRegression = previousGhnStatus && mapped.rank < previousRank;
  if (isLockedOrder || isRegression) {
    return { order, chatMessage: null, statusChanged: false, skipped: true };
  }

  const effectiveWaybill =
    waybillCode ||
    order.warehouseFulfillment?.waybillCode ||
    order.sourceDetails?.externalTrackingCode ||
    '';

  // [GBR-08] Nếu GHN báo hủy (cancel) khi đơn đang giữ chỗ -> giải phóng tồn kho giữ chỗ (-reservedQty)
  if (
    normalizedGhnStatus === 'cancel' &&
    ['CONFIRMED_RESERVED', 'PICKING'].includes(previousOrderStatus)
  ) {
    for (const item of order.items || []) {
      const sku = await Sku.findByIdAndUpdate(
        item.skuId,
        { $inc: { reservedQty: -item.orderedQty } },
        { new: true }
      );
      const txCode = await CounterSequence.getNextSequence('INVENTORY_TX', 'TX', 6);
      await InventoryTransaction.create({
        transactionCode: txCode,
        warehouseType: 'FINISHED_GOODS',
        itemType: 'FINISHED_SKU',
        skuId: item.skuId,
        transactionType: 'ORDER_CANCEL_RELEASE',
        referenceModel: 'SalesOrder',
        referenceId: order._id,
        quantityChange: -item.orderedQty,
        onHandBefore: sku ? sku.onHandQty : 0,
        onHandAfter: sku ? sku.onHandQty : 0,
        unitCostSnapshot: sku ? sku.unitCogs : 0,
        performedByUserId: order.sellerId,
      });
    }
    order.cancelReason = order.cancelReason || 'Đơn vận chuyển GHN đã bị hủy';
    order.canceledAt = new Date();
  }

  if (!order.warehouseFulfillment) order.warehouseFulfillment = {};

  // Khi GHN đã lấy hàng / đang giao -> cập nhật handedOverAt
  if (
    ['picked', 'storing', 'transporting', 'sorting', 'delivering', 'money_collect_delivering'].includes(normalizedGhnStatus) &&
    !order.warehouseFulfillment?.handedOverAt
  ) {
    order.warehouseFulfillment.handedOverAt = new Date();
  }

  // Khi shipper GHN đã lấy hàng -> cập nhật carrierPickedUpAt
  if (
    ['picked', 'storing', 'transporting', 'sorting', 'delivering', 'money_collect_delivering', 'delivered'].includes(normalizedGhnStatus) &&
    !order.warehouseFulfillment?.carrierPickedUpAt
  ) {
    order.warehouseFulfillment.carrierPickedUpAt = new Date();
  }

  // [GBR-15 & GBR-16] Khi GHN giao thành công (delivered) -> cập nhật thanh toán & đối soát COD
  if (normalizedGhnStatus === 'delivered') {
    order.warehouseFulfillment.deliveredAt = order.warehouseFulfillment.deliveredAt || new Date();
    order.paymentStatus = 'PAID';
    const expectedCod = Number(order.financialSummary?.expectedCodAmount || 0);
    if (codAmount !== undefined && codAmount !== null && codAmount > 0 && expectedCod > 0) {
      // Lưu ý: GHN chỉ thu tiền hàng (không đẩy 30k ship lên GHN), nên đối chiếu linh hoạt
      const itemsNet = Math.max(
        0,
        Number(order.financialSummary?.itemsSubtotal || 0) - Number(order.financialSummary?.discountAmount || 0)
      );
      const isMatched = Number(codAmount) === expectedCod || Number(codAmount) === itemsNet;
      order.codReconciliationStatus = isMatched ? 'MATCHED' : 'RED_FLAG_DISCREPANCY';
    } else {
      order.codReconciliationStatus = 'MATCHED';
    }
  }

  // Cập nhật thông tin vận đơn GHN và trạng thái đơn hàng đồng bộ theo GHN
  order.warehouseFulfillment = {
    ...(order.warehouseFulfillment?.toObject ? order.warehouseFulfillment.toObject() : order.warehouseFulfillment),
    carrierName: 'GHN',
    waybillCode: effectiveWaybill,
    ghnStatus: mapped.ghnStatus,
    ghnStatusName: mapped.ghnStatusName,
    ghnUpdatedAt: new Date(),
  };

  const currentInternalRank = WMS_INTERNAL_STATUS_RANK[previousOrderStatus] || 0;
  const targetInternalRank = WMS_INTERNAL_STATUS_RANK[mapped.orderStatus] || 0;

  // Điều kiện cho phép GHN cập nhật order.status của WMS:
  // 1. Trạng thái GHN là ngoại lệ/kết thúc: cancel, return, returned, damage, lost
  // 2. Hoặc trạng thái GHN tiến lên phía trước (targetInternalRank >= currentInternalRank)
  // Tuyệt đối không để GHN kéo lùi trạng thái đơn nội bộ (ví dụ đơn đã PACKED hoặc HANDED_OVER_CARRIER mà GHN gửi ready_to_pick)
  const canAdvanceOrderStatus =
    ['cancel', 'return', 'returned', 'damage', 'lost'].includes(normalizedGhnStatus) ||
    targetInternalRank >= currentInternalRank;

  if (canAdvanceOrderStatus && previousOrderStatus !== mapped.orderStatus) {
    order.statusHistory = [
      ...(order.statusHistory || []),
      {
        from: previousOrderStatus,
        to: mapped.orderStatus,
        by: order.sellerId,
        at: new Date(),
        note: `Đồng bộ từ GHN: ${mapped.ghnStatusName}`,
      },
    ];
    order.status = mapped.orderStatus;
  }

  await order.save();

  const statusChanged = previousGhnStatus !== mapped.ghnStatus || previousOrderStatus !== order.status;

  // Bắn tin nhắn tự động cho khách hàng qua Chat khi có mã vận đơn mới hoặc chuyển trạng thái GHN
  let chatMessage = null;
  if (sendChatNotification && statusChanged) {
    try {
      const msgText = notificationTemplateService.buildGhnStatusUpdateText(
        order,
        mapped.ghnStatus,
        effectiveWaybill
      );
      chatMessage = await notificationTemplateService.sendOrderNotificationToChat({
        order,
        messageText: msgText,
        notificationType: `GHN_${mapped.ghnStatus.toUpperCase()}`,
        senderSellerId: order.sellerId,
      });
    } catch (chatErr) {
      console.warn(`⚠️ [GHN Chat Notify] Không thể gửi tin nhắn trạng thái ${mapped.ghnStatus}:`, chatErr.message);
    }
  }

  // Phát sự kiện Socket.io để giao diện Seller & Kho cập nhật realtime
  try {
    emitOrderStatusUpdated({
      orderId: order._id,
      orderCode: order.orderCode,
      waybillCode: effectiveWaybill,
      status: order.status,
      ghnStatus: mapped.ghnStatus,
      ghnStatusName: order.warehouseFulfillment.ghnStatusName,
      updatedAt: order.warehouseFulfillment.ghnUpdatedAt,
    });
  } catch (sockErr) {
    console.warn('⚠️ [GHN Socket Emit]:', sockErr.message);
  }

  return { order, chatMessage, statusChanged };
};

/**
 * Endpoint: POST /api/carriers/ghn/webhook (hoặc /api/ghn/webhook)
 * GHN bắn sự kiện thay đổi trạng thái đơn hàng và COD
 */
export const handleGhnWebhook = async (req, res) => {
  const receivedAt = new Date().toISOString();
  const payload = req.body || {};

  // 1. Trích xuất payload linh hoạt (hỗ trợ cả chuẩn PascalCase OrderCode lẫn camelCase order_code của GHN)
  const orderCode = payload.OrderCode || payload.order_code || payload.Order_Code;
  const status = (payload.Status || payload.status || '').toLowerCase().trim();
  const codAmount = Number(payload.CODAmount ?? payload.cod_amount ?? 0);
  const fee = Number(payload.Fee ?? payload.total_fee ?? payload.fee ?? 0);
  const eventTime = payload.Time || payload.time || receivedAt;

  console.log('\n========================================================');
  console.log(`[GHN WEBHOOK RECEIVED] ${receivedAt}`);
  console.log(`- Mã vận đơn (OrderCode): ${orderCode}`);
  console.log(`- Trạng thái (Status): ${status}`);
  console.log(`- Tiền thu hộ COD: ${codAmount.toLocaleString('vi-VN')} ₫`);
  console.log(`- Cước phí: ${fee.toLocaleString('vi-VN')} ₫`);
  console.log(`- Thời gian sự kiện: ${eventTime}`);
  console.log('========================================================\n');

  // 2. Validate dữ liệu đầu vào bắt buộc
  if (!orderCode || !status) {
    console.error('[GHN Webhook Error] Thiếu OrderCode hoặc Status trong payload:', payload);
    return res.status(400).json({
      success: false,
      message: 'Dữ liệu webhook không hợp lệ: Yêu cầu bắt buộc phải có OrderCode và Status.',
    });
  }

  // 3. Triển khai tính lũy kế (Idempotency Check)
  const eventKey = `${orderCode}_${status}`;
  if (processedWebhookEvents.has(eventKey) && !payload.forceSync) {
    console.log(`[GHN Webhook Idempotency] Sự kiện [${eventKey}] đã được xử lý trước đó. Bỏ qua ghi nhận trùng lặp.`);
    return res.status(200).json({
      success: true,
      idempotent: true,
      message: 'Sự kiện đã được ghi nhận trước đó (Idempotent OK).',
    });
  }

  // 4. Tìm đơn hàng trong MongoDB theo mã vận đơn GHN và đồng bộ trạng thái + bắn tin cho khách
  try {
    const cleanCode = String(orderCode).trim();
    const order = await SalesOrder.findOne({
      $or: [
        { 'warehouseFulfillment.waybillCode': cleanCode },
        { 'sourceDetails.externalTrackingCode': cleanCode },
        { orderCode: cleanCode },
      ],
    });

    let updatedOrderInfo = null;
    if (order) {
      const syncResult = await applyGhnStatusToSalesOrder({
        order,
        ghnStatus: status,
        waybillCode: cleanCode,
        codAmount,
        sendChatNotification: true,
      });
      updatedOrderInfo = {
        orderId: syncResult.order._id,
        orderCode: syncResult.order.orderCode,
        newOrderStatus: syncResult.order.status,
        ghnStatus: syncResult.order.warehouseFulfillment?.ghnStatus,
        ghnStatusName: syncResult.order.warehouseFulfillment?.ghnStatusName,
        chatNotified: Boolean(syncResult.chatMessage),
      };
    }

    processedWebhookEvents.set(eventKey, {
      orderCode: cleanCode,
      status,
      codAmount,
      fee,
      processedAt: receivedAt,
      matchedSalesOrder: updatedOrderInfo,
    });

    // 5. Luôn phản hồi HTTP 200 OK ngay lập tức cho GHN để tránh retry timeout
    return res.status(200).json({
      success: true,
      orderCode: cleanCode,
      status,
      matchedSalesOrder: updatedOrderInfo,
      message: `Webhook đã xử lý thành công trạng thái [${status}] cho vận đơn ${cleanCode}.`,
    });
  } catch (error) {
    console.error(`[GHN Webhook Internal Error] Lỗi khi xử lý đơn ${orderCode}:`, error.message);
    return res.status(200).json({
      success: true,
      hasWarning: true,
      message: 'Đã nhận webhook nhưng có cảnh báo trong quá trình cập nhật nội bộ.',
    });
  }
};

/**
 * Lấy lịch sử sự kiện webhook đã nhận (phục vụ debug/kiểm tra)
 */
export const getWebhookHistory = (req, res) => {
  const events = Array.from(processedWebhookEvents.values()).reverse();
  return res.status(200).json({
    success: true,
    total: events.length,
    data: events,
  });
};
