/*
 * File: User.model.js
 * Author: Duy Anh
 * Date: 2026-10-21
 * Description: Models employee accounts, roles, and warehouse assignments.
 */
import mongoose from 'mongoose';
import baseSchemaPlugin from './plugins/baseSchema.plugin.js';
import { ROLES } from '../common/constants/enums.js';

const { Schema } = mongoose;

const userSchema = new Schema(
  {
    employeeCode: { type: String, required: true, unique: true, uppercase: true },
    fullName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, index: true },
    phone: { type: String, trim: true },
    passwordHash: { type: String, select: false },
    googleId: { type: String, sparse: true, index: true },
    roleId: { type: Schema.Types.ObjectId, ref: 'Role', required: true, index: true },
    roleCode: { type: String, enum: ROLES, required: true, index: true },
    warehouseIds: [{ type: Schema.Types.ObjectId, ref: 'WarehouseLocation' }],
    status: { type: String, enum: ['ACTIVE', 'LOCKED'], default: 'ACTIVE', index: true },
    isOnlineForChat: { type: Boolean, default: false, index: true },
    activeChatCount: { type: Number, default: 0 },
    avatarUrl: { type: String },
    lastLoginAt: { type: Date },
  },
  { collection: 'users' }
);

userSchema.plugin(baseSchemaPlugin);

const User = mongoose.model('User', userSchema);
export default User;
