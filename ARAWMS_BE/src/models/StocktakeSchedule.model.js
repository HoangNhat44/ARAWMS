import mongoose from 'mongoose';
import baseSchemaPlugin from './plugins/baseSchema.plugin.js';

const { Schema } = mongoose;
const stocktakeScheduleSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 160 },
  warehouseType: { type: String, enum: ['RAW_MATERIAL', 'FINISHED_GOODS', 'ALL'], required: true },
  scopeType: { type: String, enum: ['WAREHOUSE', 'ZONE', 'RACK', 'ITEM'], required: true },
  zoneCode: String, rackId: Schema.Types.ObjectId, itemType: String, itemId: Schema.Types.ObjectId,
  recurrence: { type: String, enum: ['ONCE', 'WEEKLY', 'MONTHLY', 'QUARTERLY'], required: true },
  weekday: Number, monthDay: Number, monthEnd: Boolean, quarterMonth: Number,
  startDate: { type: Date, required: true }, endDate: Date, startTime: { type: String, required: true },
  durationHours: { type: Number, default: 2, min: 1, max: 72 },
  inspectorId: { type: Schema.Types.ObjectId, ref: 'User' }, approverId: { type: Schema.Types.ObjectId, ref: 'User' },
  hideSystemQty: { type: Boolean, default: true }, instructions: { type: String, maxlength: 1000 },
  status: { type: String, enum: ['ACTIVE', 'PAUSED', 'CANCELLED'], default: 'ACTIVE', index: true },
  createdByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  lastGeneratedAt: Date, version: { type: Number, default: 0 },
}, { timestamps: true, collection: 'stocktake_schedules' });
stocktakeScheduleSchema.plugin(baseSchemaPlugin);
export default mongoose.model('StocktakeSchedule', stocktakeScheduleSchema);
