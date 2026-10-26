/*
 * File: provision-warehouse-accounts.mjs
 * Author: Duy Anh
 * Date: 2026-10-22
 * Description: Creates warehouse manager and staff accounts.
 */
import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import Role from '../src/models/Role.model.js';
import User from '../src/models/User.model.js';
import SalesOrder from '../src/models/SalesOrder.model.js';
import WarehouseLocation from '../src/models/WarehouseLocation.model.js';

const accounts = [
  { employeeCode: 'QLKHO', fullName: 'Quản lý kho', email: 'warehouse.manager@arawms.local', roleCode: 'WAREHOUSE_MANAGER', roleName: 'Quản lý kho' },
  { employeeCode: 'NVKHO', fullName: 'Nhân viên kho', email: 'warehouse.staff@arawms.local', roleCode: 'WAREHOUSE_STAFF', roleName: 'Nhân viên kho' },
];

if (!process.env.MONGODB_URI) throw new Error('Thiếu MONGODB_URI');

try {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });

  // Refuse conflicting employee codes, emails, or roles before creating either account.
  const existing = await User.find({ $or: accounts.flatMap(({ employeeCode, email }) => [{ employeeCode }, { email }]) }).lean();
  for (const account of accounts) {
    const matching = existing.filter((user) => user.employeeCode === account.employeeCode || user.email === account.email);
    if (matching.some((user) => user.employeeCode !== account.employeeCode || user.email !== account.email || user.roleCode !== account.roleCode)) {
      throw new Error(`Mã hoặc email ${account.employeeCode} đã được dùng cho tài khoản khác`);
    }
  }

  // Grant access to warehouses referenced by reservations or finished goods locations.
  const reservedIds = await SalesOrder.distinct('items.reservation.warehouseId');
  const locations = await WarehouseLocation.find({ isDeleted: { $ne: true } }).select('_id').lean();
  const warehouseIds = [...new Set([...reservedIds, ...locations.map((location) => location._id)].filter((id) => mongoose.isValidObjectId(id)).map(String))];
  for (const account of accounts) {
    const role = await Role.findOneAndUpdate(
      { roleCode: account.roleCode },
      { $setOnInsert: { roleName: account.roleName, isActive: true, isSystemDefault: true } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    if (!role.isActive || role.isDeleted) throw new Error(`Vai trò ${account.roleCode} không hoạt động`);

    // Existing users keep their passwords; reruns only add missing warehouse access.
    if (existing.some((user) => user.employeeCode === account.employeeCode)) {
      await User.updateOne({ employeeCode: account.employeeCode }, { $addToSet: { warehouseIds: { $each: warehouseIds } } });
      console.log(`${account.roleCode}: ${account.employeeCode} (đã tồn tại; giữ nguyên mật khẩu)`);
      continue;
    }

    const password = randomBytes(24).toString('base64url');
    await User.create({
      ...account,
      passwordHash: await bcrypt.hash(password, 12),
      roleId: role._id,
      warehouseIds,
    });
    console.log(`${account.roleCode}: ${account.employeeCode} / ${password}`);
  }
} finally {
  await mongoose.disconnect();
}
