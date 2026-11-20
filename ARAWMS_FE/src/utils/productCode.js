/*
 * File: productCode.js
 * Author: Duy Anh
 * Date: 2026-11-14
 * Description: Product/SKU code rules mirrored from the backend
 *              (ARAWMS_BE/src/common/utils/productCode.js). Backend still validates independently.
 */

/** Uppercase letters and digits only. "-" is reserved as the SKU code separator. */
export const PRODUCT_CODE_PATTERN = /^[A-Z0-9]{2,20}$/;

export const PRODUCT_CODE_HINT = 'Mã sản phẩm cần 2–20 chữ cái in hoa hoặc số, không dấu, không khoảng trắng, không dấu gạch.';

export const normalizeProductCode = (value) => String(value ?? '').trim().toUpperCase();

export const isValidProductCode = (value) => PRODUCT_CODE_PATTERN.test(String(value ?? ''));

/** Normalized color text used to detect the same color written differently. */
export const normalizeColorKey = (value) => String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi-VN');

/** "Xanh lá" -> "XANHLA", "Đỏ đô" -> "DODO". Returns '' when nothing usable remains. */
export const toColorCode = (color) => String(color ?? '')
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/[đĐ]/g, 'D')
  .toUpperCase()
  .replace(/[^A-Z0-9]/g, '');

/** Builds PRODUCTCODE-COLORCODE-SIZE; returns '' when any part is unusable (preview only). */
export const previewSkuCode = (productCode, color, size) => {
  const colorCode = toColorCode(color);
  const sizeCode = String(size ?? '').trim().toUpperCase();
  if (!isValidProductCode(productCode) || !colorCode || !sizeCode) return '';
  return `${productCode}-${colorCode}-${sizeCode}`;
};

/** Common color codes written without accents in source files, mapped back to the display name. */
const COLOR_NAMES = {
  TRANG: 'Trắng', DEN: 'Đen', KEM: 'Kem', HONG: 'Hồng', DO: 'Đỏ', XANH: 'Xanh', VANG: 'Vàng', NAU: 'Nâu',
  XAM: 'Xám', GHI: 'Ghi', BE: 'Be', TIM: 'Tím', CAM: 'Cam', BAC: 'Bạc', REU: 'Rêu', XANHLA: 'Xanh lá',
  XANHDUONG: 'Xanh dương', XANHNAVY: 'Xanh navy', NAVY: 'Navy', HONGPHAN: 'Hồng phấn', DODO: 'Đỏ đô',
};

/** Display color for a code segment such as "KEM" / "ĐEN" ("Kem", "Đen"); unknown codes become "Abc". */
export const colorNameFromCode = (segment) => {
  const code = toColorCode(segment);
  if (!code) return '';
  if (COLOR_NAMES[code]) return COLOR_NAMES[code];
  const text = String(segment).trim().toLocaleLowerCase('vi-VN');
  return text.charAt(0).toLocaleUpperCase('vi-VN') + text.slice(1);
};

/**
 * Reads a source code that carries the color, e.g. "CV90-KEM" -> { productCode: "CV90", colorSegment: "KEM" }.
 * Only one "-" is accepted and the part before it must be a valid product code; otherwise null.
 */
export const splitColoredProductCode = (rawCode) => {
  const parts = normalizeProductCode(rawCode).split('-');
  if (parts.length !== 2 || !isValidProductCode(parts[0]) || !toColorCode(parts[1])) return null;
  return { productCode: parts[0], colorSegment: parts[1] };
};
