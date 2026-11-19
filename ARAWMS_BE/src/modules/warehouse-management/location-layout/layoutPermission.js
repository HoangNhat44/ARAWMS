/*
 * File: layoutPermission.js
 * Author: Duy Anh
 * Date: 2026-10-27
 * Description: Access control for the warehouse layout, location labels and putaway plans.
 * Only owners and warehouse managers pass; a role's WAREHOUSE_LAYOUT permissions can narrow what they may do.
 */
import Role from '../../../models/Role.model.js';
import { sendError } from '../../../common/utils/responseHandler.js';

/** Capabilities reported to the layout page so it can hide actions the user cannot perform. */
export const LAYOUT_CAPABILITIES = [
  'warehouse.layout.edit', 'warehouse.layout.publish', 'warehouse.location.barcode.print',
  'warehouse.location.barcode.rotate', 'warehouse.putaway.plan.view',
  'warehouse.putaway.plan.create', 'warehouse.putaway.plan.modify',
];

/** Maps a capability name to the Role action that grants it. */
const roleAction = (name) => name.endsWith('.view') ? 'VIEW'
  : name.endsWith('.publish') || name.endsWith('.rotate') ? 'APPROVE'
  : name.endsWith('.print') ? 'EXPORT'
  : name.endsWith('.create') ? 'CREATE' : 'UPDATE';

/** No scoped permissions means the warehouse-manager defaults apply. */
export const roleAllows = (scoped, name) => !scoped?.length || scoped.some((item) =>
  (item.subFeature === name || item.subFeature === '*') && item.allowedActions?.includes(roleAction(name)));

/** Requires the named layout capability and keeps the scoped permissions on the request. */
export const layoutPermission = (name) => async (req, res, next) => {
  try {
    if (!req.user.roles?.some((role) => ['OWNER', 'WAREHOUSE_MANAGER'].includes(role))) {
      return sendError(res, 'Không có quyền cấu hình kho', { code: 'FORBIDDEN' }, 403);
    }
    // Direct URL testing has no persisted role. Keep layout capabilities available.
    const role = req.user.roleId ? await Role.findById(req.user.roleId).select('permissions').lean() : null;
    const scoped = role?.permissions?.filter((item) => item.majorFeature === 'WAREHOUSE_LAYOUT');
    if (!roleAllows(scoped, name)) return sendError(res, 'Thiếu quyền thao tác sơ đồ kho', { code: 'FORBIDDEN' }, 403);
    req.layoutRolePermissions = scoped;
    // This repository has one logical finished-goods warehouse; warehouseIds hold
    // individual locations and cannot scope a layout before its first bin exists.
    next();
  } catch (error) { next(error); }
};

/** Putaway access: physical scans for warehouse staff, reviews for owners and managers. */
export const putawayRole = (...allowed) => (req, res, next) => (allowed.some((item) => req.user.roles?.includes(item))
  ? next() : sendError(res, 'Không có quyền thao tác xếp hàng', { code: 'FORBIDDEN' }, 403));
