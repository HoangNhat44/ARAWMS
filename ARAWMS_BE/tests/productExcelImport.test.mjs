/*
 * File: productExcelImport.test.mjs
 * Author: Duy Anh
 * Date: 2026-11-14
 * Description: Checks that the product workbook parser groups rows by product code and reads colors.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { parseProductWorkbook } from '../src/modules/warehouse-management/products/productExcelImport.js';

/** Builds an XLSX buffer with the export layout; rows are [stt, code, name, size, price, extra]. */
const workbook = async (rows, { colorColumn = 0 } = {}) => {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Sheet1');
  const header = sheet.getRow(1);
  [[1, 'STT'], [2, 'Mã sản phẩm'], [3, 'Tên sản phẩm'], [5, 'Mã mẫu mã'], [9, 'Danh mục'],
    [21, 'Giá bán'], [48, 'SIZE (Thuộc tính)']].forEach(([column, text]) => { header.getCell(column).value = text; });
  if (colorColumn) header.getCell(colorColumn).value = 'Màu';
  rows.forEach(([stt, code, name, size, price, color], index) => {
    const row = sheet.getRow(index + 2);
    row.getCell(1).value = stt; row.getCell(2).value = code; row.getCell(3).value = name;
    row.getCell(9).value = 'Áo'; row.getCell(21).value = price; row.getCell(48).value = size;
    if (colorColumn) row.getCell(colorColumn).value = color;
  });
  return Buffer.from(await book.xlsx.writeBuffer());
};

test('rows with the same product code become one product with color × size variants', async () => {
  const parsed = await parseProductWorkbook(await workbook([
    ['1', 'AL186', 'Áo len - Trắng', 'M', 100000],
    ['1', 'AL186', 'Áo len - Trắng', 'L', 100000],
    ['1', 'al186', 'Áo len - Đỏ', 'M', 110000],
  ]));
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.products.length, 1);
  const [product] = parsed.products;
  assert.equal(product.productCode, 'AL186');
  assert.equal(product.productName, 'Áo len');
  assert.deepEqual(product.variants.map((variant) => `${variant.color}/${variant.size}`), ['Trắng/M', 'Trắng/L', 'Đỏ/M']);
});

test('a "Màu" column is used when present and a matching name suffix is dropped', async () => {
  const parsed = await parseProductWorkbook(await workbook([
    ['1', 'AL187', 'Áo len cổ lọ', 'M', 100000, 'Xanh lá'],
    ['1', 'AL187', 'Áo len cổ lọ - Kem', 'M', 100000, 'Kem'],
  ], { colorColumn: 49 }));
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.products[0].productName, 'Áo len cổ lọ');
  assert.deepEqual(parsed.products[0].variants.map((variant) => variant.color), ['Xanh lá', 'Kem']);
});

test('an empty "Màu" cell falls back to the name suffix so one file can mix both styles', async () => {
  const parsed = await parseProductWorkbook(await workbook([
    ['1', 'AL500', 'Áo khoác dạ - Be', 'M', 100000, ''],
    ['2', 'V600', 'Váy xòe', 'S', 100000, 'Hồng phấn'],
    ['3', 'V601', 'Váy không màu', 'S', 100000, ''],
  ], { colorColumn: 49 }));
  assert.deepEqual(parsed.products.map((product) => `${product.productCode}:${product.productName}:${product.variants[0].color}`),
    ['AL500:Áo khoác dạ:Be', 'V600:Váy xòe:Hồng phấn']);
  assert.equal(parsed.errors.length, 1);
  assert.match(parsed.errors[0].message, /Không xác định được màu/);
});

test('a color carried in the code (CV90-KEM) splits into product CV90 + color, matching the shop export', async () => {
  const parsed = await parseProductWorkbook(await workbook([
    ['11', 'AL186-KEM', 'AL186 SET LEN (KHOÁC+ÁO DÂY) - KEM', 'M', 560000],
    ['12', 'AL186-HONG', 'AL186 SET LEN (KHOÁC+ÁO DÂY) - HỒNG', 'M', 560000],
    ['5', 'V179-TRANG', 'V179 VÁY XÒE CÁCH ĐIỆU- TRẮNG', 'S', 765000],
    ['8', 'Q22-ĐEN', 'Q22 QUẦN DÀI', 'L', 595000],
  ]));
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(parsed.products.map((product) => `${product.productCode}:${product.productName}:`
    + product.variants.map((variant) => variant.color).join('+')),
  ['AL186:AL186 SET LEN (KHOÁC+ÁO DÂY):Kem+Hồng', 'V179:V179 VÁY XÒE CÁCH ĐIỆU:Trắng', 'Q22:Q22 QUẦN DÀI:Đen']);
});

test('bad codes, missing colors, duplicates and colliding color codes are row errors', async () => {
  const parsed = await parseProductWorkbook(await workbook([
    ['1', 'AL186-KEM-X', 'Áo len - Kem', 'M', 100000],
    ['2', 'AL188', 'Áo không màu', 'M', 100000],
    ['3', 'AL189', 'Áo - Đỏ', 'M', 100000],
    ['3', 'AL189', 'Áo - Đỏ', 'M', 100000],
    ['3', 'AL189', 'Áo - Do', 'L', 100000],
  ]));
  const messages = Object.fromEntries(parsed.errors.map((item) => [item.row, item.message]));
  assert.match(messages[2], /chỉ một dấu gạch trước màu/);
  assert.match(messages[3], /Không xác định được màu/);
  assert.match(messages[5], /Màu và size bị trùng/);
  assert.match(messages[6], /trùng mã DO/);
  assert.equal(parsed.products.length, 1);
  assert.equal(parsed.products[0].variants.length, 1);
});
