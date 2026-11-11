/** Standard stock units shared by raw-material catalog, receiving, storage and outbound flows. */
export const MATERIAL_UNIT_OPTIONS = [
  { value: 'METER', label: 'Mét (m)' },
  { value: 'KG', label: 'Kilogram (kg)' },
  { value: 'PIECE', label: 'Cái / Chiếc (pc)' },
  { value: 'SPOOL', label: 'Cuộn / Ống chỉ (spool)' },
  { value: 'BOX', label: 'Hộp / Thùng (box)' },
  { value: 'ROLL', label: 'Cây vải / Cuộn (roll)' },
  { value: 'YARD', label: 'Yard / Thước vải (yd)' },
  { value: 'SET', label: 'Bộ (set)' },
  { value: 'PACK', label: 'Gói (pack)' },
  { value: 'GRAM', label: 'Gram (g)' },
  { value: 'TON', label: 'Tấn (ton)' },
  { value: 'PAIR', label: 'Đôi / Cặp (pair)' },
];

const standardCodes = new Set(MATERIAL_UNIT_OPTIONS.map(({ value }) => value));
const customUnitPattern = /^[\p{L}\p{N}][\p{L}\p{N} /._()-]{0,23}$/u;

export function normalizeMaterialUnit(value) {
  const normalized = String(value || '').trim().replace(/\s+/g, ' ').toLocaleUpperCase('vi-VN');
  return normalized;
}

export function isValidMaterialUnit(value) {
  const normalized = normalizeMaterialUnit(value);
  return standardCodes.has(normalized) || customUnitPattern.test(normalized);
}

export function isValidMaterialUnitForType(value, materialType) {
  const normalized = normalizeMaterialUnit(value);
  // Fabric may be stocked in any unit (e.g. KG for knits); storage only requires the
  // location's capacity unit to match the material unit.
  return isValidMaterialUnit(normalized) && Boolean(materialType);
}

export function isFractionalMaterialUnit(value) {
  return ['METER', 'KG', 'YARD', 'GRAM', 'TON'].includes(normalizeMaterialUnit(value));
}
