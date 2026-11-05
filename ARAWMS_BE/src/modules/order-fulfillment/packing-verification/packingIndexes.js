/*
 * File: packingIndexes.js
 * Author: Duy Anh
 * Date: 2026-10-21
 * Description: Creates indexes required by packing and QR operations.
 */
import SalesOrder from '../../../models/SalesOrder.model.js';
import PackingSession from '../../../models/PackingSession.js';
import PackingScanEvent from '../../../models/PackingScanEvent.js';
import ProductUnit from '../../../models/ProductUnit.js';

let initialization;

/** Creates unique indexes before the first packing write.
 * Reuses one initialization promise so concurrent requests share the same setup. */
export const ensurePackingIndexes = () => {
  if (!initialization) {
    initialization = Promise.all([
      SalesOrder, PackingSession, PackingScanEvent, ProductUnit,
    ].map((model) => model.createIndexes()));
  }
  return initialization;
};
