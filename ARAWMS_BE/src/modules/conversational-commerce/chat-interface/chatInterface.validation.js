/**
 * Validation rules cho Chat Interface (UC-74)
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
