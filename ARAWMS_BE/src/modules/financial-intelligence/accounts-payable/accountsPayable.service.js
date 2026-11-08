import mongoose from 'mongoose';
import {
  CashFlowVoucher,
  Supplier,
  SupplierContract,
  ReturnRequest,
  ShippingCarrier,
  User,
  CounterSequence,
} from '../../../models/index.js';

/**
 * Helper: Lấy User ID của Kế toán hệ thống (dùng fallback nếu chưa có JWT context)
 */
async function resolveAccountantUserId(explicitUserId) {
  if (explicitUserId) return explicitUserId;
  const accountant =
    (await User.findOne({ employeeCode: 'KETOAN' }).select('_id').lean()) ||
    (await User.findOne().select('_id').lean());
  return accountant?._id;
}

/**
 * Danh mục Hạng mục chi phí chuẩn kèm metadata
 */
export const EXPENSE_CATEGORIES_METADATA = [
  {
    code: 'SUPPLIER_PAYMENT',
    name: 'Chi thanh toán Nhà cung cấp',
    description: 'Thanh toán tiền mua vải, phụ liệu, cọc hợp đồng NCC và giảm trừ công nợ',
    recipientType: 'SUPPLIER',
    requiresSupplier: true,
  },
  {
    code: 'CUSTOMER_REFUND',
    name: 'Chi hoàn tiền Khách hàng',
    description: 'Hoàn tiền đơn hàng trả lại sau khi KCS kiểm định đạt chuẩn',
    recipientType: 'CUSTOMER',
    requiresReturnRequest: true,
  },
  {
    code: 'SHIPPING_COST',
    name: 'Chi phí Cước vận chuyển',
    description: 'Cước phí giao hàng bưu kiện, xe tải vận chuyển nguyên phụ liệu',
    recipientType: 'CARRIER',
  },
  {
    code: 'PRODUCTION_COST',
    name: 'Chi phí Gia công May mặc',
    description: 'Thanh toán tiền công cắt may, in ấn hoàn thiện cho Xưởng may gia công',
    recipientType: 'PARTNER',
  },
  {
    code: 'OPERATING_EXPENSE',
    name: 'Chi phí Vận hành & Vật tư Kho',
    description: 'Điện, nước, internet, bao bì đóng gói, băng dính, tem nhãn mã vạch, văn phòng phẩm',
    recipientType: 'OTHER',
  },
  {
    code: 'OTHER_EXPENSE',
    name: 'Chi phí Hoạt động khác',
    description: 'Phí dịch vụ ngân hàng, chi phí nghiệp vụ hợp lệ khác',
    recipientType: 'OTHER',
  },
  {
    code: 'CARRIER_COD_PAYOUT',
    name: 'Thu tiền COD từ Đơn vị Vận chuyển (GHN)',
    description: 'Tất toán tiền COD thu hộ từ đối tác giao vận sau bù trừ cước phí',
    recipientType: 'CARRIER',
    flowType: 'CASH_IN',
  },
  {
    code: 'SURCHARGE_REVENUE',
    name: 'Thu phụ phí hoàn hàng / đổi trả',
    description: 'Phụ phí phát sinh thu từ khách hàng khi xử lý đổi hàng, hoàn hàng',
    recipientType: 'CUSTOMER',
    flowType: 'CASH_IN',
  },
  {
    code: 'CARRIER_DISPUTE_COMPENSATION',
    name: 'Thu bồi thường khiếu nại vận chuyển',
    description: 'Tiền bồi thường hàng thất thoát/hư hỏng từ đối tác giao vận',
    recipientType: 'CARRIER',
    flowType: 'CASH_IN',
  },
];

/**
 * 1. Lấy danh mục Hạng mục chi
 */
export const getExpenseCategories = async () => {
  return EXPENSE_CATEGORIES_METADATA;
};

/**
 * 2. Lấy danh sách Phiếu chi tiền (Filters & Pagination support)
 */
