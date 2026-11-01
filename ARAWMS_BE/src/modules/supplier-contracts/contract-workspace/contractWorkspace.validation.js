import mongoose from 'mongoose';
import { CONTRACT_STATUS } from '../../../common/constants/enums.js';

const VN_PHONE_REGEX = /^(0|\+84)(3[2-9]|5[2689]|7[06-9]|8[1-9]|9[0-9])[0-9]{7}$/;
const TAX_CODE_REGEX = /^[0-9]{10}(-[0-9]{3})?$/;
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const CODE_REGEX = /^[A-Z0-9_-]{2,50}$/;

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

const isValidDate = (d) => {
  const date = new Date(d);
  return !Number.isNaN(date.getTime());
};

/**
 * Validate Tạo mới Nhà cung ứng (UC 02)
 */
export const validateCreateSupplier = (req, res, next) => {
  const {
    supplierCode,
    supplierName,
    taxCode,
    phone,
    email,
    supplyCategory,
    paymentTermDays,
    leadTimeDays,
    bankInfo,
  } = req.body || {};

  const errors = [];

  // 1. Tên nhà cung ứng
  if (!supplierName || !String(supplierName).trim()) {
    errors.push('Tên doanh nghiệp cung ứng (supplierName) là bắt buộc.');
  } else if (String(supplierName).trim().length < 3 || String(supplierName).trim().length > 200) {
    errors.push('Tên doanh nghiệp cung ứng phải từ 3 đến 200 ký tự.');
  }

  // 2. Số điện thoại liên hệ
  const cleanPhone = phone ? String(phone).replace(/\s+/g, '') : '';
  if (!cleanPhone) {
    errors.push('Số điện thoại liên hệ (phone) là bắt buộc.');
  } else if (!VN_PHONE_REGEX.test(cleanPhone)) {
    errors.push('Số điện thoại liên hệ không đúng định dạng di động Việt Nam (10 chữ số, VD: 0901234567).');
  }

  // 3. Mã nhà cung ứng (nếu có)
  if (supplierCode) {
    const cleanCode = String(supplierCode).trim().toUpperCase();
    if (!CODE_REGEX.test(cleanCode)) {
      errors.push('Mã nhà cung ứng chỉ được gồm chữ cái in hoa, chữ số và gạch ngang (VD: SUP-001).');
    }
  }

  // 4. Mã số thuế
  if (!taxCode || !String(taxCode).trim()) {
    errors.push('Mã số thuế doanh nghiệp (taxCode) là bắt buộc để lập hồ sơ ký hợp đồng.');
  } else {
    const cleanTax = String(taxCode).trim();
    if (!TAX_CODE_REGEX.test(cleanTax)) {
      errors.push('Mã số thuế doanh nghiệp phải gồm 10 chữ số hoặc 13 chữ số (VD: 0301234567 hoặc 0301234567-001).');
    }
  }

  // 5. Email (nếu có)
  if (email && String(email).trim()) {
    const cleanEmail = String(email).trim();
    if (!EMAIL_REGEX.test(cleanEmail)) {
      errors.push('Địa chỉ Email nhận hợp đồng không đúng định dạng (VD: sales@supplier.vn).');
    }
  }

  // 6. Nhóm nguyên phụ liệu cung ứng
  if (supplyCategory && !['FABRIC', 'AUXILIARY', 'BOTH'].includes(supplyCategory)) {
    errors.push('Nhóm nguyên phụ liệu cung ứng phải là FABRIC (Vải), AUXILIARY (Phụ liệu) hoặc BOTH.');
  }

  // 7. Kỳ hạn nợ & Lead time
  if (paymentTermDays !== undefined && paymentTermDays !== null && paymentTermDays !== '') {
    const term = Number(paymentTermDays);
    if (!Number.isInteger(term) || term < 0 || term > 365) {
      errors.push('Kỳ hạn công nợ mặc định phải là số nguyên từ 0 đến 365 ngày.');
    }
  }

  if (leadTimeDays !== undefined && leadTimeDays !== null && leadTimeDays !== '') {
    const lead = Number(leadTimeDays);
    if (!Number.isInteger(lead) || lead < 1 || lead > 180) {
      errors.push('Thời gian giao hàng tiêu chuẩn (lead time) phải từ 1 đến 180 ngày.');
    }
  }

  // 8. Tài khoản ngân hàng
  if (bankInfo?.accountNo && String(bankInfo.accountNo).trim()) {
    const accNo = String(bankInfo.accountNo).trim();
    if (accNo.length < 6 || accNo.length > 30 || !/^[A-Za-z0-9-]+$/.test(accNo)) {
      errors.push('Số tài khoản ngân hàng phải từ 6 đến 30 ký tự số/chữ hợp lệ.');
    }
  }

  if (errors.length > 0) {
    res.status(400);
    return next(new Error(errors.join(' ')));
  }

  return next();
};

