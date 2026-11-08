/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 22-10-2026
 * Chức năng: UC-04 - Kiểm tra tên và số di động trước khi gửi tới BE.
 */

export const normalizeFullName = (value) => value.normalize('NFC').trim().replace(/ +/g, ' ');
export const fullNameError = (value) => {
  const name = normalizeFullName(value);
  return value.length <= 100 && name.length >= 2 && name.length <= 100
    && /^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u.test(name) && (name.match(/\p{L}/gu) || []).length >= 2
    ? '' : 'Họ tên cần từ 2 đến 100 ký tự, chỉ gồm chữ, khoảng trắng, dấu chấm, dấu nháy hoặc gạch nối.';
};
export const normalizePhone = (value) => {
  return typeof value === 'string' && value.length === 10 && /^0\d{9}$/.test(value) ? value : null;
};
