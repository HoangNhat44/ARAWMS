/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 22-10-2026
 * Chức năng: UC-03, UC-04 - Trả hồ sơ và nhận yêu cầu cập nhật tài khoản.
 */

import { accountProfile } from './accountProfile.js';
import * as service from './accountGovernance.service.js';

// UC-03: Trả hồ sơ của chính người đang đăng nhập.
export const getOwnAccount = (req, res) => res.json({ success: true, data: { user: accountProfile(req.user) } });

// UC-04: Nhận thay đổi hồ sơ và trả dữ liệu sau khi lưu.
export const updateOwnAccount = async (req, res) => {
  const user = await service.updateProfile(req);
  res.json({ success: true, message: 'Đã cập nhật thông tin cá nhân.', data: { user } });
};

// UC-04: Đổi mật khẩu rồi yêu cầu đăng nhập lại.
export const changeOwnPassword = async (req, res) => {
  await service.changePassword(req);
  res.json({ success: true, message: 'Đã đổi mật khẩu và kết thúc tất cả phiên đăng nhập. Vui lòng đăng nhập lại.' });
};
