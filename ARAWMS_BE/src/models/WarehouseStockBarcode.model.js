/* Stores the unique claim for each raw-material lot or fabric-roll barcode. */
import mongoose from 'mongoose';

const { Schema } = mongoose;
const schema = new Schema({
  barcode: { type: String, required: true, trim: true, uppercase: true },
  stockType: { type: String, enum: ['LOT', 'ROLL'], required: true },
  stockObjectId: { type: Schema.Types.ObjectId, required: true },
  inboundTicketId: { type: Schema.Types.ObjectId, ref: 'MaterialTicket', required: true, index: true },
  rawMaterialId: { type: Schema.Types.ObjectId, ref: 'RawMaterial', required: true, index: true },
  supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier' },
}, { collection: 'warehouse_stock_barcodes', timestamps: true });

schema.index({ barcode: 1 }, { unique: true });
schema.index({ stockType: 1, stockObjectId: 1 }, { unique: true });

export default mongoose.model('WarehouseStockBarcode', schema);
