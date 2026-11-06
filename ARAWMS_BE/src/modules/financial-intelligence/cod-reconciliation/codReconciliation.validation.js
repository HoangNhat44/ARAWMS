/**
 * codReconciliation.validation.js
 * Validation đầu vào cho module Đối soát COD tự động
 */

export const validateSyncCodRequest = (req, res, next) => {
  const { carrierCode, orderIds } = req.body;

  if (carrierCode && typeof carrierCode !== 'string') {
    return res.status(400).json({
      success: false,
      message: 'Mã hãng vận chuyển carrierCode phải là chuỗi ký tự hợp lệ (VD: GHN).',
    });
  }

  if (orderIds && !Array.isArray(orderIds)) {
    return res.status(400).json({
      success: false,
      message: 'Danh sách orderIds chỉ định phải là một mảng ID hợp lệ.',
    });
  }

  next();
};

export const validateResolveDisputeRequest = (req, res, next) => {
  const { redFlagStatus, investigationNote, resolvedFaultParty } = req.body;

  const validStatuses = ['NONE', 'PENDING_INVESTIGATION', 'ESCALATED_TO_DISPUTE', 'CARRIER_FEEDBACK_RECEIVED', 'RESOLVED_ADJUSTED'];
  if (redFlagStatus && !validStatuses.includes(redFlagStatus)) {
    return res.status(400).json({
      success: false,
      message: `Trạng thái xử lý tranh chấp không hợp lệ. Cho phép: ${validStatuses.join(', ')}`,
    });
  }

  if (redFlagStatus === 'ESCALATED_TO_DISPUTE' && (!investigationNote || !investigationNote.trim())) {
    return res.status(400).json({
      success: false,
      message: 'Vui lòng nhập lý do/nội dung khiếu nại hãng vận chuyển (investigationNote).',
    });
  }

  if (redFlagStatus === 'RESOLVED_ADJUSTED') {
    if (!resolvedFaultParty || !['ARA_STORE', 'CARRIER_GHN'].includes(resolvedFaultParty)) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng chọn nguồn gốc sai lệch: "ARA_STORE" (Lệch do ARA Store) hoặc "CARRIER_GHN" (Lệch do GHN).',
      });
    }

    if (!investigationNote || !investigationNote.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập lý do / phương án xử lý chi tiết (investigationNote).',
      });
    }
  }

  next();
};

export const validateSimulateFeedbackRequest = (req, res, next) => {
  const { scenario } = req.body;
  if (scenario && !['CARRIER_FAULT', 'SHOP_FAULT', 'CUSTOM'].includes(scenario)) {
    return res.status(400).json({
      success: false,
      message: 'Kịch bản phản hồi mô phỏng không hợp lệ. Cho phép: CARRIER_FAULT, SHOP_FAULT, CUSTOM.',
    });
  }
  next();
};

