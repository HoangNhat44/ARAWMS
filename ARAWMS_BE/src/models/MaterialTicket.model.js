/*
 * File: MaterialTicket.model.js
 * Author: Duy Anh
 * Date: 2026-10-26
 * Description: Defines inbound and outbound raw-material tickets. Supplier receipts retain inspection lines, physical lot plans, versions, confirmation keys, and putaway history.
 */
import mongoose from 'mongoose';
import baseSchemaPlugin from './plugins/baseSchema.plugin.js';
import { TICKET_STATUS } from '../common/constants/enums.js';

const { Schema } = mongoose;

const materialTicketItemSchema = new Schema(
  {
    rawMaterialId: { type: Schema.Types.ObjectId, ref: 'RawMaterial', required: true },
    fabricRollId: { type: Schema.Types.ObjectId, ref: 'FabricRoll' },
    rollBarcode: { type: String, required: true },
    designatedFifoLocationId: { type: Schema.Types.ObjectId, ref: 'WarehouseLocation', required: true },
    expectedQty: { type: Number, required: true },
    scannedQty: { type: Number, default: 0 },
    isScannedCompleted: { type: Boolean, default: false },
    scannedByStaffId: { type: Schema.Types.ObjectId, ref: 'User' },
    scannedAt: Date,
  },
  { _id: false }
);

/** Keeps the supplier inspection result and physical storage plan for one material. */
const receiptLineSchema = new Schema({
  rawMaterialId: { type: Schema.Types.ObjectId, ref: 'RawMaterial', required: true },
  supplierDeclaredQty: Number,
  actualQty: { type: Number, default: 0 },
  acceptedQty: { type: Number, default: 0 },
  rejectedQty: { type: Number, default: 0 },
  pendingQty: { type: Number, default: 0 },
  defectReason: String,
    qualityInspectionRef: String,
    inspectedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    inspectedAt: Date,
    inspectionConclusion: String,
    inspectionNote: String,
  rolls: [{
    clientLineId: { type: String, required: true }, supplierRollCode: String, lotCode: String,
    widthCm: Number, lengthMeters: Number, weightKg: Number,
    quality: { type: String, enum: ['ACCEPTED', 'REJECTED'] },
    defectReason: String, locationId: { type: Schema.Types.ObjectId, ref: 'WarehouseLocation' },
  }],
  lots: [{
    clientLineId: { type: String, required: true }, supplierLotCode: String, packageUnit: String,
    packageCount: Number, unitsPerPackage: Number, countedQty: Number,
    quality: { type: String, enum: ['ACCEPTED', 'REJECTED'] }, defectReason: String,
    allocations: [{ locationId: { type: Schema.Types.ObjectId, ref: 'WarehouseLocation' }, quantity: Number }],
  }],
}, { _id: false });

const materialTicketSchema = new Schema(
  {
    ticketCode: { type: String, required: true, unique: true, index: true },
    ticketType: {
      type: String,
      enum: ['INBOUND_FROM_PLAN', 'INBOUND_FROM_SUPPLIER', 'INBOUND_FROM_REMNANT', 'OUTBOUND_FOR_CUTTING', 'OUTBOUND_SUPPLEMENTARY'],
      required: true,
      index: true,
    },
    inboundPlanId: { type: Schema.Types.ObjectId, ref: 'MaterialInboundPlan', index: true },
    replacementForTicketId: { type: Schema.Types.ObjectId, ref: 'MaterialTicket' },
    remnantRequestId: { type: Schema.Types.ObjectId, ref: 'RemnantRecoveryRequest' },
    parentOutboundTicketId: { type: Schema.Types.ObjectId, ref: 'MaterialTicket' },
    status: { type: String, enum: TICKET_STATUS, default: 'WAITING_SCAN', index: true },
    createdByManagerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    items: [materialTicketItemSchema],
    supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier', index: true },
    contractId: { type: Schema.Types.ObjectId, ref: 'SupplierContract' },
    supplierDeliveryCode: { type: String, trim: true },
    receivedAt: Date,
    handoverName: String,
    receivingLocationId: { type: Schema.Types.ObjectId, ref: 'WarehouseLocation' },
    receiptNote: String,
    receiptAttachments: [{ fileName: String, mimeType: String, url: String, publicId: String,
      uploadedByUserId: { type: Schema.Types.ObjectId, ref: 'User' }, uploadedAt: Date }],
    receiptLines: [receiptLineSchema],
    receiptVersion: { type: Number, default: 0 },
    confirmationKey: String,
    confirmationFingerprint: String,
    usesPlannedLocationReservation: { type: Boolean, default: false },
    confirmedAt: Date,
    confirmedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    putawayEvents: [{ key: String, barcode: String, locationBarcode: String,
      locationId: { type: Schema.Types.ObjectId, ref: 'WarehouseLocation' }, quantity: Number, at: Date }],
    supplierReturns: [{ objectBarcode: { type: String, required: true },
      rawMaterialId: { type: Schema.Types.ObjectId, ref: 'RawMaterial', required: true },
      quantity: { type: Number, required: true }, defectReason: { type: String, required: true },
      status: { type: String, enum: ['WAITING_RETURN', 'RETURNED'], default: 'WAITING_RETURN' },
      requestedByUserId: { type: Schema.Types.ObjectId, ref: 'User' }, requestedAt: Date,
      handedOverByUserId: { type: Schema.Types.ObjectId, ref: 'User' }, handoverName: String, returnedAt: Date }],
  },
  { collection: 'material_tickets' }
);

materialTicketSchema.plugin(baseSchemaPlugin);
materialTicketSchema.index(
  { supplierId: 1, supplierDeliveryCode: 1, ticketType: 1 },
  { unique: true, partialFilterExpression: { ticketType: 'INBOUND_FROM_PLAN', supplierId: { $exists: true }, supplierDeliveryCode: { $exists: true } } }
);

const MaterialTicket = mongoose.model('MaterialTicket', materialTicketSchema);
export default MaterialTicket;
