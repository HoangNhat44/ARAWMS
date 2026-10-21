export const notFoundHandler = (req, res, next) => {
  const error = new Error(`Resource không tồn tại: ${req.originalUrl}`);
  res.status(404);
  next(error);
};

export const globalErrorHandler = (err, req, res, next) => {
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  
  res.status(statusCode).json({
    success: false,
    message: err.message || 'Lỗi máy chủ nội bộ',
    stack: process.env.NODE_ENV === 'production' ? null : err.stack,
    details: err.details || null,
  });
};

export default {
  notFoundHandler,
  globalErrorHandler,
};