/**
 * Validate Cập nhật Nhà cung ứng (UC 03)
 */
export const validateUpdateSupplier = (req, res, next) => {
  const { id } = req.params;
  if (!id || !isValidObjectId(id)) {
    res.status(400);
    return next(new Error('ID nhà cung ứng cần cập nhật không hợp lệ (Mongo ObjectId).'));
  }
  return validateCreateSupplier(req, res, next);
};

/**
 * Validate Soạn thảo / Cập nhật Khung Hợp đồng (UC 04)
 */
export const validateDraftContract = (req, res, next) => {
  const {
    contractCode,
    contractTitle,
    contractType,
    supplierId,
    signingDate,
    effectiveFrom,
    effectiveTo,
    contractedMaterials,
    commercialTerms,
    qualityStandards,
    latePenaltyPercentPerDay,
    maxPenaltyPercent,
    breachPenaltyClause,
  } = req.body || {};

  const errors = [];

  // 1. Số hợp đồng
  if (!contractCode || !String(contractCode).trim()) {
    errors.push('Số hợp đồng kinh tế (contractCode) là bắt buộc.');
  } else {
    const cleanCode = String(contractCode).trim().toUpperCase();
    if (!CODE_REGEX.test(cleanCode)) {
      errors.push('Số hợp đồng chỉ được gồm chữ cái in hoa, chữ số và gạch nối (VD: HDK-2026-001).');
    }
  }

  // 2. Tiêu đề hợp đồng
  if (contractTitle && String(contractTitle).trim().length < 5) {
    errors.push('Tiêu đề hợp đồng phải có ít nhất 5 ký tự.');
  }

  // 3. Loại hợp đồng
  if (
    contractType &&
    !['FRAMEWORK_AGREEMENT', 'BATCH_LUMP_SUM', 'FIXED_UNIT_PRICE'].includes(contractType)
  ) {
    errors.push('Loại hình hợp đồng không hợp lệ (FRAMEWORK_AGREEMENT, BATCH_LUMP_SUM, FIXED_UNIT_PRICE).');
  }

  // 4. Nhà cung ứng (Bên B)
  if (!supplierId || !isValidObjectId(supplierId)) {
    errors.push('Nhà cung ứng (Bên B) là bắt buộc và phải là ObjectId hợp lệ.');
  }

  // 5. Hiệu lực hợp đồng
  if (signingDate && !isValidDate(signingDate)) {
    errors.push('Ngày ký hợp đồng không hợp lệ.');
  }
  if (effectiveFrom && !isValidDate(effectiveFrom)) {
    errors.push('Ngày bắt đầu hiệu lực hợp đồng không hợp lệ.');
  }
  if (effectiveTo && !isValidDate(effectiveTo)) {
    errors.push('Ngày hết hạn hiệu lực hợp đồng không hợp lệ.');
  }
  if (effectiveFrom && effectiveTo && isValidDate(effectiveFrom) && isValidDate(effectiveTo)) {
    if (new Date(effectiveTo).getTime() < new Date(effectiveFrom).getTime()) {
      errors.push('Ngày hết hạn hiệu lực hợp đồng (effectiveTo) không được trước ngày bắt đầu (effectiveFrom).');
    }
  }

  // 6. Danh mục nguyên phụ liệu
  if (!Array.isArray(contractedMaterials) || contractedMaterials.length === 0) {
    errors.push('Hợp đồng phải có ít nhất 1 dòng nguyên phụ liệu cam kết cung ứng.');
  } else {
    contractedMaterials.forEach((item, index) => {
      const lineNo = index + 1;
      if (!item.rawMaterialId || !isValidObjectId(item.rawMaterialId)) {
        errors.push(`Dòng ${lineNo}: Chưa chọn mã nguyên vật liệu hợp lệ.`);
      }

      const qty = Number(item.contractedQty);
      if (!Number.isFinite(qty) || qty <= 0) {
        errors.push(`Dòng ${lineNo}: Số lượng ký hợp đồng phải là số lớn hơn 0.`);
      }

      const price = Number(item.unitPrice);
      if (!Number.isFinite(price) || price < 0) {
        errors.push(`Dòng ${lineNo}: Đơn giá nguyên phụ liệu không được âm.`);
      }

      if (item.vatRatePct !== undefined && item.vatRatePct !== null) {
        const vat = Number(item.vatRatePct);
        if (![0, 5, 8, 10].includes(vat)) {
          errors.push(`Dòng ${lineNo}: Thuế suất VAT chỉ chấp nhận 0%, 5%, 8% hoặc 10%.`);
        }
      }

      if (item.widthCm !== undefined && item.widthCm !== null) {
        const w = Number(item.widthCm);
        if (Number.isFinite(w) && (w <= 0 || w > 400)) {
          errors.push(`Dòng ${lineNo}: Khổ vải hữu dụng phải từ 10 đến 400 cm.`);
        }
      }

      if (item.gsm !== undefined && item.gsm !== null) {
        const g = Number(item.gsm);
        if (Number.isFinite(g) && (g <= 0 || g > 1200)) {
          errors.push(`Dòng ${lineNo}: Định lượng vải (GSM) phải từ 10 đến 1200 g/m².`);
        }
      }

      if (item.shrinkageTolerancePct !== undefined && item.shrinkageTolerancePct !== null) {
        const s = Number(item.shrinkageTolerancePct);
        if (!Number.isFinite(s) || s < 0 || s > 25) {
          errors.push(`Dòng ${lineNo}: Độ co rút cho phép phải từ 0% đến 25%.`);
        }
      }

      if (item.qtyTolerancePct !== undefined && item.qtyTolerancePct !== null) {
        const t = Number(item.qtyTolerancePct);
        if (!Number.isFinite(t) || t < 0 || t > 25) {
          errors.push(`Dòng ${lineNo}: Dung sai số lượng giao hàng phải từ 0% đến 25%.`);
        }
      }

      if (item.moq !== undefined && item.moq !== null) {
        const m = Number(item.moq);
        if (!Number.isFinite(m) || m < 1) {
          errors.push(`Dòng ${lineNo}: Số lượng đặt tối thiểu (MOQ) phải từ 1 trở lên.`);
        }
      }
    });
  }

  // 7. Điều khoản thương mại
  if (commercialTerms?.depositPercent !== undefined && commercialTerms?.depositPercent !== null) {
    const dep = Number(commercialTerms.depositPercent);
    if (!Number.isFinite(dep) || dep < 0 || dep > 100) {
      errors.push('Tỷ lệ tạm ứng đặt cọc phải từ 0% đến 100%.');
    }
  }

  if (commercialTerms?.paymentCreditDays !== undefined && commercialTerms?.paymentCreditDays !== null) {
    const days = Number(commercialTerms.paymentCreditDays);
    if (!Number.isInteger(days) || days < 0 || days > 365) {
      errors.push('Thời hạn công nợ thanh toán phải từ 0 đến 365 ngày.');
    }
  }

  if (
    commercialTerms?.paymentMethod &&
    !['BANK_TRANSFER', 'CASH', 'LETTER_OF_CREDIT'].includes(commercialTerms.paymentMethod)
  ) {
    errors.push('Phương thức thanh toán phải là BANK_TRANSFER, CASH hoặc LETTER_OF_CREDIT.');
  }

  if (
    commercialTerms?.deliveryTerm &&
    !['GIAO_TAI_KHO_BEN_A', 'GIAO_TAI_XUONG_MAY', 'NHAN_TAI_KHO_NCC'].includes(commercialTerms.deliveryTerm)
  ) {
    errors.push('Điều kiện giao hàng không hợp lệ (GIAO_TAI_KHO_BEN_A, GIAO_TAI_XUONG_MAY, NHAN_TAI_KHO_NCC).');
  }

  // 8. Chế tài phạt vi phạm
  if (latePenaltyPercentPerDay !== undefined && latePenaltyPercentPerDay !== null) {
    const pen = Number(latePenaltyPercentPerDay);
    if (!Number.isFinite(pen) || pen < 0 || pen > 5) {
      errors.push('Mức phạt chậm giao hàng mỗi ngày phải từ 0% đến 5%/ngày.');
    }
  }

  if (maxPenaltyPercent !== undefined && maxPenaltyPercent !== null) {
    const maxPen = Number(maxPenaltyPercent);
    if (!Number.isFinite(maxPen) || maxPen < 0 || maxPen > 50) {
      errors.push('Trần mức phạt tối đa phải từ 0% đến 50% giá trị hợp đồng.');
    }
  }

  if (!breachPenaltyClause || !String(breachPenaltyClause).trim()) {
    errors.push('Điều khoản phạt vi phạm tiến độ và chất lượng nguyên phụ liệu là bắt buộc.');
  }

  if (errors.length > 0) {
    res.status(400);
    return next(new Error(errors.join(' ')));
  }

  return next();
};

/**
 * Validate Params :id của Hợp đồng
 */
export const validateContractIdParam = (req, res, next) => {
  const { id } = req.params;
  if (!id || !isValidObjectId(id)) {
    res.status(400);
    return next(new Error('ID hợp đồng không hợp lệ (Mongo ObjectId).'));
  }
  return next();
};

/**
 * Validate Cập nhật trạng thái Hợp đồng
 */
export const validateContractStatusUpdate = (req, res, next) => {
  const { status } = req.body || {};
  if (!status || !CONTRACT_STATUS.includes(status)) {
    res.status(400);
    return next(new Error(`Trạng thái hợp đồng không hợp lệ. Phải thuộc: ${CONTRACT_STATUS.join(', ')}`));
  }
  return next();
};

export default {
  validateCreateSupplier,
  validateUpdateSupplier,
  validateDraftContract,
  validateContractIdParam,
  validateContractStatusUpdate,
};
