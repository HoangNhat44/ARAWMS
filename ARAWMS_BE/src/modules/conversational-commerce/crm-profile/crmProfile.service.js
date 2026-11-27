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
import { emitConversationUpdated } from '../../../config/socket.js';

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

const VN_PHONE_REGEX = /^0\d{9}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const createHttpError = (message, statusCode = 400) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

const validateContactFields = ({ phone, email }) => {
  if (phone !== undefined && phone !== null && String(phone).trim() !== '') {
    const normalizedPhone = String(phone).trim();
    if (!VN_PHONE_REGEX.test(normalizedPhone)) {
      throw createHttpError('Số điện thoại không đúng định dạng (10 chữ số bắt đầu bằng 0)', 400);
    }
  }

  if (email !== undefined && email !== null && String(email).trim() !== '') {
    const normalizedEmail = String(email).trim();
    if (!EMAIL_REGEX.test(normalizedEmail)) {
      throw createHttpError('Email không đúng định dạng', 400);
    }
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

  validateContactFields({ phone: updateData.phone, email: updateData.email });

  if (updateData.phone !== undefined) {
    const normalizedPhone = updateData.phone === null ? '' : String(updateData.phone).trim();
    if (normalizedPhone) {
      const duplicate = await Customer.findOne({
        phone: normalizedPhone,
        _id: { $ne: customer._id },
      }).lean();
      if (duplicate) {
        throw createHttpError('Số điện thoại khách hàng đã tồn tại trong hệ thống', 409);
      }
    }
    customer.phone = normalizedPhone;
  }

  if (updateData.fullName) customer.fullName = updateData.fullName.trim();
  if (updateData.email !== undefined) {
    customer.email = updateData.email === null ? '' : String(updateData.email).trim();
  }
  if (Array.isArray(updateData.addresses)) customer.addresses = updateData.addresses;

  if (Array.isArray(updateData.tags)) {
    const previousTags = beforeSnapshot.tags || [];
    const newTags = updateData.tags;
    const removedTags = previousTags.filter((t) => !newTags.includes(t));
    customer.tags = newTags;

    // Đồng bộ thẻ: Nếu tag bị xóa khỏi khách hàng, gỡ tag đó khỏi các cuộc hội thoại của khách
    if (removedTags.length > 0) {
      await ChatConversation.updateMany(
        { customerId: customer._id },
        { $pull: { tags: { $in: removedTags } } }
      );
    }

    // Nếu có conversationId chỉ định, cập nhật và phát Socket realtime
    if (updateData.conversationId) {
      if (removedTags.length > 0) {
        await ChatConversation.findByIdAndUpdate(
          updateData.conversationId,
          { $pull: { tags: { $in: removedTags } } }
        );
      }
      const updatedConv = await ChatConversation.findById(updateData.conversationId)
        .populate('customerId', 'customerCode fullName phone email tags addresses totalOrders totalSpent facebookPsid')
        .populate('assignedSellerId', 'employeeCode fullName email')
        .lean();
      if (updatedConv) emitConversationUpdated(updatedConv);
    }
  }

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
  validateContactFields({ phone: customerData.phone, email: customerData.email });

  const normalizedPhone =
    customerData.phone !== undefined && customerData.phone !== null
      ? String(customerData.phone).trim()
      : undefined;

  if (normalizedPhone) {
    const existingCustomer = await Customer.findOne({ phone: normalizedPhone }).lean();
    if (existingCustomer) {
      throw createHttpError('Số điện thoại khách hàng đã tồn tại trong hệ thống', 409);
    }
  }

  const customerCode = await CounterSequence.getNextSequence('CUSTOMER_CODE', 'CUST', 5);

  const customer = await Customer.create({
    customerCode,
    fullName: customerData.fullName?.trim() || 'Khách hàng mới',
    phone: normalizedPhone,
    email:
      customerData.email !== undefined && customerData.email !== null
        ? String(customerData.email).trim()
        : undefined,
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

const escapeRegex = (s) => String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Lấy danh sách khách hàng CRM có tìm kiếm, lọc theo tag / kênh Messenger, sắp xếp và phân trang
 */
export const getCustomerList = async (filters = {}) => {
  const {
    search = '',
    tag = '',
    channel = '',
    sortBy = 'createdAt',
    sortDir = 'desc',
    page = 1,
    limit = 20,
  } = filters;

  const query = { isDeleted: { $ne: true } };

  if (search && String(search).trim()) {
    const regex = new RegExp(escapeRegex(String(search).trim()), 'i');
    query.$or = [
      { fullName: regex },
      { phone: regex },
      { customerCode: regex },
      { email: regex },
      { 'addresses.fullAddress': regex },
    ];
  }

  if (tag && String(tag).trim()) {
    query.tags = String(tag).trim();
  }

  if (channel === 'FACEBOOK') {
    query.facebookPsid = { $exists: true, $nin: [null, ''] };
  } else if (channel === 'DIRECT') {
    query.$and = [
      ...(query.$and || []),
      { $or: [{ facebookPsid: { $exists: false } }, { facebookPsid: null }, { facebookPsid: '' }] },
    ];
  }

  const allowedSort = {
    createdAt: 'createdAt',
    totalSpent: 'totalSpent',
    totalOrders: 'totalOrders',
    fullName: 'fullName',
  };
  const sortField = allowedSort[sortBy] || 'createdAt';
  const sortOrder = sortDir === 'asc' ? 1 : -1;

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
  const skip = (pageNum - 1) * limitNum;

  const [items, total, summaryAgg, allTags] = await Promise.all([
    Customer.find(query)
      .sort({ [sortField]: sortOrder, _id: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    Customer.countDocuments(query),
    Customer.aggregate([
      { $match: { isDeleted: { $ne: true } } },
      {
        $group: {
          _id: null,
          totalCustomers: { $sum: 1 },
          messengerLinkedCount: {
            $sum: {
              $cond: [
                { $and: [{ $ne: ['$facebookPsid', null] }, { $ne: ['$facebookPsid', ''] }, { $ifNull: ['$facebookPsid', false] }] },
                1,
                0,
              ],
            },
          },
          vipCount: {
            $sum: {
              $cond: [{ $in: ['Khách VIP', { $ifNull: ['$tags', []] }] }, 1, 0],
            },
          },
          totalRevenue: { $sum: { $ifNull: ['$totalSpent', 0] } },
        },
      },
    ]),
    Customer.distinct('tags', { isDeleted: { $ne: true } }),
  ]);

  // Gắn kèm conversationId mới nhất (nếu có) để Seller bấm "Nhắn tin" nhảy sang Chat
  const customerIds = items.map((c) => c._id);
  const convMap = new Map();
  if (customerIds.length > 0) {
    const convs = await ChatConversation.find({ customerId: { $in: customerIds } })
      .select('_id customerId pageName lastMessageAt')
      .sort({ lastMessageAt: -1 })
      .lean();
    for (const cv of convs) {
      const key = String(cv.customerId);
      if (!convMap.has(key)) convMap.set(key, cv);
    }
  }

  const enrichedItems = items.map((c) => {
    const cv = convMap.get(String(c._id));
    return {
      ...c,
      latestConversationId: cv?._id || null,
      latestPageName: cv?.pageName || null,
    };
  });

  const summary = summaryAgg[0] || {
    totalCustomers: 0,
    messengerLinkedCount: 0,
    vipCount: 0,
    totalRevenue: 0,
  };

  return {
    items: enrichedItems,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.max(1, Math.ceil(total / limitNum)),
    },
    summary,
    availableTags: (allTags || []).filter(Boolean).sort(),
  };
};

/**
 * Lấy chi tiết 1 hồ sơ khách hàng theo ID
 */
export const getCustomerById = async (customerId) => {
  const customer = await Customer.findOne({ _id: customerId, isDeleted: { $ne: true } }).lean();
  if (!customer) {
    throw new Error('Khách hàng không tồn tại');
  }
  const latestConv = await ChatConversation.findOne({ customerId: customer._id })
    .select('_id pageName lastMessageAt')
    .sort({ lastMessageAt: -1 })
    .lean();

  return {
    ...customer,
    latestConversationId: latestConv?._id || null,
    latestPageName: latestConv?.pageName || null,
  };
};

export default {
  getCustomerList,
  getCustomerById,
  updateCustomer,
  createCustomer,
  getCustomerInteractionHistory,
  getCustomerPurchaseHistory,
};
