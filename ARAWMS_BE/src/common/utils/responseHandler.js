/*
 * File: responseHandler.js
 * Author: Duy Anh
 * Date: 2026-10-21
 * Description: Formats success and error responses for API endpoints.
 */
/** Sends a successful API result with one consistent response envelope. */
export const sendSuccess = (res, message, data = {}, statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
};

/** Sends an API failure with a client-facing message and structured error details. */
export const sendError = (res, message, error = {}, statusCode = 500) => {
  return res.status(statusCode).json({
    success: false,
    message,
    error,
  });
};
