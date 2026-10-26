/*
 * File: reset-warehouse-passwords.mjs
 * Author: Duy Anh
 * Date: 2026-10-25
 * Description: Resets active warehouse account passwords from environment values or random values.
 */
import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import User from '../src/models/User.model.js';

const codes = ['QLKHO', 'NVKHO'];
const expectedRoles = {
  QLKHO: 'WAREHOUSE_MANAGER',
  NVKHO: 'WAREHOUSE_STAFF',
};
const suppliedPasswords = {
  QLKHO: process.env.QLKHO_PASSWORD,
  NVKHO: process.env.NVKHO_PASSWORD,
};
const usingSuppliedPasswords = Object.values(suppliedPasswords).some(Boolean);

// Require both supplied passwords to meet the minimum length before changing either account.
if (usingSuppliedPasswords && Object.values(suppliedPasswords).some((password) => typeof password !== 'string' || password.length < 8)) {
  throw new Error('Khi đặt mật khẩu cố định, cần cung cấp cả QLKHO_PASSWORD và NVKHO_PASSWORD (ít nhất 8 ký tự mỗi mật khẩu)');
}

if (!process.env.MONGODB_URI) throw new Error('Thiếu MONGODB_URI');

try {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });

  // Verify both account roles and active status before updating any password.
  const users = await User.find({ employeeCode: { $in: codes }, isDeleted: { $ne: true } });
  for (const code of codes) {
    const user = users.find((item) => item.employeeCode === code);
    if (!user) throw new Error(`Không tìm thấy tài khoản ${code}; hãy chạy script provision-warehouse-accounts.mjs trước`);
    if (user.roleCode !== expectedRoles[code]) throw new Error(`${code} có vai trò không đúng; dừng để tránh đổi mật khẩu tài khoản khác`);
    if (user.status !== 'ACTIVE') throw new Error(`${code} đang bị khóa; cần xử lý trạng thái tài khoản trước`);
  }

  // Recheck account identity and status in each update to avoid changing a reassigned account.
  for (const code of codes) {
    const password = usingSuppliedPasswords ? suppliedPasswords[code] : randomBytes(24).toString('base64url');
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await User.updateOne({ employeeCode: code, roleCode: expectedRoles[code], status: 'ACTIVE', isDeleted: { $ne: true } }, { $set: { passwordHash } });
    if (result.matchedCount !== 1) throw new Error(`Không thể cập nhật ${code}; tài khoản có thể đã thay đổi`);
    console.log(`${code}: ${password}`);
  }
  console.log('Lưu các mật khẩu trên vào nơi an toàn; script không thể hiển thị lại sau khi thoát.');
} finally {
  await mongoose.disconnect();
}
