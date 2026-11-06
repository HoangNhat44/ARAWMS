import { useState } from 'react';
import { useOwnerQuery } from '../../hooks/useOwnerQuery';
import { useOwnerResource } from '../../hooks/useOwnerResource';
import { WmsField, WmsInput, WmsSelect, WmsButton } from '../../components/ui/WmsControls';
import { ResourceState, Table, Pagination, Status, money, quantity } from './OwnerUI';
export default function ProductCatalogPage() {
  const [query, setQuery] = useOwnerQuery({ page: 1, search: '', status: '' });
  const [search, setSearch] = useState(query.search);
  const resource = useOwnerResource('products', query);
  return <><header className="owner-page-heading"><div><h1>Danh mục sản phẩm</h1><p>Sản phẩm và các biến thể màu, kích cỡ đang có trong hệ thống.</p></div><WmsButton onClick={resource.reload}>Tải lại</WmsButton></header>
    <form className="owner-filters" onSubmit={(e) => { e.preventDefault(); setQuery({ ...query, search: search.trim(), page: 1 }); }}>
      <WmsField>Mã, tên hoặc danh mục<WmsInput maxLength={100} value={search} onChange={(e) => setSearch(e.target.value)} /></WmsField>
      <WmsField>Trạng thái<WmsSelect value={query.status} onChange={(e) => setQuery({ ...query, status: e.target.value, page: 1 })}><option value="">Tất cả</option><option value="ACTIVE">Đang hoạt động</option><option value="INACTIVE">Ngừng hoạt động</option></WmsSelect></WmsField>
      <WmsButton type="submit">Tìm kiếm</WmsButton>
    </form><ResourceState resource={resource}>{resource.data && <><Table paginated={false} headings={['Sản phẩm', 'Danh mục', 'Giá cơ bản', 'Biến thể', 'Khả dụng (cái)', 'Trạng thái']} empty={!resource.data.items.length}>
      {resource.data.items.map((p) => <tr key={p.id}><td><strong>{p.code}</strong><small>{p.name}</small></td><td>{p.category}</td><td>{money(p.basePrice)}</td><td>{quantity(p.variants.length)}</td><td>{quantity(p.variants.reduce((total, s) => total + s.available, 0))}</td><td><Status value={p.status} /></td></tr>)}
    </Table><Pagination data={resource.data} onPage={(page) => setQuery({ ...query, page })} /></>}</ResourceState></>;
}
