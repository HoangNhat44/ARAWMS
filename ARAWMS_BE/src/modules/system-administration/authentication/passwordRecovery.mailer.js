/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 22-10-2026
 * Chức năng: Hỗ trợ UC-01, GBR-02 - Kiểm tra SMTP và gửi email đặt lại mật
 * khẩu.
 */

import nodemailer from 'nodemailer';
import { ENV } from '../../../config/env.js';
import { httpError } from '../../../common/utils/httpError.js';

// GBR-02: Kiểm tra cấu hình SMTP và địa chỉ FE dùng trong liên kết khôi phục.
export const recoveryMailConfig = () => {
  const smtp = ENV.SMTP;
  let clientUrl;
  try { clientUrl = new URL(ENV.CLIENT_URL); } catch { /* Báo lỗi cấu hình bên dưới. */ }
  if (!smtp.HOST || !smtp.FROM || !Number.isInteger(smtp.PORT) || smtp.PORT < 1 || smtp.PORT > 65535
    || Boolean(smtp.USER) !== Boolean(smtp.PASS)
    || !clientUrl || !['http:', 'https:'].includes(clientUrl.protocol) || clientUrl.username || clientUrl.password
    || (ENV.NODE_ENV === 'production' && clientUrl.protocol !== 'https:')) {
    throw httpError(503, 'Chức năng gửi email chưa được cấu hình. Vui lòng thử lại sau.');
  }
  return { smtp, clientUrl };
};

/*
 * GBR-02: Tạo kết nối gửi thư; mật khẩu ứng dụng Gmail được bỏ khoảng trắng
 * chia nhóm.
 */
export const createRecoveryTransport = () => {
  const { smtp } = recoveryMailConfig();
  // Google hiển thị mật khẩu ứng dụng theo nhóm 4 ký tự khi sao chép.
  const password = smtp.HOST.toLowerCase() === 'smtp.gmail.com' && smtp.PASS.replace(/\s/g, '').length === 16
    ? smtp.PASS.replace(/\s/g, '') : smtp.PASS;
  return nodemailer.createTransport({
    host: smtp.HOST, port: smtp.PORT, secure: smtp.SECURE,
    ...(smtp.USER ? { auth: { user: smtp.USER, pass: password } } : {}),
    requireTLS: ENV.NODE_ENV === 'production' && !smtp.SECURE,
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
    disableFileAccess: true, disableUrlAccess: true,
  });
};

/*
 * GBR-02: Kiểm tra kết nối và đăng nhập SMTP trước khi báo đã nhận yêu cầu gửi
 * email.
 */
export const verifyRecoveryMail = async () => {
  const transport = createRecoveryTransport();
  try { await transport.verify(); }
  catch (error) {
    console.warn('[Authentication] SMTP verification failed:', error.code || 'SMTP_ERROR', error.responseCode || '');
    if (error.code === 'EAUTH') {
      throw httpError(503, 'Không xác thực được tài khoản gửi email. Kiểm tra SMTP_USER và mật khẩu ứng dụng SMTP_PASS trên BE.');
    }
    throw httpError(503, 'Không kết nối được máy chủ gửi email. Vui lòng thử lại sau.');
  } finally { transport.close(); }
};

// GBR-02: Gửi liên kết khôi phục tới email đã đăng ký của tài khoản.
export const sendRecoveryEmail = async (email, token) => {
  const { smtp, clientUrl } = recoveryMailConfig();
  const link = new URL('/reset-password', clientUrl);
  // Fragment không bị gửi tới server hoặc ghi trong access log khi mở trang.
  link.hash = new URLSearchParams({ token }).toString();
  const transport = createRecoveryTransport();
  try {
    const result = await transport.sendMail({
      from: smtp.FROM, to: email, subject: 'AraWMS - Đặt lại mật khẩu',
      text: [
        'Bạn vừa yêu cầu đặt lại mật khẩu AraWMS.',
        'Mở liên kết sau để chọn mật khẩu mới. Liên kết chỉ dùng một lần và hết hạn sau 15 phút:',
        link.toString(), '',
        'Nếu bạn không gửi yêu cầu này, hãy bỏ qua email. Mật khẩu hiện tại chưa thay đổi.',
      ].join('\n'),
    });
    if (!result.accepted?.length) throw new Error('SMTP did not accept the recipient');
  } finally { transport.close(); }
};
