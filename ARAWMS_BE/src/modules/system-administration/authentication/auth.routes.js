/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 22-10-2026
 * Chức năng: UC-01, UC-02, UC-03, UC-05 - Khai báo các API xác thực và khôi
 * phục mật khẩu.
 */

import { Router } from 'express';
import authenticate from '../../../common/middlewares/authenticate.js';
import { asyncHandler } from '../../../common/utils/httpError.js';
import { validateLogin } from './auth.validation.js';
import * as controller from './auth.controller.js';
import * as googleController from './googleAuth.controller.js';
import { googleRateLimit } from './googleRateLimit.js';
import { validateGoogleCredential } from './googleAuth.validation.js';
import * as recovery from './passwordRecovery.controller.js';
import { validateForgotPassword, validateResetPassword } from './passwordRecovery.validation.js';
import { recoveryRateLimit } from './passwordRecovery.rateLimit.js';

const router = Router();
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
// UC-01: Kiểm tra dữ liệu đăng nhập trước khi gọi controller.
router.post('/login', validateLogin, asyncHandler(controller.login));
// GBR-02: Cho phép gửi email và đặt lại mật khẩu qua Quên mật khẩu.
router.post('/forgot-password', recoveryRateLimit, validateForgotPassword, asyncHandler(recovery.forgot));
router.post('/reset-password', recoveryRateLimit, validateResetPassword, asyncHandler(recovery.reset));
// UC-05: Cung cấp cấu hình công khai và các bước xác thực Google.
router.get('/google/config', googleController.config);
router.post('/google/challenge', googleRateLimit, asyncHandler(googleController.challenge));
router.post('/google/login', googleRateLimit, validateGoogleCredential('LOGIN'), asyncHandler(googleController.login));
// UC-02, UC-03: Kiểm tra phiên trước khi đăng xuất hoặc lấy hồ sơ.
router.post('/logout', authenticate, asyncHandler(controller.logout));
router.get('/me', authenticate, controller.getMe);
export default router;
