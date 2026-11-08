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
      enum: [
        'FACEBOOK_MESSENGER',
        'FACEBOOK',
        'TIKTOK',
        'SHOPEE',
        'EXCEL_IMPORT',
        'POS_OFFLINE',
        'ZALO',
        'HOTLINE',
        'DIRECT_OTHER',
      ],
      default: 'FACEBOOK_MESSENGER',
    },
    sourceDetails: {
      sourceType: {
        type: String,
        enum: ['FANPAGE', 'TIKTOK_SHOP', 'SHOPEE_STORE', 'EXCEL_CUSTOM', 'POS', 'OTHER'],
        default: 'FANPAGE',
      },
      sourceId: { type: String, index: true },
      sourceName: { type: String },
      externalOrderCode: { type: String, index: true },
      externalTrackingCode: { type: String },
      importBatchCode: { type: String, index: true },
    },
    importStatus: {
      type: String,
      enum: ['NONE', 'APPROVED', 'REJECTED', 'PENDING_WAREHOUSE_APPROVAL'],
      default: 'NONE',
      index: true,
    },
    importedBySellerId: { type: Schema.Types.ObjectId, ref: 'User' },
    importApprovalReason: { type: String },
    importAutoApproved: { type: Boolean, default: false },
    importedAt: Date,
    approvedByWarehouseStaffId: { type: Schema.Types.ObjectId, ref: 'User' },
    approvedAt: Date,
    linkedReturnRequestId: { type: Schema.Types.ObjectId, ref: 'ReturnRequest', default: null },
    // Lưu vết đơn đổi hàng: đơn đổi là một đơn mới hoàn toàn, tham chiếu về đơn gốc
    originalOrderId: { type: Schema.Types.ObjectId, ref: 'SalesOrder', default: null, index: true },
    originalOrderSnapshot: {
      orderCode: String,
      waybillCode: String,
      status: String,
      deliveredAt: Date,
      items: [{
        _id: false,
        skuId: { type: Schema.Types.ObjectId, ref: 'Sku' },
        skuCode: String,
        productName: String,
        orderedQty: Number,
        unitSalePrice: Number,
      }],
      totalOrderAmount: Number,
    },
    // Đơn gốc: danh sách đơn đổi mới được sinh ra từ đơn này
    exchangeOrderIds: [{ type: Schema.Types.ObjectId, ref: 'SalesOrder' }],
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
      note: String,
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
      carrierName: { type: String, default: 'GHN' },
      waybillCode: { type: String, index: true },
      ghnStatus: { type: String, index: true },
      ghnStatusName: { type: String },
      ghnUpdatedAt: { type: Date },
      ghnExpectedDeliveryTime: { type: Date },
      handoverReportCode: { type: String, index: true },
      handedOverAt: Date,
      deliveredAt: Date,
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

// Tự động chuẩn hóa các đơn hàng import cũ từ PENDING_WAREHOUSE_APPROVAL sang APPROVED (bỏ luồng kho duyệt)
salesOrderSchema.pre('validate', function (next) {
  if (this.importStatus === 'PENDING_WAREHOUSE_APPROVAL') {
    this.importStatus = 'APPROVED';
  }
  next();
});

// Compound indexes phục vụ tối ưu truy vấn danh sách đơn hàng của Seller (UC-80)
salesOrderSchema.index({ sellerId: 1, status: 1, createdAt: -1 });
salesOrderSchema.index({ customerId: 1, createdAt: -1 });
salesOrderSchema.index({ 'shippingRecipient.phone': 1 });
salesOrderSchema.index({ conversationId: 1 });

const SalesOrder = mongoose.model('SalesOrder', salesOrderSchema);
export default SalesOrder;
