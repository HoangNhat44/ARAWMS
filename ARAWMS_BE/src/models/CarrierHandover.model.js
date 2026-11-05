import mongoose from 'mongoose';

const { Schema } = mongoose;
const parcelSchema = new Schema({
  shipmentId: { type: Schema.Types.ObjectId, ref: 'CarrierShipment', required: true },
  waybillCode: { type: String, required: true },
  clientOrderCode: String,
  orderId: { type: Schema.Types.ObjectId, ref: 'SalesOrder', required: true },
  orderCode: { type: String, required: true },
  recipientSnapshot: Schema.Types.Mixed,
  packedUnitsSnapshot: [new Schema({ barcode: String, skuCode: String, name: String }, { _id: false })],
  scannedAt: { type: Date, default: Date.now },
  scannedByName: String,
}, { _id: false });

const carrierHandoverSchema = new Schema({
  reportCode: { type: String, unique: true, sparse: true },
  carrier: { type: String, enum: ['GHN'], default: 'GHN' },
  warehouseType: { type: String, enum: ['RAW_MATERIAL', 'FINISHED_GOODS', 'DEFECT_QUARANTINE'] },
  senderName: { type: String, required: true },
  receiverName: { type: String, required: true },
  note: String,
  status: { type: String, enum: ['DRAFT', 'HANDED_OVER'], default: 'DRAFT', index: true },
  parcels: { type: [parcelSchema], default: [] },
  confirmedAt: Date,
}, { timestamps: true, collection: 'carrier_handovers' });

export default mongoose.model('CarrierHandover', carrierHandoverSchema);
