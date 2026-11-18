/*
 * File: accountantDashboard.routes.js
 * Role: ACCOUNTANT / FINANCIAL_INTELLIGENCE
 * Description: Express router for Accountant Dashboard summary & period comparisons.
 */
import express from 'express';
import accountantDashboardController from './accountantDashboard.controller.js';
import { validateDashboardQuery } from './accountantDashboard.validation.js';

const router = express.Router();

/**
 * GET /api/financial/dashboard/summary
 * Query: periodType (WEEK | MONTH | QUARTER | YEAR | CUSTOM), fromDate, toDate
 */
router.get(
  '/summary',
  validateDashboardQuery,
  accountantDashboardController.getAccountantDashboardSummary
);

export default router;

