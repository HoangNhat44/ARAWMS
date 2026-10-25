import { googleConfig, issueChallenge } from './googleIdentity.service.js';
import { loginWithGoogle } from './googleAuth.service.js';

export const config = (req, res) => res.json({ success: true, data: googleConfig() });
export const challenge = async (req, res) => res.json({ success: true, data: await issueChallenge('LOGIN') });
export const login = async (req, res) => res.json({
  success: true, message: 'Đăng nhập Google thành công.', data: await loginWithGoogle(req),
});
