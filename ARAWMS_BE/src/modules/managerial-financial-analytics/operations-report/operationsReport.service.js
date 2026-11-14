/* Người thực hiện: Nguyễn Ngọc Huy-HE171157 | Ngày: 2-11-2026
 * UC-12/13/19 và phản hồi 1–7: Báo cáo nhập hàng, doanh thu theo kỳ, nhu cầu nguyên liệu.
 * GBR-01/13: Chỉ đọc dữ liệu chưa xóa; hàng cách ly tách khỏi tồn dùng được. Không tính giá vốn/lợi nhuận.
 */
import mongoose from 'mongoose';
import { httpError } from '../../../common/utils/httpError.js';
import { channels, paymentStatusOf, salesChannelOf, salesReportScope } from './salesReportScope.js';

export const num = (v) => Number(v) || 0;
export const sum = (rows, fn) => rows.reduce((a, r) => a + num(fn(r)), 0);
const active = { isDeleted: { $ne: true } };
// Đọc collection thật trên kết nối MongoDB đang dùng; mọi truy vấn mặc định loại bản ghi xóa mềm.
// projection giới hạn trường cần đọc ở những truy vấn chỉ dùng ID hoặc thông tin tóm tắt.
export const read = (name, filter = {}, projection) => mongoose.connection.collection(name).find({ ...active, ...filter }, { projection }).toArray();
// UC-13: Ngày Việt Nam, khoảng kết thúc mở; kiểm tra ngày thực, tối đa một năm mỗi kỳ.
export function period(from, to) {
  const valid = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
  if (!valid(from) || !valid(to) || to < from || Date.parse(to) - Date.parse(from) >= 366 * 86400000) throw httpError(400, 'Chọn khoảng ngày hợp lệ, tối đa 366 ngày.');
  // Khoảng [đầu ngày from, đầu ngày sau to) theo UTC+7 bao gồm trọn ngày kết thúc.
  return { $gte: new Date(`${from}T00:00:00+07:00`), $lt: new Date(Date.parse(`${to}T00:00:00+07:00`) + 86400000) };
}
export const percent = (current, previous) => previous === 0 ? null : (current - previous) / Math.abs(previous) * 100;
export const ownerToday = (now = new Date()) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(now);

