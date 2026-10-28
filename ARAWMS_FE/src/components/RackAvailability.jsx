/*
 * File: RackAvailability.jsx
 * Author: Duy Anh
 * Date: 2026-10-28
 * Description: Summarizes free capacity across selectable bins in each finished-goods rack.
 */
export default function RackAvailability({ bins, racks, rows }) {
  if (!racks.length) return null;
  const planned = new Map();
  for (const row of rows) {
    const bin = bins.find((item) => item.id === row.locationId);
    if (!bin) continue;
    const name = bin.rackLabel || bin.locationCode.split('-T')[0];
    planned.set(name, (planned.get(name) || 0) + Math.max(0, Number(row.quantity) || 0));
  }
  return <div className="receiving-rack-availability" aria-label="Sức chứa còn lại theo kệ">
    {racks.map((rack) => <div key={rack.rackLabel}>
      <strong>Kệ {rack.rackLabel}</strong><span>Còn {rack.available} chỗ</span>
      <small>Sức chứa {rack.capacity} · Đang có {rack.actual} · Đã giữ {rack.reserved}</small>
      {(planned.get(rack.rackLabel) || 0) > 0 && <small>Sau phân bổ lần này: {Math.max(0, rack.available - planned.get(rack.rackLabel))}</small>}
    </div>)}
  </div>;
}
