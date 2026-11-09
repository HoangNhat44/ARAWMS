import express from 'express';
import { authenticate } from '../../../common/middlewares/authenticate.js';
import { authorizeRole } from '../../../common/middlewares/authorizeRole.js';
import { options, list, create, updateSchedule, setScheduleStatus } from './stocktakeSession.controller.js';

const router = express.Router();
router.use((req, res, next) => {
  res.set('Cache-Control', 'private, no-store');
  next();
});
router.use(authenticate, authorizeRole('OWNER', 'WAREHOUSE_MANAGER'));
router.get('/options', options);
router.get('/', list);
router.post('/', create);
router.put('/schedules/:id', updateSchedule);
router.patch('/schedules/:id/status', setScheduleStatus);
export default router;
