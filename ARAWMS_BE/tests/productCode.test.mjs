/*
 * File: productCode.test.mjs
 * Author: Duy Anh
 * Date: 2026-11-14
 * Description: Unit tests for shared product/SKU code rules.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidProductCode, normalizeProductCode, toColorCode, buildSkuCode } from '../src/common/utils/productCode.js';

test('product code accepts uppercase letters and digits only', () => {
  assert.equal(isValidProductCode('AL186'), true);
  assert.equal(isValidProductCode('A1'), true);
  for (const bad of ['A', 'AL-186', 'al186', 'ÁO01', 'AL_186', 'AL 186', 'A'.repeat(21), '']) {
    assert.equal(isValidProductCode(bad), false, bad);
  }
  assert.equal(normalizeProductCode('  al186 '), 'AL186');
});

test('color code removes Vietnamese diacritics and separators', () => {
  assert.equal(toColorCode('Trắng'), 'TRANG');
  assert.equal(toColorCode('Đỏ đô'), 'DODO');
  assert.equal(toColorCode('Xanh lá'), 'XANHLA');
  assert.equal(toColorCode('xanh-lá cây'), 'XANHLACAY');
  assert.equal(toColorCode('Kem 02'), 'KEM02');
  assert.equal(toColorCode('!!!'), '');
  assert.equal(toColorCode(''), '');
});

test('SKU code is PRODUCT-COLOR-SIZE and rejects unusable parts', () => {
  assert.equal(buildSkuCode('AL186', 'Trắng', 'M'), 'AL186-TRANG-M');
  assert.equal(buildSkuCode('AL186', 'Đỏ đô', 'freesize'), 'AL186-DODO-FREESIZE');
  assert.throws(() => buildSkuCode('AL-186', 'Trắng', 'M'));
  assert.throws(() => buildSkuCode('AL186', '!!!', 'M'));
  assert.throws(() => buildSkuCode('AL186', 'Trắng', ''));
});
