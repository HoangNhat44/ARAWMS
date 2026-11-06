/*
 * File: stocktakeExecution.controller.js
 * Author: Duy Anh & Antigravity
 * Date: 2026-11-06
 * Description: Express controller for Garment Technician inventory stocktake execution.
 */
import { sendSuccess, sendError } from '../../../common/utils/responseHandler.js';
import {
  listAssignedSessions,
  getSessionDetails,
  verifyShelfLocation,
  recordScannedItem,
  updateRecordQty,
  submitSessionCompletion,
} from './stocktakeExecution.service.js';
import { validateVerifyShelf, validateScanItem } from './stocktakeExecution.validation.js';

const run = (message, action, status = 200) => async (req, res, next) => {
  try {
    const data = await action(req);
    return sendSuccess(res, message, data, status);
  } catch (error) {
    if (error.status) {
      return sendError(res, error.message, { code: error.code }, error.status);
    }
    next(error);
  }
};

export const listSessions = run('Danh sách đợt kiểm kê được giao', async (req) =>
  listAssignedSessions(req.user, req.query)
);

export const getSession = run('Chi tiết đợt kiểm kê', async (req) =>
  getSessionDetails(req.params.id)
);

export const verifyShelf = run('Xác nhận kệ kho thành công', async (req) => {
  const { shelfBarcode } = validateVerifyShelf(req.body);
  return verifyShelfLocation(req.params.id, shelfBarcode);
});

export const scanItem = run('Ghi nhận quét barcode sản phẩm', async (req) => {
  const payload = validateScanItem(req.body);
  return recordScannedItem(req.params.id, payload, req.user);
});

export const updateQty = run('Cập nhật số lượng kiểm kê thành công', async (req) =>
  updateRecordQty(req.params.id, req.body, req.user)
);

export const completeSession = run('Đã hoàn thành kiểm kê và gửi Quản lý kho xem xét', async (req) =>
  submitSessionCompletion(req.params.id, req.user)
);

