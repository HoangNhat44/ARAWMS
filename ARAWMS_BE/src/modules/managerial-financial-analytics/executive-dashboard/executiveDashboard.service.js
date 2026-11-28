/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Report 3 — UC-009. Tổng quan tài chính theo kỳ và trạng thái vận hành hiện tại.
 */
import RawMaterial from '../../../models/RawMaterial.model.js';
import Sku from '../../../models/Sku.model.js';
import User from '../../../models/User.model.js';
import SalesOrder from '../../../models/SalesOrder.model.js';
import ManagerReport from '../../../models/ManagerReport.model.js';
import ProductionOrder from '../../../models/ProductionOrder.model.js';
import { financialReport } from '../financial-reports/financialReports.service.js';
import { dashboardRange } from './executiveDashboard.validation.js';
const active = { isDeleted: { $ne: true } };
/** Ghép báo cáo tài chính với số tồn kho, nhân viên đang hoạt động, báo cáo chưa xem, sản xuất đang chạy và số đơn có cờ đỏ COD. */
export const getDashboard = async (query) => {
  // UC-12: Từ chối khoảng ngày sai trước khi khởi chạy bất kỳ truy vấn DB nào.
  dashboardRange(query);
  // UC-12: Đọc độc lập số tài chính theo kỳ và số vận hành tại thời điểm hiện tại.
  const [financial, materials, skus, employees, unreadReports, production, codRedFlags] = await Promise.all([
    financialReport(query),
    // Đếm nguyên liệu hoạt động có tồn khả dụng dưới ngưỡng an toàn.
    RawMaterial.aggregate([{ $match: active }, { $group: { _id: null, value: { $sum: { $multiply: ['$onHandQty', '$unitCost'] } },
      lowStock: { $sum: { $cond: [{ $and: [{ $eq: ['$isActive', true] }, { $lt: [{ $subtract: ['$onHandQty', '$reservedQty'] }, '$safetyStockThreshold'] }] }, 1, 0] } } } }]),
    // [BR: GBR-16] Thống kê hàng cách ly riêng. lowStock đếm SKU có tồn khả dụng dưới ngưỡng theo GBR-08.
    Sku.aggregate([{ $match: active }, { $group: { _id: null, value: { $sum: { $multiply: ['$onHandQty', '$unitCogs'] } },
      quarantineValue: { $sum: { $multiply: ['$defectQuarantineQty', '$unitCogs'] } },
      lowStock: { $sum: { $cond: [{ $and: [{ $eq: ['$isActive', true] }, { $lt: [{ $subtract: ['$onHandQty', '$reservedQty'] }, '$safetyStockThreshold'] }] }, 1, 0] } } } }]),
    // Đếm nhân viên, báo cáo mới gửi, lệnh sản xuất đang chạy và đơn có cờ đỏ COD.
    User.countDocuments({ ...active, roleCode: { $ne: 'OWNER' }, status: 'ACTIVE' }),
    ManagerReport.countDocuments({ ...active, status: 'SUBMITTED' }),
    ProductionOrder.countDocuments({ ...active, status: { $in: ['RELEASED', 'IN_PROGRESS', 'MATERIAL_SHORTAGE'] } }),
    SalesOrder.countDocuments({ ...active, codReconciliationStatus: 'RED_FLAG_DISCREPANCY' }),
  ]);
  // Ghép số liệu về cùng màn hình, không biến tồn kho hiện tại thành tồn kho tại ngày quá khứ.
  return { ...financial, inventory: { materialValue: materials[0]?.value || 0, finishedGoodsValue: skus[0]?.value || 0,
    quarantineValue: skus[0]?.quarantineValue || 0, lowStockMaterials: materials[0]?.lowStock || 0, lowStockSkus: skus[0]?.lowStock || 0 },
    operations: { activeEmployees: employees, unreadManagerReports: unreadReports, activeProductionOrders: production, codRedFlags } };
};
