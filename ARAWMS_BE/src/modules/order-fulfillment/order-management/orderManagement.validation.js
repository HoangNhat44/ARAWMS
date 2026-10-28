/**
 * ============================================================================
 * @title        : Order Management Validation
 * @author       : Nguyễn Quang Huy
 * @createdDate  : 2026-10-27
 * @lastModified : 2026-10-27
 * @description  : Xác thực tính hợp lệ của dữ liệu đầu vào cho quy trình tạo đơn,
 *                 xác nhận và hủy đơn hàng của phân hệ Seller.
 * @module       : Order Fulfillment / Order Management
 * @layer        : Validation
 * ============================================================================
 */

/**
 * Validation rules cho Tạo đơn hàng (UC-78)
 * @middleware
 * @businessRule GBR-10 Đơn hàng phải chứa ít nhất 1 sản phẩm hợp lệ để giữ chỗ tồn kho
 */
export const validateCreateOrder = (req, res, next) => {
  const { customerId, items } = req.body;

  if (!customerId) {
    return res.status(400).json({
      success: false,
      message: 'Thiếu trường customerId',
    });
  }

  // [BR: GBR-10] Đơn hàng bán lẻ phải có ít nhất một sản phẩm
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
