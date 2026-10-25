import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { ENV } from '../src/config/env.js';
import User from '../src/models/User.model.js';

// Mặc định chỉ xem; --apply chỉ cấp mật khẩu cho Owner chưa có mật khẩu.
const apply = process.argv.includes('--apply');
try {
  await mongoose.connect(ENV.MONGODB_URI, { autoIndex: false });
  const owners = await User.find({ roleCode: 'OWNER', isDeleted: { $ne: true } })
    .select('+passwordHash').populate('roleId');
  if (!owners.length) throw new Error('Không tìm thấy Owner. Không tự tạo tài khoản quản trị.');
  for (const owner of owners) {
    console.log(JSON.stringify({
      email: owner.email, employeeCode: owner.employeeCode, status: owner.status,
      hasPassword: Boolean(owner.passwordHash), googleLinked: Boolean(owner.googleId),
    }));
    if (!owner.roleId?.isActive || owner.roleId.roleCode !== 'OWNER' || owner.roleId.isDeleted) {
      throw new Error('Role Owner không hợp lệ. Cần kiểm tra trước khi cấp mật khẩu.');
    }
  }
  if (apply) {
    const missing = owners.filter((owner) => !owner.passwordHash);
    const password = process.env.OWNER_INITIAL_PASSWORD;
    if (missing.length && (!password || password.length < 8 || Buffer.byteLength(password, 'utf8') > 72)) {
      throw new Error('Đặt OWNER_INITIAL_PASSWORD có ít nhất 8 ký tự, tối đa 72 byte.');
    }
    // Bảo đảm một Google identity không thể gắn với nhiều tài khoản.
    await User.collection.createIndex({ googleId: 1 }, {
      name: 'linked_google_identity_unique', unique: true,
      partialFilterExpression: { googleId: { $type: 'string' } },
    });
    for (const owner of missing) {
      const result = await User.updateOne({
        _id: owner._id, $or: [{ passwordHash: { $exists: false } }, { passwordHash: null }, { passwordHash: '' }],
      }, { $set: { passwordHash: await bcrypt.hash(password, 12) } });
      console.log(result.modifiedCount ? 'Đã cấp mật khẩu cho Owner chưa có mật khẩu.' : 'Owner đã thay đổi, giữ nguyên mật khẩu.');
    }
  } else console.log('Chỉ xem. Dùng --apply để chuẩn bị đăng nhập Owner.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
