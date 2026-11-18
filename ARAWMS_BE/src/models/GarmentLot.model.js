/**
 * ============================================================================
 * @title        : Garment Lot Model
 * @author       : AraWMS Team
 * @createdDate  : 2026-11-18
 * @lastModified : 2026-11-18
 * @description  : Quản lý lô thành phẩm (Finished Goods) và lô nguyên phụ liệu (Raw Material)
 *                 do Kỹ thuật viên (Garment Technician) khai báo trước hoặc trong lúc lập phiếu
 *                 yêu cầu nhập kho gửi Quản lý kho sinh QR cho từng lô.
 * @module       : Garment Technical / Lot Management
 * @layer        : Model
 * ============================================================================
 */

import mongoose from 'mongoose';
import baseSchemaPlugin from './plugins/baseSchema.plugin.js';

const { Schema } = mongoose;

const garmentLotSchema = new Schema(
  {
    lotCode: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
    lotType: {
      type: String,
      enum: ['FINISHED_GOODS', 'RAW_MATERIAL'],
      required: true,
      index: true,
    },
    qrValue: { type: String, required: true, unique: true, trim: true, index: true },
    status: {
      type: String,
      enum: ['DRAFT', 'REQUESTED', 'RECEIVED', 'CANCELLED'],
      default: 'DRAFT',
      index: true,
    },

    // --- Finished Goods Lot Fields ---
    skuId: { type: Schema.Types.ObjectId, ref: 'Sku', index: true },
    skuCode: { type: String, trim: true },
    skuBarcode: { type: String, trim: true },
    productName: { type: String, trim: true },
    color: { type: String, trim: true },
    size: { type: String, trim: true },
    totalQty: { type: Number, default: 0, min: 0 },
    failedQty: { type: Number, default: 0, min: 0 },
    defectCategory: {
      type: String,
      enum: [
        'NONE',
        'SEWING_DEFECT',
        'FABRIC_DEFECT',
        'SIZE_SPEC_ERROR',
        'ACCESSORY_LABEL_ERROR',
        'STAIN_DAMAGE',
        'OTHER',
      ],
      default: 'NONE',
    },
    defectNote: { type: String, trim: true, default: '' },
    productionDate: Date,
    workshopName: { type: String, trim: true, default: '' },
    productionOrderCode: { type: String, trim: true, default: '' },

    // --- Raw Material Lot Fields ---
    rawMaterialId: { type: Schema.Types.ObjectId, ref: 'RawMaterial', index: true },
    materialCode: { type: String, trim: true },
    materialName: { type: String, trim: true },
    materialType: { type: String, enum: ['FABRIC', 'AUXILIARY', null], default: null },
    unit: { type: String, trim: true },
    supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier' },
    supplierNameSnapshot: { type: String, trim: true, default: '' },
    inboundPlanId: { type: Schema.Types.ObjectId, ref: 'MaterialInboundPlan', default: null },
    contractId: { type: Schema.Types.ObjectId, ref: 'SupplierContract', default: null },
    supplierLotCode: { type: String, trim: true, default: '' },
    dyeLot: { type: String, trim: true, default: '' },
    manufactureDate: Date,
    expiryDate: Date,
    packageUnit: { type: String, trim: true, default: '' },
    packageCount: { type: Number, min: 0 },
    unitsPerPackage: { type: Number, min: 0 },
    unitCost: { type: Number, min: 0 },

    // --- Common Quantity & Notes ---
    quantity: { type: Number, required: true, min: 0 },
    note: { type: String, trim: true, default: '' },

    // --- Warehouse Handoff & QR Image Metadata (for Warehouse Manager to populate QR image) ---
    linkedTicketModel: {
      type: String,
      enum: ['FinishedGoodsTicket', 'MaterialTicket', null],
      default: null,
    },
    linkedTicketId: { type: Schema.Types.ObjectId, default: null, index: true },
    linkedTicketCode: { type: String, trim: true, default: '' },
    requestedAt: Date,
    qrImageUrl: { type: String, trim: true, default: '' },
    qrImagePublicId: { type: String, trim: true, default: '' },

    createdByTechId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  {
    collection: 'garment_lots',
    timestamps: true,
  }
);

garmentLotSchema.index({ lotType: 1, status: 1, createdAt: -1 });
garmentLotSchema.plugin(baseSchemaPlugin);

const GarmentLot = mongoose.model('GarmentLot', garmentLotSchema);
export default GarmentLot;
