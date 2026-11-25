/* Nguyễn Ngọc Huy-HE171157 | 2-11-2026
 * UC-12/13, phản hồi 3/6/8; GBR-14: Báo cáo điều hành, phân công nhập hàng và trả nợ nhà cung cấp có kiểm tra quyền và phiên bản.
 */
import mongoose from 'mongoose';
import { ownerRouter } from '../../../common/middlewares/ownerRouter.js';
import { asyncHandler, httpError } from '../../../common/utils/httpError.js';
import { objectId, textField, numberField } from '../../../common/utils/ownerValidation.js';
import { operationsReport } from './operationsReport.service.js';
import { bestSellersReport } from './bestSellers.service.js';
import { annualReport, trendReport } from './annualReport.service.js';
import { businessActivity } from './businessActivity.service.js';
import User from '../../../models/User.model.js';
import SystemLog from '../../../models/SystemLog.model.js';
import SupplierContract from '../../../models/SupplierContract.model.js';
import Supplier from '../../../models/Supplier.model.js';
import CashFlowVoucher from '../../../models/CashFlowVoucher.model.js';
import MaterialInboundPlan from '../../../models/MaterialInboundPlan.model.js';
const router = ownerRouter();
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
export default router;
