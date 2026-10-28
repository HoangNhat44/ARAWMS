import mongoose from 'mongoose';
import baseSchemaPlugin from './plugins/baseSchema.plugin.js';

const { Schema } = mongoose;

const skuSchema = new Schema(
  {
    skuCode: { type: String, required: true, unique: true, uppercase: true, index: true },
    skuBarcode: { type: String, required: true, unique: true, index: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    styleName: { type: String, required: true },
    color: { type: String, required: true },
    size: { type: String, enum: ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'FREESIZE'], required: true },
    retailPrice: { type: Number, required: true, min: 0 },
    unitCogs: { type: Number, required: true, default: 0, min: 0 },
    onHandQty: { type: Number, default: 0, min: 0 },
    reservedQty: { type: Number, default: 0, min: 0 },
    defectQuarantineQty: { type: Number, default: 0, min: 0 },
    safetyStockThreshold: { type: Number, default: 10 },
    fifoAgingThresholdDays: { type: Number, default: 60 },
    isActive: { type: Boolean, default: true },
  },
  {
    collection: 'skus',
    optimisticConcurrency: true,
    versionKey: 'version',
  }
);

skuSchema.virtual('availableQty').get(function () {
  return (this.onHandQty || 0) - (this.reservedQty || 0);
});

skuSchema.plugin(baseSchemaPlugin);

// Compound indexes tối ưu widget tra cứu tồn kho thời gian thực (UC-77)
skuSchema.index({ isActive: 1, onHandQty: -1, styleName: 1 });
skuSchema.index({ styleName: 1, color: 1, size: 1 });

const Sku = mongoose.model('Sku', skuSchema);
export default Sku;
