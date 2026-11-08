/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 22-10-2026
 * Chức năng: UC-04 - Nhận yêu cầu gửi và xác nhận OTP đổi số điện thoại.
 */

import { requestPhoneChange, confirmPhoneChange } from './phoneChange.service.js';

export const requestOtp = async (req, res) => res.json({
  success: true, message: 'Đã gửi OTP tới email đã liên kết.', data: await requestPhoneChange(req),
});
export const confirmOtp = async (req, res) => res.json({
  success: true, message: 'Đã lưu thay đổi thông tin cá nhân.', data: { user: await confirmPhoneChange(req) },
});
