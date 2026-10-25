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
    googleLinkVersion: { type: Number, default: 0, select: false },
    roleId: { type: Schema.Types.ObjectId, ref: 'Role', required: true, index: true },
    roleCode: { type: String, enum: ROLES, required: true, index: true },
    status: { type: String, enum: ['ACTIVE', 'LOCKED'], default: 'ACTIVE', index: true },
    isOnlineForChat: { type: Boolean, default: false, index: true },
    activeChatCount: { type: Number, default: 0 },
    avatarUrl: { type: String },
    lastLoginAt: { type: Date },
    failedLoginAttempts: { type: Number, default: 0, select: false },
    loginLockedUntil: { type: Date, select: false },
    sessions: {
      type: [{
        _id: false,
        sessionId: { type: String, required: true },
        expiresAt: { type: Date, required: true },
      }],
      default: [],
      select: false,
    },
  },
  { collection: 'users' }
);

userSchema.plugin(baseSchemaPlugin);
userSchema.index({ googleId: 1 }, {
  name: 'linked_google_identity_unique', unique: true,
  partialFilterExpression: { googleId: { $type: 'string' } },
});

const User = mongoose.model('User', userSchema);
export default User;
