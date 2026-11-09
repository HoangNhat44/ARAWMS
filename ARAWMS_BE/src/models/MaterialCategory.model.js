/**
 * ============================================================================
 * @title        : Material Category Model
 * @author       : AraWMS Team
 * @createdDate  : 2026-11-09
 * @lastModified : 2026-11-09
 * @description  : Định nghĩa danh mục phân loại nguyên phụ liệu (vải cuộn, chỉ may, nút cúc, khóa kéo...),
 *                 hỗ trợ quản lý động thêm/sửa/xóa danh mục với ràng buộc toàn vẹn dữ liệu.
 * @module       : Master Data / Raw Materials
 * @layer        : Model
 * ============================================================================
 */

import mongoose from 'mongoose';
import baseSchemaPlugin from './plugins/baseSchema.plugin.js';

const { Schema } = mongoose;

const materialCategorySchema = new Schema(
  {
    categoryCode: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    categoryName: {
      type: String,
      required: true,
      trim: true,
    },
    materialType: {
      type: String,
      enum: ['FABRIC', 'AUXILIARY'],
      required: true,
      index: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    displayOrder: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    collection: 'material_categories',
    timestamps: true,
  }
);

materialCategorySchema.plugin(baseSchemaPlugin);

const MaterialCategory = mongoose.model('MaterialCategory', materialCategorySchema);
export default MaterialCategory;

