import * as codReconciliationService from './codReconciliation.service.js';

/**
 * GET /api/financial/cod-reconciliation/orders
 * Lấy danh sách các đơn hàng COD
 */
export const getCodOrdersList = async (req, res, next) => {
  try {
    const filters = {
      status: req.query.status,
      shippingStatus: req.query.shippingStatus,
      search: req.query.search,
    };
    const result = await codReconciliationService.getCodOrdersList(filters);
    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/financial/cod-reconciliation/sync-ghn
 * Thực thi đối soát tự động qua API GHN
 */
export const executeAutomatedCodReconciliation = async (req, res, next) => {
  try {
    const currentUserId = req.user?.id || req.user?._id;
    const result = await codReconciliationService.executeAutomatedCodReconciliation(
      req.body,
      currentUserId
    );
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/financial/cod-reconciliation/red-flags
 * Lấy danh sách cờ đỏ lệch COD
 */
export const getRedFlagDiscrepancies = async (req, res, next) => {
  try {
    const items = await codReconciliationService.getRedFlagDiscrepancies();
    return res.status(200).json({
      success: true,
      total: items.length,
      data: items,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/financial/cod-reconciliation/disputes/:itemId
 * Xử lý khiếu nại / giải quyết cờ đỏ
 */
export const resolveDispute = async (req, res, next) => {
  try {
    const currentUserId = req.user?.id || req.user?._id;
    const { itemId } = req.params;
    const result = await codReconciliationService.resolveDispute(
      itemId,
      req.body,
      currentUserId
    );
    return res.status(200).json({
      success: true,
      message: 'Cập nhật tiến độ xử lý khiếu nại đối soát thành công!',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/financial/cod-reconciliation/disputes/:itemId/simulate-feedback
 * Mô phỏng phản hồi từ Hãng vận chuyển GHN (Sandbox Webhook Simulator)
 */
export const simulateGhnDisputeFeedback = async (req, res, next) => {
  try {
    const { itemId } = req.params;
    const result = await codReconciliationService.simulateGhnDisputeFeedback(
      itemId,
      req.body
    );
    return res.status(200).json({
      success: true,
      message: 'Mô phỏng phản hồi từ GHN thành công!',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/financial/cod-reconciliation/seed-sample
 * Khởi tạo 5 đơn mẫu (4 đơn tiền mặt + 1 đơn chuyển khoản) để test
 */
export const seedSampleOrders = async (req, res, next) => {
  try {
    const result = await codReconciliationService.seedMockOrdersForTesting();
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

