/*
 * File: returnOutcomeStatus.test.mjs
 * Author: Duy Anh
 * Date: 2026-11-20
 * Description: RETURNED = bưu kiện đã về kho (đầu vào KCS); RETURN_COMPLETED = KCS đạt 100% (đầu ra).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeOrderReturnOutcome, ALLOWED_RETURN_SCAN_STATUSES } from '../src/modules/garment-technical/return-inspection/returnInspection.service.js';
import { ORDER_STATUS, ORDER_STATUS_LABELS } from '../src/common/constants/enums.js';

const good = { disposition: 'RESTOCK' };
const bad = { disposition: 'QUARANTINE_DEFECT' };

test('100% passed → RETURN_COMPLETED, partial → PARTIALLY_RETURNED, all defective → RETURN_FAILED', () => {
  assert.equal(computeOrderReturnOutcome(2, [good, good]).orderStatus, 'RETURN_COMPLETED');
  assert.equal(computeOrderReturnOutcome(2, [good, bad]).orderStatus, 'PARTIALLY_RETURNED');
  assert.equal(computeOrderReturnOutcome(2, [good]).orderStatus, 'PARTIALLY_RETURNED');
  assert.equal(computeOrderReturnOutcome(2, [bad, bad]).orderStatus, 'RETURN_FAILED');
});

test('RETURNED is still a KCS input status and is labelled as arrived at the warehouse', () => {
  assert.deepEqual(ALLOWED_RETURN_SCAN_STATUSES, ['EXCHANGE_REQUESTED', 'RETURN_REQUESTED', 'RETURNED']);
  assert.ok(ORDER_STATUS.includes('RETURN_COMPLETED'));
  assert.equal(ORDER_STATUS_LABELS.RETURNED, 'Đã hoàn về kho');
  assert.equal(ORDER_STATUS_LABELS.RETURN_COMPLETED, 'Hoàn thành công');
});
