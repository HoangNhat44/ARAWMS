import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Stock Balances collection – FT-07/08
 * Số dư tồn kho, cập nhật nguyên tử
 */

const stockBalanceSchema = new Schema(
  {
    itemType: { type: String, required: true, enum: ['SKU', 'MATERIAL'] },
    itemId: { type: Schema.Types.ObjectId, required: true },
    itemCode: { type: String },
    warehouseId: { type: Schema.Types.ObjectId, ref: 'Config', required: true },
    locationCode: { type: String, required: true, default: '' },
    onHand: { type: Number, required: true, min: 0, default: 0 },
    reserved: { type: Number, required: true, min: 0, default: 0 },
    available: { type: Number, required: true, min: 0, default: 0 },
    avgCost: { type: Number, required: true, min: 0, default: 0 },
    updatedAt: { type: Date },
  },
  { collection: 'stock_balances' }
);

// Indexes
stockBalanceSchema.index(
  { itemType: 1, itemId: 1, warehouseId: 1, locationCode: 1 },
  { unique: true }
);
stockBalanceSchema.index({ itemType: 1, itemCode: 1 });
stockBalanceSchema.index({ warehouseId: 1, itemType: 1 });

const StockBalance = mongoose.model('StockBalance', stockBalanceSchema);
export default StockBalance;
