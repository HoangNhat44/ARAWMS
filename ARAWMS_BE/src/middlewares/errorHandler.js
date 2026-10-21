import { sendError } from '../utils/responseHandler.js';

/**
 * Middleware bắt lỗi 404 Route Not Found
 */
export const notFoundHandler = (req, res, next) => {
  const error = new Error(`Route Không Tồn Tại: [${req.method}] ${req.originalUrl}`);
  res.status(404);
  next(error);
};

/**
 * Middleware tập trung xử lý toàn bộ lỗi (Global Error Handler)
 */
export const globalErrorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || (res.statusCode >= 400 ? res.statusCode : 500);
  if (statusCode >= 500) {
    console.error(`[Global Error] ${err.message}`, err.stack);
  }

  return sendError(
    res,
    err.message || 'Lỗi Hệ Thống Server',
    statusCode >= 500 && process.env.NODE_ENV === 'development' ? err.stack : null,
    statusCode
  );
};
