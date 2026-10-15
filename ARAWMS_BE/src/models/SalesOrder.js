import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Sales Orders collection – FT-10
 */

const reservationSchema = new Schema(
  {
    warehouseId: { type: Schema.Types.ObjectId, ref: 'Config' },
    qty: { type: Number, min: 0 },
    status: { type: String, enum: ['ACTIVE', 'RELEASED', 'FULFILLED'] },
    reservedAt: { type: Date },
    releasedAt: { type: Date },
    releaseReason: { type: String },
  },
  { _id: false }
);

const orderItemSchema = new Schema(
  {
    skuId: { type: Schema.Types.ObjectId, ref: 'Sku', required: true },
    skuCode: { type: String },
    name: { type: String },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    discountAmount: { type: Number, min: 0 },
    lineTotal: { type: Number, min: 0 },
    unitCost: { type: Number, min: 0 },
    returnedQty: { type: Number, min: 0 },
    reservation: { type: reservationSchema },
  },
  { _id: false }
);

const statusHistorySchema = new Schema(
  {
    from: { type: String },
    to: { type: String, required: true },
    by: { type: Schema.Types.ObjectId, ref: 'User' },
    note: { type: String },
    at: { type: Date, required: true },
  },
  { _id: false }
);

const pickListItemSchema = new Schema(
  {
    skuId: { type: Schema.Types.ObjectId, ref: 'Sku', required: true },
    locationCode: { type: String },
    quantity: { type: Number, required: true },
    pickedQty: { type: Number },
  },
  { _id: false }
);

const packingScanSchema = new Schema(
  {
    skuId: { type: Schema.Types.ObjectId, ref: 'Sku' },
    barcode: { type: String, required: true },
    isMatch: { type: Boolean },
    scannedAt: { type: Date, required: true },
  },
  { _id: false }
);

const salesOrderSchema = new Schema(
  {
    orderCode: { type: String, required: true, trim: true },
    channel: {
      type: String,
      required: true,
      enum: ['FACEBOOK', 'SHOPEE', 'TIKTOK_SHOP', 'OTHER'],
    },
    externalOrderNo: { type: String },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer' },
    customer: {
      code: { type: String },
      name: { type: String },
      phone: { type: String },
    },
    conversationId: { type: Schema.Types.ObjectId, ref: 'ChatConversation' },
    sellerId: { type: Schema.Types.ObjectId, ref: 'User' },
    status: {
      type: String,
      required: true,
      enum: [
        'PENDING',
        'CONFIRMED',
        'PICKING',
        'PACKED',
        'HANDED_OVER',
        'DELIVERED',
        'COMPLETED',
        'CANCELLED',
        'RETURN_IN_PROGRESS',
        'RETURNED',
      ],
    },
    paymentMethod: {
      type: String,
      required: true,
      enum: ['COD', 'BANK_TRANSFER', 'CASH', 'MARKETPLACE'],
    },
    paymentStatus: {
      type: String,
      required: true,
      enum: ['UNPAID', 'PAID', 'PARTIALLY_PAID', 'REFUNDED'],
    },
    recipient: {
      name: { type: String, required: true },
      phone: { type: String, required: true },
      province: { type: String },
      district: { type: String },
      ward: { type: String },
      addressLine: { type: String, required: true },
    },
    shipping: {
      carrierId: { type: Schema.Types.ObjectId, ref: 'Partner' },
      carrierCode: { type: String },
      marketplaceCarrierName: { type: String },
      feeCustomer: { type: Number, min: 0 },
      feeActual: { type: Number, min: 0 },
    },
    items: {
      type: [orderItemSchema],
      required: true,
      validate: {
        validator: (v) => Array.isArray(v) && v.length >= 1,
        message: 'items phải có ít nhất 1 phần tử',
      },
    },
    amounts: {
      subtotal: { type: Number, required: true, min: 0 },
      discount: { type: Number, min: 0 },
      total: { type: Number, required: true, min: 0 },
      codAmount: { type: Number, min: 0 },
    },
    statusHistory: { type: [statusHistorySchema], default: [] },
    pickList: {
      code: { type: String },
      status: { type: String, enum: ['OPEN', 'CONFIRMED', 'CANCELLED'] },
      confirmedBy: { type: Schema.Types.ObjectId, ref: 'User' },
      confirmedAt: { type: Date },
      items: { type: [pickListItemSchema], default: [] },
    },
    packing: {
      packedBy: { type: Schema.Types.ObjectId, ref: 'User' },
      startedAt: { type: Date },
      finishedAt: { type: Date },
      videoUrl: { type: String },
      videoDurationS: { type: Number },
      isComplete: { type: Boolean },
      scans: { type: [packingScanSchema], default: [] },
    },
    confirmedAt: { type: Date },
    packedAt: { type: Date },
    handedOverAt: { type: Date },
    deliveredAt: { type: Date },
    completedAt: { type: Date },
    cancelledAt: { type: Date },
    cancelledBy: { type: Schema.Types.ObjectId, ref: 'User' },
    cancelReason: { type: String },
    note: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, collection: 'sales_orders' }
);

// Indexes
salesOrderSchema.index({ orderCode: 1 }, { unique: true });
salesOrderSchema.index(
  { channel: 1, externalOrderNo: 1 },
  { unique: true, partialFilterExpression: { externalOrderNo: { $type: 'string' } } }
);
salesOrderSchema.index({ status: 1, createdAt: -1 });
salesOrderSchema.index({ customerId: 1, createdAt: -1 });
salesOrderSchema.index({ sellerId: 1, createdAt: -1 });
salesOrderSchema.index({ 'items.skuId': 1 });

const SalesOrder = mongoose.model('SalesOrder', salesOrderSchema);
export default SalesOrder;
