/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Chức năng: OWNER-EXT-03/05; [BR: GBR-09]/[BR: GBR-14]/[BR: GBR-15] - Quy tắc dùng chung cho vải dư và hoàn tiền.
 */
import SystemSetting from '../../../models/SystemSetting.model.js';
import { numberField } from '../../../common/utils/ownerValidation.js';
import { httpError } from '../../../common/utils/httpError.js';
export const readOperationalPolicies = async () => await SystemSetting.findOne({ settingKey: 'GLOBAL_CONFIG', isDeleted: { $ne: true } }) || new SystemSetting();

// [BR: GBR-09]: Bằng hoặc vượt ngưỡng (mặc định 2.0m từ SystemSetting) vẫn thu hồi với mã cuộn mới; dưới ngưỡng phân loại phế liệu (SCRAP).
export const classifyFabricRemnant = (length, threshold = 2) => {
  numberField(length, 'Chiều dài đo được', 0, 1e9); numberField(threshold, 'Ngưỡng thu hồi', 0.01, 10000);
  return length >= threshold ? 'RECOVER_WITH_NEW_BARCODE' : 'SCRAP';
};
export const computeReturnRefund = ({ merchandiseValue, shippingFee = 0, fault }) => {
  numberField(merchandiseValue, 'Giá trị hàng trả', 0, 1e12); numberField(shippingFee, 'Phí ship', 0, 1e12);
  if (!['CUSTOMER', 'STORE'].includes(fault)) throw httpError(400, 'Cần xác định lỗi khách hay lỗi cửa hàng.');
  // [BR: GBR-14]: Khách có lỗi chịu phụ phí 10% giá trị hàng và phí ship nếu phát sinh (`netRefund = merchandiseValue * 90% - shippingFee`).
  // [BR: GBR-15]: Lỗi cửa hàng/xưởng hoàn 100% giá trị hàng, miễn hoàn toàn phụ phí và phí ship.
  const surcharge = fault === 'CUSTOMER' ? Math.round(merchandiseValue * 0.1) : 0;
  const shippingDeduction = fault === 'CUSTOMER' ? shippingFee : 0;
  return { surcharge, shippingDeduction, netRefund: merchandiseValue - surcharge - shippingDeduction };
};