// Kiểm tra khoảng gốc rồi giới hạn thống kê ở ngày Việt Nam hiện tại.
// Khoảng hoàn toàn trong tương lai trả về tập rỗng.
export function reportPeriod(from, to, today = ownerToday()) {
  period(from, to);
  return { to: to < today ? to : today, range: from > today
    ? { $gte: new Date(`${from}T00:00:00+07:00`), $lt: new Date(`${from}T00:00:00+07:00`) }
    : period(from, to < today ? to : today) };
}
// Ghép phiếu hoàn với đơn gốc ngay ở MongoDB. Đơn có thể được đóng gói ở kỳ trước.
export async function readSalesPeriod(range, scope) {
  const [orders, returns] = await Promise.all([
    read('sales_orders', { ...scope, $or: [
      { 'warehouseFulfillment.packedAt': range },
      { 'warehouseFulfillment.packedAt': null, createdAt: range },
    ] }, {
      salesChannel: 1, channel: 1, sourceDetails: 1, conversationId: 1, paymentStatus: 1,
      status: 1, createdAt: 1, financialSummary: 1, 'warehouseFulfillment.packedAt': 1,
      'warehouseFulfillment.deliveredAt': 1, deliveredAt: 1, expectedDeliveryAt: 1,
    }),
    mongoose.connection.collection('return_requests').aggregate([
      { $match: { ...active, $or: [
        { 'financialAccounting.approvedAt': range },
        { 'financialAccounting.approvedAt': null, createdAt: range },
      ] } },
      { $lookup: {
        from: 'sales_orders', localField: 'originalOrderId', foreignField: '_id', as: 'originalOrder',
        pipeline: [{ $match: { ...active, ...scope } }, {
          $project: { salesChannel: 1, channel: 1, sourceDetails: 1, conversationId: 1 },
        }],
      } },
      ...(Object.keys(scope).length ? [{ $match: { 'originalOrder.0': { $exists: true } } }] : []),
      { $project: { status: 1, reasonCode: 1, financialAccounting: 1, createdAt: 1, originalOrder: { $first: '$originalOrder' } } },
    ]).toArray(),
  ]);
  return { orders, returns };
}
// UC-13: Doanh thu ghi nhận khi đóng gói, trừ giá trị hàng trả được duyệt trong kỳ; thanh toán đếm theo trường riêng.
export function salesSummary(orders, returns) {
  const refundsByChannel = new Map();
  for (const request of returns) {
    if (!['ACCOUNTANT_APPROVED', 'COMPLETED'].includes(request.status)) continue;
    const channel = salesChannelOf(request.originalOrder || {});
    refundsByChannel.set(channel, (refundsByChannel.get(channel) || 0) + num(request.financialAccounting?.returnedMerchandiseValue));
  }
  // Gom từng nguồn bán. Tiền hàng chỉ ghi nhận với đơn đã đóng gói và không ở trạng thái hủy.
  const grouped = channels.map((channel) => {
    const rows = orders.filter((o) => salesChannelOf(o) === channel);
    // Tổng giá trị đơn lấy totalOrderAmount của đơn chưa hủy (đã gồm giảm giá/phí vận chuyển).
    // Giữ riêng revenue vì doanh thu sau hoàn và tổng giá trị đơn là hai chỉ số khác nhau.
    const grossRevenue = sum(rows.filter((r) => r.warehouseFulfillment?.packedAt && r.status !== 'CANCELLED'), (o) => num(o.financialSummary?.itemsSubtotal) - num(o.financialSummary?.discountAmount));
    const refunded = refundsByChannel.get(channel) || 0;
    return { channel, orders: rows.length, orderValue: sum(rows.filter((o) => o.status !== 'CANCELLED'), (o) => o.financialSummary?.totalOrderAmount),
      grossRevenue, refunded, revenue: grossRevenue - refunded,
      paid: rows.filter((o) => paymentStatusOf(o) === 'PAID').length, unpaid: rows.filter((o) => ['UNPAID', 'PARTIAL'].includes(paymentStatusOf(o))).length,
      unknownPayment: rows.filter((o) => paymentStatusOf(o) === 'UNKNOWN').length, shipping: sum(rows.filter((o) => o.status !== 'CANCELLED'), (o) => o.financialSummary?.shippingFee),
      late: rows.filter((o) => o.expectedDeliveryAt && new Date(o.deliveredAt || o.warehouseFulfillment?.deliveredAt || Date.now()) > new Date(o.expectedDeliveryAt) && o.status !== 'CANCELLED').length };
  });
  // Chỉ trừ giá trị hàng hoàn đã được kế toán duyệt/hoàn tất; phí vận chuyển là chỉ số riêng.
  const refunded = sum(grouped, (r) => r.refunded);
  return { channels: grouped, orderValue: sum(grouped, (r) => r.orderValue), revenue: sum(grouped, (r) => r.revenue), refunded, orders: orders.length, returns: returns.length,
    shipping: sum(grouped, (r) => r.shipping), paid: sum(grouped, (r) => r.paid), unpaid: sum(grouped, (r) => r.unpaid),
    returnReasons: ['CUSTOMER_REFUSED', 'INVALID_ORDER', 'PRODUCT_DEFECT', 'OTHER', 'UNKNOWN'].map((reason) => ({ reason, count: returns.filter((r) => (r.reasonCode || 'UNKNOWN') === reason).length })),
    returnStatuses: ['REQUESTED', 'UNBOXED_INSPECTED', 'ACCOUNTANT_APPROVED', 'COMPLETED', 'REJECTED'].map((status) => ({ status, count: returns.filter((r) => r.status === status).length })) };
}
// UC-19: So sánh nhu cầu với tồn khả dụng thực tế; không lấy số tồn ghi sẵn trên lệnh làm nguồn.
export function productionRows(orders, materials, boms = []) {
  const byId = new Map(materials.map((r) => [String(r._id), r]));
  return orders.map((order) => {
    // UC-19: Khi chưa lưu bảng nhu cầu, tính từ đúng phiên bản định mức gắn với từng sản phẩm; không lấy bản mới nhất.
    const derived = new Map();
    for (const item of order.items || []) for (const line of boms.find((b) => String(b._id) === String(item.bomId))?.lines || []) {
      const key = String(line.materialId || line.rawMaterialId); const row = derived.get(key) || { materialId: line.materialId || line.rawMaterialId, requiredQty: 0 };
      row.requiredQty += num(item.plannedQty) * num(line.qtyPerUnit) * (1 + num(line.wastageRate)); derived.set(key, row);
    }
    const source = order.materialRequirements?.length ? order.materialRequirements : [...derived.values()];
    return { ...order, id: String(order._id), requirements: source.map((r) => {
    const material = byId.get(String(r.rawMaterialId || r.materialId)) || (r.materialCode ? materials.find((m) => m.materialCode === r.materialCode) : undefined);
    const required = num(r.requiredQty ?? r.plannedQty); const available = material ? Math.max(0, num(material.onHandQty) - num(material.reservedQty)) : null;
    return { ...r, name: material?.materialName || 'Chưa có thông tin nguyên liệu', unit: material?.unit, required, available,
      shortage: available === null ? null : Math.max(0, required - available), cause: available === null ? 'Chưa có dữ liệu tồn kho' : available < required ? `Tồn thực tế ${num(material.onHandQty)}, đã giữ chỗ ${num(material.reservedQty)}; không đủ cho nhu cầu ${required}.` : 'Đủ nguyên liệu' };
  }) }; });
}
/**
 * Nguồn dữ liệu chính của Tổng quan/Báo cáo doanh thu và các danh sách nhập, tồn kho.
 * sales_orders + return_requests: chỉ số bán hàng theo kỳ; raw_materials + skus: tồn hiện tại.
 * material_inbound_plans + supplier_contracts + suppliers: kế hoạch nhập và thông tin hợp đồng.
 * inventory_transactions: số nhập/xuất đã ghi sổ, khác với số lượng mới kiểm hàng đạt.
 */
