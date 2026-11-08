/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 22-10-2026
 * Chức năng: UC-05 - Nhận yêu cầu đăng nhập Owner bằng Google.
 */

import { googleConfig, issueChallenge } from './googleIdentity.service.js';
import { loginWithGoogle } from './googleAuth.service.js';

// UC-05: Chỉ trả Client ID công khai để FE hiển thị nút Google.
export const config = (req, res) => res.json({ success: true, data: googleConfig() });
// UC-05: Cấp mã xác thực ngắn hạn cho một lần đăng nhập Google.
export const challenge = async (req, res) => res.json({ success: true, data: await issueChallenge('LOGIN') });
// UC-05: Trả kết quả đăng nhập sau khi BE xác minh Google.
export const login = async (req, res) => res.json({
  success: true, message: 'Đăng nhập Google thành công.', data: await loginWithGoogle(req),
});
