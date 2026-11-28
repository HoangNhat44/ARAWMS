/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Report 3 — UC-013 đến UC-016. Điểm vào API đọc và cập nhật cấu hình của Owner.
 */
import { ownerRouter } from '../../../common/middlewares/ownerRouter.js';
import { asyncHandler } from '../../../common/utils/httpError.js';
import * as controller from './systemSettings.controller.js';
const router = ownerRouter();
// Khai báo đường dẫn cụ thể trước đường dẫn động tên nhóm cấu hình.
/** GET /api/owner/system-settings. Trả cấu hình dùng chung và trạng thái thiết lập tích hợp. */
router.get('/', asyncHandler(controller.read));
/** GET danh sách ngưỡng theo loại nguyên liệu hoặc SKU. */
router.get('/inventory-items/:type', asyncHandler(controller.listThresholds));
/** PATCH ngưỡng của một mặt hàng theo loại và mã định danh. */
router.patch('/inventory-items/:type/:id', asyncHandler(controller.updateThreshold));
/** PATCH một nhóm cấu hình chung sau khi đối chiếu phiên bản. */
router.patch('/:section', asyncHandler(controller.update));
export default router;
