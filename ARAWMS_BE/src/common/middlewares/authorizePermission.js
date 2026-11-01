/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Chức năng: UC-09; GBR-01 - Tính quyền theo vai trò và quyền ngoại lệ của nhân viên.
 */
import { httpError } from '../utils/httpError.js';
// UC-09: Mã quyền ghép tên feature, chức năng con và hành động để FE/BE dùng cùng một định danh.
export const permissionCode = (permission, action) => `${permission.majorFeature}|${permission.subFeature}|${action}`;
export const CARRIER_VIEW = 'Order Fulfillment|Carrier Handover|VIEW';
export const CARRIER_CREATE = 'Order Fulfillment|Carrier Handover|CREATE';
// UC-09: Quyền nền tương thích các API vận chuyển sẵn có khi role chưa có permissions.
export const basePermissionCodes = (roleCode, rolePermissions = []) => rolePermissions.length
  ? rolePermissions.flatMap((entry) => entry.allowedActions.map((action) => permissionCode(entry, action)))
  : ['WAREHOUSE_MANAGER', 'WAREHOUSE_STAFF'].includes(roleCode) ? [CARRIER_VIEW, CARRIER_CREATE] : [];
// UC-09: Bắt đầu từ vai trò rồi áp dụng cấp/thu hồi riêng; đây là quyền có hiệu lực của nhân viên.
export const effectivePermissions = (user, rolePermissions = user.roleId?.permissions || []) => {
  const codes = new Set(basePermissionCodes(user.roleCode, rolePermissions));
  // Thu hồi riêng loại quyền khỏi vai trò; cấp riêng bổ sung quyền ngoài quyền nền.
  for (const override of user.permissionOverrides || []) {
    if (override.granted) codes.add(override.code); else codes.delete(override.code);
  }
  return [...codes].sort();
};
// UC-09: Middleware dùng cho API nhân viên; quyền Owner không cấp qua ngoại lệ.
export const authorizePermission = (code) => (req, res, next) => {
  if (!req.user) return next(httpError(401, 'Vui lòng đăng nhập.'));
  if (req.user.roleCode === 'OWNER' || effectivePermissions(req.user).includes(code)) return next();
  next(httpError(403, 'Tài khoản không được cấp quyền thực hiện thao tác này.'));
};
