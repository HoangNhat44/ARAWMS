/**
 * ============================================================================
 * @title        : Return Inspection Model
 * @author       : AraWMS Team
 * @createdDate  : 2026-11-11
 * @lastModified : 2026-11-11
 * @description  : Lưu trữ hồ sơ kiểm tra KCS đơn hàng hoàn/trả của Nhân viên Kỹ thuật (Garment Technician).
 *                 Ghi nhận video khui kiện, tình trạng sản phẩm, kết quả ĐẠT / KHÔNG ĐẠT và phiếu yêu cầu nhập kho hoàn.
 * @module       : Garment Technical / Return Inspection
 * @layer        : Model
 * ============================================================================
 */

import mongoose from 'mongoose';
import baseSchemaPlugin from './plugins/baseSchema.plugin.js';

const { Schema } = mongoose;

const returnInspectionItemSchema = new Schema(
  {
    skuId: { type: Schema.Types.ObjectId, ref: 'Sku', required: true },
    skuCode: { type: String, trim: true },
    skuBarcode: { type: String, trim: true },
    productName: { type: String, trim: true },
    color: { type: String, trim: true },
    size: { type: String, trim: true },
    quantity: { type: Number, required: true, min: 1 },
    condition: {
      type: String,
      enum: ['GOOD_INTACT', 'MISSING_TAG', 'DIRTY_OR_DAMAGED', 'DEFECTIVE_SEWING', 'WRONG_ITEM', 'USED'],
      default: 'GOOD_INTACT',
    },
    passed: { type: Boolean, default: true },
    note: { type: String, trim: true },
  },
  { _id: false }
);

const scannedReturnUnitSchema = new Schema(
  {
    productUnitId: { type: Schema.Types.ObjectId, ref: 'ProductUnit' },
    unitBarcode: { type: String, required: true, trim: true },
    skuId: { type: Schema.Types.ObjectId, ref: 'Sku', required: true },
    skuCode: { type: String, trim: true },
    skuBarcode: { type: String, trim: true },
    productName: { type: String, trim: true },
    color: { type: String, trim: true },
    size: { type: String, trim: true },
    scannedAt: { type: Date, default: Date.now },
    disposition: {
      type: String,
      enum: ['RESTOCK_SALEABLE', 'QUARANTINE_DEFECT'],
      default: 'RESTOCK_SALEABLE',
    },
    condition: {
      type: String,
      enum: ['GOOD_INTACT', 'MISSING_TAG', 'DIRTY_OR_DAMAGED', 'DEFECTIVE_SEWING', 'WRONG_ITEM', 'USED'],
      default: 'GOOD_INTACT',
    },
    note: { type: String, trim: true },
  },
  { _id: false }
);

const returnInspectionSchema = new Schema(
  {
    inspectionCode: { type: String, required: true, unique: true, index: true },
    sessionStatus: {
      type: String,
      enum: ['RECORDING', 'PENDING_REVIEW', 'FINALIZED', 'CANCELLED'],
      default: 'FINALIZED',
      index: true,
    },
    orderId: { type: Schema.Types.ObjectId, ref: 'SalesOrder', required: true, index: true },
    orderCode: { type: String, required: true, index: true },
    originalOrderStatus: { type: String, trim: true },
    waybillCode: { type: String, index: true },
    returnWaybillCode: { type: String, index: true },
    rmaId: { type: Schema.Types.ObjectId, ref: 'ReturnRequest' },
    rmaCode: { type: String, trim: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer' },
    customerName: { type: String, trim: true },
    customerPhone: { type: String, trim: true },
    items: [returnInspectionItemSchema],
    scannedUnits: { type: [scannedReturnUnitSchema], default: [] },
    inspectionResult: {
      type: String,
      enum: ['PASSED', 'PARTIAL', 'FAILED'],
      default: null,
      index: true,
    },
    qcNote: { type: String, trim: true },
    rejectReason: { type: String, trim: true },
    recordingId: { type: String, trim: true },
    video: {
      recordingId: { type: String },
      publicId: { type: String },
      assetId: { type: String },
      url: { type: String },
      mimeType: { type: String },
      sizeBytes: { type: Number },
      durationMs: { type: Number },
      uploadedAt: { type: Date },
      status: { type: String, enum: ['COMPLETED'] },
    },
    videoUrl: { type: String, trim: true },
    videoPublicId: { type: String, trim: true },
    imageUrls: [{ type: String }],
    inspectedByTechId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    inspectedAt: { type: Date, default: Date.now },
    inboundRequested: { type: Boolean, default: false, index: true },
    inboundTicketId: { type: Schema.Types.ObjectId, ref: 'FinishedGoodsTicket' },
    inboundRequestedAt: { type: Date },
    defectInboundRequested: { type: Boolean, default: false, index: true },
    defectInboundTicketId: { type: Schema.Types.ObjectId, ref: 'FinishedGoodsTicket' },
    defectInboundRequestedAt: { type: Date },
  },
  {
    collection: 'return_inspections',
    timestamps: true,
  }
);

returnInspectionSchema.index(
  { recordingId: 1 },
  { unique: true, partialFilterExpression: { recordingId: { $type: 'string' } } }
);
returnInspectionSchema.plugin(baseSchemaPlugin);

const ReturnInspection = mongoose.model('ReturnInspection', returnInspectionSchema);
export default ReturnInspection;

