import mongoose from 'mongoose';
import { PLAN_STATUS } from '../../../common/constants/enums.js';

const CODE_REGEX = /^[A-Z0-9_-]{2,50}$/;

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

const isValidDate = (d) => {
  const date = new Date(d);
  return !Number.isNaN(date.getTime());
};

/**
 * Validate Lập Kế hoạch Lịch trình Tiếp nhận Nguyên vật liệu (UC 05)
 */
export const validateScheduleInboundPlan = (req, res, next) => {
  const { planCode, contractId, scheduledDeliveryDate, expectedItems } = req.body || {};
  const errors = [];

  // 1. Mã kế hoạch tiếp nhận
  if (planCode) {
    const cleanCode = String(planCode).trim().toUpperCase();
    if (!CODE_REGEX.test(cleanCode)) {
      errors.push('Mã kế hoạch tiếp nhận chỉ được gồm chữ cái in hoa, chữ số và gạch nối (VD: KH-NHAP-001).');
    }
  }

  // 2. Hợp đồng nguyên phụ liệu
  if (!contractId || !isValidObjectId(contractId)) {
    errors.push('Hợp đồng mua sắm (contractId) là bắt buộc và phải là ObjectId hợp lệ.');
  }

  // 3. Ngày giao hàng dự kiến
  if (!scheduledDeliveryDate || !isValidDate(scheduledDeliveryDate)) {
    errors.push('Ngày giao hàng dự kiến về kho (scheduledDeliveryDate) là bắt buộc và phải là ngày hợp lệ.');
  }

  // 4. Danh mục nguyên phụ liệu dự kiến
  if (!Array.isArray(expectedItems) || expectedItems.length === 0) {
    errors.push('Kế hoạch nhập phải có ít nhất 1 mặt hàng nguyên phụ liệu dự kiến tiếp nhận.');
  } else {
    expectedItems.forEach((item, index) => {
      const lineNo = index + 1;
      if (!item.rawMaterialId || !isValidObjectId(item.rawMaterialId)) {
        errors.push(`Dòng ${lineNo}: Chưa chọn mã nguyên vật liệu hợp lệ.`);
      }

      const qty = Number(item.plannedQty);
      if (!Number.isFinite(qty) || qty <= 0) {
        errors.push(`Dòng ${lineNo}: Số lượng giao dự kiến đợt này phải lớn hơn 0.`);
      }
    });
  }

  if (errors.length > 0) {
    res.status(400);
    return next(new Error(errors.join(' ')));
  }

  return next();
};

/**
 * Validate Param :id của Kế hoạch
 */
export const validatePlanIdParam = (req, res, next) => {
  const { id } = req.params;
  if (!id || !isValidObjectId(id)) {
    res.status(400);
    return next(new Error('ID kế hoạch tiếp nhận không hợp lệ (Mongo ObjectId).'));
  }
  return next();
};

/**
 * Validate Cập nhật trạng thái Kế hoạch
 */
export const validatePlanStatusUpdate = (req, res, next) => {
  const { status, scheduledDeliveryDate } = req.body || {};
  const errors = [];

  if (status && !PLAN_STATUS.includes(status)) {
    errors.push(`Trạng thái kế hoạch không hợp lệ. Phải thuộc: ${PLAN_STATUS.join(', ')}`);
  }

  if (scheduledDeliveryDate && !isValidDate(scheduledDeliveryDate)) {
    errors.push('Ngày giao hàng dự kiến mới không hợp lệ.');
  }

  if (errors.length > 0) {
    res.status(400);
    return next(new Error(errors.join(' ')));
  }

  return next();
};

export default {
  validateScheduleInboundPlan,
  validatePlanIdParam,
  validatePlanStatusUpdate,
};
