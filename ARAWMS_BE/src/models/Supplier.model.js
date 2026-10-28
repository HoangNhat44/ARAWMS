/*
 * File: Supplier.model.js
 * Author: Duy Anh
 * Date: 2026-10-26
 * Description: Defines supplier contact and business records. Supports supplier lookup from procurement and inbound workflows.
 */
import mongoose from 'mongoose';
import baseSchemaPlugin from './plugins/baseSchema.plugin.js';

const { Schema } = mongoose;

const supplierSchema = new Schema(
  {
    supplierCode: { type: String, required: true, unique: true, uppercase: true },
    supplierName: { type: String, required: true },
    taxCode: { type: String },
    contactName: { type: String },
    phone: { type: String, required: true },
    email: { type: String },
    address: { type: String },
    bankInfo: {
      bankName: String,
      accountNo: String,
      accountHolder: String,
    },
    totalPayableDebt: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true },
  },
  { collection: 'suppliers' }
);

supplierSchema.plugin(baseSchemaPlugin);

const Supplier = mongoose.model('Supplier', supplierSchema);
export default Supplier;
