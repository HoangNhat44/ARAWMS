/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 22-10-2026
 * Chức năng: UC-04 - Kiểm tra mật khẩu xác nhận khi liên kết hoặc hủy
 * Google.
 */

import { httpError } from '../../../common/utils/httpError.js';
import { isObjectBody, validCurrentPassword } from '../authentication/googleAuth.validation.js';

/*
 * UC-04: Chỉ nhận mật khẩu xác nhận dạng chuỗi, không trống và không quá 72
 * byte.
 */
export const validateGooglePassword = (req, res, next) => {
  if (!isObjectBody(req.body) || Object.keys(req.body).some((key) => key !== 'currentPassword')
    || !validCurrentPassword(req.body.currentPassword)) {
    return next(httpError(400, 'Nhập mật khẩu hiện tại, tối đa 72 byte.'));
  }
  next();
};
