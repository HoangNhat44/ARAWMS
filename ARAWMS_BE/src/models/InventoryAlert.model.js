/*
 * File: InventoryAlert.model.js
 * Author: Duy Anh
 * Date: 2026-10-26
 * Description: Defines alerts raised from inventory conditions. Stores alert type, affected stock, and resolution state.
 */
import mongoose from 'mongoose';
import baseSchemaPlugin from './plugins/baseSchema.plugin.js';
import { ALERT_TYPES, WAREHOUSE_TYPES, ROLES } from '../common/constants/enums.js';

const { Schema } = mongoose;

const inventoryAlertSchema = new Schema(
  {
    alertCode: { type: String, required: true, unique: true },
    alertType: { type: String, enum: ALERT_TYPES, required: true, index: true },
    severity: { type: String, enum: ['INFO', 'WARNING', 'CRITICAL'], default: 'WARNING' },
    warehouseType: { type: String, enum: WAREHOUSE_TYPES },
    targetRole: { type: String, enum: ROLES, index: true },
    referenceModel: {
      type: String,
      enum: ['RawMaterial', 'Sku', 'FabricRoll', 'FinishedGoodsBatch', 'MaterialInboundPlan'],
    },
    referenceId: { type: Schema.Types.ObjectId, index: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    metadata: {
      currentQty: Number,
      thresholdQty: Number,
      agingDays: Number,
      locationCode: String,
    },
    isRead: { type: Boolean, default: false, index: true },
    isResolved: { type: Boolean, default: false, index: true },
    resolvedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    resolvedAt: { type: Date },
  },
  { collection: 'inventory_alerts' }
);

inventoryAlertSchema.plugin(baseSchemaPlugin);

const InventoryAlert = mongoose.model('InventoryAlert', inventoryAlertSchema);
export default InventoryAlert;
