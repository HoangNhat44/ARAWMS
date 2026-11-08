import { MaterialInboundPlan, User } from '../../../models/index.js';

async function resolveAccountantUserId(explicitUserId) {
  if (explicitUserId) return explicitUserId;
  const accountant =
    (await User.findOne({ employeeCode: 'KETOAN' }).select('_id').lean()) ||
    (await User.findOne().select('_id').lean());
  return accountant?._id;
}

/**
 * UC 06: Execute Contract Deviation Resolution - Danh sách các đợt giao sai kế hoạch
 */
export const listContractDeviations = async (filters = {}) => {
  const query = {
    $or: [
      { deliveryComplianceStatus: 'MISMATCHED' },
      { status: 'DEVIATION_REPORTED' },
      { status: 'DEVIATION_RESOLVED' },
      { 'technicianVerification.isMatchedWithPlan': false },
      { 'deviationResolution.status': { $in: ['UNRESOLVED', 'RESOLVED'] } },
      { 'batches.deliveryComplianceStatus': 'MISMATCHED' },
      { 'batches.status': { $in: ['DEVIATION_REPORTED', 'DEVIATION_RESOLVED'] } },
    ],
  };

  if (filters.status && filters.status !== 'ALL') {
    if (filters.status === 'RESOLVED') {
      query.$and = [
        {
          $or: [
            { 'deviationResolution.status': 'RESOLVED' },
            { status: 'DEVIATION_RESOLVED' },
          ],
        },
      ];
    } else if (filters.status === 'UNRESOLVED') {
      query.$and = [
        {
          $or: [
            { 'deviationResolution.status': 'UNRESOLVED' },
            { status: 'DEVIATION_REPORTED' },
            {
              'deviationResolution.status': { $ne: 'RESOLVED' },
              deliveryComplianceStatus: 'MISMATCHED',
            },
          ],
        },
      ];
    }
  }

  const plans = await MaterialInboundPlan.find(query)
    .populate('contractId')
    .populate('supplierId')
    .populate('createdByAccountantId', 'fullName email employeeCode')
    .populate('technicianVerification.verifiedByTechId', 'fullName email employeeCode')
    .populate('deviationResolution.resolvedByAccountantId', 'fullName email employeeCode')
    .populate('batches.technicianVerification.verifiedByTechId', 'fullName email employeeCode')
    .populate('batches.deviationResolution.resolvedByAccountantId', 'fullName email employeeCode')
    .populate('expectedItems.rawMaterialId')
    .populate('batches.expectedItems.rawMaterialId')
    .sort({ updatedAt: -1, createdAt: -1 });

  return plans;
};

/**
 * UC 06: Execute Contract Deviation Resolution - Xử lý sai lệch giao nhận
 * Ghi nhận giải pháp và ghi chú mô tả đã xử lý như thế nào, chuyển trạng thái sang RESOLVED (Đã xử lý)
 */
export const resolveContractDeviation = async (planId, payload, currentUserId) => {
  const plan = await MaterialInboundPlan.findById(planId);
  if (!plan) {
    const err = new Error('Không tìm thấy kế hoạch tiếp nhận nguyên liệu');
    err.statusCode = 404;
    throw err;
  }

  const notes = String(payload.resolutionNotes || '').trim();
  if (!notes) {
    const err = new Error('Vui lòng nhập ghi chú mô tả phương án đã xử lý sai lệch');
    err.statusCode = 400;
    throw err;
  }

  const accountantId = await resolveAccountantUserId(currentUserId);
  const now = new Date();
  const actionTaken = payload.actionTaken || 'SUPPLIER_RE_DELIVERY';

  // Cập nhật đợt giao nếu có batchNumber
  const batchNum = Number(payload.batchNumber);
  if (batchNum && Array.isArray(plan.batches) && plan.batches.length > 0) {
    const batch = plan.batches.find((b) => b.batchNumber === batchNum);
    if (batch) {
      batch.deviationResolution = {
        status: 'RESOLVED',
        resolutionNotes: notes,
        actionTaken,
        resolvedAt: now,
        resolvedByAccountantId: accountantId,
      };
      batch.status = 'DEVIATION_RESOLVED';
    }
  }

  // Cập nhật mức toàn bộ Kế hoạch
  plan.deviationResolution = {
    ...(plan.deviationResolution || {}),
    status: 'RESOLVED',
    resolutionNotes: notes,
    actionTaken,
    resolvedAt: now,
    resolvedByAccountantId: accountantId,
  };
  plan.status = 'DEVIATION_RESOLVED';

  await plan.save();

  return MaterialInboundPlan.findById(plan._id)
    .populate('contractId')
    .populate('supplierId')
    .populate('createdByAccountantId', 'fullName email employeeCode')
    .populate('technicianVerification.verifiedByTechId', 'fullName email employeeCode')
    .populate('deviationResolution.resolvedByAccountantId', 'fullName email employeeCode')
    .populate('batches.technicianVerification.verifiedByTechId', 'fullName email employeeCode')
    .populate('batches.deviationResolution.resolvedByAccountantId', 'fullName email employeeCode')
    .populate('expectedItems.rawMaterialId')
    .populate('batches.expectedItems.rawMaterialId');
};

export default {
  listContractDeviations,
  resolveContractDeviation,
};

