import { MaterialInboundPlan, SupplierContract, User } from '../../../models/index.js';

async function resolveAccountantUserId(explicitUserId) {
  if (explicitUserId) return explicitUserId;
  const accountant =
    (await User.findOne({ employeeCode: 'KETOAN' }).select('_id').lean()) ||
    (await User.findOne().select('_id').lean());
  return accountant?._id;
}

/**
 * UC 05: Schedule Material Inbound Plan - List
 */
export const listInboundPlans = async (filters = {}) => {
  const query = {};
  if (filters.contractId) query.contractId = filters.contractId;
  if (filters.supplierId) query.supplierId = filters.supplierId;
  if (filters.status && filters.status !== 'ALL') query.status = filters.status;
  if (filters.search && String(filters.search).trim()) {
    const regex = new RegExp(String(filters.search).trim(), 'i');
    query.planCode = regex;
  }

  return MaterialInboundPlan.find(query)
    .populate('contractId')
    .populate('supplierId')
    .populate('createdByAccountantId', 'fullName email employeeCode')
    .populate('expectedItems.rawMaterialId')
    .sort({ scheduledDeliveryDate: -1, createdAt: -1 });
};

/**
 * UC 05: Schedule Material Inbound Plan - Create
 */
export const scheduleInboundPlan = async (payload, currentUserId) => {
  const contract = await SupplierContract.findById(payload.contractId);
  if (!contract) {
    const err = new Error('Không tìm thấy hợp đồng mua nguyên phụ liệu');
    err.statusCode = 404;
    throw err;
  }

  const accountantId = await resolveAccountantUserId(currentUserId);
  const count = await MaterialInboundPlan.countDocuments();
  const planCode = payload.planCode
    ? String(payload.planCode).trim().toUpperCase()
    : `KH-NHAP-${String(count + 1).padStart(3, '0')}`;

  const existing = await MaterialInboundPlan.findOne({ planCode });
  if (existing) {
    const err = new Error(`Mã kế hoạch tiếp nhận ${planCode} đã tồn tại`);
    err.statusCode = 409;
    throw err;
  }

  const plan = await MaterialInboundPlan.create({
    planCode,
    contractId: contract._id,
    supplierId: contract.supplierId,
    scheduledDeliveryDate: new Date(payload.scheduledDeliveryDate),
    status: 'SCHEDULED',
    createdByAccountantId: accountantId,
    expectedItems: (payload.expectedItems || []).map((item) => ({
      rawMaterialId: item.rawMaterialId,
      plannedQty: Number(item.plannedQty),
      actualVerifiedPassedQty: Number(item.actualVerifiedPassedQty || 0),
      actualDefectiveOrShortQty: Number(item.actualDefectiveOrShortQty || 0),
    })),
  });

  return MaterialInboundPlan.findById(plan._id)
    .populate('contractId')
    .populate('supplierId')
    .populate('createdByAccountantId', 'fullName email employeeCode')
    .populate('expectedItems.rawMaterialId');
};

export const updateInboundPlanStatus = async (planId, payload) => {
  const plan = await MaterialInboundPlan.findById(planId);
  if (!plan) {
    const err = new Error('Không tìm thấy kế hoạch tiếp nhận nguyên liệu');
    err.statusCode = 404;
    throw err;
  }

  if (payload.status) {
    plan.status = payload.status;
  }
  if (payload.scheduledDeliveryDate) {
    plan.scheduledDeliveryDate = new Date(payload.scheduledDeliveryDate);
  }
  await plan.save();

  return MaterialInboundPlan.findById(plan._id)
    .populate('contractId')
    .populate('supplierId')
    .populate('createdByAccountantId', 'fullName email employeeCode')
    .populate('expectedItems.rawMaterialId');
};

export default {
  listInboundPlans,
  scheduleInboundPlan,
  updateInboundPlanStatus,
};

