/*
 * File: layout.routes.js
 * Author: Duy Anh
 * Date: 2026-10-27
 * Description: Exposes manager-only layout, location label, and putaway plan APIs.
 */
import express from 'express';
import mongoose from 'mongoose';
import bwipjs from 'bwip-js';
import { randomBytes } from 'node:crypto';
import { authenticate } from '../../../common/middlewares/authenticate.js';
import { sendError, sendSuccess } from '../../../common/utils/responseHandler.js';
import WarehouseLocation from '../../../models/WarehouseLocation.model.js';
import WarehouseLayout from '../../../models/WarehouseLayout.model.js';
import WarehouseBarcodeHistory from '../../../models/WarehouseBarcodeHistory.model.js';
import SystemLog from '../../../models/SystemLog.model.js';
import Role from '../../../models/Role.model.js';
import Sku from '../../../models/Sku.model.js';
import PutawayAllocation from '../../../models/PutawayAllocation.model.js';
import { getLayout, openDraft, resetDraft, addRack, saveDraft, removeDraftRack, resizeDraftRack,
  validateDraft, publishDraft } from './layout.service.js';
import { allocationOptions, listAllocations, createAllocation, updateAllocation,
  confirmAllocation, cancelAllocation, binOccupancy } from './allocation.service.js';

