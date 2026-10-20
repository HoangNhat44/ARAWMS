import mongoose from 'mongoose';
import baseSchemaPlugin from './plugins/baseSchema.plugin.js';

const { Schema } = mongoose;

const stocktakeRecordSchema = new Schema(
  {
    sessionId: { type: Schema.Types.ObjectId, ref: 'StocktakeSession', required: true, index: true },
    locationId: { type: Schema.Types.ObjectId, ref: 'WarehouseLocation', required: true, index: true },
    itemType: { type: String, enum: ['FABRIC_ROLL', 'RAW_MATERIAL', 'SKU_BATCH'], required: true },
    fabricRollId: { type: Schema.Types.ObjectId, ref: 'FabricRoll' },
    rawMaterialId: { type: Schema.Types.ObjectId, ref: 'RawMaterial' },
    skuId: { type: Schema.Types.ObjectId, ref: 'Sku' },
    batchId: { type: Schema.Types.ObjectId, ref: 'FinishedGoodsBatch' },
    barcode: { type: String, required: true, index: true },
    systemSnapshotQty: { type: Number, required: true },
    actualScannedQty: { type: Number, default: 0 },
    varianceQty: { type: Number, default: 0 },
    fifoInboundTimestamp: { type: Date },
    agingDaysAtCount: { type: Number, default: 0 },
    isAgingThresholdExceeded: { type: Boolean, default: false, index: true },
    scannedByStaffId: { type: Schema.Types.ObjectId, ref: 'User' },
    scannedAt: { type: Date },
  },
  { collection: 'stocktake_records' }
);

stocktakeRecordSchema.index({ sessionId: 1, locationId: 1, barcode: 1 }, { unique: true });

stocktakeRecordSchema.plugin(baseSchemaPlugin);

const StocktakeRecord = mongoose.model('StocktakeRecord', stocktakeRecordSchema);
export default StocktakeRecord;
