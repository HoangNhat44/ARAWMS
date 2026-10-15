import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Inventory Counts collection – FT-08
 */

const inventoryCountSchema = new Schema(
  {
    code: { type: String, required: true, trim: true },
    warehouseId: { type: Schema.Types.ObjectId, ref: 'Config', required: true },
    target: { type: String, required: true, enum: ['RAW_MATERIAL', 'FINISHED_GOODS'] },
    scope: { type: String, required: true, enum: ['FULL', 'CYCLE', 'LOCATION', 'ITEM'] },
    scopeFilter: { type: Schema.Types.Mixed },
    status: {
      type: String,
      required: true,
      enum: ['DRAFT', 'COUNTING', 'REVIEW', 'ADJUSTED', 'CLOSED', 'CANCELLED'],
    },
    plannedDate: { type: Date },
    startedAt: { type: Date },
    closedAt: { type: Date },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    note: { type: String },
  },
  { timestamps: true, collection: 'inventory_counts' }
);

// Indexes
inventoryCountSchema.index({ code: 1 }, { unique: true });
inventoryCountSchema.index({ warehouseId: 1, status: 1 });

const InventoryCount = mongoose.model('InventoryCount', inventoryCountSchema);
export default InventoryCount;
