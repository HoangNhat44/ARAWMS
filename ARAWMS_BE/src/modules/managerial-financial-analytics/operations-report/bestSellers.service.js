/*
 * Nguyễn Ngọc Huy - HE171157
 * Ngày: 14-11-2026
 * Thống kê sản phẩm bán chạy theo phạm vi nguồn bán của chủ cửa hàng.
 */
import { read, period, num } from './operationsReport.service.js';
import { salesReportScope } from './salesReportScope.js';
// Quantity is taken from actual order lines, never from inventory balances or catalogue prices.
export function bestSellerRows(orders, products, skus) {
  const bySku = new Map(skus.map(s => [String(s._id), s]));
  const byCode = new Map(skus.map(s => [s.skuCode, s]));
  const byProduct = new Map(products.map(p => [String(p._id), p]));
  const productRows = new Map(products.map(p => [String(p._id), { id: String(p._id), code: p.productCode, name: p.productName, quantity: 0, grossAmount: 0, orderIds: new Set() }]));
  const skuRows = new Map(skus.map(s => [String(s._id), { id: String(s._id), code: s.skuCode, name: byProduct.get(String(s.productId))?.productName || s.styleName, color: s.color, size: s.size, quantity: 0, grossAmount: 0, orderIds: new Set() }]));
  let missingProductLinks = 0;
  for (const order of orders) for (const line of order.items || []) {
    const qty = num(line.orderedQty); if (qty <= 0) continue;
    const sku = bySku.get(String(line.skuId)) || byCode.get(line.skuCode);
    const skuId = String(sku?._id || line.skuId || `code:${line.skuCode || 'UNKNOWN'}`);
    const product = byProduct.get(String(sku?.productId));
    const productId = product ? String(product._id) : `unlinked:${skuId}`;
    if (!product) missingProductLinks++;
    const amount = Number.isFinite(line.unitSalePrice) ? qty * line.unitSalePrice : null;
    const groups = [[skuRows, skuId, { code: line.skuCode || sku?.skuCode || 'Chưa có mã', name: line.productName || sku?.styleName || 'Chưa có tên', color: line.color || sku?.color, size: line.size || sku?.size }], [productRows, productId, { code: product?.productCode || line.skuCode || 'Chưa có mã', name: product?.productName || line.productName || sku?.styleName || 'Chưa liên kết sản phẩm' }]];
    for (const [map, id, info] of groups) {
      const row = map.get(id) || { id, ...info, quantity: 0, grossAmount: 0, orderIds: new Set() };
      row.quantity += qty;
      // A missing historical price stays unknown rather than falling back to today's catalogue price.
      row.grossAmount = row.grossAmount === null || amount === null ? null : row.grossAmount + amount;
      row.orderIds.add(String(order._id)); map.set(id, row);
    }
  }
  const finish = (map) => [...map.values()].map(({ orderIds, ...row }) => ({ ...row, orders: orderIds.size })).sort((a,b) => b.quantity - a.quantity || String(a.code).localeCompare(String(b.code)));
  return { products: finish(productRows), skus: finish(skuRows), packedOrders: orders.length, missingProductLinks };
}
export async function bestSellersReport(query) {
  const range = period(query.from, query.to);
  const scope = salesReportScope(query);
  const [orders, products, skus] = await Promise.all([
    read('sales_orders', { ...scope, status: { $ne: 'CANCELLED' }, 'warehouseFulfillment.packedAt': range }, { items: 1 }),
    read('products', {}, { productCode: 1, productName: 1 }),
    read('skus', {}, { skuCode: 1, productId: 1, styleName: 1, color: 1, size: 1 }),
  ]);
  return { ...bestSellerRows(orders, products, skus), basis: 'Theo ngày đóng gói và số lượng trên từng dòng đơn hàng; loại đơn hủy, chưa đóng gói. Số lượng và tiền hàng chưa trừ hàng hoàn. Tiền hàng = số lượng × giá bán ghi trên đơn, trước giảm giá và phí vận chuyển. Áp dụng cùng khoảng ngày, nguồn bán và trạng thái thanh toán của báo cáo.' };
}