export async function operationsReport(query) {
  if (query.scope && !['all', 'period'].includes(query.scope)) throw httpError(400, 'Phạm vi không hợp lệ.');
  const today = ownerToday();
  const range = period(query.from, query.to);
  const { range: salesRange } = reportPeriod(query.from, query.to, today);
  const { range: previousRange } = reportPeriod(query.compareFrom, query.compareTo, today);
  const salesScope = salesReportScope(query);
  // Các truy vấn độc lập chạy song song; đọc cả kỳ đang xem và kỳ đối chiếu để dùng cùng công thức.
  const [current, old, materials, skus, plans, contracts, suppliers, production, sessions, movements, employees, tasks, targets] = await Promise.all([
    readSalesPeriod(salesRange, salesScope), readSalesPeriod(previousRange, salesScope),
    read('raw_materials'), read('skus'), read('material_inbound_plans', query.scope === 'all' ? {} : { scheduledDeliveryDate: range }), read('supplier_contracts'), read('suppliers'),
    read('production_orders', { plannedStart: range }), read('stocktake_sessions', { createdAt: range }), read('inventory_transactions', { createdAt: range }),
    read('users', { status: 'ACTIVE', roleCode: { $ne: 'OWNER' } }, { fullName: 1, employeeCode: 1 }), read('work_assignments', { dueDate: range }), read('owner_targets', { year: Number(query.from.slice(0, 4)) }),
  ]);
  const sales = salesSummary(current.orders, current.returns); const previous = salesSummary(old.orders, old.returns);
  // Tạo bảng tra theo ObjectId để ghép tên nhà cung cấp/nguyên liệu mà không truy vấn riêng từng dòng.
  const supplierMap = new Map(suppliers.map((r) => [String(r._id), r])); const contractMap = new Map(contracts.map((r) => [String(r._id), r]));
  const materialMap = new Map(materials.map((r) => [String(r._id), r]));
  // Phản hồi 3/4: Nhập trễ kế hoạch từ tháng trước vẫn xuất hiện trong tháng thực nhập.
  const periodTickets = await read('material_tickets', { _id: { $in: movements.filter((m) => m.referenceModel === 'MaterialTicket' && m.transactionType === 'INBOUND_PUTAWAY').map((m) => m.referenceId) }, ticketType: 'INBOUND_FROM_PLAN' });
  const extraPlans = await read('material_inbound_plans', { _id: { $in: periodTickets.map((t) => t.inboundPlanId).filter(Boolean), $nin: plans.map((p) => p._id) } });
  plans.push(...extraPlans);
  const tickets = await read('material_tickets', { inboundPlanId: { $in: plans.map((p) => p._id) }, ticketType: 'INBOUND_FROM_PLAN' });
  const ticketMap = new Map(tickets.map((t) => [String(t._id), String(t.inboundPlanId)]));
  const allReceipts = await read('inventory_transactions', { referenceId: { $in: tickets.map((t) => t._id) }, referenceModel: 'MaterialTicket', transactionType: 'INBOUND_PUTAWAY' });
  const receiptQty = (rows, p, item) => sum(rows.filter((m) => ticketMap.get(String(m.referenceId)) === String(p._id) && String(m.rawMaterialId) === String(item.rawMaterialId)), (m) => m.quantityChange);
  // Phản hồi 3: Tiền hợp đồng chỉ cộng một lần dù có nhiều đợt nhập. Lượng đã nhập lấy sổ kho, không lấy số kiểm đạt.
  const purchases = plans.flatMap((p) => (p.expectedItems?.length ? p.expectedItems : [{}]).map((item) => {
    const contract = contractMap.get(String(p.contractId)); const material = materialMap.get(String(item.rawMaterialId));
    return { id: `${p._id}-${item.rawMaterialId}`, planCode: p.planCode, contractCode: contract?.contractCode || 'Chưa rõ hợp đồng', status: p.status, supplier: supplierMap.get(String(p.supplierId))?.supplierName || 'Chưa rõ nhà cung cấp',
      material: material?.materialName || 'Chưa có dòng nguyên liệu', unit: material?.unit, planned: num(item.plannedQty), verified: num(item.actualVerifiedPassedQty),
      received: receiptQty(allReceipts.filter((m) => m.createdAt >= range.$gte && m.createdAt < range.$lt), p, item), totalReceived: receiptQty(allReceipts, p, item),
      unitPrice: contract?.contractedMaterials?.find((r) => String(r.rawMaterialId) === String(item.rawMaterialId))?.unitPrice ?? null,
      planId: String(p._id), revision: p.assignmentRevision || 0,
      buyer: employees.find((r) => String(r._id) === String(p.assignedBuyerId || p.createdByAccountantId))?.fullName || 'Chưa phân công',
      receiver: employees.find((r) => String(r._id) === String(p.assignedReceiverId))?.fullName || 'Chưa phân công', scheduledDeliveryDate: p.scheduledDeliveryDate };
  }));
  const debts = contracts.filter((c) => query.scope !== 'period' || (c.createdAt >= range.$gte && c.createdAt < range.$lt) || plans.some((p) => String(p.contractId) === String(c._id))).map((c) => ({ id: String(c._id), code: c.contractCode, status: c.status, planCount: plans.filter((p) => String(p.contractId) === String(c._id)).length, supplier: supplierMap.get(String(c.supplierId))?.supplierName || 'Chưa rõ nhà cung cấp', total: num(c.totalContractAmount), paid: num(c.totalPaidAmount), debt: Math.max(0, num(c.totalContractAmount) - num(c.totalPaidAmount)) }));
  // Tồn khả dụng = tồn thực tế - giữ chỗ. Thành phẩm cách ly được trả riêng, không cộng vào tồn bán được.
  const inventory = [...materials.map((r) => ({ id: String(r._id), code: r.materialCode, name: r.materialName, type: 'RAW_MATERIAL', unit: r.unit, onHand: num(r.onHandQty), reserved: num(r.reservedQty), available: num(r.onHandQty) - num(r.reservedQty), quarantine: 0, price: r.unitCost })),
    ...skus.map((r) => ({ id: String(r._id), code: r.skuCode, name: r.styleName, type: 'FINISHED_GOODS', unit: 'PIECE', onHand: num(r.onHandQty), reserved: num(r.reservedQty), available: num(r.onHandQty) - num(r.reservedQty), quarantine: num(r.defectQuarantineQty), price: r.unitCogs ?? null }))];
  // Phân loại theo ngưỡng riêng của từng mã: hết hàng, dưới ngưỡng an toàn hoặc còn đủ hàng.
  inventory.forEach((r) => { const source = r.type === 'RAW_MATERIAL' ? materials.find((m) => String(m._id) === r.id) : skus.find((s) => String(s._id) === r.id); r.status = r.available <= 0 ? 'OUT_OF_STOCK' : r.available < num(source.safetyStockThreshold) ? 'LOW_STOCK' : 'AVAILABLE'; });
  const sewingTickets = await read('finished_goods_tickets', { _id: { $in: movements.filter((m) => m.referenceModel === 'FinishedGoodsTicket').map((m) => m.referenceId) }, ticketType: 'INBOUND_FROM_SEWING' });
  const sewingIds = new Set(sewingTickets.map((t) => String(t._id)));
  const output = sum(movements.filter((m) => m.warehouseType === 'FINISHED_GOODS' && m.transactionType === 'INBOUND_PUTAWAY' && m.referenceModel === 'FinishedGoodsTicket' && sewingIds.has(String(m.referenceId))), (m) => m.quantityChange);
  const target = targets[0]?.revenue ?? null;
  const boms = await read('boms', { _id: { $in: production.flatMap((p) => (p.items || []).map((i) => i.bomId)).filter(Boolean) } });
  const outboundMaterial = await read('material_tickets', { createdAt: range, ticketType: { $in: ['OUTBOUND_FOR_CUTTING', 'OUTBOUND_SUPPLEMENTARY'] } });
  const outboundSales = await read('sales_orders', { expectedDeliveryAt: range }, { orderCode: 1, status: 1, expectedDeliveryAt: 1, items: 1 });
  const outboundPlans = [...outboundMaterial.map((r) => ({ id: String(r._id), code: r.ticketCode, type: 'RAW_MATERIAL', date: r.createdAt, status: r.status, quantity: sum(r.items || [], (i) => i.expectedQty) })), ...outboundSales.map((r) => ({ id: String(r._id), code: r.orderCode, type: 'FINISHED_GOODS', date: r.expectedDeliveryAt, status: r.status, quantity: sum(r.items || [], (i) => i.orderedQty) }))];
  return { sales, previous, returnStatuses: sales.returnStatuses, change: percent(sales.revenue, previous.revenue), orderValueChange: percent(sales.orderValue, previous.orderValue), target, targetPercent: target > 0 ? sales.revenue / target * 100 : null,
    purchases, debts, inventory, production: productionRows(production, materials, boms), outboundPlans, sessions, movements, employees: employees.map((r) => ({ id: String(r._id), name: r.fullName })), tasks, output,
    generatedAt: new Date(), basis: 'Doanh thu theo ngày đóng gói, trừ hàng trả đã duyệt trong kỳ. Tồn kho và công nợ là số hiện tại; số nhập và sản lượng theo sổ kho trong kỳ. Chỉ tiêu là doanh thu cả năm, không tự phân bổ theo kỳ.' };
}
