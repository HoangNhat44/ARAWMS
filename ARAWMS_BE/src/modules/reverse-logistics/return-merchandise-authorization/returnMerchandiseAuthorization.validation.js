/**
 * Validation rules cho Return Merchandise Authorization (UC-82)
 */
import mongoose from 'mongoose';
import { RMA_ELIGIBLE_ORDER_STATUSES } from './returnMerchandiseAuthorization.rules.js';

const fail = (res, message, hint) =>
  res.status(400).json({
    success: false,
    message: hint ? `${message} Hướng dẫn: ${hint}` : message,
    hint: hint || null,
  });

export const validateCreateRma = (req, res, next) => {
  const { originalOrderId, returnType, returnItems } = req.body;

  if (!originalOrderId) {
    return fail(res, 'Chưa chọn đơn hàng gốc cần đổi/trả.', 'Chọn một đơn hàng trong danh sách rồi bấm tạo phiếu Đổi/Trả.');
  }

  if (!mongoose.isValidObjectId(originalOrderId)) {
    return fail(
      res,
      `Đơn hàng gốc "${originalOrderId}" không hợp lệ (cần ID nội bộ, không phải mã hiển thị).`,
      'Mở phiếu Đổi/Trả từ nút "Đổi/Trả" ngay trên dòng đơn hàng, hoặc chọn đơn trong ô tìm kiếm của popup.'
    );
  }

  if (!returnType || !['RETURN_FOR_REFUND', 'EXCHANGE_PRODUCT'].includes(returnType)) {
    return fail(res, 'Chưa chọn hình thức xử lý hợp lệ.', 'Chọn "Trả hàng hoàn tiền" hoặc "Đổi sản phẩm khác".');
  }

  if (!Array.isArray(returnItems) || returnItems.length === 0) {
    return fail(res, 'Chưa chọn sản phẩm nào để đổi/trả.', 'Tick chọn ít nhất 1 sản phẩm và nhập số lượng muốn trả.');
  }

  // Chuẩn hóa skuId: client có thể gửi nguyên object đã populate ({ _id, skuCode... })
  req.body.returnItems = returnItems.map((it) => ({
    ...it,
    skuId: String(it?.skuId?._id ?? it?.skuId ?? ''),
  }));

  const badItem = req.body.returnItems.find((it) => !mongoose.isValidObjectId(it?.skuId));
  if (badItem) {
    return fail(
      res,
      'Có sản phẩm trong phiếu thiếu hoặc sai mã SKU nội bộ.',
      `Tải lại danh sách đơn hàng (F5) rồi chọn lại sản phẩm. Điều kiện đổi/trả: đơn phải ở trạng thái ${RMA_ELIGIBLE_ORDER_STATUSES.join(', ')}.`
    );
  }

  next();
};

export default {
  validateCreateRma,
};