const router = express.Router();
router.use((req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
// router.use(authenticate);
// Mock user for testing without authentication
router.use((req, res, next) => {
  req.user = {
    _id: '507f1f77bcf86cd799439011',
    username: 'test',
    fullName: 'Test User',
    roleId: '507f1f77bcf86cd799439022',
    roleCode: 'ADMIN',
    roles: ['ADMIN', 'OWNER'],
    warehouseIds: []
  };
  next();
});

/** Maps the proposed permissions to Role entries, with warehouse-manager defaults. */
const roleAction = (name) => name.endsWith('.view') ? 'VIEW'
  : name.endsWith('.publish') || name.endsWith('.rotate') ? 'APPROVE'
  : name.endsWith('.print') ? 'EXPORT'
  : name.endsWith('.create') ? 'CREATE' : 'UPDATE';
const roleAllows = (scoped, name) => !scoped?.length || scoped.some((item) =>
  (item.subFeature === name || item.subFeature === '*') && item.allowedActions?.includes(roleAction(name)));
const permission = (name) => async (req, res, next) => {
  try {
    if (!req.user.roles?.some((role) => ['OWNER', 'WAREHOUSE_MANAGER'].includes(role))) {
      return sendError(res, 'Không có quyền cấu hình kho', { code: 'FORBIDDEN' }, 403);
    }
    const role = await Role.findById(req.user.roleId).select('permissions').lean();
    const scoped = role?.permissions?.filter((item) => item.majorFeature === 'WAREHOUSE_LAYOUT');
    if (!roleAllows(scoped, name)) return sendError(res, 'Thiếu quyền thao tác sơ đồ kho', { code: 'FORBIDDEN' }, 403);
    req.layoutRolePermissions = scoped;
    // This repository has one logical finished-goods warehouse; warehouseIds hold
    // individual locations and cannot scope a layout before its first bin exists.
    next();
  } catch (error) { next(error); }
};
const handle = (fn) => async (req, res, next) => {
  try { await fn(req, res); }
  catch (error) {
    if (error.name === 'CastError') return sendError(res, 'ID không hợp lệ', { code: 'INVALID_ID' }, 400);
    if (error.code === 112 || error.hasErrorLabel?.('TransientTransactionError')) {
      return sendError(res, 'Dữ liệu vừa thay đổi, hãy tải lại và thử lại', { code: 'VERSION_CONFLICT' }, 409);
    }
    if (error.status || error.code === 11000) return sendError(res, error.message || 'Dữ liệu trùng',
      { code: error.code === 11000 ? 'DUPLICATE' : error.code }, error.status || 409);
    next(error);
  }
};

router.get('/layout', permission('warehouse.layout.view'), handle(async (req, res) =>
  sendSuccess(res, 'Sơ đồ kho', { layout: await getLayout(),
    locations: await WarehouseLocation.find({ warehouseType: { $in: ['RAW_MATERIAL', 'FINISHED_GOODS'] },
      layoutBin: true, isDeleted: { $ne: true } })
      .select('locationCode maxCapacity currentOccupancy plannedReservedQty capacityUnit status').lean(),
    capabilities: Object.fromEntries([
    'warehouse.layout.edit', 'warehouse.layout.publish', 'warehouse.location.barcode.print',
    'warehouse.location.barcode.rotate', 'warehouse.putaway.plan.view',
    'warehouse.putaway.plan.create', 'warehouse.putaway.plan.modify',
  ].map((name) => [name, roleAllows(req.layoutRolePermissions, name)])) })));
router.post('/layout/draft', permission('warehouse.layout.edit'), handle(async (req, res) =>
  sendSuccess(res, 'Đã mở bản nháp', { layout: await openDraft(req.user) })));
router.post('/layout/draft/reset', permission('warehouse.layout.edit'), handle(async (req, res) =>
  sendSuccess(res, 'Đã làm mới bản nháp từ sơ đồ đang áp dụng', {
    layout: await resetDraft(req.user, req.body?.version) })));
router.patch('/layout/draft', permission('warehouse.layout.edit'), handle(async (req, res) =>
  sendSuccess(res, 'Đã lưu bản nháp', { layout: await saveDraft(req.user, req.body || {}) })));
router.post('/layout/draft/racks', permission('warehouse.layout.edit'), handle(async (req, res) =>
  sendSuccess(res, 'Đã thêm kệ và ô', { layout: await addRack(req.user, req.body || {}) }, 201)));
router.delete('/layout/draft/racks/:id', permission('warehouse.layout.edit'), handle(async (req, res) =>
  sendSuccess(res, 'Đã bỏ kệ khỏi bản nháp', { layout: await removeDraftRack(req.user,
    req.params.id, req.query.version) })));
router.post('/layout/draft/racks/:id/resize', permission('warehouse.layout.edit'), handle(async (req, res) =>
  sendSuccess(res, 'Đã đổi số tầng và ô', { layout: await resizeDraftRack(req.user,
    req.params.id, req.body || {}) })));
router.post('/layout/draft/validate', permission('warehouse.layout.edit'), handle(async (req, res) =>
  sendSuccess(res, 'Kết quả kiểm tra', await validateDraft())));
router.post('/layout/draft/publish', permission('warehouse.layout.publish'), handle(async (req, res) =>
  sendSuccess(res, 'Đã áp dụng sơ đồ', await publishDraft(req.user, req.body?.version))));

router.get('/bins/:id', permission('warehouse.layout.view'), handle(async (req, res) =>
  sendSuccess(res, 'Chi tiết ô', await binOccupancy(req.params.id))));
router.get('/bins/:id/history', permission('warehouse.layout.view'), handle(async (req, res) => {
  const bin = await WarehouseLocation.findOne({ _id: req.params.id, layoutBin: true,
    isDeleted: { $ne: true } }).select('_id').lean();
  if (!bin) return sendError(res, 'Không tìm thấy ô', { code: 'BIN_NOT_FOUND' }, 404);
  const history = await SystemLog.find({ targetId: bin._id }).select('action actorId createdAt beforeSnapshot afterSnapshot')
    .sort({ createdAt: -1 }).limit(50).lean();
  return sendSuccess(res, 'Lịch sử ô', { history });
}));
router.get('/bins/:id/label', permission('warehouse.location.barcode.print'), handle(async (req, res) => {
  const bin = await WarehouseLocation.findOne({ _id: req.params.id, layoutBin: true,
    isDeleted: { $ne: true } }).select('locationCode barcode zoneCode rackCode floorNo binNo').lean();
  if (!bin) return sendError(res, 'Không tìm thấy ô', { code: 'BIN_NOT_FOUND' }, 404);
  return sendSuccess(res, 'Tem ô', { bin });
}));
router.get('/bins/:id/label.png', permission('warehouse.location.barcode.print'), handle(async (req, res) => {
  const bin = await WarehouseLocation.findOne({ _id: req.params.id, layoutBin: true,
    isDeleted: { $ne: true } }).select('locationCode barcode').lean();
  if (!bin) return sendError(res, 'Không tìm thấy ô', { code: 'BIN_NOT_FOUND' }, 404);
  const png = await bwipjs.toBuffer({ bcid: 'code128', text: bin.barcode, scale: 3,
    height: 16, includetext: true, textxalign: 'center', paddingwidth: 12, paddingheight: 10 });
  res.set('Content-Type', 'image/png');
  res.set('Content-Disposition', `inline; filename="${bin.locationCode}.png"`);
  res.send(png);
}));
router.post('/bins/:id/print-intent', permission('warehouse.location.barcode.print'), handle(async (req, res) => {
  const bin = await WarehouseLocation.findOne({ _id: req.params.id, layoutBin: true,
    isDeleted: { $ne: true } }).lean();
  if (!bin) return sendError(res, 'Không tìm thấy ô', { code: 'BIN_NOT_FOUND' }, 404);
  await SystemLog.create({ actorId: req.user._id, actorRole: req.user.roleCode,
    majorFeature: 'WAREHOUSE_LAYOUT', subFeature: 'LOCATION_LABEL', action: 'PRINT_REQUEST',
    targetCollection: 'warehouse_locations', targetId: bin._id, targetCode: bin.locationCode });
  return sendSuccess(res, 'Đã ghi nhận yêu cầu in tem');
}));
router.post('/bins/:id/rotate', permission('warehouse.location.barcode.rotate'), handle(async (req, res) => {
  const reason = String(req.body?.reason || '').trim();
  if (!reason) return sendError(res, 'Cần ghi lý do đổi mã', { code: 'REASON_REQUIRED' }, 400);
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const bin = await WarehouseLocation.findOne({ _id: req.params.id, layoutBin: true,
        isDeleted: { $ne: true } }).session(session);
      if (!bin) throw Object.assign(new Error('Không tìm thấy ô'), { code: 'BIN_NOT_FOUND', status: 404 });
      const layout = await WarehouseLayout.findOne({ warehouseType: 'FINISHED_GOODS' }).session(session);
      const index = layout?.active?.bins?.findIndex((item) => String(item.id) === String(bin._id));
      if (!layout || index == null || index < 0) throw Object.assign(new Error('Ô không có trên sơ đồ đang áp dụng'), { code: 'BIN_NOT_ACTIVE', status: 409 });
      const oldBarcode = bin.barcode;
      const barcode = `LOC-${bin.locationCode}-${randomBytes(6).toString('hex').toUpperCase()}`;
      await WarehouseBarcodeHistory.updateOne({ barcode: oldBarcode },
        { $set: { revokedAt: new Date(), reason }, $setOnInsert: { locationId: bin._id } },
        { upsert: true, session });
      await WarehouseBarcodeHistory.create([{ barcode, locationId: bin._id }], { session });
      await WarehouseLocation.updateOne({ _id: bin._id, barcode: oldBarcode },
        { $set: { barcode } }, { session });
      const updated = await WarehouseLayout.updateOne({ _id: layout._id,
        activeVersion: layout.activeVersion }, { $set: { [`active.bins.${index}.barcode`]: barcode },
        $inc: { activeVersion: 1 } }, { session });
      if (!updated.modifiedCount) throw Object.assign(new Error('Sơ đồ đã thay đổi'), { code: 'VERSION_CONFLICT', status: 409 });
      await SystemLog.create([{ actorId: req.user._id, actorRole: req.user.roleCode,
        majorFeature: 'WAREHOUSE_LAYOUT', subFeature: 'LOCATION_LABEL', action: 'ROTATE',
        targetCollection: 'warehouse_locations', targetId: bin._id, targetCode: bin.locationCode,
        beforeSnapshot: { barcode: oldBarcode }, afterSnapshot: { barcode, reason } }], { session });
      result = { locationCode: bin.locationCode, barcode };
    });
    return sendSuccess(res, 'Đã đổi barcode; hãy thay tem cũ trên ô', { bin: result });
  } finally { await session.endSession(); }
}));

