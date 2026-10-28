/*
 * File: provision-warehouse-accounts.mjs
 * Author: Duy Anh
 * Date: 2026-10-22
 * Description: Provisions the warehouse manager and staff in MongoDB Atlas. Validates account identity and role, grants current warehouse access, and preserves existing passwords on reruns.
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

  // Reject a reused code or email before writing roles or users so neither warehouse
  // account can silently take over a different employee identity.
  const existing = await User.find({ $or: accounts.flatMap(({ employeeCode, email }) => [{ employeeCode }, { email }]) }).lean();
  for (const account of accounts) {
    const matching = existing.filter((user) => user.employeeCode === account.employeeCode || user.email === account.email);
    if (matching.some((user) => user.employeeCode !== account.employeeCode || user.email !== account.email || user.roleCode !== account.roleCode)) {
      throw new Error(`Mã hoặc email ${account.employeeCode} đã được dùng cho tài khoản khác`);
    }
  }

  // Include warehouses from both order reservations and location records. Existing
  // accounts receive newly discovered access without changing their credentials.
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

    // Provisioning is safe to rerun: an existing employee keeps the stored password
    // hash while newly discovered warehouse IDs are added to their access list.
    if (existing.some((user) => user.employeeCode === account.employeeCode)) {
      await User.updateOne({ employeeCode: account.employeeCode }, { $addToSet: { warehouseIds: { $each: warehouseIds } } });
      console.log(`${account.roleCode}: ${account.employeeCode} (đã tồn tại; giữ nguyên mật khẩu)`);
      continue;
    }

    // Generate credentials only for a missing account. A later server restart or
    // provisioning run must never replace a password already stored in MongoDB.
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
