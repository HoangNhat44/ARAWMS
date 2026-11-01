/**
 * FRONTEND VALIDATION RULES FOR ACCOUNTANT PROCUREMENT WORKSPACE
 */

export const VN_PHONE_REGEX = /^(0|\+84)(3[2-9]|5[2689]|7[06-9]|8[1-9]|9[0-9])[0-9]{7}$/;
export const TAX_CODE_REGEX = /^[0-9]{10}(-[0-9]{3})?$/;
export const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
export const CODE_REGEX = /^[A-Z0-9_-]{2,50}$/;

export const validateSupplierForm = (formData) => {
  const errors = {};

  // 1. Tên nhà cung ứng
  if (!formData.supplierName || !formData.supplierName.trim()) {
    errors.supplierName = 'Vui lòng nhập Tên pháp nhân doanh nghiệp cung ứng.';
  } else if (formData.supplierName.trim().length < 3) {
    errors.supplierName = 'Tên doanh nghiệp phải có ít nhất 3 ký tự.';
  } else if (formData.supplierName.trim().length > 200) {
    errors.supplierName = 'Tên doanh nghiệp không được vượt quá 200 ký tự.';
  }

  // 2. Mã số thuế
  if (!formData.taxCode || !formData.taxCode.trim()) {
    errors.taxCode = 'Vui lòng nhập Mã số thuế doanh nghiệp (10 hoặc 13 số).';
  } else if (!TAX_CODE_REGEX.test(formData.taxCode.trim())) {
    errors.taxCode = 'MST không hợp lệ. Phải gồm 10 chữ số hoặc 13 số (VD: 0301234567 hoặc 0301234567-001).';
  }

  // 3. Số điện thoại liên hệ
  const cleanPhone = (formData.phone || '').replace(/\s+/g, '');
  if (!cleanPhone) {
    errors.phone = 'Vui lòng nhập Số điện thoại liên hệ.';
  } else if (!VN_PHONE_REGEX.test(cleanPhone)) {
    errors.phone = 'SĐT không đúng định dạng di động Việt Nam (10 số, VD: 0901234567).';
  }

  // 4. Mã nhà cung ứng
  if (formData.supplierCode && formData.supplierCode.trim()) {
    if (!CODE_REGEX.test(formData.supplierCode.trim().toUpperCase())) {
      errors.supplierCode = 'Mã NCC chỉ gồm chữ cái, chữ số và gạch nối (VD: SUP-001).';
    }
  }

  // 5. Email
  if (formData.email && formData.email.trim()) {
    if (!EMAIL_REGEX.test(formData.email.trim())) {
      errors.email = 'Email không đúng định dạng (VD: sales@supplier.vn).';
    }
  }

  // 6. Kỳ hạn công nợ
  const term = Number(formData.paymentTermDays);
  if (Number.isNaN(term) || term < 0 || term > 365) {
    errors.paymentTermDays = 'Kỳ hạn công nợ phải từ 0 đến 365 ngày.';
  }

  // 7. Lead time
  const lead = Number(formData.leadTimeDays);
  if (Number.isNaN(lead) || lead < 1 || lead > 180) {
    errors.leadTimeDays = 'Thời gian giao hàng phải từ 1 đến 180 ngày.';
  }

  // 8. Tài khoản ngân hàng
  if (formData.accountNo && formData.accountNo.trim()) {
    const acc = formData.accountNo.trim();
    if (acc.length < 6 || acc.length > 30 || !/^[A-Za-z0-9-]+$/.test(acc)) {
      errors.accountNo = 'Số tài khoản phải gồm 6 - 30 ký tự số/chữ hợp lệ.';
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
};

export const validateContractForm = (contractForm) => {
  const errors = {};
  const materialErrors = {};

  // 1. Số hợp đồng
  if (!contractForm.contractCode || !contractForm.contractCode.trim()) {
    errors.contractCode = 'Vui lòng nhập Số hợp đồng kinh tế.';
  } else if (!CODE_REGEX.test(contractForm.contractCode.trim().toUpperCase())) {
    errors.contractCode = 'Số hợp đồng chỉ gồm chữ cái, chữ số và gạch nối (VD: HDK-2026-001).';
  }

  // 2. Tên hợp đồng
  if (!contractForm.contractTitle || !contractForm.contractTitle.trim()) {
    errors.contractTitle = 'Vui lòng nhập Tiêu đề / Tên hợp đồng.';
  } else if (contractForm.contractTitle.trim().length < 5) {
    errors.contractTitle = 'Tiêu đề hợp đồng phải có ít nhất 5 ký tự.';
  }

  // 3. Nhà cung ứng
  if (!contractForm.supplierId) {
    errors.supplierId = 'Vui lòng chọn Nhà cung ứng (Bên B) cho hợp đồng.';
  }

  // 4. Ngày hiệu lực
  if (!contractForm.signingDate) {
    errors.signingDate = 'Vui lòng chọn Ngày ký hợp đồng.';
  }
  if (!contractForm.effectiveFrom) {
    errors.effectiveFrom = 'Vui lòng chọn Ngày bắt đầu hiệu lực.';
  }
  if (!contractForm.effectiveTo) {
    errors.effectiveTo = 'Vui lòng chọn Ngày hết hạn hiệu lực.';
  }
  if (contractForm.effectiveFrom && contractForm.effectiveTo) {
    if (new Date(contractForm.effectiveTo).getTime() < new Date(contractForm.effectiveFrom).getTime()) {
      errors.effectiveTo = 'Ngày hết hạn hiệu lực không được xảy ra trước ngày bắt đầu.';
    }
  }

  // 5. Danh mục nguyên phụ liệu
  if (!Array.isArray(contractForm.contractedMaterials) || contractForm.contractedMaterials.length === 0) {
    errors.contractedMaterials = 'Hợp đồng phải có ít nhất 1 dòng nguyên phụ liệu cam kết.';
  } else {
    contractForm.contractedMaterials.forEach((item, index) => {
      const lineErr = {};
      if (!item.rawMaterialId) {
        lineErr.rawMaterialId = 'Chưa chọn nguyên vật liệu.';
      }
      const qty = Number(item.contractedQty);
      if (!Number.isFinite(qty) || qty <= 0) {
        lineErr.contractedQty = 'Số lượng ký phải > 0.';
      }
      const price = Number(item.unitPrice);
      if (!Number.isFinite(price) || price < 0) {
        lineErr.unitPrice = 'Đơn giá không được âm.';
      }
      if (item.widthCm !== undefined && item.widthCm !== '') {
        const w = Number(item.widthCm);
        if (Number.isFinite(w) && (w <= 0 || w > 400)) {
          lineErr.widthCm = 'Khổ vải: 10 - 400 cm.';
        }
      }
      if (item.gsm !== undefined && item.gsm !== '') {
        const g = Number(item.gsm);
        if (Number.isFinite(g) && (g <= 0 || g > 1200)) {
          lineErr.gsm = 'GSM: 10 - 1200 g/m².';
        }
      }
      if (item.shrinkageTolerancePct !== undefined && item.shrinkageTolerancePct !== '') {
        const s = Number(item.shrinkageTolerancePct);
        if (!Number.isFinite(s) || s < 0 || s > 25) {
          lineErr.shrinkageTolerancePct = 'Co rút: 0 - 25%.';
        }
      }
      if (item.qtyTolerancePct !== undefined && item.qtyTolerancePct !== '') {
        const t = Number(item.qtyTolerancePct);
        if (!Number.isFinite(t) || t < 0 || t > 25) {
          lineErr.qtyTolerancePct = 'Dung sai: 0 - 25%.';
        }
      }
      if (item.moq !== undefined && item.moq !== '') {
        const m = Number(item.moq);
        if (!Number.isFinite(m) || m < 1) {
          lineErr.moq = 'MOQ ≥ 1.';
        }
      }

      if (Object.keys(lineErr).length > 0) {
        materialErrors[index] = lineErr;
      }
    });

    if (Object.keys(materialErrors).length > 0) {
      errors.materialLines = materialErrors;
    }
  }

  // 6. Điều khoản thương mại
  const dep = Number(contractForm.commercialTerms?.depositPercent);
  if (Number.isNaN(dep) || dep < 0 || dep > 100) {
    errors.depositPercent = 'Tỷ lệ đặt cọc phải từ 0% đến 100%.';
  }

  const days = Number(contractForm.commercialTerms?.paymentCreditDays);
  if (Number.isNaN(days) || days < 0 || days > 365) {
    errors.paymentCreditDays = 'Kỳ hạn công nợ phải từ 0 đến 365 ngày.';
  }

  // 7. Chế tài phạt vi phạm
  const latePen = Number(contractForm.latePenaltyPercentPerDay);
  if (Number.isNaN(latePen) || latePen < 0 || latePen > 5) {
    errors.latePenaltyPercentPerDay = 'Mức phạt mỗi ngày phải từ 0% đến 5%/ngày.';
  }

  const maxPen = Number(contractForm.maxPenaltyPercent);
  if (Number.isNaN(maxPen) || maxPen < 0 || maxPen > 50) {
    errors.maxPenaltyPercent = 'Trần phạt tối đa phải từ 0% đến 50%.';
  }

  if (!contractForm.breachPenaltyClause || !contractForm.breachPenaltyClause.trim()) {
    errors.breachPenaltyClause = 'Vui lòng nhập Điều khoản phạt vi phạm tiến độ và chất lượng.';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
};

export const validateInboundPlanForm = (planForm) => {
  const errors = {};
  const itemErrors = {};

  // 1. Mã kế hoạch
  if (!planForm.planCode || !planForm.planCode.trim()) {
    errors.planCode = 'Vui lòng nhập Mã kế hoạch tiếp nhận.';
  } else if (!CODE_REGEX.test(planForm.planCode.trim().toUpperCase())) {
    errors.planCode = 'Mã kế hoạch chỉ gồm chữ cái, chữ số và gạch nối (VD: KH-NHAP-001).';
  }

  // 2. Hợp đồng
  if (!planForm.contractId) {
    errors.contractId = 'Vui lòng chọn Hợp đồng nguyên phụ liệu.';
  }

  // 3. Ngày giao hàng dự kiến
  if (!planForm.scheduledDeliveryDate) {
    errors.scheduledDeliveryDate = 'Vui lòng chọn Ngày giao hàng dự kiến về kho.';
  }

  // 4. Danh mục số lượng
  if (!Array.isArray(planForm.expectedItems) || planForm.expectedItems.length === 0) {
    errors.expectedItems = 'Kế hoạch phải có ít nhất 1 mặt hàng nguyên phụ liệu.';
  } else {
    planForm.expectedItems.forEach((item, index) => {
      const q = Number(item.plannedQty);
      if (!Number.isFinite(q) || q <= 0) {
        itemErrors[index] = 'Số lượng giao đợt này phải > 0.';
      }
    });

    if (Object.keys(itemErrors).length > 0) {
      errors.itemErrors = itemErrors;
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
};

export default {
  validateSupplierForm,
  validateContractForm,
  validateInboundPlanForm,
};

