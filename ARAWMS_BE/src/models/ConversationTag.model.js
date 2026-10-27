/**
 * ============================================================================
 * @title        : Conversation Tag Model
 * @author       : Nguyễn Quang Huy
 * @createdDate  : 2026-10-27
 * @lastModified : 2026-10-27
 * @description  : Lược đồ dữ liệu thẻ phân loại cuộc hội thoại (ConversationTag),
 *                 hỗ trợ Seller tạo và quản lý các nhãn màu tuỳ chỉnh (UC-73).
 * @module       : Conversational Commerce / Chat Interface
 * @layer        : Model
 * ============================================================================
 */

import mongoose from 'mongoose';
import baseSchemaPlugin from './plugins/baseSchema.plugin.js';

const { Schema } = mongoose;

/**
 * Lược đồ bảng Thẻ hội thoại lưu Database MongoDB.
 *
 * @typedef {Object} ConversationTagSchema
 * @property {string} name - Tên thẻ định danh (tối đa 30 ký tự, không trùng lặp).
 * @property {string} color - Mã màu hex nền của thẻ (mặc định Ara Gold #9F8365).
 * @property {string} textColor - Mã màu hex chữ hiển thị (mặc định #FFFFFF).
 * @property {ObjectId} [createdBy] - ID người dùng Seller tạo thẻ (liên kết User.model).
 * @property {boolean} isDefault - Đánh dấu thẻ mặc định của hệ thống (không cho phép xoá).
 * @businessRule GBR-23 Ghi vết kiểm toán thông tin người tạo và thời gian tạo thẻ tag.
 * ConversationTag Model
 * Thẻ tag tuỳ chỉnh do Seller tạo, lưu vào DB, dùng để phân loại cuộc hội thoại.
 * UC-73: Tag Customer Chat
 */
const conversationTagSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 30,
    },
    color: {
      type: String,
      default: '#9F8365', // ara-gold mặc định
    },
    textColor: {
      type: String,
      default: '#FFFFFF',
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    isDefault: {
      type: Boolean,
      default: false, // true nếu là tag mặc định do system tạo
    },
  },
  { collection: 'conversation_tags' }
);

conversationTagSchema.plugin(baseSchemaPlugin);

const ConversationTag = mongoose.model('ConversationTag', conversationTagSchema);
export default ConversationTag;
