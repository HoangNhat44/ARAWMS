import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';

const authError = (message, statusCode) => Object.assign(new Error(message), { statusCode });

/**
 * Tạo JSON Web Token
 */
const generateToken = (id) => {
  if (!process.env.JWT_SECRET) throw new Error('Thiếu cấu hình JWT_SECRET');
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
};

/**
 * Đăng ký tài khoản người dùng mới
 */
export const registerUser = async ({ username, fullName, email, password }) => {
  const normalizedEmail = email.toLowerCase().trim();
  const normalizedUsername = username.trim();

  // Kiểm tra trùng username hoặc email
  const existingUser = await User.findOne({
    $or: [{ email: normalizedEmail }, { username: normalizedUsername }],
  });

  if (existingUser) {
    if (existingUser.email === normalizedEmail) {
      throw new Error('Email này đã được đăng ký sử dụng');
    }
    throw new Error('Tên đăng nhập (username) này đã tồn tại');
  }

  // Hash mật khẩu
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(password, salt);

  const user = await User.create({
    username: normalizedUsername,
    fullName: fullName.trim(),
    email: normalizedEmail,
    passwordHash,
    roles: ['STAFF'],
    status: 'ACTIVE',
  });

  const token = generateToken(user._id);

  return {
    user: {
      id: user._id,
      username: user.username,
      fullName: user.fullName,
      email: user.email,
      roles: user.roles,
      status: user.status,
    },
    token,
  };
};

/**
 * Đăng nhập người dùng (hỗ trợ nhập email hoặc username)
 */
export const loginUser = async ({ usernameOrEmail, password }) => {
  if (!usernameOrEmail || !password) {
    throw authError('Vui lòng nhập tên đăng nhập/email và mật khẩu', 400);
  }

  const cleanInput = usernameOrEmail.trim();

  // Tìm theo email (lowercase) hoặc username
  const user = await User.findOne({
    $or: [
      { email: cleanInput.toLowerCase() },
      { username: cleanInput },
    ],
  }).select('+passwordHash');

  if (!user || !user.passwordHash) {
    throw authError('Tài khoản hoặc mật khẩu không chính xác', 401);
  }

  // Kiểm tra trạng thái tài khoản
  if (user.status === 'LOCKED') {
    throw authError('Tài khoản của bạn đang tạm thời bị khóa. Vui lòng liên hệ quản trị viên', 403);
  }

  if (user.status === 'DISABLED') {
    throw authError('Tài khoản này đã bị vô hiệu hóa', 403);
  }

  // So sánh mật khẩu
  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isMatch) {
    // Tăng số lần đăng nhập thất bại
    user.failedLoginCount = (user.failedLoginCount || 0) + 1;
    await user.save();
    throw authError('Tài khoản hoặc mật khẩu không chính xác', 401);
  }

  // Reset failedLoginCount và cập nhật lastLoginAt
  user.failedLoginCount = 0;
  user.lastLoginAt = new Date();
  await user.save();

  const token = generateToken(user._id);

  return {
    user: {
      id: user._id,
      username: user.username,
      fullName: user.fullName,
      email: user.email,
      roles: user.roles,
      status: user.status,
      avatarUrl: user.avatarUrl,
    },
    token,
  };
};
