/*
 * File: finishedInspection.controller.js
 * Author: Duy Anh & Antigravity
 * Date: 2026-11-06
 * Description: HTTP handlers for Garment Technician Finished Goods Inspection & Inbound Requests.
 */
import { sendError, sendSuccess } from '../../../common/utils/responseHandler.js';
import {
  getFinishedInspectionOptions,
  listFinishedGoodsTickets,
  getFinishedGoodsTicketDetails,
  createFinishedGoodsInboundTicket,
} from './finishedInspection.service.js';

const respond = (error, res, next) => {
  if (error.status) return sendError(res, error.message, { code: error.code || 'BAD_REQUEST' }, error.status);
  if (error.code === 11000) return sendError(res, 'Mã phiếu hoặc dữ liệu đã tồn tại', { code: 'DUPLICATE_CODE' }, 409);
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

export const getOptions = handle('Danh mục lựa chọn kiểm định thành phẩm', () => getFinishedInspectionOptions());
// UC-055: Xem danh sách phiếu yêu cầu nhập kho thành phẩm (FT-04)
export const listTickets = handle('Danh sách phiếu yêu cầu nhập thành phẩm', (req) => listFinishedGoodsTickets(req.query, req.user));
// UC-055: Xem chi tiết phiếu yêu cầu nhập kho thành phẩm (FT-04)
export const getTicket = handle('Chi tiết phiếu yêu cầu nhập thành phẩm', (req) => getFinishedGoodsTicketDetails(req.params.id));
// UC-054: Tạo phiếu yêu cầu nhập kho thành phẩm sau kiểm định KCS (FT-04)
export const createTicket = handle('Đã gửi yêu cầu nhập kho thành phẩm tới Quản lý kho', (req) => createFinishedGoodsInboundTicket(req.body, req.user), 201);

