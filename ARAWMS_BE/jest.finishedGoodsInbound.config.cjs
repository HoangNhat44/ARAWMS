/*
 * File: jest.finishedGoodsInbound.config.cjs
 * Author: Duy Anh
 * Date: 2026-10-29
 * Description: Runs the finished goods receiving test file with native ES modules.
 */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/gear_test/unit_test/finishedGoodsInbound.unit.test.js'],
  transform: {},
  testTimeout: 120000,
  verbose: true,
};
