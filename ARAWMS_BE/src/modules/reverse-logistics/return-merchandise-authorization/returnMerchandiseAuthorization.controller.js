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

export default {
  createReturnRequest,
  getRmaList,
  getRmaById,
};
