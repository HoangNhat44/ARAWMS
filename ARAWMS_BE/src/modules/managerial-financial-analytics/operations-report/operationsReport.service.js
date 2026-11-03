/* Người thực hiện: Nguyễn Ngọc Huy-HE171157 | Ngày: 2-11-2026
 * UC-12/13/19 và phản hồi 1–7: Báo cáo nhập hàng, doanh thu theo kỳ, nhu cầu nguyên liệu.
 * GBR-01/13: Chỉ đọc dữ liệu chưa xóa; hàng cách ly tách khỏi tồn dùng được. Không tính giá vốn/lợi nhuận.
 */
import mongoose from 'mongoose';
import { httpError } from '../../../common/utils/httpError.js';

export const num = (v) => Number(v) || 0;
export const sum = (rows, fn) => rows.reduce((a, r) => a + num(fn(r)), 0);
const active = { isDeleted: { $ne: true } };
export const read = (name, filter = {}, projection) => mongoose.connection.collection(name).find({ ...active, ...filter }, { projection }).toArray();
// UC-13: Ngày Việt Nam, khoảng kết thúc mở; kiểm tra ngày thực, tối đa một năm mỗi kỳ.
export function period(from, to) {
  const valid = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
  if (!valid(from) || !valid(to) || to < from || Date.parse(to) - Date.parse(from) >= 366 * 86400000) throw httpError(400, 'Chọn khoảng ngày hợp lệ, tối đa 366 ngày.');
  return { $gte: new Date(`${from}T00:00:00+07:00`), $lt: new Date(Date.parse(`${to}T00:00:00+07:00`) + 86400000) };
}
export const percent = (current, previous) => previous === 0 ? null : (current - previous) / Math.abs(previous) * 100;
export const channels = ['FACEBOOK', 'SHOPEE', 'TIKTOK', 'WHOLESALE', 'RETAIL', 'DIRECT', 'UNKNOWN'];
// UC-13: Doanh thu ghi nhận khi đóng gói, trừ giá trị hàng trả được duyệt trong kỳ; thanh toán đếm theo trường riêng.
export function salesSummary(orders, returns) {
  const grouped = channels.map((channel) => {
    const rows = orders.filter((o) => (o.salesChannel || 'UNKNOWN') === channel);
    return { channel, orders: rows.length, revenue: sum(rows.filter((r) => r.warehouseFulfillment?.packedAt && r.status !== 'CANCELLED'), (o) => num(o.financialSummary?.itemsSubtotal) - num(o.financialSummary?.discountAmount)),
      paid: rows.filter((o) => o.paymentStatus === 'PAID').length, unpaid: rows.filter((o) => ['UNPAID', 'PARTIAL'].includes(o.paymentStatus)).length,
      unknownPayment: rows.filter((o) => !o.paymentStatus || o.paymentStatus === 'UNKNOWN').length, shipping: sum(rows.filter((o) => o.status !== 'CANCELLED'), (o) => o.financialSummary?.shippingFee),
      late: rows.filter((o) => o.expectedDeliveryAt && new Date(o.deliveredAt || Date.now()) > new Date(o.expectedDeliveryAt) && o.status !== 'CANCELLED').length };
  });
  const refunded = sum(returns.filter((r) => ['ACCOUNTANT_APPROVED', 'COMPLETED'].includes(r.status)), (r) => r.financialAccounting?.returnedMerchandiseValue);
  return { channels: grouped, revenue: sum(grouped, (r) => r.revenue) - refunded, refunded, orders: orders.length, returns: returns.length,
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
export async function operationsReport(query) {
  const range = period(query.from, query.to); const previousRange = period(query.compareFrom, query.compareTo);
  if (query.salesChannel && !channels.includes(query.salesChannel)) throw httpError(400, 'Nguồn bán không hợp lệ.');
  if (query.paymentStatus && !['PAID', 'UNPAID', 'PARTIAL', 'UNKNOWN'].includes(query.paymentStatus)) throw httpError(400, 'Trạng thái thanh toán không hợp lệ.');
  const salesScope = { ...(query.salesChannel ? { salesChannel: query.salesChannel === 'UNKNOWN' ? { $in: ['UNKNOWN', null] } : query.salesChannel } : {}), ...(query.paymentStatus ? { paymentStatus: query.paymentStatus === 'UNKNOWN' ? { $in: ['UNKNOWN', null] } : query.paymentStatus } : {}) };
  const scopedOrders = Object.keys(salesScope).length ? await read('sales_orders', salesScope, { _id: 1 }) : null;
  // Lọc riêng theo thời điểm nghiệp vụ; không dùng ngày tạo thay ngày đóng gói/duyệt hoàn.
  const salesFilter = (r) => ({ ...salesScope, $or: [{ 'warehouseFulfillment.packedAt': r }, { 'warehouseFulfillment.packedAt': null, createdAt: r }] });
  const returnFilter = (r) => ({ ...(scopedOrders ? { originalOrderId: { $in: scopedOrders.map((o) => o._id) } } : {}), $or: [{ 'financialAccounting.approvedAt': r }, { 'financialAccounting.approvedAt': null, createdAt: r }] });
  const [orders, returns, oldOrders, oldReturns, materials, skus, plans, contracts, suppliers, production, sessions, movements, employees, tasks, targets] = await Promise.all([
    read('sales_orders', salesFilter(range)), read('return_requests', returnFilter(range)), read('sales_orders', salesFilter(previousRange)), read('return_requests', returnFilter(previousRange)),
    read('raw_materials'), read('skus'), read('material_inbound_plans', { scheduledDeliveryDate: range }), read('supplier_contracts'), read('suppliers'),
    read('production_orders', { plannedStart: range }), read('stocktake_sessions', { createdAt: range }), read('inventory_transactions', { createdAt: range }),
    read('users', { status: 'ACTIVE', roleCode: { $ne: 'OWNER' } }, { fullName: 1, employeeCode: 1 }), read('work_assignments', { dueDate: range }), read('owner_targets', { year: Number(query.from.slice(0, 4)) }),
  ]);
  const sales = salesSummary(orders, returns); const previous = salesSummary(oldOrders, oldReturns);
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
  const purchases = plans.flatMap((p) => (p.expectedItems || []).map((item) => {
    const contract = contractMap.get(String(p.contractId)); const material = materialMap.get(String(item.rawMaterialId));
    return { id: `${p._id}-${item.rawMaterialId}`, planCode: p.planCode, status: p.status, supplier: supplierMap.get(String(p.supplierId))?.supplierName || 'Chưa rõ nhà cung cấp',
      material: material?.materialName, unit: material?.unit, planned: num(item.plannedQty), verified: num(item.actualVerifiedPassedQty),
      received: receiptQty(allReceipts.filter((m) => m.createdAt >= range.$gte && m.createdAt < range.$lt), p, item), totalReceived: receiptQty(allReceipts, p, item),
      unitPrice: contract?.contractedMaterials?.find((r) => String(r.rawMaterialId) === String(item.rawMaterialId))?.unitPrice ?? null,
      planId: String(p._id), revision: p.assignmentRevision || 0,
      buyer: employees.find((r) => String(r._id) === String(p.assignedBuyerId || p.createdByAccountantId))?.fullName || 'Chưa phân công',
      receiver: employees.find((r) => String(r._id) === String(p.assignedReceiverId))?.fullName || 'Chưa phân công', scheduledDeliveryDate: p.scheduledDeliveryDate };
  }));
  const debts = [...new Set(plans.map((p) => String(p.contractId)))].map((id) => contractMap.get(id)).filter(Boolean).map((c) => ({ id: String(c._id), code: c.contractCode, supplier: supplierMap.get(String(c.supplierId))?.supplierName, total: num(c.totalContractAmount), paid: num(c.totalPaidAmount), debt: Math.max(0, num(c.totalContractAmount) - num(c.totalPaidAmount)) }));
  const inventory = [...materials.map((r) => ({ id: String(r._id), code: r.materialCode, name: r.materialName, type: 'RAW_MATERIAL', unit: r.unit, onHand: num(r.onHandQty), reserved: num(r.reservedQty), available: num(r.onHandQty) - num(r.reservedQty), quarantine: 0, price: r.unitCost })),
    ...skus.map((r) => ({ id: String(r._id), code: r.skuCode, name: r.styleName, type: 'FINISHED_GOODS', unit: 'PIECE', onHand: num(r.onHandQty), reserved: num(r.reservedQty), available: num(r.onHandQty) - num(r.reservedQty), quarantine: num(r.defectQuarantineQty) }))];
  inventory.forEach((r) => { const source = r.type === 'RAW_MATERIAL' ? materials.find((m) => String(m._id) === r.id) : skus.find((s) => String(s._id) === r.id); r.status = r.available <= 0 ? 'OUT_OF_STOCK' : r.available < num(source.safetyStockThreshold) ? 'LOW_STOCK' : 'AVAILABLE'; });
  const sewingTickets = await read('finished_goods_tickets', { _id: { $in: movements.filter((m) => m.referenceModel === 'FinishedGoodsTicket').map((m) => m.referenceId) }, ticketType: 'INBOUND_FROM_SEWING' });
  const sewingIds = new Set(sewingTickets.map((t) => String(t._id)));
  const output = sum(movements.filter((m) => m.warehouseType === 'FINISHED_GOODS' && m.transactionType === 'INBOUND_PUTAWAY' && m.referenceModel === 'FinishedGoodsTicket' && sewingIds.has(String(m.referenceId))), (m) => m.quantityChange);
  const target = targets[0]?.revenue ?? null;
  const boms = await read('boms', { _id: { $in: production.flatMap((p) => (p.items || []).map((i) => i.bomId)).filter(Boolean) } });
  const outboundMaterial = await read('material_tickets', { createdAt: range, ticketType: { $in: ['OUTBOUND_FOR_CUTTING', 'OUTBOUND_SUPPLEMENTARY'] } });
  const outboundSales = await read('sales_orders', { expectedDeliveryAt: range }, { orderCode: 1, status: 1, expectedDeliveryAt: 1, items: 1 });
  const outboundPlans = [...outboundMaterial.map((r) => ({ id: String(r._id), code: r.ticketCode, type: 'RAW_MATERIAL', date: r.createdAt, status: r.status, quantity: sum(r.items || [], (i) => i.expectedQty) })), ...outboundSales.map((r) => ({ id: String(r._id), code: r.orderCode, type: 'FINISHED_GOODS', date: r.expectedDeliveryAt, status: r.status, quantity: sum(r.items || [], (i) => i.orderedQty) }))];
  return { sales, previous, returnStatuses: sales.returnStatuses, change: percent(sales.revenue, previous.revenue), target, targetPercent: target > 0 ? sales.revenue / target * 100 : null,
    purchases, debts, inventory, production: productionRows(production, materials, boms), outboundPlans, sessions, movements, employees: employees.map((r) => ({ id: String(r._id), name: r.fullName })), tasks, output,
    generatedAt: new Date(), basis: 'Doanh thu theo ngày đóng gói, trừ hàng trả đã duyệt trong kỳ. Tồn kho và công nợ là số hiện tại; số nhập và sản lượng theo sổ kho trong kỳ. Chỉ tiêu là doanh thu cả năm, không tự phân bổ theo kỳ.' };
}
