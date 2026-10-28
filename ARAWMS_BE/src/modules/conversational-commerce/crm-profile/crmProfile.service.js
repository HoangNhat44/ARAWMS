/**
 * ============================================================================
 * @title        : CRM Profile Service
 * @author       : Nguyễn Quang Huy
 * @createdDate  : 2026-10-27
 * @lastModified : 2026-10-27
 * @description  : Xử lý quản lý hồ sơ khách hàng CRM cho Seller: chỉnh sửa thông tin (UC-70),
 *                 tạo hồ sơ mới (UC-71), xem lịch sử tương tác (UC-75), xem lịch sử mua hàng (UC-76).
 * @module       : Conversational Commerce / CRM Profile
 * @layer        : Service
 * ============================================================================
 */

import Customer from '../../../models/Customer.model.js';
import ChatConversation from '../../../models/ChatConversation.model.js';
import SalesOrder from '../../../models/SalesOrder.model.js';
import CounterSequence from '../../../models/CounterSequence.model.js';
import SystemLog from '../../../models/SystemLog.model.js';

/**
 * Ghi SystemLog kiểm toán
 * @businessRule GBR-23 Ghi log kiểm toán cho dữ liệu khách hàng
 */
const recordSystemLog = async ({ actor, majorFeature, subFeature, action, targetCollection, targetId, targetCode, beforeSnapshot, afterSnapshot, req }) => {
  try {
    await SystemLog.create({
      actorId: actor?._id,
      actorRole: actor?.roleCode || 'SELLER',
      majorFeature: majorFeature || 'Conversational Commerce',
      subFeature: subFeature || 'CRM Profile',
      action,
      targetCollection,
      targetId,
      targetCode,
      beforeSnapshot,
      afterSnapshot,
      ipAddress: req?.ip || '127.0.0.1',
      userAgent: req?.headers?.['user-agent'] || 'System',
    });
  } catch (err) {
    console.error('❌ Lỗi ghi SystemLog CRM:', err.message);
  }
};

/**
 * UC-70: Cập nhật thông tin hồ sơ của khách hàng trong hệ thống (Edit Customer Information)
 */
export const updateCustomer = async (customerId, updateData, user, req) => {
  const customer = await Customer.findById(customerId);
  if (!customer) {
    throw new Error('Khách hàng không tồn tại');
  }

  const beforeSnapshot = customer.toObject();

  // Không cho phép sửa facebookPsid (định danh từ Meta)
  if (updateData.facebookPsid && updateData.facebookPsid !== customer.facebookPsid) {
    throw new Error('Không thể thay đổi định danh Facebook PSID');
  }

  if (updateData.fullName) customer.fullName = updateData.fullName.trim();
  if (updateData.phone !== undefined) customer.phone = updateData.phone;
  if (updateData.email !== undefined) customer.email = updateData.email;
  if (Array.isArray(updateData.addresses)) customer.addresses = updateData.addresses;
  if (Array.isArray(updateData.tags)) customer.tags = updateData.tags;

  await customer.save();

  await recordSystemLog({
    actor: user,
    majorFeature: 'Conversational Commerce',
    subFeature: 'CRM Profile',
    action: 'EDIT_CUSTOMER_INFO',
    targetCollection: 'Customer',
    targetId: customer._id,
    targetCode: customer.customerCode,
    beforeSnapshot,
    afterSnapshot: customer.toObject(),
    req,
  });

  return customer;
};

/**
 * UC-71: Tạo hồ sơ khách hàng mới khi tiếp nhận khách lạ qua khung chat (Create New Customer Profile)
 */
export const createCustomer = async (customerData, user, req) => {
  const customerCode = await CounterSequence.getNextSequence('CUSTOMER_CODE', 'CUST', 5);

  const customer = await Customer.create({
    customerCode,
    fullName: customerData.fullName?.trim() || 'Khách hàng mới',
    phone: customerData.phone,
    email: customerData.email,
    facebookPsid: customerData.facebookPsid || undefined,
    addresses: customerData.addresses || [],
    tags: customerData.tags || ['Khách mới'],
  });

  // Nếu tạo từ một cuộc hội thoại đang mở, liên kết trực tiếp
  if (customerData.conversationId) {
    await ChatConversation.findByIdAndUpdate(customerData.conversationId, {
      customerId: customer._id,
    });
  }

  await recordSystemLog({
    actor: user,
    majorFeature: 'Conversational Commerce',
    subFeature: 'CRM Profile',
    action: 'CREATE_NEW_CUSTOMER',
    targetCollection: 'Customer',
    targetId: customer._id,
    targetCode: customer.customerCode,
    afterSnapshot: customer.toObject(),
    req,
  });

  return customer;
};

/**
 * UC-75: Xem lại lịch sử các phiên chat và tương tác trước đây của khách hàng (View Customer Interaction History)
 */
export const getCustomerInteractionHistory = async (customerId) => {
  const history = await ChatConversation.find({ customerId })
    .populate('assignedSellerId', 'employeeCode fullName email')
    .sort({ lastMessageAt: -1 })
    .lean();

  return history.map((item) => ({
    conversationId: item._id,
    status: item.status,
    tags: item.tags,
    assignedSeller: item.assignedSellerId,
    lastMessagePreview: item.lastMessagePreview,
    lastMessageAt: item.lastMessageAt,
    createdAt: item.createdAt,
  }));
};

/**
 * UC-76: Xem danh sách các đơn hàng khách đã từng đặt để tư vấn bán thêm (View Customer Purchase History)
 */
export const getCustomerPurchaseHistory = async (customerId) => {
  const orders = await SalesOrder.find({ customerId })
    .populate('sellerId', 'employeeCode fullName')
    .populate('items.skuId', 'skuCode styleName color size')
    .sort({ createdAt: -1 })
    .lean();

  return orders;
};

export default {
  updateCustomer,
  createCustomer,
  getCustomerInteractionHistory,
  getCustomerPurchaseHistory,
};
