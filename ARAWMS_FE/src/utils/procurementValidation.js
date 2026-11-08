/**
 * FRONTEND VALIDATION RULES FOR ACCOUNTANT PROCUREMENT WORKSPACE
 */

export const VN_PHONE_REGEX = /^(0|\+84)(3[2-9]|5[2689]|7[06-9]|8[1-9]|9[0-9])[0-9]{7}$/;
export const TAX_CODE_REGEX = /^[0-9]{10}(-[0-9]{3})?$/;
export const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
export const CODE_REGEX = /^[A-Z0-9_\-\/]{2,50}$/;

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
      const isNew = item.isNewMaterial || item.rawMaterialId === '__CREATE_NEW__' || item.rawMaterialId === '__NEW__';
      if (isNew) {
        if (!item.materialNameSnapshot || !String(item.materialNameSnapshot).trim()) {
          lineErr.materialNameSnapshot = 'Vui lòng nhập tên nguyên phụ liệu mới.';
        }
      } else if (!item.rawMaterialId) {
        lineErr.rawMaterialId = 'Chưa chọn nguyên vật liệu.';
      }
      if (!item.unitSnapshot || !String(item.unitSnapshot).trim()) {
        lineErr.unitSnapshot = 'Đơn vị tính không được để trống.';
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
          lineErr.qtyTolerancePct = 'Đúng sai: 0 - 25%.';
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

  // 6. Điều khoản thương mại & Lộ trình các lần thanh toán
  const dep = Number(contractForm.commercialTerms?.depositPercent);
  if (Number.isNaN(dep) || dep < 0 || dep > 100) {
    errors.depositPercent = 'Tỷ lệ đặt cọc phải từ 0% đến 100%.';
  }

  const days = Number(contractForm.commercialTerms?.paymentCreditDays);
  if (Number.isNaN(days) || days < 0 || days > 365) {
    errors.paymentCreditDays = 'Kỳ hạn công nợ phải từ 0 đến 365 ngày.';
  }

  const schedule = Array.isArray(contractForm.commercialTerms?.paymentSchedule)
    ? contractForm.commercialTerms.paymentSchedule
    : [];
  const installmentsCount = Number(
    contractForm.commercialTerms?.paymentInstallmentsCount ?? schedule.length
  );

  if (!Number.isNaN(dep) && dep < 100) {
    if (!Number.isInteger(installmentsCount) || installmentsCount < 1 || installmentsCount > 12) {
      errors.paymentInstallmentsCount = 'Số lần thanh toán phải từ 1 đến 12 đợt.';
    } else if (schedule.length !== installmentsCount) {
      errors.paymentSchedule = `Vui lòng thiết lập đầy đủ ${installmentsCount} lần thanh toán.`;
    } else {
      const paymentScheduleErrors = {};
      const effFromKey = String(contractForm.effectiveFrom || '').slice(0, 10);
      const effToKey = String(contractForm.effectiveTo || '').slice(0, 10);
      let sumInstallmentPct = 0;
      let prevDueKey = null;

      schedule.forEach((inst, idx) => {
        const rowErr = {};
        const stepNo = idx + 1;
        const pct = Number(inst.paymentPercent);

        if (inst.paymentPercent === '' || inst.paymentPercent === null || Number.isNaN(pct)) {
          rowErr.paymentPercent = `Nhập % thanh toán lần ${stepNo}.`;
        } else if (pct <= 0) {
          rowErr.paymentPercent =
            idx === schedule.length - 1
              ? 'Tỷ lệ lần cuối phải > 0% (Tổng cọc & các lần trước đã chạm/vượt 100%).'
              : `% thanh toán lần ${stepNo} phải > 0%.`;
        } else if (pct > 100) {
          rowErr.paymentPercent = `% thanh toán lần ${stepNo} không vượt quá 100%.`;
        } else {
          sumInstallmentPct += pct;
        }

        const dueKey = String(inst.dueDate || '').slice(0, 10);
        if (!dueKey) {
          rowErr.dueDate = `Chọn ngày thanh toán lần ${stepNo}.`;
        } else {
          if (effFromKey && dueKey < effFromKey) {
            rowErr.dueDate = `Không được trước ngày hiệu lực HĐ (${effFromKey.split('-').reverse().join('/')}).`;
          } else if (effToKey && dueKey > effToKey) {
            rowErr.dueDate = `Không được sau ngày hết hạn HĐ (${effToKey.split('-').reverse().join('/')}).`;
          } else if (prevDueKey && dueKey < prevDueKey) {
            rowErr.dueDate = `Phải sau hoặc cùng ngày với lần ${stepNo - 1} (${prevDueKey.split('-').reverse().join('/')}).`;
          }
          prevDueKey = dueKey;
        }

        if (Object.keys(rowErr).length > 0) {
          paymentScheduleErrors[idx] = rowErr;
        }
      });

      if (Object.keys(paymentScheduleErrors).length > 0) {
        errors.paymentScheduleLines = paymentScheduleErrors;
      }

      const totalAllocatedPct = Number((dep + sumInstallmentPct).toFixed(2));
      if (Math.abs(totalAllocatedPct - 100) > 0.01) {
        errors.paymentSchedule = `Tổng tiền cọc (${dep}%) và các lần thanh toán (${Number(sumInstallmentPct.toFixed(2))}%) hiện là ${totalAllocatedPct}%, bắt buộc phải bằng đúng 100% tổng giá trị hợp đồng.`;
      }
    }
  } else if (dep === 100 && schedule.length > 0) {
    errors.paymentSchedule = 'Khi đặt cọc 100%, số lần thanh toán tiếp theo phải là 0.';
  }

  // 6b. Kế hoạch Lịch trình Tiếp nhận Nguyên vật liệu (Inbound Delivery Schedule)
  if (Array.isArray(contractForm.inboundBatches) && contractForm.inboundBatches.length > 0) {
    const inboundBatchErrors = {};
    let prevDeliveryDate = null;
    const itemQtySumMap = {};

    contractForm.inboundBatches.forEach((b, bIdx) => {
      const bErr = {};
      const batchNo = b.batchNumber || bIdx + 1;

      if (!b.scheduledDeliveryDate) {
        bErr.scheduledDeliveryDate = `Vui lòng chọn Ngày giao hàng đợt ${batchNo}.`;
      } else {
        const currTime = new Date(b.scheduledDeliveryDate).getTime();
        if (contractForm.effectiveFrom && currTime < new Date(contractForm.effectiveFrom).getTime()) {
          bErr.scheduledDeliveryDate = `Ngày giao đợt ${batchNo} không được trước ngày bắt đầu hợp đồng.`;
        }
        if (contractForm.effectiveTo && currTime > new Date(contractForm.effectiveTo).getTime()) {
          bErr.scheduledDeliveryDate = `Ngày giao đợt ${batchNo} không được sau ngày hết hạn hợp đồng.`;
        }
        if (prevDeliveryDate && currTime < prevDeliveryDate) {
          bErr.scheduledDeliveryDate = `Ngày giao đợt ${batchNo} không được trước ngày giao đợt ${batchNo - 1}.`;
        }
        prevDeliveryDate = currTime;
      }

      const lineItemErrors = {};
      if (Array.isArray(b.expectedItems)) {
        b.expectedItems.forEach((it, itIdx) => {
          const rawId = String(it.rawMaterialId);
          const q = Number(it.plannedQty);
          if (Number.isNaN(q) || q < 0) {
            lineItemErrors[itIdx] = 'Số lượng không được âm.';
          } else {
            itemQtySumMap[rawId] = (itemQtySumMap[rawId] || 0) + q;
          }
        });
      }

      if (Object.keys(lineItemErrors).length > 0) {
        bErr.itemErrors = lineItemErrors;
      }

      if (Object.keys(bErr).length > 0) {
        inboundBatchErrors[bIdx] = bErr;
      }
    });

    if (Object.keys(inboundBatchErrors).length > 0) {
      errors.inboundBatchErrors = inboundBatchErrors;
    }

    // Đối soát tổng số lượng phân bổ qua các đợt so với số lượng ký hợp đồng
    if (Array.isArray(contractForm.contractedMaterials)) {
      const allocationMismatchMessages = [];
      contractForm.contractedMaterials.forEach((cm, cIdx) => {
        const rawId = String(cm.rawMaterialId);
        const contracted = Number(cm.contractedQty || 0);
        const scheduled = itemQtySumMap[rawId] || 0;
        if (Math.abs(contracted - scheduled) > 0.001) {
          const matLabel = cm.materialNameSnapshot || `Mặt hàng ${cIdx + 1}`;
          allocationMismatchMessages.push(
            `"${matLabel}": đã phân bổ ${scheduled} / ${contracted} (chênh lệch ${contracted - scheduled}).`
          );
        }
      });

      if (allocationMismatchMessages.length > 0) {
        errors.inboundBatches = `Tổng số lượng các đợt giao chưa khớp 100% với số lượng cam kết: ${allocationMismatchMessages.join('; ')}`;
      }
    }
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

  // 8. Lý do điều chỉnh phiên bản mới
  if (contractForm.isNewVersion && (!contractForm.amendmentReason || !contractForm.amendmentReason.trim())) {
    errors.amendmentReason = 'Vui lòng nhập Lý do điều chỉnh / Nội dung phụ lục phiên bản mới.';
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
    errors.planCode = 'Mã kế hoạch chỉ gồm chữ cái, chữ số, gạch nối và gạch chéo (VD: KH-NHAP-001 hoặc KH-NHAP-001/D1).';
  }

  // 2. Hợp đồng
  if (!planForm.contractId) {
    errors.contractId = 'Vui lòng chọn Hợp đồng nguyên phụ liệu đang có hiệu lực (ACTIVE).';
  }

  // 2.1 Lý do điều chỉnh (khi tạo phiên bản mới / amend)
  if (planForm.isNewVersion) {
    if (!planForm.amendmentReason || !planForm.amendmentReason.trim()) {
      errors.amendmentReason = 'Vui lòng nhập Lý do điều chỉnh kế hoạch tiếp nhận / Nội dung cập nhật.';
    } else if (planForm.amendmentReason.trim().length < 5) {
      errors.amendmentReason = 'Lý do điều chỉnh kế hoạch phải có ít nhất 5 ký tự.';
    }
  }

  // 3. Nếu là chia nhiều đợt nhập (batches mode)
  if (Array.isArray(planForm.batches) && planForm.batches.length > 0) {
    const batchErrors = {};
    let prevDeliveryDate = null;

    planForm.batches.forEach((b, bIdx) => {
      const bErr = {};
      const batchNo = b.batchNumber || bIdx + 1;

      if (!b.scheduledDeliveryDate) {
        bErr.scheduledDeliveryDate = `Vui lòng chọn Ngày giao hàng đợt ${batchNo}.`;
      } else {
        const currTime = new Date(b.scheduledDeliveryDate).getTime();
        if (prevDeliveryDate && currTime < prevDeliveryDate) {
          bErr.scheduledDeliveryDate = `Ngày giao đợt ${batchNo} không được trước đợt ${batchNo - 1}.`;
        }
        prevDeliveryDate = currTime;
      }

      if (!Array.isArray(b.expectedItems) || b.expectedItems.length === 0) {
        bErr.expectedItems = `Đợt ${batchNo} phải có ít nhất 1 mặt hàng.`;
      } else {
        const bItemErrors = {};
        b.expectedItems.forEach((item, itemIdx) => {
          const q = Number(item.plannedQty);
          if (!Number.isFinite(q) || q <= 0) {
            bItemErrors[itemIdx] = 'Số lượng đợt này phải > 0.';
          }
        });
        if (Object.keys(bItemErrors).length > 0) {
          bErr.itemErrors = bItemErrors;
        }
      }

      if (Object.keys(bErr).length > 0) {
        batchErrors[bIdx] = bErr;
      }
    });

    if (Object.keys(batchErrors).length > 0) {
      errors.batchErrors = batchErrors;
    }
  } else {
    // 4. Nếu là 1 đợt đơn lẻ
    if (!planForm.scheduledDeliveryDate) {
      errors.scheduledDeliveryDate = 'Vui lòng chọn Ngày giao hàng dự kiến về kho.';
    }

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
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
};

/**
 * Validate Biểu mẫu Lập Phiếu chi tiền (Payment Voucher Form Validation)
 */
export const validatePaymentVoucherForm = (form) => {
  const errors = {};
  const isCashIn = form.flowType === 'CASH_IN';

  // 1. Hạng mục thu / chi
  if (!form.category) {
    errors.category = isCashIn
      ? 'Vui lòng chọn Hạng mục thu tiền.'
      : 'Vui lòng chọn Hạng mục chi phí.';
  }

  // 2. Lý do thu / chi
  if (!form.paymentReason || !form.paymentReason.trim()) {
    errors.paymentReason = isCashIn
      ? 'Vui lòng nhập Lý do thu / Nội dung nộp tiền.'
      : 'Vui lòng nhập Lý do chi / Nội dung thanh toán.';
  } else if (form.paymentReason.trim().length < 5) {
    errors.paymentReason = isCashIn
      ? 'Lý do thu phải có độ dài tối thiểu 5 ký tự.'
      : 'Lý do chi phải có độ dài tối thiểu 5 ký tự.';
  }

  // 3. Số tiền thu / chi
  const amount = Number(form.amount);
  if (form.amount === '' || form.amount === null || form.amount === undefined || Number.isNaN(amount)) {
    errors.amount = isCashIn
      ? 'Vui lòng nhập Số tiền thu.'
      : 'Vui lòng nhập Số tiền chi trả.';
  } else if (amount <= 0) {
    errors.amount = isCashIn
      ? 'Số tiền thu phải lớn hơn 0 VND.'
      : 'Số tiền chi trả phải lớn hơn 0 VND.';
  }

  // 4. Đối tượng nộp tiền / thụ hưởng
  if (!form.recipient?.name || !form.recipient.name.trim()) {
    errors.recipientName = isCashIn
      ? 'Vui lòng nhập Tên người / Đơn vị nộp tiền.'
      : 'Vui lòng nhập Tên người / Đơn vị nhận tiền.';
  }

  // 5. Phương thức thanh toán & Thông tin ngân hàng
  if (!form.paymentMethod) {
    errors.paymentMethod = 'Vui lòng chọn Phương thức thanh toán.';
  } else if (form.paymentMethod === 'BANK_TRANSFER') {
    if (!form.bankInfo?.bankName || !form.bankInfo.bankName.trim()) {
      errors.bankName = isCashIn
        ? 'Vui lòng nhập Tên ngân hàng nhận tiền của Công ty.'
        : 'Vui lòng nhập Tên ngân hàng nhận tiền.';
    }
    if (!form.bankInfo?.accountNo || !form.bankInfo.accountNo.trim()) {
      errors.accountNo = isCashIn
        ? 'Vui lòng nhập Số tài khoản ngân hàng nhận tiền.'
        : 'Vui lòng nhập Số tài khoản ngân hàng.';
    }
    if (!form.bankInfo?.accountHolder || !form.bankInfo.accountHolder.trim()) {
      errors.accountHolder = isCashIn
        ? 'Vui lòng nhập Tên chủ tài khoản nhận tiền.'
        : 'Vui lòng nhập Tên chủ tài khoản ngân hàng.';
    }
  }

  // 6. Ràng buộc theo Hạng mục
  if (!isCashIn && form.category === 'SUPPLIER_PAYMENT') {
    if (!form.supplierId) {
      errors.supplierId = 'Vui lòng chọn Nhà cung cấp thanh toán.';
    }
    if (form.installmentNumber !== null && form.installmentNumber !== undefined && form.installmentNumber !== '') {
      const num = Number(form.installmentNumber);
      if (!Number.isInteger(num) || num < 0) {
        errors.installmentNumber = 'Đợt thanh toán không hợp lệ.';
      }
    }
    if (Array.isArray(form.installmentNumbers)) {
      form.installmentNumbers.forEach((n) => {
        const num = Number(n);
        if (!Number.isInteger(num) || num < 0) {
          errors.installmentNumber = 'Danh sách đợt thanh toán chứa giá trị không hợp lệ.';
        }
      });
    }
  }

  if (!isCashIn && form.category === 'CUSTOMER_REFUND') {
    if (!form.returnRequestId) {
      errors.returnRequestId = 'Vui lòng chọn Yêu cầu đổi trả hoàn tiền.';
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
  validatePaymentVoucherForm,
};

