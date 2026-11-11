/*
 * File: warehouseAccess.js
 * Description: One location-access rule for warehouse screens. The store runs one raw-material and one
 *              finished-goods warehouse, so warehouse managers and staff may work on every location;
 *              per-account warehouseIds still scope any other role that has them.
 */
const WAREHOUSE_ROLES = ['WAREHOUSE_MANAGER', 'WAREHOUSE_STAFF'];

/** True when the account works across the whole warehouse instead of an assigned subset. */
export const hasWholeWarehouseAccess = (user) => !user?.warehouseIds?.length ||
  WAREHOUSE_ROLES.includes(user.roleCode) || user.roles?.some((role) => WAREHOUSE_ROLES.includes(role));

/** Checks one location (document or id) against the account's scope. */
export const canAccessLocation = (location, user) => hasWholeWarehouseAccess(user) ||
  user.warehouseIds.some((item) => String(item) === String(location?._id ?? location));

/** Mongo filter fragment limiting a field to the account's locations; empty when unrestricted. */
export const locationScopeFilter = (field, user) => hasWholeWarehouseAccess(user)
  ? {} : { [field]: { $in: user.warehouseIds } };
