/**
 * ============================================================================
 * @title        : Real-time SKU Inventory Widget Service
 * @author       : Nguyễn Quang Huy
 * @createdDate  : 2026-10-27
 * @lastModified : 2026-10-27
 * @description  : Cung cấp logic tra cứu tồn kho khả dụng theo thời gian thực (UC-77)
 *                 giúp Seller tư vấn chính xác số lượng hàng còn bán được cho khách.
 * @module       : Conversational Commerce / Inventory Widget
 * @layer        : Service
 * ============================================================================
 */

import Sku from '../../../models/Sku.model.js';
import '../../../models/Product.model.js'; // Đảm bảo Product schema đã được đăng ký với Mongoose trước khi populate

/**
 * UC-77: Tra cứu số lượng tồn kho khả dụng theo từng mã SKU ngay trong màn hình chat
 * Công thức: Available = onHandQty - reservedQty
 * @businessRule GBR-10 Phản ánh tồn khả dụng sau khi trừ tồn giữ chỗ
 * @businessRule GBR-08 Kiểm tra ngưỡng cảnh báo tồn kho tối thiểu
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
