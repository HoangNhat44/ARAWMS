/*
 * File: ProductUnit.js
 * Author: Duy Anh
 * Date: 2026-10-19
 * Description: Models individually labeled finished goods and stock status.
 */
import mongoose from 'mongoose';

const { Schema } = mongoose;

// A physical unit has its own barcode; the SKU barcode identifies the variant.
const productUnitSchema = new Schema({
  barcode: { type: String, required: true, trim: true, unique: true },
  barcodeFormat: { type: String, required: true, enum: ['CODE_128'] },
  barcodeImageUrl: String,
  barcodeImagePublicId: String,
  skuId: { type: Schema.Types.ObjectId, ref: 'Sku', required: true },
  warehouseId: { type: Schema.Types.ObjectId, ref: 'WarehouseLocation', required: true },
  batchId: { type: Schema.Types.ObjectId, ref: 'FinishedGoodsBatch', index: true },
  receivingDocumentId: { type: Schema.Types.ObjectId, ref: 'FinishedGoodsBulkDocument' },
  inventoryStatus: { type: String, required: true, enum: ['AVAILABLE', 'UNAVAILABLE'], default: 'AVAILABLE' },
  packedOrderId: { type: Schema.Types.ObjectId, ref: 'SalesOrder' },
  packedAt: Date,
}, { timestamps: true, collection: 'product_units' });

export default mongoose.model('ProductUnit', productUnitSchema);
