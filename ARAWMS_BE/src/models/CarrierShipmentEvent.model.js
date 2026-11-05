import mongoose from 'mongoose';

const carrierShipmentEventSchema = new mongoose.Schema({
  shipmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'CarrierShipment', required: true, index: true },
  eventKey: { type: String, required: true, unique: true },
  providerStatus: { type: String, required: true },
  sourceTime: Date,
  receivedAt: { type: Date, default: Date.now },
  rawPayload: mongoose.Schema.Types.Mixed,
}, { collection: 'carrier_shipment_events' });

export default mongoose.model('CarrierShipmentEvent', carrierShipmentEventSchema);
