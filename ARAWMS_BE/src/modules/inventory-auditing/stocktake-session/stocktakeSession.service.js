import mongoose from 'mongoose';
import CounterSequence from '../../../models/CounterSequence.model.js';
import StocktakeSchedule from '../../../models/StocktakeSchedule.model.js';
import StocktakeSession from '../../../models/StocktakeSession.model.js';
import WarehouseLocation from '../../../models/WarehouseLocation.model.js';
import WarehouseLayout from '../../../models/WarehouseLayout.model.js';
import RawMaterial from '../../../models/RawMaterial.model.js';
import Sku from '../../../models/Sku.model.js';
import User from '../../../models/User.model.js';

const fail = (ok, message, code = 'INVALID_INPUT', status = 400) => { if (!ok) throw Object.assign(new Error(message), { code, status }); };
const id = (value) => String(value || '');
const managers = (user) => [user?.roleCode, ...(user?.roles || [])].some((role) => ['OWNER', 'WAREHOUSE_MANAGER'].includes(role));
const asDate = (value) => { const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date; };
const todayInBangkok = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
function validate(input, { allowUnchangedPastStart = false } = {}) {
  fail(String(input.name || '').trim().length >= 2, 'Nhập tên lệnh kiểm kê');
  fail(['RAW_MATERIAL', 'FINISHED_GOODS'].includes(input.warehouseType) ||
    (input.scopeType === 'WAREHOUSE' && input.warehouseType === 'ALL'), 'Chọn nhóm hàng');
  fail(['WAREHOUSE', 'ZONE', 'RACK', 'ITEM'].includes(input.scopeType), 'Chọn phạm vi kiểm');
  fail(input.scopeType !== 'ZONE' || String(input.zoneCode || '').trim(), 'Chọn khu cần kiểm kê');
  fail(input.scopeType !== 'RACK' || mongoose.isValidObjectId(input.rackId), 'Chọn kệ cần kiểm kê');
  fail(input.scopeType !== 'ITEM' || mongoose.isValidObjectId(input.itemId), 'Chọn mặt hàng cần kiểm kê');
  fail(['ONCE', 'WEEKLY', 'MONTHLY', 'QUARTERLY'].includes(input.recurrence), 'Chọn thời gian kiểm');
  fail(input.recurrence !== 'WEEKLY' || Number.isInteger(Number(input.weekday)) && input.weekday >= 0 && input.weekday <= 6, 'Chọn thứ trong tuần');
  fail(input.recurrence !== 'MONTHLY' || input.monthEnd === true || Number(input.monthDay) >= 1 && Number(input.monthDay) <= 31, 'Chọn ngày trong tháng');
  fail(input.recurrence !== 'QUARTERLY' || [1, 2, 3].includes(Number(input.quarterMonth)), 'Chọn tháng trong quý');
  const startDate = asDate(input.startDate);
  fail(startDate && /^([01]\d|2[0-3]):[0-5]\d$/.test(input.startTime || ''), 'Chọn ngày bắt đầu và giờ');
  const startDateValue = String(input.startDate || '').slice(0, 10);
  fail(allowUnchangedPastStart || startDateValue >= todayInBangkok(), 'Ngày bắt đầu không được ở trong quá khứ');
  const endDate = input.endDate ? asDate(input.endDate) : undefined;
  fail(!input.endDate || endDate && endDate >= startDate, 'Ngày kết thúc phải sau ngày bắt đầu');
  const durationHours = Number(input.durationHours || 2);
  fail(Number.isFinite(durationHours) && durationHours >= 1 && durationHours <= 72, 'Hạn hoàn thành từ 1 đến 72 giờ');
  fail(mongoose.isValidObjectId(input.inspectorId) && mongoose.isValidObjectId(input.approverId), 'Chọn người kiểm và người duyệt');
  fail(String(input.inspectorId) !== String(input.approverId), 'Người kiểm không được tự duyệt báo cáo');
  const config = { ...input };
  delete config.selectionMode;
  return { ...config, name: String(input.name).trim(), startDate, endDate, durationHours,
    itemType: input.warehouseType === 'RAW_MATERIAL' ? 'RAW_MATERIAL' : input.warehouseType === 'FINISHED_GOODS' ? 'SKU' : 'MIXED',
    zoneCode: String(input.zoneCode || '').trim().toUpperCase(), instructions: String(input.instructions || '').trim().slice(0, 1000) };
}
async function resolveScope(input) {
  const query = { warehouseType: input.warehouseType === 'ALL'
    ? { $in: ['RAW_MATERIAL', 'FINISHED_GOODS'] } : input.warehouseType, isDeleted: { $ne: true } };
  if (input.scopeType === 'ZONE') query.zoneCode = input.zoneCode;
  if (input.scopeType === 'RACK') query.rackCode = input.rackCode;
  if (input.scopeType === 'ITEM') {
    fail(mongoose.isValidObjectId(input.itemId), 'Chọn mặt hàng');
    const exists = input.warehouseType === 'RAW_MATERIAL'
      ? await RawMaterial.exists({ _id: input.itemId, isActive: true, isDeleted: { $ne: true } })
      : await Sku.exists({ _id: input.itemId, isActive: true, isDeleted: { $ne: true } });
    fail(exists, 'Mặt hàng không hoạt động hoặc không tồn tại');
    return [];
  }
  if (input.scopeType === 'RACK') fail(mongoose.isValidObjectId(input.rackId), 'Chọn kệ');
  if (input.scopeType === 'RACK') {
    const layout = await WarehouseLayout.findOne({ warehouseType: 'FINISHED_GOODS' }).lean();
    const rack = layout?.active?.racks?.find((entry) => id(entry.id) === id(input.rackId));
    fail(rack && rack.status === 'ACTIVE', 'Kệ không hoạt động');
    fail(String(input.zoneCode || '').toUpperCase() === rack.zoneCode, 'Kệ không thuộc khu đã chọn; hãy tải lại cấu hình kho');
    query.zoneCode = rack.zoneCode; query.rackCode = rack.code;
  }
  const locations = await WarehouseLocation.find(query).select('_id zoneCode rackCode status layoutBin isSystemUnplaced').lean();
  fail(locations.length > 0, 'Phạm vi không có vị trí trong kho');
  return locations.map((location) => location._id);
}
async function peopleByRoles(roleCodes) {
  return User.find({ status: 'ACTIVE', isDeleted: { $ne: true }, roleCode: { $in: roleCodes } })
    .select('fullName employeeCode roleCode').sort({ fullName: 1 }).lean();
}
export async function stocktakeOptions() {
  const [locations, inspectors, approvers, materials, skus, layout] = await Promise.all([
    WarehouseLocation.find({ warehouseType: { $in: ['RAW_MATERIAL', 'FINISHED_GOODS'] }, isDeleted: { $ne: true }, isSystemUnplaced: { $ne: true }, status: { $in: ['ACTIVE', 'FULL', 'MAINTENANCE', 'LOCKED'] } }).select('warehouseType zoneCode rackCode locationCode layoutBin status').sort({ warehouseType: 1, zoneCode: 1, rackCode: 1 }).lean(),
    peopleByRoles(['GARMENT_TECHNICIAN']), peopleByRoles(['WAREHOUSE_MANAGER', 'OWNER']),
    RawMaterial.find({ isActive: true, isDeleted: { $ne: true } }).select('materialCode materialName unit color').sort({ materialCode: 1 }).lean(),
    Sku.find({ isActive: true, isDeleted: { $ne: true } }).select('skuCode productName color size').sort({ skuCode: 1 }).lean(),
    WarehouseLayout.find({ warehouseType: 'FINISHED_GOODS' }).select('active.racks active.bins active.zones').lean(),
  ]);
  // Warehouse choices come from active physical locations; rack choices must also exist in the currently published layout.
  const locationById = new Map(locations.map((location) => [id(location._id), location]));
  const rackLocationKeys = new Set((layout || []).flatMap((item) => (item.active?.bins || []).flatMap((bin) => {
    const location = locationById.get(id(bin.id));
    return location ? [`${id(bin.rackId)}:${location.warehouseType}`] : [];
  })));
  const racks = (layout || []).flatMap((item) => item.active?.racks || [])
    .filter((rack) => rack.status === 'ACTIVE')
    .map((rack) => ({ ...rack, warehouseType: ['RAW_MATERIAL', 'FINISHED_GOODS'].find((type) => rackLocationKeys.has(`${id(rack.id)}:${type}`)) }))
    .filter((rack) => rack.warehouseType);
  const warehouseNames = { RAW_MATERIAL: 'Kho nguyên phụ liệu', FINISHED_GOODS: 'Kho thành phẩm' };
  const warehouses = [...new Set(locations.map((location) => location.warehouseType))]
    .map((code) => ({ code, name: warehouseNames[code] || code }));
  return { warehouses, locations, inspectors, approvers, materials, skus, racks };
}
async function validateAssignees(config) {
  const people = await User.find({ _id: { $in: [config.inspectorId, config.approverId] },
    status: 'ACTIVE', isDeleted: { $ne: true } }).select('_id roleCode').lean();
  const inspector = people.find((person) => id(person._id) === id(config.inspectorId));
  const approver = people.find((person) => id(person._id) === id(config.approverId));
  fail(inspector?.roleCode === 'GARMENT_TECHNICIAN', 'Người kiểm kê phải là nhân viên kỹ thuật xưởng đang hoạt động');
  fail(['WAREHOUSE_MANAGER', 'OWNER'].includes(approver?.roleCode), 'Người duyệt phải là quản lý kho hoặc Owner đang hoạt động');
  return config;
}
export async function listStocktake(query = {}) {
  const [sessions, schedules] = await Promise.all([
    StocktakeSession.find(query.tab === 'reports' ? { status: { $nin: ['WAITING', 'FROZEN_COUNTING'] } } : {}).sort({ scheduledAt: -1, createdAt: -1 }).limit(300).populate('inspectorId', 'fullName employeeCode').lean(),
    StocktakeSchedule.find({}).sort({ createdAt: -1 }).populate('inspectorId approverId', 'fullName employeeCode').lean(),
  ]);
  return { sessions, schedules };
}
async function addSession(config, scheduleId = null, occurrenceKey = null) {
  const scopeLocationIds = await resolveScope(config);
  const scheduledAt = new Date(`${new Date(config.startDate).toISOString().slice(0, 10)}T${config.startTime}:00+07:00`);
  const sessionCode = await CounterSequence.getNextSequence('STOCKTAKE_SESSION', 'KK', 6);
  return StocktakeSession.create({ sessionCode, name: config.name, scheduleId, occurrenceKey,
    warehouseType: config.warehouseType, scopeType: config.scopeType, zoneCode: config.zoneCode,
    rackId: config.rackId, itemType: config.itemType, itemId: config.itemId,
    scopeLocationIds, createdByManagerId: config.createdByUserId, inspectorId: config.inspectorId,
    approverId: config.approverId, instructions: config.instructions, scheduledAt,
    dueAt: new Date(scheduledAt.getTime() + config.durationHours * 3600000),
    status: 'WAITING', totalItemsExpected: 0 });
}
export async function createStocktake(input, user) {
  fail(managers(user), 'Chỉ quản lý kho được tạo lệnh', 'FORBIDDEN', 403);
  const config = await validateAssignees(validate(input));
  config.createdByUserId = user._id;
  if (config.recurrence === 'ONCE') return { session: await addSession(config) };
  const schedule = await StocktakeSchedule.create({ ...config, createdByUserId: user._id, status: 'ACTIVE' });
  return { schedule };
}
export async function setStocktakeSchedule(idValue, input, user) {
  fail(managers(user), 'Chỉ quản lý kho được sửa lịch', 'FORBIDDEN', 403);
  const existing = await StocktakeSchedule.findById(idValue);
  fail(existing, 'Không tìm thấy lịch kiểm kê', 'SCHEDULE_NOT_FOUND', 404);
  fail(Number(input.version) === existing.version, 'Lịch đã thay đổi, hãy tải lại', 'VERSION_CONFLICT', 409);
  const merged = { ...existing.toObject(), ...input };
  const existingStartDate = existing.startDate?.toISOString().slice(0, 10);
  const update = { ...await validateAssignees(validate(merged, {
    allowUnchangedPastStart: !input.startDate || String(input.startDate).slice(0, 10) === existingStartDate,
  })), version: existing.version + 1 };
  const result = await StocktakeSchedule.findOneAndUpdate({ _id: idValue, version: existing.version }, { $set: update }, { new: true, runValidators: true });
  fail(result, 'Lịch đã thay đổi, hãy tải lại', 'VERSION_CONFLICT', 409); return result;
}
export async function pauseStocktakeSchedule(idValue, input, user) {
  fail(managers(user), 'Chỉ quản lý kho được đổi trạng thái lịch', 'FORBIDDEN', 403);
  fail(['ACTIVE', 'PAUSED', 'CANCELLED'].includes(input.status), 'Trạng thái lịch không hợp lệ');
  const result = await StocktakeSchedule.findOneAndUpdate({ _id: idValue, version: Number(input.version) },
    { $set: { status: input.status }, $inc: { version: 1 } }, { new: true });
  fail(result, 'Lịch đã thay đổi, hãy tải lại', 'VERSION_CONFLICT', 409); return result;
}
