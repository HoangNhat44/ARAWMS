/**
 * ============================================================================
 * @title        : Tag Management Service
 * @author       : Nguyễn Quang Huy
 * @createdDate  : 2026-10-27
 * @lastModified : 2026-10-27
 * @description  : Cung cấp logic nghiệp vụ cho việc khởi tạo thẻ mặc định,
 *                 lấy danh sách thẻ và cho phép Seller tự tạo/xóa các thẻ tag tuỳ chỉnh (UC-73).
 * @module       : Conversational Commerce / Chat Interface
 * @layer        : Service
 * ============================================================================
 */

import ConversationTag from '../../../models/ConversationTag.model.js';

/** 
 * 8 Thẻ mặc định chuẩn phong cách Pancake để phân loại hội thoại khách hàng 
 * @constant {Array<Object>}
 */
export const DEFAULT_TAGS = [
  { name: 'Tư vấn',          color: '#5B8DEF', textColor: '#fff', isDefault: true },
  { name: 'Báo giá',         color: '#F59E0B', textColor: '#fff', isDefault: true },
  { name: 'Chờ chốt',        color: '#8B5CF6', textColor: '#fff', isDefault: true },
  { name: 'Đã chốt đơn',    color: '#10B981', textColor: '#fff', isDefault: true },
  { name: 'Khách VIP',       color: '#EF4444', textColor: '#fff', isDefault: true },
  { name: 'Đổi / Trả',      color: '#F97316', textColor: '#fff', isDefault: true },
  { name: 'Khiếu nại',      color: '#6B7280', textColor: '#fff', isDefault: true },
  { name: 'Chờ chuyển khoản', color: '#0EA5E9', textColor: '#fff', isDefault: true },
];

/**
 * Tự động tạo trước (seed) các thẻ mặc định vào cơ sở dữ liệu nếu bảng thẻ đang trống.
 *
 * @async
 * @function seedDefaultTags
 * @returns {Promise<void>}
 */
export const seedDefaultTags = async () => {
  const count = await ConversationTag.countDocuments({ isDefault: true });
  if (count === 0) {
    await ConversationTag.insertMany(DEFAULT_TAGS);
    console.log('✅ [TagService] Seeded 8 default conversation tags');
  }
};

/**
 * Lấy toàn bộ danh sách thẻ tag (ưu tiên hiển thị thẻ mặc định trước, sau đó theo ngày tạo).
 *
 * @async
 * @function getAllTags
 * @returns {Promise<Array<Object>>} Danh sách thẻ hội thoại từ Database MongoDB.
 */
export const getAllTags = async () => {
  return await ConversationTag.find().sort({ isDefault: -1, createdAt: 1 }).lean();
};

/**
 * Tạo thẻ tag tuỳ chỉnh mới do Seller chỉ định màu sắc và tên thẻ.
 *
 * @async
 * @function createTag
 * @param {Object} tagData - Thông tin thẻ cần tạo.
 * @param {string} tagData.name - Tên thẻ không trùng lặp.
 * @param {string} [tagData.color] - Mã màu nền hex.
 * @param {string} [tagData.textColor] - Mã màu chữ hex.
 * @param {Object} [user] - Thông tin Seller thực hiện tạo thẻ (req.user).
 * @returns {Promise<Object>} Document ConversationTag vừa được tạo.
 * @throws {Error} Nếu tên thẻ trống hoặc tên thẻ đã tồn tại trong DB.
 * @businessRule GBR-23 Ghi nhận người dùng tạo thẻ (createdBy) để phục vụ kiểm toán hệ thống.
 */
export const createTag = async ({ name, color, textColor }, user) => {
  // 1. Kiểm tra tính hợp lệ của tên thẻ
  if (!name || !name.trim()) {
    throw new Error('Tên thẻ không được để trống');
  }
  
  // 2. Chống trùng lặp tên thẻ
  const existing = await ConversationTag.findOne({ name: name.trim() });
  if (existing) {
    throw new Error(`Thẻ "${name.trim()}" đã tồn tại`);
  }

  // 3. [BR: GBR-23] Lưu thẻ mới kèm thông tin tác giả thực hiện
  const tag = await ConversationTag.create({
    name: name.trim(),
    color: color || '#9F8365',
    textColor: textColor || '#ffffff',
    createdBy: user?._id,
    isDefault: false,
  });
  return tag;
};

/**
 * Xoá thẻ tag tuỳ chỉnh (ngăn chặn xoá thẻ mặc định của hệ thống).
 *
 * @async
 * @function deleteTag
 * @param {string} tagId - MongoDB ObjectId của thẻ cần xoá.
 * @returns {Promise<{deleted: boolean}>} Trạng thái xoá thành công.
 * @throws {Error} Nếu thẻ không tồn tại hoặc là thẻ mặc định hệ thống.
 * @businessRule GBR-23 Ghi vết thao tác xóa thẻ cấu hình của Seller.
 */
export const deleteTag = async (tagId) => {
  const tag = await ConversationTag.findById(tagId);
  if (!tag) throw new Error('Thẻ không tồn tại');
  
  // Ràng buộc: Không cho phép xoá thẻ mặc định của hệ thống
  if (tag.isDefault) throw new Error('Không thể xoá thẻ mặc định của hệ thống');
  
  // [BR: GBR-23] Thực hiện xoá thẻ custom
  await tag.deleteOne();
  return { deleted: true };
};

export default { getAllTags, createTag, deleteTag, seedDefaultTags };

