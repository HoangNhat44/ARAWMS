/*
 * File: errorHandler.js
 * Description: Converts uncaught request errors into the shared API response shape.
 *              Supports both legacy errorHandler and notFoundHandler / globalErrorHandler.
 */
import { sendError } from '../utils/responseHandler.js';

export const notFoundHandler = (req, res, next) => {
  const error = new Error(`Resource không tồn tại: ${req.originalUrl}`);
  error.statusCode = 404;
  error.code = 'NOT_FOUND';
  next(error);
};

export const errorHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);

  const candidate = err.statusCode || err.status || (res.statusCode >= 400 ? res.statusCode : 500);
  const statusCode = Number.isInteger(candidate) && candidate >= 400 && candidate <= 599 ? candidate : 500;

  if (statusCode >= 500) console.error(err);

  const message = statusCode >= 500 && process.env.NODE_ENV === 'production'
    ? 'Lỗi máy chủ nội bộ'
    : err.message || 'Lỗi máy chủ nội bộ';

  const errorPayload = {
    code: err.code || (statusCode >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR'),
    details: err.details || null,
    stack: process.env.NODE_ENV === 'production' ? null : err.stack,
  };

  return res.status(statusCode).json({
    success: false,
    message,
    ...errorPayload,
    error: errorPayload,
  });
};

export const globalErrorHandler = errorHandler;

export default {
  notFoundHandler,
  errorHandler,
  globalErrorHandler,
};
