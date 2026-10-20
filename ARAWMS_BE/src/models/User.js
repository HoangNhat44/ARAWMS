import mongoose from 'mongoose';

const { Schema } = mongoose;

// Sub-schemas
const permissionOverrideSchema = new Schema(
  {
    code: { type: String, required: true },
    granted: { type: Boolean, required: true },
    by: { type: Schema.Types.ObjectId, ref: 'User' },
    at: { type: Date },
  },
  { _id: false }
);

const sessionSchema = new Schema(
  {
    tokenHash: { type: String, required: true },
    loginMethod: { type: String, enum: ['PASSWORD', 'GOOGLE'] },
    ip: { type: String },
    userAgent: { type: String },
    issuedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date },
  },
  { _id: false }
);

const lockSchema = new Schema(
  {
    lockedAt: { type: Date },
    lockedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reason: { type: String },
  },
  { _id: false }
);

const sellerProfileSchema = new Schema(
  {
    isAvailable: { type: Boolean },
    maxConcurrentConversations: { type: Number },
    lastAssignedAt: { type: Date },
  },
  { _id: false }
);

// Main schema
const userSchema = new Schema(
  {
    username: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    passwordHash: { type: String, select: false },
    fullName: { type: String, required: true, trim: true },
    phone: { type: String },
    avatarUrl: { type: String },
    status: {
      type: String,
      required: true,
      enum: ['ACTIVE', 'LOCKED', 'DISABLED'],
      default: 'ACTIVE',
    },
    googleSub: { type: String },
    roles: {
      type: [String],
      required: true,
      validate: {
        validator: (v) => Array.isArray(v) && v.length >= 1,
        message: 'roles phải có ít nhất 1 phần tử',
      },
    },
    warehouseIds: { type: [{ type: Schema.Types.ObjectId, ref: 'Config' }], default: [] },
    permissionOverrides: { type: [permissionOverrideSchema], default: [] },
    mustChangePassword: { type: Boolean },
    failedLoginCount: { type: Number, default: 0 },
    lastLoginAt: { type: Date },
    lock: { type: lockSchema },
    sellerProfile: { type: sellerProfileSchema },
    sessions: {
      type: [sessionSchema],
      default: [],
      validate: {
        validator: (v) => v.length <= 20,
        message: 'sessions không được vượt quá 20 phần tử',
      },
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, collection: 'users' }
);

// Indexes
userSchema.index({ username: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });
userSchema.index({ email: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });
userSchema.index(
  { googleSub: 1 },
  { unique: true, partialFilterExpression: { googleSub: { $type: 'string' } } }
);
userSchema.index(
  { 'sessions.tokenHash': 1 },
  { unique: true, partialFilterExpression: { 'sessions.tokenHash': { $type: 'string' } } }
);
userSchema.index({ roles: 1, status: 1 });
userSchema.index({ 'sellerProfile.isAvailable': 1, 'sellerProfile.lastAssignedAt': 1 });

const User = mongoose.model('User', userSchema);
export default User;
