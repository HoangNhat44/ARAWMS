/**
 * Validation rules cho CRM Profile (UC-70, UC-71)
 */

const VN_PHONE_REGEX = /^0\d{9}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const validateCreateCustomer = (req, res, next) => {
  const { fullName, phone, email } = req.body;
  if (!fullName || !fullName.trim()) {
    return res.status(400).json({
      success: false,
      message: 'Họ tên khách hàng là bắt buộc',
    });
  }

  if (phone !== undefined && phone !== null && String(phone).trim() !== '') {
    const normalizedPhone = String(phone).trim();
    if (!VN_PHONE_REGEX.test(normalizedPhone)) {
      return res.status(400).json({
        success: false,
        message: 'Số điện thoại không đúng định dạng (10 chữ số bắt đầu bằng 0)',
      });
    }
  }

  if (email !== undefined && email !== null && String(email).trim() !== '') {
    const normalizedEmail = String(email).trim();
    if (!EMAIL_REGEX.test(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message: 'Email không đúng định dạng',
      });
    }
  }

  next();
};

export default {
  validateCreateCustomer,
};
