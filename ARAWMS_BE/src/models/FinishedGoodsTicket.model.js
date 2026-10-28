/*
 * File: FinishedGoodsTicket.model.js
 * Author: Duy Anh
 * Date: 2026-10-21
 * Description: Models finished goods warehouse documents.
 */
import mongoose from 'mongoose';
import baseSchemaPlugin from './plugins/baseSchema.plugin.js';
import { TICKET_STATUS } from '../common/constants/enums.js';

const { Schema } = mongoose;

const finishedGoodsTicketItemSchema = new Schema(
  {
    skuId: { type: Schema.Types.ObjectId, ref: 'Sku', required: true },
    skuBarcode: { type: String, required: true },
    designatedFifoLocationId: { type: Schema.Types.ObjectId, ref: 'WarehouseLocation', required: true },
    expectedQty: { type: Number, required: true },
    scannedQty: { type: Number, default: 0 },
    scannedByStaffId: { type: Schema.Types.ObjectId, ref: 'User' },
    scannedAt: Date,
  },
  { _id: false }
);

const finishedGoodsTicketSchema = new Schema(
  {
    ticketCode: { type: String, required: true, unique: true, index: true },
    ticketType: {
      type: String,
      enum: ['INBOUND_FROM_SEWING', 'INBOUND_FROM_RETURN', 'DEFECT_QUARANTINE_INBOUND', 'DEFECT_DISPOSAL_OUTBOUND'],
      required: true,
      index: true,
    },
    garmentInspection: {
      inspectedByTechId: { type: Schema.Types.ObjectId, ref: 'User' },
      inspectedAt: Date,
      totalBatchQty: Number,
      passedQty: Number,
      failedDefectQty: Number,
      qcNote: String,
    },
    createdByManagerId: { type: Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: TICKET_STATUS, default: 'WAITING_QC', index: true },
    defectAction: {
      type: String,
      enum: ['NONE', 'REPAIR_AT_WORKSHOP', 'LIQUIDATION', 'DESTRUCTION'],
      default: 'NONE',
    },
    items: [finishedGoodsTicketItemSchema],
  },
  { collection: 'finished_goods_tickets' }
);

finishedGoodsTicketSchema.plugin(baseSchemaPlugin);

const FinishedGoodsTicket = mongoose.model('FinishedGoodsTicket', finishedGoodsTicketSchema);
export default FinishedGoodsTicket;
