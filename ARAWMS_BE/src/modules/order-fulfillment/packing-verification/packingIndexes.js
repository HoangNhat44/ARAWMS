/*
 * File: packingIndexes.js
 * Author: Duy Anh
 * Date: 2026-10-21
 * Description: Creates indexes required by packing and QR operations.
 */
import OrderQrToken from '../../../models/OrderQrToken.js';
import PackingSession from '../../../models/PackingSession.js';
import PackingScanEvent from '../../../models/PackingScanEvent.js';
import ProductUnit from '../../../models/ProductUnit.js';
import ProductUnitAllocation from '../../../models/ProductUnitAllocation.js';

let initialization;

// Create unique indexes before the first write to enforce retry and allocation rules.
export const ensurePackingIndexes = () => {
  if (!initialization) {
    initialization = Promise.all([
      OrderQrToken, PackingSession,
      PackingScanEvent, ProductUnit, ProductUnitAllocation,
    ].map((model) => model.createIndexes()));
  }
  return initialization;
};
