import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Inventory Alerts collection – FT-08
 * Cảnh báo tồn thấp/cao
 */

const inventoryAlertSchema = new Schema(
  {
    itemType: { type: String, required: true, enum: ['SKU', 'MATERIAL'] },
    itemId: { type: Schema.Types.ObjectId, required: true },
    itemCode: { type: String },
    alertType: {
      type: String,
      required: true,
      enum: ['LOW_STOCK', 'BELOW_SAFETY', 'OVERSTOCK', 'OUT_OF_STOCK'],
    },
    currentQty: { type: Number },
    thresholdQty: { type: Number },
    status: {
      type: String,
      required: true,
      enum: ['OPEN', 'ACKNOWLEDGED', 'RESOLVED'],
    },
    isActive: { type: Boolean, required: true, default: true },
    acknowledgedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    acknowledgedAt: { type: Date },
    resolvedAt: { type: Date },
  },
  { timestamps: true, collection: 'inventory_alerts' }
);

// Indexes
inventoryAlertSchema.index(
  { itemType: 1, itemId: 1, alertType: 1 },
  { unique: true, partialFilterExpression: { isActive: true } }
);
inventoryAlertSchema.index({ isActive: 1, createdAt: -1 });

const InventoryAlert = mongoose.model('InventoryAlert', inventoryAlertSchema);
export default InventoryAlert;
