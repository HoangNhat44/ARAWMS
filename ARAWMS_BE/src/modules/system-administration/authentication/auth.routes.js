import { Router } from 'express';
import authenticate from '../../../common/middlewares/authenticate.js';
import { asyncHandler } from '../../../common/utils/httpError.js';
import { validateLogin } from './auth.validation.js';
import * as controller from './auth.controller.js';
import * as googleController from './googleAuth.controller.js';
import { googleRateLimit } from './googleRateLimit.js';
import { validateGoogleCredential } from './googleAuth.validation.js';

const router = Router();
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
router.post('/login', validateLogin, asyncHandler(controller.login));
router.get('/google/config', googleController.config);
router.post('/google/challenge', googleRateLimit, asyncHandler(googleController.challenge));
router.post('/google/login', googleRateLimit, validateGoogleCredential('LOGIN'), asyncHandler(googleController.login));
router.post('/logout', authenticate, asyncHandler(controller.logout));
router.get('/me', authenticate, controller.getMe);
export default router;
