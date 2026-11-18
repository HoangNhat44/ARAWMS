/*
 * File: Product.model.js
 * Author: Duy Anh
 * Date: 2026-10-21
 * Description: Models product catalog entries and their media.
 */
import mongoose from 'mongoose';
import baseSchemaPlugin from './plugins/baseSchema.plugin.js';

const { Schema } = mongoose;

const productSchema = new Schema(
  {
    productCode: { type: String, required: true, unique: true, uppercase: true, index: true },
    productName: { type: String, required: true },
    description: { type: String, maxlength: 2000 },
    additionalImageUrls: [{ type: String }],
    configurationRequestId: { type: String, unique: true, sparse: true },
    // DEPRECATED: productCode is the only product code. Never written by new code; legacy values are
    // moved into productCode and removed by scripts/migrate-product-codes.mjs.
    // TODO(xóa sampleCode): drop this field and the index below after the migration.
    sampleCode: { type: String, trim: true, uppercase: true },
    category: { type: String, required: true },
    season: { type: String },
    basePrice: { type: Number, required: true, min: 0 },
    thumbnailUrl: { type: String },
    imagePublicId: { type: String },
    videoUrl: { type: String },
    videoPublicId: { type: String },
    mediaOperations: [{ ownerUserId: Schema.Types.ObjectId, operationId: String,
      sha256: String, kind: String, url: String }],
    isActive: { type: Boolean, default: true },
    // Set the first time the product becomes ACTIVE; productCode can no longer change afterwards.
    codeLockedAt: { type: Date, default: null },
  },
  { collection: 'products', optimisticConcurrency: true, versionKey: 'version' }
);

productSchema.plugin(baseSchemaPlugin);
productSchema.index({ sampleCode: 1 }, { unique: true,
  partialFilterExpression: { sampleCode: { $gt: '' } } });

// Tối ưu tìm kiếm sản phẩm theo tên và danh mục
productSchema.index({ productName: 1, isActive: 1 });
productSchema.index({ category: 1, isActive: 1 });

const Product = mongoose.model('Product', productSchema);
export default Product;
