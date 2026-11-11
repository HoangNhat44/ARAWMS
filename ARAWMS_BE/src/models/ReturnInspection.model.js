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

const returnInspectionSchema = new Schema(
  {
    inspectionCode: { type: String, required: true, unique: true, index: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'SalesOrder', required: true, index: true },
    orderCode: { type: String, required: true, index: true },
    waybillCode: { type: String, index: true },
    returnWaybillCode: { type: String, index: true },
    rmaId: { type: Schema.Types.ObjectId, ref: 'ReturnRequest' },
    rmaCode: { type: String, trim: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer' },
    customerName: { type: String, trim: true },
    customerPhone: { type: String, trim: true },
    items: [returnInspectionItemSchema],
    inspectionResult: {
      type: String,
      enum: ['PASSED', 'FAILED'],
      required: true,
      index: true,
    },
    qcNote: { type: String, trim: true },
    rejectReason: { type: String, trim: true },
    videoUrl: { type: String, trim: true },
    videoPublicId: { type: String, trim: true },
    imageUrls: [{ type: String }],
    inspectedByTechId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    inspectedAt: { type: Date, default: Date.now },
    inboundRequested: { type: Boolean, default: false, index: true },
    inboundTicketId: { type: Schema.Types.ObjectId, ref: 'FinishedGoodsTicket' },
    inboundRequestedAt: { type: Date },
  },
  {
    collection: 'return_inspections',
    timestamps: true,
  }
);

returnInspectionSchema.plugin(baseSchemaPlugin);

const ReturnInspection = mongoose.model('ReturnInspection', returnInspectionSchema);
export default ReturnInspection;

