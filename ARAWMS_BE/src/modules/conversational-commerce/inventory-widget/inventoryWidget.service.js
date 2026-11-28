/**
 * ============================================================================
 * @title        : Real-time SKU Inventory Widget Service (Optimized)
 * @author       : Nguyễn Quang Huy
 * @createdDate  : 2026-10-27
 * @lastModified : 2026-10-28
 * @description  : Cung cấp logic tra cứu tồn kho khả dụng theo thời gian thực (UC-77)
 *                 giúp Seller tư vấn chính xác số lượng hàng còn bán được cho khách.
 *                 (Tối ưu hóa: escapeRegex chống ReDoS/crash, tối ưu truy vấn lean, index).
 * @module       : Conversational Commerce / Inventory Widget
 * @layer        : Service
 * ============================================================================
 */

import Sku from '../../../models/Sku.model.js';
import Product from '../../../models/Product.model.js';

/** Escape ký tự đặc biệt để chuỗi tìm kiếm an toàn tuyệt đối với RegExp */
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * ====================================================================================================================================
 * [BẢNG TRA CỨU NGUỒN GỐC SỐ LIỆU, BỘ LỌC & TRẠNG THÁI - BE: TRA CỨU TỒN KHO REALTIME (UC-77)]
 * ====================================================================================================================================
 * | STT | Trường trả về / Bộ lọc       | Màn hình FE hiển thị                     | Nguồn DB (Collection.field)                       | Nghiệp vụ / Công thức / BR                        |
 * |-----|------------------------------|------------------------------------------|---------------------------------------------------|---------------------------------------------------|
 * | 1   | availableQty                 | Badge "Còn X" / "Hết hàng" / "X sẵn kho" | skus.{onHandQty, reservedQty} (isActive=true)     | [BR: GBR-10] max(0, onHandQty - reservedQty)      |
 * | 2   | stockStatus                  | Nhãn IN_STOCK / LOW_STOCK / OUT_OF_STOCK | skus.{onHandQty,reservedQty,safetyStockThreshold} | [BR: GBR-08] <=0: Hết; <=threshold(10): Sắp hết   |
 * | 3   | stockFilter (ALL/IN/OUT)     | Thanh lọc Tất cả/Còn hàng/Hết hàng       | Lọc trên availableQty (>0 hoặc <=0)               | Hỗ trợ lọc ở cả API (query.stockFilter) & FE      |
 * | 4   | thumbnailUrl, additionalImg  | Ảnh thu nhỏ & Modal phóng to ảnh SP      | products.{thumbnailUrl, additionalImageUrls[]}    | Bấm thumbnail trên QuickOrder mở ảnh sản phẩm     |
 * | 5   | retailPrice                  | Giá bán trên danh sách & đơn nhanh       | skus.retailPrice (fallback products.basePrice)    | Đơn giá bán lẻ mặc định khi thêm vào đơn          |
 * ====================================================================================================================================
 *
 * @businessRule GBR-10 Phản ánh tồn khả dụng sau khi trừ tồn giữ chỗ (availableQty = onHandQty - reservedQty)
 * @businessRule GBR-08 Kiểm tra ngưỡng cảnh báo tồn kho tối thiểu (safetyStockThreshold)
 */
export const lookupRealtimeStock = async (searchQuery, stockFilter = 'ALL') => {
  const filter = { isActive: true };

  if (searchQuery && searchQuery.trim()) {
    const raw = searchQuery.trim();
    const safeRegex = new RegExp(escapeRegex(raw), 'i');

    // 1. Tìm các sản phẩm trong collection products khớp tên tiếng Việt hoặc mã sản phẩm
    const matchingProducts = await Product.find({
      isActive: true,
      $or: [
        { productName: safeRegex },
        { productCode: safeRegex },
        { category: safeRegex },
        { sampleCode: safeRegex }, // TODO(xóa sampleCode): legacy products only, remove after migration
      ],
    }).select('_id').lean();

    const matchingProductIds = matchingProducts.map((p) => p._id);

    // 2. Lọc SKU theo thuộc tính SKU hoặc theo ID sản phẩm khớp
    filter.$or = [
      { skuCode: safeRegex },
      { skuBarcode: safeRegex },
      { styleName: safeRegex },
      { color: safeRegex },
      { size: safeRegex },
      ...(matchingProductIds.length > 0 ? [{ productId: { $in: matchingProductIds } }] : []),
    ];
  }

  // Truy vấn danh sách SKU kèm thông tin từ Product collection (chỉ lấy các trường cần thiết)
  const skus = await Sku.find(filter)
    .select('_id skuCode skuBarcode productId styleName color size retailPrice onHandQty reservedQty safetyStockThreshold')
    .populate('productId', 'productName productCode category basePrice thumbnailUrl additionalImageUrls')
    .sort({ onHandQty: -1, styleName: 1, size: 1 }) // Ưu tiên hàng có sẵn tồn kho lên đầu
    .limit(searchQuery ? 100 : 200)
    .lean();

  const normalizedFilter = String(stockFilter || 'ALL').trim().toUpperCase();

  const mapped = skus.map((sku) => {
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
    const additionalImageUrls = Array.isArray(prod.additionalImageUrls)
      ? prod.additionalImageUrls.filter(Boolean)
      : [];

    return {
      skuId: sku._id,
      skuCode: sku.skuCode,
      skuBarcode: sku.skuBarcode,
      productId: prod._id || null,
      productName: prod.productName || sku.styleName,
      thumbnailUrl: prod.thumbnailUrl || '',
      additionalImageUrls,
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

  if (normalizedFilter === 'IN_STOCK') {
    return mapped.filter((item) => item.availableQty > 0);
  }
  if (normalizedFilter === 'OUT_OF_STOCK') {
    return mapped.filter((item) => item.availableQty <= 0);
  }
  return mapped;
};

export default {
  lookupRealtimeStock,
};
