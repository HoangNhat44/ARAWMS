/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Chức năng: OWNER-EXT-03/05; GBR-06/11/12 - Quy tắc dùng chung cho vải dư và hoàn tiền.
 */
import SystemSetting from '../../../models/SystemSetting.model.js';
import { numberField } from '../../../common/utils/ownerValidation.js';
import { httpError } from '../../../common/utils/httpError.js';
export const readOperationalPolicies = async () => await SystemSetting.findOne({ settingKey: 'GLOBAL_CONFIG', isDeleted: { $ne: true } }) || new SystemSetting();

// GBR-06: Bằng ngưỡng vẫn thu hồi và cần mã cuộn mới; dưới ngưỡng thì phân loại phế liệu.
export const classifyFabricRemnant = (length, threshold = 2) => {
  numberField(length, 'Chiều dài đo được', 0, 1e9); numberField(threshold, 'Ngưỡng thu hồi', 0.01, 10000);
  return length >= threshold ? 'RECOVER_WITH_NEW_BARCODE' : 'SCRAP';
};
export const computeReturnRefund = ({ merchandiseValue, shippingFee = 0, fault }) => {
  numberField(merchandiseValue, 'Giá trị hàng trả', 0, 1e12); numberField(shippingFee, 'Phí ship', 0, 1e12);
  if (!['CUSTOMER', 'STORE'].includes(fault)) throw httpError(400, 'Cần xác định lỗi khách hay lỗi cửa hàng.');
  // GBR-11: Khách có lỗi chịu 10% giá trị hàng và phí ship nếu phát sinh.
  // GBR-12: Lỗi cửa hàng hoàn toàn bộ giá trị hàng, không trừ phụ phí hay phí ship.
  const surcharge = fault === 'CUSTOMER' ? Math.round(merchandiseValue * 0.1) : 0;
  const shippingDeduction = fault === 'CUSTOMER' ? shippingFee : 0;
  return { surcharge, shippingDeduction, netRefund: merchandiseValue - surcharge - shippingDeduction };
};
