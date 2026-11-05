import mongoose from 'mongoose';

const { Schema } = mongoose;

const carrierShipmentSchema = new Schema({
  orderId: { type: Schema.Types.ObjectId, ref: 'SalesOrder', required: true, index: true },
  orderCode: { type: String, required: true, index: true },
  packingSessionId: { type: Schema.Types.ObjectId, ref: 'PackingSession', required: true },
  clientOrderCode: { type: String, required: true, unique: true },
  provider: { type: String, enum: ['GHN'], default: 'GHN' },
  createStatus: { type: String, enum: ['PREPARED', 'CREATING', 'UNKNOWN', 'CREATED', 'FAILED'], default: 'PREPARED', index: true },
  shipmentStatus: { type: String, default: 'WAITING_FOR_PICKUP', index: true },
  providerStatus: String,
  providerUpdatedAt: Date,
  warehouseType: { type: String, enum: ['RAW_MATERIAL', 'FINISHED_GOODS', 'DEFECT_QUARANTINE'] },
  handoverStatus: { type: String, enum: ['WAITING', 'IN_DRAFT', 'HANDED_OVER'], default: 'WAITING', index: true },
  handoverId: { type: Schema.Types.ObjectId, ref: 'CarrierHandover' },
  waybillCode: { type: String, sparse: true, index: true },
  fee: Number,
  expectedDeliveryTime: Date,
  requestSnapshot: Schema.Types.Mixed,
  recipientSnapshot: Schema.Types.Mixed,
  packedUnitsSnapshot: [new Schema({ barcode: String, skuCode: String, name: String }, { _id: false })],
  lastError: String,
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true, collection: 'carrier_shipments' });

carrierShipmentSchema.index({ orderId: 1, packingSessionId: 1 }, { unique: true });
carrierShipmentSchema.index({ handoverId: 1, handoverStatus: 1 });

export default mongoose.model('CarrierShipment', carrierShipmentSchema);
