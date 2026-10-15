import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Config collection – FT-02
 * 9 loại phân biệt bằng `kind`:
 * SETTING | COUNTER | ROLE | UNIT | WAREHOUSE | DOC_TEMPLATE | RETURN_POLICY | INTEGRATION | FIN_CATEGORY
 */

const surchargeRuleSchema = new Schema(
  {
    reasonCode: { type: String, required: true },
    description: { type: String },
    rate: { type: Number, min: 0, max: 1 },
    fixedAmount: { type: Number, min: 0 },
    isActive: { type: Boolean },
  },
  { _id: false }
);

const locationSchema = new Schema(
  {
    code: { type: String, required: true },
    name: { type: String },
    type: { type: String, enum: ['ZONE', 'AISLE', 'RACK', 'SHELF', 'BIN'] },
    parentCode: { type: String },
    capacity: { type: Number, min: 0 },
    isActive: { type: Boolean },
  },
  { _id: false }
);

const configSchema = new Schema(
  {
    kind: {
      type: String,
      required: true,
      enum: [
        'SETTING',
        'COUNTER',
        'ROLE',
        'UNIT',
        'WAREHOUSE',
        'DOC_TEMPLATE',
        'RETURN_POLICY',
        'INTEGRATION',
        'FIN_CATEGORY',
      ],
    },

    // --- SETTING ---
    value: { type: Schema.Types.Mixed },
    group: { type: String },
    description: { type: String },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },

    // --- COUNTER ---
    prefix: { type: String },
    seq: { type: Number },

    // --- ROLE ---
    code: { type: String },
    name: { type: String },
    isSystem: { type: Boolean },
    permissions: { type: [String] },

    // --- UNIT ---
    unitType: { type: String, enum: ['LENGTH', 'WEIGHT', 'COUNT', 'AREA', 'VOLUME'] },
    baseUnitCode: { type: String },
    conversionFactor: { type: Number, min: 0 },
    isActive: { type: Boolean },

    // --- WAREHOUSE ---
    warehouseType: {
      type: String,
      enum: ['RAW_MATERIAL', 'FINISHED_GOODS', 'DEFECTIVE', 'WIP', 'RETURNS'],
    },
    address: { type: String },
    isSellable: { type: Boolean },
    locations: { type: [locationSchema], default: undefined },

    // --- DOC_TEMPLATE ---
    templateType: {
      type: String,
      enum: [
        'FABRIC_ROLL_LABEL',
        'SKU_LABEL',
        'WAYBILL_LABEL',
        'SHIPPING_DOCUMENT',
        'PARCEL_HANDOVER_REPORT',
        'MATERIAL_RECEIPT',
        'MATERIAL_ISSUE_SLIP',
        'PICK_LIST',
        'OTHER',
      ],
    },
    paperSize: { type: String },
    fields: { type: [String], default: undefined },
    content: { type: String },
    isDefault: { type: Boolean },

    // --- RETURN_POLICY ---
    returnWindowDays: { type: Number },
    allowExchange: { type: Boolean },
    allowRefund: { type: Boolean },
    defaultSurchargeRate: { type: Number, min: 0, max: 1 },
    shippingFeePayer: { type: String, enum: ['CUSTOMER', 'SHOP', 'SHARED'] },
    surchargeRules: { type: [surchargeRuleSchema], default: undefined },
    effectiveFrom: { type: Date },
    effectiveTo: { type: Date },

    // --- INTEGRATION ---
    provider: {
      type: String,
      enum: [
        'FACEBOOK_MESSENGER',
        'GHN',
        'GHTK',
        'VIETTEL_POST',
        'GOOGLE_OAUTH',
        'OTHER',
      ],
    },
    externalId: { type: String },
    config: { type: Schema.Types.Mixed },
    secretEncrypted: { type: String },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE', 'ERROR'] },
    lastCheckedAt: { type: Date },
    lastError: { type: String },

    // --- FIN_CATEGORY ---
    flowType: { type: String, enum: ['INCOME', 'EXPENSE'] },
    parentCode: { type: String },
  },
  { timestamps: true, collection: 'config' }
);

// Indexes
configSchema.index(
  { kind: 1, code: 1 },
  { unique: true, partialFilterExpression: { code: { $type: 'string' } } }
);
configSchema.index(
  { templateType: 1 },
  {
    unique: true,
    partialFilterExpression: { kind: 'DOC_TEMPLATE', isDefault: true },
  }
);
configSchema.index(
  { provider: 1, externalId: 1 },
  { unique: true, partialFilterExpression: { externalId: { $type: 'string' } } }
);

const Config = mongoose.model('Config', configSchema);
export default Config;
