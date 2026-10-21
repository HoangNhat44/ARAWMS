const hasRole = (user, role) => user.roles?.includes(role);

export const canViewOrder = (user, order) => {
  if (order.demoOnly) return true;
  if (hasRole(user, 'ADMIN')) return true;
  if (hasRole(user, 'SALES') && String(order.sellerId) === String(user._id)) return true;
  if (hasRole(user, 'WAREHOUSE_STAFF') || hasRole(user, 'WAREHOUSE_MANAGER')) {
    const assigned = new Set((user.warehouseIds || []).map(String));
    const orderWarehouses = order.items.map((item) => item.reservation?.warehouseId && String(item.reservation.warehouseId));
    return orderWarehouses.length > 0 && orderWarehouses.every((id) => id && assigned.has(id));
  }
  return false;
};

export const canPackOrder = (user, order) => {
  if (order.demoOnly) return true;
  if (hasRole(user, 'ADMIN')) return true;
  if (!(hasRole(user, 'WAREHOUSE_STAFF') || hasRole(user, 'WAREHOUSE_MANAGER'))) return false;
  return canViewOrder(user, order);
};

export const canIssueQr = (user, order) => {
  if (order.demoOnly) return true;
  return hasRole(user, 'ADMIN') || (hasRole(user, 'SALES') && String(order.sellerId) === String(user._id));
};
