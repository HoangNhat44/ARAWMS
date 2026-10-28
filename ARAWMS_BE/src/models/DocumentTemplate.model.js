/*
 * File: DocumentTemplate.model.js
 * Author: Duy Anh
 * Date: 2026-10-26
 * Description: Defines reusable document and label templates. Stores template type, dimensions, markup, and default status.
 */
import mongoose from 'mongoose';
import baseSchemaPlugin from './plugins/baseSchema.plugin.js';

const { Schema } = mongoose;

const documentTemplateSchema = new Schema(
  {
    templateCode: { type: String, required: true, unique: true },
    templateType: {
      type: String,
      enum: ['FABRIC_BARCODE', 'SKU_BARCODE', 'WAYBILL', 'HANDOVER_REPORT'],
      required: true,
    },
    templateName: { type: String, required: true },
    dimensionsMm: {
      width: Number,
      height: Number,
    },
    htmlContent: { type: String, required: true },
    includedFields: [String],
    isDefault: { type: Boolean, default: false },
  },
  { collection: 'document_templates' }
);

documentTemplateSchema.plugin(baseSchemaPlugin);

const DocumentTemplate = mongoose.model('DocumentTemplate', documentTemplateSchema);
export default DocumentTemplate;
