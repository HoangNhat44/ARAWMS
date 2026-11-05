import { sendError, sendSuccess } from '../../../common/utils/responseHandler.js';
import { stocktakeOptions, listStocktake, createStocktake, setStocktakeSchedule, pauseStocktakeSchedule } from './stocktakeSession.service.js';

const run = (message, action, status = 200) => async (req, res, next) => {
  try { return sendSuccess(res, message, await action(req), status); }
  catch (error) { if (error.status) return sendError(res, error.message, { code: error.code }, error.status); next(error); }
};
export const options = run('Dữ liệu kiểm kê', async () => stocktakeOptions());
export const list = run('Danh sách kiểm kê', async (req) => listStocktake(req.query));
export const create = run('Đã tạo lệnh kiểm kê', async (req) => createStocktake(req.body || {}, req.user), 201);
export const updateSchedule = run('Đã cập nhật lịch', async (req) => ({ schedule: await setStocktakeSchedule(req.params.id, req.body || {}, req.user) }));
export const setScheduleStatus = run('Đã cập nhật trạng thái lịch', async (req) => ({ schedule: await pauseStocktakeSchedule(req.params.id, req.body || {}, req.user) }));
