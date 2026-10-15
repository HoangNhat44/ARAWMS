import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Inventory Count Items collection – FT-08
 */

const inventoryCountItemSchema = new Schema(
  {
    countId: { type: Schema.Types.ObjectId, ref: 'InventoryCount', required: true },
    itemType: { type: String, required: true, enum: ['SKU', 'MATERIAL'] },
    itemId: { type: Schema.Types.ObjectId, required: true },
    itemCode: { type: String },
    fabricRollId: { type: Schema.Types.ObjectId, ref: 'FabricRoll' },
    locationCode: { type: String },
    systemQty: { type: Number, required: true },
    countedQty: { type: Number },
    varianceQty: { type: Number },
    unitCost: { type: Number, min: 0 },
    needsRecount: { type: Boolean },
    countedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    countedAt: { type: Date },
    note: { type: String },
  },
  { collection: 'inventory_count_items' }
);

// Indexes
inventoryCountItemSchema.index({ countId: 1 });
inventoryCountItemSchema.index({ countId: 1, varianceQty: 1 });

const InventoryCountItem = mongoose.model('InventoryCountItem', inventoryCountItemSchema);
export default InventoryCountItem;
