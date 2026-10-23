import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../../../models/User.model.js';
import Role from '../../../models/Role.model.js';

const authError = (message, statusCode, code) => Object.assign(new Error(message), { statusCode, code });

export const publicUser = (user) => ({
  id: String(user._id),
  employeeCode: user.employeeCode,
  fullName: user.fullName,
  email: user.email,
  roles: [user.roleCode],
  status: user.status,
  avatarUrl: user.avatarUrl,
});

const createToken = (user) => {
  if (!process.env.JWT_SECRET) throw new Error('Thiếu cấu hình JWT_SECRET');
  return jwt.sign({ id: String(user._id) }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
};

export const loginUser = async ({ usernameOrEmail, password } = {}) => {
  if (typeof usernameOrEmail !== 'string' || !usernameOrEmail.trim() || typeof password !== 'string' || !password) {
    throw authError('Vui lòng nhập email hoặc mã nhân viên và mật khẩu', 400, 'INVALID_INPUT');
  }

  const input = usernameOrEmail.trim();
  const user = await User.findOne({
    $or: [{ email: input.toLowerCase() }, { employeeCode: input.toUpperCase() }],
    isDeleted: { $ne: true },
  }).select('+passwordHash');

  if (!user || !user.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
    throw authError('Tài khoản hoặc mật khẩu không chính xác', 401, 'INVALID_CREDENTIALS');
  }
  if (user.status !== 'ACTIVE') throw authError('Tài khoản đang bị khóa', 403, 'ACCOUNT_LOCKED');

  user.lastLoginAt = new Date();
  await user.save();
  return { user: publicUser(user), token: createToken(user) };
};

export const registerUser = async ({ name, fullName, email, password } = {}) => {
  const cleanName = typeof (fullName || name) === 'string' ? (fullName || name).trim() : '';
  const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!cleanName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) || typeof password !== 'string' || password.length < 8) {
    throw authError('Nhập họ tên, email hợp lệ và mật khẩu ít nhất 8 ký tự', 400, 'INVALID_INPUT');
  }
  if (await User.exists({ email: cleanEmail })) {
    throw authError('Email này đã được đăng ký', 409, 'EMAIL_EXISTS');
  }

  const role = await Role.findOne({ roleCode: 'SELLER', isActive: true, isDeleted: { $ne: true } });
  if (!role) throw authError('Chưa cấu hình vai trò cho tài khoản mới', 503, 'ROLE_NOT_CONFIGURED');

  try {
    const user = await User.create({
      employeeCode: `SELF-${randomUUID().slice(0, 12)}`,
      fullName: cleanName,
      email: cleanEmail,
      passwordHash: await bcrypt.hash(password, 10),
      roleId: role._id,
      roleCode: role.roleCode,
    });
    return { user: publicUser(user), token: createToken(user) };
  } catch (error) {
    if (error.code === 11000) throw authError('Email này đã được đăng ký', 409, 'EMAIL_EXISTS');
    throw error;
  }
};
