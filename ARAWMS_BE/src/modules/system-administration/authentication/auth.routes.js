import express from 'express';
import { authenticate } from '../../../common/middlewares/authenticate.js';
import { login, me, register } from './auth.controller.js';

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.get('/me', authenticate, me);

export default router;
