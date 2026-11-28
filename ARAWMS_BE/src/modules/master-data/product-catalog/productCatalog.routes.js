/**
 * API danh mục sản phẩm của Owner theo UC-030 và UC-033. Đọc mặt hàng, biến thể và tình trạng tồn kho.
 */
import { ownerRouter } from '../../../common/middlewares/ownerRouter.js';
import { asyncHandler } from '../../../common/utils/httpError.js';
import { readQuery, safeUrl } from '../../../common/utils/ownerReadQuery.js';
import Product from '../../../models/Product.model.js';
import Sku from '../../../models/Sku.model.js';
const router = ownerRouter();
/** Đọc trang sản phẩm theo tìm kiếm và trạng thái, ghép các SKU cùng lượng tồn để trình bày chi tiết. */
router.get('/', asyncHandler(async (req, res) => {
  const { filter, page, limit } = readQuery(req.query, { fields: ['productCode', 'productName', 'category'], statuses: ['ACTIVE', 'INACTIVE'] });
  if (filter.status) { filter.isActive = filter.status === 'ACTIVE' ? { $ne: false } : false; delete filter.status; }
  const [products, total] = await Promise.all([Product.find(filter).sort({ productCode: 1, _id: 1 }).skip((page - 1) * limit).limit(limit).lean(), Product.countDocuments(filter)]);
  // Tải biến thể của cả trang trong một truy vấn rồi ghép theo mã sản phẩm.
  const variants = await Sku.find({ productId: { $in: products.map((p) => p._id) }, isDeleted: { $ne: true } }).sort({ skuCode: 1 }).lean();
  // [BR: GBR-16] Lượng cách ly được trả riêng theo SKU. Tồn khả dụng lấy tồn thực trừ số giữ chỗ.
  const items = products.map((p) => ({ id: String(p._id), code: p.productCode, name: p.productName, category: p.category, basePrice: p.basePrice, thumbnailUrl: safeUrl(p.thumbnailUrl), status: p.isActive === false ? 'INACTIVE' : 'ACTIVE', variants: variants.filter((s) => String(s.productId) === String(p._id)).map((s) => ({ id: String(s._id), code: s.skuCode, color: s.color, size: s.size, price: s.retailPrice, onHand: s.onHandQty || 0, reserved: s.reservedQty || 0, available: (s.onHandQty || 0) - (s.reservedQty || 0), quarantine: s.defectQuarantineQty || 0 })) }));
  res.json({ success: true, data: { items, total, page, limit } });
}));
export default router;
