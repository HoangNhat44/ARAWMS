/*
 * Người thực hiện: Nguyễn Ngọc Huy-HE171157 | Ngày: 30-10-2026 | UC-15, UC-16; [BR: GBR-16]
 * ====================================================================================================================================
 * [BẢNG TRA CỨU NGUỒN GỐC SỐ LIỆU & CÔNG THỨC - BE: ĐỊNH GIÁ TÀI SẢN KHO (inventoryValuation.service.js)]
 * ====================================================================================================================================
 * | STT | Trường trả về                | Màn hình FE hiển thị                     | Nguồn DB (Collection.field)                       | Công thức & Quy tắc BR                            |
 * |-----|------------------------------|------------------------------------------|---------------------------------------------------|---------------------------------------------------|
 * | 1   | availableQty                 | Cột Tồn khả dụng                         | raw_materials / skus.{onHandQty, reservedQty}     | onHandQty - reservedQty                           |
 * | 2   | onHandValue                  | KPI Nguyên vật liệu / Thành phẩm bán được| raw_materials.unitCost / skus.unitCogs            | onHandQty * unitCost (hoặc unitCogs)              |
 * | 3   | quarantineValue              | KPI Hàng cách ly (Lỗi)                   | product_units(DEFECT_QUARANTINE) × skus.unitCogs  | [BR: GBR-16] Tách riêng hàng lỗi khỏi tồn bán được|
 * | 4   | totalValue                   | KPI Tổng tài sản & Cột Giá trị từng dòng | Tổng hợp toàn kho / từng dòng đang lọc            | (onHandQty + defectQty) * cost = onHand+quarantine|
 * ====================================================================================================================================
 */
import RawMaterial from '../../../models/RawMaterial.model.js';
import Sku from '../../../models/Sku.model.js';
import { withDefectQty, defectQtyBySku } from '../../../common/services/defectStock.js';
import { readQuery } from '../../../common/utils/ownerReadQuery.js';
import { httpError } from '../../../common/utils/httpError.js';

export const valuationReport = async (query) => {
  const { filter, page, limit } = readQuery(query, { fields: query.type === 'skus' ? ['skuCode', 'styleName'] : ['materialCode', 'materialName'], extra: ['type'] });
  // UC-15/16: Chọn đúng model và đơn giá của nguyên liệu hoặc thành phẩm.
  const type = query.type || 'materials';
  if (!['materials', 'skus'].includes(type)) throw httpError(400, 'Loại tồn kho không hợp lệ.');
  const Model = type === 'materials' ? RawMaterial : Sku;
  // UC-15/16: Hàng ngừng kinh doanh vẫn là tài sản khi còn tồn; không loại isActive=false.
  const [items, totals, total] = await Promise.all([
    // Bảng chỉ lấy một trang, nhưng số tổng bên dưới được tính trên toàn bộ kết quả lọc.
    Model.find(filter).sort({ _id: 1 }).skip((page - 1) * limit).limit(limit),
    // [BR: GBR-16]: Định giá tồn chính bán được và hàng lỗi cách ly riêng; không trộn số lượng khác đơn vị.
    Model.aggregate([{ $match: filter }, ...(type === 'skus' ? withDefectQty() : []), { $group: { _id: null, onHandValue: { $sum: { $multiply: ['$onHandQty', type === 'materials' ? '$unitCost' : '$unitCogs'] } },
      quarantineValue: type === 'materials' ? { $sum: 0 } : { $sum: { $multiply: ['$defectQty', '$unitCogs'] } } } }]), Model.countDocuments(filter),
  ]);
  // Hàng lỗi thành phẩm được đếm theo từng chiếc (ProductUnit), không lưu trên SKU.
  const defectBySku = type === 'skus' ? await defectQtyBySku(items.map((item) => item._id)) : new Map();
  // Khi chưa có dữ liệu, tổng giá trị bằng 0; vẫn giữ trạng thái bảng trống ở FE.
  const values = totals[0] || { onHandValue: 0, quarantineValue: 0 };
  // Mỗi dòng giữ rõ số tồn, giữ chỗ, cách ly và đơn giá để kiểm tra phép tính.
  return { items: items.map((item) => { const cost = type === 'materials' ? item.unitCost : item.unitCogs;
    const defectQty = defectBySku.get(String(item._id)) || 0;
    return { id: String(item._id), code: item.materialCode || item.skuCode, name: item.materialName || item.styleName,
      unit: item.unit || 'PIECE', onHandQty: item.onHandQty, reservedQty: item.reservedQty,
      availableQty: item.onHandQty - item.reservedQty, quarantineQty: defectQty,
      unitCost: cost, onHandValue: item.onHandQty * cost, quarantineValue: defectQty * cost,
      totalValue: (item.onHandQty + defectQty) * cost }; }),
    totals: { onHandValue: values.onHandValue, quarantineValue: values.quarantineValue, totalValue: values.onHandValue + values.quarantineValue },
    type, total, page, limit, asOf: new Date(),
    basis: 'Định giá hiện tại = số lượng tồn × đơn giá danh mục đã ghi nhận. Hàng cách ly tính riêng; tồn giữ chỗ vẫn thuộc tài sản. Không phải bảng chốt giá FIFO theo lô hay báo cáo tại ngày quá khứ.' };
};
