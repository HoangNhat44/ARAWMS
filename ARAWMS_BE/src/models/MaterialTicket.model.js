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

const materialTicketSchema = new Schema(
  {
    ticketCode: { type: String, required: true, unique: true, index: true },
    ticketType: {
      type: String,
      enum: ['INBOUND_FROM_PLAN', 'INBOUND_FROM_REMNANT', 'OUTBOUND_FOR_CUTTING', 'OUTBOUND_SUPPLEMENTARY'],
      required: true,
      index: true,
    },
    inboundPlanId: { type: Schema.Types.ObjectId, ref: 'MaterialInboundPlan', index: true },
    remnantRequestId: { type: Schema.Types.ObjectId, ref: 'RemnantRecoveryRequest' },
    parentOutboundTicketId: { type: Schema.Types.ObjectId, ref: 'MaterialTicket' },
    status: { type: String, enum: TICKET_STATUS, default: 'WAITING_SCAN', index: true },
    createdByManagerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    items: [materialTicketItemSchema],
  },
  { collection: 'material_tickets' }
);

materialTicketSchema.plugin(baseSchemaPlugin);

const MaterialTicket = mongoose.model('MaterialTicket', materialTicketSchema);
export default MaterialTicket;
