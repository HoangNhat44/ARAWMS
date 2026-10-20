import mongoose from 'mongoose';

const { Schema } = mongoose;

const scanEventSchema = new Schema({
  sessionId: { type: Schema.Types.ObjectId, ref: 'PackingSession', required: true },
  clientEventId: { type: String, required: true },
  barcode: { type: String, required: true },
  result: { type: String, required: true, enum: ['ACCEPTED', 'REJECTED'] },
  reason: { type: String },
  lineKey: { type: String },
  phase: { type: String, required: true, default: 'PRE_RECORD' },
  videoOffsetMs: { type: Number, default: null },
  serverTime: { type: Date, required: true, default: Date.now },
}, { collection: 'packing_scan_events' });

scanEventSchema.index({ sessionId: 1, clientEventId: 1 }, { unique: true });

export default mongoose.model('PackingScanEvent', scanEventSchema);
