import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Customers collection – FT-09
 */

const addressSchema = new Schema(
  {
    recipientName: { type: String, required: true },
    phone: { type: String, required: true },
    province: { type: String },
    district: { type: String },
    ward: { type: String },
    addressLine: { type: String, required: true },
    isDefault: { type: Boolean },
  },
  { _id: false }
);

const channelAccountSchema = new Schema(
  {
    integrationId: { type: Schema.Types.ObjectId, ref: 'Config', required: true },
    externalUserId: { type: String, required: true },
    displayName: { type: String },
    profilePicUrl: { type: String },
  },
  { _id: false }
);

const customerNoteSchema = new Schema(
  {
    note: { type: String, required: true },
    by: { type: Schema.Types.ObjectId, ref: 'User' },
    at: { type: Date, required: true },
  },
  { _id: false }
);

const customerSchema = new Schema(
  {
    code: { type: String, required: true, trim: true },
    fullName: { type: String, required: true, trim: true },
    phone: { type: String },
    email: { type: String },
    gender: { type: String },
    birthday: { type: Date },
    note: { type: String },
    addresses: { type: [addressSchema], default: [] },
    channelAccounts: { type: [channelAccountSchema], default: [] },
    notes: { type: [customerNoteSchema], default: [] },
    stats: {
      firstOrderAt: { type: Date },
      totalOrders: { type: Number },
      totalSpent: { type: Number, min: 0 },
    },
    isBlocked: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, collection: 'customers' }
);

// Indexes
customerSchema.index({ code: 1 }, { unique: true });
customerSchema.index({ phone: 1 });
customerSchema.index({ fullName: 1 }, { collation: { locale: 'en', strength: 2 } });
customerSchema.index(
  { 'channelAccounts.integrationId': 1, 'channelAccounts.externalUserId': 1 },
  {
    unique: true,
    partialFilterExpression: { 'channelAccounts.externalUserId': { $type: 'string' } },
  }
);

const Customer = mongoose.model('Customer', customerSchema);
export default Customer;
