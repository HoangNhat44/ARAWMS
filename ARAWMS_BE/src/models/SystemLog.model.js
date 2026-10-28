/*
 * File: SystemLog.model.js
 * Author: Duy Anh
 * Date: 2026-10-26
 * Description: Defines audit records for system activity. Stores event details and references needed to trace an action.
 */
import mongoose from 'mongoose';
import baseSchemaPlugin from './plugins/baseSchema.plugin.js';
import { ROLES } from '../common/constants/enums.js';

const { Schema } = mongoose;

const systemLogSchema = new Schema(
  {
    actorId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    actorRole: { type: String, enum: ROLES, index: true },
    majorFeature: { type: String, required: true, index: true },
    subFeature: { type: String, required: true },
    action: { type: String, required: true, index: true },
    targetCollection: { type: String },
    targetId: { type: Schema.Types.ObjectId, index: true },
    targetCode: { type: String, index: true },
    beforeSnapshot: { type: Schema.Types.Mixed },
    afterSnapshot: { type: Schema.Types.Mixed },
    ipAddress: { type: String },
    userAgent: { type: String },
  },
  { collection: 'system_logs' }
);

systemLogSchema.plugin(baseSchemaPlugin);

systemLogSchema.index({ createdAt: -1, majorFeature: 1, actorId: 1 });

const SystemLog = mongoose.model('SystemLog', systemLogSchema);
export default SystemLog;
