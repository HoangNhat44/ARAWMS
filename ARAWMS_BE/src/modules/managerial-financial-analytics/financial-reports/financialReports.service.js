/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Report 3 — UC-104, UC-111, UC-112. Báo cáo doanh thu, giá vốn, lợi nhuận và phiếu thu chi.
 */
import SalesOrder from '../../../models/SalesOrder.model.js';
import ReturnRequest from '../../../models/ReturnRequest.model.js';
import CashFlowVoucher from '../../../models/CashFlowVoucher.model.js';
import { dashboardRange } from '../executive-dashboard/executiveDashboard.validation.js';
import { summarizeFinance } from './financialReports.validation.js';
import { pagination } from '../../../common/utils/ownerValidation.js';
const active = { isDeleted: { $ne: true } };
// Chỉ hoàn lại giá vốn cho hàng được đưa về tồn bán được. Dùng đơn giá đã chốt của dòng đơn gốc.
const returnedCogsExpression = {
  $sum: {
    $map: {
      input: { $ifNull: ['$warehouseInspection.items', []] }, as: 'returned',
      in: {
        $cond: [
          { $eq: ['$$returned.disposition', 'RESTOCK_SALEABLE'] },
          { $let: {
            vars: { sale: { $arrayElemAt: [{ $filter: { input: { $ifNull: ['$original.items', []] }, as: 'sold', cond: { $eq: ['$$sold.skuId', '$$returned.skuId'] } } }, 0] } },
            in: { $multiply: ['$$returned.returnedQty', { $ifNull: ['$$sale.unitCogsSnapshot', 0] }] },
          } },
          0,
        ],
      },
    },
  },
};
/** Tính doanh thu và giá vốn theo ngày đóng gói, giảm trừ theo ngày duyệt hàng trả và cộng thu chi theo ngày chứng từ. */
export const financialReport = async (query) => {
  // UC-13/14/17: Kiểm tra khoảng ngày trước khi đọc dữ liệu tài chính.
  const range = dashboardRange(query); const period = { $gte: range.start, $lt: range.end };
  // [BR: GBR-20] Báo cáo lấy giá vốn đã chốt ở dòng đơn khi đóng gói.
  // Không dùng ngày tạo đơn, đơn hủy hoặc giá vốn SKU hiện tại để tính lợi nhuận.
  const saleMatch = { ...active, 'warehouseFulfillment.packedAt': period,
    status: { $in: ['PACKED', 'HANDED_OVER_CARRIER', 'DELIVERED', 'RETURN_REQUESTED', 'RETURNED'] } };
  const [sales, returns, cash, daily, cashCategories, missingSnapshots] = await Promise.all([
    // Cộng doanh thu hàng hóa sau chiết khấu và giá vốn đã chốt của các đơn trong kỳ.
    SalesOrder.aggregate([{ $match: saleMatch }, { $group: { _id: null, count: { $sum: 1 },
      revenue: { $sum: { $subtract: [{ $ifNull: ['$financialSummary.itemsSubtotal', 0] }, { $ifNull: ['$financialSummary.discountAmount', 0] }] } },
      cogs: { $sum: { $sum: { $map: { input: '$items', as: 'item', in: { $multiply: ['$$item.orderedQty', '$$item.unitCogsSnapshot'] } } } } } } }]),
    // Chỉ đưa hồ sơ trả đã được kế toán duyệt hoặc hoàn tất vào số giảm trừ.
    ReturnRequest.aggregate([{ $match: { ...active, status: { $in: ['ACCOUNTANT_APPROVED', 'COMPLETED'] }, 'financialAccounting.approvedAt': period } },
      { $lookup: { from: 'sales_orders', localField: 'originalOrderId', foreignField: '_id', as: 'original' } },
      { $unwind: { path: '$original', preserveNullAndEmptyArrays: true } },
      { $project: { revenue: '$financialAccounting.returnedMerchandiseValue',
        surcharge: '$financialAccounting.surcharge10PercentAmount',
        restoredCogs: returnedCogsExpression,
      } }, { $group: { _id: null, count: { $sum: 1 }, revenue: { $sum: '$revenue' }, cogs: { $sum: '$restoredCogs' }, surcharge: { $sum: '$surcharge' } } }]),
    // UC-17: Cộng thu/chi theo ngày chứng từ; tiền mua vật tư hoặc trả công nợ không tự trở thành chi phí vận hành.
    CashFlowVoucher.aggregate([{ $match: { ...active, voucherDate: period } }, { $group: { _id: null,
      cashIn: { $sum: { $cond: [{ $eq: ['$flowType', 'CASH_IN'] }, '$amount', 0] } },
      cashOut: { $sum: { $cond: [{ $eq: ['$flowType', 'CASH_OUT'] }, '$amount', 0] } },
      operatingExpenses: { $sum: { $cond: [{ $and: [{ $eq: ['$flowType', 'CASH_OUT'] }, { $eq: ['$category', 'OPERATIONAL_EXPENSE'] }] }, '$amount', 0] } },
      otherIncome: { $sum: { $cond: [{ $and: [{ $eq: ['$flowType', 'CASH_IN'] }, { $in: ['$category', ['SURCHARGE_REVENUE', 'CARRIER_DISPUTE_COMPENSATION']] }] }, '$amount', 0] } },
    } }]),
    // UC-13: Chia doanh thu theo ngày Việt Nam để biểu đồ khớp với kỳ người dùng chọn.
    SalesOrder.aggregate([{ $match: saleMatch }, { $group: { _id: { $dateToString: { date: '$warehouseFulfillment.packedAt', format: '%Y-%m-%d', timezone: 'Asia/Ho_Chi_Minh' } },
      revenue: { $sum: { $subtract: ['$financialSummary.itemsSubtotal', '$financialSummary.discountAmount'] } },
      cogs: { $sum: { $sum: { $map: { input: '$items', as: 'item', in: { $multiply: ['$$item.orderedQty', '$$item.unitCogsSnapshot'] } } } } }, orders: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
    // UC-17: Tách thu/chi theo hạng mục để Owner đối chiếu nguồn tiền.
    CashFlowVoucher.aggregate([{ $match: { ...active, voucherDate: period } }, { $group: { _id: { category: '$category', flowType: '$flowType' }, amount: { $sum: '$amount' }, count: { $sum: 1 } } }, { $sort: { '_id.category': 1 } }]),
    // Đếm đơn thiếu dữ liệu giá vốn đã chốt để phản ánh mức độ đầy đủ của báo cáo.
    SalesOrder.countDocuments({ ...saleMatch, items: { $elemMatch: { unitCogsSnapshot: { $exists: false } } } }),
  ]);
  const s = sales[0] || {}; const r = returns[0] || {}; const c = cash[0] || {};
  // Dùng giá trị hàng trả đã ghi trong quyết toán để số liệu phản ánh giao dịch lịch sử.
  const totals = summarizeFinance({ revenue: s.revenue, cogs: s.cogs, returnedRevenue: r.revenue, returnedCogs: r.cogs, ...c });
  delete totals._id;
  return { period: { from: range.from, to: range.to }, generatedAt: new Date(), totals, orders: s.count || 0, approvedReturns: r.count || 0,
    daily: daily.map((row) => ({ date: row._id, revenue: row.revenue, cogs: row.cogs, grossProfit: row.revenue - row.cogs, orders: row.orders })),
    cashCategories: cashCategories.map((row) => ({ category: row._id.category, flowType: row._id.flowType, amount: row.amount, count: row.count })),
    dataQuality: { ordersMissingCogsSnapshot: missingSnapshots },
    basis: 'Doanh thu hàng hóa và giá vốn chốt lúc đóng gói; giảm trừ hàng trả theo ngày duyệt; phiếu thu chi theo ngày chứng từ. Chưa gồm thuế và khoản chi phí ngoài sổ hiện có.' };
};
// Chứng từ nguồn được trả cùng từng phiếu để người xem đối chiếu.
/** Lọc phiếu theo ngày chứng từ, sắp xếp mới nhất trước và trả một trang kèm tổng số phiếu. */
export const listCashVouchers = async (query) => {
  const { page, limit, ...dates } = query;
  const range = dashboardRange(dates);
  const paging = pagination({ page, limit });
  const filter = { ...active, voucherDate: { $gte: range.start, $lt: range.end } };
  const [items, total] = await Promise.all([CashFlowVoucher.find(filter).select('voucherCode flowType category amount paymentMethod voucherDate note supplierId contractId salesOrderId returnRequestId reconciliationBatchId')
    .sort({ voucherDate: -1, _id: -1 }).skip((paging.page - 1) * paging.limit).limit(paging.limit), CashFlowVoucher.countDocuments(filter)]);
  return { items, total, ...paging };
};
