import { Router } from 'express';
import authenticate from '../../../common/middlewares/authenticate.js';
import { asyncHandler } from '../../../common/utils/httpError.js';
import { validateProfile, validatePassword } from './accountGovernance.validation.js';
import * as controller from './accountGovernance.controller.js';

const router = Router();
router.use(authenticate);
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
router.get('/me', controller.getOwnAccount);
router.patch('/me', validateProfile, asyncHandler(controller.updateOwnAccount));
router.patch('/me/password', validatePassword, asyncHandler(controller.changeOwnPassword));
export default router;
