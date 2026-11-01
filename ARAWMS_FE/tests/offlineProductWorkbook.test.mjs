/*
 * File: offlineProductWorkbook.test.mjs
 * Author: Duy Anh
 * Date: 2026-10-30
 * Description: Checks local Excel preview before catalog changes enter the sync queue.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { previewProductWorkbook } from '../src/services/offlineProductWorkbook.js';

const workbookFile = async (rows) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Products');
  for (const [column, value] of [[1, 'STT'], [2, 'Mã sản phẩm'], [3, 'Tên sản phẩm'],
    [5, 'Mã mẫu mã'], [9, 'Danh mục'], [21, 'Giá bán'], [48, 'SIZE (Thuộc tính)']]) {
    sheet.getRow(1).getCell(column).value = value;
  }
  for (const [index, item] of rows.entries()) {
    const row = sheet.getRow(index + 2);
    for (const [column, value] of Object.entries(item)) row.getCell(Number(column)).value = value;
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return { name: 'products.xlsx', size: buffer.byteLength, arrayBuffer: async () => buffer };
};

test('groups valid size rows and retains stable source row numbers', async () => {
  const file = await workbookFile([
    { 1: 1, 2: 'IMPORT-01', 3: 'Áo - Đỏ', 5: 'IMPORT-M', 9: 'Áo', 21: 100000, 48: 'M' },
    { 1: 1, 2: 'IMPORT-01', 3: 'Áo - Đỏ', 5: 'IMPORT-L', 9: 'Áo', 21: 100000, 48: 'L' },
  ]);
  const result = await previewProductWorkbook(file, ['Áo']);
  assert.deepEqual(result.errors, []);
  assert.equal(result.productCount, 1);
  assert.deepEqual(result.products[0].rows, [2, 3]);
  assert.deepEqual(result.products[0].variants.map((item) => item.size), ['M', 'L']);
});

test('reports duplicate SKU and unavailable category before queueing', async () => {
  const file = await workbookFile([
    { 1: 1, 2: 'IMPORT-01', 3: 'Áo - Đỏ', 5: 'IMPORT-M', 9: 'Áo', 21: 100000, 48: 'M' },
    { 1: 2, 2: 'IMPORT-02', 3: 'Quần - Đen', 5: 'IMPORT-M', 9: 'Quần', 21: 120000, 48: 'L' },
  ]);
  const result = await previewProductWorkbook(file, ['Áo']);
  assert.equal(result.productCount, 1);
  assert.equal(result.errors[0].row, 3);
  assert.match(result.errors[0].message, /Danh mục chưa có|SKU bị trùng/);
});

test('retains valid media URLs for upload after reconnecting', async () => {
  const file = await workbookFile([{ 1: 1, 2: 'IMPORT-03', 3: 'Áo - Xanh', 5: 'IMPORT-03-M',
    6: 'https://example.test/image.jpg', 9: 'Áo', 21: 100000, 48: 'M' }]);
  const result = await previewProductWorkbook(file, ['Áo']);
  assert.deepEqual(result.errors, []);
  assert.equal(result.products[0].imageUrl, 'https://example.test/image.jpg');
});
