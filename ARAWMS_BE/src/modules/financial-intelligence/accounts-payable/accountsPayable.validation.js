import mongoose from 'mongoose';
import { PAYMENT_EXPENSE_CATEGORIES } from '../../../common/constants/enums.js';

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);
const PHONE_REGEX = /^[0-9+() -]{9,15}$/;

/**
 * Validation Middleware: Tạo mới Phiếu chi tiền (Create Payment Voucher)
 */
export const validateCreatePaymentVoucher = (req, res, next) => {
  const {
    category,
    paymentReason,
    amount,
    paymentMethod,
    recipient,
    bankInfo,
    supplierId,
    contractId,
    installmentNumber,
    installmentNumbers,
    installmentLabel,
    returnRequestId,
    carrierId,
    supportingDocuments,
  } = req.body || {};

  const errors = [];

  // 1. Hạng mục chi phí (Expense Category)
  if (!category || !PAYMENT_EXPENSE_CATEGORIES.includes(category)) {
    errors.push('Hạng mục chi phí (category) là bắt buộc và phải thuộc danh mục hệ thống quy định.');
  }

  // 2. Lý do chi / Nội dung thanh toán (Payment Reason)
  if (!paymentReason || typeof paymentReason !== 'string' || !paymentReason.trim()) {
    errors.push('Lý do chi / Nội dung thanh toán (paymentReason) là bắt buộc.');
  } else if (paymentReason.trim().length < 5) {
    errors.push('Lý do chi phải có độ dài tối thiểu 5 ký tự.');
  }

  // 3. Số tiền chi (Payment Amount)
  const numAmount = Number(amount);
  if (amount === undefined || amount === null || Number.isNaN(numAmount)) {
    errors.push('Số tiền chi (amount) là bắt buộc và phải là số hợp lệ.');
  } else if (numAmount <= 0) {
    errors.push('Số tiền chi phải lớn hơn 0 VND.');
  }

  // 4. Phương thức thanh toán (Payment Method)
  const validMethods = ['BANK_TRANSFER', 'CASH', 'COD_BALANCE_OFFSET'];
  if (!paymentMethod || !validMethods.includes(paymentMethod)) {
    errors.push('Phương thức thanh toán (paymentMethod) phải là BANK_TRANSFER, CASH hoặc COD_BALANCE_OFFSET.');
  }

  // 5. Thông tin ngân hàng (Bank Info) - Bắt buộc nếu chuyển khoản
  if (paymentMethod === 'BANK_TRANSFER') {
    if (!bankInfo || typeof bankInfo !== 'object') {
      errors.push('Vui lòng cung cấp đầy đủ thông tin tài khoản ngân hàng thụ hưởng khi chọn chuyển khoản.');
    } else {
      if (!bankInfo.bankName || !bankInfo.bankName.trim()) {
        errors.push('Tên ngân hàng thụ hưởng (bankInfo.bankName) là bắt buộc.');
      }
      if (!bankInfo.accountNo || !bankInfo.accountNo.trim()) {
        errors.push('Số tài khoản ngân hàng (bankInfo.accountNo) là bắt buộc.');
      }
      if (!bankInfo.accountHolder || !bankInfo.accountHolder.trim()) {
        errors.push('Tên chủ tài khoản ngân hàng (bankInfo.accountHolder) là bắt buộc.');
      }
    }
  }

  // 6. Đối tượng thụ hưởng (Recipient Information)
  if (!recipient || typeof recipient !== 'object') {
    errors.push('Thông tin đối tượng thụ hưởng (recipient) là bắt buộc.');
  } else {
    if (!recipient.name || !recipient.name.trim()) {
      errors.push('Tên người/đơn vị nhận tiền (recipient.name) là bắt buộc.');
    }
    if (recipient.phone && !PHONE_REGEX.test(recipient.phone.trim())) {
      errors.push('Số điện thoại người nhận không hợp lệ.');
    }
  }

  // 7. Ràng buộc theo Hạng mục chi phí (Category Specific Rules)
  if (category === 'SUPPLIER_PAYMENT' || category === 'SUPPLIER_DEPOSIT' || category === 'SUPPLIER_INSTALLMENT') {
    if (!supplierId || !isValidObjectId(supplierId)) {
      errors.push('Chi thanh toán nhà cung cấp bắt buộc phải chọn Nhà cung ứng hợp lệ (supplierId).');
    }
    if (contractId && !isValidObjectId(contractId)) {
      errors.push('Hợp đồng mua sắm liên kết (contractId) không đúng định dạng ObjectId.');
    }
    if (installmentNumber !== undefined && installmentNumber !== null && installmentNumber !== '') {
      const num = Number(installmentNumber);
      if (!Number.isInteger(num) || num < 0) {
        errors.push('Đợt thanh toán (installmentNumber) phải là số nguyên không âm (0: Đặt cọc, 1: Đợt 1, 2: Đợt 2...).');
      }
    }
    if (installmentNumbers !== undefined && installmentNumbers !== null) {
      if (!Array.isArray(installmentNumbers)) {
        errors.push('Danh sách đợt thanh toán (installmentNumbers) phải là một mảng số nguyên.');
      } else {
        installmentNumbers.forEach((num, idx) => {
          const n = Number(num);
          if (!Number.isInteger(n) || n < 0) {
            errors.push(`Đợt thanh toán thứ ${idx + 1} (${num}) phải là số nguyên không âm.`);
          }
        });
      }
    }
  }

  if (category === 'CUSTOMER_REFUND' || category === 'CUSTOMER_RETURN_REFUND') {
    if (!returnRequestId || !isValidObjectId(returnRequestId)) {
      errors.push('Chi hoàn tiền khách hàng bắt buộc phải chọn Yêu cầu đổi trả hợp lệ (returnRequestId).');
    }
  }

  if (category === 'SHIPPING_COST' && carrierId && !isValidObjectId(carrierId)) {
    errors.push('Đơn vị vận chuyển (carrierId) không đúng định dạng ObjectId.');
  }

  // 8. Chứng từ đính kèm (Supporting Documents)
  if (supportingDocuments !== undefined) {
    if (!Array.isArray(supportingDocuments)) {
      errors.push('Danh sách chứng từ đính kèm (supportingDocuments) phải là một mảng.');
    } else {
      supportingDocuments.forEach((doc, idx) => {
        if (!doc.url || typeof doc.url !== 'string') {
          errors.push(`Chứng từ đính kèm dòng ${idx + 1} thiếu đường dẫn URL/Base64.`);
        }
      });
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Dữ liệu lập phiếu chi không hợp lệ',
      errors,
    });
  }

  next();
};

