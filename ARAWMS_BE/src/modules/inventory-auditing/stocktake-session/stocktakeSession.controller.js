import { sendError, sendSuccess } from '../../../common/utils/responseHandler.js';
import { stocktakeOptions, listStocktake, createStocktake, setStocktakeSchedule, pauseStocktakeSchedule } from './stocktakeSession.service.js';
import { stocktakeReport, approveStocktakeByManager, requestStocktakeRecount } from './stocktakeReview.service.js';
import { adjustStocktakeInventory } from './stocktakeAdjustment.service.js';
import { upcomingStocktakes } from './stocktakeNotice.service.js';

const run = (message, action, status = 200) => async (req, res, next) => {
  try { return sendSuccess(res, message, await action(req), status); }
  catch (error) {
    // Service tạo lịch dùng error.status; service duyệt (httpError) dùng error.statusCode.
    const code = error.status || error.statusCode;
    if (code) return sendError(res, error.message, { code: error.code }, code);
    next(error);
  }
};
export const options = run('Dữ liệu kiểm kê', async () => stocktakeOptions());
export const list = run('Danh sách kiểm kê', async (req) => listStocktake(req.query));
export const create = run('Đã tạo lệnh kiểm kê', async (req) => createStocktake(req.body || {}, req.user), 201);
export const updateSchedule = run('Đã cập nhật lịch', async (req) => ({ schedule: await setStocktakeSchedule(req.params.id, req.body || {}, req.user) }));
export const setScheduleStatus = run('Đã cập nhật trạng thái lịch', async (req) => ({ schedule: await pauseStocktakeSchedule(req.params.id, req.body || {}, req.user) }));
export const report = run('Báo cáo kiểm kê', async (req) => stocktakeReport(req.params.id));
export const approve = run('Đã duyệt báo cáo. Phiên chờ thực hiện điều chỉnh tồn kho.', async (req) => approveStocktakeByManager(req));
export const recount = run('Đã trả báo cáo và phát lệnh kiểm kê lại cho nhân viên kỹ thuật.', async (req) => requestStocktakeRecount(req), 201);
export const adjust = run('Đã điều chỉnh tồn kho theo báo cáo kiểm kê.', async (req) => adjustStocktakeInventory(req));
export const announcements = run('Lịch kiểm kê sắp tới', async (req) => ({ items: await upcomingStocktakes(req.user) }));
