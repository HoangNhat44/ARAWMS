import mongoose from 'mongoose';
import baseSchemaPlugin from './plugins/baseSchema.plugin.js';

const { Schema } = mongoose;

const supplierSchema = new Schema(
  {
    supplierCode: { type: String, required: true, unique: true, uppercase: true },
    supplierName: { type: String, required: true },
    taxCode: { type: String },
    representativeName: { type: String, default: '' },
    representativeRole: { type: String, default: 'Giám đốc' },
    contactName: { type: String },
    phone: { type: String, required: true },
    email: { type: String },
    address: { type: String },
    supplyCategory: {
      type: String,
      enum: ['FABRIC', 'AUXILIARY', 'BOTH'],
      default: 'BOTH',
    },
    paymentTermDays: { type: Number, default: 30, min: 0 },
    leadTimeDays: { type: Number, default: 7, min: 0 },
    bankInfo: {
      bankName: String,
      accountNo: String,
      accountHolder: String,
      branchName: String,
    },
    notes: { type: String, default: '' },
    totalPayableDebt: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true },
  },
  { collection: 'suppliers' }
);

supplierSchema.plugin(baseSchemaPlugin);

const Supplier = mongoose.model('Supplier', supplierSchema);
export default Supplier;
