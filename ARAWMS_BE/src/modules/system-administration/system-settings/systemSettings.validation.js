/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Chức năng: OWNER-EXT-02..05; GBR-05/06/11/12/19 - Kiểm tra cấu hình Owner.
 */
import { objectFields, textField, numberField, versionField } from '../../../common/utils/ownerValidation.js';
import { httpError } from '../../../common/utils/httpError.js';

// Mỗi nhóm có danh sách trường riêng; cấu hình API không được sửa nhầm ngưỡng kho.
const fields = {
  api: ['ghnEnabled', 'ghnToken', 'ghnShopId', 'facebookPageId', 'facebookVerifyToken', 'facebookPageAccessToken'],
  fabric: ['defaultFabricLeftoverThresholdMeters'],
  inventory: ['defaultFifoAgingAlertDays', 'minorStocktakeVarianceLimitQty', 'minorStocktakeVarianceLimitValue'],
  returns: ['returnSurchargePercent', 'returnPolicyNotes'],
};
export const secretFields = ['ghnToken', 'facebookVerifyToken', 'facebookPageAccessToken'];
export const validateSettings = (section, body) => {
  if (!Object.hasOwn(fields, section)) throw httpError(404, 'Nhóm cấu hình không tồn tại.');
  objectFields(body, ['expectedVersion', ...fields[section]]);
  const expectedVersion = versionField(body.expectedVersion); const data = {};
  const entries = Object.entries(body).filter(([key]) => key !== 'expectedVersion');
  if (!entries.length) throw httpError(400, 'Cần nhập ít nhất một cấu hình.');
  for (const [key, value] of entries) {
    // Khóa để trống giữ giá trị cũ; null bỏ khóa trong DB để dùng cấu hình môi trường nếu có.
    if (secretFields.includes(key)) {
      if (value === null) data[key] = null;
      else if (value !== '') data[key] = textField(value, 'Khóa tích hợp', 4096);
    } else if (key === 'ghnEnabled') {
      if (typeof value !== 'boolean') throw httpError(400, 'Trạng thái GHN phải là true hoặc false.');
      data[key] = value;
    } else if (key === 'facebookPageId') {
      if (typeof value !== 'string' || (value !== '' && !/^\d{1,40}$/.test(value))) throw httpError(400, 'Facebook Page ID cần là chuỗi chữ số.');
      data[key] = value;
    } else if (key === 'returnPolicyNotes') {
      data[key] = value === '' ? '' : textField(value, 'Nội dung chính sách', 2000);
    } else if (key === 'returnSurchargePercent') {
      // GBR-11: Không cho Owner lưu tỷ lệ khác 10% khi tài liệu chưa cho phép ngoại lệ.
      if (value !== 10) throw httpError(400, 'GBR-11 quy định phụ phí lỗi khách là 10%.');
      data[key] = value;
    } else {
      const limits = { ghnShopId: [1, 2147483647, true], defaultFabricLeftoverThresholdMeters: [0.01, 10000, false],
        defaultFifoAgingAlertDays: [1, 3650, true], minorStocktakeVarianceLimitQty: [0, 1e9, false], minorStocktakeVarianceLimitValue: [0, 1e12, false] };
      data[key] = numberField(value, key, ...limits[key]);
    }
  }
  if (!Object.keys(data).length) throw httpError(400, 'Chưa có giá trị mới để lưu.');
  return { expectedVersion, data };
};

// OWNER-EXT-04: Mỗi mặt hàng có ngưỡng riêng, lưu kèm phiên bản để tránh ghi đè thay đổi tồn.
export const validateInventoryThreshold = (body) => {
  objectFields(body, ['expectedVersion', 'safetyStockThreshold', 'fifoAgingThresholdDays']);
  return { expectedVersion: versionField(body.expectedVersion),
    safetyStockThreshold: numberField(body.safetyStockThreshold, 'Tồn an toàn', 0, 1e9),
    fifoAgingThresholdDays: numberField(body.fifoAgingThresholdDays, 'Ngày cảnh báo tồn lâu', 1, 3650, true) };
};
