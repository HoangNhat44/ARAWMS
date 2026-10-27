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
import Product from '../../../models/Product.model.js';

/**
 * UC-77: Tra cứu số lượng tồn kho khả dụng theo từng mã SKU ngay trong màn hình chat.
 * Tích hợp tìm kiếm đa tầng theo cả collection Product (tên mẫu mã tiếng Việt, mã SP, danh mục)
 * và collection Sku (mã SKU, mã vạch, màu sắc, size).
 * Công thức: Available = onHandQty - reservedQty
 * @businessRule GBR-10 Phản ánh tồn khả dụng sau khi trừ tồn giữ chỗ
 * @businessRule GBR-08 Kiểm tra ngưỡng cảnh báo tồn kho tối thiểu
 */
export const lookupRealtimeStock = async (searchQuery) => {
  const filter = { isActive: true };

  if (searchQuery && searchQuery.trim()) {
    const s = searchQuery.trim();
    const regex = new RegExp(s, 'i');

    // 1. Tìm các sản phẩm trong collection products khớp tên tiếng Việt hoặc mã sản phẩm
    const matchingProducts = await Product.find({
      isActive: true,
      $or: [
        { productName: regex },
        { productCode: regex },
        { category: regex },
        { sampleCode: regex },
      ],
    }).select('_id').lean();

    const matchingProductIds = matchingProducts.map((p) => p._id);

    // 2. Lọc SKU theo thuộc tính SKU hoặc theo ID sản phẩm khớp
    filter.$or = [
      { skuCode: regex },
      { skuBarcode: regex },
      { styleName: regex },
      { color: regex },
      { size: regex },
      ...(matchingProductIds.length > 0 ? [{ productId: { $in: matchingProductIds } }] : []),
    ];
  }

  // Truy vấn danh sách SKU kèm thông tin từ Product collection
  const skus = await Sku.find(filter)
    .populate('productId', 'productName productCode category season basePrice thumbnailUrl')
    .sort({ onHandQty: -1, styleName: 1, size: 1 }) // Ưu tiên hàng có sẵn tồn kho lên đầu
    .limit(60)
    .lean();

  return skus.map((sku) => {
    const onHand = sku.onHandQty || 0;
    const reserved = sku.reservedQty || 0;
    const available = Math.max(0, onHand - reserved);

    let stockStatus = 'IN_STOCK';
    if (available <= 0) {
      stockStatus = 'OUT_OF_STOCK';
    } else if (available <= (sku.safetyStockThreshold || 10)) {
      stockStatus = 'LOW_STOCK';
    }

    const prod = sku.productId || {};

    return {
      skuId: sku._id,
      skuCode: sku.skuCode,
      skuBarcode: sku.skuBarcode,
      productId: prod._id || null,
      productName: prod.productName || sku.styleName,
      thumbnailUrl: prod.thumbnailUrl || '',
      category: prod.category || '',
      styleName: sku.styleName || prod.productName,
      color: sku.color,
      size: sku.size,
      retailPrice: sku.retailPrice || prod.basePrice || 0,
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
