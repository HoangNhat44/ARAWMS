/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Chức năng: OWNER-EXT-06; GBR-18/19 - Đọc báo cáo và phê duyệt chênh lệch kiểm kê lớn.
 */
import { createHash } from 'node:crypto';
import StocktakeSession from '../../../models/StocktakeSession.model.js';
import StocktakeRecord from '../../../models/StocktakeRecord.model.js';
import InventoryTransaction from '../../../models/InventoryTransaction.model.js';
import RawMaterial from '../../../models/RawMaterial.model.js';
import Sku from '../../../models/Sku.model.js';
import FabricRoll from '../../../models/FabricRoll.model.js';
import SystemSetting from '../../../models/SystemSetting.model.js';
import { readQuery } from '../../../common/utils/ownerReadQuery.js';
import { objectId } from '../../../common/utils/ownerValidation.js';
import { ownerTransaction, ownerAudit } from '../../../common/utils/ownerOperation.js';
import { httpError } from '../../../common/utils/httpError.js';
import { validateApproval, varianceSummary, assertApprovalAllowed } from './stockAdjustment.validation.js';
const active = { isDeleted: { $ne: true } };

export const listStocktakes = async (query) => {
  const { filter, page, limit } = readQuery(query, { fields: ['sessionCode'],
    statuses: ['VARIANCE_REVIEW', 'APPROVED_PENDING_ADJUSTMENT', 'APPROVED_COMPLETED'] });
  filter.status ||= 'VARIANCE_REVIEW';
  const [items, total] = await Promise.all([StocktakeSession.find(filter).sort({ createdAt: -1, _id: -1 })
    .skip((page - 1) * limit).limit(limit), StocktakeSession.countDocuments(filter)]);
  return { items, total, page, limit };
};

const reportData = async (id, session = null) => {
  const stocktake = await StocktakeSession.findOne({ _id: id, ...active }).session(session);
  if (!stocktake) throw httpError(404, 'Không tìm thấy phiên kiểm kê.');
  const records = await StocktakeRecord.find({ sessionId: id, ...active }).sort({ _id: 1 }).session(session);
  // Đọc các đơn giá cùng lúc theo nhóm mặt hàng, tránh gọi DB riêng cho từng dòng báo cáo.
  const readers = [
    () => RawMaterial.find({ _id: { $in: records.map((r) => r.rawMaterialId).filter(Boolean) }, ...active }).session(session),
    () => Sku.find({ _id: { $in: records.map((r) => r.skuId).filter(Boolean) }, ...active }).session(session),
    () => FabricRoll.find({ _id: { $in: records.map((r) => r.fabricRollId).filter(Boolean) }, ...active }).session(session),
    () => SystemSetting.findOne({ settingKey: 'GLOBAL_CONFIG', ...active }).session(session),
  ];
  // MongoDB không hỗ trợ truy vấn song song trong cùng transaction; chỉ đọc thường mới chạy song song.
  const values = [];
  if (session) { for (const read of readers) values.push(await read()); }
  else values.push(...await Promise.all(readers.map((read) => read())));
  const [materials, skus, rolls, settings] = values;
  const costs = (items, field) => new Map(items.map((item) => [String(item._id), item[field]]));
  const materialCosts = costs(materials, 'unitCost'); const skuCosts = costs(skus, 'unitCogs'); const rollCosts = costs(rolls, 'unitCostPerMeter');
  const rows = records.map((record) => {
    // Ưu tiên đơn giá chốt; dữ liệu kiểm kê cũ chưa chốt thì ghi rõ đang dùng giá danh mục hiện tại.
    const fallback = record.itemType === 'FABRIC_ROLL' ? rollCosts.get(String(record.fabricRollId))
      : record.itemType === 'SKU_BATCH' ? skuCosts.get(String(record.skuId)) : materialCosts.get(String(record.rawMaterialId));
    return { id: String(record._id), barcode: record.barcode, itemType: record.itemType,
      systemSnapshotQty: record.systemSnapshotQty, actualScannedQty: record.actualScannedQty,
      varianceQty: record.actualScannedQty - record.systemSnapshotQty, unitCost: record.unitCostSnapshot ?? fallback,
      costBasis: record.unitCostSnapshot === undefined ? 'CURRENT_MASTER_COST' : 'SNAPSHOT',
      scannedAt: record.scannedAt, isAgingThresholdExceeded: record.isAgingThresholdExceeded, agingDaysAtCount: record.agingDaysAtCount };
  });
  // Thiếu giá không được thay bằng 0 vì có thể làm chênh lệch lớn bị phân loại thành nhỏ.
  if (rows.some((row) => typeof row.unitCost !== 'number' || !Number.isFinite(row.unitCost))) throw httpError(409, 'Có dòng thiếu đơn giá. Cần bổ sung dữ liệu kiểm kê trước khi duyệt.');
  const config = settings || new SystemSetting();
  const summary = varianceSummary(rows, config, stocktake.approvalInfo?.agingStockActionPlan);
  const reportHash = createHash('sha256').update(JSON.stringify(rows)).digest('hex');
  return { stocktake, records: rows, summary, reportHash, thresholds: {
    quantity: config.minorStocktakeVarianceLimitQty, value: config.minorStocktakeVarianceLimitValue } };
};
export const stocktakeDetail = async (id) => { objectId(id); return reportData(id); };

export const approveStocktake = async (req) => {
  objectId(req.params.id); const input = validateApproval(req.body);
  return ownerTransaction(async (session) => {
    const report = await reportData(req.params.id, session);
    const { stocktake, records, summary, reportHash } = report;
    assertApprovalAllowed(stocktake, records, summary, input, reportHash);
    // Chặn dữ liệu bất thường đã ghi điều chỉnh nhưng vẫn ở trạng thái chưa duyệt, cần đối soát trước.
    if (await InventoryTransaction.exists({ referenceId: stocktake._id, transactionType: 'STOCKTAKE_ADJUSTMENT', ...active }).session(session)) throw httpError(409, 'Phiên đã có bút toán điều chỉnh. Cần đối soát trước khi duyệt.');
    const before = { status: stocktake.status, approvalInfo: stocktake.approvalInfo };
    // GBR-18: Duyệt không đồng nghĩa đã ghi sổ; chỉ Manager hoàn tất điều chỉnh mới được đóng phiên.
    stocktake.status = 'APPROVED_PENDING_ADJUSTMENT'; stocktake.approvalRevision = input.expectedVersion + 1;
    stocktake.approvalInfo = { approvalLevelRequired: 'MAJOR_OWNER', approvedByUserId: req.user._id, approvedAt: new Date(),
      adjustmentReason: input.adjustmentReason, agingStockActionPlan: input.agingStockActionPlan,
      approvedReportHash: reportHash };
    await stocktake.save({ session });
    await ownerAudit(req, session, 'Inventory Auditing', 'Stock Adjustment', 'APPROVE_MAJOR_INVENTORY_VARIANCE',
      { collection: 'stocktake_sessions', id: stocktake._id, code: stocktake.sessionCode }, before,
      { status: stocktake.status, approvalInfo: stocktake.approvalInfo, summary });
    return { stocktake, summary };
  });
};
