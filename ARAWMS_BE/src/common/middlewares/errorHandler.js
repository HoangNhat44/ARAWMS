import { sendError } from '../utils/responseHandler.js';

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
