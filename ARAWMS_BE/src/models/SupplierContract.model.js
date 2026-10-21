import mongoose from 'mongoose';
import baseSchemaPlugin from './plugins/baseSchema.plugin.js';
import { CONTRACT_STATUS } from '../common/constants/enums.js';

const { Schema } = mongoose;

const contractedMaterialSchema = new Schema(
  {
    rawMaterialId: { type: Schema.Types.ObjectId, ref: 'RawMaterial', required: true },
    contractedQty: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const supplierContractSchema = new Schema(
  {
    contractCode: { type: String, required: true, unique: true, index: true },
    supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true, index: true },
    parentSupersededContractId: { type: Schema.Types.ObjectId, ref: 'SupplierContract', default: null },
    status: { type: String, enum: CONTRACT_STATUS, default: 'DRAFT_FRAMEWORK', index: true },
    draftedByAccountantId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    finalizedByOwnerId: { type: Schema.Types.ObjectId, ref: 'User' },
    finalizedAt: { type: Date },
    frameworkDocumentUrl: { type: String },
    signedContractDocumentUrl: { type: String },
    totalContractAmount: { type: Number, required: true, min: 0 },
    totalPaidAmount: { type: Number, default: 0, min: 0 },
    breachPenaltyClause: { type: String },
    contractedMaterials: [contractedMaterialSchema],
  },
  { collection: 'supplier_contracts' }
);

supplierContractSchema.plugin(baseSchemaPlugin);

const SupplierContract = mongoose.model('SupplierContract', supplierContractSchema);
export default SupplierContract;
