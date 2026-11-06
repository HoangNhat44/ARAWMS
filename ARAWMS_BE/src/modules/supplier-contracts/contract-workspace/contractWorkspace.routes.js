import { ownerRouter } from '../../../common/middlewares/ownerRouter.js';
import { asyncHandler } from '../../../common/utils/httpError.js';
import { contractDetail } from './contractWorkspace.service.js';
const router = ownerRouter();
router.get('/:id', asyncHandler(async (req, res) => res.json({ success: true, data: await contractDetail(req.params.id) })));
export default router;
