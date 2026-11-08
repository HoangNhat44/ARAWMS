/**
 * Validation rules cho Customer Exchange Processing (UC-83)
 */

export const validateCreateExchangeOrder = (req, res, next) => {
  const { newItems } = req.body;

  if (!Array.isArray(newItems) || newItems.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Danh sách sản phẩm đổi mới (newItems) không được để trống',
    });
  }

  next();
};

export default {
  validateCreateExchangeOrder,
};
