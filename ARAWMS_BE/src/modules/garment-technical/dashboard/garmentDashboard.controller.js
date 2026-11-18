/**
 * ============================================================================
 * @title        : Garment Technician Dashboard Controller
 * @author       : AraWMS Team
 * @createdDate  : 2026-11-18
 * @lastModified : 2026-11-18
 * @description  : Tiếp nhận yêu cầu lấy dữ liệu tổng hợp Dashboard thống kê KCS cho Nhân viên Kỹ thuật.
 * @module       : Garment Technical / Dashboard
 * @layer        : Controller
 * ============================================================================
 */

import { sendSuccess } from '../../../common/utils/responseHandler.js';
import { getGarmentDashboardSummary } from './garmentDashboard.service.js';

/**
 * Lấy dữ liệu tổng hợp Dashboard cho Kỹ thuật may theo khung thời gian.
 * @route GET /api/garment-technical/dashboard
 */
export const getDashboard = async (req, res, next) => {
  try {
    const data = await getGarmentDashboardSummary(req.query, req.user);
    return sendSuccess(res, 'Dữ liệu Dashboard thống kê Kỹ thuật may', data);
  } catch (error) {
    return next(error);
  }
};
