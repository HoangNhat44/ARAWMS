/*
 * File: productCode.js
 * Author: Duy Anh
 * Date: 2026-11-14
 * Description: Shared rules for product codes and variant (SKU) codes.
 *              Product code is user-defined (e.g. AL186); SKU code is generated
 *              once as PRODUCTCODE-COLORCODE-SIZE (e.g. AL186-TRANG-M) and never changes.
 */

/** Uppercase letters and digits only. "-" is reserved as the SKU code separator. */
export const PRODUCT_CODE_PATTERN = /^[A-Z0-9]{2,20}$/;

/** Normalizes user input to the stored product code form (trimmed, uppercase). */
export const normalizeProductCode = (value) => String(value ?? '').trim().toUpperCase();

/** Returns true when the value is already a valid stored product code. */
export const isValidProductCode = (value) => PRODUCT_CODE_PATTERN.test(String(value ?? ''));

/** Normalized color text used in variantKey to detect the same color written differently. */
export const normalizeColorKey = (value) => String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi-VN');

/**
 * Converts a display color into the code segment used in SKU codes.
 * Removes Vietnamese diacritics, maps đ/Đ to D, uppercases and keeps only A-Z0-9.
 * @example toColorCode('Xanh lá') === 'XANHLA'; toColorCode('Đỏ đô') === 'DODO'
 * @param {string} color Display color name.
 * @returns {string} Color code, or '' when nothing usable remains.
 */
export const toColorCode = (color) => String(color ?? '')
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/[đĐ]/g, 'D')
  .toUpperCase()
  .replace(/[^A-Z0-9]/g, '');

/** Codes stored before the new rule (e.g. SP-2026-00012, OFFLINE-01) until they are migrated. */
const LEGACY_PRODUCT_CODE_PATTERN = /^[\p{L}\p{N}_-]{2,64}$/u;

/**
 * Builds the immutable SKU code PRODUCTCODE-COLORCODE-SIZE.
 * @param {object} [options]
 * @param {boolean} [options.allowLegacyCode] Accept an already-stored legacy product code
 *   so existing products keep working until the data migration runs.
 * @throws {Error} When the product code is invalid or the color has no usable characters.
 */
export const buildSkuCode = (productCode, color, size, { allowLegacyCode = false } = {}) => {
  const codeOk = isValidProductCode(productCode) ||
    (allowLegacyCode && LEGACY_PRODUCT_CODE_PATTERN.test(String(productCode ?? '')));
  if (!codeOk) throw new Error(`Mã sản phẩm không hợp lệ: ${productCode}`);
  const colorCode = toColorCode(color);
  if (!colorCode) throw new Error(`Màu "${color}" không tạo được mã (cần có chữ hoặc số)`);
  const sizeCode = String(size ?? '').trim().toUpperCase();
  if (!/^[A-Z0-9]+$/.test(sizeCode)) throw new Error(`Size không hợp lệ: ${size}`);
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
