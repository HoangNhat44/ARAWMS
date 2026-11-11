/**
 * ============================================================================
 * @title        : Return Inspection Controller
 * @author       : AraWMS Team
 * @createdDate  : 2026-11-11
 * @lastModified : 2026-11-11
 * @description  : Tiếp nhận và xử lý các yêu cầu HTTP liên quan đến Kiểm tra hàng hoàn/trả
 *                 thuộc phân hệ Nhân viên Kỹ thuật (Garment Technician).
 * @module       : Garment Technical / Return Inspection
 * @layer        : Controller
 * ============================================================================
 */

import { sendError, sendSuccess } from '../../../common/utils/responseHandler.js';
import {
  lookupOrderByCode,
  submitReturnInspection,
  listReturnInspections,
  createReturnInboundTicket,
  getRecentReturnableOrders,
} from './returnInspection.service.js';

/**
 * Xử lý lỗi trả về cho client theo cấu trúc chuẩn.
 */
const respond = (error, res, next) => {
  if (error.status) {
    return sendError(res, error.message, { code: error.code || 'BAD_REQUEST' }, error.status);
  }
  if (error.code === 11000) {
    return sendError(res, 'Mã biên bản kiểm tra hoặc dữ liệu đã tồn tại', { code: 'DUPLICATE_CODE' }, 409);
  }
  if (error.name === 'ValidationError' || error.name === 'CastError') {
    return sendError(res, error.message || 'Dữ liệu không hợp lệ', { code: 'INVALID_DATA' }, 400);
  }
  next(error);
};

/**
 * Higher-order function hỗ trợ bọc controller handlers.
 */
const handle = (message, task, status = 200) => async (req, res, next) => {
  try {
    const result = await task(req);
    return sendSuccess(res, message, result, status);
  } catch (error) {
    return respond(error, res, next);
  }
};

/**
 * Tra cứu thông tin đơn hàng / mã vận đơn khi nhân viên kỹ thuật quét mã.
 * @route GET /garment-technical/return-inspection/lookup/:code
 */
export const lookupOrder = handle('Tra cứu thông tin đơn hàng hoàn thành công', (req) =>
  lookupOrderByCode(req.params.code || req.query.code)
);

/**
 * Ghi lại biên bản kiểm tra KCS hàng hoàn (ĐẠT hoặc KHÔNG ĐẠT kèm video).
 * @route POST /garment-technical/return-inspection/submit
 */
export const submitInspection = handle(
  'Ghi nhận kết quả kiểm tra hàng hoàn thành công',
  (req) => submitReturnInspection(req.body, req.user),
  201
);

/**
 * Lấy danh sách kết quả kiểm tra hàng hoàn kèm bộ lọc Đạt / Không đạt và thống kê.
 * @route GET /garment-technical/return-inspection
 */
export const listInspections = handle('Danh sách kết quả kiểm tra hàng hoàn', (req) =>
  listReturnInspections(req.query)
);

/**
 * Tạo phiếu yêu cầu nhập kho hàng hoàn gửi Quản lý kho.
 * @route POST /garment-technical/return-inspection/inbound-ticket
 */
export const requestInboundTicket = handle(
  'Đã tạo phiếu yêu cầu nhập kho hàng hoàn gửi Quản lý kho',
  (req) => createReturnInboundTicket(req.body, req.user),
  201
);

/**
 * Lấy danh sách các đơn hàng gợi ý để kiểm tra nhanh.
 * @route GET /garment-technical/return-inspection/recent-orders
 */
export const getRecentOrders = handle(
  'Danh sách đơn hàng gợi ý kiểm tra',
  () => getRecentReturnableOrders()
);

