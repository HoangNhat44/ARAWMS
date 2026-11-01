/*
 * File: offlineProductWorkbook.js
 * Author: Duy Anh
 * Date: 2026-10-30
 * Description: Validates product variation workbooks locally before queuing each product for sync.
 */

const headers = new Map([[1, 'STT'], [2, 'Mã sản phẩm'], [3, 'Tên sản phẩm'], [5, 'Mã mẫu mã'],
  [9, 'Danh mục'], [21, 'Giá bán'], [48, 'SIZE (Thuộc tính)']]);
const sizes = new Set(['XS', 'S', 'M', 'L', 'XL', 'XXL', 'FREESIZE']);
const clean = (value) => String(value ?? '').normalize('NFKC').trim();
const cell = (row, column) => clean(row.getCell(column).text);
const codePattern = /^[\p{L}\p{N}_-]{2,64}$/u;

/** Returns products with stable source-row IDs and errors without contacting the server. */
export const previewProductWorkbook = async (file, categories = []) => {
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
  const products = new Map();
  const errors = [];
  const seenSkus = new Set();
  const seenBarcodes = new Set();
  const seenStt = new Map();
  const categorySet = new Set(categories.map((value) => value.toLocaleLowerCase('vi-VN')));
  for (let number = 2; number <= sheet.rowCount; number += 1) {
    const row = sheet.getRow(number);
    if (!row.hasValues) continue;
    const stt = cell(row, 1);
    const productCode = cell(row, 2).toUpperCase();
    const productName = cell(row, 3);
    const skuCode = cell(row, 5).toUpperCase();
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
    const color = clean(productName.includes(' - ') ? productName.split(/\s+-\s+/).at(-1) : productCode.split('-').at(-1));
    const product = products.get(productCode);
    const rowErrors = [];
    if (!/^\d+$/.test(stt)) rowErrors.push('STT phải là số nguyên');
    if (!codePattern.test(productCode)) rowErrors.push('Mã sản phẩm không hợp lệ');
    if (!productName || productName.length > 200) rowErrors.push('Tên sản phẩm không hợp lệ');
    if (!codePattern.test(skuCode)) rowErrors.push('Mã mẫu mã không hợp lệ');
    if (!category || category.length > 100) rowErrors.push('Danh mục không hợp lệ');
    if (categorySet.size && !categorySet.has(category.toLocaleLowerCase('vi-VN'))) rowErrors.push('Danh mục chưa có trong dữ liệu đã tải');
    if (!sizes.has(size)) rowErrors.push('Size không hợp lệ');
    if (attribute && attribute !== `SIZE: ${size}`) rowErrors.push('Thuộc tính không khớp size');
    if (!priceText || !Number.isFinite(price) || price < 0) rowErrors.push('Giá bán không hợp lệ');
    if (!color || color.length > 80) rowErrors.push('Không xác định được màu');
    if (description.length > 2000) rowErrors.push('Mô tả quá 2000 ký tự');
    if (!Number.isSafeInteger(threshold) || threshold < 0) rowErrors.push('Ngưỡng cảnh báo không hợp lệ');
    if (seenStt.has(stt) && seenStt.get(stt) !== productCode) rowErrors.push('Cùng STT phải có cùng mã sản phẩm');
    if (seenSkus.has(skuCode)) rowErrors.push('Mã SKU bị trùng trong file');
    if (barcode && seenBarcodes.has(barcode)) rowErrors.push('Barcode bị trùng trong file');
    if (product && (product.stt !== stt || product.productName !== productName || product.category !== category ||
        product.color !== color || product.imageUrl !== imageUrl || product.videoUrl !== videoUrl)) {
      rowErrors.push('Thông tin chung không khớp các dòng cùng sản phẩm');
    }
    if (product?.variants.some((variant) => variant.size === size)) rowErrors.push('Size bị trùng trong sản phẩm');
    for (const url of [imageUrl, videoUrl]) {
      if (url && (!/^https?:\/\//i.test(url) || url.length > 2000)) rowErrors.push('URL ảnh/video không hợp lệ');
    }
    if (rowErrors.length) { errors.push({ row: number, message: rowErrors.join('; ') }); continue; }
    seenStt.set(stt, productCode); seenSkus.add(skuCode); if (barcode) seenBarcodes.add(barcode);
    if (!product) products.set(productCode, { stt, productCode, productName, category, color,
      description, imageUrl, videoUrl, basePrice: price, variants: [], rows: [] });
    products.get(productCode).variants.push({ skuCode, size, price, barcode, threshold, row: number });
    products.get(productCode).rows.push(number);
  }
  if (!products.size && !errors.length) errors.push({ row: 1, message: 'File không có sản phẩm' });
  if (products.size > 500 || seenSkus.size > 5000) errors.push({ row: 1, message: 'File vượt giới hạn 500 sản phẩm hoặc 5000 SKU' });
  return { products: [...products.values()], errors,
    productCount: products.size, variantCount: [...products.values()].reduce((sum, item) => sum + item.variants.length, 0) };
};
