/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 22-10-2026
 * Chức năng: UC-04, UC-05 - Nhận yêu cầu liên kết hoặc hủy liên kết Google
 * của người dùng.
 */

import { prepareGoogleLink, linkGoogle, unlinkGoogle } from './googleLink.service.js';

// UC-04, UC-05: Xác nhận mật khẩu và chuẩn bị yêu cầu liên kết Google.
export const challenge = async (req, res) => res.json({
  success: true, data: await prepareGoogleLink(req),
});
// UC-04: Trả hồ sơ sau khi đã liên kết Google.
export const link = async (req, res) => res.json({
  success: true,
  message: 'Đã liên kết Google và cập nhật email đăng nhập. Các phiên trên thiết bị khác đã được đăng xuất.',
  data: { user: await linkGoogle(req) },
});

// UC-04: Trả hồ sơ sau khi đã hủy liên kết Google.
export const unlink = async (req, res) => res.json({
  success: true,
  message: 'Đã hủy liên kết Google. Email đăng nhập được giữ nguyên. Bạn có thể liên kết Google khác. Các phiên trên thiết bị khác đã được đăng xuất.',
  data: await unlinkGoogle(req),
});
