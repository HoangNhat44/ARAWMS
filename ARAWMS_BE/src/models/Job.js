import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Jobs collection – FT-02
 * 4 jobType: IMPORT | EXPORT | PRINT | REPORT_EXPORT
 */

const jobSchema = new Schema(
  {
    jobType: {
      type: String,
      required: true,
      enum: ['IMPORT', 'EXPORT', 'PRINT', 'REPORT_EXPORT'],
    },

    // --- IMPORT / EXPORT ---
    entityType: {
      type: String,
      enum: ['SKU', 'PRODUCT', 'MATERIAL', 'FABRIC_ROLL', 'SUPPLIER'],
    },
    fileName: { type: String },
    fileUrl: { type: String },
    totalRows: { type: Number },
    successRows: { type: Number },
    errorRows: { type: Number },
    errors: { type: Schema.Types.Mixed },
    status: {
      type: String,
      enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED'],
    },
    finishedAt: { type: Date },

    // --- PRINT ---
    templateId: { type: Schema.Types.ObjectId, ref: 'Config' },
    labelType: { type: String },
    ref: {
      type: {
        type: String,
      },
      id: { type: Schema.Types.ObjectId },
    },
    copies: { type: Number, min: 1 },
    reason: { type: String, enum: ['FIRST_PRINT', 'REPRINT', 'REMEASURE'] },

    // --- REPORT_EXPORT ---
    reportType: { type: String },
    periodId: { type: Schema.Types.ObjectId, ref: 'FinancialPeriod' },
    params: { type: Schema.Types.Mixed },
    fileFormat: { type: String, enum: ['XLSX', 'PDF', 'CSV'] },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, required: true, default: Date.now },
  },
  { collection: 'jobs' }
);

// Indexes
jobSchema.index({ jobType: 1, createdAt: -1 });
jobSchema.index(
  { 'ref.type': 1, 'ref.id': 1 },
  { partialFilterExpression: { 'ref.id': { $type: 'objectId' } } }
);

const Job = mongoose.model('Job', jobSchema);
export default Job;
