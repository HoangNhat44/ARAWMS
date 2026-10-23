import { accountProfile } from './accountProfile.js';
import * as service from './accountGovernance.service.js';

export const getOwnAccount = (req, res) => res.json({ success: true, data: { user: accountProfile(req.user) } });

export const updateOwnAccount = async (req, res) => {
  const user = await service.updateProfile(req);
  res.json({ success: true, message: 'Đã cập nhật thông tin cá nhân.', data: { user } });
};

export const changeOwnPassword = async (req, res) => {
  await service.changePassword(req);
  res.json({ success: true, message: 'Đã đổi mật khẩu và kết thúc tất cả phiên đăng nhập. Vui lòng đăng nhập lại.' });
};
