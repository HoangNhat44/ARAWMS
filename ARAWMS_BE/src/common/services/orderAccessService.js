const hasRole = (user, role) => user.roles?.includes(role);
const orderWarehouseIds = (order) => order.items.flatMap((item) => [
  item.reservation?.warehouseId,
  ...(item.fifoPickList || []).map((allocation) => allocation.locationId),
]).filter(Boolean).map(String);

export const canViewOrder = (user, order) => {
  if (order.demoOnly) return true;
  if (hasRole(user, 'ADMIN')) return true;
  if (hasRole(user, 'SALES') && String(order.sellerId) === String(user._id)) return true;
  if (hasRole(user, 'WAREHOUSE_STAFF') || hasRole(user, 'WAREHOUSE_MANAGER')) {
    const assigned = new Set((user.warehouseIds || []).map(String));
    const orderWarehouses = orderWarehouseIds(order);
    return orderWarehouses.length === 0 || orderWarehouses.every((id) => assigned.has(id));
  }
  return false;
};

export const canPackOrder = (user, order) => {
  if (!hasRole(user, 'WAREHOUSE_STAFF')) return false;
  if (order.demoOnly) return true;
  return orderWarehouseIds(order).length > 0 && canViewOrder(user, order);
};

export const canIssueQr = (user, order) => {
  if (hasRole(user, 'WAREHOUSE_STAFF')) return canViewOrder(user, order);
  if (order.demoOnly) return hasRole(user, 'ADMIN') || hasRole(user, 'SALES');
  return hasRole(user, 'ADMIN') || (hasRole(user, 'SALES') && String(order.sellerId) === String(user._id));
};

export const canConfirmOrder = (user, order) => {
  if (order.demoOnly) return false;
  return hasRole(user, 'ADMIN') || (hasRole(user, 'SALES') && String(order.sellerId) === String(user._id));
};
