/*
 * File: finishedInspection.validation.js
 * Author: Duy Anh & Antigravity
 * Date: 2026-11-06
 * Description: Input validation rules for Garment Technician Finished Goods Inspection.
 */

export const validateFinishedGoodsPayload = (payload = {}) => {
  const errors = [];
  const total = Number(payload.totalBatchQty);
  const passed = Number(payload.passedQty);
  const failed = Number(payload.failedDefectQty);

  if (!total || total <= 0) {
    errors.push('Tổng số lượng kiểm tra phải lớn hơn 0');
  }
  if (passed < 0 || failed < 0) {
    errors.push('Số lượng đạt và số lượng lỗi không thể âm');
  }
  if (passed + failed !== total) {
    errors.push('Tổng số lượng phải bằng tổng số lượng đạt và lỗi');
  }
  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    errors.push('Vui lòng chọn ít nhất một SKU thành phẩm');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

export default {
  validateFinishedGoodsPayload,
};

