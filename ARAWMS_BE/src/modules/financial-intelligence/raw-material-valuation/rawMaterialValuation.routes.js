/*
 * File: rawMaterialValuation.routes.js
 * Role: ACCOUNTANT / FINANCIAL_INTELLIGENCE
 * UC: UC 11 - View Total Raw Material Inventory Value
 */
import express from 'express';
import { authenticate } from '../../../common/middlewares/authenticate.js';
import * as valuationController from './rawMaterialValuation.controller.js';

const router = express.Router();

// Fallback user for dev environment if token is omitted
const flexibleAuth = async (req, res, next) => {
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    return authenticate(req, res, next);
  }
  req.user = req.user || {
    _id: '507f1f77bcf86cd799439011',
    username: 'accountant_user',
    fullName: 'Kế toán kho',
    roleCode: 'ACCOUNTANT',
    roles: ['ACCOUNTANT', 'OWNER'],
  };
  next();
};

router.use(flexibleAuth);

router.get('/summary', valuationController.getValuationSummary);
router.get('/materials', valuationController.getValuationList);
router.get('/metadata', valuationController.getFilterMetadata);

export default router;