export const listPaymentVouchers = async (filters = {}) => {
  const query = {};

  if (filters.flowType && filters.flowType !== 'ALL') {
    query.flowType = filters.flowType;
  }

  if (filters.category && filters.category !== 'ALL') {
    query.category = filters.category;
  }
  if (filters.status && filters.status !== 'ALL') {
    query.status = filters.status;
  }
  if (filters.paymentMethod && filters.paymentMethod !== 'ALL') {
    query.paymentMethod = filters.paymentMethod;
  }
  if (filters.supplierId) {
    query.supplierId = filters.supplierId;
  }

  // Lọc theo ngày chứng từ
  if (filters.startDate || filters.endDate) {
    query.voucherDate = {};
    if (filters.startDate) {
      query.voucherDate.$gte = new Date(filters.startDate);
    }
    if (filters.endDate) {
      const end = new Date(filters.endDate);
      end.setHours(23, 59, 59, 999);
      query.voucherDate.$lte = end;
    }
  }

  // Tìm kiếm theo mã phiếu, lý do chi hoặc tên đối tượng thụ hưởng
  if (filters.search && String(filters.search).trim()) {
    const s = String(filters.search).trim();
    const regex = new RegExp(s, 'i');
    query.$or = [
      { voucherCode: regex },
      { 'recipient.name': regex },
      { paymentReason: regex },
      { transactionReference: regex },
    ];
  }

  return CashFlowVoucher.find(query)
    .populate('supplierId', 'supplierCode supplierName phone bankInfo totalPayableDebt')
    .populate('contractId', 'contractCode contractTitle status commercialTerms')
    .populate('returnRequestId', 'rmaCode status returnType financialAccounting')
    .populate('carrierId', 'carrierCode carrierName hotline')
    .populate('createdByAccountantId', 'fullName email employeeCode')
    .populate('confirmedByAccountantId', 'fullName email employeeCode')
    .populate('paidByUserId', 'fullName email employeeCode')
    .sort({ voucherDate: -1, createdAt: -1 });
};

/**
 * 3. Lấy chi tiết Phiếu chi theo ID
 */
export const getPaymentVoucherById = async (voucherId) => {
  const voucher = await CashFlowVoucher.findById(voucherId)
    .populate('supplierId')
    .populate('contractId')
    .populate('returnRequestId')
    .populate('carrierId')
    .populate('createdByAccountantId', 'fullName email employeeCode')
    .populate('confirmedByAccountantId', 'fullName email employeeCode')
    .populate('paidByUserId', 'fullName email employeeCode')
    .populate('cancelledByUserId', 'fullName email employeeCode');

  if (!voucher) {
    const err = new Error('Không tìm thấy phiếu chi tiền yêu cầu.');
    err.statusCode = 404;
    throw err;
  }

  return voucher;
};

/**
 * 4. Tạo mới Phiếu chi tiền (Atomic Sequence & Cross-Module Validation)
 */
