import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Manager Reports collection – FT-12
 * Báo cáo vận hành của quản lý gửi Owner
 */

const managerReportSchema = new Schema(
  {
    code: { type: String, required: true, trim: true },
    reportType: {
      type: String,
      required: true,
      enum: [
        'DAILY_OPERATIONS',
        'WEEKLY',
        'MONTHLY',
        'PRODUCTION',
        'INVENTORY',
        'SALES',
        'EXCEPTION',
      ],
    },
    title: { type: String, required: true },
    periodStart: { type: Date },
    periodEnd: { type: Date },
    summary: { type: String },
    content: { type: Schema.Types.Mixed },
    fileUrl: { type: String },
    status: {
      type: String,
      required: true,
      enum: ['DRAFT', 'SUBMITTED', 'REVIEWED'],
    },
    submittedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    submittedAt: { type: Date },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
    ownerComment: { type: String },
  },
  { timestamps: true, collection: 'manager_reports' }
);

// Indexes
managerReportSchema.index({ code: 1 }, { unique: true });
managerReportSchema.index({ status: 1, submittedAt: -1 });

const ManagerReport = mongoose.model('ManagerReport', managerReportSchema);
export default ManagerReport;
