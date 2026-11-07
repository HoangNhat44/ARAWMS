/*
 * File: index.js
 * Author: Duy Anh
 * Date: 2026-10-26
 * Description: Re-exports Mongoose models from a single module. Provides a stable import point for backend services and routes.
 */
/**
 * ARAWMS - Centralized Export for All Mongoose Models
 */

// System & Configuration
export { default as CounterSequence } from './CounterSequence.model.js';
export { default as InventoryAlert } from './InventoryAlert.model.js';
export { default as Role } from './Role.model.js';
export { default as User } from './User.model.js';
export { default as SystemSetting } from './SystemSetting.model.js';
export { default as SystemLog } from './SystemLog.model.js';
export { default as WarehouseLocation } from './WarehouseLocation.model.js';
export { default as WarehouseLayout } from './WarehouseLayout.model.js';
export { default as WarehouseBarcodeHistory } from './WarehouseBarcodeHistory.model.js';
export { default as PutawayAllocation } from './PutawayAllocation.model.js';
export { default as DocumentTemplate } from './DocumentTemplate.model.js';
export { default as ShippingCarrier } from './ShippingCarrier.model.js';

// Materials & Products
export { default as RawMaterial } from './RawMaterial.model.js';
export { default as MaterialStockLot } from './MaterialStockLot.model.js';
export { default as FabricRoll } from './FabricRoll.model.js';
export { default as Product } from './Product.model.js';
export { default as Sku } from './Sku.model.js';

// Suppliers
export { default as Supplier } from './Supplier.model.js';
export { default as SupplierContract } from './SupplierContract.model.js';
export { default as MaterialInboundPlan } from './MaterialInboundPlan.model.js';
export { default as MaterialTicket } from './MaterialTicket.model.js';
export { default as RemnantRecoveryRequest } from './RemnantRecoveryRequest.model.js';

// Warehouse & Inventory
export { default as FinishedGoodsBatch } from './FinishedGoodsBatch.model.js';
export { default as FinishedGoodsTicket } from './FinishedGoodsTicket.model.js';
export { default as InventoryTransaction } from './InventoryTransaction.model.js';
export { default as StocktakeSession } from './StocktakeSession.model.js';
export { default as StocktakeRecord } from './StocktakeRecord.model.js';

// Customers & Orders
export { default as Customer } from './Customer.model.js';
export { default as ChatConversation } from './ChatConversation.model.js';
export { default as ChatMessage } from './ChatMessage.model.js';
export { default as SalesOrder } from './SalesOrder.model.js';
export { default as ReturnRequest } from './ReturnRequest.model.js';

// Financial
export { default as CashFlowVoucher } from './CashFlowVoucher.model.js';
export { default as CodReconciliationBatch } from './CodReconciliationBatch.model.js';
export { default as CodReconciliationItem } from './CodReconciliationItem.model.js';
export { default as CarrierDispute } from './CarrierDispute.model.js';

// Packing & Fulfillment (custom models)
export { default as OrderQrToken } from './OrderQrToken.js';
export { default as ProductUnit } from './ProductUnit.js';
export { default as PackingSession } from './PackingSession.js';
export { default as ProductUnitAllocation } from './ProductUnitAllocation.js';
export { default as PackingScanEvent } from './PackingScanEvent.js';
export { default as PackingVideo } from './PackingVideo.js';