export const createPaymentVoucher = async (payload, currentUserId) => {
  const accountantId = await resolveAccountantUserId(currentUserId);

  // Chuẩn hóa danh sách đợt thanh toán (hỗ trợ cả thanh toán đơn đợt và đa đợt tuần tự)
  const requestedNumbers =
    Array.isArray(payload.installmentNumbers) && payload.installmentNumbers.length > 0
      ? payload.installmentNumbers.map(Number)
      : payload.installmentNumber !== undefined &&
        payload.installmentNumber !== null &&
        payload.installmentNumber !== ''
      ? [Number(payload.installmentNumber)]
      : [];

  // A. Kiểm tra nghiệp vụ theo từng loại đối tượng
  if (payload.category === 'SUPPLIER_PAYMENT' || payload.category === 'SUPPLIER_DEPOSIT' || payload.category === 'SUPPLIER_INSTALLMENT') {
    const supplier = await Supplier.findById(payload.supplierId);
    if (!supplier) {
      const err = new Error('Nhà cung cấp được chọn không tồn tại trên hệ thống.');
      err.statusCode = 404;
      throw err;
    }
    if (payload.contractId) {
      const contract = await SupplierContract.findById(payload.contractId);
      if (!contract) {
        const err = new Error('Hợp đồng mua sắm được chọn không tồn tại.');
        err.statusCode = 404;
        throw err;
      }
      if (String(contract.supplierId) !== String(supplier._id)) {
        const err = new Error('Hợp đồng được chọn không thuộc về nhà cung ứng này.');
        err.statusCode = 400;
        throw err;
      }

      // Kiểm tra đợt thanh toán hợp đồng (Tránh chi trùng đợt đã thanh toán / đang xử lý)
      if (requestedNumbers.length > 0) {
        const existingInstallmentVoucher = await CashFlowVoucher.findOne({
          contractId: payload.contractId,
          status: { $in: ['DRAFT', 'CONFIRMED', 'PAID'] },
          $or: [
            { installmentNumber: { $in: requestedNumbers } },
            { installmentNumbers: { $in: requestedNumbers } },
          ],
        }).select('voucherCode status installmentNumber installmentNumbers installmentLabel');

        if (existingInstallmentVoucher) {
          const err = new Error(
            `Trong các đợt đã chọn, có đợt đã phát sinh phiếu chi ${existingInstallmentVoucher.voucherCode} (Trạng thái: ${existingInstallmentVoucher.status}). Vui lòng chỉ chọn các đợt thanh toán chưa thực hiện.`
          );
          err.statusCode = 400;
          throw err;
        }
      }
    }
  }

  // B. Kiểm tra chống chi hoàn tiền vượt định mức (Anti-Duplicate / Anti-Over-Refund)
  if (payload.category === 'CUSTOMER_REFUND' || payload.category === 'CUSTOMER_RETURN_REFUND') {
    const returnReq = await ReturnRequest.findById(payload.returnRequestId);
    if (!returnReq) {
      const err = new Error('Đơn yêu cầu đổi trả hàng không tồn tại.');
      err.statusCode = 404;
      throw err;
    }

    const netRefundApproved = Number(returnReq.financialAccounting?.finalNetRefundOrCollect || 0);
    if (netRefundApproved <= 0) {
      const err = new Error('Đơn trả hàng này chưa có số tiền hoàn được duyệt hoặc không phát sinh hoàn tiền.');
      err.statusCode = 400;
      throw err;
    }

    // Tính tổng các phiếu chi đang hoạt động cho đơn hoàn này
    const existingVouchers = await CashFlowVoucher.find({
      returnRequestId: returnReq._id,
      status: { $in: ['DRAFT', 'CONFIRMED', 'PAID'] },
    }).select('amount voucherCode');

    const totalActivePaid = existingVouchers.reduce((acc, v) => acc + (Number(v.amount) || 0), 0);
    const requestedAmount = Number(payload.amount);

    if (totalActivePaid + requestedAmount > netRefundApproved) {
      const remainingAllowed = Math.max(0, netRefundApproved - totalActivePaid);
      const err = new Error(
        `Số tiền hoàn (${requestedAmount.toLocaleString('vi-VN')} đ) vượt quá hạn mức hoàn lại còn lại (${remainingAllowed.toLocaleString('vi-VN')} đ). Tổng tiền duyệt hoàn: ${netRefundApproved.toLocaleString('vi-VN')} đ.`
      );
      err.statusCode = 400;
      throw err;
    }
  }

  // C. Sinh mã phiếu thu / phiếu chi an toàn song song (Concurrency-safe Atomic Generation)
  // Format Phiếu chi: PC-YYYYMMDD-0001 | Format Phiếu thu: PT-YYYYMMDD-0001
  const isCashIn =
    payload.flowType === 'CASH_IN' ||
    payload.category === 'CARRIER_COD_PAYOUT' ||
    payload.category === 'SURCHARGE_REVENUE' ||
    payload.category === 'CARRIER_DISPUTE_COMPENSATION';

  const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = isCashIn ? `PT-${todayStr}` : `PC-${todayStr}`;
  const seqKey = isCashIn ? `RECEIPT_VOUCHER_${todayStr}` : `PAYMENT_VOUCHER_${todayStr}`;
  const voucherCode = await CounterSequence.getNextSequence(seqKey, prefix, 4);

  // D. Chuẩn bị dữ liệu tài liệu đính kèm
  const supportingDocuments = Array.isArray(payload.supportingDocuments)
    ? payload.supportingDocuments.map((doc) => ({
        name: doc.name || 'Chung_tu_dinh_kem',
        url: doc.url,
        fileSize: doc.fileSize,
        mimeType: doc.mimeType,
        uploadedAt: new Date(),
      }))
    : [];

  const initialStatus =
    payload.status === 'DRAFT'
      ? 'DRAFT'
      : payload.status === 'PAID'
      ? 'PAID'
      : 'CONFIRMED';
  const isPaid = initialStatus === 'PAID';

  // E. Lưu chứng từ phiếu thu / phiếu chi
  const newVoucher = await CashFlowVoucher.create({
    voucherCode,
    flowType: isCashIn ? 'CASH_IN' : 'CASH_OUT',
    category: payload.category,
    paymentReason: payload.paymentReason.trim(),
    recipient: {
      name: payload.recipient?.name?.trim(),
      phone: payload.recipient?.phone?.trim() || '',
      address: payload.recipient?.address?.trim() || '',
      recipientType:
        payload.recipient?.recipientType ||
        (isCashIn
          ? payload.category === 'CARRIER_COD_PAYOUT' || payload.category === 'CARRIER_DISPUTE_COMPENSATION'
            ? 'CARRIER'
            : payload.category === 'SURCHARGE_REVENUE'
            ? 'CUSTOMER'
            : 'OTHER'
          : 'OTHER'),
    },
    amount: Number(payload.amount),
    paymentMethod: payload.paymentMethod || 'BANK_TRANSFER',
    bankInfo:
      payload.paymentMethod === 'BANK_TRANSFER'
        ? {
            bankName: payload.bankInfo?.bankName?.trim() || '',
            accountNo: payload.bankInfo?.accountNo?.trim() || '',
            accountHolder: payload.bankInfo?.accountHolder?.trim() || '',
            branchName: payload.bankInfo?.branchName?.trim() || '',
          }
        : undefined,
    status: initialStatus,
    paidAt: isPaid ? (payload.paidAt ? new Date(payload.paidAt) : new Date()) : null,
    paidByUserId: isPaid ? accountantId : null,
    transactionReference: payload.transactionReference?.trim() || '',
    supplierId: payload.supplierId || null,
    contractId: payload.contractId || null,
    installmentNumber:
      requestedNumbers.length > 0
        ? requestedNumbers[0]
        : null,
    installmentNumbers: requestedNumbers,
    installmentLabel: payload.installmentLabel?.trim() || '',
    returnRequestId: payload.returnRequestId || null,
    carrierId: payload.carrierId || null,
    supportingDocuments,
    attachmentUrl: supportingDocuments[0]?.url || '',
    createdByAccountantId: accountantId,
    confirmedByAccountantId: initialStatus !== 'DRAFT' ? accountantId : null,
    confirmedAt: initialStatus !== 'DRAFT' ? new Date() : null,
    voucherDate: payload.voucherDate ? new Date(payload.voucherDate) : new Date(),
    notes: payload.notes || '',
  });

  return getPaymentVoucherById(newVoucher._id);
};

