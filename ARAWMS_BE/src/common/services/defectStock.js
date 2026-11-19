/*
 * File: defectStock.js
 * Author: Duy Anh
 * Date: 2026-11-19
 * Description: Defective finished-goods quantity per SKU, counted from the physical units
 * (ProductUnit DEFECT_PENDING + DEFECTIVE). Replaces the old Sku.defectQuarantineQty counter, which no
 * flow maintained after defects started being tracked per unit. Defective units are never part of
 * Sku.onHandQty.
 */
import ProductUnit, { DEFECT_HELD_STATUSES } from '../../models/ProductUnit.js';

/**
 * Aggregation stages for a pipeline on `skus`: adds `defectQty` (number of defective units still held).
 * @returns {Array<object>} Stages to spread right after the pipeline's $match.
 */
export const withDefectQty = () => [
  { $lookup: { from: 'product_units', localField: '_id', foreignField: 'skuId',
    pipeline: [{ $match: { inventoryStatus: { $in: DEFECT_HELD_STATUSES } } }, { $count: 'n' }], as: '_defectCount' } },
  { $addFields: { defectQty: { $ifNull: [{ $arrayElemAt: ['$_defectCount.n', 0] }, 0] } } },
  { $project: { _defectCount: 0 } },
];

/**
 * Defective units still held, per SKU.
 * @param {Array} [skuIds] Limit to these SKUs; all SKUs when omitted.
 * @returns {Promise<Map<string, number>>} skuId -> defective unit count (SKUs without defects are absent).
 */
export const defectQtyBySku = async (skuIds) => {
  const match = { inventoryStatus: { $in: DEFECT_HELD_STATUSES } };
  if (skuIds) match.skuId = { $in: skuIds };
  const rows = await ProductUnit.aggregate([{ $match: match }, { $group: { _id: '$skuId', n: { $sum: 1 } } }]);
  return new Map(rows.map((row) => [String(row._id), row.n]));
};
