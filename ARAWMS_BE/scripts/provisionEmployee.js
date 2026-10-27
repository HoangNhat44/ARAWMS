/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 22-10-2026
 * Chức năng: Hỗ trợ UC-06 - Cấp tài khoản nhân viên bằng lệnh khi chuẩn bị
 * dữ liệu.
 */

// Người quản lý chạy lệnh này khi cần chuẩn bị tài khoản nhân viên.
import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from '../src/models/User.model.js';
import Role from '../src/models/Role.model.js';
import { ROLES, ROLE_LABELS } from '../src/common/constants/enums.js';

const { STAFF_EMAIL, STAFF_NAME, STAFF_EMPLOYEE_CODE, STAFF_PASSWORD, STAFF_ROLE } = process.env;
try {
  // Hỗ trợ UC-06: Kiểm tra dữ liệu tài khoản nhân viên trước khi tạo.
  if (!STAFF_EMAIL || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(STAFF_EMAIL)
    || !STAFF_NAME?.trim() || !STAFF_EMPLOYEE_CODE?.trim()
    || !STAFF_PASSWORD || STAFF_PASSWORD.length < 8 || Buffer.byteLength(STAFF_PASSWORD) > 72
    || !ROLES.filter((role) => role !== 'OWNER').includes(STAFF_ROLE)) {
    throw new Error('Cần STAFF_EMAIL, STAFF_NAME, STAFF_EMPLOYEE_CODE, STAFF_PASSWORD (8 ký tự đến 72 byte), STAFF_ROLE (vai trò nhân viên, không phải OWNER).');
  }
  if (!process.env.MONGODB_URI) throw new Error('Thiếu MONGODB_URI.');
  await mongoose.connect(process.env.MONGODB_URI);
  const email = STAFF_EMAIL.trim().toLowerCase();
  const employeeCode = STAFF_EMPLOYEE_CODE.trim().toUpperCase();
  if (await User.exists({ $or: [{ email }, { employeeCode }] })) throw new Error('Email hoặc mã nhân viên đã tồn tại. Không ghi đè tài khoản.');
  const role = await Role.findOneAndUpdate({ roleCode: STAFF_ROLE }, { $setOnInsert: {
    roleName: ROLE_LABELS[STAFF_ROLE], isActive: true, isSystemDefault: true,
  } }, { upsert: true, new: true, runValidators: true });
  if (!role.isActive || role.isDeleted) throw new Error('Vai trò này đã bị vô hiệu hóa.');
  // Hỗ trợ UC-06: Mã hóa mật khẩu bằng bcrypt rồi lưu tài khoản nhân viên.
  await User.create({ email, employeeCode, fullName: STAFF_NAME.trim(),
    passwordHash: await bcrypt.hash(STAFF_PASSWORD, 12), roleId: role._id, roleCode: STAFF_ROLE });
  console.log('Đã tạo tài khoản nhân viên. Không có tài khoản Owner hoặc mật khẩu mẫu được tạo tự động.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
