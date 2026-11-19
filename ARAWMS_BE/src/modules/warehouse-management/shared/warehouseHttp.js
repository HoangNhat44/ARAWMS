/*
 * File: warehouseHttp.js
 * Author: Duy Anh
 * Date: 2026-11-18
 * Description: Shared request/response helpers for warehouse-management controllers: business errors with
 * an HTTP status, a controller wrapper that sends the standard success envelope, and mapping of expected
 * errors (business rule, duplicate key, invalid ID, transaction conflict) to stable client responses.
 */
import { sendError, sendSuccess } from '../../../common/utils/responseHandler.js';

/** A business error the client can act on. `extra` fields are sent with the error code. */
export const requestError = (message, code, status = 400, extra) =>
  Object.assign(new Error(message), { code, status, expected: true, ...(extra ? { extra } : {}) });

const REPLY = Symbol('reply');
/** Lets a controller task choose the message or status at runtime (e.g. 201 only when something was created). */
export const reply = (data, message, status = 200) => ({ [REPLY]: true, data, message, status });

/**
 * Sends a known error and returns true; returns false for errors the global handler should log.
 * @param {object} [options]
 * @param {{message: string|function, code: string, status?: number}} [options.duplicate]  Response for MongoDB
 *   duplicate keys; `message` may be a function of the error.
 * @param {{message: string, code: string, status?: number}} [options.conflict]  Response for transaction write conflicts.
 * @param {{message: string, code: string}} [options.invalidId]  Response for malformed ObjectIds (CastError).
 * @param {{message: string, code: string}} [options.invalidData]  Response for Mongoose validation errors.
 */
export const sendKnownError = (error, res, options = {}) => {
  if (error.status) {
    sendError(res, error.message, { code: error.code, ...(error.extra || {}) }, error.status);
    return true;
  }
  if (error.code === 11000 && options.duplicate) {
    const { message, code, status } = options.duplicate;
    sendError(res, typeof message === 'function' ? message(error) : message, { code }, status || 409);
    return true;
  }
  if (options.conflict && (error.code === 112 || error.hasErrorLabel?.('TransientTransactionError'))) {
    sendError(res, options.conflict.message, { code: options.conflict.code }, options.conflict.status || 409);
    return true;
  }
  if (options.invalidId && error.name === 'CastError') {
    sendError(res, options.invalidId.message, { code: options.invalidId.code }, 400);
    return true;
  }
  if (options.invalidData && error.name === 'ValidationError') {
    sendError(res, options.invalidData.message, { code: options.invalidData.code }, 400);
    return true;
  }
  return false;
};

/**
 * Builds an Express handler that runs `task(req)` and sends `{ success, message, data }`.
 * @param {string} message  Success message.
 * @param {(req) => Promise<object>} task  Returns the response data, or reply(...) to override message/status.
 * @param {object} [options]  `status` for success (default 200) plus the sendKnownError options.
 */
export const handle = (message, task, options = {}) => async (req, res, next) => {
  try {
    const result = await task(req);
    if (result?.[REPLY]) return sendSuccess(res, result.message || message, result.data, result.status);
    return sendSuccess(res, message, result, options.status || 200);
  } catch (error) {
    if (!sendKnownError(error, res, options)) next(error);
  }
};
