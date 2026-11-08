/**
 * ============================================================================
 * @title        : RMA Business Rules (Theo tài liệu chuẩn BR.md: GBR-11..GBR-14, GBR-23)
 * @description  : Áp dụng trực tiếp các Global Business Rules từ BR.md cho phân hệ
 *                 Đổi / Trả hàng (Reverse Logistics) & Kế toán hoàn tiền.
 *                 Không tự đặt mã BR ngoài BR.md.
 * ============================================================================
 *
 * Quy chiếu trực tiếp từ BR.md:
 * - GBR-11 (Customer-Fault Return Surcharge):
 *     Đổi/trả do lỗi khách hàng (mất tag, bẩn vải, khách chọn nhầm size, đổi ý)
 *     chịu phụ phí hoàn trả 10%:
 *     Refund Amount = Product Value * 90% - Shipping Fee (if any)
 *
 * - GBR-12 (Store-Fault Return Waiver):
 *     Đổi/trả do lỗi cửa hàng/xưởng (MANUFACTURING_DEFECT hoặc WRONG_ITEM_DELIVERED)
 *     được miễn 100% phụ phí hoàn trả và phí vận chuyển:
 *     Refund Amount = 100% Product Value
 *
 * - GBR-13 (Defective Garment Quarantine Isolation):
 *     Sản phẩm trả về bị lỗi/hư hỏng (DIRTY_OR_DAMAGED / MANUFACTURING_DEFECT)
 *     bắt buộc cách ly vào khu vực DEFECT_QUARANTINE (disposition = QUARANTINE_DEFECT),
 *     không được cộng vào tồn kho khả dụng (RESTOCK_SALEABLE).
 *
 * - GBR-14 (Mandatory Voucher Source Document Reference):
 *     Mọi phiếu thu/chi (CashFlowVoucher) do Kế toán lập bắt buộc phải tham chiếu
 *     đến chứng từ gốc hợp lệ (salesOrderId, returnRequestId). Seller không tự chi tiền;
 *     Seller gửi yêu cầu hoàn tiền để Kế toán duyệt và lập phiếu chi CASH_OUT.
 *
 * - GBR-23 (Return Unboxing Video & Barcode Audit):
 *     Khi mở kiện hàng hoàn tại kho, bắt buộc quét mã vận đơn chiều về (returnWaybillCode)
 *     và đính kèm video mở hộp (unboxingVideoUrl) trước khi xác nhận kiểm hàng.
 * ============================================================================
 */

export const RMA_BUSINESS_RULES = Object.freeze({
  /** GBR-11: Phụ phí 10% khi đổi/trả do lỗi khách hàng */
  CUSTOMER_FAULT_SURCHARGE_PERCENT: 10,
  REASON_MIN_LENGTH: 5,
});

/**
 * Các trạng thái đơn hàng đủ điều kiện tạo phiếu Đổi/Trả:
 * Chỉ những đơn hàng đã giao thành công (DELIVERED hoặc đơn hoàn thành tại quầy COMPLETED)
 * mới được phép tạo yêu cầu đổi/trả hàng.
 */
export const RMA_ELIGIBLE_ORDER_STATUSES = Object.freeze([
  'DELIVERED',
  'COMPLETED',
]);

/** Trạng thái phiếu RMA đang hoạt động */
export const RMA_ACTIVE_STATUSES = Object.freeze([
  'REQUESTED',
  'UNBOXED_INSPECTED',
  'ACCOUNTANT_APPROVED',
]);

/** GBR-14: Trạng thái yêu cầu hoàn tiền gửi Kế toán duyệt lập phiếu chi */
export const REFUND_REQUEST_STATUS = Object.freeze({
  NONE: 'NONE',
  PENDING_ACCOUNTANT: 'PENDING_ACCOUNTANT',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
});

/**
 * Phân loại lý do đổi/trả theo GBR-11 (Lỗi khách hàng - thu phí 10%) và GBR-12 (Lỗi cửa hàng - miễn phí 100%).
 *
 * @param {string} reasonDescription - Mô tả lý do đổi/trả
 * @param {string} [faultType] - 'STORE_FAULT' | 'CUSTOMER_FAULT' nếu truyền tường minh
 * @returns {{ isStoreFault: boolean, ruleCode: 'GBR-12' | 'GBR-11', faultLabel: string }}
 */
