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
    productName: { type: String, trim: true },
    color: { type: String, trim: true },
    size: { type: String, trim: true },
    thumbnailUrl: { type: String, trim: true },
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
    orderType: {
      type: String,
      enum: ['DIRECT_SALES', 'EXCHANGE_ORDER', 'POS_DIRECT', 'POS_SHIP'],
      default: 'DIRECT_SALES',
    },
    channel: {
      type: String,
      enum: ['FACEBOOK_MESSENGER', 'POS_OFFLINE', 'ZALO', 'HOTLINE', 'DIRECT_OTHER'],
      default: 'FACEBOOK_MESSENGER',
    },
    linkedReturnRequestId: { type: Schema.Types.ObjectId, ref: 'ReturnRequest', default: null },
    status: { type: String, enum: ORDER_STATUS, default: 'PENDING', index: true },
    isCustomerConfirmed: { type: Boolean, default: false, index: true },
    customerConfirmedAt: Date,
    confirmedAt: Date,
    cancelReason: { type: String, trim: true },
    canceledByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    canceledAt: Date,
    paymentMethod: {
      type: String,
      enum: ['COD', 'BANK_TRANSFER', 'CASH', 'POS_CARD'],
      default: 'COD',
    },
    paymentStatus: {
      type: String,
      enum: ['PENDING', 'PAID', 'REFUNDED'],
      default: 'PENDING',
    },
    notes: { type: String, trim: true },
    statusHistory: [{
      from: String, to: String,
      by: { type: Schema.Types.ObjectId, ref: 'User' }, at: Date,
    }],
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
      handedOverAt: Date,
    },
    codReconciliationStatus: {
      type: String,
      enum: RECONCILIATION_STATUS,
      default: 'UNRECONCILED',
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

// Compound indexes phục vụ tối ưu truy vấn danh sách đơn hàng của Seller (UC-80)
salesOrderSchema.index({ sellerId: 1, status: 1, createdAt: -1 });
salesOrderSchema.index({ customerId: 1, createdAt: -1 });
salesOrderSchema.index({ 'shippingRecipient.phone': 1 });
salesOrderSchema.index({ conversationId: 1 });

const SalesOrder = mongoose.model('SalesOrder', salesOrderSchema);
export default SalesOrder;
