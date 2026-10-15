import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Defective Stock collection – FT-08
 */

const defectiveStockSchema = new Schema(
  {
    skuId: { type: Schema.Types.ObjectId, ref: 'Sku', required: true },
    skuCode: { type: String },
    warehouseId: { type: Schema.Types.ObjectId, ref: 'Config', required: true },
    locationCode: { type: String },
    sourceType: {
      type: String,
      required: true,
      enum: ['PRODUCTION', 'CUSTOMER_RETURN', 'WAREHOUSE_DAMAGE', 'STOCKTAKE'],
    },
    sourceId: { type: Schema.Types.ObjectId },
    quantity: { type: Number, required: true, min: 1 },
    defectReason: { type: String, required: true },
    status: {
      type: String,
      required: true,
      enum: ['QUARANTINED', 'REPAIRING', 'REPAIRED', 'LIQUIDATED', 'DESTROYED'],
    },
    unitCost: { type: Number, min: 0 },
    receivedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    receivedAt: { type: Date },
    note: { type: String },
  },
  { timestamps: true, collection: 'defective_stock' }
);

// Indexes
defectiveStockSchema.index({ skuId: 1, status: 1 });
defectiveStockSchema.index({ status: 1, receivedAt: -1 });

const DefectiveStock = mongoose.model('DefectiveStock', defectiveStockSchema);
export default DefectiveStock;
