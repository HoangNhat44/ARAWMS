/*
 * File: auth.controller.js
 * Author: Duy Anh
 * Date: 2026-10-26
 * Description: Handles registration, login, and current-user HTTP requests. Delegates account rules to the authentication service and returns the shared API response format.
 */
import { sendSuccess } from '../../../common/utils/responseHandler.js';
import { loginUser, publicUser, registerUser } from './auth.service.js';

/**
 * Registers a seller using the request body and returns its public profile and token.
 * Validation and duplicate-email errors are passed to the shared error handler.
 *
 * @param {import('express').Request} req - Request containing registration fields.
 * @param {import('express').Response} res - Response receiving the 201 result.
 * @param {import('express').NextFunction} next - Error handler callback.
 */
export const register = async (req, res, next) => {
  try {
    return sendSuccess(res, 'Đăng ký thành công', await registerUser(req.body), 201);
  } catch (error) { next(error); }
};

/**
 * Authenticates submitted credentials and returns a public profile and token.
 * Invalid credentials are reported by the service as 401 through the error handler.
 *
 * @param {import('express').Request} req - Request containing usernameOrEmail and password.
 * @param {import('express').Response} res - Response receiving the login result.
 * @param {import('express').NextFunction} next - Error handler callback.
 */
export const login = async (req, res, next) => {
  try {
    return sendSuccess(res, 'Đăng nhập thành công', await loginUser(req.body));
  } catch (error) { next(error); }
};

/**
 * Returns the account selected by authentication middleware as public fields only.
 *
 * @param {import('express').Request} req - Request with the authenticated user attached.
 * @param {import('express').Response} res - Response receiving the public account profile.
 */
export const me = (req, res) => sendSuccess(res, 'Thông tin tài khoản', { user: publicUser(req.user) });
