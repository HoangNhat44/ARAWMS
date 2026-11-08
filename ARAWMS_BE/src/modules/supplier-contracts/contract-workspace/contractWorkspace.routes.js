/*
 * File: contractWorkspace.routes.js
 * Description: Routes for Supplier Management, Contract Drafting, and Owner Contract Details.
 */
import express from 'express';
import * as contractWorkspaceController from './contractWorkspace.controller.js';
import {
  validateCreateSupplier,
  validateUpdateSupplier,
  validateDraftContract,
  validateContractIdParam,
  validateContractStatusUpdate,
  validateTerminateContract,
} from './contractWorkspace.validation.js';
import { asyncHandler } from '../../../common/utils/httpError.js';
import { contractDetail } from './contractWorkspace.service.js';

const router = express.Router();

// UC 01 - 03: Manage Material Suppliers (View, Add, Update)
router.get('/suppliers', contractWorkspaceController.getSuppliers);
router.post('/suppliers', validateCreateSupplier, contractWorkspaceController.createSupplier);
router.put('/suppliers/:id', validateUpdateSupplier, contractWorkspaceController.updateSupplier);

// Helper Catalog for Contract Drafting
router.get('/materials-catalog', contractWorkspaceController.getMaterialsCatalog);
router.post('/materials-catalog', contractWorkspaceController.createRawMaterial);

// UC 04: Draft Supplier Contract Framework & Versioning
router.get('/contracts', contractWorkspaceController.getContracts);
router.get(
  '/contracts/:id/versions',
  validateContractIdParam,
  contractWorkspaceController.getContractVersions
);
router.get('/contracts/:id', validateContractIdParam, contractWorkspaceController.getContractDetail);
router.post(
  '/contracts/:id/amend',
  validateContractIdParam,
  validateDraftContract,
  contractWorkspaceController.amendContract
);
router.post('/contracts', validateDraftContract, contractWorkspaceController.draftContract);
router.put(
  '/contracts/:id',
  validateContractIdParam,
  validateDraftContract,
  contractWorkspaceController.updateContract
);
router.patch(
  '/contracts/:id/status',
  validateContractIdParam,
  validateContractStatusUpdate,
  contractWorkspaceController.updateContractStatus
);
router.post(
  '/contracts/:id/terminate',
  validateContractIdParam,
  validateTerminateContract,
  contractWorkspaceController.terminateContract
);

// Support Owner contract detail view mounted at /api/owner/contracts/:id
router.get(
  '/:id',
  asyncHandler(async (req, res, next) => {
    if (['suppliers', 'materials-catalog', 'contracts'].includes(req.params.id)) {
      return next();
    }
    const data = await contractDetail(req.params.id);
    return res.json({ success: true, data });
  })
);

export default router;
