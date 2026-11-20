/*
 * File: layout.routes.js
 * Author: Duy Anh
 * Date: 2026-10-27
 * Description: Manager-only layout, location label and putaway plan endpoints under /api/warehouse-layout.
 * Each route requires a layout capability (layoutPermission.js). Handlers are in layout.controller.js.
 */
import express from 'express';
import { authenticate } from '../../../common/middlewares/authenticate.js';
import { layoutPermission as can } from './layoutPermission.js';
import {
  layout, openLayoutDraft, resetLayoutDraft, saveLayoutDraft, addDraftRack, removeRack, resizeRack,
  validateLayoutDraft, publishLayoutDraft, bin, binHistory, binLabel, binLabelCode128, binLabelQr, binPrintIntent,
  rotateBin, allocationSources, skus, allocations, allocationHistory, createPlan, updatePlan, confirmPlan, cancelPlan,
} from './layout.controller.js';

const router = express.Router();
router.use((req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
router.use(authenticate);

// Layout editor: changes go to a draft that is validated and then published.
router.get('/layout', can('warehouse.layout.view'), layout);
router.post('/layout/draft', can('warehouse.layout.edit'), openLayoutDraft);
router.post('/layout/draft/reset', can('warehouse.layout.edit'), resetLayoutDraft);
router.patch('/layout/draft', can('warehouse.layout.edit'), saveLayoutDraft);
router.post('/layout/draft/racks', can('warehouse.layout.edit'), addDraftRack);
router.delete('/layout/draft/racks/:id', can('warehouse.layout.edit'), removeRack);
router.post('/layout/draft/racks/:id/resize', can('warehouse.layout.edit'), resizeRack);
router.post('/layout/draft/validate', can('warehouse.layout.edit'), validateLayoutDraft);
router.post('/layout/draft/publish', can('warehouse.layout.publish'), publishLayoutDraft);

// Shelf bins and their labels.
router.get('/bins/:id', can('warehouse.layout.view'), bin);
router.get('/bins/:id/history', can('warehouse.layout.view'), binHistory);
router.get('/bins/:id/label', can('warehouse.location.barcode.print'), binLabel);
router.get('/bins/:id/label.png', can('warehouse.location.barcode.print'), binLabelCode128);
router.get('/bins/:id/label-qr.png', can('warehouse.location.barcode.print'), binLabelQr);
router.post('/bins/:id/print-intent', can('warehouse.location.barcode.print'), binPrintIntent);
router.post('/bins/:id/rotate', can('warehouse.location.barcode.rotate'), rotateBin);

// Putaway plans.
router.get('/allocation-options', can('warehouse.putaway.plan.view'), allocationSources);
router.get('/skus', can('warehouse.layout.view'), skus);
router.get('/allocations', can('warehouse.putaway.plan.view'), allocations);
router.get('/allocations/:id/history', can('warehouse.putaway.plan.view'), allocationHistory);
router.post('/allocations', can('warehouse.putaway.plan.create'), createPlan);
router.patch('/allocations/:id', can('warehouse.putaway.plan.modify'), updatePlan);
router.post('/allocations/:id/confirm', can('warehouse.putaway.plan.create'), confirmPlan);
router.post('/allocations/:id/cancel', can('warehouse.putaway.plan.modify'), cancelPlan);

export default router;
