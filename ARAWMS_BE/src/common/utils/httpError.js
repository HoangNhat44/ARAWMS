/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 22-10-2026
 * Chức năng: Hỗ trợ API tài khoản - Tạo lỗi HTTP và chuyển lỗi xử lý bất
 * đồng bộ.
 */

export const httpError = (statusCode, message) => Object.assign(new Error(message), { statusCode });

export const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};
