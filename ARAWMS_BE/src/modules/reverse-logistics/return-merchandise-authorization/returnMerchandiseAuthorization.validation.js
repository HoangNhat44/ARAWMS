/**
 * Validation rules cho Return Merchandise Authorization (UC-82)
 */

export const validateCreateRma = (req, res, next) => {
  const { originalOrderId, returnType, returnItems } = req.body;

  if (!originalOrderId) {
    return res.status(400).json({
      success: false,
      message: 'Thiếu trường originalOrderId (mã đơn hàng gốc)',
    });
  }

  if (!returnType || !['RETURN_FOR_REFUND', 'EXCHANGE_PRODUCT'].includes(returnType)) {
    return res.status(400).json({
      success: false,
      message: 'Loại trả hàng returnType phải là RETURN_FOR_REFUND hoặc EXCHANGE_PRODUCT',
    });
  }

  if (!Array.isArray(returnItems) || returnItems.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Danh sách sản phẩm đổi trả (returnItems) không được để trống',
    });
  }

  next();
};

export default {
  validateCreateRma,
};
