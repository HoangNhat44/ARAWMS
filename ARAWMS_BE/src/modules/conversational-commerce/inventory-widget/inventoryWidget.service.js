import Sku from '../../../models/Sku.model.js';

/**
 * UC-77: Tra cứu số lượng tồn kho khả dụng theo từng mã SKU ngay trong màn hình chat (Lookup Real-time Available Stock by SKU)
 * Công thức: Available = onHandQty - reservedQty
 */
export const lookupRealtimeStock = async (searchQuery) => {
  const filter = { isActive: true };

  if (searchQuery && searchQuery.trim()) {
    const s = searchQuery.trim();
    const regex = new RegExp(s, 'i');
    filter.$or = [
      { skuCode: regex },
      { skuBarcode: regex },
      { styleName: regex },
      { color: regex },
      { size: regex },
    ];
  }

  const skus = await Sku.find(filter)
    .populate('productId', 'productName category brand')
    .sort({ styleName: 1, size: 1 })
    .limit(50)
    .lean();

  return skus.map((sku) => {
    const onHand = sku.onHandQty || 0;
    const reserved = sku.reservedQty || 0;
    const available = onHand - reserved;

    let stockStatus = 'IN_STOCK';
    if (available <= 0) {
      stockStatus = 'OUT_OF_STOCK';
    } else if (available <= (sku.safetyStockThreshold || 10)) {
      stockStatus = 'LOW_STOCK';
    }

    return {
      skuId: sku._id,
      skuCode: sku.skuCode,
      skuBarcode: sku.skuBarcode,
      product: sku.productId,
      styleName: sku.styleName,
      color: sku.color,
      size: sku.size,
      retailPrice: sku.retailPrice,
      onHandQty: onHand,
      reservedQty: reserved,
      availableQty: available,
      stockStatus,
    };
  });
};

export default {
  lookupRealtimeStock,
};
