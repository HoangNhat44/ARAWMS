/*
 * File: ProductUnit.js
 * Author: Duy Anh
 * Date: 2026-10-19
 * Description: Models individually labeled finished goods and stock status.
 */
import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Physical unit status:
 * - AVAILABLE      in the finished goods warehouse, good stock (default for normal receiving)
 * - UNAVAILABLE    left the warehouse (packed for an order, shipped out)
 * - DEFECT_PENDING defective, waiting for the warehouse to receive it into the defect warehouse
 *                  (set when the garment technician finalizes a return inspection)
 * - DEFECTIVE      defective, inside the defect warehouse (set when the warehouse confirms the defect inbound)
 * - DEFECT_OUT     taken out of the defect warehouse (defect outbound, with a reason)
 * - STOCKTAKE_WRITE_OFF  removed from stock by a stocktake adjustment (found damaged, or missing);
 *                  terminal. The barcode stays traceable through stocktakeWriteOff.
 */
export const PRODUCT_UNIT_STATUSES = ['AVAILABLE', 'UNAVAILABLE', 'DEFECT_PENDING', 'DEFECTIVE', 'DEFECT_OUT', 'STOCKTAKE_WRITE_OFF'];
/** Defective units still held by the company (waiting for or inside the defect warehouse). */
export const DEFECT_HELD_STATUSES = ['DEFECT_PENDING', 'DEFECTIVE'];

// A physical unit has its own barcode; the SKU barcode identifies the variant.
const productUnitSchema = new Schema({
  barcode: { type: String, required: true, trim: true, unique: true },
  barcodeFormat: { type: String, required: true, enum: ['CODE_128'] },
  skuId: { type: Schema.Types.ObjectId, ref: 'Sku', required: true },
  warehouseId: { type: Schema.Types.ObjectId, ref: 'WarehouseLocation', required: true },
  batchId: { type: Schema.Types.ObjectId, ref: 'FinishedGoodsBatch', index: true },
  receivingDocumentId: { type: Schema.Types.ObjectId, ref: 'FinishedGoodsBulkDocument' },
  inventoryStatus: { type: String, required: true, enum: PRODUCT_UNIT_STATUSES, default: 'AVAILABLE', index: true },
  defectReason: { type: String, trim: true },
  returnInspectionId: { type: Schema.Types.ObjectId, ref: 'ReturnInspection' },
  returnedFromOrderId: { type: Schema.Types.ObjectId, ref: 'SalesOrder' },
  inspectedAt: Date,
  // Defect warehouse lifecycle: received (DEFECTIVE) and taken out (DEFECT_OUT) with the reason typed by the warehouse.
  defectReceivedAt: Date,
  defectOutAt: Date,
  defectOutReason: { type: String, trim: true },
  defectOutBy: { type: Schema.Types.ObjectId, ref: 'User' },
  defectOutTicketId: { type: Schema.Types.ObjectId, ref: 'FinishedGoodsTicket' },
  // Loại khỏi kho khi điều chỉnh theo kiểm kê: lý do, phiên, thời điểm, người điều chỉnh.
  stocktakeWriteOff: { type: new Schema({
    reason: { type: String, enum: ['DAMAGED', 'LOST'], required: true },
    note: { type: String, trim: true },
    sessionId: { type: Schema.Types.ObjectId, ref: 'StocktakeSession', required: true },
    sessionCode: String,
    locationId: { type: Schema.Types.ObjectId, ref: 'WarehouseLocation' },
    countedAt: Date,
    at: { type: Date, required: true },
    byUserId: { type: Schema.Types.ObjectId, ref: 'User' },
  }, { _id: false }), default: undefined },
  packedOrderId: { type: Schema.Types.ObjectId, ref: 'SalesOrder' },
  packedAt: Date,
  packingClaim: { type: new Schema({ orderKey: { type: String, required: true },
    sessionId: { type: Schema.Types.ObjectId, ref: 'PackingSession', required: true },
    lineKey: { type: String, required: true }, claimedAt: { type: Date, required: true } },
  { _id: false }), default: undefined },
}, { timestamps: true, collection: 'product_units' });

// Counting units of a SKU by status (sellable stock, defect warehouse) is a hot path for stock reports.
productUnitSchema.index({ skuId: 1, inventoryStatus: 1 });

export default mongoose.model('ProductUnit', productUnitSchema);
