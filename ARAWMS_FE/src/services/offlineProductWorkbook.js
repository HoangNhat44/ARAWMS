/*
 * File: offlineProductWorkbook.js
 * Author: Duy Anh
 * Date: 2026-10-30
 * Description: Validates product variation workbooks locally before queuing each product for sync.
 *              Mirrors ARAWMS_BE/.../productExcelImport.js: one product per product code (e.g. AL186);
 *              every color × size row is a variant whose SKU code is PRODUCTCODE-COLORCODE-SIZE.
 */
import {
  colorNameFromCode, isValidProductCode, normalizeColorKey, normalizeProductCode, previewSkuCode, splitColoredProductCode, toColorCode,
} from '../utils/productCode';

// Column 5 "Mã mẫu mã" of the source export is no longer read: SKU codes are generated.
const headers = new Map([[1, 'STT'], [2, 'Mã sản phẩm'], [3, 'Tên sản phẩm'],
  [9, 'Danh mục'], [21, 'Giá bán'], [48, 'SIZE (Thuộc tính)']]);
const sizes = new Set(['XS', 'S', 'M', 'L', 'XL', 'XXL', 'FREESIZE']);
const COLOR_HEADERS = new Set(['màu', 'màu sắc']);
const clean = (value) => String(value ?? '').normalize('NFKC').trim();
const cell = (row, column) => clean(row.getCell(column).text);

/** Finds an optional "Màu" / "Màu sắc" column anywhere in the header row. */
const findColorColumn = (headerRow) => {
  let found = 0;
  headerRow.eachCell({ includeEmpty: false }, (item, column) => {
    if (!found && COLOR_HEADERS.has(clean(item.text).toLocaleLowerCase('vi-VN'))) found = column;
  });
  return found;
};

/** A filled "Màu" cell wins (the name keeps all but a trailing " - <color>"); otherwise the color is the last " - " part. */
const splitNameAndColor = (rawName, colorCell, hasColorColumn) => {
  // "Tên - Màu" and "Tên- Màu" both count; a hyphen inside a word ("T-shirt") does not.
  const parts = rawName.split(/\s+-\s*|\s*-\s+/);
  const suffix = parts.length > 1 ? parts.at(-1) : '';
  // An empty "Màu" cell falls back to the name suffix, so one file may mix both styles.
  const color = hasColorColumn && clean(colorCell) ? colorCell : suffix;
  const sameAsSuffix = suffix && normalizeColorKey(suffix) === normalizeColorKey(color);
  return { color: clean(color), productName: sameAsSuffix ? parts.slice(0, -1).join(' - ') : rawName };
};

/** Colors written in capitals ("HỒNG") are stored as "Hồng"; mixed case is kept as typed. */
const displayColor = (value) => {
  const text = clean(value);
  if (!text || text !== text.toLocaleUpperCase('vi-VN')) return text;
  const lower = text.toLocaleLowerCase('vi-VN');
  return lower.charAt(0).toLocaleUpperCase('vi-VN') + lower.slice(1);
};

/** Returns products with stable source-row IDs and errors without contacting the server.
 * existingCodes are product codes already loaded on this device, so duplicates show in preview;
 * the server still checks the database when each product syncs.
 */
