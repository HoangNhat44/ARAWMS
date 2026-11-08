import customerExchangeProcessingService from './customerExchangeProcessing.service.js';
import { successResponse, errorResponse } from '../../../common/utils/apiResponse.js';

/**
 * CUSTOMER EXCHANGE PROCESSING CONTROLLER
 * Xử lý UC-83
 */

/**
 * UC-83: Tạo đơn hàng đổi mới liên kết RMA
 * POST /api/returns/customer-exchange/:rmaId/create-exchange-order
 */
export const createExchangeOrder = async (req, res) => {
  try {
    const result = await customerExchangeProcessingService.createExchangeOrder(req.params.rmaId, req.body, req.user, req);
    return successResponse(res, result, 'Tạo đơn hàng đổi mới liên kết RMA thành công', 201);
  } catch (error) {
    return errorResponse(res, error.message, 400);
  }
};

export default {
  createExchangeOrder,
};
