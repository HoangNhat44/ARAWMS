import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { ENV } from '../../src/config/env.js';
import Role from '../../src/models/Role.model.js';
import User from '../../src/models/User.model.js';

export async function createTestToken(roleCode, fields = {}) {
  const role = await Role.findOneAndUpdate({ roleCode }, { $setOnInsert: { roleName: roleCode } },
    { new: true, upsert: true });
  const sid = randomUUID();
  const employeeCode = randomUUID().slice(0, 12).toUpperCase();
  const user = await User.create({
    employeeCode, email: `${employeeCode}@example.test`, fullName: roleCode, ...fields,
    roleCode, roleId: role._id, sessions: [{ sessionId: sid, expiresAt: new Date(Date.now() + 3600_000) }],
  });
  return jwt.sign({ sub: String(user._id), sid }, ENV.JWT_SECRET, {
    issuer: 'arawms', audience: 'arawms-web', expiresIn: '1h',
  });
}
