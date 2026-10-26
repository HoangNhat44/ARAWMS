/*
 * File: productUnitService.js
 * Author: Duy Anh
 * Date: 2026-10-21
 * Description: Finds physical product units by barcode.
 */
import ProductUnit from '../../models/ProductUnit.js';

/** Looks up a persisted physical unit; returns null for an unknown barcode. */
export const findProductUnit = async (barcode, dbSession) => {
  return ProductUnit.findOne({ barcode }).session(dbSession).lean();
};
