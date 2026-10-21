/**
 * Validation rules cho Quản lý Đơn hàng (Order Management)
 */

export const validateCreateOrder = (req, res, next) => {
  const { customerId, items } = req.body;

  if (!customerId) {
    return res.status(400).json({
      success: false,
      message: 'Thiếu trường customerId',
    });
  }

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Đơn hàng phải chứa ít nhất một sản phẩm hợp lệ',
    });
  }

  for (const item of items) {
    if (!item.skuId || !item.orderedQty || Number(item.orderedQty) < 1) {
      return res.status(400).json({
        success: false,
        message: 'Mỗi sản phẩm phải có skuId và số lượng đặt (orderedQty) >= 1',
      });
    }
  }

  next();
};

export default {
  validateCreateOrder,
};
