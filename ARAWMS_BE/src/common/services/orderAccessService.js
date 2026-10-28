/*
 * File: orderAccessService.js
 * Author: Duy Anh
 * Date: 2026-10-21
 * Description: Checks order visibility, QR issuance, and packing access.
 */
const hasRole = (user, role) => user.roles?.includes(role);
const orderWarehouseIds = (order) => order.items.flatMap((item) => [
  item.reservation?.warehouseId,
  ...(item.fifoPickList || []).map((allocation) => allocation.locationId),
]).filter(Boolean).map(String);

/** Allows warehouse users to view orders tied only to assigned locations. */
export const canViewOrder = (user, order) => {
  if (hasRole(user, 'ADMIN')) return true;
  if (hasRole(user, 'SALES') && String(order.sellerId) === String(user._id)) return true;
  if (hasRole(user, 'WAREHOUSE_STAFF') || hasRole(user, 'WAREHOUSE_MANAGER')) {
    const assigned = new Set((user.warehouseIds || []).map(String));
    const orderWarehouses = orderWarehouseIds(order);
    return orderWarehouses.length === 0 || orderWarehouses.every((id) => assigned.has(id));
  }
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

/** Restricts staff QR issuance to orders ready for packing or already packed. */
export const canIssueQr = (user, order) => {
  if (hasRole(user, 'WAREHOUSE_STAFF')) return order.status === 'PACKED'
    ? canViewOrder(user, order) : canPackOrder(user, order);
  return hasRole(user, 'ADMIN') || (hasRole(user, 'SALES') && String(order.sellerId) === String(user._id));
};

/** Allows only the assigned seller or an administrator to confirm an order. */
export const canConfirmOrder = (user, order) => {
  return hasRole(user, 'ADMIN') || (hasRole(user, 'SALES') && String(order.sellerId) === String(user._id));
};
