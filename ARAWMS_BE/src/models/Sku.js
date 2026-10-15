import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * SKUs collection – FT-03
 * Mỗi document = một biến thể màu/size
 */

const skuSchema = new Schema(
  {
    skuCode: { type: String, required: true, trim: true },
    productCode: { type: String, required: true, trim: true },
    productName: { type: String, required: true, trim: true },
    categoryPath: { type: [String], default: undefined },
    season: {
      type: String,
      enum: ['SUMMER', 'WINTER', 'TET', 'SPRING_AUTUMN', 'ALL_YEAR'],
    },
    description: { type: String },
    color: {
      code: { type: String },
      name: { type: String },
      hex: { type: String },
    },
    size: {
      code: { type: String },
      name: { type: String },
      sortOrder: { type: Number },
    },
    sellingPrice: { type: Number, required: true, min: 0 },
    standardCost: { type: Number, min: 0 },
    weightG: { type: Number, min: 0 },
    limits: {
      min: { type: Number },
      safety: { type: Number },
      max: { type: Number },
    },
    barcodes: { type: [String], default: undefined },
    primaryBarcode: { type: String },
    imageUrl: { type: String },
    isActive: { type: Boolean, required: true, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, collection: 'skus' }
);

// Indexes
skuSchema.index({ skuCode: 1 }, { unique: true });
skuSchema.index({ productCode: 1, 'color.code': 1, 'size.code': 1 }, { unique: true });
skuSchema.index({ categoryPath: 1 });
skuSchema.index({ season: 1, isActive: 1 });
skuSchema.index(
  { barcodes: 1 },
  { unique: true, partialFilterExpression: { barcodes: { $type: 'string' } } }
);

const Sku = mongoose.model('Sku', skuSchema);
export default Sku;
