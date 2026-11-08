import crmProfileService from './crmProfile.service.js';
import { successResponse, errorResponse } from '../../../common/utils/apiResponse.js';

/**
 * CRM PROFILE CONTROLLER
 * Xử lý UC-70, UC-71, UC-75, UC-76
 */

/**
 * UC-71: Tạo hồ sơ khách hàng mới
 * POST /api/conversations/crm-profile
 */
export const createCustomer = async (req, res) => {
  try {
    const customer = await crmProfileService.createCustomer(req.body, req.user, req);
    return successResponse(res, customer, 'Tạo hồ sơ khách hàng thành công', 201);
  } catch (error) {
    return errorResponse(res, error.message, 400);
  }
};

/**
 * UC-70: Cập nhật thông tin khách hàng
 * PUT /api/conversations/crm-profile/:id
 */
export const updateCustomer = async (req, res) => {
  try {
    const customer = await crmProfileService.updateCustomer(req.params.id, req.body, req.user, req);
    return successResponse(res, customer, 'Cập nhật hồ sơ khách hàng thành công');
  } catch (error) {
    return errorResponse(res, error.message, 400);
  }
};

/**
 * UC-75: Tra cứu lịch sử tương tác của khách hàng
 * GET /api/conversations/crm-profile/:customerId/interaction-history
 */
export const getCustomerInteractionHistory = async (req, res) => {
  try {
    const history = await crmProfileService.getCustomerInteractionHistory(req.params.customerId);
    return successResponse(res, history, 'Lấy lịch sử tương tác thành công');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

/**
 * UC-76: Tra cứu lịch sử đơn hàng của khách hàng
 * GET /api/conversations/crm-profile/:customerId/purchase-history
 */
export const getCustomerPurchaseHistory = async (req, res) => {
  try {
    const orders = await crmProfileService.getCustomerPurchaseHistory(req.params.customerId);
    return successResponse(res, orders, 'Lấy lịch sử đơn hàng thành công');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

export default {
  createCustomer,
  updateCustomer,
  getCustomerInteractionHistory,
  getCustomerPurchaseHistory,
};
