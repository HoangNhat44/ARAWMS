import express from 'express';
import * as contractWorkspaceController from './contractWorkspace.controller.js';
import {
  validateCreateSupplier,
  validateUpdateSupplier,
  validateDraftContract,
  validateContractIdParam,
  validateContractStatusUpdate,
} from './contractWorkspace.validation.js';

const router = express.Router();

// UC 01 - 03: Manage Material Suppliers (View, Add, Update)
router.get('/suppliers', contractWorkspaceController.getSuppliers);
router.post('/suppliers', validateCreateSupplier, contractWorkspaceController.createSupplier);
router.put('/suppliers/:id', validateUpdateSupplier, contractWorkspaceController.updateSupplier);

// Helper Catalog for Contract Drafting
router.get('/materials-catalog', contractWorkspaceController.getMaterialsCatalog);

// UC 04: Draft Supplier Contract Framework
router.get('/contracts', contractWorkspaceController.getContracts);
router.get('/contracts/:id', validateContractIdParam, contractWorkspaceController.getContractDetail);
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

export default router;
