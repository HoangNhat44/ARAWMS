/*
 * File: MaterialTicket.model.js
 * Author: Duy Anh
 * Date: 2026-10-26
 * Description: Defines material requests, receipts, and outbound tickets with inspection, stock, and progress fields.
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
  clientLineId: String,
  requestLineId: String,
  rawMaterialId: { type: Schema.Types.ObjectId, ref: 'RawMaterial', required: true },
  supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier' },
  supplierNameSnapshot: { type: String, trim: true },
  deliveryBatchItemId: { type: Schema.Types.ObjectId },
  unitCost: { type: Number, min: 0 },
  zeroCostReason: String,
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

// Outbound lines retain the checked physical sources on the same ticket that owns the issue.
const outboundSourceSchema = new Schema({
  kind: { type: String, enum: ['ROLL', 'LOT'], required: true },
  objectId: { type: Schema.Types.ObjectId, required: true },
  barcode: { type: String, required: true },
  locationId: { type: Schema.Types.ObjectId, ref: 'WarehouseLocation', required: true },
  locationCode: String,
  inboundTicketId: { type: Schema.Types.ObjectId, ref: 'MaterialTicket' },
  quantity: { type: Number, required: true, min: 0 },
  checkedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
  checkedAt: Date,
  checkedQuantity: Number,
}, { _id: false });
const outboundLineSchema = new Schema({
  rawMaterialId: { type: Schema.Types.ObjectId, ref: 'RawMaterial', required: true },
  materialCode: String, materialName: String, color: String, unit: String,
  quantity: { type: Number, required: true, min: 0 },
  sources: [outboundSourceSchema],
}, { _id: false });

/** A technician request is fulfilled by accepted quantities from linked receipts. */
const inboundRequestLineSchema = new Schema({
  clientLineId: { type: String, required: true },
  rawMaterialId: { type: Schema.Types.ObjectId, ref: 'RawMaterial', required: true },
  supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier' },
  supplierNameSnapshot: { type: String, trim: true },
  requestedQty: { type: Number, required: true, min: 0 },
  acceptedQty: { type: Number, min: 0 },
  receivedQty: { type: Number, default: 0, min: 0 },
  unitCost: { type: Number, min: 0 },
  inspectionRef: String,
  inspectedAt: Date,
  inspectedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
  inspectionConclusion: String,
  rolls: [{ clientLineId: String, supplierRollCode: String, lotCode: String, widthCm: Number,
    lengthMeters: Number, weightKg: Number, locationId: { type: Schema.Types.ObjectId, ref: 'WarehouseLocation' } }],
  lots: [{ clientLineId: String, supplierLotCode: String, packageUnit: String, packageCount: Number,
    unitsPerPackage: Number, countedQty: Number,
    allocations: [{ locationId: { type: Schema.Types.ObjectId, ref: 'WarehouseLocation' }, quantity: Number }] }],
}, { _id: false });

const materialTicketSchema = new Schema(
  {
    ticketCode: { type: String, required: true, unique: true, index: true },
    ticketType: {
      type: String,
      enum: ['INBOUND_REQUEST', 'INBOUND_FROM_PLAN', 'INBOUND_FROM_SUPPLIER', 'INBOUND_FROM_REMNANT', 'OUTBOUND_FOR_CUTTING', 'OUTBOUND_SUPPLEMENTARY', 'OUTBOUND_WAREHOUSE'],
      required: true,
      index: true,
    },
    inboundPlanId: { type: Schema.Types.ObjectId, ref: 'MaterialInboundPlan', index: true },
    deliveryBatchId: { type: Schema.Types.ObjectId, index: true },
    receiptSource: { type: String, enum: ['PLAN', 'DIRECT'] },
    purchaseSourceName: { type: String, trim: true },
    purchasedByName: { type: String, trim: true },
    deliveryTimeliness: { label: { type: String, enum: ['EARLY', 'ON_TIME', 'LATE'] },
      daysDifference: Number, expectedStart: Date, expectedEnd: Date },
    replacementForTicketId: { type: Schema.Types.ObjectId, ref: 'MaterialTicket' },
    remnantRequestId: { type: Schema.Types.ObjectId, ref: 'RemnantRecoveryRequest' },
    inboundRequestId: { type: Schema.Types.ObjectId, ref: 'MaterialTicket', index: true },
    requestedByTechnicianId: { type: Schema.Types.ObjectId, ref: 'User' },
    requestedAt: Date,
    requestNote: { type: String, maxlength: 500 },
    inspectionCompletedAt: Date,
    requestVersion: { type: Number, default: 0 },
    requestStatus: { type: String, enum: ['PARTIALLY_RECEIVED', 'COMPLETED', 'DISCREPANCY_REPORTED'] },
    requestLines: [inboundRequestLineSchema],
    discrepancyReports: [{ receiptId: { type: Schema.Types.ObjectId, ref: 'MaterialTicket' },
      requestVersion: Number, reason: { type: String, required: true },
      reportedByUserId: { type: Schema.Types.ObjectId, ref: 'User' }, reportedAt: Date,
      status: { type: String, enum: ['OPEN', 'RESOLVED'], default: 'OPEN' } }],
    inboundRequestVersion: Number,
    parentOutboundTicketId: { type: Schema.Types.ObjectId, ref: 'MaterialTicket' },
    status: { type: String, enum: TICKET_STATUS, default: 'WAITING_SCAN', index: true },
    createdByManagerId: { type: Schema.Types.ObjectId, ref: 'User',
      required() { return this.ticketType !== 'INBOUND_REQUEST'; } },
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
    warehouseCode: { type: String, index: true },
    issueDate: Date,
    department: String,
    recipient: String,
    purpose: String,
    lines: [outboundLineSchema],
    version: { type: Number, default: 0 },
    createdByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    cancelledByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    cancelledAt: Date,
    receiptVersion: { type: Number, default: 0 },
    draftKey: String,
    draftFingerprint: String,
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
materialTicketSchema.index({ draftKey: 1 }, { unique: true,
  partialFilterExpression: { draftKey: { $type: 'string' } } });
materialTicketSchema.index({ confirmationKey: 1 }, { unique: true,
  partialFilterExpression: { ticketType: 'OUTBOUND_WAREHOUSE', confirmationKey: { $type: 'string' } } });

const MaterialTicket = mongoose.model('MaterialTicket', materialTicketSchema);
export default MaterialTicket;
