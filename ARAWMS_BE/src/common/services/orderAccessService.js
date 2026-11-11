/*
 * File: orderAccessService.js
 * Author: Duy Anh
 * Date: 2026-10-21
 * Description: Checks order visibility, QR issuance, and packing access.
 */
import { hasWholeWarehouseAccess } from './warehouseAccess.js';

const hasRole = (user, role) => user.roles?.includes(role);
const canManageOrders = (user) => hasRole(user, 'OWNER') || hasRole(user, 'ADMIN');
const isAssignedSeller = (user, order) => (hasRole(user, 'SELLER') || hasRole(user, 'SALES')) &&
  String(order.sellerId) === String(user._id);

/** Allows warehouse users to view orders tied only to assigned locations. */
export const canViewOrder = (user, order) => {
  if (canManageOrders(user) || isAssignedSeller(user, order)) return true;
  // The finished-goods store is one shared warehouse (same rule as putaway): per-account
  // warehouseIds go stale when new bins are published, so they must not hide or block orders.
  if (hasRole(user, 'WAREHOUSE_STAFF') || hasRole(user, 'WAREHOUSE_MANAGER')) return hasWholeWarehouseAccess(user);
  return false;
};

/** Requires a warehouse staff member and complete FIFO batch allocations. */
export const canPackOrder = (user, order) => {
  if (!hasRole(user, 'WAREHOUSE_STAFF')) return false;
  return order.items?.length > 0 && order.items.every((item) =>
    item.fifoPickList?.length > 0 &&
    item.fifoPickList.every((pick) => pick.batchId && pick.locationId && pick.allocatedQty > 0) &&
    item.fifoPickList.reduce((total, pick) => total + pick.allocatedQty, 0) === (item.orderedQty ?? item.quantity)
  ) && canViewOrder(user, order);
};

/** A line is ready when its FIFO picks are complete, or when it has none yet: the packing
 * station allocates those from shelved stock when the order QR is scanned (allocateMissingFifoPicks).
 */
const lineReadyForPacking = (item) => !item.fifoPickList?.length ||
  item.fifoPickList.every((pick) => pick.batchId && pick.locationId && pick.allocatedQty > 0) &&
  item.fifoPickList.reduce((total, pick) => total + pick.allocatedQty, 0) === (item.orderedQty ?? item.quantity);

/** Restricts staff QR issuance to orders ready for packing or already packed. */
export const canIssueQr = (user, order) => {
  if (hasRole(user, 'WAREHOUSE_STAFF')) return order.status === 'PACKED'
    ? canViewOrder(user, order)
    : ['CONFIRMED_RESERVED', 'PICKING'].includes(order.status) && order.items?.length > 0 &&
      order.items.every(lineReadyForPacking) && canViewOrder(user, order);
  return canManageOrders(user) || isAssignedSeller(user, order);
};

/** Allows only the assigned seller or an administrator to confirm an order. */
export const canConfirmOrder = (user, order) => {
  return canManageOrders(user) || isAssignedSeller(user, order);
};
