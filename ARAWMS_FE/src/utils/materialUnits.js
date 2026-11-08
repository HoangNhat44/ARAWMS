export const MATERIAL_UNIT_OPTIONS = [
  { value: 'METER', label: 'Mét (m)', shortLabel: 'm' },
  { value: 'KG', label: 'Kilogram (kg)', shortLabel: 'kg' },
  { value: 'PIECE', label: 'Cái / Chiếc (pc)', shortLabel: 'pc' },
  { value: 'SPOOL', label: 'Cuộn / Ống chỉ (spool)', shortLabel: 'spool' },
  { value: 'BOX', label: 'Hộp / Thùng (box)', shortLabel: 'box' },
  { value: 'ROLL', label: 'Cây vải / Cuộn (roll)', shortLabel: 'roll' },
  { value: 'YARD', label: 'Yard / Thước vải (yd)', shortLabel: 'yd' },
  { value: 'SET', label: 'Bộ (set)', shortLabel: 'set' },
  { value: 'PACK', label: 'Gói (pack)', shortLabel: 'pack' },
  { value: 'GRAM', label: 'Gram (g)', shortLabel: 'g' },
  { value: 'TON', label: 'Tấn (ton)', shortLabel: 'ton' },
  { value: 'PAIR', label: 'Đôi / Cặp (pair)', shortLabel: 'pair' },
];

export const isFractionalMaterialUnit = (unit) => ['METER', 'KG', 'YARD', 'GRAM', 'TON']
  .includes(String(unit || '').trim().toUpperCase());
