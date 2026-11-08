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
  const { customerId, items, shippingRecipient, orderType, channel } = req.body;
  const isPos = req.originalUrl?.includes('pos-direct') || req.path?.includes('pos-direct') || orderType === 'POS_DIRECT' || channel === 'POS';

  // 1. Kiểm tra danh sách sản phẩm
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Vui lòng chọn ít nhất một sản phẩm ở mục "Chọn sản phẩm" trước khi tạo đơn hàng.',
    });
  }

  for (const item of items) {
    if (!item.skuId || !item.orderedQty || Number(item.orderedQty) < 1) {
      return res.status(400).json({
        success: false,
        message: 'Số lượng đặt mua của mỗi sản phẩm phải từ 1 trở lên.',
      });
    }
  }

  // 2. Với đơn Online giao hàng: Bắt buộc thông tin người nhận nếu không có sẵn khách hàng từ Chat
  if (!isPos) {
    const phone = shippingRecipient?.phone?.trim();
    const name = shippingRecipient?.name?.trim();
    const address = shippingRecipient?.address?.trim();

    if (!phone && !customerId) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập Số điện thoại người nhận ở mục "Thông tin người nhận hàng".',
      });
    }

    const cleanPhone = String(phone || '').replace(/\D/g, '');
    const VN_PHONE_REGEX = /^(0[35789])[0-9]{8}$/;
    if (cleanPhone && cleanPhone !== '0900000000' && !VN_PHONE_REGEX.test(cleanPhone)) {
      return res.status(400).json({
        success: false,
        message: 'Số điện thoại người nhận không đúng định dạng. Vui lòng nhập đúng 10 chữ số (đầu số 03, 05, 07, 08, 09).',
      });
    }

    if (!name && !customerId) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập Họ và tên người nhận ở mục "Thông tin người nhận hàng".',
      });
    }

    if (!address) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập Địa chỉ giao hàng chi tiết ở mục "Thông tin người nhận hàng".',
      });
    }
  }

  next();
};

export default {
  validateCreateOrder,
};
