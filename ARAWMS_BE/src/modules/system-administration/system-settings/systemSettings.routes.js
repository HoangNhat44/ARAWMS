/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157
 * Ngày thực hiện: 30-10-2026
 * Chức năng: OWNER-EXT-02..05; GBR-01 - API cấu hình chỉ dành cho Owner.
 */
import { ownerRouter } from '../../../common/middlewares/ownerRouter.js';
import { asyncHandler } from '../../../common/utils/httpError.js';
import * as controller from './systemSettings.controller.js';
const router = ownerRouter();
// Khai báo đường dẫn cụ thể trước đường dẫn động tên nhóm cấu hình.
router.get('/', asyncHandler(controller.read));
router.get('/inventory-items/:type', asyncHandler(controller.listThresholds));
router.patch('/inventory-items/:type/:id', asyncHandler(controller.updateThreshold));
router.patch('/:section', asyncHandler(controller.update));
export default router;
