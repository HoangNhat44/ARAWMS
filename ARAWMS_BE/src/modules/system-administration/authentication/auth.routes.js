import { Router } from 'express';
import authenticate from '../../../common/middlewares/authenticate.js';
import { asyncHandler } from '../../../common/utils/httpError.js';
import { validateLogin } from './auth.validation.js';
import * as controller from './auth.controller.js';

const router = Router();
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
router.post('/login', validateLogin, asyncHandler(controller.login));
router.post('/logout', authenticate, asyncHandler(controller.logout));
router.get('/me', authenticate, controller.getMe);
export default router;
