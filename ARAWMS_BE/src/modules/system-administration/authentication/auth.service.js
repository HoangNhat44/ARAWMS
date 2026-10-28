/*
 * File: auth.service.js
 * Author: Duy Anh
 * Date: 2026-10-26
 * Description: Validates login credentials and seller registration against MongoDB, creates signed tokens, and limits authentication responses to public account fields.
 */
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../../../models/User.model.js';
import Role from '../../../models/Role.model.js';

const authError = (message, statusCode, code) => Object.assign(new Error(message), { statusCode, code });

/**
 * Builds the account profile returned by authentication endpoints.
 * The password hash and internal role document are never included in the response.
 *
 * @param {import('mongoose').Document} user - The authenticated or newly registered user.
 * @returns {object} Public identity, role, status, and avatar fields.
 */
export const publicUser = (user) => ({
  id: String(user._id),
  employeeCode: user.employeeCode,
  fullName: user.fullName,
  email: user.email,
  roles: [user.roleCode],
  status: user.status,
  avatarUrl: user.avatarUrl,
});

/**
 * Signs a token containing only the user ID so authorization loads current account data.
 *
 * @param {import('mongoose').Document} user - The account receiving the token.
 * @returns {string} Signed JWT using the configured expiration policy.
 * @throws {Error} When JWT_SECRET is not configured.
 */
const createToken = (user) => {
  if (!process.env.JWT_SECRET) throw new Error('Thiếu cấu hình JWT_SECRET');
  return jwt.sign({ id: String(user._id) }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
};

/**
 * Authenticates an employee by email or employee code without exposing which field failed.
 * A deleted account or mismatched password receives the same 401 response. Locked
 * accounts receive 403 only after their password has been verified.
 *
 * @param {object} credentials - Login fields submitted by the client.
 * @param {string} credentials.usernameOrEmail - Email or employee code, matched without case sensitivity.
 * @param {string} credentials.password - Plaintext password to compare with the stored hash.
 * @returns {Promise<object>} Public account profile and signed JWT.
 * @throws {Error} For missing fields, invalid credentials, or a locked account.
 */
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

/**
 * Registers a seller using the configured active SELLER role.
 * Warehouse employee accounts are provisioned separately and are not created here.
 *
 * @param {object} details - Name, email, and password supplied by the registrant.
 * @returns {Promise<object>} Public account profile and signed JWT.
 * @throws {Error} For invalid input, an existing email, or a missing SELLER role.
 */
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
