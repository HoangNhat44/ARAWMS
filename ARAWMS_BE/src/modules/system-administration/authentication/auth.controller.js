import * as authService from './auth.service.js';
import { accountProfile } from '../account-governance/accountProfile.js';

export const login = async (req, res) => {
  const data = await authService.login(req.loginInput, req);
  res.json({ success: true, message: 'Đăng nhập thành công.', data });
};

export const logout = async (req, res) => {
  await authService.logout(req);
  res.json({ success: true, message: 'Đã kết thúc phiên làm việc.' });
};

// Compatibility endpoint used by the existing frontend during session restoration.
export const getMe = (req, res) => res.json({ success: true, data: { user: accountProfile(req.user) } });