/**
 * 5. Cập nhật Phiếu chi nháp (Chỉ cho phép khi ở trạng thái DRAFT)
 */
export const updatePaymentVoucher = async (voucherId, payload, currentUserId) => {
  const voucher = await CashFlowVoucher.findById(voucherId);
  if (!voucher) {
    const err = new Error('Không tìm thấy phiếu chi tiền cần cập nhật.');
    err.statusCode = 404;
    throw err;
  }

  if (voucher.status !== 'DRAFT') {
    const err = new Error(`Không thể chỉnh sửa phiếu chi đã ở trạng thái [${voucher.status}].`);
    err.statusCode = 400;
    throw err;
  }

  if (payload.category) voucher.category = payload.category;
  if (payload.paymentReason) voucher.paymentReason = payload.paymentReason.trim();
  if (payload.amount) voucher.amount = Number(payload.amount);
  if (payload.paymentMethod) voucher.paymentMethod = payload.paymentMethod;
  if (payload.recipient) {
    voucher.recipient = {
      name: payload.recipient.name?.trim() || voucher.recipient?.name,
      phone: payload.recipient.phone?.trim() || voucher.recipient?.phone,
      address: payload.recipient.address?.trim() || voucher.recipient?.address,
      recipientType: payload.recipient.recipientType || voucher.recipient?.recipientType,
    };
  }
  if (payload.bankInfo && payload.paymentMethod === 'BANK_TRANSFER') {
    voucher.bankInfo = {
      bankName: payload.bankInfo.bankName?.trim(),
      accountNo: payload.bankInfo.accountNo?.trim(),
      accountHolder: payload.bankInfo.accountHolder?.trim(),
      branchName: payload.bankInfo.branchName?.trim() || '',
    };
  }
  if (payload.supplierId !== undefined) voucher.supplierId = payload.supplierId;
  if (payload.contractId !== undefined) voucher.contractId = payload.contractId;
  if (payload.installmentNumber !== undefined) {
    voucher.installmentNumber =
      payload.installmentNumber !== null && payload.installmentNumber !== ''
        ? Number(payload.installmentNumber)
        : null;
  }
  if (Array.isArray(payload.installmentNumbers)) {
    voucher.installmentNumbers = payload.installmentNumbers.map(Number);
  }
  if (payload.installmentLabel !== undefined) {
    voucher.installmentLabel = payload.installmentLabel?.trim() || '';
  }
  if (payload.returnRequestId !== undefined) voucher.returnRequestId = payload.returnRequestId;
  if (payload.carrierId !== undefined) voucher.carrierId = payload.carrierId;
  if (payload.notes !== undefined) voucher.notes = payload.notes;

  if (Array.isArray(payload.supportingDocuments)) {
    voucher.supportingDocuments = payload.supportingDocuments;
  }

  await voucher.save();
  return getPaymentVoucherById(voucher._id);
};

