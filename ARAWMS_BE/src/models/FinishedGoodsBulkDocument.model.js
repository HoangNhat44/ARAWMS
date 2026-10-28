/*
 * File: FinishedGoodsBulkDocument.model.js
 * Author: Duy Anh
 * Date: 2026-10-22
 * Description: Models bulk finished goods stock documents.
 */
import mongoose from 'mongoose';
import baseSchemaPlugin from './plugins/baseSchema.plugin.js';

const { Schema } = mongoose;
const bulkDocumentSchema = new Schema({
  documentCode: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
  direction: { type: String, required: true, enum: ['IN', 'OUT'] },
  items: [{
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    skuId: { type: Schema.Types.ObjectId, ref: 'Sku', required: true },
    expectedQty: { type: Number, min: 0 },
    quantity: { type: Number, required: true, min: 0 },
    receivedQty: { type: Number, min: 0 },
    repairQty: { type: Number, min: 0 },
    repairStatus: { type: String, enum: ['WAITING_RETURN', 'RESOLVED'] },
    barcodes: [{ type: String }],
  }],
  locationId: { type: Schema.Types.ObjectId, ref: 'WarehouseLocation' },
  totalQuantity: { type: Number, required: true, min: 0 },
  putawayReservationEpoch: { type: Number, default: 0 },
  confirmationKey: { type: String },
  confirmationHash: String,
  note: { type: String, maxlength: 500 },
  createdByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { collection: 'finished_goods_bulk_documents' });

bulkDocumentSchema.plugin(baseSchemaPlugin);
bulkDocumentSchema.index({ confirmationKey: 1 }, { unique: true, partialFilterExpression: { confirmationKey: { $type: 'string' } } });
export default mongoose.model('FinishedGoodsBulkDocument', bulkDocumentSchema);
