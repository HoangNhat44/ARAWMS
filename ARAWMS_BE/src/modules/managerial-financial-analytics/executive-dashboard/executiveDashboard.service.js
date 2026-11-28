/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157 | Ngày: 30-10-2026 | UC-12; [BR: GBR-08/16/19/20]
 * ====================================================================================================================================
 * [BẢNG TRA CỨU NGUỒN GỐC SỐ LIỆU & CÔNG THỨC - BE: EXECUTIVE DASHBOARD OWNER (getDashboard)]
 * ====================================================================================================================================
 * | STT | Nhóm / Trường trả về         | Nguồn DB (Collection.field)              | Nghiệp vụ / Công thức / BR                                        |
 * |-----|------------------------------|------------------------------------------|-------------------------------------------------------------------|
 * | 1   | financial.*                  | financialReports.service.js              | Doanh thu, giá vốn FIFO [GBR-20], lợi nhuận, dòng tiền theo kỳ    |
 * | 2   | inventory.materialValue      | raw_materials.{onHandQty, unitCost}      | Σ (onHandQty * unitCost) với isDeleted !== true                   |
 * | 3   | inventory.finishedGoodsValue | skus.{onHandQty, unitCogs}               | Σ (onHandQty * unitCogs)                                          |
 * | 4   | inventory.quarantineValue    | product_units[DEFECT_QUARANTINE] × cogs  | [BR: GBR-16] Tách riêng giá trị hàng lỗi cách ly                  |
 * | 5   | inventory.lowStock*          | raw_materials & skus (isActive=true)     | [BR: GBR-08] Đếm mã có (onHandQty - reservedQty) < safetyThreshold|
 * | 6   | operations.* (4 chỉ số)      | users, manager_reports, prod_orders, SO  | NV active; BC SUBMITTED; Lệnh SX chạy; COD RED_FLAG [BR: GBR-19]  |
 * ====================================================================================================================================
 */
import RawMaterial from '../../../models/RawMaterial.model.js';
import Sku from '../../../models/Sku.model.js';
import { withDefectQty } from '../../../common/services/defectStock.js';
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
    // [BR: GBR-08]: Nguyên liệu thiếu khi tồn khả dụng (onHandQty - reservedQty) nhỏ hơn ngưỡng safetyStockThreshold; hàng giữ chỗ không còn khả dụng.
    RawMaterial.aggregate([{ $match: active }, { $group: { _id: null, value: { $sum: { $multiply: ['$onHandQty', '$unitCost'] } },
      lowStock: { $sum: { $cond: [{ $and: [{ $eq: ['$isActive', true] }, { $lt: [{ $subtract: ['$onHandQty', '$reservedQty'] }, '$safetyStockThreshold'] }] }, 1, 0] } } } }]),
    // [BR: GBR-08]/[BR: GBR-16]: Thành phẩm bán được và hàng lỗi cách ly (ProductUnit) được thống kê tách riêng.
    Sku.aggregate([{ $match: active }, ...withDefectQty(), { $group: { _id: null, value: { $sum: { $multiply: ['$onHandQty', '$unitCogs'] } },
      quarantineValue: { $sum: { $multiply: ['$defectQty', '$unitCogs'] } },
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
