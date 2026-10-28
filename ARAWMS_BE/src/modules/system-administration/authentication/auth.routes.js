/*
 * File: auth.routes.js
 * Author: Duy Anh
 * Date: 2026-10-26
 * Description: Maps registration, login, and current-user endpoints. Applies authentication to requests for the current user.
 */
import express from 'express';
import { authenticate } from '../../../common/middlewares/authenticate.js';
import { login, me, register } from './auth.controller.js';

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.get('/me', authenticate, me);

export default router;
