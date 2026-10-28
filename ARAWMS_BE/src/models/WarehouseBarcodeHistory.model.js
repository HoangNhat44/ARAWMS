/*
 * File: WarehouseBarcodeHistory.model.js
 * Author: Duy Anh
 * Date: 2026-10-27
 * Description: Prevents reuse of revoked location barcodes.
 */
import mongoose from 'mongoose';
const { Schema } = mongoose;
const schema = new Schema({ barcode: { type: String, required: true, unique: true },
  locationId: { type: Schema.Types.ObjectId, ref: 'WarehouseLocation', required: true },
  revokedAt: Date, reason: String }, { timestamps: true, collection: 'warehouse_barcode_history' });
export default mongoose.model('WarehouseBarcodeHistory', schema);
