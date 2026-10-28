/*
 * File: FabricRoll.model.js
 * Author: Duy Anh
 * Date: 2026-10-26
 * Description: Defines physical fabric rolls and remnants. Tracks supplier origin, measured length, barcode, assigned shelf, FIFO age, quality, and putaway status.
 */
import mongoose from 'mongoose';
import baseSchemaPlugin from './plugins/baseSchema.plugin.js';
import { FABRIC_ROLL_STATUS } from '../common/constants/enums.js';

const { Schema } = mongoose;

const fabricRollSchema = new Schema(
  {
    rollBarcode: { type: String, required: true, unique: true, index: true },
    barcodeImageUrl: String,
    barcodeImagePublicId: String,
    rawMaterialId: { type: Schema.Types.ObjectId, ref: 'RawMaterial', required: true, index: true },
    supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier', index: true },
    contractId: { type: Schema.Types.ObjectId, ref: 'SupplierContract' },
    inboundTicketId: { type: Schema.Types.ObjectId, ref: 'MaterialTicket' },
    clientLineId: String,
    supplierRollCode: String,
    supplierLotCode: String,
    measuredWidthCm: Number,
    defectReason: String,
    putawayConfirmedAt: Date,
    isRemnantRoll: { type: Boolean, default: false, index: true },
    parentRollId: { type: Schema.Types.ObjectId, ref: 'FabricRoll', default: null },
    initialLengthMeters: { type: Number, required: true, min: 0 },
    currentLengthMeters: { type: Number, required: true, min: 0, index: true },
    initialWeightKg: { type: Number, min: 0 },
    currentWeightKg: { type: Number, min: 0 },
    unitCostPerMeter: { type: Number, required: true, min: 0 },
    locationId: { type: Schema.Types.ObjectId, ref: 'WarehouseLocation', index: true },
    fifoInboundTimestamp: { type: Date, required: true, index: true },
    status: { type: String, enum: FABRIC_ROLL_STATUS, default: 'PENDING_QC', index: true },
  },
  {
    collection: 'fabric_rolls',
    optimisticConcurrency: true,
    versionKey: 'version',
  }
);

fabricRollSchema.index({ rawMaterialId: 1, status: 1, isRemnantRoll: -1, fifoInboundTimestamp: 1 });

fabricRollSchema.plugin(baseSchemaPlugin);

const FabricRoll = mongoose.model('FabricRoll', fabricRollSchema);
export default FabricRoll;
