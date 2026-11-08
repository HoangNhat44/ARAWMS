/**
 * Validation rules cho CRM Profile (UC-70, UC-71)
 */

export const validateCreateCustomer = (req, res, next) => {
  const { fullName } = req.body;
  if (!fullName || !fullName.trim()) {
    return res.status(400).json({
      success: false,
      message: 'Họ tên khách hàng là bắt buộc',
    });
  }
  next();
};

export default {
  validateCreateCustomer,
};
