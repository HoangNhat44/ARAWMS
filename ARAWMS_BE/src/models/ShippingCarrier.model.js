/*
 * File: ShippingCarrier.model.js
 * Author: Duy Anh
 * Date: 2026-10-26
 * Description: Defines shipping carrier records and integration settings. Supports carrier selection and fulfillment tracking.
 */
import mongoose from 'mongoose';
import baseSchemaPlugin from './plugins/baseSchema.plugin.js';

const { Schema } = mongoose;

const shippingCarrierSchema = new Schema(
  {
    carrierCode: { type: String, required: true, unique: true, uppercase: true },
    carrierName: { type: String, required: true },
    hotline: { type: String },
    apiBaseUrl: { type: String },
    apiKey: { type: String },
    codFeePercent: { type: Number, default: 0 },
    baseShippingFee: { type: Number, default: 30000 },
    statementColumnMapping: {
      waybillColumn: String,
      codAmountColumn: String,
      shippingFeeColumn: String,
    },
    isActive: { type: Boolean, default: true },
  },
  { collection: 'shipping_carriers' }
);

shippingCarrierSchema.plugin(baseSchemaPlugin);

const ShippingCarrier = mongoose.model('ShippingCarrier', shippingCarrierSchema);
export default ShippingCarrier;
