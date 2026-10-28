/*
 * File: ReturnRequest.model.js
 * Author: Duy Anh
 * Date: 2026-10-26
 * Description: Defines customer return and exchange requests. Tracks requested items, review decisions, and fulfillment progress.
 */
import mongoose from 'mongoose';
import baseSchemaPlugin from './plugins/baseSchema.plugin.js';

const { Schema } = mongoose;

const returnInspectionItemSchema = new Schema(
  {
    skuId: { type: Schema.Types.ObjectId, ref: 'Sku', required: true },
    skuBarcode: String,
    returnedQty: { type: Number, required: true },
    condition: { type: String, enum: ['GOOD_INTACT', 'MISSING_TAG', 'DIRTY_OR_DAMAGED'], required: true },
    disposition: { type: String, enum: ['RESTOCK_SALEABLE', 'QUARANTINE_DEFECT'], required: true },
    restockTicketId: { type: Schema.Types.ObjectId, ref: 'FinishedGoodsTicket' },
  },
  { _id: false }
);

const returnRequestSchema = new Schema(
  {
    rmaCode: { type: String, required: true, unique: true, uppercase: true, index: true },
    originalOrderId: { type: Schema.Types.ObjectId, ref: 'SalesOrder', required: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    createdBySellerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    returnType: { type: String, enum: ['RETURN_FOR_REFUND', 'EXCHANGE_PRODUCT'], required: true },
    returnWaybillCode: { type: String, index: true },
    status: {
      type: String,
      enum: ['REQUESTED', 'UNBOXED_INSPECTED', 'ACCOUNTANT_APPROVED', 'COMPLETED', 'REJECTED'],
      default: 'REQUESTED',
      index: true,
    },
    warehouseInspection: {
      inspectedByStaffId: { type: Schema.Types.ObjectId, ref: 'User' },
      inspectedAt: Date,
      unboxingVideoUrl: { type: String },
      items: [returnInspectionItemSchema],
    },
    financialAccounting: {
      returnedMerchandiseValue: { type: Number, default: 0 },
      apply10PercentSurcharge: { type: Boolean, default: false },
      surcharge10PercentAmount: { type: Number, default: 0 },
      exchangeOrderId: { type: Schema.Types.ObjectId, ref: 'SalesOrder' },
      exchangePriceVarianceAmount: { type: Number, default: 0 },
      shippingFeeDeduction: { type: Number, default: 0 },
      finalNetRefundOrCollect: { type: Number, default: 0 },
      approvedByAccountantId: { type: Schema.Types.ObjectId, ref: 'User' },
      approvedAt: Date,
    },
  },
  { collection: 'return_requests' }
);

returnRequestSchema.plugin(baseSchemaPlugin);

const ReturnRequest = mongoose.model('ReturnRequest', returnRequestSchema);
export default ReturnRequest;
