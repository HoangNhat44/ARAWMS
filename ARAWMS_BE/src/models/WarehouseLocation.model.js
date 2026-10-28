/*
 * File: WarehouseLocation.model.js
 * Author: Duy Anh
 * Date: 2026-10-21
 * Description: Models physical warehouse locations, status, and capacity. Raw-material shelves record a capacity unit so incompatible stock quantities are not combined.
 */
import mongoose from 'mongoose';
import baseSchemaPlugin from './plugins/baseSchema.plugin.js';
import { WAREHOUSE_TYPES } from '../common/constants/enums.js';

const { Schema } = mongoose;

const warehouseLocationSchema = new Schema(
  {
    locationCode: { type: String, required: true, unique: true, uppercase: true },
    barcode: { type: String, required: true, unique: true, index: true },
    warehouseType: { type: String, enum: WAREHOUSE_TYPES, required: true, index: true },
    zoneCode: { type: String, required: true, index: true },
    rackCode: { type: String, required: true },
    shelfCode: { type: String, required: true },
    fifoPickSequence: { type: Number, default: 1 },
    maxCapacity: { type: Number, required: true },
    capacityUnit: { type: String, enum: ['METER', 'KG', 'PIECE', 'SPOOL', 'BOX'] },
    currentOccupancy: { type: Number, default: 0 },
    isFrozenForStocktake: { type: Boolean, default: false, index: true },
    status: { type: String, enum: ['ACTIVE', 'FULL', 'MAINTENANCE', 'LOCKED', 'INACTIVE'], default: 'ACTIVE' },
    layoutBin: { type: Boolean, default: false, index: true },
    isSystemUnplaced: { type: Boolean, default: false },
    displayName: String,
    floorNo: Number,
    binNo: Number,
    allowedSkuMode: { type: String, enum: ['SINGLE', 'MULTI'], default: 'SINGLE' },
    allowedSkuIds: [{ type: Schema.Types.ObjectId, ref: 'Sku' }],
    plannedReservedQty: { type: Number, default: 0, min: 0 },
    layoutVersion: { type: Number, default: 0 },
  },
  { collection: 'warehouse_locations' }
);

warehouseLocationSchema.plugin(baseSchemaPlugin);

const WarehouseLocation = mongoose.model('WarehouseLocation', warehouseLocationSchema);
export default WarehouseLocation;
