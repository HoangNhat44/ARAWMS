export const httpError = (statusCode, message) => Object.assign(new Error(message), { statusCode });

export const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};
