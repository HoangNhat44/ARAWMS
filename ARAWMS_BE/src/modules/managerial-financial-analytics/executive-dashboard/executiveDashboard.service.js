/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Chức năng: UC-12; GBR-05/13/16/17 - Tổng quan tài chính và vận hành cho Owner.
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
export const getDashboard = async (query) => {
  // UC-12: Từ chối khoảng ngày sai trước khi khởi chạy bất kỳ truy vấn DB nào.
  dashboardRange(query);
  // UC-12: Đọc độc lập số tài chính theo kỳ và số vận hành tại thời điểm hiện tại.
  const [financial, materials, skus, employees, unreadReports, production, codRedFlags] = await Promise.all([
    financialReport(query),
    // GBR-05: Nguyên liệu thiếu khi tồn khả dụng nhỏ hơn ngưỡng; hàng giữ chỗ không còn khả dụng.
    RawMaterial.aggregate([{ $match: active }, { $group: { _id: null, value: { $sum: { $multiply: ['$onHandQty', '$unitCost'] } },
      lowStock: { $sum: { $cond: [{ $and: [{ $eq: ['$isActive', true] }, { $lt: [{ $subtract: ['$onHandQty', '$reservedQty'] }, '$safetyStockThreshold'] }] }, 1, 0] } } } }]),
    // GBR-05/13: Thành phẩm bán được và hàng cách ly được thống kê riêng.
    Sku.aggregate([{ $match: active }, { $group: { _id: null, value: { $sum: { $multiply: ['$onHandQty', '$unitCogs'] } },
      quarantineValue: { $sum: { $multiply: ['$defectQuarantineQty', '$unitCogs'] } },
      lowStock: { $sum: { $cond: [{ $and: [{ $eq: ['$isActive', true] }, { $lt: [{ $subtract: ['$onHandQty', '$reservedQty'] }, '$safetyStockThreshold'] }] }, 1, 0] } } } }]),
    // Đếm nhân viên, báo cáo chưa xem, sản xuất đang chạy và cảnh báo COD hiện hành.
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
