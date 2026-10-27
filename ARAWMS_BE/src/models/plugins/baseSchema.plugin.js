/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 22-10-2026
 * Chức năng: Hỗ trợ hồ sơ và GBR-01 - Đánh dấu xóa mềm, lưu thời điểm và ẩn
 * dữ liệu nhạy cảm.
 */

/**
 * Base Schema Plugin for Mongoose
 * - timestamps: true (createdAt, updatedAt)
 * - Soft-delete support (isDeleted, deletedAt)
 * - Clean JSON/Object serialization (transforms _id to id, removes __v and passwordHash)
 */
export const baseSchemaPlugin = (schema) => {
  // GBR-01: Thêm cờ xóa mềm để phần đăng nhập loại tài khoản đã bị xóa.
  schema.add({
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  });

  // GBR-23: Bổ sung thời điểm tạo và cập nhật cho dữ liệu, gồm cả nhật ký.
  schema.set('timestamps', true);

  /*
   * UC-03: Ẩn mật khẩu, thông tin khôi phục và phiên khi chuyển dữ liệu sang
   * JSON.
   */
  const cleanTransform = (doc, ret) => {
    if (ret._id) {
      ret.id = ret._id.toString();
      delete ret._id;
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
