import mongoose from 'mongoose';

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

export const validateDeviationIdParam = (req, res, next) => {
  const { id } = req.params;
  if (!id || !isValidObjectId(id)) {
    return res.status(400).json({
      success: false,
      message: 'Mã kế hoạch tiếp nhận (planId) không hợp lệ.',
      errors: ['Param ID must be a valid MongoDB ObjectId'],
    });
  }
  next();
};

export const validateResolveDeviation = (req, res, next) => {
  const { resolutionNotes, actionTaken } = req.body || {};
  const errors = [];

  if (!resolutionNotes || !String(resolutionNotes).trim()) {
    errors.push('Vui lòng nhập ghi chú mô tả phương án đã xử lý sai lệch.');
  } else if (String(resolutionNotes).trim().length < 5) {
    errors.push('Ghi chú mô tả xử lý sai lệch phải có độ dài tối thiểu 5 ký tự.');
  }

  const validActions = [
    'TERMINATE_CONTRACT',
    'AMEND_NEW_VERSION',
    'SUPPLIER_RE_DELIVERY',
    'CONTRACT_PENALTY',
    'DEBT_DEDUCTION',
    'RETURN_GOODS',
    'ACCEPT_PARTIAL',
    'OTHER',
  ];

  if (actionTaken && !validActions.includes(actionTaken)) {
    errors.push(`Phương án xử lý không hợp lệ. Cho phép: ${validActions.join(', ')}`);
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: errors[0],
      errors,
    });
  }

  next();
};

export default {
  validateDeviationIdParam,
  validateResolveDeviation,
};

