import express from 'express';
import { login, getMe } from './auth.controller.js';
import { authenticate } from '../../../common/middlewares/authenticate.js';

const router = express.Router();

/**
 * @route POST /api/auth/login
 * @desc Đăng nhập hệ thống (hỗ trợ Admin, Seller, Owner, v.v.)
 */
router.post('/login', login);

/**
 * @route GET /api/auth/me
 * @desc Lấy thông tin người dùng hiện tại qua JWT
 */
router.get('/me', authenticate, getMe);

export default router;
