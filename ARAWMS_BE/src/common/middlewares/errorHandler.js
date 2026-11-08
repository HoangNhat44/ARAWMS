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

export const errorHandler = (error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = error.statusCode || error.status || (res.statusCode !== 200 ? res.statusCode : 500);
  if (status >= 500) console.error(error);
  return sendError(
    res,
    status >= 500 ? 'Lỗi máy chủ nội bộ' : error.message,
    {
      code: error.code || (status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR'),
      details: error.details || null,
      stack: process.env.NODE_ENV === 'production' ? null : error.stack,
    },
    status
  );
};

export const globalErrorHandler = errorHandler;

export default {
  notFoundHandler,
  errorHandler,
  globalErrorHandler,
};