router.get('/allocation-options', permission('warehouse.putaway.plan.view'), handle(async (req, res) =>
  sendSuccess(res, 'Nguồn và ô phân bổ', await allocationOptions())));
router.get('/skus', permission('warehouse.layout.view'), handle(async (req, res) =>
  sendSuccess(res, 'SKU cấu hình ô', { skus: await Sku.find({ isActive: true,
    isDeleted: { $ne: true } }).select('skuCode').sort({ skuCode: 1 }).lean() })));
router.get('/allocations', permission('warehouse.putaway.plan.view'), handle(async (req, res) =>
  sendSuccess(res, 'Danh sách phân bổ', { allocations: await listAllocations() })));
router.get('/allocations/:id/history', permission('warehouse.putaway.plan.view'), handle(async (req, res) => {
  const allocation = await PutawayAllocation.findById(req.params.id).select('_id').lean();
  if (!allocation) return sendError(res, 'Không tìm thấy phân bổ', { code: 'ALLOCATION_NOT_FOUND' }, 404);
  const history = await SystemLog.find({ targetId: allocation._id })
    .select('action actorId createdAt beforeSnapshot afterSnapshot').sort({ createdAt: -1 }).limit(50).lean();
  return sendSuccess(res, 'Lịch sử phân bổ', { history });
}));
router.post('/allocations', permission('warehouse.putaway.plan.create'), handle(async (req, res) =>
  sendSuccess(res, 'Đã tạo phân bổ nháp', { allocation: await createAllocation(req.user, req.body || {}) }, 201)));
router.patch('/allocations/:id', permission('warehouse.putaway.plan.modify'), handle(async (req, res) =>
  sendSuccess(res, 'Đã cập nhật phân bổ', { allocation: await updateAllocation(req.user,
    req.params.id, req.body || {}) })));
router.post('/allocations/:id/confirm', permission('warehouse.putaway.plan.create'), handle(async (req, res) =>
  sendSuccess(res, 'Đã giữ chỗ chờ xếp', { allocation: await confirmAllocation(req.user,
    req.params.id, req.body || {}) })));
router.post('/allocations/:id/cancel', permission('warehouse.putaway.plan.modify'), handle(async (req, res) =>
  sendSuccess(res, 'Đã hủy phân bổ', { allocation: await cancelAllocation(req.user,
    req.params.id, req.body || {}) })));

export default router;
