import FinishedGoodsBulkDocument from '../../../models/FinishedGoodsBulkDocument.model.js';
import PutawayAllocation from '../../../models/PutawayAllocation.model.js';
import Sku from '../../../models/Sku.model.js';
import Product from '../../../models/Product.model.js';
import MaterialTicket from '../../../models/MaterialTicket.model.js';
import FabricRoll from '../../../models/FabricRoll.model.js';
import MaterialStockLot from '../../../models/MaterialStockLot.model.js';
import RawMaterial from '../../../models/RawMaterial.model.js';

const id = (value) => String(value || '');
const round = (value) => Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;

/** Reports historical shelf placement from confirmed scans, even if stock was later issued. */
export async function listWarehouseInboundProgress() {
  const [finished, raw] = await Promise.all([
    FinishedGoodsBulkDocument.find({ direction: 'IN', isDeleted: { $ne: true } })
      .select('documentCode sourceTicketId items.skuId items.quantity createdAt').sort({ createdAt: -1 }).lean(),
    MaterialTicket.find({ ticketType: { $in: ['INBOUND_FROM_SUPPLIER', 'INBOUND_FROM_PLAN',
      'INBOUND_FROM_REMNANT'] },
      status: 'COMPLETED', 'receiptLines.0': { $exists: true }, isDeleted: { $ne: true } })
      .select('ticketCode inboundRequestId remnantRequestId receiptLines.rawMaterialId receiptLines.acceptedQty putawayEvents createdAt')
      .sort({ createdAt: -1 }).lean(),
  ]);
  const finishedIds = finished.map((item) => item._id);
  const rawIds = raw.map((item) => item._id);
  const [allocations, skus, rolls, lots, materials] = await Promise.all([
    PutawayAllocation.find({ sourceReceiptId: { $in: finishedIds }, status: 'CONFIRMED' })
      .select('sourceReceiptId lines.skuId lines.allocatedQuantity lines.placedQuantity').lean(),
    Sku.find({ _id: { $in: finished.flatMap((item) => (item.items || []).map((line) => line.skuId)) } })
      .select('skuCode productId').lean(),
    FabricRoll.find({ inboundTicketId: { $in: rawIds } })
      .select('inboundTicketId rollBarcode rawMaterialId').lean(),
    MaterialStockLot.find({ inboundTicketId: { $in: rawIds }, quality: 'ACCEPTED' })
      .select('inboundTicketId lotBarcode rawMaterialId').lean(),
    RawMaterial.find({ _id: { $in: raw.flatMap((item) => (item.receiptLines || []).map((line) => line.rawMaterialId)) } })
      .select('materialCode materialName unit').lean(),
  ]);
  const products = await Product.find({ _id: { $in: skus.map((sku) => sku.productId) } })
    .select('productName').lean();
  const productById = new Map(products.map((item) => [id(item._id), item]));
  const skuById = new Map(skus.map((item) => [id(item._id), item]));
  const materialById = new Map(materials.map((item) => [id(item._id), item]));
  const allocationByReceipt = new Map();
  for (const allocation of allocations) {
    const key = id(allocation.sourceReceiptId);
    const rows = allocationByReceipt.get(key) || [];
    rows.push(...(allocation.lines || []));
    allocationByReceipt.set(key, rows);
  }
  const objectMaterial = new Map([...rolls.map((item) =>
    [`${id(item.inboundTicketId)}:${item.rollBarcode}`, id(item.rawMaterialId)]),
  ...lots.map((item) => [`${id(item.inboundTicketId)}:${item.lotBarcode}`, id(item.rawMaterialId)])]);

  const finishedProgress = finished.map((receipt) => {
    const planned = allocationByReceipt.get(id(receipt._id)) || [];
    const lines = (receipt.items || []).map((line) => {
      const accepted = Number(line.quantity || 0);
      const matching = planned.filter((item) => id(item.skuId) === id(line.skuId));
      const placed = Math.min(accepted, matching.reduce((sum, item) => sum + Number(item.placedQuantity || 0), 0));
      const allocated = Math.min(accepted, matching.reduce((sum, item) => sum + Number(item.allocatedQuantity || 0), 0));
      const sku = skuById.get(id(line.skuId));
      return { code: sku?.skuCode || id(line.skuId), name: productById.get(id(sku?.productId))?.productName || '',
        unit: 'PIECE', accepted, placed, waiting: Math.max(0, allocated - placed),
        unallocated: Math.max(0, accepted - allocated), remaining: Math.max(0, accepted - placed) };
    });
    return { id: id(receipt._id), code: receipt.documentCode, warehouse: 'FINISHED_GOODS',
      sourceRequestId: id(receipt.sourceTicketId), createdAt: receipt.createdAt, lines };
  });
  const materialProgress = raw.map((receipt) => {
    const placedByMaterial = new Map();
    for (const event of receipt.putawayEvents || []) {
      const materialId = objectMaterial.get(`${id(receipt._id)}:${event.barcode}`);
      if (materialId) placedByMaterial.set(materialId,
        round((placedByMaterial.get(materialId) || 0) + Number(event.quantity || 0)));
    }
    const lines = (receipt.receiptLines || []).filter((line) => Number(line.acceptedQty || 0) > 0)
      .map((line) => {
        const materialId = id(line.rawMaterialId);
        const accepted = Number(line.acceptedQty || 0);
        const placed = Math.min(accepted, placedByMaterial.get(materialId) || 0);
        placedByMaterial.set(materialId, Math.max(0, (placedByMaterial.get(materialId) || 0) - placed));
        const material = materialById.get(materialId);
        return { code: material?.materialCode || materialId, name: material?.materialName || '',
          unit: material?.unit || '', accepted, placed, remaining: round(Math.max(0, accepted - placed)) };
      });
    return { id: id(receipt._id), code: receipt.ticketCode, warehouse: 'RAW_MATERIAL',
      sourceRequestId: id(receipt.inboundRequestId || receipt.remnantRequestId),
      createdAt: receipt.createdAt, lines };
  });
  return [...finishedProgress, ...materialProgress].sort((a, b) =>
    new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}
