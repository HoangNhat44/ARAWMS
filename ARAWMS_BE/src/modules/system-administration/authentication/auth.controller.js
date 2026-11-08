/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 22-10-2026
 * Chức năng: UC-01, UC-02, UC-03 - Nhận yêu cầu đăng nhập, đăng xuất và trả
 * thông tin tài khoản.
 */

import * as authService from './auth.service.js';
import { accountProfile } from '../account-governance/accountProfile.js';

// UC-01: Gọi xử lý đăng nhập rồi trả hồ sơ và token cho FE.
export const login = async (req, res) => {
  const data = await authService.login(req.loginInput, req);
  res.json({ success: true, message: 'Đăng nhập thành công.', data });
};

// UC-02: Kết thúc phiên hiện tại rồi báo đăng xuất thành công.
export const logout = async (req, res) => {
  await authService.logout(req);
  res.json({ success: true, message: 'Đã kết thúc phiên làm việc.' });
};

// UC-03: Giữ API lấy hồ sơ để FE kiểm tra lại phiên đã lưu.
// UC-03: Trả thông tin hồ sơ của tài khoản đang đăng nhập.
export const getMe = (req, res) => res.json({ success: true, data: { user: accountProfile(req.user) } });
