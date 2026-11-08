/**
 * ============================================================================
 * @title        : Chat Interface Validation
 * @author       : Nguyễn Quang Huy
 * @createdDate  : 2026-10-27
 * @lastModified : 2026-10-27
 * @description  : Kiểm tra tính hợp lệ của dữ liệu đầu vào cho các thao tác
 *                 gửi tin nhắn, gắn tag hội thoại trong khung chat của Seller.
 * @module       : Conversational Commerce / Chat Interface
 * @layer        : Validation
 * ============================================================================
 */

/**
 * Validation rules cho Gửi tin nhắn khách hàng (UC-74)
 * @middleware
 */

export const validateSendMessage = (req, res, next) => {
  const { messageText, attachments, referencedSkuId } = req.body;
  if (!messageText && (!attachments || attachments.length === 0) && !referencedSkuId) {
    return res.status(400).json({
      success: false,
      message: 'Tin nhắn không được để trống nội dung, tệp đính kèm hoặc sản phẩm gợi ý',
    });
  }
  next();
};

export default {
  validateSendMessage,
};
