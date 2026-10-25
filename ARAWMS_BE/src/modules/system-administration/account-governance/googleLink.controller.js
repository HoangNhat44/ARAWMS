import { prepareGoogleLink, linkGoogle, unlinkGoogle } from './googleLink.service.js';

export const challenge = async (req, res) => res.json({
  success: true, data: await prepareGoogleLink(req),
});
export const link = async (req, res) => res.json({
  success: true,
  message: 'Đã liên kết tài khoản Google.',
  data: { user: await linkGoogle(req) },
});

export const unlink = async (req, res) => res.json({
  success: true,
  message: 'Đã hủy liên kết Google. Bạn có thể liên kết tài khoản khác. Các phiên trên thiết bị khác đã được đăng xuất.',
  data: { user: await unlinkGoogle(req) },
});
