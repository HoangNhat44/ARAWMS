import mongoose from 'mongoose';
import baseSchemaPlugin from './plugins/baseSchema.plugin.js';

const { Schema } = mongoose;

const customerAddressSchema = new Schema(
  {
    recipientName: String,
    phone: String,
    fullAddress: String,
    isDefault: Boolean,
  },
  { _id: false }
);

const customerSchema = new Schema(
  {
    customerCode: { type: String, required: true, unique: true },
    facebookPsid: { type: String, unique: true, sparse: true, index: true },
    fullName: { type: String, required: true, trim: true },
    phone: { type: String, index: true },
    email: { type: String },
    addresses: [customerAddressSchema],
    tags: [String],
    totalOrders: { type: Number, default: 0 },
    totalSpent: { type: Number, default: 0 },
  },
  { collection: 'customers' }
);

customerSchema.plugin(baseSchemaPlugin);

const Customer = mongoose.model('Customer', customerSchema);
export default Customer;
