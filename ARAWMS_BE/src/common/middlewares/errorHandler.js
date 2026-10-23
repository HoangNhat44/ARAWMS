export const notFoundHandler = (req, res, next) => {
  const error = new Error(`Resource không tồn tại: ${req.originalUrl}`);
  res.status(404);
  next(error);
};

export const globalErrorHandler = (err, req, res, next) => {
  const candidate = err.statusCode || err.status || (res.statusCode >= 400 ? res.statusCode : 500);
  const statusCode = Number.isInteger(candidate) && candidate >= 400 && candidate <= 599 ? candidate : 500;
  
  res.status(statusCode).json({
    success: false,
    message: statusCode >= 500 && process.env.NODE_ENV === 'production'
      ? 'Lỗi máy chủ nội bộ' : err.message || 'Lỗi máy chủ nội bộ',
    stack: process.env.NODE_ENV === 'production' ? null : err.stack,
    details: err.details || null,
  });
};

export default {
  notFoundHandler,
  globalErrorHandler,
};
