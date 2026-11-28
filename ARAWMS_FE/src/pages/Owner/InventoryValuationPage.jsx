/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157 | Ngày: 30-10-2026 | UC-15/16; [BR: GBR-16]
 * ====================================================================================================================================
 * [BẢNG TRA CỨU NGUỒN GỐC SỐ LIỆU, BỘ LỌC & CÔNG THỨC - ĐỊNH GIÁ TÀI SẢN KHO (OWNER)]
 * ====================================================================================================================================
 * | STT | Mục trên UI (KPI / Bộ lọc / Cột)    | Hàm FE & Trường hiển thị                    | API, Hàm BE & Nguồn DB (Collection.field)                          | Nghiệp vụ / Công thức / Điều kiện                 |
 * |-----|-------------------------------------|---------------------------------------------|--------------------------------------------------------------------|---------------------------------------------------|
 * | 1   | KPI: Nguyên vật liệu                | money(summary.data.materialValue)           | GET /api/owner/asset-valuation/summary -> inventoryValuation.svc   | Σ (raw_materials.onHandQty * unitCost)            |
 * | 2   | KPI: Thành phẩm bán được            | money(summary.data.finishedGoodsValue)      | GET /api/owner/asset-valuation/summary <- skus.{onHandQty,unitCogs}| Σ (skus.onHandQty * unitCogs)                     |
 * | 3   | KPI: Hàng cách ly (Lỗi)             | money(summary.data.quarantineValue)         | product_units(status='DEFECT_QUARANTINE') × skus.unitCogs          | [BR: GBR-16] Tách riêng khỏi tồn bán được         |
 * | 4   | KPI: Tổng tài sản kho               | money(summary.data.totalValue)              | Tổng hợp từ 3 nguồn trên (độc lập với bộ lọc bảng)                 | materialValue + finishedGoodsValue + quarantine   |
 * | 5   | Bộ lọc Nhóm hàng & Tìm mã/tên       | options.{type,search,page} -> useOwnerQuery | GET /api/owner/asset-valuation (hoặc material-valuation)           | type='materials' (NL) | 'skus' (Thành phẩm)       |
 * | 6   | Thẻ nhóm đang lọc & Cột bảng chi tiết| resource.data.{totals, total, items[]}      | inventoryValuation.service.js:valuationReport()                    | Mỗi dòng: totalValue = (onHand + quarantine)*cost |
 * ====================================================================================================================================
 */
import { WmsField, WmsSelect, WmsInput, WmsButton } from '../../components/ui/WmsControls';
import { useState } from 'react';
import { useOwnerQuery } from '../../hooks/useOwnerQuery';
import { useOwnerResource } from '../../hooks/useOwnerResource';
import { ResourceState, Table, Pagination, Metric, money, quantity, datetime, labels } from './OwnerUI';
export default function InventoryValuationPage({ assets = false }) {
  // UC-15 chỉ nguyên liệu; UC-16 cho chuyển giữa nguyên liệu và thành phẩm.
  const [options, setOptions] = useOwnerQuery({ type: assets ? 'skus' : 'materials', page: 1, search: '' }); const { type, ...query } = options;
  const [search, setSearch] = useState(query.search); const setQuery = (next) => setOptions({ ...next, type });
  // Bảng chi tiết chịu bộ lọc/tìm kiếm; tổng tài sản toàn kho được tải bằng API riêng.
  const resource = useOwnerResource(assets ? 'asset-valuation' : 'material-valuation', { ...query, type });
  const summary = useOwnerResource('asset-valuation/summary');
  return <><header className="owner-page-heading"><div><p className="owner-eyebrow">{assets ? 'Kho thành phẩm' : 'Tồn kho nguyên vật liệu'}</p><h1>{assets ? 'Định giá tài sản kho' : 'Giá trị tồn kho nguyên liệu'}</h1><p>Số lượng tồn và đơn giá đã ghi nhận tại thời điểm xem.</p></div></header>
    {/* UC-16: Tổng toàn kho độc lập với nhóm/từ khóa của bảng đang lọc bên dưới. */}
    {assets && <ResourceState resource={summary}>{summary.data && <div className="owner-metrics"><Metric label="Tổng tài sản kho" value={money(summary.data.totalValue)} /><Metric label="Nguyên vật liệu" value={money(summary.data.materialValue)} /><Metric label="Thành phẩm bán được" value={money(summary.data.finishedGoodsValue)} /><Metric label="Hàng cách ly" value={money(summary.data.quarantineValue)} /></div>}</ResourceState>}
    <form className="owner-filters" onSubmit={(e) => { e.preventDefault(); setQuery({ page: 1, search: search.trim() }); }}>
      {assets && <WmsField>Nhóm hàng<WmsSelect value={type} onChange={(e) => { setOptions({ type: e.target.value, page: 1, search: '' }); setSearch(''); }}><option value="materials">Nguyên vật liệu</option><option value="skus">Thành phẩm</option></WmsSelect></WmsField>}
      <WmsField>Tìm theo mã hoặc tên<WmsInput maxLength={100} value={search} onChange={(e) => setSearch(e.target.value)} /></WmsField><WmsButton>Tìm kiếm</WmsButton></form>
    <ResourceState resource={resource}>{resource.data && <><div className="owner-metrics"><Metric label="Giá trị nhóm hàng đang lọc" value={money(resource.data.totals.totalValue)} /><Metric label="Giá trị cách ly trong nhóm" value={money(resource.data.totals.quarantineValue)} /><Metric label="Số mã hàng" value={quantity(resource.data.total)} /></div>
      <Table paginated={false} headings={['Mã / tên', 'Đơn vị', 'Tồn vật lý bán được', 'Đã giữ chỗ', 'Cách ly', 'Đơn giá', 'Giá trị tài sản']} empty={!resource.data.items.length}>
        {resource.data.items.map((row) => <tr key={row.id}><td><strong>{row.code}</strong><small>{row.name}</small></td><td>{labels[row.unit] || row.unit}</td><td>{quantity(row.onHandQty)}</td><td>{quantity(row.reservedQty)}</td><td>{quantity(row.quarantineQty)}</td><td>{money(row.unitCost)}</td><td>{money(row.totalValue)}</td></tr>)}
      </Table><Pagination data={resource.data} onPage={(page) => setQuery({ ...query, page })} /><p className="owner-method">Thời điểm định giá: {datetime(resource.data.asOf)}</p></>}</ResourceState>
  </>;
}
