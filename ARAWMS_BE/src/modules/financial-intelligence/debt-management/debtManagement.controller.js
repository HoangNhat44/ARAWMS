import debtManagementService from './debtManagement.service.js';

/**
 * Controller: Lấy tổng quan công nợ NCC
 */
export const getSupplierDebtOverview = async (req, res, next) => {
  try {
    const data = await debtManagementService.getSupplierDebtOverview();
    return res.status(200).json({
      success: true,
      message: 'Lấy báo cáo tổng quan công nợ Nhà cung cấp thành công.',
      data,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Controller: Lấy sổ chi tiết công nợ của 1 NCC
 */
export const getSupplierDebtLedger = async (req, res, next) => {
  try {
    const { supplierId } = req.params;
    const data = await debtManagementService.getSupplierDebtLedger(supplierId);
    return res.status(200).json({
      success: true,
      message: 'Lấy sổ chi tiết công nợ Nhà cung ứng thành công.',
      data,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Controller: Lấy tổng quan công nợ & bù trừ cước hãng vận chuyển GHN
 */
export const getCarrierDebtOverview = async (req, res, next) => {
  try {
    const data = await debtManagementService.getCarrierDebtOverview();
    return res.status(200).json({
      success: true,
      message: 'Lấy báo cáo công nợ & đối soát bù trừ GHN thành công.',
      data,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Controller: Cập nhật cấu hình cước phí đối tác vận chuyển GHN
 */
export const updateCarrierConfig = async (req, res, next) => {
  try {
    const data = await debtManagementService.updateCarrierConfig(req.body);
    return res.status(200).json({
      success: true,
      message: 'Cập nhật cước phí vận chuyển thỏa thuận cho GHN thành công.',
      data,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Controller: Xác nhận nhận tiền COD từ GHN (Tất toán công nợ)
 */
export const settleCarrierCodPayment = async (req, res, next) => {
  try {
    const currentUserId = req.user?.id || req.user?._id;
    const data = await debtManagementService.settleCarrierCodPayment(req.body, currentUserId);
    return res.status(200).json({
      success: true,
      message: 'Xác nhận thu tiền COD từ Giao Hàng Nhanh và tất toán công nợ thành công.',
      data,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Controller: Xác nhận thanh toán cước phí cho GHN (Tất toán công nợ cước)
 */
export const settleCarrierShippingFeePayment = async (req, res, next) => {
  try {
    const currentUserId = req.user?.id || req.user?._id;
    const data = await debtManagementService.settleCarrierShippingFeePayment(req.body, currentUserId);
    return res.status(200).json({
      success: true,
      message: 'Xác nhận thanh toán cước phí cho Giao Hàng Nhanh và lập phiếu chi thành công.',
      data,
    });
  } catch (err) {
    next(err);
  }
};

export default {
  getSupplierDebtOverview,
  getSupplierDebtLedger,
  getCarrierDebtOverview,
  updateCarrierConfig,
  settleCarrierCodPayment,
  settleCarrierShippingFeePayment,
};

