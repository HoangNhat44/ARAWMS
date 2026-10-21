import mongoose from 'mongoose';
import baseSchemaPlugin from './plugins/baseSchema.plugin.js';

const { Schema } = mongoose;

const systemSettingSchema = new Schema(
  {
    settingKey: { type: String, default: 'GLOBAL_CONFIG', unique: true },
    defaultFabricLeftoverThresholdMeters: { type: Number, default: 2.0 },
    returnSurchargePercent: { type: Number, default: 10 },
    minorStocktakeVarianceLimitQty: { type: Number, default: 5 },
    minorStocktakeVarianceLimitValue: { type: Number, default: 1000000 },
    defaultFifoAgingAlertDays: { type: Number, default: 60 },
    integrations: {
      facebookPageId: String,
      facebookVerifyToken: String,
      facebookPageAccessToken: String,
    },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { collection: 'system_settings' }
);

systemSettingSchema.plugin(baseSchemaPlugin);

const SystemSetting = mongoose.model('SystemSetting', systemSettingSchema);
export default SystemSetting;
