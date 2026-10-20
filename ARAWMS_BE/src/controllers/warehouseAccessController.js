import mongoose from 'mongoose';
import User from '../models/User.js';
import Config from '../models/Config.js';
import { sendError, sendSuccess } from '../utils/responseHandler.js';

const assignableRoles = new Set(['STAFF', 'SALES', 'WAREHOUSE_STAFF', 'WAREHOUSE_MANAGER']);

export const assignAccess = async (req, res, next) => {
  try {
    if (!req.user.roles?.includes('ADMIN')) return sendError(res, 'Không có quyền quản trị', { code: 'FORBIDDEN' }, 403);
    const { role, warehouseIds = [] } = req.body;
    if (!mongoose.isValidObjectId(req.params.id) || !assignableRoles.has(role) || !Array.isArray(warehouseIds) ||
        warehouseIds.some((id) => !mongoose.isValidObjectId(id))) {
      return sendError(res, 'Role hoặc danh sách kho không hợp lệ', { code: 'INVALID_ACCESS' }, 400);
    }
    if (['WAREHOUSE_STAFF', 'WAREHOUSE_MANAGER'].includes(role) && !warehouseIds.length) {
      return sendError(res, 'Nhân viên kho phải được gán ít nhất một kho', { code: 'WAREHOUSE_REQUIRED' }, 400);
    }
    const uniqueIds = [...new Set(warehouseIds.map(String))];
    const count = await Config.countDocuments({ _id: { $in: uniqueIds }, kind: 'WAREHOUSE' });
    if (count !== uniqueIds.length) return sendError(res, 'Có kho không tồn tại', { code: 'WAREHOUSE_NOT_FOUND' }, 400);
    const target = await User.findById(req.params.id);
    if (!target) return sendError(res, 'Không tìm thấy tài khoản', { code: 'USER_NOT_FOUND' }, 404);
    if (target.roles.includes('ADMIN')) return sendError(res, 'Không thay quyền quản trị qua API này', { code: 'ADMIN_PROTECTED' }, 403);
    target.roles = [role];
    target.warehouseIds = ['WAREHOUSE_STAFF', 'WAREHOUSE_MANAGER'].includes(role) ? uniqueIds : [];
    await target.save();
    return sendSuccess(res, 'Đã cập nhật quyền và phạm vi kho', {
      userId: String(target._id), roles: target.roles, warehouseIds: target.warehouseIds,
    });
  } catch (error) { next(error); }
};