export const classifyReturnFaultByBR = (reasonDescription = '', faultType = '') => {
  const normalizedFault = String(faultType || '').toUpperCase().trim();
  if (normalizedFault === 'STORE_FAULT' || normalizedFault === 'MANUFACTURING_DEFECT' || normalizedFault === 'WRONG_ITEM_DELIVERED') {
    return {
      isStoreFault: true,
      ruleCode: 'GBR-12',
      faultLabel: 'Lỗi cửa hàng / xưởng (GBR-12: Miễn 100% phụ phí hoàn trả)',
    };
  }
  if (normalizedFault === 'CUSTOMER_FAULT') {
    return {
      isStoreFault: false,
      ruleCode: 'GBR-11',
      faultLabel: 'Lỗi khách hàng / Đổi ý / Chọn nhầm size (GBR-11: Phụ phí 10%)',
    };
  }

  const text = String(reasonDescription || '').toLowerCase();
  const storeFaultKeywords = [
    'lỗi vải',
    'sút chỉ',
    'đứt nút',
    'lỗi xưởng',
    'lỗi nhà sản xuất',
    'manufacturing_defect',
    'giao nhầm',
    'sai mẫu',
    'sai màu',
    'nhầm màu',
    'nhầm mã',
    'wrong_item_delivered',
    'hư hỏng trong quá trình vận chuyển',
  ];

  const isStoreFault = storeFaultKeywords.some((kw) => text.includes(kw));
  return isStoreFault
    ? {
        isStoreFault: true,
        ruleCode: 'GBR-12',
        faultLabel: 'Lỗi cửa hàng / xưởng (GBR-12: Miễn 100% phụ phí hoàn trả)',
      }
    : {
        isStoreFault: false,
        ruleCode: 'GBR-11',
        faultLabel: 'Khách đổi size / Đổi ý / Thiếu tag (GBR-11: Phụ phí hoàn trả 10%)',
      };
};

/**
 * Tính toán giá trị hoàn tiền ròng theo đúng công thức GBR-11 và GBR-12 trong BR.md
 *
 * @param {Object} params
 * @param {number} params.returnedMerchandiseValue - Tổng giá trị sản phẩm trả lại
 * @param {boolean} params.isStoreFault - True nếu thuộc GBR-12, False nếu thuộc GBR-11
 * @param {number} [params.shippingFeeDeduction=0] - Phí vận chuyển khấu trừ (nếu có)
 * @returns {{
 *   returnedMerchandiseValue: number,
 *   apply10PercentSurcharge: boolean,
 *   surcharge10PercentAmount: number,
 *   shippingFeeDeduction: number,
 *   finalNetRefundOrCollect: number,
 *   appliedRule: 'GBR-11' | 'GBR-12'
 * }}
 */
export const calculateRefundFinancialsByBR = ({
  returnedMerchandiseValue = 0,
  isStoreFault = false,
  shippingFeeDeduction = 0,
}) => {
  const productValue = Math.max(0, Number(returnedMerchandiseValue) || 0);

  if (isStoreFault) {
    // [GBR-12] Store-Fault Return Waiver: Refund Amount = 100% Product Value
    return {
      returnedMerchandiseValue: productValue,
      apply10PercentSurcharge: false,
      surcharge10PercentAmount: 0,
      shippingFeeDeduction: 0,
      finalNetRefundOrCollect: productValue,
      appliedRule: 'GBR-12',
    };
  }

  // [GBR-11] Customer-Fault Return Surcharge: Refund Amount = Product Value * 90% - Shipping Fee (if any)
  const surcharge = Math.round((productValue * RMA_BUSINESS_RULES.CUSTOMER_FAULT_SURCHARGE_PERCENT) / 100);
  const shipDeduction = Math.max(0, Number(shippingFeeDeduction) || 0);
  const netRefund = Math.max(0, productValue - surcharge - shipDeduction);

  return {
    returnedMerchandiseValue: productValue,
    apply10PercentSurcharge: true,
    surcharge10PercentAmount: surcharge,
    shippingFeeDeduction: shipDeduction,
    finalNetRefundOrCollect: netRefund,
    appliedRule: 'GBR-11',
  };
};

export default {
  RMA_BUSINESS_RULES,
  RMA_ELIGIBLE_ORDER_STATUSES,
  RMA_ACTIVE_STATUSES,
  REFUND_REQUEST_STATUS,
  classifyReturnFaultByBR,
  calculateRefundFinancialsByBR,
};
