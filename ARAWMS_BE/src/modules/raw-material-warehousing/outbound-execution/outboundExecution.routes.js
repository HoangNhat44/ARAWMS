/*
 * File: outboundExecution.routes.js
 * Description: Exposes raw-material issue operations through the project's direct-link test account.
 */
import express from 'express';
import { options, list, detail, create, update, check, confirm, cancel } from './outboundExecution.controller.js';

const router = express.Router();
// Match the raw-material receiving test flow until project authentication is restored.
router.use((req, res, next) => {
  res.set('Cache-Control', 'private, no-store');
  req.user = { _id: '507f1f77bcf86cd799439011', username: 'test', fullName: 'Test User',
    roles: ['OWNER', 'ADMIN'], warehouseIds: [] };
  next();
});
router.get('/options', options);
router.get('/tickets', list);
router.post('/tickets', create);
router.get('/tickets/:id', detail);
router.put('/tickets/:id', update);
router.post('/tickets/:id/check', check);
router.post('/tickets/:id/confirm', confirm);
router.post('/tickets/:id/cancel', cancel);
export default router;
