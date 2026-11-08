/*
 * File: remnantRecovery.controller.js
 * Author: Duy Anh & Antigravity
 * Date: 2026-11-06
 * Description: Express controller for Garment Outbound Requests and Remnant Recovery.
 */
import { sendSuccess, sendError } from '../../../common/utils/responseHandler.js';
import {
  getOutboundOptions,
  createOutboundRequest,
  listGarmentOutboundRequests,
  getOutboundRequestDetail,
  listIssuedRollsForCutting,
  listRemnantRecoveryHistory,
  getSystemThreshold,
} from './remnantRecovery.service.js';
import { lookupRemnantSources, submitRemnantReturn, listRemnantReturns,
  confirmRemnantReturn, reportRemnantDiscrepancy, closeRemnantReturn,
  reportUnidentifiedReturnSource } from './remnantReturn.service.js';
import {
  validateCreateOutboundRequest,
} from './remnantRecovery.validation.js';

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

export const getOptions = run('Tùy chọn xuất NPL & Ngưỡng vải thừa từ DB', async (req) =>
  getOutboundOptions(req.user)
);

export const getThreshold = run('Ngưỡng vải thừa quy định từ hệ thống', async () =>
  getSystemThreshold()
);

export const createOutbound = run('Đã tạo yêu cầu xuất nguyên phụ liệu gửi Quản lý kho', async (req) => {
  const validated = validateCreateOutboundRequest(req.body);
  return createOutboundRequest(validated, req.user);
}, 201);

export const listOutbounds = run('Danh sách yêu cầu xuất NPL của xưởng may', async (req) =>
  listGarmentOutboundRequests(req.user, req.query)
);

export const getOutbound = run('Chi tiết phiếu xuất NPL', async (req) =>
  getOutboundRequestDetail(req.params.id)
);

export const listIssuedRolls = run('Danh sách cuộn vải đã xuất cho xưởng cắt', async (req) =>
  listIssuedRollsForCutting(req.user, req.query)
);

export const recordCutting = run('Đã ghi nhận cắt vải & xử lý thu hồi vải thừa', async (req) => {
  return submitRemnantReturn(req.body, req.user);
});

export const lookupReturnSource = run('Nguồn cây vải và các lần xuất', async (req) =>
  lookupRemnantSources(req.query.barcode, req.query.outboundTicketId));
export const reportUnknownReturnSource = run('Đã báo sai lệch nguồn cây vải', async (req) =>
  reportUnidentifiedReturnSource(req.params.id, req.body.barcode, req.body.reason, req.user));
export const listReturnRequests = run('Yêu cầu nhập lại vải thừa', async () => listRemnantReturns());
export const confirmReturnRequest = run('Đã xác nhận nhập lại vải thừa', async (req) =>
  confirmRemnantReturn(req.params.id, req.body, req.user));
export const reportReturnDiscrepancy = run('Đã báo sai lệch vải trả', async (req) =>
  reportRemnantDiscrepancy(req.params.id, req.body.reason, req.user));
export const cancelReturnRequest = run('Đã đóng yêu cầu trả vải', async (req) =>
  closeRemnantReturn(req.params.id, req.body.status, req.user));

export const listHistory = run('Lịch sử thu hồi & nhập lại vải thừa', async (req) =>
  listRemnantRecoveryHistory(req.user, req.query)
);

