import returnMerchandiseAuthorizationService from './returnMerchandiseAuthorization.service.js';
import { successResponse, errorResponse } from '../../../common/utils/apiResponse.js';

/**
 * RETURN MERCHANDISE AUTHORIZATION CONTROLLER
 * Xử lý UC-82
 */

/**
 * UC-82: Tiếp nhận và tạo yêu cầu đổi/trả hàng (RMA)
 * POST /api/returns/rma
 */
export const createReturnRequest = async (req, res) => {
  try {
    const rma = await returnMerchandiseAuthorizationService.createReturnRequest(req.body, req.user, req);
    return successResponse(res, rma, 'Tạo phiếu yêu cầu đổi/trả hàng (RMA) thành công', 201);
  } catch (error) {
    return errorResponse(res, error.message, 400);
  }
};

/**
 * Lấy danh sách RMA
 * GET /api/returns/rma
 */
export const getRmaList = async (req, res) => {
  try {
    const result = await returnMerchandiseAuthorizationService.getRmaList(req.query, req.user);
    return successResponse(res, result, 'Lấy danh sách phiếu RMA thành công');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

/**
 * Lấy chi tiết RMA
 * GET /api/returns/rma/:id
 */
export const getRmaById = async (req, res) => {
  try {
    const rma = await returnMerchandiseAuthorizationService.getRmaById(req.params.id);
    return successResponse(res, rma, 'Lấy chi tiết phiếu RMA thành công');
  } catch (error) {
    return errorResponse(res, error.message, 404);
  }
};

/**
 * [GBR-14] Seller gửi yêu cầu hoàn tiền cho Kế toán
 * POST /api/returns/rma/:id/refund-request
 */
export const submitRefundRequest = async (req, res) => {
  try {
    const rma = await returnMerchandiseAuthorizationService.submitRefundRequest(req.params.id, req.body, req.user, req);
    return successResponse(res, rma, 'Đã gửi yêu cầu hoàn tiền cho Kế toán duyệt');
  } catch (error) {
    return errorResponse(res, error.message, 400);
  }
};

/**
 * Kế toán xem danh sách yêu cầu hoàn tiền
 * GET /api/returns/rma/refund-requests
 */
export const getRefundRequests = async (req, res) => {
  try {
    const result = await returnMerchandiseAuthorizationService.getRefundRequests(req.query);
    return successResponse(res, result, 'Lấy danh sách yêu cầu hoàn tiền thành công');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

/**
 * Kế toán duyệt và tạo phiếu chi
 * POST /api/returns/rma/:id/refund-approve
 */
export const approveRefundRequest = async (req, res) => {
  try {
    const result = await returnMerchandiseAuthorizationService.approveRefundRequest(req.params.id, req.body, req.user, req);
    return successResponse(res, result, `Đã duyệt và tạo phiếu chi ${result.voucher.voucherCode}`);
  } catch (error) {
    return errorResponse(res, error.message, 400);
  }
};

/**
 * Kế toán từ chối yêu cầu hoàn tiền
 * POST /api/returns/rma/:id/refund-reject
 */
export const rejectRefundRequest = async (req, res) => {
  try {
    const rma = await returnMerchandiseAuthorizationService.rejectRefundRequest(req.params.id, req.body, req.user, req);
    return successResponse(res, rma, 'Đã từ chối yêu cầu hoàn tiền');
  } catch (error) {
    return errorResponse(res, error.message, 400);
  }
};

export default {
  createReturnRequest,
  getRmaList,
  getRmaById,
  submitRefundRequest,
  getRefundRequests,
  approveRefundRequest,
  rejectRefundRequest,
};
