/*
 * File: outboundExecution.controller.js
 * Description: Exposes material issue drafts, source checking, and stock confirmation as API responses.
 */
import { sendError, sendSuccess } from '../../../common/utils/responseHandler.js';
import { getOutboundOptions, listOutbounds, getOutbound, saveOutbound, checkOutboundSource,
  confirmOutbound, cancelOutbound } from './outboundExecution.service.js';

const handle = (message, task, status = 200) => async (req, res, next) => {
  try { return sendSuccess(res, message, await task(req), status); }
  catch (error) {
    if (error.status) return sendError(res, error.message, { code: error.code }, error.status);
    if (error.name === 'ValidationError' || error.name === 'CastError')
      return sendError(res, 'Dữ liệu phiếu xuất không hợp lệ', { code: 'INVALID_OUTBOUND' }, 400);
    if (error.code === 11000) return sendError(res, 'Thao tác xác nhận đã được sử dụng', { code: 'DUPLICATE_CONFIRMATION' }, 409);
    return next(error);
  }
};
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
