import mongoose from 'mongoose';
import baseSchemaPlugin from './plugins/baseSchema.plugin.js';

const { Schema } = mongoose;

const finishedGoodsBatchSchema = new Schema(
  {
    batchCode: { type: String, required: true, unique: true, index: true },
    skuId: { type: Schema.Types.ObjectId, ref: 'Sku', required: true, index: true },
    skuBarcode: { type: String, required: true, index: true },
    inboundTicketId: { type: Schema.Types.ObjectId, ref: 'FinishedGoodsTicket' },
    locationId: { type: Schema.Types.ObjectId, ref: 'WarehouseLocation', required: true, index: true },
    initialQty: { type: Number, required: true, min: 1 },
    currentOnHandQty: { type: Number, required: true, min: 0, index: true },
    reservedPickQty: { type: Number, default: 0, min: 0 },
    fifoInboundTimestamp: { type: Date, required: true, index: true },
    isDefectQuarantine: { type: Boolean, default: false, index: true },
  },
  {
    collection: 'finished_goods_batches',
    optimisticConcurrency: true,
    versionKey: 'version',
  }
);

finishedGoodsBatchSchema.index({ skuId: 1, isDefectQuarantine: 1, currentOnHandQty: 1, fifoInboundTimestamp: 1 });

finishedGoodsBatchSchema.plugin(baseSchemaPlugin);

const FinishedGoodsBatch = mongoose.model('FinishedGoodsBatch', finishedGoodsBatchSchema);
export default FinishedGoodsBatch;
