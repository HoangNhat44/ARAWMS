/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 22-10-2026
 * Chức năng: Hỗ trợ UC-01, GBR-02 - Nhận yêu cầu Quên mật khẩu và đặt lại
 * mật khẩu.
 */

import { requestPasswordReset, resetPassword, recoveryNotice } from './passwordRecovery.service.js';

// GBR-02: Nhận yêu cầu Quên mật khẩu và trả thông báo chung về email khôi phục.
export const forgot = async (req, res) => {
  await requestPasswordReset(req.recoveryIdentifier);
  res.json({ success: true, message: recoveryNotice });
};
// GBR-02: Lưu mật khẩu mới sau khi mã khôi phục được kiểm tra.
export const reset = async (req, res) => {
  await resetPassword(req.resetInput, req);
  res.json({ success: true, message: 'Đã đổi mật khẩu. Bạn có thể đăng nhập bằng mật khẩu mới.' });
};
