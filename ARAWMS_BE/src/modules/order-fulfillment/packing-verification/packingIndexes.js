import OrderQrToken from '../../../models/OrderQrToken.js';
import DemoOrderQrToken from '../../../models/DemoOrderQrToken.js';
import PackingSession from '../../../models/PackingSession.js';
import PackingScanEvent from '../../../models/PackingScanEvent.js';
import ProductUnit from '../../../models/ProductUnit.js';
import ProductUnitAllocation from '../../../models/ProductUnitAllocation.js';

let initialization;

// Bảo đảm các UNIQUE index đã được tạo trước mutation đầu tiên.
export const ensurePackingIndexes = () => {
  if (!initialization) {
    initialization = Promise.all([
      OrderQrToken, DemoOrderQrToken, PackingSession,
      PackingScanEvent, ProductUnit, ProductUnitAllocation,
    ].map((model) => model.createIndexes()));
  }
  return initialization;
};
