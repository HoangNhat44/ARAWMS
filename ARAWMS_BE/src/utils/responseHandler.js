/**
 * Chuẩn hóa phản hồi API thành công
 */
export const sendSuccess = (res, message = 'Thành công', data = null, statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
};

/**
 * Chuẩn hóa phản hồi API lỗi
 */
export const sendError = (res, message = 'Có lỗi xảy ra', errors = null, statusCode = 400) => {
  return res.status(statusCode).json({
    success: false,
    message,
    errors,
  });
};
