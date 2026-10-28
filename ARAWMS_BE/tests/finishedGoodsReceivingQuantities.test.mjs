/*
 * File: finishedGoodsReceivingQuantities.test.mjs
 * Author: Duy Anh
 * Date: 2026-10-29
 * Description: Verifies quantity boundaries for finished goods receipt inspection.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { receivingQuantityError } from '../src/modules/warehouse-management/products/bulkStock.routes.js';

test('accepts equal handoff and receipt, then derives repair from the accepted count', () => {
  assert.equal(receivingQuantityError({ expectedQty: 10, receivedQty: 10, quantity: 7 }), null);
  assert.equal(receivingQuantityError({ expectedQty: 10, receivedQty: 8, quantity: 0 }), null);
  assert.equal(receivingQuantityError({ expectedQty: 10, receivedQty: 8, quantity: 6, repairQty: 2 }), null);
});

test('rejects receipt above factory handoff or accepted count above receipt', () => {
  assert.match(receivingQuantityError({ expectedQty: 5, receivedQty: 6, quantity: 4 }), /không vượt/);
  assert.match(receivingQuantityError({ expectedQty: 6, receivedQty: 5, quantity: 6 }), /số thực nhận/);
});

test('requires all entered counts and rejects a conflicting repair count', () => {
  assert.match(receivingQuantityError({ receivedQty: 5, quantity: 3 }), /bàn giao/);
  assert.match(receivingQuantityError({ expectedQty: 5, receivedQty: 5, quantity: '' }), /đạt nhập kho/);
  assert.match(receivingQuantityError({ expectedQty: 5, receivedQty: 5, quantity: 3, repairQty: 1 }), /trừ đạt/);
});
