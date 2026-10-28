/*
 * File: MaterialStockLot.model.js
 * Author: Duy Anh
 * Date: 2026-10-26
 * Description: Stores accessory lots received from suppliers. Tracks quality and putaway quantity at each shelf without creating a barcode per individual piece.
 */
import mongoose from 'mongoose';
import baseSchemaPlugin from './plugins/baseSchema.plugin.js';

const { Schema } = mongoose;

const materialStockLotSchema = new Schema({
  lotBarcode: { type: String, required: true, unique: true, index: true },
  barcodeImageUrl: String,
  barcodeImagePublicId: String,
  rawMaterialId: { type: Schema.Types.ObjectId, ref: 'RawMaterial', required: true, index: true },
  supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true },
  inboundTicketId: { type: Schema.Types.ObjectId, ref: 'MaterialTicket', required: true, index: true },
  clientLineId: { type: String, required: true },
  supplierLotCode: String,
  packageUnit: String,
  packageCount: Number,
  unitsPerPackage: Number,
  initialQty: { type: Number, required: true, min: 0 },
  currentQty: { type: Number, required: true, min: 0 },
  quality: { type: String, enum: ['ACCEPTED', 'REJECTED'], required: true },
  status: { type: String, enum: ['PENDING_PUTAWAY', 'IN_STOCK', 'QUARANTINED', 'RETURNED_TO_SUPPLIER'], required: true },
  defectReason: String,
  fifoInboundTimestamp: { type: Date, required: true, index: true },
  allocations: [{ locationId: { type: Schema.Types.ObjectId, ref: 'WarehouseLocation', required: true },
    quantity: { type: Number, required: true, min: 0 }, putawayQty: { type: Number, default: 0, min: 0 } }],
}, { collection: 'material_stock_lots' });

materialStockLotSchema.index({ inboundTicketId: 1, clientLineId: 1 }, { unique: true });
materialStockLotSchema.plugin(baseSchemaPlugin);

export default mongoose.model('MaterialStockLot', materialStockLotSchema);
