import mongoose from 'mongoose';
import { PLAN_STATUS } from '../../../common/constants/enums.js';

const CODE_REGEX = /^[A-Z0-9_\-\/]{2,50}$/;

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

const isValidDate = (d) => {
  const date = new Date(d);
  return !Number.isNaN(date.getTime());
};

/**
 * Validate Lập Kế hoạch Lịch trình Tiếp nhận Nguyên vật liệu (Hỗ trợ 1 đợt hoặc nhiều đợt)
 */
export const validateScheduleInboundPlan = (req, res, next) => {
  const { planCode, contractId, scheduledDeliveryDate, expectedItems, physicalContractPhotos, batches } = req.body || {};
  const errors = [];

  // 1. Hợp đồng nguyên phụ liệu
  if (!contractId || !isValidObjectId(contractId)) {
    errors.push('Hợp đồng mua sắm (contractId) là bắt buộc và phải là ObjectId hợp lệ.');
  }

  // 2. Validate theo danh sách nhiều đợt (batches)
  if (Array.isArray(batches) && batches.length > 0) {
    let prevDeliveryDate = null;
    batches.forEach((b, bIdx) => {
      const batchNo = b.batchNumber || bIdx + 1;
      if (b.planCode) {
        const cleanCode = String(b.planCode).trim().toUpperCase();
        if (!CODE_REGEX.test(cleanCode)) {
          errors.push(`Đợt ${batchNo}: Mã kế hoạch "${b.planCode}" không hợp lệ (chỉ gồm chữ in hoa, số, gạch ngang, gạch chéo).`);
        }
      }

      if (!b.scheduledDeliveryDate || !isValidDate(b.scheduledDeliveryDate)) {
        errors.push(`Đợt ${batchNo}: Chưa chọn Ngày giao hàng dự kiến hợp lệ.`);
      } else {
        const currDate = new Date(b.scheduledDeliveryDate).getTime();
        if (prevDeliveryDate && currDate < prevDeliveryDate) {
          errors.push(`Đợt ${batchNo}: Ngày giao hàng dự kiến không được xảy ra trước đợt ${batchNo - 1}.`);
        }
        prevDeliveryDate = currDate;
      }

      if (!Array.isArray(b.expectedItems) || b.expectedItems.length === 0) {
        errors.push(`Đợt ${batchNo}: Phải có ít nhất 1 mặt hàng nguyên phụ liệu dự kiến.`);
      } else {
        b.expectedItems.forEach((item, itemIdx) => {
          const lineNo = itemIdx + 1;
          if (!item.rawMaterialId || !isValidObjectId(item.rawMaterialId)) {
            errors.push(`Đợt ${batchNo} - Dòng ${lineNo}: Mã nguyên vật liệu không hợp lệ.`);
          }
          const qty = Number(item.plannedQty);
          if (!Number.isFinite(qty) || qty <= 0) {
            errors.push(`Đợt ${batchNo} - Dòng ${lineNo}: Số lượng giao dự kiến phải lớn hơn 0.`);
          }
        });
      }
    });
  } else {
    // 3. Validate theo đợt đơn lẻ
    if (planCode) {
      const cleanCode = String(planCode).trim().toUpperCase();
      if (!CODE_REGEX.test(cleanCode)) {
        errors.push('Mã kế hoạch tiếp nhận chỉ được gồm chữ cái in hoa, chữ số, gạch nối và gạch chéo (VD: KH-NHAP-001 hoặc KH-NHAP-001/D1).');
      }
    }

    if (!scheduledDeliveryDate || !isValidDate(scheduledDeliveryDate)) {
      errors.push('Ngày giao hàng dự kiến về kho (scheduledDeliveryDate) là bắt buộc và phải là ngày hợp lệ.');
    }

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
  }

  // 4. Ảnh chụp hợp đồng vật lý (tùy chọn)
  if (physicalContractPhotos !== undefined && !Array.isArray(physicalContractPhotos)) {
    errors.push('Danh sách ảnh hợp đồng vật lý đính kèm (physicalContractPhotos) phải là một mảng.');
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
  const { status, scheduledDeliveryDate, physicalContractPhotos } = req.body || {};
  const errors = [];

  if (status && !PLAN_STATUS.includes(status)) {
    errors.push(`Trạng thái kế hoạch không hợp lệ. Phải thuộc: ${PLAN_STATUS.join(', ')}`);
  }

  if (scheduledDeliveryDate && !isValidDate(scheduledDeliveryDate)) {
    errors.push('Ngày giao hàng dự kiến mới không hợp lệ.');
  }

  if (physicalContractPhotos !== undefined && !Array.isArray(physicalContractPhotos)) {
    errors.push('Danh sách ảnh hợp đồng vật lý (physicalContractPhotos) phải là một mảng.');
  }

  if (errors.length > 0) {
    res.status(400);
    return next(new Error(errors.join(' ')));
  }

  return next();
};

/**
 * Validate Cập nhật & Tạo Phiên bản mới cho Kế hoạch Tiếp nhận (Amend Version)
 */
export const validateAmendInboundPlan = (req, res, next) => {
  const { id } = req.params;
  const { amendmentReason, batches, expectedItems, physicalContractPhotos } = req.body || {};
  const errors = [];

  if (!id || !isValidObjectId(id)) {
    errors.push('Mã định danh kế hoạch (id) phải là ObjectId hợp lệ.');
  }

  if (!amendmentReason || typeof amendmentReason !== 'string' || amendmentReason.trim().length < 5) {
    errors.push('Lý do điều chỉnh kế hoạch tiếp nhận (amendmentReason) là bắt buộc và phải có ít nhất 5 ký tự.');
  }

  // Validate batches or items
  if (Array.isArray(batches) && batches.length > 0) {
    let prevDeliveryDate = null;
    batches.forEach((b, bIdx) => {
      const batchNo = b.batchNumber || bIdx + 1;
      if (!b.scheduledDeliveryDate || !isValidDate(b.scheduledDeliveryDate)) {
        errors.push(`Đợt ${batchNo}: Chưa chọn Ngày giao hàng dự kiến hợp lệ.`);
      } else {
        const currDate = new Date(b.scheduledDeliveryDate).getTime();
        if (prevDeliveryDate && currDate < prevDeliveryDate) {
          errors.push(`Đợt ${batchNo}: Ngày giao hàng dự kiến không được xảy ra trước đợt ${batchNo - 1}.`);
        }
        prevDeliveryDate = currDate;
      }

      if (!Array.isArray(b.expectedItems) || b.expectedItems.length === 0) {
        errors.push(`Đợt ${batchNo}: Phải có ít nhất 1 mặt hàng nguyên phụ liệu dự kiến.`);
      } else {
        b.expectedItems.forEach((item, itemIdx) => {
          const lineNo = itemIdx + 1;
          if (!item.rawMaterialId || !isValidObjectId(item.rawMaterialId)) {
            errors.push(`Đợt ${batchNo} - Dòng ${lineNo}: Mã nguyên vật liệu không hợp lệ.`);
          }
          const qty = Number(item.plannedQty);
          if (!Number.isFinite(qty) || qty <= 0) {
            errors.push(`Đợt ${batchNo} - Dòng ${lineNo}: Số lượng giao dự kiến phải lớn hơn 0.`);
          }
        });
      }
    });
  } else if (Array.isArray(expectedItems) && expectedItems.length > 0) {
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

  if (physicalContractPhotos !== undefined && !Array.isArray(physicalContractPhotos)) {
    errors.push('Danh sách ảnh hợp đồng vật lý đính kèm (physicalContractPhotos) phải là một mảng.');
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
  validateAmendInboundPlan,
};
