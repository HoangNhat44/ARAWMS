/*
 * File: baseSchema.plugin.js
 * Author: Duy Anh & Nguyễn Ngọc Huy
 * Description: Adds timestamps and soft-delete fields to Mongoose schemas. Normalizes serialized documents by exposing a string ID and omitting internal/sensitive fields.
 */

/**
 * Base Schema Plugin for Mongoose
 * - timestamps: true (createdAt, updatedAt)
 * - Soft-delete support (isDeleted, deletedAt)
 * - Clean JSON/Object serialization (transforms _id to id, removes __v and sensitive auth fields)
 */
export const baseSchemaPlugin = (schema) => {
  // GBR-01: Thêm cờ xóa mềm để phần đăng nhập loại tài khoản đã bị xóa.
  schema.add({
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  });

  // GBR-23: Bổ sung thời điểm tạo và cập nhật cho dữ liệu, gồm cả nhật ký.
  schema.set('timestamps', true);

  /** Removes database internals and sensitive authentication fields from serialized output. */
  const cleanTransform = (doc, ret) => {
    if (ret._id) {
      const idStr = ret._id.toString();
      ret.id = idStr;
      ret._id = idStr;
    }
    delete ret.__v;
    delete ret.passwordHash;
    delete ret.passwordResetTokenHash;
    delete ret.passwordResetExpiresAt;
    delete ret.passwordResetRequestedAt;
    delete ret.passwordResetRequired;
    delete ret.failedLoginAttempts;
    delete ret.loginLockedUntil;
    delete ret.sessions;
    delete ret.googleLinkVersion;
    return ret;
  };

  schema.set('toJSON', {
    virtuals: true,
    transform: cleanTransform,
  });

  schema.set('toObject', {
    virtuals: true,
    transform: cleanTransform,
  });
};

export default baseSchemaPlugin;
