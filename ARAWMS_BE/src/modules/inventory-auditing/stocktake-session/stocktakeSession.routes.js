import express from 'express';
import { authenticate } from '../../../common/middlewares/authenticate.js';
import { options, list, create, updateSchedule, setScheduleStatus } from './stocktakeSession.controller.js';

const router = express.Router();
router.use((req, res, next) => {
  res.set('Cache-Control', 'private, no-store');
  // Keep direct-URL QA available without credentials; authenticated calls use their real roles.
  if (process.env.NODE_ENV !== 'production' && !req.headers.authorization) {
    req.user = { _id: '507f1f77bcf86cd799439011', username: 'test', fullName: 'Test User',
      roleCode: 'WAREHOUSE_MANAGER', roles: ['WAREHOUSE_MANAGER'], warehouseIds: [] };
    return next();
  }
  return authenticate(req, res, next);
});
router.get('/options', options);
router.get('/', list);
router.post('/', create);
router.put('/schedules/:id', updateSchedule);
router.patch('/schedules/:id/status', setScheduleStatus);
export default router;
