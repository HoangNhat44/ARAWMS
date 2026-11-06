/*
 * File: inboundVerification.validation.js
 * Author: Duy Anh & Antigravity
 * Date: 2026-11-06
 * Description: Input validation rules for Garment Technician Inbound Verification.
 */

export const validateVerificationPayload = (payload = {}) => {
  const errors = [];
  if (!Array.isArray(payload.verifiedItems) || payload.verifiedItems.length === 0) {
    errors.push('Danh sách vật tư nghiệm thu không được rỗng');
  }
  if (payload.isMatchedWithPlan === false && !payload.deviationSummary?.trim()) {
    errors.push('Vui lòng nêu rõ lý do hoặc mô tả sai lệch KCS');
  }
  return {
    isValid: errors.length === 0,
    errors,
  };
};

export default {
  validateVerificationPayload,
};

