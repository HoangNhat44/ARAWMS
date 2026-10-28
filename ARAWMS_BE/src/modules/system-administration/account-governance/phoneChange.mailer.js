/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 22-10-2026
 * Chức năng: UC-04 - Gửi OTP đổi số điện thoại tới email đã liên kết.
 */

import { ENV } from '../../../config/env.js';
import { createRecoveryTransport } from '../authentication/passwordRecovery.mailer.js';
import { httpError } from '../../../common/utils/httpError.js';

export const sendPhoneChangeOtp = async (email, phone, otp) => {
  const transport = createRecoveryTransport();
  try {
    const result = await transport.sendMail({
      from: ENV.SMTP.FROM, to: email, subject: 'AraWMS - Xác nhận đổi số điện thoại',
      text: `Mã OTP đổi số điện thoại sang ${phone} là: ${otp}\nMã có hiệu lực 5 phút, chỉ dùng một lần.\nKhông chia sẻ mã này. Nếu bạn không yêu cầu, hãy bỏ qua email.`,
    });
    if (!result.accepted?.length) throw new Error('SMTP_RECIPIENT_REJECTED');
  } catch {
    throw httpError(503, 'Chưa gửi được OTP. Vui lòng thử lại sau hoặc kiểm tra cấu hình gửi email.');
  } finally { transport.close(); }
};
