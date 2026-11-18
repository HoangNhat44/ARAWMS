/**
 * ============================================================================
 * @title        : Garment Lot Management Controller
 * @author       : AraWMS Team
 * @createdDate  : 2026-11-18
 * @lastModified : 2026-11-18
 * @description  : Tiếp nhận HTTP requests cho chức năng Quản lý Lô (Thành phẩm & Nguyên phụ liệu)
 *                 của Kỹ thuật may và bàn giao dữ liệu lô sang Quản lý kho.
 * @module       : Garment Technical / Lot Management
 * @layer        : Controller
 * ============================================================================
 */

import { sendError, sendSuccess } from '../../../common/utils/responseHandler.js';
import {
  getLotFormOptions,
  listGarmentLots,
  getGarmentLotById,
  createGarmentLot,
  updateGarmentLot,
  deleteGarmentLot,
  sendLotsToWarehouse,
} from './lotManagement.service.js';

const respond = (error, res, next) => {
  if (error.status) {
    return sendError(res, error.message, { code: error.code || 'BAD_REQUEST' }, error.status);
  }
  if (error.code === 11000) {
    return sendError(res, 'Mã lô đã tồn tại trong hệ thống, vui lòng chọn mã lô khác', { code: 'DUPLICATE_LOT_CODE' }, 409);
  }
  if (error.name === 'ValidationError' || error.name === 'CastError') {
    return sendError(res, error.message || 'Dữ liệu lô không hợp lệ', { code: 'INVALID_DATA' }, 400);
  }
  next(error);
};

const handle = (message, task, status = 200) => async (req, res, next) => {
  try {
    const data = await task(req);
    return sendSuccess(res, message, data, status);
  } catch (error) {
    return respond(error, res, next);
  }
};

export const getOptions = handle('Danh mục SKU, nguyên phụ liệu và nhà cung cấp cho quản lý lô', () =>
  getLotFormOptions()
);

export const listLots = handle('Danh sách lô hàng kỹ thuật', (req) => listGarmentLots(req.query));

export const getLot = handle('Chi tiết lô hàng', (req) => getGarmentLotById(req.params.id));

export const createLot = handle('Đã tạo lô hàng mới', (req) => createGarmentLot(req.body, req.user), 201);

export const updateLot = handle('Đã cập nhật thông tin lô hàng', (req) => updateGarmentLot(req.params.id, req.body));

export const deleteLot = handle('Đã xóa lô hàng nháp', (req) => deleteGarmentLot(req.params.id));

export const sendInboundRequest = handle(
  'Đã gửi yêu cầu nhập kho cho các lô đã chọn sang Quản lý kho',
  (req) => sendLotsToWarehouse(req.body, req.user),
  201
);
