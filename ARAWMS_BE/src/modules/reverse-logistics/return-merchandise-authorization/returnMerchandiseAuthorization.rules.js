/**
 * ============================================================================
 * @title        : RMA Business Rules (Theo tài liệu chuẩn BR.md mới: GBR-14..GBR-17, GBR-26)
 * @author       : Nguyễn Quang Huy
 * @createdDate  : 2026-10-27
 * @lastModified : 2026-11-29
 * @description  : Áp dụng trực tiếp các Global Business Rules từ BR.md mới cho phân hệ
 *                 Đổi / Trả hàng (Reverse Logistics) & Kế toán hoàn tiền.
 * @module       : Reverse Logistics / Return Merchandise Authorization
 * @layer        : Service / Rules
 * ============================================================================
 *
 * Quy chiếu trực tiếp từ BR.md (phiên bản GBR-01..GBR-28):
 * - [BR: GBR-14] (Customer-Fault Return Surcharge):
 *     Đổi/trả do lỗi khách hàng (mất tag, bẩn vải, khách chọn nhầm size, đổi ý)
 *     chịu phụ phí hoàn trả 10%:
 *     Refund Amount = Product Value * 90% - Shipping Fee (if any)
 *
 * - [BR: GBR-15] (Store-Fault Return Waiver):
 *     Đổi/trả do lỗi cửa hàng/xưởng (MANUFACTURING_DEFECT hoặc WRONG_ITEM_DELIVERED)
 *     được miễn 100% phụ phí hoàn trả và phí vận chuyển:
 *     Refund Amount = 100% Product Value
 *
 * - [BR: GBR-16] (Defective Garment Quarantine Isolation):
 *     Sản phẩm trả về bị lỗi/hư hỏng (DIRTY_OR_DAMAGED / MANUFACTURING_DEFECT)
 *     bắt buộc cách ly vào khu vực DEFECT_QUARANTINE (disposition = QUARANTINE_DEFECT),
 *     không được cộng vào tồn kho khả dụng (RESTOCK_SALEABLE).
 *
 * - [BR: GBR-17] (Mandatory Voucher Source Document Reference):
 *     Mọi phiếu thu/chi (CashFlowVoucher) do Kế toán lập bắt buộc phải tham chiếu
 *     đến chứng từ gốc hợp lệ (salesOrderId, returnRequestId). Seller không tự chi tiền;
 *     Seller gửi yêu cầu hoàn tiền để Kế toán duyệt và lập phiếu chi CASH_OUT.
 *
 * - [BR: GBR-26] (Garment Technician Unboxing Scan & Video Evidence):
 *     Khi mở kiện hàng hoàn tại kho, bắt buộc quét mã vận đơn chiều về (returnWaybillCode)
 *     và đính kèm video mở hộp (unboxingVideoUrl) trước khi phân loại hàng hoàn.
 * ============================================================================
 */

export const RMA_BUSINESS_RULES = Object.freeze({
  /** [BR: GBR-14] Phụ phí 10% khi đổi/trả do lỗi khách hàng */
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

/** [BR: GBR-17] Trạng thái yêu cầu hoàn tiền gửi Kế toán duyệt lập phiếu chi */
export const REFUND_REQUEST_STATUS = Object.freeze({
  NONE: 'NONE',
  PENDING_ACCOUNTANT: 'PENDING_ACCOUNTANT',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
});

/**
 * Phân loại lý do đổi/trả theo [BR: GBR-14] (Lỗi khách hàng - thu phí 10%) và [BR: GBR-15] (Lỗi cửa hàng - miễn phí 100%).
 *
 * @param {string} reasonDescription - Mô tả lý do đổi/trả
 * @param {string} [faultType] - 'STORE_FAULT' | 'CUSTOMER_FAULT' nếu truyền tường minh
 * @returns {{ isStoreFault: boolean, ruleCode: string, faultLabel: string }}
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
 * ====================================================================================================================================
 * [BẢNG TRA CỨU CÔNG THỨC TÍNH TIỀN HOÀN RMA THEO BR.md (calculateRefundFinancialsByBR)]
 * ====================================================================================================================================
 * | STT | Trường hợp / Biến số         | Màn hình FE hiển thị                     | Nguồn DB (Collection.field)                       | Công thức & Quy tắc BR                            |
 * |-----|------------------------------|------------------------------------------|---------------------------------------------------|---------------------------------------------------|
 * | 1   | returnedMerchandiseValue     | Giá trị hàng trả (CreateRmaModal)        | return_requests.financialAccounting               | Σ (returnedQty * sales_orders.items.unitSalePrice)|
 * | 2   | Lỗi cửa hàng / xưởng         | Miễn 100% phụ phí (isStoreFault = true)  | return_requests.financialAccounting               | [BR: GBR-15] surcharge=0; netRefund=100% * value  |
 * | 3   | Lỗi khách hàng               | Phụ phí 10% (isStoreFault = false)       | return_requests.financialAccounting               | [BR: GBR-14] sur=round(val*10%); net=max(0,val-sur-ship)|
 * ====================================================================================================================================
 *
 * @businessRule GBR-14 Khấu trừ 10% phụ phí hoàn trả khi lỗi do khách hàng
 * @businessRule GBR-15 Miễn 100% phụ phí và phí ship khi lỗi do xưởng/cửa hàng
 */
export const calculateRefundFinancialsByBR = ({
  returnedMerchandiseValue = 0,
  isStoreFault = false,
  shippingFeeDeduction = 0,
}) => {
  const productValue = Math.max(0, Number(returnedMerchandiseValue) || 0);

  if (isStoreFault) {
    // [BR: GBR-15] Store-Fault Return Waiver: Refund Amount = 100% Product Value
    return {
      returnedMerchandiseValue: productValue,
      apply10PercentSurcharge: false,
      surcharge10PercentAmount: 0,
      shippingFeeDeduction: 0,
      finalNetRefundOrCollect: productValue,
      appliedRule: 'GBR-12',
    };
  }

  // [BR: GBR-14] Customer-Fault Return Surcharge: Refund Amount = Product Value * 90% - Shipping Fee (if any)
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
