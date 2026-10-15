import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Product Samples collection – FT-04
 */

const productSampleSchema = new Schema(
  {
    code: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    productCode: { type: String },
    status: {
      type: String,
      required: true,
      enum: ['IN_DEVELOPMENT', 'SAMPLE_READY', 'UNDER_REVIEW', 'APPROVED', 'REJECTED'],
    },
    description: { type: String },
    imageUrls: { type: [String], default: [] },
    estimatedCost: { type: Number, min: 0 },
    proposedPrice: { type: Number, min: 0 },
    evaluationNote: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
  },
  { timestamps: true, collection: 'product_samples' }
);

// Indexes
productSampleSchema.index({ code: 1 }, { unique: true });
productSampleSchema.index({ status: 1, createdAt: -1 });

const ProductSample = mongoose.model('ProductSample', productSampleSchema);
export default ProductSample;
