/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Report 3 — UC-014 và UC-016. Hàm dùng chung cho phân loại vải dư và tính tiền hoàn.
 */
import SystemSetting from '../../../models/SystemSetting.model.js';
import { numberField } from '../../../common/utils/ownerValidation.js';
import { httpError } from '../../../common/utils/httpError.js';
/** Tải cấu hình nghiệp vụ đang hoạt động hoặc sử dụng bộ giá trị mặc định của model. */
export const readOperationalPolicies = async () => await SystemSetting.findOne({ settingKey: 'GLOBAL_CONFIG', isDeleted: { $ne: true } }) || new SystemSetting();

// [BR: GBR-09] Chiều dài bằng hoặc vượt ngưỡng được phân loại thu hồi bằng mã cuộn mới. Dưới ngưỡng là phế liệu.
/** Kiểm tra chiều dài và ngưỡng rồi trả mã phân loại để quy trình hạ nguồn quyết định cách xử lý cuộn. */
export const classifyFabricRemnant = (length, threshold = 2) => {
  numberField(length, 'Chiều dài đo được', 0, 1e9); numberField(threshold, 'Ngưỡng thu hồi', 0.01, 10000);
  return length >= threshold ? 'RECOVER_WITH_NEW_BARCODE' : 'SCRAP';
};
/** Tính riêng phụ phí, phí vận chuyển bị khấu trừ và tiền hoàn ròng theo bên có lỗi. */
export const computeReturnRefund = ({ merchandiseValue, shippingFee = 0, fault }) => {
  numberField(merchandiseValue, 'Giá trị hàng trả', 0, 1e12); numberField(shippingFee, 'Phí ship', 0, 1e12);
  if (!['CUSTOMER', 'STORE'].includes(fault)) throw httpError(400, 'Cần xác định lỗi khách hay lỗi cửa hàng.');
  // [BR: GBR-14] Khách có lỗi chịu 10% giá trị hàng và phí giao hàng nếu phát sinh.
  // [BR: GBR-15] Lỗi cửa hàng được hoàn toàn bộ giá trị hàng và miễn các khoản khấu trừ.
  const surcharge = fault === 'CUSTOMER' ? Math.round(merchandiseValue * 0.1) : 0;
  const shippingDeduction = fault === 'CUSTOMER' ? shippingFee : 0;
  return { surcharge, shippingDeduction, netRefund: merchandiseValue - surcharge - shippingDeduction };
};
