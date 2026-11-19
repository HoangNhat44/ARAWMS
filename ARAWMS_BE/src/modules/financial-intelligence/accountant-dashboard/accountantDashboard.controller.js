/*
 * File: accountantDashboard.controller.js
 * Role: ACCOUNTANT / FINANCIAL_INTELLIGENCE
 * Description: HTTP controller for Accountant Dashboard overview and period comparison charts.
 */
import accountantDashboardService from './accountantDashboard.service.js';

export const getAccountantDashboardSummary = async (req, res, next) => {
  try {
    const queryParams = req.validatedQuery || req.query;
    const data = await accountantDashboardService.getDashboardSummary(queryParams);
    return res.status(200).json({
      success: true,
      message: 'Lấy dữ liệu tổng quan Dashboard Kế toán thành công.',
      data,
    });
  } catch (err) {
    return next(err);
  }
};

export default {
  getAccountantDashboardSummary,
};

