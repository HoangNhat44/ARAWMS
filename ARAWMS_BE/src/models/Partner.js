import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Partners collection – FT-03
 * 2 partnerType: SUPPLIER | CARRIER
 */

const bankSchema = new Schema(
  {
    name: { type: String },
    accountNo: { type: String },
    accountName: { type: String },
  },
  { _id: false }
);

const contactSchema = new Schema(
  {
    person: { type: String },
    phone: { type: String },
    email: { type: String },
  },
  { _id: false }
);

const partnerSchema = new Schema(
  {
    partnerType: { type: String, required: true, enum: ['SUPPLIER', 'CARRIER'] },

    code: { type: String, required: true },
    name: { type: String, required: true },
    isActive: { type: Boolean, required: true, default: true },
    deletedAt: { type: Date },
    note: { type: String },

    // --- SUPPLIER ---
    contactPerson: { type: String },
    phone: { type: String },
    email: { type: String },
    address: { type: String },
    taxCode: { type: String },
    bank: { type: bankSchema },
    paymentTermsDays: { type: Number },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },

    // --- CARRIER ---
    contact: { type: contactSchema },
    trackingUrlTemplate: { type: String },
    codFeeRate: { type: Number, min: 0, max: 1 },
    codStatementFormat: { type: Schema.Types.Mixed },
    integrationId: { type: Schema.Types.ObjectId, ref: 'Config' },
  },
  { timestamps: true, collection: 'partners' }
);

// Indexes
partnerSchema.index({ partnerType: 1, code: 1 }, { unique: true });
partnerSchema.index(
  { partnerType: 1, name: 1 },
  { collation: { locale: 'en', strength: 2 } }
);

const Partner = mongoose.model('Partner', partnerSchema);
export default Partner;
