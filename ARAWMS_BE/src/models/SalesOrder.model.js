/*
 * File: SalesOrder.model.js
 * Author: Duy Anh
 * Date: 2026-10-21
 * Description: Models sales orders, reserved picks, and fulfillment state.
 */
import mongoose from 'mongoose';
import baseSchemaPlugin from './plugins/baseSchema.plugin.js';
import { ORDER_STATUS, RECONCILIATION_STATUS } from '../common/constants/enums.js';

const { Schema } = mongoose;

const fifoPickAllocationSchema = new Schema(
  {
    batchId: { type: Schema.Types.ObjectId, ref: 'FinishedGoodsBatch' },
    locationId: { type: Schema.Types.ObjectId, ref: 'WarehouseLocation' },
    locationCode: String,
    allocatedQty: Number,
    pickedConfirmed: { type: Boolean, default: false },
  },
  { _id: false }
);

const salesOrderItemSchema = new Schema(
  {
    skuId: { type: Schema.Types.ObjectId, ref: 'Sku', required: true },
    skuCode: { type: String, required: true },
    skuBarcode: { type: String, required: true },
    orderedQty: { type: Number, required: true, min: 1 },
    unitSalePrice: { type: Number, required: true, min: 0 },
    unitCogsSnapshot: { type: Number, required: true, default: 0 },
    fifoPickList: [fifoPickAllocationSchema],
    packedScannedQty: { type: Number, default: 0 },
  },
  { _id: false }
);

const salesOrderSchema = new Schema(
  {
    orderCode: { type: String, required: true, unique: true, uppercase: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    conversationId: { type: Schema.Types.ObjectId, ref: 'ChatConversation' },
    sellerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    orderType: { type: String, enum: ['DIRECT_SALES', 'EXCHANGE_ORDER'], default: 'DIRECT_SALES' },
    linkedReturnRequestId: { type: Schema.Types.ObjectId, ref: 'ReturnRequest', default: null },
    status: { type: String, enum: ORDER_STATUS, default: 'PENDING', index: true },
    confirmedAt: Date,
    statusHistory: [{
      from: String, to: String,
      by: { type: Schema.Types.ObjectId, ref: 'User' }, at: Date,
    }],
    qr: {
      token: { type: String, select: false },
      revokedAt: { type: Date, default: null },
      issuedBy: { type: Schema.Types.ObjectId, ref: 'User' },
      qrImagePublicId: String,
    },
    shippingRecipient: {
      name: String,
      phone: String,
      address: String,
    },
    items: [salesOrderItemSchema],
    financialSummary: {
      itemsSubtotal: { type: Number, required: true },
      shippingFee: { type: Number, default: 0 },
      discountAmount: { type: Number, default: 0 },
      totalOrderAmount: { type: Number, required: true },
      expectedCodAmount: { type: Number, required: true },
      actualCodAmount: { type: Number },
      resolvedFaultParty: {
        type: String,
        enum: ['NONE', 'ARA_STORE', 'CARRIER_GHN'],
        default: 'NONE',
      },
    },
    warehouseFulfillment: {
      stockReservedAt: Date,
      pickListConfirmedByStaffId: { type: Schema.Types.ObjectId, ref: 'User' },
      pickListConfirmedAt: Date,
      packedByStaffId: { type: Schema.Types.ObjectId, ref: 'User' },
      packedAt: Date,
      packagingVideoUrl: { type: String },
      carrierId: { type: Schema.Types.ObjectId, ref: 'ShippingCarrier', index: true },
      waybillCode: { type: String, index: true },
      handoverReportCode: { type: String, index: true },
      handedOverAt: { type: Date, index: true },
      handedOverByStaffId: { type: Schema.Types.ObjectId, ref: 'User' },
      handedOverByName: String,
    },
    codReconciliationStatus: {
      type: String,
      enum: RECONCILIATION_STATUS,
      default: 'UNRECONCILED',
      index: true,
    },
    // Trạng thái tất toán công nợ COD bưu điện/hãng vận chuyển đã thanh toán
    isCodSettled: {
      type: Boolean,
      default: false,
      index: true,
    },
    codSettledAt: {
      type: Date,
    },
    codSettlementVoucherId: {
      type: Schema.Types.ObjectId,
      ref: 'CashFlowVoucher',
      index: true,
    },
    // Trạng thái tất toán cước phí vận chuyển Shop thanh toán cho hãng vận chuyển
    isShippingFeeSettled: {
      type: Boolean,
      default: false,
      index: true,
    },
    shippingFeeSettledAt: {
      type: Date,
    },
    shippingFeeSettlementVoucherId: {
      type: Schema.Types.ObjectId,
      ref: 'CashFlowVoucher',
      index: true,
    },
  },
  {
    collection: 'sales_orders',
    optimisticConcurrency: true,
    versionKey: 'version',
  }
);

salesOrderSchema.plugin(baseSchemaPlugin);
salesOrderSchema.index({ 'qr.token': 1 }, { unique: true,
  partialFilterExpression: { 'qr.token': { $type: 'string' } } });

const SalesOrder = mongoose.model('SalesOrder', salesOrderSchema);
export default SalesOrder;
