import mongoose from 'mongoose';
import baseSchemaPlugin from './plugins/baseSchema.plugin.js';

const { Schema } = mongoose;

const productSchema = new Schema(
  {
    productCode: { type: String, required: true, unique: true, uppercase: true, index: true },
    productName: { type: String, required: true },
    category: { type: String, required: true },
    season: { type: String },
    basePrice: { type: Number, required: true, min: 0 },
    thumbnailUrl: { type: String },
    isActive: { type: Boolean, default: true },
  },
  { collection: 'products' }
);

productSchema.plugin(baseSchemaPlugin);

// Tối ưu tìm kiếm sản phẩm theo tên và danh mục
productSchema.index({ productName: 1, isActive: 1 });
productSchema.index({ category: 1, isActive: 1 });

const Product = mongoose.model('Product', productSchema);
export default Product;
