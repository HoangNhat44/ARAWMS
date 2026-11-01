/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Chức năng: OWNER-EXT-02..05; GBR-05/06/11/12/19 - Lưu cấu hình và ngưỡng từng mặt hàng.
 */
import { randomUUID } from 'node:crypto';
import SystemSetting from '../../../models/SystemSetting.model.js';
import RawMaterial from '../../../models/RawMaterial.model.js';
import Sku from '../../../models/Sku.model.js';
import InventoryAlert from '../../../models/InventoryAlert.model.js';
import { ENV } from '../../../config/env.js';
import { ownerTransaction, ownerAudit } from '../../../common/utils/ownerOperation.js';
import { objectId } from '../../../common/utils/ownerValidation.js';
import { readQuery } from '../../../common/utils/ownerReadQuery.js';
import { httpError } from '../../../common/utils/httpError.js';
import { validateSettings, validateInventoryThreshold, secretFields } from './systemSettings.validation.js';
import { encryptSecret, decryptSecret } from './integrationSecrets.js';

const active = { isDeleted: { $ne: true } };
const selection = secretFields.map((field) => `+integrations.${field}`).join(' ');
// Chỉ trả dấu hiệu đã cấu hình; không đưa khóa API vào phản hồi hoặc nhật ký trước/sau.
export const publicSettings = (doc) => ({ revision: doc.revision || 0,
  defaultFabricLeftoverThresholdMeters: doc.defaultFabricLeftoverThresholdMeters,
  defaultFifoAgingAlertDays: doc.defaultFifoAgingAlertDays,
  minorStocktakeVarianceLimitQty: doc.minorStocktakeVarianceLimitQty,
  minorStocktakeVarianceLimitValue: doc.minorStocktakeVarianceLimitValue,
  returnSurchargePercent: doc.returnSurchargePercent, returnPolicyNotes: doc.returnPolicyNotes || '', updatedAt: doc.updatedAt,
  integrations: { facebookPageId: doc.integrations?.facebookPageId || '',
    ghnEnabled: doc.integrations?.ghnEnabled !== false, ghnShopId: doc.integrations?.ghnShopId || ENV.GHN.SHOP_ID,
    ghnTokenConfigured: Boolean(doc.integrations?.ghnToken || ENV.GHN.TOKEN),
    facebookVerifyTokenConfigured: Boolean(doc.integrations?.facebookVerifyToken),
    facebookPageAccessTokenConfigured: Boolean(doc.integrations?.facebookPageAccessToken) } });

export const readSettings = async () => publicSettings(await SystemSetting.findOne({ settingKey: 'GLOBAL_CONFIG', ...active }).select(selection) || new SystemSetting());

export const updateSettings = async (req) => {
  const { expectedVersion, data } = validateSettings(req.params.section, req.body);
  return ownerTransaction(async (session) => {
    // Đọc lại trong giao dịch, không tin bản cấu hình FE đã mở từ trước.
    let doc = await SystemSetting.findOne({ settingKey: 'GLOBAL_CONFIG' }).select(selection).session(session);
    if (doc?.isDeleted) throw httpError(409, 'Cấu hình đã bị vô hiệu hóa.');
    doc ||= new SystemSetting();
    if ((doc.revision || 0) !== expectedVersion) throw httpError(409, 'Cấu hình đã thay đổi. Vui lòng tải lại.');
    const before = publicSettings(doc);
    for (const [field, value] of Object.entries(data)) {
      // OWNER-EXT-02: Mã hóa khóa ở BE; không ghi khóa rõ hoặc khóa mã hóa vào audit log.
      if (req.params.section === 'api') doc.set(`integrations.${field}`, secretFields.includes(field)
        ? value === null ? undefined : encryptSecret(value) : value);
      else doc.set(field, value);
    }
    doc.revision = expectedVersion + 1; doc.updatedBy = req.user._id;
    await doc.save({ session });
    const after = publicSettings(doc);
    await ownerAudit(req, session, 'System Administration', 'System Settings', `CONFIGURE_${req.params.section.toUpperCase()}`,
      { collection: 'system_settings', id: doc._id, code: doc.settingKey }, before, { ...after, changedFields: Object.keys(data) });
    return after;
  });
};