export const previewProductWorkbook = async (file, categories = [], existingCodes = []) => {
  if (!file || !/\.xlsx$/i.test(file.name) || file.size > 5 * 1024 * 1024) {
    throw new Error('Chọn file .xlsx không quá 5 MB.');
  }
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('File Excel không có trang dữ liệu.');
  for (const [column, expected] of headers) {
    if (cell(sheet.getRow(1), column) !== expected) throw new Error(`Cột ${column} phải là "${expected}".`);
  }
  const colorColumn = findColorColumn(sheet.getRow(1));
  const products = new Map();
  const errors = [];
  const seenBarcodes = new Set();
  const seenStt = new Map();
  let variantCount = 0;
  const categorySet = new Set(categories.map((value) => value.toLocaleLowerCase('vi-VN')));
  const existingCodeSet = new Set(existingCodes.map(normalizeProductCode));
  for (let number = 2; number <= sheet.rowCount; number += 1) {
    const row = sheet.getRow(number);
    if (!row.hasValues) continue;
    const stt = cell(row, 1);
    const rawCode = cell(row, 2);
    // Source files may carry the color in the code ("CV90-KEM"): the product is CV90, the color Kem.
    const colored = splitColoredProductCode(rawCode);
    const productCode = colored ? colored.productCode : normalizeProductCode(rawCode);
    const named = splitNameAndColor(cell(row, 3), colorColumn ? cell(row, colorColumn) : '', Boolean(colorColumn));
    // Color source order: "Màu" column, then the name suffix, then the color in the code.
    const color = displayColor(named.color) || (colored ? colorNameFromCode(colored.colorSegment) : '');
    const { productName } = named;
    const category = cell(row, 9);
    const size = cell(row, 48).toUpperCase();
    const attribute = cell(row, 11).toUpperCase();
    const priceText = cell(row, 21);
    const price = Number(priceText.replace(/,/g, ''));
    const barcode = cell(row, 12);
    const imageUrl = cell(row, 6);
    const videoUrl = cell(row, 7);
    const description = cell(row, 34);
    const thresholdText = cell(row, 33);
    const threshold = thresholdText ? Number(thresholdText) : 10;
    const colorCode = toColorCode(color);
    const product = products.get(productCode);
    const rowErrors = [];
    if (!/^\d+$/.test(stt)) rowErrors.push('STT phải là số nguyên');
    if (!isValidProductCode(productCode)) rowErrors.push(rawCode.includes('-')
      ? `Mã sản phẩm "${rawCode}" không hợp lệ (dạng AL186 hoặc AL186-KEM, chỉ một dấu gạch trước màu)`
      : 'Mã sản phẩm cần 2–20 chữ in hoa hoặc số, không dấu');
    else if (existingCodeSet.has(productCode)) rowErrors.push(`Mã sản phẩm ${productCode} đã tồn tại`);
    // A color written in the name or the "Màu" column must agree with the color in the code.
    if (colored && named.color && !toColorCode(named.color).startsWith(toColorCode(colored.colorSegment))) {
      rowErrors.push(`Màu trong mã "${rawCode}" khác màu "${named.color}" ghi ở tên hoặc cột Màu`);
    }
    if (!productName || productName.length > 200) rowErrors.push('Tên sản phẩm không hợp lệ');
    if (!category || category.length > 100) rowErrors.push('Danh mục không hợp lệ');
    if (categorySet.size && !categorySet.has(category.toLocaleLowerCase('vi-VN'))) rowErrors.push('Danh mục chưa có trong dữ liệu đã tải');
    if (!sizes.has(size)) rowErrors.push('Size không hợp lệ');
    if (attribute && attribute !== `SIZE: ${size}`) rowErrors.push('Thuộc tính không khớp size');
    if (!priceText || !Number.isFinite(price) || price < 0) rowErrors.push('Giá bán không hợp lệ');
    if (!color || color.length > 80 || !colorCode) rowErrors.push('Không xác định được màu (ghi màu trong mã dạng AL186-KEM, cột Màu hoặc tên dạng "Tên - Màu")');
    if (description.length > 2000) rowErrors.push('Mô tả quá 2000 ký tự');
    if (!Number.isSafeInteger(threshold) || threshold < 0) rowErrors.push('Ngưỡng cảnh báo không hợp lệ');
    if (barcode.length > 128 || /\s/.test(barcode)) rowErrors.push('Mã vạch không hợp lệ');
    if (seenStt.has(stt) && seenStt.get(stt) !== productCode) rowErrors.push('Cùng STT phải có cùng mã sản phẩm');
    if (barcode && seenBarcodes.has(barcode)) rowErrors.push('Barcode bị trùng trong file');
    // STT, image and video are not compared: the source export numbers each color code separately
    // and each color row may bring its own picture.
    if (product && (product.productName !== productName || product.category !== category)) {
      rowErrors.push('Thông tin chung không khớp các dòng cùng mã sản phẩm');
    }
    if (product?.variants.some((variant) => normalizeColorKey(variant.color) === normalizeColorKey(color) && variant.size === size)) {
      rowErrors.push('Màu và size bị trùng trong sản phẩm');
    }
    const sameCode = product?.variants.find((variant) => toColorCode(variant.color) === colorCode &&
      normalizeColorKey(variant.color) !== normalizeColorKey(color));
    if (sameCode) rowErrors.push(`Màu "${color}" trùng mã ${colorCode} với màu "${sameCode.color}"`);
    for (const url of [imageUrl, videoUrl]) {
      if (url && (!/^https?:\/\//i.test(url) || url.length > 2000)) rowErrors.push('URL ảnh/video không hợp lệ');
    }
    if (rowErrors.length) { errors.push({ row: number, message: rowErrors.join('; ') }); continue; }
    seenStt.set(stt, productCode); if (barcode) seenBarcodes.add(barcode);
    if (!product) products.set(productCode, { stt, productCode, productName, category,
      description, imageUrl, videoUrl, imageUrls: [], basePrice: price, variants: [], rows: [] });
    // First image is the cover; other distinct images (usually one per color) become extra images.
    const target = products.get(productCode);
    if (imageUrl && !target.imageUrls.includes(imageUrl)) target.imageUrls.push(imageUrl);
    if (!target.imageUrl) target.imageUrl = imageUrl;
    if (!target.videoUrl) target.videoUrl = videoUrl;
    products.get(productCode).variants.push({ color, size, price, barcode, threshold, row: number,
      skuCode: previewSkuCode(productCode, color, size) });
    products.get(productCode).rows.push(number);
    variantCount += 1;
  }
  if (!products.size && !errors.length) errors.push({ row: 1, message: 'File không có sản phẩm' });
  if (products.size > 500 || variantCount > 5000) errors.push({ row: 1, message: 'File vượt giới hạn 500 sản phẩm hoặc 5000 SKU' });
  return { products: [...products.values()], errors, productCount: products.size, variantCount };
};
