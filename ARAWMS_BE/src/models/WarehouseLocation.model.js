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
    currentOccupancy: { type: Number, default: 0 },
    isFrozenForStocktake: { type: Boolean, default: false, index: true },
    status: { type: String, enum: ['ACTIVE', 'FULL', 'MAINTENANCE'], default: 'ACTIVE' },
  },
  { collection: 'warehouse_locations' }
);

warehouseLocationSchema.plugin(baseSchemaPlugin);

const WarehouseLocation = mongoose.model('WarehouseLocation', warehouseLocationSchema);
export default WarehouseLocation;