/**
 * 6. Kế toán tự xác nhận / duyệt phiếu chi (Chuyển DRAFT sang CONFIRMED)
 */
export const confirmPaymentVoucher = async (voucherId, currentUserId) => {
  const accountantId = await resolveAccountantUserId(currentUserId);
  const voucher = await CashFlowVoucher.findById(voucherId);

  if (!voucher) {
    const err = new Error('Không tìm thấy phiếu chi tiền.');
    err.statusCode = 404;
    throw err;
  }

  if (voucher.status !== 'DRAFT') {
    const err = new Error(`Phiếu chi đang ở trạng thái [${voucher.status}], không thể xác nhận.`);
    err.statusCode = 400;
    throw err;
  }

  voucher.status = 'CONFIRMED';
  voucher.confirmedByAccountantId = accountantId;
  voucher.confirmedAt = new Date();

  await voucher.save();
  return getPaymentVoucherById(voucher._id);
};

/**
 * 7. Xác nhận Chi tiền thực tế (Execute Disbursement -> PAID)
 * Ghi nhận tiền đã xuất quỹ, trừ công nợ NCC nếu là SUPPLIER_PAYMENT
 */
export const executePayment = async (voucherId, payload, currentUserId) => {
  const accountantId = await resolveAccountantUserId(currentUserId);
  const voucher = await CashFlowVoucher.findById(voucherId);

  if (!voucher) {
    const err = new Error('Không tìm thấy phiếu chi tiền.');
    err.statusCode = 404;
    throw err;
  }

  if (voucher.status === 'PAID') {
    const err = new Error('Phiếu chi này đã được xác nhận chi tiền trước đó.');
    err.statusCode = 400;
    throw err;
  }

  if (voucher.status === 'CANCELLED') {
    const err = new Error('Phiếu chi đã bị hủy bỏ, không thể chi tiền.');
    err.statusCode = 400;
    throw err;
  }

  // Chuyển trạng thái sang PAID
  voucher.status = 'PAID';
  voucher.paidByUserId = accountantId;
  voucher.paidAt = payload.paidAt ? new Date(payload.paidAt) : new Date();
  voucher.transactionReference = payload.transactionReference?.trim() || voucher.transactionReference || '';

  await voucher.save();

  // Nghiệp vụ giảm nợ NCC & Hợp đồng nếu chi thanh toán nhà cung cấp
  if (voucher.supplierId && (voucher.category === 'SUPPLIER_PAYMENT' || voucher.category === 'SUPPLIER_DEPOSIT' || voucher.category === 'SUPPLIER_INSTALLMENT')) {
    try {
      // 1. Cập nhật số tiền đã thanh toán của Hợp đồng mua sắm (nếu có gắn contractId)
      if (voucher.contractId) {
        await SupplierContract.findByIdAndUpdate(voucher.contractId, {
          $inc: { totalPaidAmount: voucher.amount },
        });
      }

      // 2. Tính toán lại số dư nợ thực tế từ các Hợp đồng và Phiếu chi
      const [supContracts, supPaidVouchers] = await Promise.all([
        SupplierContract.find({ supplierId: voucher.supplierId, status: 'ACTIVE' }).select('totalContractAmount').lean(),
        CashFlowVoucher.find({ supplierId: voucher.supplierId, flowType: 'CASH_OUT', status: 'PAID' }).select('amount').lean(),
      ]);
      const totalContracted = supContracts.reduce((sum, c) => sum + (Number(c.totalContractAmount) || 0), 0);
      const totalPaid = supPaidVouchers.reduce((sum, v) => sum + (Number(v.amount) || 0), 0);
      const nextDebt = Math.max(0, totalContracted - totalPaid);

      await Supplier.findByIdAndUpdate(voucher.supplierId, { totalPayableDebt: nextDebt });
    } catch (debtErr) {
      console.error('Lỗi cập nhật giảm công nợ NCC sau khi chi tiền:', debtErr);
    }
  }

  return getPaymentVoucherById(voucher._id);
};

