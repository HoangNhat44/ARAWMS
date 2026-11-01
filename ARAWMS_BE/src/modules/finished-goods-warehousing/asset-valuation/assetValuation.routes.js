/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Chức năng: UC-16; GBR-13 - Tổng tài sản kho gồm vật liệu, thành phẩm và phần hàng cách ly.
 */
import { ownerRouter } from '../../../common/middlewares/ownerRouter.js';
import { asyncHandler } from '../../../common/utils/httpError.js';
import { valuationReport } from '../../raw-material-inventory/inventory-valuation/inventoryValuation.service.js';
import { objectFields } from '../../../common/utils/ownerValidation.js';
const router = ownerRouter();
// Đọc tổng giá trị toàn kho trong nhóm định giá tài sản kho; lỗi xử lý được chuyển về bộ xử lý lỗi chung.
router.get('/summary', asyncHandler(async (req, res) => {
  objectFields(req.query, []);
  const [materials, skus] = await Promise.all([valuationReport({ type: 'materials', limit: '1' }), valuationReport({ type: 'skus', limit: '1' })]);
  res.json({ success: true, data: { materialValue: materials.totals.totalValue, finishedGoodsValue: skus.totals.onHandValue,
    quarantineValue: skus.totals.quarantineValue, totalValue: materials.totals.totalValue + skus.totals.totalValue } });
}));
// Đọc dữ liệu tổng hợp hoặc danh sách trong nhóm định giá tài sản kho; lỗi xử lý được chuyển về bộ xử lý lỗi chung.
router.get('/', asyncHandler(async (req, res) => res.json({ success: true, data: await valuationReport(req.query) })));
export default router;
