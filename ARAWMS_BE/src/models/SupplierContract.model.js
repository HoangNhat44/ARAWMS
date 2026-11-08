/*
 * File: SupplierContract.model.js
 * Author: Duy Anh
 * Date: 2026-10-26
 * Description: Defines supplier purchasing contracts. Tracks contract terms, value, status, and supplier relationships.
 */
import mongoose from 'mongoose';
import baseSchemaPlugin from './plugins/baseSchema.plugin.js';
import { CONTRACT_STATUS } from '../common/constants/enums.js';

const { Schema } = mongoose;

const contractedMaterialSchema = new Schema(
  {
    rawMaterialId: { type: Schema.Types.ObjectId, ref: 'RawMaterial', required: true },
    materialCodeSnapshot: { type: String, default: '' },
    materialNameSnapshot: { type: String, default: '' },
    unitSnapshot: { type: String, default: 'METER' },
    composition: { type: String, default: '100% Cotton' },
    colorSpec: { type: String, default: '' },
    widthCm: { type: Number, default: 160, min: 0 },
    gsm: { type: Number, default: 200, min: 0 },
    shrinkageTolerancePct: { type: Number, default: 2.5, min: 0 },
    colorFastnessGrade: { type: String, default: 'Grade 4.0 (ISO 105)' },
    qtyTolerancePct: { type: Number, default: 3, min: 0 },
    moq: { type: Number, default: 100, min: 1 },
    leadTimeDays: { type: Number, default: 7, min: 1 },
    contractedQty: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    vatRatePct: { type: Number, default: 8, min: 0 },
    packagingSpec: {
      type: String,
      default: 'Cuộn bọc nilon 2 lớp chống ẩm, lõi ống giấy cứng, dán tem Barcode từng cây vải',
    },
    technicalNote: { type: String, default: '' },
  },
  { _id: false }
);

const supplierContractSchema = new Schema(
  {
    contractCode: { type: String, required: true, unique: true, index: true },
    contractTitle: {
      type: String,
      default: 'khung hợp đồng cung ứng nguyên phụ liệu may mặc',
    },
    contractType: {
      type: String,
      enum: ['FRAMEWORK_AGREEMENT', 'BATCH_LUMP_SUM', 'FIXED_UNIT_PRICE'],
      default: 'FRAMEWORK_AGREEMENT',
    },
    signingDate: { type: Date, default: Date.now },
    effectiveFrom: { type: Date, default: Date.now },
    effectiveTo: {
      type: Date,
      default: function () {
        const base = this.effectiveFrom || this.signingDate || Date.now();
        const d = new Date(base);
        d.setMonth(d.getMonth() + 6);
        return d;
      },
    },
    supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true, index: true },
    parentSupersededContractId: { type: Schema.Types.ObjectId, ref: 'SupplierContract', default: null },
    rootContractId: { type: Schema.Types.ObjectId, ref: 'SupplierContract', default: null, index: true },
    versionNumber: { type: Number, default: 1, min: 1, index: true },
    amendmentReason: { type: String, default: '' },
    status: { type: String, enum: CONTRACT_STATUS, default: 'DRAFT_FRAMEWORK', index: true },
    draftedByAccountantId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    finalizedByOwnerId: { type: Schema.Types.ObjectId, ref: 'User' },
    finalizedAt: { type: Date },
    buyerInfo: {
      companyName: {
        type: String,
        default: 'CÔNG TY TNHH THỜI TRANG & KHO VẬN ARA (ARASTORE)',
      },
      taxCode: { type: String, default: '0109888999' },
      representativeName: { type: String, default: 'Trần Hoàng Chủ Tịch' },
      representativeRole: { type: String, default: 'Chủ sở hữu / Giám đốc' },
      receivingWarehouseAddress: {
        type: String,
        default: 'Kho Tổng Nguyên Phụ Liệu AraStore – KCN Tân Bình, TP.HCM',
      },
    },
    commercialTerms: {
      currency: { type: String, default: 'VND' },
      subtotalAmount: { type: Number, default: 0, min: 0 },
      vatRatePct: { type: Number, default: 8, min: 0 },
      vatAmount: { type: Number, default: 0, min: 0 },
      depositPercent: { type: Number, default: 30, min: 0, max: 100 },
      depositAmount: { type: Number, default: 0, min: 0 },
      paymentInstallmentsCount: { type: Number, default: 1, min: 0, max: 12 },
      paymentSchedule: [
        {
          installmentNumber: { type: Number, required: true, min: 1 },
          dueDate: { type: Date, required: true },
          paymentPercent: { type: Number, required: true, min: 0, max: 100 },
          paymentAmount: { type: Number, default: 0, min: 0 },
          note: { type: String, default: '' },
        },
      ],
      paymentMethod: {
        type: String,
        enum: ['BANK_TRANSFER', 'CASH', 'LETTER_OF_CREDIT'],
        default: 'BANK_TRANSFER',
      },
      paymentCreditDays: { type: Number, default: 30, min: 0 },
      deliveryTerm: {
        type: String,
        enum: ['GIAO_TAI_KHO_BEN_A', 'GIAO_TAI_XUONG_MAY', 'NHAN_TAI_KHO_NCC'],
        default: 'GIAO_TAI_KHO_BEN_A',
      },
      partialDeliveryAllowed: { type: Boolean, default: true },
    },
    qualityStandards: {
      inspectionStandard: {
        type: String,
        default: 'Hệ thống 4 điểm (ASTM D5430 4-Point System) đối với vải cuộn; AQL 2.5 đối với phụ liệu may',
      },
      maxDefectPointsPer100SqYards: { type: Number, default: 20, min: 0 },
      maxRollJoints: { type: Number, default: 1, min: 0 },
      requirePreShipmentSample: { type: Boolean, default: true },
      returnExchangeWarrantyDays: { type: Number, default: 15, min: 0 },
    },
    frameworkDocumentUrl: { type: String, default: '' },
    signedContractDocumentUrl: { type: String, default: '' },
    totalContractAmount: { type: Number, required: true, min: 0 },
    totalPaidAmount: { type: Number, default: 0, min: 0 },
    latePenaltyPercentPerDay: { type: Number, default: 0.5, min: 0 },
    maxPenaltyPercent: { type: Number, default: 8, min: 0 },
    breachPenaltyClause: {
      type: String,
      default:
        'Giao chậm phạt 0.5%/ngày trên giá trị lô hàng chậm tiến độ (tối đa 8%). Nếu vải/phụ liệu không đạt kiểm định KCS (sai khổ vải, lệch định lượng GSM, độ co rút vượt ngưỡng hoặc lỗi ngoại quan > 20 điểm/100 sq.yds), Bên B phải đổi trả 100% trong vòng 5 ngày làm việc và chịu toàn bộ chi phí vận chuyển hai chiều.',
    },
    disputeResolutionClause: {
      type: String,
      default:
        'Mọi tranh chấp phát sinh được ưu tiên giải quyết qua thương lượng trên cơ sở Biên bản KCS thực tế tại kho Bên A; nếu không đạt thỏa thuận sẽ đưa ra Tòa án Kinh tế có thẩm quyền tại TP.HCM.',
    },
    notes: { type: String, default: '' },
    terminatedAt: { type: Date, default: null },
    terminatedByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    terminationReason: { type: String, default: '' },
    isAutoTerminated: { type: Boolean, default: false },
    contractedMaterials: [contractedMaterialSchema],
  },
  { collection: 'supplier_contracts' }
);

supplierContractSchema.plugin(baseSchemaPlugin);

const SupplierContract = mongoose.model('SupplierContract', supplierContractSchema);
export default SupplierContract;