/**
 * 8. Hủy phiếu chi tiền (Cancel Payment Voucher)
 */
export const cancelPaymentVoucher = async (voucherId, payload, currentUserId) => {
  const accountantId = await resolveAccountantUserId(currentUserId);
  const voucher = await CashFlowVoucher.findById(voucherId);

  if (!voucher) {
    const err = new Error('Không tìm thấy phiếu chi tiền.');
    err.statusCode = 404;
    throw err;
  }

  if (voucher.status === 'PAID') {
    const err = new Error('Phiếu chi đã hoàn tất giải ngân tiền, không thể hủy bỏ trực tiếp.');
    err.statusCode = 400;
    throw err;
  }

  if (voucher.status === 'CANCELLED') {
    const err = new Error('Phiếu chi này đã bị hủy bỏ trước đó.');
    err.statusCode = 400;
    throw err;
  }

  voucher.status = 'CANCELLED';
  voucher.cancelledByUserId = accountantId;
  voucher.cancelledAt = new Date();
  voucher.cancellationReason = payload.cancellationReason?.trim() || 'Kế toán hủy phiếu chi';

  await voucher.save();
  return getPaymentVoucherById(voucher._id);
};

export default {
  getExpenseCategories,
  listPaymentVouchers,
  getPaymentVoucherById,
  createPaymentVoucher,
  updatePaymentVoucher,
  confirmPaymentVoucher,
  executePayment,
  cancelPaymentVoucher,
};

