/*
 * File: finishedInspection.routes.js
 * Author: Duy Anh & Antigravity
 * Date: 2026-11-06
 * Description: Express routes for Garment Technician Finished Goods Inspection & Inbound Requests.
 */
import express from 'express';
import { authenticate } from '../../../common/middlewares/authenticate.js';
import { authorizeRole } from '../../../common/middlewares/authorizeRole.js';
import {
  getOptions,
  listTickets,
  getTicket,
  createTicket,
} from './finishedInspection.controller.js';

const router = express.Router();

router.use(authenticate, authorizeRole('GARMENT_TECHNICIAN'));

router.get('/options', getOptions);
router.get('/tickets', listTickets);
router.get('/tickets/:id', getTicket);
router.post('/tickets', createTicket);

export default router;

