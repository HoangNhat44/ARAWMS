/*
 * File: errorHandler.js
 * Author: Duy Anh
 * Date: 2026-10-26
 * Description: Converts uncaught request errors into the shared API response shape. Hides internal error details from clients while logging server failures.
 */
import { sendError } from '../utils/responseHandler.js';

/** Sends expected request errors to the client and logs unexpected server errors.
 * Preserves an already-started response by delegating to Express instead. */
export const errorHandler = (error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = error.statusCode || error.status || 500;
  if (status >= 500) console.error(error);
  return sendError(
    res,
    status >= 500 ? 'Lỗi máy chủ' : error.message,
    { code: error.code || (status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR') },
    status
  );
};
