import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Financial Periods collection – FT-12
 * Kỳ tài chính theo tháng
 */

const valuationItemSchema = new Schema(
  {
    warehouseId: { type: Schema.Types.ObjectId, ref: 'Config', required: true },
    itemType: { type: String, required: true, enum: ['SKU', 'MATERIAL'] },
    itemId: { type: Schema.Types.ObjectId, required: true },
    itemCode: { type: String },
    quantity: { type: Number, required: true },
    unitCost: { type: Number, required: true, min: 0 },
    totalValue: { type: Number },
  },
  { _id: false }
);

const financialPeriodSchema = new Schema(
  {
    year: { type: Number, required: true, min: 2000 },
    month: { type: Number, required: true, min: 1, max: 12 },
    status: { type: String, required: true, enum: ['OPEN', 'CLOSED'] },
    closedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    closedAt: { type: Date },
    pnl: {
      revenue: { type: Number },
      returnsAmount: { type: Number },
      cogs: { type: Number },
      grossProfit: { type: Number },
      operatingExpenses: { type: Number },
      otherIncome: { type: Number },
      netProfit: { type: Number },
      cashOpening: { type: Number },
      cashClosing: { type: Number },
      rawMaterialValue: { type: Number },
      finishedGoodsValue: { type: Number },
      supplierPayables: { type: Number },
      detail: { type: Schema.Types.Mixed },
      generatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
      generatedAt: { type: Date },
    },
    valuation: {
      type: [valuationItemSchema],
      default: [],
      validate: {
        validator: (v) => v.length <= 30000,
        message: 'valuation không được vượt quá 30000 phần tử',
      },
    },
  },
  { timestamps: true, collection: 'financial_periods' }
);

// Indexes
financialPeriodSchema.index({ year: 1, month: 1 }, { unique: true });

const FinancialPeriod = mongoose.model('FinancialPeriod', financialPeriodSchema);
export default FinancialPeriod;
