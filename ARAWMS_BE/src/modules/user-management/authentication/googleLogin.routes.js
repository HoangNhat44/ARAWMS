/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Chức năng: UC-05; GBR-01 - Định tuyến Google Login thuộc User Management, tái sử dụng xác thực đã có.
 */
import { Router } from 'express';
import { asyncHandler } from '../../../common/utils/httpError.js';
import * as controller from '../../system-administration/authentication/googleAuth.controller.js';
import { googleRateLimit } from '../../system-administration/authentication/googleRateLimit.js';
import { validateGoogleCredential } from '../../system-administration/authentication/googleAuth.validation.js';
const router = Router();
// UC-05: Giữ nguyên nonce, challenge một lần, rate limit và xác minh token của luồng hiện hành.
router.get('/config', controller.config);
router.post('/challenge', googleRateLimit, asyncHandler(controller.challenge));
router.post('/login', googleRateLimit, validateGoogleCredential('LOGIN'), asyncHandler(controller.login));
export default router;
