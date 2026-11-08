import mongoose from 'mongoose';

/**
 * Validate MongoDB ObjectId param
 */
export const validateSupplierIdParam = (req, res, next) => {
  const { supplierId } = req.params;
  if (!supplierId || !mongoose.Types.ObjectId.isValid(supplierId)) {
    return res.status(400).json({
      success: false,
      message: 'Mã định danh Nhà cung ứng (supplierId) không hợp lệ.',
    });
  }
  next();
};

/**
 * Validate cấu hình cước phí vận chuyển
 */
export const validateUpdateCarrierConfigRequest = (req, res, next) => {
  const { baseShippingFee } = req.body;
  if (
    baseShippingFee === undefined ||
    isNaN(Number(baseShippingFee)) ||
    Number(baseShippingFee) < 0
  ) {
    return res.status(400).json({
      success: false,
      message: 'Mức cước phí thỏa thuận baseShippingFee phải là một số không âm (VD: 19000).',
    });
  }
  next();
};

/**
 * Validate yêu cầu xác nhận nhận tiền COD từ GHN
 */
export const validateSettleCarrierCodPaymentRequest = (req, res, next) => {
  const { amount, transactionReference, paymentMethod } = req.body;

  if (amount === undefined || isNaN(Number(amount)) || Number(amount) <= 0) {
    return res.status(400).json({
      success: false,
      message: 'Số tiền thanh toán amount phải là một số lớn hơn 0.',
    });
  }

  if (!transactionReference || typeof transactionReference !== 'string' || !transactionReference.trim()) {
    return res.status(400).json({
      success: false,
      message: 'Vui lòng nhập mã tham chiếu giao dịch ngân hàng / số chứng từ (transactionReference).',
    });
  }

  if (paymentMethod && !['BANK_TRANSFER', 'CASH', 'COD_BALANCE_OFFSET'].includes(paymentMethod)) {
    return res.status(400).json({
      success: false,
      message: 'Phương thức thanh toán paymentMethod không hợp lệ.',
    });
  }

  next();
};

/**
 * Validate yêu cầu xác nhận thanh toán cước phí cho GHN
 */
export const validateSettleCarrierShippingFeeRequest = (req, res, next) => {
  const { amount, transactionReference, paymentMethod } = req.body;

  if (amount === undefined || isNaN(Number(amount)) || Number(amount) <= 0) {
    return res.status(400).json({
      success: false,
      message: 'Số tiền thanh toán cước phí amount phải là một số lớn hơn 0.',
    });
  }

  if (!transactionReference || typeof transactionReference !== 'string' || !transactionReference.trim()) {
    return res.status(400).json({
      success: false,
      message: 'Vui lòng nhập mã tham chiếu giao dịch ngân hàng / số chứng từ thanh toán cước (transactionReference).',
    });
  }

  if (paymentMethod && !['BANK_TRANSFER', 'CASH'].includes(paymentMethod)) {
    return res.status(400).json({
      success: false,
      message: 'Phương thức thanh toán cước phí paymentMethod không hợp lệ.',
    });
  }

  next();
};

export default {
  validateSupplierIdParam,
  validateUpdateCarrierConfigRequest,
  validateSettleCarrierCodPaymentRequest,
  validateSettleCarrierShippingFeeRequest,
};

