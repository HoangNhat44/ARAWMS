import inventoryWidgetService from './inventoryWidget.service.js';
import { successResponse, errorResponse } from '../../../common/utils/apiResponse.js';

/**
 * INVENTORY WIDGET CONTROLLER
 * Xử lý UC-77
 */

/**
 * UC-77: Tra cứu tồn kho khả dụng thời gian thực
 * GET /api/conversations/inventory-widget/sku-lookup
 */
export const lookupRealtimeStock = async (req, res) => {
  try {
    const skus = await inventoryWidgetService.lookupRealtimeStock(req.query.search);
    return successResponse(res, skus, 'Tra cứu tồn kho khả dụng theo SKU thành công');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

export default {
  lookupRealtimeStock,
};
