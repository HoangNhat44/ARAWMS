/*
 * File: accountantDashboard.validation.js
 * Role: ACCOUNTANT / FINANCIAL_INTELLIGENCE
 * Description: Validate query parameters for the Accountant Dashboard aggregation API.
 */

const ALLOWED_PERIOD_TYPES = ['WEEK', 'MONTH', 'QUARTER', 'YEAR', 'CUSTOM'];

export const validateDashboardQuery = (req, res, next) => {
  const { periodType = 'MONTH', fromDate, toDate } = req.query;
  const normalizedPeriod = String(periodType).trim().toUpperCase();

  if (!ALLOWED_PERIOD_TYPES.includes(normalizedPeriod)) {
    return res.status(400).json({
      success: false,
      message: `periodType không hợp lệ. Chỉ chấp nhận: ${ALLOWED_PERIOD_TYPES.join(', ')}.`,
    });
  }

  if (normalizedPeriod === 'CUSTOM') {
    if (!fromDate || !toDate) {
      return res.status(400).json({
        success: false,
        message: 'Khi chọn kỳ tùy chỉnh (CUSTOM), vui lòng cung cấp đầy đủ fromDate và toDate.',
      });
    }

    const start = new Date(fromDate);
    const end = new Date(toDate);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Định dạng fromDate hoặc toDate không hợp lệ.',
      });
    }

    if (start > end) {
      return res.status(400).json({
        success: false,
        message: 'Ngày bắt đầu (fromDate) không được lớn hơn ngày kết thúc (toDate).',
      });
    }

    const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    if (diffDays > 366) {
      return res.status(400).json({
        success: false,
        message: 'Khoảng thời gian tùy chỉnh không được vượt quá 366 ngày.',
      });
    }
  }

  req.validatedQuery = {
    periodType: normalizedPeriod,
    fromDate: fromDate ? String(fromDate).trim() : null,
    toDate: toDate ? String(toDate).trim() : null,
  };

  return next();
};

export default {
  validateDashboardQuery,
};

