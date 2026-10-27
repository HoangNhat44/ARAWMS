/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 22-10-2026
 * Chức năng: Hỗ trợ UC-01; GBR-01, GBR-02 - Khôi phục mật khẩu qua email đã
 * đăng ký.
 */

import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import User from '../../../models/User.model.js';
import { httpError } from '../../../common/utils/httpError.js';
import { activeAccountFilter, isActiveAccount } from './auth.service.js';
import { verifyRecoveryMail, sendRecoveryEmail } from './passwordRecovery.mailer.js';
import { recordAccountActivity } from '../systemAudit.js';

export const recoveryNotice = 'Nếu tài khoản đang hoạt động, liên kết đặt lại mật khẩu sẽ được gửi tới email đã đăng ký.';
const hashToken = (token) => createHash('sha256').update(token).digest('hex');

// UC-01, GBR-02: Gửi liên kết đặt lại mật khẩu đến email đã đăng ký.
export const requestPasswordReset = async (identifier) => {
  // Lỗi cấu hình là chung cho mọi yêu cầu, không cho biết tài khoản tồn tại hay không.
  /*
   * GBR-02: Kiểm tra SMTP trước khi tìm tài khoản để báo lỗi gửi thư mà không
   * lộ tài khoản có tồn tại.
   */
  await verifyRecoveryMail();
  const startedAt = Date.now();
  try {
    const user = await User.findOne({
      ...activeAccountFilter,
      $or: [{ email: identifier.toLowerCase() }, { employeeCode: identifier.toUpperCase() }],
    }).select('+passwordHash').populate('roleId', 'roleName roleCode isActive isDeleted');
    /*
     * GBR-01: Tài khoản hoặc role bị vô hiệu hóa không được nhận liên kết khôi
     * phục.
     */
    if (!isActiveAccount(user)) return;
    // GBR-02: Tạo mã ngẫu nhiên và chỉ lưu hash của mã, không lưu mã gốc.
    const token = randomBytes(32).toString('hex');
    const tokenHash = hashToken(token);
    /*
     * GBR-02: Giới hạn mỗi tài khoản một email trong 60 giây và đặt hạn liên
     * kết là 15 phút.
     */
    const issued = await User.updateOne({
      _id: user._id, ...activeAccountFilter, passwordHash: user.passwordHash,
      $or: [{ passwordResetRequestedAt: { $lte: new Date(Date.now() - 60000) } }, { passwordResetRequestedAt: null }],
    }, { $set: {
      passwordResetTokenHash: tokenHash, passwordResetExpiresAt: new Date(Date.now() + 15 * 60000),
      passwordResetRequestedAt: new Date(),
    } });
    if (!issued.modifiedCount) return;
    try { await sendRecoveryEmail(user.email, token); }
    /*
     * GBR-02: Gửi email thất bại thì xóa mã vừa tạo để người dùng có thể gửi
     * lại.
     */
    catch {
      await User.updateOne({ _id: user._id, passwordResetTokenHash: tokenHash }, {
        $unset: { passwordResetTokenHash: '', passwordResetExpiresAt: '', passwordResetRequestedAt: '' },
      });
      console.warn('[Authentication] Không gửi được email khôi phục. Kiểm tra cấu hình SMTP.');
    }
  } finally {
    // Giảm khác biệt giữa tài khoản không tồn tại, đã khóa và yêu cầu hợp lệ.
    const remaining = 500 - (Date.now() - startedAt);
    if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
  }
};

// GBR-02: Xác minh liên kết dùng một lần trước khi đổi mật khẩu.
export const resetPassword = async ({ token, newPassword }, req) => {
  const tokenHash = hashToken(token);
  const user = await User.findOne({
    ...activeAccountFilter, passwordResetTokenHash: tokenHash, passwordResetExpiresAt: { $gt: new Date() },
  }).select('+passwordHash').populate('roleId', 'roleName roleCode isActive isDeleted');
  const invalidLink = () => httpError(400, 'Liên kết không hợp lệ hoặc đã hết hạn. Hãy gửi yêu cầu đặt lại mật khẩu mới.');
  /*
   * GBR-01: Có liên kết khôi phục cũng không được tự mở tài khoản đã vô hiệu
   * hóa.
   */
  if (!isActiveAccount(user)) throw invalidLink();
  if (user.passwordHash && await bcrypt.compare(newPassword, user.passwordHash)) {
    throw httpError(400, 'Mật khẩu mới phải khác mật khẩu hiện tại.');
  }
  const passwordHash = await bcrypt.hash(newPassword, 12);
  /*
   * GBR-02: Lưu hash mới, xóa mã khôi phục, xóa số lần sai và kết thúc các
   * phiên cũ.
   */
  const result = await User.updateOne({
    _id: user._id, ...activeAccountFilter, passwordHash: user.passwordHash,
    passwordResetTokenHash: tokenHash, passwordResetExpiresAt: { $gt: new Date() },
  }, {
    $set: { passwordHash, passwordResetRequired: false, failedLoginAttempts: 0, loginLockedUntil: null, sessions: [] },
    $unset: { passwordResetTokenHash: '', passwordResetExpiresAt: '', passwordResetRequestedAt: '' },
  }, { runValidators: true });
  if (!result.modifiedCount) throw invalidLink();
  /*
   * GBR-23: Ghi lại thao tác đặt lại mật khẩu, không ghi mật khẩu hoặc mã khôi
   * phục.
   */
  await recordAccountActivity(req, user, 'Authentication', 'RESET_PASSWORD');
};
