/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 22-10-2026
 * Chức năng: UC-03, UC-04 - Khai báo API hồ sơ, đổi mật khẩu và liên kết
 * Google.
 */

import { Router } from 'express';
import authenticate from '../../../common/middlewares/authenticate.js';
import { asyncHandler } from '../../../common/utils/httpError.js';
import { validateProfile, validatePassword } from './accountGovernance.validation.js';
import * as controller from './accountGovernance.controller.js';
import * as googleLinkController from './googleLink.controller.js';
import { googleRateLimit } from '../authentication/googleRateLimit.js';
import { validateGooglePassword } from './googleLink.validation.js';
import { validateGoogleCredential } from '../authentication/googleAuth.validation.js';
import * as phoneController from './phoneChange.controller.js';
import { validatePhoneRequest, validatePhoneConfirmation } from './phoneChange.validation.js';

const router = Router();
/*
 * UC-03, UC-04; GBR-01: Tất cả API hồ sơ đều cần tài khoản đang hoạt
 * động.
 */
router.use(authenticate);
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
// UC-03, UC-04: Xem hồ sơ, cập nhật thông tin và đổi mật khẩu của chính mình.
router.get('/me', controller.getOwnAccount);
router.patch('/me', validateProfile, asyncHandler(controller.updateOwnAccount));
router.patch('/me/password', validatePassword, asyncHandler(controller.changeOwnPassword));
// UC-04: Gửi mã về email đã liên kết, sau đó mới xác nhận số điện thoại mới.
router.post('/me/phone/otp', validatePhoneRequest, asyncHandler(phoneController.requestOtp));
router.post('/me/phone/confirm', validatePhoneConfirmation, asyncHandler(phoneController.confirmOtp));
// UC-04, UC-05: Xác nhận mật khẩu trước khi liên kết hoặc hủy Google.
router.post('/me/google/challenge', googleRateLimit, validateGooglePassword, asyncHandler(googleLinkController.challenge));
router.post('/me/google', googleRateLimit, validateGoogleCredential('LINK'), asyncHandler(googleLinkController.link));
router.delete('/me/google', googleRateLimit, validateGooglePassword, asyncHandler(googleLinkController.unlink));
export default router;
