import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * COGS Entries collection – FT-12
 * Giá vốn thực tế từng dòng bán. Dòng trả hàng mang số âm.
 */

const cogsEntrySchema = new Schema(
  {
    orderId: { type: Schema.Types.ObjectId, ref: 'SalesOrder', required: true },
    orderCode: { type: String },
    skuId: { type: Schema.Types.ObjectId, ref: 'Sku', required: true },
    channel: {
      type: String,
      required: true,
      enum: ['FACEBOOK', 'SHOPEE', 'TIKTOK_SHOP', 'OTHER'],
    },
    entryType: { type: String, required: true, enum: ['SALE', 'RETURN'] },
    quantity: { type: Number, required: true },
    unitCost: { type: Number, required: true, min: 0 },
    cogsAmount: { type: Number },
    revenueAmount: { type: Number },
    recognizedAt: { type: Date, required: true },
  },
  { collection: 'cogs_entries' }
);

// Indexes
cogsEntrySchema.index({ recognizedAt: 1 });
cogsEntrySchema.index({ skuId: 1, recognizedAt: 1 });
cogsEntrySchema.index({ orderId: 1 });

const CogsEntry = mongoose.model('CogsEntry', cogsEntrySchema);
export default CogsEntry;