/**
 * Validation Middleware: Chỉnh sửa phiếu chi nháp (Update Draft Voucher)
 */
export const validateUpdatePaymentVoucher = (req, res, next) => {
  validateCreatePaymentVoucher(req, res, next);
};

/**
 * Validation Middleware: Xác nhận chi tiền thực tế (Confirm Cash/Bank Disbursement)
 */
export const validateExecutePayment = (req, res, next) => {
  const { transactionReference, paidAt } = req.body || {};
  const errors = [];

  if (transactionReference !== undefined && typeof transactionReference !== 'string') {
    errors.push('Mã giao dịch ngân hàng / Số phiếu chi tay (transactionReference) phải là chuỗi ký tự.');
  }

  if (paidAt) {
    const d = new Date(paidAt);
    if (Number.isNaN(d.getTime())) {
      errors.push('Thời gian chi tiền (paidAt) không hợp lệ.');
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Dữ liệu xác nhận chi tiền không hợp lệ',
      errors,
    });
  }

  next();
};

/**
 * Validation Middleware: Hủy phiếu chi (Cancel Voucher)
 */
export const validateCancelVoucher = (req, res, next) => {
  const { cancellationReason } = req.body || {};
  const errors = [];

  if (!cancellationReason || typeof cancellationReason !== 'string' || !cancellationReason.trim()) {
    errors.push('Vui lòng nhập lý do hủy phiếu chi (cancellationReason).');
  } else if (cancellationReason.trim().length < 5) {
    errors.push('Lý do hủy phiếu chi phải có độ dài tối thiểu 5 ký tự.');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Dữ liệu hủy phiếu chi không hợp lệ',
      errors,
    });
  }

  next();
};

