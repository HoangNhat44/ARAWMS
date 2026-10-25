import { httpError } from '../../../common/utils/httpError.js';
import { isObjectBody, validCurrentPassword } from '../authentication/googleAuth.validation.js';

export const validateGooglePassword = (req, res, next) => {
  if (!isObjectBody(req.body) || Object.keys(req.body).some((key) => key !== 'currentPassword')
    || !validCurrentPassword(req.body.currentPassword)) {
    return next(httpError(400, 'Nhập mật khẩu hiện tại, tối đa 72 byte.'));
  }
  next();
};