// OWNER-EXT-02: GHN đọc cấu hình mới ở mỗi yêu cầu, không cần restart để dùng khóa vừa lưu.
export const runtimeGhnConfig = async () => {
  const doc = await SystemSetting.findOne({ settingKey: 'GLOBAL_CONFIG', ...active }).select('+integrations.ghnToken');
  if (doc?.integrations?.ghnEnabled === false) throw httpError(503, 'Tích hợp GHN đang được Owner tắt.');
  return { ...ENV.GHN, TOKEN: decryptSecret(doc?.integrations?.ghnToken) || ENV.GHN.TOKEN,
    SHOP_ID: doc?.integrations?.ghnShopId || ENV.GHN.SHOP_ID };
};

const inventoryModel = (type) => {
  if (type === 'materials') return RawMaterial;
  if (type === 'skus') return Sku;
  throw httpError(400, 'Loại mặt hàng phải là materials hoặc skus.');
};
const inventoryProfile = (item) => ({ id: String(item._id), code: item.materialCode || item.skuCode, name: item.materialName || item.styleName,
  unit: item.unit || 'PIECE', availableQty: item.onHandQty - item.reservedQty, safetyStockThreshold: item.safetyStockThreshold,
  fifoAgingThresholdDays: item.fifoAgingThresholdDays, version: item.version || 0 });

export const listInventoryThresholds = async (req) => {
  const Model = inventoryModel(req.params.type);
  const { filter, page, limit } = readQuery(req.query, { fields: req.params.type === 'materials' ? ['materialCode', 'materialName'] : ['skuCode', 'styleName'] });
  filter.isActive = true;
  const [items, total] = await Promise.all([Model.find(filter).sort({ _id: 1 }).skip((page - 1) * limit).limit(limit), Model.countDocuments(filter)]);
  return { items: items.map(inventoryProfile), total, page, limit };
};

// GBR-05: So sánh tồn khả dụng với ngưỡng, dùng lại được sau các giao dịch xuất kho của module nghiệp vụ.
export const refreshSafetyAlert = async (item, type, req, session) => {
  const referenceModel = type === 'materials' ? 'RawMaterial' : 'Sku';
  const filter = { referenceModel, referenceId: item._id, alertType: 'LOW_SAFETY_STOCK', isResolved: false, ...active };
  if (item.onHandQty - item.reservedQty < item.safetyStockThreshold) {
    // Tạo/cập nhật cảnh báo đang mở, tránh thêm cảnh báo mới sau mỗi lần sửa cùng mặt hàng.
    await InventoryAlert.updateOne(filter, { $set: {
      title: `Tồn kho thấp ${item.materialCode || item.skuCode}`, message: 'Tồn khả dụng dưới ngưỡng an toàn.',
      metadata: { currentQty: item.onHandQty - item.reservedQty, thresholdQty: item.safetyStockThreshold },
    }, $setOnInsert: { alertCode: `LOW-${randomUUID()}`, targetRole: 'WAREHOUSE_MANAGER', severity: 'WARNING',
      warehouseType: type === 'materials' ? 'RAW_MATERIAL' : 'FINISHED_GOODS' } }, { upsert: true, session, runValidators: true });
  } else {
    // Đủ tồn trở lại thì đánh dấu cảnh báo đã xử lý; giữ lịch sử để có thể truy vết.
    await InventoryAlert.updateMany(filter, { $set: { isResolved: true, resolvedAt: new Date(), resolvedByUserId: req.user._id } }, { session });
  }
};
export const updateInventoryThreshold = async (req) => {
  const Model = inventoryModel(req.params.type); objectId(req.params.id);
  const input = validateInventoryThreshold(req.body);
  return ownerTransaction(async (session) => {
    const item = await Model.findOne({ _id: req.params.id, isActive: true, ...active }).session(session);
    if (!item) throw httpError(404, 'Không tìm thấy mặt hàng đang hoạt động.');
    if ((item.version || 0) !== input.expectedVersion) throw httpError(409, 'Mặt hàng đã thay đổi. Vui lòng tải lại.');
    const before = inventoryProfile(item);
    item.safetyStockThreshold = input.safetyStockThreshold; item.fifoAgingThresholdDays = input.fifoAgingThresholdDays;
    await item.save({ session });
    // OWNER-EXT-04, GBR-05: Sau khi đổi ngưỡng, cập nhật ngay tình trạng cảnh báo của mặt hàng.
    await refreshSafetyAlert(item, req.params.type, req, session);
    const after = inventoryProfile(item);
    await ownerAudit(req, session, 'System Administration', 'System Settings', 'CONFIGURE_INVENTORY_THRESHOLD',
      { collection: Model.collection.name, id: item._id, code: before.code }, before, after);
    return after;
  });
};
