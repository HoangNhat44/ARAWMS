/*
 * File: inboundVerification.controller.js
 * Author: Duy Anh & Antigravity
 * Date: 2026-11-06
 * Description: HTTP handlers for Garment Technician Inbound Verification & Requests.
 */
import { sendError, sendSuccess } from '../../../common/utils/responseHandler.js';
import {
  getInboundVerificationOptions,
  listInboundPlans,
  getInboundPlanDetails,
  verifyInboundPlan,
  listInboundRequests,
  createDirectInboundRequest,
} from './inboundVerification.service.js';

const respond = (error, res, next) => {
  if (error.status) return sendError(res, error.message, { code: error.code || 'BAD_REQUEST' }, error.status);
  if (error.code === 11000) return sendError(res, 'Mã phiếu hoặc mã dữ liệu đã tồn tại', { code: 'DUPLICATE_CODE' }, 409);
  if (error.name === 'ValidationError' || error.name === 'CastError') {
    return sendError(res, error.message || 'Dữ liệu không hợp lệ', { code: 'INVALID_DATA' }, 400);
  }
  next(error);
};

const handle = (message, task, status = 200) => async (req, res, next) => {
  try {
    const result = await task(req);
    return sendSuccess(res, message, result, status);
  } catch (error) {
    return respond(error, res, next);
  }
};

export const getOptions = handle('Danh mục lựa chọn KCS', () => getInboundVerificationOptions());
// UC-044: Xem danh sách kế hoạch nhập nguyên phụ liệu (FT-04)
export const listPlans = handle('Danh sách kế hoạch nhập NPL', (req) => listInboundPlans(req.query, req.user));
// UC-044: Xem chi tiết kế hoạch nhập nguyên phụ liệu (FT-04)
export const getPlan = handle('Chi tiết kế hoạch nhập NPL', (req) => getInboundPlanDetails(req.params.id));
// UC-045 & UC-046: Tạo / Cập nhật kết quả kiểm định KCS theo kế hoạch nhập (FT-04)
export const verifyPlan = handle('Nghiệm thu kế hoạch thành công', (req) => verifyInboundPlan(req.params.id, req.body, req.user));
export const listRequests = handle('Danh sách yêu cầu nhập kho NPL', (req) => listInboundRequests(req.query, req.user));
// UC-045: Tạo phiếu yêu cầu nhập kho nguyên phụ liệu trực tiếp (FT-04)
export const createRequest = handle('Đã gửi yêu cầu nhập kho NPL tới Quản lý kho', (req) => createDirectInboundRequest(req.body, req.user), 201);

