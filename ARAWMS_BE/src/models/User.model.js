/*
 * File: User.model.js
 * Author: Duy Anh & Nguyễn Ngọc Huy
 * Description: Models employee accounts, roles, warehouse assignments, and authentication sessions.
 */
import mongoose from 'mongoose';
import baseSchemaPlugin from './plugins/baseSchema.plugin.js';
import { ROLES } from '../common/constants/enums.js';
import './Role.model.js';

const { Schema } = mongoose;

const userSchema = new Schema(
  {
    employeeCode: { type: String, required: true, unique: true, uppercase: true },
    fullName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, index: true },
    phone: { type: String, trim: true },
    passwordHash: { type: String, select: false },
    googleId: { type: String, sparse: true, index: true },
    googleEmail: { type: String, lowercase: true, trim: true },
    googleLinkedAt: { type: Date },
    emailVerifiedAt: { type: Date },
    googleLinkVersion: { type: Number, default: 0, select: false },
    roleId: { type: Schema.Types.ObjectId, ref: 'Role', required: true, index: true },
    roleCode: { type: String, enum: ROLES, required: true, index: true },
    warehouseIds: { type: [Schema.Types.ObjectId], default: undefined },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE', 'LOCKED'], default: 'ACTIVE', index: true },
    managementVersion: { type: Number, default: 0, min: 0 },
    permissionOverrides: {
      type: [
        {
          _id: false,
          code: { type: String, required: true },
          granted: { type: Boolean, required: true },
          by: { type: Schema.Types.ObjectId, ref: 'User' },
          at: Date,
        },
      ],
      default: [],
    },
    isOnlineForChat: { type: Boolean, default: false, index: true },
    activeChatCount: { type: Number, default: 0 },
    avatarUrl: { type: String },
    lastLoginAt: { type: Date },
    failedLoginAttempts: { type: Number, default: 0, select: false },
    loginLockedUntil: { type: Date, select: false },
    passwordResetRequired: { type: Boolean, default: false, select: false },
    passwordResetTokenHash: { type: String, select: false },
    passwordResetExpiresAt: { type: Date, select: false },
    passwordResetRequestedAt: { type: Date, select: false },
    sessions: {
      type: [
        {
          _id: false,
          sessionId: { type: String, required: true },
          expiresAt: { type: Date, required: true },
        },
      ],
      default: [],
      select: false,
    },
  },
  { collection: 'users' }
);

userSchema.plugin(baseSchemaPlugin);
// Existing warehouse services read an array of roles. Use the authenticated role as its source.
userSchema.virtual('roles').get(function () {
  return this.roleCode ? [this.roleCode] : [];
});
userSchema.index(
  { googleId: 1 },
  {
    name: 'linked_google_identity_unique',
    unique: true,
    partialFilterExpression: { googleId: { $type: 'string' } },
  }
);

const User = mongoose.model('User', userSchema);
export default User;
