import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Stock Movements collection – FT-07/08
 * Sổ cái kho bất biến. quantity có dấu: dương = nhập, âm = xuất.
 */

const stockMovementSchema = new Schema(
  {
    type: {
      type: String,
      required: true,
      enum: [
        'MATERIAL_RECEIPT',
        'MATERIAL_ISSUE',
        'MATERIAL_RETURN',
        'LEFTOVER_RETURN',
        'PRODUCTION_OUTPUT',
        'SALE_HANDOVER',
        'CUSTOMER_RETURN',
        'EXCHANGE_OUT',
        'ADJUSTMENT_IN',
        'ADJUSTMENT_OUT',
        'TRANSFER_IN',
        'TRANSFER_OUT',
        'DEFECT_IN',
        'DEFECT_OUT',
        'SCRAP',
      ],
    },
    movementDate: { type: Date, required: true },
    warehouseId: { type: Schema.Types.ObjectId, ref: 'Config', required: true },
    locationCode: { type: String },
    itemType: { type: String, required: true, enum: ['SKU', 'MATERIAL'] },
    itemId: { type: Schema.Types.ObjectId, required: true },
    itemCode: { type: String },
    fabricRollId: { type: Schema.Types.ObjectId, ref: 'FabricRoll' },
    quantity: { type: Number, required: true },
    unitCost: { type: Number, required: true, min: 0 },
    totalCost: { type: Number },
    ref: {
      type: { type: String },
      id: { type: Schema.Types.ObjectId },
      line: { type: String },
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    note: { type: String },
  },
  { collection: 'stock_movements' }
);

// Indexes
stockMovementSchema.index({ itemType: 1, itemId: 1, movementDate: -1 });
stockMovementSchema.index({ movementDate: -1 });
stockMovementSchema.index({ warehouseId: 1, movementDate: -1 });
stockMovementSchema.index({ 'ref.type': 1, 'ref.id': 1 });
stockMovementSchema.index(
  { 'ref.type': 1, 'ref.id': 1, 'ref.line': 1, type: 1 },
  { unique: true, partialFilterExpression: { 'ref.line': { $type: 'string' } } }
);

const StockMovement = mongoose.model('StockMovement', stockMovementSchema);
export default StockMovement;
