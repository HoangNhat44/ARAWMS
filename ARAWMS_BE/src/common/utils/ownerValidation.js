/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Chức năng: UC-06 đến UC-20 - Kiểm tra dữ liệu quản trị Owner.
 */
import { httpError } from './httpError.js';

// Kiểm tra đúng cấu trúc object và từ chối trường ngoài danh sách được phép.
export const objectFields = (value, fields) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some((key) => !fields.includes(key))) {
    throw httpError(400, 'Dữ liệu chứa trường không được phép hoặc sai cấu trúc.');
  }
};
// Chuỗi phải có nội dung, đúng độ dài và không chứa ký tự điều khiển ẩn.
export const textField = (value, label, max = 500, min = 1) => {
  if (typeof value !== 'string' || value.trim().length < min || value.length > max
    || /[\u0000-\u001f\u007f]/u.test(value)) throw httpError(400, `${label} cần từ ${min} đến ${max} ký tự hợp lệ.`);
  return value.normalize('NFC').trim();
};
// Chặn số âm ngoài giới hạn, NaN/Infinity và số lẻ ở trường yêu cầu số nguyên.
export const numberField = (value, label, min = 0, max = 1e12, integer = false) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max
    || (integer && !Number.isSafeInteger(value))) throw httpError(400, `${label} không hợp lệ (${min} đến ${max}).`);
  return value;
};
// ID MongoDB phải là chuỗi 24 ký tự hex trước khi đưa vào truy vấn.
export const objectId = (value) => {
  if (typeof value !== 'string' || !/^[a-f0-9]{24}$/i.test(value)) throw httpError(400, 'Mã định danh không hợp lệ.');
  return value;
};
// Phiên bản chỉ là số nguyên không âm, dùng để phát hiện dữ liệu quản trị cũ.
export const versionField = (value) => numberField(value, 'Phiên bản dữ liệu', 0, Number.MAX_SAFE_INTEGER, true);
// Query phân trang là chuỗi số dương; giới hạn tối đa 100 bản ghi mỗi trang.
export const pagination = (query) => {
  const parse = (v, fallback, max) => {
    if (v === undefined) return fallback;
    if (typeof v !== 'string' || !/^[1-9]\d*$/.test(v) || Number(v) > max) throw httpError(400, 'Phân trang không hợp lệ.');
    return Number(v);
  };
  return { page: parse(query.page, 1, 100000), limit: parse(query.limit, 20, 100) };
};
// Dấu chấm, sao, ngoặc... được tìm như ký tự thường, không trở thành mẫu regex do người dùng điều khiển.
export const escapedSearch = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
