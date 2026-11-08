/*
 * File: outboundExecution.controller.js
 * Description: Exposes material issue drafts, source checking, and stock confirmation as API responses.
 */
import { sendError, sendSuccess } from '../../../common/utils/responseHandler.js';
import {
  getOutboundOptions,
  listOutbounds,
  getOutbound,
  saveOutbound,
  checkOutboundSource,
  confirmOutbound,
  cancelOutbound,
  listOutboundRequests,
  getStaffUsers,
  getOutboundRequestDetail,
  approveAndAssignRequest,
  listStaffOutboundTasks,
  startPicking,
  scanOutboundBarcode,
  recordPickedQuantity,
  removePickedSource,
  reportShortage,
  resolveShortage,
  reallocateSources,
  pausePicking,
  confirmHandoverAndOutbound,
} from './outboundExecution.service.js';

const handle = (message, task, status = 200) => async (req, res, next) => {
  try {
    return sendSuccess(res, message, await task(req), status);
  } catch (error) {
    console.error(`[OutboundExecution Error] [${req.method} ${req.originalUrl}]:`, error);
    if (error.status) return sendError(res, error.message, { code: error.code }, error.status);
    if (error.name === 'ValidationError' || error.name === 'CastError')
      return sendError(res, error.message || 'Dữ liệu phiếu xuất không hợp lệ', { code: 'INVALID_OUTBOUND' }, 400);
    if (error.code === 11000) return sendError(res, 'Thao tác xác nhận đã được sử dụng', { code: 'DUPLICATE_CONFIRMATION' }, 409);
    return next(error);
  }
};

// Existing ticket endpoints
export const options = handle('Nguồn xuất khả dụng', (req) => getOutboundOptions(req.user));
export const list = handle('Danh sách phiếu xuất', (req) => listOutbounds(req.query, req.user));
export const detail = handle('Chi tiết phiếu xuất', async (req) => {
  const ticket = await getOutbound(req.params.id, req.user);
  await ticket.populate('createdByUserId', 'fullName');
  await ticket.populate('confirmedByUserId', 'fullName');
  return ticket;
});
export const create = handle('Đã lưu bản nháp', (req) => saveOutbound(null, req.body || {}, req.user), 201);
export const update = handle('Đã cập nhật bản nháp', (req) => saveOutbound(req.params.id, req.body || {}, req.user));
export const check = handle('Đã kiểm tra nguồn lấy', (req) => checkOutboundSource(req.params.id, req.body || {}, req.user));
export const confirm = handle('Đã xác nhận xuất kho', (req) => confirmOutbound(req.params.id, req.body || {}, req.user));
export const cancel = handle('Đã hủy bản nháp', (req) => cancelOutbound(req.params.id, req.user));

// New Workflow endpoints: Quản lý duyệt và giao việc -> Nhân viên quét barcode -> Bàn giao và xuất kho
export const listRequests = handle('Danh sách yêu cầu xuất kho', (req) => listOutboundRequests(req.query, req.user));
export const staffUsers = handle('Danh sách nhân viên kho', (req) => getStaffUsers(req.user));
export const requestDetail = handle('Chi tiết yêu cầu xuất kho', (req) => getOutboundRequestDetail(req.params.id, req.user));
export const approveAndAssign = handle('Đã duyệt yêu cầu và giao việc', (req) => approveAndAssignRequest(req.params.id, req.body || {}, req.user));
export const staffTasks = handle('Danh sách công việc lấy hàng', (req) => listStaffOutboundTasks(req.user));
export const startPickingTask = handle('Bắt đầu lấy hàng', (req) => startPicking(req.params.id, req.user));
export const scanBarcode = handle('Kết quả quét barcode', (req) => scanOutboundBarcode(req.params.id, req.body || {}, req.user));
export const recordQuantity = handle('Đã ghi nhận số lượng thực lấy', (req) => recordPickedQuantity(req.params.id, req.body || {}, req.user));
export const removeSource = handle('Đã xóa nguồn lấy', (req) => removePickedSource(req.params.id, req.body || {}, req.user));
export const reportShortageTask = handle('Đã ghi nhận báo thiếu / sai lệch', (req) => reportShortage(req.params.id, req.body || {}, req.user));
export const resolveShortageTask = handle('Đã xử lý sai lệch / duyệt xuất thiếu', (req) => resolveShortage(req.params.id, req.body || {}, req.user));
export const reallocate = handle('Đã cập nhật phân bổ nguồn', (req) => reallocateSources(req.params.id, req.body || {}, req.user));
export const pauseTask = handle('Đã tạm dừng và lưu tiến độ', (req) => pausePicking(req.params.id, req.user));
export const confirmHandover = handle('Đã xác nhận bàn giao và xuất kho thành công', (req) => confirmHandoverAndOutbound(req.params.id, req.body || {}, req.user));
