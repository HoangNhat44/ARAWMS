/* Nguyễn Ngọc Huy-HE171157 | 2-11-2026 | UC-12/13: Lựa chọn so sánh nằm trong bộ lọc, tính ngày rõ ràng. */
const iso = (d) => d.toISOString().slice(0, 10);
const priorYear = (s) => { const d = new Date(`${s}T00:00:00Z`); const day = d.getUTCDate(); d.setUTCFullYear(d.getUTCFullYear() - 1); if (d.getUTCDate() !== day) d.setUTCDate(0); return iso(d); };
export const quarterDates = (year, quarter) => ({ from: iso(new Date(Date.UTC(year, (quarter - 1) * 3, 1))), to: iso(new Date(Date.UTC(year, quarter * 3, 0))) });
export function comparisonDates(dates, mode) {
  if (mode === 'previous-year') return { compareFrom: priorYear(dates.from), compareTo: priorYear(dates.to) };
  if (mode === 'previous-period') { const span = Date.parse(dates.to) - Date.parse(dates.from) + 86400000; return { compareFrom: iso(new Date(Date.parse(dates.from) - span)), compareTo: iso(new Date(Date.parse(dates.from) - 86400000)) }; }
  return { compareFrom: dates.compareFrom, compareTo: dates.compareTo };
}
