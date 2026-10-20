import mongoose from 'mongoose';
import baseSchemaPlugin from './plugins/baseSchema.plugin.js';
import { WAREHOUSE_TYPES } from '../common/constants/enums.js';

const { Schema } = mongoose;

const inventoryTransactionSchema = new Schema(
  {
    transactionCode: { type: String, required: true, unique: true, index: true },
    warehouseType: { type: String, enum: WAREHOUSE_TYPES, required: true, index: true },
    itemType: { type: String, enum: ['RAW_MATERIAL', 'FABRIC_ROLL', 'FINISHED_SKU'], required: true },
    rawMaterialId: { type: Schema.Types.ObjectId, ref: 'RawMaterial', index: true },
    fabricRollId: { type: Schema.Types.ObjectId, ref: 'FabricRoll', index: true },
    skuId: { type: Schema.Types.ObjectId, ref: 'Sku', index: true },
    locationId: { type: Schema.Types.ObjectId, ref: 'WarehouseLocation', index: true },
    transactionType: {
      type: String,
      enum: [
        'INBOUND_PUTAWAY',
        'OUTBOUND_ISSUE_CUTTING',
        'REMNANT_RETURN_PUTAWAY',
        'ORDER_RESERVE',
        'ORDER_CANCEL_RELEASE',
        'ORDER_PACK_DEDUCT',
        'RETURN_RESTOCK',
        'DEFECT_QUARANTINE',
        'DEFECT_DISPOSAL',
        'STOCKTAKE_ADJUSTMENT',
      ],
      required: true,
      index: true,
    },
    referenceModel: {
      type: String,
      enum: ['MaterialTicket', 'FinishedGoodsTicket', 'SalesOrder', 'ReturnRequest', 'StocktakeSession'],
    },
    referenceId: { type: Schema.Types.ObjectId, required: true, index: true },
    quantityChange: { type: Number, required: true },
    onHandBefore: { type: Number, required: true },
    onHandAfter: { type: Number, required: true },
    unitCostSnapshot: { type: Number, default: 0 },
    performedByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { collection: 'inventory_transactions' }
);

inventoryTransactionSchema.index({ skuId: 1, createdAt: -1 });
inventoryTransactionSchema.index({ rawMaterialId: 1, createdAt: -1 });

inventoryTransactionSchema.plugin(baseSchemaPlugin);

const InventoryTransaction = mongoose.model('InventoryTransaction', inventoryTransactionSchema);
export default InventoryTransaction;
