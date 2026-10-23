import mongoose from 'mongoose';

const { Schema } = mongoose;

// Tem riêng của từng vật phẩm vật lý. Không dùng Sku.barcodes (mã chung của biến thể).
const productUnitSchema = new Schema({
  barcode: { type: String, required: true, trim: true, unique: true },
  barcodeFormat: { type: String, required: true, enum: ['CODE_128'] },
  skuId: { type: Schema.Types.ObjectId, ref: 'Sku', required: true },
  warehouseId: { type: Schema.Types.ObjectId, ref: 'WarehouseLocation', required: true },
  receivingDocumentId: { type: Schema.Types.ObjectId, ref: 'FinishedGoodsBulkDocument' },
  inventoryStatus: { type: String, required: true, enum: ['AVAILABLE', 'UNAVAILABLE'], default: 'AVAILABLE' },
}, { timestamps: true, collection: 'product_units' });

export default mongoose.model('ProductUnit', productUnitSchema);
