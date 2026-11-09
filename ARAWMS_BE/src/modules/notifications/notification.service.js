import { Notification } from '../../models/index.js';
import MaterialInboundPlan from '../../models/MaterialInboundPlan.model.js';
import SupplierContract from '../../models/SupplierContract.model.js';
import Supplier from '../../models/Supplier.model.js';
import { emitSystemNotification } from '../../config/socket.js';

/**
 * Universal Multi-Role Notification Service
 * Tạo mới thông báo trong DB và phát WebSocket realtime cho đúng Role/User
 */
export const createNotification = async (payload) => {
  const notification = await Notification.create({
    title: payload.title,
    message: payload.message,
    type: payload.type || 'SYSTEM_ANNOUNCEMENT',
    priority: payload.priority || 'NORMAL',
    recipientRole: payload.recipientRole || 'ACCOUNTANT',
    recipientUserId: payload.recipientUserId || null,
    senderUserId: payload.senderUserId || null,
    senderRole: payload.senderRole || 'SYSTEM',
    targetUrl: payload.targetUrl || '',
    metadata: payload.metadata || {},
    isRead: false,
  });

  // Bắn socket realtime đa vai trò
  try {
    emitSystemNotification(notification.toObject());
  } catch (err) {
    console.error('⚠️ [Socket.io] Lỗi khi bắn realtime notification:', err.message);
  }

  return notification;
};

/**
 * Tự động đồng bộ các sai lệch kế hoạch tiếp nhận (KCS) chưa có thông báo trong DB
 * (Phục vụ hiển thị đầy đủ cho các kế hoạch cũ như KH-NHAP-004 đã phát sinh trước đó)
 */
export const syncMissingDeviationNotifications = async () => {
  try {
    const deviationPlans = await MaterialInboundPlan.find({
      $or: [
        { status: 'DEVIATION_REPORTED' },
        { 'technicianVerification.isMatchedWithPlan': false },
      ],
      isDeleted: false,
    })
      .populate('contractId', 'contractCode contractTitle')
      .populate('supplierId', 'supplierName supplierCode')
      .lean();

    if (!deviationPlans || deviationPlans.length === 0) return;

    for (const plan of deviationPlans) {
      const existing = await Notification.findOne({
        type: 'CONTRACT_DEVIATION',
        'metadata.planId': plan._id,
      });

      if (!existing) {
        const contractCodeStr = plan.contractId?.contractCode || '—';
        const supplierNameStr = plan.supplierId?.supplierName || 'Nhà cung ứng';
        const summary =
          plan.technicianVerification?.deviationSummary ||
          'Phát hiện sai lệch số lượng/chất lượng khi KCS nghiệm thu lô nguyên vật liệu.';

        await Notification.create({
          title: `⚠️ Sai lệch giao nhận: ${plan.planCode}`,
          message: `KCS đã báo cáo sai lệch khi nghiệm thu kế hoạch ${plan.planCode} (HĐ: ${contractCodeStr} - ${supplierNameStr}). Lý do: ${summary}`,
          type: 'CONTRACT_DEVIATION',
          priority: 'HIGH',
          recipientRole: 'ACCOUNTANT',
          recipientUserId: null,
          targetUrl: `/accountant/contract-deviations?planCode=${encodeURIComponent(plan.planCode)}&planId=${plan._id}`,
          metadata: {
            planId: plan._id,
            planCode: plan.planCode,
            contractId: plan.contractId?._id || plan.contractId,
            contractCode: contractCodeStr,
            supplierId: plan.supplierId?._id || plan.supplierId,
            supplierName: supplierNameStr,
            deviationSummary: summary,
          },
          isRead: false,
          createdAt: plan.technicianVerification?.verifiedAt || plan.updatedAt || new Date(),
        });
      }
    }
  } catch (err) {
    console.warn('⚠️ [Notification Sync] Lỗi khi đồng bộ sai lệch cũ:', err.message);
  }
};

/**
 * Lấy danh sách thông báo theo vai trò và/hoặc userId
 */
export const listNotifications = async (query = {}, currentUser = null) => {
  // Tự động kiểm tra và đồng bộ sai lệch cũ nếu là kế toán truy vấn
  await syncMissingDeviationNotifications();

  const role = query.role || currentUser?.roleCode || currentUser?.roles?.[0] || 'ACCOUNTANT';
  const userId = query.userId || currentUser?._id;
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 30));
  const page = Math.max(1, Number(query.page) || 1);

  const orConditions = [{ recipientRole: role }, { recipientRole: 'ALL' }];
  if (userId) {
    orConditions.push({ recipientUserId: userId });
  }

  const filter = {
    $or: orConditions,
    isDeleted: false,
  };

  if (query.type && query.type !== 'ALL') {
    filter.type = query.type;
  }

  if (query.isRead !== undefined && query.isRead !== '') {
    filter.isRead = query.isRead === 'true' || query.isRead === true;
  }

  const [items, total, unreadCount] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ ...filter, isRead: false }),
  ]);

  return {
    items,
    total,
    unreadCount,
    page,
    limit,
  };
};

/**
 * Đánh dấu 1 thông báo là đã đọc
 */
export const markNotificationAsRead = async (notificationId, userId = null) => {
  const updateData = { isRead: true, readAt: new Date() };
  if (userId) {
    updateData.$addToSet = { readByUsers: { userId, readAt: new Date() } };
  }

  const updated = await Notification.findByIdAndUpdate(notificationId, updateData, {
    new: true,
  }).lean();
  return updated;
};

/**
 * Đánh dấu toàn bộ thông báo của vai trò là đã đọc
 */
export const markAllNotificationsAsRead = async (role = 'ACCOUNTANT', userId = null) => {
  const filter = {
    $or: [{ recipientRole: role }, { recipientRole: 'ALL' }],
    isRead: false,
    isDeleted: false,
  };

  await Notification.updateMany(filter, { isRead: true, readAt: new Date() });
  return { success: true, message: 'Đã đánh dấu tất cả thông báo là đã đọc' };
};
