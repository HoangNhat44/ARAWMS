/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Chức năng: UC-19 - Xem tiến độ sản xuất, phiên bản BOM và đối chiếu vật tư.
 */
import ProductionOrder from '../../../models/ProductionOrder.model.js';
import Bom from '../../../models/Bom.model.js';
import { readQuery } from '../../../common/utils/ownerReadQuery.js';
import { objectId } from '../../../common/utils/ownerValidation.js';
import { httpError } from '../../../common/utils/httpError.js';
// UC-19: Cộng kế hoạch/thực hiện của từng SKU; chưa có kế hoạch thì chưa tính tỷ lệ hoàn thành.
export const progress = (items = []) => {
  const sum = (key) => items.reduce((total, row) => total + (Number(row[key]) || 0), 0);
  const plannedQty = sum('plannedQty'); const completedQty = sum('completedQty');
  return { plannedQty, completedQty, defectiveQty: sum('defectiveQty'), receivedQty: sum('receivedQty'),
    completionPercent: plannedQty > 0 ? completedQty / plannedQty * 100 : null };
};
// UC-19: Lọc lệnh sản xuất và trả tiến độ tóm tắt theo từng trang.
export const listProduction = async (query) => {
  const { filter, page, limit } = readQuery(query, { fields: ['code', 'items.skuCode'], statuses: ['DRAFT', 'PLANNED', 'MATERIAL_SHORTAGE', 'RELEASED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] });
  const [items, total] = await Promise.all([ProductionOrder.find(filter).select('code status plannedStart plannedEnd items').sort({ plannedStart: -1, _id: -1 })
    .skip((page - 1) * limit).limit(limit), ProductionOrder.countDocuments(filter)]);
  return { items: items.map((item) => ({ id: String(item._id), code: item.code, status: item.status,
    plannedStart: item.plannedStart, plannedEnd: item.plannedEnd, ...progress(item.items) })), total, page, limit };
};
// UC-19: Xem lệnh cụ thể, lấy đúng BOM đã liên kết thay vì tự thay bằng BOM mới nhất.
export const productionDetail = async (id) => {
  objectId(id); const order = await ProductionOrder.findOne({ _id: id, isDeleted: { $ne: true } });
  if (!order) throw httpError(404, 'Không tìm thấy lệnh sản xuất.');
  // Đọc các BOM một lần cho cả lệnh để tránh truy vấn lặp lại với từng SKU.
  const boms = await Bom.find({ _id: { $in: order.items.map((item) => item.bomId).filter(Boolean) }, isDeleted: { $ne: true } })
    .select('bomCode skuCode skuId versionNo status lines');
  // Ghép BOM theo ID; thiếu BOM được trả null để FE báo thiếu dữ liệu.
  const byId = new Map(boms.map((bom) => [String(bom._id), bom.toJSON()]));
  return { id: String(order._id), code: order.code, status: order.status, plannedStart: order.plannedStart, plannedEnd: order.plannedEnd,
    progress: progress(order.items), items: order.items.map((item) => ({ ...item.toObject(), bom: byId.get(String(item.bomId)) || null })),
    materialRequirements: order.materialRequirements || [], stages: order.stages || [] };
};
