export const ROLE_HOME = new Map([
  ['OWNER', '/owner/dashboard'],
  ['WAREHOUSE_MANAGER', '/warehouse/raw-materials/inbound'],
  ['GARMENT_TECHNICIAN', '/garment/material-inbound-verification'],
  ['WAREHOUSE_STAFF', '/warehouse/putaway'],
  ['SELLER', '/seller/chat'],
  ['ACCOUNTANT', '/accountant'],
]);

export const getRoleHome = (roleCode) => ROLE_HOME.get(roleCode) ?? '/account';

export function getLoginDestination(roleCode, returnTo) {
  if (!returnTo || (returnTo.role && returnTo.role !== roleCode)) return getRoleHome(roleCode);
  const { pathname, search, hash } = returnTo;
  if (typeof pathname !== 'string' || !/^\/(?![\/\\])/.test(pathname)) return getRoleHome(roleCode);
  return { pathname, search, hash };
}
