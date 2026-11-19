/* Nguyễn Ngọc Huy-HE171157 | 2-11-2026
 * UC-12/13/19, phản hồi 6; GBR-01: Báo cáo, giao việc, điều chỉnh kế hoạch có kiểm tra quyền và phiên bản.
 */
import mongoose from 'mongoose';
import { ownerRouter } from '../../../common/middlewares/ownerRouter.js';
import { asyncHandler, httpError } from '../../../common/utils/httpError.js';
import { objectId, textField, numberField } from '../../../common/utils/ownerValidation.js';
import { operationsReport, period } from './operationsReport.service.js';
import { bestSellersReport } from './bestSellers.service.js';
import { annualReport, trendReport } from './annualReport.service.js';
import { businessActivity } from './businessActivity.service.js';
import { returnTrendDemo } from './returnTrendDemo.service.js';
import ProductionOrder from '../../../models/ProductionOrder.model.js';
import User from '../../../models/User.model.js';
import SystemLog from '../../../models/SystemLog.model.js';
import SupplierContract from '../../../models/SupplierContract.model.js';
import Supplier from '../../../models/Supplier.model.js';
import CashFlowVoucher from '../../../models/CashFlowVoucher.model.js';
import MaterialInboundPlan from '../../../models/MaterialInboundPlan.model.js';
const router = ownerRouter();
// Chế độ trình diễn đọc riêng các mốc mẫu đã nạp cho Tổng quan.
router.get('/return-trend-demo', asyncHandler(async (_req, res) => {
  res.json({ success: true, data: await returnTrendDemo() });
}));
// Báo cáo đọc dữ liệu điều hành và xử lý hàng hoàn của chủ cửa hàng.
router.get('/business-activity', asyncHandler(async (req, res) => {
  res.json({ success: true, data: await businessActivity(req.query) });
}));
// Nguyễn Ngọc Huy-HE171157, 2-11-2026: UC-12/13 - Biểu đồ 12 tháng độc lập khoảng ngày của báo cáo tổng hợp.
router.get('/best-sellers', asyncHandler(async (req, res) => res.json({ success: true, data: await bestSellersReport(req.query) })));
router.get('/trend', asyncHandler(async (req, res) => res.json({ success: true, data: await trendReport(req.query) })));
router.get('/annual', asyncHandler(async (req, res) => res.json({ success: true, data: await annualReport(req.query) })));
router.get('/', asyncHandler(async (req, res) => res.json({ success: true, data: await operationsReport(req.query) })));
// Phản hồi 3/8; GBR-14: Phiếu trả nợ có hợp đồng gốc, số tiền không vượt dư nợ; cập nhật cùng một giao dịch.
router.post('/payments', asyncHandler(async (req, res) => {
  objectId(req.body.contractId); numberField(req.body.amount, 'Số tiền', 1, 1e12); const note = textField(req.body.note, 'Nội dung thanh toán', 500, 5);
  if (!['CASH', 'BANK_TRANSFER'].includes(req.body.paymentMethod)) throw httpError(400, 'Chọn tiền mặt hoặc chuyển khoản.');
  const data = await mongoose.connection.transaction(async (session) => {
    const contract = await SupplierContract.findOne({ _id: req.body.contractId, isDeleted: { $ne: true }, status: { $nin: ['CANCELLED', 'DRAFT_FRAMEWORK', 'SUPERSEDED'] } }).session(session);
    if (!contract || req.body.amount > contract.totalContractAmount - contract.totalPaidAmount) throw httpError(409, 'Số tiền vượt dư nợ hoặc hợp đồng không thể thanh toán.');
    const before = contract.totalPaidAmount; contract.totalPaidAmount += req.body.amount; await contract.save({ session });
    await Supplier.updateOne({ _id: contract.supplierId, isDeleted: { $ne: true } }, [{ $set: { totalPayableDebt: { $max: [0, { $subtract: ['$totalPayableDebt', req.body.amount] }] } } }], { session });
    const voucherId = new mongoose.Types.ObjectId();
    const [voucher] = await CashFlowVoucher.create([{ _id: voucherId, voucherCode: `CHI-NCC-${voucherId}`, flowType: 'CASH_OUT', category: 'SUPPLIER_INSTALLMENT', amount: req.body.amount, paymentMethod: req.body.paymentMethod, contractId: contract._id, supplierId: contract.supplierId, createdByAccountantId: req.user._id, voucherDate: new Date(), note }], { session });
    await SystemLog.create([{ actorId: req.user._id, actorRole: 'OWNER', majorFeature: 'Financial Intelligence', subFeature: 'Accounts Payable', action: 'PAY_SUPPLIER_DEBT', targetCollection: 'supplier_contracts', targetId: contract._id, beforeSnapshot: { totalPaidAmount: before }, afterSnapshot: { totalPaidAmount: contract.totalPaidAmount, voucherId, note } }], { session });
    return voucher;
  });
  res.status(201).json({ success: true, data });
}));
// Phản hồi 3/6: Phân công người mua và người nhận; chỉ nhận nhân viên hoạt động và phát hiện thay đổi đồng thời.
router.patch('/inbound/:id/assignment', asyncHandler(async (req, res) => {
  objectId(req.params.id); objectId(req.body.buyerId); objectId(req.body.receiverId); numberField(req.body.revision, 'Phiên bản', 0, 1e9, true);
  const ids = [...new Set([req.body.buyerId, req.body.receiverId])];
  const count = await User.countDocuments({ _id: { $in: ids }, status: 'ACTIVE', isDeleted: { $ne: true }, roleCode: { $ne: 'OWNER' } });
  if (count !== ids.length) throw httpError(400, 'Người được phân công phải là nhân viên đang hoạt động.');
  const plan = await MaterialInboundPlan.findOneAndUpdate({ _id: req.params.id, isDeleted: { $ne: true }, status: { $nin: ['CANCELLED', 'RESOLVED_SUPERSEDED'] }, $or: [{ assignmentRevision: req.body.revision }, ...(req.body.revision === 0 ? [{ assignmentRevision: { $exists: false } }] : [])] }, { $set: { assignedBuyerId: req.body.buyerId, assignedReceiverId: req.body.receiverId }, $inc: { assignmentRevision: 1 } }, { new: true });
  if (!plan) throw httpError(409, 'Kế hoạch đã thay đổi hoặc đã hủy. Hãy tải lại.');
  res.json({ success: true, data: plan });
}));
// UC-13: Chỉ tiêu năm lưu riêng; không suy diễn lợi nhuận từ doanh thu.
router.put('/target', asyncHandler(async (req, res) => {
  numberField(req.body.year, 'Năm', 2000, 2200, true); numberField(req.body.revenue, 'Chỉ tiêu doanh thu', 0, 1e15);
  await mongoose.connection.collection('owner_targets').updateOne({ year: req.body.year }, { $set: { revenue: req.body.revenue, updatedAt: new Date(), updatedBy: req.user._id, isDeleted: false } }, { upsert: true });
  res.json({ success: true });
}));
// UC-19: Chỉ điều chỉnh lệnh chưa phát hành, có lý do; không tự sửa định mức hoặc lượng tồn.
router.patch('/production/:id', asyncHandler(async (req, res) => {
  objectId(req.params.id); const { expectedVersion, ratio, reason } = req.body;
  numberField(expectedVersion, 'Phiên bản', 0, 1e9, true); numberField(ratio, 'Tỷ lệ kế hoạch', 0.01, 1); textField(reason, 'Lý do', 500, 5);
  const result = await mongoose.connection.transaction(async (session) => {
    const order = await ProductionOrder.findOne({ _id: req.params.id, isDeleted: { $ne: true }, status: { $in: ['DRAFT', 'PLANNED', 'MATERIAL_SHORTAGE'] } }).session(session);
    if (!order || (order.__v || 0) !== expectedVersion) throw httpError(409, 'Kế hoạch đã thay đổi hoặc đã phát hành. Hãy tải lại.');
    const before = order.toObject();
    // Làm tròn thành phẩm xuống để không sản xuất vượt nguồn lực; vật tư tỷ lệ theo số sản phẩm thực sau làm tròn.
    const planned = order.items.reduce((s, r) => s + (r.plannedQty || 0), 0);
    order.items.forEach((r) => { r.plannedQty = Math.floor(r.plannedQty * ratio); });
    if (order.items.some((r) => r.plannedQty < Math.max(r.completedQty || 0, r.receivedQty || 0))) throw httpError(400, 'Kế hoạch không được nhỏ hơn số đã hoàn thành hoặc đã nhập kho.');
    const next = order.items.reduce((s, r) => s + r.plannedQty, 0);
    if (!planned || !next) throw httpError(400, 'Kế hoạch phải còn ít nhất một thành phẩm.');
    order.materialRequirements = order.materialRequirements.map((r) => ({ ...r, requiredQty: Number(r.requiredQty ?? r.plannedQty ?? 0) * next / planned }));
    order.markModified('materialRequirements'); order.__v = expectedVersion + 1; await order.save({ session });
    await SystemLog.create([{ actorId: req.user._id, actorRole: 'OWNER', majorFeature: 'Production Operations', subFeature: 'BOM Plan Report', action: 'ADJUST_PRODUCTION_PLAN', targetCollection: 'production_orders', targetId: order._id, beforeSnapshot: before, afterSnapshot: { ...order.toObject(), reason } }], { session });
    return order;
  });
  res.json({ success: true, data: result });
}));
// Phản hồi 6: Giao việc cho tài khoản hoạt động, lưu thời hạn/trạng thái; không cấp quyền ngoài vai trò.
router.post('/tasks', asyncHandler(async (req, res) => {
  const title = textField(req.body.title, 'Công việc', 200, 5); objectId(req.body.assigneeId); period(req.body.dueDate, req.body.dueDate);
  const employee = await User.findOne({ _id: req.body.assigneeId, status: 'ACTIVE', roleCode: { $ne: 'OWNER' }, isDeleted: { $ne: true } });
  if (!employee) throw httpError(400, 'Nhân viên không còn hoạt động.');
  const task = { title, assigneeId: employee._id, assigneeName: employee.fullName, dueDate: new Date(`${req.body.dueDate}T12:00:00+07:00`), status: 'NOT_STARTED', revision: 0, createdBy: req.user._id, createdAt: new Date(), isDeleted: false };
  await mongoose.connection.collection('work_assignments').insertOne(task); res.status(201).json({ success: true, data: task });
}));
router.patch('/tasks/:id', asyncHandler(async (req, res) => {
  objectId(req.params.id); numberField(req.body.revision, 'Phiên bản', 0, 1e9, true);
  if (!['NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED'].includes(req.body.status)) throw httpError(400, 'Trạng thái không hợp lệ.');
  const result = await mongoose.connection.collection('work_assignments').updateOne({ _id: new mongoose.Types.ObjectId(req.params.id), revision: req.body.revision, isDeleted: false }, { $set: { status: req.body.status, updatedAt: new Date(), updatedBy: req.user._id }, $inc: { revision: 1 } });
  if (!result.modifiedCount) throw httpError(409, 'Công việc đã thay đổi. Hãy tải lại.');
  res.json({ success: true });
}));
export default router;
