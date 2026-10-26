/*
 * File: BulkStockForm.jsx
 * Author: Duy Anh
 * Date: 2026-10-22
 * Description: Collects finished goods stock document details.
 */
import { useEffect, useState } from 'react';
import { productService } from '../services/productService';

const input = { width: '100%', padding: '.65rem', border: '1px solid var(--ara-border)', borderRadius: 8, font: 'inherit' };
const createEmptyStockLine = () => ({ key: crypto.randomUUID(), productId: '', skuId: '', expectedQty: '', receivedQty: '', quantity: '', repairQty: '0' });

export default function BulkStockForm({ direction, products, initialSkuIds = [], initialProductId = '', onDone, onCancel }) {
  const [documentCode, setDocumentCode] = useState('');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState([createEmptyStockLine()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [locations, setLocations] = useState([]);
  const [locationId, setLocationId] = useState('');
  const [newLocation, setNewLocation] = useState({ locationCode: '', maxCapacity: '1000' });
  const [showNewLocation, setShowNewLocation] = useState(false);
  useEffect(() => {
    if (direction !== 'IN') return;
    productService.locations().then((response) => {
      setLocations(response.data.locations);
      setLocationId((current) => current || response.data.locations.find((item) => item.status === 'ACTIVE')?.id || '');
    }).catch((requestError) => setError(requestError.message));
  }, [direction]);
  useEffect(() => {
    if (!products.length) return;
    if (!initialSkuIds.length) {
      const product = products.find((item) => item.id === initialProductId);
      if (product) setLines([{ ...createEmptyStockLine(), productId: product.id, skuId: product.skus.length === 1 ? product.skus[0].id : '' }]);
      return;
    }
    const selected = initialSkuIds.map((id) => {
      const product = products.find((item) => item.skus.some((sku) => sku.id === id));
      return product ? { ...createEmptyStockLine(), productId: product.id, skuId: id } : null;
    }).filter(Boolean);
    if (selected.length) setLines(selected);
  }, [initialSkuIds.join(','), initialProductId, products]);

  /** Updates one document line and clears a SKU that no longer belongs to its product. */
  const updateStockLine = (key, field, value) => setLines((current) => current.map((line) => {
    if (line.key !== key) return line;
    if (field === 'productId') {
      const product = products.find((item) => item.id === value);
      return { ...line, productId: value, skuId: product?.skus.length === 1 ? product.skus[0].id : '' };
    }
    return { ...line, [field]: value };
  }));

  /** Sends the stock document after checking received = accepted + repair per line. */
  const submitBulkStockDocument = async (event) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      if (direction === 'IN' && lines.some((line) => Number(line.receivedQty) !== Number(line.quantity) + Number(line.repairQty))) {
        throw new Error('Mỗi dòng phải có thực nhận = đạt nhập kho + trả sửa.');
      }
      const response = await productService.bulkMoveStock({
        direction, documentCode, note, locationId: direction === 'IN' ? locationId : undefined,
        items: lines.map(({ productId, skuId, expectedQty, quantity, receivedQty, repairQty }) => ({ productId, skuId: skuId || undefined,
          quantity: Number(quantity), ...(direction === 'IN' ? { expectedQty: expectedQty === '' ? undefined : Number(expectedQty), receivedQty: Number(receivedQty), repairQty: Number(repairQty) } : {}) })),
      });
      onDone(response.data.document);
    } catch (requestError) { setError(requestError.message); }
    finally { setSaving(false); }
  };

  /** Creates a location and immediately selects it for the receiving document. */
  const createFinishedGoodsLocation = async () => {
    setError('');
    try {
      const response = await productService.createLocation({ ...newLocation, maxCapacity: Number(newLocation.maxCapacity) });
      setLocations((current) => [...current, response.data.location]);
      setLocationId(response.data.location.id);
      setShowNewLocation(false);
    } catch (requestError) { setError(requestError.message); }
  };

  const totalReceived = lines.reduce((sum, line) => sum + (Number(line.receivedQty) || 0), 0);
  const totalAccepted = lines.reduce((sum, line) => sum + (Number(line.quantity) || 0), 0);
  const totalRepair = lines.reduce((sum, line) => sum + (Number(line.repairQty) || 0), 0);
  return <section className="product-card receiving-card">
    <div className="product-card-head"><div><span className="product-section-number">02</span><h2>{direction === 'IN' ? 'Kiểm nhận hàng từ xưởng' : 'Phiếu xuất kho'}</h2></div><span className="product-badge active">{direction === 'IN' ? 'Bước 2 / 3' : 'Xuất kho'}</span></div>
    {direction === 'IN' && <p className="product-muted receiving-intro">Ghi số xưởng báo giao để đối chiếu, sau đó nhập số thực nhận. Chỉ số lượng đạt mới được cộng vào tồn kho và cấp barcode riêng từng chiếc.</p>}
    <form onSubmit={submitBulkStockDocument} style={{ display: 'grid', gap: '1rem', marginTop: '1rem' }}>
      <label style={{ maxWidth: 400 }}>Số hóa đơn / chứng từ *
        <input style={input} required maxLength={80} pattern="[A-Za-z0-9._/-]{2,80}" title="2–80 ký tự: chữ, số, dấu chấm, gạch dưới hoặc gạch ngang" value={documentCode} onChange={(event) => setDocumentCode(event.target.value.toUpperCase())} placeholder="Ví dụ: NK-2026-001" />
      </label>
      {direction === 'IN' && <div style={{ display: 'flex', gap: '.75rem', alignItems: 'end', flexWrap: 'wrap' }}>
        <label style={{ minWidth: 260 }}>Vị trí kho thành phẩm *<select style={input} required value={locationId} onChange={(event) => setLocationId(event.target.value)}><option value="">Chọn vị trí</option>{locations.filter((item) => item.status === 'ACTIVE').map((item) => <option key={item.id} value={item.id}>{item.locationCode} · còn {item.maxCapacity - item.currentOccupancy} chỗ</option>)}</select></label>
        <button className="btn-ara-secondary" type="button" onClick={() => setShowNewLocation((current) => !current)}>+ Tạo vị trí kho</button>
      </div>}
      {direction === 'IN' && showNewLocation && <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
        <input style={{ ...input, maxWidth: 180 }} placeholder="Mã vị trí" value={newLocation.locationCode} onChange={(event) => setNewLocation({ ...newLocation, locationCode: event.target.value.toUpperCase() })} />
        <input style={{ ...input, maxWidth: 160 }} type="number" min="1" placeholder="Sức chứa" value={newLocation.maxCapacity} onChange={(event) => setNewLocation({ ...newLocation, maxCapacity: event.target.value })} />
        <button className="btn-ara-secondary" type="button" onClick={createFinishedGoodsLocation}>Lưu vị trí</button>
      </div>}
      <div className="product-table-scroll"><table className="product-table receiving-table">
        <thead><tr><th>Sản phẩm</th><th>SKU</th>{direction === 'IN' && <><th>Xưởng báo giao</th><th>Thực nhận</th></>}<th>{direction === 'IN' ? 'Đạt nhập kho' : 'Số lượng'}</th>{direction === 'IN' && <th>Trả sửa</th>}<th /></tr></thead>
        <tbody>{lines.map((line) => {
          const product = products.find((item) => item.id === line.productId);
          return <tr key={line.key}>
            <td style={{ padding: '.4rem' }}><select style={input} required value={line.productId} onChange={(event) => updateStockLine(line.key, 'productId', event.target.value)}>
              <option value="">Chọn sản phẩm</option>
              {products.filter((item) => item.isActive && item.skus.some((sku) => sku.isActive && (direction === 'IN' || sku.availableQty > 0))).map((item) => <option key={item.id} value={item.id}>{item.productCode} · {item.productName}</option>)}
            </select></td>
            <td style={{ padding: '.4rem' }}>{product?.skus.length ? <select style={input} required value={line.skuId} onChange={(event) => updateStockLine(line.key, 'skuId', event.target.value)}>
              {product.skus.length > 1 && <option value="">Chọn SKU</option>}
              {product.skus.filter((sku) => sku.isActive && (direction === 'IN' || sku.availableQty > 0)).map((sku) => <option key={sku.id} value={sku.id}>{sku.skuCode} · {sku.color}/{sku.size} · khả dụng {sku.availableQty}</option>)}
            </select> : <small>Chưa có SKU — hãy cấu hình biến thể trước</small>}</td>
            {direction === 'IN' && <><td><input style={input} aria-label="Xưởng báo giao" type="number" min="0" max="500" step="1" value={line.expectedQty} onChange={(event) => updateStockLine(line.key, 'expectedQty', event.target.value)} /></td><td><input style={input} aria-label="Thực nhận" required type="number" min="1" max="500" step="1" value={line.receivedQty} onChange={(event) => updateStockLine(line.key, 'receivedQty', event.target.value)} /></td></>}
            <td style={{ padding: '.4rem' }}><input style={input} aria-label="Số lượng đạt" required type="number" min={direction === 'IN' ? '0' : '1'} max={direction === 'IN' ? '500' : '100000'} step="1" value={line.quantity} onChange={(event) => updateStockLine(line.key, 'quantity', event.target.value)} /></td>
            {direction === 'IN' && <td style={{ padding: '.4rem' }}><input style={input} aria-label="Trả sửa" required type="number" min="0" max="500" step="1" value={line.repairQty} onChange={(event) => updateStockLine(line.key, 'repairQty', event.target.value)} /></td>}
            <td style={{ padding: '.4rem' }}><button className="btn-ara-secondary" type="button" disabled={lines.length === 1 || saving} onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))}>Xóa</button></td>
          </tr>;
        })}</tbody>
      </table></div>
      {direction === 'IN' && <div className="receiving-totals"><span>Thực nhận <strong>{totalReceived}</strong></span><span>Đạt nhập kho <strong>{totalAccepted}</strong></span><span>Trả sửa <strong>{totalRepair}</strong></span></div>}
      <button className="btn-ara-secondary" style={{ justifySelf: 'start' }} type="button" disabled={lines.length >= 100 || saving} onClick={() => setLines((current) => [...current, createEmptyStockLine()])}>+ Thêm dòng sản phẩm</button>
      <label style={{ maxWidth: 580 }}>Ghi chú
        <input style={input} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Thông tin bổ sung cho phiếu" />
      </label>
      {error && <p role="alert" style={{ color: '#a32121' }}>{error}</p>}
      <div style={{ display: 'flex', gap: '.75rem' }}>
        <button className="btn-ara-primary" disabled={saving || products.length === 0} type="submit">{saving ? 'Đang lưu phiếu...' : `Xác nhận ${direction === 'IN' ? 'nhập' : 'xuất'} kho`}</button>
        <button className="btn-ara-secondary" disabled={saving} type="button" onClick={onCancel}>Hủy</button>
      </div>
    </form>
  </section>;
}
